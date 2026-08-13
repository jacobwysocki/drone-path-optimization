const DEFAULT_OPTIONS = Object.freeze({
    numAnts: 15,
    alpha: 1,
    beta: 2,
    evaporationRate: 0.5,
    iterations: 50,
    pheromoneDeposit: 100,
    epsilon: 1e-9,
    payloadLimit: Infinity,
    random: Math.random
});

export function optimizeRouteWithACO(startNode, destinations, optionsOrRandom = {}) {
    validateNode(startNode, 'startNode');
    if (!Array.isArray(destinations)) {
        throw new TypeError('destinations must be an array.');
    }

    destinations.forEach((node, index) => validateNode(node, `destinations[${index}]`));
    const options = normalizeOptions(optionsOrRandom);
    if (destinations.length <= 1) return [...destinations];

    const allNodes = [startNode, ...destinations];
    const numNodes = allNodes.length;
    const distances = createDistanceMatrix(allNodes);
    const pheromones = Array.from(
        { length: numNodes },
        () => Array(numNodes).fill(1)
    );

    let bestPath = Array.from({ length: numNodes }, (_, index) => index);
    let bestPathLength = multiTripTourLength(
        bestPath,
        distances,
        options.payloadLimit
    );

    for (let iteration = 0; iteration < options.iterations; iteration++) {
        const antTours = [];

        for (let ant = 0; ant < options.numAnts; ant++) {
            const path = buildTour(distances, pheromones, options);
            const length = multiTripTourLength(path, distances, options.payloadLimit);
            antTours.push({ path, length });

            if (
                length < bestPathLength ||
                (length === bestPathLength && lexicographicallyLess(path, bestPath))
            ) {
                bestPathLength = length;
                bestPath = [...path];
            }
        }

        evaporatePheromones(pheromones, options.evaporationRate, options.epsilon);
        depositPheromones(pheromones, antTours, options);
    }

    if (!bestPath) {
        return [...destinations];
    }

    return bestPath.slice(1).map(index => allNodes[index]);
}

function normalizeOptions(optionsOrRandom) {
    const supplied = typeof optionsOrRandom === 'function'
        ? { random: optionsOrRandom }
        : optionsOrRandom;

    if (!supplied || typeof supplied !== 'object') {
        throw new TypeError('ACO options must be an object or random function.');
    }

    const options = { ...DEFAULT_OPTIONS, ...supplied };
    validatePositiveInteger(options.numAnts, 'numAnts');
    validatePositiveInteger(options.iterations, 'iterations');
    validatePositiveNumber(options.alpha, 'alpha', true);
    validatePositiveNumber(options.beta, 'beta', true);
    validatePositiveNumber(options.pheromoneDeposit, 'pheromoneDeposit');
    validatePositiveNumber(options.epsilon, 'epsilon');
    validatePayloadLimit(options.payloadLimit);

    if (
        !Number.isFinite(options.evaporationRate) ||
        options.evaporationRate < 0 ||
        options.evaporationRate >= 1
    ) {
        throw new RangeError('evaporationRate must be in [0, 1).');
    }

    if (typeof options.random !== 'function') {
        throw new TypeError('random must be a function.');
    }

    return options;
}

function createDistanceMatrix(nodes) {
    return nodes.map(from => nodes.map(to => Math.hypot(
        from.row - to.row,
        from.col - to.col
    )));
}

function buildTour(distances, pheromones, options) {
    const visited = new Set([0]);
    const path = [0];

    while (visited.size < distances.length) {
        const deliveriesChosen = path.length - 1;
        const currentNode = (
            deliveriesChosen > 0 &&
            deliveriesChosen % options.payloadLimit === 0
        ) ? 0 : path[path.length - 1];
        const candidates = [];
        let totalWeight = 0;

        for (let index = 1; index < distances.length; index++) {
            if (visited.has(index)) continue;

            const safeDistance = Math.max(distances[currentNode][index], options.epsilon);
            const weight = (
                Math.pow(Math.max(pheromones[currentNode][index], options.epsilon), options.alpha) *
                Math.pow(1 / safeDistance, options.beta)
            );

            const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 0;
            candidates.push({ index, weight: safeWeight });
            totalWeight += safeWeight;
        }

        const nextNode = selectCandidate(candidates, totalWeight, options.random);
        path.push(nextNode);
        visited.add(nextNode);
    }

    return path;
}

function selectCandidate(candidates, totalWeight, random) {
    if (candidates.length === 0) {
        throw new Error('ACO could not select an unvisited destination.');
    }

    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
        return candidates[0].index;
    }

    const randomValue = random();
    const normalizedRandom = Number.isFinite(randomValue)
        ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
        : 0;
    let threshold = normalizedRandom * totalWeight;

    for (const candidate of candidates) {
        threshold -= candidate.weight;
        if (threshold <= 0) return candidate.index;
    }

    return candidates[candidates.length - 1].index;
}

function multiTripTourLength(path, distances, payloadLimit) {
    let length = 0;
    forEachTripEdge(path, payloadLimit, (from, to) => {
        length += distances[from][to];
    });
    return length;
}

function evaporatePheromones(pheromones, evaporationRate, epsilon) {
    for (let i = 0; i < pheromones.length; i++) {
        for (let j = 0; j < pheromones.length; j++) {
            pheromones[i][j] = Math.max(
                epsilon,
                pheromones[i][j] * (1 - evaporationRate)
            );
        }
    }
}

function depositPheromones(pheromones, antTours, options) {
    for (const { path, length } of antTours) {
        const deposit = options.pheromoneDeposit / Math.max(length, options.epsilon);

        forEachTripEdge(path, options.payloadLimit, (from, to) => {
            pheromones[from][to] += deposit;
            pheromones[to][from] += deposit;
        });
    }
}

function forEachTripEdge(path, payloadLimit, visit) {
    let previous = 0;
    let deliveriesInBatch = 0;

    for (let index = 1; index < path.length; index++) {
        const destination = path[index];
        visit(previous, destination);
        previous = destination;
        deliveriesInBatch++;

        if (deliveriesInBatch === payloadLimit || index === path.length - 1) {
            visit(previous, 0);
            previous = 0;
            deliveriesInBatch = 0;
        }
    }
}

function lexicographicallyLess(path, incumbent) {
    if (!incumbent) return true;
    for (let i = 0; i < path.length; i++) {
        if (path[i] !== incumbent[i]) return path[i] < incumbent[i];
    }
    return false;
}

function validateNode(node, label) {
    if (!node || !Number.isFinite(node.row) || !Number.isFinite(node.col)) {
        throw new TypeError(`${label} must have finite row and col coordinates.`);
    }
}

function validatePositiveInteger(value, label) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new RangeError(`${label} must be a positive integer.`);
    }
}

function validatePayloadLimit(value) {
    if (value !== Infinity && (!Number.isInteger(value) || value <= 0)) {
        throw new RangeError('payloadLimit must be a positive integer or Infinity.');
    }
}

function validatePositiveNumber(value, label, allowZero = false) {
    if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
        throw new RangeError(`${label} must be ${allowZero ? 'non-negative' : 'positive'}.`);
    }
}
