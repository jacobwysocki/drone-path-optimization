import { MinPriorityQueue } from './priorityQueue';

const DEFAULT_MAX_Z = 15;
const ENERGY_COST = Object.freeze({
    wait: 1,
    horizontal: 1,
    climb: 2,
    descend: 0.5
});
const DIRECTIONS = Object.freeze([
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1]
]);
const COST_EPSILON = 1e-9;

export class ReservationTable {
    constructor() {
        this.reservations = new Set();
        this.latestTime = -Infinity;
    }

    reserve(row, col, z, time) {
        validateReservationCoordinates(row, col, z, time);
        this.reservations.add(vertexKey(row, col, z, time));
        this.latestTime = Math.max(this.latestTime, time);
    }

    reserveEdge(r1, c1, z1, r2, c2, z2, time) {
        validateReservationCoordinates(r1, c1, z1, time);
        validateSpatialCoordinates(r2, c2, z2);
        this.reservations.add(edgeKey(r1, c1, z1, r2, c2, z2, time));
        this.latestTime = Math.max(this.latestTime, time);
    }

    isReserved(row, col, z, time) {
        return this.reservations.has(vertexKey(row, col, z, time));
    }

    isEdgeReserved(r1, c1, z1, r2, c2, z2, time) {
        return this.reservations.has(edgeKey(r2, c2, z2, r1, c1, z1, time));
    }

    latestReservedTime() {
        return this.latestTime;
    }

    reservePath(path) {
        if (!Array.isArray(path)) {
            throw new TypeError('path must be an array of timed path points.');
        }

        for (let index = 0; index < path.length; index++) {
            const point = path[index];
            validateTimedPoint(point, `path[${index}]`);

            if (index > 0) {
                const previous = path[index - 1];
                if (point.time !== previous.time + 1) {
                    throw new RangeError('Consecutive path points must be exactly one tick apart.');
                }
            }
        }

        for (let index = 0; index < path.length; index++) {
            const point = path[index];
            this.reserve(point.row, point.col, point.z, point.time);

            if (index > 0) {
                const previous = path[index - 1];
                if (!samePosition(previous, point)) {
                    this.reserveEdge(
                        previous.row,
                        previous.col,
                        previous.z,
                        point.row,
                        point.col,
                        point.z,
                        previous.time
                    );
                }
            }
        }

        return this;
    }
}

export function cooperativeAStar(
    grid,
    startNode,
    finishNode,
    startTime = 0,
    reservationTable = new ReservationTable(),
    options = {}
) {
    const visitedNodesInOrder = [];
    const invalidReason = validateSearchInputs(
        grid,
        startNode,
        finishNode,
        startTime,
        reservationTable,
        options
    );

    if (invalidReason) {
        return failureResult(visitedNodesInOrder, startTime, invalidReason);
    }

    const maxZ = options.maxZ ?? DEFAULT_MAX_Z;
    const goalHoldTicks = options.goalHoldTicks ?? 0;
    const start = normalizePoint(startNode, startTime);
    const finish = normalizePoint(finishNode);

    if (!canOccupy(grid, start.row, start.col, start.z, maxZ)) {
        return failureResult(visitedNodesInOrder, startTime, 'invalid_start');
    }
    if (!canOccupy(grid, finish.row, finish.col, finish.z, maxZ)) {
        return failureResult(visitedNodesInOrder, startTime, 'invalid_finish');
    }
    if (reservationTable.isReserved(start.row, start.col, start.z, startTime)) {
        return failureResult(visitedNodesInOrder, startTime, 'start_reserved');
    }

    const staticShortestTicks = shortestStaticTravelTime(grid, start, finish, maxZ);
    if (!Number.isFinite(staticShortestTicks)) {
        return failureResult(visitedNodesInOrder, startTime, 'unreachable');
    }

    const derivedTimeHorizon = deriveTimeHorizon(
        grid,
        startTime,
        maxZ,
        reservationTable,
        goalHoldTicks
    );
    const timeHorizon = options.timeHorizon ?? derivedTimeHorizon;

    let sequence = 0;
    const openSet = new MinPriorityQueue(compareSearchStates);
    const bestEnergy = new Map();
    const visitedSpatialPositions = new Set();
    const startHeuristic = directionalHeuristic(start, finish);
    const startState = {
        ...start,
        g: 0,
        h: startHeuristic,
        f: startHeuristic,
        parent: null,
        sequence: sequence++
    };
    const startKey = stateKey(startState);
    bestEnergy.set(startKey, 0);
    openSet.push(startState);

    let horizonWasReached = false;

    while (!openSet.isEmpty()) {
        const current = openSet.pop();
        const currentKey = stateKey(current);
        const knownBestEnergy = bestEnergy.get(currentKey);
        if (knownBestEnergy === undefined || current.g > knownBestEnergy + COST_EPSILON) {
            continue;
        }

        recordVisitedPosition(current, visitedSpatialPositions, visitedNodesInOrder);

        if (
            samePosition(current, finish) &&
            isGoalWindowAvailable(
                finish,
                current.time,
                goalHoldTicks,
                timeHorizon,
                reservationTable
            )
        ) {
            return {
                found: true,
                visitedNodesInOrder,
                path: reconstructTimedPath(current),
                endTime: current.time,
                cost: current.g,
                reason: null,
                timeHorizon
            };
        }

        if (current.time >= timeHorizon) {
            horizonWasReached = true;
            continue;
        }

        for (const nextPosition of getTimedNeighbors(grid, current, maxZ)) {
            const nextTime = current.time + 1;

            if (reservationTable.isReserved(
                nextPosition.row,
                nextPosition.col,
                nextPosition.z,
                nextTime
            )) {
                continue;
            }

            if (
                !samePosition(current, nextPosition) &&
                reservationTable.isEdgeReserved(
                    current.row,
                    current.col,
                    current.z,
                    nextPosition.row,
                    nextPosition.col,
                    nextPosition.z,
                    current.time
                )
            ) {
                continue;
            }

            const g = current.g + transitionEnergy(current, nextPosition);
            const nextState = {
                ...nextPosition,
                time: nextTime,
                g,
                h: directionalHeuristic(nextPosition, finish),
                parent: current,
                sequence: sequence++
            };
            nextState.f = nextState.g + nextState.h;

            const nextKey = stateKey(nextState);
            const previousBest = bestEnergy.get(nextKey);
            if (previousBest !== undefined && g >= previousBest - COST_EPSILON) continue;

            bestEnergy.set(nextKey, g);
            openSet.push(nextState);
        }
    }

    const reason = options.timeHorizon !== undefined && horizonWasReached
        ? 'time_horizon_exceeded'
        : 'unreachable';
    return failureResult(visitedNodesInOrder, startTime, reason, timeHorizon);
}

