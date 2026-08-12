import {
    getGridNode,
    isTraversable,
    prepareGridForSearch,
    reconstructShortestPath,
    sameGridPosition,
    synchronizeSearchNode,
    updateUnvisitedNeighbors
} from './algorithm';
import { MinPriorityQueue } from './priorityQueue';

export function aStar(grid, startNode, finishNode) {
    const visitedNodesInOrder = [];
    prepareGridForSearch(grid);

    const canonicalStart = getGridNode(grid, startNode);
    const canonicalFinish = getGridNode(grid, finishNode);
    if (!canonicalStart || !canonicalFinish) return visitedNodesInOrder;
    synchronizeSearchNode(finishNode, canonicalFinish);

    canonicalStart.distance = 0;

    if (sameGridPosition(canonicalStart, canonicalFinish)) {
        canonicalStart.isVisited = true;
        visitedNodesInOrder.push(canonicalStart);
        synchronizeSearchNode(finishNode, canonicalFinish);
        return visitedNodesInOrder;
    }

    if (!isTraversable(canonicalStart) || !isTraversable(canonicalFinish)) {
        return visitedNodesInOrder;
    }

    let sequence = 0;
    const openSet = new MinPriorityQueue((a, b) => (
        a.f - b.f ||
        a.h - b.h ||
        a.sequence - b.sequence
    ));

    const startHeuristic = manhattan(canonicalStart, canonicalFinish);
    openSet.push({
        node: canonicalStart,
        g: 0,
        h: startHeuristic,
        f: startHeuristic,
        sequence: sequence++
    });

    while (!openSet.isEmpty()) {
        const entry = openSet.pop();
        const closestNode = entry.node;

        if (closestNode.isVisited || entry.g !== closestNode.distance) continue;

        closestNode.isVisited = true;
        visitedNodesInOrder.push(closestNode);
        if (sameGridPosition(closestNode, canonicalFinish)) {
            synchronizeSearchNode(finishNode, canonicalFinish);
            return visitedNodesInOrder;
        }

        const updatedNeighbors = updateUnvisitedNeighbors(closestNode, grid);
        for (const neighbor of updatedNeighbors) {
            const h = manhattan(neighbor, canonicalFinish);
            openSet.push({
                node: neighbor,
                g: neighbor.distance,
                h,
                f: neighbor.distance + h,
                sequence: sequence++
            });
        }
    }

    return visitedNodesInOrder;
}

function manhattan(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

export function getNodesInShortestPathOrderAStar(startNode, finishNode) {
    return reconstructShortestPath(startNode, finishNode);
}
