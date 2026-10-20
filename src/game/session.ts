import {
  createSimulation,
  type CreateOptions,
  type PortRef,
  type Simulation,
  type Snapshot,
} from '../sim';
import { FixedStep } from './fixedStep';
import { IncomeTracker } from './income';

/** A message for the player, e.g. why a Connection was refused. */
export interface Notice {
  id: number;
  message: string;
}

/** Everything the React panels render. Replaced (never mutated) when it changes. */
export interface SessionView {
  snapshot: Snapshot;
  incomePerSecond: number;
  notice: Notice | null;
}

export interface Scheduler {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
}

const browserScheduler: Scheduler = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

const INCOME_WINDOW_SECONDS = 10;

/**
 * Runs the simulation in the browser: drives it on a fixed timestep from
 * animation frames, forwards player commands, and publishes a view for the UI.
 * It never touches game state itself (ADR-0001).
 */
export class GameSession {
  readonly sim: Simulation;
  private readonly scheduler: Scheduler;
  private readonly step: FixedStep;
  private readonly income: IncomeTracker;
  private readonly listeners = new Set<() => void>();
  private view: SessionView;
  private frameId: number | null = null;
  private lastFrameAt = 0;
  private nextNoticeId = 1;

  constructor(options: CreateOptions & { scheduler?: Scheduler } = {}) {
    this.sim = createSimulation(options);
    this.scheduler = options.scheduler ?? browserScheduler;
    const { ticksPerSecond } = this.sim.config;
    this.step = new FixedStep(1000 / ticksPerSecond);
    this.income = new IncomeTracker(INCOME_WINDOW_SECONDS * ticksPerSecond, ticksPerSecond);
    this.view = { snapshot: this.sim.snapshot(), incomePerSecond: 0, notice: null };
  }

  start(): void {
    if (this.frameId !== null) return;
    this.lastFrameAt = this.scheduler.now();
    this.frameId = this.scheduler.requestFrame(this.frame);
  }

  stop(): void {
    if (this.frameId === null) return;
    this.scheduler.cancelFrame(this.frameId);
    this.frameId = null;
  }

  connect(from: PortRef, to: PortRef): boolean {
    const result = this.sim.connect(from, to);
    this.publish();
    return result.ok;
  }

  disconnect(connectionId: string): boolean {
    const result = this.sim.disconnect(connectionId);
    this.publish();
    return result.ok;
  }

  /** Fraction of the way to the next tick, for interpolating Batch positions. */
  get alpha(): number {
    return this.step.alpha;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getView = (): SessionView => this.view;

  private frame = (): void => {
    const now = this.scheduler.now();
    const ticks = this.step.advance(now - this.lastFrameAt);
    this.lastFrameAt = now;
    if (ticks > 0) {
      this.sim.advance(ticks);
      this.publish();
    }
    this.frameId = this.scheduler.requestFrame(this.frame);
  };

  private publish(): void {
    let notice = this.view.notice;
    for (const event of this.sim.drainEvents()) {
      if (event.type === 'batch-scored') this.income.record(event.tick, event.payout);
      if (event.type === 'command-rejected') notice = { id: this.nextNoticeId++, message: event.message };
    }
    const snapshot = this.sim.snapshot();
    this.view = { snapshot, incomePerSecond: this.income.perSecond(snapshot.tick), notice };
    for (const listener of this.listeners) listener();
  }
}
