# Browser game: React for UI panels, PixiJS for the factory canvas

IdleSort is a browser game built with Vite + React + TypeScript; React renders menus and panels (shop, upgrades), and PixiJS renders the factory grid, Nodes, Connections and moving Batches. We rejected React Flow / SVG for the factory because it degrades with hundreds of animated Batches, and plain Canvas2D because it means hand-rolling scene graph, hit-testing and batching that PixiJS provides.
