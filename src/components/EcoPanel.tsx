import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { GRID_SIZE } from '../utils/constants';
import { assessPlantPowerState } from '../utils/powerCalculator';
import type { PlantPowerState } from '../utils/powerCalculator';

export const EcoPanel: React.FC = () => {
  const { grid, poweredCells, weakPowerZones, dayTime } = useGameStore();
  const isNight = dayTime >= 50;

  const plants: Array<{
    x: number;
    y: number;
    health: number;
    maturity: number;
    state: PlantPowerState;
  }> = [];

  let totalHealth = 0;
  let matureCount = 0;

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (cell.type === 'fluoroplant') {
        const state = assessPlantPowerState(grid, x, y, poweredCells);
        const health = cell.plantHealth ?? 50;
        const maturity = cell.plantMaturity ?? 0;
        plants.push({ x, y, health, maturity, state });
        totalHealth += health;
        if (maturity >= 80 && health >= 50) matureCount++;
      }
    }
  }

  const avgHealth = plants.length > 0 ? totalHealth / plants.length : 0;
  const weakZoneCount = weakPowerZones.size;

  const getStateLabel = (state: PlantPowerState) => {
    switch (state) {
      case 'thriving': return { text: '繁茂', color: 'text-green-400', bg: 'bg-green-500/20' };
      case 'ambient': return { text: '微光', color: 'text-cyan-400', bg: 'bg-cyan-500/20' };
      case 'overpowered': return { text: '灼伤', color: 'text-red-400', bg: 'bg-red-500/20' };
      case 'withered': return { text: '枯萎', color: 'text-gray-400', bg: 'bg-gray-500/20' };
    }
  };

  const healthColor =
    avgHealth >= 70
      ? 'from-green-400 to-emerald-500'
      : avgHealth >= 50
      ? 'from-yellow-400 to-amber-500'
      : avgHealth >= 30
      ? 'from-orange-400 to-red-400'
      : 'from-red-500 to-red-600';

  const stateCounts: Record<PlantPowerState, number> = {
    thriving: 0,
    ambient: 0,
    overpowered: 0,
    withered: 0,
  };
  for (const p of plants) {
    stateCounts[p.state]++;
  }

  return (
    <div
      className={`rounded-2xl p-4 shadow-xl border backdrop-blur-md ${
        isNight
          ? 'bg-slate-800/80 border-slate-700 text-slate-200'
          : 'bg-white/90 border-white/50 text-gray-700'
      }`}
    >
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
        <span className="text-lg">🌿</span> 萤光生态区
      </h3>

      {plants.length === 0 ? (
        <div className={`text-xs ${isNight ? 'text-slate-400' : 'text-gray-500'} space-y-2`}>
          <p>尚未放置萤光植物</p>
          <p>🌿 选择萤光植物工具放置在弱电区域</p>
          <p>💡 靠近电线但远离风车是最佳位置</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={`text-xs ${isNight ? 'text-slate-400' : 'text-gray-500'}`}>
              植物平均健康度
            </span>
            <span className="text-sm font-bold">{Math.round(avgHealth)}%</span>
          </div>
          <div className="h-2 bg-gray-700/30 rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${healthColor} transition-all duration-500 rounded-full`}
              style={{ width: `${avgHealth}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className={`rounded-lg p-2 text-center ${isNight ? 'bg-slate-700/50' : 'bg-gray-50'}`}>
              <div className="text-lg font-bold text-green-400">{plants.length}</div>
              <div className={isNight ? 'text-slate-400' : 'text-gray-500'}>植物总数</div>
            </div>
            <div className={`rounded-lg p-2 text-center ${isNight ? 'bg-slate-700/50' : 'bg-gray-50'}`}>
              <div className="text-lg font-bold text-cyan-400">{matureCount}</div>
              <div className={isNight ? 'text-slate-400' : 'text-gray-500'}>成熟植物</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['thriving', 'ambient', 'overpowered', 'withered'] as PlantPowerState[]).map((state) => {
              if (stateCounts[state] === 0) return null;
              const info = getStateLabel(state);
              return (
                <span
                  key={state}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.bg} ${info.color}`}
                >
                  {stateCounts[state]} {info.text}
                </span>
              );
            })}
          </div>

          <div className="space-y-1">
            {plants.map((p, i) => {
              const info = getStateLabel(p.state);
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between text-xs p-1.5 rounded ${
                    isNight ? 'bg-slate-700/30' : 'bg-gray-50'
                  }`}
                >
                  <span className={isNight ? 'text-slate-300' : 'text-gray-600'}>
                    ({p.x},{p.y})
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-1 bg-gray-700/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${healthColor} rounded-full`}
                        style={{ width: `${p.health}%` }}
                      />
                    </div>
                    <span className={`font-medium ${info.color}`}>{info.text}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`mt-3 pt-3 border-t ${isNight ? 'border-slate-600' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between text-xs">
          <span className={isNight ? 'text-slate-400' : 'text-gray-500'}>弱电覆盖格</span>
          <span className="font-bold text-teal-400">{weakZoneCount}</span>
        </div>
        <div className="mt-2">
          <EcoHeatmapGrid isNight={isNight} />
        </div>
      </div>
    </div>
  );
};

const EcoHeatmapGrid: React.FC<{ isNight: boolean }> = ({ isNight }) => {
  const { weakPowerZones, grid, poweredCells } = useGameStore();

  const maxLevel = Math.max(1, ...Array.from(weakPowerZones.values()));

  return (
    <div
      className="grid gap-px rounded overflow-hidden"
      style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}
    >
      {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, idx) => {
        const x = idx % GRID_SIZE;
        const y = Math.floor(idx / GRID_SIZE);
        const level = weakPowerZones.get(`${x},${y}`) ?? 0;
        const isPlant = grid[y][x].type === 'fluoroplant';
        const isPowered = poweredCells.has(`${x},${y}`);

        let bgColor = isNight ? 'rgba(30, 41, 59, 0.5)' : 'rgba(243, 244, 246, 0.8)';

        if (level > 0) {
          const intensity = level / maxLevel;
          if (isNight) {
            bgColor = `rgba(0, 255, 136, ${0.1 + intensity * 0.5})`;
          } else {
            bgColor = `rgba(34, 197, 94, ${0.1 + intensity * 0.3})`;
          }
        }

        if (isPlant) {
          const health = grid[y][x].plantHealth ?? 50;
          if (health >= 70) {
            bgColor = 'rgba(0, 255, 136, 0.7)';
          } else if (health >= 50) {
            bgColor = 'rgba(250, 204, 21, 0.6)';
          } else {
            bgColor = 'rgba(239, 68, 68, 0.6)';
          }
        }

        return (
          <div
            key={idx}
            className="w-full aspect-square relative"
            style={{ backgroundColor: bgColor }}
          >
            {isPlant && (
              <div className="absolute inset-0 flex items-center justify-center text-[8px]">
                🌿
              </div>
            )}
            {isPowered && !isPlant && grid[y][x].type === 'wire' && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: isNight ? 'rgba(59, 130, 246, 0.4)' : 'rgba(59, 130, 246, 0.25)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
