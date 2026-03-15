
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Combine, MousePointer2, TrendingUp, Play, Save, Undo2, Redo2, AudioLines, Download, Plus, Copy, ClipboardPaste, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { AudioFile, KeyframePoint, EQBand } from '../types';
import { AudioUtils } from '../utils/audioUtils';
import ParametricEQ from './ParametricEQ';
import EditorModeBar from './ui/EditorModeBar';
import MultiSelectDropdown from './ui/MultiSelectDropdown';

interface ConsonantTabProps {
    audioContext: AudioContext;
    files: AudioFile[];
    onAddToRack: (buffer: AudioBuffer, name: string) => void;
    isActive: boolean;
    monitorGainValue?: number;
}

interface ConsonantItem {
    id: string;
    offsetMs: number;
}

const CONSONANT_TEXT = {
    ko: {
        title: '자음-모음 합성기',
        unvoiced: '무성 자음 프리셋',
        voiced: '유성 자음 프리셋',
        masterEq: '마스터 EQ',
        move: '이동',
        volume: '볼륨',
        vowel: '모음 (Vowel)',
        consonant: '자음 (Consonant)',
        selectFile: '파일 선택',
        none: '선택 안 함',
        offset: '오프셋',
        stretch: '늘이기',
        preview: '미리 듣기',
        stop: '정지',
        downloadWav: 'WAV',
        saveToRack: '보관함',
    },
    en: {
        title: 'C-V Mixer',
        unvoiced: 'Unvoiced Preset',
        voiced: 'Voiced Preset',
        masterEq: 'Master EQ',
        move: 'Move',
        volume: 'Volume',
        vowel: 'Vowel',
        consonant: 'Consonant',
        selectFile: 'Select file',
        none: 'None',
        offset: 'Offset',
        stretch: 'Stretch',
        preview: 'Preview',
        stop: 'Stop',
        downloadWav: 'WAV',
        saveToRack: 'Save to Rack',
    },
    ja: {
        title: '子音-母音ミキサー',
        unvoiced: '無声プリセット',
        voiced: '有声プリセット',
        masterEq: 'マスター EQ',
        move: '移動',
        volume: '音量',
        vowel: '母音 (Vowel)',
        consonant: '子音 (Consonant)',
        selectFile: 'ファイルを選択',
        none: 'なし',
        offset: 'オフセット',
        stretch: '伸縮',
        preview: '試聴',
        stop: '停止',
        downloadWav: 'WAV',
        saveToRack: 'ラック',
    },
} as const;

const VOL_MIN = 0;
const VOL_MAX = 2;
const VOL_BASE_Y_RATIO = 0.44; // 100% line: slightly above center
const VOL_STEP_Y_RATIO = 0.22; // 50% step spacing
const DEFAULT_CONSONANT_OFFSET_MS = 100;
const CONSONANT_COLORS = ['#fb923c', '#f43f5e', '#22c55e', '#38bdf8', '#a78bfa', '#f59e0b'];

const clampVolume = (v: number) => Math.max(VOL_MIN, Math.min(VOL_MAX, v));

const volumeToYPx = (v: number, h: number) => {
    if (h <= 0) return 0;
    const clamped = clampVolume(v);
    const y = h * (VOL_BASE_Y_RATIO - ((clamped - 1) / 0.5) * VOL_STEP_Y_RATIO);
    return Math.max(0, Math.min(h, y));
};

const yPxToVolume = (y: number, h: number) => {
    if (h <= 0) return 1;
    const raw = 1 + (((h * VOL_BASE_Y_RATIO) - y) / (h * VOL_STEP_Y_RATIO)) * 0.5;
    return clampVolume(raw);
};

