import React, { useEffect, useState, useRef } from 'react';

interface KeyboardProps {
  onPlayNote: (midiNumber: number, freq: number, noteName: string) => void;
  onStopNote: (midiNumber: number) => void;
  activeMidiNotes: Set<number>;
  lastPlayedNote: string;
  setLastPlayedNote: (note: string) => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const Keyboard: React.FC<KeyboardProps> = ({
  onPlayNote,
  onStopNote,
  activeMidiNotes,
  lastPlayedNote,
  setLastPlayedNote,
}) => {
  const startMidi = 36; // C2
  const endMidi = 84;   // C6
  const WHITE_WIDTH = 42; // px

  const [hoverMidi, setHoverMidi] = useState<number | null>(null);
  const [midiAccessState, setMidiAccessState] = useState<'disponivel' | 'não suportado' | 'conectando' | 'conectado'>('disponivel');

  // Mapeamento do teclado do computador para tocar notas (uma oitava básica, de C3 a C4)
  const computerKeyMap: { [key: string]: number } = {
    'a': 48, // C3
    'w': 49, // C#3
    's': 50, // D3
    'e': 51, // D#3
    'd': 52, // E3
    'f': 53, // F3
    't': 54, // F#3
    'g': 55, // G3
    'y': 56, // G#3
    'h': 57, // A3
    'u': 58, // A#3
    'j': 59, // B3
    'k': 60, // C4
    'o': 61, // C#4
    'l': 62, // D4
    'p': 63, // D#4
    ';': 64, // E4
    'ç': 64, // E4
  };

  const activeComputerKeys = useRef<Set<string>>(new Set());

  // Converter midi para frequência
  const midiToFreq = (midi: number) => {
    return 440 * Math.pow(2, (midi - 69) / 12);
  };

  // Converter midi para nome legível (ex: C3, D#2)
  const getNoteName = (midi: number) => {
    const name = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return name + octave;
  };

  const triggerPlay = (midi: number) => {
    const freq = midiToFreq(midi);
    const name = getNoteName(midi);
    onPlayNote(midi, freq, name);
    setLastPlayedNote(`${name} (${freq.toFixed(1)} Hz)`);
  };

  const triggerStop = (midi: number) => {
    onStopNote(midi);
  };

  // Eventos de teclado do computador
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (computerKeyMap[key] !== undefined && !activeComputerKeys.current.has(key)) {
        const midi = computerKeyMap[key];
        activeComputerKeys.current.add(key);
        triggerPlay(midi);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (computerKeyMap[key] !== undefined) {
        const midi = computerKeyMap[key];
        activeComputerKeys.current.delete(key);
        triggerStop(midi);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onPlayNote, onStopNote]);

  // Suporte a MIDI USB real
  const setupMidi = async () => {
    if (!navigator.requestMIDIAccess) {
      setMidiAccessState('não suportado');
      return;
    }

    try {
      setMidiAccessState('conectando');
      const midiAccess = await navigator.requestMIDIAccess();
      
      const onMidiMessage = (msg: any) => {
        const [status, data1, data2] = msg.data;
        const cmd = status >> 4;
        
        if (cmd === 9 && data2 > 0) {
          triggerPlay(data1);
        } else if (cmd === 8 || (cmd === 9 && data2 === 0)) {
          triggerStop(data1);
        }
      };

      const handleStateChange = () => {
        for (const input of midiAccess.inputs.values()) {
          input.onmidimessage = onMidiMessage;
        }
      };

      midiAccess.onstatechange = handleStateChange;
      handleStateChange();
      setMidiAccessState('conectado');
    } catch (e) {
      setMidiAccessState('não suportado');
    }
  };

  // Gerar o layout do teclado
  const keys: { midi: number; isBlack: boolean; left: number; noteName: string }[] = [];
  let whiteCount = 0;

  for (let m = startMidi; m <= endMidi; m++) {
    const name = NOTE_NAMES[m % 12];
    const isBlack = name.includes('#');
    
    if (!isBlack) {
      keys.push({
        midi: m,
        isBlack: false,
        left: whiteCount * WHITE_WIDTH,
        noteName: name + (Math.floor(m / 12) - 1),
      });
      whiteCount++;
    } else {
      keys.push({
        midi: m,
        isBlack: true,
        left: whiteCount * WHITE_WIDTH - 13,
        noteName: name + (Math.floor(m / 12) - 1),
      });
    }
  }

  const sortedKeys = [...keys].sort((a, b) => (a.isBlack ? 1 : -1));

  return (
    <div className="flex flex-col gap-3">
      {/* Placa metálica com rebites e indicadores de circuito do teclado */}
      <div className="relative overflow-x-auto rounded-xl bg-gradient-to-b from-[#25282e] to-[#15171a] border border-[#3e434b] p-4 shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),0_10px_20px_rgba(0,0,0,0.7)]">
        
        {/* Rebites nos cantos do painel do teclado */}
        <span className="absolute w-2 h-2 rounded-full bg-[#30343a] top-2 left-2 border border-[#1b1c1e] shadow-inner" />
        <span className="absolute w-2 h-2 rounded-full bg-[#30343a] top-2 right-2 border border-[#1b1c1e] shadow-inner" />
        
        {/* Header do teclado estilo aviação */}
        <div className="flex items-center justify-between mb-3 border-b border-[#30343a] pb-2 px-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff22] shadow-[0_0_6px_#00ff22] animate-pulse" />
            <span className="font-display text-[9px] font-bold text-[#a0aab8] tracking-[0.2em] uppercase">
              KEYBOARD ACTUATOR ARRAY // TIMBR3 CIRCUITRY
            </span>
          </div>
          <div className="font-mono text-[9px] text-[#ffae00] bg-black/60 border border-[#2d3137] px-2 py-0.5 rounded uppercase tracking-wider">
            OCTS: C2 - C6
          </div>
        </div>

        {/* LED INDICATORS BAR: Uma linha de pequenos LEDs acima de cada tecla correspondente que acende em verde/âmbar! */}
        <div className="relative h-4 mb-2 overflow-hidden border-b border-[#2d3137]/30" style={{ width: `${whiteCount * WHITE_WIDTH}px` }}>
          {keys.map((k) => {
            const isActive = activeMidiNotes.has(k.midi);
            return (
              <span
                key={`led-${k.midi}`}
                className={`absolute w-1.5 h-1.5 rounded-full top-1 transition-all duration-75 ${
                  isActive
                    ? k.isBlack
                      ? 'bg-[#ffae00] shadow-[0_0_8px_#ffae00]'
                      : 'bg-[#00ff22] shadow-[0_0_8px_#00ff22]'
                    : 'bg-[#1b1c1e] shadow-inner border border-[#2c3036]'
                }`}
                style={{
                  left: k.isBlack ? `${k.left + 9}px` : `${k.left + 18}px`,
                }}
              />
            );
          })}
        </div>

        {/* Scroll das Teclas */}
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-[#424750] scrollbar-track-transparent">
          <div 
            className="relative h-[174px]" 
            style={{ width: `${whiteCount * WHITE_WIDTH}px` }}
          >
            {sortedKeys.map((k) => {
              const isActive = activeMidiNotes.has(k.midi);
              
              if (k.isBlack) {
                return (
                  <button
                    key={k.midi}
                    id={`key-${k.midi}`}
                    className={`absolute w-[26px] h-[104px] rounded-b-[4px] transition-all cursor-pointer z-20 shadow-[0_4px_6px_rgba(0,0,0,0.6)] outline-none border-l border-r border-b border-[#0d0e10] ${
                      isActive
                        ? 'bg-gradient-to-b from-[#ff8400] to-[#b35300] border-t-2 border-[#ffbe60] shadow-[0_0_12px_rgba(255,132,0,0.5)]'
                        : 'bg-gradient-to-b from-[#353a42] to-[#1c1e22] hover:from-[#404650] hover:to-[#22252a]'
                    }`}
                    style={{ left: `${k.left}px` }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      triggerPlay(k.midi);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      triggerStop(k.midi);
                    }}
                    onPointerLeave={() => {
                      if (isActive) triggerStop(k.midi);
                    }}
                    title={k.noteName}
                  >
                    {/* Linha vertical de brilho para dar 3D */}
                    <div className="absolute top-0 bottom-0 left-[3px] w-[1px] bg-white/5" />
                  </button>
                );
              } else {
                // Tecla branca (estilo aviação creme fosco)
                const isC = k.noteName.startsWith('C');
                return (
                  <button
                    key={k.midi}
                    id={`key-${k.midi}`}
                    className={`absolute w-[42px] h-[170px] border-l border-r border-b border-[#2d3137] rounded-b-[6px] transition-all cursor-pointer outline-none flex flex-col justify-end pb-2 items-center ${
                      isActive
                        ? 'bg-gradient-to-b from-[#00ffc4] to-[#029674] text-black font-bold shadow-[inset_0_0_12px_rgba(0,0,0,0.2),0_0_15px_rgba(0,255,196,0.4)]'
                        : 'bg-gradient-to-b from-[#e3ded2] to-[#c7c0b0] hover:from-[#ece7dd] hover:to-[#cfc9b9] text-[#4d463a]'
                    }`}
                    style={{ left: `${k.left}px` }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      triggerPlay(k.midi);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      triggerStop(k.midi);
                    }}
                    onPointerLeave={() => {
                      if (isActive) triggerStop(k.midi);
                    }}
                  >
                    {/* Design 3D para teclas brancas */}
                    <div className="absolute bottom-[2px] left-[2px] right-[2px] h-3 rounded-b-[4px] bg-[#000]/10" />
                    {isC && (
                      <span className="font-mono text-[9px] font-bold select-none tracking-tighter opacity-80 bg-black/5 px-1 rounded">
                        {k.noteName}
                      </span>
                    )}
                  </button>
                );
              }
            })}
          </div>
        </div>
      </div>

      {/* Barra de conexões de teclado físico & MIDI */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#1e2024] p-3 rounded-lg border border-[#2d3137] shadow-inner">
        <div className="text-[10px] font-mono text-[#8d95a1] flex items-center gap-1.5 uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ffae00] animate-pulse" />
          <span>PC KEYBOARD ACTIVE: USE KEYS [ A S D F G H J K L ]</span>
        </div>

        <button
          onClick={setupMidi}
          disabled={midiAccessState === 'conectado' || midiAccessState === 'não suportado'}
          className={`flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase px-4 py-2 rounded border transition-all duration-150 outline-none cursor-pointer shadow-md ${
            midiAccessState === 'conectado'
              ? 'bg-[#122822] text-[#00ffc4] border-[#029674] shadow-[0_0_8px_rgba(0,255,196,0.1)]'
              : midiAccessState === 'conectando'
              ? 'bg-[#332a1e] text-[#ffae00] border-[#8a6428] animate-pulse'
              : midiAccessState === 'não suportado'
              ? 'bg-[#291715] text-[#ff4324] border-[#8e291b] opacity-80 cursor-not-allowed'
              : 'bg-[#2d3137] text-[#a0aab8] border-[#3e434b] hover:text-[#00ffc4] hover:border-[#00ffc4]'
          }`}
        >
          🎛️ {
            midiAccessState === 'conectado' ? 'MIDI LINK OK' :
            midiAccessState === 'conectando' ? 'SCANNING USB...' :
            midiAccessState === 'não suportado' ? 'NO MIDI DEVICE' : 'LINK MIDI CONTROLLER'
          }
        </button>
      </div>
    </div>
  );
};
