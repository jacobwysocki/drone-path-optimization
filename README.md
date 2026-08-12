# AERO-PATH — 3D UAV Path Planning & Fleet Optimization

**Live demo:** [jacobwysocki.github.io/drone-path-optimization](https://jacobwysocki.github.io/drone-path-optimization/)

AERO-PATH is a browser-based simulation for exploring delivery allocation, route ordering, and collision-aware drone movement in a shared 3D grid. It is a research and visualization tool, not a certified flight planner.

## How a mission is planned

1. **Allocate deliveries.** `allocateDeliveries` uses deterministic K-Means-style clustering. It seeds the first centroid from the first delivery, chooses subsequent farthest points with stable tie-breaking, repairs empty clusters, and stops when assignments stabilize or after 100 iterations.
2. **Order each cluster.** Optional Ant Colony Optimization uses 15 ants over 50 iterations by default. The algorithm API defaults to `Math.random` and remains stochastic unless its caller injects another random source. The UI injects a seeded random source, so the ACO result is reproducible for the same fixed mission inputs and settings. Its payload-aware objective inserts depot returns after capacity-sized batches, and the caller's delivery order is retained as a no-regression incumbent. The result remains a heuristic, not a proof of optimality.
3. **Plan each leg.** Dijkstra and A* provide single-agent ground-path baselines. Cooperative A* searches `(row, col, z, time)` states and gives later-planned drones the reservations made by earlier-planned drones.
4. **Animate the timed route.** The renderer interpolates linearly between consecutive timestamped waypoints at four simulation ticks per real second. Identical consecutive positions represent waiting; there is no spline or constant-distance-speed model.

### Cooperative A* timing and reservations

Every wait, horizontal move, climb, or descent advances exactly one integer tick. Search cost is separate from duration: waiting and horizontal flight cost `1`, climbing costs `2`, and descending costs `0.5`. A reserved vertex blocks occupancy at its tick. A directed edge is reserved at the departure tick, and a candidate move checks the reverse directed edge to prevent head-on swaps.

The UI plans drones sequentially, staggers depot launch attempts by two ticks, and reserves each completed route before planning the next drone. This is prioritized Cooperative A*, not a complete or globally optimal multi-agent path-finding solver; a valid joint solution can exist even when the chosen priority order cannot find one.

### Fleet recommendation

The UI's **Auto-Optimize** action is a sizing heuristic, not a minimum-fleet guarantee. It takes the larger of:

- a nearest-neighbor Manhattan round-trip estimate divided by the nominal 150-unit battery range; and
- delivery count divided by payload capacity.

The result is clamped to the UI's supported range of 1–7 drones. It does not solve routes first or account for obstacles, altitude energy, waits, reservation priority, or the ACO route-order objective. The battery display reports modeled route energy, but the planner does not reject a route whose modeled energy exceeds 150 units.

## Technology

- Node.js 24 and npm 11
- React 19 and React DOM 19
- Vite 8 with its OXC-backed React plugin
- Three.js with React Three Fiber, Drei, and React Three Postprocessing
- Vitest 4, jsdom, and Testing Library
- ESLint 9 flat configuration

## Local development

Use the Node release in [`.nvmrc`](./.nvmrc). For a reproducible install:

```bash
nvm use
npm ci
npm start
```

The Vite development server defaults to [http://localhost:5173](http://localhost:5173). `npm run dev` is an alternative to `npm start`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Start the Vite development server. |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Create the production site in `dist/` with the `/drone-path-optimization/` base path. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run all Vitest suites once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run lint` | Lint maintained JavaScript and JSX. |
| `npm run check` | Run lint, tests, and the production build. |
| `npm run predeploy` | Run the complete local quality gate; npm invokes it automatically before `deploy`. |
| `npm run deploy` | After `predeploy`, use an authenticated GitHub CLI to dispatch `pages.yml` from `main`. This changes remote state. |

## Testing

The test suite covers priority-queue behavior; A* and Dijkstra success, failure, and boundary cases; deterministic allocation; ACO validation, injected seeded behavior, payload-aware scoring, and its no-regression incumbent; and Cooperative A* timing, reservations, conflicts, waits, costs, long horizons, and unreachable targets. WebGL-free application and visualization-orchestration tests cover mounting, reset behavior, failure recovery, consecutive runs, reload reservations, and the UI's seeded payload-aware ACO wiring.

The UI coverage also protects terminal logging across React Strict Mode's development remount. These tests deliberately do not instantiate `Canvas` or require a GPU. Browser/WebGL interaction and rendered-scene behavior remain separate integration concerns.

## Deployment and CI

`.github/workflows/ci.yml` runs a clean `npm ci`, lint, all tests, and a production build for pushes and pull requests. `.github/workflows/pages.yml` repeats the complete check on `main`, uploads `dist/` as a GitHub Pages artifact, and deploys it with Pages' scoped token permissions. Manual dispatch is accepted only when the selected ref is `main`.

For GitHub Pages, configure **Settings → Pages → Source** to **GitHub Actions**. The `homepage`, Vite `base`, manifest scope/start URL, and HTML metadata all target `/drone-path-optimization/`.

`npm run deploy` is a convenience dispatcher for that same Actions workflow; it does not publish a deployment branch. It requires the [GitHub CLI](https://cli.github.com/) to be installed and authenticated for this repository (`gh auth status`) with permission to run Actions workflows.

The production build separates React and the Three/R3F stack into named vendor cache groups. The Three/WebGL group remains intentionally visible as a large initial dependency rather than suppressing Vite's size warning.

## Repository layout

```text
index.html                         Vite HTML entry and product metadata
public/
├── drone-icon.png                 Shared app icon
└── manifest.json                  Install metadata for the Pages subpath
src/
├── algorithms/
│   ├── aStar.js                   Single-agent A* baseline
│   ├── dijkstra.js                Single-agent Dijkstra baseline
│   ├── cooperativeAStar.js        Timed Cooperative A* and ReservationTable
│   ├── priorityQueue.js           Shared binary min-priority queue
│   ├── aco.js                     ACO delivery-order heuristic
│   ├── allocation.js              Deterministic delivery clustering
│   ├── algorithm.js               Shared grid helpers
│   └── *.test.js                  Algorithm-focused Vitest suites
├── visualization/
│   ├── Visualization3D.jsx        Scene, controls, planning orchestration, animation
│   └── visualization.css          Visualization and control styling
├── App.jsx                        Application shell
├── App.test.jsx                   WebGL-free application smoke test
├── index.jsx                      React entry point
└── wikiContent.js                 Raw import of the canonical `WIKI.md`
```

See [WIKI.md](./WIKI.md) or open **Project Wiki** in the application for the detailed model description.
