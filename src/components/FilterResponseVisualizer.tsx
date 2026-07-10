import React, { useEffect, useRef, useState } from 'react';
import { FilterRouting } from '../types';

interface FilterResponseVisualizerProps {
  cutoff: number;
  resonance: number;
  routing: FilterRouting;
  parallelBlend: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const FilterResponseVisualizer: React.FC<FilterResponseVisualizerProps> = ({
  cutoff,
  resonance,
  routing,
  parallelBlend,
}) => {
  const [dbScale, setDbScale] = useState<'focus' | 'wide'>('focus');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const ctxRef = useRef<OfflineAudioContext | null>(null);
  const lowPassRef = useRef<BiquadFilterNode | null>(null);
  const highPassRef = useRef<BiquadFilterNode | null>(null);

  useEffect(() => {
    const offline = new OfflineAudioContext(1, 2048, 44100);

    const lp = offline.createBiquadFilter();
    lp.type = 'lowpass';

    const hp = offline.createBiquadFilter();
    hp.type = 'highpass';

    ctxRef.current = offline;
    lowPassRef.current = lp;
    highPassRef.current = hp;

    return () => {
      ctxRef.current = null;
      lowPassRef.current = null;
      highPassRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const lp = lowPassRef.current;
    const hp = highPassRef.current;
    if (!container || !canvas || !lp || !hp) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);

      const g = canvas.getContext('2d');
      if (!g) return;

      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      g.fillStyle = '#0f1114';
      g.fillRect(0, 0, width, height);

      // Grid
      g.lineWidth = 1;
      g.strokeStyle = '#2c3138';
      g.setLineDash([2, 4]);

      const cols = 8;
      const rows = 6;
      for (let i = 1; i < cols; i++) {
        const x = (width / cols) * i;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, height);
        g.stroke();
      }

      for (let i = 1; i < rows; i++) {
        const y = (height / rows) * i;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(width, y);
        g.stroke();
      }

      g.setLineDash([]);

      const points = 512;
      const frequencies = new Float32Array(points);
      const magLP = new Float32Array(points);
      const phaseLP = new Float32Array(points);
      const magHP = new Float32Array(points);
      const phaseHP = new Float32Array(points);

      const fMin = 20;
      const fMax = 20000;
      const logMin = Math.log10(fMin);
      const logMax = Math.log10(fMax);

      for (let i = 0; i < points; i++) {
        const t = i / (points - 1);
        frequencies[i] = Math.pow(10, logMin + (logMax - logMin) * t);
      }

      lp.frequency.value = clamp(cutoff, 40, 18000);
      lp.Q.value = clamp(resonance, 0.1, 30);

      hp.frequency.value = clamp(cutoff * 0.45, 20, 18000);
      hp.Q.value = clamp(resonance * 0.8, 0.1, 30);

      lp.getFrequencyResponse(frequencies, magLP, phaseLP);
      hp.getFrequencyResponse(frequencies, magHP, phaseHP);

      const blend = clamp(parallelBlend / 100, 0, 1);
      const responseDb = new Float32Array(points);

      let peakIdx = 0;
      let peakDb = -Infinity;

      for (let i = 0; i < points; i++) {
        let mag = 1;

        if (routing === 'series') {
          mag = magLP[i] * magHP[i];
        } else {
          mag = (1 - blend) * magLP[i] + blend * magHP[i];
        }

        const db = 20 * Math.log10(Math.max(mag, 1e-6));
        responseDb[i] = db;

        if (db > peakDb) {
          peakDb = db;
          peakIdx = i;
        }
      }

      const minDb = dbScale === 'focus' ? -36 : -72;
      const maxDb = dbScale === 'focus' ? 18 : 24;
      const mapX = (i: number) => (i / (points - 1)) * width;
      const mapY = (db: number) => {
        const n = (db - minDb) / (maxDb - minDb);
        return height - clamp(n, 0, 1) * height;
      };
      const mapFreqToX = (f: number) => {
        const clamped = clamp(f, fMin, fMax);
        const n = (Math.log10(clamped) - logMin) / (logMax - logMin);
        return n * width;
      };

      // 0dB reference
      g.strokeStyle = '#49515d';
      g.lineWidth = 1.2;
      const y0 = mapY(0);
      g.beginPath();
      g.moveTo(0, y0);
      g.lineTo(width, y0);
      g.stroke();

      // Cutoff marker
      const cutoffNorm = (Math.log10(clamp(cutoff, fMin, fMax)) - logMin) / (logMax - logMin);
      const cutoffX = cutoffNorm * width;
      g.strokeStyle = '#546171';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cutoffX, 0);
      g.lineTo(cutoffX, height);
      g.stroke();

      // Response curve
      g.strokeStyle = '#ff9c1a';
      g.lineWidth = 2.2;
      g.shadowBlur = 8;
      g.shadowColor = '#ff9c1a';
      g.beginPath();
      for (let i = 0; i < points; i++) {
        const x = mapX(i);
        const y = mapY(responseDb[i]);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.shadowBlur = 0;

      // Resonance peak marker
      const px = mapX(peakIdx);
      const py = mapY(responseDb[peakIdx]);
      g.fillStyle = '#ffdf99';
      g.strokeStyle = '#ff9c1a';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(px, py, 4, 0, Math.PI * 2);
      g.fill();
      g.stroke();

      g.font = '10px monospace';
      g.fillStyle = '#8e95a0';
      g.fillText('20Hz', 6, height - 6);
      const rightLabel = '20kHz';
      const tw = g.measureText(rightLabel).width;
      g.fillText(rightLabel, width - tw - 6, height - 6);

      // Fixed band labels for quick technical reading.
      const bandFreqs = [100, 1000, 10000];
      g.fillStyle = '#7a838f';
      bandFreqs.forEach((f) => {
        const x = mapFreqToX(f);
        g.strokeStyle = '#37404a';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, height);
        g.stroke();

        const label = f >= 1000 ? `${(f / 1000).toFixed(0)}k` : `${f}`;
        const lw = g.measureText(label).width;
        g.fillText(label, x - lw / 2, 11);
      });

      g.fillStyle = '#ffae57';
      const peakFreq = frequencies[peakIdx];
      const peakText = `PEAK ${peakFreq.toFixed(0)}Hz / ${peakDb.toFixed(1)}dB`;
      g.fillText(peakText, 8, 14);
    };

    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    draw();

