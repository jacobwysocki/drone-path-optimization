/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const orchestrationSpies = vi.hoisted(() => ({
  acoCalls: [],
  cooperativeCalls: [],
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: () => null,
  useFrame: vi.fn(),
}));

vi.mock('@react-three/drei', () => ({
  Html: () => null,
  Line: () => null,
  OrbitControls: () => null,
  PerspectiveCamera: () => null,
  Sky: () => null,
  Stars: () => null,
}));

vi.mock('@react-three/postprocessing', () => ({
  Bloom: () => null,
  EffectComposer: () => null,
}));

vi.mock('../algorithms/cooperativeAStar', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    cooperativeAStar: (...args) => {
      orchestrationSpies.cooperativeCalls.push(args);
      return actual.cooperativeAStar(...args);
    },
  };
});

vi.mock('../algorithms/aco', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    optimizeRouteWithACO: (...args) => {
      const result = actual.optimizeRouteWithACO(...args);
      orchestrationSpies.acoCalls.push({ args, result });
      return result;
    },
  };
});

import Visualization3D, {
  createRouteData,
  shouldShowDroneAtTime,
} from './Visualization3D';

const mountedHarnesses = [];

const installSynchronousState = (instance) => {
  instance.setState = (update, callback) => {
    const nextState =
      typeof update === 'function' ? update(instance.state, instance.props) : update;

    if (nextState) {
      instance.state = { ...instance.state, ...nextState };
    }

    callback?.();
  };
};

const createHarness = () => {
  const instance = new Visualization3D({});
  installSynchronousState(instance);

  instance.startRunTimer = function startRunTimer(runId) {
    this.runStartedAt = performance.now();
    this.timerInterval = runId;
  };
  instance.stopRunTimer = function stopRunTimer() {
    this.timerInterval = null;
    this.runStartedAt = null;
    return 125;
  };

  instance.componentDidMount();
  mountedHarnesses.push(instance);
  return instance;
};

const countDeliveries = (grid) =>
  grid.flat().filter((node) => node.isFinish).length;

const configureGrid = (visualization, deliveries, walls = []) => {
  const wallKeys = new Set(walls.map(([row, col]) => `${row}:${col}`));
  const deliveryKeys = new Set(deliveries.map(([row, col]) => `${row}:${col}`));
  const grid = visualization.state.grid.map((row) => row.map((node) => ({
    ...node,
    isFinish: deliveryKeys.has(`${node.row}:${node.col}`),
    isWall: wallKeys.has(`${node.row}:${node.col}`),
  })));

  visualization.state = {
    ...visualization.state,
    grid,
    numDeliveries: deliveries.length || 1,
    fleetSize: 1,
    payloadLimit: 5,
    useACO: false,
  };
};

const expectRunToBeIdle = (visualization) => {
  expect(visualization.activeRunId).toBeNull();
  expect(visualization.timerInterval).toBeNull();
  expect(visualization.state.buttonsDisabled).toBe(false);
  expect(visualization.state.isAnimating).toBe(false);
};

const finishCurrentRun = (visualization) => {
  const runId = visualization.state.runId;
  visualization.state.droneAnimations.forEach(({ id }) => {
    visualization.handleDroneFinish(runId, id);
  });
};

