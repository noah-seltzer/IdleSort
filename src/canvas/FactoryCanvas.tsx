import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import type { GameSession } from '../game/session';
import { FactoryRenderer } from './FactoryRenderer';

const BACKGROUND = 0x1b1e24;

/** Hosts the PixiJS application that renders the factory (ADR-0004). */
export function FactoryCanvas({ session }: { session: GameSession }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let renderer: FactoryRenderer | null = null;
    let initialised = false;
    let disposed = false;

    void app
      .init({ resizeTo: host, background: BACKGROUND, antialias: true, autoDensity: true, resolution: window.devicePixelRatio })
      .then(() => {
        initialised = true;
        // StrictMode may unmount before init resolves; tear down late instead.
        if (disposed) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
        renderer = new FactoryRenderer(app, session);
      });

    return () => {
      disposed = true;
      renderer?.destroy();
      if (initialised) app.destroy(true);
    };
  }, [session]);

  return <div ref={hostRef} className="factory-canvas" data-testid="factory-canvas" />;
}
