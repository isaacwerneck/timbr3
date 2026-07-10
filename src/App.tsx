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
import { SynthEngine } from './audio/SynthEngine';
import { AudioSampleState, SynthSettings, NoteInfo } from './types';

// Configurações padrão do Sintetizador
const defaultSettings: SynthSettings = {
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
  polyphony: true,
  masterGain: 80,
};

// Componente de Parafuso Realista do Cockpit
const Screw = () => (
  <div className="w-2.5 h-2.5 rounded-full bg-[#51555e] border border-[#2b2e33] flex items-center justify-center shadow-inner select-none pointer-events-none">
    <div className="w-1.5 h-[1.5px] bg-[#1a1c1e] rotate-45 transform" />
  </div>
);

export default function App() {
  const synthRef = useRef<SynthEngine | null>(null);

  // Estados principais
  const [settings, setSettings] = useState<SynthSettings>(defaultSettings);
  const [activeTab, setActiveTab] = useState<'rec' | 'upload' | 'bip'>('rec');
  const [bipType, setBipType] = useState<OscillatorType>('sine');
  const [bipDuration, setBipDuration] = useState<number>(180); // ms

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

  // Estados de afinação
  const [targetNote, setTargetNote] = useState<NoteInfo>({ note: 'C3', hz: 130.81 });
  const [activeMidiNotes, setActiveMidiNotes] = useState<Set<number>>(new Set());
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

  // Atualizar knobs de parâmetros
  const handleSettingChange = (key: keyof SynthSettings, value: any) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (synthRef.current) {
        synthRef.current.updateActiveVoices(next);
      }
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
      const buffer = await synthRef.current.generateBip(bipType, bipDuration);
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
    synthRef.current.playPreview(settings);
  };

  // 6. Toque do piano
  const handlePlayNote = (midiNumber: number, freq: number, noteName: string) => {
    if (!synthRef.current || !systemPower) return;

    synthRef.current.init();

    if (!settings.polyphony) {
      synthRef.current.stopAllNotes(settings);
      setActiveMidiNotes(new Set([midiNumber]));
    } else {
      setActiveMidiNotes((prev) => {
        const next = new Set(prev);
        next.add(midiNumber);
        return next;
      });
    }

    setTargetNote({ note: noteName, hz: freq });
    synthRef.current.startNote(midiNumber, freq, settings);
  };

  const handleStopNote = (midiNumber: number) => {
    if (!synthRef.current) return;
    synthRef.current.stopNote(midiNumber, settings);
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
      
      const wavBlob = await synthRef.current.exportNote(freq, settings);
      
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

  return (
    <div className="min-h-screen bg-[#383b40] text-[#eef2f7] font-sans pb-32 relative select-none overflow-x-hidden p-4 md:p-8">
      {/* Moldura metálica principal do Cockpit Overhead Panel */}
      <div className="max-w-[1200px] mx-auto bg-[#43474e] border-4 border-[#25272a] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_2px_4px_rgba(255,255,255,0.1)] overflow-hidden relative">
        
        {/* TOP BAR / LOGO & SYSTEM CONFIG */}
        <div className="bg-[#2d3035] border-b-2 border-[#1e2023] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
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
        <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#3d4148]">

          {/* COLUNA ESQUERDA: HUD DISPLAY & CONTROLE DE INPUT (MÓDULO DE SINAL) */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            
            {/* 1. HUD DISPLAY: DETECTOR DE FREQUÊNCIA E NOTA (AMBER SEVEN-SEGMENT) */}
            <div className="bg-[#24272c] border border-[#181a1d] rounded-xl p-5 shadow-[inset_0_4px_12px_rgba(0,0,0,0.9)] relative overflow-hidden flex flex-col justify-between min-h-[160px]">
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
            <div className="bg-[#32363c] border-2 border-[#1e2024] rounded-xl p-5 relative shadow-md">
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
              <div className="grid grid-cols-3 gap-2 bg-[#1e2024] p-1 rounded-lg mb-4 border border-[#484c54]">
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
              <div className="bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34]">
                
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
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['sine', 'square', 'sawtooth', 'triangle'] as OscillatorType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setBipType(type)}
                          className={`font-mono text-[9px] font-black uppercase py-2 rounded border transition-all cursor-pointer ${
                            bipType === type 
                              ? 'bg-[#ff9500] text-black border-[#b07200]' 
                              : 'bg-[#2b2e34] text-[#8e95a0] border-[#3e4249] hover:text-white'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-3 bg-[#24272c] p-2.5 rounded border border-[#3e4249]">
                      <span className="font-mono text-[9px] text-[#8e95a0] uppercase">WIDTH:</span>
                      <input
                        type="range"
                        min="20"
                        max="500"
                        value={bipDuration}
                        onChange={(e) => setBipDuration(parseInt(e.target.value))}
                        className="flex-1 accent-[#ff9500]"
                      />
                      <span className="font-mono text-[10px] text-[#ff9500] font-bold bg-black/60 px-1.5 py-0.5 rounded border border-[#484c54] w-[50px] text-center">
                        {bipDuration}MS
                      </span>
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
                <div className="mt-3 flex items-center justify-between bg-[#24272c] p-2.5 rounded border border-[#30333a]">
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
          <div className="lg:col-span-6 flex flex-col gap-6">
            
            <div className="bg-[#32363c] border-2 border-[#1e2024] rounded-xl p-5 relative shadow-md">
              {/* Parafusos */}
              <div className="absolute top-2.5 left-2.5"><Screw /></div>
              <div className="absolute top-2.5 right-2.5"><Screw /></div>
              <div className="absolute bottom-2.5 left-2.5"><Screw /></div>
              <div className="absolute bottom-2.5 right-2.5"><Screw /></div>

              <div className="text-center border-b border-[#23252a] pb-3 mb-4 mt-2">
                <span className="font-mono text-[10px] text-white tracking-widest font-black block uppercase">
                  SOUND CUSTOMIZATION & MIXING
                </span>
              </div>

              {/* GRUPO DE KNOBS: TIMBRE EQ & EFFECTS */}
              <div className="flex flex-col gap-4 bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] mb-4">
                <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2b2e34] pb-1.5 mb-2">
                  01 // ANALOG TIMBRE EQ & BASS BOOST
                </div>
                <div className="grid grid-cols-4 gap-2 justify-items-center">
                  <Knob
                    min={-12}
                    max={12}
                    value={settings.lowGain}
                    onChange={(v) => handleSettingChange('lowGain', v)}
                    name="LOW EQ"
                    unit="dB"
                  />
                  <Knob
                    min={-12}
                    max={12}
                    value={settings.midGain}
                    onChange={(v) => handleSettingChange('midGain', v)}
                    name="MID EQ"
                    unit="dB"
                  />
                  <Knob
                    min={-12}
                    max={12}
                    value={settings.highGain}
                    onChange={(v) => handleSettingChange('highGain', v)}
                    name="HIGH EQ"
                    unit="dB"
                  />
                  <Knob
                    min={0}
                    max={12}
                    value={settings.bassBoost}
                    onChange={(v) => handleSettingChange('bassBoost', v)}
                    name="SUB BOOST"
                    unit="dB"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4 bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] mb-4">
                <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2b2e34] pb-1.5 mb-2">
                  02 // WAVE MODIFIERS & EFFECTS (FX)
                </div>
                <div className="grid grid-cols-4 gap-2 justify-items-center">
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
                    value={settings.drive}
                    onChange={(v) => handleSettingChange('drive', v)}
                    name="DRIVE"
                    unit="%"
                  />
                  <Knob
                    min={0}
                    max={100}
                    value={settings.bitcrusher}
                    onChange={(v) => handleSettingChange('bitcrusher', v)}
                    name="CRUSHER"
                    unit="%"
                  />
                </div>
              </div>

              {/* ENVELOPE CONTROLS (ADSR) & PITCH CALIBRATOR */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                
                {/* KEYBOARD ENVELOPE (ADSR) */}
                <div className="bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3">
                  <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5">
                    03 // KEYBOARD ENVELOPE (ADSR)
                  </div>
                  
                  {/* ATTACK */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between font-mono text-[9px] text-[#8e95a0] uppercase font-bold">
                      <span>KEY ATTACK</span>
                      <span className="text-[#ff9500]">{settings.keyAttack}MS</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={settings.keyAttack}
                      onChange={(e) => handleSettingChange('keyAttack', parseInt(e.target.value))}
                      className="accent-[#ff9500] cursor-pointer"
                    />
                  </div>

                  {/* SUSTAIN */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between font-mono text-[9px] text-[#8e95a0] uppercase font-bold">
                      <span>KEY SUSTAIN</span>
                      <span className="text-[#ff9500]">{settings.keySustain}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.keySustain}
                      onChange={(e) => handleSettingChange('keySustain', parseInt(e.target.value))}
                      className="accent-[#ff9500] cursor-pointer"
                    />
                  </div>

                  {/* RELEASE */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between font-mono text-[9px] text-[#8e95a0] uppercase font-bold">
                      <span>KEY RELEASE</span>
                      <span className="text-[#ff9500]">{settings.keyRelease}MS</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="500"
                      value={settings.keyRelease}
                      onChange={(e) => handleSettingChange('keyRelease', parseInt(e.target.value))}
                      className="accent-[#ff9500] cursor-pointer"
                    />
                  </div>
                </div>

                {/* PITCH TENSION CALIBRATOR */}
                <div className="bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3">
                  <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5">
                    04 // PITCH CALIBRATOR
                  </div>

                  {/* PITCH COARSE (SEMITONES) */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between font-mono text-[9px] text-[#8e95a0] uppercase font-bold">
                      <span>COARSE TUNE</span>
                      <span className="text-[#ff9500]">{settings.pitchCoarse > 0 ? '+' : ''}{settings.pitchCoarse} ST</span>
                    </div>
                    <input
                      type="range"
                      min="-24"
                      max="24"
                      step="1"
                      value={settings.pitchCoarse}
                      onChange={(e) => handleSettingChange('pitchCoarse', parseInt(e.target.value))}
                      className="accent-[#ff9500] cursor-pointer"
                    />
                  </div>

                  {/* PITCH FINE (CENTS) */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between font-mono text-[9px] text-[#8e95a0] uppercase font-bold">
                      <span>FINE-TUNE</span>
                      <span className="text-[#ff9500]">{settings.pitchFine > 0 ? '+' : ''}{settings.pitchFine} CTS</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={settings.pitchFine}
                      onChange={(e) => handleSettingChange('pitchFine', parseInt(e.target.value))}
                      className="accent-[#ff9500] cursor-pointer"
                    />
                  </div>
                </div>

              </div>

              {/* SWITCHES & ACTUATORS */}
              <div className="bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] flex flex-col gap-3">
                <div className="font-mono text-[8px] text-[#ff9500] uppercase font-black tracking-widest border-b border-[#2d3138] pb-1.5 mb-1">
                  05 // ENGINE ACTUATORS & SYSTEM SWITCHES
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* REVERSE ACTUATOR WITH RED GUARD */}
                  <div className="bg-[#24272c] p-2 rounded border border-[#2b2e34] flex flex-col justify-between gap-2.5">
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
                  <div className="bg-[#24272c] p-2 rounded border border-[#2b2e34] flex flex-col justify-between gap-2">
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
                  <div className="bg-[#24272c] p-2 rounded border border-[#2b2e34] flex flex-col justify-between gap-2">
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
              <div className="flex flex-col gap-4 bg-[#1e2024] p-4 rounded-lg border border-[#2b2e34] mt-4">
                <div className="font-mono text-[8px] text-[#ff3b30] uppercase font-black tracking-widest border-b border-[#2b2e34] pb-1.5 mb-1">
                  06 // MASTER LEVEL CONTROLLER
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
                        max={100}
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
                          const threshold = (i / 12) * 100;
                          const isActive = settings.masterGain >= threshold;
                          let colorClass = 'bg-[#34c759]'; // green
                          if (i >= 8) colorClass = 'bg-[#ff9500]'; // orange
                          if (i >= 10) colorClass = 'bg-[#ff3b30]'; // red
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

            </div>
          </div>

        </div>

        {/* PIANO KEYBOARD SECTION (MÓDULO DE PERFORMANCE) */}
        <div className="p-4 md:p-6 bg-[#32363c] border-t-2 border-[#1e2024] relative shadow-lg">
          {/* Parafusos */}
          <div className="absolute top-2 left-2"><Screw /></div>
          <div className="absolute top-2 right-2"><Screw /></div>

          <div className="text-center border-b border-[#23252a] pb-3 mb-4">
            <span className="font-mono text-[10px] text-white tracking-widest font-black block uppercase">
              ACTUATOR KEYBOARD ARRAY
            </span>
          </div>

          {/* Status LED Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-[#1e2024] p-3 rounded-lg border border-[#2b2e34] mb-4 font-mono">
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
              activeMidiNotes={activeMidiNotes}
              lastPlayedNote={lastPlayedNote}
              setLastPlayedNote={setLastPlayedNote}
            />
          </div>
        </div>

        {/* BOTTOM FIXED CONSOLE / BAR PARA EXPORTAR WAV */}
        <div className="bg-[#2d3035] border-t-2 border-[#1e2023] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
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
