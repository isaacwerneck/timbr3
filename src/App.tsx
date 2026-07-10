import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Upload, 
  Sparkles, 
  Download, 
  Play, 
  Trash2,
  AlertTriangle,
  CheckCircle,
  Power
} from 'lucide-react';
import { Knob } from './components/Knob';
import { Keyboard } from './components/Keyboard';
import { Oscilloscope } from './components/Oscilloscope';
import { WavefolderVisualizer } from './components/WavefolderVisualizer';
import { FilterResponseVisualizer } from './components/FilterResponseVisualizer';
import { EqResponseVisualizer } from './components/EqResponseVisualizer';
import { BlockOscillatorPreview } from './components/BlockOscillatorPreview';
import { CustomSlider } from './components/CustomSlider';
import { SynthEngine } from './audio/SynthEngine';
import { AudioSampleState, SynthSettings, NoteInfo, ModDestination, ModSource, LfoWaveform, HarmonyMode, LoopPattern, SourceWaveEffect, SourceWaveMode, ToneGeneratorType } from './types';
import { deletePreset, listPresets, savePreset, getAnonId, type PresetRecord } from './services/presetsApi';

type EqPresetKey = 'balanced' | 'warm' | 'hifi' | 'smile' | 'midPunch' | 'darkVintage';

const eqPresets: Array<{ key: EqPresetKey; label: string; lowGain: number; midGain: number; highGain: number; bassBoost: number }> = [
  { key: 'balanced', label: 'BALANCED', lowGain: 0, midGain: 2, highGain: -3, bassBoost: 0 },
  { key: 'warm', label: 'WARM', lowGain: 2.5, midGain: -0.5, highGain: -4.5, bassBoost: 2 },
  { key: 'hifi', label: 'HI-FI', lowGain: 1, midGain: 0, highGain: 3, bassBoost: 0.5 },
  { key: 'smile', label: 'SMILE', lowGain: 3, midGain: -2.5, highGain: 2.5, bassBoost: 1.5 },
  { key: 'midPunch', label: 'MID PUNCH', lowGain: -1, midGain: 4, highGain: -1.5, bassBoost: 0 },
  { key: 'darkVintage', label: 'DARK VINTAGE', lowGain: 2, midGain: 1, highGain: -6, bassBoost: 2.5 },
];

// Configurações padrão do Sintetizador
const defaultSettings: SynthSettings = {
  block01Enabled: false,
  block02Enabled: false,
  block03Enabled: false,
  block04Enabled: false,
  block05Enabled: false,
  block06Enabled: false,
  block07Enabled: false,
  block08Enabled: false,
  block09Enabled: false,
  block10Enabled: false,
  lowGain: 0,
  midGain: 2,
  highGain: -3,
  attack: 18,
  trim: 100,
  reverse: false,
  autoFade: true,
  keyAttack: 12,
  keySustain: 80,
  keyRelease: 140,
  pitchCoarse: 0,
  pitchFine: 0,
  bassBoost: 0,
  drive: 0,
  bitcrusher: 0,
  sampleRateReduction: 0,
  polyphony: true,
  masterGain: 80,
  wavefoldAmount: 0,
  waveshapeAmount: 0,
  sourceWaveEffect: 'off',
  sourceWaveAmount: 0,
  sourceWaveMode: 'clean',
  pwmAmount: 0,
  pwmTarget: 'square',
  subLevel: 0,
  subOctave: 1,
  subDrive: 25,
  noiseLevel: 0,
  noiseColor: 'white',
  lfo1: {
    rate: 2.5,
    depth: 25,
    waveform: 'sine',
    customShape: [0, 1, 0, -1],
  },
  lfo2: {
    rate: 6,
    depth: 20,
    waveform: 'sample-hold',
    customShape: [0, 0.8, -0.6, 0.2],
  },
  modMatrix: [
    { enabled: true, source: 'lfo1', destination: 'filterCutoff', amount: 35 },
    { enabled: true, source: 'env', destination: 'pitch', amount: 20 },
    { enabled: false, source: 'keytrack', destination: 'filterResonance', amount: 20 },
    { enabled: false, source: 'random', destination: 'wavefold', amount: 20 },
  ],
  keyDelay: 0,
  keyHold: 0,
  keyDecay: 200,
  keyLoopEnvelope: false,
  keyLoopRate: 4,
  loopInterleaveEnabled: false,
  loopLatchEnabled: false,
  loopStepRate: 8,
  loopRangeOctaves: 1,
  loopPattern: 'up',
  loopHarmonyEnabled: false,
  loopHarmonyMode: 'minor',
  loopCompatThird: true,
  loopCompatFifth: false,
  loopOctaveUp: false,
  loopOctaveDown: false,
  filterCutoff: 5200,
  filterResonance: 4,
  filterRouting: 'series',
  filterParallelBlend: 50,
  preFilterDrive: 0,
  postFilterDrive: 0,
  selfOscillation: 40,
  driftAmount: 10,
  driftEnvJitter: 10,
  unisonVoices: 1,
  unisonDetune: 12,
  unisonStereoSpread: 65,
  chorusMix: 0,
  chorusRate: 0.8,
  chorusDepth: 20,
  ringModAmount: 0,
  ringModFreq: 280,
  gaterEnabled: false,
  gaterWaveform: 'square',
  gaterRate: 8,
  gaterDepth: 100,
};

// Componente de Parafuso Realista do Cockpit
const Screw = () => (
  <div className="w-2.5 h-2.5 rounded-full bg-[#51555e] border border-[#2b2e33] flex items-center justify-center shadow-inner select-none pointer-events-none">
    <div className="w-1.5 h-[1.5px] bg-[#1a1c1e] rotate-45 transform" />
  </div>
);

