import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type EqBand = 'low' | 'mid' | 'high';

interface EqResponseVisualizerProps {
  lowGain: number;
  midGain: number;
  highGain: number;
  bassBoost: number;
  presetLabel?: string;
  onBandChange?: (band: EqBand, value: number) => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const EqResponseVisualizer: React.FC<EqResponseVisualizerProps> = ({
  lowGain,
  midGain,
  highGain,
  bassBoost,
  presetLabel,
  onBandChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeBandRef = useRef<EqBand | null>(null);
  const [activeBand, setActiveBand] = useState<EqBand | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const [hoverBand, setHoverBand] = useState<EqBand | null>(null);
  const [hoverLabel, setHoverLabel] = useState('');
  const [hoverPos, setHoverPos] = useState({ left: 0, top: 0 });
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  const frequencies = useMemo(() => {
    const points = 512;
    const values = new Float32Array(points);
    const fMin = 20;
    const fMax = 20000;
    const logMin = Math.log10(fMin);
    const logMax = Math.log10(fMax);

    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      values[i] = Math.pow(10, logMin + (logMax - logMin) * t);
    }

    return { values, fMin, fMax, logMin, logMax };
  }, []);

  const padL = 44;
  const padR = 12;
  const padT = 16;
  const padB = 28;

  const plotW = Math.max(0, layout.width - padL - padR);
  const plotH = Math.max(0, layout.height - padT - padB);

  const freqToX = (freq: number) => {
    if (!plotW) return 0;
    return padL + ((Math.log10(freq) - frequencies.logMin) / (frequencies.logMax - frequencies.logMin)) * plotW;
  };

  const dbToY = (db: number) => {
    if (!plotH) return 0;
    return padT + ((12 - db) / 24) * plotH;
  };

  const clientYToDb = (clientY: number) => {
    const container = containerRef.current;
    if (!container) return 0;

    const rect = container.getBoundingClientRect();
    const relativeY = clamp(clientY - rect.top, padT, rect.height - padB);
    const db = 12 - ((relativeY - padT) / Math.max(1, rect.height - padT - padB)) * 24;
    return clamp(db, -12, 12);
  };

  const handleBandPointerDown = (band: EqBand) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!onBandChange) return;
    event.preventDefault();
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverBand(null);
    activeBandRef.current = band;
    setActiveBand(band);
    event.currentTarget.setPointerCapture(event.pointerId);
    onBandChange(band, clientYToDb(event.clientY));
  };

  const handleBandPointerMove = (band: EqBand) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!onBandChange) return;
    if (activeBandRef.current !== band) return;
    event.preventDefault();
    onBandChange(band, clientYToDb(event.clientY));
  };

  const handleBandPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    activeBandRef.current = null;
    setActiveBand(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // noop
    }
  };

  const handleBandEnter = (band: EqBand, label: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
    }

    const rect = event.currentTarget.getBoundingClientRect();
    hoverTimerRef.current = window.setTimeout(() => {
      setHoverBand(band);
      setHoverLabel(label);
      setHoverPos({
        left: rect.left + rect.width / 2,
        top: rect.top - 10,
      });
    }, 250);
  };

  const handleBandLeave = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverBand(null);
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const draw = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const dpr = window.devicePixelRatio || 1;

      setLayout((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const plotW = width - padL - padR;
      const plotH = height - padT - padB;

      ctx.fillStyle = '#0c1014';
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;

      const dbLines = [12, 6, 0, -6, -12];
      dbLines.forEach((db) => {
        const y = padT + ((12 - db) / 24) * plotH;
        ctx.strokeStyle = db === 0 ? '#59616e' : '#2a3038';
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(width - padR, y);
        ctx.stroke();
      });

      const freqLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
      freqLabels.forEach((freq) => {
        const x = padL + ((Math.log10(freq) - frequencies.logMin) / (frequencies.logMax - frequencies.logMin)) * plotW;
        ctx.strokeStyle = '#252c34';
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
      });

      ctx.setLineDash([]);

      const lowShelf = (freq: number): number => {
        const normalized = freq / 90;
        const transition = 1 / (1 + Math.pow(normalized, 1.8));
        return lowGain * transition;
      };

      const midBell = (freq: number): number => {
        const center = 1200;
        const q = 1.05;
        const band = Math.log2(freq / center) / q;
        const shape = Math.exp(-(band * band) * 1.1);
        return midGain * shape;
      };

      const highShelf = (freq: number): number => {
        const normalized = freq / 7800;
        const transition = 1 - 1 / (1 + Math.pow(normalized, 1.7));
        return highGain * transition;
      };

      const bassShelf = (freq: number): number => {
        const normalized = freq / 130;
        const transition = 1 / (1 + Math.pow(normalized, 1.75));
        return bassBoost * transition;
      };

      const points = Array.from(frequencies.values).map((freq: number, index: number) => {
        const x = padL + (index / (frequencies.values.length - 1)) * plotW;
        const db = clamp(lowShelf(freq) + midBell(freq) + highShelf(freq) + bassShelf(freq), -12, 12);
        const y = padT + ((12 - db) / 24) * plotH;
        return { x, y, db, freq };
      });

      // Labels
      ctx.font = '10px monospace';
      ctx.fillStyle = '#8e95a0';
      dbLines.forEach((db) => {
        const y = padT + ((12 - db) / 24) * plotH;
        const text = `${db > 0 ? '+' : ''}${db}`;
        ctx.fillText(text, 6, y + 3);
      });

      freqLabels.forEach((freq) => {
        const x = padL + ((Math.log10(freq) - frequencies.logMin) / (frequencies.logMax - frequencies.logMin)) * plotW;
        const text = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
        const tw = ctx.measureText(text).width;
        ctx.fillText(text, x - tw / 2, height - 10);
      });

      ctx.fillStyle = '#ff9c1a';
      ctx.font = '10px monospace';
      ctx.fillText('dB', 10, 12);
      ctx.fillText('Hz', width - 24, height - 10);

      // Curva principal
      ctx.strokeStyle = '#9fd6ff';
      ctx.lineWidth = 3.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#9fd6ff';
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

    };

    const observer = new ResizeObserver(draw);
    observer.observe(container);
    draw();

    return () => observer.disconnect();
  }, [bassBoost, frequencies, highGain, lowGain, midGain]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="bg-[#101419] border border-[#2f3741] rounded-lg p-3 mt-2">
      <div className="flex items-center justify-between mb-2 font-mono text-[8px] uppercase tracking-wider">
        <span className="text-[#8e95a0]">EQ Frequency Response · {presetLabel ?? 'BALANCED'}</span>
        <span className="text-[#ff9c1a] font-bold">
          L {lowGain > 0 ? '+' : ''}{lowGain.toFixed(1)} dB / M {midGain > 0 ? '+' : ''}{midGain.toFixed(1)} dB / H {highGain > 0 ? '+' : ''}{highGain.toFixed(1)} dB / B {bassBoost > 0 ? '+' : ''}{bassBoost.toFixed(1)} dB
        </span>
      </div>
      <div ref={containerRef} className="relative w-full h-40 sm:h-48 rounded border border-[#1f2730] overflow-hidden bg-black/50">
        <canvas ref={canvasRef} className="w-full h-full block" />
        {layout.width > 0 && layout.height > 0 && (
          <>
            {([
              { band: 'low' as const, freq: 90, db: clamp(lowGain + bassBoost, -12, 12), label: 'LOW', help: 'Drag to boost or cut the lows.' },
              { band: 'mid' as const, freq: 1200, db: clamp(midGain, -12, 12), label: 'MID', help: 'Drag to shape body and presence.' },
              { band: 'high' as const, freq: 7800, db: clamp(highGain, -12, 12), label: 'HIGH', help: 'Drag to brighten or soften the top end.' },
            ]).map((marker) => {
              const x = freqToX(marker.freq);
              const y = dbToY(marker.db);

              return (
                <button
                  key={marker.band}
                  type="button"
                  aria-label={`${marker.label} ${marker.db.toFixed(1)} decibels`}
                  title={`${marker.label} ${marker.db.toFixed(1)} dB`}
                  onPointerDown={handleBandPointerDown(marker.band)}
                  onPointerMove={handleBandPointerMove(marker.band)}
                  onPointerUp={handleBandPointerUp}
                  onPointerCancel={handleBandPointerUp}
                  onMouseEnter={handleBandEnter(marker.band, marker.help)}
                  onMouseLeave={handleBandLeave}
                  className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#ffd18a] bg-[#ff9c1a] shadow-[0_0_12px_rgba(255,156,26,0.8)] transition-transform duration-75 ${activeBand === marker.band ? 'scale-125' : 'scale-100'}`}
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: '14px',
                    height: '14px',
                    touchAction: 'none',
                    cursor: 'grab',
                  }}
                >
                  <span className="sr-only">{marker.label}</span>
                </button>
              );
            })}
          </>
        )}
        {hoverBand && typeof document !== 'undefined' && createPortal(
          <span
            className="pointer-events-none fixed z-[9999] w-44 -translate-x-1/2 rounded border border-[#3a414c] bg-[#14181d] px-2.5 py-2 text-center font-mono text-[7px] leading-relaxed tracking-wide text-[#d3d8df] shadow-[0_10px_24px_rgba(0,0,0,0.45)] whitespace-normal"
            style={{
              left: `${hoverPos.left}px`,
              top: `${hoverPos.top}px`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <span className="block text-[#8e95a0] uppercase mb-1">{hoverBand}</span>
            {hoverLabel}
          </span>,
          document.body,
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[7px] uppercase text-[#737b86]">
        <span>20Hz - 20kHz</span>
        <span>-12dB to +12dB</span>
      </div>
    </div>
  );
};