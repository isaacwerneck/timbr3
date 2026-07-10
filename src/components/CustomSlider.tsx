import React, { useMemo, useRef, useState } from 'react';
import { InfoDot } from './InfoDot';

interface CustomSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (next: number) => void;
  label: string;
  unit?: string;
  helpText?: string;
  step?: number;
  orientation?: 'horizontal' | 'vertical';
  density?: 'default' | 'compact';
  className?: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const CustomSlider: React.FC<CustomSliderProps> = ({
  min,
  max,
  value,
  onChange,
  label,
  unit = '',
  helpText,
  step = 1,
  orientation = 'horizontal',
  density = 'default',
  className = '',
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const pct = useMemo(() => {
    if (max === min) return 0;
    return ((value - min) / (max - min)) * 100;
  }, [max, min, value]);

  const toStepped = (v: number) => {
    const snapped = min + Math.round((v - min) / step) * step;
    return clamp(snapped, min, max);
  };

  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = trackRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();

    if (orientation === 'horizontal') {
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      onChange(toStepped(min + ratio * (max - min)));
      return;
    }

    const ratio = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
    onChange(toStepped(min + ratio * (max - min)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handlePointerCancel = () => {
    setDragging(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = step;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(toStepped(value + delta));
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(toStepped(value - delta));
    }
  };

  const decimals = step < 1 ? Math.min(3, Math.max(1, String(step).split('.')[1]?.length || 1)) : 0;
  const displayValue = `${Number(value).toFixed(decimals)}${unit ? ` ${unit}` : ''}`;

  const isCompact = density === 'compact';

  const verticalTrackHeight = isCompact ? 120 : 160;
  const verticalTrackClass = isCompact ? 'w-8 h-[120px]' : 'w-9 h-40';
  const verticalThumbSize = isCompact ? 24 : 28;
  const verticalThumbHalf = verticalThumbSize / 2;

  const horizontalTrackClass = isCompact ? 'h-5' : 'h-6';
  const horizontalThumbSize = isCompact ? 20 : 24;
  const horizontalThumbHalf = horizontalThumbSize / 2;

  if (orientation === 'vertical') {
    return (
      <div className={`flex flex-col items-center gap-1.5 md:gap-2 ${className}`}>
        <div className={`flex items-center justify-center gap-1 font-mono text-[#8e95a0] uppercase tracking-wider font-bold text-center ${isCompact ? 'text-[7px]' : 'text-[8px]'}`}>
          <span>{label}</span>
          {helpText && <InfoDot description={helpText} />}
        </div>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-label={label}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className={`interactive-control relative rounded-full border border-[#3a414c] bg-[#15191f] cursor-pointer outline-none ${verticalTrackClass}`}
          style={{
            boxShadow: 'inset 0 0 8px rgba(0,0,0,0.8), 0 0 10px rgba(255,156,26,0.1)',
          }}
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-1 rounded-full w-2 transition-[height] duration-75"
            style={{
              height: `${Math.max(0, (pct / 100) * (verticalTrackHeight - 8))}px`,
              background: 'linear-gradient(180deg, #ffd38a, #ff9c1a)',
              boxShadow: '0 0 8px rgba(255,156,26,0.75)',
            }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full border border-[#5f6775] transition-[bottom,box-shadow] duration-75"
            style={{
              width: `${verticalThumbSize}px`,
              height: `${verticalThumbSize}px`,
              bottom: `${clamp((pct / 100) * verticalTrackHeight - verticalThumbHalf, 0, verticalTrackHeight - verticalThumbSize)}px`,
              background: 'radial-gradient(circle at 35% 30%, #6a7384 0%, #2d3440 68%, #1b2027 100%)',
              boxShadow: dragging
                ? '0 0 14px rgba(255,156,26,0.65), inset 0 1px 2px rgba(255,255,255,0.25)'
                : '0 2px 6px rgba(0,0,0,0.8), inset 0 1px 2px rgba(255,255,255,0.2)',
            }}
          />
        </div>
        <span className={`font-mono text-[#ffb85a] bg-black/70 border border-[#2e343c] rounded px-1.5 py-0.5 text-center ${isCompact ? 'text-[8px] min-w-[52px]' : 'text-[9px] min-w-[56px]'}`}>{displayValue}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 md:gap-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1 font-mono text-[#8e95a0] uppercase font-bold tracking-wider ${isCompact ? 'text-[8px]' : 'text-[9px]'}`}>
          <span>{label}</span>
          {helpText && <InfoDot description={helpText} />}
        </div>
        <span className={`font-mono text-[#ffb85a] bg-black/70 border border-[#2e343c] rounded px-1.5 py-0.5 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>{displayValue}</span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className={`interactive-control relative rounded-full border border-[#3a414c] bg-[#15191f] cursor-pointer outline-none ${horizontalTrackClass}`}
        style={{
          boxShadow: 'inset 0 0 8px rgba(0,0,0,0.85), 0 0 10px rgba(255,156,26,0.1)',
        }}
      >
        <div
          className="absolute left-1 top-1 bottom-1 rounded-full transition-[width] duration-75"
          style={{
            width: `${Math.max(0, clamp(pct, 0, 100))}%`,
            background: 'linear-gradient(90deg, #ffb449, #ff8f00)',
            boxShadow: '0 0 10px rgba(255,156,26,0.75)',
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full border border-[#5f6775] transition-[left,box-shadow] duration-75"
          style={{
            width: `${horizontalThumbSize}px`,
            height: `${horizontalThumbSize}px`,
            left: `calc(${clamp(pct, 0, 100)}% - ${horizontalThumbHalf}px)`,
            background: 'radial-gradient(circle at 35% 30%, #6a7384 0%, #2d3440 68%, #1b2027 100%)',
            boxShadow: dragging
              ? '0 0 14px rgba(255,156,26,0.65), inset 0 1px 2px rgba(255,255,255,0.25)'
              : '0 2px 6px rgba(0,0,0,0.8), inset 0 1px 2px rgba(255,255,255,0.2)',
          }}
        />
      </div>
    </div>
  );
};
