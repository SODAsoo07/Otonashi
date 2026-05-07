import type { PcmBuffer } from './types.js';

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function clampSample(sample: number): number {
  if (!Number.isFinite(sample)) return 0;
  return Math.max(-1, Math.min(1, sample));
}

export function encodeWav16(pcm: PcmBuffer): Uint8Array {
  const channelCount = pcm.channels.length;
  const sampleRate = pcm.sampleRate;
  const samples = pcm.channels[0].length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataBytes = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    for (let ch = 0; ch < channelCount; ch += 1) {
      const value = clampSample(pcm.channels[ch][i]);
      const intValue = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
      view.setInt16(offset, intValue, true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}