function validateSearchInputs(grid, startNode, finishNode, startTime, reservationTable, options) {
    if (!isRectangularGrid(grid)) return 'invalid_grid';
    if (!isGridCoordinate(startNode, grid)) return 'invalid_start';
    if (!isGridCoordinate(finishNode, grid)) return 'invalid_finish';
    if (!Number.isInteger(startTime) || startTime < 0) return 'invalid_start_time';
    if (
        !reservationTable ||
        typeof reservationTable.isReserved !== 'function' ||
        typeof reservationTable.isEdgeReserved !== 'function'
    ) {
        return 'invalid_reservation_table';
    }
    if (!options || typeof options !== 'object') return 'invalid_options';

    const maxZ = options.maxZ ?? DEFAULT_MAX_Z;
    if (!Number.isInteger(maxZ) || maxZ < 0) return 'invalid_max_z';

    if (
        options.timeHorizon !== undefined &&
        (!Number.isInteger(options.timeHorizon) || options.timeHorizon < startTime)
    ) {
        return 'invalid_time_horizon';
    }

    if (
        options.goalHoldTicks !== undefined &&
        (!Number.isInteger(options.goalHoldTicks) || options.goalHoldTicks < 0)
    ) {
        return 'invalid_goal_hold_ticks';
    }

    const startZ = startNode.z ?? 0;
    const finishZ = finishNode.z ?? 0;
    if (!Number.isInteger(startZ) || startZ < 0 || startZ > maxZ) return 'invalid_start';
    if (!Number.isInteger(finishZ) || finishZ < 0 || finishZ > maxZ) return 'invalid_finish';

    return null;
}

function deriveTimeHorizon(grid, startTime, maxZ, reservationTable, goalHoldTicks) {
    const latestReservedTime = typeof reservationTable.latestReservedTime === 'function'
        ? reservationTable.latestReservedTime()
        : -Infinity;
    const lastDynamicTick = Number.isFinite(latestReservedTime)
        ? Math.max(startTime, latestReservedTime + 1)
        : startTime;
    const spatialStateUpperBound = grid.length * grid[0].length * (maxZ + 1);
    return lastDynamicTick + spatialStateUpperBound + goalHoldTicks;
}

function isGoalWindowAvailable(
    finish,
    arrivalTime,
    goalHoldTicks,
    timeHorizon,
    reservationTable
) {
    if (arrivalTime + goalHoldTicks > timeHorizon) return false;

    for (let time = arrivalTime; time <= arrivalTime + goalHoldTicks; time++) {
        if (reservationTable.isReserved(finish.row, finish.col, finish.z, time)) {
            return false;
        }
    }

    return true;
}

function shortestStaticTravelTime(grid, start, finish, maxZ) {
    if (samePosition(start, finish)) return 0;

    const queue = [start];
    const distance = new Map([[spatialKey(start), 0]]);

    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        const currentDistance = distance.get(spatialKey(current));

        for (const neighbor of getSpatialNeighbors(grid, current, maxZ)) {
            const key = spatialKey(neighbor);
            if (distance.has(key)) continue;
            if (samePosition(neighbor, finish)) return currentDistance + 1;

            distance.set(key, currentDistance + 1);
            queue.push(neighbor);
        }
    }

    return Infinity;
}