const ConsonantTab: React.FC<ConsonantTabProps> = ({ audioContext, files, onAddToRack, isActive, monitorGainValue = 1.0 }) => {
    const { language } = useLanguage();
    const text = CONSONANT_TEXT[language];
    const [vowelId, setVowelId] = useState("");
    const [consonantItems, setConsonantItems] = useState<ConsonantItem[]>([]);
    const [activeConsonantIndex, setActiveConsonantIndex] = useState(0);
    const [pendingConsonantIds, setPendingConsonantIds] = useState<string[]>([]);
    const [consonantClipboard, setConsonantClipboard] = useState<ConsonantItem[] | null>(null);

    // Timing & Stretch
    const [vOffMs, setVOffMs] = useState(0);
    const [cStretch, setCStretch] = useState(100);
    const [vStretch, setVStretch] = useState(100);

    const [editMode, setEditMode] = useState<'move' | 'volume'>('move');
    const [selectedTrack, setSelectedTrack] = useState<'vowel' | 'consonant'>('consonant');

    // Keyframes
    const [vVolPts, setVVolPts] = useState<KeyframePoint[]>([{ t: 0, v: 1 }, { t: 1, v: 1 }]);
    const [cVolPts, setCVolPts] = useState<KeyframePoint[]>([{ t: 0, v: 1 }, { t: 1, v: 1 }]);

    const [isPlaying, setIsPlaying] = useState(false);
    const [playheadTime, setPlayheadTime] = useState(0); // in seconds

    // Global Gains
    const [vowelGain, setVowelGain] = useState(1.0);
    const [consonantGain, setConsonantGain] = useState(1.0);

    // EQ Bands
    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 100, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'peaking', freq: 1000, gain: 0, q: 1.0, on: true },
        { id: 3, type: 'highshelf', freq: 8000, gain: 0, q: 0.7, on: true }
    ]);
    const [showEQ, setShowEQ] = useState(false);

    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);
    const animRef = useRef<number | null>(null);
    const [dragPoint, setDragPoint] = useState<{ type: 'vol' | 'move', track?: 'vowel' | 'consonant', index?: number, grabOffsetPx?: number } | null>(null);

    // History
    const [history, setHistory] = useState<any[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const applyConsonantPreset = (type: 'unvoiced' | 'voiced') => {
        if (type === 'unvoiced') {
            setCVolPts([{ t: 0, v: 0 }, { t: 0.05, v: 1.2 }, { t: 0.2, v: 0.4 }, { t: 1, v: 0 }]);
            setVVolPts([{ t: 0, v: 0 }, { t: 0.1, v: 0 }, { t: 0.2, v: 1 }, { t: 1, v: 1 }]);
            setConsonantItems(prev => prev.map(item => ({ ...item, offsetMs: 50 })));
            setVOffMs(150);
        } else {
            setCVolPts([{ t: 0, v: 0.5 }, { t: 0.3, v: 1 }, { t: 0.7, v: 0.8 }, { t: 1, v: 0 }]);
            setVVolPts([{ t: 0, v: 0 }, { t: 0.1, v: 0.5 }, { t: 1, v: 1 }]);
            setConsonantItems(prev => prev.map(item => ({ ...item, offsetMs: 0 })));
            setVOffMs(100);
        }
        commitChange(`${type} 프리셋 적용`);
    };

    const getCurrentState = useCallback(() => ({
        vowelId,
        consonantItems,
        consonantIds: consonantItems.map(item => item.id),
        activeConsonantIndex,
        activeConsonantId: consonantItems[activeConsonantIndex]?.id || "",
        vOffMs,
        cStretch,
        vStretch,
        vVolPts,
        cVolPts,
        vowelGain,
        consonantGain,
        eqBands
    }), [vowelId, consonantItems, activeConsonantIndex, vOffMs, cStretch, vStretch, vVolPts, cVolPts, vowelGain, consonantGain, eqBands]);

    const saveHistory = useCallback((label: string) => {
        const state = getCurrentState();
        setHistory(prev => {
            const newHist = prev.slice(0, historyIndex + 1);
            if (newHist.length > 0 && JSON.stringify(newHist[newHist.length - 1].state) === JSON.stringify(state)) return prev;
            return [...newHist.slice(-9), { state, label }];
        });
        setHistoryIndex(prev => Math.min(prev + 1, 9));
    }, [getCurrentState, historyIndex]);

    useEffect(() => { if (history.length === 0) saveHistory("초기 상태"); }, []);

    const restoreState = (state: any) => {
        setVowelId(state.vowelId);
        const nextConsonants: string[] = Array.isArray(state.consonantIds)
            ? state.consonantIds
            : (state.consonantId ? [state.consonantId] : []);
        const nextConsonantItems: ConsonantItem[] = Array.isArray(state.consonantItems)
            ? state.consonantItems
                .filter((item: any) => item && typeof item.id === 'string')
                .map((item: any) => ({ id: item.id, offsetMs: Number(item.offsetMs ?? DEFAULT_CONSONANT_OFFSET_MS) }))
            : nextConsonants.map(id => ({ id, offsetMs: Number(state.offsetMs ?? DEFAULT_CONSONANT_OFFSET_MS) }));
        setConsonantItems(nextConsonantItems);
        const fallbackIdx = state.activeConsonantId ? nextConsonants.indexOf(state.activeConsonantId) : 0;
        const restoredIdx = typeof state.activeConsonantIndex === 'number' ? state.activeConsonantIndex : fallbackIdx;
        setActiveConsonantIndex(Math.max(0, Math.min(restoredIdx, Math.max(0, nextConsonantItems.length - 1))));
        setVOffMs(state.vOffMs);
        setCStretch(state.cStretch); setVStretch(state.vStretch || 100);
        setVVolPts(state.vVolPts); setCVolPts(state.cVolPts);
        setVowelGain(state.vowelGain || 1.0); setConsonantGain(state.consonantGain || 1.0);
        if (state.eqBands) setEqBands(state.eqBands);
    };

    const handleUndo = () => { if (historyIndex > 0) { const prev = historyIndex - 1; restoreState(history[prev].state); setHistoryIndex(prev); } };
    const handleRedo = () => { if (historyIndex < history.length - 1) { const next = historyIndex + 1; restoreState(history[next].state); setHistoryIndex(next); } };

    const commitChange = (label: string = "변경") => saveHistory(label);

    const getBuffer = (id: string) => files.find(f => f.id === id)?.buffer;
    const addConsonantsLabel = language === 'ko' ? '선택 추가' : language === 'ja' ? '選択追加' : 'Add Selected';
    const copyLabel = language === 'ko' ? '복사' : language === 'ja' ? 'コピー' : 'Copy';
    const pasteLabel = language === 'ko' ? '붙여넣기' : language === 'ja' ? '貼り付け' : 'Paste';
    const removeLabel = language === 'ko' ? '활성 제거' : language === 'ja' ? '選択削除' : 'Remove Active';
    const dragOffsetHint = language === 'ko'
        ? '오프셋은 파형을 드래그해서 조절'
        : language === 'ja'
            ? 'オフセットは波形ドラッグで調整'
            : 'Adjust offset by dragging waveform';
    const modeTitle = language === 'ko' ? '\uD3B8\uC9D1 \uC0C1\uD0DC' : language === 'ja' ? '\u7DE8\u96C6\u72B6\u614B' : 'Editor State';
    const modeHint = language === 'ko' ? 'Tab \uBAA8\uB4DC \uC804\uD658 / Space \uC7AC\uC0DD' : language === 'ja' ? 'Tab \u5207\u66FF / Space \u518D\u751F' : 'Tab toggle / Space play';
    const modeEditLabel = language === 'ko' ? '\uBAA8\uB4DC' : language === 'ja' ? '\u30E2\u30FC\u30C9' : 'Mode';
    const modeTrackLabel = language === 'ko' ? '\uB300\uC0C1' : language === 'ja' ? '\u5BFE\u8C61' : 'Track';
    const modeCountLabel = language === 'ko' ? '\uC790\uC74C \uC218' : language === 'ja' ? '\u5B50\u97F3\u6570' : 'Consonants';
    const activeConsonantItem = consonantItems[Math.max(0, Math.min(activeConsonantIndex, consonantItems.length - 1))] || null;

    useEffect(() => {
        if (consonantItems.length === 0) {
            setActiveConsonantIndex(0);
            return;
        }
        setActiveConsonantIndex(prev => Math.max(0, Math.min(prev, consonantItems.length - 1)));
    }, [consonantItems]);

    const handleAddSelectedConsonants = () => {
        if (pendingConsonantIds.length === 0) return;
        const baseLen = consonantItems.length;
        const next: ConsonantItem[] = [
            ...consonantItems,
            ...pendingConsonantIds.map(id => ({ id, offsetMs: DEFAULT_CONSONANT_OFFSET_MS }))
        ];
        setConsonantItems(next);
        if (baseLen === 0) setActiveConsonantIndex(0);
        commitChange("Add consonants");
    };

    const handleCopyConsonants = () => {
        if (consonantItems.length === 0) return;
        setConsonantClipboard(consonantItems.map(item => ({ ...item })));
    };

    const handlePasteConsonants = () => {
        if (!consonantClipboard || consonantClipboard.length === 0) return;
        const baseLen = consonantItems.length;
        const next = [...consonantItems, ...consonantClipboard.map(item => ({ ...item }))];
        setConsonantItems(next);
        if (baseLen === 0) setActiveConsonantIndex(0);
        commitChange("Paste consonants");
    };

    const handleRemoveActiveConsonant = () => {
        if (consonantItems.length === 0) return;
        const removeIdx = Math.max(0, Math.min(activeConsonantIndex, consonantItems.length - 1));
        const next = consonantItems.filter((_, idx) => idx !== removeIdx);
        setConsonantItems(next);
        setActiveConsonantIndex(Math.max(0, Math.min(removeIdx, Math.max(0, next.length - 1))));
        commitChange("Remove consonant");
    };

    const mixConsonant = async () => {
        const v = getBuffer(vowelId);
        if (!v || !audioContext) return null;

        const vRatio = vStretch / 100;
        const cRatio = cStretch / 100;

        const vOffsetSec = vOffMs / 1000;

        const vLen = v.duration / vRatio;
        let totalDur = vOffsetSec + vLen;

        const loadedConsonants = consonantItems
            .map(item => ({ ...item, buf: getBuffer(item.id) }))
            .filter((item): item is ConsonantItem & { buf: AudioBuffer } => !!item.buf);

        loadedConsonants.forEach(({ buf, offsetMs: itemOffsetMs }) => {
            const cLen = buf.duration / cRatio;
            totalDur = Math.max(totalDur, (itemOffsetMs / 1000) + cLen);
        });

        totalDur += 0.5;
        const offline = new OfflineAudioContext(1, Math.ceil(totalDur * v.sampleRate), v.sampleRate);

        let eqInput = offline.createGain();
        let currentEQNode = eqInput;

        eqBands.forEach(b => {
            if (b.on) {
                const f = offline.createBiquadFilter();
                f.type = b.type;
                f.frequency.value = b.freq;
                f.Q.value = b.q;
                f.gain.value = b.gain;
                currentEQNode.connect(f);
                currentEQNode = f;
            }
        });
        currentEQNode.connect(offline.destination);

        const processedV = await AudioUtils.applyStretch(v, vRatio);
        if (processedV) {
            const sV = offline.createBufferSource();
            sV.buffer = processedV;
            const gV = offline.createGain();
            gV.gain.setValueAtTime(vVolPts[0].v * vowelGain, 0);
            vVolPts.forEach(p => gV.gain.linearRampToValueAtTime(p.v * vowelGain, vOffsetSec + p.t * processedV.duration));
            sV.connect(gV); gV.connect(eqInput);
            sV.start(vOffsetSec);
        }

        for (const { buf, offsetMs: itemOffsetMs } of loadedConsonants) {
            const processedC = await AudioUtils.applyStretch(buf, cRatio);
            if (!processedC) continue;

            const sC = offline.createBufferSource();
            sC.buffer = processedC;
            const gC = offline.createGain();
            const startT = Math.max(0, itemOffsetMs / 1000);
            gC.gain.setValueAtTime(cVolPts[0].v * consonantGain, startT);
            cVolPts.forEach(p => gC.gain.linearRampToValueAtTime(p.v * consonantGain, startT + p.t * processedC.duration));
            sC.connect(gC);
            gC.connect(eqInput);
            sC.start(startT);
        }
        return await offline.startRendering();
    };

    const togglePlay = useCallback(async () => {
        if (isPlaying) {
            if (sourceRef.current) sourceRef.current.stop();
            pauseOffsetRef.current += audioContext.currentTime - startTimeRef.current;
            if (animRef.current) cancelAnimationFrame(animRef.current);
            setIsPlaying(false);
        } else {
            const b = await mixConsonant();
            if (!b) return;
            const s = audioContext.createBufferSource(); s.buffer = b;
            const monitorNode = audioContext.createGain(); monitorNode.gain.value = monitorGainValue;
            s.connect(monitorNode); monitorNode.connect(audioContext.destination);
            const offset = pauseOffsetRef.current % b.duration;

            s.start(0, offset);
            sourceRef.current = s;
            startTimeRef.current = audioContext.currentTime - offset;
            setIsPlaying(true);

            const animate = () => {
                if (sourceRef.current) {
                    setPlayheadTime(audioContext.currentTime - startTimeRef.current);
                    animRef.current = requestAnimationFrame(animate);
                }
            };
            animRef.current = requestAnimationFrame(animate);

            s.onended = () => {
                setIsPlaying(false);
                pauseOffsetRef.current = 0;
                setPlayheadTime(0);
                if (animRef.current) cancelAnimationFrame(animRef.current);
            };
        }
    }, [isPlaying, vowelId, consonantItems, cStretch, vStretch, vowelGain, consonantGain, eqBands, mixConsonant, audioContext]);

    const handleDownload = async () => {
        const b = await mixConsonant();
        if (b) AudioUtils.downloadWav(b, "consonant_vowel_mix.wav");
    };

    useEffect(() => {
        if (!isActive) return;
        const handleKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
            if (isTyping) return;

            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                handleUndo();
                return;
            }

            if (e.key === 'Tab') {
                e.preventDefault();
                setEditMode(prev => prev === 'move' ? 'volume' : 'move');
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isActive, togglePlay, handleUndo]);

    const getTrackVolumeGeometry = useCallback((track: 'vowel' | 'consonant', canvasW: number, canvasH: number) => {
        const vBuf = getBuffer(vowelId);
        const activeConsonantItem = consonantItems[Math.max(0, Math.min(activeConsonantIndex, consonantItems.length - 1))] || consonantItems[0];
        const cBuf = activeConsonantItem ? getBuffer(activeConsonantItem.id) : null;
        const consonantEntries = consonantItems
            .map(item => ({ ...item, buf: getBuffer(item.id) }))
            .filter((item): item is ConsonantItem & { buf: AudioBuffer } => !!item.buf);

        const vRealDur = vBuf ? vBuf.duration * (vStretch / 100) : 0;
        const cRealDur = cBuf ? cBuf.duration * (cStretch / 100) : 0;
        const cMaxEndSec = consonantEntries.length > 0
            ? Math.max(...consonantEntries.map(item => (item.offsetMs / 1000) + (item.buf.duration * (cStretch / 100))))
            : 0;
        const totalDuration = Math.max((vOffMs / 1000) + vRealDur, cMaxEndSec, 1.0) * 1.2;
        const msToPx = (ms: number) => (ms / (totalDuration * 1000)) * canvasW;
        const msPerPx = (totalDuration * 1000) / Math.max(1, canvasW);

        if (track === 'vowel') {
            if (!vBuf || vRealDur <= 0) return null;
            return {
                points: vVolPts,
                setPoints: setVVolPts,
                startPx: msToPx(vOffMs),
                durPx: msToPx(vRealDur * 1000),
                canvasH,
                msPerPx,
            };
        }

        if (!cBuf || cRealDur <= 0) return null;
        return {
            points: cVolPts,
            setPoints: setCVolPts,
            startPx: msToPx(activeConsonantItem?.offsetMs ?? 0),
            durPx: msToPx(cRealDur * 1000),
            canvasH,
            msPerPx,
        };
    }, [getBuffer, vowelId, activeConsonantIndex, consonantItems, vStretch, cStretch, vOffMs, vVolPts, cVolPts]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const canvasW = canvasRef.current.width;
        const canvasH = canvasRef.current.height;
        const xPx = ((e.clientX - rect.left) / rect.width) * canvasW;
        const yPx = ((e.clientY - rect.top) / rect.height) * canvasH;

        if (editMode === 'volume') {
            const geom = getTrackVolumeGeometry(selectedTrack, canvasW, canvasH);
            if (!geom || geom.durPx <= 1) return;

            const hitIdx = geom.points.findIndex((p) => {
                const px = geom.startPx + (p.t * geom.durPx);
                const py = volumeToYPx(p.v, geom.canvasH);
                return Math.hypot(px - xPx, py - yPx) <= 11;
            });

            if (e.button === 2) {
                e.preventDefault();
                if (hitIdx > 0 && hitIdx < geom.points.length - 1) {
                    geom.setPoints(prev => prev.filter((_, i) => i !== hitIdx));
                    commitChange('Delete volume keyframe');
                }
                return;
            }

            if (hitIdx !== -1) {
                setDragPoint({ type: 'vol', track: selectedTrack, index: hitIdx });
                return;
            }

            if (e.button !== 0) return;

            const localT = Math.max(0, Math.min(1, (xPx - geom.startPx) / geom.durPx));
            const localV = yPxToVolume(yPx, geom.canvasH);
            let newIndex = 0;
            geom.setPoints(prev => {
                const next = [...prev, { t: localT, v: localV }].sort((a, b) => a.t - b.t);
                newIndex = next.findIndex((p, idx) => idx > 0 && idx < next.length - 1 && Math.abs(p.t - localT) < 1e-6 && Math.abs(p.v - localV) < 1e-6);
                if (newIndex < 0) newIndex = next.findIndex(p => Math.abs(p.t - localT) < 1e-6);
                return next;
            });
            setDragPoint({ type: 'vol', track: selectedTrack, index: Math.max(0, newIndex) });
            return;
        }

        if (e.button !== 0) return;
        const moveGeom = getTrackVolumeGeometry(selectedTrack, canvasW, canvasH);
        const grabOffsetPx = moveGeom ? (xPx - moveGeom.startPx) : 0;
        setDragPoint({ type: 'move', track: selectedTrack, grabOffsetPx });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragPoint || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const canvasW = canvasRef.current.width;
        const canvasH = canvasRef.current.height;
        const xPx = ((e.clientX - rect.left) / rect.width) * canvasW;
        const yPx = ((e.clientY - rect.top) / rect.height) * canvasH;

        if (dragPoint.type === 'vol' && dragPoint.index !== undefined) {
            const track = dragPoint.track || selectedTrack;
            const geom = getTrackVolumeGeometry(track, canvasW, canvasH);
            if (!geom || geom.durPx <= 1) return;

            const localT = Math.max(0, Math.min(1, (xPx - geom.startPx) / geom.durPx));
            const localV = yPxToVolume(yPx, geom.canvasH);
            geom.setPoints(prev => {
                if (dragPoint.index === undefined || dragPoint.index < 0 || dragPoint.index >= prev.length) return prev;
                const next = [...prev];
                const isFirst = dragPoint.index === 0;
                const isLast = dragPoint.index === next.length - 1;
                const minT = isFirst ? 0 : next[dragPoint.index - 1].t + 0.001;
                const maxT = isLast ? 1 : next[dragPoint.index + 1].t - 0.001;
                const nextT = isFirst ? 0 : isLast ? 1 : Math.max(minT, Math.min(maxT, localT));
                next[dragPoint.index] = { t: nextT, v: localV };
                return next;
            });
        } else if (e.buttons === 1) {
            const targetTrack = dragPoint.track || selectedTrack;
            const geom = getTrackVolumeGeometry(targetTrack, canvasW, canvasH);
            if (!geom) return;
            const grabOffsetPx = dragPoint.grabOffsetPx || 0;
            const nextStartPx = Math.max(0, xPx - grabOffsetPx);
            const nextMs = nextStartPx * geom.msPerPx;
            if (targetTrack === 'consonant') {
                setConsonantItems(prev => {
                    if (prev.length === 0) return prev;
                    const targetIdx = Math.max(0, Math.min(activeConsonantIndex, prev.length - 1));
                    const next = [...prev];
                    next[targetIdx] = { ...next[targetIdx], offsetMs: nextMs };
                    return next;
                });
            } else setVOffMs(nextMs);
        }
    };

    const handleMouseUp = () => {
        if (!dragPoint) return;
        commitChange(dragPoint.type === 'move' ? 'Move track' : 'Edit volume keyframe');
        setDragPoint(null);
    };

    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const w = canvasRef.current.width, h = canvasRef.current.height;
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, w, h);

        const guideLevels = [0.5, 1.0, 1.5];
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.font = '10px sans-serif';
        guideLevels.forEach(level => {
            const y = volumeToYPx(level, h);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
            ctx.fillText(`${Math.round(level * 100)}%`, 6, Math.max(10, y - 4));
        });
        ctx.restore();

        const vBuf = getBuffer(vowelId);
        const consonantEntries = consonantItems
            .map(item => ({ ...item, buf: getBuffer(item.id) }))
            .filter((item): item is ConsonantItem & { buf: AudioBuffer } => !!item.buf);
        const currentConsonant = consonantEntries[Math.max(0, Math.min(activeConsonantIndex, consonantEntries.length - 1))] || consonantEntries[0] || null;
        const cBuf = currentConsonant?.buf || null;

        const vRealDur = vBuf ? vBuf.duration * (vStretch / 100) : 0;
        const cRealDur = cBuf ? cBuf.duration * (cStretch / 100) : 0;
        const cMaxEndSec = consonantEntries.length > 0
            ? Math.max(...consonantEntries.map(item => (item.offsetMs / 1000) + (item.buf.duration * (cStretch / 100))))
            : 0;

        const vEnd = (vOffMs / 1000) + vRealDur;
        const cEnd = cMaxEndSec;
        const totalDuration = Math.max(vEnd, cEnd, 1.0) * 1.2;

        const msToPx = (ms: number) => (ms / (totalDuration * 1000)) * w;

        const drawWave = (buf: AudioBuffer, color: string, offMs: number, stretch: number, active: boolean, gainVal: number, laneIndex: number = 0) => {
            if (!buf) return;
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.globalAlpha = active ? 1 : 0.45;
            ctx.lineWidth = active ? 2 : 1;

            const data = buf.getChannelData(0);
            const sX = msToPx(offMs);
            const scaledDurMs = buf.duration * 1000 * (stretch / 100);
            const wPx = msToPx(scaledDurMs);
            const step = Math.ceil(data.length / wPx);

            for (let i = 0; i < wPx; i++) {
                if (sX + i < 0 || sX + i > w) continue;
                let min = 1, max = -1;
                const dataIdxStart = Math.floor(i * (data.length / wPx));
                const dataIdxEnd = Math.floor((i + 1) * (data.length / wPx));
                for (let j = dataIdxStart; j < dataIdxEnd; j++) {
                    const d = data[j] || 0; if (d < min) min = d; if (d > max) max = d;
                }
                const visGain = Math.min(gainVal, 1.5);
                const laneCount = Math.max(1, Math.min(3, consonantEntries.length));
                const laneY = laneCount === 1
                    ? h * 0.7
                    : h * (0.2 + (Math.min(laneIndex, laneCount - 1) * (0.6 / (laneCount - 1))));
                const cy = active ? h / 2 : (color.includes('3b82f6') ? h * 0.3 : laneY);
                ctx.moveTo(sX + i, cy + min * h / 4 * visGain);
                ctx.lineTo(sX + i, cy + max * h / 4 * visGain);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        };

        if (vBuf) drawWave(vBuf, '#3b82f6', vOffMs, vStretch, selectedTrack === 'vowel', vowelGain);
        consonantEntries.forEach((item, idx) => {
            const isActiveConsonant = selectedTrack === 'consonant' && idx === Math.max(0, Math.min(activeConsonantIndex, consonantEntries.length - 1));
            const itemColor = CONSONANT_COLORS[idx % CONSONANT_COLORS.length];
            drawWave(item.buf, itemColor, item.offsetMs, cStretch, isActiveConsonant, consonantGain, idx);
        });

        const drawLine = (pts: KeyframePoint[], color: string, active: boolean, offMs: number, realDurSec: number) => {
            if (!active) return;
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.setLineDash([5, 5]);
            const startPx = msToPx(offMs);
            const durPx = msToPx(realDurSec * 1000);
            pts.forEach((p, i) => { const x = startPx + (p.t * durPx); const y = volumeToYPx(p.v, h); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
            ctx.stroke(); ctx.setLineDash([]);
            pts.forEach(p => { const x = startPx + (p.t * durPx); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, volumeToYPx(p.v, h), 4, 0, Math.PI * 2); ctx.fill(); });
        };

        if (selectedTrack === 'vowel' && vBuf) drawLine(vVolPts, '#60a5fa', true, vOffMs, vRealDur);
        if (selectedTrack === 'consonant' && cBuf) {
            const activeColor = CONSONANT_COLORS[Math.max(0, Math.min(activeConsonantIndex, consonantEntries.length - 1)) % CONSONANT_COLORS.length];
            drawLine(cVolPts, activeColor, true, currentConsonant?.offsetMs ?? 0, cRealDur);
        }

        if (playheadTime > 0) {
            const px = msToPx(playheadTime * 1000);
            if (px >= 0 && px <= w) {
                ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
            }
        }
    }, [vowelId, consonantItems, activeConsonantIndex, vOffMs, cStretch, vStretch, vVolPts, cVolPts, selectedTrack, files, vowelGain, consonantGain, playheadTime]);

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in overflow-hidden font-sans font-bold" onMouseUp={handleMouseUp}>
            <EditorModeBar
                title={modeTitle}
                hint={modeHint}
                items={[
                    { label: modeEditLabel, value: editMode === 'move' ? text.move : text.volume, tone: editMode === 'move' ? 'indigo' : 'emerald' },
                    { label: modeTrackLabel, value: selectedTrack === 'vowel' ? text.vowel : text.consonant, tone: selectedTrack === 'vowel' ? 'sky' : 'amber' },
                    { label: modeCountLabel, value: `${consonantItems.length}`, tone: 'neutral' },
                ]}
            />
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm h-full overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 flex-shrink-0">
                    <div className="flex items-center gap-3"><div className="p-2 bg-indigo-500 rounded-xl text-white font-bold font-black"><Combine size={24} /></div><h2 className="text-xl text-slate-800 tracking-tight font-black">{text.title}</h2></div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => applyConsonantPreset('unvoiced')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-[10px] font-black text-slate-700 transition-all shadow-sm">{text.unvoiced}</button>
                        <button onClick={() => applyConsonantPreset('voiced')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-[10px] font-black text-slate-700 transition-all shadow-sm">{text.voiced}</button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={() => setShowEQ(!showEQ)} className={`px-4 py-2 rounded-md text-sm font-black flex items-center gap-2 transition-all ${showEQ ? 'bg-white shadow text-pink-600' : 'text-slate-500'}`}><AudioLines size={16} /> {text.masterEq}</button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                            <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30 transition-all"><Undo2 size={16} /></button>
                            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30 transition-all"><Redo2 size={16} /></button>
                        </div>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                            <button onClick={() => setEditMode('move')} className={`px-4 py-2 rounded-md text-sm font-black flex items-center gap-2 transition-all ${editMode === 'move' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}><MousePointer2 size={16} /> {text.move}</button>
                            <button onClick={() => setEditMode('volume')} title="Click add, drag move, right-click delete" className={`px-4 py-2 rounded-md text-sm font-black flex items-center gap-2 transition-all ${editMode === 'volume' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}><TrendingUp size={16} /> {text.volume}</button>
                        </div>
                    </div>
                </div>

                {showEQ && (
                    <div className="h-48 shrink-0 animate-in fade-in slide-in-from-top-4">
                        <ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={sourceRef.current} />
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-shrink-0">
                    <div className={`space-y-4 p-6 rounded-2xl border transition-all cursor-pointer ${selectedTrack === 'vowel' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100' : 'bg-white border-slate-200'}`} onClick={() => setSelectedTrack('vowel')}>
                        <label className="text-sm font-black text-slate-900 uppercase tracking-widest block">{text.vowel}</label>
                        <select value={vowelId} onChange={e => { setVowelId(e.target.value); commitChange("모음 변경"); }} className="w-full p-2.5 border rounded-lg font-black text-base text-slate-900">{files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        <div className="space-y-3">
                            <div className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 space-y-1">
                                <div className="flex justify-between text-xs font-black text-slate-500"><span>{text.offset}</span><span>{Math.round(vOffMs)}ms</span></div>
                                <p className="text-[10px] font-bold text-slate-400">{dragOffsetHint}</p>
                            </div>
                            <div className="space-y-1"><div className="flex justify-between text-xs font-black text-slate-500 px-1"><span>{text.stretch}</span><span className="text-indigo-600">{vStretch}%</span></div><input type="range" min="50" max="200" value={vStretch} onChange={e => setVStretch(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500" /></div>
                        </div>
                    </div>

                    <div className={`space-y-4 p-6 rounded-2xl border transition-all cursor-pointer ${selectedTrack === 'consonant' ? 'bg-orange-50 border-orange-300 ring-2 ring-orange-100' : 'bg-white border-slate-200'}`} onClick={() => setSelectedTrack('consonant')}>
                        <label className="text-sm font-black text-slate-900 uppercase tracking-widest block">{text.consonant}</label>
                        <MultiSelectDropdown
                            options={files.map(f => ({ value: f.id, label: f.name }))}
                            selectedValues={pendingConsonantIds}
                            onChange={setPendingConsonantIds}
                            placeholder={text.selectFile}
                            summaryLabel={(count) => `${count} selected`}
                            emptyLabel={text.none}
                            selectAllLabel={language === 'ko' ? '전체 선택' : language === 'ja' ? 'すべて選択' : 'Select all'}
                            clearLabel={language === 'ko' ? '선택 해제' : language === 'ja' ? 'クリア' : 'Clear'}
                        />
                        <div className="flex flex-wrap gap-2">
                            <button onClick={handleAddSelectedConsonants} disabled={pendingConsonantIds.length === 0} className="px-3 py-1.5 rounded-lg text-xs font-black border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-40 disabled:hover:bg-orange-50 flex items-center gap-1.5"><Plus size={13} /> {addConsonantsLabel}</button>
                            <button onClick={handleCopyConsonants} disabled={consonantItems.length === 0} className="px-3 py-1.5 rounded-lg text-xs font-black border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white flex items-center gap-1.5"><Copy size={13} /> {copyLabel}</button>
                            <button onClick={handlePasteConsonants} disabled={!consonantClipboard || consonantClipboard.length === 0} className="px-3 py-1.5 rounded-lg text-xs font-black border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white flex items-center gap-1.5"><ClipboardPaste size={13} /> {pasteLabel}</button>
                            <button onClick={handleRemoveActiveConsonant} disabled={consonantItems.length === 0} className="px-3 py-1.5 rounded-lg text-xs font-black border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-40 disabled:hover:bg-red-50 flex items-center gap-1.5"><Trash2 size={13} /> {removeLabel}</button>
                        </div>
                        <select
                            value={consonantItems.length > 0 ? String(activeConsonantIndex) : ""}
                            onChange={e => setActiveConsonantIndex(Number(e.target.value))}
                            className="w-full p-2 border rounded-lg font-black text-xs text-slate-700"
                            disabled={consonantItems.length === 0}
                        >
                            {consonantItems.length === 0 && <option value="">{text.none}</option>}
                            {consonantItems.map((item, idx) => {
                                const f = files.find(file => file.id === item.id);
                                return <option key={`active-${idx}-${item.id}`} value={String(idx)}>{`${idx + 1}. ${f?.name || item.id}`}</option>;
                            })}
                        </select>
                        <div className="space-y-3">
                            <div className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 space-y-1">
                                <div className="flex justify-between text-xs font-black text-slate-500"><span>{text.offset}</span><span>{Math.round(activeConsonantItem?.offsetMs || 0)}ms</span></div>
                                <p className="text-[10px] font-bold text-slate-400">{dragOffsetHint}</p>
                            </div>
                            <div className="space-y-1"><div className="flex justify-between text-xs font-black text-slate-500 px-1"><span>{text.stretch}</span><span className="text-pink-600">{cStretch}%</span></div><input type="range" min="50" max="200" value={cStretch} onChange={e => setCStretch(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-pink-500" /></div>
                        </div>
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-700 p-0 rounded-2xl shadow-inner min-h-[256px] flex-1 relative overflow-hidden select-none" onContextMenu={e => e.preventDefault()}>
                    <canvas ref={canvasRef} width={1000} height={300} className={`w-full h-full ${editMode === 'move' ? 'cursor-ew-resize' : 'cursor-crosshair'}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} />
                </div>
                <div className="flex justify-end gap-3 flex-shrink-0">
                    <button onClick={togglePlay} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black flex items-center gap-2 shadow-lg transition-all text-base"><Play size={20} fill="currentColor" /> {isPlaying ? text.stop : text.preview}</button>
                    <button onClick={handleDownload} className="px-6 py-3 bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 rounded-xl font-black flex items-center gap-2 transition-all"><Download size={20} /> {text.downloadWav}</button>
                    <button onClick={async () => { const b = await mixConsonant(); if (b) onAddToRack(b, "Consonant_Mix"); }} className="px-8 py-3 bg-white border border-slate-300 text-slate-900 hover:bg-slate-50 rounded-xl font-black flex items-center gap-2 transition-all text-base"><Save size={20} /> {text.saveToRack}</button>
                </div>
            </div>
        </div>
    );
};

export default ConsonantTab;
