
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    Undo2, Redo2, Scissors, FilePlus, Sparkles, Activity, Square, Play, Pause, Save, AudioLines, Power, Copy, Layers, Fingerprint
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { AudioFile, KeyframePoint, FormantParams, EQBand } from '../types';
import { AudioUtils, RULER_HEIGHT } from '../utils/audioUtils';
import ParametricEQ from './ParametricEQ';
import FormantPad from './FormantPad';
import RangeControl from './ui/RangeControl';

interface StudioTabProps {
    audioContext: AudioContext;
    activeFile: AudioFile | undefined;
    files: AudioFile[];
    onUpdateFile: (buffer: AudioBuffer) => void;
    onAddToRack: (buffer: AudioBuffer, name: string) => void;
    setActiveFileId: (id: string) => void;
    isActive: boolean;
    monitorGainValue?: number;   // 0~1.0 (재생 시만 적용, 렌더링 무관)
}

interface UndoState {
    buffer: AudioBuffer;
    label: string;
}

const STUDIO_TEXT = {
    ko: {
        undo: '실행 취소',
        redo: '다시 실행',
        play: '재생',
        pause: '일시정지',
        stop: '정지',
        cutTitle: '선택 영역 자르기',
        copy: '복사',
        copyTitle: '선택 영역 복사',
        mixPaste: '겹쳐넣기',
        mixPasteTitle: '클립보드 오디오를 현재 위치에 겹쳐 붙여넣기',
        imprint: '텍스처 입히기',
        imprintTitle: '선택 영역에 클립보드 텍스처를 입히기',
        fadeIn: '페이드 인',
        fadeOut: '페이드 아웃',
        fadeSeconds: '초',
        fadeInTitle: (seconds: number) => `처음 ${seconds}초 페이드 인`,
        fadeOutTitle: (seconds: number) => `마지막 ${seconds}초 페이드 아웃`,
        fadeDurationTitle: '페이드 길이',
        saveSelection: '선택 저장',
        saveToRack: '보관함 저장',
        noFile: '보관함에서 파일을 선택하세요',
        clipboardReady: (seconds: number) => `클립보드 오디오 준비됨 (${seconds.toFixed(2)}s)`,
        effects: '효과',
        formantFilter: '포먼트 필터',
        formant: '포먼트',
        reverbDelay: '리버브 및 딜레이',
        compressor: '컴프레서',
        delayTime: '딜레이 시간',
        feedback: '피드백',
        reverbMix: '리버브 양',
        threshold: '임계값',
        ratio: '비율',
        formantDetail: '포먼트 상세',
        formantF1: 'F1 (목)',
        formantF2: 'F2 (입)',
        formantF3: 'F3 (앞쪽)',
        formantF4: 'F4 (디테일)',
        resonance: '공명도 (Q)',
        singerFormant: '싱어즈 포먼트',
        singerFormantHint: '2.5~4kHz 대역을 부스트해 성악식 존재감을 더합니다.',
        centerFreq: '중심 주파수',
        boostGain: '부스트 게인',
        qBandwidth: 'Q (대역폭)',
        masterOutput: '최종 출력',
        normalize: '노멀라이즈',
        normalizeShort: 'Norm',
        normalizeTitle: '출력 피크를 안전한 레벨로 정규화',
        bypass: '바이패스',
        bypassTitle: '효과 처리를 우회하고 원신호만 확인',
        gain: '게인',
    },
    en: {
        undo: 'Undo',
        redo: 'Redo',
        play: 'Play',
        pause: 'Pause',
        stop: 'Stop',
        cutTitle: 'Cut selection',
        copy: 'Copy',
        copyTitle: 'Copy selection',
        mixPaste: 'Mix Paste',
        mixPasteTitle: 'Layer the clipboard audio at the current position',
        imprint: 'Imprint',
        imprintTitle: 'Apply the clipboard texture to the selection',
        fadeIn: 'Fade In',
        fadeOut: 'Fade Out',
        fadeSeconds: 's',
        fadeInTitle: (seconds: number) => `Fade in for the first ${seconds} seconds`,
        fadeOutTitle: (seconds: number) => `Fade out for the last ${seconds} seconds`,
        fadeDurationTitle: 'Fade duration',
        saveSelection: 'Save Selection',
        saveToRack: 'Save to Rack',
        noFile: 'Select a file from the rack',
        clipboardReady: (seconds: number) => `Clipboard audio ready (${seconds.toFixed(2)}s)`,
        effects: 'エフェクト',
        formantFilter: 'Formant Filter',
        formant: 'Formant',
        reverbDelay: 'Reverb & Delay',
        compressor: 'Compressor',
        delayTime: 'Delay Time',
        feedback: 'Feedback',
        reverbMix: 'Reverb Mix',
        threshold: 'Threshold',
        ratio: 'Ratio',
        formantDetail: 'Formant Detail',
        formantF1: 'F1 (Throat)',
        formantF2: 'F2 (Mouth)',
        formantF3: 'F3 (Front)',
        formantF4: 'F4 (Detail)',
        resonance: 'Resonance (Q)',
        singerFormant: "Singer's Formant",
        singerFormantHint: 'Boost the 2.5-4kHz range to add a classical singer presence.',
        centerFreq: 'Center Freq',
        boostGain: 'Boost Gain',
        qBandwidth: 'Q (Bandwidth)',
        masterOutput: 'Master Output',
        normalize: 'Normalize',
        normalizeShort: 'Norm',
        normalizeTitle: 'Normalize the output peak to a safe level',
        bypass: 'Bypass',
        bypassTitle: 'Temporarily bypass processing and monitor the dry signal',
        gain: 'Gain',
    },
    ja: {
        undo: '元に戻す',
        redo: 'やり直す',
        play: '再生',
        pause: '一時停止',
        stop: '停止',
        cutTitle: '選択範囲をカット',
        copy: 'コピー',
        copyTitle: '選択範囲をコピー',
        mixPaste: 'ミックス貼り付け',
        mixPasteTitle: 'クリップボード音声を現在位置に重ねて貼り付け',
        imprint: 'インプリント',
        imprintTitle: '選択範囲へクリップボードの質感を適用',
        fadeIn: 'フェードイン',
        fadeOut: 'フェードアウト',
        fadeSeconds: '秒',
        fadeInTitle: (seconds: number) => `先頭 ${seconds} 秒をフェードイン`,
        fadeOutTitle: (seconds: number) => `末尾 ${seconds} 秒をフェードアウト`,
        fadeDurationTitle: 'フェード長',
        saveSelection: '選択を保存',
        saveToRack: 'ラックに保存',
        noFile: 'ラックからファイルを選択してください',
        clipboardReady: (seconds: number) => `クリップボード音声を保持中 (${seconds.toFixed(2)}s)`,
        effects: 'Effects',
        formantFilter: 'フォルマントフィルター',
        formant: 'フォルマント',
        reverbDelay: 'リバーブとディレイ',
        compressor: 'コンプレッサー',
        delayTime: 'ディレイ時間',
        feedback: 'フィードバック',
        reverbMix: 'リバーブ量',
        threshold: 'しきい値',
        ratio: '比率',
        formantDetail: 'フォルマント詳細',
        formantF1: 'F1 (喉)',
        formantF2: 'F2 (口)',
        formantF3: 'F3 (前方)',
        formantF4: 'F4 (細部)',
        resonance: '共鳴 (Q)',
        singerFormant: 'シンガーズフォルマント',
        singerFormantHint: '2.5〜4kHz 帯域を持ち上げて歌唱的な抜けを加えます。',
        centerFreq: '中心周波数',
        boostGain: 'ブースト量',
        qBandwidth: 'Q (帯域幅)',
        masterOutput: '最終出力',
        normalize: 'ノーマライズ',
        normalizeShort: 'Norm',
        normalizeTitle: '出力ピークを安全なレベルに正規化',
        bypass: 'バイパス',
        bypassTitle: '処理を一時的に迂回してドライ信号を確認',
        gain: 'Gain',
    },
} as const;

