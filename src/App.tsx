import { useEffect, useState, useSyncExternalStore } from 'react';
import { FactoryCanvas } from './canvas/FactoryCanvas';
import { GameSession } from './game/session';
import { Hud } from './hud/Hud';

/** Top-level layout: React panels around the PixiJS factory canvas (ADR-0004). */
export function App() {
  const [session] = useState(() => new GameSession());
  const view = useSyncExternalStore(session.subscribe, session.getView);

  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>IdleSort</h1>
      </header>
      <main className="app-main">
        <FactoryCanvas session={session} />
        <Hud view={view} />
      </main>
    </div>
  );
}
