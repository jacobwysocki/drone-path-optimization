import { getAllNodes, getUnvisitedNeighbors, updateUnvisitedNeighbors } from './algorithm';

export function dijkstra(grid, startNode, finishNode) {
    const visitedNodesInOrder = [];
    startNode.distance = 0;
    const unvisitedNodes = getAllNodes(grid);

    while (unvisitedNodes.length) {
        sortNodesByDistance(unvisitedNodes);
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

function sortNodesByDistance(unvisitedNodes) {
    unvisitedNodes.sort((a, b) => a.distance - b.distance);
}

export function getNodesInShortestPathOrder(startNode, finishNode) {
    const nodesInShortestPathOrder = [];
    let currentNode = finishNode;
    while (currentNode !== null) {
        currentNode.isPath = true;
        nodesInShortestPathOrder.unshift(currentNode);
        currentNode = currentNode.previousNode;
    }
    return nodesInShortestPathOrder;
}

export { getUnvisitedNeighbors };
