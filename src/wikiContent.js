export const wikiMarkdown = `
# AERO-PATH: 3D UAV Path Planning & Fleet Optimization
**Research Focus:** *Implementation of Path Optimization Algorithm for the Optimal Number of Unmanned Aerial Vehicles Used Within Goods Delivery.*

## The Problem
The rapid expansion of drone delivery services presents a complex logistical challenge: **How do we determine the optimal size of a drone fleet required to fulfill a varying number of deliveries safely, efficiently, and within physical hardware constraints?**

Sending out too many drones is financially inefficient and clutters the airspace. Sending out too few drones results in unfulfilled deliveries due to battery depletion. Furthermore, as fleet sizes increase, the risk of mid-air collisions becomes a critical issue. 

This application serves as a visual simulation and proving ground to investigate this problem. It combines several state-of-the-art algorithms to calculate the minimum required fleet size and safely navigate the drones through a shared, obstacle-dense environment.

---

## 🏗️ Architecture & Features

### 1. 3D Visualizer & Physics Engine
Moving away from a standard 2D top-down grid, the simulation utilizes a full 3D viewport to accurately represent the physical airspace drones operate within.
* **Continuous Spline Movement:** Drones mathematically calculate \`THREE.CatmullRomCurve3\` splines based on pathfinding waypoints, ensuring perfectly smooth flight paths at a constant simulated velocity.
* **Real-time Obstacle Interaction:** Users can "paint" massive 3D skyscraper walls onto the grid dynamically. Drones will calculate paths around—or *over*—these obstacles.

### 2. Fleet Optimization Pipeline
When the user clicks "Auto-Optimize Fleet Size", the system executes a multi-stage data pipeline to solve the logistics problem:

#### Stage A: Delivery Allocation (K-Means Clustering)
If there are 20 randomly scattered deliveries, the system must decide which drone goes where. It runs a spatial K-Means clustering algorithm to group the deliveries by proximity, assigning a cluster of local deliveries to each specific drone. This minimizes cross-map travel and balances the workload.

#### Stage B: Swarm Routing (Ant Colony Optimization - ACO)
Once a drone is assigned its specific cluster of deliveries, it needs to know the most efficient order to visit them (The Traveling Salesperson Problem). 

**The Swarm ACO Checkbox:** 
* When **disabled**, drones visit delivery points in a random order based on how they were generated. This is often highly inefficient, causing drones to zigzag across the map.
* When **enabled**, the simulation invokes Swarm Intelligence via an ACO algorithm. It simulates artificial 'ants' dropping pheromones to find the shortest continuous physical sequence between the delivery nodes. This significantly reduces total travel distance and battery consumption.

#### Stage C: Pathfinding & Avoidance (Cooperative A* / MAPF)
With the order decided, the drones must physically navigate the space without hitting walls or each other.
* **Standard A* / Dijkstra:** These traditional algorithms are included for baseline comparison. They calculate the absolute shortest physical path. However, if multiple drones cross paths, they will crash into each other because standard algorithms lack multi-agent awareness.
* **Cooperative A* (Space-Time MAPF):** This is the flagship algorithm that solves the collision problem. It adds a 4th dimension to the search space: **Time**. 
  * It utilizes a global \`ReservationTable\`. 
  * If Drone 1 calculates it will be at coordinate \`(x: 10, y: 10, z: 0)\` at Time \`T=5\`, it locks that coordinate. 
  * When Drone 2 calculates its path, it reads the reservation table. It will autonomously decide to either hover in place and wait for Drone 1 to pass, or it will increase its altitude (\`Z-axis\`) to fly over Drone 1 safely.

### 3. Dynamic Payload & Multiple Trips
To mirror real-world logistics, drones have a **Payload Limit** (configurable in the UI). 
* If a drone is assigned more deliveries than it can carry, it will deliver its first batch, return to the **Start Node** (Blue) to reload, and then fly back out to complete the remaining tasks. 
* The **Auto-Optimize** logic factors in this payload limit to calculate the most efficient number of drones needed for a manifest.

### 4. Simulation Terminal
A real-time terminal logs the internal math, array sizes, clustering data, and millisecond timings to provide transparent proof of the background calculations as the simulation runs.
`;
