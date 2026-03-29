type FrqPoint = { t: number; f0: number; amp: number };

const detectPitchCurve = (
  data: Float32Array,
  sampleRate: number,
  windowMs: number = 30,
  stepSamples: number = 256,
  interpolate: boolean = false,
  forcePitch: number | null = null
): FrqPoint[] => {
  const windowSize = Math.floor(sampleRate * (windowMs / 1000));
  const stepSize = stepSamples;
  const results: FrqPoint[] = [];

  const minOffset = Math.floor(sampleRate / 1000);
  const maxOffset = Math.floor(sampleRate / 50);

  for (let i = 0; i < data.length - windowSize; i += stepSize) {
    let maxCorr = 0;
    let bestOffset = -1;
    let energy = 0;

    for (let j = 0; j < windowSize; j++) energy += data[i + j] * data[i + j];

    let pitch = 0;
    if (forcePitch !== null && forcePitch > 0) {
      pitch = forcePitch;
    } else if (energy / windowSize >= 0.0001) {
      for (let offset = minOffset; offset < maxOffset; offset++) {
        let correlation = 0;
        for (let j = 0; j < windowSize - offset; j++) correlation += data[i + j] * data[i + j + offset];
        if (correlation > maxCorr) {
          maxCorr = correlation;
          bestOffset = offset;
        }
      }
      if (bestOffset !== -1) {
        const expectedAuto = energy;
        if (expectedAuto > 0 && (maxCorr / expectedAuto) > 0.2) pitch = sampleRate / bestOffset;
      }
    }

    const rmsAmp = Math.sqrt(energy / windowSize);
    const finalAmp = (forcePitch !== null && rmsAmp < 0.0001) ? 10 : rmsAmp * 1000;
    results.push({ t: i / sampleRate, f0: pitch, amp: finalAmp });
  }

  if (interpolate && results.length > 0) {
    let lastValidIdx = -1;
    for (let i = 0; i < results.length; i++) {
      if (results[i].f0 > 0) {
        if (lastValidIdx !== -1 && i - lastValidIdx > 1) {
          const startF0 = results[lastValidIdx].f0;
          const endF0 = results[i].f0;
          const steps = i - lastValidIdx;
          const f0Step = (endF0 - startF0) / steps;
          for (let j = 1; j < steps; j++) results[lastValidIdx + j].f0 = startF0 + f0Step * j;
        } else if (lastValidIdx === -1 && i > 0) {
          for (let j = 0; j < i; j++) results[j].f0 = results[i].f0;
        }
        lastValidIdx = i;
      }
    }
    if (lastValidIdx !== -1 && lastValidIdx < results.length - 1) {
      for (let j = lastValidIdx + 1; j < results.length; j++) results[j].f0 = results[lastValidIdx].f0;
    }
  }

  return results;
};

const getFrqAvg = (curve: FrqPoint[]): number => {
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
};

const generateFrqBuffer = (curve: FrqPoint[], stepSamples: number): ArrayBuffer => {
  const headerSize = 40;
  const numFrames = curve.length;
  const bufferSize = headerSize + numFrames * 16;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const magic = 'FREQ0003';
  for (let i = 0; i < magic.length; i++) view.setUint8(i, magic.charCodeAt(i));

  view.setInt32(8, stepSamples, true);
  const avgFrq = getFrqAvg(curve);
  view.setFloat64(12, avgFrq, true);
  view.setInt32(36, numFrames, true);

  for (let i = 0; i < numFrames; i++) {
    const offset = headerSize + i * 16;
    view.setFloat64(offset, curve[i].f0, true);
    view.setFloat64(offset + 8, curve[i].amp, true);
  }

  return arrayBuffer;
};

self.onmessage = (e: MessageEvent) => {
  const { id, samples, sampleRate, windowMs, stepSamples, interpolate, forcePitch } = e.data || {};
  try {
    const curve = detectPitchCurve(samples as Float32Array, sampleRate, windowMs, stepSamples, interpolate, forcePitch);
    if (!curve.length) {
      (self as any).postMessage({ id, buffer: null });
      return;
    }
    const buffer = generateFrqBuffer(curve, stepSamples);
    (self as any).postMessage({ id, buffer }, [buffer]);
  } catch (err: any) {
    (self as any).postMessage({ id, error: err?.message || 'FRQ worker error' });
  }
};
