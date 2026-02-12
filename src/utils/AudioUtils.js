/**
 * OTONASHI Audio Utility Functions
 * 오디오 버퍼 조작 및 변환을 위한 유틸리티 모음
 */

export const AudioUtils = {
  // 1. 오디오 버퍼를 JSON 저장이 가능한 일반 배열 객체로 변환
  serializeBuffer: (buffer) => {
    if (!buffer) return null;
    try {
      const channels = [];
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(Array.from(buffer.getChannelData(i)));
      }
      return { 
        sampleRate: buffer.sampleRate, 
        numberOfChannels: buffer.numberOfChannels, 
        channels 
      };
    } catch (e) {
      console.error("Serialization failed:", e);
      return null;
    }
  },

  // 2. 저장된 배열 데이터를 다시 Web Audio API 버퍼 객체로 복원
  deserializeBuffer: async (ctx, data) => {
    if (!ctx || !data || !data.channels) return null;
    try {
      const { sampleRate, numberOfChannels, channels } = data;
      const buffer = ctx.createBuffer(numberOfChannels, channels[0].length, sampleRate);
      for (let i = 0; i < numberOfChannels; i++) {
        buffer.copyToChannel(new Float32Array(channels[i]), i);
      }
      return buffer;
    } catch (e) {
      console.error("Deserialization failed:", e);
      return null;
    }
  },

  // 3. 특정 구간(%)을 잘라서 새로운 버퍼 생성
  createBufferFromSlice: (ctx, buf, startPct, endPct) => {
    if (!ctx || !buf) return null;
    const start = Math.floor(buf.length * (startPct / 100));
    const end = Math.floor(buf.length * (endPct / 100));
    if (end <= start) return null;

    try {
      const newBuf = ctx.createBuffer(buf.numberOfChannels, end - start, buf.sampleRate);
      for (let i = 0; i < buf.numberOfChannels; i++) {
        newBuf.copyToChannel(buf.getChannelData(i).slice(start, end), i);
      }
      return newBuf;
    } catch (e) {
      return null;
    }
  },

  // 4. 특정 구간(%)을 삭제한 나머지 버퍼 반환
  deleteRange: (ctx, buf, startPct, endPct) => {
    if (!ctx || !buf) return null;
    const start = Math.floor(buf.length * (startPct / 100));
    const end = Math.floor(buf.length * (endPct / 100));
    const newLen = buf.length - (end - start);
    
    if (newLen <= 0) return ctx.createBuffer(buf.numberOfChannels, 1, buf.sampleRate);

    try {
      const newBuf = ctx.createBuffer(buf.numberOfChannels, newLen, buf.sampleRate);
      for (let i = 0; i < buf.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        const oldCh = buf.getChannelData(i);
        ch.set(oldCh.slice(0, start), 0);
        ch.set(oldCh.slice(end), start);
      }
      return newBuf;
    } catch (e) {
      return buf;
    }
  },

  // 5. 두 버퍼를 앞뒤로 이어 붙임
  concatBuffers: (ctx, buf1, buf2) => {
    if (!ctx) return null;
    if (!buf1) return buf2;
    if (!buf2) return buf1;

    const newLen = buf1.length + buf2.length;
    const newBuf = ctx.createBuffer(buf1.numberOfChannels, newLen, buf1.sampleRate);
    for (let i = 0; i < buf1.numberOfChannels; i++) {
      const ch = newBuf.getChannelData(i);
      ch.set(buf1.getChannelData(i), 0);
      ch.set(buf2.getChannelData(i), buf1.length);
    }
    return newBuf;
  },

  // 6. 기존 버퍼의 특정 위치에 새 버퍼를 삽입
  insertBuffer: (ctx, base, insert, offsetPct) => {
    if (!ctx || !base) return insert;
    if (!insert) return base;

    const start = Math.floor(base.length * (offsetPct / 100));
    const newLen = base.length + insert.length;
    const newBuf = ctx.createBuffer(base.numberOfChannels, newLen, base.sampleRate);
    
    for (let i = 0; i < base.numberOfChannels; i++) {
      const ch = newBuf.getChannelData(i);
      const baseData = base.getChannelData(i);
      const insertData = insert.getChannelData(i % insert.numberOfChannels);
      ch.set(baseData.slice(0, start), 0);
      ch.set(insertData, start);
      ch.set(baseData.slice(start), start + insert.length);
    }
    return newBuf;
  },

  // 7. 두 버퍼를 소리가 겹치게 믹스 (Overlay)
  mixBuffers: (ctx, base, overlay, offsetPct) => {
    if (!ctx || !base) return overlay;
    if (!overlay) return base;

    const startSample = Math.floor(base.length * (offsetPct / 100));
    const newLen = Math.max(base.length, startSample + overlay.length);
    const newBuf = ctx.createBuffer(base.numberOfChannels, newLen, base.sampleRate);

    for (let i = 0; i < base.numberOfChannels; i++) {
      const ch = newBuf.getChannelData(i);
      ch.set(base.getChannelData(i));
      const overlayData = overlay.getChannelData(i % overlay.numberOfChannels);
      for (let s = 0; s < overlay.length; s++) {
        if (startSample + s < newLen) ch[startSample + s] += overlayData[s];
      }
    }
    return newBuf;
  },

  // 8. 페이드 인/아웃 효과 적용
  applyFade: async (ctx, buf, type, startPct, endPct, shape = 'linear') => {
    if (!ctx || !buf) return null;
    const offline = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
    const s = offline.createBufferSource();
    s.buffer = buf;
    const g = offline.createGain();

    const start = (startPct / 100) * buf.duration;
    const end = (endPct / 100) * buf.duration;

    if (type === 'in') {
      g.gain.setValueAtTime(0, start);
      if (shape === 'exponential') g.gain.exponentialRampToValueAtTime(1, end);
      else g.gain.linearRampToValueAtTime(1, end);
    } else {
      g.gain.setValueAtTime(1, start);
      if (shape === 'exponential') g.gain.exponentialRampToValueAtTime(0.001, end);
      else g.gain.linearRampToValueAtTime(0, end);
    }

    s.connect(g);
    g.connect(offline.destination);
    s.start(0);
    return await offline.startRendering();
  },

  // 9. 버퍼 거꾸로 재생 (Reverse)
  reverseBuffer: (ctx, buf) => {
    if (!ctx || !buf) return null;
    const newBuf = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let i = 0; i < buf.numberOfChannels; i++) {
      const ch = newBuf.getChannelData(i);
      const old = buf.getChannelData(i);
      for (let j = 0; j < buf.length; j++) {
        ch[j] = old[buf.length - 1 - j];
      }
    }
    return newBuf;
  },

  // 10. WAV 파일로 변환하여 다운로드
  downloadWav: async (buffer, name) => {
    if (!buffer) return;
    try {
      const targetRate = 44100;
      const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * targetRate), targetRate);
      const s = offline.createBufferSource();
      s.buffer = buffer;
      s.connect(offline.destination);
      s.start(0);
      const rendered = await offline.startRendering();
      const pcmData = rendered.getChannelData(0);

      const arrayBuffer = new ArrayBuffer(44 + pcmData.length * 2);
      const view = new DataView(arrayBuffer);

      const writeStr = (v, o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      
      writeStr(view, 0, 'RIFF');
      view.setUint32(4, 36 + pcmData.length * 2, true);
      writeStr(view, 8, 'WAVE');
      writeStr(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, targetRate, true);
      view.setUint32(28, targetRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(view, 36, 'data');
      view.setUint32(40, pcmData.length * 2, true);

      let offset = 44;
      for (let i = 0; i < pcmData.length; i++) {
        let sample = Math.max(-1, Math.min(1, pcmData[i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
        offset += 2;
      }

      const blob = new Blob([view], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'otonashi_audio'}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("WAV Download failed:", e);
    }
  }
};
