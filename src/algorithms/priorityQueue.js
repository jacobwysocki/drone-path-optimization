export class MinPriorityQueue {
    constructor(compare = (a, b) => a - b) {
        if (typeof compare !== 'function') {
            throw new TypeError('MinPriorityQueue requires a comparison function.');
        }

        this.compare = compare;
        this.heap = [];
    }

    get size() {
        return this.heap.length;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    peek() {
        return this.heap[0];
    }

    push(value) {
        this.heap.push(value);
        this.bubbleUp(this.heap.length - 1);
        return this;
    }

    pop() {
        if (this.heap.length === 0) return undefined;
        if (this.heap.length === 1) return this.heap.pop();

        const minimum = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.sinkDown(0);
        return minimum;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.compare(this.heap[index], this.heap[parentIndex]) >= 0) break;

            [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
            index = parentIndex;
        }
    }

    sinkDown(index) {
        while (true) {
            const leftIndex = index * 2 + 1;
            const rightIndex = leftIndex + 1;
            let smallestIndex = index;

            if (
                leftIndex < this.heap.length &&
                this.compare(this.heap[leftIndex], this.heap[smallestIndex]) < 0
            ) {
                smallestIndex = leftIndex;
            }

            if (
                rightIndex < this.heap.length &&
                this.compare(this.heap[rightIndex], this.heap[smallestIndex]) < 0
            ) {
                smallestIndex = rightIndex;
            }

            if (smallestIndex === index) break;

            [this.heap[index], this.heap[smallestIndex]] = [this.heap[smallestIndex], this.heap[index]];
            index = smallestIndex;
        }
    }
}
