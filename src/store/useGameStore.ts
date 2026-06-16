import { create } from 'zustand';
import {
  GridCell,
  ToolType,
  GRID_SIZE,
  DAY_LENGTH,
  FAULT_CHANCE,
  BUILDING_STATS,
  DAY_THRESHOLD,
  PLANT_HEALTH_MAX,
  PLANT_HEALTH_GAIN_WEAK,
  PLANT_HEALTH_GAIN_AMBIENT,
  PLANT_HEALTH_LOSS_OVERPOWER,
  PLANT_HEALTH_LOSS_WITHER,
  PLANT_MATURITY_GAIN,
  PLANT_MATURITY_LOSS,
  PLANT_SATISFACTION_BOOST,
  PLANT_FAULT_REDUCTION_FACTOR,
  NIGHT_PLANT_SPAWN_CHANCE,
  MAX_AUTO_PLANTS,
} from '../utils/constants';
import {
  calculatePowerNetwork,
  countPoweredBuildings,
  assessPlantPowerState,
  getPlantFaultReductionPositions,
  calculateWeakPowerZones,
} from '../utils/powerCalculator';
import type { PlantPowerState } from '../utils/powerCalculator';

const STORAGE_KEY = 'floating-island-grid-game-save';

interface PersistedState {
  grid: GridCell[][];
  dayTime: number;
  storedPower: number;
  satisfaction: number;
}

interface GameState {
  grid: GridCell[][];
  dayTime: number;
  storedPower: number;
  maxStorage: number;
  satisfaction: number;
  selectedTool: ToolType;
  poweredCells: Set<string>;
  totalGeneration: number;
  totalConsumption: number;
  showSettlement: boolean;
  weakPowerZones: Map<string, number>;
  setSelectedTool: (tool: ToolType) => void;
  placeOrRemove: (x: number, y: number) => void;
  rotateCell: (x: number, y: number) => void;
  repairCell: (x: number, y: number) => void;
  tick: () => void;
  resetGame: () => void;
  openSettlement: () => void;
  closeSettlement: () => void;
}

function createEmptyGrid(): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({
        x,
        y,
        type: 'empty',
        rotation: 0,
        powered: false,
        faulty: false,
      });
    }
    grid.push(row);
  }
  return grid;
}

function saveToLocalStorage(state: PersistedState): void {
  try {
    const data = JSON.stringify({
      grid: state.grid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
    });
    localStorage.setItem(STORAGE_KEY, data);
  } catch {
    // ignore storage errors
  }
}

