/**
 * Turns variable frame times into a whole number of fixed simulation ticks,
 * so the simulation runs at the same rate whatever the frame rate.
 */
export class FixedStep {
  private accumulatedMs = 0;

  constructor(
    private readonly tickMs: number,
    /** Caps catch-up after a long stall (e.g. a backgrounded tab). */
    private readonly maxTicksPerFrame = 100,
  ) {}

  /** Adds a frame's elapsed time and returns how many ticks are now due. */
  advance(deltaMs: number): number {
    this.accumulatedMs += Math.max(0, deltaMs);
    const due = Math.floor(this.accumulatedMs / this.tickMs);
    if (due > this.maxTicksPerFrame) {
      this.accumulatedMs = 0;
      return this.maxTicksPerFrame;
    }
    this.accumulatedMs -= due * this.tickMs;
    return due;
  }

  /** How far into the next tick we are, from 0 to 1, for render interpolation. */
  get alpha(): number {
    return this.accumulatedMs / this.tickMs;
  }
}
