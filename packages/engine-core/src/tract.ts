import type { Formants, TractState } from './types.js';

export const DEFAULT_TRACT_STATE: TractState = {
  x: 0.5,
  y: 0.4,
  lips: 0.7,
  lipLen: 0.5,
  throat: 0.5,
  nasal: 0.2,
  gender: 1.0,
  gain: 0.25,
};

const vowelTargets: Record<string, { f1: number; f2: number }> = {
  'ㅏ': { f1: 860, f2: 1300 },
  'ㅐ': { f1: 690, f2: 1720 },
  'ㅓ': { f1: 540, f2: 1180 },
  'ㅔ': { f1: 470, f2: 1950 },
  'ㅗ': { f1: 470, f2: 860 },
  'ㅜ': { f1: 330, f2: 760 },
  'ㅡ': { f1: 350, f2: 1220 },
  'ㅣ': { f1: 300, f2: 2250 },
  'ㅚ': { f1: 430, f2: 1680 },
  'ㅟ': { f1: 300, f2: 1820 },
};

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTractState(input: Partial<TractState> | undefined): TractState {
  const raw = { ...DEFAULT_TRACT_STATE, ...(input ?? {}) };
  return {
    x: clamp(finiteOr(raw.x, DEFAULT_TRACT_STATE.x), 0, 1),
    y: clamp(finiteOr(raw.y, DEFAULT_TRACT_STATE.y), 0, 1),
    lips: clamp(finiteOr(raw.lips, DEFAULT_TRACT_STATE.lips), 0, 1),
    lipLen: clamp(finiteOr(raw.lipLen, DEFAULT_TRACT_STATE.lipLen), 0, 1),
    throat: clamp(finiteOr(raw.throat, DEFAULT_TRACT_STATE.throat), 0, 1),
    nasal: clamp(finiteOr(raw.nasal, DEFAULT_TRACT_STATE.nasal), 0, 1),
    gender: clamp(finiteOr(raw.gender, DEFAULT_TRACT_STATE.gender), 0.5, 1.5),
    gain: clamp(finiteOr(raw.gain, DEFAULT_TRACT_STATE.gain), 0, 1),
  };
}

export function getVowelTargetFormants(vowel: string): { f1: number; f2: number } {
  return vowelTargets[vowel] ?? vowelTargets['ㅏ'];
}

export function tractToFormants(
  tract: TractState,
  vowel: string,
  vowelTargetAmount = 0.2,
): Formants {
  const targetAmount = clamp(finiteOr(vowelTargetAmount, 0.2), 0, 1);
  const lengthFactor = 1.0 - tract.lipLen * 0.3;
  const lipFactor = 0.5 + tract.lips * 0.5;

  const tractF1 = Math.max(50, 200 + (1 - tract.y) * 600 - tract.throat * 50) * lengthFactor * lipFactor * tract.gender;
  const tractF2 = (800 + tract.x * 1400) * lengthFactor * lipFactor * tract.gender;
  const tractF3 = (2000 + tract.lips * 1500) * lengthFactor * tract.gender;

  const target = getVowelTargetFormants(vowel);
  return {
    f1: tractF1 * (1 - targetAmount) + target.f1 * targetAmount,
    f2: tractF2 * (1 - targetAmount) + target.f2 * targetAmount,
    f3: tractF3,
  };
}
