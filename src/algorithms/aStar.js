// Performs Dijkstra's algorithm; returns *all* nodes in the order
// in which they were visited. Also makes nodes point back to their
// previous node, effectively allowing us to compute the shortest path
// by backtracking from the finish node.
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

function updateUnvisitedNeighbors(node, grid) {
    const unvisitedNeighbors = getUnvisitedNeighbors(node, grid);
    for (const neighbor of unvisitedNeighbors) {
        neighbor.distance = node.distance + 1;
        neighbor.previousNode = node;
    }
}

function getUnvisitedNeighbors(node, grid) {
    const neighbors = [];
    const {col, row} = node;
    if (row > 0) neighbors.push(grid[row - 1][col]);
    if (row < grid.length - 1) neighbors.push(grid[row + 1][col]);
    if (col > 0) neighbors.push(grid[row][col - 1]);
    if (col < grid[0].length - 1) neighbors.push(grid[row][col + 1]);
    return neighbors.filter(neighbor => !neighbor.isVisited);
}

function getAllNodes(grid) {
    const nodes = [];
    for (const row of grid) {
        for (const node of row) {
            nodes.push(node);
        }
    }
    return nodes;
}

// Backtracks from the finishNode to find the shortest path.
// Only works when called *after* the dijkstra method above.

function someFunction(row, col) {
    // Do something with the row and col values
    // Return some result
    //console.log(row, col);
    return [row, col];
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


        //console.log("t " + newNode.col + " " + newNode.row);


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

