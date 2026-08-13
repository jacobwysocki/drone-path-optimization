import { describe, expect, it } from 'vitest';
import { cooperativeAStar, ReservationTable } from './cooperativeAStar';

describe('ReservationTable', () => {
    it('reserves timed path vertices and departure-tick edges', () => {
        const table = new ReservationTable();
        const path = [
            { row: 0, col: 0, z: 0, time: 4 },
            { row: 0, col: 0, z: 1, time: 5 }
        ];

        table.reservePath(path);

        expect(table.isReserved(0, 0, 0, 4)).toBe(true);
        expect(table.isReserved(0, 0, 1, 5)).toBe(true);
        expect(table.isEdgeReserved(0, 0, 1, 0, 0, 0, 4)).toBe(true);
        expect(table.latestReservedTime()).toBe(5);
    });
});

describe('cooperativeAStar', () => {
    it('uses one integer tick but weighted energy for a climb', () => {
        const grid = createGrid(1, 1);
        const result = cooperativeAStar(
            grid,
            { row: 0, col: 0, z: 0 },
            { row: 0, col: 0, z: 1 },
            7,
            new ReservationTable()
        );

        expect(result.found).toBe(true);
        expect(result.path).toEqual([
            { row: 0, col: 0, z: 0, time: 7 },
            { row: 0, col: 0, z: 1, time: 8 }
        ]);
        expect(result.endTime).toBe(8);
        expect(result.cost).toBe(2);

        const table = new ReservationTable().reservePath(result.path);
        expect(table.isReserved(0, 0, 1, 8)).toBe(true);
        expect(table.isReserved(0, 0, 1, 7)).toBe(false);
    });

    it('uses one tick and the lower directional energy cost for a descent', () => {
        const result = cooperativeAStar(
            createGrid(1, 1),
            { row: 0, col: 0, z: 1 },
            { row: 0, col: 0, z: 0 },
            0,
            new ReservationTable()
        );

        expect(result.found).toBe(true);
        expect(result.endTime).toBe(1);
        expect(result.cost).toBe(0.5);
    });

    it('rejects a reserved start state', () => {
        const table = new ReservationTable();
        table.reserve(0, 0, 0, 3);

        const result = cooperativeAStar(
            createGrid(1, 2),
            { row: 0, col: 0, z: 0 },
            { row: 0, col: 1, z: 0 },
            3,
            table
        );

        expect(result).toMatchObject({
            found: false,
            path: [],
            endTime: 3,
            cost: Infinity,
            reason: 'start_reserved'
        });
    });

    it('waits when the arrival vertex is reserved at the next tick', () => {
        const table = new ReservationTable();
        table.reserve(0, 1, 0, 1);

        const result = cooperativeAStar(
            createGrid(1, 2),
            { row: 0, col: 0, z: 0 },
            { row: 0, col: 1, z: 0 },
            0,
            table,
            { maxZ: 0 }
        );

        expect(result.path).toEqual([
            { row: 0, col: 0, z: 0, time: 0 },
            { row: 0, col: 0, z: 0, time: 1 },
            { row: 0, col: 1, z: 0, time: 2 }
        ]);
        expect(result.cost).toBe(2);
    });

    it('delays arrival until the entire requested goal-hold window is free', () => {
        const table = new ReservationTable();
        table.reserve(0, 0, 0, 6);

        const result = cooperativeAStar(
            createGrid(1, 2),
            { row: 0, col: 1, z: 0 },
            { row: 0, col: 0, z: 0 },
            3,
            table,
            { maxZ: 0, goalHoldTicks: 10 }
        );

        expect(result.found).toBe(true);
        expect(result.endTime).toBe(7);
        expect(result.path.at(-1)).toEqual({ row: 0, col: 0, z: 0, time: 7 });
        expect(result.endTime + 10).toBeLessThanOrEqual(result.timeHorizon);
    });

    it('blocks a reverse traversal of a reserved edge at its departure tick', () => {
        const table = new ReservationTable();
        table.reserveEdge(0, 0, 0, 0, 1, 0, 0);

        const result = cooperativeAStar(
            createGrid(1, 2),
            { row: 0, col: 1, z: 0 },
            { row: 0, col: 0, z: 0 },
            0,
            table,
            { maxZ: 0 }
        );

        expect(result.path).toEqual([
            { row: 0, col: 1, z: 0, time: 0 },
            { row: 0, col: 1, z: 0, time: 1 },
            { row: 0, col: 0, z: 0, time: 2 }
        ]);
    });

    it('finds the valid wait-until-tick-451 path beyond the former iteration cap', () => {
        const table = new ReservationTable();
        for (let time = 1; time <= 450; time++) {
            table.reserve(0, 1, 0, time);
        }

        const result = cooperativeAStar(
            createGrid(1, 2),
            { row: 0, col: 0, z: 0 },
            { row: 0, col: 1, z: 0 },
            0,
            table,
            { maxZ: 0 }
        );

        expect(result.found).toBe(true);
        expect(result.reason).toBeNull();
        expect(result.endTime).toBe(451);
        expect(result.cost).toBe(451);
        expect(result.path).toHaveLength(452);
        expect(result.path.at(-1)).toEqual({ row: 0, col: 1, z: 0, time: 451 });
        expect(result.timeHorizon).toBeGreaterThanOrEqual(451);
    });

    it('returns a safe legacy-shaped failure when the static goal is unreachable', () => {
        const grid = createGrid(1, 3, [[0, 1]]);
        const result = cooperativeAStar(
            grid,
            { row: 0, col: 0, z: 0 },
            { row: 0, col: 2, z: 0 },
            0,
            new ReservationTable(),
            { maxZ: 0 }
        );

        expect(result).toMatchObject({
            found: false,
            path: [],
            endTime: 0,
            reason: 'unreachable'
        });
    });

    it('rejects a negative or fractional goal-hold duration', () => {
        const grid = createGrid(1, 2);
        const start = { row: 0, col: 0, z: 0 };
        const finish = { row: 0, col: 1, z: 0 };

        expect(cooperativeAStar(
            grid,
            start,
            finish,
            0,
            new ReservationTable(),
            { goalHoldTicks: -1 }
        ).reason).toBe('invalid_goal_hold_ticks');
        expect(cooperativeAStar(
            grid,
            start,
            finish,
            0,
            new ReservationTable(),
            { goalHoldTicks: 1.5 }
        ).reason).toBe('invalid_goal_hold_ticks');
    });
});

function createGrid(rows, cols, walls = []) {
    const wallKeys = new Set(walls.map(point => point.join(',')));
    return Array.from({ length: rows }, (_, row) => (
        Array.from({ length: cols }, (_, col) => ({
            row,
            col,
            isWall: wallKeys.has(`${row},${col}`),
            isBlocked: false,
            wallHeight: wallKeys.has(`${row},${col}`) ? 2 : 0
        }))
    ));
}
