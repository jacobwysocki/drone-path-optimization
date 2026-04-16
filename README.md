# AERO-PATH — 3D UAV Path Planning & Fleet Optimization

A browser-based simulation that investigates a real logistics question: **given a set of drone deliveries, what is the smallest fleet that can complete them safely within battery and payload constraints, and how do we route that fleet without mid-air collisions?** It started as my final-year research project at Northumbria University and I've continued developing it since — the current version is a full 3D rewrite with a cooperative multi-agent pathfinder, swarm routing, and a live simulation terminal.

## What it does

The user drops delivery targets onto a 3D city grid (roads, skyscrapers of varying heights, paintable obstacles) and picks a fleet size — or asks the app to compute the optimal one from payload and battery limits. The simulation then plans, animates, and narrates the whole mission in a live terminal: clustering deliveries, choosing a visit order, finding collision-free flight paths through 3D airspace, reloading at base when payload runs out, and returning home.

## The algorithmic pipeline

Each mission runs through three stages — chosen deliberately because each solves a different, well-known sub-problem:

1. **Delivery allocation — K-Means clustering.** Groups deliveries spatially so each drone gets a coherent local workload rather than crossing the map.
2. **Route ordering — Ant Colony Optimization (TSP).** Each drone then asks "in what order should I visit my assigned targets?" — a Travelling Salesperson problem, solved with ACO (pheromone-weighted probabilistic tours over 50 iterations).
3. **Collision-free navigation — Cooperative A\* (MAPF).** Adds a **time dimension** to the search space and a global `ReservationTable` of (row, col, z, time) tuples. When a second drone plans, it reads the table and will wait in place or climb to a higher altitude rather than fly through a reserved cell. Both vertex and edge reservations are checked, so two drones can't swap positions through each other.

Standard A\* and Dijkstra are also implemented as a baseline — they find shorter individual paths but crash drones into each other, which illustrates *why* the MAPF variant exists.

## Tech stack

- **React 18** (class component orchestrator + functional children for animated parts)
- **Three.js** via **@react-three/fiber** and **@react-three/drei** for the 3D scene graph
- **@react-three/postprocessing** for bloom/glow effects
- **React-Bootstrap** for the control panel
- **Create React App** / webpack as the toolchain

All algorithms — Dijkstra, A\*, Cooperative A\* (space-time MAPF with a reservation table), K-Means, and ACO — are implemented from scratch in plain JavaScript in `src/algorithms/`.

## What I think is interesting to look at

- `src/algorithms/cooperativeAStar.js` — the 4D (row, col, z, time) state-space search with vertex + edge reservation checks and asymmetric climb/descend costs (climbing is 2× the cost of flat flight, descending is 0.5×, so drones prefer to route *over* obstacles only when it's actually cheaper than waiting).
- `src/algorithms/aco.js` — ACO for TSP, roulette-wheel selection with pheromone evaporation.
- `src/algorithms/allocation.js` — K-Means with centroid recomputation and a convergence check.
- `src/visualization/Visualization3D.js` — the orchestration layer that ties allocation → routing → pathfinding → animation, including multi-trip logic (a drone whose cluster exceeds payload returns to base to reload mid-mission) and a battery model that drains as the curve is traversed.

## Running it locally

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000). The in-app **📖 Project Wiki** button (or [`WIKI.md`](./WIKI.md)) opens a more detailed algorithmic write-up.

### Available scripts

| Command | What it does |
| --- | --- |
| `npm start` | Runs the dev server at `localhost:3000`. |
| `npm test` | Launches the Jest / React Testing Library watcher. |
| `npm run build` | Produces a minified, hashed production bundle in `build/`. |

## Project layout

```
src/
├── algorithms/
│   ├── aStar.js              A* pathfinder (baseline)
│   ├── dijkstra.js           Dijkstra pathfinder (baseline)
│   ├── cooperativeAStar.js   Space-time MAPF with a ReservationTable
│   ├── aco.js                Ant Colony Optimization for TSP routing
│   ├── allocation.js         K-Means clustering for delivery allocation
│   └── algorithm.js          Shared grid helpers
├── visualization/
│   └── Visualization3D.js    3D scene, control panel, orchestration
├── wikiContent.js            In-app wiki markdown
└── App.js                    Entry point
```

---

**Scope honesty:** single-page app, no backend, no tests beyond CRA's default. It's here to demonstrate how I reason about an algorithmic problem end-to-end: decomposing it into sub-problems, picking the right tool for each, and making the result visible.
