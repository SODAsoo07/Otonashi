
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Undo2, Redo2, Scissors, Copy, Clipboard, Layers, TrendingUp, TrendingDown, 
  Eraser, MoveHorizontal, Zap, LogIn, Upload, Sparkles, FlipHorizontal, 
  Activity, SlidersHorizontal, Music, Square, Play, Pause, History, Save, FilePlus, ScanLine, AudioLines, Mic2, MousePointer2
} from 'lucide-react';
import { AudioFile, KeyframePoint, FormantParams, EQParams, EQBand } from '../types';
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
    const [playMode, setPlayMode] = useState<'all' | 'selection'>('all');
    const [isPaused, setIsPaused] = useState(false);
    const [playheadPos, setPlayheadPos] = useState(0); 
    const [dragTarget, setDragTarget] = useState<string | null>(null);
    const [showAutomation, setShowAutomation] = useState(false);
    const [volumeKeyframes, setVolumeKeyframes] = useState<KeyframePoint[]>([{t:0, v:1}, {t:1, v:1}]);
    
    // Sidebar Tab State
    const [sideTab, setSideTab] = useState<'effects' | 'formant' | 'formantFilter'>('effects');

    // History Stacks
    const [undoStack, setUndoStack] = useState<UndoState[]>([]);
    const [redoStack, setRedoStack] = useState<UndoState[]>([]);
    
    // Params
    const [track2Id, setTrack2Id] = useState("");
    const [mergeOffset, setMergeOffset] = useState(0);
    const [pitchCents, setPitchCents] = useState(0);
    const [genderShift, setGenderShift] = useState(1.0);
    const [masterGain, setMasterGain] = useState(1.0);
    const [formant, setFormant] = useState<FormantParams>({ f1: 500, f2: 1500, f3: 2500, f4: 3500, resonance: 4.0 });
    
    // EQ Bands
    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 60, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'lowshelf', freq: 100, gain: 0, q: 0.7, on: true },
        { id: 3, type: 'peaking', freq: 1000, gain: 0, q: 1.0, on: true },
        { id: 4, type: 'highshelf', freq: 5000, gain: 0, q: 0.7, on: true },
        { id: 5, type: 'lowpass', freq: 18000, gain: 0, q: 0.7, on: true }
    ]);
    
    const [singerFormantGain, setSingerFormantGain] = useState(0);
    const [compThresh, setCompThresh] = useState(-24);
    const [reverbWet, setReverbWet] = useState(0);
    const [delayTime, setDelayTime] = useState(0);
    const [delayFeedback, setDelayFeedback] = useState(0.3);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);
    const animationRef = useRef<number | null>(null);
    const activeBuffer = activeFile ? activeFile.buffer : null;

    const pushUndo = useCallback((label: string = "편집") => { 
        if (activeBuffer) {
            setUndoStack(prev => [...prev.slice(-9), { buffer: activeBuffer, label }]); 
            setRedoStack([]);
        }
    }, [activeBuffer]);

    const handleUndo = useCallback(() => { 
        if (undoStack.length === 0 || !activeBuffer) return; 
        const prev = undoStack[undoStack.length - 1]; 
        setRedoStack(prevSt => [...prevSt.slice(-9), { buffer: activeBuffer, label: prev.label }]);
        setUndoStack(prevSt => prevSt.slice(0, -1)); 
        onUpdateFile(prev.buffer); 
    }, [undoStack, onUpdateFile, activeBuffer]);

    const handleRedo = useCallback(() => { 
        if (redoStack.length === 0 || !activeBuffer) return; 
        const next = redoStack[redoStack.length - 1]; 
        setUndoStack(prevSt => [...prevSt.slice(-9), { buffer: activeBuffer, label: next.label }]);
        setRedoStack(prevSt => prevSt.slice(0, -1)); 
        onUpdateFile(next.buffer); 
    }, [redoStack, onUpdateFile, activeBuffer]);

    const handleFade = async (type: 'in' | 'out') => {
        if (!activeBuffer) return;
        pushUndo(`Fade ${type === 'in' ? 'In' : 'Out'}`);
        const newBuf = await AudioUtils.applyFade(audioContext, activeBuffer, type, editTrim.start, editTrim.end);
        if (newBuf) onUpdateFile(newBuf);
    };

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
        if (playMode === 'all') {
            currentPos = ((elapsed / activeBuffer.duration) * 100);
        } else {
            const selDur = activeBuffer.duration * (editTrim.end - editTrim.start);
            const relPct = selDur > 0 ? elapsed / selDur : 0;
            currentPos = (editTrim.start + relPct * (editTrim.end - editTrim.start)) * 100;
        }
        
        if (currentPos >= 100 && playMode === 'all') currentPos = 100;

        setPlayheadPos(currentPos); 
        animationRef.current = requestAnimationFrame(updatePlayhead);
    }, [isPlaying, activeBuffer, audioContext, playMode, editTrim]);

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
        const renderDur = totalDur + (reverbWet > 0 ? 2 : 0) + (delayTime > 0 ? 2 : 0);
        const offline = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(renderDur * buf.sampleRate), buf.sampleRate);
        const finalOutput = offline.createGain(); finalOutput.gain.value = masterGain;

        let inputNode: AudioNode = offline.createGain(); 
        let currentNode = inputNode;
        
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
        const f1Node = offline.createBiquadFilter(); f1Node.type = 'peaking'; f1Node.frequency.value = formant.f1; f1Node.Q.value = formant.resonance; f1Node.gain.value = 12;
        const f2Node = offline.createBiquadFilter(); f2Node.type = 'peaking'; f2Node.frequency.value = formant.f2; f2Node.Q.value = formant.resonance; f2Node.gain.value = 10;
        const f3Node = offline.createBiquadFilter(); f3Node.type = 'peaking'; f3Node.frequency.value = formant.f3; f3Node.Q.value = formant.resonance; f3Node.gain.value = 8;
        const f4Node = offline.createBiquadFilter(); f4Node.type = 'peaking'; f4Node.frequency.value = formant.f4; f4Node.Q.value = formant.resonance; f4Node.gain.value = 6;
        
        const singerF = offline.createBiquadFilter(); singerF.type = 'peaking'; singerF.frequency.value = 3000; singerF.Q.value = 1.5; singerF.gain.value = singerFormantGain;
        const compressor = offline.createDynamicsCompressor(); compressor.threshold.value = compThresh;
        compressor.ratio.value = 12; compressor.attack.value = 0.003; compressor.release.value = 0.25;

        // Chain: EQ -> Gender -> Formants -> Singer -> Compressor
        currentNode.connect(fShift);
        fShift.connect(f1Node); f1Node.connect(f2Node); f2Node.connect(f3Node); f3Node.connect(f4Node);
        f4Node.connect(singerF); singerF.connect(compressor);
        
        // Reverb & Delay
        let effectOut: AudioNode = compressor;
        
        if (delayTime > 0) {
            const delay = offline.createDelay(); delay.delayTime.value = delayTime;
            const fb = offline.createGain(); fb.gain.value = delayFeedback;
            const delayWet = offline.createGain(); delayWet.gain.value = 0.5;
            
            effectOut.connect(delay); delay.connect(fb); fb.connect(delay);
            delay.connect(delayWet); delayWet.connect(finalOutput);
            effectOut.connect(finalOutput); // Dry signal
        } else {
            effectOut.connect(finalOutput);
        }

        const s1 = offline.createBufferSource(); s1.buffer = buf;
        if (pitchCents !== 0) s1.playbackRate.value = Math.pow(2, pitchCents/1200);

        const autoGain = offline.createGain();
        if (volumeKeyframes.length > 0) {
            autoGain.gain.setValueAtTime(volumeKeyframes[0].v, 0);
            volumeKeyframes.forEach(p => autoGain.gain.linearRampToValueAtTime(p.v, p.t * buf.duration));
        }
        
        s1.connect(autoGain);
        autoGain.connect(inputNode);
        s1.start(0);

        if (t2Buf) {
            const s2 = offline.createBufferSource(); s2.buffer = t2Buf;
            const g2 = offline.createGain(); g2.gain.value = 0.5;
            s2.connect(g2); g2.connect(compressor); 
            s2.start(Math.max(0, offSec));
        }

        finalOutput.connect(offline.destination);
        return await offline.startRendering();
    }, [audioContext, track2Id, mergeOffset, pitchCents, genderShift, masterGain, formant, eqBands, singerFormantGain, compThresh, reverbWet, delayTime, delayFeedback, volumeKeyframes, files]);

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
            if (isPaused) { pauseOffsetRef.current = 0; }
        } else {
             if (isPaused) startOffset = pauseOffsetRef.current;
        }

        s.start(0, startOffset, mode === 'selection' ? dur : undefined);
        sourceRef.current = s;
        startTimeRef.current = audioContext.currentTime - startOffset;
        setIsPlaying(true);
        setPlayMode(mode);
        s.onended = () => { setIsPlaying(false); if(mode === 'all') setPlayheadPos(0); };
    }, [isPlaying, activeBuffer, renderStudioAudio, audioContext, editTrim, isPaused, handleStop]);

    // Spacebar Listener
    useEffect(() => {
        if (!isActive) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay('all');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, togglePlay]);

    // Canvas Drawing
    useEffect(() => {
        if (!canvasRef.current || !activeBuffer) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const w = canvasRef.current.width;
        const h = canvasRef.current.height;

        ctx.clearRect(0, 0, w, h);
        
        ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, w, RULER_HEIGHT);
        ctx.fillStyle = '#1e293b'; ctx.fillRect(0, RULER_HEIGHT, w, h - RULER_HEIGHT);

        const dur = activeBuffer.duration;
        ctx.beginPath(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.font = '10px Inter'; ctx.fillStyle = '#64748b'; ctx.textAlign = 'left';
        let tickInterval = 1;
        if (dur > 10) tickInterval = 2; if (dur > 30) tickInterval = 5; if (dur > 60) tickInterval = 10; if (dur > 300) tickInterval = 30;
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
            let min = 1.0; let max = -1.0;
            for (let j = 0; j < step; j++) {
                const idx = (i * step) + j;
                if (idx < data.length) { const datum = data[idx]; if (datum < min) min = datum; if (datum > max) max = datum; }
            }
            ctx.moveTo(i, yOffset + (amp + min * amp)); ctx.lineTo(i, yOffset + (amp + max * amp));
        }
        ctx.stroke();

        // Selection with stronger visibility
        const sX = editTrim.start * w;
        const eX = editTrim.end * w;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; // More visible
        ctx.fillRect(sX, RULER_HEIGHT, eX - sX, waveH);
        ctx.strokeStyle = '#38bdf8'; // Cyan border
        ctx.lineWidth = 2;
        ctx.strokeRect(sX, RULER_HEIGHT, eX - sX, waveH);

        // Playhead
        if (playheadPos >= 0) {
            const px = (playheadPos / 100) * w;
            ctx.beginPath(); ctx.fillStyle = '#ef4444'; ctx.moveTo(px - 6, 0); ctx.lineTo(px + 6, 0); ctx.lineTo(px, RULER_HEIGHT - 5); ctx.fill();
            ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
        }

        if (showAutomation) {
            ctx.beginPath(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2;
            volumeKeyframes.forEach((p, i) => { const x = p.t * w; const y = yOffset + (1 - p.v) * waveH; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
            ctx.stroke();
            volumeKeyframes.forEach(p => { const x = p.t * w; const y = yOffset + (1 - p.v) * waveH; ctx.beginPath(); ctx.fillStyle = '#fbbf24'; ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); });
        }
    }, [activeBuffer, editTrim, playheadPos, showAutomation, volumeKeyframes]);

    // Mouse handlers remain same (omitted for brevity if not changed logic deeply, but must include for full file)
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!canvasRef.current || !activeBuffer) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const xPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const yRaw = e.clientY - rect.top;
        if (yRaw < RULER_HEIGHT) {
            if (isPlaying) { stopPlayback(); setIsPaused(true); }
            setPlayheadPos(xPct * 100); pauseOffsetRef.current = xPct * activeBuffer.duration; setDragTarget('playhead');
        } else {
             // Automation or Selection logic
             if(showAutomation) { /* ... */ } 
             else if (e.button === 0) { setEditTrim({ start: xPct, end: xPct }); setDragTarget('selection'); }
        }
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragTarget || !canvasRef.current || !activeBuffer) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const xPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (dragTarget === 'playhead') { setPlayheadPos(xPct * 100); pauseOffsetRef.current = xPct * activeBuffer.duration; }
        else if (dragTarget === 'selection') { setEditTrim(prev => ({ ...prev, end: xPct })); }
    };

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        const ms = Math.floor((sec % 1) * 1000);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    const FormantSlider = ({ label, val, min, max, onChange }: { label: string, val: number, min: number, max: number, onChange: (v: number) => void }) => (
        <div className="space-y-1">
            <div className="flex justify-between text-xs font-bold text-slate-600"><span>{label}</span><span className="text-cyan-600">{Math.round(val)} Hz</span></div>
            <div className="flex gap-2">
                <input type="range" min={min} max={max} step="10" value={val} onChange={e => onChange(Number(e.target.value))} className="flex-1 h-1.5 bg-slate-200 rounded-full appearance-none accent-cyan-500" />
                <input type="number" value={val} onChange={e => onChange(Number(e.target.value))} className="w-16 px-1 py-0.5 text-xs border rounded text-right font-mono" />
            </div>
        </div>
    );

    return (
        <div className="flex flex-col p-6 gap-6 animate-in fade-in font-sans font-bold" onMouseUp={() => setDragTarget(null)}>
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm font-sans font-bold">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 flex-shrink-0">
                    <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                        <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                            <button onClick={handleUndo} disabled={undoStack.length===0} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30"><Undo2 size={16}/></button>
                            <button onClick={handleRedo} disabled={redoStack.length===0} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30"><Redo2 size={16}/></button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button onClick={()=>setEditTrim({start:0, end:1})} className="p-1.5 hover:bg-white rounded text-slate-600"><ScanLine size={16}/></button>
                        </div>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <button onClick={()=>setShowAutomation(!showAutomation)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 ${showAutomation ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}><Zap size={14}/> 오토메이션</button>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <div className="flex bg-yellow-50 border border-yellow-200 p-1 rounded-lg gap-1">
                            <button onClick={() => togglePlay('all')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 ${isPlaying && playMode==='all' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-white text-slate-600'}`}>{isPlaying && playMode==='all' ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>} 전체 재생</button>
                            <button onClick={() => togglePlay('selection')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 ${isPlaying && playMode==='selection' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-white text-slate-600'}`}>{isPlaying && playMode==='selection' ? <Pause size={14} fill="currentColor"/> : <ScanLine size={14}/>} 선택 재생</button>
                            <button onClick={handleStop} className="px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 hover:bg-white text-red-500"><Square size={14} fill="currentColor"/> 정지</button>
                        </div>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <div className="bg-slate-800 text-green-400 font-mono text-sm px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner flex items-center min-w-[100px] justify-center tracking-widest">
                            {formatTime((playheadPos / 100) * (activeBuffer?.duration || 0))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                         <button onClick={async ()=>{ if(activeBuffer) { const res = await renderStudioAudio(activeBuffer); if(res) onAddToRack(res, "Result_Mix"); } }} className="px-4 py-2 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-lg text-xs font-bold flex items-center gap-2"><Save size={14}/> 결과물 저장</button>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="bg-slate-900 rounded-2xl relative border border-slate-700 shadow-inner overflow-hidden select-none h-[500px]">
                         <canvas ref={canvasRef} width={1000} height={500} className={`w-full h-full object-cover ${showAutomation ? 'cursor-crosshair' : 'cursor-text'}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onContextMenu={e=>e.preventDefault()} />
                    </div>

                    <div className="flex gap-6 flex-col lg:flex-row">
                        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 relative flex flex-col shadow-inner h-[320px] overflow-hidden">
                            <div className="flex-1 min-h-0 relative z-0">
                                <ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={sourceRef.current} activeBuffer={activeBuffer} currentTime={(playheadPos/100)*(activeBuffer?.duration||0)} />
                            </div>
                            <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center px-4 py-2 pointer-events-none">
                                <div className="bg-black/40 backdrop-blur rounded px-2 py-1 flex flex-col">
                                    <span className="text-[9px] text-slate-400 uppercase font-bold">Current</span>
                                    <span className="text-xs text-cyan-400 font-mono">{formatTime((playheadPos/100)*(activeBuffer?.duration||0))}</span>
                                </div>
                                <div className="bg-black/40 backdrop-blur rounded px-2 py-1 flex flex-col">
                                    <span className="text-[9px] text-slate-400 uppercase font-bold">Selection</span>
                                    <span className="text-xs text-emerald-400 font-mono">{(editTrim.end - editTrim.start).toFixed(3)}s</span>
                                </div>
                                <div className="bg-black/40 backdrop-blur rounded px-2 py-1">
                                    <span className="text-xs text-amber-400 font-bold uppercase">{showAutomation ? 'AUTO' : 'EDIT'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="w-full lg:w-[420px] bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shrink-0 shadow-sm h-[320px]">
                            <div className="flex border-b border-slate-200">
                                <button onClick={()=>setSideTab('effects')} className={`flex-1 py-3 text-xs font-bold uppercase transition-all ${sideTab==='effects'?'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-500':'text-slate-500 hover:bg-slate-50'}`}>Effects</button>
                                <button onClick={()=>setSideTab('formant')} className={`flex-1 py-3 text-xs font-bold uppercase transition-all ${sideTab==='formant'?'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-500':'text-slate-500 hover:bg-slate-50'}`}>Formant</button>
                                <button onClick={()=>setSideTab('formantFilter')} className={`flex-1 py-3 text-xs font-bold uppercase transition-all ${sideTab==='formantFilter'?'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-500':'text-slate-500 hover:bg-slate-50'}`}>Formant Filter</button>
                            </div>
                            <div className="p-5 flex-1 overflow-y-auto custom-scrollbar space-y-6">
                                {sideTab === 'effects' && (
                                    <div className="space-y-6 animate-in fade-in">
                                        <div className="space-y-3">
                                            <h3 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2"><MoveHorizontal size={14}/> Fades</h3>
                                            <div className="flex gap-2">
                                                 <button onClick={()=>handleFade('in')} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold text-slate-600 flex items-center justify-center gap-2"><TrendingUp size={14}/> Fade In</button>
                                                 <button onClick={()=>handleFade('out')} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold text-slate-600 flex items-center justify-center gap-2"><TrendingDown size={14}/> Fade Out</button>
                                            </div>
                                        </div>
                                        <div className="h-px bg-slate-100"></div>
                                        <div className="space-y-3">
                                            <h3 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2"><Sparkles size={14}/> Delay & Reverb</h3>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-slate-600"><span>Delay Time</span><span>{delayTime.toFixed(2)}s</span></div>
                                                <input type="range" min="0" max="1.0" step="0.05" value={delayTime} onChange={e=>setDelayTime(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-slate-600"><span>Reverb Wet</span><span>{Math.round(reverbWet*100)}%</span></div>
                                                <input type="range" min="0" max="1.0" step="0.05" value={reverbWet} onChange={e=>setReverbWet(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-purple-500"/>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {sideTab === 'formant' && (
                                    <div className="space-y-5 animate-in fade-in">
                                        <div className="space-y-4">
                                            <FormantSlider label="Formant 1 (F1)" val={formant.f1} min={200} max={1200} onChange={v => setFormant({...formant, f1: v})} />
                                            <FormantSlider label="Formant 2 (F2)" val={formant.f2} min={500} max={3000} onChange={v => setFormant({...formant, f2: v})} />
                                            <FormantSlider label="Formant 3 (F3)" val={formant.f3} min={1500} max={4000} onChange={v => setFormant({...formant, f3: v})} />
                                            <FormantSlider label="Formant 4 (F4)" val={formant.f4} min={2500} max={5000} onChange={v => setFormant({...formant, f4: v})} />
                                        </div>
                                        <div className="h-px bg-slate-100"></div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Resonance (Q)</span><span>{formant.resonance}</span></div>
                                            <input type="range" min="0.1" max="10" step="0.1" value={formant.resonance} onChange={e => setFormant({...formant, resonance: Number(e.target.value)})} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-cyan-500"/>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Singer's Formant</span><span>{singerFormantGain} dB</span></div>
                                            <input type="range" min="0" max="12" step="0.5" value={singerFormantGain} onChange={e=>setSingerFormantGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-amber-500"/>
                                        </div>
                                    </div>
                                )}
                                {sideTab === 'formantFilter' && (
                                    <div className="space-y-4 animate-in fade-in">
                                        <FormantPad formant={formant} onChange={setFormant}/>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudioTab;
