import { SynthSettings } from '../types';

export class SynthEngine {
  private audioCtx: AudioContext | null = null;
  private sampleBuffer: AudioBuffer | null = null;
  private activeVoices: Map<number, { source: AudioBufferSourceNode; gainNode: GainNode; filterChain: BiquadFilterNode[]; distortionNode: WaveShaperNode }> = new Map();
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private onWaveformUpdate: ((data: number[]) => void) | null = null;
  private masterGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  constructor() {
    // Inicialização preguiçosa para evitar problemas de Autoplay no navegador
  }

  private makeDistortionCurve(amount: number): Float32Array {
    const k = amount;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      // Formula de saturação suave / hard clipping moldável
      curve[i] = ((3 + k) * x) / (3 + k * Math.abs(x));
    }
    return curve;
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

  // 1. Gravação por Microfone
  public async startRecording(): Promise<void> {
    this.init();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.recordedChunks = [];
    
    // Usar formato padrão suportado
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
        reject(new Error('Gravação não iniciada'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(this.recordedChunks, { type: 'audio/wav' });
          const arrayBuffer = await blob.arrayBuffer();
          const context = this.init();
          const decodedBuffer = await context.decodeAudioData(arrayBuffer);
          
          // Recortar silêncio inicial e final se possível, ou salvar direto
          const trimmedBuffer = this.autoTrimSilence(decodedBuffer);
          this.setSampleBuffer(trimmedBuffer);
          
          // Desligar tracks do microfone
          this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
          resolve(trimmedBuffer);
        } catch (err) {
          reject(err);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  // 2. Decodificação de Upload de Arquivo
  public async loadFile(file: File): Promise<AudioBuffer> {
    const context = this.init();
    const arrayBuffer = await file.arrayBuffer();
    const decodedBuffer = await context.decodeAudioData(arrayBuffer);
    const trimmedBuffer = this.autoTrimSilence(decodedBuffer);
    this.setSampleBuffer(trimmedBuffer);
    return trimmedBuffer;
  }

  // 3. Geração de Bip Sintético
  public async generateBip(type: OscillatorType, durationMs: number): Promise<AudioBuffer> {
    const context = this.init();
    const sampleRate = context.sampleRate;
    const durationSec = durationMs / 1000;
    const frameCount = sampleRate * durationSec;
    
    // Criar OfflineAudioContext para renderizar o bip em super velocidade
    const offlineCtx = new OfflineAudioContext(1, frameCount, sampleRate);
    
    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(220, 0); // Frequência do bip inicial
    
    // Envelope para o bip não ter cliques nas pontas
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

  // 4. Trim Automático de Silêncio (Noise Gate básico)
  private autoTrimSilence(buffer: AudioBuffer): AudioBuffer {
    const threshold = 0.015; // limite de amplitude para silêncio
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    
    // Analisar canal 0
    const data = buffer.getChannelData(0);
    let startIndex = 0;
    let endIndex = data.length - 1;
    
    // Procurar início
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > threshold) {
        startIndex = Math.max(0, i - Math.floor(sampleRate * 0.01)); // incluir 10ms antes para não cortar o transiente
        break;
      }
    }
    
    // Procurar fim
    for (let i = data.length - 1; i >= 0; i--) {
      if (Math.abs(data[i]) > threshold) {
        endIndex = Math.min(data.length - 1, i + Math.floor(sampleRate * 0.02)); // incluir 20ms depois para fade suave
        break;
      }
    }
    
    if (startIndex >= endIndex) {
      return buffer; // Se for tudo silêncio, retorna original
    }
    
    const duration = (endIndex - startIndex) / sampleRate;
    if (duration < 0.02) {
      return buffer; // Muito curto
    }
    
    // Criar novo buffer menor
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

  // 5. Tocar uma prévia rápida da amostra crua
  public playPreview(settings: SynthSettings): void {
    if (!this.sampleBuffer) return;
    
    const context = this.init(settings.masterGain);
    const source = context.createBufferSource();
    
    // Criar cópia com os efeitos aplicados (EQ + Reverse + Trim)
    const processed = this.processBuffer(this.sampleBuffer, settings);
    source.buffer = processed;
    
    // Volume e Envelope de preview simples
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.8, context.currentTime + (settings.attack / 1000) + 0.005);
    gain.gain.setValueAtTime(0.8, context.currentTime + processed.duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, context.currentTime + processed.duration);
    
    source.connect(gain);
    gain.connect(this.masterGainNode || context.destination);
    
    source.start(0);
  }

  // 6. Processar o buffer base (Reverse + Trim + Volume)
  private processBuffer(baseBuffer: AudioBuffer, settings: SynthSettings): AudioBuffer {
    const context = this.init();
    const channels = baseBuffer.numberOfChannels;
    const sampleRate = baseBuffer.sampleRate;
    
    // Aplicar Trim (tamanho do corte em %)
    const trimPercent = settings.trim / 100;
    const totalFrames = Math.floor(baseBuffer.length * trimPercent);
    const length = Math.max(100, totalFrames);
    
    const processed = context.createBuffer(channels, length, sampleRate);
    
    for (let c = 0; c < channels; c++) {
      const srcData = baseBuffer.getChannelData(c);
      const dstData = processed.getChannelData(c);
      
      // Copiar dados
      if (settings.reverse) {
        for (let i = 0; i < length; i++) {
          dstData[i] = srcData[length - 1 - i];
        }
      } else {
        for (let i = 0; i < length; i++) {
          dstData[i] = srcData[i];
        }
      }
      
      // Aplicar Attack simples na amostra
      const attackFrames = Math.floor((settings.attack / 1000) * sampleRate);
      if (attackFrames > 0 && attackFrames < length) {
        for (let i = 0; i < attackFrames; i++) {
          dstData[i] *= (i / attackFrames);
        }
      }
    }
    
    return processed;
  }

  // 7. O CORAÇÃO DO TIMBR3: Criar o loop na frequência alvo
  // Repete a amostra a uma taxa igual à frequência em Hz
  private createNoteBuffer(baseBuffer: AudioBuffer, targetFreq: number, settings: SynthSettings): AudioBuffer {
    const context = this.init();
    const channels = baseBuffer.numberOfChannels;
    const sampleRate = baseBuffer.sampleRate;
    
    // O período T em segundos da nota desejada
    const periodSec = 1 / targetFreq;
    const periodFrames = Math.floor(periodSec * sampleRate);
    
    if (periodFrames <= 0) return baseBuffer;
    
    // Criamos um buffer contendo exatamente 1 período do som
    const periodBuffer = context.createBuffer(channels, periodFrames, sampleRate);
    
    // Primeiro aplicamos os efeitos básicos de trim/reverse na amostra-mãe
    const processedBase = this.processBuffer(baseBuffer, settings);
    
    // 1. Procurar o pico absoluto na amostra processada para extrair o ciclo mais energético e audível
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
    
    // Copiar a partir do pico
    const startOffset = peakIndex;
    
    for (let c = 0; c < channels; c++) {
      const srcData = processedBase.getChannelData(c % processedBase.numberOfChannels);
      const dstData = periodBuffer.getChannelData(c);
      
      // Copiar a partir de startOffset
      for (let i = 0; i < periodFrames; i++) {
        const srcIndex = startOffset + i;
        if (srcIndex < srcData.length) {
          dstData[i] = srcData[srcIndex];
        } else {
          // Se passar do fim, faz wrap around para garantir preenchimento e manter energia
          dstData[i] = srcData[srcIndex % srcData.length];
        }
      }
      
      // 2. Normalizar o pico do ciclo extraído para garantir notas 100% uniformes em volume
      let periodPeak = 0;
      for (let i = 0; i < periodFrames; i++) {
        const absVal = Math.abs(dstData[i]);
        if (absVal > periodPeak) {
          periodPeak = absVal;
        }
      }
      
      if (periodPeak > 0.0001) {
        const scale = 0.85 / periodPeak;
        for (let i = 0; i < periodFrames; i++) {
          dstData[i] *= scale;
        }
      }
      
      // AUTOFADE: Se ativado, aplica um fade-in e fade-out minúsculo nas extremidades do período
      // Isso impede "clicks" e estalos de transição de fase quando o loop se repete!
      if (settings.autoFade) {
        // Fade de 8% do tamanho do período, com máximo de 1.5ms
        const fadeLen = Math.min(Math.floor(periodFrames * 0.08), Math.floor(0.0015 * sampleRate));
        if (fadeLen > 0) {
          for (let i = 0; i < fadeLen; i++) {
            const factor = i / fadeLen;
            dstData[i] *= factor; // fade-in
            dstData[periodFrames - 1 - i] *= factor; // fade-out
          }
        }
      }

      // BITCRUSHER: Se ativado, reduz a resolução de bits e a taxa de amostragem (downsampling)
      if (settings.bitcrusher > 0) {
        const bits = Math.max(1.5, 16 - (settings.bitcrusher / 100) * 14.5);
        const step = Math.pow(2, bits - 1);
        const factor = Math.floor(1 + (settings.bitcrusher / 100) * 23);
        
        let lastVal = 0;
        for (let i = 0; i < periodFrames; i++) {
          if (i % factor === 0) {
            lastVal = dstData[i];
          } else {
            dstData[i] = lastVal;
          }
          dstData[i] = Math.round(dstData[i] * step) / step;
        }
      }
    }
    
    return periodBuffer;
  }

  // 8. Tocar Nota (Sample Machine) ao vivo
  public startNote(midiNumber: number, targetFreq: number, settings: SynthSettings): void {
    this.init(settings.masterGain);
    const context = this.audioCtx!;
    
    // Se a nota já está ativa, pará-la primeiro
    if (this.activeVoices.has(midiNumber)) {
      this.stopNote(midiNumber, settings);
    }
    
    // Obter buffer base. Se nenhum, cria um bip senoidal padrão
    let baseBuf = this.sampleBuffer;
    if (!baseBuf) {
      // Cria um buffer silencioso com um impulso pequeno (para não crashar)
      // Mas o melhor é avisar ou usar um bip senoidal temporário
      const sr = context.sampleRate;
      baseBuf = context.createBuffer(1, Math.floor(sr * 0.15), sr);
      const ch = baseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        // Onda dente de serra descendente curta
        ch[i] = Math.sin(2 * Math.PI * 220 * (i / sr)) * Math.exp(-25 * (i / sr));
      }
    }
    
    // Criar o buffer de 1 período afinado para esta nota nominalmente
    const noteBuffer = this.createNoteBuffer(baseBuf, targetFreq, settings);
    
    const sourceNode = context.createBufferSource();
    sourceNode.buffer = noteBuffer;
    sourceNode.loop = true; // REPETIR o som infinitamente para sustentar a nota!
    
    // Aplicar pitch coarse + fine-tune inicialmente no playbackRate
    const totalCents = (settings.pitchCoarse * 100) + settings.pitchFine;
    sourceNode.playbackRate.setValueAtTime(Math.pow(2, totalCents / 1200), context.currentTime);
    
    // Envelope de Ganho ADSR (Attack / Decay / Sustain / Release)
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(0, context.currentTime);
    
    const kAttack = settings.keyAttack / 1000;
    const sustainLevel = (settings.keySustain / 100) * 0.85;
    const kDecay = 0.15; // 150ms decay
    gainNode.gain.linearRampToValueAtTime(0.85, context.currentTime + kAttack + 0.001);
    gainNode.gain.linearRampToValueAtTime(sustainLevel, context.currentTime + kAttack + kDecay + 0.002);
    
    // EQ de Moldagem de Timbre (Low, Mid, High) + Bass Boost
    // Criamos biquad filtros dinâmicos para esta voz
    const lowFilter = context.createBiquadFilter();
    lowFilter.type = 'lowshelf';
    lowFilter.frequency.setValueAtTime(200, context.currentTime);
    lowFilter.gain.setValueAtTime(settings.lowGain, context.currentTime);
    
    const midFilter = context.createBiquadFilter();
    midFilter.type = 'peaking';
    midFilter.frequency.setValueAtTime(1000, context.currentTime);
    midFilter.Q.setValueAtTime(1.0, context.currentTime);
    midFilter.gain.setValueAtTime(settings.midGain, context.currentTime);
    
    const highFilter = context.createBiquadFilter();
    highFilter.type = 'highshelf';
    highFilter.frequency.setValueAtTime(4000, context.currentTime);
    highFilter.gain.setValueAtTime(settings.highGain, context.currentTime);
    
    const bassBoostFilter = context.createBiquadFilter();
    bassBoostFilter.type = 'lowshelf';
    bassBoostFilter.frequency.setValueAtTime(100, context.currentTime);
    bassBoostFilter.gain.setValueAtTime(settings.bassBoost, context.currentTime);
    
    // Waveshaper de distorção / drive
    const distortionNode = context.createWaveShaper();
    distortionNode.curve = this.makeDistortionCurve(settings.drive);
    distortionNode.oversample = '4x';
    
    // Encadeamento de efeitos
    sourceNode.connect(lowFilter);
    lowFilter.connect(midFilter);
    midFilter.connect(highFilter);
    highFilter.connect(bassBoostFilter);
    bassBoostFilter.connect(distortionNode);
    distortionNode.connect(gainNode);
    gainNode.connect(this.masterGainNode || context.destination);
    
    // Iniciar
    sourceNode.start(0);
    
    // Salvar voz ativa
    this.activeVoices.set(midiNumber, {
      source: sourceNode,
      gainNode: gainNode,
      filterChain: [lowFilter, midFilter, highFilter, bassBoostFilter],
      distortionNode: distortionNode
    });
  }

  // 8.1 Atualizar parâmetros de vozes ativas em tempo real
  public updateActiveVoices(settings: SynthSettings): void {
    if (!this.audioCtx) return;
    const context = this.audioCtx;
    
    if (this.masterGainNode) {
      this.masterGainNode.gain.setTargetAtTime(settings.masterGain / 100, context.currentTime, 0.015);
    }
    
    this.activeVoices.forEach((voice) => {
      try {
        const [lowFilter, midFilter, highFilter, bassBoostFilter] = voice.filterChain;
        
        // Atualizar filtros em tempo real suavemente usando setTargetAtTime
        lowFilter.gain.setTargetAtTime(settings.lowGain, context.currentTime, 0.015);
        midFilter.gain.setTargetAtTime(settings.midGain, context.currentTime, 0.015);
        highFilter.gain.setTargetAtTime(settings.highGain, context.currentTime, 0.015);
        bassBoostFilter.gain.setTargetAtTime(settings.bassBoost, context.currentTime, 0.015);
        
        // Atualizar distorção se houver mudança
        voice.distortionNode.curve = this.makeDistortionCurve(settings.drive);
        
        // Atualizar pitch coarse + fine-tune em tempo real suavemente
        const totalCents = (settings.pitchCoarse * 100) + settings.pitchFine;
        voice.source.playbackRate.setTargetAtTime(Math.pow(2, totalCents / 1200), context.currentTime, 0.015);
      } catch (e) {
        // Silenciar possíveis erros se a voz já parou
      }
    });
  }

  public stopNote(midiNumber: number, settings: SynthSettings): void {
    const voice = this.activeVoices.get(midiNumber);
    if (!voice) return;
    
    const context = this.audioCtx!;
    const kRelease = settings.keyRelease / 1000;
    
    // Interromper agendamentos anteriores e fazer fade-out
    voice.gainNode.gain.cancelScheduledValues(context.currentTime);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, context.currentTime);
    voice.gainNode.gain.linearRampToValueAtTime(0, context.currentTime + kRelease + 0.002);
    
    // Parar o sourceNode após o release terminar
    const src = voice.source;
    setTimeout(() => {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {
        // Silenciar possíveis erros se já tiver parado
      }
    }, (settings.keyRelease) + 50);
    
    this.activeVoices.delete(midiNumber);
  }

