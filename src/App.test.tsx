import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';

// jsdom has no WebGL, so stand in for PixiJS with an Application that just
// produces a canvas element, and skip drawing the scene.
vi.mock('pixi.js', () => ({
  Application: class {
    canvas = document.createElement('canvas');
    init = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();
  },
}));
vi.mock('./canvas/FactoryRenderer', () => ({
  FactoryRenderer: class {
    destroy = vi.fn();
  },
}));

describe('App', () => {
  it('boots into the starting factory with the HUD and a connect hint', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'IdleSort' })).toBeInTheDocument();
    expect(screen.getByTestId('money')).toHaveTextContent('$0');
    expect(screen.getByTestId('run')).toHaveTextContent('0');
    expect(screen.getByText(/Drag from the Producer’s output Port/)).toBeInTheDocument();
    const host = screen.getByTestId('factory-canvas');
    await waitFor(() => expect(host.querySelector('canvas')).not.toBeNull());
  });
});
