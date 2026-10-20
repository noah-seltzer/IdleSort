// Public types of the simulation interface: what callers pass in and read out.

export type NodeType = 'producer' | 'receiver';

export interface Cell {
  x: number;
  y: number;
}

export type PortDirection = 'in' | 'out';

/** Identifies one Port on one Node. */
export interface PortRef {
  nodeId: string;
  portId: string;
}

export interface PortInfo {
  id: string;
  direction: PortDirection;
  /** Whether the Port accepts more than one Connection. */
  multi: boolean;
}

// ---- Snapshot ----

export interface BatchView {
  id: string;
  items: readonly number[];
  /** Fraction of the Connection travelled, 0 (just emitted) to 1 (arriving). */
  progress: number;
}

export interface ConnectionView {
  id: string;
  from: PortRef;
  to: PortRef;
  travelTicks: number;
  /** Batches in transit, oldest (furthest along) first. */
  batches: readonly BatchView[];
}

export interface RunView {
  length: number;
  /** The last scored Item, or null before anything has been scored. */
  lastItem: number | null;
}

interface NodeViewBase {
  id: string;
  cell: Cell;
  ports: readonly PortInfo[];
}

export interface ProducerView extends NodeViewBase {
  type: 'producer';
  /** Batches waiting to be emitted, e.g. returned when a Connection was removed. */
  queuedBatches: number;
}

export interface ReceiverView extends NodeViewBase {
  type: 'receiver';
  run: RunView;
}

export type NodeView = ProducerView | ReceiverView;

export interface Snapshot {
  tick: number;
  money: number;
  nodes: readonly NodeView[];
  connections: readonly ConnectionView[];
}

// ---- Commands ----

export type CommandName = 'connect' | 'disconnect';

export type RejectionReason =
  | 'unknown-port'
  | 'same-node'
  | 'not-output'
  | 'not-input'
  | 'port-occupied'
  | 'unknown-connection';

export interface Rejection {
  ok: false;
  reason: RejectionReason;
  message: string;
}

export type ConnectResult = { ok: true; connectionId: string } | Rejection;
export type DisconnectResult = { ok: true } | Rejection;

// ---- Events ----

export type SimEvent =
  | {
      type: 'batch-emitted';
      tick: number;
      batchId: string;
      nodeId: string;
      connectionId: string;
      items: readonly number[];
    }
  | {
      type: 'batch-scored';
      tick: number;
      batchId: string;
      nodeId: string;
      items: readonly number[];
      payout: number;
      /** Run length after the Batch's last Item was scored. */
      runLength: number;
    }
  | {
      type: 'run-broken';
      tick: number;
      nodeId: string;
      /** Length of the Run that just ended. */
      length: number;
    }
  | {
      type: 'command-rejected';
      tick: number;
      command: CommandName;
      reason: RejectionReason;
      message: string;
    };
