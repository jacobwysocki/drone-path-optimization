export class ReservationTable {
    constructor() {
        this.reservations = new Set();
    }

    reserve(row, col, z, time) {
        this.reservations.add(`${row},${col},${z},${time}`);
    }

    reserveEdge(r1, c1, z1, r2, c2, z2, time) {
        this.reservations.add(`${r1},${c1},${z1}-${r2},${c2},${z2},${time}`);
    }

    isReserved(row, col, z, time) {
        return this.reservations.has(`${row},${col},${z},${time}`);
    }

    isEdgeReserved(r1, c1, z1, r2, c2, z2, time) {
        return this.reservations.has(`${r2},${c2},${z2}-${r1},${c1},${z1},${time}`);
    }
}

export function cooperativeAStar(grid, startNode, finishNode, startTime, reservationTable) {
    const openSet = [];
    const maxZ = 15; // Drones can fly up to 15 units high

    const startZ = startNode.z || 0;
    const finishZ = finishNode.z || 0;

    const startState = {
        row: startNode.row,
        col: startNode.col,
        z: startZ,
        time: startTime,
        g: 0,
        h: Math.abs(startNode.row - finishNode.row) + Math.abs(startNode.col - finishNode.col) + Math.abs(startZ - finishZ),
        f: 0,
        parent: null
    };
    startState.f = startState.g + startState.h;
    openSet.push(startState);
    
    const visited = new Set();
    const visitedNodesInOrder = [];
    
    let maxIterations = 50000; // Cap to prevent lag
    
    while (openSet.length > 0 && maxIterations > 0) {
        maxIterations--;
        
        let minIdx = 0;
        for (let i = 1; i < openSet.length; i++) {
            if (openSet[i].f < openSet[minIdx].f) minIdx = i;
        }
        const current = openSet.splice(minIdx, 1)[0];
        
        const stateKey = `${current.row},${current.col},${current.z},${Math.floor(current.time)}`;
        if (visited.has(stateKey)) continue;
        visited.add(stateKey);
        
        // Add to visited nodes (for visualization)
        const vNode = { row: current.row, col: current.col, z: current.z, isWall: false, isStart: false, isFinish: false };
        if (!visitedNodesInOrder.some(n => n.row === vNode.row && n.col === vNode.col && n.z === vNode.z)) {
            visitedNodesInOrder.push(vNode);
        }
        
        if (current.row === finishNode.row && current.col === finishNode.col && current.z === finishZ) {
            const path = [];
            let curr = current;
            while (curr !== null) {
                path.unshift({row: curr.row, col: curr.col, z: curr.z});
                curr = curr.parent;
            }
            return { visitedNodesInOrder, path, endTime: Math.ceil(current.time) };
        }
        
        const neighbors = [];
        // Action: Wait in place
        neighbors.push({ row: current.row, col: current.col, z: current.z });
        
        // Action: Move
        const dirs = [
            [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], // Horizontal
            [0, 0, -1], [0, 0, 1] // Vertical (Z)
        ];
        
        for (const [dr, dc, dz] of dirs) {
            const nr = current.row + dr;
            const nc = current.col + dc;
            const nz = current.z + dz;
            
            // Check grid bounds
            if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length && nz >= 0 && nz <= maxZ) {
                // Use the dynamic wallHeight from the grid node
                const isWall = grid[nr][nc].isWall;
                const buildingHeight = isWall ? (grid[nr][nc].wallHeight || 2) : -1;
                
                if (nz > buildingHeight) {
                    neighbors.push({ row: nr, col: nc, z: nz });
                }
            }
        }
        
        for (const n of neighbors) {
            let moveCost = 1;
            const dz = n.z - current.z;

            if (dz > 0) {
                moveCost = 2.0; // Climb
            } else if (dz < 0) {
                moveCost = 0.5; // Descend
            }
            
            const nextTime = current.time + moveCost;
            const checkTime = Math.ceil(nextTime);
            
            // Check vertex collision
            if (reservationTable.isReserved(n.row, n.col, n.z, checkTime)) {
                continue;
            }
            
            // Check edge collision
            if (n.row !== current.row || n.col !== current.col || n.z !== current.z) {
                if (reservationTable.isEdgeReserved(current.row, current.col, current.z, n.row, n.col, n.z, Math.floor(current.time))) {
                    continue;
                }
            }
            
            const g = current.g + moveCost; 
            const h = Math.abs(n.row - finishNode.row) + Math.abs(n.col - finishNode.col) + Math.abs(n.z - finishZ);
            
            openSet.push({
                row: n.row,
                col: n.col,
                z: n.z,
                time: nextTime,
                g,
                h,
                f: g + h,
                parent: current
            });
        }
    }
    
    return { visitedNodesInOrder, path: [], endTime: Math.ceil(startTime) };
}
