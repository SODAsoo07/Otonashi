export type BiquadType = 'peaking' | 'lowpass' | 'bandpass';

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function clampFrequency(frequencyHz: number, sampleRate: number): number {
  return Math.max(1, Math.min(sampleRate * 0.49, frequencyHz));
}

function normalize(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): BiquadCoefficients {
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

export function createBiquadCoefficients(
  type: BiquadType,
  frequencyHz: number,
  q: number,
  sampleRate: number,
  gainDb = 0,
): BiquadCoefficients {
  const frequency = clampFrequency(frequencyHz, sampleRate);
  const safeQ = Math.max(0.001, q);
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * safeQ);

  if (type === 'peaking') {
    const a = Math.pow(10, gainDb / 40);
    return normalize(
      1 + alpha * a,
      -2 * cosW0,
      1 - alpha * a,
      1 + alpha / a,
      -2 * cosW0,
      1 - alpha / a,
    );
  }

  if (type === 'lowpass') {
    return normalize(
      (1 - cosW0) / 2,
      1 - cosW0,
      (1 - cosW0) / 2,
      1 + alpha,
      -2 * cosW0,
      1 - alpha,
    );
  }

  return normalize(
    alpha,
    0,
    -alpha,
    1 + alpha,
    -2 * cosW0,
    1 - alpha,
  );
}

export class BiquadFilter {
  private z1 = 0;
  private z2 = 0;

  constructor(private coeffs: BiquadCoefficients) {}

  process(input: number): number {
    const out = this.coeffs.b0 * input + this.z1;
    this.z1 = this.coeffs.b1 * input - this.coeffs.a1 * out + this.z2;
    this.z2 = this.coeffs.b2 * input - this.coeffs.a2 * out;
    return Number.isFinite(out) ? out : 0;
  }
}
