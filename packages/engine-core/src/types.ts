export type Waveform = 'sine' | 'sawtooth' | 'square' | 'noise';

export interface EngineNote {
  id?: string;
  lyric: string;
  tone?: number;
  pitchHz?: number;
  durationMs: number;
  velocity?: number;
}

export interface TractState {
  x: number;
  y: number;
  lips: number;
  lipLen: number;
  throat: number;
  nasal: number;
  gender: number;
  gain: number;
}

export interface RendererSettings {
  waveform?: Waveform;
  attackMs?: number;
  releaseMs?: number;
  formantAmount?: number;
  vowelTargetAmount?: number;
}

export interface VowelOnlyRenderRequest {
  schemaVersion?: string;
  sampleRate?: number;
  seed?: number;
  notes: EngineNote[];
  tract?: Partial<TractState>;
  renderer?: RendererSettings;
}

export interface Formants {
  f1: number;
  f2: number;
  f3: number;
}

export interface VowelFrame {
  noteId: string;
  lyric: string;
  vowel: string;
  startSample: number;
  endSample: number;
  durationSamples: number;
  pitchHz: number;
  velocity: number;
  gain: number;
  formants: Formants;
}

export interface VowelPlan {
  sampleRate: number;
  frames: VowelFrame[];
  totalSamples: number;
  tract: TractState;
}
