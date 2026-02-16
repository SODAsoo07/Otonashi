
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
    return AudioUtils.mixBuffersAtTime(ctx, base, overlay, startSample);
  },

  mixBuffersAtTime: (ctx: AudioContext, base: AudioBuffer, overlay: AudioBuffer, startSample: number): AudioBuffer | null => {
      if (!base || !overlay) return base;
      
      // Calculate new length (extend if overlay goes beyond base)
      const newLen = Math.max(base.length, startSample + overlay.length);
      const newBuf = ctx.createBuffer(base.numberOfChannels, newLen, base.sampleRate);
      
      for (let i = 0; i < base.numberOfChannels; i++) {
          const ch = newBuf.getChannelData(i);
          // Copy base
          ch.set(base.getChannelData(i), 0);
          
          // Add overlay
          // Handle mono overlay on stereo base, or matched channels
          const overlayChData = overlay.getChannelData(i % overlay.numberOfChannels);
          
          for (let j = 0; j < overlay.length; j++) {
              if (startSample + j < newLen) {
                  ch[startSample + j] += overlayChData[j];
              }
          }
      }
      return newBuf;
  },

  // Convolution for Imprinting Texture
  convolveBuffers: async (ctx: AudioContext, carrier: AudioBuffer, modulator: AudioBuffer, mix: number = 0.5): Promise<AudioBuffer | null> => {
    if (!carrier || !modulator) return carrier;
    
    // We use OfflineAudioContext to render the convolution
    // The length will be carrier + modulator (tail)
    const len = carrier.length + modulator.length;
    const off = new OfflineAudioContext(carrier.numberOfChannels, len, carrier.sampleRate);
    
    const source = off.createBufferSource();
    source.buffer = carrier;
    
    const convolver = off.createConvolver();
    convolver.buffer = modulator;
    
    // Dry/Wet Mix
    const dry = off.createGain();
    dry.gain.value = 1 - mix;
    
    const wet = off.createGain();
    wet.gain.value = mix;

    const out = off.createGain();
    // Normalize output slightly to prevent clipping from resonance
    out.gain.value = 0.8; 

    source.connect(dry);
    source.connect(convolver);
    convolver.connect(wet);
    
    dry.connect(out);
    wet.connect(out);
    out.connect(off.destination);
    
    source.start(0);
    return await off.startRendering();
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

  bufferToWavBlob: (buffer: AudioBuffer): Blob => {
    // Force Mono (1 channel)
    const numberOfChannels = 1;
    const length = buffer.length * numberOfChannels * 2 + 44;
    const bufferArr = new ArrayBuffer(length); const view = new DataView(bufferArr);
    let pos = 0; 
    const setUint32=(d: number)=>{view.setUint32(pos,d,true);pos+=4;};
    const setUint16=(d: number)=>{view.setUint16(pos,d,true);pos+=2;};
    setUint32(0x46464952); setUint32(length-8); setUint32(0x45564157); setUint32(0x20746d66);
    setUint32(16); setUint16(1); setUint16(numberOfChannels); setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate*2*numberOfChannels); setUint16(numberOfChannels*2); setUint16(16);
    setUint32(0x61746164); setUint32(length-pos-4);
    
    let offset=0; 
    const chs = []; 
    for(let i=0; i<buffer.numberOfChannels; i++) chs.push(buffer.getChannelData(i));
    
    while(pos<length){ 
        // Mix down all channels to mono
        let sum = 0;
        for(let i=0; i<buffer.numberOfChannels; i++){ 
            sum += chs[i][offset];
        }
        let s = sum / buffer.numberOfChannels; // Average
        s = Math.max(-1,Math.min(1, s)); 
        s=(s<0?s*32768:s*32767)|0; 
        view.setInt16(pos,s,true); 
        pos+=2; 
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
    } else {
        return 1.0; 
    }

    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;

    const w = 2 * Math.PI * freq / sampleRate;
    const cosW = Math.cos(w);
    const cos2W = Math.cos(2*w);
    const sinW = Math.sin(w);
    const sin2W = Math.sin(2*w);

    const numReal = b0 + b1 * cosW + b2 * cos2W;
    const numImag = b1 * sinW + b2 * sin2W;
    const denReal = 1 + a1 * cosW + a2 * cos2W;
    const denImag = a1 * sinW + a2 * sin2W;

    const magSquared = (numReal*numReal + numImag*numImag) / (denReal*denReal + denImag*denImag);
    return Math.sqrt(magSquared);
  },

  // --- LPC Analysis with ZCR ---
  analyzeFormants: (buffer: AudioBuffer, windowSize: number = 0.025, stepSize: number = 0.01): { t: number, f1: number, f2: number, f3: number, energy: number, zcr: number }[] => {
    const sr = buffer.sampleRate;
    const data = buffer.getChannelData(0);
    const nWin = Math.floor(windowSize * sr);
    const nStep = Math.floor(stepSize * sr);
    const results = [];
    const order = 16; 

    for (let i = 0; i < data.length - nWin; i += nStep) {
        // 1. Windowing & ZCR
        const segment = new Float32Array(nWin);
        let sumSq = 0;
        let zcrCount = 0;
        
        for (let j = 0; j < nWin; j++) {
            const raw = data[i + j];
            // Zero Crossing Rate Calculation
            if (j > 0 && ((raw >= 0 && data[i + j - 1] < 0) || (raw < 0 && data[i + j - 1] >= 0))) {
                zcrCount++;
            }
            
            // Pre-emphasis
            const val = (j > 0) ? raw - 0.95 * data[i + j - 1] : raw;
            segment[j] = val * (0.54 - 0.46 * Math.cos((2 * Math.PI * j) / (nWin - 1)));
            sumSq += segment[j] * segment[j];
        }
        const rms = Math.sqrt(sumSq / nWin);
        const zcr = zcrCount / nWin;

        // 2. Autocorrelation
        const r = new Float32Array(order + 1);
        for (let k = 0; k <= order; k++) {
            let sum = 0;
            for (let j = 0; j < nWin - k; j++) sum += segment[j] * segment[j + k];
            r[k] = sum;
        }

        // 3. Levinson-Durbin
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

        // 4. Peak Picking
        const peaks = [];
        let prevMag = 0;
        let prevSlope = 0;
        const maxFreq = 5500; 
        const freqStep = 10; 
        
        for (let f = 50; f < maxFreq; f += freqStep) {
            const w = 2 * Math.PI * f / sr;
            let re = 0, im = 0;
            for (let k = 0; k <= order; k++) {
                re += a[k] * Math.cos(k * w);
                im -= a[k] * Math.sin(k * w);
            }
            const mag = 1 / Math.sqrt(re * re + im * im);
            const slope = mag - prevMag;
            
            if (prevSlope > 0 && slope < 0) {
                peaks.push({ f: f - freqStep, mag: prevMag });
            }
            prevMag = mag;
            prevSlope = slope;
        }

        peaks.sort((x, y) => x.f - y.f);

        let f1 = 0, f2 = 0, f3 = 0;
        const last = results.length > 0 ? results[results.length-1] : {f1:500, f2:1500, f3:2500};

        const p1 = peaks.find(p => p.f >= 150 && p.f < 1100);
        if (p1) {
            f1 = p1.f;
            const minF2 = f1 + 200;
            const p2 = peaks.find(p => p.f > minF2 && p.f < 3000);
            if (p2) {
                f2 = p2.f;
                const minF3 = f2 + 400;
                const p3 = peaks.find(p => p.f > minF3 && p.f < 5200);
                if (p3) {
                    f3 = p3.f;
                } else {
                    f3 = Math.max(minF3, last.f3); 
                }
            } else {
                f2 = Math.max(minF2, last.f2); 
                f3 = Math.max(f2 + 600, last.f3);
            }
        } else {
            f1 = last.f1;
            f2 = last.f2;
            f3 = last.f3;
        }
        results.push({ t: i / sr, f1, f2, f3, energy: rms, zcr });
    }
    return results;
  },

  // --- Pitch Detection (Autocorrelation) ---
  detectPitch: (buffer: AudioBuffer, sensitivity: number): { t: number, v: number }[] => {
    const data = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const windowSize = 2048;
    const step = 1024;
    const results = [];

    // Frequency bounds for human voice
    const minFreq = 50;
    const maxFreq = 600;

    for (let i = 0; i < data.length - windowSize; i += step) {
        const segment = data.slice(i, i + windowSize);
        
        // Root Mean Square for silence detection
        let sumSq = 0;
        for (let s of segment) sumSq += s * s;
        const rms = Math.sqrt(sumSq / windowSize);
        if (rms < 0.02) continue; // Skip silence

        // Autocorrelation
        let bestOffset = -1;
        let maxCorr = -1;
        
        // Search range based on freq limits
        const minOffset = Math.floor(sr / maxFreq);
        const maxOffset = Math.floor(sr / minFreq);

        for (let offset = minOffset; offset < maxOffset; offset++) {
            let correlation = 0;
            for (let j = 0; j < windowSize - offset; j++) {
                correlation += segment[j] * segment[j + offset];
            }
            // Normalize
            if (correlation > maxCorr) {
                maxCorr = correlation;
                bestOffset = offset;
            }
        }

        if (bestOffset !== -1) {
            const freq = sr / bestOffset;
            if (freq >= minFreq && freq <= maxFreq) {
                const t = i / sr;
                results.push({ t, v: freq });
            }
        }
    }

    return AudioUtils.simplifyPoints(results, sensitivity);
  },

  // --- Spectrogram Computation (Simple FFT) ---
  computeSpectrogram: (buffer: AudioBuffer, width: number, height: number): Uint8ClampedArray | null => {
    // Note: Creating a full high-res spectrogram in JS main thread is heavy. 
    // We will do a lower resolution one suitable for the background visualization.
    const data = buffer.getChannelData(0);
    const fftSize = 256; // Low resolution for background
    const binCount = fftSize / 2;
    const step = Math.floor(data.length / width);
    const result = new Uint8ClampedArray(width * height * 4); // RGBA
    
    // Pre-calc Cosine window
    const window = new Float32Array(fftSize);
    for(let i=0; i<fftSize; i++) window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));

    for (let x = 0; x < width; x++) {
        const startIdx = x * step;
        if (startIdx + fftSize >= data.length) break;
        
        // Simple DFT (Since FFT code is large to include here, and fftSize is small)
        // For 128 bins, simple loop is acceptable for one-time render
        const real = new Float32Array(binCount);
        const imag = new Float32Array(binCount);
        
        for (let k = 0; k < binCount; k++) {
            for (let n = 0; n < fftSize; n++) {
                const val = data[startIdx + n] * window[n];
                const angle = (2 * Math.PI * k * n) / fftSize;
                real[k] += val * Math.cos(angle);
                imag[k] -= val * Math.sin(angle);
            }
        }

        for (let y = 0; y < height; y++) {
            // Map y to frequency bin (log scale looks better but linear is faster)
            // Using linear for simplicity in this background view
            const binIdx = Math.floor(((height - 1 - y) / height) * binCount * 0.8); // 0.8 to cutoff high freq
            if (binIdx >= binCount) continue;
            
            const mag = Math.sqrt(real[binIdx]**2 + imag[binIdx]**2);
            // Log scale intensity
            const intensity = Math.min(255, Math.log10(mag + 1) * 60); 

            const pxIdx = (y * width + x) * 4;
            // Blue-ish color scheme
            result[pxIdx] = 30 + intensity * 0.5;     // R
            result[pxIdx + 1] = 40 + intensity * 0.8; // G
            result[pxIdx + 2] = 50 + intensity;       // B
            result[pxIdx + 3] = intensity > 10 ? Math.min(255, intensity * 2) : 0; // Alpha
        }
    }
    return result;
  },

  simplifyPoints: (points: {t: number, v: number}[], sensitivity: number): {t: number, v: number}[] => {
      if (points.length < 3) return points;
      // Sensitivity 0.0 -> Tolerance 50 (Very simplified)
      // Sensitivity 1.0 -> Tolerance 0 (Keep almost all)
      const tolerance = 1 + (1 - sensitivity) * 50;
      
      const sqTolerance = tolerance * tolerance;
      
      // Ramer-Douglas-Peucker
      const simplify = (pts: {t: number, v: number}[]): {t: number, v: number}[] => {
          if (pts.length < 3) return pts;
          let maxSqDist = 0;
          let index = 0;
          const end = pts.length - 1;
          
          for (let i = 1; i < end; i++) {
              // Perpendicular distance calculation approx for performance
              // Just using vertical difference for Pitch/Time graph is often enough
              const dx = pts[end].t - pts[0].t;
              const dy = pts[end].v - pts[0].v;
              
              let num = Math.abs(dy * pts[i].t - dx * pts[i].v + pts[end].t * pts[0].v - pts[end].v * pts[0].t);
              let den = Math.sqrt(dx*dx + dy*dy);
              let sqDist = (num / den) ** 2;

              if (sqDist > maxSqDist) {
                  maxSqDist = sqDist;
                  index = i;
              }
          }

          if (maxSqDist > sqTolerance) {
              const res1 = simplify(pts.slice(0, index + 1));
              const res2 = simplify(pts.slice(index));
              return [...res1.slice(0, -1), ...res2];
          } else {
              return [pts[0], pts[end]];
          }
      };

      return simplify(points);
  }
};