  public stopAllNotes(settings: SynthSettings): void {
    Array.from(this.activeVoices.keys()).forEach(midi => {
      this.stopNote(midi, settings);
    });
  }

  // 9. Exportar Nota Renderizada Offline (MP3 ou WAV)
  // Como estamos no navegador, exportamos como WAV estéreo de alta qualidade direto
  public async exportNote(targetFreq: number, settings: SynthSettings, format: 'wav' | 'mp3' = 'wav'): Promise<Blob> {
    const context = this.init();
    const sampleRate = context.sampleRate;
    const durationSec = 2.0; // Exporta uma nota de 2 segundos sustentada
    const frameCount = sampleRate * durationSec;
    
    // Criar offline context para renderizar a nota rapidamente
    const offlineCtx = new OfflineAudioContext(2, frameCount, sampleRate);
    
    let baseBuf = this.sampleBuffer;
    if (!baseBuf) {
      // Impulso senoidal se vazio
      baseBuf = offlineCtx.createBuffer(1, Math.floor(sampleRate * 0.15), sampleRate);
      const ch = baseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        ch[i] = Math.sin(2 * Math.PI * 220 * (i / sampleRate)) * Math.exp(-25 * (i / sampleRate));
      }
    }
    
    // Aplicar fine-tune + coarse tune
    const totalCents = (settings.pitchCoarse * 100) + settings.pitchFine;
    const fineFreq = targetFreq * Math.pow(2, totalCents / 1200);
    const noteBuffer = this.createNoteBuffer(baseBuf, fineFreq, settings);
    
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = noteBuffer;
    sourceNode.loop = true;
    
