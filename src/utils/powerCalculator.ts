import {
  GridCell,
  GRID_SIZE,
  WIRE_CONNECTIONS,
  DIR_OFFSETS,
  BUILDING_STATS,
  DAY_THRESHOLD,
  WEAK_POWER_MAX_NEIGHBORS,
  OVERPOWER_SOURCE_RANGE,
  PLANT_FAULT_REDUCTION_RADIUS,
} from './constants';

export type PlantPowerState = 'thriving' | 'ambient' | 'overpowered' | 'withered';

export function isWireConnected(wire: GridCell, direction: number): boolean {
  if (wire.type !== 'wire') return false;
  const connections = WIRE_CONNECTIONS[wire.rotation % 6];
  if (!connections) return false;
  return connections[direction];
}

export function getOppositeDirection(dir: number): number {
  return (dir + 2) % 4;
}

export function calculatePowerNetwork(
  grid: GridCell[][],
  dayTime: number,
  storedPower: number
): {
  poweredCells: Set<string>;
  totalGeneration: number;
  totalConsumption: number;
  batteryCapacity: number;
} {
  const isDay = dayTime < DAY_THRESHOLD;
  let totalGeneration = 0;
  let totalConsumption = 0;
  let batteryCapacity = 0;

  const windmillSources: Array<{ x: number; y: number; gen: number }> = [];
  const batterySources: Array<{ x: number; y: number; discharge: number }> = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (cell.faulty) continue;

      if (cell.type === 'windmill') {
        const gen = isDay
          ? BUILDING_STATS.windmill.dayGen
          : BUILDING_STATS.windmill.nightGen;
        totalGeneration += gen;
        windmillSources.push({ x, y, gen });
      }
      if (cell.type === 'battery') {
        batteryCapacity += BUILDING_STATS.battery.storage;
      }
      if (cell.type === 'house') {
        totalConsumption += BUILDING_STATS.house.consumption;
      }
      if (cell.type === 'factory') {
        totalConsumption += BUILDING_STATS.factory.consumption;
      }
      if (cell.type === 'fluoroplant') {
        totalConsumption += BUILDING_STATS.fluoroplant.consumption;
      }
    }
  }

  const availableFromBatteries = Math.max(0, storedPower);
  const totalAvailable = totalGeneration + availableFromBatteries;

  if (availableFromBatteries > 0) {
    const batteryCount = grid.flat().filter(
      (c) => c.type === 'battery' && !c.faulty
    ).length;
    if (batteryCount > 0) {
      const dischargePerBattery = availableFromBatteries / batteryCount;
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const cell = grid[y][x];
          if (cell.type === 'battery' && !cell.faulty) {
            batterySources.push({ x, y, discharge: dischargePerBattery });
          }
        }
      }
    }
  }

  const allSources = [
    ...windmillSources.map((s) => ({ x: s.x, y: s.y })),
    ...batterySources.map((s) => ({ x: s.x, y: s.y })),
  ];

  const connectedCells = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number }> = [...allSources];

  for (const s of allSources) {
    visited.add(`${s.x},${s.y}`);
    connectedCells.add(`${s.x},${s.y}`);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentCell = grid[current.y][current.x];

    for (let dir = 0; dir < 4; dir++) {
      const [dx, dy] = DIR_OFFSETS[dir];
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;

      const neighbor = grid[ny][nx];
      if (neighbor.faulty) continue;

      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;

      let canConnectFromCurrent = false;
      if (currentCell.type === 'wire') {
        canConnectFromCurrent = isWireConnected(currentCell, dir);
      } else if (
        currentCell.type === 'windmill' ||
        currentCell.type === 'house' ||
        currentCell.type === 'factory' ||
        currentCell.type === 'battery' ||
        currentCell.type === 'fluoroplant'
      ) {
        canConnectFromCurrent = true;
      }

      let canConnectFromNeighbor = false;
      if (neighbor.type === 'wire') {
        canConnectFromNeighbor = isWireConnected(neighbor, getOppositeDirection(dir));
      } else if (
        neighbor.type === 'windmill' ||
        neighbor.type === 'house' ||
        neighbor.type === 'factory' ||
        neighbor.type === 'battery' ||
        neighbor.type === 'fluoroplant'
      ) {
        canConnectFromNeighbor = true;
      }

      if (canConnectFromCurrent && canConnectFromNeighbor) {
        visited.add(key);
        connectedCells.add(key);
        if (neighbor.type === 'wire') {
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  const poweredCells = new Set<string>();

  for (const s of allSources) {
    poweredCells.add(`${s.x},${s.y}`);
  }

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (cell.type === 'wire' && connectedCells.has(`${x},${y}`)) {
        poweredCells.add(`${x},${y}`);
      }
    }
  }

  const connectedConsumers: Array<{
    x: number;
    y: number;
    consumption: number;
  }> = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (
        (cell.type === 'house' || cell.type === 'factory' || cell.type === 'fluoroplant') &&
        connectedCells.has(`${x},${y}`)
      ) {
        const consumption =
          cell.type === 'house'
            ? BUILDING_STATS.house.consumption
            : cell.type === 'factory'
            ? BUILDING_STATS.factory.consumption
            : BUILDING_STATS.fluoroplant.consumption;
        connectedConsumers.push({ x, y, consumption });
      }
    }
  }

  let remainingPower = totalAvailable;
  connectedConsumers.sort((a, b) => a.consumption - b.consumption);

  for (const consumer of connectedConsumers) {
    if (remainingPower >= consumer.consumption) {
      remainingPower -= consumer.consumption;
      poweredCells.add(`${consumer.x},${consumer.y}`);
    }
  }

  return { poweredCells, totalGeneration, totalConsumption, batteryCapacity };
}

