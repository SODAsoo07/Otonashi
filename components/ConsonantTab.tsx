
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Combine, MousePointer2, TrendingUp, Play, Save, Undo2, Redo2, AudioLines, Download } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { AudioFile, KeyframePoint, EQBand } from '../types';
import { AudioUtils } from '../utils/audioUtils';
import ParametricEQ from './ParametricEQ';

interface ConsonantTabProps {
    audioContext: AudioContext;
    files: AudioFile[];
    onAddToRack: (buffer: AudioBuffer, name: string) => void;
    isActive: boolean;
    monitorGainValue?: number;
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

const ConsonantTab: React.FC<ConsonantTabProps> = ({ audioContext, files, onAddToRack, isActive, monitorGainValue = 1.0 }) => {
    const { language } = useLanguage();
    const text = CONSONANT_TEXT[language];
    const [vowelId, setVowelId] = useState("");
    const [consonantIds, setConsonantIds] = useState<string[]>([]);
    const [activeConsonantId, setActiveConsonantId] = useState("");

    // Timing & Stretch
    const [vOffMs, setVOffMs] = useState(0);
    const [offsetMs, setOffsetMs] = useState(100);
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
    const [dragPoint, setDragPoint] = useState<{ type: 'vol' | 'move', track?: 'vowel' | 'consonant', index?: number } | null>(null);

    // History
    const [history, setHistory] = useState<any[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const applyConsonantPreset = (type: 'unvoiced' | 'voiced') => {
        if (type === 'unvoiced') {
            setCVolPts([{ t: 0, v: 0 }, { t: 0.05, v: 1.2 }, { t: 0.2, v: 0.4 }, { t: 1, v: 0 }]);
            setVVolPts([{ t: 0, v: 0 }, { t: 0.1, v: 0 }, { t: 0.2, v: 1 }, { t: 1, v: 1 }]);
            setOffsetMs(50);
            setVOffMs(150);
        } else {
            setCVolPts([{ t: 0, v: 0.5 }, { t: 0.3, v: 1 }, { t: 0.7, v: 0.8 }, { t: 1, v: 0 }]);
            setVVolPts([{ t: 0, v: 0 }, { t: 0.1, v: 0.5 }, { t: 1, v: 1 }]);
            setOffsetMs(0);
            setVOffMs(100);
        }
        commitChange(`${type} 프리셋 적용`);
    };

    const getCurrentState = useCallback(() => ({
        vowelId, consonantIds, activeConsonantId, vOffMs, offsetMs, cStretch, vStretch, vVolPts, cVolPts, vowelGain, consonantGain, eqBands
    }), [vowelId, consonantIds, activeConsonantId, vOffMs, offsetMs, cStretch, vStretch, vVolPts, cVolPts, vowelGain, consonantGain, eqBands]);

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
        setConsonantIds(nextConsonants);
        setActiveConsonantId(state.activeConsonantId || nextConsonants[0] || "");
        setVOffMs(state.vOffMs);
        setOffsetMs(state.offsetMs); setCStretch(state.cStretch); setVStretch(state.vStretch || 100);
        setVVolPts(state.vVolPts); setCVolPts(state.cVolPts);
        setVowelGain(state.vowelGain || 1.0); setConsonantGain(state.consonantGain || 1.0);
        if (state.eqBands) setEqBands(state.eqBands);
    };

    const handleUndo = () => { if (historyIndex > 0) { const prev = historyIndex - 1; restoreState(history[prev].state); setHistoryIndex(prev); } };
    const handleRedo = () => { if (historyIndex < history.length - 1) { const next = historyIndex + 1; restoreState(history[next].state); setHistoryIndex(next); } };

    const commitChange = (label: string = "변경") => saveHistory(label);

    const getBuffer = (id: string) => files.find(f => f.id === id)?.buffer;

    const mixConsonant = async () => {
        const v = getBuffer(vowelId);
        if (!v || !audioContext) return null;

        const vRatio = vStretch / 100;
        const cRatio = cStretch / 100;

        const offsetSec = offsetMs / 1000;
        const vOffsetSec = vOffMs / 1000;

        const vLen = v.duration / vRatio;
        let totalDur = vOffsetSec + vLen;

        const loadedConsonants = consonantIds
            .map(id => ({ id, buf: getBuffer(id) }))
            .filter((item): item is { id: string; buf: AudioBuffer } => !!item.buf);

        loadedConsonants.forEach(({ buf }) => {
            const cLen = buf.duration / cRatio;
            totalDur = Math.max(totalDur, offsetSec + cLen);
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

        for (const { buf } of loadedConsonants) {
            const processedC = await AudioUtils.applyStretch(buf, cRatio);
            if (!processedC) continue;

            const sC = offline.createBufferSource();
            sC.buffer = processedC;
            const gC = offline.createGain();
            const startT = Math.max(0, offsetSec);
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
    }, [isPlaying, vowelId, consonantIds, activeConsonantId, offsetMs, cStretch, vStretch, vowelGain, consonantGain, eqBands, mixConsonant, audioContext]);

    const handleDownload = async () => {
        const b = await mixConsonant();
        if (b) AudioUtils.downloadWav(b, "consonant_vowel_mix.wav");
    };

    useEffect(() => {
        if (!isActive) return;
        const handleKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); togglePlay(); } };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isActive, togglePlay]);

