import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';

const BACKGROUND = 0x1b1e24;

/**
 * Hosts the PixiJS application that renders the factory. For now it is an
 * empty canvas sized to its container.
 */
export function FactoryCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let initialised = false;
    let disposed = false;

    void app
      .init({ resizeTo: host, background: BACKGROUND, antialias: true })
      .then(() => {
        initialised = true;
        // StrictMode may unmount before init resolves; tear down late instead.
        if (disposed) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
      });

    return () => {
      disposed = true;
      if (initialised) app.destroy(true);
    };
  }, []);

  return <div ref={hostRef} className="factory-canvas" data-testid="factory-canvas" />;
}
