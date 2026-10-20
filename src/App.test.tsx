import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';

// jsdom has no WebGL, so stand in for PixiJS with an Application that just
// produces a canvas element.
vi.mock('pixi.js', () => ({
  Application: class {
    canvas = document.createElement('canvas');
    init = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();
  },
}));

describe('App', () => {
  it('boots and mounts the factory canvas', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'IdleSort' })).toBeInTheDocument();
    const host = screen.getByTestId('factory-canvas');
    await waitFor(() => expect(host.querySelector('canvas')).not.toBeNull());
  });
});
