# Drone Path Optimization Project Description

This project is a React-based web application designed to visualize pathfinding algorithms, simulating drone path optimization. It was bootstrapped with Create React App.

## Core Features
- **Algorithm Visualization:** The application visually demonstrates how pathfinding algorithms traverse a grid to find the shortest path from a starting node to multiple destination (finish) nodes.
- **Supported Algorithms:**
  - **Dijkstra's Algorithm:** Visualizes Dijkstra's algorithm to find the shortest path.
  - **A* (A-Star) Algorithm:** Visualizes the A* search algorithm.
- **Visualization Modes:**
  - **Sequential (One-by-One):** Visualizes the path to each finish node sequentially.
  - **Simultaneous (All at Once):** Visualizes the paths to all finish nodes simultaneously.
- **Interactive Grid:**
  - Users can interact with the grid by clicking and dragging to create "walls" or obstacles that the algorithms must navigate around.
  - Features options to reset the grid entirely or reset the grid while preserving the user-placed walls.
- **Performance Tracking:** The application tracks and displays the total time (in milliseconds) taken for the selected algorithm to reach all finish nodes.

## Technical Stack
- **Frontend Framework:** React 18
- **UI Components:** React Bootstrap (v2.7.4) / Bootstrap 5
- **Styling:** Custom CSS (`App.css`, `visualization.css`, `node.css`)

## Structure
- `src/App.js`: The main application component that renders the visualization.
- `src/visualization/visualization.js`: The core component managing the grid state, algorithm execution, and animation logic.
- `src/algorithms/`: Contains the logic for the pathfinding algorithms (`dijkstra.js`, `aStar.js`, `algorithm.js`).
- `src/node/`: Contains the individual grid node component (`node.js`) and its styling.

## Running the Project
1. Install dependencies using `npm install`.
2. Start the development server using `npm start`. The app will run on `http://localhost:3000`.