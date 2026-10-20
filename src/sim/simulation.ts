import { defaultConfig, type TuningConfig } from './config';
import { createRng, nextInt, type RngState } from './rng';
import type {
  Cell,
  CommandName,
  ConnectResult,
  ConnectionView,
  DisconnectResult,
  NodeType,
  NodeView,
  PortInfo,
  PortRef,
  Rejection,
  RejectionReason,
  SimEvent,
  Snapshot,
} from './types';

/**
 * The headless, deterministic, fixed-timestep simulation (ADR-0001). It is the
 * single owner of game state: callers issue commands, advance time, and read
 * snapshots and events. Nothing here knows about rendering.
 */
export interface Simulation {
  readonly config: TuningConfig;
  connect(from: PortRef, to: PortRef): ConnectResult;
  disconnect(connectionId: string): DisconnectResult;
  advance(ticks: number): void;
  snapshot(): Snapshot;
  /** Domain events since the previous call, oldest first. */
  drainEvents(): SimEvent[];
}

export interface CreateOptions {
  seed?: number;
  config?: TuningConfig;
}

// ---- Internal state (plain data, so it can be serialised later) ----

interface BatchState {
  id: string;
  items: number[];
}

interface InTransit {
  batch: BatchState;
  elapsedTicks: number;
}

interface ConnectionState {
  id: string;
  from: PortRef;
  to: PortRef;
  travelTicks: number;
  inTransit: InTransit[];
}

interface ProducerState {
  id: string;
  type: 'producer';
  cell: Cell;
  /** Accumulates itemsPerSecond each tick; an Item is due per ticksPerSecond. */
  accumulator: number;
  queue: BatchState[];
}

interface ReceiverState {
  id: string;
  type: 'receiver';
  cell: Cell;
  runLength: number;
  lastItem: number | null;
}

type NodeState = ProducerState | ReceiverState;

interface GameState {
  tick: number;
  money: number;
  rng: RngState;
  nextBatchId: number;
  nextConnectionId: number;
  nodes: NodeState[];
  connections: ConnectionState[];
}

const PORTS: Record<NodeType, readonly PortInfo[]> = {
  producer: [{ id: 'out', direction: 'out', multi: false }],
  receiver: [{ id: 'in', direction: 'in', multi: true }],
};

export function createSimulation(options: CreateOptions = {}): Simulation {
  const config = options.config ?? defaultConfig;
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32);
  const state = createState(config, seed);
  let events: SimEvent[] = [];

  const reject = (command: CommandName, reason: RejectionReason, message: string): Rejection => {
    events.push({ type: 'command-rejected', tick: state.tick, command, reason, message });
    return { ok: false, reason, message };
  };

  return {
    config,

    connect(from, to) {
      const fromPort = findPort(state, from);
      const toPort = findPort(state, to);
      if (!fromPort || !toPort) {
        return reject('connect', 'unknown-port', 'That Port does not exist.');
      }
      if (from.nodeId === to.nodeId) {
        return reject('connect', 'same-node', 'A Node cannot connect to itself.');
      }
      if (fromPort.direction !== 'out') {
        return reject('connect', 'not-output', 'A Connection must start at an output Port.');
      }
      if (toPort.direction !== 'in') {
        return reject('connect', 'not-input', 'A Connection must end at an input Port.');
      }
      if (!fromPort.multi && hasConnectionAt(state, from)) {
        return reject('connect', 'port-occupied', 'That output Port is already connected.');
      }
      if (!toPort.multi && hasConnectionAt(state, to)) {
        return reject('connect', 'port-occupied', 'That input Port is already connected.');
      }

      const id = `connection-${state.nextConnectionId++}`;
      const travelTicks = computeTravelTicks(config, nodeById(state, from.nodeId).cell, nodeById(state, to.nodeId).cell);
      state.connections.push({ id, from: { ...from }, to: { ...to }, travelTicks, inTransit: [] });
      return { ok: true, connectionId: id };
    },

    disconnect(connectionId) {
      const index = state.connections.findIndex((c) => c.id === connectionId);
      const connection = state.connections[index];
      if (!connection) {
        return reject('disconnect', 'unknown-connection', 'That Connection does not exist.');
      }
      state.connections.splice(index, 1);
      // Items are never dropped: Batches in transit go back to the front of the
      // upstream Node's queue, oldest first, and are re-emitted on reconnection.
      const source = nodeById(state, connection.from.nodeId);
      if (source.type === 'producer') {
        source.queue.unshift(...connection.inTransit.map((t) => t.batch));
      }
      return { ok: true };
    },

    advance(ticks) {
      for (let i = 0; i < ticks; i++) step(state, config, events);
    },

    snapshot() {
      return deepFreeze(toSnapshot(state));
    },

    drainEvents() {
      const drained = events;
      events = [];
      return drained;
    },
  };
}

