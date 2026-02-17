
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

  normalizeBuffer: (ctx: AudioContext, buf: AudioBuffer): AudioBuffer => {
    const newBuf = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    let maxAmp = 0;
    for (let i = 0; i < buf.numberOfChannels; i++) {
      const data = buf.getChannelData(i);
      for (let j = 0; j < data.length; j++) {
        const abs = Math.abs(data[j]);
        if (abs > maxAmp) maxAmp = abs;
      }
    }
    const factor = maxAmp > 0 ? 0.98 / maxAmp : 1;
    for (let i = 0; i < buf.numberOfChannels; i++) {
      const src = buf.getChannelData(i);
      const dst = newBuf.getChannelData(i);
      for (let j = 0; j < src.length; j++) dst[j] = src[j] * factor;
    }
    return newBuf;
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

  bufferToWavBlob: (buffer: AudioBuffer): Blob => {
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
            let s=Math.max(-1,Math.min(1,chs[i][offset]||0)); 
            s=(s<0?s*32768:s*32767)|0; view.setInt16(pos,s,true); pos+=2; 
        } 
        offset++; 
    }
    return new Blob([bufferArr],{type:'audio/wav'});
  },

  downloadWav: (buffer: AudioBuffer, name: string) => {
    if (!buffer) return;
    const blob = AudioUtils.bufferToWavBlob(buffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  },

  blobToBase64: (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  getBiquadMagnitude: (freq: number, type: BiquadFilterType, f0: number, gain: number, q: number, sampleRate: number): number => {
    const w0 = 2 * Math.PI * f0 / sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * q);
    const A = Math.pow(10, gain / 40);
    let b0=0, b1=0, b2=0, a0=1, a1=0, a2=0;
    if (type === 'peaking') {
        b0 = 1 + alpha * A; b1 = -2 * cosW0; b2 = 1 - alpha * A;
        a0 = 1 + alpha / A; a1 = -2 * cosW0; a2 = 1 - alpha / A;
    } else if (type === 'lowshelf') {
        b0 = A * ((A + 1) - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
        b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
        b2 = A * ((A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
        a0 = (A + 1) + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
        a1 = -2 * ((A - 1) + (A + 1) * cosW0);
        a2 = (A + 1) + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;
    } else if (type === 'highshelf') {
        b0 = A * ((A + 1) + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
        b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
        b2 = A * ((A + 1) + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
        a0 = (A + 1) - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
        a1 = 2 * ((A - 1) - (A + 1) * cosW0);
        a2 = (A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;
    } else if (type === 'lowpass') {
        b0 = (1 - cosW0) / 2; b1 = 1 - cosW0; b2 = (1 - cosW0) / 2;
        a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
    } else if (type === 'highpass') {
        b0 = (1 + cosW0) / 2; b1 = -(1 + cosW0); b2 = (1 + cosW0) / 2;
        a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
    } else return 1.0; 
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    const w = 2 * Math.PI * freq / sampleRate;
    const cosW = Math.cos(w); const cos2W = Math.cos(2*w);
    const sinW = Math.sin(w); const sin2W = Math.sin(2*w);
    const numReal = b0 + b1 * cosW + b2 * cos2W;
    const numImag = b1 * sinW + b2 * sin2W;
    const denReal = 1 + a1 * cosW + a2 * cos2W;
    const denImag = a1 * sinW + a2 * sin2W;
    const magSquared = (numReal*numReal + numImag*numImag) / (denReal*denReal + denImag*denImag);
    return Math.sqrt(magSquared);
  },

  analyzeFormants: (buffer: AudioBuffer): { t: number, f1: number, f2: number, f3: number, energy: number }[] => {
    const sr = buffer.sampleRate;
    const data = buffer.getChannelData(0);
    const windowSize = 0.025; const stepSize = 0.01;
    const nWin = Math.floor(windowSize * sr);
    const nStep = Math.floor(stepSize * sr);
    const results = [];
    const order = 16; 
    for (let i = 0; i < data.length - nWin; i += nStep) {
        const segment = new Float32Array(nWin);
        let sumSq = 0;
        for (let j = 0; j < nWin; j++) {
            const raw = data[i + j];
            const val = (j > 0) ? raw - 0.95 * data[i + j - 1] : raw;
            segment[j] = val * (0.54 - 0.46 * Math.cos((2 * Math.PI * j) / (nWin - 1)));
            sumSq += segment[j] * segment[j];
        }
        const rms = Math.sqrt(sumSq / nWin);
        const r = new Float32Array(order + 1);
        for (let k = 0; k <= order; k++) {
            let sum = 0;
            for (let j = 0; j < nWin - k; j++) sum += segment[j] * segment[j + k];
            r[k] = sum;
        }
        const a = new Float32Array(order + 1);
        const e = new Float32Array(order + 1);
        a[0] = 1; e[0] = r[0];
        for (let k = 1; k <= order; k++) {
            let lambda = 0;
            for (let j = 0; j < k; j++) lambda -= a[j] * r[k - j];
            lambda /= e[k - 1];
            const prevA = Float32Array.from(a);
            for(let j=1; j<k; j++) a[j] = prevA[j] + lambda * prevA[k-j];
            a[k] = lambda;
            e[k] = e[k - 1] * (1 - lambda * lambda);
        }
        const peaks = [];
        let prevMag = 0; let prevSlope = 0;
        for (let f = 50; f < 5500; f += 10) {
            const w = 2 * Math.PI * f / sr;
            let re = 0, im = 0;
            for (let k = 0; k <= order; k++) { re += a[k] * Math.cos(k * w); im -= a[k] * Math.sin(k * w); }
            const mag = 1 / Math.sqrt(re * re + im * im);
            const slope = mag - prevMag;
            if (prevSlope > 0 && slope < 0) peaks.push({ f: f - 10, mag: prevMag });
            prevMag = mag; prevSlope = slope;
        }
        peaks.sort((x, y) => x.f - y.f);
        let f1 = 0, f2 = 0, f3 = 0;
        const last = results.length > 0 ? results[results.length-1] : {f1:500, f2:1500, f3:2500};
        const p1 = peaks.find(p => p.f >= 150 && p.f < 1100);
        if (p1) {
            f1 = p1.f; const p2 = peaks.find(p => p.f > f1 + 200 && p.f < 3000);
            if (p2) { f2 = p2.f; const p3 = peaks.find(p => p.f > f2 + 400 && p.f < 5200); if (p3) f3 = p3.f; else f3 = Math.max(f2 + 600, last.f3); } 
            else { f2 = Math.max(f1 + 400, last.f2); f3 = Math.max(f2 + 600, last.f3); }
        } else { f1 = last.f1; f2 = last.f2; f3 = last.f3; }
        results.push({ t: i / sr, f1, f2, f3, energy: rms });
    }
    return results;
  }
};
