import React, { useEffect, useRef } from 'react';

interface WavefolderVisualizerProps {
  foldAmount: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const foldSample = (x: number): number => {
  let y = x;
  while (y > 1 || y < -1) {
    if (y > 1) y = 2 - y;
    if (y < -1) y = -2 - y;
  }
  return y;
};

export const WavefolderVisualizer: React.FC<WavefolderVisualizerProps> = ({ foldAmount }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = width;
      const h = height;
      const midY = h * 0.5;

      ctx.fillStyle = '#0f1114';
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = '#2b2f36';
      ctx.lineWidth = 1;
      const cols = 10;
      const rows = 6;

      for (let i = 1; i < cols; i++) {
        const x = (w / cols) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      for (let i = 1; i < rows; i++) {
        const y = (h / rows) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      ctx.setLineDash([]);
      ctx.strokeStyle = '#3e4550';
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();

      const points = 420;
      const cycles = 2;
      const foldGain = 1 + (foldAmount / 100) * 6;

      // Input waveform (weak gray)
      ctx.strokeStyle = '#8b929d';
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const t = i / (points - 1);
        const phase = t * Math.PI * 2 * cycles;
        const input = Math.sin(phase);
        const x = t * w;
        const y = midY - input * (h * 0.36);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Folded waveform (bright overlay)
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ff9c1a';
      ctx.lineWidth = 2.2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff9c1a';
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const t = i / (points - 1);
        const phase = t * Math.PI * 2 * cycles;
        const input = Math.sin(phase);
        const folded = clamp(foldSample(input * foldGain), -1, 1);

        const x = t * w;
        const y = midY - folded * (h * 0.36);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    };

    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    draw();

    return () => {
      observer.disconnect();
    };
  }, [foldAmount]);

  return (
    <div className="bg-[#15181d] border border-[#323842] rounded-lg p-2.5 mt-2">
      <div className="flex items-center justify-between mb-2 font-mono text-[8px] uppercase tracking-wider">
        <span className="text-[#8e95a0]">Wavefolder Scope</span>
        <span className="text-[#ff9c1a] font-bold">Fold {Math.round(foldAmount)}%</span>
      </div>
      <div ref={containerRef} className="w-full h-24 sm:h-28 rounded border border-[#2b3139] overflow-hidden bg-black/60 relative">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[7px] uppercase text-[#737b86]">
        <span>Input (gray)</span>
        <span>Folded output (amber)</span>
      </div>
    </div>
  );
};
