import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractVowelFromLyric, planVowelOnly, type VowelOnlyRenderRequest } from '../packages/engine-core/src/index.js';
import { renderVowelOnlyToWav } from '../packages/engine-renderer/src/index.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function assertAlmostEqual(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

const request: VowelOnlyRenderRequest = {
  schemaVersion: 'vowel-only-0.1',
  sampleRate: 44100,
  seed: 1234,
  notes: [
    { id: 'ga', lyric: '가', tone: 60, durationMs: 500 },
    { id: 'gi', lyric: '기', tone: 64, durationMs: 500 },
    { id: 'go', lyric: '고', tone: 67, durationMs: 500 },
    { id: 'gu', lyric: '구', tone: 72, durationMs: 500 },
  ],
  tract: {
    x: 0.52,
    y: 0.42,
    lips: 0.68,
    lipLen: 0.45,
    throat: 0.48,
    nasal: 0.2,
    gender: 1.0,
    gain: 0.25,
  },
  renderer: {
    waveform: 'sawtooth',
    attackMs: 8,
    releaseMs: 35,
    formantAmount: 1.0,
    vowelTargetAmount: 0.2,
  },
};

const plan = planVowelOnly(request);
assert(plan.frames.length === 4, 'planner should create four frames');
assert(extractVowelFromLyric('가') === 'ㅏ', '가 should map to ㅏ');
assert(extractVowelFromLyric('기') === 'ㅣ', '기 should map to ㅣ');
assert(extractVowelFromLyric('과') === 'ㅏ', '과 should use vowel-only approximation ㅏ');
assertAlmostEqual(plan.totalSamples / plan.sampleRate, 2.0, 1 / plan.sampleRate, 'duration should match input notes');

const first = renderVowelOnlyToWav(request);
const second = renderVowelOnlyToWav(request);

assert(first.wav.byteLength === second.wav.byteLength, 'deterministic render should keep WAV length');
for (let i = 0; i < first.wav.byteLength; i += Math.max(1, Math.floor(first.wav.byteLength / 128))) {
  assert(first.wav[i] === second.wav[i], 'deterministic render bytes should match on sampled positions');
}

assert(readAscii(first.wav, 0, 4) === 'RIFF', 'WAV should start with RIFF');
assert(readAscii(first.wav, 8, 4) === 'WAVE', 'WAV should contain WAVE marker');
assert(first.result.diagnostics.peak > 0.005, 'render should not be silent');
assert(first.result.diagnostics.peak <= 0.981, 'render peak should stay limited');
assert(first.result.diagnostics.rms > 0.0005, 'render RMS should be audible');
assert(Number.isFinite(first.result.diagnostics.rms), 'render RMS should be finite');

const outputPath = resolve('out', 'vowel-smoke.wav');
await mkdir('out', { recursive: true });
await writeFile(outputPath, first.wav);

console.log(JSON.stringify({
  ok: true,
  output: outputPath,
  frames: first.result.diagnostics.frameCount,
  durationSec: Number(first.result.diagnostics.durationSec.toFixed(4)),
  peak: Number(first.result.diagnostics.peak.toFixed(6)),
  rms: Number(first.result.diagnostics.rms.toFixed(6)),
}, null, 2));
