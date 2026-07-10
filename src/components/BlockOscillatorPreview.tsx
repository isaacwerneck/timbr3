import React, { useMemo } from 'react';
import { SynthSettings } from '../types';

type BlockIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface BlockOscillatorPreviewProps {
  block: BlockIndex;
  settings: SynthSettings;
  enabled: boolean;
  title?: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const easeFold = (x: number, amount: number) => {
  let y = x * amount;
  while (y > 1 || y < -1) {
    if (y > 1) y = 2 - y;
    if (y < -1) y = -2 - y;
  }
  return y;
};

const superSaw = (t: number, voices: number, detune: number) => {
  let sum = 0;
  for (let i = 0; i < voices; i++) {
    const pos = voices === 1 ? 0 : (i / (voices - 1)) * 2 - 1;
    const freqOffset = 1 + pos * (detune / 120);
    const phase = (t * freqOffset) % 1;
    sum += phase * 2 - 1;
  }
  return sum / voices;
};

export const BlockOscillatorPreview: React.FC<BlockOscillatorPreviewProps> = ({ block, settings, enabled, title }) => {
  const data = useMemo(() => {
    const samples = 180;
    const values: number[] = [];
    const amt = enabled ? 1 : 0.25;

    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const p = t * Math.PI * 2;
      let y = 0;

      switch (block) {
        case 1: {
          const low = settings.lowGain / 12;
          const mid = settings.midGain / 12;
          const high = settings.highGain / 12;
          const tilt = (low - high) * 0.15;
          y = Math.sin(p) * 0.82 + Math.sin(p * 2.3 + low) * 0.26 + Math.sin(p * 5.2 + high) * 0.12 + mid * 0.18 + tilt;
          break;
        }
        case 2: {
          const fold = 1 + settings.wavefoldAmount / 16;
          const shape = 1 + settings.waveshapeAmount / 12;
          const pwm = settings.pwmAmount / 100;
          const base = Math.sin(p * (1 + pwm * 0.5));
          y = easeFold(Math.tanh(base * shape), fold) * 0.9;
          y += Math.sign(base) * (settings.subLevel / 100) * 0.12;
          break;
        }
        case 3: {
          const atk = settings.keyAttack / 200;
          const sus = settings.keySustain / 100;
          const rel = settings.keyRelease / 500;
          const env = t < atk ? t / Math.max(atk, 0.05) : t < 0.65 ? 1 : 1 - ((t - 0.65) / Math.max(rel, 0.05));
          y = clamp(env, 0, 1) * 0.95 - 0.1;
          break;
        }
        case 4: {
          const coarse = settings.pitchCoarse / 24;
          const fine = settings.pitchFine / 50;
          y = Math.sin(p + coarse) * 0.2 + coarse * 0.45 + fine * 0.12;
          break;
        }
        case 5: {
          const rate = settings.keyLoopRate / 20;
          const phase = (t * rate * 4) % 1;
          const env = phase < 0.25 ? phase / 0.25 : phase < 0.6 ? 1 : 1 - ((phase - 0.6) / 0.4);
          y = clamp(env, 0, 1) * 0.85 - 0.12;
          break;
        }
        case 6: {
          const lfo = settings.lfo1;
          const phase2 = t * Math.max(lfo.rate / 6, 0.25) * 2;
          const frac = phase2 - Math.floor(phase2);
          if (lfo.waveform === 'sine') y = Math.sin(phase2 * Math.PI * 2);
          else if (lfo.waveform === 'triangle') y = 1 - 4 * Math.abs(frac - 0.5);
          else if (lfo.waveform === 'square') y = frac < 0.5 ? 1 : -1;
          else if (lfo.waveform === 'sawtooth') y = frac * 2 - 1;
          else if (lfo.waveform === 'sample-hold') y = Math.sin((Math.floor(t * 18) + 1) * 12.989) * 0.7;
          else y = lfo.customShape[Math.floor(frac * lfo.customShape.length) % lfo.customShape.length] ?? 0;
          y *= lfo.depth / 100;
          break;
        }
        case 7: {
          const influence = settings.modMatrix.reduce((acc, slot) => acc + (slot.enabled ? Math.abs(slot.amount) : 0), 0) / 400;
          y = Math.sin(p * 2) * (0.25 + influence) + Math.cos(p * 5) * 0.08;
          break;
        }
        case 8: {
          const cut = clamp(settings.filterCutoff, 40, 18000);
          const resonance = settings.filterResonance / 24;
          const norm = Math.log10(20 + t * (20000 - 20));
          const cutoffNorm = Math.log10(cut);
          const slope = 1 - clamp((norm - cutoffNorm) * 3.5, 0, 1);
          const peak = Math.exp(-Math.pow((norm - cutoffNorm) * 2.2, 2)) * resonance * 0.9;
          y = slope * 0.75 + peak - 0.35;
          break;
        }
        case 9: {
          const voices = settings.unisonVoices;
          const detune = settings.unisonDetune;
          y = superSaw(t, voices, detune) * (0.5 + settings.unisonStereoSpread / 200);
          y += (Math.random() - 0.5) * (settings.driftAmount / 500);
          break;
        }
        case 10: {
          const ring = settings.ringModAmount / 100;
          const chorus = settings.chorusMix / 100;
          const gate = settings.gaterEnabled ? settings.gaterDepth / 100 : 0;
          const gateWave = settings.gaterWaveform;
          const g = gateWave === 'square' ? (t % (1 / Math.max(settings.gaterRate / 6, 0.3)) < 0.5 ? 1 : 0)
            : gateWave === 'triangle' ? 1 - 2 * Math.abs(((t * settings.gaterRate * 3) % 1) - 0.5)
            : gateWave === 'sawtooth' ? ((t * settings.gaterRate * 3) % 1) * 2 - 1
            : Math.sin(p * settings.gaterRate) * 0.5 + 0.5;
          y = Math.sin(p * 2) * (0.5 - ring * 0.2) + Math.cos(p * 7) * ring * 0.18 + (chorus - 0.5) * 0.1 + (g - 0.5) * gate * 0.8;
          break;
        }
      }

      values.push(clamp(y * amt, -1, 1));
    }

    return values;
  }, [block, enabled, settings]);

  const theme = useMemo(() => {
    const themes = {
      1: { accent: '#8dd7ff', faint: 'rgba(141,215,255,0.16)', fill: 'rgba(141,215,255,0.22)', bg: '#11151a', label: 'EQ FIELD' },
      2: { accent: '#ff9c1a', faint: 'rgba(255,156,26,0.16)', fill: 'rgba(255,156,26,0.26)', bg: '#111419', label: 'SOURCE SHAPER' },
      3: { accent: '#34c759', faint: 'rgba(52,199,89,0.16)', fill: 'rgba(52,199,89,0.22)', bg: '#10161a', label: 'ADSR CURVE' },
      4: { accent: '#c68cff', faint: 'rgba(198,140,255,0.16)', fill: 'rgba(198,140,255,0.22)', bg: '#12131a', label: 'PITCH GRID' },
      5: { accent: '#ff6b6b', faint: 'rgba(255,107,107,0.16)', fill: 'rgba(255,107,107,0.22)', bg: '#151218', label: 'LOOP PATH' },
      6: { accent: '#34d7d1', faint: 'rgba(52,215,209,0.16)', fill: 'rgba(52,215,209,0.22)', bg: '#0f1617', label: 'LFO GRID' },
      7: { accent: '#f0a84b', faint: 'rgba(240,168,75,0.16)', fill: 'rgba(240,168,75,0.20)', bg: '#16130f', label: 'MOD ROUTE' },
      8: { accent: '#ffbf69', faint: 'rgba(255,191,105,0.18)', fill: 'rgba(255,191,105,0.22)', bg: '#131610', label: 'FILTER CURVE' },
      9: { accent: '#9f9bff', faint: 'rgba(159,155,255,0.16)', fill: 'rgba(159,155,255,0.22)', bg: '#101319', label: 'UNISON STACK' },
      10: { accent: '#ff4d8d', faint: 'rgba(255,77,141,0.16)', fill: 'rgba(255,77,141,0.22)', bg: '#181116', label: 'FX GLITCH' },
    } as const;

    const base = themes[block];
    return enabled
      ? base
      : {
          ...base,
          accent: '#6b717b',
          faint: 'rgba(107,113,123,0.16)',
          fill: 'rgba(107,113,123,0.18)',
        };
  }, [block, enabled]);

  const accent = theme.accent;
  const faint = theme.faint;
  const fill = theme.fill;
  const label = title ?? `B${block}`;

  const path = data.map((y, i) => {
    const x = (i / (data.length - 1)) * 100;
    const yy = 50 - y * 34;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${yy.toFixed(2)}`;
  }).join(' ');

  const area = `${path} L 100 84 L 0 84 Z`;

  const majorTicks = Array.from({ length: 6 }).map((_, i) => 10 + i * 16);

  return (
    <div
      className={`interactive-card rounded-lg border p-2 border-[#303743] ${enabled ? 'shadow-[0_0_14px_rgba(255,156,26,0.08)]' : 'opacity-65'}`}
      style={{ backgroundColor: theme.bg }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex flex-col leading-none gap-0.5">
          <span className="font-mono text-[8px] uppercase tracking-wider text-[#8e95a0]">{label}</span>
          <span className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#5f6772]">{theme.label}</span>
        </div>
        <span className="font-mono text-[7px] uppercase text-[#ff9c1a]">{enabled ? 'LIVE' : 'BYPASS'}</span>
      </div>
      <svg viewBox="0 0 100 84" className={`w-full block overflow-visible ${block === 1 ? 'h-28 sm:h-32' : 'h-16'}`}>
        <defs>
          <linearGradient id={`fill-${block}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={fill} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          <linearGradient id={`glow-${block}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="50%" stopColor={accent} stopOpacity="0.5" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="84" rx="6" fill={theme.bg} />
        <g opacity="0.9">
          {Array.from({ length: 5 }).map((_, i) => (
            <line key={`h-${i}`} x1="0" y1={14 + i * 14} x2="100" y2={14 + i * 14} stroke={faint} strokeWidth="0.8" strokeDasharray="2 3" />
          ))}
          {Array.from({ length: 4 }).map((_, i) => (
            <line key={`v-${i}`} x1={20 + i * 20} y1="0" x2={20 + i * 20} y2="84" stroke={faint} strokeWidth="0.8" strokeDasharray="2 3" />
          ))}
          <line x1="0" y1="42" x2="100" y2="42" stroke="#46505b" strokeWidth="1" />
        </g>

        {block === 1 && (
          <g>
            {majorTicks.map((x, i) => (
              <rect key={i} x={x - 4} y={54 - Math.abs(Math.sin(i + 1)) * 24} width="8" height={20 + i * 2} rx="2" fill={accent} opacity={0.62 - i * 0.07} />
            ))}
            <path d={area} fill={`url(#fill-${block})`} opacity="0.88" />
          </g>
        )}

        {block === 2 && (
          <g>
            <path d="M 0 61 C 12 56, 18 31, 30 29 S 48 52, 58 42 S 74 18, 100 33" fill="none" stroke={accent} strokeWidth="1.2" opacity="0.55" />
            <path d={area} fill={`url(#fill-${block})`} opacity="0.9" />
          </g>
        )}

        {block === 3 && (
          <g>
            <path d="M 8 66 L 20 66 L 34 28 L 60 28 L 80 42 L 92 56" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 5px ${accent})` }} />
            <circle cx="20" cy="66" r="2.2" fill={accent} />
            <circle cx="34" cy="28" r="2.2" fill={accent} />
            <circle cx="60" cy="28" r="2.2" fill={accent} />
            <circle cx="80" cy="42" r="2.2" fill={accent} />
            <path d="M 6 70 H 94" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
          </g>
        )}

        {block === 4 && (
          <g>
            <path d="M 10 63 C 22 54, 31 49, 43 43 S 63 31, 90 22" fill="none" stroke={accent} strokeWidth="2.2" />
            <circle cx="43" cy="43" r="4" fill="rgba(0,0,0,0)" stroke={accent} strokeWidth="1.5" />
            {Array.from({ length: 5 }).map((_, i) => (
              <line key={i} x1={12 + i * 18} y1="73" x2={12 + i * 18} y2={64 - i * 3} stroke={accent} strokeWidth="1" opacity={0.5 + i * 0.1} />
            ))}
          </g>
        )}

        {block === 5 && (
          <g>
            <path d="M 3 64 L 16 64 L 26 30 L 40 30 L 50 64 L 63 64 L 74 26 L 88 26 L 97 58" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 24 21 H 41" stroke={accent} strokeWidth="1" strokeDasharray="3 3" />
            <path d="M 73 18 H 92" stroke={accent} strokeWidth="1" strokeDasharray="3 3" />
            <path d="M 20 18 L 27 21 L 20 24" fill="none" stroke={accent} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 67 15 L 74 18 L 67 21" fill="none" stroke={accent} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}

        {block === 6 && (
          <g>
            <path d={path} fill="none" stroke={accent} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 5px ${accent})` }} />
            <path d="M 10 18 C 18 18, 18 66, 28 66 C 38 66, 38 18, 48 18 S 68 66, 78 66 S 90 18, 98 18" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.1" strokeDasharray="2 4" />
            {Array.from({ length: 4 }).map((_, i) => (
              <line key={i} x1={12 + i * 22} y1="10" x2={12 + i * 22} y2="74" stroke={accent} strokeWidth="0.8" opacity={0.24} />
            ))}
          </g>
        )}

        {block === 7 && (
          <g>
            <circle cx="18" cy="42" r="6" fill="rgba(255,255,255,0.04)" stroke={accent} strokeWidth="1.4" />
            <circle cx="50" cy="20" r="6" fill="rgba(255,255,255,0.04)" stroke={accent} strokeWidth="1.4" />
            <circle cx="50" cy="64" r="6" fill="rgba(255,255,255,0.04)" stroke={accent} strokeWidth="1.4" />
            <circle cx="84" cy="42" r="6" fill="rgba(255,255,255,0.04)" stroke={accent} strokeWidth="1.4" />
            <path d="M 24 42 H 44" stroke={accent} strokeWidth="2" />
            <path d="M 50 26 V 58" stroke={accent} strokeWidth="2" />
            <path d="M 56 20 H 78" stroke={accent} strokeWidth="2" />
            <path d="M 56 64 H 78" stroke={accent} strokeWidth="2" />
            <path d="M 40 42 H 74" stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity="0.75" />
            <path d="M 72 42 L 78 38 L 78 46 Z" fill={accent} />
          </g>
        )}

        {block === 8 && (
          <g>
            <path d={path} fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 5px ${accent})` }} />
            <path d="M 8 68 C 22 66, 27 58, 34 50 S 49 29, 60 28 S 78 34, 92 14" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.2" />
            <line x1="56" y1="6" x2="56" y2="78" stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
          </g>
        )}

        {block === 9 && (
          <g>
            {[-10, -4, 2, 8].map((offset, i) => (
              <path
                key={i}
                d={data.map((y, j) => {
                  const x = (j / (data.length - 1)) * 100;
                  const yy = 50 - y * (28 - i * 2) + offset;
                  return `${j === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${yy.toFixed(2)}`;
                }).join(' ')}
                fill="none"
                stroke={accent}
                strokeWidth={i === 3 ? '2.2' : '1'}
                opacity={0.25 + i * 0.18}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        )}

        {block === 10 && (
          <g>
            {Array.from({ length: 9 }).map((_, i) => (
              <rect key={i} x={8 + i * 10} y={i % 2 === 0 ? 24 : 48} width="6" height={i % 3 === 0 ? 28 : 16} rx="1.5" fill={accent} opacity={0.25 + i * 0.05} />
            ))}
            <path d={path} fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 12 18 C 20 8, 30 8, 38 18 S 58 28, 68 18 S 84 8, 94 18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.1" strokeDasharray="4 3" />
            <line x1="0" y1="42" x2="100" y2="42" stroke={accent} strokeWidth="1" opacity="0.45" />
          </g>
        )}

        <path d={area} fill={`url(#fill-${block})`} />
        <line x1="0" y1="7" x2="100" y2="7" stroke={`url(#glow-${block})`} strokeWidth="1.2" opacity="0.45" />
        {block !== 1 && block !== 3 && block !== 4 && block !== 7 && block !== 8 && block !== 9 && block !== 10 && (
          <path d={path} fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 5px ${accent})` }} />
        )}
        {block === 1 && (
          <path d={path} fill="none" stroke={accent} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 8px ${accent})` }} />
        )}
      </svg>
    </div>
  );
};
