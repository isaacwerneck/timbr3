import {
  ModMatrixSlot,
  NoiseColor,
  PwmTarget,
  SynthSettings,
} from '../types';

interface VoiceUnit {
  source: AudioBufferSourceNode;
  gain: GainNode;
  preDrive: WaveShaperNode;
  postDrive: WaveShaperNode;
  lowPass: BiquadFilterNode;
  highPass: BiquadFilterNode;
  lpMix: GainNode;
  hpMix: GainNode;
  unitOut: GainNode;
  panner: StereoPannerNode;
  detuneCents: number;
}

interface ActiveVoice {
  midiNumber: number;
  baseFreq: number;
  units: VoiceUnit[];
  noteGain: GainNode;
  voiceMix: GainNode;
  ringOsc: OscillatorNode;
  ringAmount: GainNode;
  ringVca: GainNode;
  ringDry: GainNode;
  ringMixOut: GainNode;
  chorusDelay: DelayNode;
  chorusDry: GainNode;
  chorusWet: GainNode;
  chorusLfo: OscillatorNode;
  chorusLfoGain: GainNode;
  gaterNode: GainNode;
  gaterLfo: OscillatorNode;
  gaterLfoScale: GainNode;
  gaterLfoOffset: ConstantSourceNode;
  selfOsc: OscillatorNode;
  selfOscGain: GainNode;
  noiseSource: AudioBufferSourceNode | null;
  noiseGain: GainNode | null;
  randomSeed: number;
  startedAt: number;
  modulationTimer: number | null;
  baseDecayMs: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export class SynthEngine {
  private audioCtx: AudioContext | null = null;
  private sampleBuffer: AudioBuffer | null = null;
  private activeVoices: Map<number, ActiveVoice> = new Map();
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private onWaveformUpdate: ((data: number[]) => void) | null = null;
  private masterGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private lastSettings: SynthSettings | null = null;

  constructor() {
    // Lazy init
  }

  private makeDistortionCurve(amount: number): Float32Array {
    const k = 1 + amount * 3;
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  private foldSample(x: number): number {
    let y = x;
    while (y > 1 || y < -1) {
      if (y > 1) y = 2 - y;
      if (y < -1) y = -2 - y;
    }
    return y;
  }

  private applyWaveShapers(sample: number, settings: SynthSettings): number {
    let x = sample;
    if (settings.waveshapeAmount > 0) {
      const drive = 1 + (settings.waveshapeAmount / 100) * 8;
      x = Math.tanh(x * drive);
    }
    if (settings.wavefoldAmount > 0) {
      const gain = 1 + (settings.wavefoldAmount / 100) * 6;
      x = this.foldSample(x * gain);
    }
    return clamp(x, -1, 1);
  }

  private phaseWarp(phase: number, pwmAmount: number, pwmTarget: PwmTarget): number {
    if (pwmAmount <= 0) return phase;
    const amt = (pwmAmount / 100) * 0.45;
    let center = 0.5;

    if (pwmTarget === 'triangle') center = 0.5 + amt * 0.6;
    if (pwmTarget === 'saw') center = 0.5 - amt * 0.6;
    if (pwmTarget === 'square') center = 0.5 + amt;

    center = clamp(center, 0.05, 0.95);
    if (phase < center) {
      return (phase / center) * 0.5;
    }
    return 0.5 + ((phase - center) / (1 - center)) * 0.5;
  }

  private createNoiseBuffer(color: NoiseColor, durationSec = 2): AudioBuffer {
    const ctx = this.init();
    const sampleRate = ctx.sampleRate;
    const len = Math.floor(sampleRate * durationSec);
    const buf = ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);

    let pinkB0 = 0;
    let pinkB1 = 0;
    let pinkB2 = 0;
    let pinkB3 = 0;
    let pinkB4 = 0;
    let pinkB5 = 0;
    let pinkB6 = 0;

    let prevWhite = 0;

    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;

      if (color === 'white') {
        data[i] = white * 0.5;
      } else if (color === 'pink') {
        pinkB0 = 0.99886 * pinkB0 + white * 0.0555179;
        pinkB1 = 0.99332 * pinkB1 + white * 0.0750759;
        pinkB2 = 0.96900 * pinkB2 + white * 0.1538520;
        pinkB3 = 0.86650 * pinkB3 + white * 0.3104856;
        pinkB4 = 0.55000 * pinkB4 + white * 0.5329522;
        pinkB5 = -0.7616 * pinkB5 - white * 0.0168980;
        const out = pinkB0 + pinkB1 + pinkB2 + pinkB3 + pinkB4 + pinkB5 + pinkB6 + white * 0.5362;
        pinkB6 = white * 0.115926;
        data[i] = clamp(out * 0.12, -1, 1);
      } else {
        const blue = white - prevWhite;
        prevWhite = white;
        data[i] = clamp(blue * 0.9, -1, 1);
      }
    }

    return buf;
  }

