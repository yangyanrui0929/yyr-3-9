import React from 'react';
import { GridCell, BUILDING_STATS, WIRE_CONNECTIONS } from '../utils/constants';
import { useGameStore } from '../store/useGameStore';

interface BuildingProps {
  cell: GridCell;
}

export const Building: React.FC<BuildingProps> = ({ cell }) => {
  if (cell.type === 'empty') return null;

  if (cell.type === 'wire') {
    return <WireVisual rotation={cell.rotation} powered={cell.powered} faulty={cell.faulty} />;
  }

  if (cell.type === 'fluoroplant') {
    return <FluoroPlantVisual cell={cell} />;
  }

  const stats = BUILDING_STATS[cell.type];
  const isRotating = cell.type === 'windmill' && cell.powered && !cell.faulty;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className={`text-3xl transition-all duration-200 ${
          cell.powered && !cell.faulty ? 'scale-100 drop-shadow-lg' : 'opacity-60 scale-95'
        } ${isRotating ? 'animate-[spin_3s_linear_infinite]' : ''}`}
        style={{
          filter: cell.faulty
            ? 'hue-rotate(-50deg) saturate(2)'
            : cell.powered
            ? 'none'
            : 'grayscale(50%)',
        }}
      >
        {stats.emoji}
      </div>
      {cell.faulty && (
        <div className="absolute -top-1 -right-1 text-sm animate-pulse">⚠️</div>
      )}
      {cell.type === 'battery' && !cell.faulty && (
        <div className="absolute bottom-0 left-1 right-1 h-1.5 bg-gray-300 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 transition-all duration-500"
            style={{ width: `${Math.min(100, cell.powered ? 80 : 30)}%` }}
          />
        </div>
      )}
    </div>
  );
};

const FluoroPlantVisual: React.FC<{ cell: GridCell }> = ({ cell }) => {
  const dayTime = useGameStore((s) => s.dayTime);
  const isNight = dayTime >= 50;
  const health = cell.plantHealth ?? 50;
  const maturity = cell.plantMaturity ?? 0;

  const isBurned = health < 30;
  const isWithered = health < 50 && !isBurned;
  const isThriving = health >= 70;
  const isMature = maturity >= 80;

  let emoji = '🌿';
  let glowColor = 'transparent';
  let glowIntensity = 0;

  if (isBurned) {
    emoji = '🥀';
  } else if (isWithered) {
    emoji = '🪴';
  } else if (isMature) {
    emoji = '🌺';
    if (isNight) {
      glowColor = 'rgba(0, 255, 136, 0.6)';
      glowIntensity = 12;
    }
  } else if (isThriving) {
    emoji = '🌿';
    if (isNight) {
      glowColor = 'rgba(0, 255, 136, 0.3)';
      glowIntensity = 6;
    }
  }

  const healthColor =
    health >= 70
      ? 'from-green-400 to-emerald-500'
      : health >= 50
      ? 'from-yellow-400 to-amber-500'
      : health >= 30
      ? 'from-orange-400 to-red-400'
      : 'from-red-500 to-red-600';

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className={`text-3xl transition-all duration-500 ${
          cell.faulty ? 'opacity-40 grayscale' : ''
        } ${isThriving && !cell.faulty ? 'scale-100' : 'scale-90'}`}
        style={{
          filter: isBurned && !cell.faulty
            ? 'hue-rotate(-30deg) saturate(0.5) brightness(0.7)'
            : isWithered && !cell.faulty
            ? 'saturate(0.6) brightness(0.8)'
            : undefined,
          textShadow: glowIntensity > 0
            ? `0 0 ${glowIntensity}px ${glowColor}, 0 0 ${glowIntensity * 2}px ${glowColor}`
            : 'none',
        }}
      >
        {emoji}
      </div>
      {cell.faulty && (
        <div className="absolute -top-1 -right-1 text-sm animate-pulse">⚠️</div>
      )}
      <div className="absolute bottom-0 left-0.5 right-0.5 flex flex-col gap-0.5">
        <div className="h-1 bg-gray-700/50 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${healthColor} transition-all duration-300 rounded-full`}
            style={{ width: `${health}%` }}
          />
        </div>
        <div className="h-0.5 bg-gray-700/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-teal-400 transition-all duration-300 rounded-full"
            style={{ width: `${maturity}%` }}
          />
        </div>
      </div>
      {isNight && isThriving && !cell.faulty && (
        <div
          className="absolute inset-0 rounded pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
            opacity: isMature ? 0.5 : 0.25,
          }}
        />
      )}
    </div>
  );
};

interface WireVisualProps {
  rotation: number;
  powered: boolean;
  faulty: boolean;
}

const WireVisual: React.FC<WireVisualProps> = ({ rotation, powered, faulty }) => {
  const connections = WIRE_CONNECTIONS[rotation % 6] || [true, false, true, false];
  const [top, right, bottom, left] = connections;

  const baseColor = faulty
    ? '#EF4444'
    : powered
    ? '#3B82F6'
    : '#9CA3AF';
  const glowColor = faulty
    ? 'rgba(239, 68, 68, 0.6)'
    : powered
    ? 'rgba(59, 130, 246, 0.5)'
    : 'transparent';

  const lineStyle: React.CSSProperties = {
    backgroundColor: baseColor,
    boxShadow: powered || faulty ? `0 0 8px ${glowColor}` : 'none',
    transition: 'all 0.3s ease',
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {top && (
        <div
          className="absolute left-1/2 top-0 w-1.5 h-1/2 -translate-x-1/2 rounded-full"
          style={lineStyle}
        />
      )}
      {right && (
        <div
          className="absolute right-0 top-1/2 w-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={lineStyle}
        />
      )}
      {bottom && (
        <div
          className="absolute left-1/2 bottom-0 w-1.5 h-1/2 -translate-x-1/2 rounded-full"
          style={lineStyle}
        />
      )}
      {left && (
        <div
          className="absolute left-0 top-1/2 w-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={lineStyle}
        />
      )}
      <div
        className={`absolute left-1/2 top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${
          powered && !faulty ? 'animate-pulse' : ''
        }`}
        style={{
          backgroundColor: baseColor,
          boxShadow: powered || faulty ? `0 0 10px ${glowColor}` : 'none',
        }}
      />
      {faulty && (
        <div className="absolute -top-1 -right-1 text-xs animate-pulse">⚠️</div>
      )}
    </div>
  );
};