    // Envelope para a nota de 2 segundos (ADSR)
    const gainNode = offlineCtx.createGain();
    gainNode.gain.setValueAtTime(0, 0);
    
    const kAttack = settings.keyAttack / 1000;
    const sustainLevel = (settings.keySustain / 100) * 0.85;
    const kDecay = 0.15;
    const kRelease = settings.keyRelease / 1000;
    
    gainNode.gain.linearRampToValueAtTime(0.85, kAttack);
    gainNode.gain.linearRampToValueAtTime(sustainLevel, kAttack + kDecay);
    gainNode.gain.setValueAtTime(sustainLevel, durationSec - kRelease - 0.05);
    gainNode.gain.linearRampToValueAtTime(0, durationSec);
    
    // EQ Filtros
    const lowFilter = offlineCtx.createBiquadFilter();
    lowFilter.type = 'lowshelf';
    lowFilter.frequency.setValueAtTime(200, 0);
    lowFilter.gain.setValueAtTime(settings.lowGain, 0);
    
    const midFilter = offlineCtx.createBiquadFilter();
    midFilter.type = 'peaking';
    midFilter.frequency.setValueAtTime(1000, 0);
    midFilter.gain.setValueAtTime(settings.midGain, 0);
    
    const highFilter = offlineCtx.createBiquadFilter();
    highFilter.type = 'highshelf';
    highFilter.frequency.setValueAtTime(4000, 0);
    highFilter.gain.setValueAtTime(settings.highGain, 0);
    
