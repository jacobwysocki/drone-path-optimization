// Performs Dijkstra's algorithm; returns *all* nodes in the order
// in which they were visited. Also makes nodes point back to their
// previous node, effectively allowing us to compute the shortest path
// by backtracking from the finish node.

import {getAllNodes, updateUnvisitedNeighbors} from './algorithm';

// Use these imported functions in your code.

export function aStar(grid, startNode, finishNode) {
    const visitedNodesInOrder = [];
    startNode.distance = 0;
    const unvisitedNodes = getAllNodes(grid);
    while (unvisitedNodes.length) {
        sortNodesByDistance(unvisitedNodes, finishNode);
        const closestNode = unvisitedNodes.shift();
        // If we encounter a wall, we skip it.
        if (closestNode.isWall===true || closestNode.isBlocked===true) continue;
        // If the closest node is at a distance of infinity,
        // we must be trapped and should therefore stop.
        if (closestNode.distance === Infinity) {
            setTimeout(function() {
                window.alert("No path found!");
            }, 0);
            return visitedNodesInOrder;
        }
        closestNode.isVisited = true;
        visitedNodesInOrder.push(closestNode);
        if (closestNode === finishNode) return visitedNodesInOrder;
        updateUnvisitedNeighbors(closestNode, grid);
        setTimeout(() => {
            for (const node of visitedNodesInOrder) {
                node.previousNode = node;
            }
        }, 1);
    }
}

function sortNodesByDistance(unvisitedNodes,finishNode) {
    unvisitedNodes.sort((nodeA, nodeB) => (nodeA.distance+Math.abs(finishNode.row-nodeA.row)+Math.abs(finishNode.col-nodeA.col))
        - (nodeB.distance+Math.abs(finishNode.row-nodeB.row)+Math.abs(finishNode.col-nodeB.col)));
}


export const getNewGridWithNodesFromShortestPathDisappear = (grid, row, col) => {
    if (row !== undefined && col !== undefined && grid !== undefined) {
        const newGrid = grid.slice();
        const node = newGrid[row][col];
        const newNode = {
            ...node,
            isShortestPath: !node.isShortestPath,
        };
        newGrid[row][col] = newNode;


        return newNode;
    }
};

export function getNodesInShortestPathOrderaStar(startNode, finishNode, grid) {
    const nodesInShortestPathOrder = [];
    let currentNode = finishNode;
    while (currentNode !== null) {
        nodesInShortestPathOrder.unshift(currentNode);
        currentNode.isPath = true;
        currentNode = currentNode.previousNode;

        const shortestArray = nodesInShortestPathOrder.map(node => [node.row, node.col]);
        const t = shortestArray.map(([row, col]) => {
            return (row, col); //
        });
        const newNode = getNewGridWithNodesFromShortestPathDisappear(grid, t[0][0], t[0][1]);
        console.log("path",newNode);
    }
    //console.log(shortestArray);

    // Destructure each element of shortestArray to separate variables



    console.log("nodesInShortestPathOrder", nodesInShortestPathOrder);
    return nodesInShortestPathOrder;
}

