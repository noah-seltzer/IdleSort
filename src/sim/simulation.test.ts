// @vitest-environment node
// Runs without a DOM: the simulation must not depend on one (ADR-0001).
import {
  createSimulation,
  defaultConfig,
  type PortRef,
  type ProducerView,
  type ReceiverView,
  type SimEvent,
  type Simulation,
  type Snapshot,
  type TuningConfig,
} from './index';

const TPS = defaultConfig.ticksPerSecond;
// Default layout: Producer at (2,5), Receiver at (12,5): 10 cells at 5 cells/s.
const DEFAULT_TRAVEL_TICKS = 2 * TPS;

function producers(snap: Snapshot): ProducerView[] {
  return snap.nodes.filter((n): n is ProducerView => n.type === 'producer');
}

function receiver(snap: Snapshot): ReceiverView {
  const r = snap.nodes.find((n): n is ReceiverView => n.type === 'receiver');
  if (!r) throw new Error('no Receiver');
  return r;
}

function ports(sim: Simulation, producerIndex = 0) {
  const snap = sim.snapshot();
  const p = producers(snap)[producerIndex]!;
  return {
    out: { nodeId: p.id, portId: 'out' },
    in: { nodeId: receiver(snap).id, portId: 'in' },
  };
}

function connected(seed = 1, config?: TuningConfig) {
  const sim = createSimulation({ seed, config });
  const result = sim.connect(ports(sim).out, ports(sim).in);
  if (!result.ok) throw new Error(result.message);
  return { sim, connectionId: result.connectionId };
}