    const getTrackVolumeGeometry = useCallback((track: 'vowel' | 'consonant', canvasW: number, canvasH: number) => {
        const vBuf = getBuffer(vowelId);
        const activeId = activeConsonantId || consonantIds[0] || "";
        const cBuf = getBuffer(activeId);

        const vRealDur = vBuf ? vBuf.duration * (vStretch / 100) : 0;
        const cRealDur = cBuf ? cBuf.duration * (cStretch / 100) : 0;
        const totalDuration = Math.max((vOffMs / 1000) + vRealDur, (offsetMs / 1000) + cRealDur, 1.0) * 1.2;
        const msToPx = (ms: number) => (ms / (totalDuration * 1000)) * canvasW;

        if (track === 'vowel') {
            if (!vBuf || vRealDur <= 0) return null;
            return {
                points: vVolPts,
                setPoints: setVVolPts,
                startPx: msToPx(vOffMs),
                durPx: msToPx(vRealDur * 1000),
                canvasH,
            };
        }

        if (!cBuf || cRealDur <= 0) return null;
        return {
            points: cVolPts,
            setPoints: setCVolPts,
            startPx: msToPx(offsetMs),
            durPx: msToPx(cRealDur * 1000),
            canvasH,
        };
    }, [getBuffer, vowelId, activeConsonantId, consonantIds, vStretch, cStretch, vOffMs, offsetMs, vVolPts, cVolPts]);

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
                const py = (1 - p.v) * geom.canvasH;
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

            if (!e.shiftKey) return;

            const localT = Math.max(0, Math.min(1, (xPx - geom.startPx) / geom.durPx));
            const localV = Math.max(0, Math.min(1, 1 - (yPx / geom.canvasH)));
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

        setDragPoint({ type: 'move', track: selectedTrack });
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
            const localV = Math.max(0, Math.min(1, 1 - (yPx / geom.canvasH)));
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
            const dx = e.movementX;
            const targetTrack = dragPoint.track || selectedTrack;
            if (targetTrack === 'consonant') setOffsetMs(prev => Math.max(0, prev + dx * 2));
            else setVOffMs(prev => Math.max(0, prev + dx * 2));
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

        const vBuf = getBuffer(vowelId);
        const consonantEntries = consonantIds
            .map(id => ({ id, buf: getBuffer(id) }))
            .filter((item): item is { id: string; buf: AudioBuffer } => !!item.buf);
        const currentConsonant = consonantEntries.find(item => item.id === activeConsonantId) || consonantEntries[0] || null;
        const cBuf = currentConsonant?.buf || null;

        const vRealDur = vBuf ? vBuf.duration * (vStretch / 100) : 0;
        const cRealDur = cBuf ? cBuf.duration * (cStretch / 100) : 0;
        const cMaxRealDur = consonantEntries.length > 0
            ? Math.max(...consonantEntries.map(item => item.buf.duration * (cStretch / 100)))
            : 0;

        const vEnd = (vOffMs / 1000) + vRealDur;
        const cEnd = (offsetMs / 1000) + cMaxRealDur;
        const totalDuration = Math.max(vEnd, cEnd, 1.0) * 1.2;

        const msToPx = (ms: number) => (ms / (totalDuration * 1000)) * w;

        const drawWave = (buf: AudioBuffer, color: string, offMs: number, stretch: number, active: boolean, gainVal: number, laneIndex: number = 0) => {
            if (!buf) return;
            ctx.beginPath();
            ctx.strokeStyle = active ? color : '#475569';
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
        };

        if (vBuf) drawWave(vBuf, '#3b82f6', vOffMs, vStretch, selectedTrack === 'vowel', vowelGain);
        consonantEntries.forEach((item, idx) => {
            const isActiveConsonant = selectedTrack === 'consonant' && currentConsonant?.id === item.id;
            drawWave(item.buf, '#fb923c', offsetMs, cStretch, isActiveConsonant, consonantGain, idx);
        });

