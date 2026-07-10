import React, { useRef, useEffect, useState } from 'react';
import { InfoDot } from './InfoDot';

interface KnobProps {
  min: number;
  max: number;
  value: number;
  onChange: (val: number) => void;
  name: string;
  unit?: string;
  step?: number;
  size?: 'default' | 'large' | 'xl';
  dragDistance?: number;
}

const knobHelp: Record<string, string> = {
  'LOW EQ': 'Boosts or cuts the low end. Subtle boosts feel thicker; cuts make the sound leaner and cleaner.',
  'MID EQ': 'Shapes the body and presence area. Positive values sound forward and vocal; negative values sound scooped.',
  'HIGH EQ': 'Adds or removes brightness and air. Boosts sound more open; cuts sound softer and darker.',
  'SUB BOOST': 'Adds extra low-end weight. Use it for bigger bass, but too much can blur the mix.',
  'ATTACK': 'Controls how quickly the source is clipped or trimmed in the front. Shorter attack feels tighter and more percussive.',
  'TRIM': 'Chooses how much of the source buffer is used. Lower values feel shorter and more chopped.',
  'SHAPER': 'Pushes the signal into harmonic shaping. It sounds denser, grainier, and a bit more aggressive.',
  'FOLDER': 'Folds peaks back into the waveform. The sound becomes more metallic, animated, and rich in harmonics.',
  'PWM': 'Warps pulse width and asymmetry. Higher values make the source feel more alive and moving.',
  'SUB LVL': 'Blends in a lower octave body layer. It makes the sound bigger and more fundamental-heavy.',
  'SUB DIRT': 'Distorts the sub layer before it blends in. Higher values sound rougher and more saturated.',
  'NOISE': 'Adds colored noise under the source. Small amounts create breath and texture; large amounts get noisy.',
  'KEY ATTACK': 'How fast the keyboard envelope reaches its peak. Faster attack sounds snappier; slower feels softer.',
  'KEY SUSTAIN': 'How much level remains held after the attack stage. Higher sustain sounds fuller and steadier.',
  'KEY RELEASE': 'How long the note takes to fade after key-off. Long release feels smoother and more washed.',
  'LOOP RATE': 'How quickly the looping envelope repeats. Faster rates feel more rhythmic and animated.',
  'COARSE TUNE': 'Moves the pitch in semitone steps. Use it for musical transposition and interval work.',
  'FINE-TUNE': 'Offsets pitch in cents. Useful for subtle detune, correction, and stereo beating.',
  'DRIFT': 'Introduces unstable pitch movement. Low values feel vintage; high values sound more wobbly and worn.',
  'AGE ENV': 'Adds extra envelope instability over time. It makes the note feel older, looser, and less static.',
  'DETUNE': 'Spreads unison voices apart in pitch. More detune sounds wider, thicker, and more chorus-like.',
  'SPREAD': 'Moves voices across the stereo field. Wider spread sounds larger and more cinematic.',
  'CUTOFF': 'Sets the main cutoff frequency. Lower values darken the tone; higher values open it up.',
  'RESON': 'Emphasizes the cutoff area. More resonance sounds peakier, more vocal, and more synth-like.',
  'PREDRV': 'Drives the signal before the filter. It adds grit and thickness into the filter stage.',
  'POSTDRV': 'Saturates after the filter. It sounds more finished, punchy, and slightly compressed.',
  'SELF OSC': 'Feeds the filter into self-oscillation territory. High values make it ring and sing on its own.',
  'LEGACYDRV': 'Adds broad saturation in the FX bus. More drive makes the whole sound warmer and rougher.',
  'BITCRUSH': 'Reduces bit depth. It sounds lo-fi, crunchy, and digital in a purposeful way.',
  'SR RED': 'Drops sample-rate resolution. Higher values sound more aliased, stepped, and old-school.',
  'CHORUS': 'Blends in a doubled, moving layer. It widens the sound and softens the edges.',
  'CH RATE': 'Controls how fast the chorus motion moves. Slower feels lush; faster feels shimmery.',
  'CH DEPTH': 'Sets how far the chorus moves. More depth sounds wider and more swirly.',
  'RING AMT': 'Adds ring modulation. It creates metallic sidebands and a more synthetic edge.',
  'RING FREQ': 'Sets the ring mod carrier frequency. Lower is growly; higher is bright and bell-like.',
  'GATE RATE': 'Controls tremolo/gating speed. Faster rates create chopping and motion; slower feels pulsing.',
  'GATE DEPTH': 'Sets how deep the gating gets. Higher depth makes the volume movement more dramatic.',
  'AMOUNT': 'How much this modulation slot affects its destination. More amount means a stronger modulation.',
};