function getTimedNeighbors(grid, current, maxZ) {
    return [
        { row: current.row, col: current.col, z: current.z },
        ...getSpatialNeighbors(grid, current, maxZ)
    ];
}

function getSpatialNeighbors(grid, current, maxZ) {
    const neighbors = [];

    for (const [rowDelta, colDelta, zDelta] of DIRECTIONS) {
        const row = current.row + rowDelta;
        const col = current.col + colDelta;
        const z = current.z + zDelta;
        if (canOccupy(grid, row, col, z, maxZ)) {
            neighbors.push({ row, col, z });
        }
    }

    return neighbors;
}

function canOccupy(grid, row, col, z, maxZ) {
    if (
        row < 0 ||
        row >= grid.length ||
        col < 0 ||
        col >= grid[0].length ||
        z < 0 ||
        z > maxZ
    ) {
        return false;
    }

    const node = grid[row][col];
    if (!node || node.isBlocked) return false;
    if (!node.isWall) return true;

    const buildingHeight = Number.isFinite(node.wallHeight) ? node.wallHeight : 2;
    return z > buildingHeight;
}

function transitionEnergy(from, to) {
    if (samePosition(from, to)) return ENERGY_COST.wait;
    if (to.z > from.z) return ENERGY_COST.climb;
    if (to.z < from.z) return ENERGY_COST.descend;
    return ENERGY_COST.horizontal;
}

function directionalHeuristic(from, finish) {
    const horizontalDistance = (
        Math.abs(from.row - finish.row) +
        Math.abs(from.col - finish.col)
    );
    const verticalDifference = finish.z - from.z;
    const verticalCost = verticalDifference >= 0
        ? verticalDifference * ENERGY_COST.climb
        : -verticalDifference * ENERGY_COST.descend;
    return horizontalDistance * ENERGY_COST.horizontal + verticalCost;
}

function compareSearchStates(a, b) {
    return (
        a.f - b.f ||
        a.h - b.h ||
        a.time - b.time ||
        a.sequence - b.sequence
    );
}

function reconstructTimedPath(state) {
    const path = [];
    let current = state;

    while (current) {
        path.push({
            row: current.row,
            col: current.col,
            z: current.z,
            time: current.time
        });
        current = current.parent;
    }

    return path.reverse();
}

function recordVisitedPosition(state, seen, visitedNodesInOrder) {
    const key = spatialKey(state);
    if (seen.has(key)) return;
    seen.add(key);
    visitedNodesInOrder.push({
        row: state.row,
        col: state.col,
        z: state.z,
        time: state.time,
        isWall: false,
        isStart: false,
        isFinish: false
    });
}

function failureResult(visitedNodesInOrder, startTime, reason, timeHorizon = startTime) {
    return {
        found: false,
        visitedNodesInOrder,
        path: [],
        endTime: Number.isInteger(startTime) ? startTime : 0,
        cost: Infinity,
        reason,
        timeHorizon
    };
}

function normalizePoint(node, time) {
    const point = {
        row: node.row,
        col: node.col,
        z: node.z ?? 0
    };
    if (time !== undefined) point.time = time;
    return point;
}

function isRectangularGrid(grid) {
    return (
        Array.isArray(grid) &&
        grid.length > 0 &&
        Array.isArray(grid[0]) &&
        grid[0].length > 0 &&
        grid.every(row => Array.isArray(row) && row.length === grid[0].length)
    );
}

function isGridCoordinate(node, grid) {
    return Boolean(
        node &&
        Number.isInteger(node.row) &&
        Number.isInteger(node.col) &&
        node.row >= 0 &&
        node.row < grid.length &&
        node.col >= 0 &&
        node.col < grid[0].length
    );
}

function validateReservationCoordinates(row, col, z, time) {
    validateSpatialCoordinates(row, col, z);
    if (!Number.isInteger(time) || time < 0) {
        throw new RangeError('Reservation time must be a non-negative integer tick.');
    }
}

function validateSpatialCoordinates(row, col, z) {
    if (![row, col, z].every(Number.isInteger)) {
        throw new TypeError('Reservation coordinates must be integers.');
    }
}

function validateTimedPoint(point, label) {
    if (!point || ![point.row, point.col, point.z, point.time].every(Number.isInteger)) {
        throw new TypeError(`${label} must contain integer row, col, z, and time values.`);
    }
    if (point.time < 0) {
        throw new RangeError(`${label}.time must be non-negative.`);
    }
}

function samePosition(a, b) {
    return a.row === b.row && a.col === b.col && a.z === b.z;
}

function vertexKey(row, col, z, time) {
    return `${row},${col},${z},${time}`;
}

function edgeKey(r1, c1, z1, r2, c2, z2, time) {
    return `${r1},${c1},${z1}-${r2},${c2},${z2},${time}`;
}

function spatialKey(point) {
    return `${point.row},${point.col},${point.z}`;
}

function stateKey(state) {
    return `${state.row},${state.col},${state.z},${state.time}`;
}
