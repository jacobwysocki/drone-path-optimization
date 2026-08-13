import { describe, expect, it } from 'vitest';
import { optimizeRouteWithACO } from './aco';

describe('optimizeRouteWithACO', () => {
    it('selects the better closed depot-return tour, not the shorter open path', () => {
        const start = { id: 'S', row: 0, col: 0 };
        const destinations = [
            { id: 'A', row: 0, col: 1 },
            { id: 'B', row: 0, col: 3 },
            { id: 'C', row: 1, col: 0 }
        ];
        const values = [0.9, 0, 0, 0, 0, 0];
        let index = 0;

        const route = optimizeRouteWithACO(start, destinations, {
            iterations: 1,
            numAnts: 2,
            random: () => values[index++ % values.length]
        });

        expect(route.map(node => node.id)).toEqual(['A', 'B', 'C']);
        expect(closedLength(start, route)).toBeLessThan(closedLength(start, [
            destinations[2], destinations[0], destinations[1]
        ]));
    });

    it('scores depot returns at payload boundaries in the 12-versus-10 counterexample', () => {
        const start = { id: 'S', row: 0, col: 0 };
        const destinations = [
            { id: 'A', row: 0, col: 1 },
            { id: 'B', row: 0, col: 2 },
            { id: 'C', row: 0, col: 3 },
            { id: 'D', row: 1, col: 0 }
        ];
        const values = [0, 0, 0, 0, 0, 0.9, 0, 0];
        let index = 0;

        const route = optimizeRouteWithACO(start, destinations, {
            iterations: 1,
            numAnts: 2,
            payloadLimit: 2,
            random: () => values[index++]
        });

        expect(gridTripLength(start, destinations, 2)).toBe(12);
        expect(route.map(node => node.id)).toEqual(['A', 'D', 'B', 'C']);
        expect(gridTripLength(start, route, 2)).toBe(10);
    });

    it('never returns a route worse than the caller supplied order', () => {
        const start = { id: 'S', row: 0, col: 0 };
        const destinations = [
            { id: 'A', row: 0, col: 1 },
            { id: 'B', row: 0, col: 3 },
            { id: 'C', row: 1, col: 0 }
        ];
        const values = [0.999, 0, 0];
        let index = 0;

        const route = optimizeRouteWithACO(start, destinations, {
            iterations: 1,
            numAnts: 1,
            random: () => values[index++]
        });

        expect(closedLength(start, route)).toBeLessThanOrEqual(
            closedLength(start, destinations)
        );
        expect(route.map(node => node.id)).toEqual(['A', 'B', 'C']);
    });

    it('handles zero-distance pairs and returns every destination exactly once', () => {
        const start = { row: 0, col: 0 };
        const destinations = [
            { id: 1, row: 0, col: 0 },
            { id: 2, row: 0, col: 0 },
            { id: 3, row: 1, col: 0 }
        ];

        const route = optimizeRouteWithACO(start, destinations, {
            random: () => 0.5,
            iterations: 3,
            numAnts: 3
        });

        expect(route).toHaveLength(destinations.length);
        expect(new Set(route)).toEqual(new Set(destinations));
    });

    it('supports a random function as the legacy-compatible third argument', () => {
        const destinations = [
            { id: 1, row: 0, col: 1 },
            { id: 2, row: 1, col: 0 }
        ];

        expect(optimizeRouteWithACO({ row: 0, col: 0 }, destinations, () => 0))
            .toHaveLength(2);
    });

    it('validates nodes and options without mutating the destination array', () => {
        const destinations = [
            { row: 0, col: 1 },
            { row: 1, col: 0 }
        ];
        const before = [...destinations];

        optimizeRouteWithACO({ row: 0, col: 0 }, destinations, { random: () => 0 });
        expect(destinations).toEqual(before);
        expect(() => optimizeRouteWithACO(null, destinations)).toThrow(TypeError);
        expect(() => optimizeRouteWithACO({ row: 0, col: 0 }, null)).toThrow(TypeError);
        expect(() => optimizeRouteWithACO(
            { row: 0, col: 0 },
            destinations,
            { iterations: 0 }
        )).toThrow(RangeError);
        expect(() => optimizeRouteWithACO(
            { row: 0, col: 0 },
            destinations,
            { payloadLimit: 0 }
        )).toThrow(RangeError);
        expect(() => optimizeRouteWithACO(
            { row: 0, col: 0 },
            destinations,
            { payloadLimit: 1.5 }
        )).toThrow(RangeError);
        expect(optimizeRouteWithACO(
            { row: 0, col: 0 },
            destinations,
            { payloadLimit: Infinity, random: () => 0 }
        )).toHaveLength(2);
    });
});

function closedLength(start, route) {
    let previous = start;
    let length = 0;
    for (const node of route) {
        length += Math.hypot(previous.row - node.row, previous.col - node.col);
        previous = node;
    }
    return length + Math.hypot(previous.row - start.row, previous.col - start.col);
}

function gridTripLength(start, route, payloadLimit) {
    let length = 0;

    for (let index = 0; index < route.length; index += payloadLimit) {
        let previous = start;
        for (const node of route.slice(index, index + payloadLimit)) {
            length += Math.abs(previous.row - node.row) + Math.abs(previous.col - node.col);
            previous = node;
        }
        length += Math.abs(previous.row - start.row) + Math.abs(previous.col - start.col);
    }

    return length;
}