const StudioTab: React.FC<StudioTabProps> = ({ audioContext, activeFile, files, onUpdateFile, onAddToRack, setActiveFileId, isActive, monitorGainValue = 1.0 }) => {
    const { language } = useLanguage();
    const text = STUDIO_TEXT[language];
    const [editTrim, setEditTrim] = useState({ start: 0, end: 1 });
    const [isPlaying, setIsPlaying] = useState(false);
    const [playheadMode, setPlayheadMode] = useState<'all' | 'selection'>('all');
    const [isPaused, setIsPaused] = useState(false);
    const [playheadPos, setPlayheadPos] = useState(0);
    const [showAutomation, setShowAutomation] = useState(false);
    const [volumeKeyframes, setVolumeKeyframes] = useState<KeyframePoint[]>([{ t: 0, v: 1 }, { t: 1, v: 1 }]);

    // Clipboard State
    const [clipboard, setClipboard] = useState<AudioBuffer | null>(null);
    const [mixPasteGain, setMixPasteGain] = useState(1.0);
    const [fitClipboardToSelection, setFitClipboardToSelection] = useState(true);

    // UI Tabs
    const [sideTab, setSideTab] = useState<'effects' | 'formant_filter' | 'formant'>('effects');
    const [undoStack, setUndoStack] = useState<UndoState[]>([]);
    const [redoStack, setRedoStack] = useState<UndoState[]>([]);

    // Professional Audio States
    const [masterGain, setMasterGain] = useState(1.0);
    const [bypassEffects, setBypassEffects] = useState(false);
    const [pitchCents, setPitchCents] = useState(0);
    const [genderShift, setGenderShift] = useState(1.0);
    const [formant, setFormant] = useState<FormantParams>({ f1: 500, f2: 1500, f3: 2500, f4: 3500, resonance: 4.0 });

    // 노말라이제이션 (렌더링 버퍼에 peak normalization 적용)
    const [normalizationEnabled, setNormalizationEnabled] = useState(false);

    // Singer's Formant: 2.5~4kHz 대역 부스트 (성악 기법)
    const [singersFormantEnabled, setSingersFormantEnabled] = useState(false);
    const [singersFormantFreq, setSingersFormantFreq] = useState(3200);  // Hz (2500~4000)
    const [singersFormantGain, setSingersFormantGain] = useState(8);     // dB (0~20)
    const [singersFormantQ, setSingersFormantQ] = useState(3.0);         // Q (0.5~10)

    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 60, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'lowshelf', freq: 100, gain: 0, q: 0.7, on: true },
        { id: 3, type: 'peaking', freq: 1000, gain: 0, q: 1.0, on: true },
        { id: 4, type: 'highshelf', freq: 5000, gain: 0, q: 0.7, on: true },
        { id: 5, type: 'lowpass', freq: 18000, gain: 0, q: 0.7, on: true }
    ]);

    // Effects Params
    const [enableDelay, setEnableDelay] = useState(false);
    const [delayTime, setDelayTime] = useState(0.2);
    const [delayFeedback, setDelayFeedback] = useState(0.3);

    const [enableReverb, setEnableReverb] = useState(false);
    const [reverbMix, setReverbMix] = useState(0.3);

    const [compThresh, setCompThresh] = useState(-24);
    const [compRatio, setCompRatio] = useState(4);
    const [compAttack, setCompAttack] = useState(0.003);
    const [compRelease, setCompRelease] = useState(0.25);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);
    const animationRef = useRef<number | null>(null);
    const activeBuffer = useMemo(() => activeFile ? activeFile.buffer : null, [activeFile]);

    const pushUndo = useCallback((label: string = "Edit") => {
        if (activeBuffer) {
            setUndoStack(prev => [...prev.slice(-19), { buffer: activeBuffer, label }]);
            setRedoStack([]);
        }
    }, [activeBuffer]);

    const mixPasteLabel = language === 'ko' ? '\uBBF9\uC2A4' : language === 'ja' ? '\u30DF\u30C3\u30AF\u30B9' : 'Mix';
    const fitSelectionLabel = language === 'ko' ? '\uC120\uD0DD\uAD6C\uAC04 \uB9DE\uCDA4' : language === 'ja' ? '\u9078\u629E\u7BC4\u56F2\u306B\u5408\u308F\u305B\u308B' : 'Fit Selection';
    const gainGraphLabel = language === 'ko' ? '\uAC8C\uC778 \uADF8\uB798\uD504' : language === 'ja' ? '\u30B2\u30A4\u30F3\u30B0\u30E9\u30D5' : 'Gain Graph';
    const gainGraphHint = language === 'ko'
        ? 'Shift+\uD074\uB9AD \uCD94\uAC00, \uB4DC\uB798\uADF8 \uC774\uB3D9, \uC6B0\uD074\uB9AD \uC0AD\uC81C'
        : language === 'ja'
            ? 'Shift+\u30AF\u30EA\u30C3\u30AF\u3067\u8FFD\u52A0\u3001\u30C9\u30E9\u30C3\u30B0\u3067\u79FB\u52D5\u3001\u53F3\u30AF\u30EA\u30C3\u30AF\u3067\u524A\u9664'
            : 'Shift+Click add, drag move, right-click delete';

    const mixBuffersWithGain = useCallback((base: AudioBuffer, overlay: AudioBuffer, startSample: number, gain: number) => {
        const numChannels = Math.max(base.numberOfChannels, overlay.numberOfChannels);
        const length = Math.max(base.length, startSample + overlay.length);
        const newBuf = audioContext.createBuffer(numChannels, length, base.sampleRate);
        const safeGain = Math.max(0, Math.min(2, gain));

        for (let i = 0; i < numChannels; i++) {
            const out = newBuf.getChannelData(i);
            const baseData = i < base.numberOfChannels ? base.getChannelData(i) : null;
            const overlayData = i < overlay.numberOfChannels ? overlay.getChannelData(i) : null;

            for (let j = 0; j < length; j++) {
                const dry = baseData && j < baseData.length ? baseData[j] : 0;
                const wet = overlayData && j >= startSample && (j - startSample) < overlay.length ? overlayData[j - startSample] * safeGain : 0;
                out[j] = Math.tanh(dry + wet);
            }
        }
        return newBuf;
    }, [audioContext]);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0 || !activeBuffer) return;
        const prev = undoStack[undoStack.length - 1];
        setRedoStack(prevSt => [...prevSt.slice(-19), { buffer: activeBuffer, label: prev.label }]);
        setUndoStack(prevSt => prevSt.slice(0, -1));
        onUpdateFile(prev.buffer);
    }, [undoStack, onUpdateFile, activeBuffer]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0 || !activeBuffer) return;
        const next = redoStack[redoStack.length - 1];
        setUndoStack(prevSt => [...prevSt.slice(-19), { buffer: activeBuffer, label: next.label }]);
        setRedoStack(prevSt => prevSt.slice(0, -1));
        onUpdateFile(next.buffer);
    }, [redoStack, onUpdateFile, activeBuffer]);

    // --- Clipboard Operations ---
    const handleCopy = useCallback(() => {
        if (!activeBuffer) return;
        const newBuf = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end);
        if (newBuf) {
            setClipboard(newBuf);
            // Optional: Visual feedback could be added here
        }
    }, [activeBuffer, audioContext, editTrim]);

    const handlePasteMix = useCallback(async () => {
        if (!activeBuffer || !clipboard) return;
        pushUndo("Mix Paste");

        let overlayBuf = clipboard;
        let startSample = Math.floor((playheadPos / 100) * activeBuffer.length);
        const hasSelection = editTrim.start > 0.0001 || editTrim.end < 0.9999;

        if (hasSelection) {
            const selectionStartSample = Math.floor(activeBuffer.length * editTrim.start);
            const selectionDurSec = (editTrim.end - editTrim.start) * activeBuffer.duration;
            startSample = selectionStartSample;

            if (fitClipboardToSelection && selectionDurSec > 0.001) {
                const ratio = overlayBuf.duration / selectionDurSec;
                if (Number.isFinite(ratio) && ratio > 0) {
                    const stretched = await AudioUtils.applyStretch(overlayBuf, ratio);
                    if (stretched) overlayBuf = stretched;
                }
            }
        }

        const newBuf = mixBuffersWithGain(activeBuffer, overlayBuf, startSample, mixPasteGain);
        onUpdateFile(newBuf);
    }, [activeBuffer, clipboard, playheadPos, editTrim, fitClipboardToSelection, mixPasteGain, pushUndo, onUpdateFile, mixBuffersWithGain]);

    const handlePasteImprint = useCallback(async () => {
        if (!activeBuffer || !clipboard) return;
        pushUndo("Imprint");

        // Convolve the active buffer (carrier) with clipboard (modulator)
        // This applies the clipboard's texture/reverb characteristic to the selection

        // 1. Extract selection to apply effect
        const selectionBuf = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end);

        if (selectionBuf) {
            const processedSelection = await AudioUtils.convolveBuffers(audioContext, selectionBuf, clipboard, 0.5);
            if (processedSelection) {
                // 2. Replace the selection with processed audio
                // Delete original range
                const tempBuf = AudioUtils.deleteRange(audioContext, activeBuffer, editTrim.start, editTrim.end);
                if (tempBuf) {
                    // Insert processed
                    const startSample = Math.floor(activeBuffer.duration * editTrim.start * activeBuffer.sampleRate);
                    const finalBuf = AudioUtils.mixBuffersAtTime(audioContext, tempBuf, processedSelection, startSample);
                    if (finalBuf) onUpdateFile(finalBuf);
                }
            }
        }
    }, [activeBuffer, clipboard, audioContext, editTrim, pushUndo, onUpdateFile]);

    const handleCutSelection = useCallback(() => {
        if (!activeBuffer) return;
        pushUndo("Cut");
        const newBuf = AudioUtils.deleteRange(audioContext, activeBuffer, editTrim.start, editTrim.end);
        if (newBuf) {
            onUpdateFile(newBuf);
            setEditTrim({ start: 0, end: 1 });
        }
    }, [activeBuffer, audioContext, editTrim, onUpdateFile, pushUndo]);

    // --- Fade In / Fade Out ---
    const [fadeDuration, setFadeDuration] = useState(0.5); // 초

    const handleFadeIn = useCallback(() => {
        if (!activeBuffer) return;
        pushUndo("Fade In");
        const sr = activeBuffer.sampleRate;
        const newBuf = audioContext.createBuffer(
            activeBuffer.numberOfChannels, activeBuffer.length, sr
        );
        const fadeSamples = Math.min(Math.floor(fadeDuration * sr), activeBuffer.length);
        for (let ch = 0; ch < activeBuffer.numberOfChannels; ch++) {
            const src = activeBuffer.getChannelData(ch);
            const dst = newBuf.getChannelData(ch);
            for (let i = 0; i < activeBuffer.length; i++) {
                if (i < fadeSamples) {
                    dst[i] = src[i] * (i / fadeSamples);
                } else {
                    dst[i] = src[i];
                }
            }
        }
        onUpdateFile(newBuf);
    }, [activeBuffer, audioContext, fadeDuration, pushUndo, onUpdateFile]);

    const handleFadeOut = useCallback(() => {
        if (!activeBuffer) return;
        pushUndo("Fade Out");
        const sr = activeBuffer.sampleRate;
        const newBuf = audioContext.createBuffer(
            activeBuffer.numberOfChannels, activeBuffer.length, sr
        );
        const fadeSamples = Math.min(Math.floor(fadeDuration * sr), activeBuffer.length);
        const fadeStart = activeBuffer.length - fadeSamples;
        for (let ch = 0; ch < activeBuffer.numberOfChannels; ch++) {
            const src = activeBuffer.getChannelData(ch);
            const dst = newBuf.getChannelData(ch);
            for (let i = 0; i < activeBuffer.length; i++) {
                if (i >= fadeStart) {
                    dst[i] = src[i] * (1 - (i - fadeStart) / fadeSamples);
                } else {
                    dst[i] = src[i];
                }
            }
        }
        onUpdateFile(newBuf);
    }, [activeBuffer, audioContext, fadeDuration, pushUndo, onUpdateFile]);

    const handleSaveSelection = useCallback(() => {
        if (!activeBuffer) return;
        const newBuf = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end);
        if (newBuf) {
            onAddToRack(newBuf, `${activeFile?.name}_Cut`);
        }
    }, [activeBuffer, audioContext, editTrim, activeFile, onAddToRack]);

    const renderFormantOnly = useCallback(async (buf: AudioBuffer) => {
        if (!buf || !audioContext) return null;
        const offline = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);

        const src = offline.createBufferSource();
        src.buffer = buf;

        const fShift = offline.createBiquadFilter();
        fShift.type = 'peaking';
        fShift.frequency.value = 1000 * genderShift;
        fShift.gain.value = 6;

        const fNodes = [formant.f1, formant.f2, formant.f3, formant.f4].map((freq, idx) => {
            const f = offline.createBiquadFilter();
            f.type = 'peaking';
            f.frequency.value = freq;
            f.Q.value = formant.resonance;
            f.gain.value = 12 - (idx * 2);
            return f;
        });

        src.connect(fShift);
        let lastNode: AudioNode = fShift;
        fNodes.forEach(node => {
            lastNode.connect(node);
            lastNode = node;
        });

        if (singersFormantEnabled) {
            const sfFilter = offline.createBiquadFilter();
            sfFilter.type = 'peaking';
            sfFilter.frequency.value = singersFormantFreq;
            sfFilter.gain.value = singersFormantGain;
            sfFilter.Q.value = singersFormantQ;
            lastNode.connect(sfFilter);
            lastNode = sfFilter;
        }

        lastNode.connect(offline.destination);
        src.start(0);
        return await offline.startRendering();
    }, [audioContext, formant, genderShift, singersFormantEnabled, singersFormantFreq, singersFormantGain, singersFormantQ]);

    const applyFormantLabel = language === 'ko' ? '\uD3EC\uBA3C\uD2B8 \uC801\uC6A9' : language === 'ja' ? '\u30D5\u30A9\u30EB\u30DE\u30F3\u30C8\u9069\u7528' : 'Apply Formant';
    const applyFormantHint = language === 'ko'
        ? '\uC120\uD0DD \uC601\uC5ED\uC774 \uC788\uC73C\uBA74 \uADF8 \uAD6C\uAC04\uC5D0\uB9CC \uC801\uC6A9\uB429\uB2C8\uB2E4.'
        : language === 'ja'
            ? '\u9078\u629E\u9818\u57DF\u304C\u3042\u308C\u3070\u305D\u306E\u533A\u9593\u3060\u3051\u306B\u9069\u7528\u3055\u308C\u307E\u3059\u3002'
            : 'If a selection exists, apply only to that range.';

    const handleApplyFormantFilter = useCallback(async () => {
        if (!activeBuffer) return;

        const hasSelectedRange = editTrim.start > 0.0001 || editTrim.end < 0.9999;
        pushUndo("Apply Formant Filter");

        if (hasSelectedRange) {
            const selectionBuf = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end);
            if (!selectionBuf) return;

            const processedSelection = await renderFormantOnly(selectionBuf);
            if (!processedSelection) return;

            const tempBuf = AudioUtils.deleteRange(audioContext, activeBuffer, editTrim.start, editTrim.end);
            if (!tempBuf) return;

            const startSample = Math.floor(activeBuffer.duration * editTrim.start * activeBuffer.sampleRate);
            const finalBuf = AudioUtils.mixBuffersAtTime(audioContext, tempBuf, processedSelection, startSample);
            onUpdateFile(finalBuf);
            return;
        }

        const processed = await renderFormantOnly(activeBuffer);
        if (processed) onUpdateFile(processed);
    }, [activeBuffer, audioContext, editTrim, onUpdateFile, pushUndo, renderFormantOnly]);

    const stopPlayback = useCallback(() => {
        if (sourceRef.current) { try { sourceRef.current.stop(); } catch (e) { } sourceRef.current = null; }
        setIsPlaying(false);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }, []);

    const handleStop = useCallback(() => {
        stopPlayback();
        setIsPaused(false); setPlayheadPos(0); pauseOffsetRef.current = 0;
    }, [stopPlayback]);

    const renderStudioAudio = useCallback(async (buf: AudioBuffer) => {
        if (!buf || !audioContext) return null;
        const renderDur = buf.duration + (enableDelay ? 2 : 0) + (enableReverb ? 3 : 0);
        const offline = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(renderDur * buf.sampleRate), buf.sampleRate);

        // 내부 masterGain만 사용 (모니터 볼륨은 재생 시 별도 GainNode로 적용)
        const effectiveGain = masterGain;
        const finalOutput = offline.createGain();
        finalOutput.gain.value = effectiveGain;

        let currentNode: AudioNode = offline.createGain();
        const inputNode = currentNode;

        if (!bypassEffects) {
            // EQ
            eqBands.forEach(b => {
                if (b.on) {
                    const f = offline.createBiquadFilter();
                    f.type = b.type; f.frequency.value = b.freq; f.Q.value = b.q; f.gain.value = b.gain;
                    currentNode.connect(f); currentNode = f;
                }
            });

            // Formant
            const fShift = offline.createBiquadFilter();
            fShift.type = 'peaking'; fShift.frequency.value = 1000 * genderShift; fShift.gain.value = 6;

            const fNodes = [formant.f1, formant.f2, formant.f3, formant.f4].map((freq, idx) => {
                const f = offline.createBiquadFilter();
                f.type = 'peaking'; f.frequency.value = freq;
                f.Q.value = formant.resonance;
                f.gain.value = 12 - (idx * 2);
                return f;
            });

            currentNode.connect(fShift);
            let lastFNode = fShift;
            fNodes.forEach(fn => { lastFNode.connect(fn); lastFNode = fn; });

            // Compressor
            const compressor = offline.createDynamicsCompressor();
            compressor.threshold.value = compThresh;
            compressor.ratio.value = compRatio;
            compressor.attack.value = compAttack;
            compressor.release.value = compRelease;
            lastFNode.connect(compressor);

            // Singer's Formant (2.5~4kHz peaking boost)
            let afterCompressor: AudioNode = compressor;
            if (singersFormantEnabled) {
                const sfFilter = offline.createBiquadFilter();
                sfFilter.type = 'peaking';
                sfFilter.frequency.value = singersFormantFreq;
                sfFilter.gain.value = singersFormantGain;
                sfFilter.Q.value = singersFormantQ;
                compressor.connect(sfFilter);
                afterCompressor = sfFilter;
            }

            // Time-based (Delay/Reverb)
            const dryGain = offline.createGain();
            const effectMerge = offline.createGain();

            afterCompressor.connect(dryGain);
            dryGain.connect(finalOutput);

            if (enableDelay && delayTime > 0) {
                const delay = offline.createDelay(); delay.delayTime.value = delayTime;
                const fb = offline.createGain(); fb.gain.value = delayFeedback;
                const delayOut = offline.createGain(); delayOut.gain.value = 0.5;
                afterCompressor.connect(delay);
                delay.connect(fb); fb.connect(delay);
                delay.connect(delayOut); delayOut.connect(effectMerge);
            }

            if (enableReverb && reverbMix > 0) {
                const reverbConv = offline.createConvolver();
                const rate = offline.sampleRate;
                const length = rate * 2.0;
                const impulse = offline.createBuffer(2, length, rate);
                for (let i = 0; i < 2; i++) {
                    const ch = impulse.getChannelData(i);
                    for (let j = 0; j < length; j++) ch[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, 2.0);
                }
                reverbConv.buffer = impulse;
                const revGain = offline.createGain(); revGain.gain.value = reverbMix;
                afterCompressor.connect(reverbConv);
                reverbConv.connect(revGain);
                revGain.connect(effectMerge);
            }

            effectMerge.connect(finalOutput);
        } else {
            currentNode.connect(finalOutput);
        }

        const s1 = offline.createBufferSource(); s1.buffer = buf;
        if (!bypassEffects && pitchCents !== 0) s1.playbackRate.value = Math.pow(2, pitchCents / 1200);

        const autoGain = offline.createGain();
        if (volumeKeyframes.length > 0) {
            autoGain.gain.setValueAtTime(volumeKeyframes[0].v, 0);
            volumeKeyframes.forEach(p => autoGain.gain.linearRampToValueAtTime(p.v, p.t * buf.duration));
        }

        s1.connect(autoGain); autoGain.connect(inputNode); s1.start(0);
        finalOutput.connect(offline.destination);
        const rendered = await offline.startRendering();

        // Peak Normalization: normalizationEnabled 시 렌더된 버퍼를 -0.5dBFS로 정규화
        if (normalizationEnabled) {
            let peak = 0;
            for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
                const data = rendered.getChannelData(ch);
                for (let i = 0; i < data.length; i++) {
                    const abs = Math.abs(data[i]);
                    if (abs > peak) peak = abs;
                }
            }
            if (peak > 0) {
                const normGain = 0.944 / peak; // -0.5 dBFS, 렌더링 버퍼에만 적용
                for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
                    const data = rendered.getChannelData(ch);
                    for (let i = 0; i < data.length; i++) data[i] *= normGain;
                }
            }
        }
        return rendered;
    }, [audioContext, pitchCents, genderShift, masterGain, bypassEffects, formant, eqBands, enableDelay, delayTime, delayFeedback, enableReverb, reverbMix, compThresh, compRatio, compAttack, compRelease, volumeKeyframes, normalizationEnabled, singersFormantEnabled, singersFormantFreq, singersFormantGain, singersFormantQ]);

    const togglePlay = useCallback(async (mode: 'all' | 'selection') => {
        if (isPlaying) {
            if (sourceRef.current) { sourceRef.current.stop(); sourceRef.current = null; }
            pauseOffsetRef.current = audioContext.currentTime - startTimeRef.current;
            setIsPaused(true);
            setIsPlaying(false);
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return;
        }

        if (!activeBuffer) return;
        const rendered = await renderStudioAudio(activeBuffer);
        if (!rendered) return;

        const s = audioContext.createBufferSource();
        s.buffer = rendered;
        // 모니터 볼륨 GainNode: 렌더링 데이터는 무변경, 재생 시들리는 볼륨만 조절
        const monitorNode = audioContext.createGain();
        monitorNode.gain.value = monitorGainValue;
        s.connect(monitorNode);
        monitorNode.connect(audioContext.destination);

        let startOffset = 0;
        let dur = rendered.duration;

        if (mode === 'selection') {
            const selStart = editTrim.start * activeBuffer.duration;
            const selEnd = editTrim.end * activeBuffer.duration;
            dur = selEnd - selStart;

            if (isPaused) {
                startOffset = selStart + (pauseOffsetRef.current > 0 ? pauseOffsetRef.current : 0);
                if (startOffset > selEnd) startOffset = selStart;
            } else {
                startOffset = selStart;
            }
        } else {
            if (isPaused) startOffset = pauseOffsetRef.current % rendered.duration;
        }

        s.start(0, startOffset);
        sourceRef.current = s;
        startTimeRef.current = audioContext.currentTime - startOffset;

        setIsPlaying(true);
        setIsPaused(false);
        setPlayheadMode(mode);

        s.onended = () => {
            setIsPlaying(false);
            setIsPaused(false);
            if (mode === 'all') { setPlayheadPos(0); pauseOffsetRef.current = 0; }
        };
    }, [isPlaying, isPaused, activeBuffer, renderStudioAudio, audioContext, editTrim]);

    const updatePlayhead = useCallback(() => {
        if (!isPlaying || !activeBuffer) return;
        const elapsed = audioContext.currentTime - startTimeRef.current;
        let currentPos = 0;

        if (playheadMode === 'all') {
            currentPos = ((elapsed / activeBuffer.duration) * 100);
        } else {
            const selStartPct = editTrim.start;
            const totalDur = activeBuffer.duration;
            const currentSec = (selStartPct * totalDur) + elapsed;
            currentPos = (currentSec / totalDur) * 100;
        }

        if (currentPos >= 100 && playheadMode === 'all') currentPos = 100;
        setPlayheadPos(currentPos);
        animationRef.current = requestAnimationFrame(updatePlayhead);
    }, [isPlaying, activeBuffer, audioContext, playheadMode, editTrim]);

    useEffect(() => {
        if (isPlaying) animationRef.current = requestAnimationFrame(updatePlayhead);
        else if (animationRef.current) cancelAnimationFrame(animationRef.current);
        return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
    }, [isPlaying, updatePlayhead]);

    useEffect(() => {
        if (!canvasRef.current || !activeBuffer) return;
        const ctx = canvasRef.current.getContext('2d', { alpha: false });
        if (!ctx) return;
        const { width: w, height: h } = canvasRef.current;

        ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, w, RULER_HEIGHT);

        const data = activeBuffer.getChannelData(0);
        const step = Math.ceil(data.length / w);
        const waveH = h - RULER_HEIGHT;
        const amp = waveH / 2;
        const yOffset = RULER_HEIGHT;

        ctx.beginPath(); ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1;
        for (let i = 0; i < w; i++) {
            let min = 1.0, max = -1.0;
            const start = i * step;
            const end = Math.min(start + step, data.length);
            for (let j = start; j < end; j++) {
                const datum = data[j]; if (datum < min) min = datum; if (datum > max) max = datum;
            }
            ctx.moveTo(i, yOffset + (amp + min * amp)); ctx.lineTo(i, yOffset + (amp + max * amp));
        }
        ctx.stroke();

        if (showAutomation && volumeKeyframes.length > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            volumeKeyframes.forEach((p, idx) => {
                const x = p.t * w;
                const y = yOffset + (1 - Math.max(0, Math.min(1, p.v))) * waveH;
                if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            volumeKeyframes.forEach((p, idx) => {
                const x = p.t * w;
                const y = yOffset + (1 - Math.max(0, Math.min(1, p.v))) * waveH;
                ctx.beginPath();
                ctx.fillStyle = idx === 0 || idx === volumeKeyframes.length - 1 ? '#10b981' : '#34d399';
                ctx.arc(x, y, 4.5, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }

        const sX = editTrim.start * w, eX = editTrim.end * w;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(sX, RULER_HEIGHT, eX - sX, waveH);

        if (playheadPos >= 0) {
            const px = (playheadPos / 100) * w;
            ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
        }
    }, [activeBuffer, editTrim, playheadPos, showAutomation, volumeKeyframes]);

    const handleTimelineMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const xPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const yPx = e.clientY - rect.top;
        const waveH = rect.height - RULER_HEIGHT;
        const vFromY = Math.max(0, Math.min(1, 1 - ((yPx - RULER_HEIGHT) / waveH)));

        const findGainHit = (pct: number, py: number) => {
            const hitRadius = 10;
            for (let i = 0; i < volumeKeyframes.length; i++) {
                const p = volumeKeyframes[i];
                const px = p.t * rect.width;
                const y = RULER_HEIGHT + (1 - p.v) * waveH;
                if (Math.hypot(px - (pct * rect.width), y - py) <= hitRadius) return i;
            }
            return -1;
        };

        // Gain graph editing
        if (showAutomation && yPx >= RULER_HEIGHT) {
            const hitIdx = findGainHit(xPct, yPx);

            if (e.button === 2) {
                e.preventDefault();
                if (hitIdx > 0 && hitIdx < volumeKeyframes.length - 1) {
                    pushUndo('Delete Gain Keyframe');
                    setVolumeKeyframes(prev => prev.filter((_, i) => i !== hitIdx));
                }
                return;
            }

            if (hitIdx !== -1 || e.shiftKey) {
                let targetIdx = hitIdx;
                if (hitIdx === -1 && e.shiftKey) {
                    pushUndo('Add Gain Keyframe');
                    setVolumeKeyframes(prev => {
                        const next = [...prev, { t: xPct, v: vFromY }].sort((a, b) => a.t - b.t);
                        targetIdx = next.findIndex(p => Math.abs(p.t - xPct) < 1e-6 && Math.abs(p.v - vFromY) < 1e-6);
                        return next;
                    });
                } else {
                    pushUndo('Move Gain Keyframe');
                }

                const move = (me: MouseEvent) => {
                    const curRect = canvasRef.current?.getBoundingClientRect();
                    if (!curRect) return;
                    const curXPct = Math.max(0, Math.min(1, (me.clientX - curRect.left) / curRect.width));
                    const curYPx = me.clientY - curRect.top;
                    const curV = Math.max(0, Math.min(1, 1 - ((curYPx - RULER_HEIGHT) / (curRect.height - RULER_HEIGHT))));

                    setVolumeKeyframes(prev => {
                        if (targetIdx < 0 || targetIdx >= prev.length) return prev;
                        const next = [...prev];
                        const isFirst = targetIdx === 0;
                        const isLast = targetIdx === next.length - 1;
                        const minT = isFirst ? 0 : next[targetIdx - 1].t + 0.001;
                        const maxT = isLast ? 1 : next[targetIdx + 1].t - 0.001;
                        const nextT = isFirst ? 0 : isLast ? 1 : Math.max(minT, Math.min(maxT, curXPct));
                        next[targetIdx] = { t: nextT, v: curV };
                        return next;
                    });
                };

                const up = () => {
                    window.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', up);
                };

                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
                return;
            }
        }

        // default: selection drag
        setPlayheadPos(xPct * 100);
        pauseOffsetRef.current = xPct * (activeBuffer?.duration || 0);
        const startX = xPct;
        setEditTrim({ start: startX, end: startX });

        const move = (me: MouseEvent) => {
            const curRect = canvasRef.current?.getBoundingClientRect();
            if (!curRect) return;
            const curX = Math.max(0, Math.min(1, (me.clientX - curRect.left) / curRect.width));
            setEditTrim({
                start: Math.min(startX, curX),
                end: Math.max(startX, curX)
            });
        };

        const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
        };

        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    }, [showAutomation, volumeKeyframes, pushUndo, activeBuffer]);

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    return (
        <div className="flex flex-col p-6 gap-6 animate-in fade-in font-sans font-bold h-full overflow-y-auto custom-scrollbar">
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 flex-shrink-0">
                    <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                        <div className="flex bg-slate-100 p-1 rounded-lg gap-1 border border-slate-200 shadow-sm">
                            <button onClick={handleUndo} disabled={undoStack.length === 0} title={text.undo} className="p-1.5 hover:bg-white rounded text-slate-900 disabled:opacity-30"><Undo2 size={16} /></button>
                            <button onClick={handleRedo} disabled={redoStack.length === 0} title={text.redo} className="p-1.5 hover:bg-white rounded text-slate-900 disabled:opacity-30"><Redo2 size={16} /></button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button onClick={() => togglePlay('all')} className={`px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 transition-all ${isPlaying ? 'bg-white shadow text-slate-900' : 'hover:bg-white text-slate-600'}`}>{isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />} {isPlaying ? text.pause : text.play}</button>
                            <button onClick={handleStop} className="px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 hover:bg-white text-red-500 transition-colors font-black"><Square size={14} fill="currentColor" /> {text.stop}</button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button onClick={handleCutSelection} className="p-1.5 hover:bg-white rounded text-slate-600 hover:text-red-500 transition-all" title={text.cutTitle}><Scissors size={16} /></button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button onClick={handleCopy} className={`px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 transition-all hover:bg-white ${clipboard ? 'text-indigo-600' : 'text-slate-500'}`} title={text.copyTitle}>
                                <Copy size={14} /> {text.copy}
                            </button>
                            <button onClick={handlePasteMix} disabled={!clipboard} className="px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 transition-all hover:bg-white text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent" title={text.mixPasteTitle}>
                                <Layers size={14} /> {text.mixPaste}
                            </button>
                            <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                                <span className="text-[10px] font-black text-emerald-700">{mixPasteLabel}</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={2}
                                    step={0.05}
                                    value={mixPasteGain}
                                    onChange={e => setMixPasteGain(Number(e.target.value))}
                                    className="w-16 h-1.5 bg-emerald-100 rounded-full appearance-none accent-emerald-600"
                                    title={mixPasteLabel}
                                />
                                <span className="text-[10px] font-black text-emerald-700 w-8 text-right">{Math.round(mixPasteGain * 100)}%</span>
                                <button
                                    onClick={() => setFitClipboardToSelection(!fitClipboardToSelection)}
                                    className={`text-[9px] px-2 py-0.5 rounded border font-black ${fitClipboardToSelection ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-emerald-700 border-emerald-300'}`}
                                >
                                    {fitSelectionLabel}
                                </button>
                            </div>
                            <button onClick={handlePasteImprint} disabled={!clipboard} className="px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 transition-all hover:bg-white text-pink-600 disabled:opacity-30 disabled:hover:bg-transparent" title={text.imprintTitle}>
                                <Fingerprint size={14} /> {text.imprint}
                            </button>
                            <button
                                onClick={() => setShowAutomation(!showAutomation)}
                                className={`px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 transition-all ${showAutomation ? 'bg-emerald-600 text-white shadow' : 'hover:bg-white text-emerald-700 border border-emerald-200'}`}
                                title={gainGraphHint}
                            >
                                <Activity size={14} />
                                {gainGraphLabel}
                            </button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            {/* Fade In / Out */}
                            <div className="flex items-center gap-1 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1">
                                <button
                                    onClick={handleFadeIn}
                                    disabled={!activeBuffer}
                                    className="px-2 py-1 rounded text-[11px] font-black text-violet-600 hover:bg-violet-100 disabled:opacity-30 transition-all"
                                    title={text.fadeInTitle(fadeDuration)}
                                >
                                    {text.fadeIn}
                                </button>
                                <div className="w-px h-4 bg-violet-200 mx-0.5"></div>
                                <button
                                    onClick={handleFadeOut}
                                    disabled={!activeBuffer}
                                    className="px-2 py-1 rounded text-[11px] font-black text-violet-600 hover:bg-violet-100 disabled:opacity-30 transition-all"
                                    title={text.fadeOutTitle(fadeDuration)}
                                >
                                    {text.fadeOut}
                                </button>
                                <div className="w-px h-4 bg-violet-200 mx-0.5"></div>
                                <input
                                    type="number" min={0.05} max={30} step={0.05}
                                    value={fadeDuration}
                                    onChange={e => setFadeDuration(Math.max(0.05, Number(e.target.value)))}
                                    className="w-14 text-[11px] font-black text-center border border-violet-200 rounded bg-white text-slate-700 py-0.5 outline-none focus:border-violet-400"
                                    title={text.fadeDurationTitle}
                                />
                                <span className="text-[10px] text-violet-400 font-black">{text.fadeSeconds}</span>
                            </div>
                        </div>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <div className="bg-slate-800 text-green-400 font-mono text-sm px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner min-w-[100px] flex justify-center tracking-widest font-black">
                            {formatTime((playheadPos / 100) * (activeBuffer?.duration || 0))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleSaveSelection}
                            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-indigo-600 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all"
                        >
                            <FilePlus size={16} /> {text.saveSelection}
                        </button>
                        <button onClick={async () => { if (activeBuffer) { const res = await renderStudioAudio(activeBuffer); if (res) onAddToRack(res, "Studio_Mix"); } }} className="px-5 py-2.5 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg active:scale-95 transition-all"><Save size={16} /> {text.saveToRack}</button>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-inner overflow-hidden select-none h-[400px] relative">
                        <canvas
                            ref={canvasRef}
                            width={1200}
                            height={400}
                            className="w-full h-full object-cover cursor-crosshair"
                            onMouseDown={handleTimelineMouseDown}
                            onContextMenu={e => e.preventDefault()}
                        />
                        <div className="absolute top-0 bottom-0 bg-white/10 border-x border-white/30 pointer-events-none" style={{ left: `${editTrim.start * 100}%`, width: `${(editTrim.end - editTrim.start) * 100}%` }} />
                        <div className="absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 transition-colors" style={{ left: `calc(${editTrim.start * 100}% - 4px)` }} onMouseDown={(e) => { e.stopPropagation(); const startX = e.clientX; const initVal = editTrim.start; const rect = canvasRef.current!.getBoundingClientRect(); const move = (me: MouseEvent) => { const diff = (me.clientX - startX) / rect.width; setEditTrim(prev => ({ ...prev, start: Math.max(0, Math.min(prev.end, initVal + diff)) })); }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                        <div className="absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 transition-colors" style={{ left: `calc(${editTrim.end * 100}% - 4px)` }} onMouseDown={(e) => { e.stopPropagation(); const startX = e.clientX; const initVal = editTrim.end; const rect = canvasRef.current!.getBoundingClientRect(); const move = (me: MouseEvent) => { const diff = (me.clientX - startX) / rect.width; setEditTrim(prev => ({ ...prev, end: Math.min(1, Math.max(prev.start, initVal + diff)) })); }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                        {!activeBuffer && (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-black uppercase tracking-widest bg-slate-900/50 backdrop-blur-sm">{text.noFile}</div>
                        )}
                        {clipboard && (
                            <div className="absolute top-4 right-4 bg-indigo-500/90 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg border border-white/20 backdrop-blur pointer-events-none animate-in fade-in slide-in-from-top-2">
                                {text.clipboardReady(clipboard.duration)}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-6 flex-col lg:flex-row">
                        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 relative flex flex-col shadow-inner h-[320px] overflow-hidden">
                            <ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={sourceRef.current} />
                        </div>

                        <div className="w-full lg:w-[420px] bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shrink-0 shadow-sm h-[320px]">
                            <div className="flex border-b border-slate-200 bg-slate-50/50">
                                {[
                                    { id: 'effects', label: text.effects },
                                    { id: 'formant_filter', label: text.formantFilter },
                                    { id: 'formant', label: text.formant }
                                ].map((tab) => (
                                    <button key={tab.id} onClick={() => setSideTab(tab.id as any)} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-tight transition-all ${sideTab === tab.id ? 'bg-white text-slate-900 border-b-2 border-indigo-500 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>{tab.label}</button>
                                ))}
                            </div>
                            <div className="p-5 flex-1 overflow-y-auto custom-scrollbar space-y-6">
                                {sideTab === 'effects' && (
                                    <div className="space-y-6">
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Sparkles size={12} /> {text.reverbDelay}</h3>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEnableDelay(!enableDelay)} className={`text-[9px] px-2 py-0.5 rounded border font-black ${enableDelay ? 'bg-indigo-500 text-white border-indigo-600' : 'bg-white text-slate-400'}`}>DLY</button>
                                                    <button onClick={() => setEnableReverb(!enableReverb)} className={`text-[9px] px-2 py-0.5 rounded border font-black ${enableReverb ? 'bg-indigo-500 text-white border-indigo-600' : 'bg-white text-slate-400'}`}>REV</button>
                                                </div>
                                            </div>
                                            {enableDelay && (
                                                <>
                                                    <RangeControl label={text.delayTime} value={delayTime} min={0} max={1} step={0.05} onChange={setDelayTime} unit="s" />
                                                    <RangeControl label={text.feedback} value={delayFeedback} min={0} max={0.9} step={0.05} onChange={setDelayFeedback} unit="" />
                                                </>
                                            )}
                                            {enableReverb && (
                                                <RangeControl label={text.reverbMix} value={reverbMix} min={0} max={1} step={0.05} onChange={setReverbMix} unit="" />
                                            )}
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity size={12} /> {text.compressor}</h3>
                                            <RangeControl label={text.threshold} value={compThresh} min={-60} max={0} step={1} onChange={setCompThresh} unit="dB" />
                                            <RangeControl label={text.ratio} value={compRatio} min={1} max={20} step={0.5} onChange={setCompRatio} unit=":1" />
                                        </div>
                                    </div>
                                )}
                                {sideTab === 'formant_filter' && (
                                    <div className="space-y-3">
                                        <FormantPad formant={formant} onChange={setFormant} />
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                                            <p className="text-[10px] text-slate-500 font-bold leading-tight">{applyFormantHint}</p>
                                            <button
                                                onClick={handleApplyFormantFilter}
                                                disabled={!activeBuffer}
                                                className="w-full py-2 rounded-lg text-xs font-black bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                            >
                                                {applyFormantLabel}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {sideTab === 'formant' && (
                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><AudioLines size={12} /> {text.formantDetail}</h3>
                                        <RangeControl label={text.formantF1} value={formant.f1} min={200} max={1200} step={10} onChange={v => setFormant({ ...formant, f1: v })} unit="Hz" />
                                        <RangeControl label={text.formantF2} value={formant.f2} min={500} max={3000} step={10} onChange={v => setFormant({ ...formant, f2: v })} unit="Hz" />
                                        <RangeControl label={text.formantF3} value={formant.f3} min={1500} max={4000} step={10} onChange={v => setFormant({ ...formant, f3: v })} unit="Hz" />
                                        <RangeControl label={text.formantF4} value={formant.f4} min={2500} max={5000} step={10} onChange={v => setFormant({ ...formant, f4: v })} unit="Hz" />
                                        <RangeControl label={text.resonance} value={formant.resonance} min={0.1} max={10} step={0.1} onChange={v => setFormant({ ...formant, resonance: v })} unit="" />

                                        {/* Singer's Formant */}
                                        <div className={`p-3 rounded-xl border space-y-3 transition-all ${singersFormantEnabled ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                                    <Sparkles size={11} className={singersFormantEnabled ? 'text-amber-500' : 'text-slate-400'} />
                                                    <span className={singersFormantEnabled ? 'text-amber-700' : 'text-slate-400'}>{text.singerFormant}</span>
                                                </h3>
                                                <button
                                                    onClick={() => setSingersFormantEnabled(!singersFormantEnabled)}
                                                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${singersFormantEnabled ? 'bg-amber-500' : 'bg-slate-300'}`}
                                                >
                                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${singersFormantEnabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                                </button>
                                            </div>
                                            {singersFormantEnabled && (
                                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                                                    <p className="text-[9px] text-amber-700/70 font-bold leading-tight">{text.singerFormantHint}</p>
                                                    <RangeControl label={text.centerFreq} value={singersFormantFreq} min={2500} max={4000} step={50} onChange={setSingersFormantFreq} unit="Hz" />
                                                    <RangeControl label={text.boostGain} value={singersFormantGain} min={0} max={20} step={0.5} onChange={setSingersFormantGain} unit="dB" />
                                                    <RangeControl label={text.qBandwidth} value={singersFormantQ} min={0.5} max={10} step={0.5} onChange={setSingersFormantQ} unit="" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-5 border-t border-slate-200 bg-slate-50/50 space-y-4">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity size={14} /> {text.masterOutput}</h3>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex flex-col gap-2 flex-1">
                                        <button
                                            onClick={() => setNormalizationEnabled(!normalizationEnabled)}
                                            className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${normalizationEnabled ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm' : 'bg-white text-slate-500 border-slate-200'}`}
                                            title={text.normalizeTitle}
                                        >
                                            <Activity size={12} className={normalizationEnabled ? "text-indigo-200" : ""} />
                                            <span className="text-[10px] font-black uppercase tracking-tight">{text.normalizeShort}</span>
                                        </button>
                                        <button
                                            onClick={() => setBypassEffects(!bypassEffects)}
                                            className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${bypassEffects ? 'bg-amber-500 text-white border-amber-400 shadow-sm' : 'bg-white text-slate-400 border-slate-200'}`}
                                            title={text.bypassTitle}
                                        >
                                            <Power size={12} className={bypassEffects ? "animate-pulse" : ""} />
                                            <span className="text-[10px] font-black uppercase tracking-tight">{text.bypass}</span>
                                        </button>
                                    </div>
                                    <div className="flex-[1.5] space-y-1">
                                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                                            <span>{text.gain}</span>
                                            <span className="text-indigo-600">{(masterGain * 100).toFixed(0)}%</span>
                                        </div>
                                        <input type="range" min="0" max="2" step="0.01" value={masterGain} onChange={e => setMasterGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudioTab;
