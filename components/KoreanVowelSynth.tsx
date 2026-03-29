import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Volume2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { LiveTractState } from '../types';

type NoisePreset = 'white' | 'pink' | 'brown';
type BlendWave = 'sawtooth' | 'sine' | 'square' | 'noise';
type SynthBlend = Record<BlendWave, number>;

export type VowelSynthFrame = { f1: number; f2: number; durMs: number; consonant?: string | null; coda?: string | null };
export type CustomConsonantProfile = {
  name: string;
  baseName: string;
  freqScale: number;
  durScale: number;
  aspirScale: number;
  ampScale: number;
  customNoiseName?: string;
  customNoiseBuffer?: AudioBuffer;
};

interface KoreanVowelSynthProps {
  audioContext: AudioContext;
  liveTract: LiveTractState;
  manualPitch: number;
  setManualPitch: React.Dispatch<React.SetStateAction<number>>;
  synthWaveform: 'blend' | 'noise' | 'sawtooth' | 'sine' | 'square';
  setSynthWaveform: React.Dispatch<React.SetStateAction<'blend' | 'noise' | 'sawtooth' | 'sine' | 'square'>>;
  synthBlend: SynthBlend;
  setSynthBlend: React.Dispatch<React.SetStateAction<SynthBlend>>;
  noisePreset: NoisePreset;
  setNoisePreset: (v: NoisePreset) => void;
  onFormantChange: (f1: number, f2: number) => void;
  onRecordSnapshot: () => void;
  onRecordTts: (frames: VowelSynthFrame[], totalDurationSec: number) => void;
  onRecordConsonant: () => void;
  onCustomConsonantsChange?: (items: CustomConsonantProfile[]) => void;
  consonantBoostOn: boolean;
  setConsonantBoostOn: React.Dispatch<React.SetStateAction<boolean>>;
  autoExtendDuration: boolean;
  setAutoExtendDuration: React.Dispatch<React.SetStateAction<boolean>>;
  selectedConsonantName: string | null;
  setSelectedConsonantName: React.Dispatch<React.SetStateAction<string | null>>;
  selectedJongName: string | null;
  setSelectedJongName: React.Dispatch<React.SetStateAction<string | null>>;
  onPreviewPlayingChange?: (isPlaying: boolean) => void;
}

type ConsonantType = 'plosive' | 'fricative' | 'affricate' | 'nasal' | 'liquid';

type Consonant = {
  name: string;
  recordAs?: string;
  customNoiseName?: string;
  customNoiseBuffer?: AudioBuffer;
  type: ConsonantType;
  place: 'velar' | 'alveolar' | 'bilabial' | 'palatal' | 'glottal';
  aspirated: boolean;
  noiseAmp?: number;
  burstFreq?: number;
  burstBW?: number;
  burstDur?: number;
  aspirDur?: number;
  fricFreq?: number;
  fricBW?: number;
  fricDur?: number;
  nasalFreq?: number;
  nasalDur?: number;
  tapDur?: number;
  silenceDur?: number;
};

type CustomConsonantDraft = {
  name: string;
  baseName: string;
  freqScale: number;
  durScale: number;
  aspirScale: number;
  ampScale: number;
};
type CustomConsonantEntry = Consonant & CustomConsonantProfile;

type VowelPoint = {
  f1: number;
  f2: number;
  label: string;
  korean?: string | null;
};

type PlayNodes = {
  oscillators: OscillatorNode[];
  noiseVoice?: AudioBufferSourceNode;
  oscGain: GainNode;
  f1: BiquadFilterNode;
  f2: BiquadFilterNode;
  f3: BiquadFilterNode;
  f4: BiquadFilterNode;
  lpf: BiquadFilterNode;
  bef: BiquadFilterNode;
  noiseSrc?: AudioBufferSourceNode;
  noiseGain?: GainNode;
  noiseBpf?: BiquadFilterNode;
};

const f1min = 250;
const f1max = 1000;
const f2min = 540;
const f2max = 2600;
const f3 = 2500;
const f4 = 3500;
const antiF = 5000;
const cutoff = 7250;
const basePitch = 131;

const consonants: Consonant[] = [
  { name: 'ㄱ', type: 'plosive', place: 'velar', aspirated: false, burstFreq: 1800, burstBW: 600, burstDur: 15, aspirDur: 0 },
  { name: 'ㅋ', type: 'plosive', place: 'velar', aspirated: true, burstFreq: 1800, burstBW: 600, burstDur: 15, aspirDur: 80 },
  { name: 'ㅇ', type: 'nasal', place: 'velar', aspirated: false, nasalFreq: 250, nasalDur: 80 },
  { name: 'ㄴ', type: 'nasal', place: 'alveolar', aspirated: false, nasalFreq: 250, nasalDur: 80 },
  { name: 'ㄷ', type: 'plosive', place: 'alveolar', aspirated: false, burstFreq: 3500, burstBW: 1200, burstDur: 15, aspirDur: 0 },
  { name: 'ㅌ', type: 'plosive', place: 'alveolar', aspirated: true, burstFreq: 3500, burstBW: 1200, burstDur: 15, aspirDur: 80 },
  { name: 'ㄹ', type: 'liquid', place: 'alveolar', aspirated: false, tapDur: 20, silenceDur: 10 },
  { name: 'ㅁ', type: 'nasal', place: 'bilabial', aspirated: false, nasalFreq: 250, nasalDur: 80 },
  { name: 'ㅂ', type: 'plosive', place: 'bilabial', aspirated: false, burstFreq: 600, burstBW: 800, burstDur: 12, aspirDur: 0 },
  { name: 'ㅍ', type: 'plosive', place: 'bilabial', aspirated: true, burstFreq: 600, burstBW: 800, burstDur: 12, aspirDur: 80 },
  { name: 'ㅅ', type: 'fricative', place: 'alveolar', aspirated: false, fricFreq: 6500, fricBW: 2600, fricDur: 120 },
  { name: 'ㅈ', type: 'affricate', place: 'palatal', aspirated: false, burstFreq: 4200, burstBW: 1680, burstDur: 20, fricDur: 60, aspirDur: 0 },
  { name: 'ㅊ', type: 'affricate', place: 'palatal', aspirated: true, burstFreq: 4200, burstBW: 1680, burstDur: 20, fricDur: 80, aspirDur: 60 },
  { name: 'ㅎ', type: 'fricative', place: 'glottal', aspirated: false, fricFreq: 2000, fricBW: 2000, fricDur: 130 },
];

const vowels: VowelPoint[] = [
  { f1: 275, f2: 2400, label: 'i', korean: 'ㅣ' },
  { f1: 412, f2: 2150, label: 'e', korean: 'ㅔ' },
  { f1: 620, f2: 1800, label: 'ɛ', korean: 'ㅐ' },
  { f1: 900, f2: 1350, label: 'a', korean: 'ㅏ' },
  { f1: 710, f2: 1050, label: 'ɑ', korean: 'ㅏ' },
  { f1: 530, f2: 830, label: 'ɔ', korean: 'ㅗ' },
  { f1: 380, f2: 690, label: 'o', korean: 'ㅗ' },
  { f1: 275, f2: 600, label: 'u', korean: 'ㅜ' },
  { f1: 275, f2: 1860, label: 'y', korean: 'ㅟ' },
  { f1: 400, f2: 1730, label: 'ø', korean: 'ㅚ' },
  { f1: 590, f2: 1550, label: 'œ', korean: 'ㅚ' },
  { f1: 560, f2: 1140, label: 'ʌ', korean: 'ㅓ' },
  { f1: 390, f2: 1170, label: 'ɤ', korean: 'ㅡ' },
  { f1: 275, f2: 1200, label: 'ɯ', korean: 'ㅡ' },
  { f1: 490, f2: 1350, label: 'ə', korean: 'ㅓ' },
  { f1: 340, f2: 1400, label: 'ɵ' },
  { f1: 700, f2: 1300, label: 'ɐ' },
  { f1: 340, f2: 2020, label: 'ɪ', korean: 'ㅣ' },
  { f1: 330, f2: 850, label: 'ʊ', korean: 'ㅜ' },
  { f1: 760, f2: 1600, label: '(æ)', korean: 'ㅐ' },
  { f1: 620, f2: 930, label: '(ɒ)' },
];

const jongParams: Record<string, { type: 'stop' | 'nasal' | 'liquid'; place: string; dur: number; nasalFreq?: number }> = {
  'ㄱ': { type: 'stop', place: 'velar', dur: 80 },
  'ㄷ': { type: 'stop', place: 'alveolar', dur: 80 },
  'ㅂ': { type: 'stop', place: 'bilabial', dur: 80 },
  'ㄴ': { type: 'nasal', place: 'alveolar', dur: 120, nasalFreq: 250 },
  'ㅁ': { type: 'nasal', place: 'bilabial', dur: 120, nasalFreq: 250 },
  'ㅇ': { type: 'nasal', place: 'velar', dur: 120, nasalFreq: 280 },
  'ㄹ': { type: 'liquid', place: 'alveolar', dur: 100 },
};

// Korean vowel preset targets tuned around the original reference ranges,
// but shifted toward practical spoken centers for more natural playback.
const vowelMap: Record<string, { f1: number; f2: number }> = {
  'ㅏ': { f1: 860, f2: 1300 },
  'ㅐ': { f1: 690, f2: 1720 },
  'ㅓ': { f1: 540, f2: 1180 },
  'ㅔ': { f1: 470, f2: 1950 },
  'ㅗ': { f1: 470, f2: 860 },
  'ㅜ': { f1: 330, f2: 760 },
  'ㅡ': { f1: 350, f2: 1220 },
  'ㅣ': { f1: 300, f2: 2250 },
  'ㅚ': { f1: 430, f2: 1680 },
  'ㅟ': { f1: 300, f2: 1820 },
};