function loadFromLocalStorage(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.grid && Array.isArray(data.grid)) {
      return {
        grid: data.grid,
        dayTime: data.dayTime ?? 20,
        storedPower: data.storedPower ?? 10,
        satisfaction: data.satisfaction ?? 50,
      };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function recalcGrid(grid: GridCell[][], dayTime: number, storedPower: number) {
  const { poweredCells, totalGeneration, totalConsumption, batteryCapacity } =
    calculatePowerNetwork(grid, dayTime, storedPower);

  const newGrid = grid.map((row) => row.map((c) => ({ ...c })));
  for (let yy = 0; yy < GRID_SIZE; yy++) {
    for (let xx = 0; xx < GRID_SIZE; xx++) {
      newGrid[yy][xx].powered = poweredCells.has(`${xx},${yy}`);
    }
  }

  const weakPowerZones = calculateWeakPowerZones(newGrid, poweredCells);

  return { newGrid, poweredCells, totalGeneration, totalConsumption, batteryCapacity, weakPowerZones };
}

function initGame(): Omit<GameState, keyof GameStateActions> {
  const saved = loadFromLocalStorage();
  const grid = saved ? saved.grid : createEmptyGrid();
  const dayTime = saved ? saved.dayTime : 20;
  const storedPower = saved ? saved.storedPower : 10;
  const satisfaction = saved ? saved.satisfaction : 50;

  const { newGrid, poweredCells, totalGeneration, totalConsumption, batteryCapacity, weakPowerZones } =
    recalcGrid(grid, dayTime, storedPower);

  return {
    grid: newGrid,
    dayTime,
    storedPower,
    maxStorage: batteryCapacity,
    satisfaction,
    selectedTool: 'windmill',
    poweredCells,
    totalGeneration,
    totalConsumption,
    showSettlement: false,
    weakPowerZones,
  };
}

type GameStateActions = Pick<
  GameState,
  | 'setSelectedTool'
  | 'placeOrRemove'
  | 'rotateCell'
  | 'repairCell'
  | 'tick'
  | 'resetGame'
  | 'openSettlement'
  | 'closeSettlement'
>;

export const useGameStore = create<GameState>((set, get) => ({
  ...initGame(),

  setSelectedTool: (tool) => set({ selectedTool: tool }),

  placeOrRemove: (x, y) => {
    const state = get();
    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
    const cell = newGrid[y][x];
    const tool = state.selectedTool;

    if (tool === 'remove') {
      if (cell.type !== 'empty') {
        newGrid[y][x] = {
          ...cell,
          type: 'empty',
          rotation: 0,
          powered: false,
          faulty: false,
        };
      }
    } else {
      newGrid[y][x] = {
        ...cell,
        type: tool,
        rotation: tool === 'wire' ? cell.rotation % 6 : 0,
        powered: false,
        faulty: false,
        plantHealth: tool === 'fluoroplant' ? 50 : undefined,
        plantMaturity: tool === 'fluoroplant' ? 0 : undefined,
      };
    }

    const result = recalcGrid(newGrid, state.dayTime, state.storedPower);

    const nextState = {
      grid: result.newGrid,
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      maxStorage: result.batteryCapacity,
      weakPowerZones: result.weakPowerZones,
    };

    saveToLocalStorage({
      grid: result.newGrid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
    });

    set(nextState);
  },

  rotateCell: (x, y) => {
    const state = get();
    const cell = state.grid[y][x];
    if (cell.type !== 'wire') return;

    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
    newGrid[y][x].rotation = (cell.rotation + 1) % 6;

    const result = recalcGrid(newGrid, state.dayTime, state.storedPower);

    const nextState = {
      grid: result.newGrid,
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      maxStorage: result.batteryCapacity,
      weakPowerZones: result.weakPowerZones,
    };

    saveToLocalStorage({
      grid: result.newGrid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
    });

    set(nextState);
  },

  repairCell: (x, y) => {
    const state = get();
    const cell = state.grid[y][x];
    if (!cell.faulty) return;

    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
    newGrid[y][x].faulty = false;

    const result = recalcGrid(newGrid, state.dayTime, state.storedPower);

    const nextState = {
      grid: result.newGrid,
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      maxStorage: result.batteryCapacity,
      weakPowerZones: result.weakPowerZones,
    };

    saveToLocalStorage({
      grid: result.newGrid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
    });

    set(nextState);
  },

  tick: () => {
    const state = get();
    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
    const isNight = state.dayTime >= DAY_THRESHOLD;
    const justTurnedNight = state.dayTime < DAY_THRESHOLD + 0.5 && state.dayTime >= DAY_THRESHOLD;

    const faultReductionPositions = getPlantFaultReductionPositions(newGrid);
    const faultReductionSet = new Set(faultReductionPositions.map((p) => `${p.x},${p.y}`));

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = newGrid[y][x];
        if (cell.type !== 'empty' && cell.type !== 'fluoroplant' && !cell.faulty) {
          let chance = FAULT_CHANCE;
          if (faultReductionSet.has(`${x},${y}`)) {
            chance *= (1 - PLANT_FAULT_REDUCTION_FACTOR);
          }
          if (Math.random() < chance) {
            newGrid[y][x].faulty = true;
          }
        }
      }
    }

    const newDayTime = (state.dayTime + 0.5) % DAY_LENGTH;

    const { poweredCells, totalGeneration, totalConsumption, batteryCapacity } =
      calculatePowerNetwork(newGrid, newDayTime, state.storedPower);

    for (let yy = 0; yy < GRID_SIZE; yy++) {
      for (let xx = 0; xx < GRID_SIZE; xx++) {
        newGrid[yy][xx].powered = poweredCells.has(`${xx},${yy}`);
      }
    }

    if (isNight) {
      let totalPlants = 0;
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (newGrid[y][x].type === 'fluoroplant') totalPlants++;
        }
      }

      const weakPowerZonesForSpawn = calculateWeakPowerZones(newGrid, poweredCells);
      const spawnCandidates: Array<{ x: number; y: number; level: number }> = [];

      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const cell = newGrid[y][x];
          if (cell.type !== 'empty') continue;
          const weakLevel = weakPowerZonesForSpawn.get(`${x},${y}`) ?? 0;
          if (weakLevel >= 2 && weakLevel <= 8) {
            const nearWindmill = (() => {
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (dx === 0 && dy === 0) continue;
                  const nx = x + dx, ny = y + dy;
                  if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
                  if (newGrid[ny][nx].type === 'windmill' && !newGrid[ny][nx].faulty) return true;
                }
              }
              return false;
            })();
            const nearFactory = (() => {
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (dx === 0 && dy === 0) continue;
                  const nx = x + dx, ny = y + dy;
                  if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
                  if (newGrid[ny][nx].type === 'factory' && newGrid[ny][nx].powered && !newGrid[ny][nx].faulty) return true;
                }
              }
              return false;
            })();
            if (!nearWindmill && !nearFactory) {
              spawnCandidates.push({ x, y, level: weakLevel });
            }
          }
        }
      }

      const maxSpawn = Math.min(spawnCandidates.length, MAX_AUTO_PLANTS - totalPlants);
      spawnCandidates.sort((a, b) => b.level - a.level);

      for (let i = 0; i < maxSpawn; i++) {
        const c = spawnCandidates[i];
        const spawnChance = justTurnedNight
          ? NIGHT_PLANT_SPAWN_CHANCE * 4
          : NIGHT_PLANT_SPAWN_CHANCE;
        if (Math.random() < spawnChance) {
          newGrid[c.y][c.x] = {
            x: c.x,
            y: c.y,
            type: 'fluoroplant',
            rotation: 0,
            powered: false,
            faulty: false,
            plantHealth: 60,
            plantMaturity: 0,
          };
        }
      }
    }

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = newGrid[y][x];
        if (cell.type !== 'fluoroplant') continue;

        let health = cell.plantHealth ?? 50;
        let maturity = cell.plantMaturity ?? 0;

        if (cell.faulty) {
          health = Math.max(0, health - PLANT_HEALTH_LOSS_WITHER);
          maturity = Math.max(0, maturity - PLANT_MATURITY_LOSS);
        } else {
          const powerState: PlantPowerState = assessPlantPowerState(newGrid, x, y, poweredCells);

          switch (powerState) {
            case 'thriving':
              health = Math.min(PLANT_HEALTH_MAX, health + PLANT_HEALTH_GAIN_WEAK);
              maturity = Math.min(100, maturity + PLANT_MATURITY_GAIN);
              break;
            case 'ambient':
              health = Math.min(PLANT_HEALTH_MAX, health + PLANT_HEALTH_GAIN_AMBIENT);
              maturity = Math.min(100, maturity + PLANT_MATURITY_GAIN * 0.3);
              break;
            case 'overpowered':
              health = Math.max(0, health - PLANT_HEALTH_LOSS_OVERPOWER);
              maturity = Math.max(0, maturity - PLANT_MATURITY_LOSS);
              break;
            case 'withered':
              health = Math.max(0, health - PLANT_HEALTH_LOSS_WITHER);
              maturity = Math.max(0, maturity - PLANT_MATURITY_LOSS);
              break;
          }
        }

        newGrid[y][x].plantHealth = health;
        newGrid[y][x].plantMaturity = maturity;

        if (health <= 0) {
          newGrid[y][x] = {
            x,
            y,
            type: 'empty',
            rotation: 0,
            powered: false,
            faulty: false,
          };
        }
      }
    }

    const weakPowerZones = calculateWeakPowerZones(newGrid, poweredCells);

    const netPower = totalGeneration - totalConsumption;
    let newStoredPower = state.storedPower;
    const isDay = newDayTime < DAY_THRESHOLD;

    if (batteryCapacity > 0) {
      if (netPower > 0) {
        newStoredPower = Math.min(batteryCapacity, state.storedPower + netPower * 0.3);
      } else if (netPower < 0 && !isDay) {
        const deficit = -netPower;
        const discharge = Math.min(state.storedPower, deficit * 0.5);
        newStoredPower = Math.max(0, state.storedPower - discharge);
      }
    }

    const { houses, poweredHouses, factories, poweredFactories } = countPoweredBuildings(
      newGrid,
      poweredCells
    );
    const totalBuildings = houses + factories;
    const totalPowered = poweredHouses + poweredFactories;
    let coverage = totalBuildings > 0 ? totalPowered / totalBuildings : 1;

    let newSatisfaction = state.satisfaction;
    if (coverage >= 0.8) {
      newSatisfaction = Math.min(100, state.satisfaction + 0.2);
    } else if (coverage >= 0.5) {
      newSatisfaction = Math.min(100, state.satisfaction + 0.05);
    } else {
      newSatisfaction = Math.max(0, state.satisfaction - 0.3);
    }

    let maturePlantCount = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = newGrid[y][x];
        if (
          cell.type === 'fluoroplant' &&
          !cell.faulty &&
          (cell.plantMaturity ?? 0) >= 80 &&
          (cell.plantHealth ?? 0) >= 50
        ) {
          maturePlantCount++;
        }
      }
    }
    if (maturePlantCount > 0) {
      newSatisfaction = Math.min(100, newSatisfaction + PLANT_SATISFACTION_BOOST * maturePlantCount);
    }

    saveToLocalStorage({
      grid: newGrid,
      dayTime: newDayTime,
      storedPower: newStoredPower,
      satisfaction: newSatisfaction,
    });

    set({
      grid: newGrid,
      dayTime: newDayTime,
      storedPower: newStoredPower,
      maxStorage: batteryCapacity,
      satisfaction: newSatisfaction,
      poweredCells,
      totalGeneration,
      totalConsumption,
      weakPowerZones,
    });
  },

  resetGame: () => {
    localStorage.removeItem(STORAGE_KEY);
    const fresh = createEmptyGrid();
    const result = recalcGrid(fresh, 20, 10);
    set({
      grid: result.newGrid,
      dayTime: 20,
      storedPower: 10,
      maxStorage: result.batteryCapacity,
      satisfaction: 50,
      selectedTool: 'windmill',
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      showSettlement: false,
      weakPowerZones: result.weakPowerZones,
    });
  },

  openSettlement: () => set({ showSettlement: true }),
  closeSettlement: () => set({ showSettlement: false }),
}));
