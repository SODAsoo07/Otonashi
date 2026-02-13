export const AudioUtils = {
  serializeBuffer: (buffer) => {
    if (!buffer) return null;
    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(Array.from(buffer.getChannelData(i)));
    }
    return { sampleRate: buffer.sampleRate, numberOfChannels: buffer.numberOfChannels, channels };
  },
  deserializeBuffer: async (ctx, data) => {
    if (!ctx || !data || !data.channels) return null;
    const { sampleRate, numberOfChannels, channels } = data;
    const buffer = ctx.createBuffer(numberOfChannels, channels[0].length, sampleRate);
    for (let i = 0; i < numberOfChannels; i++) {
      buffer.copyToChannel(new Float32Array(channels[i]), i);
    }
    return buffer;
  },
  createBufferFromSlice: (ctx, buf, startPct, endPct) => {
    if(!buf || !ctx) return null;
    const start = Math.floor(buf.length * (startPct/100));
    const end = Math.floor(buf.length * (endPct/100));
    if (end <= start) return null;
    const newBuf = ctx.createBuffer(buf.numberOfChannels, end - start, buf.sampleRate);
    for(let i=0; i<buf.numberOfChannels; i++) newBuf.copyToChannel(buf.getChannelData(i).slice(start, end), i);
    return newBuf;
  },
  deleteRange: (ctx, buf, startPct, endPct) => {
    if (!buf || !ctx) return null;
    const start = Math.floor(buf.length * (startPct/100));
    const end = Math.floor(buf.length * (endPct/100));
    const newLen = buf.length - (end - start);
    if (newLen <= 0) return ctx.createBuffer(buf.numberOfChannels, 1, buf.sampleRate);
    const newBuf = ctx.createBuffer(buf.numberOfChannels, newLen, buf.sampleRate);
    for(let i=0; i<buf.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        const oldCh = buf.getChannelData(i);
        ch.set(oldCh.slice(0, start), 0);
        ch.set(oldCh.slice(end), start);
    }
    return newBuf;
  },
  concatBuffers: (ctx, buf1, buf2) => {
    if(!buf1 || !ctx) return buf2; if(!buf2) return buf1;
    const newLen = buf1.length + buf2.length;
    const newBuf = ctx.createBuffer(buf1.numberOfChannels, newLen, buf1.sampleRate);
    for(let i=0; i<buf1.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        ch.set(buf1.getChannelData(i), 0);
        ch.set(buf2.getChannelData(i), buf1.length);
    }
    return newBuf;
  },
  insertBuffer: (ctx, base, insert, offsetPct) => {
    if(!base || !ctx) return insert;
    if(!insert) return base;
    const start = Math.floor(base.length * (offsetPct/100));
    const newLen = base.length + insert.length;
    const newBuf = ctx.createBuffer(base.numberOfChannels, newLen, base.sampleRate);
    for(let i=0; i<base.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        ch.set(base.getChannelData(i).slice(0, start), 0);
        ch.set(insert.getChannelData(i % insert.numberOfChannels), start);
        ch.set(base.getChannelData(i).slice(start), start + insert.length);
    }
    return newBuf;
  },
  mixBuffers: (ctx, base, overlay, offsetPct) => {
    if(!base || !overlay || !ctx) return base;
    const startSample = Math.floor(base.length * (offsetPct/100));
    const newLen = Math.max(base.length, startSample + overlay.length);
    const newBuf = ctx.createBuffer(base.numberOfChannels, newLen, base.sampleRate);
    for(let i=0; i<base.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        ch.set(base.getChannelData(i));
        const overlayData = overlay.getChannelData(i % overlay.numberOfChannels);
        for(let s=0; s<overlay.length; s++) { if(startSample + s < newLen) ch[startSample + s] += overlayData[s]; }
    }
    return newBuf;
  },
  applyFade: async (ctx, buf, type, startPct, endPct, shape = 'linear') => {
    if(!buf || !ctx) return null;
    const offline = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
    const s = offline.createBufferSource(); s.buffer = buf;
    const g = offline.createGain();
    const start = (startPct/100) * buf.duration;
    const end = (endPct/100) * buf.duration;
    if (type === 'in') { 
        g.gain.setValueAtTime(0, start); 
        if(shape === 'exponential') g.gain.exponentialRampToValueAtTime(1, end);
        else g.gain.linearRampToValueAtTime(1, end);
    } else { 
        g.gain.setValueAtTime(1, start); 
        if(shape === 'exponential') g.gain.exponentialRampToValueAtTime(0.01, end);
        else g.gain.linearRampToValueAtTime(0, end);
    }
    s.connect(g); g.connect(offline.destination); s.start(0);
    return await offline.startRendering();
  },
  reverseBuffer: (ctx, buf) => {
    if(!buf || !ctx) return null;
    const newBuf = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for(let i=0; i<buf.numberOfChannels; i++){
        const ch = newBuf.getChannelData(i);
        const old = buf.getChannelData(i);
        for(let j=0; j<buf.length; j++) ch[j] = old[buf.length - 1 - j];
    }
    return newBuf;
  },
  downloadWav: async (buffer, name) => {
    if (!buffer) return;
    const targetRate = 44100;
    const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * targetRate), targetRate);
    const s = offline.createBufferSource();
    s.buffer = buffer; s.connect(offline.destination); s.start(0);
    const rendered = await offline.startRendering();
    const pcmData = rendered.getChannelData(0);
    const arrayBuffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(arrayBuffer);
    const writeStr = (v, o, str) => { for (let i=0; i<str.length; i++) v.setUint8(o+i, str.charCodeAt(i)); };
    writeStr(view, 0, 'RIFF'); view.setUint32(4, 36 + pcmData.length * 2, true);
    writeStr(view, 8, 'WAVE'); writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    writeStr(view, 36, 'data'); view.setUint32(40, pcmData.length * 2, true);
    let offset = 44;
    for (let i=0; i<pcmData.length; i++) {
        let sample = Math.max(-1, Math.min(1, pcmData[i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true); offset += 2;
    }
    const url = URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
    const a = document.createElement('a'); a.href = url; a.download = `${name}.wav`; a.click();
    URL.revokeObjectURL(url);
  }
};
