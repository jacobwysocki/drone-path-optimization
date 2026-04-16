// Ant Colony Optimization for solving the Traveling Salesperson Problem (routing order)
// This algorithm determines the optimal sequence of deliveries for a drone.

export function optimizeRouteWithACO(startNode, destinations) {
    if (!destinations || destinations.length <= 1) return destinations;

    const allNodes = [startNode, ...destinations];
    const numNodes = allNodes.length;
    
    // Parameters for ACO
    const numAnts = 15;
    const alpha = 1.0; // Pheromone importance
    const beta = 2.0;  // Distance importance (heuristic)
    const evaporationRate = 0.5;
    const iterations = 50;
    const Q = 100; // Pheromone deposit factor

    // Initialize distances and pheromones
    const distances = Array.from({ length: numNodes }, () => Array(numNodes).fill(0));
    const pheromones = Array.from({ length: numNodes }, () => Array(numNodes).fill(1)); // Initial pheromone is 1

    for (let i = 0; i < numNodes; i++) {
        for (let j = 0; j < numNodes; j++) {
            if (i !== j) {
                // Euclidean distance for heuristic
                const dist = Math.sqrt(Math.pow(allNodes[i].row - allNodes[j].row, 2) + Math.pow(allNodes[i].col - allNodes[j].col, 2));
                distances[i][j] = dist;
            }
        }
    }

    let bestPath = null;
    let bestPathLength = Infinity;

    for (let iter = 0; iter < iterations; iter++) {
        const allAntPaths = [];
        const allAntLengths = [];

        for (let ant = 0; ant < numAnts; ant++) {
            const visited = new Set([0]); // Start at index 0 (startNode)
            const path = [0];
            let pathLength = 0;
            let currentNode = 0;

            while (visited.size < numNodes) {
                const probabilities = [];
                let probabilitiesSum = 0;

                for (let i = 0; i < numNodes; i++) {
                    if (!visited.has(i)) {
                        const tau = Math.pow(pheromones[currentNode][i], alpha);
                        const eta = Math.pow(1.0 / distances[currentNode][i], beta);
                        const prob = tau * eta;
                        probabilities.push({ node: i, prob: prob });
                        probabilitiesSum += prob;
                    }
                }

                // Roulette wheel selection
                let randomValue = Math.random() * probabilitiesSum;
                let nextNode = -1;
                for (const p of probabilities) {
                    randomValue -= p.prob;
                    if (randomValue <= 0) {
                        nextNode = p.node;
                        break;
                    }
                }
                
                // Fallback in case of precision issues
                if (nextNode === -1) nextNode = probabilities[probabilities.length - 1].node;

                path.push(nextNode);
                visited.add(nextNode);
                pathLength += distances[currentNode][nextNode];
                currentNode = nextNode;
            }

            allAntPaths.push(path);
            allAntLengths.push(pathLength);

            if (pathLength < bestPathLength) {
                bestPathLength = pathLength;
                bestPath = [...path];
            }
        }

        // Pheromone evaporation
        for (let i = 0; i < numNodes; i++) {
            for (let j = 0; j < numNodes; j++) {
                pheromones[i][j] *= (1.0 - evaporationRate);
            }
        }

        // Pheromone deposit
        for (let a = 0; a < numAnts; a++) {
            const path = allAntPaths[a];
            const length = allAntLengths[a];
            const deposit = Q / length;

            for (let i = 0; i < path.length - 1; i++) {
                const from = path[i];
                const to = path[i + 1];
                pheromones[from][to] += deposit;
                pheromones[to][from] += deposit; // Assuming symmetric distances
            }
        }
    }

    // Convert bestPath indices back to destination nodes (excluding the start node at index 0)
    const optimizedDestinations = [];
    for (let i = 1; i < bestPath.length; i++) { // Skip index 0 (startNode)
        optimizedDestinations.push(allNodes[bestPath[i]]);
    }

    return optimizedDestinations;
}