const doubleVowels: Record<string, string[]> = {
  'ㅑ': ['ㅣ', 'ㅏ'], 'ㅒ': ['ㅣ', 'ㅐ'],
  'ㅕ': ['ㅣ', 'ㅓ'], 'ㅖ': ['ㅣ', 'ㅔ'],
  'ㅛ': ['ㅣ', 'ㅗ'], 'ㅠ': ['ㅣ', 'ㅜ'],
  'ㅘ': ['ㅗ', 'ㅏ'], 'ㅙ': ['ㅗ', 'ㅐ'],
  'ㅚ': ['ㅗ', 'ㅣ'], 'ㅝ': ['ㅜ', 'ㅓ'],
  'ㅞ': ['ㅜ', 'ㅔ'], 'ㅟ': ['ㅜ', 'ㅣ'],
  'ㅢ': ['ㅡ', 'ㅣ'],
};

const choList = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const jungList = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const jongList = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

const decomposeHangul = (char: string) => {
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  const offset = code - 0xac00;
  const choIdx = Math.floor(offset / (21 * 28));
  const jungIdx = Math.floor((offset % (21 * 28)) / 28);
  const jongIdx = offset % 28;

  let jong: string | null = null;
  if (jongIdx > 0) {
    const jongToRep: Record<number, string> = {
      1:'ㄱ', 2:'ㄱ', 3:'ㄱ', 9:'ㄱ', 24:'ㄱ',
      4:'ㄴ', 5:'ㄴ', 6:'ㄴ',
      7:'ㄷ', 19:'ㄷ', 20:'ㄷ', 22:'ㄷ', 23:'ㄷ', 25:'ㄷ', 27:'ㄷ',
      8:'ㄹ', 11:'ㄹ', 12:'ㄹ', 13:'ㄹ', 15:'ㄹ',
      10:'ㅁ', 16:'ㅁ',
      14:'ㅂ', 17:'ㅂ', 18:'ㅂ', 26:'ㅂ',
      21:'ㅇ',
    };
    jong = jongToRep[jongIdx] || null;
  }

  return { cho: choList[choIdx], jung: jungList[jungIdx], jong };
};

const decomposeVowel = (jung: string) => doubleVowels[jung] || [jung];

const getVowelFormants = (vowel: string) => vowelMap[vowel] || { f1: 490, f2: 1350 };

const composeHangul = (cho: string, jung: string, jong?: string | null) => {
  const choIdx = choList.indexOf(cho);
  const jungIdx = jungList.indexOf(jung);
  if (choIdx < 0 || jungIdx < 0) return `${cho}${jung}${jong || ''}`;
  let jongIdx = jong ? jongList.indexOf(jong) : 0;
  if (jongIdx < 0) jongIdx = 0;
  return String.fromCharCode(0xac00 + choIdx * 21 * 28 + jungIdx * 28 + jongIdx);
};

const getF2Locus = (consonant: Consonant | null) => {
  if (!consonant) return null;
  switch (consonant.place) {
    case 'bilabial': return 650;
    case 'alveolar': return 1800;
    case 'palatal': return 2300;
    case 'velar': return 3000;
    case 'glottal': return 1500;
    default: return 1500;
  }
};

const getConsonantOnsetDurationMs = (consonant: Consonant | null) => {
  if (!consonant) return 0;
  if (consonant.type === 'plosive') return (consonant.burstDur || 0) + (consonant.aspirated ? (consonant.aspirDur || 0) : 0) + 35;
  if (consonant.type === 'fricative') return (consonant.fricDur || 0) + 45;
  if (consonant.type === 'affricate') return (consonant.burstDur || 0) + (consonant.fricDur || 0) + (consonant.aspirated ? (consonant.aspirDur || 0) : 0) + 45;
  if (consonant.type === 'nasal') return (consonant.nasalDur || 0) + 18;
  if (consonant.type === 'liquid') return (consonant.tapDur || 0) + (consonant.silenceDur || 0) + 16;
  return 0;
};

const getConsonantOverlapMs = (consonant: Consonant | null) => {
  if (!consonant) return 0;
  if (consonant.type === 'plosive') return consonant.aspirated ? 44 : 36;
  if (consonant.type === 'fricative') return 24;
  if (consonant.type === 'affricate') return consonant.aspirated ? 40 : 32;
  if (consonant.type === 'nasal') return 22;
  if (consonant.type === 'liquid') return 18;
  return 20;
};

const getTransitionMs = (consonant: Consonant | null) => {
  if (!consonant || consonant.name === 'ㅇ') return 24;
  if (consonant.type === 'plosive') return 70;
  if (consonant.type === 'affricate') return 64;
  if (consonant.type === 'fricative') return 56;
  if (consonant.type === 'nasal') return 46;
  if (consonant.type === 'liquid') return 42;
  return 50;
};

const TTS_CODA_DURATION_SCALE = 0.9;

const getCodaDurationMs = (jong: string | null, scale: number = 1) => {
  if (!jong) return 0;
  const base = jongParams[jong]?.dur ?? 80;
  if (jong === 'ㄱ' || jong === 'ㄷ' || jong === 'ㅂ') {
    const raw = Math.max(22, Math.round(base * 0.28));
    return Math.max(16, Math.round(raw * scale));
  }
  return Math.max(24, Math.round(base * scale));
};

const createNoiseBuffer = (ctx: AudioContext, durationSec: number, preset: NoisePreset) => {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (preset === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = Math.max(-1, Math.min(1, pink * 0.11));
    }
    return buffer;
  }

  if (preset === 'brown') {
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = Math.max(-1, Math.min(1, last * 3.5));
    }
    return buffer;
  }

  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

