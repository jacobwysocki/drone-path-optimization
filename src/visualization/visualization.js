import React, {Component} from 'react';
import Node from './node/node';
import {dijkstra, getNodesInShortestPathOrder} from '../algorithms/dijkstra';
import {aStar, getNodesInShortestPathOrderaStar} from '../algorithms/aStar';

import './visualization.css';

const START_NODE_ROW = 5;
const START_NODE_COL = 7;

const FINISH_NODE_ROW = [10, 1];
const FINISH_NODE_COL = [10, 15];


let shortestPath = [];

export default class Visualization extends Component {
    constructor() {
        super();
        this.state = {
            grid: [],
            mouseIsPressed: false,
            timer: 0,
        };
    }

    componentDidMount() {
        const grid = getInitialGrid();
        this.setState({grid});
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
            const delay = 50;
            for (let i = 0; i < nodesInShortestPathOrder.length; i++) {
                const node = nodesInShortestPathOrder[i];
                if (!node.isStart && !node.isFinish) {
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
                    }, delay * i + delay * nodesInShortestPathOrder.length);
                }
            }
        });
    }



    resetGrid() {
        const { grid } = this.state;
        const newGrid = grid.slice();

        for (let row = 0; row < newGrid.length; row++) {
            for (let col = 0; col < newGrid[row].length; col++) {
                const node = newGrid[row][col];

                if (!node.isStart && !node.isFinish && !node.isWall) {
                    const newNode = {
                        ...node,
                        isVisited: false,
                        isShortestPath: false,
                        distance: Infinity,
                        previousNode: null,
                    };
                    newGrid[row][col] = newNode;
                    document.getElementById(`node-${row}-${col}`).className = "node";
                }
            }
        }

        this.setState({ grid: newGrid });
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
        const promises = [];
        const startTime = Date.now(); // Record the start time

        for (let index = 0; index < FINISH_NODE_ROW.length; index++) {
            promises.push(this.visualizeDijkstra(FINISH_NODE_ROW[index], FINISH_NODE_COL[index]));
        }

        Promise.all(promises).then(() => {
            const endTime = Date.now(); // Record the end time
            this.setState({ timer: endTime - startTime }); // Update the timer state
            this.resetGrid();
        });
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
        const promises = [];

        const startTime = Date.now(); // Record the start time

        for (let index = 0; index < FINISH_NODE_ROW.length; index++) {
            promises.push(this.visualizeAStar(FINISH_NODE_ROW[index], FINISH_NODE_COL[index]));
        }

        Promise.all(promises).then(() => {
            const endTime = Date.now(); // Record the end time
            this.setState({ timer: endTime - startTime }); // Update the timer state
            this.resetGrid();
        });
    }





    render() {
        const {grid, mouseIsPressed, timer} = this.state;

        return (
            <>
                <button onClick={() => this.visualizeMultipleDijkstra()}>
                    Visualize Dijkstra's Algorithm
                </button>
                <button onClick={() => this.visualizeMultipleAStar()}>
                    Visualize aStar Algorithm
                </button>
                <p>Elapsed time: {timer}ms</p> {/* Display the timer */}
                <div className="grid">
                    {/* Rest of your code */}
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
    for (let row = 0; row < 25; row++) {
        const currentRow = [];
        for (let col = 0; col < 25; col++) {
            currentRow.push(createNode(col, row));
        }
        grid.push(currentRow);
    }
    return grid;
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
        isFinish,
        distance: Infinity,
        isVisited: false,
        isWall: false,
        isShortestPath: false,
        previousNode: null,
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