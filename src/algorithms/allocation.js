const MAX_ITERATIONS = 100;

export function allocateDeliveries(finishNodes, fleetSize) {
    validateInputs(finishNodes, fleetSize);

    if (finishNodes.length === 0) return [];

    const clusterCount = Math.min(fleetSize, finishNodes.length);
    if (clusterCount === finishNodes.length) {
        return finishNodes.map(node => [node]);
    }

    const indexedNodes = finishNodes.map((node, index) => ({ node, index }));
    let centroids = initializeCentroids(indexedNodes, clusterCount);
    let previousSignature = null;
    let clusters = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        clusters = assignToCentroids(indexedNodes, centroids);
        repairEmptyClusters(clusters, centroids);

        const signature = clusterSignature(clusters, finishNodes.length);
        centroids = clusters.map(calculateCentroid);

        if (signature === previousSignature) break;
        previousSignature = signature;
    }

    return clusters.map(cluster => cluster.map(item => item.node));
}

function validateInputs(finishNodes, fleetSize) {
    if (!Array.isArray(finishNodes)) {
        throw new TypeError('finishNodes must be an array.');
    }

    if (!Number.isInteger(fleetSize) || fleetSize <= 0) {
        throw new RangeError('fleetSize must be a positive integer.');
    }

    finishNodes.forEach((node, index) => {
        if (!isCoordinateNode(node)) {
            throw new TypeError(`finishNodes[${index}] must have finite row and col coordinates.`);
        }
    });
}

function isCoordinateNode(node) {
    return Boolean(node && Number.isFinite(node.row) && Number.isFinite(node.col));
}

function initializeCentroids(indexedNodes, clusterCount) {
    const centroids = [copyCoordinates(indexedNodes[0].node)];
    const selectedIndices = new Set([indexedNodes[0].index]);

    while (centroids.length < clusterCount) {
        let bestItem = null;
        let bestDistance = -1;

        for (const item of indexedNodes) {
            if (selectedIndices.has(item.index)) continue;

            let nearestDistance = Infinity;
            for (const centroid of centroids) {
                nearestDistance = Math.min(
                    nearestDistance,
                    squaredDistance(item.node, centroid)
                );
            }

            if (
                bestItem === null ||
                nearestDistance > bestDistance ||
                (nearestDistance === bestDistance && item.index < bestItem.index)
            ) {
                bestItem = item;
                bestDistance = nearestDistance;
            }
        }

        selectedIndices.add(bestItem.index);
        centroids.push(copyCoordinates(bestItem.node));
    }

    return centroids;
}

function assignToCentroids(indexedNodes, centroids) {
    const clusters = Array.from({ length: centroids.length }, () => []);

    for (const item of indexedNodes) {
        let bestCluster = 0;
        let bestDistance = squaredDistance(item.node, centroids[0]);

        for (let i = 1; i < centroids.length; i++) {
            const distance = squaredDistance(item.node, centroids[i]);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestCluster = i;
            }
        }

        clusters[bestCluster].push(item);
    }

    return clusters;
}

function repairEmptyClusters(clusters, centroids) {
    for (let emptyIndex = 0; emptyIndex < clusters.length; emptyIndex++) {
        if (clusters[emptyIndex].length > 0) continue;

        let donorClusterIndex = -1;
        let donorItemIndex = -1;
        let largestError = -1;
        let largestOriginalIndex = -1;

        for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex++) {
            if (clusters[clusterIndex].length <= 1) continue;

            for (let itemIndex = 0; itemIndex < clusters[clusterIndex].length; itemIndex++) {
                const item = clusters[clusterIndex][itemIndex];
                const error = squaredDistance(item.node, centroids[clusterIndex]);

                if (
                    error > largestError ||
                    (error === largestError && item.index > largestOriginalIndex)
                ) {
                    donorClusterIndex = clusterIndex;
                    donorItemIndex = itemIndex;
                    largestError = error;
                    largestOriginalIndex = item.index;
                }
            }
        }

        if (donorClusterIndex === -1) {
            throw new Error('Unable to repair an empty delivery cluster.');
        }

        const [donorItem] = clusters[donorClusterIndex].splice(donorItemIndex, 1);
        clusters[emptyIndex].push(donorItem);
    }
}

function calculateCentroid(cluster) {
    const totals = cluster.reduce((sum, item) => ({
        row: sum.row + item.node.row,
        col: sum.col + item.node.col
    }), { row: 0, col: 0 });

    return {
        row: totals.row / cluster.length,
        col: totals.col / cluster.length
    };
}

function clusterSignature(clusters, nodeCount) {
    const assignments = Array(nodeCount).fill(-1);
    clusters.forEach((cluster, clusterIndex) => {
        cluster.forEach(item => {
            assignments[item.index] = clusterIndex;
        });
    });
    return assignments.join(',');
}

function squaredDistance(a, b) {
    const rowDifference = a.row - b.row;
    const colDifference = a.col - b.col;
    return rowDifference * rowDifference + colDifference * colDifference;
}

function copyCoordinates(node) {
    return { row: node.row, col: node.col };
}
