import { describe, expect, it } from 'vitest';
import { allocateDeliveries } from './allocation';

describe('allocateDeliveries', () => {
    it('is deterministic by default and does not mutate caller data', () => {
        const deliveries = [
            { id: 'a', row: 0, col: 0 },
            { id: 'b', row: 0, col: 1 },
            { id: 'c', row: 0, col: 5 },
            { id: 'd', row: 0, col: 6 },
            { id: 'e', row: 0, col: 10 },
            { id: 'f', row: 0, col: 11 }
        ];
        const before = deliveries.map(node => ({ ...node }));

        const first = allocateDeliveries(deliveries, 2).map(cluster => cluster.map(node => node.id));
        const second = allocateDeliveries(deliveries, 2).map(cluster => cluster.map(node => node.id));

        expect(first).toEqual(second);
        expect(deliveries).toEqual(before);
    });

    it('repairs empty clusters whenever there are enough deliveries', () => {
        const deliveries = Array.from({ length: 5 }, (_, id) => ({ id, row: 4, col: 4 }));
        const clusters = allocateDeliveries(deliveries, 3);

        expect(clusters).toHaveLength(3);
        expect(clusters.every(cluster => cluster.length > 0)).toBe(true);
        expect(clusters.flat()).toHaveLength(deliveries.length);
        expect(new Set(clusters.flat()).size).toBe(deliveries.length);
    });

    it('returns one nonempty cluster per delivery when the fleet is larger', () => {
        const deliveries = [
            { row: 0, col: 0 },
            { row: 1, col: 1 }
        ];

        expect(allocateDeliveries(deliveries, 5)).toEqual([[deliveries[0]], [deliveries[1]]]);
    });

    it('validates the fleet and coordinate inputs', () => {
        expect(() => allocateDeliveries([], 0)).toThrow(RangeError);
        expect(() => allocateDeliveries(null, 1)).toThrow(TypeError);
        expect(() => allocateDeliveries([{ row: 0 }], 1)).toThrow(TypeError);
    });
});