        const drawLine = (pts: KeyframePoint[], color: string, active: boolean, offMs: number, realDurSec: number) => {
            if (!active) return;
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.setLineDash([5, 5]);
            const startPx = msToPx(offMs);
            const durPx = msToPx(realDurSec * 1000);
            pts.forEach((p, i) => { const x = startPx + (p.t * durPx); const y = (1 - p.v) * h; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
            ctx.stroke(); ctx.setLineDash([]);
            pts.forEach(p => { const x = startPx + (p.t * durPx); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, (1 - p.v) * h, 4, 0, Math.PI * 2); ctx.fill(); });
        };

        if (selectedTrack === 'vowel' && vBuf) drawLine(vVolPts, '#60a5fa', true, vOffMs, vRealDur);
        if (selectedTrack === 'consonant' && cBuf) drawLine(cVolPts, '#fb923c', true, offsetMs, cRealDur);

        if (playheadTime > 0) {
            const px = msToPx(playheadTime * 1000);
            if (px >= 0 && px <= w) {
                ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
            }
        }
    }, [vowelId, consonantIds, activeConsonantId, vOffMs, offsetMs, cStretch, vStretch, vVolPts, cVolPts, selectedTrack, files, vowelGain, consonantGain, playheadTime]);

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in overflow-hidden font-sans font-bold" onMouseUp={handleMouseUp}>
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
                            <button onClick={() => setEditMode('volume')} title="Shift+Click add, drag move, right-click delete" className={`px-4 py-2 rounded-md text-sm font-black flex items-center gap-2 transition-all ${editMode === 'volume' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}><TrendingUp size={16} /> {text.volume}</button>
                        </div>
                    </div>
                </div>

                {showEQ && (
                    <div className="h-48 shrink-0 animate-in fade-in slide-in-from-top-4">
                        <ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={sourceRef.current} />
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-shrink-0">
                    <div className={`space-y-4 p-6 rounded-2xl border transition-all cursor-pointer ${selectedTrack === 'vowel' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100' : 'bg-white border-slate-200'}`} onClick={() => setSelectedTrack('vowel')} onMouseUp={() => commitChange()}>
                        <label className="text-sm font-black text-slate-900 uppercase tracking-widest block">{text.vowel}</label>
                        <select value={vowelId} onChange={e => { setVowelId(e.target.value); commitChange("모음 변경"); }} className="w-full p-2.5 border rounded-lg font-black text-base text-slate-900">{files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        <div className="space-y-3">
                            <div className="space-y-1"><div className="flex justify-between text-xs font-black text-slate-500 px-1"><span>{text.offset}</span><span>{Math.round(vOffMs)}ms</span></div><input type="range" min="0" max="1000" value={vOffMs} onChange={e => setVOffMs(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-400" /></div>
                            <div className="space-y-1"><div className="flex justify-between text-xs font-black text-slate-500 px-1"><span>{text.stretch}</span><span className="text-indigo-600">{vStretch}%</span></div><input type="range" min="50" max="200" value={vStretch} onChange={e => setVStretch(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500" /></div>
                        </div>
                    </div>

                    <div className={`space-y-4 p-6 rounded-2xl border transition-all cursor-pointer ${selectedTrack === 'consonant' ? 'bg-orange-50 border-orange-300 ring-2 ring-orange-100' : 'bg-white border-slate-200'}`} onClick={() => setSelectedTrack('consonant')} onMouseUp={() => commitChange()}>
                        <label className="text-sm font-black text-slate-900 uppercase tracking-widest block">{text.consonant}</label>
                        <select
                            multiple
                            value={consonantIds}
                            onChange={e => {
                                const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
                                setConsonantIds(selected);
                                setActiveConsonantId(prev => selected.includes(prev) ? prev : (selected[0] || ""));
                                commitChange("Change consonants");
                            }}
                            className="w-full p-2.5 border rounded-lg font-black text-sm text-slate-900 min-h-[110px]"
                        >
                            {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <select
                            value={activeConsonantId || consonantIds[0] || ""}
                            onChange={e => setActiveConsonantId(e.target.value)}
                            className="w-full p-2 border rounded-lg font-black text-xs text-slate-700"
                            disabled={consonantIds.length === 0}
                        >
                            {consonantIds.length === 0 && <option value="">{text.none}</option>}
                            {consonantIds.map(id => {
                                const f = files.find(file => file.id === id);
                                return <option key={`active-${id}`} value={id}>{`Active: ${f?.name || id}`}</option>;
                            })}
                        </select>
                        <div className="space-y-3">
                            <div className="space-y-1"><div className="flex justify-between text-xs font-black text-slate-500 px-1"><span>{text.offset}</span><span>{Math.round(offsetMs)}ms</span></div><input type="range" min="0" max="1000" value={offsetMs} onChange={e => setOffsetMs(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-pink-400" /></div>
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