  public init(initialMasterGain: number = 80) {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGainNode = this.audioCtx.createGain();
      this.masterGainNode.gain.setValueAtTime(initialMasterGain / 100, this.audioCtx.currentTime);

      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;

      this.masterGainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  public getContext(): AudioContext | null {
    return this.audioCtx;
  }

  public getSampleBuffer(): AudioBuffer | null {
    return this.sampleBuffer;
  }

  public setSampleBuffer(buffer: AudioBuffer) {
    this.sampleBuffer = buffer;
    this.generateWaveformData();
  }

  public setOnWaveformUpdate(callback: (data: number[]) => void) {
    this.onWaveformUpdate = callback;
    if (this.sampleBuffer) {
      this.generateWaveformData();
    }
  }

  public async startRecording(): Promise<void> {
    this.init();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };
    this.mediaRecorder.start();
  }

  public async stopRecording(): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('Gravacao nao iniciada'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(this.recordedChunks, { type: 'audio/wav' });
          const arrayBuffer = await blob.arrayBuffer();
          const context = this.init();
          const decodedBuffer = await context.decodeAudioData(arrayBuffer);
          const trimmedBuffer = this.autoTrimSilence(decodedBuffer);
          this.setSampleBuffer(trimmedBuffer);
          this.mediaRecorder?.stream.getTracks().forEach((track) => track.stop());
          resolve(trimmedBuffer);
        } catch (err) {
          reject(err);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  public async loadFile(file: File): Promise<AudioBuffer> {
    const context = this.init();
    const arrayBuffer = await file.arrayBuffer();
    const decodedBuffer = await context.decodeAudioData(arrayBuffer);
    const trimmedBuffer = this.autoTrimSilence(decodedBuffer);
    this.setSampleBuffer(trimmedBuffer);
    return trimmedBuffer;
  }

  public async generateBip(type: OscillatorType, durationMs: number): Promise<AudioBuffer> {
    const context = this.init();
    const sampleRate = context.sampleRate;
    const durationSec = durationMs / 1000;
    const frameCount = sampleRate * durationSec;
    const offlineCtx = new OfflineAudioContext(1, frameCount, sampleRate);

    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(220, 0);
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(1, 0.01);
    gain.gain.setValueAtTime(1, durationSec - 0.02);
    gain.gain.linearRampToValueAtTime(0, durationSec);

    osc.connect(gain);
    gain.connect(offlineCtx.destination);

    osc.start(0);
    osc.stop(durationSec);

    const renderedBuffer = await offlineCtx.startRendering();
    this.setSampleBuffer(renderedBuffer);
    return renderedBuffer;
  }

  private autoTrimSilence(buffer: AudioBuffer): AudioBuffer {
    const threshold = 0.015;
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;

    const data = buffer.getChannelData(0);
    let startIndex = 0;
    let endIndex = data.length - 1;

    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > threshold) {
        startIndex = Math.max(0, i - Math.floor(sampleRate * 0.01));
        break;
      }
    }

    for (let i = data.length - 1; i >= 0; i--) {
      if (Math.abs(data[i]) > threshold) {
        endIndex = Math.min(data.length - 1, i + Math.floor(sampleRate * 0.02));
        break;
      }
    }

    if (startIndex >= endIndex) return buffer;

    const duration = (endIndex - startIndex) / sampleRate;
    if (duration < 0.02) return buffer;

    const context = this.init();
    const trimmed = context.createBuffer(numChannels, endIndex - startIndex, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const srcData = buffer.getChannelData(channel);
      const dstData = trimmed.getChannelData(channel);
      for (let i = 0; i < trimmed.length; i++) {
        dstData[i] = srcData[startIndex + i];
      }
    }