describe('Visualization3D orchestration', () => {
  beforeEach(() => {
    orchestrationSpies.acoCalls.length = 0;
    orchestrationSpies.cooperativeCalls.length = 0;
    vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 1;
    });
  });

  afterEach(() => {
    while (mountedHarnesses.length > 0) {
      mountedHarnesses.pop().componentWillUnmount();
    }
    vi.restoreAllMocks();
  });

  it('continues logging after a Strict Mode development remount', () => {
    const visualization = createHarness();

    visualization.componentWillUnmount();
    visualization.componentDidMount();
    visualization.addLog('Logging remains active after remount.');

    expect(visualization.state.logs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Logging remains active after remount.'),
      ]),
    );
  });

  it('regenerates the configured number of deliveries on a full reset', () => {
    const visualization = createHarness();
    visualization.state = {
      ...visualization.state,
      numDeliveries: 17,
    };

    visualization.resetToInitialState();

    expect(countDeliveries(visualization.state.grid)).toBe(17);
    expect(visualization.state.isAnimating).toBe(false);
    expect(visualization.state.buttonsDisabled).toBe(false);
  });

  it('charges waits at one unit per tick and only exposes an active launched drone', () => {
    const route = createRouteData([
      { row: 6, col: 7, z: 0, time: 4 },
      { row: 6, col: 7, z: 0, time: 14 },
    ]);

    expect(route.totalEnergy).toBe(10);
    expect(shouldShowDroneAtTime(route, true, false, 3.99)).toBe(false);
    expect(shouldShowDroneAtTime(route, true, false, 4)).toBe(true);
    expect(shouldShowDroneAtTime(route, true, false, 14)).toBe(false);
    expect(shouldShowDroneAtTime(route, true, true, 8)).toBe(false);
    expect(shouldShowDroneAtTime(route, false, false, 8)).toBe(false);
  });

  it('restores the timer and controls after zero-work and unreachable plans', () => {
    const visualization = createHarness();
    configureGrid(visualization, []);

    visualization.visualizeOptimizedFleet('astar');

    expectRunToBeIdle(visualization);
    expect(visualization.state.statusMessage).toMatch(/no deliveries/i);

    configureGrid(
      visualization,
      [[10, 20]],
      [[9, 20], [11, 20], [10, 19], [10, 21]],
    );
    visualization.visualizeOptimizedFleet('astar');

    expectRunToBeIdle(visualization);
    expect(visualization.state.droneAnimations).toHaveLength(0);
    expect(visualization.state.statusMessage).toMatch(/cannot reach delivery/i);
  });

  it('completes two consecutive standard runs independently', () => {
    const visualization = createHarness();
    configureGrid(visualization, [[6, 9]]);

    visualization.visualizeOptimizedFleet('astar');
    const firstRunId = visualization.state.runId;

    expect(visualization.state.isAnimating).toBe(true);
    expect(visualization.state.droneAnimations).toHaveLength(1);
    finishCurrentRun(visualization);
    expectRunToBeIdle(visualization);

    visualization.visualizeOptimizedFleet('astar');
    const secondRunId = visualization.state.runId;

    expect(secondRunId).toBeGreaterThan(firstRunId);
    expect(visualization.state.isAnimating).toBe(true);
    expect(visualization.state.droneAnimations).toHaveLength(1);
    finishCurrentRun(visualization);
    expectRunToBeIdle(visualization);
  });

  it('requests and reserves an inclusive 10-tick MAPF depot reload window', () => {
    const visualization = createHarness();
    configureGrid(visualization, [[6, 9], [6, 11]]);
    visualization.state = {
      ...visualization.state,
      payloadLimit: 1,
    };

    visualization.visualizeOptimizedFleet('mapf');

    expect(visualization.state.isAnimating).toBe(true);
    expect(orchestrationSpies.cooperativeCalls).toHaveLength(4);
    expect(orchestrationSpies.cooperativeCalls.map((call) => call[5])).toEqual([
      { goalHoldTicks: 0 },
      { goalHoldTicks: 10 },
      { goalHoldTicks: 0 },
      { goalHoldTicks: 0 },
    ]);

    const route = visualization.state.droneAnimations[0].path;
    const reloadIndex = route.findIndex((point, index) => {
      const nextPoint = route[index + 1];
      return point.row === 6
        && point.col === 7
        && nextPoint?.row === 6
        && nextPoint.col === 7
        && nextPoint.time - point.time === 10;
    });

    expect(reloadIndex).toBeGreaterThan(0);
    const reloadStart = route[reloadIndex].time;
    const reservationTable = orchestrationSpies.cooperativeCalls[1][4];
    for (let time = reloadStart; time <= reloadStart + 10; time++) {
      expect(reservationTable.isReserved(6, 7, 0, time)).toBe(true);
    }
  });

  it('passes payload-aware deterministic randomness to ACO and repeats the route order', () => {
    const visualization = createHarness();
    configureGrid(visualization, [[2, 40], [4, 11], [8, 18], [13, 4], [17, 35]]);
    visualization.state = {
      ...visualization.state,
      payloadLimit: 2,
      useACO: true,
    };

    visualization.visualizeOptimizedFleet('astar');
    const firstPath = visualization.state.droneAnimations[0].path.map(
      ({ row, col, z, time }) => ({ row, col, z, time }),
    );
    const firstAcoCall = orchestrationSpies.acoCalls[0];

    expect(firstAcoCall.args[2]).toMatchObject({ payloadLimit: 2 });
    expect(firstAcoCall.args[2].random).toBeTypeOf('function');
    finishCurrentRun(visualization);

    visualization.visualizeOptimizedFleet('astar');
    const secondPath = visualization.state.droneAnimations[0].path.map(
      ({ row, col, z, time }) => ({ row, col, z, time }),
    );
    const secondAcoCall = orchestrationSpies.acoCalls[1];

    expect(secondAcoCall.args[2]).toMatchObject({ payloadLimit: 2 });
    expect(secondAcoCall.result.map(({ row, col }) => [row, col])).toEqual(
      firstAcoCall.result.map(({ row, col }) => [row, col]),
    );
    expect(secondPath).toEqual(firstPath);
  });
});
