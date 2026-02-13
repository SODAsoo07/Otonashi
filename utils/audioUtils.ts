export const RULER_HEIGHT = 24;

export const AudioUtils = {
  createBufferFromSlice: (ctx: AudioContext, buf: AudioBuffer, startPct: number, endPct: number): AudioBuffer | null => {
    if(!buf || !ctx) return null;
    const start = Math.floor(buf.length * startPct);
    const end = Math.floor(buf.length * endPct);
    const len = Math.max(1, end - start);
    const newBuf = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for(let i=0; i<buf.numberOfChannels; i++) newBuf.copyToChannel(buf.getChannelData(i).slice(start, end), i);
    return newBuf;
  },

  deleteRange: (ctx: AudioContext, buf: AudioBuffer, startPct: number, endPct: number): AudioBuffer | null => {
    if (!buf || !ctx) return null;
    const start = Math.floor(buf.length * startPct);
    const end = Math.floor(buf.length * endPct);
    const newLen = buf.length - (end - start);
    if (newLen <= 0) return ctx.createBuffer(1, 100, buf.sampleRate);
    const newBuf = ctx.createBuffer(buf.numberOfChannels, newLen, buf.sampleRate);
    for(let i=0; i<buf.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        const oldCh = buf.getChannelData(i);
        const pre = oldCh.slice(0, start);
        const post = oldCh.slice(end);
        ch.set(pre);
        ch.set(post, start);
    }
    return newBuf;
  },

  concatBuffers: (ctx: AudioContext, buf1: AudioBuffer | null, buf2: AudioBuffer | null): AudioBuffer | null => {
    if(!buf1) return buf2; if(!buf2) return buf1;
    const newLen = buf1.length + buf2.length;
    const newBuf = ctx.createBuffer(buf1.numberOfChannels, newLen, buf1.sampleRate);
    for(let i=0; i<buf1.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        ch.set(buf1.getChannelData(i), 0);
        ch.set(buf2.getChannelData(i), buf1.length);
    }
    return newBuf;
  },

  mixBuffers: (ctx: AudioContext, base: AudioBuffer, overlay: AudioBuffer, offsetPct: number): AudioBuffer | null => {
    if(!base || !overlay) return base;
    const startSample = Math.floor(base.length * offsetPct);
    const newLen = Math.max(base.length, startSample + overlay.length);
    const newBuf = ctx.createBuffer(base.numberOfChannels, newLen, base.sampleRate);
    for(let i=0; i<base.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        ch.set(base.getChannelData(i));
        const overlayData = overlay.getChannelData(i % overlay.numberOfChannels);
        for(let s=0; s<overlay.length; s++) {
            if(startSample + s < newLen) ch[startSample + s] += overlayData[s];
        }
    }
    return newBuf;
  },

  applyStretch: async (buffer: AudioBuffer, ratio: number): Promise<AudioBuffer | null> => {
    if (!buffer) return null;
    const newLen = Math.max(1, Math.floor(buffer.length * ratio));
    const off = new OfflineAudioContext(buffer.numberOfChannels, newLen, buffer.sampleRate);
    const src = off.createBufferSource(); src.buffer = buffer;
    src.playbackRate.value = 1/ratio;
    src.connect(off.destination);
    src.start(0);
    return await off.startRendering();
  },

  applyReverb: async (ctx: AudioContext, buffer: AudioBuffer, wet: number): Promise<AudioBuffer> => {
    const len = buffer.length + buffer.sampleRate * 2;
    const off = new OfflineAudioContext(buffer.numberOfChannels, len, buffer.sampleRate);
    const src = off.createBufferSource(); src.buffer = buffer;
    const conv = off.createConvolver();
    const irLen = buffer.sampleRate * 2;
    const ir = off.createBuffer(2, irLen, buffer.sampleRate);
    for(let i=0; i<2; i++) {
        const d = ir.getChannelData(i);
        for(let j=0; j<irLen; j++) d[j] = (Math.random()*2-1) * Math.pow(1-j/irLen, 3);
    }
    conv.buffer = ir;
    const dry = off.createGain(); dry.gain.value = 1-wet;
    const wetG = off.createGain(); wetG.gain.value = wet;
    src.connect(dry); dry.connect(off.destination);
    src.connect(conv); conv.connect(wetG); wetG.connect(off.destination);
    src.start(0);
    return await off.startRendering();
  },

  applyDelay: async (ctx: AudioContext, buffer: AudioBuffer, time: number, feedback: number): Promise<AudioBuffer> => {
    const len = buffer.length + buffer.sampleRate * 2;
    const off = new OfflineAudioContext(buffer.numberOfChannels, len, buffer.sampleRate);
    const src = off.createBufferSource(); src.buffer = buffer;
    const d = off.createDelay(); d.delayTime.value = time;
    const f = off.createGain(); f.gain.value = feedback;
    const wet = off.createGain(); wet.gain.value = 0.5;
    src.connect(off.destination);
    src.connect(d); d.connect(f); f.connect(d);
    d.connect(wet); wet.connect(off.destination);
    src.start(0);
    return await off.startRendering();
  },

  applyFade: async (ctx: AudioContext, buf: AudioBuffer, type: 'in' | 'out', startPct: number, endPct: number): Promise<AudioBuffer | null> => {
    if(!buf || !ctx) return null;
    const offline = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
    const s = offline.createBufferSource(); s.buffer = buf;
    const g = offline.createGain();
    const start = startPct * buf.duration;
    const end = endPct * buf.duration;
    if (type === 'in') { g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(1, end); } 
    else { g.gain.setValueAtTime(1, start); g.gain.linearRampToValueAtTime(0, end); }
    s.connect(g); g.connect(offline.destination); s.start(0);
    return await offline.startRendering();
  },

  createSilence: (ctx: AudioContext, sec: number): AudioBuffer | null => {
    if(!ctx) return null;
    return ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * sec)), ctx.sampleRate);
  },

  reverseBuffer: (ctx: AudioContext, buffer: AudioBuffer): AudioBuffer => {
    const newBuf = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let i = 0; i < buffer.numberOfChannels; i++) {
        const orig = buffer.getChannelData(i);
        const rev = newBuf.getChannelData(i);
        for (let j = 0; j < buffer.length; j++) rev[j] = orig[buffer.length - 1 - j];
    }
    return newBuf;
  },

  downloadWav: (buffer: AudioBuffer, name: string) => {
    if (!buffer) return;
    const length = buffer.length * buffer.numberOfChannels * 2 + 44;
    const bufferArr = new ArrayBuffer(length); const view = new DataView(bufferArr);
    let pos = 0; 
    const setUint32=(d: number)=>{view.setUint32(pos,d,true);pos+=4;};
    const setUint16=(d: number)=>{view.setUint16(pos,d,true);pos+=2;};
    setUint32(0x46464952); setUint32(length-8); setUint32(0x45564157); setUint32(0x20746d66);
    setUint32(16); setUint16(1); setUint16(buffer.numberOfChannels); setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate*2*buffer.numberOfChannels); setUint16(buffer.numberOfChannels*2); setUint16(16);
    setUint32(0x61746164); setUint32(length-pos-4);
    let offset=0; const chs = []; 
    for(let i=0; i<buffer.numberOfChannels; i++) chs.push(buffer.getChannelData(i));
    while(pos<length){ 
        for(let i=0;i<buffer.numberOfChannels;i++){ 
            let s=Math.max(-1,Math.min(1,chs[i][offset])); 
            s=(s<0?s*32768:s*32767)|0; view.setInt16(pos,s,true); pos+=2; 
        } 
        offset++; 
    }
    const blob=new Blob([bufferArr],{type:'audio/wav'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name; a.click();
  }
};