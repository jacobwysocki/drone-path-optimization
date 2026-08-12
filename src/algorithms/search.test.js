import { describe, expect, it } from 'vitest';
import { aStar, getNodesInShortestPathOrderAStar } from './aStar';
import { dijkstra, getNodesInShortestPathOrder } from './dijkstra';

const searches = [
    ['A*', aStar, getNodesInShortestPathOrderAStar],
    ['Dijkstra', dijkstra, getNodesInShortestPathOrder]
];

describe.each(searches)('%s', (_name, search, reconstruct) => {
    it('finds the true 11-step shortest path on the A* audit counterexample', () => {
        const grid = createGrid(5, 5, [
            [1, 0], [1, 1], [1, 2], [2, 3], [3, 1], [4, 3]
        ]);
        const start = grid[4][0];
        const finish = grid[0][1];

        search(grid, start, finish);
        const path = reconstruct(start, finish);

        expect(path).toHaveLength(12);
        expect(finish.distance).toBe(11);
        expect(path.map(node => [node.row, node.col])).toEqual([
            [4, 0], [4, 1], [4, 2], [3, 2], [3, 3], [3, 4],
            [2, 4], [1, 4], [0, 4], [0, 3], [0, 2], [0, 1]
        ]);
    });

    it('returns an empty reconstructed path when the finish is unreachable', () => {
        const grid = createGrid(3, 3, [
            [0, 1], [1, 0], [1, 2], [2, 1]
        ]);
        const start = grid[0][0];
        const finish = grid[1][1];

        search(grid, start, finish);

        expect(finish.isVisited).toBe(false);
        expect(reconstruct(start, finish)).toEqual([]);
        expect(finish.isPath).toBe(false);
    });

    it('returns the start node when start and finish are the same position', () => {
        const grid = createGrid(2, 2);
        const start = grid[1][1];

        search(grid, start, start);

        expect(reconstruct(start, start)).toEqual([start]);
        expect(start.distance).toBe(0);
    });

    it('accepts a coordinate-compatible start clone without mutating it into the grid', () => {
        const grid = createGrid(1, 3);
        const startClone = { ...grid[0][0] };
        const finish = grid[0][2];

        search(grid, startClone, finish);

        expect(reconstruct(startClone, finish).map(node => node.col)).toEqual([0, 1, 2]);
        expect(grid[0][0]).not.toBe(startClone);
    });

    it('reconstructs a successful path through a coordinate-compatible finish clone', () => {
        const grid = createGrid(1, 3);
        const start = grid[0][0];
        const canonicalFinish = grid[0][2];
        const finishClone = { ...canonicalFinish };

        search(grid, start, finishClone);

        expect(reconstruct(start, finishClone).map(node => node.col)).toEqual([0, 1, 2]);
        expect(finishClone).toMatchObject({ distance: 2, isVisited: true });
        expect(canonicalFinish).toMatchObject({ distance: 2, isVisited: true });
    });

    it('clears stale finish-clone state when the canonical finish is unreachable', () => {
        const grid = createGrid(1, 3, [[0, 1]]);
        const start = grid[0][0];
        const finishClone = {
            ...grid[0][2],
            distance: 1,
            isVisited: true,
            previousNode: start,
            isPath: true
        };

        search(grid, start, finishClone);

        expect(reconstruct(start, finishClone)).toEqual([]);
        expect(finishClone).toMatchObject({
            distance: Infinity,
            isVisited: false,
            previousNode: null,
            isPath: false
        });
    });

    it('does not traverse wall or blocked nodes', () => {
        const grid = createGrid(2, 3, [[0, 1]], [[1, 1]]);
        const start = grid[0][0];
        const finish = grid[0][2];

        search(grid, start, finish);

        expect(reconstruct(start, finish)).toEqual([]);
        expect(grid[0][1].isVisited).toBe(false);
        expect(grid[1][1].isVisited).toBe(false);
    });
});

function createGrid(rows, cols, walls = [], blocked = []) {
    const wallKeys = new Set(walls.map(point => point.join(',')));
    const blockedKeys = new Set(blocked.map(point => point.join(',')));

    return Array.from({ length: rows }, (_, row) => (
        Array.from({ length: cols }, (_, col) => ({
            row,
            col,
            isWall: wallKeys.has(`${row},${col}`),
            isBlocked: blockedKeys.has(`${row},${col}`),
            isVisited: false,
            distance: Infinity,
            previousNode: null,
            isPath: false
        }))
    ));
}
