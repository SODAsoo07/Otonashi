import type { VowelFrame, VowelOnlyRenderRequest, Waveform } from '../../engine-core/src/index.js';

export interface PcmBuffer {
  sampleRate: number;
  channels: [Float32Array];
}

export interface NormalizedRenderSettings {
  waveform: Waveform;
  attackMs: number;
  releaseMs: number;
  formantAmount: number;
}

export interface RenderDiagnostics {
  frameCount: number;
  totalSamples: number;
  durationSec: number;
  peak: number;
  rms: number;
  limiterGainDb: number;
}

export interface VowelOnlyRenderResult {
  pcm: PcmBuffer;
  frames: VowelFrame[];
  diagnostics: RenderDiagnostics;
}

export type RenderableRequest = VowelOnlyRenderRequest;
