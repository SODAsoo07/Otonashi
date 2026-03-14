
import React, { useRef, useEffect, useState } from 'react';
import { PencilLine, Eye, EyeOff, GitCommit, Spline, MoveVertical, RotateCcw, Undo2, Redo2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { AdvTrack } from '../types';
import { RULER_HEIGHT } from '../utils/audioUtils';

interface TimelineEditorProps {
    advTracks: AdvTrack[];
    setAdvTracks: React.Dispatch<React.SetStateAction<AdvTrack[]>>;
    selectedTrackId: string;
    setSelectedTrackId: (id: string) => void;
    playHeadPos: number;
    setPlayheadPos: (pos: number) => void;
    syncVisualsToTime: (t: number) => void;
    handleSimulationPlay: () => void;
    isAdvPlaying: boolean;
    commitChange: (label: string) => void;
    isEditMode: boolean;
    setIsEditMode: (v: boolean) => void;
    showGhost: boolean;
    setShowGhost: (v: boolean) => void;
    ghostTracks: AdvTrack[] | null;
    showSpectrogram: boolean;
    spectrogramCanvas: HTMLCanvasElement | null;
    previewBuffer: AudioBuffer | null;
    getCurrentValue: (id: string) => number;
    getValueAtTime: (id: string, t: number, tracks?: AdvTrack[]) => number;
    simPauseOffsetRef: React.MutableRefObject<number>;
    advDuration: number;
    onResetAllKeyframes: () => void;
    onUndo: () => void;
    onRedo: () => void;
    undoStackLength: number;
    redoStackLength: number;
}

const TIMELINE_TEXT = {
    ko: {
        shiftDrag: 'Shift+드래그로 전체 오프셋',
        guide: '가이드',
        guideTitle: 'AI 가이드 트랙 보이기/숨기기',
        curve: '곡선',
        linear: '직선',
        interpolationChange: '보간 모드 변경',
        editModeOn: '키프레임 편집 중',
        editModeOff: '플레이헤드 이동 모드',
        time: '시간',
        pitch: '피치',
        gender: '성별',
    },
    en: {
        shiftDrag: 'Shift+Drag to Offset',
        guide: 'Guide',
        guideTitle: 'Show or hide the AI guide track',
        curve: 'Curve',
        linear: 'Linear',
        interpolationChange: 'Change interpolation mode',
        editModeOn: 'Keyframe edit mode',
        editModeOff: 'Playhead move mode',
        time: 'Time',
        pitch: 'Pitch',
        gender: 'Gender',
    },
    ja: {
        shiftDrag: 'Shift+ドラッグで全体オフセット',
        guide: 'ガイド',
        guideTitle: 'AI ガイドトラックの表示切り替え',
        curve: '曲線',
        linear: '直線',
        interpolationChange: '補間モードを変更',
        editModeOn: 'キーフレーム編集モード',
        editModeOff: '再生ヘッド移動モード',
        time: '時間',
        pitch: 'ピッチ',
        gender: '性別',
    },
} as const;

const GRAPH_BOTTOM_PADDING = 16;

const TimelineEditor: React.FC<TimelineEditorProps> = ({
    advTracks, setAdvTracks, selectedTrackId, setSelectedTrackId,
    playHeadPos, setPlayheadPos, syncVisualsToTime, handleSimulationPlay, isAdvPlaying,
    commitChange, isEditMode, setIsEditMode, showGhost, setShowGhost, ghostTracks,
    showSpectrogram, spectrogramCanvas, previewBuffer, getCurrentValue, getValueAtTime,
    simPauseOffsetRef, advDuration, onResetAllKeyframes,
    onUndo, onRedo, undoStackLength, redoStackLength
}) => {
    const { language } = useLanguage();
    const text = TIMELINE_TEXT[language];
    const resetAllLabel = language === 'ko' ? '\uC804\uCCB4 \uCD08\uAE30\uD654' : language === 'ja' ? '\u5168\u4F53\u30EA\u30BB\u30C3\u30C8' : 'Reset All';
    const resetAllTitle = language === 'ko'
        ? '\uBAA8\uB4E0 \uD0A4\uD504\uB808\uC784\uC744 \uAE30\uBCF8\uAC12\uC73C\uB85C \uCD08\uAE30\uD654'
        : language === 'ja'
            ? '\u3059\u3079\u3066\u306E\u30AD\u30FC\u30D5\u30EC\u30FC\u30E0\u3092\u521D\u671F\u5024\u306B\u623B\u3059'
            : 'Reset all keyframes to defaults';
    const resetAllConfirm = language === 'ko'
        ? '\uBAA8\uB4E0 \uD0A4\uD504\uB808\uC784\uC744 \uAE30\uBCF8\uAC12\uC73C\uB85C \uCD08\uAE30\uD654\uD560\uAE4C\uC694?'
        : language === 'ja'
            ? '\u3059\u3079\u3066\u306E\u30AD\u30FC\u30D5\u30EC\u30FC\u30E0\u3092\u521D\u671F\u5024\u306B\u623B\u3057\u307E\u3059\u304B\uFF1F'
            : 'Reset all keyframes to defaults?';
    const overlayLabel = language === 'ko' ? '\uC624\uBC84\uB808\uC774' : language === 'ja' ? '\u30AA\u30FC\u30D0\u30FC\u30EC\u30A4' : 'Overlay';
    const overlayLimitText = language === 'ko' ? '\uCD5C\uB300 3\uAC1C' : language === 'ja' ? '\u6700\u5927 3\u4EF6' : 'Max 3';
    const overlayLimitAlert = language === 'ko'
        ? '\uC624\uBC84\uB808\uC774\uB294 \uCD5C\uB300 3\uAC1C\uAE4C\uC9C0\uB9CC \uC120\uD0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.'
        : language === 'ja'
            ? '\u30AA\u30FC\u30D0\u30FC\u30EC\u30A4\u306F\u6700\u5927 3 \u4EF6\u307E\u3067\u9078\u629E\u3067\u304D\u307E\u3059\u3002'
            : 'You can select up to 3 overlay tracks.';
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [draggingKeyframe, setDraggingKeyframe] = useState<{
        trackId?: string; 
        index?: number; 
        isPlayhead?: boolean;
        isGlobalShift?: boolean;
    } | null>(null);
    const [hoveredKeyframe, setHoveredKeyframe] = useState<{trackId: string, index: number} | null>(null);
    const [canvasSize, setCanvasSize] = useState({ w: 1000, h: 200 });
    const [globalShiftStart, setGlobalShiftStart] = useState<{ y: number, initialPoints: {t: number, v: number}[] } | null>(null);
    const [isShiftHeld, setIsShiftHeld] = useState(false);
    const [isCtrlHeld, setIsCtrlHeld] = useState(false);
    const [overlayTrackIds, setOverlayTrackIds] = useState<string[]>([]);

    useEffect(() => {
        const validTrackIds = new Set(advTracks.map(t => t.id));
        setOverlayTrackIds(prev => {
            const next = prev.filter(id => id !== selectedTrackId && validTrackIds.has(id));
            if (next.length === prev.length && next.every((id, idx) => id === prev[idx])) return prev;
            return next;
        });
    }, [selectedTrackId, advTracks]);

    const toggleOverlayTrack = (trackId: string) => {
        setOverlayTrackIds(prev => {
            if (prev.includes(trackId)) return prev.filter(id => id !== trackId);
            if (prev.length >= 3) {
                window.alert(overlayLimitAlert);
                return prev;
            }
            return [...prev, trackId];
        });
    };

    // Track modifier keys
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'Shift') setIsShiftHeld(true);
            if (e.key === 'Control' || e.key === 'Meta') setIsCtrlHeld(true);
        };
        const up = (e: KeyboardEvent) => {
            if (e.key === 'Shift') setIsShiftHeld(false);
            if (e.key === 'Control' || e.key === 'Meta') setIsCtrlHeld(false);
        };
        const blur = () => {
            setIsShiftHeld(false);
            setIsCtrlHeld(false);
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', blur);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', blur);
        };
    }, []);

    // Handle resize to match parent flex container
    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                setCanvasSize({
                    w: containerRef.current.clientWidth,
                    h: containerRef.current.clientHeight
                });
            }
        };
        const resizeObserver = new ResizeObserver(updateSize);
        if (containerRef.current) resizeObserver.observe(containerRef.current);
        updateSize();
        return () => resizeObserver.disconnect();
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const t = Math.max(0, Math.min(1, x / rect.width));

        const movePlayhead = () => {
            setPlayheadPos(t);
            syncVisualsToTime(t);
            simPauseOffsetRef.current = t * advDuration;
            if (isAdvPlaying) handleSimulationPlay();
            setDraggingKeyframe({ isPlayhead: true });
        };

        // Ctrl/Cmd while in edit mode: timeline navigation
        if (e.ctrlKey || e.metaKey) {
            movePlayhead();
            return;
        }

        // Global Shift Mode (Shift + Drag)
        if (isEditMode && e.shiftKey) {
            const track = advTracks.find(tr => tr.id === selectedTrackId);
            if (track) {
                commitChange('Global offset');
                setGlobalShiftStart({ y, initialPoints: [...track.points] });
                setDraggingKeyframe({ isGlobalShift: true, trackId: selectedTrackId });
            }
            return;
        }

        if (!isEditMode) {
            movePlayhead();
            return;
        }

        const track = advTracks.find(tr => tr.id === selectedTrackId);
        if (!track) return;

        const graphH = Math.max(1, rect.height - RULER_HEIGHT - GRAPH_BOTTOM_PADDING);
        const hitIdx = track.points.findIndex(
            p => Math.hypot((p.t * rect.width) - x, (RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * graphH) - y) < 15
        );

        if (e.button === 2) {
            e.preventDefault();
            if (hitIdx !== -1 && track.points.length > 2) {
                commitChange('Delete point');
                setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: tr.points.filter((_, i) => i !== hitIdx) } : tr));
            }
            return;
        }

        if (hitIdx !== -1) {
            commitChange('Move point');
            setDraggingKeyframe({ trackId: selectedTrackId, index: hitIdx });
            return;
        }

        if (y >= RULER_HEIGHT) {
            commitChange('Add point');
            const normY = Math.max(0, Math.min(1, (y - RULER_HEIGHT) / graphH));
            const val = track.min + ((1 - normY) * (track.max - track.min));
            const nPts = [...track.points, { t, v: val }].sort((a, b) => a.t - b.t);
            setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: nPts } : tr));
            setDraggingKeyframe({ trackId: selectedTrackId, index: nPts.findIndex(p => p.t === t) });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if(!draggingKeyframe || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        // Handle Global Shift Drag
        if (draggingKeyframe.isGlobalShift && globalShiftStart && draggingKeyframe.trackId) {
            const dy = e.clientY - rect.top - globalShiftStart.y;
            const track = advTracks.find(t => t.id === draggingKeyframe.trackId);
            if (!track) return;

            const graphH = Math.max(1, rect.height - RULER_HEIGHT - GRAPH_BOTTOM_PADDING);
            const range = track.max - track.min;
            const deltaV = -(dy / graphH) * range;

            setAdvTracks(prev => prev.map(tr => {
                if (tr.id !== draggingKeyframe.trackId) return tr;
                const newPoints = globalShiftStart.initialPoints.map(p => ({
                    t: p.t,
                    v: Math.max(tr.min, Math.min(tr.max, p.v + deltaV))
                }));
                return { ...tr, points: newPoints };
            }));
            return;
        }

        if (draggingKeyframe.isPlayhead) {
            setPlayheadPos(t);
            syncVisualsToTime(t);
        }
        else if (draggingKeyframe.trackId && draggingKeyframe.index !== undefined) {
            const gH = Math.max(1, rect.height - RULER_HEIGHT - GRAPH_BOTTOM_PADDING);
            const nV = Math.max(0, Math.min(1, 1 - (((e.clientY - rect.top) - RULER_HEIGHT) / gH)));
            setAdvTracks(prev => prev.map(tr => {
                if (tr.id !== draggingKeyframe.trackId) return tr;
                const valActual = tr.min + nV * (tr.max - tr.min);
                return { ...tr, points: tr.points.map((p, i) => i === draggingKeyframe.index ? { t, v: valActual } : p) };
            }));
        }
    };

    const handleMouseUp = () => {
        if (draggingKeyframe?.trackId) {
            setAdvTracks(prev => prev.map(tr => {
                if (tr.id !== draggingKeyframe.trackId) return tr;
                return { ...tr, points: [...tr.points].sort((a, b) => a.t - b.t) };
            }));
        }
        setDraggingKeyframe(null);
        setGlobalShiftStart(null);
    };

    // Canvas Drawing Logic
    useEffect(() => {
        if(!canvasRef.current) return; 
        const ctx = canvasRef.current.getContext('2d'); 
        if(!ctx) return; 
        const { w, h } = canvasSize;
        const track = advTracks.find(t => t.id === selectedTrackId);
        const graphH = Math.max(1, h - RULER_HEIGHT - GRAPH_BOTTOM_PADDING);
        const valueToY = (value: number, min: number, max: number) =>
            RULER_HEIGHT + (1 - (value - min) / (max - min)) * graphH;
        
        ctx.clearRect(0, 0, w, h); 
        ctx.fillStyle = '#f8f8f6'; 
        ctx.fillRect(0, RULER_HEIGHT, w, graphH); 

        // Spectrogram
        if (showSpectrogram && spectrogramCanvas) {
            ctx.drawImage(spectrogramCanvas, 0, RULER_HEIGHT, w, graphH);
        }
        
        // Preview Waveform
        if (previewBuffer) {
            ctx.save(); 
            ctx.globalAlpha = 0.4; 
            ctx.beginPath(); 
            ctx.strokeStyle = '#cbd5e1'; 
            ctx.lineWidth = 1;
            const data = previewBuffer.getChannelData(0); 
            const step = Math.ceil(data.length / w);
            const waveH = graphH; 
            const amp = waveH / 2; 
            const center = RULER_HEIGHT + amp;
            for (let i = 0; i < w; i++) {
                let min = 1.0, max = -1.0; 
                for (let j = 0; j < step; j++) { 
                    const d = data[i * step + j] || 0; 
                    if (d < min) min = d; if (d > max) max = d; 
                }
                ctx.moveTo(i, center + min * amp); 
                ctx.lineTo(i, center + max * amp);
            }
            ctx.stroke(); 
            ctx.restore();
        }

        // Ghost Track
        if (showGhost && ghostTracks && track) {
            const ghost = ghostTracks.find(t => t.id === selectedTrackId);
            if (ghost) {
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = track.color;
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.globalAlpha = 0.4;
                
                if (ghost.interpolation === 'curve') {
                     for(let i=0; i<w; i++) {
                         const t = i / w;
                         const v = getValueAtTime(ghost.id, t, ghostTracks);
                         const y = valueToY(v, ghost.min, ghost.max);
                         if(i===0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
                     }
                } else {
                     ghost.points.forEach((p, i) => { 
                        const x = p.t * w; 
                        const y = valueToY(p.v, ghost.min, ghost.max); 
                        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); 
                    }); 
                }
                ctx.stroke();
                ctx.restore();
            }
        }

        // Overlay Tracks (other timelines)
        if (track && overlayTrackIds.length > 0) {
            overlayTrackIds.forEach((overlayId, idx) => {
                const overlayTrack = advTracks.find(t => t.id === overlayId);
                if (!overlayTrack || overlayTrack.points.length === 0) return;

                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = overlayTrack.color;
                ctx.lineWidth = 1.8;
                ctx.globalAlpha = 0.22 + (idx * 0.06);
                ctx.setLineDash([4, 4]);

                if (overlayTrack.interpolation === 'curve') {
                    for (let i = 0; i < w; i++) {
                        const tNorm = i / w;
                        const v = getValueAtTime(overlayTrack.id, tNorm);
                        const y = valueToY(v, overlayTrack.min, overlayTrack.max);
                        if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
                    }
                } else {
                    overlayTrack.points.forEach((p, i) => {
                        const x = p.t * w;
                        const y = valueToY(p.v, overlayTrack.min, overlayTrack.max);
                        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    });
                }
                ctx.stroke();

                overlayTrack.points.forEach(p => {
                    const x = p.t * w;
                    const y = valueToY(p.v, overlayTrack.min, overlayTrack.max);
                    ctx.fillStyle = overlayTrack.color;
                    ctx.beginPath();
                    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.restore();
            });
        }
        
        // Main Track
        if (track) {
            ctx.beginPath(); 
            ctx.strokeStyle = track.color; 
            ctx.lineWidth = 2.5; 

            if (track.interpolation === 'curve') {
                 for(let i=0; i<w; i++) {
                     const t = i / w;
                     const v = getValueAtTime(track.id, t);
                     const y = valueToY(v, track.min, track.max);
                     if(i===0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
                 }
            } else {
                 track.points.forEach((p, i) => { 
                    const x = p.t * w; 
                    const y = valueToY(p.v, track.min, track.max); 
                    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); 
                }); 
            }
            
            ctx.stroke(); 
            track.points.forEach((p, i) => { 
                const x = p.t * w; 
                const y = valueToY(p.v, track.min, track.max); 
                ctx.fillStyle = (hoveredKeyframe?.index === i) ? '#1f1e1d' : track.color; 
                ctx.beginPath(); 
                ctx.arc(x, y, 6, 0, Math.PI*2); 
                ctx.fill(); 
            }); 
        }
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(playHeadPos * w, 0); ctx.lineTo(playHeadPos * w, h); ctx.stroke();
    }, [canvasSize, selectedTrackId, advTracks, playHeadPos, hoveredKeyframe, previewBuffer, getValueAtTime, showSpectrogram, showGhost, ghostTracks, spectrogramCanvas, overlayTrackIds]);

    const currentTrack = advTracks.find(t => t.id === selectedTrackId);
    
    // Determine Cursor
    let cursorClass = 'cursor-text';
    if (isEditMode) {
        if (isCtrlHeld) cursorClass = 'cursor-ew-resize'; // Timeline navigation
        else if (isShiftHeld) cursorClass = 'cursor-ns-resize'; // Global Shift
        else cursorClass = 'cursor-crosshair';
    }

    return (
        <div className="flex-1 min-h-[150px] bg-white/40 dynamic-radius border border-slate-300 p-2 shadow-sm relative shrink-0 flex flex-col">
            <div className="flex items-center justify-between gap-1.5 pb-1 px-1 shrink-0">
                <div className="flex gap-1.5 overflow-x-auto custom-scrollbar py-1 font-bold">
                    {advTracks.map(t => <button key={t.id} onClick={() => setSelectedTrackId(t.id)} className={`px-2.5 py-1 text-[10px] font-black border rounded-full transition-all whitespace-nowrap ${selectedTrackId === t.id ? 'dynamic-primary text-slate-900 font-black dynamic-primary-border shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}>{t.name}</button>)}
                </div>
                <div className="flex gap-1 shrink-0">
                    {isEditMode && selectedTrackId === 'gain' && (
                        <div className="hidden lg:flex items-center gap-1 text-[9px] text-slate-400 font-bold bg-slate-50 px-2 rounded-lg border border-slate-200 mr-2">
                            <MoveVertical size={10}/> 
                            {text.shiftDrag}
                        </div>
                    )}
                    {ghostTracks && (
                        <button
                            onClick={() => setShowGhost(!showGhost)}
                            className={`px-2 py-1 text-[10px] font-black rounded-lg border transition-all flex items-center gap-1 ${showGhost ? 'bg-purple-50 border-purple-200 text-purple-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                            title={text.guideTitle}
                        >
                            {showGhost ? <Eye size={14} /> : <EyeOff size={14} />} {text.guide}
                        </button>
                    )}
                    <button
                        onClick={onUndo}
                        disabled={undoStackLength === 0}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title="Undo"
                    >
                        <Undo2 size={14} />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={redoStackLength === 0}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title="Redo"
                    >
                        <Redo2 size={14} />
                    </button>
                    <button
                        onClick={() => {
                            if (window.confirm(resetAllConfirm)) {
                                onResetAllKeyframes();
                            }
                        }}
                        className="px-2.5 py-1 text-[10px] font-black rounded-lg border transition-all flex items-center gap-1 bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                        title={resetAllTitle}
                    >
                        <RotateCcw size={13} />
                        {resetAllLabel}
                    </button>
                    <button
                        onClick={() => {
                            setAdvTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, interpolation: t.interpolation === 'curve' ? 'linear' : 'curve' } : t));
                            commitChange("보간 모드 변경");
                        }}
                        className={`px-3 py-1 text-[10px] font-black rounded-lg border transition-all flex items-center gap-1 ${currentTrack?.interpolation === 'curve' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                        title={text.interpolationChange}
                    >
                        {currentTrack?.interpolation === 'curve' ? <Spline size={14} /> : <GitCommit size={14} />}
                        {currentTrack?.interpolation === 'curve' ? text.curve : text.linear}
                    </button>
                    <button onClick={() => setIsEditMode(!isEditMode)} className={`p-1.5 rounded-lg border transition-all shadow-sm ${isEditMode ? 'bg-amber-400 text-white border-amber-500' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`} title={isEditMode ? text.editModeOn : text.editModeOff}><PencilLine size={16} /></button>
                </div>
            </div>
            <div className="flex items-center gap-1.5 px-1 pb-1 overflow-x-auto custom-scrollbar">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider shrink-0">
                    {overlayLabel} ({overlayTrackIds.length}/3)
                </span>
                {advTracks.filter(t => t.id !== selectedTrackId).map(t => {
                    const active = overlayTrackIds.includes(t.id);
                    const disabled = !active && overlayTrackIds.length >= 3;
                    return (
                        <button
                            key={`overlay-${t.id}`}
                            onClick={() => toggleOverlayTrack(t.id)}
                            disabled={disabled}
                            className={`px-2 py-0.5 text-[9px] font-black rounded-full border transition-all whitespace-nowrap ${
                                active
                                    ? 'bg-slate-700 text-white border-slate-700'
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                            } ${disabled ? 'opacity-35 cursor-not-allowed' : ''}`}
                            title={disabled ? overlayLimitText : t.name}
                        >
                            {t.name}
                        </button>
                    );
                })}
            </div>
            
            <div ref={containerRef} className="flex-1 bg-white rounded-xl border border-slate-200 relative overflow-hidden shadow-inner min-h-0">
                <canvas 
                    ref={canvasRef} 
                    width={canvasSize.w} 
                    height={canvasSize.h} 
                    className={`w-full h-full ${cursorClass}`} 
                    onMouseDown={handleMouseDown} 
                    onMouseMove={handleMouseMove} 
                    onMouseUp={handleMouseUp}
                    onContextMenu={e => e.preventDefault()} 
                />
                <div className="absolute top-1.5 left-1.5 bg-white/90 backdrop-blur border border-slate-200 px-2 py-1 rounded text-[10px] font-black text-slate-600 flex gap-2 pointer-events-none shadow-sm">
                    <span>{text.time}: {playHeadPos.toFixed(3)}s</span>
                    <span className="text-amber-600">{text.pitch}: {Math.round(getCurrentValue('pitch'))}Hz</span>
                    <span className="text-pink-500">{text.gender}: x{Number(getCurrentValue('gender')).toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
};

export default TimelineEditor;