const KoreanVowelSynth: React.FC<KoreanVowelSynthProps> = ({
  audioContext,
  liveTract,
  manualPitch,
  setManualPitch,
  synthWaveform,
  setSynthWaveform,
  synthBlend,
  setSynthBlend,
  noisePreset,
  setNoisePreset,
    onFormantChange,
    onRecordSnapshot,
    onRecordTts,
    onRecordConsonant,
    onCustomConsonantsChange,
    consonantBoostOn,
    setConsonantBoostOn,
    autoExtendDuration,
  setAutoExtendDuration,
  selectedConsonantName,
  setSelectedConsonantName,
  selectedJongName,
  setSelectedJongName,
  onPreviewPlayingChange,
}) => {
  const { language } = useLanguage();
  const text = useMemo(() => {
    if (language === 'ja') {
      return {
        title: '韓国語 フォルマント 合成',
        subtitle: 'F1/F2 グラフで母音を作り、子音/終声を合成します。',
        consonantTitle: '초성(子音)',
        jongTitle: '받침(終声)',
        ttsLabel: 'テキスト読み上げ',
        ttsPlaceholder: '韓国語入力...',
        play: '再生',
        stop: '停止',
        record: '記録',
        pitch: '周波数',
        waveform: '波形',
        waveBlend: '波形ブレンド',
        noisePreset: 'ノイズ種別',
        whiteNoise: 'ホワイト',
        pinkNoise: 'ピンク',
        brownNoise: 'ブラウン',
        autoExtend: '再生長さに合わせて延長',
        formantTab: '母音フォルマント',
        consonantTab: '子音/母音プリセット',
        controlsTab: '周波数/波形/ノイズ',
        recordConsonant: '子音記録',
        recordPronunciation: '発音記録',
        consonantBoost: '子音補正強化',
        vowelPresetLabel: '母音プリセット',
        consonantPresetLabel: '子音プリセット',
        codaPresetLabel: '終声プリセット',
        customConsonantLabel: 'カスタム子音',
        customName: '名前',
        baseConsonant: '基準子音',
        freqScale: '周波数',
        durScale: '長さ',
        aspirScale: '気息',
        ampScale: '強度',
        customFile: 'カスタム音声',
        clearFile: '解除',
        addCustom: '登録',
        removeCustom: '削除',
        duplicateName: '同じ子音名がすでにあります。',
        timeRatio: '時間比率',
        ttsSpeed: 'TTS 速度',
      };
    }
    if (language === 'en') {
      return {
        title: 'Korean Formant Synth',
        subtitle: 'Create vowels on the F1/F2 chart and add onset/coda consonants.',
        consonantTitle: 'Onset consonant',
        jongTitle: 'Coda consonant',
        ttsLabel: 'Text playback',
        ttsPlaceholder: 'Enter Korean text...',
        play: 'Play',
        stop: 'Stop',
        record: 'Record',
        pitch: 'Pitch',
        waveform: 'Waveform',
        waveBlend: 'Wave Blend',
        noisePreset: 'Noise Preset',
        whiteNoise: 'White',
        pinkNoise: 'Pink',
        brownNoise: 'Brown',
        autoExtend: 'Auto-extend duration',
        formantTab: 'Vowel formant',
        consonantTab: 'Consonant/Vowel presets',
        controlsTab: 'Freq/Wave/Noise',
        recordConsonant: 'Record consonant',
        recordPronunciation: 'Record pronunciation',
        consonantBoost: 'Consonant boost',
        vowelPresetLabel: 'Vowel presets',
        consonantPresetLabel: 'Consonant presets',
        codaPresetLabel: 'Coda presets',
        customConsonantLabel: 'Custom consonants',
        customName: 'Name',
        baseConsonant: 'Base consonant',
        freqScale: 'Frequency',
        durScale: 'Duration',
        aspirScale: 'Aspiration',
        ampScale: 'Intensity',
        customFile: 'Custom audio',
        clearFile: 'Clear',
        addCustom: 'Add',
        removeCustom: 'Delete',
        duplicateName: 'This consonant name already exists.',
        timeRatio: 'Time ratio',
        ttsSpeed: 'TTS speed',
      };
    }
    return {
      title: '한글 모음/자음 합성',
      subtitle: 'F1/F2 그래프에서 모음을 만들고 초성/종성을 합성합니다.',
      consonantTitle: '초성 자음',
      jongTitle: '받침(종성)',
      ttsLabel: '텍스트 읽기',
      ttsPlaceholder: '한글 입력...',
      play: '재생',
      stop: '정지',
      record: '기록',
      pitch: '주파수',
      waveform: '파형',
      waveBlend: '파형 블렌드',
      noisePreset: '노이즈 프리셋',
      whiteNoise: '화이트',
      pinkNoise: '핑크',
      brownNoise: '브라운',
      autoExtend: '재생 길이에 맞춰 자동 연장',
      formantTab: '모음 포먼트',
      consonantTab: '자/모음 프리셋',
      controlsTab: '주파수/파형/노이즈',
      recordConsonant: '자음 기록',
      recordPronunciation: '발음 기록',
      consonantBoost: '자음 보정 강화',
      vowelPresetLabel: '모음 프리셋',
      consonantPresetLabel: '자음 프리셋',
      codaPresetLabel: '받침 프리셋',
      customConsonantLabel: '커스텀 자음',
      customName: '이름',
      baseConsonant: '기반 자음',
      freqScale: '주파수',
      durScale: '길이',
      aspirScale: '기식',
      ampScale: '강도',
      customFile: '커스텀 음성',
      clearFile: '해제',
      addCustom: '등록',
      removeCustom: '삭제',
      duplicateName: '이미 존재하는 자음 이름입니다.',
      timeRatio: '시간 비율',
      ttsSpeed: 'TTS 속도',
    };
  }, [language]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playingRef = useRef(false);
  const nodesRef = useRef<PlayNodes | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const lastTtsFramesRef = useRef<VowelSynthFrame[] | null>(null);
  const lastTtsDurationRef = useRef(0);
  const [customConsonants, setCustomConsonants] = useState<CustomConsonantEntry[]>([]);
  const [customNoiseBuffer, setCustomNoiseBuffer] = useState<AudioBuffer | null>(null);
  const [customNoiseName, setCustomNoiseName] = useState('');
  const [customDraft, setCustomDraft] = useState<CustomConsonantDraft>({
    name: '',
    baseName: 'ㄱ',
    freqScale: 1,
    durScale: 1,
    aspirScale: 1,
    ampScale: 1,
  });
  const consonantRegistry = useMemo(() => [...consonants, ...customConsonants], [customConsonants]);
  const findConsonant = useCallback((name: string) => {
    if (!name) return null;
    const exact = consonantRegistry.find(c => c.name === name);
    if (exact) return exact;
    if (name === 'ㅇ') return null;
    const ssangMap: Record<string, string> = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
    const mapped = ssangMap[name] || name;
    return consonantRegistry.find(c => c.name === mapped) || null;
  }, [consonantRegistry]);

  const selectedConsonant = useMemo(
    () => (selectedConsonantName ? findConsonant(selectedConsonantName) : null),
    [findConsonant, selectedConsonantName]
  );
  useEffect(() => {
    onCustomConsonantsChange?.(customConsonants.map(c => ({
      name: c.name,
      baseName: c.baseName,
      freqScale: c.freqScale,
      durScale: c.durScale,
      aspirScale: c.aspirScale,
      ampScale: c.ampScale,
      customNoiseName: c.customNoiseName,
      customNoiseBuffer: c.customNoiseBuffer,
    })));
  }, [customConsonants, onCustomConsonantsChange]);
  const selectedJong = selectedJongName;
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [currentF1, setCurrentF1] = useState(490);
  const [currentF2, setCurrentF2] = useState(1350);
  const [ttsText, setTtsText] = useState('안녕하세요');
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewLoopRef = useRef(false);
  const previewLoopTimerRef = useRef<number | null>(null);
  const [nearestSyllable, setNearestSyllable] = useState('');
  const ttsPlayingRef = useRef(false);
  const [panelTab, setPanelTab] = useState<'formant' | 'presets' | 'controls'>('formant');
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsTimeRatio, setTtsTimeRatio] = useState(1.0);
  const [selectedVowelPreset, setSelectedVowelPreset] = useState<string | null>(null);
  const formantAnimRef = useRef<number | null>(null);
  const currentF1Ref = useRef(currentF1);
  const currentF2Ref = useRef(currentF2);
  const forceSnapshotRef = useRef(false);
  const lastPresetVowelRef = useRef<{ f1: number; f2: number } | null>(null);

  const chartW = 280;
  const chartH = 280;
  const margin = 24;

  const normalizedBlend = useMemo(() => {
    const sum = synthBlend.sawtooth + synthBlend.sine + synthBlend.square + synthBlend.noise;
    if (sum <= 0.0001) return { sawtooth: 1, sine: 0, square: 0, noise: 0 };
    return {
      sawtooth: synthBlend.sawtooth / sum,
      sine: synthBlend.sine / sum,
      square: synthBlend.square / sum,
      noise: synthBlend.noise / sum,
    };
  }, [synthBlend]);

  const resolvedWaveform = useMemo(() => {
    if (synthWaveform !== 'blend') return synthWaveform;
    let best: BlendWave = 'sawtooth';
    let bestVal = -1;
    (Object.keys(normalizedBlend) as BlendWave[]).forEach((key) => {
      const val = normalizedBlend[key];
      if (val > bestVal) {
        bestVal = val;
        best = key;
      }
    });
    return best;
  }, [normalizedBlend, synthWaveform]);

  const xFromF2 = (f2: number) => {
    const x = (Math.log(f2) - Math.log(f2min)) / (Math.log(f2max) - Math.log(f2min));
    return (1 - x) * (chartW - 2 * margin) + margin;
  };
  const yFromF1 = (f1: number) => {
    const y = (Math.log(f1) - Math.log(f1min)) / (Math.log(f1max) - Math.log(f1min));
    return y * (chartH - 2 * margin) + margin;
  };
  const f2FromX = (x: number) => {
    const t = (chartW - margin - x) / (chartW - 2 * margin);
    return Math.exp(Math.log(f2min) + t * (Math.log(f2max) - Math.log(f2min)));
  };
  const f1FromY = (y: number) => {
    const t = (y - margin) / (chartH - 2 * margin);
    return Math.exp(Math.log(f1min) + t * (Math.log(f1max) - Math.log(f1min)));
  };

  const tractToFormants = useCallback((state: LiveTractState) => {
    const lF = 1.0 - (state.lipLen * 0.3);
    const liF = 0.5 + (state.lips * 0.5);
    const fr1 = (200 + (1 - state.y) * 600 - (state.throat * 50)) * lF * liF;
    const fr2 = (800 + state.x * 1400) * lF * liF;
    return {
      f1: Math.max(f1min, Math.min(f1max, fr1)),
      f2: Math.max(f2min, Math.min(f2max, fr2)),
    };
  }, []);

  const findNearestVowel = useCallback((f1: number, f2: number) => {
    let minDist = Infinity;
    let closest: VowelPoint | null = null;
    for (const v of vowels) {
      const d = Math.hypot(
        (Math.log(f1) - Math.log(v.f1)) / (Math.log(f1max) - Math.log(f1min)),
        (Math.log(f2) - Math.log(v.f2)) / (Math.log(f2max) - Math.log(f2min))
      );
      if (d < minDist) {
        minDist = d;
        closest = v;
      }
    }
    return closest;
  }, []);

  const clearTimeouts = () => {
    timeoutIdsRef.current.forEach(t => window.clearTimeout(t));
    timeoutIdsRef.current = [];
  };

  const stopPlayback = useCallback((options?: { keepPreviewLoop?: boolean }) => {
    clearTimeouts();
    playingRef.current = false;
    if (!options?.keepPreviewLoop) {
      previewLoopRef.current = false;
      if (previewLoopTimerRef.current !== null) {
        window.clearTimeout(previewLoopTimerRef.current);
        previewLoopTimerRef.current = null;
      }
      setPreviewPlaying(false);
    }
    stopFormantAnimation();
    if (nodesRef.current) {
      const { oscillators, oscGain, noiseSrc, noiseGain, noiseVoice } = nodesRef.current;
      try { oscGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.02); } catch { }
      try { noiseGain?.gain.setTargetAtTime(0, audioContext.currentTime, 0.02); } catch { }
      oscillators.forEach(osc => {
        try { osc.stop(audioContext.currentTime + 0.05); } catch { }
      });
      if (noiseVoice) {
        try { noiseVoice.stop(audioContext.currentTime + 0.05); } catch { }
      }
      try { noiseSrc?.stop(audioContext.currentTime + 0.05); } catch { }
    }
    nodesRef.current = null;
  }, [audioContext]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);
  useEffect(() => { onPreviewPlayingChange?.(previewPlaying); }, [previewPlaying, onPreviewPlayingChange]);

  useEffect(() => {
    if (!nodesRef.current) return;
    const now = audioContext.currentTime;
    nodesRef.current.oscillators.forEach(osc => {
      try { osc.frequency.setTargetAtTime(manualPitch || basePitch, now, 0.02); } catch { }
    });
  }, [audioContext, manualPitch]);

  useEffect(() => {
    if (isPointerDown || ttsPlaying) return;
    const mapped = tractToFormants(liveTract);
    setCurrentF1(mapped.f1);
    setCurrentF2(mapped.f2);
  }, [isPointerDown, liveTract, tractToFormants, ttsPlaying]);

  useEffect(() => {
    lastTtsFramesRef.current = null;
    lastTtsDurationRef.current = 0;
    if (ttsPlayingRef.current) {
      ttsPlayingRef.current = false;
      setTtsPlaying(false);
      stopPlayback();
    }
    setNearestSyllable('');
  }, [ttsText]);

  useEffect(() => { currentF1Ref.current = currentF1; }, [currentF1]);
  useEffect(() => { currentF2Ref.current = currentF2; }, [currentF2]);

  const stopFormantAnimation = () => {
    if (formantAnimRef.current !== null) {
      cancelAnimationFrame(formantAnimRef.current);
      formantAnimRef.current = null;
    }
  };

  const clearTtsCache = () => {
    lastTtsFramesRef.current = null;
    lastTtsDurationRef.current = 0;
  };

  const markPresetChange = () => {
    forceSnapshotRef.current = true;
    clearTtsCache();
  };

  const createVoiceChain = useCallback((): PlayNodes => {
    const oscGain = audioContext.createGain();
    oscGain.gain.value = 0;

    const oscillators: OscillatorNode[] = [];
    let noiseVoice: AudioBufferSourceNode | undefined;
    if (resolvedWaveform === 'noise') {
      const noiseBuf = createNoiseBuffer(audioContext, 1.5, noisePreset);
      noiseVoice = audioContext.createBufferSource();
      noiseVoice.buffer = noiseBuf;
      noiseVoice.loop = true;
      noiseVoice.connect(oscGain);
      noiseVoice.start();
    } else {
      const osc = audioContext.createOscillator();
      osc.type = resolvedWaveform === 'sine' ? 'sine' : resolvedWaveform === 'square' ? 'square' : 'sawtooth';
      osc.frequency.value = manualPitch || basePitch;
      osc.connect(oscGain);
      osc.start();
      oscillators.push(osc);
    }

    const f1 = audioContext.createBiquadFilter();
    f1.type = 'peaking';
    f1.Q.value = 0.2; f1.gain.value = 60;
    const f2 = audioContext.createBiquadFilter();
    f2.type = 'peaking';
    f2.Q.value = 0.4; f2.gain.value = 60;
    const f3 = audioContext.createBiquadFilter();
    f3.type = 'peaking';
    f3.Q.value = 0.8; f3.gain.value = 50;
    const f4 = audioContext.createBiquadFilter();
    f4.type = 'peaking';
    f4.Q.value = 1; f4.gain.value = 40;
    const bef = audioContext.createBiquadFilter();
    bef.type = 'notch';
    bef.frequency.value = antiF; bef.Q.value = 0.2;
    const lpf = audioContext.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = cutoff; lpf.Q.value = 0.001;

    oscGain.connect(bef);
    oscGain.connect(lpf);
    oscGain.connect(f1);
    oscGain.connect(f2);
    oscGain.connect(f3);
    oscGain.connect(f4);

    f1.connect(audioContext.destination);
    f2.connect(audioContext.destination);
    f3.connect(audioContext.destination);
    f4.connect(audioContext.destination);
    bef.connect(audioContext.destination);
    lpf.connect(audioContext.destination);

    return { oscillators, noiseVoice, oscGain, f1, f2, f3, f4, lpf, bef };
  }, [audioContext, manualPitch, noisePreset, resolvedWaveform]);

  const ensureAudioContext = async () => {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  };

  const decodeAudioArrayBuffer = useCallback(async (arrayBuffer: ArrayBuffer) => {
    const clone = arrayBuffer.slice(0);
    if (audioContext.decodeAudioData.length <= 1) {
      return await audioContext.decodeAudioData(clone);
    }
    return await new Promise<AudioBuffer>((resolve, reject) => {
      audioContext.decodeAudioData(clone, resolve, reject);
    });
  }, [audioContext]);

  const updateFormants = (f1Target: number, f2Target: number) => {
    if (!nodesRef.current) return;
    const now = audioContext.currentTime;
    nodesRef.current.f1.frequency.setTargetAtTime(f1Target, now, 0.02);
    nodesRef.current.f2.frequency.setTargetAtTime(f2Target, now, 0.02);
    nodesRef.current.f3.frequency.setTargetAtTime(f3, now, 0.02);
    nodesRef.current.f4.frequency.setTargetAtTime(f4, now, 0.02);
  };

  const animateFormants = (startF1: number, startF2: number, targetF1: number, targetF2: number, durationMs: number) => {
    stopFormantAnimation();
    if (durationMs <= 0) {
      setCurrentF1(targetF1);
      setCurrentF2(targetF2);
      onFormantChange(targetF1, targetF2);
      updateFormants(targetF1, targetF2);
      return;
    }
    const startTime = performance.now();
    const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = easeInOut(t);
      const f1 = startF1 + (targetF1 - startF1) * eased;
      const f2 = startF2 + (targetF2 - startF2) * eased;
      setCurrentF1(f1);
      setCurrentF2(f2);
      onFormantChange(f1, f2);
      updateFormants(f1, f2);
      if (t < 1 && ttsPlayingRef.current) {
        formantAnimRef.current = requestAnimationFrame(step);
      }
    };
    formantAnimRef.current = requestAnimationFrame(step);
  };

  const startVowelTransition = (consonant: Consonant | null, f1Target: number, f2Target: number, transitionMs?: number) => {
    const now = audioContext.currentTime;
    if (!nodesRef.current) return;
    nodesRef.current.oscGain.gain.setTargetAtTime(0.002, now, 0.05);

    updateFormants(f1Target, f2Target);

    const locus = getF2Locus(consonant);
    if (locus) {
      const tMs = transitionMs ?? getTransitionMs(consonant);
      const startF2 = locus + (f2Target - locus) * 0.08;
      nodesRef.current.f2.frequency.setTargetAtTime(startF2, now, 0.006);
      nodesRef.current.f2.frequency.linearRampToValueAtTime(f2Target, now + Math.max(0.015, tMs / 1000));
    }
  };

  const setupNoise = (freq: number, bw: number, amp: number, sourceBuffer?: AudioBuffer | null) => {
    if (!nodesRef.current) return;
    const noiseBuffer = sourceBuffer || createNoiseBuffer(audioContext, 0.5, noisePreset);
    const noiseSrc = audioContext.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    noiseSrc.loop = true;
    const noiseBpf = audioContext.createBiquadFilter();
    noiseBpf.type = 'bandpass';
    noiseBpf.frequency.value = freq;
    noiseBpf.Q.value = freq / Math.max(1, bw);
    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = amp;
    noiseSrc.connect(noiseBpf);
    noiseBpf.connect(noiseGain);
    noiseGain.connect(audioContext.destination);
    noiseSrc.start();
    nodesRef.current.noiseSrc = noiseSrc;
    nodesRef.current.noiseGain = noiseGain;
    nodesRef.current.noiseBpf = noiseBpf;
  };

  const stopNoise = () => {
    if (!nodesRef.current?.noiseSrc) return;
    try { nodesRef.current.noiseGain?.gain.setTargetAtTime(0, audioContext.currentTime, 0.02); } catch { }
    try { nodesRef.current.noiseSrc.stop(audioContext.currentTime + 0.05); } catch { }
    nodesRef.current.noiseSrc = undefined;
    nodesRef.current.noiseGain = undefined;
    nodesRef.current.noiseBpf = undefined;
  };

  const playCoda = (jong: string, onDone?: () => void, durationScale: number = 1) => {
    const p = jongParams[jong];
    if (!p || !nodesRef.current) { onDone?.(); return; }
    const dur = getCodaDurationMs(jong, durationScale);
    if (p.type === 'stop') {
      nodesRef.current.f1.frequency.setTargetAtTime(300, audioContext.currentTime, 0.02);
      nodesRef.current.f2.frequency.setTargetAtTime(p.place === 'bilabial' ? 800 : 1800, audioContext.currentTime, 0.02);
      const isShortStop = jong === 'ㄱ' || jong === 'ㄷ' || jong === 'ㅂ';
      const fastTc = isShortStop ? 0.012 : 0.03;
      nodesRef.current.oscGain.gain.setTargetAtTime(0.001, audioContext.currentTime, fastTc);
      const t = window.setTimeout(() => {
        nodesRef.current?.oscGain.gain.setTargetAtTime(0, audioContext.currentTime, isShortStop ? 0.006 : 0.01);
        onDone?.();
      }, dur);
      timeoutIdsRef.current.push(t);
      return;
    }
    if (p.type === 'nasal') {
      nodesRef.current.f1.frequency.setTargetAtTime(p.nasalFreq || 250, audioContext.currentTime, 0.02);
      nodesRef.current.f2.frequency.setTargetAtTime(1200, audioContext.currentTime, 0.02);
      nodesRef.current.oscGain.gain.setTargetAtTime(0.0015, audioContext.currentTime, 0.02);
      const t = window.setTimeout(() => {
        nodesRef.current?.oscGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.03);
        onDone?.();
      }, dur);
      timeoutIdsRef.current.push(t);
      return;
    }
    nodesRef.current.f3.frequency.setTargetAtTime(2000, audioContext.currentTime, 0.02);
    nodesRef.current.oscGain.gain.setTargetAtTime(0.0014, audioContext.currentTime, 0.02);
    const t = window.setTimeout(() => {
      nodesRef.current?.oscGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.03);
      onDone?.();
    }, dur);
    timeoutIdsRef.current.push(t);
  };

  const playConsonantAndVowel = async (consonant: Consonant | null, f1Target: number, f2Target: number, applyJong: boolean, jongOverride?: string | null, options?: { keepPreviewLoop?: boolean }) => {
    await ensureAudioContext();
    stopPlayback({ keepPreviewLoop: options?.keepPreviewLoop });
    nodesRef.current = createVoiceChain();
    playingRef.current = true;
    setPreviewPlaying(true);
    const jongValue = jongOverride !== undefined ? jongOverride : selectedJong;
    const onsetDur = getConsonantOnsetDurationMs(consonant);
    const overlapMs = getConsonantOverlapMs(consonant);
    const transitionMs = getTransitionMs(consonant);
    const scheduleJong = () => {
      if (!applyJong || !jongValue) return;
      const codaStart = Math.max(120, onsetDur + 180);
      const t = window.setTimeout(() => playCoda(jongValue, stopPlayback), codaStart);
      timeoutIdsRef.current.push(t);
    };

    if (!consonant || consonant.name === 'ㅇ') {
      startVowelTransition(consonant, f1Target, f2Target, transitionMs);
      scheduleJong();
      return;
    }

    if (consonant.customNoiseBuffer) {
      const freq = consonant.burstFreq || consonant.fricFreq || consonant.nasalFreq || 1800;
      const bw = consonant.burstBW || consonant.fricBW || 900;
      const totalDur = Math.max(40, onsetDur);
      setupNoise(freq, bw, consonant.noiseAmp ?? 0.45, consonant.customNoiseBuffer);
      const tStart = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), Math.max(0, totalDur - overlapMs));
      const tStop = window.setTimeout(() => stopNoise(), totalDur);
      timeoutIdsRef.current.push(tStart);
      timeoutIdsRef.current.push(tStop);
      scheduleJong();
      return;
    }

    if (consonant.type === 'plosive') {
      setupNoise(consonant.burstFreq || 1800, consonant.burstBW || 600, consonant.noiseAmp ?? 0.45);
      const burstDur = consonant.burstDur || 15;
      const aspirDur = consonant.aspirated ? (consonant.aspirDur || 0) : 0;
      const totalDur = burstDur + aspirDur;

      if (consonant.aspirated && aspirDur > 0) {
        const t1 = window.setTimeout(() => {
          if (nodesRef.current?.noiseBpf) {
            nodesRef.current.noiseBpf.frequency.setValueAtTime(2500, audioContext.currentTime);
            nodesRef.current.noiseBpf.Q.value = 0.5;
          }
        }, burstDur);
        timeoutIdsRef.current.push(t1);
      }

      const startDelay = Math.max(0, totalDur - overlapMs);
      const tStart = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), startDelay);
      const tStop = window.setTimeout(() => stopNoise(), totalDur);
      timeoutIdsRef.current.push(tStart);
      timeoutIdsRef.current.push(tStop);
    } else if (consonant.type === 'fricative') {
      setupNoise(consonant.fricFreq || 3000, consonant.fricBW || 1200, consonant.noiseAmp ?? 0.4);
      const fricDur = consonant.fricDur || 120;
      const tStart = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), Math.max(0, fricDur - overlapMs));
      const tStop = window.setTimeout(() => stopNoise(), fricDur);
      timeoutIdsRef.current.push(tStart);
      timeoutIdsRef.current.push(tStop);
    } else if (consonant.type === 'affricate') {
      setupNoise(consonant.burstFreq || 3000, consonant.burstBW || 1200, consonant.noiseAmp ?? 0.45);
      const burstDur = consonant.burstDur || 20;
      const fricDur = consonant.fricDur || 60;
      const aspirDur = consonant.aspirated ? (consonant.aspirDur || 0) : 0;
      const totalDur = burstDur + fricDur + aspirDur;
      const t1 = window.setTimeout(() => {
        if (nodesRef.current?.noiseBpf) {
          nodesRef.current.noiseBpf.frequency.setValueAtTime(consonant.fricFreq || 3500, audioContext.currentTime);
        }
      }, burstDur);
      timeoutIdsRef.current.push(t1);

      const tStart = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), Math.max(0, totalDur - overlapMs));
      const tStop = window.setTimeout(() => stopNoise(), totalDur);
      timeoutIdsRef.current.push(tStart);
      timeoutIdsRef.current.push(tStop);
    } else if (consonant.type === 'nasal') {
      updateFormants(consonant.nasalFreq || f1Target, Math.max(900, f2Target * 0.82));
      nodesRef.current.oscGain.gain.setTargetAtTime(0.0017, audioContext.currentTime, 0.018);
      const t1 = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), Math.max(0, onsetDur - overlapMs));
      timeoutIdsRef.current.push(t1);
    } else if (consonant.type === 'liquid') {
      nodesRef.current.oscGain.gain.setTargetAtTime(0.0016, audioContext.currentTime, 0.01);
      const t1 = window.setTimeout(() => {
        nodesRef.current?.oscGain.gain.setTargetAtTime(0.0005, audioContext.currentTime, 0.008);
      }, consonant.tapDur || 20);
      const t2 = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), Math.max(0, onsetDur - overlapMs));
      timeoutIdsRef.current.push(t1);
      timeoutIdsRef.current.push(t2);
    }

    scheduleJong();
  };

  const playConsonantOnChain = (consonant: Consonant | null, f1Target: number, f2Target: number) => {
    if (!nodesRef.current) return;
    const onsetDur = getConsonantOnsetDurationMs(consonant);
    const overlapMs = getConsonantOverlapMs(consonant);
    const transitionMs = getTransitionMs(consonant);
    if (!consonant || consonant.name === 'ㅇ') {
      startVowelTransition(consonant, f1Target, f2Target, transitionMs);
      return;
    }

    if (consonant.customNoiseBuffer) {
      const freq = consonant.burstFreq || consonant.fricFreq || consonant.nasalFreq || 1800;
      const bw = consonant.burstBW || consonant.fricBW || 900;
      const totalDur = Math.max(40, onsetDur);
      setupNoise(freq, bw, consonant.noiseAmp ?? 0.45, consonant.customNoiseBuffer);
      const tStart = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), Math.max(0, totalDur - overlapMs));
      const tStop = window.setTimeout(() => stopNoise(), totalDur);
      timeoutIdsRef.current.push(tStart);
      timeoutIdsRef.current.push(tStop);
      return;
    }

    if (consonant.type === 'plosive') {
      setupNoise(consonant.burstFreq || 1800, consonant.burstBW || 600, consonant.noiseAmp ?? 0.45);
      const burstDur = consonant.burstDur || 15;
      const aspirDur = consonant.aspirated ? (consonant.aspirDur || 0) : 0;
      const totalDur = burstDur + aspirDur;

      if (consonant.aspirated && aspirDur > 0) {
        const t1 = window.setTimeout(() => {
          if (nodesRef.current?.noiseBpf) {
            nodesRef.current.noiseBpf.frequency.setValueAtTime(2500, audioContext.currentTime);
            nodesRef.current.noiseBpf.Q.value = 0.5;
          }
        }, burstDur);
        timeoutIdsRef.current.push(t1);
      }

      const startDelay = Math.max(0, totalDur - overlapMs);
      const tStart = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), startDelay);
      const tStop = window.setTimeout(() => stopNoise(), totalDur);
      timeoutIdsRef.current.push(tStart);
      timeoutIdsRef.current.push(tStop);
      return;
    }

    if (consonant.type === 'fricative') {
      setupNoise(consonant.fricFreq || 3000, consonant.fricBW || 1200, consonant.noiseAmp ?? 0.4);
      const fricDur = consonant.fricDur || 120;
      const tStart = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), Math.max(0, fricDur - overlapMs));
      const tStop = window.setTimeout(() => stopNoise(), fricDur);
      timeoutIdsRef.current.push(tStart);
      timeoutIdsRef.current.push(tStop);
      return;
    }

    if (consonant.type === 'affricate') {
      setupNoise(consonant.burstFreq || 3000, consonant.burstBW || 1200, consonant.noiseAmp ?? 0.45);
      const burstDur = consonant.burstDur || 20;
      const fricDur = consonant.fricDur || 60;
      const aspirDur = consonant.aspirated ? (consonant.aspirDur || 0) : 0;
      const totalDur = burstDur + fricDur + aspirDur;

      const t1 = window.setTimeout(() => {
        if (nodesRef.current?.noiseBpf) {
          nodesRef.current.noiseBpf.frequency.setValueAtTime(consonant.fricFreq || 3500, audioContext.currentTime);
        }
      }, burstDur);
      timeoutIdsRef.current.push(t1);

      const tStart = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), Math.max(0, totalDur - overlapMs));
      const tStop = window.setTimeout(() => stopNoise(), totalDur);
      timeoutIdsRef.current.push(tStart);
      timeoutIdsRef.current.push(tStop);
      return;
    }

    if (consonant.type === 'nasal') {
      updateFormants(consonant.nasalFreq || f1Target, Math.max(900, f2Target * 0.82));
      nodesRef.current.oscGain.gain.setTargetAtTime(0.0017, audioContext.currentTime, 0.018);
      const t1 = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), Math.max(0, onsetDur - overlapMs));
      timeoutIdsRef.current.push(t1);
      return;
    }

    if (consonant.type === 'liquid') {
      nodesRef.current.oscGain.gain.setTargetAtTime(0.0016, audioContext.currentTime, 0.01);
      const t1 = window.setTimeout(() => {
        nodesRef.current?.oscGain.gain.setTargetAtTime(0.0005, audioContext.currentTime, 0.008);
      }, consonant.tapDur || 20);
      const t2 = window.setTimeout(() => startVowelTransition(consonant, f1Target, f2Target, transitionMs), Math.max(0, onsetDur - overlapMs));
      timeoutIdsRef.current.push(t1);
      timeoutIdsRef.current.push(t2);
    }
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    markPresetChange();
    setSelectedVowelPreset(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(chartW, Math.max(0, e.clientX - rect.left));
    const y = Math.min(chartH, Math.max(0, e.clientY - rect.top));
    const f1 = f1FromY(y);
    const f2 = f2FromX(x);
    setCurrentF1(f1);
    setCurrentF2(f2);
    onFormantChange(f1, f2);
    const nearest = findNearestVowel(f1, f2);
    if (nearest) {
      const cho = selectedConsonant ? (selectedConsonant.recordAs || selectedConsonant.name) : 'ㅇ';
      const vowel = nearest.korean || nearest.label;
      setNearestSyllable(composeHangul(cho, vowel, selectedJong));
    }
    setIsPointerDown(true);
    playConsonantAndVowel(selectedConsonant, f1, f2, true);
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPointerDown || !nodesRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(chartW, Math.max(0, e.clientX - rect.left));
    const y = Math.min(chartH, Math.max(0, e.clientY - rect.top));
    const f1 = f1FromY(y);
    const f2 = f2FromX(x);
    setCurrentF1(f1);
    setCurrentF2(f2);
    onFormantChange(f1, f2);
    updateFormants(f1, f2);
  };

  const handlePointerUp = () => {
    setIsPointerDown(false);
    stopPlayback();
  };

  const handleTtsToggle = async () => {
    if (ttsPlaying) {
      ttsPlayingRef.current = false;
      setTtsPlaying(false);
      stopFormantAnimation();
      stopPlayback();
      return;
    }
    if (!ttsText.trim()) return;
    forceSnapshotRef.current = false;
    await ensureAudioContext();
    ttsPlayingRef.current = true;
    setTtsPlaying(true);

    const events: Array<{ type: 'syllable' | 'glide' | 'coda' | 'silence'; consonant?: Consonant | null; jong?: string | null; f1?: number; f2?: number; dur: number; }> = [];
    const frames: VowelSynthFrame[] = [];
    for (const char of ttsText.trim()) {
      const decomp = decomposeHangul(char);
      if (!decomp) continue;
      const consonant = findConsonant(decomp.cho);
      const vowelSeq = decomposeVowel(decomp.jung);
      const jong = decomp.jong || null;
      const consonantName = consonant ? consonant.name : null;
      const codaName = jong || null;

      const onsetDur = getConsonantOnsetDurationMs(consonant);

      const v0 = getVowelFormants(vowelSeq[0]);
      if (vowelSeq.length > 1) {
        const v1 = getVowelFormants(vowelSeq[1]);
        events.push({ type: 'syllable', consonant, jong, f1: v0.f1, f2: v0.f2, dur: onsetDur + 110 });
        events.push({ type: 'glide', f1: v1.f1, f2: v1.f2, dur: 120 });
        frames.push({ f1: v0.f1, f2: v0.f2, durMs: onsetDur + 110, consonant: consonantName, coda: codaName });
        frames.push({ f1: v1.f1, f2: v1.f2, durMs: 120, consonant: consonantName, coda: codaName });
      } else {
        events.push({ type: 'syllable', consonant, jong, f1: v0.f1, f2: v0.f2, dur: onsetDur + 190 });
        frames.push({ f1: v0.f1, f2: v0.f2, durMs: onsetDur + 190, consonant: consonantName, coda: codaName });
      }

      if (jong) events.push({ type: 'coda', jong, dur: getCodaDurationMs(jong, TTS_CODA_DURATION_SCALE) });
      events.push({ type: 'silence', dur: 45 });
    }

    if (events.length === 0) {
      ttsPlayingRef.current = false;
      setTtsPlaying(false);
      return;
    }

    const baseTotalMs = events.reduce((sum, ev) => sum + ev.dur, 0);
    lastTtsFramesRef.current = frames;
    lastTtsDurationRef.current = baseTotalMs / 1000;

    const speedScale = 1 / Math.max(0.1, ttsSpeed);
    events.forEach(ev => {
      ev.dur = Math.max(20, ev.dur * speedScale);
    });

    stopPlayback();
    nodesRef.current = createVoiceChain();

    let idx = 0;
    const getTtsEaseDuration = (ev: { type: 'syllable' | 'glide' | 'coda' | 'silence'; consonant?: Consonant | null; dur: number }) => {
      const base = ev.dur;
      if (ev.type === 'silence' || ev.type === 'coda') return 0;
      let eased = Math.min(base, 220);
      if (ev.type === 'glide') {
        eased = Math.min(base, Math.max(50, base * 0.52));
      }
      if (ev.type === 'syllable' && (ev.jong === 'ㄱ' || ev.jong === 'ㄷ' || ev.jong === 'ㅂ')) {
        eased = Math.min(eased, Math.max(24, base * 0.22));
      } else if (ev.type === 'syllable' && (!ev.consonant || ev.consonant.name === 'ㅇ')) {
        eased = Math.min(eased, Math.max(26, base * 0.24));
      } else if (ev.type === 'syllable' && ev.consonant) {
        if (['ㅁ', 'ㄹ', 'ㅇ', 'ㄴ'].includes(ev.consonant.name)) {
          eased = Math.min(eased, Math.max(32, base * 0.28));
        } else if (ev.consonant.type === 'nasal' || ev.consonant.type === 'liquid') {
          eased = Math.min(eased, Math.max(36, base * 0.34));
        } else {
          eased = Math.min(eased, Math.max(50, base * 0.46));
        }
      }
      return Math.max(24, Math.min(base, eased));
    };

    const playNext = () => {
      if (!ttsPlayingRef.current || idx >= events.length) {
        ttsPlayingRef.current = false;
        setTtsPlaying(false);
        stopFormantAnimation();
        stopPlayback();
        return;
      }
      const ev = events[idx];
      const startF1 = currentF1Ref.current;
      const startF2 = currentF2Ref.current;
      const targetF1 = ev.f1 || startF1;
      const targetF2 = ev.f2 || startF2;
      if (ev.type === 'syllable') {
        setSelectedConsonantName(ev.consonant ? ev.consonant.name : null);
        setSelectedJongName(ev.jong || null);
        if (ev.consonant) {
          playConsonantOnChain(ev.consonant, targetF1, targetF2);
        } else {
          startVowelTransition(ev.consonant || null, startF1, startF2);
        }
        animateFormants(startF1, startF2, targetF1, targetF2, getTtsEaseDuration(ev));
      } else if (ev.type === 'glide') {
        animateFormants(startF1, startF2, targetF1, targetF2, getTtsEaseDuration(ev));
      } else if (ev.type === 'coda' && ev.jong) {
        playCoda(ev.jong, undefined, TTS_CODA_DURATION_SCALE);
      }
      const t = window.setTimeout(() => {
        idx += 1;
        playNext();
      }, ev.dur);
      timeoutIdsRef.current.push(t);
    };
    playNext();
  };

  const buildPronunciationFrames = useCallback(() => {
    const preset = lastPresetVowelRef.current;
    const f1 = preset ? preset.f1 : currentF1Ref.current;
    const f2 = preset ? preset.f2 : currentF2Ref.current;
    const consonantObj = selectedConsonantName ? findConsonant(selectedConsonantName) : null;
    const vowelDur = 220;
    const onsetDur = getConsonantOnsetDurationMs(consonantObj);
    const jongDur = selectedJongName ? getCodaDurationMs(selectedJongName) : 0;
    const presetFrames: VowelSynthFrame[] = [];
    if (consonantObj && onsetDur > 0) {
      presetFrames.push({ f1, f2, durMs: onsetDur, consonant: consonantObj.name, coda: null });
    }
    presetFrames.push({ f1, f2, durMs: vowelDur, consonant: null, coda: null });
    if (selectedJongName && jongDur > 0) {
      presetFrames.push({ f1, f2, durMs: jongDur, consonant: null, coda: selectedJongName });
      presetFrames.push({ f1, f2, durMs: 40, consonant: null, coda: null });
    }
    if (presetFrames.length === 0) return null;
    const ratio = Math.max(0.1, ttsTimeRatio);
    const scaledFrames = presetFrames.map(frame => ({ ...frame, durMs: frame.durMs * ratio }));
    const total = scaledFrames.reduce((sum, f) => sum + f.durMs, 0) / 1000;
    return { frames: scaledFrames, totalSec: total };
  }, [findConsonant, selectedConsonantName, selectedJongName, ttsTimeRatio]);

  const handleRecord = () => {
    if (ttsPlaying) return;
    if (forceSnapshotRef.current) {
      forceSnapshotRef.current = false;
      onRecordSnapshot();
      return;
    }
    const frames = lastTtsFramesRef.current;
    const totalSec = lastTtsDurationRef.current;
    if (frames && frames.length > 0 && totalSec > 0) {
      const ratio = Math.max(0.1, ttsTimeRatio);
      const scaledFrames = frames.map(frame => ({ ...frame, durMs: frame.durMs * ratio }));
      onRecordTts(scaledFrames, totalSec * ratio);
      return;
    }
    const preset = buildPronunciationFrames();
    if (preset) {
      onRecordTts(preset.frames, preset.totalSec);
      return;
    }
    onRecordSnapshot();
  };

  const handleRecordPronunciation = () => {
    if (ttsPlaying) return;
    const preset = buildPronunciationFrames();
    if (preset) {
      onRecordTts(preset.frames, preset.totalSec);
      return;
    }
    onRecordSnapshot();
  };

  const estimatePreviewDurationMs = (consonantObj: Consonant | null, jongValue: string | null) => {
    const onsetDur = getConsonantOnsetDurationMs(consonantObj);
    const vowelDur = 220;
    const jongDur = getCodaDurationMs(jongValue);
    const gap = 140;
    return Math.max(200, onsetDur + vowelDur + jongDur + gap);
  };

  const playPreviewLoop = async () => {
    const preset = lastPresetVowelRef.current;
    const f1 = preset ? preset.f1 : currentF1Ref.current;
    const f2 = preset ? preset.f2 : currentF2Ref.current;
    const consonantObj = selectedConsonantName ? findConsonant(selectedConsonantName) : null;
    const jongValue = selectedJongName ?? null;
    await playConsonantAndVowel(consonantObj, f1, f2, true, jongValue, { keepPreviewLoop: true });
    const dur = estimatePreviewDurationMs(consonantObj, jongValue);
    previewLoopTimerRef.current = window.setTimeout(() => {
      if (!previewLoopRef.current) return;
      playPreviewLoop();
    }, dur);
  };

  useEffect(() => {
    if (panelTab !== 'formant') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, chartW, chartH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, chartW, chartH);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = f2min; i <= f2max; i += 200) {
      const x = xFromF2(i);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, chartH); ctx.stroke();
    }
    for (let i = f1min; i <= f1max; i += 100) {
      const y = yFromF1(i);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
    }

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(margin, margin, chartW - 2 * margin, chartH - 2 * margin);

    const vowelByLabel = (label: string) => vowels.find(v => v.label === label) || null;
    const drawPair = (a: string, b: string) => {
      const va = vowelByLabel(a);
      const vb = vowelByLabel(b);
      if (!va || !vb) return;
      const ax = xFromF2(va.f2);
      const ay = yFromF1(va.f1);
      const bx = xFromF2(vb.f2);
      const by = yFromF1(vb.f1);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    };

    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    drawPair('i', 'e');
    drawPair('e', 'ɛ');
    drawPair('ɛ', 'a');
    drawPair('ɑ', 'ɔ');
    drawPair('ɔ', 'o');
    drawPair('o', 'u');
    drawPair('y', 'ø');
    drawPair('ø', 'œ');
    drawPair('ʌ', 'ɤ');
    drawPair('ɤ', 'ɯ');
    drawPair('i', 'y');
    drawPair('e', 'ø');
    drawPair('ɛ', 'œ');
    drawPair('ʌ', 'ɔ');
    drawPair('ɤ', 'o');
    drawPair('ɯ', 'u');

    vowels.forEach(v => {
      const x = xFromF2(v.f2);
      const y = yFromF1(v.f1);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.font = '24px "Lucida Grande"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.label, x, y + 6);
      if (v.korean) {
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 14px "KoddiUD OnGothic", sans-serif';
        ctx.fillText(v.korean, x, y - 10);
      }
    });

    const cx = xFromF2(currentF2);
    const cy = yFromF1(currentF1);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.stroke();
  }, [currentF1, currentF2, language, panelTab]);

  useEffect(() => {
    const nearest = findNearestVowel(currentF1, currentF2);
    if (!nearest) return;
    const cho = selectedConsonant ? (selectedConsonant.recordAs || selectedConsonant.name) : 'ㅇ';
    const vowel = nearest.korean || nearest.label;
    setNearestSyllable(composeHangul(cho, vowel, selectedJong));
  }, [currentF1, currentF2, selectedConsonant, selectedJong, findNearestVowel]);

  const consonantGroups = useMemo(() => {
    return [
      { label: '어금닛소리(아음)', items: ['ㄱ', null, 'ㅋ', 'ㅇ'] },
      { label: '혓소리(설음)', items: ['ㄴ', 'ㄷ', 'ㅌ', 'ㄹ'] },
      { label: '입술소리(순음)', items: ['ㅁ', 'ㅂ', 'ㅍ'] },
      { label: '잇소리(치음)', items: ['ㅅ', 'ㅈ', 'ㅊ'] },
      { label: '목소리(후음)', items: ['ㅎ'] },
    ];
  }, []);

  const jongGroups = useMemo(() => {
    return [
      { label: '파열(폐쇄)', items: ['ㄱ', 'ㄷ', 'ㅂ'] },
      { label: '비음', items: ['ㄴ', 'ㅁ', 'ㅇ'] },
      { label: '유음', items: ['ㄹ'] },
    ];
  }, []);

  const vowelPresetList = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    vowels.forEach(v => {
      if (v.korean && !seen.has(v.korean)) {
        seen.add(v.korean);
        list.push(v.korean);
      }
    });
    return list;
  }, []);

  const baseConsonantOptions = useMemo(
    () => consonants.filter(c => c.name !== 'ㅇ').map(c => c.name),
    []
  );

  const isCustomNameConflict = useMemo(() => {
    const name = customDraft.name.trim();
    if (!name) return false;
    return consonantRegistry.some(c => c.name === name);
  }, [consonantRegistry, customDraft.name]);

  const handleAddCustomConsonant = useCallback(() => {
    const name = customDraft.name.trim();
    if (!name) return;
    if (consonantRegistry.some(c => c.name === name)) return;
    const base = consonants.find(c => c.name === customDraft.baseName);
    if (!base) return;
    const scaleNum = (value: number | undefined, scale: number, min = 1) => {
      if (value === undefined) return undefined;
      return Math.max(min, Math.round(value * scale));
    };
    const next: Consonant = {
      ...base,
      name,
      recordAs: base.name,
      customNoiseName: customNoiseName || undefined,
      customNoiseBuffer: customNoiseBuffer || undefined,
      noiseAmp: Math.max(0.25, Math.min(1.8, customDraft.ampScale)),
      burstFreq: scaleNum(base.burstFreq, customDraft.freqScale, 80),
      burstBW: scaleNum(base.burstBW, customDraft.freqScale, 80),
      fricFreq: scaleNum(base.fricFreq, customDraft.freqScale, 80),
      fricBW: scaleNum(base.fricBW, customDraft.freqScale, 80),
      nasalFreq: scaleNum(base.nasalFreq, customDraft.freqScale, 80),
      burstDur: scaleNum(base.burstDur, customDraft.durScale, 1),
      fricDur: scaleNum(base.fricDur, customDraft.durScale, 1),
      nasalDur: scaleNum(base.nasalDur, customDraft.durScale, 1),
      tapDur: scaleNum(base.tapDur, customDraft.durScale, 1),
      silenceDur: scaleNum(base.silenceDur, customDraft.durScale, 1),
      aspirDur: scaleNum(base.aspirDur, customDraft.aspirScale, 0),
      aspirated: (scaleNum(base.aspirDur, customDraft.aspirScale, 0) || 0) > 0,
    };
    setCustomConsonants(prev => [...prev, next]);
    setSelectedConsonantName(name);
    setCustomDraft(prev => ({ ...prev, name: '' }));
    setCustomNoiseBuffer(null);
    setCustomNoiseName('');
    markPresetChange();
  }, [consonantRegistry, customDraft, customNoiseBuffer, customNoiseName, setSelectedConsonantName]);

  const handleDeleteCustomConsonant = useCallback((name: string) => {
    setCustomConsonants(prev => prev.filter(c => c.name !== name));
    if (selectedConsonantName === name) {
      setSelectedConsonantName(null);
    }
    markPresetChange();
  }, [selectedConsonantName, setSelectedConsonantName]);

  const handleCustomNoiseFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const arr = await file.arrayBuffer();
      const decoded = await decodeAudioArrayBuffer(arr);
      setCustomNoiseBuffer(decoded);
      setCustomNoiseName(file.name);
    } catch {
      setCustomNoiseBuffer(null);
      setCustomNoiseName('');
      if (typeof window !== 'undefined') {
        window.alert(language === 'ko' ? '오디오 파일을 읽지 못했습니다.' : language === 'ja' ? '音声ファイルを読み込めませんでした。' : 'Failed to read audio file.');
      }
    }
  }, [decodeAudioArrayBuffer, language]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-black text-slate-800">{text.title}</h3>
          <p className="text-[12px] text-slate-500 font-medium mt-1">{text.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <Volume2 size={14} /> {Math.round(manualPitch)}Hz
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-[10px] font-black flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setPanelTab('formant')}
              className={`px-3 py-1 rounded-full border transition-all ${panelTab === 'formant' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}
            >
              {text.formantTab}
            </button>
            <button
              onClick={() => setPanelTab('presets')}
              className={`px-3 py-1 rounded-full border transition-all ${panelTab === 'presets' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}
            >
              {text.consonantTab}
            </button>
            <button
              onClick={() => setPanelTab('controls')}
              className={`px-3 py-1 rounded-full border transition-all ${panelTab === 'controls' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}
            >
              {text.controlsTab}
            </button>
          </div>
          <button
            onClick={() => {
              if (previewLoopRef.current) {
                previewLoopRef.current = false;
                stopPlayback();
                return;
              }
              previewLoopRef.current = true;
              playPreviewLoop();
            }}
            className={`px-2 py-1 rounded-full border transition-all flex items-center gap-1 ${previewPlaying ? 'border-red-200 text-red-600 bg-red-50' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-100'}`}
            title={language === 'ko' ? '미리보기 재생' : language === 'ja' ? 'プレビュー再生' : 'Preview play'}
          >
            <Play size={12} />
            <span className="text-[10px] font-black">
              {previewPlaying ? (language === 'ko' ? '정지' : language === 'ja' ? '停止' : 'Stop') : (language === 'ko' ? '미리보기' : language === 'ja' ? 'プレビュー' : 'Preview')}
            </span>
          </button>
        </div>

        {panelTab === 'presets' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-[10px] font-black text-slate-500 uppercase">{text.vowelPresetLabel}</div>
              <div className="flex flex-wrap gap-2">
                {vowelPresetList.map(vowel => (
                  <button
                    key={vowel}
                    onClick={() => {
                      markPresetChange();
                      const target = getVowelFormants(vowel);
                      lastPresetVowelRef.current = target;
                      setSelectedVowelPreset(vowel);
                      animateFormants(currentF1Ref.current, currentF2Ref.current, target.f1, target.f2, 220);
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-black transition-all ${selectedVowelPreset === vowel ? 'bg-indigo-500 text-white border-indigo-400 shadow-sm' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}
                  >
                    {vowel}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
              <span className="uppercase">{text.consonantBoost}</span>
              <button
                onClick={() => setConsonantBoostOn(!consonantBoostOn)}
                className={`w-8 h-4 rounded-full transition-colors relative ${consonantBoostOn ? 'bg-indigo-500' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${consonantBoostOn ? 'left-4.5' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="text-[10px] font-black text-slate-500 uppercase">{text.customConsonantLabel}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={customDraft.name}
                  onChange={e => setCustomDraft(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={text.customName}
                  className="px-2 py-1.5 text-xs rounded border border-slate-200 font-bold text-slate-800 outline-none"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={customDraft.baseName}
                    onChange={e => setCustomDraft(prev => ({ ...prev, baseName: e.target.value }))}
                    className="flex-1 px-2 py-1.5 text-xs rounded border border-slate-200 font-bold text-slate-800 outline-none"
                  >
                    {baseConsonantOptions.map(name => (
                      <option key={name} value={name}>{text.baseConsonant}: {name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddCustomConsonant}
                    disabled={!customDraft.name.trim() || isCustomNameConflict}
                    className={`px-3 py-1.5 rounded text-xs font-black ${(!customDraft.name.trim() || isCustomNameConflict) ? 'bg-slate-200 text-slate-400' : 'bg-indigo-500 text-white'}`}
                  >
                    {text.addCustom}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="px-2 py-1.5 rounded border border-slate-200 text-[11px] font-black text-slate-700 bg-white cursor-pointer">
                  {text.customFile}
                  <input type="file" accept="audio/*,.wav" className="hidden" onChange={handleCustomNoiseFile} />
                </label>
                {customNoiseName && (
                  <>
                    <span className="text-[10px] font-bold text-slate-500">{customNoiseName}</span>
                    <button
                      onClick={() => {
                        setCustomNoiseBuffer(null);
                        setCustomNoiseName('');
                      }}
                      className="px-2 py-1 rounded border border-slate-200 text-[10px] font-black text-slate-600 bg-white"
                    >
                      {text.clearFile}
                    </button>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black text-slate-500">
                    <span>{text.freqScale}</span><span>{customDraft.freqScale.toFixed(2)}x</span>
                  </div>
                  <input type="range" min="0.6" max="1.6" step="0.05" value={customDraft.freqScale} onChange={e => setCustomDraft(prev => ({ ...prev, freqScale: Number(e.target.value) }))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black text-slate-500">
                    <span>{text.durScale}</span><span>{customDraft.durScale.toFixed(2)}x</span>
                  </div>
                  <input type="range" min="0.5" max="2.0" step="0.05" value={customDraft.durScale} onChange={e => setCustomDraft(prev => ({ ...prev, durScale: Number(e.target.value) }))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black text-slate-500">
                    <span>{text.aspirScale}</span><span>{customDraft.aspirScale.toFixed(2)}x</span>
                  </div>
                  <input type="range" min="0.5" max="2.0" step="0.05" value={customDraft.aspirScale} onChange={e => setCustomDraft(prev => ({ ...prev, aspirScale: Number(e.target.value) }))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black text-slate-500">
                    <span>{text.ampScale}</span><span>{customDraft.ampScale.toFixed(2)}x</span>
                  </div>
                  <input type="range" min="0.5" max="1.8" step="0.05" value={customDraft.ampScale} onChange={e => setCustomDraft(prev => ({ ...prev, ampScale: Number(e.target.value) }))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500" />
                </div>
              </div>
              {isCustomNameConflict && (
                <div className="text-[10px] font-bold text-rose-500">{text.duplicateName}</div>
              )}
              {customConsonants.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {customConsonants.map(item => {
                    const isSelected = selectedConsonantName === item.name;
                    return (
                      <div key={item.name} className={`flex items-center gap-1 border rounded-md px-2 py-1 text-xs font-black ${isSelected ? 'bg-blue-500 text-white border-blue-400' : 'bg-white text-slate-700 border-slate-200'}`}>
                        <button onClick={() => setSelectedConsonantName(item.name)}>{item.name}</button>
                        {item.customNoiseName && <span className={`text-[9px] ${isSelected ? 'text-white/80' : 'text-indigo-500'}`}>FILE</span>}
                        <button title={text.removeCustom} onClick={() => handleDeleteCustomConsonant(item.name)} className={`${isSelected ? 'text-white/80' : 'text-rose-500'}`}>×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-row flex-nowrap gap-4 items-start overflow-x-auto">
              <div className="space-y-2 min-w-0 w-1/2 shrink-0">
                <div className="text-[10px] font-black text-slate-500 uppercase">{text.consonantPresetLabel}</div>
                {consonantGroups.map(group => (
                  <div key={group.label} className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] text-slate-400 min-w-[110px]">{group.label}</span>
                    {group.items.map((item, idx) => {
                      if (!item) return <span key={`${group.label}-${idx}`} className="w-6" />;
                      const isSelected = selectedConsonantName === item || (!selectedConsonantName && item === 'ㅇ');
                      return (
                        <button
                          key={`${group.label}-${item}`}
                          onClick={() => {
                            markPresetChange();
                            const nextConsonant = item === 'ㅇ' ? null : item;
                            setSelectedConsonantName(nextConsonant);
                            const lastPreset = lastPresetVowelRef.current;
                            if (lastPreset) {
                              animateFormants(currentF1Ref.current, currentF2Ref.current, lastPreset.f1, lastPreset.f2, 200);
                            }
                          }}
                          className={`w-8 h-7 rounded border text-xs font-black ${isSelected ? 'bg-blue-500 text-white border-blue-400' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="space-y-2 min-w-0 w-1/2 shrink-0">
                <div className="text-[10px] font-black text-slate-500 uppercase">{text.codaPresetLabel}</div>
                {jongGroups.map(group => (
                  <div key={group.label} className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] text-slate-400 min-w-[70px]">{group.label}</span>
                    {group.items.map(item => {
                      const isSelected = selectedJongName === item;
                      return (
                        <button
                          key={`${group.label}-${item}`}
                          onClick={() => {
                            markPresetChange();
                            setSelectedJongName(item);
                            const lastPreset = lastPresetVowelRef.current;
                            if (lastPreset) {
                              animateFormants(currentF1Ref.current, currentF2Ref.current, lastPreset.f1, lastPreset.f2, 200);
                            }
                          }}
                          className={`w-8 h-7 rounded border text-xs font-black ${isSelected ? 'bg-blue-500 text-white border-blue-400' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                        >
                          {item}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => {
                        markPresetChange();
                        setSelectedJongName(null);
                        const lastPreset = lastPresetVowelRef.current;
                        if (lastPreset && selectedConsonant) {
                          animateFormants(currentF1Ref.current, currentF2Ref.current, lastPreset.f1, lastPreset.f2, 200);
                        }
                      }}
                      className={`px-3 h-7 rounded border text-[10px] font-black ${selectedJongName === null ? 'bg-blue-500 text-white border-blue-400' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      없음
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleRecordPronunciation}
                className="px-3 py-1.5 rounded-lg text-xs font-black bg-indigo-500 text-white"
              >
                {text.recordPronunciation}
              </button>
              <button
                onClick={onRecordConsonant}
                className="px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-500 text-white"
              >
                {text.recordConsonant}
              </button>
            </div>
          </div>
        ) : panelTab === 'formant' ? (
          <div className="space-y-3">
            <div className="w-full flex justify-center">
              <div className="w-[66%] min-w-[200px] max-w-[260px] aspect-square">
                <canvas
                  ref={canvasRef}
                  width={chartW}
                  height={chartH}
                  onMouseDown={handlePointerDown}
                  onMouseMove={handlePointerMove}
                  onMouseUp={handlePointerUp}
                  onMouseLeave={handlePointerUp}
                  className="w-full h-full rounded-xl border border-slate-200 bg-white cursor-crosshair"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-600 font-bold">
              <span>F1: {Math.round(currentF1)} Hz</span>
              <span>F2: {Math.round(currentF2)} Hz</span>
              <span className="text-slate-900">{nearestSyllable}</span>
            </div>
          </div>
        ) : null}
      </div>

      {panelTab === 'controls' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex justify-between text-[11px] font-black text-slate-500">
              <span>{text.pitch}</span>
              <span className="text-indigo-600">{Math.round(manualPitch)}Hz</span>
            </div>
            <input
              type="range"
              min="50"
              max="600"
              step="1"
              value={manualPitch}
              onChange={e => {
                markPresetChange();
                setManualPitch(Number(e.target.value));
              }}
              className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"
            />
          </div>
          <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-500 uppercase">{text.waveform}</span>
              <select
                value={synthWaveform}
                onChange={e => {
                  markPresetChange();
                  setSynthWaveform(e.target.value as any);
                }}
                className="text-[11px] bg-white border border-slate-200 rounded px-1 outline-none font-black text-slate-900"
              >
                <option value="blend">{text.waveBlend}</option>
                <option value="sawtooth">Sawtooth</option>
                <option value="sine">Sine</option>
                <option value="square">Square</option>
                <option value="noise">Noise</option>
              </select>
            </div>
            {synthWaveform === 'blend' && (
              <div className="space-y-1.5">
                {([
                  ['sawtooth', 'Sawtooth'],
                  ['sine', 'Sine'],
                  ['square', 'Square'],
                  ['noise', 'Noise'],
                ] as [BlendWave, string][]).map(([waveId, label]) => (
                  <div key={waveId} className="space-y-0.5">
                    <div className="flex justify-between text-[11px] font-black text-slate-500">
                      <span>{label}</span>
                      <span className="text-indigo-600">{Math.round(normalizedBlend[waveId] * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={synthBlend[waveId]}
                      onChange={e => {
                        markPresetChange();
                        setSynthBlend({ ...synthBlend, [waveId]: Number(e.target.value) });
                      }}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-black text-slate-500 uppercase">{text.noisePreset}</div>
            <div className="grid grid-cols-3 gap-1">
              {([
                ['white', text.whiteNoise],
                ['pink', text.pinkNoise],
                ['brown', text.brownNoise],
              ] as [NoisePreset, string][]).map(([preset, label]) => (
                <button
                  key={preset}
                  onClick={() => {
                    markPresetChange();
                    setNoisePreset(preset);
                  }}
                  className={`py-1 rounded text-[11px] font-black border transition-all ${noisePreset === preset ? 'bg-white text-slate-900 border-slate-300 shadow-sm' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
        <input
          type="checkbox"
          checked={autoExtendDuration}
          onChange={e => setAutoExtendDuration(e.target.checked)}
          className="w-4 h-4 accent-indigo-500"
        />
        <span>{text.autoExtend}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="flex justify-between text-[11px] font-black text-slate-500">
            <span>{text.timeRatio}</span>
            <span className="text-indigo-600">{ttsTimeRatio.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={ttsTimeRatio}
            onChange={e => setTtsTimeRatio(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"
          />
        </div>
        <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="flex justify-between text-[11px] font-black text-slate-500">
            <span>{text.ttsSpeed}</span>
            <span className="text-indigo-600">{ttsSpeed.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={ttsSpeed}
            onChange={e => setTtsSpeed(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black text-slate-500 uppercase">{text.ttsLabel}</span>
        <input
          value={ttsText}
          onChange={e => setTtsText(e.target.value)}
          placeholder={text.ttsPlaceholder}
          className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-slate-200 rounded-lg font-bold"
        />
        <button
          onClick={handleTtsToggle}
          className={`px-4 py-2 rounded-lg text-xs font-black ${ttsPlaying ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}
        >
          {ttsPlaying ? text.stop : text.play}
        </button>
        <button
          onClick={handleRecord}
          className="px-4 py-2 rounded-lg text-xs font-black bg-emerald-500 text-white"
        >
          {text.record}
        </button>
      </div>
    </div>
  );
};

export default KoreanVowelSynth;
