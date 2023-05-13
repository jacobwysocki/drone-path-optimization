import React, { useState, useEffect } from 'react';
import './node.css';

const Node = (props) => {
    const {
        col,
        isFinish,
        isStart,
        isWall,
        isShortestPath,
        onMouseDown,
        onMouseEnter,
        onMouseUp,
        row,
    } = props;

    const [extraClassName, setExtraClassName] = useState('');

    useEffect(() => {
        if (isShortestPath) {
            setExtraClassName('node-shortest-path');
        } else {
            setExtraClassName('');
        }
    }, [isShortestPath]);


    const initialClassName = isFinish
        ? 'node-finish'
        : isStart
            ? 'node-start'
            : isWall
                ? 'node-wall'
                : '';

    return (
        <div
            id={`node-${row}-${col}`}
            className={`node ${initialClassName} ${extraClassName}`}
            onMouseDown={() => onMouseDown(row, col)}
            onMouseEnter={() => onMouseEnter(row, col)}
            onMouseUp={() => onMouseUp()}
        ></div>
    );
};

export default Node;