    return trimmed;
  }

  public playPreview(settings: SynthSettings): void {
    if (!this.sampleBuffer) return;

    const context = this.init(settings.masterGain);
    const source = context.createBufferSource();
    const processed = this.processBuffer(this.sampleBuffer, settings);
    source.buffer = processed;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.8, context.currentTime + (settings.attack / 1000) + 0.005);
    gain.gain.setValueAtTime(0.8, context.currentTime + processed.duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, context.currentTime + processed.duration);

    source.connect(gain);
    gain.connect(this.masterGainNode || context.destination);

    source.start(0);
  }

  private processBuffer(baseBuffer: AudioBuffer, settings: SynthSettings): AudioBuffer {
    const context = this.init();
    const channels = baseBuffer.numberOfChannels;
    const sampleRate = baseBuffer.sampleRate;

    const trimPercent = settings.trim / 100;
    const totalFrames = Math.floor(baseBuffer.length * trimPercent);
    const length = Math.max(100, totalFrames);

    const processed = context.createBuffer(channels, length, sampleRate);

    for (let c = 0; c < channels; c++) {
      const srcData = baseBuffer.getChannelData(c);
      const dstData = processed.getChannelData(c);

      if (settings.reverse) {
        for (let i = 0; i < length; i++) {
          dstData[i] = srcData[length - 1 - i];
        }
      } else {
        for (let i = 0; i < length; i++) {
          dstData[i] = srcData[i];
        }
      }

      const attackFrames = Math.floor((settings.attack / 1000) * sampleRate);
      if (attackFrames > 0 && attackFrames < length) {
        for (let i = 0; i < attackFrames; i++) {
          dstData[i] *= i / attackFrames;
        }
      }
    }

    return processed;
  }

  private createNoteBuffer(baseBuffer: AudioBuffer, targetFreq: number, settings: SynthSettings): AudioBuffer {
    const context = this.init();
    const channels = baseBuffer.numberOfChannels;
    const sampleRate = baseBuffer.sampleRate;
    const periodFrames = Math.max(8, Math.floor((1 / targetFreq) * sampleRate));

    const periodBuffer = context.createBuffer(channels, periodFrames, sampleRate);
    const processedBase = this.processBuffer(baseBuffer, settings);
    const refData = processedBase.getChannelData(0);

    let peakIndex = 0;
    let maxVal = 0;
    for (let i = 0; i < refData.length; i++) {
      const absVal = Math.abs(refData[i]);
      if (absVal > maxVal) {
        maxVal = absVal;
        peakIndex = i;
      }
    }

    const downsampleFactor = Math.max(1, Math.floor(1 + (settings.sampleRateReduction / 100) * 28));
    const bitDepth = clamp(16 - (settings.bitcrusher / 100) * 14, 2, 16);
    const bitStep = Math.pow(2, bitDepth - 1);

    for (let c = 0; c < channels; c++) {
      const srcData = processedBase.getChannelData(c % processedBase.numberOfChannels);
      const dstData = periodBuffer.getChannelData(c);

      let held = 0;
      for (let i = 0; i < periodFrames; i++) {
        const phase = i / periodFrames;
        const warpedPhase = this.phaseWarp(phase, settings.pwmAmount, settings.pwmTarget);
        const srcIndex = (peakIndex + Math.floor(warpedPhase * periodFrames)) % srcData.length;

        let x = srcData[srcIndex];

        if (settings.subLevel > 0) {
          const subFreq = targetFreq / Math.pow(2, settings.subOctave);
          const sub = Math.sign(Math.sin(2 * Math.PI * subFreq * (i / sampleRate)));
          const dirtySub = Math.tanh(sub * (1 + settings.subDrive / 20));
          x += dirtySub * (settings.subLevel / 100) * 0.55;
        }

        x = this.applyWaveShapers(x, settings);

        if (i % downsampleFactor === 0) {
          held = Math.round(x * bitStep) / bitStep;
        }
        dstData[i] = held;
      }

      if (settings.autoFade) {
        const fadeLen = Math.min(Math.floor(periodFrames * 0.08), Math.floor(0.0015 * sampleRate));
        if (fadeLen > 0) {
          for (let i = 0; i < fadeLen; i++) {
            const factor = i / fadeLen;
            dstData[i] *= factor;
            dstData[periodFrames - 1 - i] *= factor;
          }
        }
      }
    }

    return periodBuffer;
  }

  private getSourceValue(source: ModMatrixSlot['source'], voice: ActiveVoice, settings: SynthSettings, now: number): number {
    const elapsed = now - voice.startedAt;

    const lfoValue = (lfoSettings: SynthSettings['lfo1']) => {
      const phase = elapsed * lfoSettings.rate;
      const frac = phase - Math.floor(phase);

      if (lfoSettings.waveform === 'sine') return Math.sin(phase * Math.PI * 2);
      if (lfoSettings.waveform === 'triangle') return 1 - 4 * Math.abs(frac - 0.5);
      if (lfoSettings.waveform === 'sawtooth') return frac * 2 - 1;
      if (lfoSettings.waveform === 'square') return frac < 0.5 ? 1 : -1;
      if (lfoSettings.waveform === 'sample-hold') {
        const step = Math.floor(elapsed * lfoSettings.rate * 4);
        const val = Math.sin((step + voice.randomSeed * 1000) * 12.9898) * 43758.5453123;
        return (val - Math.floor(val)) * 2 - 1;
      }

      const shape = lfoSettings.customShape.length > 0 ? lfoSettings.customShape : [0, 1, 0, -1];
      const idx = frac * shape.length;
      const i0 = Math.floor(idx) % shape.length;
      const i1 = (i0 + 1) % shape.length;
      const t = idx - Math.floor(idx);
      return shape[i0] * (1 - t) + shape[i1] * t;
    };

    if (source === 'lfo1') return lfoValue(settings.lfo1) * (settings.lfo1.depth / 100);
    if (source === 'lfo2') return lfoValue(settings.lfo2) * (settings.lfo2.depth / 100);

    if (source === 'velocity') return 1;

    if (source === 'keytrack') {
      const keyNorm = (voice.midiNumber - 60) / 24;
      return clamp(keyNorm, -1, 1);
    }

    if (source === 'random') {
      return voice.randomSeed * 2 - 1;
    }

    const env = this.getLoopingEnvelopeValue(elapsed, settings, voice.baseDecayMs);
    return env * 2 - 1;
  }

  private getLoopingEnvelopeValue(elapsed: number, settings: SynthSettings, decayMs: number): number {
    const d = settings.keyDelay / 1000;
    const a = settings.keyAttack / 1000;
    const h = settings.keyHold / 1000;
    const dec = decayMs / 1000;

    const segmentDur = Math.max(0.001, d + a + h + dec);
    const t = settings.keyLoopEnvelope ? elapsed % segmentDur : elapsed;

    if (t < d) return 0;
    if (t < d + a) return (t - d) / Math.max(0.001, a);
    if (t < d + a + h) return 1;
    if (t < segmentDur) {
      const rel = (t - d - a - h) / Math.max(0.001, dec);
      const sustain = settings.keySustain / 100;
      return 1 - rel * (1 - sustain);
    }
    return settings.keySustain / 100;
  }

  private applyModMatrix(voice: ActiveVoice, settings: SynthSettings) {
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    let pitchCents = 0;
    let cutoffMul = 1;
    let qAdd = 0;
    let preDriveAdd = 0;
    let postDriveAdd = 0;
    let ringFreqAdd = 0;
    let ringAmountAdd = 0;

    for (const slot of settings.modMatrix) {
      if (!slot.enabled) continue;
      const src = this.getSourceValue(slot.source, voice, settings, now);
      const amt = slot.amount / 100;

      if (slot.destination === 'pitch') pitchCents += src * amt * 120;
      if (slot.destination === 'filterCutoff') cutoffMul *= Math.pow(2, src * amt * 2);
      if (slot.destination === 'filterResonance') qAdd += src * amt * 10;
      if (slot.destination === 'preDrive') preDriveAdd += src * amt * 40;
      if (slot.destination === 'postDrive') postDriveAdd += src * amt * 40;
      if (slot.destination === 'ringModFreq') ringFreqAdd += src * amt * 2000;
      if (slot.destination === 'ringModAmount') ringAmountAdd += src * amt * 50;
    }

    const totalCents = (settings.pitchCoarse * 100) + settings.pitchFine + pitchCents;
    const playbackRatio = Math.pow(2, totalCents / 1200);

    const cutoff = clamp(settings.filterCutoff * cutoffMul, 40, 18000);
    const q = clamp(settings.filterResonance + qAdd, 0.1, 30);

    const preDrive = clamp(settings.preFilterDrive + preDriveAdd, 0, 100);
    const postDrive = clamp(settings.postFilterDrive + postDriveAdd, 0, 100);

    voice.units.forEach((unit) => {
      unit.source.playbackRate.setTargetAtTime(playbackRatio * Math.pow(2, unit.detuneCents / 1200), now, 0.02);
      unit.lowPass.frequency.setTargetAtTime(cutoff, now, 0.02);
      unit.highPass.frequency.setTargetAtTime(cutoff * 0.45, now, 0.02);
      unit.lowPass.Q.setTargetAtTime(q, now, 0.02);
      unit.highPass.Q.setTargetAtTime(q * 0.8, now, 0.02);
      unit.preDrive.curve = this.makeDistortionCurve(preDrive);
      unit.postDrive.curve = this.makeDistortionCurve(postDrive);
    });

    const ringFreq = clamp(settings.ringModFreq + ringFreqAdd, 10, 5000);
    const ringAmt = clamp(settings.ringModAmount + ringAmountAdd, 0, 100);
    voice.ringOsc.frequency.setTargetAtTime(ringFreq, now, 0.03);
    voice.ringAmount.gain.setTargetAtTime(ringAmt / 100, now, 0.03);
    voice.ringDry.gain.setTargetAtTime(1 - ringAmt / 100, now, 0.03);

    const blend = settings.filterParallelBlend / 100;
    voice.units.forEach((unit) => {
      unit.lpMix.gain.setTargetAtTime(1 - blend, now, 0.02);
      unit.hpMix.gain.setTargetAtTime(blend, now, 0.02);
    });

    const selfOscGain = clamp(((q - 18) / 12) * (settings.selfOscillation / 100), 0, 1) * 0.25;
    voice.selfOsc.frequency.setTargetAtTime(cutoff, now, 0.03);
    voice.selfOscGain.gain.setTargetAtTime(selfOscGain, now, 0.03);
  }

  private buildVoiceGraph(midiNumber: number, targetFreq: number, settings: SynthSettings): ActiveVoice {
    const context = this.audioCtx!;
    const randomSeed = Math.random();
    const driftCents = ((Math.random() * 2 - 1) * settings.driftAmount * 0.25);
    const driftAttack = (Math.random() * settings.driftEnvJitter * 0.003);
    const decayMs = clamp(settings.keyDecay + (randomSeed * 2 - 1) * settings.driftEnvJitter * 2, 15, 2000);

    let baseBuf = this.sampleBuffer;
    if (!baseBuf) {
      const sr = context.sampleRate;
      baseBuf = context.createBuffer(1, Math.floor(sr * 0.15), sr);
      const ch = baseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        ch[i] = Math.sin(2 * Math.PI * 220 * (i / sr)) * Math.exp(-25 * (i / sr));
      }
    }

    const noteBuffer = this.createNoteBuffer(baseBuf, targetFreq, settings);

    const voiceMix = context.createGain();
    voiceMix.gain.setValueAtTime(1, context.currentTime);

    const noteGain = context.createGain();
    noteGain.gain.setValueAtTime(0, context.currentTime);

    const ringDry = context.createGain();
    const ringVca = context.createGain();
    const ringMixOut = context.createGain();
    ringDry.gain.setValueAtTime(1 - settings.ringModAmount / 100, context.currentTime);
    ringVca.gain.setValueAtTime(0, context.currentTime);

    const ringOsc = context.createOscillator();
    ringOsc.type = 'sine';
    ringOsc.frequency.setValueAtTime(settings.ringModFreq, context.currentTime);

    const ringAmount = context.createGain();
    ringAmount.gain.setValueAtTime(settings.ringModAmount / 100, context.currentTime);

    ringOsc.connect(ringAmount);
    ringAmount.connect(ringVca.gain);

    const chorusDelay = context.createDelay(0.08);
    chorusDelay.delayTime.setValueAtTime(0.018, context.currentTime);
    const chorusDry = context.createGain();
    const chorusWet = context.createGain();
    chorusDry.gain.setValueAtTime(1 - settings.chorusMix / 100, context.currentTime);
    chorusWet.gain.setValueAtTime(settings.chorusMix / 100, context.currentTime);

    const chorusLfo = context.createOscillator();
    chorusLfo.type = 'triangle';
    chorusLfo.frequency.setValueAtTime(settings.chorusRate, context.currentTime);
    const chorusLfoGain = context.createGain();
    chorusLfoGain.gain.setValueAtTime((settings.chorusDepth / 100) * 0.008, context.currentTime);
    chorusLfo.connect(chorusLfoGain);
    chorusLfoGain.connect(chorusDelay.delayTime);

    // Gater/Tremolo: LFO bipolar convertido para unipolar (0..1) para evitar ganho negativo.
    const gaterNode = context.createGain();
    gaterNode.gain.setValueAtTime(1, context.currentTime);
    const gaterLfo = context.createOscillator();
    gaterLfo.type = settings.gaterWaveform;
    gaterLfo.frequency.setValueAtTime(settings.gaterRate, context.currentTime);
    const gaterLfoScale = context.createGain();
    const gaterLfoOffset = context.createConstantSource();

    const selfOsc = context.createOscillator();
    selfOsc.type = 'sine';
    selfOsc.frequency.setValueAtTime(settings.filterCutoff, context.currentTime);
    const selfOscGain = context.createGain();
    selfOscGain.gain.setValueAtTime(0, context.currentTime);

    voiceMix.connect(ringDry);
    voiceMix.connect(ringVca);
    ringDry.connect(ringMixOut);
    ringVca.connect(ringMixOut);
    selfOsc.connect(selfOscGain);
    selfOscGain.connect(ringMixOut);

    ringMixOut.connect(chorusDry);
    ringMixOut.connect(chorusDelay);
    chorusDelay.connect(chorusWet);
    chorusDry.connect(gaterNode);
    chorusWet.connect(gaterNode);
    gaterNode.connect(noteGain);
    noteGain.connect(this.masterGainNode || context.destination);

    const units: VoiceUnit[] = [];
    const voices = settings.unisonVoices;
    const spread = settings.unisonStereoSpread / 100;

    for (let i = 0; i < voices; i++) {
      const pos = voices === 1 ? 0 : (i / (voices - 1)) * 2 - 1;
      const detune = driftCents + pos * settings.unisonDetune;

      const source = context.createBufferSource();
      source.buffer = noteBuffer;
      source.loop = true;

      const gain = context.createGain();
      gain.gain.setValueAtTime(1 / voices, context.currentTime);

      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(pos * spread, context.currentTime);

      const preDrive = context.createWaveShaper();
      preDrive.curve = this.makeDistortionCurve(settings.preFilterDrive);
      preDrive.oversample = '4x';

      const lowPass = context.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.setValueAtTime(settings.filterCutoff, context.currentTime);
      lowPass.Q.setValueAtTime(settings.filterResonance, context.currentTime);

      const highPass = context.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.setValueAtTime(settings.filterCutoff * 0.45, context.currentTime);
      highPass.Q.setValueAtTime(settings.filterResonance * 0.8, context.currentTime);

      const lpMix = context.createGain();
      const hpMix = context.createGain();
      const blend = settings.filterParallelBlend / 100;
      lpMix.gain.setValueAtTime(1 - blend, context.currentTime);
      hpMix.gain.setValueAtTime(blend, context.currentTime);

      const postDrive = context.createWaveShaper();
      postDrive.curve = this.makeDistortionCurve(settings.postFilterDrive);
      postDrive.oversample = '4x';

      const unitOut = context.createGain();

      source.connect(gain);
      gain.connect(preDrive);

      if (settings.filterRouting === 'series') {
        preDrive.connect(lowPass);
        lowPass.connect(highPass);
        highPass.connect(postDrive);
      } else {
        preDrive.connect(lowPass);
        preDrive.connect(highPass);
        lowPass.connect(lpMix);
        highPass.connect(hpMix);
        lpMix.connect(postDrive);
        hpMix.connect(postDrive);
      }

      postDrive.connect(panner);
      panner.connect(unitOut);
      unitOut.connect(voiceMix);

      source.playbackRate.setValueAtTime(Math.pow(2, detune / 1200), context.currentTime);
      source.start(0);

      units.push({
        source,
        gain,
        preDrive,
        postDrive,
        lowPass,
        highPass,
        lpMix,
        hpMix,
        unitOut,
        panner,
        detuneCents: detune,
      });
    }

    let noiseSource: AudioBufferSourceNode | null = null;
    let noiseGain: GainNode | null = null;

    if (settings.noiseLevel > 0) {
      noiseSource = context.createBufferSource();
      noiseSource.buffer = this.createNoiseBuffer(settings.noiseColor, 2.5);
      noiseSource.loop = true;

      noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime((settings.noiseLevel / 100) * 0.35, context.currentTime);

      noiseSource.connect(noiseGain);
      noiseGain.connect(voiceMix);
      noiseSource.start(0);
    }

    const now = context.currentTime;
    const delay = settings.keyDelay / 1000;
    const attack = settings.keyAttack / 1000 + driftAttack;
    const hold = settings.keyHold / 1000;
    const decay = decayMs / 1000;
    const sustain = (settings.keySustain / 100) * 0.85;

    noteGain.gain.cancelScheduledValues(now);
    noteGain.gain.setValueAtTime(0, now);

    if (settings.keyLoopEnvelope) {
      const cycle = Math.max(0.05, 1 / settings.keyLoopRate);
      const points = 64;
      const curve = new Float32Array(points);
      for (let i = 0; i < points; i++) {
        const t = (i / (points - 1)) * cycle;
        const env = this.getLoopingEnvelopeValue(t, settings, decayMs);
        curve[i] = env * 0.85;
      }
      noteGain.gain.setValueCurveAtTime(curve, now, cycle);
      noteGain.gain.setValueCurveAtTime(curve, now + cycle, cycle);
      noteGain.gain.setValueCurveAtTime(curve, now + cycle * 2, cycle);
      noteGain.gain.setValueCurveAtTime(curve, now + cycle * 3, cycle);
    } else {
      noteGain.gain.setValueAtTime(0, now);
      noteGain.gain.setValueAtTime(0, now + delay);
      noteGain.gain.linearRampToValueAtTime(0.85, now + delay + attack + 0.0001);
      noteGain.gain.setValueAtTime(0.85, now + delay + attack + hold);
      noteGain.gain.linearRampToValueAtTime(sustain, now + delay + attack + hold + decay);
    }

    ringOsc.start(0);
    chorusLfo.start(0);
    gaterLfo.start(0);
    gaterLfoOffset.start(0);
    selfOsc.start(0);

    const voice: ActiveVoice = {
      midiNumber,
      baseFreq: targetFreq,
      units,
      noteGain,
      voiceMix,
      ringOsc,
      ringAmount,
      ringVca,
      ringDry,
      ringMixOut,
      chorusDelay,
      chorusDry,
      chorusWet,
      chorusLfo,
      chorusLfoGain,
      gaterNode,
      gaterLfo,
      gaterLfoScale,
      gaterLfoOffset,
      selfOsc,
      selfOscGain,
      noiseSource,
      noiseGain,
      randomSeed,
      startedAt: now,
      modulationTimer: null,
      baseDecayMs: decayMs,
    };

    voice.modulationTimer = window.setInterval(() => {
      const s = this.lastSettings;
      if (!s) return;
      this.applyModMatrix(voice, s);
    }, 30);

    return voice;
  }

  public startNote(midiNumber: number, targetFreq: number, settings: SynthSettings): void {
    this.init(settings.masterGain);
    this.lastSettings = settings;

    if (this.activeVoices.has(midiNumber)) {
      this.stopNote(midiNumber, settings);
    }

    const voice = this.buildVoiceGraph(midiNumber, targetFreq, settings);
    this.activeVoices.set(midiNumber, voice);
    this.updateGaterForVoice(voice, settings);
    this.applyModMatrix(voice, settings);
  }

  private updateGaterForVoice(voice: ActiveVoice, settings: SynthSettings) {
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;

    voice.gaterLfo.disconnect();
    voice.gaterLfoScale.disconnect();
    voice.gaterLfoOffset.disconnect();
    voice.gaterNode.gain.cancelScheduledValues(now);

    if (!settings.gaterEnabled) {
      voice.gaterNode.gain.setTargetAtTime(1, now, 0.01);
      return;
    }

    voice.gaterLfo.type = settings.gaterWaveform;
    voice.gaterLfo.frequency.setTargetAtTime(settings.gaterRate, now, 0.02);

    const depth = clamp(settings.gaterDepth / 100, 0, 1);
    const amp = 0.5 * depth;
    const offset = 1 - amp;

    voice.gaterLfoScale.gain.setValueAtTime(amp, now);
    voice.gaterLfoOffset.offset.setValueAtTime(offset, now);
    voice.gaterNode.gain.setValueAtTime(offset, now);

    // gain = offset + (LFO * amp), com LFO em [-1..1] => ganho final em [0..1]
    voice.gaterLfo.connect(voice.gaterLfoScale);
    voice.gaterLfoScale.connect(voice.gaterNode.gain);
    voice.gaterLfoOffset.connect(voice.gaterNode.gain);
  }

  public updateActiveVoices(settings: SynthSettings): void {
    if (!this.audioCtx) return;
    this.lastSettings = settings;

    const now = this.audioCtx.currentTime;
    if (this.masterGainNode) {
      this.masterGainNode.gain.setTargetAtTime(settings.masterGain / 100, now, 0.015);
    }

    this.activeVoices.forEach((voice) => {
      voice.chorusDry.gain.setTargetAtTime(1 - settings.chorusMix / 100, now, 0.02);
      voice.chorusWet.gain.setTargetAtTime(settings.chorusMix / 100, now, 0.02);
      voice.chorusLfo.frequency.setTargetAtTime(settings.chorusRate, now, 0.02);
      voice.chorusLfoGain.gain.setTargetAtTime((settings.chorusDepth / 100) * 0.008, now, 0.02);
      this.updateGaterForVoice(voice, settings);

      if (voice.noiseGain) {
        voice.noiseGain.gain.setTargetAtTime((settings.noiseLevel / 100) * 0.35, now, 0.02);
      }

      this.applyModMatrix(voice, settings);
    });
  }

  public stopNote(midiNumber: number, settings: SynthSettings): void {
    const voice = this.activeVoices.get(midiNumber);
    if (!voice || !this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    const release = settings.keyRelease / 1000;

    voice.noteGain.gain.cancelScheduledValues(now);
    voice.noteGain.gain.setValueAtTime(voice.noteGain.gain.value, now);
    voice.noteGain.gain.linearRampToValueAtTime(0, now + release + 0.003);

    window.setTimeout(() => {
      try {
        voice.units.forEach((u) => {
          u.source.stop();
          u.source.disconnect();
        });
        voice.ringOsc.stop();
        voice.chorusLfo.stop();
        voice.gaterLfo.stop();
        voice.gaterLfoOffset.stop();
        voice.selfOsc.stop();
        voice.ringOsc.disconnect();
        voice.chorusLfo.disconnect();
        voice.gaterLfo.disconnect();
        voice.gaterLfoScale.disconnect();
        voice.gaterLfoOffset.disconnect();
        voice.gaterNode.disconnect();
        voice.selfOsc.disconnect();

        if (voice.noiseSource) {
          voice.noiseSource.stop();
          voice.noiseSource.disconnect();
        }

        voice.noteGain.disconnect();
        voice.voiceMix.disconnect();
      } catch {
        // Voice already stopped
      }
    }, settings.keyRelease + 80);

    if (voice.modulationTimer) {
      window.clearInterval(voice.modulationTimer);
    }

    this.activeVoices.delete(midiNumber);
  }

  public stopAllNotes(settings: SynthSettings): void {
    Array.from(this.activeVoices.keys()).forEach((midi) => {
      this.stopNote(midi, settings);
    });
  }

  public async exportNote(targetFreq: number, settings: SynthSettings): Promise<Blob> {
    const context = this.init();
    const sampleRate = context.sampleRate;
    const durationSec = 2.5;
    const frameCount = sampleRate * durationSec;
    const offlineCtx = new OfflineAudioContext(2, frameCount, sampleRate);

    let baseBuf = this.sampleBuffer;
    if (!baseBuf) {
      baseBuf = offlineCtx.createBuffer(1, Math.floor(sampleRate * 0.15), sampleRate);
      const ch = baseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        ch[i] = Math.sin(2 * Math.PI * 220 * (i / sampleRate)) * Math.exp(-25 * (i / sampleRate));
      }
    }

    const totalCents = (settings.pitchCoarse * 100) + settings.pitchFine;
    const tunedFreq = targetFreq * Math.pow(2, totalCents / 1200);
    const noteBuffer = this.createNoteBuffer(baseBuf, tunedFreq, settings);

    const src = offlineCtx.createBufferSource();
    src.buffer = noteBuffer;
    src.loop = true;

    const gain = offlineCtx.createGain();
    const pre = offlineCtx.createWaveShaper();
    pre.curve = this.makeDistortionCurve(settings.preFilterDrive);
    pre.oversample = '4x';

    const lp = offlineCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(settings.filterCutoff, 0);
    lp.Q.setValueAtTime(settings.filterResonance, 0);

    const hp = offlineCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(settings.filterCutoff * 0.45, 0);
    hp.Q.setValueAtTime(settings.filterResonance * 0.8, 0);

    const post = offlineCtx.createWaveShaper();
    post.curve = this.makeDistortionCurve(settings.postFilterDrive);
    post.oversample = '4x';

    const chorusDelay = offlineCtx.createDelay(0.08);
    chorusDelay.delayTime.setValueAtTime(0.018, 0);
    const dry = offlineCtx.createGain();
    const wet = offlineCtx.createGain();
    dry.gain.setValueAtTime(1 - settings.chorusMix / 100, 0);
    wet.gain.setValueAtTime(settings.chorusMix / 100, 0);

    const lfo = offlineCtx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.setValueAtTime(settings.chorusRate, 0);
    const lfoDepth = offlineCtx.createGain();
    lfoDepth.gain.setValueAtTime((settings.chorusDepth / 100) * 0.008, 0);
    lfo.connect(lfoDepth);
    lfoDepth.connect(chorusDelay.delayTime);

    const ringCarrier = offlineCtx.createOscillator();
    ringCarrier.type = 'sine';
    ringCarrier.frequency.setValueAtTime(settings.ringModFreq, 0);
    const ringAmt = offlineCtx.createGain();
    ringAmt.gain.setValueAtTime(settings.ringModAmount / 100, 0);
    const ringVca = offlineCtx.createGain();
    const ringDry = offlineCtx.createGain();
    ringDry.gain.setValueAtTime(1 - settings.ringModAmount / 100, 0);

    ringCarrier.connect(ringAmt);
    ringAmt.connect(ringVca.gain);

    const master = offlineCtx.createGain();
    master.gain.setValueAtTime(settings.masterGain / 100, 0);

    src.connect(pre);
    if (settings.filterRouting === 'series') {
      pre.connect(lp);
      lp.connect(hp);
      hp.connect(post);
    } else {
      const lpMix = offlineCtx.createGain();
      const hpMix = offlineCtx.createGain();
      const b = settings.filterParallelBlend / 100;
      lpMix.gain.setValueAtTime(1 - b, 0);
      hpMix.gain.setValueAtTime(b, 0);
      pre.connect(lp);
      pre.connect(hp);
      lp.connect(lpMix);
      hp.connect(hpMix);
      lpMix.connect(post);
      hpMix.connect(post);
    }

    post.connect(ringDry);
    post.connect(ringVca);
    ringDry.connect(chorusDelay);
    ringVca.connect(chorusDelay);

    chorusDelay.connect(dry);
    chorusDelay.connect(wet);
    dry.connect(gain);
    wet.connect(gain);

    const d = settings.keyDelay / 1000;
    const a = settings.keyAttack / 1000;
    const h = settings.keyHold / 1000;
    const dec = settings.keyDecay / 1000;
    const sus = (settings.keySustain / 100) * 0.85;
    const rel = settings.keyRelease / 1000;

    gain.gain.setValueAtTime(0, 0);
    gain.gain.setValueAtTime(0, d);
    gain.gain.linearRampToValueAtTime(0.85, d + a + 0.001);
    gain.gain.setValueAtTime(0.85, d + a + h);
    gain.gain.linearRampToValueAtTime(sus, d + a + h + dec);
    gain.gain.setValueAtTime(sus, durationSec - rel - 0.05);
    gain.gain.linearRampToValueAtTime(0, durationSec);

    gain.connect(master);
    master.connect(offlineCtx.destination);

    src.start(0);
    src.stop(durationSec);
    lfo.start(0);
    lfo.stop(durationSec);
    ringCarrier.start(0);
    ringCarrier.stop(durationSec);

    const renderedBuffer = await offlineCtx.startRendering();
    return this.bufferToWav(renderedBuffer);
  }

  private bufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const lclSampleRate = buffer.sampleRate;
    const bitDepth = 16;

    let result: Float32Array;
    if (numOfChan === 2) {
      result = this.interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
      result = buffer.getChannelData(0);
    }

    const bufferLen = result.length * 2;
    const arrayBuffer = new ArrayBuffer(44 + bufferLen);
    const view = new DataView(arrayBuffer);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + bufferLen, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numOfChan, true);
    view.setUint32(24, lclSampleRate, true);
    view.setUint32(28, lclSampleRate * numOfChan * (bitDepth / 8), true);
    view.setUint16(32, numOfChan * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, bufferLen, true);

    this.floatTo16BitPCM(view, 44, result);

    return new Blob([view], { type: 'audio/wav' });
  }

  private interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;

    while (index < length) {
      result[index++] = inputL[inputIndex];
      result[index++] = inputR[inputIndex];
      inputIndex++;
    }
    return result;
  }

  private floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }

  private writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  private generateWaveformData() {
    if (!this.sampleBuffer || !this.onWaveformUpdate) return;

    const data = this.sampleBuffer.getChannelData(0);
    const step = Math.ceil(data.length / 300);
    const waveform: number[] = [];

    for (let i = 0; i < 300; i++) {
      let max = -1;
      for (let j = 0; j < step; j++) {
        const val = data[(i * step) + j];
        if (val > max) max = val;
      }
      waveform.push(max);
    }

    this.onWaveformUpdate(waveform);
  }
}