    const bassBoostFilter = offlineCtx.createBiquadFilter();
    bassBoostFilter.type = 'lowshelf';
    bassBoostFilter.frequency.setValueAtTime(100, 0);
    bassBoostFilter.gain.setValueAtTime(settings.bassBoost, 0);
    
    // Waveshaper de distorção / drive
    const distortionNode = offlineCtx.createWaveShaper();
    distortionNode.curve = this.makeDistortionCurve(settings.drive);
    distortionNode.oversample = '4x';
    
    // Master volume for offline render
    const offlineMasterGain = offlineCtx.createGain();
    offlineMasterGain.gain.setValueAtTime(settings.masterGain / 100, 0);
    
    sourceNode.connect(lowFilter);
    lowFilter.connect(midFilter);
    midFilter.connect(highFilter);
    highFilter.connect(bassBoostFilter);
    bassBoostFilter.connect(distortionNode);
    distortionNode.connect(gainNode);
    gainNode.connect(offlineMasterGain);
    offlineMasterGain.connect(offlineCtx.destination);
    
    sourceNode.start(0);
    sourceNode.stop(durationSec);
    
    const renderedBuffer = await offlineCtx.startRendering();
    
    // Codificar para WAV estéreo
    const wavBlob = this.bufferToWav(renderedBuffer);
    return wavBlob;
  }

  // Utilitário para converter AudioBuffer em WAV Blob real
  private bufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const lclSampleRate = buffer.sampleRate;
    const format = 1; // 1 = raw PCM de 16 bits
    const bitDepth = 16;
    
    let result;
    if (numOfChan === 2) {
      result = this.interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
      result = buffer.getChannelData(0);
    }
    
    const bufferLen = result.length * 2;
    const arrayBuffer = new ArrayBuffer(44 + bufferLen);
    const view = new DataView(arrayBuffer);
    
    /* RIFF identifier */
    this.writeString(view, 0, 'RIFF');
    /* file length */
    view.setUint32(4, 36 + bufferLen, true);
    /* RIFF type */
    this.writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    this.writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, format, true);
    /* channel count */
    view.setUint16(22, numOfChan, true);
    /* sample rate */
    view.setUint32(24, lclSampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, lclSampleRate * numOfChan * (bitDepth / 8), true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, numOfChan * (bitDepth / 8), true);
    /* bits per sample */
    view.setUint16(34, bitDepth, true);
    /* data chunk identifier */
    this.writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, bufferLen, true);
    
    // Escrever dados PCM
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
      let s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }

  private writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // 10. Geração dos dados de Waveform para renderizar no canvas
  private generateWaveformData() {
    if (!this.sampleBuffer || !this.onWaveformUpdate) return;
    
    const data = this.sampleBuffer.getChannelData(0);
    const step = Math.ceil(data.length / 300); // 300 pontos de amostragem visual
    const waveform: number[] = [];
    
    for (let i = 0; i < 300; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const val = data[(i * step) + j];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      waveform.push(max); // Usar pico positivo para simplificar desenho
    }
    
    this.onWaveformUpdate(waveform);
  }
}
