import {
    getGridNode,
    getUnvisitedNeighbors,
    isTraversable,
    prepareGridForSearch,
    reconstructShortestPath,
    sameGridPosition,
    synchronizeSearchNode,
    updateUnvisitedNeighbors
} from './algorithm';
import { MinPriorityQueue } from './priorityQueue';

export function dijkstra(grid, startNode, finishNode) {
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
    const unvisitedNodes = new MinPriorityQueue((a, b) => (
        a.distance - b.distance || a.sequence - b.sequence
    ));
    unvisitedNodes.push({ node: canonicalStart, distance: 0, sequence: sequence++ });

    while (!unvisitedNodes.isEmpty()) {
        const entry = unvisitedNodes.pop();
        const closestNode = entry.node;

        if (closestNode.isVisited || entry.distance !== closestNode.distance) continue;

        closestNode.isVisited = true;
        visitedNodesInOrder.push(closestNode);
        if (sameGridPosition(closestNode, canonicalFinish)) {
            synchronizeSearchNode(finishNode, canonicalFinish);
            return visitedNodesInOrder;
        }

        const updatedNeighbors = updateUnvisitedNeighbors(closestNode, grid);
        for (const neighbor of updatedNeighbors) {
            unvisitedNodes.push({
                node: neighbor,
                distance: neighbor.distance,
                sequence: sequence++
            });
        }
    }

    return visitedNodesInOrder;
}

export function getNodesInShortestPathOrder(startNode, finishNode) {
    return reconstructShortestPath(startNode, finishNode);
}

export { getUnvisitedNeighbors };
