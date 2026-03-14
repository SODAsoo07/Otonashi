
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings2, AudioLines, Activity, Wand2, Mic2, Wind, Waves, Download, Upload } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { AudioFile, AdvTrack, LarynxParams, LiveTractState, EQBand } from '../types';
import { AudioUtils } from '../utils/audioUtils';
import ParametricEQ from './ParametricEQ';
import FormantAnalyzer from './FormantAnalyzer';
import TractVisualizer from './TractVisualizer';
import TimelineEditor from './TimelineEditor';
import ParamInput from './ui/ParamInput';

interface AdvancedTractTabProps {
    audioContext: AudioContext;
    files: AudioFile[];
    onAddToRack: (buffer: AudioBuffer, name: string) => void;
    isActive: boolean;
    monitorGainValue?: number;  // 0~1.0 (재생 시만)
    onSendToStudio?: (buffer: AudioBuffer, name: string) => void;
    onSendToVocoder?: (buffer: AudioBuffer, name: string) => void;
}

const ADVANCED_TRACT_TEXT = {
    ko: {
        settings: '설정',
        eq: 'EQ',
        vowelPresets: '모음 프리셋',
        semiVowel: '반모음',
        aiAnalyzer: 'AI 발음 분석',
        pitchAnalysis: '피치 분석',
        analyzeFilePlaceholder: '분석할 파일 선택',
        sensitivity: '민감도',
        selectFile: '파일 선택',
        duration: '길이 (초)',
        extractPitch: '피치 추출 및 적용',
        glottisSource: '성문 소스',
        waveform: '파형',
        waveSawtooth: '톱니파',
        waveSine: '사인파',
        waveSquare: '사각파',
        waveNoise: '노이즈',
        synth: '신디사이저',
        file: '파일',
        simulationIntensity: '시뮬레이션 강도',
        spectrogram: '스펙트로그램',
        noiseSource: '노이즈 소스 (숨소리)',
        whiteNoise: '화이트 노이즈',
        fileSource: '파일 소스',
        noiseFilePlaceholder: '노이즈 파일 선택',
        pitch: '피치',
        gender: '성별',
        lips: '입술 열기',
        lipLen: '입술 길이',
        throat: '목 조임',
        nasal: '비성',
        sendLabel: '렌더 후 전송 →',
        sendStudio: '→ 스튜디오',
        sendVocoder: '→ 보코더',
        sendStudioTitle: '현재 시뮬레이션을 렌더링하여 스튜디오 탭으로 보냅니다',
        sendVocoderTitle: '현재 시뮬레이션을 렌더링하여 보코더 탭으로 보냅니다',
    },
    en: {
        settings: 'Settings',
        eq: 'EQ',
        vowelPresets: 'Vowel Presets',
        semiVowel: 'Semi-vowel',
        aiAnalyzer: 'AI Pronunciation Analyzer',
        pitchAnalysis: 'Pitch Analysis',
        analyzeFilePlaceholder: 'Select a file to analyze',
        sensitivity: 'Sensitivity',
        selectFile: 'Select file',
        duration: 'Duration (s)',
        extractPitch: 'Extract Pitch & Apply',
        glottisSource: 'Glottis Source',
        waveform: 'Waveform',
        waveSawtooth: 'Sawtooth',
        waveSine: 'Sine',
        waveSquare: 'Square',
        waveNoise: 'Noise',
        synth: 'Synth',
        file: 'File',
        simulationIntensity: 'Simulation Intensity',
        spectrogram: 'Spectrogram',
        noiseSource: 'Noise Source (Breath)',
        whiteNoise: 'White Noise',
        fileSource: 'File Source',
        noiseFilePlaceholder: 'Select a noise file',
        pitch: 'Pitch',
        gender: 'Gender',
        lips: 'Lip Open',
        lipLen: 'Lip Length',
        throat: 'Throat',
        nasal: 'Nasal',
        sendLabel: 'Send after render →',
        sendStudio: '→ Studio',
        sendVocoder: '→ Vocoder',
        sendStudioTitle: 'Render the current simulation and send it to the Studio tab',
        sendVocoderTitle: 'Render the current simulation and send it to the Vocoder tab',
    },
    ja: {
        settings: '設定',
        eq: 'EQ',
        vowelPresets: '母音プリセット',
        semiVowel: '半母音',
        aiAnalyzer: 'AI 発音分析',
        pitchAnalysis: 'ピッチ分析',
        analyzeFilePlaceholder: '解析するファイルを選択',
        sensitivity: '感度',
        selectFile: 'ファイルを選択',
        duration: '長さ (秒)',
        extractPitch: 'ピッチを抽出して適用',
        glottisSource: '声門ソース',
        waveform: '波形',
        waveSawtooth: 'ノコギリ波',
        waveSine: 'サイン波',
        waveSquare: '矩形波',
        waveNoise: 'ノイズ',
        synth: 'シンセ',
        file: 'ファイル',
        simulationIntensity: 'シミュレーション強度',
        spectrogram: 'スペクトログラム',
        noiseSource: 'ノイズソース (息)',
        whiteNoise: 'ホワイトノイズ',
        fileSource: 'ファイルソース',
        noiseFilePlaceholder: 'ノイズファイルを選択',
        pitch: 'ピッチ',
        gender: '性別',
        lips: '唇の開き',
        lipLen: '唇の長さ',
        throat: '喉の締め',
        nasal: '鼻音',
        sendLabel: 'レンダー後に送る →',
        sendStudio: '→ スタジオ',
        sendVocoder: '→ ボコーダー',
        sendStudioTitle: '現在のシミュレーションをレンダーしてスタジオタブへ送ります',
        sendVocoderTitle: '現在のシミュレーションをレンダーしてボコーダータブへ送ります',
    },
} as const;

const ADVANCED_TRACT_TRACK_NAMES = {
    ko: {
        tongueX: '혀 위치 (X)',
        tongueY: '혀 높이 (Y)',
        lips: '입술 열기',
        lipLen: '입술 길이',
        throat: '목 조임',
        nasal: '연구개 (Velum)',
        pitch: '피치 (Hz)',
        gender: '성별 (Shift)',
        gain: '게인 (Vol)',
        breath: '숨소리',
    },
    en: {
        tongueX: 'Tongue Position (X)',
        tongueY: 'Tongue Height (Y)',
        lips: 'Lip Open',
        lipLen: 'Lip Length',
        throat: 'Throat',
        nasal: 'Velum (Nasal)',
        pitch: 'Pitch (Hz)',
        gender: 'Gender (Shift)',
        gain: 'Gain (Vol)',
        breath: 'Breath',
    },
    ja: {
        tongueX: '舌の位置 (X)',
        tongueY: '舌の高さ (Y)',
        lips: '唇の開き',
        lipLen: '唇の長さ',
        throat: '喉の締め',
        nasal: '軟口蓋 (Velum)',
        pitch: 'ピッチ (Hz)',
        gender: '性別 (Shift)',
        gain: 'ゲイン (Vol)',
        breath: '息成分',
    },
} as const;

