
export interface AudioFile {
  id: string;
  name: string;
  buffer: AudioBuffer;
}

export interface KeyframePoint {
  t: number;
  v: number;
}

export interface AdvTrack {
  id: string;
  name: string;
  group: 'adj' | 'edit';
  color: string;
  points: KeyframePoint[];
  min: number;
  max: number;
}

export interface LiveTractState {
  x: number;
  y: number;
  lips: number;
  lipLen: number;
  throat: number;
  nasal: number;
}

export interface LarynxParams {
  jitterOn: boolean;
  jitterDepth: number;
  jitterRate: number;
  breathOn: boolean;
  breathGain: number;
  noiseSourceType: string;
  noiseSourceFileId: string;
  loopOn: boolean;
}

export interface FormantParams {
  f1: number;
  f2: number;
  f3: number;
  f4: number;
  resonance: number;
}

export interface EQParams {
  low: number;
  mid: number;
  high: number;
}

export interface EQBand {
  id: number;
  type: BiquadFilterType;
  freq: number;
  gain: number;
  q: number;
  on: boolean;
}
