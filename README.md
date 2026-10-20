# IdleSort

An incremental factory game about sorting: wire Producers, Buffers and Sorters into a pipeline that delivers numbers to the Receiver in order. See `GLOSSARY.md` for domain terms and `docs/adr/` for architectural decisions.

Built with Vite, React, TypeScript and PixiJS; tested with Vitest.

## Getting started

Requires Node 22.12+.

```bash
npm install
```

| Command             | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Start the dev server at http://localhost:5173    |
| `npm test`          | Type-check, then run the test suite once         |
| `npm run test:watch`| Run tests in watch mode                          |
| `npm run typecheck` | Type-check only                                  |
| `npm run build`     | Type-check and build for production into `dist/` |
| `npm run preview`   | Serve the production build locally               |