export const Knob: React.FC<KnobProps> = ({
  min,
  max,
  value,
  onChange,
  name,
  unit = '',
  step = 1,
  size = 'default',
  dragDistance,
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
    const effectiveDragDistance = dragDistance ?? 150;
    const deltaVal = (dy / effectiveDragDistance) * range;
    
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
    const precision = step < 1 ? 1 : 0;
    if (unit === 'db' || unit === 'dB') {
      return (value > 0 ? '+' : '') + value.toFixed(precision) + ' dB';
    }
    if (unit === 'ms') {
      return value.toFixed(precision) + ' ms';
    }
    if (unit === '%') {
      return value.toFixed(precision) + ' %';
    }
    return value.toFixed(precision) + ' ' + unit;
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

  const sizeClasses = {
    default: 'w-[82px] sm:w-[96px] p-1.5 sm:p-2',
    large: 'w-[110px] sm:w-[126px] p-2 sm:p-2.5',
    xl: 'w-full min-w-0 p-2.5 sm:p-3',
  } as const;

  const dialShellClasses = {
    default: 'w-14 h-14 sm:w-16 sm:h-16',
    large: 'w-16 h-16 sm:w-[74px] sm:h-[74px]',
    xl: 'w-24 h-24 sm:w-[92px] sm:h-[92px]',
  } as const;

  const bodyClasses = {
    default: 'w-10 h-10 sm:w-11 sm:h-11',
    large: 'w-12 h-12 sm:w-[54px] sm:h-[54px]',
    xl: 'w-16 h-16 sm:w-[76px] sm:h-[76px]',
  } as const;

  const labelClasses = {
    default: 'text-[8px] sm:text-[9px]',
    large: 'text-[9px] sm:text-[10px]',
    xl: 'text-[10px] sm:text-[11px]',
  } as const;

  const valueClasses = {
    default: 'text-[9px] sm:text-[10px]',
    large: 'text-[10px] sm:text-[11px]',
    xl: 'text-[11px] sm:text-[12px]',
  } as const;

  const helpText = knobHelp[name];

  return (
    <div className={`interactive-card flex flex-col items-center gap-1.5 select-none bg-[#2d3137] rounded-lg border border-[#424750] shadow-md relative overflow-visible ${sizeClasses[size]}`}>
      {/* Detalhes de aviação/industrial no fundo do knob */}
      <div className="absolute top-0 left-0 w-full h-[3px] bg-[#ff7b00] opacity-80" />
      
      {/* Container do knob com as marcações radial SVG */}
      <div className={`relative flex items-center justify-center ${dialShellClasses[size]}`}>
        {/* Halo LED proporcional ao valor */}
        <div
          className="absolute inset-[4px] rounded-full pointer-events-none"
          style={{
            background: `conic-gradient(#ff7b00 ${pct * 360}deg, rgba(66,72,80,0.35) ${pct * 360}deg 360deg)`,
            boxShadow: `0 0 ${4 + pct * 10}px rgba(255,123,0,${0.2 + pct * 0.5})`,
            opacity: 0.9,
          }}
        />

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
          className={`interactive-control rounded-full border border-[#1b1c1e] relative cursor-grab active:cursor-grabbing shadow-[inset_0_2px_4px_rgba(255,255,255,0.1),0_4px_8px_rgba(0,0,0,0.8)] flex items-center justify-center transition-all ${bodyClasses[size]} ${
            isDragging ? 'scale-[1.04] shadow-[0_0_12px_rgba(255,123,0,0.3)]' : 'hover:border-[#595f68]'
          }`}
          style={{
            background: 'radial-gradient(circle at 32% 28%, #68707d 0%, #2f3640 40%, #1f242c 72%, #14171b 100%)',
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
            className="absolute top-0.5 left-1/2 w-1.5 h-1.5 rounded-full bg-[#ff7b00] origin-[50%_19.5px] sm:origin-[50%_21.5px] shadow-[0_0_8px_#ff7b00]"
            style={{
              transform: `translateX(-50%) rotate(${rotAngle}deg)`,
            }}
          />
        </div>
      </div>
      
      {/* Nome legível do controlador */}
      <div className={`flex items-center justify-center gap-1 w-full border-t border-[#3e434b] pt-1 relative z-10 ${labelClasses[size]}`}>
        <span className="font-sans font-bold text-[#8d95a1] tracking-wider uppercase truncate">{name}</span>
        {helpText && <InfoDot description={helpText} />}
      </div>
      
      {/* Display LED do valor do knob */}
      <div className={`font-mono text-[#ffae00] bg-black/80 px-1.5 py-0.5 rounded border border-[#1f2125] w-full text-center tracking-tight font-bold shadow-inner ${valueClasses[size]}`}>
        {formatValue()}
      </div>
    </div>
  );
};