function ofType<T extends SimEvent['type']>(events: SimEvent[], type: T) {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

const twoProducers: TuningConfig = {
  ...defaultConfig,
  startingLayout: [
    { type: 'producer', cell: { x: 2, y: 3 } },
    { type: 'producer', cell: { x: 2, y: 7 } },
    { type: 'receiver', cell: { x: 12, y: 5 } },
  ],
};

describe('new game', () => {
  it('starts with one Producer and one Receiver, unconnected', () => {
    const snap = createSimulation({ seed: 1 }).snapshot();

    expect(snap.tick).toBe(0);
    expect(snap.money).toBe(defaultConfig.startingMoney);
    expect(producers(snap)).toHaveLength(1);
    expect(snap.nodes.filter((n) => n.type === 'receiver')).toHaveLength(1);
    expect(snap.connections).toEqual([]);
    expect(receiver(snap).run).toEqual({ length: 0, lastItem: null });
  });

  it('emits nothing while the Producer is unconnected', () => {
    const sim = createSimulation({ seed: 1 });
    sim.advance(10 * TPS);

    expect(sim.drainEvents()).toEqual([]);
    expect(sim.snapshot().money).toBe(defaultConfig.startingMoney);
  });
});

describe('connect', () => {
  it('connects the Producer output to the Receiver input', () => {
    const sim = createSimulation({ seed: 1 });
    const { out, in: input } = ports(sim);

    const result = sim.connect(out, input);

    expect(result.ok).toBe(true);
    expect(sim.snapshot().connections).toEqual([
      expect.objectContaining({ from: out, to: input, travelTicks: DEFAULT_TRAVEL_TICKS, batches: [] }),
    ]);
  });

  it.each([
    ['an unknown Port', (s: Simulation) => [ports(s).out, { nodeId: 'nope', portId: 'in' }], 'unknown-port'],
    ['a Node to itself', (s: Simulation) => [ports(s).out, ports(s).out], 'same-node'],
    ['from an input Port', (s: Simulation) => [ports(s).in, ports(s).out], 'not-output'],
    ['output to output', (s: Simulation) => [ports(s, 0).out, ports(s, 1).out], 'not-input'],
  ] as const)('rejects %s and changes nothing', (_, ends, reason) => {
    const sim = createSimulation({ seed: 1, config: twoProducers });
    const [from, to] = ends(sim) as [PortRef, PortRef];
    const before = sim.snapshot();

    const result = sim.connect(from, to);

    expect(result).toEqual({ ok: false, reason, message: expect.any(String) });
    expect(sim.snapshot()).toEqual(before);
    expect(sim.drainEvents()).toEqual([
      { type: 'command-rejected', tick: 0, command: 'connect', reason, message: expect.any(String) },
    ]);
  });

  it('rejects a second Connection on a single-Connection Port, including a duplicate', () => {
    const { sim } = connected(1, twoProducers);
    const before = sim.snapshot();

    expect(sim.connect(ports(sim).out, ports(sim).in)).toMatchObject({ ok: false, reason: 'port-occupied' });
    expect(sim.snapshot()).toEqual(before);
  });

  it('lets several Producers share the multi-input Receiver Port', () => {
    const sim = createSimulation({ seed: 1, config: twoProducers });

    expect(sim.connect(ports(sim, 0).out, ports(sim, 0).in).ok).toBe(true);
    expect(sim.connect(ports(sim, 1).out, ports(sim, 1).in).ok).toBe(true);
    expect(sim.snapshot().connections).toHaveLength(2);
  });
});

describe('Batch travel', () => {
  it('emits size-1 Batches and delivers them after the travel time', () => {
    const { sim, connectionId } = connected();

    sim.advance(TPS); // one Item per second by default
    const [emitted] = ofType(sim.drainEvents(), 'batch-emitted');
    expect(emitted).toMatchObject({ tick: TPS, connectionId });
    expect(emitted!.items).toHaveLength(1);
    expect(sim.snapshot().connections[0]!.batches).toEqual([
      { id: emitted!.batchId, items: emitted!.items, progress: 0 },
    ]);

    sim.advance(DEFAULT_TRAVEL_TICKS / 2);
    expect(sim.snapshot().connections[0]!.batches[0]).toMatchObject({ id: emitted!.batchId, progress: 0.5 });

    sim.advance(DEFAULT_TRAVEL_TICKS / 2 - 1);
    expect(ofType(sim.drainEvents(), 'batch-scored')).toEqual([]);

    sim.advance(1);
    const [scored] = ofType(sim.drainEvents(), 'batch-scored');
    expect(scored).toMatchObject({ tick: TPS + DEFAULT_TRAVEL_TICKS, batchId: emitted!.batchId, items: emitted!.items });
  });

  it('generates integers within the configured Item range', () => {
    const { sim } = connected(7);
    sim.advance(200 * TPS);

    const items = ofType(sim.drainEvents(), 'batch-emitted').flatMap((e) => e.items);
    expect(items.length).toBeGreaterThan(150);
    for (const item of items) {
      expect(Number.isInteger(item)).toBe(true);
      expect(item).toBeGreaterThanOrEqual(1);
      expect(item).toBeLessThanOrEqual(100);
    }
  });
});

describe('Run scoring', () => {
  it('continues the Run on equal values, paying base × Run length', () => {
    const allFives: TuningConfig = { ...defaultConfig, producer: { ...defaultConfig.producer, minItem: 5, maxItem: 5 } };
    const { sim } = connected(1, allFives);

    sim.advance(TPS + DEFAULT_TRAVEL_TICKS + 3 * TPS); // first four Batches arrive

    const scored = ofType(sim.drainEvents(), 'batch-scored');
    expect(scored.map((e) => [e.payout, e.runLength])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
    expect(sim.snapshot().money).toBe(1 + 2 + 3 + 4);
    expect(receiver(sim.snapshot()).run).toEqual({ length: 4, lastItem: 5 });
  });

  it('resets the Run to 1 when an Item is smaller than the previous one', () => {
    const { sim } = connected(3);
    sim.advance(300 * TPS);
    const events = sim.drainEvents();
    const scored = ofType(events, 'batch-scored');
    const broken = ofType(events, 'run-broken');

    let previous: number | null = null;
    let run = 0;
    let expectedBreaks = 0;
    let expectedMoney = 0;
    for (const event of scored) {
      const item = event.items[0]!;
      if (previous !== null && item < previous) {
        expectedBreaks++;
        run = 1;
      } else {
        run++;
      }
      previous = item;
      expect(event).toMatchObject({ runLength: run, payout: defaultConfig.receiver.basePayout * run });
      expectedMoney += event.payout;
    }

    expect(broken).toHaveLength(expectedBreaks);
    expect(expectedBreaks).toBeGreaterThan(10); // the random stream really did break Runs
    expect(sim.snapshot().money).toBe(expectedMoney);
  });

  it('reports the length of the Run that ended', () => {
    const { sim } = connected(3);
    sim.advance(300 * TPS);
    const events = sim.drainEvents();

    let runBefore = 0;
    for (const event of events) {
      if (event.type === 'run-broken') expect(event.length).toBe(runBefore);
      if (event.type === 'batch-scored') runBefore = event.runLength;
    }
  });
});

describe('disconnect', () => {
  it('rejects an unknown Connection', () => {
    const sim = createSimulation({ seed: 1 });
    expect(sim.disconnect('connection-99')).toMatchObject({ ok: false, reason: 'unknown-connection' });
    expect(ofType(sim.drainEvents(), 'command-rejected')).toHaveLength(1);
  });

  it('returns in-transit Batches to the Producer, which re-emits them first on reconnection', () => {
    const { sim, connectionId } = connected(5);
    sim.advance(TPS + DEFAULT_TRAVEL_TICKS - 1); // two Batches in transit, none scored
    const inTransit = sim.snapshot().connections[0]!.batches.map((b) => b.id);
    expect(inTransit).toHaveLength(2);

    expect(sim.disconnect(connectionId)).toEqual({ ok: true });
    expect(sim.snapshot().connections).toEqual([]);
    expect(producers(sim.snapshot())[0]!.queuedBatches).toBe(2);

    sim.drainEvents();
    sim.advance(10 * TPS); // paused while unconnected
    expect(sim.drainEvents()).toEqual([]);
    expect(producers(sim.snapshot())[0]!.queuedBatches).toBe(2);

    sim.connect(ports(sim).out, ports(sim).in);
    sim.advance(DEFAULT_TRAVEL_TICKS + 1);
    const scored = ofType(sim.drainEvents(), 'batch-scored').map((e) => e.batchId);
    expect(scored.slice(0, 2)).toEqual(inTransit);
    expect(producers(sim.snapshot())[0]!.queuedBatches).toBe(0);
  });
});

describe('determinism and snapshots', () => {
  function play(seed: number) {
    const { sim } = connected(seed, twoProducers);
    sim.connect(ports(sim, 1).out, ports(sim, 1).in);
    sim.advance(50 * TPS);
    return sim;
  }

  it('produces identical snapshots and events for the same seed and commands', () => {
    const a = play(42);
    const b = play(42);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.drainEvents()).toEqual(b.drainEvents());
  });

  it('produces different Items for a different seed', () => {
    expect(play(42).snapshot()).not.toEqual(play(43).snapshot());
  });

  it('returns frozen snapshots that do not change as the simulation advances', () => {
    const { sim } = connected();
    sim.advance(TPS);
    const snap = sim.snapshot();
    const copy = structuredClone(snap);

    expect(() => {
      (snap as { money: number }).money = 1e9;
    }).toThrow(TypeError);
    expect(() => {
      (snap.connections[0]!.batches as unknown[]).push({});
    }).toThrow(TypeError);

    sim.advance(10 * TPS);
    expect(snap).toEqual(copy);
  });

  it('drains each event only once', () => {
    const { sim } = connected();
    sim.advance(TPS);
    expect(sim.drainEvents()).toHaveLength(1);
    expect(sim.drainEvents()).toEqual([]);
  });
});

it('does not import React, PixiJS or the DOM', () => {
  const sources = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true });
  expect(Object.keys(sources).length).toBeGreaterThan(0);
  for (const [file, source] of Object.entries(sources)) {
    expect(source, file).not.toMatch(/from ['"](react|react-dom|pixi\.js)/);
    expect(source, file).not.toMatch(/\b(window|document)\./);
  }
});