function createState(config: TuningConfig, seed: number): GameState {
  const counts: Record<NodeType, number> = { producer: 0, receiver: 0 };
  const nodes = config.startingLayout.map((start): NodeState => {
    const id = `${start.type}-${++counts[start.type]}`;
    const cell = { ...start.cell };
    return start.type === 'producer'
      ? { id, type: 'producer', cell, accumulator: 0, queue: [] }
      : { id, type: 'receiver', cell, runLength: 0, lastItem: null };
  });
  return {
    tick: 0,
    money: config.startingMoney,
    rng: createRng(seed),
    nextBatchId: 1,
    nextConnectionId: 1,
    nodes,
    connections: [],
  };
}

/** One fixed timestep: move Batches (delivering arrivals), then run Producers. */
function step(state: GameState, config: TuningConfig, events: SimEvent[]): void {
  state.tick++;

  for (const connection of state.connections) {
    for (const transit of connection.inTransit) transit.elapsedTicks++;
    while (connection.inTransit[0] && connection.inTransit[0].elapsedTicks >= connection.travelTicks) {
      const { batch } = connection.inTransit.shift()!;
      deliver(state, config, events, nodeById(state, connection.to.nodeId), batch);
    }
  }

  for (const node of state.nodes) {
    if (node.type === 'producer') runProducer(state, config, events, node);
  }
}

function runProducer(state: GameState, config: TuningConfig, events: SimEvent[], producer: ProducerState): void {
  const connection = state.connections.find((c) => c.from.nodeId === producer.id);

  if (connection) {
    for (const batch of producer.queue.splice(0)) emit(state, events, producer, connection, batch);
  }

  producer.accumulator += config.producer.itemsPerSecond;
  while (producer.accumulator >= config.ticksPerSecond) {
    if (!connection) {
      // Nowhere to send Items: pause, ready to emit as soon as a Connection exists.
      producer.accumulator = config.ticksPerSecond;
      return;
    }
    producer.accumulator -= config.ticksPerSecond;
    const item = nextInt(state.rng, config.producer.minItem, config.producer.maxItem);
    emit(state, events, producer, connection, { id: `batch-${state.nextBatchId++}`, items: [item] });
  }
}

function emit(
  state: GameState,
  events: SimEvent[],
  node: NodeState,
  connection: ConnectionState,
  batch: BatchState,
): void {
  connection.inTransit.push({ batch, elapsedTicks: 0 });
  events.push({
    type: 'batch-emitted',
    tick: state.tick,
    batchId: batch.id,
    nodeId: node.id,
    connectionId: connection.id,
    items: [...batch.items],
  });
}

function deliver(state: GameState, config: TuningConfig, events: SimEvent[], node: NodeState, batch: BatchState): void {
  if (node.type === 'receiver') score(state, config, events, node, batch);
}

/** Scores a whole Batch, in order, against the Receiver's single Run. */
function score(state: GameState, config: TuningConfig, events: SimEvent[], receiver: ReceiverState, batch: BatchState): void {
  let payout = 0;
  for (const item of batch.items) {
    if (receiver.lastItem === null || item >= receiver.lastItem) {
      receiver.runLength++;
    } else {
      events.push({ type: 'run-broken', tick: state.tick, nodeId: receiver.id, length: receiver.runLength });
      receiver.runLength = 1;
    }
    receiver.lastItem = item;
    payout += config.receiver.basePayout * receiver.runLength;
  }
  state.money += payout;
  events.push({
    type: 'batch-scored',
    tick: state.tick,
    batchId: batch.id,
    nodeId: receiver.id,
    items: [...batch.items],
    payout,
    runLength: receiver.runLength,
  });
}

function computeTravelTicks(config: TuningConfig, from: Cell, to: Cell): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max(1, Math.round((distance / config.connection.cellsPerSecond) * config.ticksPerSecond));
}

function nodeById(state: GameState, id: string): NodeState {
  const node = state.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`Unknown Node ${id}`);
  return node;
}

function findPort(state: GameState, ref: PortRef): PortInfo | undefined {
  const node = state.nodes.find((n) => n.id === ref.nodeId);
  return node && PORTS[node.type].find((p) => p.id === ref.portId);
}

function hasConnectionAt(state: GameState, ref: PortRef): boolean {
  return state.connections.some(
    (c) =>
      (c.from.nodeId === ref.nodeId && c.from.portId === ref.portId) ||
      (c.to.nodeId === ref.nodeId && c.to.portId === ref.portId),
  );
}

function toSnapshot(state: GameState): Snapshot {
  const nodes = state.nodes.map((node): NodeView => {
    const base = { id: node.id, cell: { ...node.cell }, ports: PORTS[node.type].map((p) => ({ ...p })) };
    return node.type === 'producer'
      ? { ...base, type: 'producer', queuedBatches: node.queue.length }
      : { ...base, type: 'receiver', run: { length: node.runLength, lastItem: node.lastItem } };
  });
  const connections = state.connections.map(
    (c): ConnectionView => ({
      id: c.id,
      from: { ...c.from },
      to: { ...c.to },
      travelTicks: c.travelTicks,
      batches: c.inTransit.map((t) => ({
        id: t.batch.id,
        items: [...t.batch.items],
        progress: t.elapsedTicks / c.travelTicks,
      })),
    }),
  );
  return { tick: state.tick, money: state.money, nodes, connections };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
