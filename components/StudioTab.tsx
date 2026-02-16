
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Undo2, Redo2, Scissors, Copy, Layers, TrendingUp, TrendingDown, 
  MoveHorizontal, Zap, Sparkles, Activity, Square, Play, Pause, Save, ScanLine, AudioLines, MousePointer2, FilePlus, Download, Power
} from 'lucide-react';
import { AudioFile, KeyframePoint, FormantParams, EQBand } from '../types';
import { AudioUtils, RULER_HEIGHT } from '../utils/audioUtils';
import ParametricEQ from './ParametricEQ';
import FormantPad from './FormantPad';

interface StudioTabProps {
  audioContext: AudioContext;
  activeFile: AudioFile | undefined;
  files: AudioFile[];
  onUpdateFile: (buffer: AudioBuffer) => void;
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
  setActiveFileId: (id: string) => void;
  isActive: boolean;
}

interface UndoState {
    buffer: AudioBuffer;
    label: string;
}

const StudioTab: React.FC<StudioTabProps> = ({ audioContext, activeFile, files, onUpdateFile, onAddToRack, setActiveFileId, isActive }) => {
    const [editTrim, setEditTrim] = useState({ start: 0, end: 1 });
    const [isPlaying, setIsPlaying] = useState(false);
    const [playheadMode, setPlayheadMode] = useState<'all' | 'selection'>('all');
    const [isPaused, setIsPaused] = useState(false);
    const [playheadPos, setPlayheadPos] = useState(0); 
    const [dragTarget, setDragTarget] = useState<string | null>(null);
    const [showAutomation, setShowAutomation] = useState(false);
    const [volumeKeyframes, setVolumeKeyframes] = useState<KeyframePoint[]>([{t:0, v:1}, {t:1, v:1}]);
    
    const [sideTab, setSideTab] = useState<'effects' | 'formant' | 'formantFilter'>('effects');
    const [undoStack, setUndoStack] = useState<UndoState[]>([]);
    const [redoStack, setRedoStack] = useState<UndoState[]>([]);
    
    // Params
    const [track2Id, setTrack2Id] = useState("");
    const [mergeOffset, setMergeOffset] = useState(0);
    const [pitchCents, setPitchCents] = useState(0);
    const [genderShift, setGenderShift] = useState(1.0);
    const [masterGain, setMasterGain] = useState(1.0);
    const [bypassEffects, setBypassEffects] = useState(false);
    const [formant, setFormant] = useState<FormantParams>({ f1: 500, f2: 1500, f3: 2500, f4: 3500, resonance: 4.0 });
    
    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 60, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'lowshelf', freq: 100, gain: 0, q: 0.7, on: true },
        { id: 3, type: 'peaking', freq: 1000, gain: 0, q: 1.0, on: true },
        { id: 4, type: 'highshelf', freq: 5000, gain: 0, q: 0.7, on: true },
        { id: 5, type: 'lowpass', freq: 18000, gain: 0, q: 0.7, on: true }
    ]);
    
    const [singerFormantGain, setSingerFormantGain] = useState(0);
    const [compThresh, setCompThresh] = useState(-24);
    const [delayTime, setDelayTime] = useState(0);
    const [delayFeedback, setDelayFeedback] = useState(0.3);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);
    const animationRef = useRef<number | null>(null);
    const activeBuffer = useMemo(() => activeFile ? activeFile.buffer : null, [activeFile]);

    const pushUndo = useCallback((label: string = "편집") => { 
        if (activeBuffer) {
            setUndoStack(prev => [...prev.slice(-19), { buffer: activeBuffer, label }]); 
            setRedoStack([]);
        }
    }, [activeBuffer]);

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

    const handleFade = async (type: 'in' | 'out') => {
        if (!activeBuffer) return;
        pushUndo(`Fade ${type === 'in' ? 'In' : 'Out'}`);
        const newBuf = await AudioUtils.applyFade(audioContext, activeBuffer, type, editTrim.start, editTrim.end);
        if (newBuf) onUpdateFile(newBuf);
    };

    const handleSaveSelection = useCallback(() => {
        if (!activeBuffer || !activeFile) return;
        const slice = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end);
        if (slice) {
            onAddToRack(slice, `${activeFile.name}_slice`);
        }
    }, [activeBuffer, activeFile, audioContext, editTrim, onAddToRack]);

    const handleCutSelection = useCallback(() => {
        if (!activeBuffer) return;
        pushUndo("잘라내기");
        const newBuf = AudioUtils.deleteRange(audioContext, activeBuffer, editTrim.start, editTrim.end);
        if (newBuf) {
            onUpdateFile(newBuf);
            setEditTrim({ start: 0, end: 1 });
        }
    }, [activeBuffer, audioContext, editTrim, onUpdateFile, pushUndo]);

    const stopPlayback = useCallback(() => {
        if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} sourceRef.current = null; }
        setIsPlaying(false);
        if(animationRef.current) cancelAnimationFrame(animationRef.current);
    }, []);

    const handleStop = useCallback(() => {
        stopPlayback();
        setIsPaused(false); setPlayheadPos(0); pauseOffsetRef.current = 0;
    }, [stopPlayback]);

    const updatePlayhead = useCallback(() => {
        if (!isPlaying || !activeBuffer) return;
        const elapsed = audioContext.currentTime - startTimeRef.current;
        let currentPos = 0;
        if (playheadMode === 'all') {
            currentPos = ((elapsed / activeBuffer.duration) * 100);
        } else {
            const selDur = activeBuffer.duration * (editTrim.end - editTrim.start);
            const relPct = selDur > 0 ? elapsed / selDur : 0;
            currentPos = (editTrim.start + relPct * (editTrim.end - editTrim.start)) * 100;
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

    const renderStudioAudio = useCallback(async (buf: AudioBuffer) => {
        if(!buf || !audioContext) return null;
        const t2Buf = files.find(f => f.id === track2Id)?.buffer;
        const t1Dur = buf.duration;
        const offSec = mergeOffset / 1000;
        const totalDur = t2Buf ? Math.max(t1Dur, offSec + t2Buf.duration) : t1Dur;
        const renderDur = totalDur + (delayTime > 0 ? 2 : 0);
        const offline = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(renderDur * buf.sampleRate), buf.sampleRate);
        const finalOutput = offline.createGain(); finalOutput.gain.value = masterGain;

        let currentNode: AudioNode = offline.createGain(); 
        const inputNode = currentNode;

        if (!bypassEffects) {
            eqBands.forEach(b => {
                if(b.on) {
                    const f = offline.createBiquadFilter();
                    f.type = b.type;
                    f.frequency.value = b.freq;
                    f.Q.value = b.q;
                    f.gain.value = b.gain;
                    currentNode.connect(f);
                    currentNode = f;
                }
            });

            const fShift = offline.createBiquadFilter(); fShift.type = 'peaking'; fShift.frequency.value = 1000 * genderShift; fShift.gain.value = 6;
            const fNodes = [formant.f1, formant.f2, formant.f3, formant.f4].map((freq, idx) => {
                const f = offline.createBiquadFilter(); f.type = 'peaking'; f.frequency.value = freq; f.Q.value = formant.resonance; f.gain.value = 12 - (idx * 2);
                return f;
            });
            
            const singerF = offline.createBiquadFilter(); singerF.type = 'peaking'; singerF.frequency.value = 3000; singerF.Q.value = 1.5; singerF.gain.value = singerFormantGain;
            const compressor = offline.createDynamicsCompressor(); compressor.threshold.value = compThresh;

            currentNode.connect(fShift);
            let lastFNode = fShift;
            fNodes.forEach(fn => { lastFNode.connect(fn); lastFNode = fn; });
            lastFNode.connect(singerF); singerF.connect(compressor);
            
            let effectOut: AudioNode = compressor;
            if (delayTime > 0) {
                const delay = offline.createDelay(); delay.delayTime.value = delayTime;
                const fb = offline.createGain(); fb.gain.value = delayFeedback;
                effectOut.connect(delay); delay.connect(fb); fb.connect(delay);
                delay.connect(finalOutput); effectOut.connect(finalOutput); 
            } else {
                effectOut.connect(finalOutput);
            }
        } else {
            currentNode.connect(finalOutput);
        }

        const s1 = offline.createBufferSource(); s1.buffer = buf;
        if (!bypassEffects && pitchCents !== 0) s1.playbackRate.value = Math.pow(2, pitchCents/1200);

        const autoGain = offline.createGain();
        if (volumeKeyframes.length > 0) {
            autoGain.gain.setValueAtTime(volumeKeyframes[0].v, 0);
            volumeKeyframes.forEach(p => autoGain.gain.linearRampToValueAtTime(p.v, p.t * buf.duration));
        }
        
        s1.connect(autoGain); autoGain.connect(inputNode); s1.start(0);

        if (t2Buf) {
            const s2 = offline.createBufferSource(); s2.buffer = t2Buf;
            const g2 = offline.createGain(); g2.gain.value = 0.5;
            s2.connect(g2); 
            if (!bypassEffects) g2.connect(currentNode); // Connect to start of effects chain
            else g2.connect(finalOutput);
            s2.start(Math.max(0, offSec));
        }

        finalOutput.connect(offline.destination);
        return await offline.startRendering();
    }, [audioContext, track2Id, mergeOffset, pitchCents, genderShift, masterGain, bypassEffects, formant, eqBands, singerFormantGain, compThresh, delayTime, delayFeedback, volumeKeyframes, files]);

    const togglePlay = useCallback(async (mode: 'all' | 'selection') => {
        if (isPlaying) { handleStop(); return; }
        if (!activeBuffer) return;
        const rendered = await renderStudioAudio(activeBuffer);
        if (!rendered) return;

        const s = audioContext.createBufferSource();
        s.buffer = rendered;
        s.connect(audioContext.destination);

        let startOffset = 0;
        let dur = rendered.duration;

        if (mode === 'selection') {
            startOffset = editTrim.start * activeBuffer.duration;
            dur = (editTrim.end - editTrim.start) * activeBuffer.duration;
            if (isPaused) pauseOffsetRef.current = 0;
        } else if (isPaused) {
            startOffset = pauseOffsetRef.current;
        }

        s.start(0, startOffset, mode === 'selection' ? dur : undefined);
        sourceRef.current = s;
        startTimeRef.current = audioContext.currentTime - startOffset;
        setIsPlaying(true);
        setPlayheadMode(mode);
        s.onended = () => { setIsPlaying(false); if(mode === 'all') setPlayheadPos(0); };
    }, [isPlaying, activeBuffer, renderStudioAudio, audioContext, editTrim, isPaused, handleStop]);

    const handleDownloadResult = async () => {
        if (!activeBuffer) return;
        const rendered = await renderStudioAudio(activeBuffer);
        if (rendered) {
            const name = activeFile ? `${activeFile.name}_render.wav` : "otonashi_render.wav";
            AudioUtils.downloadWav(rendered, name);
        }
    };

    useEffect(() => {
        if (!isActive) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.code === 'Space') { e.preventDefault(); togglePlay('all'); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, togglePlay]);

    useEffect(() => {
        if (!canvasRef.current || !activeBuffer) return;
        const ctx = canvasRef.current.getContext('2d', { alpha: false });
        if (!ctx) return;
        const { width: w, height: h } = canvasRef.current;

        ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, w, RULER_HEIGHT);

        const dur = activeBuffer.duration;
        ctx.beginPath(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.font = '10px Inter'; ctx.fillStyle = '#64748b';
        let tickInterval = dur > 60 ? 10 : (dur > 30 ? 5 : 1);
        for (let t = 0; t <= dur; t += tickInterval) {
            const x = (t / dur) * w;
            ctx.moveTo(x, 0); ctx.lineTo(x, RULER_HEIGHT); ctx.fillText(t + 's', x + 2, RULER_HEIGHT - 6);
        }
        ctx.stroke();

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

        const sX = editTrim.start * w, eX = editTrim.end * w;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(sX, RULER_HEIGHT, eX - sX, waveH);
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
        ctx.strokeRect(sX, RULER_HEIGHT, eX - sX, waveH);

        if (playheadPos >= 0) {
            const px = (playheadPos / 100) * w;
            ctx.beginPath(); ctx.fillStyle = '#ef4444'; ctx.moveTo(px - 6, 0); ctx.lineTo(px + 6, 0); ctx.lineTo(px, RULER_HEIGHT - 5); ctx.fill();
            ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
        }

        if (showAutomation) {
            ctx.beginPath(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2;
            volumeKeyframes.forEach((p, i) => { const x = p.t * w, y = yOffset + (1 - p.v) * waveH; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
            ctx.stroke();
            volumeKeyframes.forEach(p => { const x = p.t * w, y = yOffset + (1 - p.v) * waveH; ctx.beginPath(); ctx.fillStyle = '#fbbf24'; ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); });
        }
    }, [activeBuffer, editTrim, playheadPos, showAutomation, volumeKeyframes]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!canvasRef.current || !activeBuffer) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const xPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (e.clientY - rect.top < RULER_HEIGHT) {
            if (isPlaying) stopPlayback(); setIsPaused(true);
            setPlayheadPos(xPct * 100); pauseOffsetRef.current = xPct * activeBuffer.duration; setDragTarget('playhead');
        } else if (!showAutomation) {
            setEditTrim({ start: xPct, end: xPct }); setDragTarget('selection');
        }
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragTarget || !canvasRef.current || !activeBuffer) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const xPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (dragTarget === 'playhead') { setPlayheadPos(xPct * 100); pauseOffsetRef.current = xPct * activeBuffer.duration; }
        else if (dragTarget === 'selection') setEditTrim(prev => ({ ...prev, end: xPct }));
    };

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    return (
        <div className="flex flex-col p-6 gap-6 animate-in fade-in font-sans font-bold" onMouseUp={() => setDragTarget(null)}>
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 flex-shrink-0">
                    <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                        <div className="flex bg-slate-100 p-1 rounded-lg gap-1 border border-slate-200 shadow-sm">
                            <button onClick={handleUndo} disabled={undoStack.length===0} className="p-1.5 hover:bg-white rounded text-slate-900 disabled:opacity-30" title="실행 취소"><Undo2 size={16}/></button>
                            <button onClick={handleRedo} disabled={undoStack.length===0} className="p-1.5 hover:bg-white rounded text-slate-900 disabled:opacity-30" title="다시 실행"><Redo2 size={16}/></button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button onClick={()=>setEditTrim({start:0, end:1})} className="p-1.5 hover:bg-white rounded text-slate-900" title="전체 선택"><ScanLine size={16}/></button>
                            <button onClick={handleCutSelection} className="p-1.5 hover:bg-red-500 hover:text-white rounded text-red-500 transition-colors" title="선택 영역 잘라내기"><Scissors size={18}/></button>
                        </div>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <button onClick={()=>setShowAutomation(!showAutomation)} className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-2 border transition-all ${showAutomation ? 'bg-amber-100 text-slate-900 border-amber-300 shadow-inner' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}><Zap size={14}/> 오토메이션</button>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <div className="flex bg-slate-100 border border-slate-200 p-1 rounded-lg gap-1 shadow-sm font-black">
                            <button onClick={() => togglePlay('all')} className={`px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 transition-all ${isPlaying && playheadMode==='all' ? 'bg-white shadow text-slate-900' : 'hover:bg-white text-slate-600'}`}>{isPlaying && playheadMode==='all' ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>} 전체 재생</button>
                            <button onClick={() => togglePlay('selection')} className={`px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 transition-all ${isPlaying && playheadMode==='selection' ? 'bg-white shadow text-slate-900' : 'hover:bg-white text-slate-600'}`}>{isPlaying && playheadMode==='selection' ? <Pause size={14} fill="currentColor"/> : <ScanLine size={14}/>} 선택 재생</button>
                            <button onClick={handleStop} className="px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 hover:bg-white text-red-500 transition-colors font-black"><Square size={14} fill="currentColor"/> 정지</button>
                        </div>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <div className="bg-slate-800 text-green-400 font-mono text-sm px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner min-w-[100px] flex justify-center tracking-widest font-black">
                            {formatTime((playheadPos / 100) * (activeBuffer?.duration || 0))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                         <button onClick={handleSaveSelection} className="px-4 py-2.5 bg-white border border-slate-300 text-slate-900 hover:bg-blue-50 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-sm" title="선택 영역을 보관함에 새 파일로 저장"><FilePlus size={16}/> 선택 영역 보관</button>
                         <button onClick={handleDownloadResult} className="px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all"><Download size={16}/> WAV 다운로드</button>
                         <button onClick={async ()=>{ if(activeBuffer) { const res = await renderStudioAudio(activeBuffer); if(res) onAddToRack(res, "Result_Mix"); } }} className="px-5 py-2.5 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg active:scale-95 transition-all"><Save size={16}/> 보관함 저장</button>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-inner overflow-hidden select-none h-[500px] relative">
                         <canvas ref={canvasRef} width={1200} height={500} className={`w-full h-full object-cover transition-opacity duration-300 ${showAutomation ? 'cursor-crosshair opacity-90' : 'cursor-text'}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onContextMenu={e=>e.preventDefault()} />
                         {!activeBuffer && (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-black uppercase tracking-widest bg-slate-900/50 backdrop-blur-sm">
                                보관함에서 파일을 선택하세요
                            </div>
                         )}
                    </div>

                    <div className="flex gap-6 flex-col lg:flex-row">
                        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 relative flex flex-col shadow-inner h-[320px] overflow-hidden">
                            <div className="flex-1 min-h-0 relative z-0">
                                <ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={sourceRef.current} />
                            </div>
                        </div>

                        <div className="w-full lg:w-[420px] bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shrink-0 shadow-sm h-[320px]">
                            <div className="flex border-b border-slate-200 bg-slate-50/50">
                                {['effects', 'formant', 'formantFilter'].map((t) => (
                                    <button key={t} onClick={()=>setSideTab(t as any)} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-tight transition-all ${sideTab===t?'bg-white text-slate-900 border-b-2 border-indigo-500 shadow-sm font-black':'text-slate-500 hover:bg-slate-50'}`}>{t}</button>
                                ))}
                            </div>
                            <div className="p-5 flex-1 overflow-y-auto custom-scrollbar space-y-6">
                                {sideTab === 'effects' && (
                                    <div className="space-y-6 animate-in fade-in font-black">
                                        <div className="space-y-3">
                                            <h3 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest"><MoveHorizontal size={14}/> Fades</h3>
                                            <div className="flex gap-2 font-black">
                                                 <button onClick={()=>handleFade('in')} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-black text-slate-700 flex items-center justify-center gap-2 transition-all shadow-sm"><TrendingUp size={14}/> Fade In</button>
                                                 <button onClick={()=>handleFade('out')} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-black text-slate-700 flex items-center justify-center gap-2 transition-all shadow-sm"><TrendingDown size={14}/> Fade Out</button>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest"><Sparkles size={14}/> Delay</h3>
                                                <span className="text-[10px] font-mono text-indigo-600">{delayTime.toFixed(2)}s</span>
                                            </div>
                                            <input type="range" min="0" max="1" step="0.05" value={delayTime} onChange={e=>setDelayTime(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                        </div>
                                    </div>
                                )}
                                {sideTab === 'formant' && (
                                    <div className="space-y-5 animate-in fade-in">
                                        {[formant.f1, formant.f2, formant.f3, formant.f4].map((f, i) => (
                                            <div key={i} className="flex flex-col gap-1.5">
                                                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase">
                                                    <span>Formant {i+1}</span>
                                                    <span className="text-slate-900 font-mono font-black">{Math.round(f)}Hz</span>
                                                </div>
                                                <input type="range" min="200" max="5000" value={f} onChange={e => {
                                                    const n = [formant.f1, formant.f2, formant.f3, formant.f4];
                                                    n[i] = Number(e.target.value);
                                                    setFormant({ ...formant, f1: n[0], f2: n[1], f3: n[2], f4: n[3] });
                                                }} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-cyan-500" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {sideTab === 'formantFilter' && (
                                    <div className="space-y-4 animate-in fade-in">
                                        <FormantPad formant={formant} onChange={setFormant}/>
                                    </div>
                                )}
                            </div>
                            {/* Master Controls Section */}
                            <div className="p-5 border-t border-slate-200 bg-slate-50/50 space-y-4">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity size={14}/> Master Output</h3>
                                <div className="flex items-center justify-between gap-4">
                                    <button 
                                        onClick={() => setBypassEffects(!bypassEffects)}
                                        className={`flex-1 py-2 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${bypassEffects ? 'bg-purple-600 text-white border-purple-400 shadow-lg' : 'bg-white text-slate-400 border-slate-200'}`}
                                    >
                                        <Power size={14} className={bypassEffects ? "animate-pulse" : ""}/>
                                        <span className="text-xs font-black uppercase tracking-tight">Effects Bypass</span>
                                    </button>
                                    <div className="flex-[1.5] space-y-1">
                                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                                            <span>Gain</span>
                                            <span className="text-indigo-600">{(masterGain * 100).toFixed(0)}%</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" max="2" step="0.01" 
                                            value={masterGain} 
                                            onChange={e => setMasterGain(Number(e.target.value))} 
                                            className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"
                                        />
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
