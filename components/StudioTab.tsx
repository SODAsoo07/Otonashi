
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Undo2, Redo2, Scissors, FilePlus, Sparkles, Activity, Square, Play, Pause, Save, AudioLines, Power, Copy, Layers, Fingerprint
} from 'lucide-react';
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
    const [showAutomation, setShowAutomation] = useState(false);
    const [volumeKeyframes, setVolumeKeyframes] = useState<KeyframePoint[]>([{t:0, v:1}, {t:1, v:1}]);
    
    // Clipboard State
    const [clipboard, setClipboard] = useState<AudioBuffer | null>(null);

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

    // --- Clipboard Operations ---
    const handleCopy = useCallback(() => {
        if (!activeBuffer) return;
        const newBuf = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end);
        if (newBuf) {
            setClipboard(newBuf);
            // Optional: Visual feedback could be added here
        }
    }, [activeBuffer, audioContext, editTrim]);

    const handlePasteMix = useCallback(() => {
        if (!activeBuffer || !clipboard) return;
        pushUndo("오디오 겹쳐넣기 (Mix)");
        
        // Calculate insert point from playhead
        const startSample = Math.floor((playheadPos / 100) * activeBuffer.duration * activeBuffer.sampleRate);
        const newBuf = AudioUtils.mixBuffersAtTime(audioContext, activeBuffer, clipboard, startSample);
        
        if (newBuf) {
            onUpdateFile(newBuf);
        }
    }, [activeBuffer, clipboard, audioContext, playheadPos, pushUndo, onUpdateFile]);

    const handlePasteImprint = useCallback(async () => {
        if (!activeBuffer || !clipboard) return;
        pushUndo("오디오 텍스처 입히기 (Imprint)");

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
        pushUndo("잘라내기");
        const newBuf = AudioUtils.deleteRange(audioContext, activeBuffer, editTrim.start, editTrim.end);
        if (newBuf) {
            onUpdateFile(newBuf);
            setEditTrim({ start: 0, end: 1 });
        }
    }, [activeBuffer, audioContext, editTrim, onUpdateFile, pushUndo]);

    const handleSaveSelection = useCallback(() => {
        if (!activeBuffer) return;
        const newBuf = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end);
        if (newBuf) {
            onAddToRack(newBuf, `${activeFile?.name}_Cut`);
        }
    }, [activeBuffer, audioContext, editTrim, activeFile, onAddToRack]);

    const stopPlayback = useCallback(() => {
        if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} sourceRef.current = null; }
        setIsPlaying(false);
        if(animationRef.current) cancelAnimationFrame(animationRef.current);
    }, []);

    const handleStop = useCallback(() => {
        stopPlayback();
        setIsPaused(false); setPlayheadPos(0); pauseOffsetRef.current = 0;
    }, [stopPlayback]);

    const renderStudioAudio = useCallback(async (buf: AudioBuffer) => {
        if(!buf || !audioContext) return null;
        const renderDur = buf.duration + (enableDelay ? 2 : 0) + (enableReverb ? 3 : 0);
        const offline = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(renderDur * buf.sampleRate), buf.sampleRate);
        
        const finalOutput = offline.createGain(); 
        finalOutput.gain.value = masterGain;

        let currentNode: AudioNode = offline.createGain(); 
        const inputNode = currentNode;

        if (!bypassEffects) {
            // EQ
            eqBands.forEach(b => {
                if(b.on) {
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
            
            // Time-based (Delay/Reverb)
            const dryGain = offline.createGain(); 
            const effectMerge = offline.createGain(); 
            
            compressor.connect(dryGain);
            dryGain.connect(finalOutput);

            if (enableDelay && delayTime > 0) {
                const delay = offline.createDelay(); delay.delayTime.value = delayTime;
                const fb = offline.createGain(); fb.gain.value = delayFeedback;
                const delayOut = offline.createGain(); delayOut.gain.value = 0.5;
                compressor.connect(delay);
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
                compressor.connect(reverbConv);
                reverbConv.connect(revGain);
                revGain.connect(effectMerge);
            }
            
            effectMerge.connect(finalOutput);
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
        finalOutput.connect(offline.destination);
        return await offline.startRendering();
    }, [audioContext, pitchCents, genderShift, masterGain, bypassEffects, formant, eqBands, enableDelay, delayTime, delayFeedback, enableReverb, reverbMix, compThresh, compRatio, compAttack, compRelease, volumeKeyframes]);

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
        s.connect(audioContext.destination);

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
            if(mode === 'all') { setPlayheadPos(0); pauseOffsetRef.current = 0; }
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

        const sX = editTrim.start * w, eX = editTrim.end * w;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(sX, RULER_HEIGHT, eX - sX, waveH);

        if (playheadPos >= 0) {
            const px = (playheadPos / 100) * w;
            ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
        }
    }, [activeBuffer, editTrim, playheadPos, showAutomation, volumeKeyframes]);

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
                            <button onClick={handleUndo} disabled={undoStack.length===0} title="언두" className="p-1.5 hover:bg-white rounded text-slate-900 disabled:opacity-30"><Undo2 size={16}/></button>
                            <button onClick={handleRedo} disabled={redoStack.length===0} title="리두" className="p-1.5 hover:bg-white rounded text-slate-900 disabled:opacity-30"><Redo2 size={16}/></button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button onClick={() => togglePlay('all')} className={`px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 transition-all ${isPlaying ? 'bg-white shadow text-slate-900' : 'hover:bg-white text-slate-600'}`}>{isPlaying ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>} {isPlaying ? '일시정지' : '재생'}</button>
                            <button onClick={handleStop} className="px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 hover:bg-white text-red-500 transition-colors font-black"><Square size={14} fill="currentColor"/> 정지</button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button onClick={handleCutSelection} className="p-1.5 hover:bg-white rounded text-slate-600 hover:text-red-500 transition-all" title="선택 영역 자르기"><Scissors size={16}/></button>
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>
                            <button onClick={handleCopy} className={`px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 transition-all hover:bg-white ${clipboard ? 'text-indigo-600' : 'text-slate-500'}`} title="선택 영역 복사">
                                <Copy size={14}/> 복사
                            </button>
                            <button onClick={handlePasteMix} disabled={!clipboard} className="px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 transition-all hover:bg-white text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent" title="현재 위치에 믹스 붙여넣기 (Mix Paste)">
                                <Layers size={14}/> 겹쳐넣기
                            </button>
                             <button onClick={handlePasteImprint} disabled={!clipboard} className="px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-2 transition-all hover:bg-white text-pink-600 disabled:opacity-30 disabled:hover:bg-transparent" title="선택 영역에 클립보드 소스의 질감을 입힙니다 (Convolution)">
                                <Fingerprint size={14}/> 텍스처 입히기
                            </button>
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
                            <FilePlus size={16}/> 선택 영역 저장
                         </button>
                         <button onClick={async ()=>{ if(activeBuffer) { const res = await renderStudioAudio(activeBuffer); if(res) onAddToRack(res, "Studio_Mix"); } }} className="px-5 py-2.5 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg active:scale-95 transition-all"><Save size={16}/> 보관함 저장</button>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-inner overflow-hidden select-none h-[400px] relative">
                         <canvas ref={canvasRef} width={1200} height={400} className="w-full h-full object-cover cursor-crosshair" 
                             onMouseDown={(e) => {
                                 const rect = canvasRef.current!.getBoundingClientRect();
                                 const xPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

                                 // 1. Playhead Position Update
                                 setPlayheadPos(xPct * 100);
                                 pauseOffsetRef.current = xPct * (activeBuffer?.duration || 0);

                                 // 2. Init Selection Drag (Reset selection to start point)
                                 const startX = xPct;
                                 setEditTrim({ start: startX, end: startX });
                                 
                                 const move = (me: MouseEvent) => {
                                     const curRect = canvasRef.current?.getBoundingClientRect();
                                     if(!curRect) return;
                                     const curX = Math.max(0, Math.min(1, (me.clientX - curRect.left) / curRect.width));
                                     // Update selection based on drag
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
                             }} 
                         />
                         <div className="absolute top-0 bottom-0 bg-white/10 border-x border-white/30 pointer-events-none" style={{ left: `${editTrim.start*100}%`, width: `${(editTrim.end-editTrim.start)*100}%` }} />
                         <div className="absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 transition-colors" style={{ left: `calc(${editTrim.start*100}% - 4px)` }} onMouseDown={(e) => { e.stopPropagation(); const startX = e.clientX; const initVal = editTrim.start; const rect = canvasRef.current!.getBoundingClientRect(); const move = (me: MouseEvent) => { const diff = (me.clientX - startX) / rect.width; setEditTrim(prev => ({ ...prev, start: Math.max(0, Math.min(prev.end, initVal + diff)) })); }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                         <div className="absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 transition-colors" style={{ left: `calc(${editTrim.end*100}% - 4px)` }} onMouseDown={(e) => { e.stopPropagation(); const startX = e.clientX; const initVal = editTrim.end; const rect = canvasRef.current!.getBoundingClientRect(); const move = (me: MouseEvent) => { const diff = (me.clientX - startX) / rect.width; setEditTrim(prev => ({ ...prev, end: Math.min(1, Math.max(prev.start, initVal + diff)) })); }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                         {!activeBuffer && (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-black uppercase tracking-widest bg-slate-900/50 backdrop-blur-sm">작업할 파일을 보관함에서 선택하세요</div>
                         )}
                         {clipboard && (
                             <div className="absolute top-4 right-4 bg-indigo-500/90 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg border border-white/20 backdrop-blur pointer-events-none animate-in fade-in slide-in-from-top-2">
                                 📋 클립보드에 오디오 있음 ({clipboard.duration.toFixed(2)}s)
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
                                    { id: 'effects', label: 'Effects' },
                                    { id: 'formant_filter', label: 'Formant Filter' },
                                    { id: 'formant', label: 'Formant' }
                                ].map((tab) => (
                                    <button key={tab.id} onClick={()=>setSideTab(tab.id as any)} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-tight transition-all ${sideTab===tab.id?'bg-white text-slate-900 border-b-2 border-indigo-500 shadow-sm':'text-slate-500 hover:bg-slate-50'}`}>{tab.label}</button>
                                ))}
                            </div>
                            <div className="p-5 flex-1 overflow-y-auto custom-scrollbar space-y-6">
                                {sideTab === 'effects' && (
                                    <div className="space-y-6">
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                                             <div className="flex items-center justify-between">
                                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Sparkles size={12}/> Reverb & Delay</h3>
                                                <div className="flex gap-2">
                                                    <button onClick={()=>setEnableDelay(!enableDelay)} className={`text-[9px] px-2 py-0.5 rounded border font-black ${enableDelay?'bg-indigo-500 text-white border-indigo-600':'bg-white text-slate-400'}`}>DLY</button>
                                                    <button onClick={()=>setEnableReverb(!enableReverb)} className={`text-[9px] px-2 py-0.5 rounded border font-black ${enableReverb?'bg-indigo-500 text-white border-indigo-600':'bg-white text-slate-400'}`}>REV</button>
                                                </div>
                                             </div>
                                             {enableDelay && (
                                                <>
                                                    <RangeControl label="Delay Time" value={delayTime} min={0} max={1} step={0.05} onChange={setDelayTime} unit="s" />
                                                    <RangeControl label="Feedback" value={delayFeedback} min={0} max={0.9} step={0.05} onChange={setDelayFeedback} unit="" />
                                                </>
                                             )}
                                             {enableReverb && (
                                                 <RangeControl label="Reverb Mix" value={reverbMix} min={0} max={1} step={0.05} onChange={setReverbMix} unit="" />
                                             )}
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                                             <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity size={12}/> Compressor</h3>
                                             <RangeControl label="Threshold" value={compThresh} min={-60} max={0} step={1} onChange={setCompThresh} unit="dB" />
                                             <RangeControl label="Ratio" value={compRatio} min={1} max={20} step={0.5} onChange={setCompRatio} unit=":1" />
                                        </div>
                                    </div>
                                )}
                                {sideTab === 'formant_filter' && (
                                    <FormantPad formant={formant} onChange={setFormant}/>
                                )}
                                {sideTab === 'formant' && (
                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><AudioLines size={12}/> Formant Detail</h3>
                                        <RangeControl label="F1 (Throat)" value={formant.f1} min={200} max={1200} step={10} onChange={v=>setFormant({...formant, f1:v})} unit="Hz" />
                                        <RangeControl label="F2 (Mouth)" value={formant.f2} min={500} max={3000} step={10} onChange={v=>setFormant({...formant, f2:v})} unit="Hz" />
                                        <RangeControl label="F3 (Front)" value={formant.f3} min={1500} max={4000} step={10} onChange={v=>setFormant({...formant, f3:v})} unit="Hz" />
                                        <RangeControl label="F4 (Detail)" value={formant.f4} min={2500} max={5000} step={10} onChange={v=>setFormant({...formant, f4:v})} unit="Hz" />
                                        <RangeControl label="Resonance (Q)" value={formant.resonance} min={0.1} max={10} step={0.1} onChange={v=>setFormant({...formant, resonance:v})} unit="" />
                                    </div>
                                )}
                            </div>
                            <div className="p-5 border-t border-slate-200 bg-slate-50/50 space-y-4">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity size={14}/> Master Output</h3>
                                <div className="flex items-center justify-between gap-4">
                                    <button 
                                        onClick={() => setBypassEffects(!bypassEffects)}
                                        className={`flex-1 py-2 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${bypassEffects ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg' : 'bg-white text-slate-400 border-slate-200'}`}
                                        title="효과 일시 해제 (소리 비교용)"
                                    >
                                        <Power size={14} className={bypassEffects ? "animate-pulse" : ""}/>
                                        <span className="text-xs font-black uppercase tracking-tight">Bypass</span>
                                    </button>
                                    <div className="flex-[1.5] space-y-1">
                                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                                            <span>Gain</span>
                                            <span className="text-indigo-600">{(masterGain * 100).toFixed(0)}%</span>
                                        </div>
                                        <input type="range" min="0" max="2" step="0.01" value={masterGain} onChange={e => setMasterGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
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