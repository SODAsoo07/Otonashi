import type { Waveform } from '../../engine-core/src/index.js';

export interface Prng {
  nextFloat(): number;
}

export function createPrng(seed = 1): Prng {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;

  return {
    nextFloat(): number {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) / 0xffffffff) * 2 - 1;
    },
  };
}

export function renderOscillatorSample(waveform: Waveform, phase: number, prng: Prng): number {
  switch (waveform) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2);
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'noise':
      return prng.nextFloat();
    case 'sawtooth':
    default:
      return phase * 2 - 1;
  }
}

export function advancePhase(phase: number, frequencyHz: number, sampleRate: number): number {
  const next = phase + frequencyHz / sampleRate;
  return next - Math.floor(next);
}
