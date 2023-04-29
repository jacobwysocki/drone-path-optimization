import React, {Component} from 'react';
import Node from './node/node';
import {dijkstra, getNodesInShortestPathOrder} from '../algorithms/dijkstra';

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
        };
    }

    componentDidMount() {
        const grid = getInitialGrid();
        this.setState({grid});
    }

    handleMouseDown(row, col) {
        const newGrid = getNewGridWithWallToggled(this.state.grid, row, col);
        this.setState({grid: newGrid, mouseIsPressed: true});
    }

    handleMouseEnter(row, col) {
        if (!this.state.mouseIsPressed) return;
        const newGrid = getNewGridWithWallToggled(this.state.grid, row, col);
        this.setState({grid: newGrid});
    }

    handleMouseUp() {
        this.setState({mouseIsPressed: false});
    }

    animateDijkstra(visitedNodesInOrder, nodesInShortestPathOrder, callback) {
        for (let i = 0; i <= visitedNodesInOrder.length; i++) {
            if (i === visitedNodesInOrder.length) {
                setTimeout(() => {
                    this.animateShortestPath(nodesInShortestPathOrder, callback);
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
    }

    animateShortestPath(nodesInShortestPathOrder) {
        for (let i = 0; i < nodesInShortestPathOrder.length; i++) {
            const node = nodesInShortestPathOrder[i];
            if (!node.isStart && !node.isFinish) {
                setTimeout(() => {
                    document.getElementById(`node-${node.row}-${node.col}`).className =
                        'node node-shortest-path';
                    // array of nodes in shortest path order
                    let shortestPathEach=[node.col,node.row];
                    shortestPath.push(shortestPathEach);
                    //console.log(node);
                }, 50 * i);
            }
        }
    }


    visualizeDijkstra() {
        const {grid} = this.state;
        const startNode = grid[START_NODE_ROW][START_NODE_COL];
        for (let i = 0; i < FINISH_NODE_ROW.length; i++) {
            const finishNode = grid[FINISH_NODE_ROW[i]][FINISH_NODE_COL[i]];
            const visitedNodesInOrder = dijkstra(grid, startNode, finishNode);
            const nodesInShortestPathOrder = getNodesInShortestPathOrder(startNode, finishNode, grid);
            this.animateDijkstra(visitedNodesInOrder, nodesInShortestPathOrder);
        }
    }


    render() {
        const {grid, mouseIsPressed} = this.state;

        return (
            <>
                <button onClick={() => this.visualizeDijkstra()}>
                    Visualize Dijkstra's Algorithm
                </button>
                <div className="grid">
                    {grid.map((row, rowIdx) => {
                        return (
                            <div key={rowIdx}>
                                {row.map((node, nodeIdx) => {
                                    const {row, col, isFinish, isStart, isWall} = node;
                                    return (
                                        <Node
                                            key={nodeIdx}
                                            col={col}
                                            isFinish={isFinish}
                                            isStart={isStart}
                                            isWall={isWall}
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