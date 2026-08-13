export function updateUnvisitedNeighbors(node, grid) {
    const unvisitedNeighbors = getUnvisitedNeighbors(node, grid);
    const updatedNeighbors = [];

    for (const neighbor of unvisitedNeighbors) {
        const tentativeDistance = node.distance + 1;
        if (tentativeDistance < neighbor.distance) {
            neighbor.distance = tentativeDistance;
            neighbor.previousNode = node;
            updatedNeighbors.push(neighbor);
        }
    }

    return updatedNeighbors;
}

export function getUnvisitedNeighbors(node, grid) {
    if (!isRectangularGrid(grid) || !node) return [];

    const neighbors = [];
    const {col, row} = node;
    if (
        !Number.isInteger(row) ||
        !Number.isInteger(col) ||
        row < 0 ||
        row >= grid.length ||
        col < 0 ||
        col >= grid[0].length
    ) {
        return neighbors;
    }

    if (row > 0) neighbors.push(grid[row - 1][col]);
    if (row < grid.length - 1) neighbors.push(grid[row + 1][col]);
    if (col > 0) neighbors.push(grid[row][col - 1]);
    if (col < grid[0].length - 1) neighbors.push(grid[row][col + 1]);
    return neighbors.filter(neighbor => (
        neighbor &&
        !neighbor.isVisited &&
        !neighbor.isWall &&
        !neighbor.isBlocked
    ));
}

export function getAllNodes(grid) {
    if (!isRectangularGrid(grid)) return [];

    const nodes = [];
    for (const row of grid) {
        for (const node of row) {
            nodes.push(node);
        }
    }
    return nodes;
}

export function isRectangularGrid(grid) {
    return (
        Array.isArray(grid) &&
        grid.length > 0 &&
        Array.isArray(grid[0]) &&
        grid[0].length > 0 &&
        grid.every(row => Array.isArray(row) && row.length === grid[0].length)
    );
}

export function getGridNode(grid, node) {
    if (!isRectangularGrid(grid) || !node) return null;
    if (!Number.isInteger(node.row) || !Number.isInteger(node.col)) return null;
    return grid[node.row]?.[node.col] || null;
}

export function sameGridPosition(a, b) {
    return Boolean(a && b && a.row === b.row && a.col === b.col);
}

export function isTraversable(node) {
    return Boolean(node && !node.isWall && !node.isBlocked);
}

export function prepareGridForSearch(grid) {
    const nodes = getAllNodes(grid);
    for (const node of nodes) {
        node.distance = Infinity;
        node.isVisited = false;
        node.previousNode = null;
        node.isPath = false;
    }
    return nodes;
}

export function synchronizeSearchNode(node, canonicalNode) {
    if (!node || !canonicalNode || node === canonicalNode) return;

    node.distance = canonicalNode.distance;
    node.isVisited = canonicalNode.isVisited;
    node.previousNode = canonicalNode.previousNode;
    node.isPath = canonicalNode.isPath;
}

export function reconstructShortestPath(startNode, finishNode) {
    if (!startNode || !finishNode) return [];

    if (sameGridPosition(startNode, finishNode)) {
        finishNode.isPath = true;
        return [finishNode];
    }

    if (!finishNode.isVisited || !Number.isFinite(finishNode.distance)) return [];

    const reversedPath = [];
    const seen = new Set();
    let currentNode = finishNode;

    while (currentNode) {
        if (seen.has(currentNode)) return [];
        seen.add(currentNode);
        reversedPath.push(currentNode);

        if (sameGridPosition(currentNode, startNode)) {
            reversedPath.reverse();
            for (const node of reversedPath) node.isPath = true;
            return reversedPath;
        }

        currentNode = currentNode.previousNode;
    }

    return [];
}