export default function App() {
  const synthRef = useRef<SynthEngine | null>(null);
  const loopStepIndexRef = useRef(0);
  const loopDirectionRef = useRef<1 | -1>(1);
  const loopCurrentMidiRef = useRef<number | null>(null);

  // Estados principais
  const [settings, setSettings] = useState<SynthSettings>(defaultSettings);
  const [activeTab, setActiveTab] = useState<'rec' | 'upload' | 'bip'>('rec');
  const [controlPanelTab, setControlPanelTab] = useState<'tone' | 'mod' | 'filterfx' | 'system'>('tone');
  const [eqPreset, setEqPreset] = useState<EqPresetKey | 'custom'>('balanced');
  const [eqPresetMenuOpen, setEqPresetMenuOpen] = useState(false);
  const [bipType, setBipType] = useState<ToneGeneratorType>('sine');
  const [bipDuration, setBipDuration] = useState<number>(180); // ms
  const [bipBaseFreq, setBipBaseFreq] = useState<number>(220);

  // Estados da amostra carregada
  const [sampleState, setSampleState] = useState<AudioSampleState>({
    buffer: null,
    duration: 0,
    sourceName: 'nenhuma',
    waveformData: [],
  });

  // Estados de gravação e aviso
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('Meu Preset');
  const [savedPresets, setSavedPresets] = useState<PresetRecord[]>([]);
  const [presetsBusy, setPresetsBusy] = useState(false);
  const [presetsStatus, setPresetsStatus] = useState<string | null>(null);

  // Estados de afinação
  const [targetNote, setTargetNote] = useState<NoteInfo>({ note: 'C3', hz: 130.81 });
  const [activeMidiNotes, setActiveMidiNotes] = useState<Set<number>>(new Set());
  const [latchedMidiNotes, setLatchedMidiNotes] = useState<Set<number>>(new Set());
  const [lastPlayedNote, setLastPlayedNote] = useState<string>('—');

  // Trava de segurança (cockpit red guards)
  const [reverseGuardOpen, setReverseGuardOpen] = useState(false);
  const [exportGuardOpen, setExportGuardOpen] = useState(false);
  const [clearGuardOpen, setClearGuardOpen] = useState(false);
  const [systemPower, setSystemPower] = useState(true);

  // Inicializar motor de áudio
  useEffect(() => {
    const engine = new SynthEngine();
    synthRef.current = engine;

    engine.setOnWaveformUpdate((data) => {
      setSampleState((prev) => ({
        ...prev,
        waveformData: data,
      }));
    });

    return () => {
      engine.stopAllNotes(defaultSettings);
    };
  }, []);

  useEffect(() => {
    const loadInitialPresets = async () => {
      try {
        const presets = await listPresets();
        setSavedPresets(presets);
        if (presets.length > 0) {
          setPresetsStatus(`Perfil anônimo: ${getAnonId().slice(0, 8)}... · ${presets.length} presets`);
        } else {
          setPresetsStatus(`Perfil anônimo: ${getAnonId().slice(0, 8)}... · sem presets salvos`);
        }
      } catch {
        setPresetsStatus('API de presets indisponível. Configure VITE_PRESET_API_BASE.');
      }
    };

    loadInitialPresets();
  }, []);

  // Timer de gravação
  useEffect(() => {
    let timer: any;
    if (isRecording) {
      setRecordTime(0);
      timer = setInterval(() => {
        setRecordTime((prev) => prev + 0.1);
      }, 100);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    const active = settings.loopInterleaveEnabled && settings.block05Enabled;
    if (!active) {
      loopStepIndexRef.current = 0;
      loopDirectionRef.current = 1;
      return;
    }

    synthRef.current?.stopAllNotes(getEffectiveSettings(settings));

    return () => {
      if (loopCurrentMidiRef.current !== null) {
        synthRef.current?.stopNote(loopCurrentMidiRef.current, getEffectiveSettings(settings));
        loopCurrentMidiRef.current = null;
      }
    };
  }, [settings.loopInterleaveEnabled, settings.block05Enabled]);

  useEffect(() => {
    if (!settings.loopLatchEnabled || !settings.loopInterleaveEnabled || !settings.block05Enabled) {
      setLatchedMidiNotes(new Set());
    }
  }, [settings.loopLatchEnabled, settings.loopInterleaveEnabled, settings.block05Enabled]);

  useEffect(() => {
    const interleaveActive = settings.loopInterleaveEnabled && settings.block05Enabled && systemPower;
    if (!interleaveActive) {
      return;
    }

    const heldNotes = Array.from(activeMidiNotes.values()) as number[];
    heldNotes.sort((a, b) => a - b);
    const latchedNotes = Array.from(latchedMidiNotes.values()) as number[];
    latchedNotes.sort((a, b) => a - b);
    const sourceNotes = settings.loopLatchEnabled
      ? Array.from(new Set([...heldNotes, ...latchedNotes])).sort((a, b) => a - b)
      : heldNotes;

    const buildLoopPool = (): number[] => {
      if (sourceNotes.length === 0) return [];

      const pool = new Set<number>();
      sourceNotes.forEach((midi) => pool.add(midi));

      const generated = new Set<number>();

      if (settings.loopHarmonyEnabled) {
        const third = settings.loopHarmonyMode === 'major' ? 4 : 3;
        if (settings.loopCompatThird) {
          sourceNotes.forEach((midi) => generated.add(midi + third));
        }
        if (settings.loopCompatFifth) {
          sourceNotes.forEach((midi) => generated.add(midi + 7));
        }
      }

      if (settings.loopOctaveUp) {
        sourceNotes.forEach((midi) => generated.add(midi + 12));
      }
      if (settings.loopOctaveDown) {
        sourceNotes.forEach((midi) => generated.add(midi - 12));
      }

      const rootMidi = sourceNotes[0];
      const maxDistance = settings.loopRangeOctaves * 12;
      generated.forEach((midi) => {
        if (Math.abs(midi - rootMidi) <= maxDistance) {
          pool.add(midi);
        }
      });

      return Array.from(pool.values())
        .filter((midi) => midi >= 24 && midi <= 108)
        .sort((a, b) => a - b);
    };

    const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midiToNoteName = (midi: number) => {
      const name = noteNames[((midi % 12) + 12) % 12];
      const octave = Math.floor(midi / 12) - 1;
      return `${name}${octave}`;
    };

    const stepMs = Math.max(45, 1000 / Math.max(0.5, settings.loopStepRate));

    const step = () => {
      const pool = buildLoopPool();
      if (pool.length === 0) {
        if (loopCurrentMidiRef.current !== null) {
          synthRef.current?.stopNote(loopCurrentMidiRef.current, getEffectiveSettings(settings));
          loopCurrentMidiRef.current = null;
        }
        return;
      }

      let nextIndex = loopStepIndexRef.current;
      const pattern = settings.loopPattern;

      if (pattern === 'random') {
        nextIndex = Math.floor(Math.random() * pool.length);
      } else if (pattern === 'up') {
        nextIndex = loopStepIndexRef.current % pool.length;
        loopStepIndexRef.current = (loopStepIndexRef.current + 1) % pool.length;
      } else if (pattern === 'down') {
        const normalized = ((loopStepIndexRef.current % pool.length) + pool.length) % pool.length;
        nextIndex = pool.length - 1 - normalized;
        loopStepIndexRef.current = (loopStepIndexRef.current + 1) % pool.length;
      } else {
        if (pool.length <= 1) {
          nextIndex = 0;
        } else {
          nextIndex = loopStepIndexRef.current;
          const dir = loopDirectionRef.current;
          const projected = loopStepIndexRef.current + dir;
          if (projected >= pool.length - 1 || projected <= 0) {
            loopDirectionRef.current = (dir * -1) as 1 | -1;
          }
          loopStepIndexRef.current = Math.max(0, Math.min(pool.length - 1, projected));
        }
      }

      const midi = pool[Math.max(0, Math.min(pool.length - 1, nextIndex))];
      const freq = midiToFreq(midi);
      const noteName = midiToNoteName(midi);

      if (loopCurrentMidiRef.current !== null) {
        synthRef.current?.stopNote(loopCurrentMidiRef.current, getEffectiveSettings(settings));
      }

      synthRef.current?.startNote(midi, freq, getEffectiveSettings(settings));
      loopCurrentMidiRef.current = midi;
      setTargetNote({ note: noteName, hz: freq });
      setLastPlayedNote(noteName);
    };

    step();
    const id = window.setInterval(step, stepMs);

    return () => {
      window.clearInterval(id);
      if (loopCurrentMidiRef.current !== null) {
        synthRef.current?.stopNote(loopCurrentMidiRef.current, getEffectiveSettings(settings));
        loopCurrentMidiRef.current = null;
      }
    };
  }, [
    activeMidiNotes,
    latchedMidiNotes,
    settings,
    systemPower,
  ]);

  // Atualizar knobs de parâmetros
  const applyEqPreset = (presetKey: EqPresetKey) => {
    const preset = eqPresets.find((item) => item.key === presetKey);
    if (!preset) return;

    setEqPreset(presetKey);
    setSettings((prev) => {
      const next = {
        ...prev,
        lowGain: preset.lowGain,
        midGain: preset.midGain,
        highGain: preset.highGain,
        bassBoost: preset.bassBoost,
      };
      if (synthRef.current) {
        synthRef.current.updateActiveVoices(getEffectiveSettings(next));
      }
      return next;
    });
  };

  const getEffectiveSettings = (s: SynthSettings): SynthSettings => {
    const next: SynthSettings = {
      ...s,
      lfo1: { ...s.lfo1 },
      lfo2: { ...s.lfo2 },
      modMatrix: s.modMatrix.map((slot) => ({ ...slot })),
    };

    if (!s.block01Enabled) {
      next.lowGain = 0;
      next.midGain = 0;
      next.highGain = 0;
      next.bassBoost = 0;
    }

    if (!s.block02Enabled) {
      next.attack = 0;
      next.trim = 100;
      next.waveshapeAmount = 0;
      next.wavefoldAmount = 0;
      next.sourceWaveEffect = 'off';
      next.sourceWaveAmount = 0;
      next.sourceWaveMode = 'clean';
      next.pwmAmount = 0;
      next.subLevel = 0;
      next.subDrive = 0;
      next.noiseLevel = 0;
    }

    if (!s.block03Enabled) {
      next.keyAttack = 0;
      next.keySustain = 100;
      next.keyRelease = 10;
    }

    if (!s.block04Enabled) {
      next.pitchCoarse = 0;
      next.pitchFine = 0;
    }

    if (!s.block05Enabled) {
      next.keyDelay = 0;
      next.keyHold = 0;
      next.keyDecay = 0;
      next.keyLoopEnvelope = false;
      next.keyLoopRate = 1;
      next.gaterEnabled = false;
      next.gaterRate = 8;
      next.gaterDepth = 100;
      next.loopInterleaveEnabled = false;
      next.loopLatchEnabled = false;
      next.loopStepRate = 8;
      next.loopRangeOctaves = 1;
      next.loopPattern = 'up';
      next.loopHarmonyEnabled = false;
      next.loopHarmonyMode = 'minor';
      next.loopCompatThird = true;
      next.loopCompatFifth = false;
      next.loopOctaveUp = false;
      next.loopOctaveDown = false;
    }

    if (!s.block06Enabled) {
      next.lfo1.depth = 0;
      next.lfo2.depth = 0;
    }

    if (!s.block07Enabled) {
      next.modMatrix = next.modMatrix.map((slot) => ({ ...slot, enabled: false }));
    }

    if (!s.block08Enabled) {
      next.filterCutoff = 18000;
      next.filterResonance = 0.1;
      next.filterRouting = 'parallel';
      next.filterParallelBlend = 0;
      next.preFilterDrive = 0;
      next.postFilterDrive = 0;
      next.selfOscillation = 0;
    }

    if (!s.block09Enabled) {
      next.driftAmount = 0;
      next.driftEnvJitter = 0;
      next.unisonVoices = 1;
      next.unisonDetune = 0;
      next.unisonStereoSpread = 0;
    }

    if (!s.block10Enabled) {
      next.drive = 0;
      next.bitcrusher = 0;
      next.sampleRateReduction = 0;
      next.chorusMix = 0;
      next.ringModAmount = 0;
    }

    return next;
  };

  const toggleBlock = (key: keyof Pick<SynthSettings,
    'block01Enabled' | 'block02Enabled' | 'block03Enabled' | 'block04Enabled' | 'block05Enabled' |
    'block06Enabled' | 'block07Enabled' | 'block08Enabled' | 'block09Enabled' | 'block10Enabled'
  >) => {
    handleSettingChange(key, !settings[key]);
  };

  const handleSettingChange = (key: keyof SynthSettings, value: any) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (synthRef.current) {
        synthRef.current.updateActiveVoices(getEffectiveSettings(next));
      }
      return next;
    });
  };

  const handleEqBandChange = (band: 'low' | 'mid' | 'high', value: number) => {
    setEqPreset('custom');

    const keyMap: Record<'low' | 'mid' | 'high', keyof Pick<SynthSettings, 'lowGain' | 'midGain' | 'highGain'>> = {
      low: 'lowGain',
      mid: 'midGain',
      high: 'highGain',
    };

    handleSettingChange(keyMap[band], value);
  };

  const handleLfoChange = (lfo: 'lfo1' | 'lfo2', key: keyof SynthSettings['lfo1'], value: any) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        [lfo]: {
          ...prev[lfo],
          [key]: value,
        },
      };
      synthRef.current?.updateActiveVoices(getEffectiveSettings(next));
      return next;
    });
  };

  const handleLfoCustomShape = (lfo: 'lfo1' | 'lfo2', raw: string) => {
    const parsed = raw
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => !Number.isNaN(v))
      .map((v) => Math.max(-1, Math.min(1, v)));

    if (parsed.length < 2) return;
    handleLfoChange(lfo, 'customShape', parsed);
  };

  const handleModMatrixChange = (idx: number, key: keyof SynthSettings['modMatrix'][number], value: any) => {
    setSettings((prev) => {
      const nextMatrix = prev.modMatrix.map((slot, i) => {
        if (i !== idx) return slot;
        return {
          ...slot,
          [key]: value,
        };
      });

      const next = {
        ...prev,
        modMatrix: nextMatrix,
      };

      synthRef.current?.updateActiveVoices(getEffectiveSettings(next));
      return next;
    });
  };

  // 1. Controle de gravação
  const toggleRecording = async () => {
    if (!synthRef.current) return;
    setErrorMessage(null);

    try {
      if (!isRecording) {
        setIsRecording(true);
        await synthRef.current.startRecording();
      } else {
        setIsRecording(false);
        const buffer = await synthRef.current.stopRecording();
        setSampleState({
          buffer,
          duration: buffer.duration,
          sourceName: 'gravação',
          waveformData: sampleState.waveformData,
        });
        showInfo('Áudio captado com sucesso do microfone!');
      }
    } catch (err: any) {
      setIsRecording(false);
      setErrorMessage('Erro ao acessar o microfone. Verifique as permissões.');
    }
  };

  // 2. Upload de arquivo
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !synthRef.current) return;
    processAudioFile(file);
  };

  const processAudioFile = async (file: File) => {
    setErrorMessage(null);
    try {
      const buffer = await synthRef.current!.loadFile(file);
      setSampleState({
        buffer,
        duration: buffer.duration,
        sourceName: 'upload',
        waveformData: [],
      });
      showInfo(`Arquivo "${file.name}" carregado com sucesso!`);
    } catch (err) {
      setErrorMessage('Formato de arquivo inválido ou não suportado.');
    }
  };

  // Drag and drop do upload
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && synthRef.current) {
      processAudioFile(file);
    }
  };

  // 3. Gerador de Bip Oscilador
  const handleGenerateBip = async () => {
    if (!synthRef.current) return;
    setErrorMessage(null);
    try {
      const buffer = await synthRef.current.generateBip(bipType, bipDuration, bipBaseFreq);
      setSampleState({
        buffer,
        duration: buffer.duration,
        sourceName: 'bip',
        waveformData: [],
      });
      showInfo(`Sinal sintético gerado com sucesso!`);
    } catch (err) {
      setErrorMessage('Erro ao gerar bip sintético.');
    }
  };

  // 4. Preview de som cru
  const playPreview = () => {
    if (!synthRef.current || !sampleState.buffer) {
      setErrorMessage('Nenhum som carregado para prévia.');
      return;
    }
    synthRef.current.playPreview(getEffectiveSettings(settings));
  };

  // 6. Toque do piano
  const handlePlayNote = (midiNumber: number, freq: number, noteName: string) => {
    if (!synthRef.current || !systemPower) return;

    synthRef.current.init();

    const interleaveActive = settings.block05Enabled && settings.loopInterleaveEnabled;

    if (interleaveActive) {
      setActiveMidiNotes((prev) => {
        const next = new Set(prev);
        next.add(midiNumber);
        return next;
      });
      if (settings.loopLatchEnabled) {
        setLatchedMidiNotes((prev) => {
          const next = new Set(prev);
          if (next.has(midiNumber)) next.delete(midiNumber);
          else next.add(midiNumber);
          return next;
        });
      }
      setTargetNote({ note: noteName, hz: freq });
      return;
    }

    if (!settings.polyphony) {
      synthRef.current.stopAllNotes(getEffectiveSettings(settings));
      setActiveMidiNotes(new Set([midiNumber]));
    } else {
      setActiveMidiNotes((prev) => {
        const next = new Set(prev);
        next.add(midiNumber);
        return next;
      });
    }

    setTargetNote({ note: noteName, hz: freq });
    synthRef.current.startNote(midiNumber, freq, getEffectiveSettings(settings));
  };

  const handleStopNote = (midiNumber: number) => {
    if (!synthRef.current) return;

    const interleaveActive = settings.block05Enabled && settings.loopInterleaveEnabled;
    if (interleaveActive) {
      setActiveMidiNotes((prev) => {
        const next = new Set(prev);
        next.delete(midiNumber);
        return next;
      });
      if (settings.loopLatchEnabled) {
        return;
      }
      return;
    }

    synthRef.current.stopNote(midiNumber, getEffectiveSettings(settings));
    setActiveMidiNotes((prev) => {
      const next = new Set(prev);
      next.delete(midiNumber);
      return next;
    });
  };

  // 7. Exportar WAV
  const exportNoteAsFile = async () => {
    if (!synthRef.current) return;
    setErrorMessage(null);

    try {
      const freq = targetNote.hz;
      const noteName = targetNote.note;
      
      const wavBlob = await synthRef.current.exportNote(freq, getEffectiveSettings(settings));
      
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timbr3_${noteName}_${freq.toFixed(2)}hz.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showInfo(`Nota ${noteName} exportada com sucesso!`);
    } catch (err) {
      setErrorMessage('Erro ao renderizar e exportar o arquivo.');
    }
  };

  const showInfo = (msg: string) => {
    setInfoMessage(msg);
    setTimeout(() => {
      setInfoMessage(null);
    }, 4000);
  };

  const clearSample = () => {
    setSampleState({
      buffer: null,
      duration: 0,
      sourceName: 'nenhuma',
      waveformData: [],
    });
    setLastPlayedNote('—');
  };

  const refreshPresets = async () => {
    const presets = await listPresets();
    setSavedPresets(presets);
    setPresetsStatus(`Perfil anônimo: ${getAnonId().slice(0, 8)}... · ${presets.length} presets`);
  };

  const handleSavePreset = async () => {
    const safeName = presetName.trim();
    if (!safeName) {
      setErrorMessage('Defina um nome para salvar o preset.');
      return;
    }

    setPresetsBusy(true);
    setErrorMessage(null);
    try {
      await savePreset(safeName, settings);
      await refreshPresets();
      showInfo(`Preset "${safeName}" salvo com sucesso.`);
    } catch (err) {
      setErrorMessage('Erro ao salvar preset no perfil anônimo.');
    } finally {
      setPresetsBusy(false);
    }
  };

  const handleLoadPreset = (preset: PresetRecord) => {
    const merged: SynthSettings = {
      ...defaultSettings,
      ...preset.payload,
      lfo1: { ...defaultSettings.lfo1, ...(preset.payload?.lfo1 ?? {}) },
      lfo2: { ...defaultSettings.lfo2, ...(preset.payload?.lfo2 ?? {}) },
      modMatrix: Array.isArray(preset.payload?.modMatrix)
        ? preset.payload.modMatrix.map((slot) => ({ ...slot }))
        : defaultSettings.modMatrix.map((slot) => ({ ...slot })),
    };

    setSettings(merged);
    synthRef.current?.updateActiveVoices(getEffectiveSettings(merged));
    showInfo(`Preset "${preset.name}" carregado.`);
  };

  const handleDeletePreset = async (presetId: string) => {
    setPresetsBusy(true);
    setErrorMessage(null);
    try {
      await deletePreset(presetId);
      await refreshPresets();
      showInfo('Preset removido.');
    } catch {
      setErrorMessage('Erro ao remover preset.');
    } finally {
      setPresetsBusy(false);
    }
  };

  const modSources: ModSource[] = ['lfo1', 'lfo2', 'env', 'velocity', 'keytrack', 'random'];
  const modDestinations: ModDestination[] = [
    'pitch',
    'filterCutoff',
    'filterResonance',
    'wavefold',
    'decay',
    'preDrive',
    'postDrive',
    'ringModFreq',
    'ringModAmount',
  ];
  const lfoWaveforms: LfoWaveform[] = ['sine', 'triangle', 'sawtooth', 'square', 'sample-hold', 'custom'];
  const loopPatterns: Array<{ value: LoopPattern; label: string }> = [
    { value: 'up', label: 'UP' },
    { value: 'down', label: 'DOWN' },
    { value: 'updown', label: 'UPDOWN' },
    { value: 'random', label: 'RANDOM' },
  ];
  const harmonyModes: Array<{ value: HarmonyMode; label: string }> = [
    { value: 'minor', label: 'MINOR' },
    { value: 'major', label: 'MAJOR' },
  ];
  const sourceWaveEffects: Array<{ value: SourceWaveEffect; label: string }> = [
    { value: 'off', label: 'OFF' },
    { value: 'sine', label: 'SINE' },
    { value: 'triangle', label: 'TRIANGLE' },
    { value: 'sawtooth', label: 'SAW' },
    { value: 'square', label: 'SQUARE' },
    { value: 'pulse', label: 'PULSE' },
  ];
  const sourceWaveModes: Array<{ value: SourceWaveMode; label: string }> = [
    { value: 'clean', label: 'CLEAN' },
    { value: 'aggressive', label: 'AGGRESSIVE' },
  ];
  const beepTypes: Array<{ value: ToneGeneratorType; label: string }> = [
    { value: 'sine', label: 'SINE' },
    { value: 'triangle', label: 'TRIANGLE' },
    { value: 'sawtooth', label: 'SAW' },
    { value: 'square', label: 'SQUARE' },
    { value: 'pulse', label: 'PULSE' },
    { value: 'supersaw', label: 'SUPERSAW' },
    { value: 'fm-bell', label: 'FM BELL' },
    { value: 'pluck', label: 'PLUCK' },
    { value: 'noise', label: 'NOISE' },
  ];

  return (
    <div className="min-h-screen text-[#eef2f7] font-sans pb-28 sm:pb-32 relative select-none overflow-x-hidden p-3 sm:p-4 md:p-6 app-shell">
      {/* Moldura metálica principal do Cockpit Overhead Panel */}
      <div className="max-w-[1560px] mx-auto bg-[#2f3339] border border-[#1e2126] rounded-[24px] sm:rounded-[30px] shadow-[0_18px_44px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden relative">
        
        {/* TOP BAR / LOGO & SYSTEM CONFIG */}
        <div className="bg-[#24282d] border-b border-white/5 px-5 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Chave de energia rotatória/alavanca real */}
            <div className="flex items-center gap-2 bg-[#1d1f22] px-3 py-1.5 rounded-lg border border-[#4d515a] shadow-inner">
              <button 
                onClick={() => setSystemPower(!systemPower)}
                className={`w-4 h-4 rounded-full transition-all cursor-pointer relative flex items-center justify-center ${
                  systemPower 
                    ? 'bg-[#00ff22] shadow-[0_0_12px_#00ff22]' 
                    : 'bg-[#ff3b30] shadow-[0_0_12px_#ff3b30]'
                }`}
                title="SYS POWER SWITCH"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white opacity-40" />
              </button>
              <span className="font-mono text-[10px] text-[#8e95a0] tracking-wider font-bold">POWER</span>
            </div>

            <div className="text-left">
              <h1 className="font-mono text-2xl font-black text-[#f4f7f6] tracking-widest leading-none">
                TIMBR<span className="text-[#ff9500]">3</span>
              </h1>
              <span className="font-mono text-[9px] text-[#8e95a0] tracking-wider uppercase block mt-1">AUDIO TRANS-CALIBRATOR PANEL</span>
            </div>
          </div>

          {/* LED Indicators */}
          <div className="flex items-center gap-6 font-mono text-[10px] text-[#8e95a0]">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${systemPower ? 'bg-[#00ff22] shadow-[0_0_8px_#00ff22]' : 'bg-[#4d515a]'}`} />
              <span>SYS ACTIVE</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${sampleState.buffer ? 'bg-[#ff9500] shadow-[0_0_8px_#ff9500]' : 'bg-[#4d515a]'}`} />
              <span>WAVE LOCKED</span>
            </div>
          </div>
        </div>

        {/* ALERTA DE SISTEMA / SUCESSO (ESTILO INDICADOR DE CABINE) */}
        {errorMessage && (
          <div className="m-4 bg-[#2e1513] border-2 border-[#ff3b30] text-[#ff8d85] p-3 rounded-lg flex items-center gap-3 font-mono text-xs">
            <AlertTriangle className="w-4 h-4 text-[#ff3b30]" />
            <div><strong className="text-white">WARNING:</strong> {errorMessage}</div>
          </div>
        )}
        {infoMessage && (
          <div className="m-4 bg-[#142918] border-2 border-[#34c759] text-[#8ce89d] p-3 rounded-lg flex items-center gap-3 font-mono text-xs">
            <CheckCircle className="w-4 h-4 text-[#34c759]" />
            <div><strong className="text-white">SYS OK:</strong> {infoMessage}</div>
          </div>
        )}

        {/* COCKPIT GRID SYSTEM */}
        <div className="p-3 sm:p-4 md:p-6 grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4 sm:gap-6 bg-transparent items-start">

          {/* COLUNA ESQUERDA: HUD DISPLAY & CONTROLE DE INPUT (MÓDULO DE SINAL) */}
          <div className="flex flex-col gap-5 xl:sticky xl:top-6 self-start">
            
            {/* 1. HUD DISPLAY: DETECTOR DE FREQUÊNCIA E NOTA (AMBER SEVEN-SEGMENT) */}
            <div className="interactive-card bg-[#24272c] border border-white/6 rounded-[18px] p-5 shadow-[inset_0_3px_8px_rgba(0,0,0,0.7),0_6px_16px_rgba(0,0,0,0.16)] relative overflow-hidden flex flex-col justify-between min-h-[160px]">
              {/* Parafusos */}
              <div className="absolute top-2 left-2"><Screw /></div>
              <div className="absolute top-2 right-2"><Screw /></div>
              <div className="absolute bottom-2 left-2"><Screw /></div>
              <div className="absolute bottom-2 right-2"><Screw /></div>

              <div className="flex justify-between items-start border-b border-[#30333a] pb-3 mb-2">
                <span className="font-mono text-[9px] text-[#ff9500] tracking-widest font-black uppercase">
                  DC AMPS / CPS FREQ DISPLAY
                </span>
                <span className="font-mono text-[8px] text-[#8e95a0] bg-[#1d1f22] px-2 py-0.5 rounded border border-[#3e4249]">
                  STBY HUD
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-2 items-center flex-1">
                {/* Numeric displays */}
                <div className="md:col-span-5 flex flex-col gap-3 justify-center">
                  <div>
                    <span className="font-mono text-[9px] text-[#8e95a0] block uppercase tracking-wider">TARGET HZ</span>
                    <div className="font-mono text-3xl font-black text-[#ff9500] drop-shadow-[0_0_8px_rgba(255,149,0,0.6)] tracking-tight">
                      {targetNote.hz.toFixed(2)} <span className="text-xs font-medium text-[#ff9500]/70">HZ</span>
                    </div>
                  </div>

                  <div>
                    <span className="font-mono text-[9px] text-[#8e95a0] block uppercase tracking-wider">NOTE INDEX</span>
                    <div className="inline-block font-mono text-xl font-black text-[#ff9500] drop-shadow-[0_0_8px_rgba(255,149,0,0.6)] bg-black/40 px-3 py-1 rounded border border-[#2b2e35] mt-1">
                      {targetNote.note}
                    </div>
                  </div>
                </div>

                {/* Oscilloscope visualizer */}
                <div className="md:col-span-7 h-28 w-full">
                  <Oscilloscope synthRef={synthRef} systemPower={systemPower} />
                </div>
              </div>

              <div className="flex justify-between items-center text-[10px] font-mono text-[#8e95a0] pt-2 border-t border-[#30333a]">
                <span>SAMPLE SOURCE: <b className="text-white uppercase">{sampleState.sourceName}</b></span>
                <span>DURATION: <b className="text-white">{(sampleState.duration * 1000).toFixed(0)} MS</b></span>
              </div>
            </div>

            {/* 2. AUDIO RECORDER & OSCILLATOR PANEL */}
            <div className="interactive-card bg-[#31353b] border border-white/6 rounded-[18px] p-5 relative shadow-[0_6px_16px_rgba(0,0,0,0.16)]">
              {/* Parafusos */}
              <div className="absolute top-2.5 left-2.5"><Screw /></div>
              <div className="absolute top-2.5 right-2.5"><Screw /></div>
              <div className="absolute bottom-2.5 left-2.5"><Screw /></div>
              <div className="absolute bottom-2.5 right-2.5"><Screw /></div>

              <div className="text-center border-b border-[#23252a] pb-3 mb-4 mt-2">
                <span className="font-mono text-[10px] text-white tracking-widest font-black block uppercase">
                  WAVEFORM SOURCE ACTUATOR
                </span>
              </div>

              {/* Selector Tabs (Estilo botões mecânicos do cockpit) */}
              <div className="grid grid-cols-3 gap-2 bg-[#1e2024] p-1 rounded-[14px] mb-4 border border-white/5">
                <button
                  onClick={() => setActiveTab('rec')}
                  className={`font-mono text-[10px] font-black uppercase py-2 px-1.5 rounded transition-all cursor-pointer outline-none flex items-center justify-center gap-1.5 ${
                    activeTab === 'rec' 
                      ? 'bg-[#ff9500] text-black font-bold shadow-[0_2px_4px_rgba(0,0,0,0.3)]' 
                      : 'text-[#8e95a0] hover:text-white'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" /> MIC
                </button>
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`font-mono text-[10px] font-black uppercase py-2 px-1.5 rounded transition-all cursor-pointer outline-none flex items-center justify-center gap-1.5 ${
                    activeTab === 'upload' 
                      ? 'bg-[#ff9500] text-black font-bold shadow-[0_2px_4px_rgba(0,0,0,0.3)]' 
                      : 'text-[#8e95a0] hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" /> FILE
                </button>
                <button
                  onClick={() => setActiveTab('bip')}
                  className={`font-mono text-[10px] font-black uppercase py-2 px-1.5 rounded transition-all cursor-pointer outline-none flex items-center justify-center gap-1.5 ${
                    activeTab === 'bip' 
                      ? 'bg-[#ff9500] text-black font-bold shadow-[0_2px_4px_rgba(0,0,0,0.3)]' 
                      : 'text-[#8e95a0] hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> OSC
                </button>
              </div>

              {/* Conteúdo dinâmico das abas */}
              <div className="interactive-card bg-[#1e2024] p-4 rounded-[16px] border border-white/5">
                
                {/* 1. MIC INTERFACES */}
                {activeTab === 'rec' && (
                  <div className="flex flex-col gap-4">
                    <div className="h-20 bg-black/60 rounded border border-[#30333a] relative overflow-hidden flex items-center justify-center">
                      {isRecording ? (
                        <div className="flex items-center gap-2 font-mono text-xs text-[#ff3b30] animate-pulse">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#ff3b30] animate-ping" />
                          <span>CAPTURING MICROPHONE: {recordTime.toFixed(1)}s</span>
                        </div>
                      ) : (
                        <span className="font-mono text-[9px] text-[#8e95a0] uppercase">
                          {sampleState.buffer ? 'MIC AUDIO CAPTURED' : 'MIC READY - PRESS RECORD BUTTON'}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={toggleRecording}
                        className={`flex-1 font-mono text-xs font-black uppercase py-3 rounded-md transition-all shadow cursor-pointer border-2 ${
                          isRecording 
                            ? 'bg-[#ff3b30] text-white border-[#b0221a]' 
                            : 'bg-[#34c759] text-black border-[#248a3d] hover:brightness-110'
                        }`}
                      >
                        {isRecording ? 'STOP MIC' : 'RECORD MIC'}
                      </button>

                      <button
                        onClick={playPreview}
                        disabled={!sampleState.buffer}
                        className="flex-1 font-mono text-xs font-black uppercase bg-[#3a3d45] border border-[#50545e] hover:bg-[#4a4e57] disabled:opacity-30 disabled:cursor-not-allowed py-3 rounded-md cursor-pointer"
                      >
                        PREVIEW
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. FILE UPLOAD */}
                {activeTab === 'upload' && (
                  <div className="flex flex-col gap-4">
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('cockpit-upload-input')?.click()}
                      className={`h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                        isDraggingOver ? 'border-[#ff9500] bg-[#ff9500]/5' : 'border-[#484c54] hover:border-white'
                      }`}
                    >
                      <input
                        id="cockpit-upload-input"
                        type="file"
                        accept="audio/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Upload className="w-5 h-5 text-[#ff9500]" />
                      <span className="font-mono text-[10px] text-white uppercase font-bold">DRAG WAV FILE</span>
                      <span className="font-mono text-[8px] text-[#8e95a0] uppercase">OR CLICK TO BROWSE</span>
                    </div>

                    <button
                      onClick={playPreview}
                      disabled={!sampleState.buffer}
                      className="w-full font-mono text-xs font-black uppercase bg-[#3a3d45] border border-[#50545e] hover:bg-[#4a4e57] disabled:opacity-30 disabled:cursor-not-allowed py-3 rounded-md cursor-pointer"
                    >
                      PLAY FILE PREVIEW
                    </button>
                  </div>
                )}

                {/* 3. OSCILLATOR GENERATOR */}
                {activeTab === 'bip' && (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {beepTypes.map((item) => (
                        <button
                          key={item.value}
                          onClick={() => setBipType(item.value)}
                          className={`font-mono text-[9px] font-black uppercase py-2 rounded border transition-all cursor-pointer ${
                            bipType === item.value 
                              ? 'bg-[#ff9500] text-black border-[#b07200]' 
                              : 'bg-[#2b2e34] text-[#8e95a0] border-[#3e4249] hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="interactive-card bg-[#24272c] p-2.5 rounded border border-[#3e4249]">
                      <CustomSlider
                        min={55}
                        max={1760}
                        value={bipBaseFreq}
                        onChange={(v) => setBipBaseFreq(v)}
                        label="BASE FREQ"
                        unit="HZ"
                        helpText="Defines the generated tone pitch before keyboard transposition. Useful for designing bright or bass-heavy source timbres."
                        step={1}
                      />
                    </div>

                    <div className="interactive-card bg-[#24272c] p-2.5 rounded border border-[#3e4249]">
                      <CustomSlider
                        min={20}
                        max={500}
                        value={bipDuration}
                        onChange={(v) => setBipDuration(v)}
                        label="WIDTH"
                        unit="MS"
                        helpText="Controls how long the beep lasts before it fades out. Short values feel clicky; long values feel more tone-like."
                        step={1}
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleGenerateBip}
                        className="flex-1 font-mono text-xs font-black uppercase bg-[#ff9500] text-black border-2 border-[#b07200] hover:brightness-110 py-3 rounded-md cursor-pointer"
                      >
                        GENERATE
                      </button>

                      <button
                        onClick={playPreview}
                        disabled={!sampleState.buffer}
                        className="flex-1 font-mono text-xs font-black uppercase bg-[#3a3d45] border border-[#50545e] hover:bg-[#4a4e57] disabled:opacity-30 disabled:cursor-not-allowed py-3 rounded-md cursor-pointer"
                      >
                        PREVIEW
                      </button>
                    </div>
                  </div>
                )}

              </div>

              {/* Botão de limpeza com guard box de segurança */}
              {sampleState.buffer && (
                <div className="interactive-card mt-3 flex items-center justify-between bg-[#24272c] p-2.5 rounded border border-[#30333a]">
                  <span className="font-mono text-[9px] text-[#8e95a0] uppercase">BUFFER CLEAR:</span>
                  <div className="relative">
                    <button
                      onClick={() => setClearGuardOpen(!clearGuardOpen)}
                      className={`font-mono text-[9px] font-black uppercase px-3 py-1.5 rounded transition-all border-2 ${
                        clearGuardOpen 
                          ? 'bg-[#ff3b30] text-white border-[#b0221a]' 
                          : 'bg-[#ff3b30]/10 text-[#ff3b30] border-[#ff3b30]/30 hover:bg-[#ff3b30]/20'
                      }`}
                    >
                      {clearGuardOpen ? 'UNLOCKED' : 'LOCKED'}
                    </button>

                    {clearGuardOpen && (
                      <div className="absolute right-0 bottom-full mb-2 bg-[#1d1f22] border-2 border-[#ff3b30] p-2 rounded shadow-2xl z-30 w-[140px] text-center">
                        <button
                          onClick={() => {
                            clearSample();
                            setClearGuardOpen(false);
                          }}
                          className="w-full bg-[#ff3b30] text-white font-mono font-black text-[9px] uppercase py-1.5 rounded cursor-pointer"
                        >
                          CONFIRM ERASE
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>

           {/* COLUNA DIREITA: MÓDULO DE MIXAGEM & FX (SOUND CUSTOMIZATION) */}
          <div className="flex flex-col gap-5 xl:pl-1">
            
            <div className="interactive-card bg-[#31353b] border border-white/6 rounded-[18px] p-5 relative shadow-[0_6px_16px_rgba(0,0,0,0.16)]">
              {/* Parafusos */}
              <div className="absolute top-2.5 left-2.5"><Screw /></div>
              <div className="absolute top-2.5 right-2.5"><Screw /></div>
              <div className="absolute bottom-2.5 left-2.5"><Screw /></div>
              <div className="absolute bottom-2.5 right-2.5"><Screw /></div>

              <div className="text-center border-b border-[#23252a] pb-3 mb-4 mt-2">
                <span className="font-mono text-[10px] text-white tracking-widest font-black block uppercase">
                  SIGNAL PATH RACK
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#1e2024] p-1.5 rounded-[14px] border border-white/5 mb-3">
                {[
                  ['tone', 'SOURCE'],
                  ['mod', 'MOTION'],
                  ['filterfx', 'FILTER/SPACE'],
                  ['system', 'SYSTEM/PRESETS'],
                ].map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setControlPanelTab(tab as 'tone' | 'mod' | 'filterfx' | 'system')}
                    className={`font-mono text-[9px] font-black uppercase py-2 rounded border transition-all ${
                      controlPanelTab === tab
                        ? 'bg-[#ff9500] text-black border-[#b07200] shadow-[0_0_10px_rgba(255,149,0,0.3)]'
                        : 'bg-[#24272c] text-[#8e95a0] border-[#3e4249] hover:text-white hover:border-[#59606d]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mb-3 flex items-center justify-between bg-[#1e2024] border border-[#2b2e34] rounded-lg px-3 py-2">
                <span className="font-mono text-[9px] text-[#8e95a0] uppercase">Preset manager fica na aba system/presets</span>
                <button
                  onClick={() => setControlPanelTab('system')}
                  className="font-mono text-[9px] font-black uppercase px-2.5 py-1.5 rounded border bg-[#34c759]/12 text-[#34c759] border-[#34c759]/40"
                >
                  Abrir Presets
                </button>
              </div>

              {controlPanelTab === 'tone' && (
              <>
              {/* GRUPO DE KNOBS: TIMBRE EQ & EFFECTS */}
              <div className={`interactive-card flex flex-col gap-3 bg-[#1e2024] p-3 sm:p-4 rounded-lg border border-[#2b2e34] mb-3 ${!settings.block01Enabled ? 'opacity-55' : ''}`}>
                <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2b2e34] pb-1.5 mb-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>01 // CORE TONE EQ</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEqPresetMenuOpen((prev) => !prev)}
                        className="text-[8px] px-2 py-0.5 rounded border bg-[#2b2e34] text-[#ffae00] border-[#4b4f57]"
                      >
                        PRESETS
                      </button>
                      <button onClick={() => toggleBlock('block01Enabled')} className={`text-[8px] px-2 py-0.5 rounded border ${settings.block01Enabled ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/40' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}>{settings.block01Enabled ? 'ON' : 'OFF'}</button>
                    </div>
                  </div>
                </div>
                {eqPresetMenuOpen && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-black/25 p-2 rounded-[14px] border border-white/5">
                    {eqPresets.map((preset) => (
                      <button
                        key={preset.key}
                        onClick={() => applyEqPreset(preset.key)}
                        className={`font-mono text-[8px] font-black uppercase py-2 rounded border ${eqPreset === preset.key ? 'bg-[#ff9500] text-black border-[#b07200]' : 'bg-[#24272c] text-[#8e95a0] border-[#3e4249] hover:text-white hover:border-[#59606d]'}`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setEqPreset('custom')}
                      className={`font-mono text-[8px] font-black uppercase py-2 rounded border ${eqPreset === 'custom' ? 'bg-[#ff9500] text-black border-[#b07200]' : 'bg-[#24272c] text-[#8e95a0] border-[#3e4249] hover:text-white hover:border-[#59606d]'}`}
                    >
                      CUSTOM
                    </button>
                  </div>
                )}
                <EqResponseVisualizer
                  lowGain={settings.lowGain}
                  midGain={settings.midGain}
                  highGain={settings.highGain}
                  bassBoost={settings.bassBoost}
                  presetLabel={eqPreset === 'custom' ? 'CUSTOM' : eqPresets.find((item) => item.key === eqPreset)?.label ?? 'BALANCED'}
                  onBandChange={handleEqBandChange}
                />
                <div className="mt-3 flex flex-col items-center gap-2">
                  <p className="font-mono text-[8px] uppercase tracking-wider text-[#8e95a0] text-center max-w-[240px]">
                    drag points to equalize
                  </p>
                  <Knob
                    min={0}
                    max={12}
                    step={0.1}
                    value={settings.bassBoost}
                    onChange={(v) => {
                      setEqPreset('custom');
                      handleSettingChange('bassBoost', v);
                    }}
                    name="SUB BOOST"
                    unit="dB"
                  />
                </div>
              </div>

              <div className={`flex flex-col gap-3 bg-[#1e2024] p-3 sm:p-4 rounded-lg border border-[#2b2e34] mb-3 ${!settings.block02Enabled ? 'opacity-55' : ''}`}>
                <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2b2e34] pb-1.5 mb-2">
                  <div className="flex items-center justify-between">
                    <span>02 // SOURCE SHAPING</span>
                    <button onClick={() => toggleBlock('block02Enabled')} className={`text-[8px] px-2 py-0.5 rounded border ${settings.block02Enabled ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/40' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}>{settings.block02Enabled ? 'ON' : 'OFF'}</button>
                  </div>
                </div>
                <BlockOscillatorPreview block={2} settings={settings} enabled={settings.block02Enabled} title="SOURCE SHAPE" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 justify-items-center">
                  <Knob
                    min={0}
                    max={100}
                    value={settings.attack}
                    onChange={(v) => handleSettingChange('attack', v)}
                    name="ATTACK"
                    unit="ms"
                  />
                  <Knob
                    min={10}
                    max={100}
                    value={settings.trim}
                    onChange={(v) => handleSettingChange('trim', v)}
                    name="TRIM"
                    unit="%"
                  />
                  <Knob
                    min={0}
                    max={100}
                    value={settings.waveshapeAmount}
                    onChange={(v) => handleSettingChange('waveshapeAmount', v)}
                    name="SHAPER"
                    unit="%"
                  />
                  <Knob
                    min={0}
                    max={100}
                    value={settings.wavefoldAmount}
                    onChange={(v) => handleSettingChange('wavefoldAmount', v)}
                    name="FOLDER"
                    unit="%"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 justify-items-center mt-2">
                  <Knob
                    min={0}
                    max={100}
                    value={settings.pwmAmount}
                    onChange={(v) => handleSettingChange('pwmAmount', v)}
                    name="PWM"
                    unit="%"
                  />
                  <Knob
                    min={0}
                    max={100}
                    value={settings.subLevel}
                    onChange={(v) => handleSettingChange('subLevel', v)}
                    name="SUB LVL"
                    unit="%"
                  />
                  <Knob
                    min={0}
                    max={100}
                    value={settings.subDrive}
                    onChange={(v) => handleSettingChange('subDrive', v)}
                    name="SUB DIRT"
                    unit="%"
                  />
                  <Knob
                    min={0}
                    max={100}
                    value={settings.noiseLevel}
                    onChange={(v) => handleSettingChange('noiseLevel', v)}
                    name="NOISE"
                    unit="%"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                  <label className="flex flex-col gap-1 font-mono text-[9px] uppercase text-[#8e95a0]">
                    PWM TARGET
                    <select
                      value={settings.pwmTarget}
                      onChange={(e) => handleSettingChange('pwmTarget', e.target.value)}
                      className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white"
                    >
                      <option value="square">SQUARE</option>
                      <option value="triangle">TRIANGLE</option>
                      <option value="saw">ASYM SAW</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 font-mono text-[9px] uppercase text-[#8e95a0]">
                    SUB OCTAVE
                    <select
                      value={settings.subOctave}
                      onChange={(e) => handleSettingChange('subOctave', Number(e.target.value))}
                      className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white"
                    >
                      <option value={1}>-1 OCT</option>
                      <option value={2}>-2 OCT</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 font-mono text-[9px] uppercase text-[#8e95a0]">
                    NOISE COLOR
                    <select
                      value={settings.noiseColor}
                      onChange={(e) => handleSettingChange('noiseColor', e.target.value)}
                      className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white"
                    >
                      <option value="white">WHITE</option>
                      <option value="pink">PINK</option>
                      <option value="blue">BLUE</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                  <label className="flex flex-col gap-1 font-mono text-[9px] uppercase text-[#8e95a0]">
                    INPUT WAVE FX
                    <select
                      value={settings.sourceWaveEffect}
                      onChange={(e) => handleSettingChange('sourceWaveEffect', e.target.value)}
                      className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white"
                    >
                      {sourceWaveEffects.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 font-mono text-[9px] uppercase text-[#8e95a0]">
                    WAVE MODE
                    <select
                      value={settings.sourceWaveMode}
                      onChange={(e) => handleSettingChange('sourceWaveMode', e.target.value)}
                      className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white"
                    >
                      {sourceWaveModes.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-col gap-1">
                    <CustomSlider
                      min={0}
                      max={100}
                      value={settings.sourceWaveAmount}
                      onChange={(v) => handleSettingChange('sourceWaveAmount', v)}
                      label="INPUT WAVE MIX"
                      unit="%"
                      helpText="Uses a smoother low-end curve for musical control. At low values it stays subtle; higher values ramp up faster."
                      density="compact"
                    />
                  </div>
                </div>

                <WavefolderVisualizer foldAmount={settings.wavefoldAmount} />
              </div>

              {/* ENVELOPE CONTROLS (ADSR) & PITCH CALIBRATOR */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                
                {/* KEYBOARD ENVELOPE (ADSR) */}
                  <div className={`interactive-card bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3 ${!settings.block03Enabled ? 'opacity-55' : ''}`}>
                  <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5">
                    <div className="flex items-center justify-between">
                      <span>03 // KEYBOARD ENVELOPE (ADSR)</span>
                      <button onClick={() => toggleBlock('block03Enabled')} className={`text-[8px] px-2 py-0.5 rounded border ${settings.block03Enabled ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/40' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}>{settings.block03Enabled ? 'ON' : 'OFF'}</button>
                    </div>
                  </div>
                  <BlockOscillatorPreview block={3} settings={settings} enabled={settings.block03Enabled} title="ENVELOPE" />
                  
                  {/* ATTACK */}
                  <div className="flex flex-col gap-1">
                    <CustomSlider
                      min={0}
                      max={200}
                      value={settings.keyAttack}
                      onChange={(v) => handleSettingChange('keyAttack', v)}
                      label="KEY ATTACK"
                      unit="MS"
                      helpText="Sets how fast the keyboard envelope rises after the note starts. Faster attack feels snappier; slower attack feels softer."
                      density="compact"
                    />
                  </div>

                  {/* SUSTAIN */}
                  <div className="flex flex-col gap-1">
                    <CustomSlider
                      min={0}
                      max={100}
                      value={settings.keySustain}
                      onChange={(v) => handleSettingChange('keySustain', v)}
                      label="KEY SUSTAIN"
                      unit="%"
                      helpText="Keeps more or less level after the attack. Higher sustain sounds fuller and more even."
                      density="compact"
                    />
                  </div>

                  {/* RELEASE */}
                  <div className="flex flex-col gap-1">
                    <CustomSlider
                      min={10}
                      max={500}
                      value={settings.keyRelease}
                      onChange={(v) => handleSettingChange('keyRelease', v)}
                      label="KEY RELEASE"
                      unit="MS"
                      helpText="Controls how long the note fades after you release the key. Longer release sounds smoother and more washed."
                      density="compact"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      onClick={() => handleSettingChange('keyLoopEnvelope', !settings.keyLoopEnvelope)}
                      className={`font-mono text-[9px] font-black uppercase py-2 rounded border ${
                        settings.keyLoopEnvelope
                          ? 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/40'
                          : 'bg-[#24272c] text-[#8e95a0] border-[#3e4249]'
                      }`}
                    >
                      {settings.keyLoopEnvelope ? 'ENV LOOP ON' : 'ENV LOOP OFF'}
                    </button>
                    <div className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                      <CustomSlider
                        min={1}
                        max={20}
                        step={0.5}
                        value={settings.keyLoopRate}
                        onChange={(v) => handleSettingChange('keyLoopRate', v)}
                        label="LOOP RATE"
                        unit="HZ"
                        helpText="Sets how fast the looping envelope repeats. Faster values feel more animated and rhythmic."
                        density="compact"
                      />
                    </div>
                  </div>
                </div>

                {/* PITCH TENSION CALIBRATOR */}
                <div className={`interactive-card bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3 ${!settings.block04Enabled ? 'opacity-55' : ''}`}>
                  <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5">
                    <div className="flex items-center justify-between">
                      <span>04 // PITCH ALIGN</span>
                      <button onClick={() => toggleBlock('block04Enabled')} className={`text-[8px] px-2 py-0.5 rounded border ${settings.block04Enabled ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/40' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}>{settings.block04Enabled ? 'ON' : 'OFF'}</button>
                    </div>
                  </div>
                  <BlockOscillatorPreview block={4} settings={settings} enabled={settings.block04Enabled} title="PITCH TRACE" />

                  {/* PITCH COARSE (SEMITONES) */}
                  <div className="flex flex-col gap-1">
                    <CustomSlider
                      min={-24}
                      max={24}
                      step={1}
                      value={settings.pitchCoarse}
                      onChange={(v) => handleSettingChange('pitchCoarse', v)}
                      label="COARSE TUNE"
                      unit="ST"
                      helpText="Moves the pitch in semitone steps. Use it for musical transposition and interval shifts."
                      density="compact"
                    />
                  </div>

                  {/* PITCH FINE (CENTS) */}
                  <div className="flex flex-col gap-1">
                    <CustomSlider
                      min={-50}
                      max={50}
                      value={settings.pitchFine}
                      onChange={(v) => handleSettingChange('pitchFine', v)}
                      label="FINE-TUNE"
                      unit="CTS"
                      helpText="Offsets pitch in cents for subtle detune or accurate tuning."
                      density="compact"
                    />
                  </div>
                </div>

              </div>

              </>
              )}

              {controlPanelTab === 'mod' && (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className={`interactive-card bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3 ${!settings.block05Enabled ? 'opacity-55' : ''}`}>
                  <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5">
                    <div className="flex items-center justify-between">
                      <span>05 // LOOP MOTION</span>
                      <button onClick={() => toggleBlock('block05Enabled')} className={`text-[8px] px-2 py-0.5 rounded border ${settings.block05Enabled ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/40' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}>{settings.block05Enabled ? 'ON' : 'OFF'}</button>
                    </div>
                  </div>
                  <BlockOscillatorPreview block={5} settings={settings} enabled={settings.block05Enabled} title="LOOP TRACE" />
                  <div className="font-mono text-[7px] uppercase tracking-wider text-[#8e95a0]">
                    Loop envelope and rhythmic gate are grouped in this motion stage.
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <div className="interactive-card bg-[#24272c] rounded border border-[#30333a] p-2.5 flex flex-col gap-2">
                      <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-wider">
                        Envelope Loop
                      </div>
                      <button
                        onClick={() => handleSettingChange('keyLoopEnvelope', !settings.keyLoopEnvelope)}
                        className={`font-mono text-[9px] font-black uppercase py-2 rounded border ${
                          settings.keyLoopEnvelope
                            ? 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/40'
                            : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'
                        }`}
                      >
                        {settings.keyLoopEnvelope ? 'LOOP ON' : 'LOOP OFF'}
                      </button>
                      <div className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                        <CustomSlider
                          min={1}
                          max={20}
                          step={0.5}
                          value={settings.keyLoopRate}
                          onChange={(v) => handleSettingChange('keyLoopRate', v)}
                          label="LOOP RATE"
                          unit="HZ"
                          helpText="Sets how quickly the looping envelope repeats. Faster rates feel more percussive and alive."
                          density="compact"
                        />
                      </div>
                    </div>

                    <div className="interactive-card bg-[#24272c] rounded border border-[#30333a] p-2.5 flex flex-col gap-2">
                      <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-wider">
                        Rhythmic Gate / Tremolo
                      </div>
                      <button
                        onClick={() => handleSettingChange('gaterEnabled', !settings.gaterEnabled)}
                        className={`font-mono text-[9px] font-black uppercase py-2 rounded border ${
                          settings.gaterEnabled
                            ? 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/40'
                            : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'
                        }`}
                      >
                        {settings.gaterEnabled ? 'GATER ON' : 'GATER OFF'}
                      </button>
                      <div className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                        <CustomSlider
                          min={0.1}
                          max={30}
                          step={0.1}
                          value={settings.gaterRate}
                          onChange={(v) => handleSettingChange('gaterRate', v)}
                          label="GATE RATE"
                          unit="HZ"
                          helpText="Controls how fast the rhythmic gate pulses."
                          density="compact"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 items-end">
                        <div className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                          <CustomSlider
                            min={0}
                            max={100}
                            value={settings.gaterDepth}
                            onChange={(v) => handleSettingChange('gaterDepth', v)}
                            label="GATE DEPTH"
                            unit="%"
                            helpText="Sets how deep the tremolo/gate dips the volume."
                            density="compact"
                          />
                        </div>
                        <label className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                          GATE WAVE
                          <select
                            value={settings.gaterWaveform}
                            onChange={(e) => handleSettingChange('gaterWaveform', e.target.value)}
                            className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white"
                          >
                            <option value="square">SQUARE</option>
                            <option value="sine">SINE</option>
                            <option value="triangle">TRIANGLE</option>
                            <option value="sawtooth">SAW / PUMP</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="interactive-card bg-[#20242a] border border-[#353b45] rounded-lg p-2.5 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-wider md:col-span-2">
                      Loop Note Engine
                    </div>

                    <button
                      onClick={() => handleSettingChange('loopInterleaveEnabled', !settings.loopInterleaveEnabled)}
                      className={`font-mono text-[9px] font-black uppercase py-2 rounded border ${
                        settings.loopInterleaveEnabled
                          ? 'bg-[#34c759]/12 text-[#34c759] border-[#34c759]/45'
                          : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'
                      }`}
                    >
                      {settings.loopInterleaveEnabled ? 'INTERLEAVE ON' : 'INTERLEAVE OFF'}
                    </button>

                    <div className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                      <CustomSlider
                        min={0.5}
                        max={20}
                        step={0.5}
                        value={settings.loopStepRate}
                        onChange={(v) => handleSettingChange('loopStepRate', v)}
                        label="STEP RATE"
                        unit="HZ"
                        helpText="How fast interleaved notes are stepped while multiple keys are held."
                        density="compact"
                      />
                    </div>

                    <button
                      onClick={() => handleSettingChange('loopLatchEnabled', !settings.loopLatchEnabled)}
                      className={`font-mono text-[9px] font-black uppercase py-2 rounded border ${
                        settings.loopLatchEnabled
                          ? 'bg-[#34c759]/12 text-[#34c759] border-[#34c759]/45'
                          : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'
                      }`}
                    >
                      {settings.loopLatchEnabled ? 'LATCH ON' : 'LATCH OFF'}
                    </button>

                    <div className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                      <CustomSlider
                        min={0}
                        max={3}
                        step={1}
                        value={settings.loopRangeOctaves}
                        onChange={(v) => handleSettingChange('loopRangeOctaves', v)}
                        label="RANGE"
                        unit="OCT"
                        helpText="Limits generated arp notes away from root note. Lower range keeps movement tighter."
                        density="compact"
                      />
                    </div>

                    <label className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                      STEP PATTERN
                      <select
                        value={settings.loopPattern}
                        onChange={(e) => handleSettingChange('loopPattern', e.target.value)}
                        className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white"
                      >
                        {loopPatterns.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>

                    <button
                      onClick={() => handleSettingChange('loopHarmonyEnabled', !settings.loopHarmonyEnabled)}
                      className={`font-mono text-[9px] font-black uppercase py-2 rounded border ${
                        settings.loopHarmonyEnabled
                          ? 'bg-[#34c759]/12 text-[#34c759] border-[#34c759]/45'
                          : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'
                      }`}
                    >
                      {settings.loopHarmonyEnabled ? 'HARMONY ON' : 'HARMONY OFF'}
                    </button>

                    <label className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                      HARMONY MODE
                      <select
                        value={settings.loopHarmonyMode}
                        onChange={(e) => handleSettingChange('loopHarmonyMode', e.target.value)}
                        className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white"
                      >
                        {harmonyModes.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>

                    <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        onClick={() => handleSettingChange('loopCompatThird', !settings.loopCompatThird)}
                        className={`font-mono text-[8px] font-black uppercase py-2 rounded border ${settings.loopCompatThird ? 'bg-[#34c759]/12 text-[#34c759] border-[#34c759]/45' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}
                      >
                        THIRD
                      </button>
                      <button
                        onClick={() => handleSettingChange('loopCompatFifth', !settings.loopCompatFifth)}
                        className={`font-mono text-[8px] font-black uppercase py-2 rounded border ${settings.loopCompatFifth ? 'bg-[#34c759]/12 text-[#34c759] border-[#34c759]/45' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}
                      >
                        FIFTH
                      </button>
                      <button
                        onClick={() => handleSettingChange('loopOctaveUp', !settings.loopOctaveUp)}
                        className={`font-mono text-[8px] font-black uppercase py-2 rounded border ${settings.loopOctaveUp ? 'bg-[#34c759]/12 text-[#34c759] border-[#34c759]/45' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}
                      >
                        OCT +1
                      </button>
                      <button
                        onClick={() => handleSettingChange('loopOctaveDown', !settings.loopOctaveDown)}
                        className={`font-mono text-[8px] font-black uppercase py-2 rounded border ${settings.loopOctaveDown ? 'bg-[#34c759]/12 text-[#34c759] border-[#34c759]/45' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}
                      >
                        OCT -1
                      </button>
                    </div>
                  </div>
                </div>

                <div className={`bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3 ${!settings.block06Enabled ? 'opacity-55' : ''}`}>
                  <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5">
                    <div className="flex items-center justify-between">
                      <span>06 // LFO GRID</span>
                      <button onClick={() => toggleBlock('block06Enabled')} className={`text-[8px] px-2 py-0.5 rounded border ${settings.block06Enabled ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/40' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}>{settings.block06Enabled ? 'ON' : 'OFF'}</button>
                    </div>
                  </div>
                  <BlockOscillatorPreview block={6} settings={settings} enabled={settings.block06Enabled} title="LFO GRID" />

                  {(['lfo1', 'lfo2'] as const).map((lfo) => (
                    <div key={lfo} className="interactive-card bg-[#24272c] p-2 rounded border border-[#30333a] flex flex-col gap-2">
                      <span className="font-mono text-[9px] text-white uppercase font-bold">{lfo.toUpperCase()}</span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                        <div className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                          <CustomSlider
                            min={0.1}
                            max={20}
                            step={0.1}
                            value={settings[lfo].rate}
                            onChange={(v) => handleLfoChange(lfo, 'rate', v)}
                            label="RATE"
                            unit="HZ"
                            helpText={lfo === 'lfo1' ? 'Sets how fast LFO 1 moves. Slower motion feels wider and smoother.' : 'Sets how fast LFO 2 moves. Faster motion feels more animated and aggressive.'}
                            orientation="vertical"
                            density="compact"
                            className="items-center"
                          />
                        </div>
                        <div className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                          <CustomSlider
                            min={0}
                            max={100}
                            step={1}
                            value={settings[lfo].depth}
                            onChange={(v) => handleLfoChange(lfo, 'depth', v)}
                            label="DEPTH"
                            unit="%"
                            helpText={lfo === 'lfo1' ? 'Sets how deeply LFO 1 affects its target. More depth means a bigger movement.' : 'Sets how deeply LFO 2 affects its target. More depth means stronger modulation.'}
                            orientation="vertical"
                            density="compact"
                            className="items-center"
                          />
                        </div>
                        <label className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                          WAVE
                          <select
                            value={settings[lfo].waveform}
                            onChange={(e) => handleLfoChange(lfo, 'waveform', e.target.value)}
                            className="bg-[#2b2e34] border border-[#3e4249] rounded px-1 py-1 text-white"
                          >
                            {lfoWaveforms.map((w) => (
                              <option key={w} value={w}>{w.toUpperCase()}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                        CUSTOM SHAPE (CSV -1..1)
                        <input
                          type="text"
                          defaultValue={settings[lfo].customShape.join(',')}
                          onBlur={(e) => handleLfoCustomShape(lfo, e.target.value)}
                          className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`bg-[#1e2024] p-3 sm:p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3 mb-3 ${!settings.block07Enabled ? 'opacity-55' : ''}`}>
                <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5">
                  <div className="flex items-center justify-between">
                    <span>07 // ROUTING MATRIX</span>
                    <button onClick={() => toggleBlock('block07Enabled')} className={`text-[8px] px-2 py-0.5 rounded border ${settings.block07Enabled ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/40' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}>{settings.block07Enabled ? 'ON' : 'OFF'}</button>
                  </div>
                </div>
                <BlockOscillatorPreview block={7} settings={settings} enabled={settings.block07Enabled} title="ROUTE MAP" />
                {settings.modMatrix.map((slot, idx) => (
                  <div key={idx} className="interactive-card grid grid-cols-1 md:grid-cols-5 gap-2 bg-[#24272c] rounded border border-[#30333a] p-2">
                    <button
                      onClick={() => handleModMatrixChange(idx, 'enabled', !slot.enabled)}
                      className={`font-mono text-[9px] font-black uppercase rounded border py-1 ${
                        slot.enabled ? 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/40' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'
                      }`}
                    >
                      {slot.enabled ? 'ON' : 'OFF'}
                    </button>
                    <select
                      value={slot.source}
                      onChange={(e) => handleModMatrixChange(idx, 'source', e.target.value)}
                      className="font-mono text-[9px] bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white uppercase"
                    >
                      {modSources.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span className="font-mono text-[8px] text-[#8e95a0] uppercase flex items-center justify-center">TO</span>
                    <select
                      value={slot.destination}
                      onChange={(e) => handleModMatrixChange(idx, 'destination', e.target.value)}
                      className="font-mono text-[9px] bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white uppercase"
                    >
                      {modDestinations.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <div className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                      <CustomSlider
                        min={-100}
                        max={100}
                        value={slot.amount}
                        onChange={(v) => handleModMatrixChange(idx, 'amount', v)}
                        label="AMOUNT"
                        helpText="Controls how strongly this modulation source affects the chosen destination. Positive and negative values both matter."
                        density="compact"
                      />
                    </div>
                  </div>
                ))}
              </div>

              </>

              )}

              {controlPanelTab === 'filterfx' && (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className={`interactive-card bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3 ${!settings.block08Enabled ? 'opacity-55' : ''}`}>
                  <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5">
                    <div className="flex items-center justify-between">
                      <span>08 // FILTER RESPONSE</span>
                      <button onClick={() => toggleBlock('block08Enabled')} className={`text-[8px] px-2 py-0.5 rounded border ${settings.block08Enabled ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/40' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}>{settings.block08Enabled ? 'ON' : 'OFF'}</button>
                    </div>
                  </div>
                  <FilterResponseVisualizer
                    cutoff={settings.filterCutoff}
                    resonance={settings.filterResonance}
                    routing={settings.filterRouting}
                    parallelBlend={settings.filterParallelBlend}
                  />

                  <div className="grid grid-cols-2 gap-2 justify-items-center">
                    <Knob min={40} max={16000} step={10} value={settings.filterCutoff} onChange={(v) => handleSettingChange('filterCutoff', v)} name="CUTOFF" unit="Hz" />
                    <Knob min={1} max={24} step={0.1} value={settings.filterResonance} onChange={(v) => handleSettingChange('filterResonance', v)} name="RESON" unit="Q" />
                    <Knob min={0} max={100} value={settings.preFilterDrive} onChange={(v) => handleSettingChange('preFilterDrive', v)} name="PREDRV" unit="%" />
                    <Knob min={0} max={100} value={settings.postFilterDrive} onChange={(v) => handleSettingChange('postFilterDrive', v)} name="POSTDRV" unit="%" />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                      ROUTING
                      <select
                        value={settings.filterRouting}
                        onChange={(e) => handleSettingChange('filterRouting', e.target.value)}
                        className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white"
                      >
                        <option value="series">SERIES</option>
                        <option value="parallel">PARALLEL</option>
                      </select>
                    </label>
                    <div className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1 col-span-2">
                      <CustomSlider
                        min={0}
                        max={100}
                        value={settings.filterParallelBlend}
                        onChange={(v) => handleSettingChange('filterParallelBlend', v)}
                        label="PARALLEL BLEND LP/HP"
                        unit="%"
                        helpText="Chooses how much low-pass and high-pass are mixed when the filter runs in parallel mode."
                        density="compact"
                      />
                    </div>
                  </div>

                  <div className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                      <CustomSlider
                        min={0}
                        max={100}
                        value={settings.selfOscillation}
                        onChange={(v) => handleSettingChange('selfOscillation', v)}
                        label="SELF OSC"
                        unit="%"
                        helpText="Pushes the filter toward self-oscillation, making it ring like a tone generator."
                        orientation="vertical"
                        density="compact"
                        className="items-center"
                      />
                  </div>

                </div>

                <div className={`interactive-card bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3 ${!settings.block09Enabled ? 'opacity-55' : ''}`}>
                  <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5">
                    <div className="flex items-center justify-between">
                      <span>09 // UNISON FIELD</span>
                      <button onClick={() => toggleBlock('block09Enabled')} className={`text-[8px] px-2 py-0.5 rounded border ${settings.block09Enabled ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/40' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}>{settings.block09Enabled ? 'ON' : 'OFF'}</button>
                    </div>
                  </div>
                  <BlockOscillatorPreview block={9} settings={settings} enabled={settings.block09Enabled} title="UNISON STACK" />

                  <div className="grid grid-cols-2 gap-2 justify-items-center">
                    <Knob min={0} max={100} value={settings.driftAmount} onChange={(v) => handleSettingChange('driftAmount', v)} name="DRIFT" unit="%" />
                    <Knob min={0} max={100} value={settings.driftEnvJitter} onChange={(v) => handleSettingChange('driftEnvJitter', v)} name="AGE ENV" unit="%" />
                    <Knob min={0} max={100} value={settings.unisonDetune} onChange={(v) => handleSettingChange('unisonDetune', v)} name="DETUNE" unit="cts" />
                    <Knob min={0} max={100} value={settings.unisonStereoSpread} onChange={(v) => handleSettingChange('unisonStereoSpread', v)} name="SPREAD" unit="%" />
                  </div>

                  <label className="font-mono text-[8px] text-[#8e95a0] uppercase flex flex-col gap-1">
                    UNISON VOICES
                    <select
                      value={settings.unisonVoices}
                      onChange={(e) => handleSettingChange('unisonVoices', Number(e.target.value))}
                      className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-1 text-white"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={4}>4</option>
                      <option value={8}>8</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className={`interactive-card bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3 mb-3 ${!settings.block10Enabled ? 'opacity-55' : ''}`}>
                <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5">
                  <div className="flex items-center justify-between">
                    <span>10 // FX GLITCH BUS</span>
                    <button onClick={() => toggleBlock('block10Enabled')} className={`text-[8px] px-2 py-0.5 rounded border ${settings.block10Enabled ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/40' : 'bg-black/40 text-[#8e95a0] border-[#3e4249]'}`}>{settings.block10Enabled ? 'ON' : 'OFF'}</button>
                  </div>
                </div>
                <BlockOscillatorPreview block={10} settings={settings} enabled={settings.block10Enabled} title="GLITCH BUS" />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2 justify-items-center">
                  <Knob min={0} max={100} value={settings.drive} onChange={(v) => handleSettingChange('drive', v)} name="LEGACYDRV" unit="%" />
                  <Knob min={0} max={100} value={settings.bitcrusher} onChange={(v) => handleSettingChange('bitcrusher', v)} name="BITCRUSH" unit="%" />
                  <Knob min={0} max={100} value={settings.sampleRateReduction} onChange={(v) => handleSettingChange('sampleRateReduction', v)} name="SR RED" unit="%" />
                  <Knob min={0} max={100} value={settings.chorusMix} onChange={(v) => handleSettingChange('chorusMix', v)} name="CHORUS" unit="%" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2 justify-items-center">
                  <Knob min={0.1} max={8} step={0.1} value={settings.chorusRate} onChange={(v) => handleSettingChange('chorusRate', v)} name="CH RATE" unit="Hz" />
                  <Knob min={0} max={100} value={settings.chorusDepth} onChange={(v) => handleSettingChange('chorusDepth', v)} name="CH DEPTH" unit="%" />
                  <Knob min={0} max={100} value={settings.ringModAmount} onChange={(v) => handleSettingChange('ringModAmount', v)} name="RING AMT" unit="%" />
                  <Knob min={10} max={5000} step={10} value={settings.ringModFreq} onChange={(v) => handleSettingChange('ringModFreq', v)} name="RING FREQ" unit="Hz" />
                </div>

              </div>

              </>

              )}

              {controlPanelTab === 'system' && (
              <>

              {/* SWITCHES & ACTUATORS */}
              <div className="interactive-card bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3">
                <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5 mb-1">
                  11 // ENGINE ACTUATORS & SYSTEM SWITCHES
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* REVERSE ACTUATOR WITH RED GUARD */}
                  <div className="interactive-card bg-[#24272c] p-2 rounded border border-[#2b2e34] flex flex-col justify-between gap-2.5">
                    <div className="flex flex-col">
                      <span className="font-mono text-[8px] text-white font-bold uppercase">REV ACTUATOR</span>
                      <span className="font-mono text-[6px] text-[#8e95a0] uppercase">REVERSE SAMPLE</span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => setReverseGuardOpen(!reverseGuardOpen)}
                        className={`w-full font-mono text-[8px] font-black uppercase py-1 rounded border ${
                          reverseGuardOpen 
                            ? 'bg-[#ff3b30]/10 text-[#ff3b30] border-[#ff3b30]/30' 
                            : 'bg-[#ff3b30] text-black border-[#9a1a12] font-black shadow'
                        }`}
                      >
                        {reverseGuardOpen ? 'UNLOCKED' : 'GUARDED'}
                      </button>

                      <button
                        onClick={() => {
                          if (reverseGuardOpen) {
                            handleSettingChange('reverse', !settings.reverse);
                          } else {
                            showInfo('Abra a trava vermelha "GUARDED" primeiro para destravar o reverso.');
                          }
                        }}
                        className={`w-full h-6 rounded-full p-0.5 transition-all border flex items-center shadow-inner ${
                          settings.reverse 
                            ? 'bg-[#34c759]/20 border-[#34c759] justify-end' 
                            : 'bg-[#18191c] border-[#3a3d44] justify-start'
                        } ${!reverseGuardOpen ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className={`w-5 h-5 rounded-full transition-all shadow ${
                          settings.reverse ? 'bg-[#34c759]' : 'bg-[#50545e]'
                        }`} />
                      </button>
                    </div>
                  </div>

                  {/* ANTI-CLIPPING SWITCH */}
                  <div className="interactive-card bg-[#24272c] p-2 rounded border border-[#2b2e34] flex flex-col justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="font-mono text-[8px] text-white font-bold uppercase">ANTI-CLIP FADE</span>
                      <span className="font-mono text-[6px] text-[#8e95a0] uppercase">SMOOTH COUPLING</span>
                    </div>

                    <button
                      onClick={() => handleSettingChange('autoFade', !settings.autoFade)}
                      className={`w-full h-6 rounded-full p-0.5 mt-auto transition-all border flex items-center cursor-pointer shadow-inner ${
                        settings.autoFade 
                          ? 'bg-[#ff9500]/20 border-[#ff9500] justify-end' 
                          : 'bg-[#18191c] border-[#3a3d44] justify-start'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full transition-all shadow ${
                        settings.autoFade ? 'bg-[#ff9500]' : 'bg-[#50545e]'
                      }`} />
                    </button>
                  </div>

                  {/* POLYPHONY / STANDBY POWER SWITCH */}
                  <div className="interactive-card bg-[#24272c] p-2 rounded border border-[#2b2e34] flex flex-col justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="font-mono text-[8px] text-white font-bold uppercase">STANDBY POWER</span>
                      <span className="font-mono text-[6px] text-[#8e95a0] uppercase">POLY vs MONO</span>
                    </div>

                    <button
                      onClick={() => handleSettingChange('polyphony', !settings.polyphony)}
                      className={`w-full font-mono text-[8px] font-black uppercase py-2 rounded border transition-all mt-auto ${
                        settings.polyphony 
                          ? 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/30 hover:bg-[#34c759]/20' 
                          : 'bg-black text-[#8e95a0] border-[#30333a] hover:bg-black/80'
                      }`}
                    >
                      {settings.polyphony ? 'AUTO / POLY' : 'BAT / MONO'}
                    </button>
                  </div>
                </div>
              </div>

              {/* MASTER LEVEL CONTROL */}
              <div className="interactive-card flex flex-col gap-4 bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] mt-4">
                <div className="font-mono text-[8px] text-[#ff3b30] uppercase font-black tracking-widest border-b border-[#2b2e34] pb-1.5 mb-1">
                  MASTER LEVEL CONTROLLER
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] text-white font-bold uppercase">FINAL OUTPUT LEVEL</span>
                    <span className="font-mono text-[7px] text-[#8e95a0] uppercase">MAPPED TO FINAL SYNTHENGINE GAIN STAGE</span>
                  </div>
                  <div className="flex items-center gap-4 bg-black/40 px-4 py-2 rounded-lg border border-[#2d3138]">
                    <div className="flex flex-col items-center">
                      <Knob
                        min={0}
                        max={300}
                        value={settings.masterGain}
                        onChange={(v) => handleSettingChange('masterGain', v)}
                        name="MASTER"
                        unit="%"
                      />
                    </div>
                    {/* Visual VU Meter indicator showing dynamic level based on settings.masterGain */}
                    <div className="flex flex-col gap-1 w-24">
                      <div className="font-mono text-[7px] text-[#8e95a0] uppercase font-black text-center mb-0.5">VU METER</div>
                      <div className="h-4 bg-[#141517] rounded border border-[#2d3138] p-0.5 flex gap-[2px] items-center overflow-hidden">
{Array.from({ length: 12 }).map((_, i) => {
  const threshold = (i / 12) * 300;
  const isActive = settings.masterGain >= threshold;
  let colorClass = 'bg-[#34c759]'; // green (0-100%, unity gain)
  if (i >= 4) colorClass = 'bg-[#ff9500]'; // orange (100-200%, pushing the limiter)
  if (i >= 8) colorClass = 'bg-[#ff3b30]'; // red (200-300%, heavy limiting)
                          return (
                            <div 
                              key={i} 
                              className={`h-full w-[4px] rounded-sm transition-all duration-150 ${
                                isActive ? colorClass : 'bg-[#1e2024] opacity-20'
                              }`}
                            />
                          );
                        })}
                      </div>
                      <div className="font-mono text-[8px] text-center text-[#ff3b30] font-black">{settings.masterGain}%</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="interactive-card flex flex-col gap-3 bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] mt-4">
                <div className="font-mono text-[8px] text-[#34c759] uppercase font-black tracking-widest border-b border-[#2b2e34] pb-1.5">
                  12 // ANON PRESET MEMORY (NO LOGIN)
                </div>

                <div className="font-mono text-[8px] text-[#8e95a0] uppercase">
                  {presetsStatus ?? `Perfil anônimo: ${getAnonId().slice(0, 8)}...`}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="nome do preset"
                    className="bg-[#2b2e34] border border-[#3e4249] rounded px-2 py-2 text-white font-mono text-[10px]"
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={presetsBusy}
                    className="font-mono text-[9px] font-black uppercase px-3 py-2 rounded border bg-[#34c759]/15 text-[#34c759] border-[#34c759]/40 disabled:opacity-50"
                  >
                    SAVE
                  </button>
                  <button
                    onClick={refreshPresets}
                    disabled={presetsBusy}
                    className="font-mono text-[9px] font-black uppercase px-3 py-2 rounded border bg-black/40 text-[#8e95a0] border-[#3e4249] disabled:opacity-50"
                  >
                    REFRESH
                  </button>
                </div>

                <div className="max-h-52 overflow-auto border border-[#2b2e34] rounded">
                  {savedPresets.length === 0 ? (
                    <div className="font-mono text-[9px] text-[#8e95a0] p-3 uppercase">
                      Sem presets no perfil atual.
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {savedPresets.map((preset) => (
                        <div key={preset.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-2 py-2 border-b border-[#2b2e34] last:border-b-0">
                          <div className="font-mono text-[9px] text-white uppercase truncate" title={preset.name}>{preset.name}</div>
                          <button
                            onClick={() => handleLoadPreset(preset)}
                            disabled={presetsBusy}
                            className="font-mono text-[8px] font-black uppercase px-2 py-1 rounded border bg-[#ff9500]/15 text-[#ffae00] border-[#ffae00]/40 disabled:opacity-50"
                          >
                            LOAD
                          </button>
                          <button
                            onClick={() => handleDeletePreset(preset.id)}
                            disabled={presetsBusy}
                            className="font-mono text-[8px] font-black uppercase px-2 py-1 rounded border bg-[#ff3b30]/10 text-[#ff6b62] border-[#ff3b30]/40 disabled:opacity-50"
                          >
                            DEL
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              </>
              )}

            </div>
          </div>

        </div>

        {/* PIANO KEYBOARD SECTION (MÓDULO DE PERFORMANCE) */}
        <div className="interactive-card p-4 md:p-6 bg-[#31353b] border-t border-white/5 relative shadow-[0_-4px_12px_rgba(0,0,0,0.12)]">
          {/* Parafusos */}
          <div className="absolute top-2 left-2"><Screw /></div>
          <div className="absolute top-2 right-2"><Screw /></div>

          <div className="text-center border-b border-[#23252a] pb-3 mb-4">
            <span className="font-mono text-[10px] text-white tracking-widest font-black block uppercase">
              ACTUATOR KEYBOARD ARRAY
            </span>
          </div>

          {/* Status LED Bar */}
          <div className="interactive-card flex flex-wrap items-center justify-between gap-4 bg-[#1e2024] p-3 rounded-lg border border-[#2b2e34] mb-4 font-mono">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-[#8e95a0] uppercase font-bold">LKG ACTUATOR SIGNAL:</span>
              <span className="text-[11px] text-[#ff9500] font-black bg-black/50 px-2 py-0.5 rounded border border-[#2b2e34]">
                {lastPlayedNote || '—'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-[#8e95a0] uppercase font-bold">POLYPHONY VOICES:</span>
              <span className="text-[11px] text-[#34c759] font-black bg-black/50 px-2 py-0.5 rounded border border-[#2b2e34]">
                {settings.polyphony ? 'POLYPHONIC' : 'MONOPHONIC'}
              </span>
            </div>
          </div>

          <div className="w-full">
            <Keyboard
              onPlayNote={handlePlayNote}
              onStopNote={handleStopNote}
              activeMidiNotes={settings.loopInterleaveEnabled && settings.loopLatchEnabled ? new Set([...activeMidiNotes, ...latchedMidiNotes]) : activeMidiNotes}
              lastPlayedNote={lastPlayedNote}
              setLastPlayedNote={setLastPlayedNote}
            />
          </div>
        </div>

        {/* BOTTOM FIXED CONSOLE / BAR PARA EXPORTAR WAV */}
        <div className="bg-[#24282d] border-t border-white/5 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col font-mono text-[9px] text-[#8e95a0]">
            <span className="uppercase">OUTPUT WAV DESIGNATION:</span>
            <span className="text-white font-bold text-xs truncate max-w-[280px] sm:max-w-none block mt-0.5">
              timbr3_{targetNote.note}_{targetNote.hz.toFixed(2)}hz.wav
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Trava de segurança para disparo de exportação */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExportGuardOpen(!exportGuardOpen)}
                className={`font-mono text-[9px] font-black uppercase px-2.5 py-2.5 rounded border-2 transition-all cursor-pointer ${
                  exportGuardOpen 
                    ? 'bg-[#34c759]/20 text-[#34c759] border-[#34c759]/50' 
                    : 'bg-[#ff3b30] text-black border-[#9a1a12] font-black animate-pulse'
                }`}
              >
                {exportGuardOpen ? '🔓 READY' : '🔒 ARMED'}
              </button>
            </div>

            <button
              onClick={() => {
                if (exportGuardOpen) {
                  exportNoteAsFile();
                } else {
                  showInfo('Abra a tampa "ARMED" de segurança vermelha para liberar o exportador.');
                }
              }}
              disabled={!systemPower}
              className={`flex items-center gap-2 font-mono text-xs font-black uppercase py-3.5 px-6 rounded-md border-2 transition-all ${
                exportGuardOpen 
                  ? 'bg-[#ff9500] text-black border-[#b07200] hover:brightness-110 active:scale-[0.98] cursor-pointer' 
                  : 'bg-[#3a3d45] text-[#8e95a0] border-[#50545e] cursor-not-allowed opacity-50'
              }`}
            >
              <Download className="w-4 h-4" /> EXPORT WAV
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
