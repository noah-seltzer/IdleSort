import type { Cell } from './types';

/** A Node placed when a new game starts. */
export interface StartingNode {
  type: 'producer' | 'receiver';
  cell: Cell;
}

/** Every balance number in the game. Logic reads these; it never hard-codes them. */
export interface TuningConfig {
  /** Fixed simulation timestep (ADR-0001). */
  ticksPerSecond: number;
  startingMoney: number;
  producer: {
    itemsPerSecond: number;
    /** Inclusive range of generated Item values. */
    minItem: number;
    maxItem: number;
  };
  receiver: {
    /** Money paid per Item, multiplied by the current Run length. */
    basePayout: number;
  };
  connection: {
    /** Batch travel speed along a Connection, in grid cells per second. */
    cellsPerSecond: number;
  };
  startingLayout: readonly StartingNode[];
}

export const defaultConfig: TuningConfig = {
  ticksPerSecond: 20,
  startingMoney: 0,
  producer: { itemsPerSecond: 1, minItem: 1, maxItem: 100 },
  receiver: { basePayout: 1 },
  connection: { cellsPerSecond: 5 },
  startingLayout: [
    { type: 'producer', cell: { x: 2, y: 5 } },
    { type: 'receiver', cell: { x: 12, y: 5 } },
  ],
};