type AdvancedTrackNameKey = keyof typeof ADVANCED_TRACT_TRACK_NAMES.ko;

const createDefaultAdvTracks = (language: keyof typeof ADVANCED_TRACT_TRACK_NAMES): AdvTrack[] => {
    const labels = ADVANCED_TRACT_TRACK_NAMES[language];
    return [
        { id: 'tongueX', name: labels.tongueX, group: 'adj', color: '#60a5fa', points: [{ t: 0, v: 0.5 }, { t: 1, v: 0.5 }], min: 0, max: 1, interpolation: 'curve' },
        { id: 'tongueY', name: labels.tongueY, group: 'adj', color: '#4ade80', points: [{ t: 0, v: 0.4 }, { t: 1, v: 0.4 }], min: 0, max: 1, interpolation: 'curve' },
        { id: 'lips', name: labels.lips, group: 'adj', color: '#f472b6', points: [{ t: 0, v: 0.7 }, { t: 1, v: 0.7 }], min: 0, max: 1, interpolation: 'curve' },
        { id: 'lipLen', name: labels.lipLen, group: 'adj', color: '#db2777', points: [{ t: 0, v: 0.5 }, { t: 1, v: 0.5 }], min: 0, max: 1, interpolation: 'curve' },
        { id: 'throat', name: labels.throat, group: 'adj', color: '#a78bfa', points: [{ t: 0, v: 0.5 }, { t: 1, v: 0.5 }], min: 0, max: 1, interpolation: 'curve' },
        { id: 'nasal', name: labels.nasal, group: 'adj', color: '#fb923c', points: [{ t: 0, v: 0.2 }, { t: 1, v: 0.2 }], min: 0, max: 1, interpolation: 'curve' },
        { id: 'pitch', name: labels.pitch, group: 'edit', color: '#fbbf24', points: [{ t: 0, v: 220 }, { t: 1, v: 220 }], min: 50, max: 600, interpolation: 'curve' },
        { id: 'gender', name: labels.gender, group: 'edit', color: '#ec4899', points: [{ t: 0, v: 1 }, { t: 1, v: 1 }], min: 0.5, max: 2.0, interpolation: 'curve' },
        { id: 'gain', name: labels.gain, group: 'edit', color: '#ef4444', points: [{ t: 0, v: 0 }, { t: 0.1, v: 1 }, { t: 0.9, v: 1 }, { t: 1, v: 0 }], min: 0, max: 1.5, interpolation: 'linear' },
        { id: 'breath', name: labels.breath, group: 'edit', color: '#22d3ee', points: [{ t: 0, v: 0.01 }, { t: 1, v: 0.01 }], min: 0, max: 0.3, interpolation: 'linear' },
    ];
};

// Cubic Interpolation (Catmull-Rom Spline)
const cubicHermite = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const a = 2 * p0 - 5 * p1 + 4 * p2 - p3;
    const b = -p0 + 3 * p1 - 3 * p2 + p3;
    const c = p2 - p0;
    const d = 2 * p1;
    return 0.5 * (a * t * t * t + b * t * t + c * t + d);
};