export function countPoweredBuildings(
  grid: GridCell[][],
  poweredCells: Set<string>
): { houses: number; poweredHouses: number; factories: number; poweredFactories: number } {
  let houses = 0;
  let poweredHouses = 0;
  let factories = 0;
  let poweredFactories = 0;

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (cell.type === 'house') {
        houses++;
        if (poweredCells.has(`${x},${y}`)) poweredHouses++;
      }
      if (cell.type === 'factory') {
        factories++;
        if (poweredCells.has(`${x},${y}`)) poweredFactories++;
      }
    }
  }

  return { houses, poweredHouses, factories, poweredFactories };
}

function countAdjacentPowered(grid: GridCell[][], x: number, y: number): number {
  let count = 0;
  for (const [dx, dy] of DIR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
    if (grid[ny][nx].powered && !grid[ny][nx].faulty) count++;
  }
  return count;
}

function isNearHighPowerSource(grid: GridCell[][], x: number, y: number): boolean {
  for (let dy = -OVERPOWER_SOURCE_RANGE; dy <= OVERPOWER_SOURCE_RANGE; dy++) {
    for (let dx = -OVERPOWER_SOURCE_RANGE; dx <= OVERPOWER_SOURCE_RANGE; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
      const cell = grid[ny][nx];
      if (cell.type === 'windmill' && !cell.faulty) return true;
    }
  }
  return false;
}

export function assessPlantPowerState(
  grid: GridCell[][],
  x: number,
  y: number,
  poweredCells: Set<string>
): PlantPowerState {
  const cell = grid[y][x];
  if (cell.type !== 'fluoroplant') return 'withered';

  const isPowered = poweredCells.has(`${x},${y}`);
  const nearHighPower = isNearHighPowerSource(grid, x, y);

  if (nearHighPower) return 'overpowered';

  if (isPowered) {
    const adjacentPowered = countAdjacentPowered(grid, x, y);
    if (adjacentPowered <= WEAK_POWER_MAX_NEIGHBORS) return 'thriving';
    return 'overpowered';
  }

  const adjacentPowered = countAdjacentPowered(grid, x, y);
  if (adjacentPowered > 0) return 'ambient';

  return 'withered';
}

export function calculateWeakPowerZones(
  grid: GridCell[][],
  poweredCells: Set<string>
): Map<string, number> {
  const zones = new Map<string, number>();

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      let weakPowerLevel = 0;

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;

          const neighbor = grid[ny][nx];
          if (neighbor.type === 'wire' && poweredCells.has(`${nx},${ny}`) && !neighbor.faulty) {
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist === 1) weakPowerLevel += 3;
            else if (dist === 2) weakPowerLevel += 2;
            else weakPowerLevel += 1;
          }
        }
      }

      if (weakPowerLevel > 0) {
        zones.set(`${x},${y}`, weakPowerLevel);
      }
    }
  }

  return zones;
}

export function getPlantFaultReductionPositions(
  grid: GridCell[][]
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (
        cell.type === 'fluoroplant' &&
        !cell.faulty &&
        (cell.plantMaturity ?? 0) >= 80
      ) {
        for (let dy = -PLANT_FAULT_REDUCTION_RADIUS; dy <= PLANT_FAULT_REDUCTION_RADIUS; dy++) {
          for (let dx = -PLANT_FAULT_REDUCTION_RADIUS; dx <= PLANT_FAULT_REDUCTION_RADIUS; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
            if (Math.abs(dx) + Math.abs(dy) <= PLANT_FAULT_REDUCTION_RADIUS) {
              positions.push({ x: nx, y: ny });
            }
          }
        }
      }
    }
  }

  return positions;
}
