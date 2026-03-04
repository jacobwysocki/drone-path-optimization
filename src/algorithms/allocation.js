export function allocateDeliveries(finishNodes, fleetSize) {
    if (fleetSize <= 1 || finishNodes.length <= fleetSize) {
        const clusters = Array.from({ length: Math.min(fleetSize, finishNodes.length) }, () => []);
        finishNodes.forEach((node, i) => {
            clusters[i % clusters.length].push(node);
        });
        return clusters;
    }

    // Initialize centroids randomly from finish nodes
    let centroids = [];
    const shuffled = [...finishNodes].sort(() => 0.5 - Math.random());
    centroids = shuffled.slice(0, fleetSize);

    let clusters = Array.from({ length: fleetSize }, () => []);
    let iterations = 0;
    let changed = true;

    function getDistance(nodeA, nodeB) {
        return Math.sqrt(Math.pow(nodeA.row - nodeB.row, 2) + Math.pow(nodeA.col - nodeB.col, 2));
    }

    while (changed && iterations < 100) {
        changed = false;
        const newClusters = Array.from({ length: fleetSize }, () => []);

        // Assign nodes to nearest centroid
        for (const node of finishNodes) {
            let minDistance = Infinity;
            let bestCluster = 0;
            for (let i = 0; i < fleetSize; i++) {
                const dist = getDistance(node, centroids[i]);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestCluster = i;
                }
            }
            newClusters[bestCluster].push(node);
        }

        // Check if clusters changed
        for (let i = 0; i < fleetSize; i++) {
            if (clusters[i].length !== newClusters[i].length) {
                changed = true;
            } else {
                for (let j = 0; j < clusters[i].length; j++) {
                    if (clusters[i][j].row !== newClusters[i][j].row || clusters[i][j].col !== newClusters[i][j].col) {
                        changed = true;
                    }
                }
            }
        }

        clusters = newClusters;

        // Update centroids
        for (let i = 0; i < fleetSize; i++) {
            if (clusters[i].length > 0) {
                const sumRow = clusters[i].reduce((sum, n) => sum + n.row, 0);
                const sumCol = clusters[i].reduce((sum, n) => sum + n.col, 0);
                centroids[i] = {
                    row: sumRow / clusters[i].length,
                    col: sumCol / clusters[i].length
                };
            }
        }
        iterations++;
    }

    return clusters;
}