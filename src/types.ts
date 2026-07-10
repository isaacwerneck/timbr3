export interface AudioSampleState {
  buffer: AudioBuffer | null;
  duration: number; // em segundos
  sourceName: 'gravação' | 'upload' | 'bip' | 'nenhuma';
  waveformData: number[]; // para renderização visual
}

export interface SynthSettings {
  lowGain: number;   // -12 a +12 dB
  midGain: number;   // -12 a +12 dB
  highGain: number;  // -12 a +12 dB
  attack: number;    // 0 a 100 ms (amostra individual)
  trim: number;      // 10 a 100 % (tamanho do corte da amostra)
  reverse: boolean;
  autoFade: boolean;
  
  // Configurações do teclado
  keyAttack: number;  // 0 a 200 ms
  keySustain: number; // 0 a 100 % (sustain level)
  keyRelease: number; // 10 a 500 ms
  pitchCoarse: number; // -24 a +24 semitonos
  pitchFine: number;  // -50 a +50 cents
  bassBoost: number;  // 0 a 12 dB
  drive: number;      // 0 a 100 (distorção/saturação)
  bitcrusher: number; // 0 a 100 (bitcrush / decimador)
  polyphony: boolean;
  masterGain: number; // 0 a 100 % (Volume Master)
}

export interface NoteInfo {
  note: string;
  hz: number;
}
