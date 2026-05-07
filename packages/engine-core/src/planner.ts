import { extractVowelFromLyric } from './hangul.js';
import { normalizeTractState, tractToFormants } from './tract.js';
import type { EngineNote, VowelFrame, VowelOnlyRenderRequest, VowelPlan } from './types.js';

const MIN_SAMPLE_RATE = 8000;
const MAX_SAMPLE_RATE = 192000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeSampleRate(sampleRate: unknown): number {
  return Math.round(clamp(finiteOr(sampleRate, 44100), MIN_SAMPLE_RATE, MAX_SAMPLE_RATE));
}

export function midiToneToHz(tone: number): number {
  return 440 * Math.pow(2, (tone - 69) / 12);
}

export function notePitchHz(note: EngineNote): number {
  if (typeof note.pitchHz === 'number' && Number.isFinite(note.pitchHz) && note.pitchHz > 0) {
    return clamp(note.pitchHz, 20, 20000);
  }
  return midiToneToHz(clamp(finiteOr(note.tone, 60), 0, 127));
}

export function planVowelOnly(request: VowelOnlyRenderRequest): VowelPlan {
  if (!request || !Array.isArray(request.notes) || request.notes.length === 0) {
    throw new Error('request.notes must contain at least one note');
  }

  const sampleRate = normalizeSampleRate(request.sampleRate);
  const tract = normalizeTractState(request.tract);
  const vowelTargetAmount = request.renderer?.vowelTargetAmount;
  const frames: VowelFrame[] = [];
  let cursor = 0;

  request.notes.forEach((note, index) => {
    const durationMs = finiteOr(note.durationMs, 0);
    if (durationMs <= 0) {
      throw new Error(`note ${note.id ?? index} has invalid durationMs`);
    }

    const durationSamples = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
    const vowel = extractVowelFromLyric(note.lyric);
    const formants = tractToFormants(tract, vowel, vowelTargetAmount);

    frames.push({
      noteId: note.id ?? `note-${index + 1}`,
      lyric: note.lyric,
      vowel,
      startSample: cursor,
      endSample: cursor + durationSamples,
      durationSamples,
      pitchHz: notePitchHz(note),
      velocity: clamp(finiteOr(note.velocity, 1), 0, 2),
      gain: tract.gain,
      formants,
    });

    cursor += durationSamples;
  });

  return {
    sampleRate,
    frames,
    totalSamples: cursor,
    tract,
  };
}
