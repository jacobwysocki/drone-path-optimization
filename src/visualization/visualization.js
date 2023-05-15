import React, {Component} from 'react';
import Node from './node/node';
import {dijkstra, getNodesInShortestPathOrder} from '../algorithms/dijkstra';
import {aStar, getNodesInShortestPathOrderaStar} from '../algorithms/aStar';

import './visualization.css';

const START_NODE_ROW = 5;
const START_NODE_COL = 7;

const FINISH_NODE_ROW = [1,10, 1, 10, 3, 17];
const FINISH_NODE_COL = [1,10, 15, 35,40, 49];


let shortestPath = [];

export default class Visualization extends Component {
    constructor() {
        super();
        this.state = {
            grid: [],
            mouseIsPressed: false,
            timer: 0,
            buttonsDisabled: false,
            animationTimer: 0,
        };
    }

    componentDidMount() {
        const grid = getInitialGrid();
        this.setState({grid});
    }

    resetToInitialState() {
        const grid = getInitialGrid();
        this.setState({grid, timer: 0, buttonsDisabled: false});

        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[0].length; col++) {
                const node = grid[row][col];
                let className = 'node';
                if (node.isStart) className = 'node node-start';
                else if (node.isFinish) className = 'node node-finish';
                document.getElementById(`node-${node.row}-${node.col}`).className = className;
            }
        }
    }

    resetWithoutWalls() {
        const grid = getGridWithoutResettingWalls(this.state.grid);
        this.setState({grid, timer: 0, buttonsDisabled: false});

        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[0].length; col++) {
                const node = grid[row][col];
                let className = 'node';
                if (node.isStart) className = 'node node-start';
                else if (node.isFinish) className = 'node node-finish';
                else if (node.isWall) className = 'node node-wall';
                document.getElementById(`node-${node.row}-${node.col}`).className = className;
            }
        }
    }

    handleMouseDown(row, col) {
        const node = this.state.grid[row][col];
        if (!node.isStart && !node.isFinish) {
            const newGrid = getNewGridWithWallToggled(this.state.grid, row, col);
            this.setState({ grid: newGrid, mouseIsPressed: true });
        }
    }

    handleMouseEnter(row, col) {
        if (!this.state.mouseIsPressed) return;
        const node = this.state.grid[row][col];
        if (!node.isStart && !node.isFinish) {
            const newGrid = getNewGridWithWallToggled(this.state.grid, row, col);
            this.setState({ grid: newGrid });
        }
    }

    handleMouseUp() {
        this.setState({mouseIsPressed: false});
    }

    animateDijkstra(visitedNodesInOrder, nodesInShortestPathOrder) {
        return new Promise((resolve) => {
            for (let i = 0; i <= visitedNodesInOrder.length; i++) {
                if (i === visitedNodesInOrder.length) {
                    setTimeout(() => {
                        this.animateShortestPath(nodesInShortestPathOrder).then(() => {
                            resolve();
                        });
                    }, 10 * i);
                    return;
                }
                setTimeout(() => {
                    const node = visitedNodesInOrder[i];
                    if (!node.isStart && !node.isFinish) {
                        document.getElementById(`node-${node.row}-${node.col}`).className =
                            'node node-visited';
                    }
                }, 10 * i);
            }
        });
    }

    animateShortestPath(nodesInShortestPathOrder) {
        return new Promise((resolve) => {
            const delay = 100;
            for (let i = 0; i < nodesInShortestPathOrder.length; i++) {
                const node = nodesInShortestPathOrder[i];
                if (!node.isStart) {
                    setTimeout(() => {
                        document.getElementById(`node-${node.row}-${node.col}`).className =
                            'node node-shortest-path';
                    }, delay * i);

                    // Make the node disappear
                    setTimeout(() => {
                        document.getElementById(`node-${node.row}-${node.col}`).className =
                            'node';

                        // Resolve the promise after the last node disappears
                        if (i === nodesInShortestPathOrder.length - 1) {
                            resolve();
                        }
                    }, delay * nodesInShortestPathOrder.length + delay * (nodesInShortestPathOrder.length - i));
                }
            }
        });
    }


    async visualizeDijkstra(finishRow, finishCol) {
        const { grid } = this.state;
        const startNode = grid[START_NODE_ROW][START_NODE_COL];
        const finishNode = grid[finishRow][finishCol];
        const visitedNodesInOrder = dijkstra(grid, startNode, finishNode);
        const nodesInShortestPathOrder = getNodesInShortestPathOrder(startNode, finishNode, grid);
        return this.animateDijkstra(visitedNodesInOrder, nodesInShortestPathOrder);
    }

    async visualizeMultipleDijkstra() {
        this.setState({ buttonsDisabled: true });
        const startTime = Date.now(); // Record the start time

        for (let index = 0; index < FINISH_NODE_ROW.length; index++) {
            // Visualize the path and wait for it to finish before starting a new one
            await this.visualizeDijkstra(FINISH_NODE_ROW[index], FINISH_NODE_COL[index]);

            // After the path has been visualized, we block all the nodes in the path
            // and schedule them to be freed after a certain delay

            //do it on the shortestpath of the drone
            for (let row = 0; row < this.state.grid.length; row++) {
                for (let col = 0; col < this.state.grid[0].length; col++) {
                    const node = this.state.grid[row][col];
                    if (node.isPath) {
                        node.isBlocked = true;
                        setTimeout(() => {
                            node.isBlocked = false;
                        }, 2000); // Replace 2000 with your desired delay
                    }
                }
            }
            // Here we reset the grid state after the nodes are unblocked
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for the nodes to be unblocked

            //do not call the reset, try to working out the erase. Issues with multithreaded code
            this.resetGrid();
        }

        const endTime = Date.now(); // Record the end time
        this.setState({ timer: endTime - startTime, buttonsDisabled: false }); // Update the timer state and re-enable buttons
    }

    resetGrid() {
        const grid = this.state.grid;
        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[0].length; col++) {
                const node = grid[row][col];
                node.isVisited = false;
                node.distance = Infinity;
                node.previousNode = null;
            }
        }
        this.setState({ grid });
    }


    async visualizeAStar(finishRow, finishCol) {
        const { grid } = this.state;
        const startNode = grid[START_NODE_ROW][START_NODE_COL];
        const finishNode = grid[finishRow][finishCol];
        const visitedNodesInOrder = aStar(grid, startNode, finishNode);
        const nodesInShortestPathOrder = getNodesInShortestPathOrderaStar(startNode, finishNode, grid);
        return this.animateDijkstra(visitedNodesInOrder, nodesInShortestPathOrder);
    }

    async visualizeMultipleAStar() {
        this.setState({ buttonsDisabled: true });
        const startTime = Date.now(); // Record the start time

        for (let index = 0; index < FINISH_NODE_ROW.length; index++) {
            // Visualize the path and wait for it to finish before starting a new one
            await this.visualizeAStar(FINISH_NODE_ROW[index], FINISH_NODE_COL[index]);

            // After the path has been visualized, we block all the nodes in the path
            // and schedule them to be freed after a certain delay
            for (let row = 0; row < this.state.grid.length; row++) {
                for (let col = 0; col < this.state.grid[0].length; col++) {
                    const node = this.state.grid[row][col];
                    if (node.isPath) {
                        node.isBlocked = true;
                        console.log(node)
                        setTimeout(() => {
                            node.isBlocked = false;
                        }, 2000); // Replace 2000 with your desired delay
                    }
                }
            }
            // Here we reset the grid state after the nodes are unblocked
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for the nodes to be unblocked
            this.resetGrid();
        }

        const endTime = Date.now(); // Record the end time
        this.setState({ timer: endTime - startTime, buttonsDisabled: false }); // Update the timer state and re-enable buttons
    }


    render() {
        const {grid, mouseIsPressed, timer, buttonsDisabled, animationTimer} = this.state;

        return (
            <>
                <button onClick={() => this.visualizeMultipleDijkstra()} disabled={buttonsDisabled}>
                    Visualize Dijkstra's Algorithm
                </button>
                <button onClick={() => this.visualizeMultipleAStar()} disabled={buttonsDisabled}>
                    Visualize aStar Algorithm
                </button>
                <button onClick={() => this.resetToInitialState()}>
                    Reset Grid and Timer
                </button>

                <button onClick={() => this.resetWithoutWalls()}>
                    Reset Grid and Timer Without Walls
                </button>

                <p>Time to get to all finish nodes: {timer}ms</p>
                <p>Animation time: {animationTimer}ms</p>


                <div className="grid">
                </div>

                <div className="grid">
                    {grid.map((row, rowIdx) => {
                        return (
                            <div key={rowIdx}>
                                {row.map((node, nodeIdx) => {
                                    const {row, col, isFinish, isStart, isWall, isShortestPath, isShortestPathRemoved} = node;
                                    return (
                                        <Node
                                            key={nodeIdx}
                                            col={col}
                                            isFinish={isFinish}
                                            isStart={isStart}
                                            isWall={isWall}
                                            isShortestPath={isShortestPath}
                                            isShortestPathRemoved={isShortestPathRemoved}
                                            mouseIsPressed={mouseIsPressed}
                                            onMouseDown={(row, col) => this.handleMouseDown(row, col)}
                                            onMouseEnter={(row, col) =>
                                                this.handleMouseEnter(row, col)
                                            }
                                            onMouseUp={() => this.handleMouseUp()}
                                            row={row}></Node>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </>
        );
    }
}

const getInitialGrid = () => {
    const grid = [];
    for (let row = 0; row < 20; row++) {
        const currentRow = [];
        for (let col = 0; col < 50; col++) {
            currentRow.push(createNode(col, row));
        }
        grid.push(currentRow);
    }
    return grid;
};

const getGridWithoutResettingWalls = (grid) => {
    const newGrid = [];
    for (let row = 0; row < grid.length; row++) {
        const currentRow = [];
        for (let col = 0; col < grid[0].length; col++) {
            const node = grid[row][col];
            currentRow.push({
                ...node,
                distance: Infinity,
                isVisited: false,
                isShortestPath: false,
                previousNode: null,
            });
        }
        newGrid.push(currentRow);
    }
    return newGrid;
};

const createNode = (col, row) => {
    let isFinish = false;
    for (let i = 0; i < FINISH_NODE_ROW.length; i++) {
        if (row === FINISH_NODE_ROW[i] && col === FINISH_NODE_COL[i]) {
            isFinish = true;
            break;
        }
    }
    return {
        col,
        row,
        isStart: row === START_NODE_ROW && col === START_NODE_COL,
        isFinish: isFinish,
        distance: Infinity,
        isVisited: false,
        isWall: false,
        previousNode: null,
        isPath: false, // New property to track if node is part of a path
        isBlocked: false // New property to track if node is currently blocked
    };
};

const getNewGridWithWallToggled = (grid, row, col) => {
    const newGrid = grid.slice();
    const node = newGrid[row][col];
    const newNode = {
        ...node,
        isWall: !node.isWall,
    };
    newGrid[row][col] = newNode;
    //console.log(newGrid);
    console.log(newNode);
    return newGrid;

};