import React, { useEffect, useRef } from 'react';
import { SynthEngine } from '../audio/SynthEngine';

interface OscilloscopeProps {
  synthRef: React.RefObject<SynthEngine | null>;
  systemPower: boolean;
}

export const Oscilloscope: React.FC<OscilloscopeProps> = ({ synthRef, systemPower }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle canvas resizing based on container
    const resizeCanvas = () => {
      const container = containerRef.current;
      if (container && canvas) {
        canvas.width = container.clientWidth * window.devicePixelRatio;
        canvas.height = container.clientHeight * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    resizeCanvas();

    // Data buffer for analyzer
    let dataArray = new Uint8Array(0);
    let bufferLength = 0;
    let phase = 0; // for standby signal

    const draw = () => {
      if (!canvas || !ctx) return;
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      // 1. Background (CRT dark glass with depth)
      ctx.fillStyle = '#0f0a05';
      ctx.fillRect(0, 0, width, height);

      // Check system power
      if (!systemPower) {
        // Off state: dark screen with a very subtle fade-out dot in the center if recently powered off
        ctx.fillStyle = '#050302';
        ctx.fillRect(0, 0, width, height);
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      // 2. Retro Scope Grid (Amber/Orange)
      ctx.strokeStyle = '#2d1802';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);

      // Horizontal grid lines
      const gridRows = 6;
      for (let i = 1; i < gridRows; i++) {
        const y = (height / gridRows) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Vertical grid lines
      const gridCols = 8;
      for (let i = 1; i < gridCols; i++) {
        const x = (width / gridCols) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Center crosshairs (solid subtle lines)
      ctx.strokeStyle = '#4a2503';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      
      // Center horizontal
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Center vertical
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();

      // 3. Get Audio Data or generate Standby Ambient Signal
      let isPlaying = false;
      const synth = synthRef.current;

      if (synth) {
        const analyser = synth.getAnalyser();
        if (analyser) {
          bufferLength = analyser.frequencyBinCount;
          if (dataArray.length !== bufferLength) {
            dataArray = new Uint8Array(bufferLength);
          }
          analyser.getByteTimeDomainData(dataArray);
          
          // Detect if we actually have signal (not just silent constant 128)
          let minVal = 255;
          let maxVal = 0;
          for (let i = 0; i < bufferLength; i++) {
            if (dataArray[i] < minVal) minVal = dataArray[i];
            if (dataArray[i] > maxVal) maxVal = dataArray[i];
          }
          
          // If range is wider than simple noise threshold, mark as playing
          if (maxVal - minVal > 4) {
            isPlaying = true;
          }
        }
      }

      // 4. Draw Oscilloscope Waveform (Amber Glow)
      ctx.strokeStyle = '#ff9500';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // Setup outer glow effect
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff9500';

      ctx.beginPath();

      if (isPlaying && bufferLength > 0) {
        // Render real-time synthesizer waveform
        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          // Normalize to range -1 to 1
          const v = dataArray[i] / 128.0 - 1.0; 
          const y = (height / 2) + v * (height / 2.2);

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }
      } else {
        // Render beautiful standby signal (slow drifting sine wave with small noise)
        const points = 120;
        const sliceWidth = width / points;
        phase += 0.05;

        for (let i = 0; i < points; i++) {
          const x = i * sliceWidth;
          // Drifting waveform made of two sinusoids for complex retro radar style
          const angle1 = (i / points) * Math.PI * 4 + phase;
          const angle2 = (i / points) * Math.PI * 8 - phase * 0.5;
          const noise = (Math.random() - 0.5) * 0.02; // tape hiss simulation
          
          const v = (Math.sin(angle1) * 0.06 + Math.cos(angle2) * 0.03 + noise);
          const y = (height / 2) + v * (height / 2);

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      }

      ctx.stroke();

      // Reset shadows to avoid degrading grid rendering on next frame
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [synthRef, systemPower]);

  return (
    <div ref={containerRef} className="w-full h-full relative rounded-lg border border-[#30333a] overflow-hidden bg-black/40 shadow-inner">
      {/* Gloss overlay to simulate glass CRT */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/0 via-white/[0.03] to-white/[0.08] rounded-lg" />
      {/* Scanline overlay for aesthetic retro-grid cockpit design */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.07] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
