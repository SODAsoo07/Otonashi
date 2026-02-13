import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Undo2, Scissors, Copy, Clipboard, Layers, TrendingUp, TrendingDown, 
  Eraser, MoveHorizontal, Zap, LogIn, Upload, Sparkles, FlipHorizontal, 
  Activity, SlidersHorizontal, Music, Square, Play, Pause 
} from 'lucide-react';
import { AudioFile, KeyframePoint, FormantParams, EQParams } from '../types';
import { AudioUtils } from '../utils/audioUtils';

interface StudioTabProps {
  audioContext: AudioContext;
  activeFile: AudioFile | undefined;
  files: AudioFile[];
  onUpdateFile: (buffer: AudioBuffer) => void;
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
  setActiveFileId: (id: string) => void;
}

const StudioTab: React.FC<StudioTabProps> = ({ audioContext, activeFile, files, onUpdateFile, onAddToRack, setActiveFileId }) => {
    const [editTrim, setEditTrim] = useState({ start: 0, end: 1 });
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [playheadPos, setPlayheadPos] = useState(0); 
    const [dragTarget, setDragTarget] = useState<string | null>(null);
    const [clipboard, setClipboard] = useState<AudioBuffer | null>(null);
    const [stretchRatio, setStretchRatio] = useState(100);
    const [showStretchModal, setShowStretchModal] = useState(false);
    const [showAutomation, setShowAutomation] = useState(false);
    const [volumeKeyframes, setVolumeKeyframes] = useState<KeyframePoint[]>([{t:0, v:1}, {t:1, v:1}]);
    const [undoStack, setUndoStack] = useState<AudioBuffer[]>([]);
    
    // Params
    const [track2Id, setTrack2Id] = useState("");
    const [mergeOffset, setMergeOffset] = useState(0);
    const [morphMode, setMorphMode] = useState(false);
    const [pitchCents, setPitchCents] = useState(0);
    const [genderShift, setGenderShift] = useState(1.0);
    const [eq, setEq] = useState<EQParams>({ low: 0, mid: 0, high: 0 });
    const [masterGain, setMasterGain] = useState(1.0);
    const [formant, setFormant] = useState<FormantParams>({ f1: 500, f2: 1500, f3: 2500, resonance: 4.0 });
    
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

    const pushUndo = useCallback(() => { if (activeBuffer) setUndoStack(prev => [...prev.slice(-19), activeBuffer]); }, [activeBuffer]);
    const handleUndo = useCallback(() => { 
        if (undoStack.length === 0) return; 
        const prevBuf = undoStack[undoStack.length - 1]; 
        setUndoStack(prev => prev.slice(0, -1)); 
        onUpdateFile(prevBuf); 
    }, [undoStack, onUpdateFile]);

    const handleStop = useCallback(() => {
        if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} sourceRef.current = null; }
        setIsPlaying(false); setIsPaused(false); setPlayheadPos(0); pauseOffsetRef.current = 0;
        if(animationRef.current) cancelAnimationFrame(animationRef.current);
    }, []);

    const updatePlayhead = useCallback(() => {
        if (!isPlaying || !activeBuffer) return;
        const elapsed = audioContext.currentTime - startTimeRef.current;
        const currentPos = ((elapsed / activeBuffer.duration) * 100) % 100;
        setPlayheadPos(currentPos);
        animationRef.current = requestAnimationFrame(updatePlayhead);
    }, [isPlaying, activeBuffer, audioContext]);

    useEffect(() => { 
        if (isPlaying) animationRef.current = requestAnimationFrame(updatePlayhead); 
        else if (animationRef.current) cancelAnimationFrame(animationRef.current); 
        return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); }; 
    }, [isPlaying, updatePlayhead]);

    const renderStudioAudio = async (buf: AudioBuffer) => {
        if(!buf || !audioContext) return null;
        const t2Buf = files.find(f => f.id === track2Id)?.buffer;
        const t1Dur = buf.duration;
        const offSec = mergeOffset / 1000;
        const totalDur = t2Buf ? Math.max(t1Dur, offSec + t2Buf.duration) : t1Dur;
        const renderDur = totalDur + (reverbWet > 0 ? 2 : 0) + (delayTime > 0 ? 2 : 0);
        const offline = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(renderDur * buf.sampleRate), buf.sampleRate);
        const finalOutput = offline.createGain(); finalOutput.gain.value = masterGain;

        const lowF = offline.createBiquadFilter(); lowF.type = 'lowshelf'; lowF.frequency.value = 320; lowF.gain.value = eq.low;
        const midF = offline.createBiquadFilter(); midF.type = 'peaking'; midF.frequency.value = 1000; midF.Q.value = 1.0; midF.gain.value = eq.mid;
        const highF = offline.createBiquadFilter(); highF.type = 'highshelf'; highF.frequency.value = 3200; highF.gain.value = eq.high;
        
        const fShift = offline.createBiquadFilter(); fShift.type = 'peaking'; fShift.frequency.value = 1000 * genderShift; fShift.gain.value = 6;
        const f1Node = offline.createBiquadFilter(); f1Node.type = 'peaking'; f1Node.frequency.value = formant.f1; f1Node.Q.value = formant.resonance; f1Node.gain.value = 12;
        const f2Node = offline.createBiquadFilter(); f2Node.type = 'peaking'; f2Node.frequency.value = formant.f2; f2Node.Q.value = formant.resonance; f2Node.gain.value = 10;
        const f3Node = offline.createBiquadFilter(); f3Node.type = 'peaking'; f3Node.frequency.value = formant.f3; f3Node.Q.value = formant.resonance; f3Node.gain.value = 8;
        
        const singerF = offline.createBiquadFilter(); singerF.type = 'peaking'; singerF.frequency.value = 3000; singerF.Q.value = 1.5; singerF.gain.value = singerFormantGain;
        
        const compressor = offline.createDynamicsCompressor(); compressor.threshold.value = compThresh;
        
        lowF.connect(midF); midF.connect(highF); highF.connect(fShift); fShift.connect(f1Node); f1Node.connect(f2Node); f2Node.connect(f3Node); f3Node.connect(singerF); singerF.connect(compressor); compressor.connect(finalOutput); finalOutput.connect(offline.destination);

        const s1 = offline.createBufferSource(); s1.buffer = buf; s1.detune.value = pitchCents;
        if (vibDepth > 0) { const lfo = offline.createOscillator(); lfo.frequency.value = vibRate; const lfoG = offline.createGain(); lfoG.gain.value = vibDepth * 10; lfo.connect(lfoG); lfoG.connect(s1.detune); lfo.start(0); }
        
        const g1 = offline.createGain();
        if(showAutomation) { g1.gain.setValueAtTime(volumeKeyframes[0].v, 0); volumeKeyframes.forEach(kf => g1.gain.linearRampToValueAtTime(kf.v, kf.t * buf.duration)); }
        s1.connect(g1);
        if (track2Id && t2Buf) {
            const s2 = offline.createBufferSource(); s2.buffer = t2Buf; s2.detune.value = pitchCents;
            if (morphMode) { const conv = offline.createConvolver(); conv.buffer = t2Buf; const cg = offline.createGain(); cg.gain.value = 2.0; g1.connect(conv); conv.connect(cg); cg.connect(lowF); } 
            else { g1.connect(lowF); const g2 = offline.createGain(); s2.connect(g2); g2.connect(lowF); s2.start(mergeOffset/1000); }
        } else { g1.connect(lowF); }
        s1.start(0);
        const rendered = await offline.startRendering();
        
        let processed = rendered;
        if (reverbWet > 0) processed = await AudioUtils.applyReverb(audioContext, processed, reverbWet);
        if (delayTime > 0) processed = await AudioUtils.applyDelay(audioContext, processed, delayTime, 0.4);
        return processed;
    };

    const handlePlayPause = useCallback(async () => {
        if(isPlaying) { if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} pauseOffsetRef.current = audioContext.currentTime - startTimeRef.current; setIsPlaying(false); setIsPaused(true); } return; }
        if(!activeBuffer) return;
        const hasSelection = editTrim.end - editTrim.start < 0.99;
        const baseBuf = hasSelection ? AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end) : activeBuffer;
        if (!baseBuf) return;
        const processedBuf = await renderStudioAudio(baseBuf);
        if (!processedBuf) return;

        const s = audioContext.createBufferSource(); s.buffer = processedBuf; s.connect(audioContext.destination);
        const startOffset = isPaused ? pauseOffsetRef.current : 0;
        if (startOffset >= processedBuf.duration) { pauseOffsetRef.current = 0; s.start(0); startTimeRef.current = audioContext.currentTime; }
        else { s.start(0, startOffset); startTimeRef.current = audioContext.currentTime - startOffset; }
        sourceRef.current = s; setIsPlaying(true); setIsPaused(false);
        const update = () => { if (!isPlaying) return; const elapsed = audioContext.currentTime - startTimeRef.current; setPlayheadPos((elapsed / activeBuffer.duration) * 100); animationRef.current = requestAnimationFrame(update); };
        animationRef.current = requestAnimationFrame(update);
        s.onended = () => { if (Math.abs((audioContext.currentTime - startTimeRef.current) - processedBuf.duration) < 0.1) { setIsPlaying(false); setIsPaused(false); setPlayheadPos(0); pauseOffsetRef.current = 0; } };
    }, [isPlaying, activeBuffer, audioContext, editTrim, renderStudioAudio, isPaused]);

    useEffect(() => { const handleKey = (e: KeyboardEvent) => { if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') { e.preventDefault(); handlePlayPause(); } }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey); }, [handlePlayPause]);
    
    const handleFade = async (type: 'in' | 'out') => { 
        if(!activeBuffer) return; 
        pushUndo(); 
        const res = await AudioUtils.applyFade(audioContext, activeBuffer, type, editTrim.start, editTrim.end); 
        if (res) onUpdateFile(res); 
    };
    
    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const fileId = e.dataTransfer.getData("fileId"); if (fileId) setActiveFileId(fileId); };

    useEffect(() => {
        if(!canvasRef.current || !activeBuffer) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const w = canvasRef.current.width; const h = canvasRef.current.height;
        const data = activeBuffer.getChannelData(0); const step = Math.ceil(data.length/w);
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#1e293b'; ctx.fillRect(0,0,w,h);
        ctx.beginPath(); ctx.strokeStyle = '#3c78e8'; ctx.lineWidth = 1; for(let i=0;i<w;i++){ let min=1,max=-1; for(let j=0;j<step;j++){ const d=data[i*step+j]; if(d<min)min=d; if(d>max)max=d; } ctx.moveTo(i, h/2+min*h/2); ctx.lineTo(i, h/2+max*h/2); } ctx.stroke();
        const sX = editTrim.start * w; const eX = editTrim.end * w; ctx.fillStyle = 'rgba(60, 120, 232, 0.15)'; ctx.fillRect(sX, 0, eX-sX, h); ctx.strokeStyle = '#209ad6'; ctx.lineWidth=2; ctx.strokeRect(sX, 0, eX-sX, h);
        const phX = (playheadPos / 100) * w; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(phX, 0); ctx.lineTo(phX, h); ctx.stroke();
        if(showAutomation) { ctx.beginPath(); ctx.strokeStyle = '#eab308'; ctx.lineWidth = 2; volumeKeyframes.forEach((kf, i) => { const x = kf.t * w; const y = h - (Math.min(kf.v, 2) / 2 * h); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); ctx.fillStyle = '#eab308'; ctx.fillRect(x-3, y-3, 6, 6); }); ctx.stroke(); }
    }, [activeBuffer, editTrim, showAutomation, volumeKeyframes, playheadPos]);

    return (
        <div className="flex-1 flex flex-col gap-4 animate-in fade-in p-4 font-sans font-bold" onMouseUp={()=>setDragTarget(null)} onDragOver={(e)=>e.preventDefault()} onDrop={handleDrop}>
            <div className="flex-[3] flex flex-col gap-4 min-h-[300px]">
                <div className="bg-white/50 rounded-xl border border-slate-300 p-2 flex justify-between items-center shadow-sm">
                    <div className="flex gap-1 font-sans">
                        <button onClick={handleUndo} disabled={undoStack.length === 0} title="실행 취소" className="p-2 hover:bg-slate-200 rounded text-slate-600 disabled:opacity-30 transition-colors"><Undo2 size={14}/></button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={() => { if(!activeBuffer) return; pushUndo(); setClipboard(AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end)); onUpdateFile(AudioUtils.deleteRange(audioContext, activeBuffer, editTrim.start, editTrim.end) as AudioBuffer); setEditTrim({start:0, end:0}); }} title="잘라내기" className="p-2 hover:bg-slate-200 rounded text-slate-600 transition-colors"><Scissors size={14}/></button>
                        <button onClick={() => { if(activeBuffer) setClipboard(AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end)); }} title="복사" className="p-2 hover:bg-slate-200 rounded text-slate-600 transition-colors"><Copy size={14}/></button>
                        <button onClick={() => { if(!activeBuffer || !clipboard) return; pushUndo(); const pre = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, 0, editTrim.start); const post = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, 1); onUpdateFile(AudioUtils.concatBuffers(audioContext, AudioUtils.concatBuffers(audioContext, pre, clipboard), post) as AudioBuffer); }} disabled={!clipboard} title="붙여넣기" className="p-2 hover:bg-slate-200 rounded text-slate-600 disabled:opacity-30 transition-colors"><Clipboard size={14}/></button>
                        <button onClick={() => { if(!activeBuffer || !clipboard) return; pushUndo(); onUpdateFile(AudioUtils.mixBuffers(audioContext, activeBuffer, clipboard, editTrim.start) as AudioBuffer); }} disabled={!clipboard} title="오버레이" className="p-2 hover:bg-slate-200 rounded text-indigo-500 disabled:opacity-30 transition-colors"><Layers size={14}/></button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={() => handleFade('in')} title="페이드 인" className="p-2 hover:bg-slate-200 rounded text-emerald-500 transition-colors"><TrendingUp size={14}/></button>
                        <button onClick={() => handleFade('out')} title="페이드 아웃" className="p-2 hover:bg-slate-200 rounded text-rose-500 transition-colors"><TrendingDown size={14}/></button>
                        <button onClick={() => { if(!activeBuffer) return; pushUndo(); const pre = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, 0, editTrim.start); const post = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.end, 100); const dur = (activeBuffer.duration * (editTrim.end - editTrim.start) / 100); onUpdateFile(AudioUtils.concatBuffers(audioContext, AudioUtils.concatBuffers(audioContext, pre, AudioUtils.createSilence(audioContext, dur)), post) as AudioBuffer); }} title="침묵" className="p-2 hover:bg-slate-200 rounded text-slate-400 transition-colors"><Eraser size={14}/></button>
                        <button onClick={()=>setShowStretchModal(true)} title="시간 조절" className="p-2 hover:bg-slate-200 rounded text-[#209ad6] transition-colors"><MoveHorizontal size={14}/></button>
                        <button onClick={()=>setShowAutomation(!showAutomation)} className={`p-2 rounded flex gap-1 items-center transition-all ${showAutomation?'bg-yellow-100 text-yellow-700 font-bold':'hover:bg-slate-200'}`}><Zap size={14}/><span className="text-xs font-bold">오토메이션</span></button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={async () => { if(!activeBuffer) return; const res = await renderStudioAudio(activeBuffer); if(res) onAddToRack(res, (activeFile?.name || "Studio") + "_결과"); }} className="bg-[#a3cef0] hover:bg-[#209ad6] hover:text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 shadow-sm transition-colors font-sans font-bold"><LogIn size={14}/> 보관함에 저장</button>
                    </div>
                </div>
                <div className="flex-1 bg-white rounded-xl border border-slate-300 relative overflow-hidden shadow-inner font-sans">
                    {activeBuffer ? <canvas ref={canvasRef} width={1000} height={400} className="w-full h-full object-fill cursor-crosshair font-sans" 
                        onMouseDown={e=>{ const rect=e.currentTarget.getBoundingClientRect(); const p=(e.clientX-rect.left)/rect.width; if(Math.abs(p-editTrim.start)<0.02) setDragTarget('start'); else if(Math.abs(p-editTrim.end)<0.02) setDragTarget('end'); else setDragTarget('new'); if(dragTarget==='new') setEditTrim({start:p, end:p}); }}
                        onMouseMove={e=>{ if(!dragTarget) return; const rect=e.currentTarget.getBoundingClientRect(); const p=Math.max(0,Math.min(1, (e.clientX-rect.left)/rect.width)); if(dragTarget==='start') setEditTrim(pr=>({...pr, start:Math.min(p, pr.end)})); else if(dragTarget==='end') setEditTrim(pr=>({...pr, end:Math.max(p, pr.start)})); else setEditTrim({start:p, end:p}); }}
                    /> : <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 font-bold opacity-30 text-center px-8 text-sm gap-2 font-sans font-black"><Upload size={32} />파일을 드래그하여 여세요</div>}
                </div>
            </div>

            <div className="flex-[2] grid grid-cols-1 md:grid-cols-4 gap-4 min-h-0 font-sans font-bold">
                <div className="bg-white/40 rounded-xl border border-slate-300 p-3 flex flex-col gap-2 font-bold font-sans">
                     <h4 className="text-[10px] font-black text-purple-500 uppercase flex items-center gap-2 font-black font-sans"><Sparkles size={14}/> 이펙트</h4>
                     <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-slate-500 uppercase font-bold font-sans">
                        <div>
                            <div className="flex justify-between items-center"><span>Reverb</span><input type="number" min="0" max="1" step="0.05" value={reverbWet} onChange={e=>setReverbWet(Number(e.target.value))} className="w-8 bg-transparent text-right outline-none hover:bg-white/50 rounded transition-colors"/></div>
                            <input type="range" min="0" max="1" step="0.05" value={reverbWet} onChange={e=>setReverbWet(Number(e.target.value))} className="w-full h-1 accent-purple-400 font-bold"/>
                        </div>
                        <div>
                            <div className="flex justify-between items-center"><span>Delay</span><input type="number" min="0" max="1" step="0.05" value={delayTime} onChange={e=>setDelayTime(Number(e.target.value))} className="w-8 bg-transparent text-right outline-none hover:bg-white/50 rounded transition-colors"/></div>
                            <input type="range" min="0" max="1" step="0.05" value={delayTime} onChange={e=>setDelayTime(Number(e.target.value))} className="w-full h-1 accent-purple-400 font-bold"/>
                        </div>
                        <div>
                            <div className="flex justify-between items-center"><span>Comp</span><input type="number" min="-60" max="0" value={compThresh} onChange={e=>setCompThresh(Number(e.target.value))} className="w-8 bg-transparent text-right outline-none hover:bg-white/50 rounded transition-colors"/></div>
                            <input type="range" min="-60" max="0" value={compThresh} onChange={e=>setCompThresh(Number(e.target.value))} className="w-full h-1 accent-blue-400 font-bold"/>
                        </div>
                        <button onClick={async () => { if(!activeBuffer) return; pushUndo(); onUpdateFile(AudioUtils.reverseBuffer(audioContext, activeBuffer)); }} className="py-1 bg-slate-200 text-slate-600 rounded flex items-center justify-center gap-1 transition-all font-bold font-sans"><FlipHorizontal size={10}/> Reverse</button>
                     </div>
                </div>
                <div className="bg-white/40 rounded-xl border border-slate-300 p-3 flex flex-col gap-2 font-bold font-sans font-bold">
                    <h4 className="text-[10px] font-black text-emerald-500 uppercase flex items-center gap-2 font-black font-sans font-black font-sans"><Activity size={14}/> 포먼트 & 비브라토</h4>
                    <div className="space-y-1 font-sans font-bold text-slate-500 uppercase text-[9px] font-bold">
                        <div className="space-y-0.5">
                            <div className="flex justify-between items-center"><span>f1</span><input type="number" min="200" max="1200" value={formant.f1} onChange={e=>setFormant({...formant, f1: Number(e.target.value)})} className="w-10 bg-transparent text-right border-b border-transparent hover:border-slate-300 focus:border-emerald-500 outline-none"/></div>
                            <input type="range" min="200" max="1200" step="10" value={formant.f1} onChange={e=>setFormant({...formant, f1: Number(e.target.value)})} className="w-full h-1 bg-slate-300 rounded appearance-none accent-emerald-500"/>
                        </div>
                        <div className="space-y-0.5">
                            <div className="flex justify-between items-center"><span>f2</span><input type="number" min="500" max="3000" value={formant.f2} onChange={e=>setFormant({...formant, f2: Number(e.target.value)})} className="w-10 bg-transparent text-right border-b border-transparent hover:border-slate-300 focus:border-emerald-500 outline-none"/></div>
                            <input type="range" min="500" max="3000" step="10" value={formant.f2} onChange={e=>setFormant({...formant, f2: Number(e.target.value)})} className="w-full h-1 bg-slate-300 rounded appearance-none accent-emerald-500"/>
                        </div>
                        <div className="space-y-0.5">
                            <div className="flex justify-between items-center"><span>f3</span><input type="number" min="1500" max="4000" value={formant.f3} onChange={e=>setFormant({...formant, f3: Number(e.target.value)})} className="w-10 bg-transparent text-right border-b border-transparent hover:border-slate-300 focus:border-emerald-500 outline-none"/></div>
                            <input type="range" min="1500" max="4000" step="10" value={formant.f3} onChange={e=>setFormant({...formant, f3: Number(e.target.value)})} className="w-full h-1 bg-slate-300 rounded appearance-none accent-emerald-500"/>
                        </div>
                        <div className="space-y-0.5 pt-1 border-t border-slate-200/50">
                             <div className="flex justify-between items-center"><span>Q</span><input type="number" min="0.1" max="20" step="0.1" value={formant.resonance} onChange={e=>setFormant({...formant, resonance: Number(e.target.value)})} className="w-8 bg-transparent text-right border-b border-transparent hover:border-slate-300 focus:border-pink-500 outline-none"/></div>
                            <input type="range" min="0.1" max="20" step="0.1" value={formant.resonance} onChange={e=>setFormant({...formant, resonance:Number(e.target.value)})} className="w-full h-1 bg-slate-300 rounded appearance-none accent-pink-500"/>
                        </div>
                        <div className="space-y-0.5">
                             <div className="flex justify-between items-center text-yellow-600"><span>Singer's</span><input type="number" min="0" max="24" value={singerFormantGain} onChange={e=>setSingerFormantGain(Number(e.target.value))} className="w-8 bg-transparent text-right border-b border-transparent hover:border-slate-300 focus:border-yellow-500 outline-none"/></div>
                            <input type="range" min="0" max="24" value={singerFormantGain} onChange={e=>setSingerFormantGain(Number(e.target.value))} className="w-full h-1 bg-slate-300 rounded appearance-none accent-yellow-500"/>
                        </div>
                        <div className="space-y-0.5">
                             <div className="flex justify-between items-center text-pink-500"><span>Vibrato</span><input type="number" min="0" max="100" value={vibDepth} onChange={e=>setVibDepth(Number(e.target.value))} className="w-8 bg-transparent text-right border-b border-transparent hover:border-slate-300 focus:border-pink-500 outline-none"/></div>
                            <input type="range" min="0" max="100" value={vibDepth} onChange={e=>setVibDepth(Number(e.target.value))} className="w-full h-1 bg-slate-300 rounded appearance-none accent-pink-500"/>
                        </div>
                    </div>
                </div>
                <div className="bg-white/40 rounded-xl border border-slate-300 p-3 flex flex-col gap-2 font-bold font-sans font-black font-bold">
                    <h4 className="text-[10px] font-black text-indigo-500 uppercase flex items-center gap-2 font-black font-sans font-bold"><SlidersHorizontal size={14}/> 밴드 EQ</h4>
                    <div className="space-y-3 uppercase font-black text-slate-500 text-[9px] font-bold font-sans">
                        <div>
                            <div className="flex justify-between items-center"><span>low</span><div className="flex items-center"><input type="number" min="-24" max="24" value={eq.low} onChange={e=>setEq({...eq, low: Number(e.target.value)})} className="w-8 bg-transparent text-right outline-none hover:bg-white/50 rounded transition-colors"/><span>dB</span></div></div>
                            <input type="range" min="-24" max="24" value={eq.low} onChange={e=>setEq({...eq, low: Number(e.target.value)})} className="w-full h-1 bg-slate-300 appearance-none accent-indigo-500 font-sans transition-all"/>
                        </div>
                        <div>
                            <div className="flex justify-between items-center"><span>mid</span><div className="flex items-center"><input type="number" min="-24" max="24" value={eq.mid} onChange={e=>setEq({...eq, mid: Number(e.target.value)})} className="w-8 bg-transparent text-right outline-none hover:bg-white/50 rounded transition-colors"/><span>dB</span></div></div>
                            <input type="range" min="-24" max="24" value={eq.mid} onChange={e=>setEq({...eq, mid: Number(e.target.value)})} className="w-full h-1 bg-slate-300 appearance-none accent-indigo-500 font-sans transition-all"/>
                        </div>
                        <div>
                            <div className="flex justify-between items-center"><span>high</span><div className="flex items-center"><input type="number" min="-24" max="24" value={eq.high} onChange={e=>setEq({...eq, high: Number(e.target.value)})} className="w-8 bg-transparent text-right outline-none hover:bg-white/50 rounded transition-colors"/><span>dB</span></div></div>
                            <input type="range" min="-24" max="24" value={eq.high} onChange={e=>setEq({...eq, high: Number(e.target.value)})} className="w-full h-1 bg-slate-300 appearance-none accent-indigo-500 font-sans transition-all"/>
                        </div>
                    </div>
                </div>
                <div className="bg-white/40 rounded-xl border border-slate-300 p-3 flex flex-col gap-3 font-bold font-sans font-black font-bold">
                    <h4 className="text-[10px] font-black text-pink-500 uppercase flex items-center gap-2 font-black font-sans font-bold"><Music size={14}/> 피치 & 젠더</h4>
                    <div className="space-y-2 text-[9px] uppercase font-black text-slate-500 font-bold font-sans font-bold">
                        <div>
                            <div className="flex justify-between items-center"><span>Pitch</span><input type="number" min="-1200" max="1200" step="10" value={pitchCents} onChange={e=>setPitchCents(Number(e.target.value))} className="w-10 bg-transparent text-right outline-none hover:bg-white/50 rounded transition-colors"/></div>
                            <input type="range" min="-1200" max="1200" step="10" value={pitchCents} onChange={e=>setPitchCents(Number(e.target.value))} className="w-full h-1 accent-blue-500 font-sans transition-all"/>
                        </div>
                        <div>
                            <div className="flex justify-between items-center"><span>Gender</span><div className="flex items-center"><input type="number" min="0.5" max="2.0" step="0.05" value={genderShift} onChange={e=>setGenderShift(Number(e.target.value))} className="w-8 bg-transparent text-right outline-none hover:bg-white/50 rounded transition-colors"/><span>x</span></div></div>
                            <input type="range" min="0.5" max="2.0" step="0.05" value={genderShift} onChange={e=>setGenderShift(Number(e.target.value))} className="w-full h-1 accent-pink-400 font-sans transition-all"/>
                        </div>
                        <div>
                            <div className="flex justify-between items-center"><span>Volume</span><div className="flex items-center"><input type="number" min="0" max="2" step="0.1" value={masterGain} onChange={e=>setMasterGain(Number(e.target.value))} className="w-8 bg-transparent text-right outline-none hover:bg-white/50 rounded transition-colors"/><span>x</span></div></div>
                            <input type="range" min="0" max="2" step="0.1" value={masterGain} onChange={e=>setMasterGain(Number(e.target.value))} className="w-full h-1 bg-slate-300 rounded appearance-none accent-emerald-500 font-sans transition-all"/>
                        </div>
                    </div>
                    <div className="mt-auto flex gap-2 font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold"><button onClick={handleStop} className="p-2 bg-slate-200 rounded text-slate-600 transition-all font-bold hover:bg-slate-300 font-sans font-bold"><Square size={14} fill="currentColor"/></button><button onClick={handlePlayPause} className="flex-1 py-1.5 bg-[#209ad6] text-white rounded font-bold text-[10px] flex items-center justify-center gap-1 shadow-sm transition-all hover:bg-[#1a85b9] font-sans font-bold">{isPlaying ? <Pause size={12} fill="currentColor"/> : <Play size={12} fill="currentColor"/>} {isPlaying ? 'PAUSE' : 'PLAY'}</button></div>
                </div>
            </div>
            {showStretchModal && <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-[150] animate-in zoom-in-95 font-sans font-bold"><div className="bg-[#e8e8e6] p-6 rounded-xl border border-slate-300 w-80 shadow-2xl font-sans font-bold font-sans font-bold"><h3 className="font-bold text-[#209ad6] mb-4 uppercase tracking-tighter text-sm font-black font-sans font-bold">시간 조절 ({stretchRatio}%)</h3><input type="range" min="50" max="200" value={stretchRatio} onChange={e=>setStretchRatio(Number(e.target.value))} className="w-full h-1 bg-slate-300 rounded mb-6 appearance-none accent-[#209ad6] font-sans font-bold"/><button onClick={async () => { if(!activeBuffer) return; pushUndo(); const str = await AudioUtils.applyStretch(AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end) as AudioBuffer, stretchRatio/100); if(str) { const pre = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, 0, editTrim.start); const post = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.end, 1); onUpdateFile(AudioUtils.concatBuffers(audioContext, AudioUtils.concatBuffers(audioContext, pre, str), post) as AudioBuffer); } setShowStretchModal(false); }} className="w-full py-3 bg-[#209ad6] text-white rounded-xl font-black mb-2 transition-all font-black font-sans font-bold">적용</button><button onClick={()=>setShowStretchModal(false)} className="w-full py-2 text-slate-500 font-black text-xs uppercase font-bold font-sans font-bold">취소</button></div></div>}
        </div>
    );
};

export default StudioTab;