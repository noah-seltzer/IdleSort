/** Tracks Money scored over a trailing window of ticks to report a Money/s rate. */
export class IncomeTracker {
  private entries: { tick: number; payout: number }[] = [];

  constructor(
    private readonly windowTicks: number,
    private readonly ticksPerSecond: number,
  ) {}

  record(tick: number, payout: number): void {
    this.entries.push({ tick, payout });
  }

  perSecond(currentTick: number): number {
    const since = currentTick - this.windowTicks;
    while (this.entries[0] && this.entries[0].tick <= since) this.entries.shift();
    const spanTicks = Math.min(this.windowTicks, currentTick);
    if (spanTicks <= 0) return 0;
    const total = this.entries.reduce((sum, e) => sum + e.payout, 0);
    return total / (spanTicks / this.ticksPerSecond);
  }
}
