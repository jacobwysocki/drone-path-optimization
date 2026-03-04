import React, { Component, useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Box, Sphere, Line, Text, Stars, Instance, Instances, Grid, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

import { dijkstra, getNodesInShortestPathOrder } from '../algorithms/dijkstra';
import { aStar, getNodesInShortestPathOrderaStar } from '../algorithms/aStar';
import { cooperativeAStar, ReservationTable } from '../algorithms/cooperativeAStar';
import { allocateDeliveries } from '../algorithms/allocation';
import { optimizeRouteWithACO } from '../algorithms/aco';
import Button from 'react-bootstrap/Button';
import ReactMarkdown from 'react-markdown';
import { wikiMarkdown } from '../wikiContent';
import './visualization.css';

const GRID_ROWS = 20;
const GRID_COLS = 50;

const startNodeRow = 6;
const startNodeCol = 7;

const DRONE_COLORS = ['#8A2BE2', '#29FF60', '#FF9629', '#FF2929', '#FFFF29', '#29FFFF', '#FF29FF'];

const getInitialGrid = () => {
    const grid = [];
    for (let row = 0; row < GRID_ROWS; row++) {
        const currentRow = [];
        for (let col = 0; col < GRID_COLS; col++) {
            currentRow.push(createNode(col, row));
        }
        grid.push(currentRow);
    }
    return grid;
};

const createNode = (col, row) => {
    return {
        col,
        row,
        z: 0,
        isStart: row === startNodeRow && col === startNodeCol,
        isFinish: false, // Initially false, will be set randomly
        distance: Infinity,
        isVisited: false,
        isWall: false,
        previousNode: null,
        isPath: false,
        isBlocked: false
    };
};

function Drone({ path, color, isMoving, onFinish }) {
    const ref = useRef();
    const bobRef = useRef();
    const progressRef = useRef(0);
    const hasFinished = useRef(false);
    const batteryRef = useRef();

    const speed = 4.0;
    const scale = 1.0;
    const maxBattery = 150;

    const totalEnergy = React.useMemo(() => {
        if (!path || path.length === 0) return 0;
        let energy = 0;
        for (let i = 1; i < path.length; i++) {
            const prev = path[i-1];
            const curr = path[i];
            const dz = curr.z - prev.z;
            
            let moveCost = 1.0; // Base horizontal move
            if (dz > 0) moveCost = 2.0; // Climb
            else if (dz < 0) moveCost = 0.5; // Descend

            energy += moveCost;
        }
        return energy;
    }, [path]);

    // Build a continuous curve out of the discrete path points
    const curve = React.useMemo(() => {
        if (!path || path.length === 0) return null;
        const points = path.map(p => new THREE.Vector3(p.col - GRID_COLS/2, p.z + 0.5, p.row - GRID_ROWS/2));
        return new THREE.CatmullRomCurve3(points, false, "chordal", 0.5); // Smoother corners
    }, [path]);

    useFrame((state, delta) => {
        if (!isMoving || !curve) {
            // Idle bobbing
            if (bobRef.current) bobRef.current.position.y = Math.sin(state.clock.elapsedTime * 3) * 0.1;
            return;
        }

        if (progressRef.current >= 1) {
            if (!hasFinished.current) {
                hasFinished.current = true;
                if (onFinish) onFinish();
            }
            if (bobRef.current) bobRef.current.position.y = Math.sin(state.clock.elapsedTime * 3) * 0.1;
            return;
        }
        
        // Calculate arc length (actual distance) rather than array indices
        const curveLength = curve.getLength();
        
        // Distance traveled this frame
        const distanceToTravel = delta * speed;
        
        // Update progress as a percentage of total length (0.0 to 1.0)
        progressRef.current = Math.min(1.0, progressRef.current + (distanceToTravel / curveLength));
        
        // Get the exact point on the curve at this percentage
        const currentPos = curve.getPointAt(progressRef.current);
        ref.current.position.copy(currentPos);
        
        // Get tangent to look forward
        if (progressRef.current < 1.0) {
             const lookAtPos = curve.getPointAt(Math.min(1.0, progressRef.current + 0.01));
             ref.current.lookAt(lookAtPos);
        }

        // Add hover effect independently inside the bobRef
        if (bobRef.current) {
            bobRef.current.position.y = Math.sin(state.clock.elapsedTime * 5) * 0.1;
        }

        // Update Battery UI
        if (batteryRef.current) {
            const currentEnergy = Math.max(0, maxBattery - (totalEnergy * progressRef.current));
            const pct = ((currentEnergy / maxBattery) * 100).toFixed(1);
            batteryRef.current.innerText = `🔋 ${pct}%`;
            batteryRef.current.style.color = pct < 25 ? '#ff2a2a' : pct < 50 ? '#ffae42' : '#29FF60';
        }

        if (progressRef.current >= 1 && !hasFinished.current) {
            hasFinished.current = true;
            if (onFinish) onFinish();
        }
    });

    if (!path || path.length === 0 || !curve) {
        if (isMoving && !hasFinished.current) {
            hasFinished.current = true;
            if (onFinish) onFinish();
        }
        return null;
    }

    // Pre-calculate line points for a smooth visual trail
    const linePoints = curve.getPoints(Math.max(50, path.length * 5));

    return (
        <group>
            {/* The moving drone container */}
            <group ref={ref} position={[path[0].col - GRID_COLS/2, path[0].z + 0.5, path[0].row - GRID_ROWS/2]}>
                {/* The bobbing mesh container */}
                <group ref={bobRef} scale={[scale, scale, scale]}>
                    <Sphere args={[0.3, 32, 32]}>
                        <meshBasicMaterial color={color} toneMapped={false} />
                    </Sphere>
                    <Sphere args={[0.45, 16, 16]}>
                        <meshStandardMaterial color={color} transparent opacity={0.3} roughness={0.1} metalness={0.8} />
                    </Sphere>
                    <pointLight color={color} intensity={0.5} distance={3} />
                    
                    {/* Floating Battery UI */}
                    <Html position={[0, 1.2, 0]} center style={{ pointerEvents: 'none' }}>
                        <div style={{
                            background: 'rgba(0, 0, 0, 0.7)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: `1px solid ${color}`,
                            color: '#29FF60',
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            whiteSpace: 'nowrap',
                            backdropFilter: 'blur(4px)',
                            boxShadow: `0 0 8px ${color}`
                        }}>
                            <span ref={batteryRef}>🔋 100.0%</span>
                        </div>
                    </Html>
                </group>
            </group>
            
            {/* The trail line drawn statically in world space, independent of the drone's moving group */}
            <Line
                points={linePoints}
                color={color}
                lineWidth={3}
                transparent
                opacity={0.4}
                dashed={false}
            />
        </group>
    );
}

export default class Visualization3D extends Component {
    constructor() {
        super();
        this.state = {
            grid: [],
            mouseIsPressed: false,
            timer: 0,
            buttonsDisabled: false,
            fleetSize: 3,
            numDeliveries: 7,
            payloadLimit: 5,
            useACO: true,
            droneAnimations: [],
            isAnimating: false,
            logs: [],
            showWiki: false
        };
        this.timerInterval = null;
        this.terminalEndRef = React.createRef();
    }

    addLog = (message) => {
        const time = new Date().toISOString().substring(11, 23); // Gets HH:mm:ss.SSS
        this.setState(prevState => ({
            logs: [...prevState.logs, `[${time}] ${message}`]
        }), () => {
            if (this.terminalEndRef.current) {
                this.terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
            }
        });
    }

    generateDeliveries(grid, count) {
        // First clear existing finish nodes
        for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
                grid[r][c].isFinish = false;
            }
        }

        let placed = 0;
        while (placed < count) {
            const r = Math.floor(Math.random() * GRID_ROWS);
            const c = Math.floor(Math.random() * GRID_COLS);
            
            const node = grid[r][c];
            if (!node.isStart && !node.isWall && !node.isFinish) {
                node.isFinish = true;
                placed++;
            }
        }
        return grid;
    }

    componentDidMount() {
        let grid = getInitialGrid();
        grid = this.generateDeliveries(grid, this.state.numDeliveries);
        this.setState({ grid });
        this.addLog("System Initialized. 3D Map Rendered.");
    }

    componentWillUnmount() {
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    resetGridStateOnly() {
        const grid = this.state.grid;
        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[0].length; col++) {
                const node = grid[row][col];
                node.isVisited = false;
                node.distance = Infinity;
                node.previousNode = null;
                node.z = 0;
            }
        }
    }

    resetToInitialState() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        const grid = getInitialGrid();
        this.setState({ grid, timer: 0, buttonsDisabled: false, droneAnimations: [], isAnimating: false, logs: [] }, () => {
            this.addLog("System completely reset.");
        });
    }

    resetPathsKeepWalls() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        const grid = this.state.grid.map(row => 
            row.map(node => ({
                ...node,
                isVisited: false,
                distance: Infinity,
                previousNode: null,
                isPath: false,
                isBlocked: false,
                z: 0
            }))
        );
        this.setState({ grid, timer: 0, buttonsDisabled: false, droneAnimations: [], isAnimating: false }, () => {
            this.addLog("Paths cleared. Obstacles retained.");
        });
    }

    handlePointerDown(e, row, col) {
        e.stopPropagation();
        this.setState({ mouseIsPressed: true });
        this.toggleWall(row, col, true);
    }

    handlePointerOver(e, row, col) {
        if (!this.state.mouseIsPressed) return;
        e.stopPropagation();
        this.toggleWall(row, col, true); // True means it always draws a wall when dragging
    }

    handlePointerUp() {
        this.setState({ mouseIsPressed: false });
    }

    toggleWall(row, col, forceWall = null) {
        const newGrid = this.state.grid.slice();
        const node = newGrid[row][col];
        if (!node.isStart && !node.isFinish) {
            const newNode = { ...node, isWall: forceWall !== null ? forceWall : !node.isWall };
            if (newNode.isWall === node.isWall) return; // No change
            
            newGrid[row][col] = newNode;
            this.setState({ grid: newGrid });
        }
    }

    analyzeFleet() {
        const { grid, numDeliveries } = this.state;
        const finishNodes = [];
        for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
                if (grid[r][c].isFinish) {
                    finishNodes.push(grid[r][c]);
                }
            }
        }
        
        if (finishNodes.length === 0) {
            this.addLog("No deliveries to analyze.");
            return;
        }

        let totalEstimatedDistance = 0;
        let currentStart = grid[startNodeRow][startNodeCol];
        
        let unvisited = [...finishNodes];
        while (unvisited.length > 0) {
            let nearestIdx = 0;
            let minDist = Infinity;
            for (let i = 0; i < unvisited.length; i++) {
                const dist = Math.abs(currentStart.row - unvisited[i].row) + Math.abs(currentStart.col - unvisited[i].col);
                if (dist < minDist) {
                    minDist = dist;
                    nearestIdx = i;
                }
            }
            totalEstimatedDistance += minDist;
            currentStart = unvisited[nearestIdx];
            unvisited.splice(nearestIdx, 1);
        }
        totalEstimatedDistance += Math.abs(currentStart.row - startNodeRow) + Math.abs(currentStart.col - startNodeCol);
        
        const batteryCapacity = 150; 
        const { payloadLimit } = this.state;

        // Optimal fleet based on battery range
        let fleetByBattery = Math.ceil(totalEstimatedDistance / batteryCapacity);
        // Optimal fleet based on package limit
        let fleetByPayload = Math.ceil(finishNodes.length / payloadLimit);
        
        // Take the higher requirement
        let optimalFleet = Math.max(fleetByBattery, fleetByPayload);
        
        if (optimalFleet > 7) optimalFleet = 7;
        if (optimalFleet < 1) optimalFleet = 1;
        
        this.addLog(`--- Fleet Analysis ---`);
        this.addLog(`Total Deliveries: ${finishNodes.length}`);
        this.addLog(`Max Payload per Drone: ${payloadLimit} units`);
        this.addLog(`Drone Safe Range: ${batteryCapacity} units`);
        this.addLog(`=> Optimal Fleet Size: ${optimalFleet} Drones`);
        
        this.setState({ fleetSize: optimalFleet });
    }

    async visualizeOptimizedFleet(algorithm) {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.setState({ buttonsDisabled: true, droneAnimations: [], isAnimating: false, timer: 0 });
        
        const startTime = Date.now();
        this.timerInterval = setInterval(() => {
            this.setState({ timer: Date.now() - startTime });
        }, 10);

        const { fleetSize, grid, useACO } = this.state;

        this.addLog(`--- Starting Fleet Optimization ---`);
        this.addLog(`Algorithm: ${algorithm.toUpperCase()}`);
        this.addLog(`Fleet Size: ${fleetSize}`);

        const finishNodes = [];
        for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
                if (grid[r][c].isFinish) {
                    finishNodes.push(grid[r][c]);
                }
            }
        }
        
        this.addLog(`Allocating ${finishNodes.length} deliveries into ${fleetSize} spatial clusters (K-Means)...`);
        let clusters = allocateDeliveries(finishNodes, fleetSize || 3);

        const allDroneAnimations = [];
        const reservationTable = new ReservationTable();

        for (let d = 0; d < clusters.length; d++) {
            let cluster = clusters[d];
            if (cluster.length === 0) continue;

            const color = DRONE_COLORS[d % DRONE_COLORS.length];
            this.addLog(`Drone ${d} assigned ${cluster.length} total deliveries.`);

            let currentStart = grid[startNodeRow][startNodeCol];
            
            if (useACO) {
                this.addLog(`Drone ${d}: Calculating optimal delivery sequence using Ant Colony Optimization (TSP)...`);
                cluster = optimizeRouteWithACO(currentStart, cluster);
            }

            let droneShortestPath = [];
            let currentTime = 0;

            if (algorithm === 'mapf') {
                droneShortestPath.push({ ...currentStart, z: 0 });
            }

            const { payloadLimit } = this.state;

            for (let i = 0; i < cluster.length; i++) {
                // --- Multi-Trip / Reloading Logic ---
                // Use the user-defined payload limit
                if (i > 0 && i % payloadLimit === 0) {
                    this.addLog(`📦 Drone ${d} reached capacity (${payloadLimit}/${payloadLimit}). Returning to base to reload...`);
                    const baseNode = grid[startNodeRow][startNodeCol];
                    this.resetGridStateOnly();
                    
                    let reloadPath = [];
                    if (algorithm === 'mapf') {
                        const res = cooperativeAStar(this.state.grid, currentStart, { ...baseNode, z: d }, currentTime, reservationTable);
                        reloadPath = res.path || [];
                        if (reloadPath.length > 0) {
                            for (let p = 1; p < reloadPath.length; p++) droneShortestPath.push(reloadPath[p]);
                            for (let t = 0; t < reloadPath.length; t++) reservationTable.reserve(reloadPath[t].row, reloadPath[t].col, reloadPath[t].z, currentTime + t);
                            currentTime = res.endTime + 10; // 10 tick reload time
                        } else {
                            this.addLog(`❌ Drone ${d}: Failed to find path to base for reload!`);
                        }
                    } else {
                        aStar(this.state.grid, currentStart, baseNode);
                        reloadPath = getNodesInShortestPathOrderaStar(currentStart, baseNode, this.state.grid) || [];
                        if (reloadPath.length > 0) droneShortestPath = droneShortestPath.concat(reloadPath.slice(1).map(p => ({...p, z: 0})));
                    }
                    currentStart = { ...baseNode, z: d }; // Maintain height d
                }

                this.resetGridStateOnly();
                const target = grid[cluster[i].row][cluster[i].col];
                let nodesInShortestPathOrder = [];

                if (algorithm === 'mapf') {
                    const result = cooperativeAStar(this.state.grid, currentStart, target, currentTime, reservationTable);
                    const path = result.path || [];
                    
                    if (path.length > 0) {
                        for (let p = 1; p < path.length; p++) {
                            droneShortestPath.push(path[p]);
                        }
                        for (let t = 0; t < path.length; t++) {
                            reservationTable.reserve(path[t].row, path[t].col, path[t].z, currentTime + t);
                            if (t < path.length - 1) {
                                reservationTable.reserveEdge(path[t].row, path[t].col, path[t].z, path[t+1].row, path[t+1].col, path[t+1].z, currentTime + t);
                            }
                        }
                        if (i === cluster.length - 1) {
                            for (let t = 1; t <= 100; t++) {
                                reservationTable.reserve(target.row, target.col, 0, result.endTime + t);
                            }
                        }
                    }
                    currentTime = result.endTime;
                } else if (algorithm === 'dijkstra') {
                    dijkstra(this.state.grid, currentStart, target);
                    nodesInShortestPathOrder = getNodesInShortestPathOrder(currentStart, target, this.state.grid) || [];
                } else {
                    aStar(this.state.grid, currentStart, target);
                    nodesInShortestPathOrder = getNodesInShortestPathOrderaStar(currentStart, target, this.state.grid) || [];
                }

                if (algorithm !== 'mapf') {
                    if (i > 0 && nodesInShortestPathOrder.length > 0) {
                        const mappedPath = nodesInShortestPathOrder.slice(1).map(p => ({...p, z: 0}));
                        droneShortestPath = droneShortestPath.concat(mappedPath);
                    } else if (i === 0) {
                        const mappedPath = nodesInShortestPathOrder.map(p => ({...p, z: 0}));
                        droneShortestPath = droneShortestPath.concat(mappedPath);
                    }
                }

                currentStart = target;
            }

            // Return to Base Logic
            this.addLog(`Drone ${d}: Calculating return trajectory to base...`);
            const baseNode = grid[startNodeRow][startNodeCol]; 
            let returnPathOrder = [];

            this.resetGridStateOnly();
            if (algorithm === 'mapf') {
                const result = cooperativeAStar(this.state.grid, currentStart, { ...baseNode, z: d }, currentTime, reservationTable);
                const path = result.path || [];
                
                if (path.length > 0) {
                    for (let p = 1; p < path.length; p++) {
                        droneShortestPath.push(path[p]);
                    }
                    for (let t = 0; t < path.length; t++) {
                        reservationTable.reserve(path[t].row, path[t].col, path[t].z, currentTime + t);
                        if (t < path.length - 1) {
                            reservationTable.reserveEdge(path[t].row, path[t].col, path[t].z, path[t+1].row, path[t+1].col, path[t+1].z, currentTime + t);
                        }
                    }
                    
                    for (let t = 1; t <= 500; t++) {
                         reservationTable.reserve(baseNode.row, baseNode.col, d, result.endTime + t);
                    }
                } else {
                    this.addLog(`❌ Drone ${d}: FAILED to find return path! Final Pos: ${currentStart.row},${currentStart.col}`);
                }
                currentTime = result.endTime;
            } else if (algorithm === 'dijkstra') {
                dijkstra(this.state.grid, currentStart, baseNode);
                returnPathOrder = getNodesInShortestPathOrder(currentStart, baseNode, this.state.grid) || [];
            } else {
                aStar(this.state.grid, currentStart, baseNode);
                returnPathOrder = getNodesInShortestPathOrderaStar(currentStart, baseNode, this.state.grid) || [];
            }

            if (algorithm !== 'mapf') {
                 if (returnPathOrder.length > 0) {
                     const mappedReturn = returnPathOrder.slice(1).map(p => ({...p, z: 0}));
                     droneShortestPath = droneShortestPath.concat(mappedReturn);
                 }
            }

            allDroneAnimations.push({
                path: droneShortestPath,
                color: color,
                id: d
            });
        }

        this.addLog("Calculations complete. Commencing 3D simulation...");

        this.finishedDronesCount = 0;
        this.setState({ 
            droneAnimations: allDroneAnimations, 
            isAnimating: true 
        });
    }

    handleDroneFinish = () => {
        this.finishedDronesCount++;
        const totalDrones = this.state.droneAnimations.length;
        
        if (this.finishedDronesCount >= totalDrones) {
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.setState({ buttonsDisabled: false });
            this.addLog(`Simulation Complete. Total time: ${this.state.timer}ms`);
        }
    }

    render() {
        const { grid, timer, buttonsDisabled, fleetSize, numDeliveries, useACO, droneAnimations, isAnimating, showWiki } = this.state;

        return (
            <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#050510' }}>
                <div style={{ padding: '15px 20px', background: 'rgba(20, 20, 30, 0.9)', color: 'white', borderBottom: '1px solid #333', zIndex: 10, backdropFilter: 'blur(10px)', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{margin: 0, fontSize: '1.5rem', fontWeight: 600, letterSpacing: '2px', color: '#00ffcc', textTransform: 'uppercase'}}>SkyFlow 3D</h2>
                        <Button variant="outline-info" onClick={() => this.setState({ showWiki: true })}>
                            📖 Project Wiki
                        </Button>
                    </div>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginTop: '15px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#222', padding: '8px 15px', borderRadius: '8px' }}>
                            <label style={{ marginRight: '10px', fontSize: '0.9rem' }}>Deliveries:</label>
                            <input 
                                type="number" value={numDeliveries} min="1" max="25" 
                                onChange={(e) => this.setState({ numDeliveries: parseInt(e.target.value) })}
                                disabled={buttonsDisabled}
                                style={{ width: '50px', background: '#111', color: 'white', border: '1px solid #444', borderRadius: '4px', textAlign: 'center', padding: '4px', marginRight: '10px' }}
                            />
                            <Button variant="outline-light" size="sm" onClick={() => this.setState({ grid: this.generateDeliveries(this.state.grid.slice(), this.state.numDeliveries) })} disabled={buttonsDisabled}>
                                🔄 Randomize
                            </Button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#222', padding: '8px 15px', borderRadius: '8px' }}>
                            <label style={{ marginRight: '10px', fontSize: '0.9rem' }}>Drones:</label>
                            <input 
                                type="number" value={fleetSize} min="1" max="7" 
                                onChange={(e) => this.setState({ fleetSize: parseInt(e.target.value) })}
                                disabled={buttonsDisabled}
                                style={{ width: '40px', background: '#111', color: 'white', border: '1px solid #444', borderRadius: '4px', textAlign: 'center', padding: '4px', marginRight: '10px' }}
                            />
                            <Button variant="info" size="sm" onClick={() => this.analyzeFleet()} disabled={buttonsDisabled}>
                                🧠 Auto-Optimize Fleet Size
                            </Button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#222', padding: '8px 15px', borderRadius: '8px' }}>
                            <label style={{ marginRight: '10px', fontSize: '0.9rem' }}>Payload (Max 📦):</label>
                            <input 
                                type="number" value={this.state.payloadLimit} min="1" max="20" 
                                onChange={(e) => this.setState({ payloadLimit: parseInt(e.target.value) })}
                                disabled={buttonsDisabled}
                                style={{ width: '40px', background: '#111', color: '#ffc107', border: '1px solid #444', borderRadius: '4px', textAlign: 'center', padding: '4px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#222', padding: '8px 15px', borderRadius: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem', margin: 0 }}>
                                <input 
                                    type="checkbox" checked={useACO} 
                                    onChange={(e) => this.setState({ useACO: e.target.checked })}
                                    disabled={buttonsDisabled}
                                    style={{ marginRight: '8px', width: '16px', height: '16px', accentColor: '#29FF60' }}
                                />
                                Swarm ACO (Routing)
                            </label>
                        </div>
                        
                        <div style={{ width: '100%', height: '0px' }}></div>

                        <Button variant="success" className="btn-glow" style={{ padding: '8px 20px', fontWeight: 'bold' }} onClick={() => this.visualizeOptimizedFleet('mapf')} disabled={buttonsDisabled}>
                            Run MAPF (Cooperative A*)
                        </Button>
                        <Button variant="primary" style={{ padding: '8px 20px', fontWeight: 'bold' }} onClick={() => this.visualizeOptimizedFleet('astar')} disabled={buttonsDisabled}>
                            Run Standard A*
                        </Button>
                        <Button variant="primary" style={{ padding: '8px 20px', fontWeight: 'bold' }} onClick={() => this.visualizeOptimizedFleet('dijkstra')} disabled={buttonsDisabled}>
                            Run Dijkstra
                        </Button>
                        <Button variant="danger" style={{ padding: '8px 20px', fontWeight: 'bold' }} onClick={() => this.resetToInitialState()}>
                            Reset Everything
                        </Button>
                        <Button variant="warning" style={{ padding: '8px 20px', fontWeight: 'bold' }} onClick={() => this.resetPathsKeepWalls()}>
                            Reset Paths (Keep Walls)
                        </Button>
                        <div style={{ marginLeft: 'auto', background: '#111', padding: '8px 20px', borderRadius: '8px', border: '1px solid #333', color: '#00ffcc', fontFamily: 'monospace', fontSize: '1.1rem' }}>
                            ⏱️ {timer}ms
                        </div>
                    </div>
                </div>

                <div style={{ flex: 1, position: 'relative' }}>
                    <Canvas camera={{ position: [-15, 25, 35], fov: 45 }} onPointerUp={() => this.setState({ mouseIsPressed: false })}>
                        <color attach="background" args={['#050510']} />
                        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                        
                        <ambientLight intensity={0.4} />
                        <pointLight position={[0, 50, 0]} intensity={1.0} color="#ffffff" />
                        <directionalLight position={[20, 20, 20]} intensity={1.5} color="#e0e0ff" />
                        <directionalLight position={[-20, 10, -20]} intensity={0.8} color="#ffb86c" />
                        
                        <OrbitControls 
                            enabled={!this.state.mouseIsPressed}
                            maxPolarAngle={Math.PI / 2 - 0.05}
                            minDistance={10}
                            maxDistance={100}
                            makeDefault
                        />

                        <Grid 
                            position={[0, -0.01, 0]} 
                            args={[100, 100]} 
                            cellSize={1} cellThickness={1} cellColor="#333" 
                            sectionSize={5} sectionThickness={1.5} sectionColor="#666" 
                            fadeDistance={60} 
                            fadeStrength={1.5} 
                        />
                        
                        <group>
                            {grid.map((row, rIdx) => 
                                row.map((node, cIdx) => {
                                    const x = cIdx - GRID_COLS/2;
                                    const z = rIdx - GRID_ROWS/2;
                                    
                                    if (node.isWall) {
                                        return (
                                            <group key={`${rIdx}-${cIdx}`}>
                                                <Box 
                                                    position={[x, 1.5, z]} 
                                                    args={[0.9, 3, 0.9]} 
                                                    onPointerDown={(e) => this.handlePointerDown(e, rIdx, cIdx)}
                                                    onPointerOver={(e) => this.handlePointerOver(e, rIdx, cIdx)}
                                                    onPointerUp={() => this.handlePointerUp()}
                                                >
                                                    <meshStandardMaterial 
                                                        color="#2c2c3a" 
                                                        roughness={0.4} 
                                                        metalness={0.8} 
                                                        emissive="#111122"
                                                    />
                                                    <lineSegments>
                                                        <edgesGeometry attach="geometry" args={[new THREE.BoxGeometry(0.9, 3, 0.9)]} />
                                                        <lineBasicMaterial attach="material" color="#667" linewidth={1} />
                                                    </lineSegments>
                                                </Box>
                                                {/* Cyberpunk window lights */}
                                                <Box position={[x, 2.2, z]} args={[0.92, 0.15, 0.92]}>
                                                    <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={2} toneMapped={false} />
                                                </Box>
                                                <Box position={[x, 1.2, z]} args={[0.92, 0.15, 0.92]}>
                                                    <meshStandardMaterial color="#ff2975" emissive="#ff2975" emissiveIntensity={2} toneMapped={false} />
                                                </Box>
                                            </group>
                                        );
                                    }

                                    let color = "#111";
                                    let height = 0.05;
                                    let emissive = "#000";
                                    let emissiveIntensity = 0;

                                    if (node.isStart) {
                                        color = "#007bff";
                                        height = 0.2;
                                        emissive = "#007bff";
                                        emissiveIntensity = 2;
                                    } else if (node.isFinish) {
                                        color = "#28a745";
                                        height = 0.15;
                                        emissive = "#28a745";
                                        emissiveIntensity = 1.5;
                                    } else {
                                        return (
                                            <mesh 
                                                key={`${rIdx}-${cIdx}`} 
                                                position={[x, 0, z]} 
                                                rotation={[-Math.PI / 2, 0, 0]} 
                                                onPointerDown={(e) => this.handlePointerDown(e, rIdx, cIdx)}
                                                onPointerOver={(e) => this.handlePointerOver(e, rIdx, cIdx)}
                                                onPointerUp={() => this.handlePointerUp()}
                                            >
                                                <planeGeometry args={[1, 1]} />
                                                <meshBasicMaterial visible={false} />
                                            </mesh>
                                        );
                                    }

                                    return (
                                        <Box 
                                            key={`${rIdx}-${cIdx}`} 
                                            position={[x, height/2, z]} 
                                            args={[0.8, height, 0.8]} 
                                            onPointerDown={(e) => this.handlePointerDown(e, rIdx, cIdx)}
                                            onPointerOver={(e) => this.handlePointerOver(e, rIdx, cIdx)}
                                            onPointerUp={() => this.handlePointerUp()}
                                        >
                                            <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} toneMapped={false} />
                                        </Box>
                                    );
                                })
                            )}
                        </group>

                        {droneAnimations.map(drone => (
                            <Drone 
                                key={drone.id} 
                                path={drone.path} 
                                color={drone.color}
                                isMoving={isAnimating} 
                                onFinish={this.handleDroneFinish}
                            />
                        ))}

                        <EffectComposer>
                            <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={1.5} />
                        </EffectComposer>
                    </Canvas>
                    
                    <div style={{ position: 'absolute', bottom: 20, right: 20, background: 'rgba(10, 10, 15, 0.8)', color: '#aaa', padding: '15px', borderRadius: '10px', backdropFilter: 'blur(5px)', border: '1px solid #333', fontSize: '0.9rem', pointerEvents: 'none' }}>
                        <div style={{ marginBottom: '8px', color: '#fff', fontWeight: 'bold' }}>🎮 Controls</div>
                        <p style={{margin: '5px 0'}}>🖱️ <span style={{color:'#fff'}}>Left Click:</span> Rotate Camera</p>
                        <p style={{margin: '5px 0'}}>🖱️ <span style={{color:'#fff'}}>Right Click:</span> Pan Camera</p>
                        <p style={{margin: '5px 0'}}>🖱️ <span style={{color:'#fff'}}>Scroll:</span> Zoom in/out</p>
                        <p style={{margin: '5px 0', marginTop: '10px'}}>👆 <span style={{color:'#00ffcc'}}>Click Floor:</span> Toggle Obstacles</p>
                    </div>

                    <div style={{ position: 'absolute', top: 20, right: 20, width: '450px', height: '200px', background: 'rgba(5, 5, 10, 0.85)', color: '#00ffcc', padding: '10px', borderRadius: '10px', backdropFilter: 'blur(5px)', border: '1px solid #333', fontSize: '0.85rem', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', pointerEvents: 'auto', textAlign: 'left' }}>
                        <div style={{ marginBottom: '5px', borderBottom: '1px solid #333', paddingBottom: '5px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                            <span>>_ SIMULATION_TERMINAL</span>
                            <span style={{ cursor: 'pointer', color: '#dc3545' }} onClick={() => this.setState({logs: []})}>[CLEAR]</span>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                            {this.state.logs.map((log, index) => (
                                <div key={index} style={{ marginBottom: '4px', wordWrap: 'break-word' }}>{log}</div>
                            ))}
                            <div ref={this.terminalEndRef} />
                        </div>
                    </div>
                    
                    {showWiki && (
                        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
                            <div style={{ background: '#1e1e24', color: '#e0e0e0', width: '100%', maxWidth: '800px', maxHeight: '90vh', borderRadius: '12px', overflowY: 'auto', padding: '30px', position: 'relative', boxShadow: '0 10px 30px rgba(0,0,0,0.8)', textAlign: 'left', lineHeight: '1.6' }}>
                                <button 
                                    onClick={() => this.setState({ showWiki: false })}
                                    style={{ position: 'absolute', top: '20px', right: '20px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                    X
                                </button>
                                <div style={{ paddingRight: '20px' }}>
                                    <ReactMarkdown>{wikiMarkdown}</ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}
