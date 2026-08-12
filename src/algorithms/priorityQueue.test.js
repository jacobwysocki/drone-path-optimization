import { describe, expect, it } from 'vitest';
import { MinPriorityQueue } from './priorityQueue';

describe('MinPriorityQueue', () => {
    it('pops values in comparator order', () => {
        const queue = new MinPriorityQueue((a, b) => a.priority - b.priority);
        queue.push({ id: 'third', priority: 3 });
        queue.push({ id: 'first', priority: 1 });
        queue.push({ id: 'second', priority: 2 });

        expect(queue.size).toBe(3);
        expect(queue.pop().id).toBe('first');
        expect(queue.pop().id).toBe('second');
        expect(queue.pop().id).toBe('third');
        expect(queue.pop()).toBeUndefined();
        expect(queue.isEmpty()).toBe(true);
    });

    it('handles duplicate priorities without losing entries', () => {
        const queue = new MinPriorityQueue((a, b) => a.priority - b.priority);
        queue.push({ id: 1, priority: 1 });
        queue.push({ id: 2, priority: 1 });
        queue.push({ id: 3, priority: 1 });

        expect([queue.pop().id, queue.pop().id, queue.pop().id].sort()).toEqual([1, 2, 3]);
    });
});