    return () => observer.disconnect();
  }, [cutoff, resonance, routing, parallelBlend, dbScale]);

  return (
    <div className="bg-[#15181d] border border-[#323842] rounded-lg p-2.5 mt-2">
      <div className="flex items-center justify-between mb-2 font-mono text-[8px] uppercase tracking-wider">
        <span className="text-[#8e95a0]">Multimode Filter Response</span>
        <span className="text-[#ff9c1a] font-bold">Cutoff {Math.round(cutoff)}Hz / Q {resonance.toFixed(1)}</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setDbScale('focus')}
          className={`font-mono text-[8px] uppercase px-2 py-1 rounded border ${
            dbScale === 'focus'
              ? 'bg-[#ff9c1a]/20 text-[#ff9c1a] border-[#ff9c1a]/40'
              : 'bg-[#22272e] text-[#8e95a0] border-[#3b434f]'
          }`}
        >
          Focus dB
        </button>
        <button
          onClick={() => setDbScale('wide')}
          className={`font-mono text-[8px] uppercase px-2 py-1 rounded border ${
            dbScale === 'wide'
              ? 'bg-[#ff9c1a]/20 text-[#ff9c1a] border-[#ff9c1a]/40'
              : 'bg-[#22272e] text-[#8e95a0] border-[#3b434f]'
          }`}
        >
          Wide dB
        </button>
      </div>
      <div ref={containerRef} className="w-full h-28 sm:h-32 rounded border border-[#2b3139] overflow-hidden bg-black/60">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[7px] uppercase text-[#737b86]">
        <span>Curve from getFrequencyResponse</span>
        <span>Resonance peak + 100/1k/10k markers</span>
      </div>
    </div>
  );
};
