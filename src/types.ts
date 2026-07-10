export interface AudioSampleState {
  buffer: AudioBuffer | null;
  duration: number; // em segundos
  sourceName: 'gravação' | 'upload' | 'bip' | 'nenhuma';
  waveformData: number[]; // para renderização visual
}

export type NoiseColor = 'white' | 'pink' | 'blue';
export type PwmTarget = 'square' | 'triangle' | 'saw';
export type LfoWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'sample-hold' | 'custom';
export type GaterWaveform = 'square' | 'sine' | 'triangle' | 'sawtooth';
export type FilterRouting = 'series' | 'parallel';
export type ModSource = 'lfo1' | 'lfo2' | 'env' | 'velocity' | 'keytrack' | 'random';
export type ModDestination =
  | 'pitch'
  | 'filterCutoff'
  | 'filterResonance'
  | 'wavefold'
  | 'decay'
  | 'preDrive'
  | 'postDrive'
  | 'ringModFreq'
  | 'ringModAmount';

export interface LfoSettings {
  rate: number; // Hz
  depth: number; // 0..100
  waveform: LfoWaveform;
  customShape: number[]; // -1..1 points
}

export interface ModMatrixSlot {
  enabled: boolean;
  source: ModSource;
  destination: ModDestination;
  amount: number; // -100..100
}

export interface SynthSettings {
  // Bypass por bloco (01..10)
  block01Enabled: boolean;
  block02Enabled: boolean;
  block03Enabled: boolean;
  block04Enabled: boolean;
  block05Enabled: boolean;
  block06Enabled: boolean;
  block07Enabled: boolean;
  block08Enabled: boolean;
  block09Enabled: boolean;
  block10Enabled: boolean;

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
  sampleRateReduction: number; // 0 a 100 (sample rate reducer)
  polyphony: boolean;
  masterGain: number; // 0 a 100 % (Volume Master)

  // Fonte / osciladores
  wavefoldAmount: number; // 0..100
  waveshapeAmount: number; // 0..100
  pwmAmount: number; // 0..100
  pwmTarget: PwmTarget;
  subLevel: number; // 0..100
  subOctave: 1 | 2;
  subDrive: number; // 0..100
  noiseLevel: number; // 0..100
  noiseColor: NoiseColor;

  // Modulação
  lfo1: LfoSettings;
  lfo2: LfoSettings;
  modMatrix: ModMatrixSlot[];

  // Envelope complexo DAHDSR + loop
  keyDelay: number; // 0..500ms
  keyHold: number; // 0..500ms
  keyDecay: number; // 0..1000ms
  keyLoopEnvelope: boolean;
  keyLoopRate: number; // 1..20Hz

  // Filtros com personalidade
  filterCutoff: number; // 40..16000Hz
  filterResonance: number; // 0.1..24
  filterRouting: FilterRouting;
  filterParallelBlend: number; // 0..100 (mix LP vs HP em paralelo)
  preFilterDrive: number; // 0..100
  postFilterDrive: number; // 0..100
  selfOscillation: number; // 0..100

  // Instabilidade / unison
  driftAmount: number; // 0..100
  driftEnvJitter: number; // 0..100
  unisonVoices: 1 | 2 | 4 | 8;
  unisonDetune: number; // 0..100 cents range
  unisonStereoSpread: number; // 0..100

  // FX
  chorusMix: number; // 0..100
  chorusRate: number; // 0.05..8Hz
  chorusDepth: number; // 0..100
  ringModAmount: number; // 0..100
  ringModFreq: number; // 10..5000Hz

  // Gater / Tremolo
  gaterEnabled: boolean;
  gaterWaveform: GaterWaveform;
  gaterRate: number; // 0.1..30Hz
  gaterDepth: number; // 0..100
}

export interface NoteInfo {
  note: string;
  hz: number;
}
