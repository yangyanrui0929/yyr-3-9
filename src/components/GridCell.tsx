import React from 'react';
import { GridCell as GridCellType, ToolType } from '../utils/constants';
import { Building } from './Building';
import { useGameStore } from '../store/useGameStore';

interface GridCellProps {
  cell: GridCellType;
  selectedTool: ToolType;
  onClick: () => void;
  onRightClick: (e: React.MouseEvent) => void;
}

export const GridCellComponent: React.FC<GridCellProps> = ({
  cell,
  selectedTool,
  onClick,
  onRightClick,
}) => {
  const isEmpty = cell.type === 'empty';
  const canPlace = isEmpty && selectedTool !== 'remove';
  const canRemove = !isEmpty && selectedTool === 'remove';
  const canRepair = cell.faulty;

  const weakPowerZones = useGameStore((s) => s.weakPowerZones);
  const dayTime = useGameStore((s) => s.dayTime);
  const isNight = dayTime >= 50;

  const weakLevel = weakPowerZones.get(`${cell.x},${cell.y}`) ?? 0;
  const showHeatmap = weakLevel > 0 && cell.type !== 'fluoroplant';

  const heatmapOpacity = weakLevel > 0
    ? Math.min(0.35, weakLevel * 0.04)
    : 0;

  const heatmapColor = isNight
    ? `rgba(0, 255, 136, ${heatmapOpacity})`
    : `rgba(34, 197, 94, ${heatmapOpacity * 0.6})`;

  return (
    <div
      onClick={onClick}
      onContextMenu={onRightClick}
      className={`
        relative w-14 h-14 border border-green-600/30 cursor-pointer
        transition-all duration-150 select-none
        ${isEmpty ? 'bg-green-400/40 hover:bg-green-300/60' : 'bg-green-500/50'}
        ${canPlace ? 'hover:ring-2 hover:ring-blue-400 hover:ring-inset' : ''}
        ${canRemove ? 'hover:ring-2 hover:ring-red-400 hover:ring-inset' : ''}
        ${canRepair ? 'ring-2 ring-orange-400 ring-inset animate-pulse' : ''}
        ${cell.powered && !cell.faulty ? 'bg-green-400/60' : ''}
      `}
      style={{
        borderRadius: '4px',
      }}
    >
      <Building cell={cell} />
      {showHeatmap && (
        <div
          className="absolute inset-0 pointer-events-none rounded"
          style={{
            background: heatmapColor,
            boxShadow: isNight
              ? `inset 0 0 6px rgba(0, 255, 136, ${heatmapOpacity * 0.5})`
              : 'none',
          }}
        />
      )}
      {cell.type === 'fluoroplant' && weakLevel > 0 && isNight && !cell.faulty && (
        <div
          className="absolute inset-0 pointer-events-none rounded animate-pulse"
          style={{
            background: `radial-gradient(circle, rgba(0, 255, 136, 0.15) 0%, transparent 80%)`,
          }}
        />
      )}
      {canRepair && (
        <div className="absolute inset-0 flex items-center justify-center bg-orange-500/20 z-10">
          <span className="text-xs font-bold text-white drop-shadow-lg">🔧维修</span>
        </div>
      )}
    </div>
  );
};
