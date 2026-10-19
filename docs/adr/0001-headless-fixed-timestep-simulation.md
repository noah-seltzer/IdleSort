# Headless fixed-timestep simulation, separate from rendering

The factory runs as a deterministic fixed-timestep simulation (initially 20 ticks/s) with no knowledge of rendering; the renderer only reads simulation state and interpolates between ticks. We chose this over a render-loop-driven simulation so the economy is unit-testable, offline progress is just "run the simulation forward N ticks", and save files are plain serialisable state.