const AdvancedTractTab: React.FC<AdvancedTractTabProps> = ({ audioContext, files, onAddToRack, isActive, monitorGainValue = 1.0, onSendToStudio, onSendToVocoder }) => {
    const { language } = useLanguage();
    const text = ADVANCED_TRACT_TEXT[language];
    // --- State ---
    const [larynxParams, setLarynxParams] = useState<LarynxParams>({ jitterOn: false, jitterDepth: 10, jitterRate: 5, breathOn: true, breathGain: 0.1, noiseSourceType: 'generated', noiseSourceFileId: "", loopOn: true });
    const [tractSourceType, setTractSourceType] = useState('synth');
    const [tractSourceFileId, setTractSourceFileId] = useState("");
    const [synthWaveform, setSynthWaveform] = useState('sawtooth');
    const [pulseWidth, setPulseWidth] = useState(0.5);
    const [advDuration, setAdvDuration] = useState(2.0);
    const [fadeOutDuration] = useState(0.1);
    const [isAdvPlaying, setIsAdvPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [playHeadPos, setPlayheadPos] = useState(0);
    const [liveTract, setLiveTract] = useState<LiveTractState>({ x: 0.5, y: 0.4, lips: 0.7, lipLen: 0.5, throat: 0.5, nasal: 0.2 });
    const [manualPitch, setManualPitch] = useState(220);
    const [manualGender, setManualGender] = useState(1.0);
    const [simIndex, setSimIndex] = useState(1);
    const [simIntensity, setSimIntensity] = useState(1.0);

    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedTrackId, setSelectedTrackId] = useState('pitch');

    const [sidebarWidth, setSidebarWidth] = useState(420);
    const [isResizing, setIsResizing] = useState(false);
    const [previewBuffer, setPreviewBuffer] = useState<AudioBuffer | null>(null);
    const [sidebarTab, setSidebarTab] = useState<'settings' | 'eq'>('settings');
    const [showAnalyzer, setShowAnalyzer] = useState(false);

    const [showSpectrogram, setShowSpectrogram] = useState(false);
    const [pitchFileId, setPitchFileId] = useState("");
    const [pitchSensitivity, setPitchSensitivity] = useState(0.5);
    const [ghostTracks, setGhostTracks] = useState<AdvTrack[] | null>(null);
    const [showGhost, setShowGhost] = useState(true);
    const spectrogramCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const tractStateInputRef = useRef<HTMLInputElement | null>(null);

    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 80, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'lowshelf', freq: 200, gain: 0, q: 0.7, on: true },
        { id: 3, type: 'peaking', freq: 1500, gain: 0, q: 1.0, on: true },
        { id: 4, type: 'highshelf', freq: 6000, gain: 0, q: 0.7, on: true },
        { id: 5, type: 'lowpass', freq: 15000, gain: 0, q: 0.7, on: true }
    ]);

    const [advTracks, setAdvTracks] = useState<AdvTrack[]>(() => createDefaultAdvTracks(language));

    const [undoStack, setUndoStack] = useState<any[]>([]);
    const [redoStack, setRedoStack] = useState<any[]>([]);

    const isAdvPlayingRef = useRef(false);
    const liveAudioRef = useRef<any>(null);
    const animRef = useRef<number | null>(null);
    const lastRenderedRef = useRef<AudioBuffer | null>(null);
    const simStartTimeRef = useRef(0);
    const simPauseOffsetRef = useRef(0);
    const simPlaySourceRef = useRef<AudioBufferSourceNode | null>(null);
    const previewDebounceRef = useRef<number | null>(null);

    const applyVowelPreset = (v: 'A' | 'E' | 'I' | 'O' | 'U' | 'W' | 'Y') => {
        const presets = {
            // Core vowels tuned for clearer formant contrast (semi-vowels W/Y unchanged)
            'A': { x: 0.24, y: 0.12, lips: 0.86, lipLen: 0.38, nasal: 0.0, throat: 0.16 },
            'E': { x: 0.74, y: 0.62, lips: 0.56, lipLen: 0.36, nasal: 0.0, throat: 0.24 },
            'I': { x: 0.95, y: 0.90, lips: 0.20, lipLen: 0.24, nasal: 0.0, throat: 0.16 },
            'O': { x: 0.20, y: 0.46, lips: 0.34, lipLen: 0.70, nasal: 0.0, throat: 0.42 },
            'U': { x: 0.12, y: 0.84, lips: 0.14, lipLen: 0.90, nasal: 0.0, throat: 0.48 },
            'W': { x: 0.0, y: 0.9, lips: 0.0, lipLen: 1.0, nasal: 0.0, throat: 0.4 }, // Labio-velar (extreme U)
            'Y': { x: 1.0, y: 0.9, lips: 0.8, lipLen: 0.1, nasal: 0.0, throat: 0.2 }  // Palatal (extreme I)
        };
        const p = presets[v];
        setLiveTract({ ...liveTract, ...p });
        updateLiveAudio(p.x, p.y, p.lips, p.throat, p.lipLen, p.nasal, manualPitch, manualGender);
        commitChange(`${v} 프리셋 적용`);
    };

    const handleAnalyzerApply = (data: { tongueX?: any[], tongueY?: any[], lips?: any[], lipLen?: any[], throat?: any[], nasal?: any[] }) => {
        const commonProps = { interpolation: 'curve' as const };
        const newTracks = advTracks.map(t => {
            if (t.id === 'tongueX' && data.tongueX) return { ...t, points: data.tongueX, ...commonProps };
            if (t.id === 'tongueY' && data.tongueY) return { ...t, points: data.tongueY, ...commonProps };
            if (t.id === 'lips' && data.lips) return { ...t, points: data.lips, ...commonProps };
            if (t.id === 'lipLen' && data.lipLen) return { ...t, points: data.lipLen, ...commonProps };
            if (t.id === 'throat' && data.throat) return { ...t, points: data.throat, ...commonProps };
            if (t.id === 'nasal' && data.nasal) return { ...t, points: data.nasal, ...commonProps };
            return t;
        });
        setAdvTracks(newTracks);
        setGhostTracks(newTracks);
        setShowGhost(true);
        commitChange("AI 발음 분석 적용");
    };

    const handlePitchExtraction = () => {
        if (!pitchFileId) return;
        const f = files.find(f => f.id === pitchFileId);
        if (!f) return;
        const pts = AudioUtils.detectPitch(f.buffer, pitchSensitivity);
        const dur = advDuration;
        const normalizedPts = pts.map(p => ({ t: Math.min(1, p.t / dur), v: p.v })).filter(p => p.t <= 1);
        setAdvTracks(prev => prev.map(t => {
            if (t.id === 'pitch') return { ...t, points: normalizedPts, interpolation: 'curve' };
            return t;
        }));
        commitChange("피치 추출 적용");
    };

    useEffect(() => {
        if (!showSpectrogram || !tractSourceFileId) {
            spectrogramCanvasRef.current = null;
            return;
        }
        const f = files.find(f => f.id === tractSourceFileId);
        if (f && f.buffer) {
            const width = 1000;
            const height = 180;
            const data = AudioUtils.computeSpectrogram(f.buffer, width, height);
            if (data) {
                const cvs = document.createElement('canvas');
                cvs.width = width;
                cvs.height = height;
                const ctx = cvs.getContext('2d');
                if (ctx) {
                    const imgData = new ImageData(data, width, height);
                    ctx.putImageData(imgData, 0, 0);
                    spectrogramCanvasRef.current = cvs;
                }
            }
        }
    }, [showSpectrogram, tractSourceFileId, files]);

    useEffect(() => { isAdvPlayingRef.current = isAdvPlaying; }, [isAdvPlaying]);

    useEffect(() => {
        if (liveAudioRef.current && audioContext) {
            const now = audioContext.currentTime;
            const { f1, f2, f3 } = liveAudioRef.current;
            if (f1) f1.gain.setTargetAtTime(12 * simIntensity, now, 0.02);
            if (f2) f2.gain.setTargetAtTime(12 * simIntensity, now, 0.02);
            if (f3) f3.gain.setTargetAtTime(10 * simIntensity, now, 0.02);
        }
    }, [simIntensity, audioContext]);

    const localizeTracks = useCallback((tracks: AdvTrack[]) => {
        const labels = ADVANCED_TRACT_TRACK_NAMES[language];
        return tracks.map(track => ({
            ...track,
            name: labels[track.id as AdvancedTrackNameKey] ?? track.name,
        }));
    }, [language]);

    useEffect(() => {
        setAdvTracks(prev => localizeTracks(prev));
        setGhostTracks(prev => prev ? localizeTracks(prev) : null);
    }, [language, localizeTracks]);

    const getCurrentState = useCallback(() => ({
        larynxParams, tractSourceType, tractSourceFileId, synthWaveform, pulseWidth, liveTract, advTracks, manualPitch, manualGender, eqBands, simIntensity, advDuration,
        isEditMode, selectedTrackId, playHeadPos
    }), [larynxParams, tractSourceType, tractSourceFileId, synthWaveform, pulseWidth, liveTract, advTracks, manualPitch, manualGender, eqBands, simIntensity, advDuration, isEditMode, selectedTrackId, playHeadPos]);

    const commitChange = useCallback((label: string = "변경") => {
        const state = getCurrentState();
        setUndoStack(prev => [...prev.slice(-19), state]);
        setRedoStack([]);
    }, [getCurrentState]);

    const restoreState = useCallback((state: any) => {
        setLarynxParams(state.larynxParams); setTractSourceType(state.tractSourceType); setTractSourceFileId(state.tractSourceFileId);
        setSynthWaveform(state.synthWaveform); setPulseWidth(state.pulseWidth); setLiveTract(state.liveTract); setAdvTracks(localizeTracks(state.advTracks));
        setManualPitch(state.manualPitch || 220); setManualGender(state.manualGender || 1.0); if (state.eqBands) setEqBands(state.eqBands);
        setSimIntensity(state.simIntensity !== undefined ? state.simIntensity : 1.0);
        setAdvDuration(state.advDuration !== undefined ? state.advDuration : 2.0);
        if (typeof state.isEditMode === 'boolean') setIsEditMode(state.isEditMode);
        if (typeof state.selectedTrackId === 'string') setSelectedTrackId(state.selectedTrackId);
        const restoredPlayhead = typeof state.playHeadPos === 'number' ? state.playHeadPos : playHeadPos;
        setPlayheadPos(restoredPlayhead);
        simPauseOffsetRef.current = restoredPlayhead * (state.advDuration !== undefined ? state.advDuration : advDuration);
    }, [localizeTracks, playHeadPos, advDuration]);

    const simStateSaveLabel = language === 'ko' ? '\uC131\uB3C4 \uC0C1\uD0DC \uC800\uC7A5' : language === 'ja' ? '\u58F0\u9053\u72B6\u614B\u3092\u4FDD\u5B58' : 'Save Sim State';
    const simStateLoadLabel = language === 'ko' ? '\uC131\uB3C4 \uC0C1\uD0DC \uBD88\uB7EC\uC624\uAE30' : language === 'ja' ? '\u58F0\u9053\u72B6\u614B\u3092\u8AAD\u307F\u8FBC\u307F' : 'Load Sim State';
    const simStateSectionTitle = language === 'ko' ? '\uC131\uB3C4 \uC0C1\uD0DC \uD504\uB9AC\uC14B' : language === 'ja' ? '\u58F0\u9053\u72B6\u614B\u30D7\u30EA\u30BB\u30C3\u30C8' : 'Sim State Preset';
    const simStateImportError = language === 'ko' ? '\uC131\uB3C4 \uC0C1\uD0DC \uD30C\uC77C\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.' : language === 'ja' ? '\u58F0\u9053\u72B6\u614B\u30D5\u30A1\u30A4\u30EB\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002' : 'Failed to load sim state file.';
    const simStateInvalidFile = language === 'ko' ? '\uC720\uD6A8\uD55C \uC131\uB3C4 \uC0C1\uD0DC \uD30C\uC77C\uC774 \uC544\uB2D9\uB2C8\uB2E4.' : language === 'ja' ? '\u6709\u52B9\u306A\u58F0\u9053\u72B6\u614B\u30D5\u30A1\u30A4\u30EB\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002' : 'Invalid sim state file.';

    const handleExportSimState = useCallback(() => {
        const payload = {
            kind: 'otonashi-tract-state',
            version: '1.0',
            exportedAt: new Date().toISOString(),
            simState: getCurrentState(),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `otonashi_tract_state_${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }, [getCurrentState]);

    const handleImportSimState = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const raw = JSON.parse(await file.text());
            const incoming = raw?.simState ?? raw?.tractState ?? raw;

            if (!incoming || typeof incoming !== 'object') {
                alert(simStateInvalidFile);
                return;
            }

            const current = getCurrentState();
            const merged = {
                ...current,
                ...incoming,
                larynxParams: incoming.larynxParams ? { ...current.larynxParams, ...incoming.larynxParams } : current.larynxParams,
                liveTract: incoming.liveTract ? { ...current.liveTract, ...incoming.liveTract } : current.liveTract,
                advTracks: Array.isArray(incoming.advTracks) ? incoming.advTracks : current.advTracks,
                eqBands: Array.isArray(incoming.eqBands) ? incoming.eqBands : current.eqBands,
                isEditMode: typeof incoming.isEditMode === 'boolean' ? incoming.isEditMode : current.isEditMode,
                selectedTrackId: typeof incoming.selectedTrackId === 'string' ? incoming.selectedTrackId : current.selectedTrackId,
                playHeadPos: typeof incoming.playHeadPos === 'number' ? incoming.playHeadPos : current.playHeadPos,
            };

            commitChange('Import sim state');
            restoreState(merged);
        } catch {
            alert(simStateImportError);
        } finally {
            e.target.value = '';
        }
    }, [getCurrentState, commitChange, restoreState, simStateImportError, simStateInvalidFile]);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;
        const currentState = getCurrentState();
        const prevState = undoStack[undoStack.length - 1];
        setRedoStack(prev => [...prev, currentState]);
        setUndoStack(prev => prev.slice(0, -1));
        restoreState(prevState);
    }, [undoStack, getCurrentState, restoreState]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const currentState = getCurrentState();
        const nextState = redoStack[redoStack.length - 1];
        setUndoStack(prev => [...prev, currentState]);
        setRedoStack(prev => prev.slice(0, -1));
        restoreState(nextState);
    }, [redoStack, getCurrentState, restoreState]);

    const getValueAtTime = useCallback((trackId: string, t: number, tracks: AdvTrack[] = advTracks) => {
        const track = tracks.find(tr => tr.id === trackId);
        if (!track) return 0;
        const pts = track.points;
        if (pts.length === 0) return track.min;
        if (t <= pts[0].t) return pts[0].v;
        if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].v;

        if (track.interpolation === 'curve') {
            let i = 0;
            while (i < pts.length - 1 && pts[i + 1].t < t) i++;
            const p0 = i > 0 ? pts[i - 1] : pts[i];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = i < pts.length - 2 ? pts[i + 2] : pts[i + 1];
            const range = p2.t - p1.t;
            if (range === 0) return p1.v;
            const tLocal = (t - p1.t) / range;
            return Math.max(track.min, Math.min(track.max, cubicHermite(p0.v, p1.v, p2.v, p3.v, tLocal)));
        }
        else {
            for (let i = 0; i < pts.length - 1; i++) {
                if (t >= pts[i].t && t <= pts[i + 1].t) {
                    const ratio = (t - pts[i].t) / (pts[i + 1].t - pts[i].t);
                    return pts[i].v + (pts[i + 1].v - pts[i].v) * ratio;
                }
            }
        }
        return pts[0].v;
    }, [advTracks]);

    const syncVisualsToTime = useCallback((t: number) => {
        setLiveTract({
            x: getValueAtTime('tongueX', t),
            y: getValueAtTime('tongueY', t),
            lips: getValueAtTime('lips', t),
            lipLen: getValueAtTime('lipLen', t),
            throat: getValueAtTime('throat', t),
            nasal: getValueAtTime('nasal', t),
        });
        setManualPitch(getValueAtTime('pitch', t));
        setManualGender(getValueAtTime('gender', t));
    }, [getValueAtTime]);

    const updateLiveAudio = useCallback((x: number, y: number, l: number, t: number, len: number, n: number, pitch: number, gender: number) => {
        if (!liveAudioRef.current || !audioContext) return;
        const now = audioContext.currentTime; const { f1, f2, f3, nasF, sNode, nG } = liveAudioRef.current;
        const lF = 1.0 - (len * 0.3); const liF = 0.5 + (l * 0.5);
        let fr1 = (200 + (1 - y) * 600 - (t * 50)) * lF * liF;
        let fr2 = (800 + x * 1400) * lF * liF;
        let fr3 = (2000 + l * 1500) * lF;
        fr1 *= gender; fr2 *= gender; fr3 *= gender;
        if (f1) f1.frequency.setTargetAtTime(Math.max(50, fr1), now, 0.01);
        if (f2) f2.frequency.setTargetAtTime(fr2, now, 0.01);
        if (f3) f3.frequency.setTargetAtTime(fr3, now, 0.01);
        if (nasF) nasF.frequency.setTargetAtTime(Math.max(400, (10000 - (n * 9000)) * gender), now, 0.01);
        if (sNode instanceof OscillatorNode) sNode.frequency.setTargetAtTime(pitch, now, 0.01);
        if (nG) nG.gain.setTargetAtTime(getValueAtTime('breath', playHeadPos), now, 0.01);
    }, [audioContext, getValueAtTime, playHeadPos]);

    const startLivePreview = useCallback(() => {
        if (!audioContext || liveAudioRef.current) return;
        let sNode: any;
        let nNode: any;

        if (tractSourceType === 'file' && tractSourceFileId) {
            const f = files.find(f => f.id === tractSourceFileId);
            if (f?.buffer) { sNode = audioContext.createBufferSource(); sNode.buffer = f.buffer; sNode.loop = larynxParams.loopOn; }
        }
        if (!sNode) {
            if (synthWaveform === 'noise') {
                const bufferSize = audioContext.sampleRate * 2;
                const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                sNode = audioContext.createBufferSource(); sNode.buffer = buffer; sNode.loop = true;
            } else {
                sNode = audioContext.createOscillator();
                sNode.type = synthWaveform as OscillatorType;
                sNode.frequency.value = manualPitch;
            }
        }

        if (larynxParams.noiseSourceType === 'file' && larynxParams.noiseSourceFileId) {
            const f = files.find(f => f.id === larynxParams.noiseSourceFileId);
            if (f?.buffer) { nNode = audioContext.createBufferSource(); nNode.buffer = f.buffer; nNode.loop = larynxParams.loopOn; }
        } else {
            const bufferSize = audioContext.sampleRate * 2;
            const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            nNode = audioContext.createBufferSource(); nNode.buffer = buffer; nNode.loop = true;
        }

        const g = audioContext.createGain();
        g.gain.value = 0.1; // Reduced from 0.5 to 0.1 for comfortable listening
        const nG = audioContext.createGain(); nG.gain.value = getValueAtTime('breath', playHeadPos);

        const f1 = audioContext.createBiquadFilter(); f1.type = 'peaking'; f1.Q.value = 4; f1.gain.value = 12 * simIntensity;
        const f2 = audioContext.createBiquadFilter(); f2.type = 'peaking'; f2.Q.value = 4; f2.gain.value = 12 * simIntensity;
        const f3 = audioContext.createBiquadFilter(); f3.type = 'peaking'; f3.Q.value = 4; f3.gain.value = 10 * simIntensity;
        const nasF = audioContext.createBiquadFilter(); nasF.type = 'lowpass';

        let lastNode: AudioNode = nasF;
        eqBands.forEach(b => {
            if (b.on) {
                const eq = audioContext.createBiquadFilter(); eq.type = b.type; eq.frequency.value = b.freq; eq.gain.value = b.gain; eq.Q.value = b.q;
                lastNode.connect(eq); lastNode = eq;
            }
        });

        sNode.connect(f1);
        nNode.connect(nG); nG.connect(f1);

        // 출력단: 필터 및 EQ 거친 후 -> 전체 Gain (g) -> 안전 Limiter -> Monitor Gain -> 스피커
        const limiter = audioContext.createDynamicsCompressor();
        limiter.threshold.value = -3.0; // 강한 피크 방지용
        limiter.ratio.value = 20.0;
        limiter.attack.value = 0.005;
        limiter.release.value = 0.05;

        const monitorNode = audioContext.createGain();
        monitorNode.gain.value = monitorGainValue;

        f1.connect(f2); f2.connect(f3); f3.connect(nasF);
        lastNode.connect(g);
        g.connect(limiter);
        limiter.connect(monitorNode);
        monitorNode.connect(audioContext.destination);

        sNode.start(); nNode.start();
        liveAudioRef.current = { sNode, nNode, nG, f1, f2, f3, nasF };
    }, [audioContext, tractSourceType, tractSourceFileId, files, larynxParams, synthWaveform, manualPitch, eqBands, getValueAtTime, playHeadPos, simIntensity, monitorGainValue]);

    const stopLivePreview = useCallback(() => {
        if (liveAudioRef.current) {
            try { liveAudioRef.current.sNode.stop(); if (liveAudioRef.current.nNode) liveAudioRef.current.nNode.stop(); } catch (e) { }
            liveAudioRef.current = null;
        }
    }, []);

    const [controlMode, setControlMode] = useState<'tongue' | 'lips' | 'nasal' | null>(null);

    const handleSimulationMouseDown = useCallback((e: React.MouseEvent, mode: 'tongue' | 'lips' | 'nasal') => {
        setControlMode(mode);
        const rect = e.currentTarget.closest('svg')?.getBoundingClientRect();
        if (!rect) return;
        const update = (ce: any) => {
            const relX = Math.max(0, Math.min(1, (ce.clientX - rect.left) / rect.width));
            const relY = Math.max(0, Math.min(1, 1 - (ce.clientY - rect.top) / rect.height));
            setLiveTract(prev => {
                let n = { ...prev };
                if (mode === 'tongue') { n.x = relX; n.y = relY; }
                else if (mode === 'lips') { n.lipLen = 1 - relX; n.lips = relY; }
                else if (mode === 'nasal') { n.nasal = relY; }
                updateLiveAudio(n.x, n.y, n.lips, n.throat, n.lipLen, n.nasal, manualPitch, manualGender);
                return n;
            });
        };
        update(e); startLivePreview();
        const mv = (me: MouseEvent) => update(me);
        const up = () => {
            window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
            stopLivePreview(); setControlMode(null); commitChange(`${mode} 조작`);
        };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    }, [startLivePreview, stopLivePreview, updateLiveAudio, manualPitch, manualGender, commitChange]);

    const renderAdvancedAudio = useCallback(async () => {
        if (!audioContext) return null;
        const sr = audioContext.sampleRate;
        const len = Math.max(1, Math.floor(sr * advDuration));
        const offline = new OfflineAudioContext(1, len, sr);
        const getV = (id: string, t: number) => getValueAtTime(id, t);

        let sNode: AudioNode;
        if (tractSourceType === 'file' && tractSourceFileId) {
            const f = files.find(f => f.id === tractSourceFileId);
            if (f?.buffer) {
                const b = offline.createBufferSource(); b.buffer = f.buffer; b.loop = larynxParams.loopOn; sNode = b;
            } else {
                const osc = offline.createOscillator(); osc.type = 'sawtooth'; sNode = osc;
            }
        } else {
            if (synthWaveform === 'noise') {
                const bufferSize = sr * advDuration;
                const buffer = offline.createBuffer(1, bufferSize, sr);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                const noiseSrc = offline.createBufferSource(); noiseSrc.buffer = buffer; sNode = noiseSrc;
            } else {
                const osc = offline.createOscillator();
                osc.type = synthWaveform as any;
                const pitchTrack = advTracks.find(t => t.id === 'pitch');
                if (pitchTrack && pitchTrack.points.length > 0) {
                    const steps = 100;
                    for (let i = 0; i <= steps; i++) {
                        const t = i / steps;
                        const val = getValueAtTime('pitch', t);
                        osc.frequency.linearRampToValueAtTime(val, t * advDuration);
                    }
                }
                sNode = osc;
            }
        }

        let nNode: AudioBufferSourceNode;
        if (larynxParams.noiseSourceType === 'file' && larynxParams.noiseSourceFileId) {
            const f = files.find(f => f.id === larynxParams.noiseSourceFileId);
            if (f?.buffer) {
                nNode = offline.createBufferSource(); nNode.buffer = f.buffer; nNode.loop = larynxParams.loopOn;
            } else {
                const bufferSize = sr * advDuration;
                const buffer = offline.createBuffer(1, bufferSize, sr);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                nNode = offline.createBufferSource(); nNode.buffer = buffer; nNode.loop = true;
            }
        } else {
            const bufferSize = sr * advDuration;
            const buffer = offline.createBuffer(1, bufferSize, sr);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            nNode = offline.createBufferSource(); nNode.buffer = buffer; nNode.loop = true;
        }

        const nG = offline.createGain();
        const mG = offline.createGain();
        const fG = offline.createGain();

        const steps = 60;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const time = t * advDuration;
            // Scale the automation value by 0.25 to prevent clipping from filter resonance
            mG.gain.linearRampToValueAtTime(getValueAtTime('gain', t) * 0.25, time);
        }

        const startFade = Math.max(0, advDuration - fadeOutDuration);
        fG.gain.setValueAtTime(1, 0);
        fG.gain.setValueAtTime(1, startFade);
        fG.gain.linearRampToValueAtTime(0, advDuration);

        const f1 = offline.createBiquadFilter(), f2 = offline.createBiquadFilter(), f3 = offline.createBiquadFilter(), nasF = offline.createBiquadFilter();
        f1.type = 'peaking'; f1.Q.value = 4; f1.gain.value = 12 * simIntensity;
        f2.type = 'peaking'; f2.Q.value = 4; f2.gain.value = 12 * simIntensity;
        f3.type = 'peaking'; f3.Q.value = 4; f3.gain.value = 10 * simIntensity;
        nasF.type = 'lowpass';

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const time = t * advDuration;
            const x = getV('tongueX', t), y = getV('tongueY', t), l = getV('lips', t), th = getV('throat', t), ln = getV('lipLen', t), n = getV('nasal', t), gFactor = getV('gender', t);
            const lF = 1.0 - (ln * 0.3), lipF = 0.5 + (l * 0.5);
            f1.frequency.linearRampToValueAtTime(Math.max(50, (200 + (1 - y) * 600 - th * 50)) * lF * lipF * gFactor, time);
            f2.frequency.linearRampToValueAtTime((800 + x * 1400) * lF * lipF * gFactor, time);
            f3.frequency.linearRampToValueAtTime((2000 + l * 1500) * lF * gFactor, time);
            nasF.frequency.linearRampToValueAtTime(Math.max(400, 10000 - n * 9000) * gFactor, time);
            const breathV = getV('breath', t);
            nG.gain.linearRampToValueAtTime(breathV, time);
        }

        sNode.connect(mG);
        nNode.connect(nG); nG.connect(f1);
        mG.connect(fG);
        fG.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF);

        let lastNode: AudioNode = nasF;
        eqBands.forEach(b => {
            if (b.on) {
                const eq = offline.createBiquadFilter(); eq.type = b.type; eq.frequency.value = b.freq; eq.gain.value = b.gain; eq.Q.value = b.q;
                lastNode.connect(eq); lastNode = eq;
            }
        });

        lastNode.connect(offline.destination);
        if ((sNode as any).start) (sNode as any).start(0);
        nNode.start(0);

        const renderedBuffer = await offline.startRendering();

        lastRenderedRef.current = renderedBuffer;
        return renderedBuffer;
    }, [audioContext, advDuration, advTracks, tractSourceType, tractSourceFileId, files, larynxParams, fadeOutDuration, synthWaveform, eqBands, getValueAtTime, simIntensity]);

    useEffect(() => {
        if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = window.setTimeout(async () => {
            const buf = await renderAdvancedAudio();
            if (buf) {
                setPreviewBuffer(buf);
            }
        }, 500);
        return () => { if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current); };
    }, [renderAdvancedAudio]);

    const handleSimulationPlay = useCallback(async () => {
        if (isAdvPlaying) {
            if (simPlaySourceRef.current) {
                try { simPlaySourceRef.current.stop(); } catch (e) { }
                simPlaySourceRef.current = null;
            }
            simPauseOffsetRef.current = audioContext.currentTime - simStartTimeRef.current;
            if (animRef.current) cancelAnimationFrame(animRef.current);
            setIsAdvPlaying(false);
            setIsPaused(true);
            isAdvPlayingRef.current = false;
        } else {
            if (audioContext.state === 'suspended') await audioContext.resume();
            const res = lastRenderedRef.current || await renderAdvancedAudio();
            if (!res) return;
            const s = audioContext.createBufferSource();
            s.buffer = res;
            s.connect(audioContext.destination);
            const offset = isPaused ? simPauseOffsetRef.current : 0;
            let effectiveOffset = offset >= res.duration ? 0 : offset;
            s.start(0, effectiveOffset);
            simStartTimeRef.current = audioContext.currentTime - effectiveOffset;
            simPlaySourceRef.current = s;
            setIsAdvPlaying(true);
            isAdvPlayingRef.current = true;
            setIsPaused(false);
            const animate = () => {
                if (!isAdvPlayingRef.current) return;
                const cur = audioContext.currentTime - simStartTimeRef.current;
                const progress = Math.min(1, Math.max(0, cur / advDuration));
                setPlayheadPos(progress);
                syncVisualsToTime(progress);
                if (cur < advDuration) {
                    animRef.current = requestAnimationFrame(animate);
                } else {
                    setIsAdvPlaying(false);
                    setPlayheadPos(0);
                    simPauseOffsetRef.current = 0;
                    syncVisualsToTime(0);
                    isAdvPlayingRef.current = false;
                }
            };
            animRef.current = requestAnimationFrame(animate);
        }
    }, [isAdvPlaying, isPaused, renderAdvancedAudio, audioContext, advDuration, syncVisualsToTime]);

    const handleDownloadResult = async () => {
        const res = lastRenderedRef.current || await renderAdvancedAudio();
        if (res) AudioUtils.downloadWav(res, `sim_output_${simIndex}.wav`);
    };

    const handleSaveToRack = async () => {
        const res = lastRenderedRef.current || await renderAdvancedAudio();
        if (res) {
            onAddToRack(res, "Sim_" + simIndex);
            setSimIndex(s => s + 1);
        }
    };

    const handleSendToStudio = async () => {
        const res = lastRenderedRef.current || await renderAdvancedAudio();
        if (res && onSendToStudio) {
            onSendToStudio(res, "Sim_Studio_" + simIndex);
            setSimIndex(s => s + 1);
        }
    };

    const handleSendToVocoder = async () => {
        const res = lastRenderedRef.current || await renderAdvancedAudio();
        if (res && onSendToVocoder) {
            onSendToVocoder(res, "Sim_Vocoder_" + simIndex);
            setSimIndex(s => s + 1);
        }
    };

    const recordSnapshot = () => {
        const t = playHeadPos;
        setAdvTracks(prev => prev.map(tr => {
            if (tr.group !== 'adj' && tr.id !== 'pitch' && tr.id !== 'gender') return tr;
            let val = 0;
            if (tr.id === 'tongueX') val = liveTract.x; else if (tr.id === 'tongueY') val = liveTract.y; else if (tr.id === 'lips') val = liveTract.lips; else if (tr.id === 'lipLen') val = liveTract.lipLen; else if (tr.id === 'throat') val = liveTract.throat; else if (tr.id === 'nasal') val = liveTract.nasal; else if (tr.id === 'pitch') val = manualPitch; else if (tr.id === 'gender') val = manualGender;
            return { ...tr, points: [...tr.points.filter(p => Math.abs(p.t - t) > 0.005), { t, v: val }].sort((a, b) => a.t - b.t) };
        }));
        commitChange("기록");
    }

    const handleResetAllKeyframes = useCallback(() => {
        commitChange("Reset all keyframes");
        const defaultTracks = createDefaultAdvTracks(language);
        setAdvTracks(defaultTracks);
        setSelectedTrackId('pitch');
        setPlayheadPos(0);
        simPauseOffsetRef.current = 0;
        setLiveTract({
            x: getValueAtTime('tongueX', 0, defaultTracks),
            y: getValueAtTime('tongueY', 0, defaultTracks),
            lips: getValueAtTime('lips', 0, defaultTracks),
            lipLen: getValueAtTime('lipLen', 0, defaultTracks),
            throat: getValueAtTime('throat', 0, defaultTracks),
            nasal: getValueAtTime('nasal', 0, defaultTracks),
        });
        setManualPitch(getValueAtTime('pitch', 0, defaultTracks));
        setManualGender(getValueAtTime('gender', 0, defaultTracks));
    }, [commitChange, language, getValueAtTime]);

    const getCurrentValue = (trackId: string) => getValueAtTime(trackId, playHeadPos);

    useEffect(() => {
        if (!isActive) return;
        const handleKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
            if (isTyping) return;

            if (e.code === 'Space') {
                e.preventDefault();
                handleSimulationPlay();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                handleUndo();
                return;
            }

            if (e.key === 'Tab') {
                e.preventDefault();
                setIsEditMode(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isActive, handleSimulationPlay, handleUndo]);

    return (
        <div className="flex-1 flex flex-col p-2 gap-2 animate-in fade-in overflow-hidden h-full">
            {showAnalyzer && <FormantAnalyzer files={files} audioContext={audioContext} onClose={() => setShowAnalyzer(false)} onApply={handleAnalyzerApply} />}

            {/* Top Section (Visualizer + Settings) */}
            <div className="flex-1 flex gap-0 shrink-0 min-h-0 flex-[3]">
                {/* Responsive Visualizer */}
                <TractVisualizer
                    liveTract={liveTract}
                    manualPitch={manualPitch}
                    manualGender={manualGender}
                    isAdvPlaying={isAdvPlaying}
                    undoStackLength={undoStack.length}
                    redoStackLength={redoStack.length}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onRecordSnapshot={recordSnapshot}
                    onPlayToggle={handleSimulationPlay}
                    onDownload={handleDownloadResult}
                    onSaveToRack={handleSaveToRack}
                    onMouseDown={handleSimulationMouseDown}
                />

                {/* Resizer Handle */}
                <div className={`w-1.5 hover:bg-blue-400/50 cursor-col-resize transition-colors ${isResizing ? 'dynamic-primary' : ''}`} onMouseDown={(e) => { setIsResizing(true); e.preventDefault(); }} />

                {/* Sidebar (Settings/EQ) */}
                <div className="bg-white/40 dynamic-radius border border-slate-300 flex flex-col overflow-hidden shrink-0 shadow-sm" style={{ width: `${sidebarWidth}px` }}>
                    <div className="flex border-b border-slate-300 bg-white/40">
                        <button onClick={() => setSidebarTab('settings')} className={`flex-1 py-3 text-xs font-black transition-all ${sidebarTab === 'settings' ? 'bg-white dynamic-primary-text border-b-2 dynamic-primary-border shadow-sm' : 'text-slate-500'}`}><Settings2 size={14} className="inline mr-1" /> {text.settings}</button>
                        <button onClick={() => setSidebarTab('eq')} className={`flex-1 py-3 text-xs font-black transition-all ${sidebarTab === 'eq' ? 'bg-white text-pink-600 border-b-2 border-pink-500 shadow-sm' : 'text-slate-500'}`}><AudioLines size={14} className="inline mr-1" /> {text.eq}</button>
                    </div>
                    <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 font-bold">
                        {sidebarTab === 'settings' ? (
                            <div className="space-y-6">
                                <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{simStateSectionTitle}</h3>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleExportSimState}
                                            className="flex-1 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-black text-slate-700 transition-all shadow-sm flex items-center justify-center gap-1.5"
                                        >
                                            <Download size={13} />
                                            {simStateSaveLabel}
                                        </button>
                                        <button
                                            onClick={() => tractStateInputRef.current?.click()}
                                            className="flex-1 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg text-xs font-black text-indigo-700 transition-all shadow-sm flex items-center justify-center gap-1.5"
                                        >
                                            <Upload size={13} />
                                            {simStateLoadLabel}
                                        </button>
                                    </div>
                                    <input
                                        ref={tractStateInputRef}
                                        type="file"
                                        accept=".json"
                                        className="hidden"
                                        onChange={handleImportSimState}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">{text.vowelPresets}</h3>
                                    </div>
                                    <div className="flex gap-1 font-black">
                                        {(['A', 'E', 'I', 'O', 'U'] as const).map(v => (
                                            <button key={v} onClick={() => applyVowelPreset(v)} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-black text-slate-700 transition-all shadow-sm">{v}</button>
                                        ))}
                                    </div>
                                    <div className="flex gap-1 font-black">
                                        {(['W', 'Y'] as const).map(v => (
                                            <button key={v} onClick={() => applyVowelPreset(v)} className="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg text-xs font-black text-indigo-600 transition-all shadow-sm flex items-center justify-center gap-1">
                                                {v} <span className="text-[9px] opacity-60 font-bold">({text.semiVowel})</span>
                                            </button>
                                        ))}
                                    </div>
                                    <button onClick={() => setShowAnalyzer(true)} className="w-full py-2.5 mt-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm"><Wand2 size={14} /> {text.aiAnalyzer} (Beta)</button>
                                </div>
                                <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity size={12} /> {text.pitchAnalysis}</h3>
                                    <select value={pitchFileId} onChange={e => setPitchFileId(e.target.value)} className="w-full p-2 border rounded-lg text-xs font-bold outline-none text-slate-900">
                                        <option value="">{text.analyzeFilePlaceholder}</option>
                                        {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-black text-slate-500"><span>{text.sensitivity}</span><span className="text-indigo-600">{Math.round(pitchSensitivity * 100)}%</span></div>
                                        <input type="range" min="0" max="1" step="0.05" value={pitchSensitivity} onChange={e => setPitchSensitivity(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500" />
                                    </div>
                                    <button onClick={handlePitchExtraction} disabled={!pitchFileId} className="w-full py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-black text-slate-700 disabled:opacity-50 transition-all shadow-sm">{text.extractPitch}</button>
                                </div>
                                <div className="space-y-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Mic2 size={12} /> {text.glottisSource}</h3>
                                    <div className="flex gap-2 p-1 bg-slate-200 rounded-lg shadow-inner">
                                        <button onClick={() => setTractSourceType('synth')} className={`flex-1 py-1.5 rounded text-[10px] font-black transition-all ${tractSourceType === 'synth' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{text.synth}</button>
                                        <button onClick={() => setTractSourceType('file')} className={`flex-1 py-1.5 rounded text-[10px] font-black transition-all ${tractSourceType === 'file' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{text.file}</button>
                                    </div>
                                    {tractSourceType === 'synth' && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between"><span className="text-[10px] text-slate-500 uppercase font-black">{text.waveform}</span><select value={synthWaveform} onChange={e => setSynthWaveform(e.target.value)} className="text-[10px] bg-white border border-slate-200 rounded px-1 outline-none font-black text-slate-900"><option value="sawtooth">{text.waveSawtooth}</option><option value="sine">{text.waveSine}</option><option value="square">{text.waveSquare}</option><option value="noise">{text.waveNoise}</option></select></div>
                                        </div>
                                    )}
                                    {tractSourceType === 'file' && (
                                        <div className="space-y-2">
                                            <select value={tractSourceFileId} onChange={e => setTractSourceFileId(e.target.value)} className="w-full p-2 border rounded-lg text-xs font-bold outline-none text-slate-900"><option value="">{text.selectFile}</option>{files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                                            <div className="space-y-1"><div className="flex justify-between text-[10px] font-black text-slate-500"><span>{text.simulationIntensity}</span><span className="text-indigo-600">{Math.round(simIntensity * 100)}%</span></div><input type="range" min="0" max="1.5" step="0.05" value={simIntensity} onChange={e => setSimIntensity(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500" /></div>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between pt-1">
                                        <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1"><Waves size={12} /> {text.spectrogram}</span>
                                        <button onClick={() => setShowSpectrogram(!showSpectrogram)} className={`w-8 h-4 rounded-full transition-colors relative ${showSpectrogram ? 'bg-indigo-500' : 'bg-slate-300'}`}><div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${showSpectrogram ? 'left-4.5' : 'left-0.5'}`} /></button>
                                    </div>
                                    <div className="h-px bg-slate-200 my-2" />
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Wind size={12} /> {text.noiseSource}</h3>
                                    <div className="flex gap-2 p-1 bg-slate-200 rounded-lg shadow-inner">
                                        <button onClick={() => setLarynxParams({ ...larynxParams, noiseSourceType: 'generated' })} className={`flex-1 py-1.5 rounded text-[10px] font-black transition-all ${larynxParams.noiseSourceType === 'generated' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{text.whiteNoise}</button>
                                        <button onClick={() => setLarynxParams({ ...larynxParams, noiseSourceType: 'file' })} className={`flex-1 py-1.5 rounded text-[10px] font-black transition-all ${larynxParams.noiseSourceType === 'file' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{text.fileSource}</button>
                                    </div>
                                    {larynxParams.noiseSourceType === 'file' && (
                                        <select value={larynxParams.noiseSourceFileId} onChange={e => setLarynxParams({ ...larynxParams, noiseSourceFileId: e.target.value })} className="w-full p-2 border rounded-lg text-xs font-bold outline-none text-slate-900"><option value="">{text.noiseFilePlaceholder}</option>{files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <ParamInput label={text.duration} value={advDuration} min={0.5} max={30} step={0.1} onChange={setAdvDuration} colorClass="text-slate-500" />
                                    <ParamInput label={text.pitch} value={manualPitch} min={50} max={600} step={1} onChange={setManualPitch} colorClass="text-amber-500" />
                                    <ParamInput label={text.gender} value={manualGender} min={0.5} max={2.0} step={0.01} onChange={setManualGender} colorClass="text-pink-500" />
                                    <div className="h-px bg-slate-200 my-1" />
                                    {[['lips', text.lips, 'text-pink-400'], ['lipLen', text.lipLen, 'text-pink-600'], ['throat', text.throat, 'text-purple-400'], ['nasal', text.nasal, 'text-orange-400']].map(([id, l, c]) => (
                                        <ParamInput key={id} label={l} value={(liveTract as any)[id]} min={0} max={1} step={0.01} onChange={(v: number) => setLiveTract(p => ({ ...p, [id]: v }))} colorClass={c} />
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="h-[300px]"><ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={simPlaySourceRef.current} /></div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Section (Timeline Editor) - Responsive Flex */}
            <div className="flex-1 flex flex-col shrink-0 min-h-0 flex-[2]">
                {/* 스튜디오 / 보코더 전송 버튼 바 */}
                {(onSendToStudio || onSendToVocoder) && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200 shrink-0">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1">{text.sendLabel}</span>
                        {onSendToStudio && (
                            <button
                                onClick={handleSendToStudio}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black bg-indigo-500 text-white hover:bg-indigo-600 transition-all shadow-sm"
                                title={text.sendStudioTitle}
                            >
                                {text.sendStudio}
                            </button>
                        )}
                        {onSendToVocoder && (
                            <button
                                onClick={handleSendToVocoder}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black bg-purple-500 text-white hover:bg-purple-600 transition-all shadow-sm"
                                title={text.sendVocoderTitle}
                            >
                                {text.sendVocoder}
                            </button>
                        )}
                    </div>
                )}
                <TimelineEditor
                    advTracks={advTracks}
                    setAdvTracks={setAdvTracks}
                    selectedTrackId={selectedTrackId}
                    setSelectedTrackId={setSelectedTrackId}
                    playHeadPos={playHeadPos}
                    setPlayheadPos={setPlayheadPos}
                    syncVisualsToTime={syncVisualsToTime}
                    handleSimulationPlay={handleSimulationPlay}
                    isAdvPlaying={isAdvPlaying}
                    commitChange={commitChange}
                    isEditMode={isEditMode}
                    setIsEditMode={setIsEditMode}
                    showGhost={showGhost}
                    setShowGhost={setShowGhost}
                    ghostTracks={ghostTracks}
                    showSpectrogram={showSpectrogram}
                    spectrogramCanvas={spectrogramCanvasRef.current}
                    previewBuffer={previewBuffer}
                    getCurrentValue={getCurrentValue}
                    getValueAtTime={getValueAtTime}
                    simPauseOffsetRef={simPauseOffsetRef}
                    advDuration={advDuration}
                    onResetAllKeyframes={handleResetAllKeyframes}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    undoStackLength={undoStack.length}
                    redoStackLength={redoStack.length}
                />
            </div>
        </div>
    );
};

export default AdvancedTractTab;
