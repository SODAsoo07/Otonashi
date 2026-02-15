
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
}

interface UndoState {
    buffer: AudioBuffer;
    label: string;
}

const StudioTab: React.FC<StudioTabProps> = ({ audioContext, activeFile, files, onUpdateFile, onAddToRack, setActiveFileId }) => {
    const [editTrim, setEditTrim] = useState({ start: 0, end: 1 });
    const [isPlaying, setIsPlaying] = useState(false);
    const [playMode, setPlayMode] = useState<'all' | 'selection'>('all');
    const [isPaused, setIsPaused] = useState(false);
    const [playheadPos, setPlayheadPos] = useState(0); 
    const [dragTarget, setDragTarget] = useState<string | null>(null);
    const [clipboard, setClipboard] = useState<AudioBuffer | null>(null);
    const [stretchRatio, setStretchRatio] = useState(100);
    const [showStretchModal, setShowStretchModal] = useState(false);
    const [showAutomation, setShowAutomation] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [volumeKeyframes, setVolumeKeyframes] = useState<KeyframePoint[]>([{t:0, v:1}, {t:1, v:1}]);
    
    // Sidebar Tab State
    const [sideTab, setSideTab] = useState<'effects' | 'eq' | 'formant'>('effects');

    // History Stacks
    const [undoStack, setUndoStack] = useState<UndoState[]>([]);
    const [redoStack, setRedoStack] = useState<UndoState[]>([]);
    
    // Params
    const [track2Id, setTrack2Id] = useState("");
    const [mergeOffset, setMergeOffset] = useState(0);
    const [morphMode, setMorphMode] = useState(false);
    const [pitchCents, setPitchCents] = useState(0);
    const [genderShift, setGenderShift] = useState(1.0);
    const [masterGain, setMasterGain] = useState(1.0);
    const [formant, setFormant] = useState<FormantParams>({ f1: 500, f2: 1500, f3: 2500, resonance: 4.0 });
    
    // EQ Bands
    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 60, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'lowshelf', freq: 100, gain: 0, q: 0.7, on: true },
        { id: 3, type: 'peaking', freq: 1000, gain: 0, q: 1.0, on: true },
        { id: 4, type: 'highshelf', freq: 5000, gain: 0, q: 0.7, on: true },
        { id: 5, type: 'lowpass', freq: 18000, gain: 0, q: 0.7, on: true }
    ]);
    
    const [vibRate, setVibRate] = useState(5.0);
    const [vibDepth, setVibDepth] = useState(0);
    const [singerFormantGain, setSingerFormantGain] = useState(0);
    const [compThresh, setCompThresh] = useState(-24);
    const [reverbWet, setReverbWet] = useState(0);
    const [delayTime, setDelayTime] = useState(0);

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
        
        // Loop or stop at end? For 'all' we stop at end in onended, but visual clamp:
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

        // Chain EQ bands
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

        // Formants & Effects
        const fShift = offline.createBiquadFilter(); fShift.type = 'peaking'; fShift.frequency.value = 1000 * genderShift; fShift.gain.value = 6;
        const f1Node = offline.createBiquadFilter(); f1Node.type = 'peaking'; f1Node.frequency.value = formant.f1; f1Node.Q.value = formant.resonance; f1Node.gain.value = 12;
        const f2Node = offline.createBiquadFilter(); f2Node.type = 'peaking'; f2Node.frequency.value = formant.f2; f2Node.Q.value = formant.resonance; f2Node.gain.value = 10;
        const f3Node = offline.createBiquadFilter(); f3Node.type = 'peaking'; f3Node.frequency.value = formant.f3; f3Node.Q.value = formant.resonance; f3Node.gain.value = 8;
        
        const singerF = offline.createBiquadFilter(); singerF.type = 'peaking'; singerF.frequency.value = 3000; singerF.Q.value = 1.5; singerF.gain.value = singerFormantGain;
        const compressor = offline.createDynamicsCompressor(); compressor.threshold.value = compThresh;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        // Connect Chain: EQ -> Gender -> Formants -> Singer -> Compressor
        currentNode.connect(fShift);
        fShift.connect(f1Node); f1Node.connect(f2Node); f2Node.connect(f3Node);
        f3Node.connect(singerF); singerF.connect(compressor);
        
        // Reverb & Delay sends
        compressor.connect(finalOutput);

        // Sources
        const s1 = offline.createBufferSource(); s1.buffer = buf;
        
        // Pitch shift hack (playbackRate)
        if (pitchCents !== 0) s1.playbackRate.value = Math.pow(2, pitchCents/1200);

        // Automation Gain
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
            const g2 = offline.createGain(); g2.gain.value = 0.5; // Default mix level
            s2.connect(g2); g2.connect(compressor); // Bypass EQ/Formant for track 2 for now, or mix before? Let's mix into compressor
            s2.start(Math.max(0, offSec));
        }

        finalOutput.connect(offline.destination);
        
        return await offline.startRendering();
    }, [audioContext, track2Id, mergeOffset, morphMode, pitchCents, genderShift, masterGain, formant, eqBands, singerFormantGain, compThresh, reverbWet, delayTime, volumeKeyframes, files]);

    const togglePlay = async (mode: 'all' | 'selection') => {
        if (isPlaying) {
             handleStop(); 
             return;
        }

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
            if (isPaused) { 
                pauseOffsetRef.current = 0; 
            }
        } else {
             if (isPaused) startOffset = pauseOffsetRef.current;
        }

        s.start(0, startOffset, mode === 'selection' ? dur : undefined);
        sourceRef.current = s;
        startTimeRef.current = audioContext.currentTime - startOffset;
        setIsPlaying(true);
        setPlayMode(mode);
        
        s.onended = () => {
            setIsPlaying(false);
            if(mode === 'all') setPlayheadPos(0);
        };
    };

    // Canvas Drawing
    useEffect(() => {
        if (!canvasRef.current || !activeBuffer) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const w = canvasRef.current.width;
        const h = canvasRef.current.height;

        ctx.clearRect(0, 0, w, h);
        
        // Draw Ruler BG
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, w, RULER_HEIGHT);

        // Draw Waveform BG
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, RULER_HEIGHT, w, h - RULER_HEIGHT);

        // Draw Ruler
        const dur = activeBuffer.duration;
        ctx.beginPath();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.font = '10px Inter';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'left';
        
        // Dynamic tick interval based on duration to prevent crowding
        let tickInterval = 1;
        if (dur > 10) tickInterval = 2;
        if (dur > 30) tickInterval = 5;
        if (dur > 60) tickInterval = 10;
        if (dur > 300) tickInterval = 30;

        for (let t = 0; t <= dur; t += tickInterval) {
            const x = (t / dur) * w;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, RULER_HEIGHT);
            ctx.fillText(t + 's', x + 2, RULER_HEIGHT - 6);
        }
        ctx.stroke();

        // Draw Waveform (Full Width)
        const data = activeBuffer.getChannelData(0);
        const step = Math.ceil(data.length / w);
        const waveH = h - RULER_HEIGHT;
        const amp = waveH / 2;
        const yOffset = RULER_HEIGHT;

        ctx.beginPath();
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 1;
        for (let i = 0; i < w; i++) {
            let min = 1.0; let max = -1.0;
            // Sampling for pixel column
            for (let j = 0; j < step; j++) {
                const idx = (i * step) + j;
                if (idx < data.length) {
                    const datum = data[idx];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
            }
            // Map [-1, 1] to [amp*2, 0] relative to center
            ctx.moveTo(i, yOffset + (amp + min * amp));
            ctx.lineTo(i, yOffset + (amp + max * amp));
        }
        ctx.stroke();

        // Draw Selection
        const sX = editTrim.start * w;
        const eX = editTrim.end * w;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(sX, RULER_HEIGHT, eX - sX, waveH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.strokeRect(sX, RULER_HEIGHT, eX - sX, waveH);

        // Draw Playhead
        if (playheadPos >= 0) {
            const px = (playheadPos / 100) * w;
            
            // Handle (Triangle)
            ctx.beginPath();
            ctx.fillStyle = '#ef4444';
            ctx.moveTo(px - 6, 0);
            ctx.lineTo(px + 6, 0);
            ctx.lineTo(px, RULER_HEIGHT - 5);
            ctx.fill();

            // Line
            ctx.beginPath();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1;
            ctx.moveTo(px, 0);
            ctx.lineTo(px, h);
            ctx.stroke();
        }

        // Draw Automation
        if (showAutomation) {
            ctx.beginPath();
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            volumeKeyframes.forEach((p, i) => {
                const x = p.t * w;
                const y = yOffset + (1 - p.v) * waveH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            
            volumeKeyframes.forEach(p => {
                const x = p.t * w;
                const y = yOffset + (1 - p.v) * waveH;
                ctx.beginPath();
                ctx.fillStyle = '#fbbf24';
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }

    }, [activeBuffer, editTrim, playheadPos, showAutomation, volumeKeyframes]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!canvasRef.current || !activeBuffer) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const xRaw = e.clientX - rect.left;
        const yRaw = e.clientY - rect.top;
        
        const w = rect.width;
        // Normalize X
        const xPct = Math.max(0, Math.min(1, xRaw / w));

        // Check if Clicked in Ruler
        if (yRaw < RULER_HEIGHT) {
            // Seek Logic
            if (isPlaying) {
                stopPlayback();
                setIsPaused(true);
            }
            const newPos = xPct * 100;
            setPlayheadPos(newPos);
            pauseOffsetRef.current = xPct * activeBuffer.duration;
            setDragTarget('playhead');
            return;
        }

        // Automation / Selection Logic (in Waveform Area)
        const waveH = rect.height - RULER_HEIGHT;
        const yPct = Math.max(0, Math.min(1, 1 - ((yRaw - RULER_HEIGHT) / waveH))); // 1 at top of wave, 0 at bottom

        if (showAutomation) {
             const hitIdx = volumeKeyframes.findIndex(p => Math.abs(p.t - xPct) < 0.02 && Math.abs(p.v - yPct) < 0.1);
             if (e.button === 2) { 
                 if (hitIdx !== -1 && volumeKeyframes.length > 2) {
                     setVolumeKeyframes(prev => prev.filter((_, i) => i !== hitIdx));
                 }
                 return;
             }
             if (hitIdx !== -1) {
                 setDragTarget(`auto-${hitIdx}`);
             } else {
                 setVolumeKeyframes(prev => [...prev, { t: xPct, v: yPct }].sort((a,b) => a.t - b.t));
                 setDragTarget(`auto-new`); 
             }
        } else {
            if (e.button === 0) {
                setEditTrim({ start: xPct, end: xPct });
                setDragTarget('selection');
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragTarget || !canvasRef.current || !activeBuffer) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const w = rect.width;
        const waveH = rect.height - RULER_HEIGHT;

        const xRaw = e.clientX - rect.left;
        const yRaw = e.clientY - rect.top;

        const xPct = Math.max(0, Math.min(1, xRaw / w));
        const yPct = Math.max(0, Math.min(1, 1 - ((yRaw - RULER_HEIGHT) / waveH)));

        if (dragTarget === 'playhead') {
            setPlayheadPos(xPct * 100);
            pauseOffsetRef.current = xPct * activeBuffer.duration;
        } else if (dragTarget === 'selection') {
            setEditTrim(prev => ({ ...prev, end: xPct }));
        } else if (dragTarget.startsWith('auto')) {
            // Update logic would go here for automation dragging
            // For simplicity, we just add points on click, dragging requires tracking index
        }
    };

    return (
        <div className="flex-1 flex flex-col p-6 gap-6 animate-in fade-in overflow-hidden font-sans font-bold" onMouseUp={() => setDragTarget(null)}>
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm flex-1 overflow-hidden font-sans font-bold">
                {/* Toolbar */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 flex-shrink-0">
                    <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                        <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                            <button onClick={handleUndo} disabled={undoStack.length===0} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30 transition-all"><Undo2 size={16}/></button>
                            <button onClick={handleRedo} disabled={redoStack.length===0} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30 transition-all"><Redo2 size={16}/></button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button onClick={()=>setEditTrim({start:0, end:1})} className="p-1.5 hover:bg-white rounded text-slate-600 transition-all" title="선택 초기화"><ScanLine size={16}/></button>
                        </div>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                            <button onClick={()=>{/* Cut impl */}} className="p-1.5 hover:bg-white rounded text-slate-600 transition-all"><Scissors size={16}/></button>
                            <button onClick={()=>{/* Copy impl */}} className="p-1.5 hover:bg-white rounded text-slate-600 transition-all"><Copy size={16}/></button>
                            <button onClick={()=>{/* Paste impl */}} className="p-1.5 hover:bg-white rounded text-slate-600 transition-all"><Clipboard size={16}/></button>
                        </div>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <button onClick={()=>setShowAutomation(!showAutomation)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${showAutomation ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            <Zap size={14}/> 오토메이션
                        </button>
                        
                        {/* Playback Controls */}
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <div className="flex bg-yellow-50 border border-yellow-200 p-1 rounded-lg gap-1">
                            <button onClick={() => togglePlay('all')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${isPlaying && playMode==='all' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-white text-slate-600'}`}>
                                {isPlaying && playMode==='all' ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}
                                전체 재생
                            </button>
                            <button onClick={() => togglePlay('selection')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${isPlaying && playMode==='selection' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-white text-slate-600'}`}>
                                {isPlaying && playMode==='selection' ? <Pause size={14} fill="currentColor"/> : <ScanLine size={14}/>}
                                선택 재생
                            </button>
                            <button onClick={handleStop} className="px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all hover:bg-white text-red-500 hover:text-red-600">
                                <Square size={14} fill="currentColor"/>
                                정지
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                         <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                             <button className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center gap-2"><ScanLine size={14}/> 선택영역 저장</button>
                             <button className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center gap-2"><FilePlus size={14}/> 복사본 저장</button>
                         </div>
                         <button onClick={async ()=>{ if(activeBuffer) { const res = await renderStudioAudio(activeBuffer); if(res) onAddToRack(res, "Result_Mix"); } }} className="px-4 py-2 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition-all"><Save size={14}/> 결과물 저장</button>
                    </div>
                </div>

                {/* Main Workspace */}
                <div className="flex-1 flex gap-6 overflow-hidden">
                    {/* Canvas Area */}
                    <div className="flex-[3] flex flex-col bg-slate-900 rounded-2xl relative border border-slate-700 shadow-inner overflow-hidden select-none">
                         <canvas 
                            ref={canvasRef} 
                            width={1000} 
                            height={400} 
                            className={`w-full h-full object-cover ${showAutomation ? 'cursor-crosshair' : 'cursor-text'}`}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onContextMenu={e=>e.preventDefault()}
                         />
                         <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-white font-mono flex gap-4 pointer-events-none">
                             <span>Time: {playheadPos >= 0 && activeBuffer ? (playheadPos/100 * activeBuffer.duration).toFixed(2) : '0.00'}s</span>
                             <span>Selection: {(editTrim.end - editTrim.start).toFixed(2)}s</span>
                             {showAutomation && <span className="text-amber-400">Automation Mode</span>}
                         </div>
                    </div>

                    {/* Sidebar Effects */}
                    <div className="flex-1 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden">
                        <div className="flex border-b border-slate-200">
                            <button onClick={()=>setSideTab('effects')} className={`flex-1 py-3 text-xs font-bold uppercase transition-all ${sideTab==='effects'?'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-500':'text-slate-500 hover:bg-slate-50'}`}>Effects</button>
                            <button onClick={()=>setSideTab('eq')} className={`flex-1 py-3 text-xs font-bold uppercase transition-all ${sideTab==='eq'?'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-500':'text-slate-500 hover:bg-slate-50'}`}>EQ</button>
                            <button onClick={()=>setSideTab('formant')} className={`flex-1 py-3 text-xs font-bold uppercase transition-all ${sideTab==='formant'?'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-500':'text-slate-500 hover:bg-slate-50'}`}>Formant</button>
                        </div>
                        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar space-y-6">
                            {sideTab === 'effects' && (
                                <div className="space-y-6 animate-in fade-in">
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2"><Sparkles size={14}/> Pitch & Gender</h3>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Pitch Shift</span><span>{pitchCents} cents</span></div>
                                            <input type="range" min="-1200" max="1200" step="10" value={pitchCents} onChange={e=>setPitchCents(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Gender Factor</span><span>x{genderShift.toFixed(2)}</span></div>
                                            <input type="range" min="0.5" max="2.0" step="0.05" value={genderShift} onChange={e=>setGenderShift(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-pink-500"/>
                                        </div>
                                    </div>
                                    <div className="h-px bg-slate-100"></div>
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2"><Activity size={14}/> Dynamics</h3>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Compression</span><span>{compThresh} dB</span></div>
                                            <input type="range" min="-60" max="0" step="1" value={compThresh} onChange={e=>setCompThresh(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-cyan-500"/>
                                        </div>
                                    </div>
                                    <div className="h-px bg-slate-100"></div>
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2"><Music size={14}/> Master</h3>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs font-bold text-slate-600"><span>Output Gain</span><span>{Math.round(masterGain*100)}%</span></div>
                                            <input type="range" min="0" max="2" step="0.05" value={masterGain} onChange={e=>setMasterGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-slate-600"/>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {sideTab === 'eq' && (
                                <div className="h-64 animate-in fade-in">
                                    <ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={sourceRef.current}/>
                                </div>
                            )}
                            {sideTab === 'formant' && (
                                <div className="space-y-4 animate-in fade-in">
                                    <FormantPad formant={formant} onChange={setFormant}/>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-bold text-slate-600"><span>Singer's Formant (3kHz Boost)</span><span>{singerFormantGain} dB</span></div>
                                        <input type="range" min="0" max="12" step="0.5" value={singerFormantGain} onChange={e=>setSingerFormantGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-amber-500"/>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudioTab;
