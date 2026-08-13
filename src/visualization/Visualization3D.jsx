import React, { Component, forwardRef, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Box, Sphere, Cylinder, Line, Stars, Grid, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

import { dijkstra, getNodesInShortestPathOrder } from '../algorithms/dijkstra';
import { aStar, getNodesInShortestPathOrderAStar } from '../algorithms/aStar';
import { cooperativeAStar, ReservationTable } from '../algorithms/cooperativeAStar';
import { allocateDeliveries } from '../algorithms/allocation';
import { optimizeRouteWithACO } from '../algorithms/aco';
import './visualization.css';

const BUTTON_VARIANT_CLASSES = Object.freeze({
    primary: 'viz-button--primary',
    success: 'viz-button--success',
    danger: 'viz-button--danger',
    warning: 'viz-button--warning',
    info: 'viz-button--info',
    'outline-info': 'viz-button--outline-info',
    'outline-light': 'viz-button--outline-light',
    'outline-success': 'viz-button--outline-success',
    'outline-warning': 'viz-button--outline-warning'
});

const BUTTON_SIZE_CLASSES = Object.freeze({
    sm: 'viz-button--sm'
});

const Button = forwardRef(function Button({
    children,
    className = '',
    size,
    type = 'button',
    variant = 'primary',
    ...buttonProps
}, ref) {
    const classes = [
        'viz-button',
        BUTTON_VARIANT_CLASSES[variant] || BUTTON_VARIANT_CLASSES.primary,
        BUTTON_SIZE_CLASSES[size],
        className
    ].filter(Boolean).join(' ');

    return (
        <button {...buttonProps} ref={ref} className={classes} type={type}>
            {children}
        </button>
    );
});

const GRID_ROWS = 20;
const GRID_COLS = 50;
const MIN_DELIVERIES = 1;
const MAX_DELIVERIES = 25;
const MIN_FLEET_SIZE = 1;
const MAX_FLEET_SIZE = 7;
const MIN_PAYLOAD = 1;
const MAX_PAYLOAD = 20;
const RELOAD_TICKS = 10;
const DEPOT_LAUNCH_STAGGER_TICKS = 2;
const SIMULATION_TICKS_PER_SECOND = 4;
const TIMER_UPDATE_MS = 100;
const MAX_LOG_ENTRIES = 150;
const MAX_BATTERY = 150;

const startNodeRow = 6;
const startNodeCol = 7;

const DRONE_COLORS = ['#8A2BE2', '#29FF60', '#FF9629', '#FF2929', '#FFFF29', '#29FFFF', '#FF29FF'];
const CAMERA_CONFIG = { position: [-15, 25, 35], fov: 45 };
const CANVAS_DPR = [1, 1.5];

const LazyWikiMarkdown = React.lazy(() =>
    Promise.all([import('react-markdown'), import('../wikiContent.js')]).then(
        ([markdownModule, wikiModule]) => ({
            default: function WikiMarkdownContent() {
                const ReactMarkdown = markdownModule.default;
                return <ReactMarkdown>{wikiModule.wikiMarkdown}</ReactMarkdown>;
            }
        })
    )
);

class PlanningError extends Error {}

const clampInteger = (value, min, max, fallback) => {
    const parsed = Number(value);
    const safeFallback = Number.isFinite(Number(fallback)) ? Math.trunc(Number(fallback)) : min;
    if (!Number.isFinite(parsed)) return Math.min(max, Math.max(min, safeFallback));
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const createAcoSeed = (depot, deliveries, payloadLimit, droneIndex) => {
    const seedInput = [
        depot.row,
        depot.col,
        ...deliveries.flatMap(({ row, col }) => [row, col]),
        payloadLimit,
        droneIndex
    ].join('|');
    let hash = 2166136261;

    for (let index = 0; index < seedInput.length; index++) {
        hash ^= seedInput.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
};

const createSeededRandom = (seed) => {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
};

const createNode = (col, row) => {
    const isRoad = row % 6 === 0 || col % 6 === 0;
    const buildingHeight = isRoad ? 0 : 2 + Math.random() * 4;

    return {
        col,
        row,
        z: 0,
        isStart: row === startNodeRow && col === startNodeCol,
        isFinish: false,
        distance: Infinity,
        isVisited: false,
        isWall: false,
        previousNode: null,
        isPath: false,
        isBlocked: false,
        isRoad,
        wallHeight: buildingHeight
    };
};

const getInitialGrid = () =>
    Array.from({ length: GRID_ROWS }, (_, row) =>
        Array.from({ length: GRID_COLS }, (_, col) => createNode(col, row))
    );

const samePosition = (a, b) =>
    Boolean(a && b) && a.row === b.row && a.col === b.col && (a.z || 0) === (b.z || 0);

const normalizeTimedPath = (path, startTime = 0) => {
    let previousTime = Number.isFinite(startTime) ? startTime : 0;

    return (path || []).map((point, index) => {
        const suppliedTime = Number(point.time);
        const fallbackTime = startTime + index;
        const candidateTime = Number.isFinite(suppliedTime) ? suppliedTime : fallbackTime;
        const time = index === 0
            ? Math.max(startTime, candidateTime)
            : Math.max(previousTime, candidateTime);

        previousTime = time;
        return {
            row: point.row,
            col: point.col,
            z: Number.isFinite(Number(point.z)) ? Number(point.z) : 0,
            time
        };
    });
};

const extendPathToReportedEnd = (path, reportedEndTime) => {
    if (path.length === 0 || !Number.isFinite(Number(reportedEndTime))) return path;

    const lastPoint = path[path.length - 1];
    const safeEndTime = Math.max(lastPoint.time, Number(reportedEndTime));
    if (safeEndTime === lastPoint.time) return path;

    return [...path, { ...lastPoint, time: safeEndTime }];
};

const appendTimedPath = (route, segment) => {
    segment.forEach((point, index) => {
        const previous = route[route.length - 1];
        const isDuplicateBoundary = index === 0
            && samePosition(previous, point)
            && previous.time === point.time;

        if (!isDuplicateBoundary) route.push({ ...point });
    });
};

const reserveTimedPath = (reservationTable, path) => {
    if (!reservationTable || path.length === 0) return;

    path.forEach((point) => {
        reservationTable.reserve(point.row, point.col, point.z, Math.ceil(point.time));
    });

    for (let index = 0; index < path.length - 1; index++) {
        const from = path[index];
        const to = path[index + 1];
        const start = Math.floor(from.time);
        const end = Math.max(start, Math.ceil(to.time));

        if (samePosition(from, to)) {
            for (let time = start; time <= end; time++) {
                reservationTable.reserve(from.row, from.col, from.z, time);
            }
            continue;
        }

        for (let time = start; time < end; time++) {
            reservationTable.reserveEdge(
                from.row,
                from.col,
                from.z,
                to.row,
                to.col,
                to.z,
                time
            );
        }
    }
};

const getSegmentEnergy = (from, to) => {
    const rowDelta = to.row - from.row;
    const colDelta = to.col - from.col;
    const zDelta = to.z - from.z;
    const duration = Math.max(0, to.time - from.time);

    if (rowDelta === 0 && colDelta === 0 && zDelta === 0) return duration;

    const horizontalDistance = Math.hypot(rowDelta, colDelta);
    const verticalCost = zDelta > 0 ? zDelta * 2 : Math.abs(zDelta) * 0.5;
    return horizontalDistance + verticalCost;
};

export const createRouteData = (path) => {
    if (!path || path.length === 0) return null;

    const firstTime = Number.isFinite(Number(path[0].time)) ? Number(path[0].time) : 0;
    const points = normalizeTimedPath(path, firstTime);
    const linePoints = points.map(
        (point) => new THREE.Vector3(
            point.col - GRID_COLS / 2,
            point.z + 0.5,
            point.row - GRID_ROWS / 2
        )
    );
    const segmentEnergy = [];
    const cumulativeEnergy = [0];

    for (let index = 0; index < points.length - 1; index++) {
        const energy = getSegmentEnergy(points[index], points[index + 1]);
        segmentEnergy.push(energy);
        cumulativeEnergy.push(cumulativeEnergy[index] + energy);
    }

    return {
        points,
        linePoints,
        segmentEnergy,
        cumulativeEnergy,
        totalEnergy: cumulativeEnergy[cumulativeEnergy.length - 1],
        startTime: points[0].time,
        endTime: points[points.length - 1].time
    };
};

export const shouldShowDroneAtTime = (route, isMoving, hasFinished, simulationTime) => (
    Boolean(route)
    && isMoving
    && !hasFinished
    && Number.isFinite(simulationTime)
    && simulationTime >= route.startTime
    && simulationTime < route.endTime
);

const updateBatteryLabel = (element, percent, lastPercentRef) => {
    const rounded = Math.max(0, Math.min(100, percent));
    const displayValue = rounded.toFixed(1);
    if (!element || displayValue === lastPercentRef.current) return;

    lastPercentRef.current = displayValue;
    element.innerText = `🔋 ${displayValue}%`;
    element.style.color = rounded < 25 ? '#ff2a2a' : rounded < 50 ? '#ffae42' : '#29FF60';
};

function Rotor({ position, color, speed = 48 }) {
    const rotorRef = useRef();

    useFrame((_, delta) => {
        if (rotorRef.current) rotorRef.current.rotation.y += speed * delta;
    });

    return (
        <group position={position}>
            <Box ref={rotorRef} args={[0.4, 0.01, 0.04]}>
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} toneMapped={false} />
            </Box>
            <Cylinder args={[0.04, 0.04, 0.08, 8]} position={[0, -0.04, 0]}>
                <meshStandardMaterial color="#111" />
            </Cylinder>
        </group>
    );
}

const Drone = React.memo(function Drone({ id, runId, path, color, isMoving, onFinish }) {
    const droneRef = useRef();
    const bobRef = useRef();
    const batteryRef = useRef();
    const elapsedSecondsRef = useRef(0);
    const segmentIndexRef = useRef(0);
    const hasFinishedRef = useRef(false);
    const lastBatteryPercentRef = useRef(null);
    const route = useMemo(() => createRouteData(path), [path]);

    useLayoutEffect(() => {
        elapsedSecondsRef.current = 0;
        segmentIndexRef.current = 0;
        hasFinishedRef.current = false;
        lastBatteryPercentRef.current = null;

        if (route && droneRef.current) {
            droneRef.current.position.copy(route.linePoints[0]);
            droneRef.current.visible = false;
        }
        updateBatteryLabel(batteryRef.current, 100, lastBatteryPercentRef);
    }, [path, route, runId]);

    useEffect(() => {
        if (isMoving && !route && !hasFinishedRef.current) {
            hasFinishedRef.current = true;
            onFinish(runId, id);
        }
    }, [id, isMoving, onFinish, route, runId]);

    useFrame((state, delta) => {
        if (!route || !droneRef.current) return;

        if (!isMoving || hasFinishedRef.current) {
            droneRef.current.visible = false;
            if (bobRef.current) bobRef.current.position.y = Math.sin(state.clock.elapsedTime * 3) * 0.1;
            return;
        }

        elapsedSecondsRef.current += delta;
        const simulationTime = elapsedSecondsRef.current * SIMULATION_TICKS_PER_SECOND;
        const lastIndex = route.points.length - 1;

        if (simulationTime < route.startTime) {
            droneRef.current.visible = false;
            droneRef.current.position.copy(route.linePoints[0]);
            if (bobRef.current) bobRef.current.position.y = Math.sin(state.clock.elapsedTime * 3) * 0.1;
            return;
        }

        if (simulationTime >= route.endTime || lastIndex === 0) {
            droneRef.current.position.copy(route.linePoints[lastIndex]);
            droneRef.current.visible = false;
            updateBatteryLabel(
                batteryRef.current,
                ((MAX_BATTERY - route.totalEnergy) / MAX_BATTERY) * 100,
                lastBatteryPercentRef
            );

            if (!hasFinishedRef.current) {
                hasFinishedRef.current = true;
                onFinish(runId, id);
            }
            return;
        }

        droneRef.current.visible = shouldShowDroneAtTime(
            route,
            isMoving,
            hasFinishedRef.current,
            simulationTime
        );

        let segmentIndex = Math.min(segmentIndexRef.current, Math.max(0, lastIndex - 1));
        while (
            segmentIndex < lastIndex - 1
            && simulationTime >= route.points[segmentIndex + 1].time
        ) {
            segmentIndex++;
        }
        segmentIndexRef.current = segmentIndex;

        const fromPoint = route.points[segmentIndex];
        const toPoint = route.points[segmentIndex + 1];
        const fromPosition = route.linePoints[segmentIndex];
        const toPosition = route.linePoints[segmentIndex + 1];
        const segmentDuration = toPoint.time - fromPoint.time;
        const segmentProgress = segmentDuration <= 0
            ? 1
            : THREE.MathUtils.clamp((simulationTime - fromPoint.time) / segmentDuration, 0, 1);

        droneRef.current.position.lerpVectors(fromPosition, toPosition, segmentProgress);
        if (fromPosition.distanceToSquared(toPosition) > 0.000001) droneRef.current.lookAt(toPosition);

        const energyUsed = route.cumulativeEnergy[segmentIndex]
            + route.segmentEnergy[segmentIndex] * segmentProgress;
        updateBatteryLabel(
            batteryRef.current,
            ((MAX_BATTERY - energyUsed) / MAX_BATTERY) * 100,
            lastBatteryPercentRef
        );

        if (bobRef.current) bobRef.current.position.y = Math.sin(state.clock.elapsedTime * 5) * 0.1;
    });

    if (!route) return null;

    return (
        <group>
            <group ref={droneRef} position={route.linePoints[0]}>
                <group ref={bobRef}>
                    <group scale={[0.4, 0.4, 0.4]}>
                        <Box args={[0.6, 0.2, 0.6]}>
                            <meshStandardMaterial color="#1a1a1a" metalness={0.9} roughness={0.1} />
                        </Box>
                        <Sphere args={[0.2, 16, 16]} position={[0, 0.15, 0]}>
                            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} toneMapped={false} />
                        </Sphere>
                        <Box args={[1.2, 0.06, 0.06]} rotation={[0, Math.PI / 4, 0]}>
                            <meshStandardMaterial color="#333" />
                        </Box>
                        <Box args={[1.2, 0.06, 0.06]} rotation={[0, -Math.PI / 4, 0]}>
                            <meshStandardMaterial color="#333" />
                        </Box>
                        <Rotor position={[0.42, 0.1, 0.42]} color={color} speed={48} />
                        <Rotor position={[-0.42, 0.1, 0.42]} color={color} speed={-48} />
                        <Rotor position={[0.42, 0.1, -0.42]} color={color} speed={-48} />
                        <Rotor position={[-0.42, 0.1, -0.42]} color={color} speed={48} />
                        <pointLight color={color} intensity={1} distance={5} />
                    </group>

                    <Html position={[0, 1.2, 0]} center style={{ pointerEvents: 'none' }}>
                        <div className="battery-label" style={{ borderColor: color, boxShadow: `0 0 8px ${color}` }}>
                            <span ref={batteryRef}>🔋 100.0%</span>
                        </div>
                    </Html>
                </group>
            </group>

            {route.linePoints.length > 1 && (
                <Line
                    points={route.linePoints}
                    color={color}
                    lineWidth={3}
                    transparent
                    opacity={0.4}
                    dashed={false}
                />
            )}
        </group>
    );
});

const GroundTiles = React.memo(function GroundTiles({ grid, onPointerDown, onPointerMove, onPointerUp }) {
    const meshRef = useRef();
    const cells = useMemo(() => {
        const nextCells = [];

        grid.forEach((row, rowIndex) => {
            row.forEach((node, colIndex) => {
                if (!node.isWall && !node.isStart && !node.isFinish) {
                    nextCells.push({
                        row: rowIndex,
                        col: colIndex,
                        color: node.isRoad ? '#151520' : '#222233'
                    });
                }
            });
        });

        return nextCells;
    }, [grid]);

    useLayoutEffect(() => {
        if (!meshRef.current) return;

        const matrix = new THREE.Matrix4();
        const color = new THREE.Color();

        cells.forEach((cell, index) => {
            matrix.makeTranslation(
                cell.col - GRID_COLS / 2,
                -0.05,
                cell.row - GRID_ROWS / 2
            );
            meshRef.current.setMatrixAt(index, matrix);
            meshRef.current.setColorAt(index, color.set(cell.color));
        });

        meshRef.current.count = cells.length;
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        if (cells.length > 0) meshRef.current.computeBoundingSphere();
    }, [cells]);

    const withCell = (handler) => (event) => {
        const cell = cells[event.instanceId];
        if (cell) handler(event, cell.row, cell.col);
    };

    return (
        <instancedMesh
            ref={meshRef}
            args={[null, null, Math.max(1, cells.length)]}
            onPointerDown={withCell(onPointerDown)}
            onPointerMove={withCell(onPointerMove)}
            onPointerUp={onPointerUp}
        >
            <boxGeometry args={[0.95, 0.1, 0.95]} />
            <meshStandardMaterial color="#ffffff" roughness={0.8} metalness={0.1} />
        </instancedMesh>
    );
});

const CityScene = React.memo(function CityScene({ grid, onPointerDown, onPointerMove, onPointerUp }) {
    return (
        <group>
            <GroundTiles
                grid={grid}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            />

            {grid.map((row, rowIndex) =>
                row.map((node, colIndex) => {
                    if (!node.isWall && !node.isStart && !node.isFinish) return null;

                    const x = colIndex - GRID_COLS / 2;
                    const z = rowIndex - GRID_ROWS / 2;
                    const pointerProps = {
                        onPointerDown: (event) => onPointerDown(event, rowIndex, colIndex),
                        onPointerMove: (event) => onPointerMove(event, rowIndex, colIndex),
                        onPointerUp
                    };

                    if (node.isWall) {
                        const height = node.wallHeight || 3;
                        return (
                            <group key={`${rowIndex}-${colIndex}`} {...pointerProps}>
                                <Box position={[x, height / 2, z]} args={[0.9, height, 0.9]}>
                                    <meshStandardMaterial
                                        color="#2a2a35"
                                        roughness={0.2}
                                        metalness={0.9}
                                        emissive="#0a0a15"
                                    />
                                </Box>
                                <Box position={[x, height, z]} args={[0.95, 0.1, 0.95]}>
                                    <meshStandardMaterial color="#444466" roughness={0.5} metalness={0.5} />
                                </Box>
                                {height > 1.5 && (
                                    <>
                                        <Box position={[x, height * 0.75, z]} args={[0.92, 0.1, 0.92]}>
                                            <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={2.5} toneMapped={false} />
                                        </Box>
                                        <Box position={[x, height * 0.45, z]} args={[0.92, 0.1, 0.92]}>
                                            <meshStandardMaterial color="#ff2975" emissive="#ff2975" emissiveIntensity={2.5} toneMapped={false} />
                                        </Box>
                                        <Box position={[x, height * 0.15, z]} args={[0.92, 0.1, 0.92]}>
                                            <meshStandardMaterial color="#2997ff" emissive="#2997ff" emissiveIntensity={2.5} toneMapped={false} />
                                        </Box>
                                    </>
                                )}
                            </group>
                        );
                    }

                    const color = node.isStart ? '#007bff' : '#28a745';
                    const height = node.isStart ? 0.25 : 0.2;
                    const emissiveIntensity = node.isStart ? 3 : 2.5;

                    return (
                        <Box
                            key={`${rowIndex}-${colIndex}`}
                            position={[x, height / 2, z]}
                            args={[0.85, height, 0.85]}
                            {...pointerProps}
                        >
                            <meshStandardMaterial
                                color={color}
                                emissive={color}
                                emissiveIntensity={emissiveIntensity}
                                toneMapped={false}
                            />
                        </Box>
                    );
                })
            )}
        </group>
    );
});

const SceneEnvironment = React.memo(function SceneEnvironment() {
    return (
        <>
            <color attach="background" args={['#080812']} />
            <fog attach="fog" args={['#080812', 30, 110]} />
            <Stars radius={120} depth={50} count={1200} factor={4} saturation={0} fade speed={0.25} />
            <ambientLight intensity={0.6} />
            <pointLight position={[0, 60, 0]} intensity={1.5} color="#ffffff" />
            <directionalLight position={[30, 30, 30]} intensity={2} color="#c0c0ff" />
            <directionalLight position={[-30, 15, -30]} intensity={1.2} color="#ffd8a8" />
            <Grid
                position={[0, -0.01, 0]}
                args={[120, 120]}
                cellSize={1}
                cellThickness={1.2}
                cellColor="#222233"
                sectionSize={6}
                sectionThickness={2}
                sectionColor="#444466"
                fadeDistance={80}
                fadeStrength={1.5}
            />
            <EffectComposer>
                <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={240} intensity={1.5} />
            </EffectComposer>
        </>
    );
});

const DroneFleet = React.memo(function DroneFleet({ animations, runId, isAnimating, onFinish }) {
    return animations.map((drone) => (
        <Drone
            key={`${runId}-${drone.id}`}
            id={drone.id}
            runId={runId}
            path={drone.path}
            color={drone.color}
            isMoving={isAnimating}
            onFinish={onFinish}
        />
    ));
});

export default class Visualization3D extends Component {
    constructor(props) {
        super(props);
        this.state = {
            grid: [],
            timer: 0,
            buttonsDisabled: false,
            fleetSize: 3,
            numDeliveries: 7,
            payloadLimit: 5,
            useACO: true,
            droneAnimations: [],
            isAnimating: false,
            logs: [],
            showWiki: false,
            interactionMode: 'camera',
            obstacleRow: 1,
            obstacleCol: 1,
            runId: 0,
            statusMessage: 'Ready.'
        };

        this.timerInterval = null;
        this.planningTimeout = null;
        this.runStartedAt = null;
        this.runCounter = 0;
        this.activeRunId = null;
        this.finishedDroneIds = new Set();
        this.pointerEditing = false;
        this.activePointerId = null;
        this.pointerCaptureTarget = null;
        this.isUnmounted = false;
        this.terminalLogRef = React.createRef();
        this.wikiTriggerRef = React.createRef();
        this.wikiDialogRef = React.createRef();
        this.wikiCloseRef = React.createRef();
    }

    componentDidMount() {
        this.isUnmounted = false;
        const generated = this.generateDeliveries(getInitialGrid(), this.state.numDeliveries);
        this.setState({ grid: generated.grid }, () => {
            this.addLog('System initialized. 3D map rendered.');
        });

        window.addEventListener('pointerup', this.handleGlobalPointerEnd);
        window.addEventListener('pointercancel', this.handleGlobalPointerEnd);
        window.addEventListener('blur', this.handleGlobalPointerEnd);
        document.addEventListener('keydown', this.handleDocumentKeyDown);
    }

    componentWillUnmount() {
        this.isUnmounted = true;
        this.cancelActiveRun();
        window.removeEventListener('pointerup', this.handleGlobalPointerEnd);
        window.removeEventListener('pointercancel', this.handleGlobalPointerEnd);
        window.removeEventListener('blur', this.handleGlobalPointerEnd);
        document.removeEventListener('keydown', this.handleDocumentKeyDown);
    }

    addLog = (message) => {
        if (this.isUnmounted) return;

        const time = new Date().toISOString().substring(11, 23);
        this.setState((previousState) => ({
            logs: [...previousState.logs, `[${time}] ${message}`].slice(-MAX_LOG_ENTRIES)
        }), () => {
            const logElement = this.terminalLogRef.current;
            if (logElement) logElement.scrollTop = logElement.scrollHeight;
        });
    };

    generateDeliveries(grid, count) {
        const safeCount = clampInteger(count, MIN_DELIVERIES, MAX_DELIVERIES, MIN_DELIVERIES);
        const nextGrid = grid.map((row) => row.map((node) => ({ ...node, isFinish: false })));
        const eligibleNodes = [];

        nextGrid.forEach((row) => {
            row.forEach((node) => {
                if (!node.isStart && !node.isWall) eligibleNodes.push(node);
            });
        });

        for (let index = eligibleNodes.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [eligibleNodes[index], eligibleNodes[swapIndex]] = [eligibleNodes[swapIndex], eligibleNodes[index]];
        }

        const placedCount = Math.min(safeCount, eligibleNodes.length);
        eligibleNodes.slice(0, placedCount).forEach((node) => {
            node.isFinish = true;
        });

        return { grid: nextGrid, placedCount, requestedCount: safeCount };
    }

    getValidatedSettings = () => {
        const settings = {
            numDeliveries: clampInteger(
                this.state.numDeliveries,
                MIN_DELIVERIES,
                MAX_DELIVERIES,
                7
            ),
            fleetSize: clampInteger(
                this.state.fleetSize,
                MIN_FLEET_SIZE,
                MAX_FLEET_SIZE,
                3
            ),
            payloadLimit: clampInteger(
                this.state.payloadLimit,
                MIN_PAYLOAD,
                MAX_PAYLOAD,
                5
            )
        };

        if (
            settings.numDeliveries !== this.state.numDeliveries
            || settings.fleetSize !== this.state.fleetSize
            || settings.payloadLimit !== this.state.payloadLimit
        ) {
            this.setState(settings);
        }

        return settings;
    };

    getFinishNodes = (grid = this.state.grid) => {
        const finishNodes = [];
        grid.forEach((row) => row.forEach((node) => {
            if (node.isFinish) finishNodes.push(node);
        }));
        return finishNodes;
    };

    resetGridSearchState(grid) {
        grid.forEach((row) => row.forEach((node) => {
            node.isVisited = false;
            node.distance = Infinity;
            node.previousNode = null;
            node.isPath = false;
            node.isBlocked = false;
            node.z = 0;
        }));
    }

    startRunTimer(runId) {
        if (this.timerInterval) window.clearInterval(this.timerInterval);
        this.runStartedAt = performance.now();
        this.timerInterval = window.setInterval(() => {
            if (this.activeRunId !== runId || this.runStartedAt === null) return;
            this.setState({ timer: Math.round(performance.now() - this.runStartedAt) });
        }, TIMER_UPDATE_MS);
    }

    stopRunTimer() {
        if (this.timerInterval) window.clearInterval(this.timerInterval);
        this.timerInterval = null;

        const elapsed = this.runStartedAt === null
            ? this.state.timer
            : Math.round(performance.now() - this.runStartedAt);
        this.runStartedAt = null;
        return elapsed;
    }

    cancelActiveRun = () => {
        if (this.planningTimeout) window.clearTimeout(this.planningTimeout);
        this.planningTimeout = null;
        this.stopRunTimer();
        this.activeRunId = null;
        this.finishedDroneIds.clear();
        this.handleGlobalPointerEnd();
    };

    resetToInitialState = () => {
        this.cancelActiveRun();
        const settings = this.getValidatedSettings();
        const generated = this.generateDeliveries(getInitialGrid(), settings.numDeliveries);
        const runId = ++this.runCounter;

        this.setState({
            grid: generated.grid,
            numDeliveries: settings.numDeliveries,
            fleetSize: settings.fleetSize,
            payloadLimit: settings.payloadLimit,
            timer: 0,
            buttonsDisabled: false,
            droneAnimations: [],
            isAnimating: false,
            logs: [],
            interactionMode: 'camera',
            runId,
            statusMessage: `Reset complete with ${generated.placedCount} deliveries.`
        }, () => {
            this.addLog(`System completely reset with ${generated.placedCount} deliveries.`);
        });
    };

    resetPathsKeepWalls = () => {
        this.cancelActiveRun();
        const runId = ++this.runCounter;
        const grid = this.state.grid.map((row) =>
            row.map((node) => ({
                ...node,
                isVisited: false,
                distance: Infinity,
                previousNode: null,
                isPath: false,
                isBlocked: false,
                z: 0
            }))
        );

        this.setState({
            grid,
            timer: 0,
            buttonsDisabled: false,
            droneAnimations: [],
            isAnimating: false,
            runId,
            statusMessage: 'Paths cleared. Obstacles and deliveries retained.'
        }, () => {
            this.addLog('Paths cleared. Obstacles and deliveries retained.');
        });
    };

    handleRandomizeDeliveries = () => {
        this.cancelActiveRun();
        const settings = this.getValidatedSettings();
        const generated = this.generateDeliveries(this.state.grid, settings.numDeliveries);
        const runId = ++this.runCounter;

        this.setState({
            grid: generated.grid,
            numDeliveries: settings.numDeliveries,
            timer: 0,
            droneAnimations: [],
            isAnimating: false,
            runId,
            statusMessage: `${generated.placedCount} deliveries randomized.`
        }, () => {
            this.addLog(`Randomized ${generated.placedCount} delivery locations.`);
            if (generated.placedCount < generated.requestedCount) {
                this.addLog(`Only ${generated.placedCount} eligible cells were available.`);
            }
        });
    };

    handleNumericChange = (field, min, max, fallback) => (event) => {
        const value = clampInteger(event.target.value, min, max, fallback);
        this.setState({ [field]: value });
    };

    setInteractionMode = (interactionMode) => {
        this.handleGlobalPointerEnd();
        this.setState({ interactionMode });
    };

    setWall = (row, col, forceWall) => {
        const node = this.state.grid[row]?.[col];
        if (!node || node.isStart || node.isFinish || node.isWall === forceWall) return false;

        this.setState((previousState) => {
            const grid = previousState.grid.map((gridRow, rowIndex) => {
                if (rowIndex !== row) return gridRow;
                return gridRow.map((gridNode, colIndex) =>
                    colIndex === col ? { ...gridNode, isWall: forceWall } : gridNode
                );
            });
            return { grid };
        });
        return true;
    };

    handlePointerDown = (event, row, col) => {
        const { interactionMode, buttonsDisabled } = this.state;
        if (
            interactionMode === 'camera' ||
            buttonsDisabled ||
            (event.button !== undefined && event.button !== 0)
        ) return;

        event.stopPropagation();
        this.pointerEditing = true;
        this.activePointerId = event.pointerId;
        this.pointerCaptureTarget = event.nativeEvent?.target || null;
        if (this.pointerCaptureTarget?.setPointerCapture) {
            try {
                this.pointerCaptureTarget.setPointerCapture(event.pointerId);
            } catch (_) {
                this.pointerCaptureTarget = null;
            }
        }

        this.setWall(row, col, interactionMode === 'draw');
    };

    handlePointerMove = (event, row, col) => {
        if (!this.pointerEditing || event.pointerId !== this.activePointerId) return;
        event.stopPropagation();
        this.setWall(row, col, this.state.interactionMode === 'draw');
    };

    handleGlobalPointerEnd = () => {
        if (this.pointerCaptureTarget?.releasePointerCapture && this.activePointerId !== null) {
            try {
                if (this.pointerCaptureTarget.hasPointerCapture?.(this.activePointerId)) {
                    this.pointerCaptureTarget.releasePointerCapture(this.activePointerId);
                }
            } catch (_) {
                // The browser already released this pointer.
            }
        }

        this.pointerEditing = false;
        this.activePointerId = null;
        this.pointerCaptureTarget = null;
    };

    editObstacleAtCoordinates = (forceWall) => {
        const row = clampInteger(this.state.obstacleRow, 1, GRID_ROWS, 1);
        const col = clampInteger(this.state.obstacleCol, 1, GRID_COLS, 1);
        this.setState({ obstacleRow: row, obstacleCol: col });

        const changed = this.setWall(row - 1, col - 1, forceWall);
        if (changed) {
            this.addLog(`${forceWall ? 'Added' : 'Removed'} obstacle at row ${row}, column ${col}.`);
        } else {
            this.addLog(`Cell at row ${row}, column ${col} is protected or already ${forceWall ? 'blocked' : 'clear'}.`);
        }
    };

    analyzeFleet = () => {
        const { payloadLimit } = this.getValidatedSettings();
        const finishNodes = this.getFinishNodes();

        if (finishNodes.length === 0) {
            this.addLog('No deliveries to analyze. Randomize deliveries first.');
            this.setState({ statusMessage: 'No deliveries available for fleet analysis.' });
            return;
        }

        let totalEstimatedDistance = 0;
        let currentStart = this.state.grid[startNodeRow][startNodeCol];
        const unvisited = [...finishNodes];

        while (unvisited.length > 0) {
            let nearestIndex = 0;
            let minimumDistance = Infinity;
            for (let index = 0; index < unvisited.length; index++) {
                const distance = Math.abs(currentStart.row - unvisited[index].row)
                    + Math.abs(currentStart.col - unvisited[index].col);
                if (distance < minimumDistance) {
                    minimumDistance = distance;
                    nearestIndex = index;
                }
            }
            totalEstimatedDistance += minimumDistance;
            currentStart = unvisited[nearestIndex];
            unvisited.splice(nearestIndex, 1);
        }

        totalEstimatedDistance += Math.abs(currentStart.row - startNodeRow)
            + Math.abs(currentStart.col - startNodeCol);

        const fleetByBattery = Math.ceil(totalEstimatedDistance / MAX_BATTERY);
        const fleetByPayload = Math.ceil(finishNodes.length / payloadLimit);
        const optimalFleet = Math.min(
            MAX_FLEET_SIZE,
            Math.max(MIN_FLEET_SIZE, fleetByBattery, fleetByPayload)
        );

        this.setState({
            fleetSize: optimalFleet,
            statusMessage: `Recommended fleet size: ${optimalFleet} drones.`
        });
        this.addLog('--- Fleet Analysis ---');
        this.addLog(`Total Deliveries: ${finishNodes.length}`);
        this.addLog(`Max Payload per Drone: ${payloadLimit} units`);
        this.addLog(`Drone Safe Range: ${MAX_BATTERY} units`);
        this.addLog(`Recommended Fleet Size: ${optimalFleet} drones`);
    };

    planStandardLeg(algorithm, grid, startNode, finishNode, startTime) {
        this.resetGridSearchState(grid);

        if (startNode === finishNode) return normalizeTimedPath([startNode], startTime);

        const visitedNodes = algorithm === 'dijkstra'
            ? dijkstra(grid, startNode, finishNode)
            : aStar(grid, startNode, finishNode);
        const reachedTarget = visitedNodes.includes(finishNode) || finishNode.isVisited;
        if (!reachedTarget) return null;

        const rawPath = algorithm === 'dijkstra'
            ? getNodesInShortestPathOrder(startNode, finishNode)
            : getNodesInShortestPathOrderAStar(startNode, finishNode);

        if (!rawPath || rawPath.length === 0 || rawPath[0] !== startNode || rawPath[rawPath.length - 1] !== finishNode) {
            return null;
        }

        return normalizeTimedPath(rawPath, startTime);
    }

    planMapfLeg(grid, startPoint, finishPoint, startTime, reservationTable, options = { goalHoldTicks: 0 }) {
        this.resetGridSearchState(grid);
        const target = { ...finishPoint, z: Number.isFinite(Number(finishPoint.z)) ? Number(finishPoint.z) : 0 };
        const result = cooperativeAStar(
            grid,
            startPoint,
            target,
            startTime,
            reservationTable,
            options
        );
        const rawPath = result?.path || [];
        if (rawPath.length === 0) return null;

        let timedPath = normalizeTimedPath(rawPath, startTime);
        const lastPoint = timedPath[timedPath.length - 1];
        if (!samePosition(lastPoint, target)) return null;

        return extendPathToReportedEnd(timedPath, result.endTime);
    }

    completeRunWithFailure = (runId, message) => {
        if (this.activeRunId !== runId) return;

        const elapsed = this.stopRunTimer();
        this.activeRunId = null;
        this.finishedDroneIds.clear();
        this.setState({
            timer: elapsed,
            buttonsDisabled: false,
            droneAnimations: [],
            isAnimating: false,
            statusMessage: message
        }, () => {
            this.addLog(`Planning stopped: ${message}`);
        });
    };

    planRun = (runId, algorithm, settings) => {
        this.planningTimeout = null;
        if (this.activeRunId !== runId) return;

        try {
            const grid = this.state.grid;
            const finishNodes = this.getFinishNodes(grid);
            if (finishNodes.length === 0) throw new PlanningError('No deliveries are available.');

            const effectiveFleetSize = Math.min(settings.fleetSize, finishNodes.length);
            let clusters = allocateDeliveries(finishNodes, effectiveFleetSize);
            if (!Array.isArray(clusters) || clusters.length === 0) {
                throw new PlanningError('Delivery allocation produced no routes.');
            }

            this.addLog('--- Starting Fleet Optimization ---');
            this.addLog(`Algorithm: ${algorithm.toUpperCase()}`);
            this.addLog(`Fleet Size: ${effectiveFleetSize}`);
            this.addLog(`Allocating ${finishNodes.length} deliveries into ${effectiveFleetSize} spatial clusters...`);

            const allDroneAnimations = [];
            const reservationTable = new ReservationTable();
            const baseNode = grid[startNodeRow][startNodeCol];

            for (let droneIndex = 0; droneIndex < clusters.length; droneIndex++) {
                let cluster = clusters[droneIndex];
                if (!cluster || cluster.length === 0) continue;

                const color = DRONE_COLORS[droneIndex % DRONE_COLORS.length];
                this.addLog(`Drone ${droneIndex + 1} assigned ${cluster.length} deliveries.`);

                if (this.state.useACO) {
                    this.addLog(`Drone ${droneIndex + 1}: Optimizing delivery order with ACO...`);
                    const random = createSeededRandom(createAcoSeed(
                        baseNode,
                        cluster,
                        settings.payloadLimit,
                        droneIndex
                    ));
                    cluster = optimizeRouteWithACO(baseNode, cluster, {
                        random,
                        payloadLimit: settings.payloadLimit
                    });
                }
                if (!Array.isArray(cluster)) throw new PlanningError(`Drone ${droneIndex + 1} routing failed.`);

                const route = [];
                let currentStart = algorithm === 'mapf' ? { ...baseNode, z: 0 } : baseNode;
                let currentTime = droneIndex * DEPOT_LAUNCH_STAGGER_TICKS;
                if (algorithm === 'mapf') {
                    while (reservationTable.isReserved(baseNode.row, baseNode.col, 0, currentTime)) {
                        currentTime += 1;
                    }
                }

                const planLeg = (finishNode, options = { goalHoldTicks: 0 }) => {
                    if (algorithm === 'mapf') {
                        return this.planMapfLeg(
                            grid,
                            currentStart,
                            { ...finishNode, z: 0 },
                            currentTime,
                            reservationTable,
                            options
                        );
                    }
                    return this.planStandardLeg(algorithm, grid, currentStart, finishNode, currentTime);
                };

                const acceptLeg = (leg, finishNode, failureMessage) => {
                    if (!leg || leg.length === 0) throw new PlanningError(failureMessage);
                    appendTimedPath(route, leg);
                    const lastPoint = leg[leg.length - 1];
                    currentTime = lastPoint.time;
                    currentStart = algorithm === 'mapf'
                        ? { ...finishNode, z: lastPoint.z, time: lastPoint.time }
                        : finishNode;
                };

                for (let deliveryIndex = 0; deliveryIndex < cluster.length; deliveryIndex++) {
                    if (deliveryIndex > 0 && deliveryIndex % settings.payloadLimit === 0) {
                        this.addLog(`Drone ${droneIndex + 1}: Returning to base for a ${RELOAD_TICKS}-tick reload.`);
                        const reloadLeg = planLeg(baseNode, { goalHoldTicks: RELOAD_TICKS });
                        acceptLeg(
                            reloadLeg,
                            baseNode,
                            `Drone ${droneIndex + 1} cannot reach the depot for reload.`
                        );

                        const dwellStart = route[route.length - 1];
                        const dwellPath = [
                            { ...dwellStart },
                            { ...dwellStart, time: dwellStart.time + RELOAD_TICKS }
                        ];
                        appendTimedPath(route, dwellPath);
                        currentTime = dwellStart.time + RELOAD_TICKS;
                        currentStart = algorithm === 'mapf'
                            ? { ...baseNode, z: dwellStart.z, time: currentTime }
                            : baseNode;
                    }

                    const delivery = grid[cluster[deliveryIndex].row][cluster[deliveryIndex].col];
                    const deliveryLeg = planLeg(delivery, { goalHoldTicks: 0 });
                    acceptLeg(
                        deliveryLeg,
                        delivery,
                        `Drone ${droneIndex + 1} cannot reach delivery at row ${delivery.row + 1}, column ${delivery.col + 1}.`
                    );
                }

                this.addLog(`Drone ${droneIndex + 1}: Calculating return trajectory to base...`);
                const returnLeg = planLeg(baseNode, { goalHoldTicks: 0 });
                acceptLeg(
                    returnLeg,
                    baseNode,
                    `Drone ${droneIndex + 1} cannot return to the depot.`
                );

                if (algorithm === 'mapf') reserveTimedPath(reservationTable, route);

                allDroneAnimations.push({
                    path: route,
                    color,
                    id: droneIndex,
                    runId
                });
            }

            this.resetGridSearchState(grid);
            if (allDroneAnimations.length === 0) {
                throw new PlanningError('No drone routes could be created.');
            }
            if (this.activeRunId !== runId) return;

            this.finishedDroneIds.clear();
            this.addLog('Calculations complete. Commencing 3D simulation...');
            this.setState({
                droneAnimations: allDroneAnimations,
                isAnimating: true,
                statusMessage: `Simulation running with ${allDroneAnimations.length} drones.`
            });
        } catch (error) {
            const message = error instanceof PlanningError
                ? error.message
                : 'An unexpected route-planning error occurred.';
            this.completeRunWithFailure(runId, message);
        }
    };

    visualizeOptimizedFleet = (algorithm) => {
        const allowedAlgorithms = ['mapf', 'astar', 'dijkstra'];
        if (!allowedAlgorithms.includes(algorithm)) return;

        const settings = this.getValidatedSettings();
        const finishNodes = this.getFinishNodes();
        this.cancelActiveRun();

        if (finishNodes.length === 0) {
            this.setState({
                timer: 0,
                buttonsDisabled: false,
                droneAnimations: [],
                isAnimating: false,
                statusMessage: 'No deliveries are available. Randomize deliveries first.'
            }, () => this.addLog('No deliveries are available. Randomize deliveries before running.'));
            return;
        }

        const runId = ++this.runCounter;
        this.activeRunId = runId;
        this.finishedDroneIds.clear();
        this.startRunTimer(runId);

        this.setState({
            ...settings,
            runId,
            timer: 0,
            buttonsDisabled: true,
            droneAnimations: [],
            isAnimating: false,
            statusMessage: `Planning ${algorithm.toUpperCase()} routes...`
        }, () => {
            if (this.activeRunId !== runId) return;
            this.planningTimeout = window.setTimeout(
                () => this.planRun(runId, algorithm, settings),
                0
            );
        });
    };

    handleDroneFinish = (runId, droneId) => {
        if (runId !== this.activeRunId || this.finishedDroneIds.has(droneId)) return;

        this.finishedDroneIds.add(droneId);
        if (this.finishedDroneIds.size < this.state.droneAnimations.length) return;

        const elapsed = this.stopRunTimer();
        this.activeRunId = null;
        this.setState({
            timer: elapsed,
            buttonsDisabled: false,
            isAnimating: false,
            statusMessage: `Simulation complete in ${elapsed} milliseconds.`
        }, () => {
            this.addLog(`Simulation complete. Total time: ${elapsed}ms`);
        });
    };

    openWiki = () => {
        this.setState({ showWiki: true }, () => {
            window.requestAnimationFrame(() => {
                (this.wikiCloseRef.current || this.wikiDialogRef.current)?.focus();
            });
        });
    };

    closeWiki = () => {
        this.setState({ showWiki: false }, () => {
            this.wikiTriggerRef.current?.focus();
        });
    };

    handleDocumentKeyDown = (event) => {
        if (!this.state.showWiki) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            this.closeWiki();
            return;
        }

        if (event.key !== 'Tab' || !this.wikiDialogRef.current) return;

        const focusableElements = Array.from(
            this.wikiDialogRef.current.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        );
        if (focusableElements.length === 0) {
            event.preventDefault();
            this.wikiDialogRef.current.focus();
            return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    handleWikiBackdropMouseDown = (event) => {
        if (event.target === event.currentTarget) this.closeWiki();
    };

    render() {
        const {
            grid,
            timer,
            buttonsDisabled,
            fleetSize,
            numDeliveries,
            payloadLimit,
            useACO,
            droneAnimations,
            isAnimating,
            showWiki,
            interactionMode,
            obstacleRow,
            obstacleCol,
            runId,
            statusMessage
        } = this.state;

        const canvasDescription = 'Interactive 3D city map. Use Camera mode to orbit the view. Use Draw or Erase mode with pointer input, or the row and column controls, to edit obstacles. Blue marks the depot and green marks deliveries.';

        return (
            <main className="visualization-app">
                <header className="control-panel">
                    <div className="title-row">
                        <h1>AERO-PATH: 3D UAV Path Planning &amp; Fleet Optimization</h1>
                        <Button
                            ref={this.wikiTriggerRef}
                            variant="outline-info"
                            onClick={this.openWiki}
                            aria-haspopup="dialog"
                        >
                            📖 Project Wiki
                        </Button>
                    </div>

                    <div className="settings-row">
                        <div className="control-group">
                            <label htmlFor="delivery-count">Deliveries</label>
                            <input
                                id="delivery-count"
                                type="number"
                                value={numDeliveries}
                                min={MIN_DELIVERIES}
                                max={MAX_DELIVERIES}
                                onChange={this.handleNumericChange('numDeliveries', MIN_DELIVERIES, MAX_DELIVERIES, 7)}
                                disabled={buttonsDisabled}
                            />
                            <Button
                                variant="outline-light"
                                size="sm"
                                onClick={this.handleRandomizeDeliveries}
                                disabled={buttonsDisabled}
                            >
                                🔄 Randomize
                            </Button>
                        </div>

                        <div className="control-group">
                            <label htmlFor="fleet-size">Drones</label>
                            <input
                                id="fleet-size"
                                type="number"
                                value={fleetSize}
                                min={MIN_FLEET_SIZE}
                                max={MAX_FLEET_SIZE}
                                onChange={this.handleNumericChange('fleetSize', MIN_FLEET_SIZE, MAX_FLEET_SIZE, 3)}
                                disabled={buttonsDisabled}
                            />
                            <Button
                                variant="info"
                                size="sm"
                                onClick={this.analyzeFleet}
                                disabled={buttonsDisabled}
                            >
                                🧠 Auto-Optimize
                            </Button>
                        </div>

                        <div className="control-group">
                            <label htmlFor="payload-limit">Payload max</label>
                            <input
                                id="payload-limit"
                                className="payload-input"
                                type="number"
                                value={payloadLimit}
                                min={MIN_PAYLOAD}
                                max={MAX_PAYLOAD}
                                onChange={this.handleNumericChange('payloadLimit', MIN_PAYLOAD, MAX_PAYLOAD, 5)}
                                disabled={buttonsDisabled}
                            />
                        </div>

                        <div className="control-group checkbox-group">
                            <input
                                id="use-aco"
                                type="checkbox"
                                checked={useACO}
                                onChange={(event) => this.setState({ useACO: event.target.checked })}
                                disabled={buttonsDisabled}
                            />
                            <label htmlFor="use-aco">Swarm ACO routing</label>
                        </div>

                        <fieldset className="obstacle-tools" disabled={buttonsDisabled}>
                            <legend>Obstacle pointer tool</legend>
                            <div className="tool-buttons" role="group" aria-label="Obstacle pointer mode">
                                {[
                                    ['camera', 'Camera'],
                                    ['draw', 'Draw'],
                                    ['erase', 'Erase']
                                ].map(([mode, label]) => (
                                    <Button
                                        key={mode}
                                        variant={interactionMode === mode ? 'info' : 'outline-info'}
                                        size="sm"
                                        aria-pressed={interactionMode === mode}
                                        onClick={() => this.setInteractionMode(mode)}
                                    >
                                        {label}
                                    </Button>
                                ))}
                            </div>
                        </fieldset>

                        <fieldset className="coordinate-editor" disabled={buttonsDisabled}>
                            <legend>Keyboard obstacle editor</legend>
                            <label htmlFor="obstacle-row">Row</label>
                            <input
                                id="obstacle-row"
                                type="number"
                                min="1"
                                max={GRID_ROWS}
                                value={obstacleRow}
                                onChange={this.handleNumericChange('obstacleRow', 1, GRID_ROWS, 1)}
                            />
                            <label htmlFor="obstacle-column">Column</label>
                            <input
                                id="obstacle-column"
                                type="number"
                                min="1"
                                max={GRID_COLS}
                                value={obstacleCol}
                                onChange={this.handleNumericChange('obstacleCol', 1, GRID_COLS, 1)}
                            />
                            <Button variant="outline-success" size="sm" onClick={() => this.editObstacleAtCoordinates(true)}>
                                Add
                            </Button>
                            <Button variant="outline-warning" size="sm" onClick={() => this.editObstacleAtCoordinates(false)}>
                                Remove
                            </Button>
                        </fieldset>
                    </div>

                    <div className="action-row">
                        <Button variant="success" className="btn-glow" onClick={() => this.visualizeOptimizedFleet('mapf')} disabled={buttonsDisabled}>
                            Run MAPF (Cooperative A*)
                        </Button>
                        <Button variant="primary" onClick={() => this.visualizeOptimizedFleet('astar')} disabled={buttonsDisabled}>
                            Run Standard A*
                        </Button>
                        <Button variant="primary" onClick={() => this.visualizeOptimizedFleet('dijkstra')} disabled={buttonsDisabled}>
                            Run Dijkstra
                        </Button>
                        <Button variant="danger" onClick={this.resetToInitialState}>
                            Reset Everything
                        </Button>
                        <Button variant="warning" onClick={this.resetPathsKeepWalls}>
                            Reset Paths
                        </Button>
                        <output className="timer-display" aria-label={`Elapsed time: ${timer} milliseconds`}>
                            ⏱️ {timer}ms
                        </output>
                    </div>
                </header>

                <section className="viewport-region" aria-label="3D route simulation">
                    <p id="simulation-canvas-description" className="visually-hidden">
                        {canvasDescription}
                    </p>
                    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
                        {statusMessage}
                    </div>

                    <Canvas
                        className="simulation-canvas"
                        camera={CAMERA_CONFIG}
                        dpr={CANVAS_DPR}
                        role="img"
                        aria-label="Interactive 3D drone route map"
                        aria-describedby="simulation-canvas-description"
                        onPointerUp={this.handleGlobalPointerEnd}
                        onPointerCancel={this.handleGlobalPointerEnd}
                    >
                        <SceneEnvironment />
                        <OrbitControls
                            enabled={interactionMode === 'camera' && !showWiki}
                            maxPolarAngle={Math.PI / 2 - 0.05}
                            minDistance={10}
                            maxDistance={120}
                            makeDefault
                        />
                        <CityScene
                            grid={grid}
                            onPointerDown={this.handlePointerDown}
                            onPointerMove={this.handlePointerMove}
                            onPointerUp={this.handleGlobalPointerEnd}
                        />
                        <DroneFleet
                            animations={droneAnimations}
                            runId={runId}
                            isAnimating={isAnimating}
                            onFinish={this.handleDroneFinish}
                        />
                    </Canvas>

                    <aside className="controls-help" aria-label="Map controls">
                        <h2>🎮 Controls</h2>
                        <p><strong>Camera mode:</strong> drag to rotate, right-drag to pan, scroll to zoom.</p>
                        <p><strong>Draw / Erase:</strong> drag across cells, or use the row and column editor.</p>
                    </aside>

                    <aside className="simulation-terminal" aria-labelledby="terminal-title">
                        <div className="terminal-header">
                            <h2 id="terminal-title">&gt;_ SIMULATION_TERMINAL</h2>
                            <button type="button" onClick={() => this.setState({ logs: [] })} aria-label="Clear simulation terminal">
                                [CLEAR]
                            </button>
                        </div>
                        <div
                            ref={this.terminalLogRef}
                            className="terminal-log"
                            role="log"
                            aria-live="polite"
                            aria-relevant="additions"
                        >
                            {this.state.logs.map((log, index) => (
                                <div key={`${index}-${log}`}>{log}</div>
                            ))}
                        </div>
                    </aside>
                </section>

                {showWiki && (
                    <div className="wiki-backdrop" onMouseDown={this.handleWikiBackdropMouseDown}>
                        <div
                            ref={this.wikiDialogRef}
                            className="wiki-dialog"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="wiki-title"
                            tabIndex="-1"
                        >
                            <button
                                ref={this.wikiCloseRef}
                                type="button"
                                className="wiki-close"
                                onClick={this.closeWiki}
                                aria-label="Close project wiki"
                            >
                                ×
                            </button>
                            <h2 id="wiki-title" className="visually-hidden">AERO-PATH Project Wiki</h2>
                            <div className="wiki-content">
                                <React.Suspense fallback={<p role="status">Loading project wiki…</p>}>
                                    <LazyWikiMarkdown />
                                </React.Suspense>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        );
    }
}
