# Drone Path Optimization Project Description

AERO-PATH is a React 19 and Three.js browser simulation for studying delivery allocation, route-order heuristics, single-agent pathfinding, and prioritized Cooperative A* in a shared 3D grid.

## Current capabilities

- Interactive 3D grid with delivery generation and editable obstacles.
- Deterministic K-Means-style delivery allocation.
- Optional Ant Colony Optimization with payload-aware depot-return scoring and the caller order as a no-regression incumbent. Its API remains stochastic by default and accepts an injected random source; the UI injects a seeded source for reproducible results with fixed mission inputs and settings.
- Dijkstra and A* ground-path baselines.
- Cooperative A* with integer-tick vertex and reverse-edge conflict checks, waiting, and altitude changes.
- Piecewise-linear animation of timestamped routes, payload reload visits, battery visualization, and a simulation log.
- A heuristic fleet-size recommendation based on Manhattan route length, nominal battery range, and payload capacity. It is not a proof of minimum fleet size or route feasibility.

## Implementation

- `src/visualization/Visualization3D.jsx` contains the scene, controls, timed animation, and mission orchestration.
- `src/algorithms/` contains the independent pathfinding, reservation, allocation, routing, and priority-queue modules plus Vitest suites.
- `src/App.jsx` and `src/index.jsx` provide the React shell and entry point.
- `WIKI.md` is the canonical detailed model description and is loaded into the application through `src/wikiContent.js`.
- Vite builds the static application to `dist/` for the `/drone-path-optimization/` GitHub Pages path.

There are no legacy 2D `node` or `visualization.js` components in the current architecture.

## Run and verify

Use Node 24, as pinned in `.nvmrc`:

```bash
nvm use
npm ci
npm run check
npm start
```

The development server defaults to `http://localhost:5173`. See `README.md` for every script, CI behavior, deployment instructions, model assumptions, and known limitations.
