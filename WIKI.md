# AERO-PATH: Model and Architecture

**Research focus:** implementation and visualization of path-optimization techniques for goods-delivery UAV fleets.

## Purpose and limits

AERO-PATH lets a user place delivery targets and obstacles on a 20 × 50 grid, choose mission settings, and compare route-planning strategies in a 3D scene. The result is an explanatory simulation. It does not model aerodynamics, weather, communications, regulatory separation, charging, or real vehicle control, and it must not be treated as operational flight guidance.

The UI's **Auto-Optimize** action estimates a plausible fleet size; it does not calculate or prove the optimal number of UAVs. Cooperative A* reduces conflicts for the selected priority order; it does not guarantee that it will find a joint solution whenever one exists.

## Planning pipeline

### 1. Deterministic delivery allocation

`src/algorithms/allocation.js` partitions deliveries into at most one cluster per active drone. Its K-Means-style process is deterministic for a fixed input order:

1. The first delivery seeds the first centroid.
2. Each later centroid is the delivery farthest from its nearest existing centroid; original input order resolves ties.
3. Deliveries are assigned to the nearest centroid; centroid order resolves equal-distance ties.
4. An empty cluster receives the highest-error delivery from a cluster with more than one member, using a stable tie-break.
5. Centroids are recomputed until assignments stop changing or 100 iterations have run.

The routine groups nearby work; it does not balance route cost, payload, battery use, or time equally between drones.

### 2. Delivery-order heuristic

`src/algorithms/aco.js` applies Ant Colony Optimization to the delivery order for each cluster. Defaults are 15 ants, 50 iterations, pheromone-weighted roulette selection, and 0.5 evaporation. The caller's delivery order is the initial no-regression incumbent. When `payloadLimit` is supplied, the scoring objective inserts depot returns after capacity-sized delivery batches; the mission planner later constructs the corresponding physical depot legs and reload dwells.

The algorithm API uses `Math.random` by default and accepts an injected random function, so direct calls remain stochastic unless their caller provides one. The UI injects a seeded random source, making its ACO route reproducible for the same fixed mission inputs and settings. ACO returns an order no worse than its caller-order incumbent under the payload-aware objective, but it does not certify a globally shortest tour.

### 3. Single-agent baselines

`src/algorithms/dijkstra.js` and `src/algorithms/aStar.js` plan ground-grid legs. They validate reachability and return no route when a destination is blocked or disconnected. These algorithms have no shared time or reservation state, so simultaneously animated baseline routes can intersect.

### 4. Cooperative A* in space-time

`src/algorithms/cooperativeAStar.js` searches states identified by `(row, col, z, time)`. From a state, the drone may wait, move one row/column cell, climb one level, or descend one level. Every action arrives exactly one integer tick later.

Movement duration and weighted energy/search cost are deliberately distinct:

| Action | Tick duration | Cost |
| --- | ---: | ---: |
| Wait | 1 | 1 |
| Horizontal move | 1 | 1 |
| Climb one level | 1 | 2 |
| Descend one level | 1 | 0.5 |

A wall cell can be occupied only above its `wallHeight`; blocked cells cannot be occupied at any altitude. The default search ceiling is `z = 15`.

#### Reservation semantics

The reservation table stores two kinds of claims:

- A **vertex reservation** `(row, col, z, tick)` prevents another drone from occupying that position at that tick.
- A **directed edge reservation** from one position to another at the departure tick records movement during that tick. Candidate movement checks the reverse directed edge, preventing two drones from swapping positions head-on.

`ReservationTable.reservePath` accepts points exactly one tick apart, reserves every point's vertex, and reserves each non-wait edge at the earlier point's tick. The UI also reserves every tick of a multi-tick depot reload dwell. A wait remains at one vertex and therefore consumes that vertex over its timed interval.

The search rejects a reserved starting state. Its default time horizon extends beyond the latest known reservation by an upper bound based on grid cells and altitude levels, allowing waits longer than a small fixed cutoff. A caller can provide an explicit horizon and receives a distinct `time_horizon_exceeded` reason when that limit prevents completion.

#### Prioritized planning

The orchestration layer in `src/visualization/Visualization3D.jsx` plans drones in cluster order. It attempts launches two ticks apart, plans all legs for one drone, reserves that completed timed route, then plans the next drone. Later drones can wait or change altitude around earlier reservations, but earlier routes are never reconsidered. This priority choice is fast and easy to explain, but it is neither complete nor globally cost-optimal MAPF.

## Fleet recommendation

The recommendation uses two lower-detail estimates:

1. Visit all deliveries with a nearest-neighbor Manhattan walk from the depot, add the Manhattan return, and divide that total by the nominal 150-unit range.
2. Divide the number of deliveries by the selected payload limit.

It rounds each estimate up, takes the larger value, and clamps it to 1–7. The calculation runs before detailed allocation and path planning. Obstacles, vertical cost, waiting, route reservations, ACO route ordering, reload timing, and per-drone route balance are therefore absent from the estimate. A recommendation can be conservative, insufficient, or capped below what a constrained scenario would require.

Payload limits are enforced through depot returns and 10-tick reload dwells during mission construction. The on-screen battery drains according to horizontal distance, altitude change, and low-cost waiting, but exceeding the nominal battery capacity does not currently abort or re-plan a route.

## Animation model

Each route is an ordered set of timestamped waypoints. The renderer converts grid coordinates to Three.js positions and performs piecewise-linear interpolation within the active time segment:

`progress = (simulationTime - from.time) / (to.time - from.time)`

Simulation time advances at four ticks per real second. A drone holds its first position until its launch time, interpolates between each pair of waypoints, and completes at the final timestamp. Identical endpoints produce a stationary wait/reload segment. Energy is interpolated over the same segment for the battery label. The path line joins the waypoints directly; no Catmull–Rom spline or physics engine is involved.

## Application architecture

- `src/index.jsx` mounts the React application.
- `src/App.jsx` is the small application shell.
- `src/visualization/Visualization3D.jsx` owns grid state, controls, planning orchestration, logs, and the React Three Fiber scene.
- `src/algorithms/` contains the independent planning/allocation modules and their Vitest suites.
- `src/wikiContent.js` imports this file as raw Markdown so the repository wiki and in-app wiki cannot drift.
- `index.html` is Vite's HTML entry; static install metadata and the retained drone icon live in `public/`.

There is no backend, persistent data store, service worker, or legacy 2D node-component tree.

## Verification and deployment

Node 24 is the supported runtime. From a clean checkout:

```bash
nvm use
npm ci
npm run check
```

`check` runs ESLint, all Vitest suites, and the Vite production build. `npm start` and `npm run dev` run the development server; `npm run preview` serves `dist/` locally.

GitHub Actions runs the same install/lint/test/build gate for changes. A separate, manually dispatched workflow deploys the verified `dist/` artifact from `main` through GitHub Pages; merging a pull request does not deploy production automatically. Vite and the web manifest use `/drone-path-optimization/` as the deployment base.

`npm run deploy` first runs the automatic `predeploy` quality gate, then dispatches that same `pages.yml` workflow with the `main` ref; it does not publish a deployment branch. The command requires the GitHub CLI to be installed and authenticated for this repository (`gh auth status`) with permission to run Actions workflows.
