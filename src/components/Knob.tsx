import React, { useRef, useEffect, useState } from 'react';

interface KnobProps {
  min: number;
  max: number;
  value: number;
  onChange: (val: number) => void;
  name: string;
  unit?: string;
  step?: number;
}

export const Knob: React.FC<KnobProps> = ({
  min,
  max,
  value,
  onChange,
  name,
  unit = '',
  step = 1,
}) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startValRef = useRef(0);

  // Mapear valor atual para ângulo de rotação (-135deg a 135deg)
  const pct = (value - min) / (max - min);
  const rotAngle = -135 + pct * 270;

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValRef.current = value;
    if (knobRef.current) {
      knobRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dy = startYRef.current - e.clientY;
    
    // Sensibilidade de arrasto: 150px de movimento vertical para ir de min a max
    const range = max - min;
    const dragDistance = 150;
    const deltaVal = (dy / dragDistance) * range;
    
    let newVal = startValRef.current + deltaVal;
    
    // Arredondar para o step mais próximo
    newVal = Math.round(newVal / step) * step;
    
    // Clampar valor
    newVal = Math.min(max, Math.max(min, newVal));
    onChange(newVal);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Formatação amigável do valor
  const formatValue = () => {
    if (unit === 'db' || unit === 'dB') {
      return (value > 0 ? '+' : '') + value.toFixed(0) + ' dB';
    }
    if (unit === 'ms') {
      return value.toFixed(0) + ' ms';
    }
    if (unit === '%') {
      return value.toFixed(0) + ' %';
    }
    return value.toFixed(0) + ' ' + unit;
  };

  // Gerar posições para as marcações (ticks) ao redor do knob
  const totalTicks = 11;
  const ticks = Array.from({ length: totalTicks }).map((_, idx) => {
    const angle = -135 + (idx / (totalTicks - 1)) * 270;
    const rad = (angle - 90) * (Math.PI / 180);
    const x1 = 32 + 25 * Math.cos(rad);
    const y1 = 32 + 25 * Math.sin(rad);
    const x2 = 32 + 29 * Math.cos(rad);
    const y2 = 32 + 29 * Math.sin(rad);
    
    // Determinar se o tick está "ativo" (valor atual atingiu ou passou desta marcação)
    const tickPct = idx / (totalTicks - 1);
    const isActive = pct >= tickPct;

    return { x1, y1, x2, y2, angle, isActive };
  });

  return (
    <div className="flex flex-col items-center gap-1.5 w-[96px] select-none p-2 bg-[#2d3137] rounded-lg border border-[#424750] shadow-md relative overflow-hidden">
      {/* Detalhes de aviação/industrial no fundo do knob */}
      <div className="absolute top-0 left-0 w-full h-[3px] bg-[#ff7b00] opacity-80" />
      
      {/* Container do knob com as marcações radial SVG */}
      <div className="relative w-16 h-16 flex items-center justify-center">
        {/* SVG de ticks de fundo */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {ticks.map((tick, idx) => (
            <line
              key={idx}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              stroke={tick.isActive ? '#ff7b00' : '#494f57'}
              strokeWidth={tick.isActive ? '2' : '1.5'}
              className="transition-colors duration-150"
              style={tick.isActive ? { filter: 'drop-shadow(0 0 2px #ff7b00)' } : undefined}
            />
          ))}
        </svg>

        {/* Corpo do Knob Físico */}
        <div
          ref={knobRef}
          className={`w-11 h-11 rounded-full border border-[#1b1c1e] relative cursor-grab active:cursor-grabbing shadow-[inset_0_2px_4px_rgba(255,255,255,0.1),0_4px_8px_rgba(0,0,0,0.8)] flex items-center justify-center transition-all ${
            isDragging ? 'scale-[1.04] shadow-[0_0_12px_rgba(255,123,0,0.3)]' : 'hover:border-[#595f68]'
          }`}
          style={{
            background: 'radial-gradient(circle at 35% 30%, #464b53 0%, #212428 75%, #15171a 100%)',
            touchAction: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Anel estriado industrial */}
          <div className="absolute inset-1 rounded-full border border-dashed border-[#1f2125] opacity-45 pointer-events-none" />

          {/* Tampa central metálica com ranhura de parafuso */}
          <div className="w-5 h-5 rounded-full bg-[#1b1c1e] border border-[#373b42] flex items-center justify-center shadow-inner pointer-events-none">
            {/* Ranhura de parafuso fenda/phillips */}
            <div className="w-3 h-0.5 bg-[#424750] rounded" style={{ transform: `rotate(${rotAngle}deg)` }} />
          </div>

          {/* Ponteiro / Marcador de Posição da Aviação */}
          <div
            className="absolute top-0.5 left-1/2 w-1.5 h-1.5 rounded-full bg-[#ff7b00] origin-[50%_21.5px] shadow-[0_0_8px_#ff7b00]"
            style={{
              transform: `translateX(-50%) rotate(${rotAngle}deg)`,
            }}
          />
        </div>
      </div>
      
      {/* Nome legível do controlador */}
      <div className="font-sans text-[9px] font-bold text-[#8d95a1] tracking-wider uppercase text-center truncate w-full border-t border-[#3e434b] pt-1">
        {name}
      </div>
      
      {/* Display LED do valor do knob */}
      <div className="font-mono text-[10px] text-[#ffae00] bg-black/80 px-1.5 py-0.5 rounded border border-[#1f2125] w-full text-center tracking-tight font-bold shadow-inner">
        {formatValue()}
      </div>
    </div>
  );
};
