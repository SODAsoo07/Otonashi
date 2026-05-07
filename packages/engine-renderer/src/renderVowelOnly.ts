import { planVowelOnly } from '../../engine-core/src/index.js';
import type { RendererSettings, Waveform } from '../../engine-core/src/index.js';
import { BiquadFilter, createBiquadCoefficients } from './biquad.js';
import { envelopeAt } from './envelope.js';
import { advancePhase, createPrng, renderOscillatorSample } from './oscillator.js';
import type { NormalizedRenderSettings, PcmBuffer, RenderableRequest, VowelOnlyRenderResult } from './types.js';
import { encodeWav16 } from './wav.js';

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeWaveform(waveform: unknown): Waveform {
  if (waveform === 'sine' || waveform === 'sawtooth' || waveform === 'square' || waveform === 'noise') {
    return waveform;
  }
  return 'sawtooth';
}

export function normalizeRenderSettings(input: RendererSettings | undefined): NormalizedRenderSettings {
  return {
    waveform: normalizeWaveform(input?.waveform),
    attackMs: clamp(finiteOr(input?.attackMs, 8), 0, 200),
    releaseMs: clamp(finiteOr(input?.releaseMs, 35), 0, 500),
    formantAmount: clamp(finiteOr(input?.formantAmount, 1), 0, 2),
  };
}

function measurePeak(buffer: Float32Array): number {
  let peak = 0;
  for (const sample of buffer) {
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
  }
  return peak;
}

function measureRms(buffer: Float32Array): number {
  let sum = 0;
  for (const sample of buffer) sum += sample * sample;
  return Math.sqrt(sum / Math.max(1, buffer.length));
}

function applyPeakLimiter(buffer: Float32Array, ceiling = 0.98): number {
  const peak = measurePeak(buffer);
  if (peak <= 0 || peak <= ceiling) return 0;
  const gain = ceiling / peak;
  for (let i = 0; i < buffer.length; i += 1) buffer[i] *= gain;
  return 20 * Math.log10(gain);
}

export function renderVowelOnly(request: RenderableRequest): VowelOnlyRenderResult {
  const plan = planVowelOnly(request);
  const settings = normalizeRenderSettings(request.renderer);
  const output = new Float32Array(plan.totalSamples);
  const prng = createPrng(request.seed ?? 1);
  let phase = 0;

  const attackSamples = Math.round((settings.attackMs / 1000) * plan.sampleRate);
  const releaseSamples = Math.round((settings.releaseMs / 1000) * plan.sampleRate);
  const formantAmount = settings.formantAmount;

  for (const frame of plan.frames) {
    const f1 = new BiquadFilter(createBiquadCoefficients('peaking', frame.formants.f1, 4, plan.sampleRate, 12 * formantAmount));
    const f2 = new BiquadFilter(createBiquadCoefficients('peaking', frame.formants.f2, 4, plan.sampleRate, 12 * formantAmount));
    const f3 = new BiquadFilter(createBiquadCoefficients('peaking', frame.formants.f3, 4, plan.sampleRate, 10 * formantAmount));
    const preGain = 0.35 * frame.gain * frame.velocity;

    for (let i = 0; i < frame.durationSamples; i += 1) {
      const outIndex = frame.startSample + i;
      const env = envelopeAt(i, frame.durationSamples, attackSamples, releaseSamples);
      let sample = renderOscillatorSample(settings.waveform, phase, prng) * preGain * env;
      phase = advancePhase(phase, frame.pitchHz, plan.sampleRate);

      sample = f1.process(sample);
      sample = f2.process(sample);
      sample = f3.process(sample);

      output[outIndex] += sample;
    }
  }

  const limiterGainDb = applyPeakLimiter(output);
  const peak = measurePeak(output);
  const rms = measureRms(output);
  const pcm: PcmBuffer = {
    sampleRate: plan.sampleRate,
    channels: [output],
  };

  return {
    pcm,
    frames: plan.frames,
    diagnostics: {
      frameCount: plan.frames.length,
      totalSamples: plan.totalSamples,
      durationSec: plan.totalSamples / plan.sampleRate,
      peak,
      rms,
      limiterGainDb,
    },
  };
}

export function renderVowelOnlyToWav(request: RenderableRequest): { wav: Uint8Array; result: VowelOnlyRenderResult } {
  const result = renderVowelOnly(request);
  return {
    wav: encodeWav16(result.pcm),
    result,
  };
}
