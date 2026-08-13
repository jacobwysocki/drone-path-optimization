# Project Optimization and Audit

Date: 2026-08-12

## Outcome

The project was audited and optimized across pathfinding correctness, multi-drone scheduling, simulation behavior, accessibility, responsive layout, dependencies, testing, build tooling, and deployment automation.

The review ran as three parallel Herdr lanes:

- `drone-algo`: algorithms, counterexamples, reservations, and performance
- `drone-ui`: React/Three.js simulation, accessibility, and responsive behavior
- `drone-qa`: dependencies, tooling, CI, deployment, and documentation

Every lane used `gpt-5.6-sol` with `model_reasoning_effort="max"`.

## Before and after

| Area | Baseline | Delivered state |
| --- | --- | --- |
| Automated tests | Jest could not start because the CRA transform did not handle the ESM `react-markdown` dependency | 44 passing tests across 7 Vitest files |
| Dependency audit | 68 findings: 15 low, 18 moderate, 31 high, 4 critical | 0 findings across 508 dependencies |
| Toolchain | Deprecated Create React App / `react-scripts` stack | Vite 8, Vitest 4, React 19, ESLint 9 |
| CSS delivery | 28.24 kB gzip | 2.97 kB gzip after removing Bootstrap |
| JavaScript delivery | 371.62 kB gzip CRA monolith | 344.42 kB gzip initial chunks; 38.95 kB Wiki/Markdown code deferred until opened |
| Runtime failure handling | Reset followed by MAPF could deadlock the UI indefinitely | Zero-work, failed-route, reset, and repeated-run paths all restore controls and stop timing |
| Small-screen layout | Controls and terminal clipped on mobile | No horizontal overflow at 390x844 or 320x568; the control panel scrolls and all run/reset controls remain reachable |

## Correctness and performance changes

- Replaced repeated full-array frontier sorting with a binary heap priority queue.
- Corrected A* and Dijkstra relaxation, unreachable-result handling, and path reconstruction.
- Reworked Cooperative A* around integer time ticks, exact vertex/edge reservations, start reservations, safe goal holds, reload dwell, and a dynamic planning horizon.
- Kept time and energy separate so weighted terrain affects energy without corrupting collision timing.
- Added deterministic allocation and empty-cluster repair.
- Made ACO deterministic for a mission, payload-aware, depot-return-aware, validated, and no worse than its supplied route incumbent.
- Changed animation to follow the planner's timed, piecewise-linear schedule, including waits and delayed launches; future and completed drones no longer stack visibly at the depot.
- Reduced timer updates from 100 Hz to 10 Hz, capped expensive visual work, instanced ground geometry, and bounded terminal/star rendering.

## Reliability and UX changes

- Fixed the reset-to-MAPF deadlock and cleanup after planning failures.
- Prevented unreachable routes from teleporting a drone to its next delivery.
- Added independent run identifiers so consecutive simulations do not reuse stale state.
- Clamped numeric inputs and made delivery generation finite.
- Added accessible names and live status regions, a keyboard obstacle editor, descriptive canvas semantics, and focus-safe Wiki dialog behavior with Escape dismissal and focus restoration.
- Replaced Bootstrap/react-bootstrap with project CSS and responsive layouts.
- Lazy-loaded the Wiki renderer and content.

## Engineering and release changes

- Migrated the project from CRA/Jest to Vite/Vitest and renamed JSX entry files accordingly.
- Removed dead scaffold assets, tracked IDE metadata, obsolete components, and unused dependencies.
- Added lint, test, build, preview, and consolidated `npm run check` commands.
- Added CI and a manually dispatched GitHub Pages workflow with immutable action commit pins.
- Added weekly Dependabot checks for npm and GitHub Actions.
- Made `npm run deploy` run the full quality gate before dispatching the Pages workflow.
- Updated the README, Wiki, manifest, and project description to match the delivered architecture and its limits.

## Verification performed

- `npm ci`: clean install completed.
- `npm run check`: ESLint passed with zero warnings, all 44 tests passed, and the production build completed.
- `npm audit --json`: zero known vulnerabilities.
- `npm ls --depth=0`: dependency tree is valid.
- `git diff --check`: no whitespace errors.
- Workflow and Dependabot YAML parse successfully; every action reference is pinned to a reviewed commit SHA.
- Adversarial algorithm checks included exact shortest-path counterexamples, long-horizon reservations beyond tick 451, depot service holds, 2,000 randomized A*/Dijkstra comparisons, and 200 payload-aware ACO runs.
- Production-browser checks passed at 1440x900, 390x844, and 320x568.
- A reset followed by a one-delivery MAPF mission completed with controls restored; two consecutive Standard A* missions also completed cleanly.
- The Wiki dialog receives focus, closes with Escape, and restores focus to its opener.

## Remaining tradeoffs

- Cooperative A* is a prioritized planner. It is deterministic and collision-safe for the produced schedule, but priority ordering means it is not a complete or globally optimal multi-agent solver.
- Fleet sizing remains a recommendation heuristic, and battery is reported rather than enforced as a hard route-feasibility constraint.
- Three.js remains the dominant bundle: the Three vendor chunk is about 1.01 MB minified / 269.25 kB gzip, so Vite still emits a large-chunk warning. The browser also reports a `THREE.Clock` deprecation originating in the current rendering dependency stack.
- Algorithm and orchestration behavior is automated in CI, but the WebGL browser smoke pass is currently manual rather than an end-to-end CI job.
- No production deployment was performed as part of this audit.
