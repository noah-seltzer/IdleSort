import { FactoryCanvas } from './canvas/FactoryCanvas';

/** Top-level layout: React panels around the PixiJS factory canvas (ADR-0004). */
export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>IdleSort</h1>
      </header>
      <main className="app-main">
        <FactoryCanvas />
      </main>
    </div>
  );
}
