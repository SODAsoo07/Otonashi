
import React, { useRef, useEffect, useState } from 'react';
import { PencilLine, Eye, EyeOff, GitCommit, Spline } from 'lucide-react';
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
}

const TimelineEditor: React.FC<TimelineEditorProps> = ({
    advTracks, setAdvTracks, selectedTrackId, setSelectedTrackId,
    playHeadPos, setPlayheadPos, syncVisualsToTime, handleSimulationPlay, isAdvPlaying,
    commitChange, isEditMode, setIsEditMode, showGhost, setShowGhost, ghostTracks,
    showSpectrogram, spectrogramCanvas, previewBuffer, getCurrentValue, getValueAtTime,
    simPauseOffsetRef, advDuration
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [draggingKeyframe, setDraggingKeyframe] = useState<{trackId?: string, index?: number, isPlayhead?: boolean} | null>(null);
    const [hoveredKeyframe, setHoveredKeyframe] = useState<{trackId: string, index: number} | null>(null);
    const [canvasSize, setCanvasSize] = useState({ w: 1000, h: 200 });

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
        if(!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); 
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const t = Math.max(0, Math.min(1, x / rect.width));
        
        if (y < RULER_HEIGHT + 3 && !isEditMode) {
            setPlayheadPos(t); syncVisualsToTime(t);
            simPauseOffsetRef.current = t * advDuration; 
            if(isAdvPlaying) handleSimulationPlay();
            setDraggingKeyframe({ isPlayhead: true });
            return;
        }
        if (isEditMode) {
            const track = advTracks.find(tr => tr.id === selectedTrackId);
            if (track) {
                const graphH = rect.height - RULER_HEIGHT;
                const hitIdx = track.points.findIndex(p => Math.hypot((p.t * rect.width)-x, (RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * graphH)-y) < 15);
                if (e.button === 2) { 
                    e.preventDefault(); 
                    if(hitIdx !== -1 && track.points.length > 2) { 
                        setAdvTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, points: t.points.filter((_, i) => i !== hitIdx) } : t)); 
                        commitChange("포인트 삭제"); 
                    } 
                    return; 
                }
                if (hitIdx !== -1) { setDraggingKeyframe({ trackId: selectedTrackId, index: hitIdx }); return; }
                if (y >= RULER_HEIGHT) {
                    const val = track.min + ((1 - ((y - RULER_HEIGHT) / graphH)) * (track.max - track.min)); 
                    const nPts = [...track.points, { t, v: val }].sort((a, b) => a.t - b.t); 
                    setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: nPts } : tr));
                    setDraggingKeyframe({ trackId: selectedTrackId, index: nPts.findIndex(p => p.t === t) }); 
                    commitChange("포인트 추가"); 
                }
            }
        } else {
            setPlayheadPos(t); syncVisualsToTime(t);
            simPauseOffsetRef.current = t * advDuration; 
            if(isAdvPlaying) handleSimulationPlay();
            setDraggingKeyframe({ isPlayhead: true });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if(!draggingKeyframe || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); 
        const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (draggingKeyframe.isPlayhead) { 
            setPlayheadPos(t); 
            syncVisualsToTime(t); 
        } 
        else if (draggingKeyframe.trackId && draggingKeyframe.index !== undefined) { 
            const gH = rect.height - RULER_HEIGHT; 
            const nV = Math.max(0, Math.min(1, 1 - (((e.clientY - rect.top) - RULER_HEIGHT) / gH))); 
            setAdvTracks(prev => prev.map(tr => {
                if (tr.id !== draggingKeyframe.trackId) return tr;
                const valActual = tr.min + nV * (tr.max - tr.min);
                return { ...tr, points: tr.points.map((p, i) => i === draggingKeyframe.index ? { t, v: valActual } : p).sort((a,b)=>a.t-b.t) }; 
            }));
        }
    };

    const handleMouseUp = () => { 
        if(draggingKeyframe) commitChange("편집 완료"); 
        setDraggingKeyframe(null); 
    };

    // Canvas Drawing Logic
    useEffect(() => {
        if(!canvasRef.current) return; 
        const ctx = canvasRef.current.getContext('2d'); 
        if(!ctx) return; 
        const { w, h } = canvasSize;
        const track = advTracks.find(t => t.id === selectedTrackId);
        
        ctx.clearRect(0, 0, w, h); 
        ctx.fillStyle = '#f8f8f6'; 
        ctx.fillRect(0, RULER_HEIGHT, w, h - RULER_HEIGHT); 

        // Spectrogram
        if (showSpectrogram && spectrogramCanvas) {
            ctx.drawImage(spectrogramCanvas, 0, RULER_HEIGHT, w, h - RULER_HEIGHT);
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
            const waveH = h - RULER_HEIGHT; 
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
                         const y = RULER_HEIGHT + (1 - (v - ghost.min) / (ghost.max - ghost.min)) * (h - RULER_HEIGHT);
                         if(i===0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
                     }
                } else {
                     ghost.points.forEach((p, i) => { 
                        const x = p.t * w; 
                        const y = RULER_HEIGHT + (1 - (p.v - ghost.min) / (ghost.max - ghost.min)) * (h - RULER_HEIGHT); 
                        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); 
                    }); 
                }
                ctx.stroke();
                ctx.restore();
            }
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
                     const y = RULER_HEIGHT + (1 - (v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT);
                     if(i===0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
                 }
            } else {
                 track.points.forEach((p, i) => { 
                    const x = p.t * w; 
                    const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); 
                    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); 
                }); 
            }
            
            ctx.stroke(); 
            track.points.forEach((p, i) => { 
                const x = p.t * w; 
                const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); 
                ctx.fillStyle = (hoveredKeyframe?.index === i) ? '#1f1e1d' : track.color; 
                ctx.beginPath(); 
                ctx.arc(x, y, 6, 0, Math.PI*2); 
                ctx.fill(); 
            }); 
        }
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(playHeadPos * w, 0); ctx.lineTo(playHeadPos * w, h); ctx.stroke();
    }, [canvasSize, selectedTrackId, advTracks, playHeadPos, hoveredKeyframe, previewBuffer, getValueAtTime, showSpectrogram, showGhost, ghostTracks, spectrogramCanvas]);

    const currentTrack = advTracks.find(t => t.id === selectedTrackId);

    return (
        <div className="flex-1 min-h-[150px] bg-white/40 dynamic-radius border border-slate-300 p-2 shadow-sm relative shrink-0 flex flex-col">
            <div className="flex items-center justify-between gap-1.5 pb-1 px-1 shrink-0">
                <div className="flex gap-1.5 overflow-x-auto custom-scrollbar py-1 font-bold">
                    {advTracks.map(t => <button key={t.id} onClick={() => setSelectedTrackId(t.id)} className={`px-2.5 py-1 text-[10px] font-black border rounded-full transition-all whitespace-nowrap ${selectedTrackId === t.id ? 'dynamic-primary text-slate-900 font-black dynamic-primary-border shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}>{t.name}</button>)}
                </div>
                <div className="flex gap-1 shrink-0">
                    {ghostTracks && (
                        <button
                            onClick={() => setShowGhost(!showGhost)}
                            className={`px-2 py-1 text-[10px] font-black rounded-lg border transition-all flex items-center gap-1 ${showGhost ? 'bg-purple-50 border-purple-200 text-purple-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                            title="AI 가이드 트랙 보이기/숨기기"
                        >
                            {showGhost ? <Eye size={14} /> : <EyeOff size={14} />} Guide
                        </button>
                    )}
                    <button
                        onClick={() => {
                            setAdvTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, interpolation: t.interpolation === 'curve' ? 'linear' : 'curve' } : t));
                            commitChange("보간 모드 변경");
                        }}
                        className={`px-3 py-1 text-[10px] font-black rounded-lg border transition-all flex items-center gap-1 ${currentTrack?.interpolation === 'curve' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                    >
                        {currentTrack?.interpolation === 'curve' ? <Spline size={14} /> : <GitCommit size={14} />}
                        {currentTrack?.interpolation === 'curve' ? 'Curve' : 'Linear'}
                    </button>
                    <button onClick={() => setIsEditMode(!isEditMode)} className={`p-1.5 rounded-lg border transition-all shadow-sm ${isEditMode ? 'bg-amber-400 text-white border-amber-500' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`} title={isEditMode ? "키프레임 편집 중" : "플레이헤드 이동 모드"}><PencilLine size={16} /></button>
                </div>
            </div>
            
            <div ref={containerRef} className="flex-1 bg-white rounded-xl border border-slate-200 relative overflow-hidden shadow-inner min-h-0">
                <canvas 
                    ref={canvasRef} 
                    width={canvasSize.w} 
                    height={canvasSize.h} 
                    className={`w-full h-full ${isEditMode ? 'cursor-crosshair' : 'cursor-text'}`} 
                    onMouseDown={handleMouseDown} 
                    onMouseMove={handleMouseMove} 
                    onMouseUp={handleMouseUp}
                    onContextMenu={e => e.preventDefault()} 
                />
                <div className="absolute top-1.5 left-1.5 bg-white/90 backdrop-blur border border-slate-200 px-2 py-1 rounded text-[10px] font-black text-slate-600 flex gap-2 pointer-events-none shadow-sm">
                    <span>Time: {playHeadPos.toFixed(3)}s</span>
                    <span className="text-amber-600">Pitch: {Math.round(getCurrentValue('pitch'))}Hz</span>
                    <span className="text-pink-500">Gender: x{Number(getCurrentValue('gender')).toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
};

export default TimelineEditor;
