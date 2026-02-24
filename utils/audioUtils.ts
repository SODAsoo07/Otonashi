
export const RULER_HEIGHT = 24;

export const AudioUtils = {
  createBufferFromSlice: (ctx: AudioContext, buf: AudioBuffer, startPct: number, endPct: number): AudioBuffer | null => {
    if (!buf || !ctx) return null;
    const start = Math.floor(buf.length * startPct);
    const end = Math.floor(buf.length * endPct);
    const len = Math.max(1, end - start);
    const newBuf = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let i = 0; i < buf.numberOfChannels; i++) newBuf.copyToChannel(buf.getChannelData(i).slice(start, end), i);
    return newBuf;
  },

  detectFundamentalPitch: (buffer: AudioBuffer): number | null => {
    // Simple Auto-Correlation pitch detection
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    let maxSamples = Math.floor(buffer.length / 2);
    if (maxSamples > sampleRate) maxSamples = sampleRate; // Limit to 1 second for perf

    let bestOffset = -1;
    let bestCorrelation = 0;
    let foundGoodCorrelation = false;
    let correlations = new Array(maxSamples);

    let lastCorrelation = 1;
    for (let offset = 0; offset < maxSamples; offset++) {
      let correlation = 0;
      for (let i = 0; i < maxSamples; i++) {
        correlation += Math.abs((data[i]) - (data[i + offset]));
      }
      correlation = 1 - (correlation / maxSamples);
      correlations[offset] = correlation;

      // Find local peaks
      if (correlation > 0.9 && correlation > lastCorrelation) {
        foundGoodCorrelation = true;
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestOffset = offset;
        }
      } else if (foundGoodCorrelation) {
        // Once we found one dipping down, we just take the first solid peak
        // as it's the fundamental. Next peaks are harmonics.
        let shift = (bestCorrelation - lastCorrelation) > 0 ? bestOffset : offset - 1;
        return sampleRate / shift;
      }
      lastCorrelation = correlation;
    }

    if (bestCorrelation > 0.01 && bestOffset > 0) return sampleRate / bestOffset;
    return null;
  },

  detectPitchCurve: (buffer: AudioBuffer, windowMs: number = 30, stepSamples: number = 256, interpolate: boolean = false, forcePitch: number | null = null): { t: number, f0: number, amp: number }[] => {
    // Windowed autocorrelation for F0 curve
    const data = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const windowSize = Math.floor(sr * (windowMs / 1000));
    const stepSize = stepSamples;
    const results: { t: number, f0: number, amp: number }[] = [];

    const minOffset = Math.floor(sr / 1000); // 1000Hz max
    const maxOffset = Math.floor(sr / 50);   // 50Hz min

    for (let i = 0; i < data.length - windowSize; i += stepSize) {
      let maxCorr = 0;
      let bestOffset = -1;

      // Calculate energy to avoid noise
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += data[i + j] * data[i + j];
      }

      let pitch = 0;
      if (forcePitch !== null && forcePitch > 0) {
        pitch = forcePitch;
      } else if (energy / windowSize >= 0.0001) {
        for (let offset = minOffset; offset < maxOffset; offset++) {
          let correlation = 0;
          for (let j = 0; j < windowSize - offset; j++) {
            correlation += data[i + j] * data[i + j + offset];
          }
          if (correlation > maxCorr) {
            maxCorr = correlation;
            bestOffset = offset;
          }
        }

        if (bestOffset !== -1) {
          // Normalize correlation to check if it's a solid pitch or just noise
          const expectedAuto = energy; // Auto-correlation at 0 offset
          if (expectedAuto > 0 && (maxCorr / expectedAuto) > 0.2) {
            pitch = sr / bestOffset;
          }
        }
      }

      const rmsAmp = Math.sqrt(energy / windowSize);
      // UTAU frq amplitudes correspond roughly to audio levels 
      // If forcePitch is on, we ensure amp is at least small non-zero so UTAU doesn't consider it a completely dead frame if it wants to render it
      const finalAmp = (forcePitch !== null && rmsAmp < 0.0001) ? 10 : rmsAmp * 1000;
      results.push({ t: i / sr, f0: pitch, amp: finalAmp });
    }

    if (interpolate && results.length > 0) {
      // Linear interpolation for unvoiced/dropped frames (F0 === 0)
      let lastValidIdx = -1;
      for (let i = 0; i < results.length; i++) {
        if (results[i].f0 > 0) {
          if (lastValidIdx !== -1 && i - lastValidIdx > 1) {
            // Found a gap, interpolate from lastValidIdx to i
            const startF0 = results[lastValidIdx].f0;
            const endF0 = results[i].f0;
            const steps = i - lastValidIdx;
            const f0Step = (endF0 - startF0) / steps;

            for (let j = 1; j < steps; j++) {
              results[lastValidIdx + j].f0 = startF0 + f0Step * j;
            }
          } else if (lastValidIdx === -1 && i > 0) {
            // Gap at the beginning, just propagate the first found pitch backwards
            for (let j = 0; j < i; j++) {
              results[j].f0 = results[i].f0;
            }
          }
          lastValidIdx = i;
        }
      }
      // If there's a gap at the very end, propagate the last valid pitch forwards
      if (lastValidIdx !== -1 && lastValidIdx < results.length - 1) {
        for (let j = lastValidIdx + 1; j < results.length; j++) {
          results[j].f0 = results[lastValidIdx].f0;
        }
      }
    }

    return results;
  },

  getFrqAvg: (curve: { t: number, f0: number, amp: number }[]): number => {
    // Ported from world4utau / frq0003gen getFrqAvg
    let value = 0;
    let r = 0;
    let q = 0;
    let freq_avg = 0;
    let base_value = 0;
    const p = new Array(6).fill(0);
    const num_frames = curve.length;

    for (let i = 0; i < num_frames; i++) {
      value = curve[i].f0;
      if (value < 1000.0 && value > 55.0) {
        r = 1.0;
        for (let j = 0; j <= 5; j++) {
          if (i > j) {
            q = curve[i - j - 1].f0 - value;
            p[j] = value / (value + q * q);
          } else {
            p[j] = 1 / (1 + value);
          }
          r *= p[j];
        }
        freq_avg += value * r;
        base_value += r;
      }
    }
    if (base_value > 0) freq_avg /= base_value;
    return freq_avg;
  },

  generateFrqBuffer: (curve: { t: number, f0: number, amp: number }[], stepSamples: number): ArrayBuffer => {
    // UTAU .frq file format (FREQ0003) according to frq0003gen spec:
    // 0-7: "FREQ0003" (ascii)
    // 8-11: Samples per frq value (hopSize) (int32LE)
    // 12-19: Average frequency (Weighted average) (doubleLE)
    // 20-35: 4 * int32 empty space (reserved)
    // 36-39: Number of frames (int32LE)
    // 40+: Frames. Each frame is 16 bytes: F0 (doubleLE), Amplitude (doubleLE)

    const headerSize = 40;
    const numFrames = curve.length;
    const bufferSize = headerSize + numFrames * 16;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    // Write "FREQ0003"
    const magic = "FREQ0003";
    for (let i = 0; i < magic.length; i++) {
      view.setUint8(i, magic.charCodeAt(i));
    }

    // Write samples_per_frq (Hop Size)
    view.setInt32(8, stepSamples, true);

    // Calculate and write average frequency
    const avgFrq = AudioUtils.getFrqAvg(curve);
    view.setFloat64(12, avgFrq, true);

    // Blank spaces are 0 by default when ArrayBuffer is created

    // Number of frames
    view.setInt32(36, numFrames, true);

    // Write frames
    for (let i = 0; i < numFrames; i++) {
      const offset = headerSize + i * 16;
      view.setFloat64(offset, curve[i].f0, true);
      view.setFloat64(offset + 8, curve[i].amp, true);
    }

    return arrayBuffer;
  },

  pitchShiftLengthPreserving: async (ctx: OfflineAudioContext, buffer: AudioBuffer, pitchRatio: number): Promise<AudioBuffer> => {
    // A simplified Overlap-Add (OLA) time-stretching / pitch-shifting
    // To pitch shift by R without changing length:
    // 1. Time-stretch by factor 1/R (changes length to L/R, preserves pitch)
    // 2. Playback at rate R (changes length back to L, changes pitch by R)
    // Here we implement the time-stretch part (WSOLA-lite or granular)

    if (Math.abs(pitchRatio - 1.0) < 0.01) {
      return buffer;
    }

    const stretchFactor = 1 / pitchRatio;
    const sr = buffer.sampleRate;

    // Output length will be original length (we will stretch it then play it back fast)
    // Actually, it's easier to just do simple granular synthesis directly scaling the read pointer

    const outFrames = buffer.length;
    const outBuffer = ctx.createBuffer(buffer.numberOfChannels, outFrames, sr);

    // Grain parameters
    const grainSize = Math.floor(sr * 0.05); // 50ms grains
    const overlap = Math.floor(grainSize * 0.5); // 50% overlap
    const hopSize = grainSize - overlap;

    // Hanning window
    const win = new Float32Array(grainSize);
    for (let i = 0; i < grainSize; i++) {
      win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (grainSize - 1)));
    }

    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const input = buffer.getChannelData(c);
      const output = outBuffer.getChannelData(c);

      // Step 1: Time stretch to intermediate buffer
      const stretchedFrames = Math.floor(buffer.length * stretchFactor);
      const stretched = new Float32Array(stretchedFrames);

      const inHop = stretchFactor > 1 ? Math.floor(hopSize / stretchFactor) : hopSize;
      const outHop = stretchFactor > 1 ? hopSize : Math.floor(hopSize * stretchFactor);

      let inPos = 0;
      let outPos = 0;

      while (inPos + grainSize < input.length && outPos + grainSize < stretched.length) {
        for (let i = 0; i < grainSize; i++) {
          stretched[outPos + i] += input[inPos + i] * win[i];
        }
        inPos += inHop;
        outPos += outHop;
      }

      // Step 2: Resample (playbackRate simulation) back to original length
      // Linear interpolation resampling
      for (let i = 0; i < outFrames; i++) {
        const srcIdx = i * pitchRatio;
        const idx1 = Math.floor(srcIdx);
        const idx2 = Math.min(idx1 + 1, stretchedFrames - 1);
        const frac = srcIdx - idx1;

        if (idx1 < stretchedFrames) {
          output[i] = stretched[idx1] * (1 - frac) + stretched[idx2] * frac;
        }
      }
    }

    return outBuffer;
  },

  deleteRange: (ctx: AudioContext, buf: AudioBuffer, startPct: number, endPct: number): AudioBuffer | null => {
    if (!buf || !ctx) return null;
    const start = Math.floor(buf.length * startPct);
    const end = Math.floor(buf.length * endPct);
    const newLen = buf.length - (end - start);
    if (newLen <= 0) return ctx.createBuffer(1, 100, buf.sampleRate);
    const newBuf = ctx.createBuffer(buf.numberOfChannels, newLen, buf.sampleRate);
    for (let i = 0; i < buf.numberOfChannels; i++) {
      const ch = newBuf.getChannelData(i);
      const oldCh = buf.getChannelData(i);
      const pre = oldCh.slice(0, start);
      const post = oldCh.slice(end);
      ch.set(pre);
      ch.set(post, start);
    }
    return newBuf;
  },

  mixBuffersAtTime: (ctx: AudioContext, base: AudioBuffer, overlay: AudioBuffer, startSample: number): AudioBuffer => {
    const numChannels = Math.max(base.numberOfChannels, overlay.numberOfChannels);
    const length = Math.max(base.length, startSample + overlay.length);
    const newBuf = ctx.createBuffer(numChannels, length, base.sampleRate);
    for (let i = 0; i < numChannels; i++) {
      const channelData = newBuf.getChannelData(i);
      if (i < base.numberOfChannels) channelData.set(base.getChannelData(i));
      if (i < overlay.numberOfChannels) {
        const overlayData = overlay.getChannelData(i);
        for (let j = 0; j < overlay.length; j++) {
          const idx = startSample + j;
          if (idx < length) channelData[idx] += overlayData[j];
        }
      }
    }
    return newBuf;
  },

  convolveBuffers: async (_ctx: AudioContext, source: AudioBuffer, impulse: AudioBuffer, mix: number): Promise<AudioBuffer> => {
    const offline = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate);
    const convolver = offline.createConvolver();
    convolver.buffer = impulse;
    const srcNode = offline.createBufferSource();
    srcNode.buffer = source;
    const dry = offline.createGain(); const wet = offline.createGain();
    dry.gain.value = 1 - mix; wet.gain.value = mix;
    srcNode.connect(dry); srcNode.connect(convolver);
    convolver.connect(wet); dry.connect(offline.destination); wet.connect(offline.destination);
    srcNode.start();
    return await offline.startRendering();
  },

  applyStretch: async (buf: AudioBuffer, ratio: number): Promise<AudioBuffer> => {
    const offline = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(buf.length / ratio), buf.sampleRate);
    const source = offline.createBufferSource();
    source.buffer = buf;
    source.playbackRate.value = ratio;
    source.connect(offline.destination);
    source.start(0);
    return await offline.startRendering();
  },

  // --- Neural-style High Resolution Vocoder ---
  applyVocoder: async (ctx: AudioContext, carrier: AudioBuffer, modulator: AudioBuffer, bandsCount: number = 80, resynthesisMode: boolean = true): Promise<AudioBuffer> => {
    const duration = Math.min(carrier.duration, modulator.duration);
    const sampleRate = ctx.sampleRate;
    const offline = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);

    // Neural Vocoders use Mel-scale (Logarithmic focus on speech range)
    const melBands = [];
    const minFreq = 80;
    const maxFreq = 16000;
    for (let i = 0; i < bandsCount; i++) {
      const f = minFreq * Math.pow(maxFreq / minFreq, i / (bandsCount - 1));
      melBands.push(f);
    }

    const carrierSource = offline.createBufferSource();
    carrierSource.buffer = carrier;
    const modulatorSource = offline.createBufferSource();
    modulatorSource.buffer = modulator;

    const outGain = offline.createGain();
    outGain.connect(offline.destination);

    // For Realistic Texture: High-resolution spectral tracking
    const modData = modulator.getChannelData(0);
    const step = Math.floor(sampleRate * 0.005); // 5ms high resolution window

    melBands.forEach((freq) => {
      const q = resynthesisMode ? 15 : 10;

      const modFilter = offline.createBiquadFilter();
      modFilter.type = 'bandpass';
      modFilter.frequency.value = freq;
      modFilter.Q.value = q;

      const carFilter = offline.createBiquadFilter();
      carFilter.type = 'bandpass';
      carFilter.frequency.value = freq;
      carFilter.Q.value = q;

      const vca = offline.createGain();
      vca.gain.value = 0;

      modulatorSource.connect(modFilter);

      // Advanced Envelope Following for Speech Artifacts (Breath, Sibilance)
      for (let t = 0; t < duration; t += 0.005) {
        const sampleIdx = Math.floor(t * sampleRate);
        let sum = 0;
        for (let j = 0; j < step && (sampleIdx + j) < modData.length; j++) {
          sum += Math.abs(modData[sampleIdx + j]);
        }
        // Dynamic sensitivity based on frequency (higher for high frequencies to capture 'S', 'T' textures)
        const sensitivity = 20 * (1 + (freq / 10000));
        const env = (sum / step) * sensitivity;
        vca.gain.linearRampToValueAtTime(Math.min(3, env), t);
      }

      carrierSource.connect(carFilter);
      carFilter.connect(vca);
      vca.connect(outGain);
    });

    carrierSource.start(0);
    modulatorSource.start(0);
    return await offline.startRendering();
  },

  // HiFi-GAN etc. External Tool Support: Export Mel-Spectrogram (Placeholder for JSON export)
  generateMelData: (buffer: AudioBuffer, bands: number = 80): number[][] => {
    const data = buffer.getChannelData(0);
    const step = 512;
    const spectrogram = [];
    for (let i = 0; i < data.length; i += step) {
      const frame = [];
      for (let b = 0; b < bands; b++) frame.push(Math.random()); // In a real scenario, FFT results mapped to Mel scale
      spectrogram.push(frame);
    }
    return spectrogram;
  },

  bufferToWavBlob: (buffer: AudioBuffer): Blob => {
    const numberOfChannels = 1;
    const length = buffer.length * numberOfChannels * 2 + 44;
    const bufferArr = new ArrayBuffer(length); const view = new DataView(bufferArr);
    let pos = 0;
    const setUint32 = (d: number) => { view.setUint32(pos, d, true); pos += 4; };
    const setUint16 = (d: number) => { view.setUint16(pos, d, true); pos += 2; };
    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66);
    setUint32(16); setUint16(1); setUint16(numberOfChannels); setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numberOfChannels); setUint16(numberOfChannels * 2); setUint16(16);
    setUint32(0x61746164); setUint32(length - pos - 4);
    let offset = 0; const chs = []; for (let i = 0; i < buffer.numberOfChannels; i++) chs.push(buffer.getChannelData(i));
    while (pos < length) {
      let sum = 0; for (let i = 0; i < buffer.numberOfChannels; i++) sum += chs[i][offset];
      let s = Math.max(-1, Math.min(1, sum / buffer.numberOfChannels));
      s = (s < 0 ? s * 32768 : s * 32767) | 0; view.setInt16(pos, s, true); pos += 2; offset++;
    }
    return new Blob([bufferArr], { type: 'audio/wav' });
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
    const cosW0 = Math.cos(w0); const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * q); const A = Math.pow(10, gain / 40);
    let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    if (type === 'peaking') { b0 = 1 + alpha * A; b1 = -2 * cosW0; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cosW0; a2 = 1 - alpha / A; }
    else if (type === 'lowshelf') { b0 = A * ((A + 1) - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha); b1 = 2 * A * ((A - 1) - (A + 1) * cosW0); b2 = A * ((A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha); a0 = (A + 1) + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha; a1 = -2 * ((A - 1) + (A + 1) * cosW0); a2 = (A + 1) + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha; }
    else if (type === 'highshelf') { b0 = A * ((A + 1) + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha); b1 = -2 * A * ((A - 1) + (A + 1) * cosW0); b2 = A * ((A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha); a0 = (A + 1) - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha; a1 = 2 * ((A - 1) - (A + 1) * cosW0); a2 = (A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha; }
    else if (type === 'lowpass') { b0 = (1 - cosW0) / 2; b1 = 1 - cosW0; b2 = (1 - cosW0) / 2; a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha; }
    else if (type === 'highpass') { b0 = (1 + cosW0) / 2; b1 = -(1 + cosW0); b2 = (1 + cosW0) / 2; a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha; }
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    const w = 2 * Math.PI * freq / sampleRate;
    const cosW = Math.cos(w); const cos2W = Math.cos(2 * w); const sinW = Math.sin(w); const sin2W = Math.sin(2 * w);
    const numReal = b0 + b1 * cosW + b2 * cos2W; const numImag = b1 * sinW + b2 * sin2W;
    const denReal = 1 + a1 * cosW + a2 * cos2W; const denImag = a1 * sinW + a2 * sin2W;
    return Math.sqrt((numReal * numReal + numImag * numImag) / (denReal * denReal + denImag * denImag));
  },

  analyzeFormants: (buffer: AudioBuffer, windowSize: number = 0.025, stepSize: number = 0.01): { t: number, f1: number, f2: number, f3: number, energy: number, zcr: number }[] => {
    const sr = buffer.sampleRate; const data = buffer.getChannelData(0);
    const nWin = Math.floor(windowSize * sr); const nStep = Math.floor(stepSize * sr);
    const results = []; const order = 16;
    for (let i = 0; i < data.length - nWin; i += nStep) {
      const segment = new Float32Array(nWin); let sumSq = 0; let zcrCount = 0;
      for (let j = 0; j < nWin; j++) {
        const raw = data[i + j];
        if (j > 0 && ((raw >= 0 && data[i + j - 1] < 0) || (raw < 0 && data[i + j - 1] >= 0))) zcrCount++;
        const val = (j > 0) ? raw - 0.95 * data[i + j - 1] : raw;
        segment[j] = val * (0.54 - 0.46 * Math.cos((2 * Math.PI * j) / (nWin - 1)));
        sumSq += segment[j] * segment[j];
      }
      const rms = Math.sqrt(sumSq / nWin); const zcr = zcrCount / nWin;
      const r = new Float32Array(order + 1);
      for (let k = 0; k <= order; k++) {
        let sum = 0; for (let j = 0; j < nWin - k; j++) sum += segment[j] * segment[j + k];
        r[k] = sum;
      }
      const a = new Float32Array(order + 1); const e = new Float32Array(order + 1);
      a[0] = 1; e[0] = r[0];
      for (let k = 1; k <= order; k++) {
        let lambda = 0; for (let j = 0; j < k; j++) lambda -= a[j] * r[k - j];
        lambda /= e[k - 1]; const prevA = Float32Array.from(a);
        for (let j = 1; j < k; j++) a[j] = prevA[j] + lambda * prevA[k - j];
        a[k] = lambda; e[k] = e[k - 1] * (1 - lambda * lambda);
      }
      const peaks = []; let prevMag = 0; let prevSlope = 0;
      for (let f = 50; f < 5500; f += 10) {
        const w = 2 * Math.PI * f / sr; let re = 0, im = 0;
        for (let k = 0; k <= order; k++) { re += a[k] * Math.cos(k * w); im -= a[k] * Math.sin(k * w); }
        const mag = 1 / Math.sqrt(re * re + im * im); const slope = mag - prevMag;
        if (prevSlope > 0 && slope < 0) peaks.push({ f: f - 10, mag: prevMag });
        prevMag = mag; prevSlope = slope;
      }
      peaks.sort((x, y) => x.f - y.f); let f1 = 0, f2 = 0, f3 = 0;
      const last = results.length > 0 ? results[results.length - 1] : { f1: 500, f2: 1500, f3: 2500 };
      const p1 = peaks.find(p => p.f >= 150 && p.f < 1100);
      if (p1) {
        f1 = p1.f; const p2 = peaks.find(p => p.f > f1 + 200 && p.f < 3000);
        if (p2) { f2 = p2.f; const p3 = peaks.find(p => p.f > f2 + 400 && p.f < 5200); f3 = p3 ? p3.f : Math.max(f2 + 400, last.f3); }
        else { f2 = Math.max(f1 + 200, last.f2); f3 = Math.max(f2 + 600, last.f3); }
      } else { f1 = last.f1; f2 = last.f2; f3 = last.f3; }
      results.push({ t: i / sr, f1, f2, f3, energy: rms, zcr });
    }
    return results;
  },

  detectPitch: (buffer: AudioBuffer, sensitivity: number): { t: number, v: number }[] => {
    const data = buffer.getChannelData(0); const sr = buffer.sampleRate;
    const windowSize = 2048; const step = 1024; const results = [];
    for (let i = 0; i < data.length - windowSize; i += step) {
      const segment = data.slice(i, i + windowSize);
      let sumSq = 0; for (let s of segment) sumSq += s * s;
      if (Math.sqrt(sumSq / windowSize) < 0.02) continue;
      let bestOffset = -1; let maxCorr = -1;
      for (let offset = Math.floor(sr / 600); offset < Math.floor(sr / 50); offset++) {
        let correlation = 0; for (let j = 0; j < windowSize - offset; j++) correlation += segment[j] * segment[j + offset];
        if (correlation > maxCorr) { maxCorr = correlation; bestOffset = offset; }
      }
      if (bestOffset !== -1) { const freq = sr / bestOffset; if (freq >= 50 && freq <= 600) results.push({ t: i / sr, v: freq }); }
    }
    return AudioUtils.simplifyPoints(results, sensitivity);
  },

  computeSpectrogram: (buffer: AudioBuffer, width: number, height: number): Uint8ClampedArray | null => {
    const data = buffer.getChannelData(0); const fftSize = 256; const binCount = fftSize / 2;
    const step = Math.floor(data.length / width); const result = new Uint8ClampedArray(width * height * 4);
    const window = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    for (let x = 0; x < width; x++) {
      const startIdx = x * step; if (startIdx + fftSize >= data.length) break;
      const real = new Float32Array(binCount); const imag = new Float32Array(binCount);
      for (let k = 0; k < binCount; k++) {
        for (let n = 0; n < fftSize; n++) {
          const val = data[startIdx + n] * window[n]; const angle = (2 * Math.PI * k * n) / fftSize;
          real[k] += val * Math.cos(angle); imag[k] -= val * Math.sin(angle);
        }
      }
      for (let y = 0; y < height; y++) {
        const binIdx = Math.floor(((height - 1 - y) / height) * binCount * 0.8);
        if (binIdx >= binCount) continue;
        const mag = Math.sqrt(real[binIdx] ** 2 + imag[binIdx] ** 2);
        const intensity = Math.min(255, Math.log10(mag + 1) * 60);
        const pxIdx = (y * width + x) * 4;
        result[pxIdx] = 30 + intensity * 0.5; result[pxIdx + 1] = 40 + intensity * 0.8; result[pxIdx + 2] = 50 + intensity;
        result[pxIdx + 3] = intensity > 10 ? Math.min(255, intensity * 2) : 0;
      }
    }
    return result;
  },

  simplifyPoints: (points: { t: number, v: number }[], sensitivity: number): { t: number, v: number }[] => {
    if (points.length < 3) return points;
    const tolerance = 1 + (1 - sensitivity) * 50;
    const simplify = (pts: { t: number, v: number }[]): { t: number, v: number }[] => {
      if (pts.length < 3) return pts;
      let maxSqDist = 0; let index = 0; const end = pts.length - 1;
      for (let i = 1; i < end; i++) {
        const dx = pts[end].t - pts[0].t; const dy = pts[end].v - pts[0].v;
        let num = Math.abs(dy * pts[i].t - dx * pts[i].v + pts[end].t * pts[0].v - pts[end].v * pts[0].t);
        let sqDist = (num / Math.sqrt(dx * dx + dy * dy)) ** 2;
        if (sqDist > maxSqDist) { maxSqDist = sqDist; index = i; }
      }
      if (maxSqDist > (tolerance * tolerance)) {
        const res1 = simplify(pts.slice(0, index + 1));
        const res2 = simplify(pts.slice(index));
        return [...res1.slice(0, -1), ...res2];
      } else return [pts[0], pts[end]];
    };
    return simplify(points);
  }
};
