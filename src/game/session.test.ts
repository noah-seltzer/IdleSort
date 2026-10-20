// @vitest-environment node
import { defaultConfig, type PortRef } from '../sim';
import { FixedStep } from './fixedStep';
import { GameSession, type Scheduler } from './session';

/** A scheduler whose clock and animation frames the test drives by hand. */
function manualScheduler() {
  let now = 0;
  let pending: (() => void) | null = null;
  const scheduler: Scheduler = {
    now: () => now,
    requestFrame: (callback) => {
      pending = callback;
      return 1;
    },
    cancelFrame: () => {
      pending = null;
    },
  };
  /** Runs frames of `frameMs` each until `totalMs` has elapsed. */
  const run = (totalMs: number, frameMs = 16) => {
    for (let elapsed = 0; elapsed < totalMs; elapsed += frameMs) {
      now += frameMs;
      const callback = pending;
      pending = null;
      callback?.();
    }
  };
  return { scheduler, run };
}

function setup() {
  const { scheduler, run } = manualScheduler();
  const session = new GameSession({ seed: 1, scheduler });
  const [producer, receiver] = session.getView().snapshot.nodes;
  const out: PortRef = { nodeId: producer!.id, portId: 'out' };
  const input: PortRef = { nodeId: receiver!.id, portId: 'in' };
  return { session, run, out, input };
}

const TICK_MS = 1000 / defaultConfig.ticksPerSecond;

describe('GameSession', () => {
  it.each([7, 16, 33, 50])('runs ticksPerSecond ticks per second with %ims frames', (frameMs) => {
    const { session, run } = setup();
    session.start();
    run(1000, frameMs);

    const ticks = session.getView().snapshot.tick;
    expect(Math.abs(ticks - defaultConfig.ticksPerSecond)).toBeLessThanOrEqual(1);
  });

  it('stops advancing when stopped', () => {
    const { session, run } = setup();
    session.start();
    run(500);
    session.stop();
    const tick = session.getView().snapshot.tick;
    run(500);
    expect(session.getView().snapshot.tick).toBe(tick);
  });

  it('earns Money and reports income after the player connects', () => {
    const { session, run, out, input } = setup();
    session.start();

    expect(session.connect(out, input)).toBe(true);
    run(10_000);

    const view = session.getView();
    expect(view.snapshot.money).toBeGreaterThan(0);
    expect(view.incomePerSecond).toBeGreaterThan(0);
  });

  it('publishes a notice with the reason when a command is rejected', () => {
    const { session, out } = setup();

    expect(session.connect(out, out)).toBe(false);
    const first = session.getView().notice;
    expect(first?.message).toMatch(/itself/);

    session.connect(out, out);
    expect(session.getView().notice!.id).toBeGreaterThan(first!.id);
  });

  it('removes a Connection on disconnect', () => {
    const { session, out, input } = setup();
    session.connect(out, input);
    const [connection] = session.getView().snapshot.connections;

    expect(session.disconnect(connection!.id)).toBe(true);
    expect(session.getView().snapshot.connections).toEqual([]);
  });

  it('keeps the same view object between ticks and notifies subscribers on change', () => {
    const { session, run } = setup();
    const listener = vi.fn();
    session.subscribe(listener);
    session.start();

    const before = session.getView();
    run(TICK_MS / 2, TICK_MS / 2); // not yet a whole tick
    expect(session.getView()).toBe(before);
    expect(listener).not.toHaveBeenCalled();

    run(TICK_MS, TICK_MS);
    expect(session.getView()).not.toBe(before);
    expect(listener).toHaveBeenCalled();
  });
});

describe('FixedStep', () => {
  it('carries leftover time into alpha', () => {
    const step = new FixedStep(50);
    expect(step.advance(120)).toBe(2);
    expect(step.alpha).toBeCloseTo(0.4);
  });

  it('caps catch-up after a long stall', () => {
    const step = new FixedStep(50, 100);
    expect(step.advance(60_000)).toBe(100);
    expect(step.alpha).toBe(0);
  });
});
