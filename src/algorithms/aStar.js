import { getAllNodes, updateUnvisitedNeighbors } from './algorithm';

export function aStar(grid, startNode, finishNode) {
    const visitedNodesInOrder = [];
    startNode.distance = 0;
    const unvisitedNodes = getAllNodes(grid);

    while (unvisitedNodes.length) {
        sortNodesByDistance(unvisitedNodes, finishNode);
        const closestNode = unvisitedNodes.shift();
        if (closestNode.isWall || closestNode.isBlocked) continue;
        if (closestNode.distance === Infinity) return visitedNodesInOrder;

        closestNode.isVisited = true;
        visitedNodesInOrder.push(closestNode);
        if (closestNode === finishNode) return visitedNodesInOrder;
        updateUnvisitedNeighbors(closestNode, grid);
    }
    return visitedNodesInOrder;
}

function manhattan(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function sortNodesByDistance(unvisitedNodes, finishNode) {
    unvisitedNodes.sort(
        (a, b) => (a.distance + manhattan(a, finishNode)) - (b.distance + manhattan(b, finishNode))
    );
}

export function getNodesInShortestPathOrderaStar(startNode, finishNode) {
    const nodesInShortestPathOrder = [];
    let currentNode = finishNode;
    while (currentNode !== null) {
        nodesInShortestPathOrder.unshift(currentNode);
        currentNode.isPath = true;
        currentNode = currentNode.previousNode;
    }
    return nodesInShortestPathOrder;
}
