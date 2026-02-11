import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Upload, Play, Pause, Square, Download, Scissors, Music, Sliders, Activity, 
  Layers, Zap, Settings, Mic2, ChevronDown, ChevronRight, Copy, Clipboard, 
  TrendingUp, X, FileAudio, Plus, Trash2, Save, RefreshCw, CircleDot, User, 
  Grid, Volume2, Wind, Eraser, MoveHorizontal, LogIn, Edit2, Check, 
  MousePointer2, SlidersHorizontal, RotateCcw, Combine, Undo2, TrendingDown
} from 'lucide-react';

/**
 * OTONASHI (AUgmented vocal-TracT and Nasal SImulator) v70
 * - 성도 시뮬레이터: 실행 취소(Undo, 10단계) 기능 추가
 * - Vercel 배포를 위한 AudioContext SSR 안정화 유지
 */

// --- 1. Global Utilities ---
const RULER_HEIGHT = 24;

const AudioUtils = {
  createBufferFromSlice: (ctx, buf, startPct, endPct) => {
    if(!buf || !ctx) return null;
    const start = Math.floor(buf.length * (startPct/100));
    const end = Math.floor(buf.length * (endPct/100));
    const len = end - start;
    if (len <= 0) return null;
    const newBuf = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for(let i=0; i<buf.numberOfChannels; i++) newBuf.copyToChannel(buf.getChannelData(i).slice(start, end), i);
    return newBuf;
  },
  deleteRange: (ctx, buf, startPct, endPct) => {
    if (!buf || !ctx) return null;
    const start = Math.floor(buf.length * (startPct/100));
    const end = Math.floor(buf.length * (endPct/100));
    const newLen = buf.length - (end - start);
    if (newLen <= 0) return ctx.createBuffer(1, 100, buf.sampleRate);
    const newBuf = ctx.createBuffer(buf.numberOfChannels, newLen, buf.sampleRate);
    for(let i=0; i<buf.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        const oldCh = buf.getChannelData(i);
        ch.set(oldCh.slice(0, start), 0);
        ch.set(oldCh.slice(end), start);
    }
    return newBuf;
  },
  concatBuffers: (ctx, buf1, buf2) => {
    if(!buf1 || !ctx) return buf2; if(!buf2) return buf1;
    const newLen = buf1.length + buf2.length;
    const newBuf = ctx.createBuffer(buf1.numberOfChannels, newLen, buf1.sampleRate);
    for(let i=0; i<buf1.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        ch.set(buf1.getChannelData(i), 0);
        ch.set(buf2.getChannelData(i), buf1.length);
    }
    return newBuf;
  },
  mixBuffers: (ctx, base, overlay, offsetPct) => {
    if(!base || !overlay || !ctx) return base;
    const startSample = Math.floor(base.length * (offsetPct/100));
    const newLen = Math.max(base.length, startSample + overlay.length);
    const newBuf = ctx.createBuffer(base.numberOfChannels, newLen, base.sampleRate);
    for(let i=0; i<base.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        ch.set(base.getChannelData(i));
        const overlayData = overlay.getChannelData(i % overlay.numberOfChannels);
        for(let s=0; s<overlay.length; s++) {
            if(startSample + s < newLen) ch[startSample + s] += overlayData[s];
        }
    }
    return newBuf;
  },
  applyFade: async (ctx, buf, type, startPct, endPct) => {
    if(!buf || !ctx) return null;
    const offline = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
    const s = offline.createBufferSource(); s.buffer = buf;
    const g = offline.createGain();
    const start = (startPct/100) * buf.duration;
    const end = (endPct/100) * buf.duration;
    if (type === 'in') { g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(1, end); } 
    else { g.gain.setValueAtTime(1, start); g.gain.linearRampToValueAtTime(0, end); }
    s.connect(g); g.connect(offline.destination); s.start(0);
    return await offline.startRendering();
  },
  createSilence: (ctx, sec) => {
    if(!ctx) return null;
    return ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * sec)), ctx.sampleRate);
  }
};

// ==========================================
// Component: File Rack
// ==========================================
const FileRack = ({ files, activeFileId, setActiveFileId, handleFileUpload, removeFile, renameFile }) => {
  const [editingId, setEditingId] = useState(null);
  const [tempName, setTempName] = useState("");

  const submitRename = (id) => {
    if(tempName.trim()) renameFile(id, tempName.trim());
    setEditingId(null);
  };

  return (
    <aside className="w-64 bg-white/40 border-r border-slate-300 flex flex-col shrink-0 font-sans">
      <div className="p-4 border-b border-slate-300 flex justify-between items-center bg-slate-200/50">
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">파일 보관함</span>
        <label className="cursor-pointer hover:bg-slate-300 p-1 rounded transition text-[#209ad6]">
          <Plus className="w-4 h-4"/>
          <input type="file" multiple accept=".wav,.mp3,audio/*" className="hidden" onChange={handleFileUpload}/>
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-sans">
        {files.map(f => (
          <div key={f.id} 
               draggable
               onDragStart={(e) => e.dataTransfer.setData("fileId", f.id)}
               className={`p-2.5 rounded-lg cursor-grab active:cursor-grabbing text-xs flex items-center gap-2 transition border group ${activeFileId === f.id ? 'bg-[#a3cef0]/30 border-[#209ad6]/40 text-[#1f1e1d]' : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-200'}`}>
            <div className="flex-1 flex items-center gap-2 overflow-hidden" onClick={() => setActiveFileId(f.id)}>
              <FileAudio className={`w-4 h-4 flex-shrink-0 ${activeFileId===f.id?'text-[#209ad6]':'text-slate-400'}`}/> 
              {editingId === f.id ? (
                <input 
                  autoFocus
                  className="bg-white border border-blue-400 rounded px-1 w-full outline-none font-sans"
                  value={tempName}
                  onChange={e => setTempName(e.target.value)}
                  onBlur={() => submitRename(f.id)}
                  onKeyDown={e => e.key === 'Enter' && submitRename(f.id)}
                />
              ) : (
                <span className="truncate font-medium">{f.name}</span>
              )}
            </div>
            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                <button onClick={() => { setEditingId(f.id); setTempName(f.name); }} className="p-1 hover:text-[#209ad6]"><Edit2 size={12}/></button>
                <button onClick={(e) => { e.stopPropagation(); removeFile(f.id); }} className="p-1 hover:text-red-500"><X size={12}/></button>
            </div>
          </div>
        ))}
        {files.length === 0 && <div className="text-center py-10 opacity-30 text-xs font-bold text-slate-500 font-sans uppercase">보관함이 비었습니다</div>}
      </div>
    </aside>
  );
};

// ==========================================
// Component: Integrated Studio Tab
// ==========================================
const StudioTab = ({ audioContext, activeFile, files, onUpdateFile, onAddToRack, setActiveFileId }) => {
    const [editTrim, setEditTrim] = useState({ start: 0, end: 100 });
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [playheadPos, setPlayheadPos] = useState(0); 
    const [dragTarget, setDragTarget] = useState(null);
    const [clipboard, setClipboard] = useState(null);
    const [stretchRatio, setStretchRatio] = useState(100);
    const [showStretchModal, setShowStretchModal] = useState(false);
    const [showAutomation, setShowAutomation] = useState(false);
    const [volumeKeyframes, setVolumeKeyframes] = useState([{t:0, v:1}, {t:1, v:1}]);
    
    const [undoStack, setUndoStack] = useState([]);
    
    const [track2Id, setTrack2Id] = useState("");
    const [mergeOffset, setMergeOffset] = useState(0);
    const [morphMode, setMorphMode] = useState(false);
    const [pitchCents, setPitchCents] = useState(0);
    const [genderShift, setGenderShift] = useState(1.0);
    const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 });
    const [masterGain, setMasterGain] = useState(1.0);
    const [formant, setFormant] = useState({ f1: 500, f2: 1500, f3: 2500, resonance: 4.0 });

    const canvasRef = useRef(null);
    const sourceRef = useRef(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);
    const animationRef = useRef(null);

    const activeBuffer = activeFile ? activeFile.buffer : null;

    const pushUndo = useCallback(() => {
        if (activeBuffer) setUndoStack(prev => [...prev.slice(-19), activeBuffer]);
    }, [activeBuffer]);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;
        const prevBuf = undoStack[undoStack.length - 1];
        setUndoStack(prev => prev.slice(0, -1));
        onUpdateFile(prevBuf);
    }, [undoStack, onUpdateFile]);

    const handleStop = useCallback(() => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            sourceRef.current = null;
        }
        setIsPlaying(false);
        setIsPaused(false);
        setPlayheadPos(0);
        pauseOffsetRef.current = 0;
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }, []);

    const updatePlayhead = useCallback(() => {
        if (!isPlaying || !activeBuffer || !audioContext) return;
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

    const renderStudioAudio = async (buf) => {
        if(!buf || !audioContext) return null;
        const t2Buf = files.find(f => f.id === track2Id)?.buffer;
        const totalDur = t2Buf ? Math.max(buf.duration, (mergeOffset/1000) + t2Buf.duration) : buf.duration;
        const offline = new OfflineAudioContext(buf.numberOfChannels, Math.max(1, Math.floor(totalDur * buf.sampleRate)), buf.sampleRate);
        const finalOutput = offline.createGain(); finalOutput.gain.value = masterGain;

        const lowF = offline.createBiquadFilter(); lowF.type = 'lowshelf'; lowF.frequency.value = 320; lowF.gain.value = eq.low;
        const midF = offline.createBiquadFilter(); midF.type = 'peaking'; midF.frequency.value = 1000; midF.Q.value = 1.0; midF.gain.value = eq.mid;
        const highF = offline.createBiquadFilter(); highF.type = 'highshelf'; highF.frequency.value = 3200; highF.gain.value = eq.high;
        const fShift = offline.createBiquadFilter(); fShift.type = 'peaking'; fShift.frequency.value = 1000 * genderShift; fShift.gain.value = 6;

        const f1Node = offline.createBiquadFilter(); f1Node.type = 'peaking'; f1Node.frequency.value = formant.f1; f1Node.Q.value = formant.resonance; f1Node.gain.value = 12;
        const f2Node = offline.createBiquadFilter(); f2Node.type = 'peaking'; f2Node.frequency.value = formant.f2; f2Node.Q.value = formant.resonance; f2Node.gain.value = 10;
        const f3Node = offline.createBiquadFilter(); f3Node.type = 'peaking'; f3Node.frequency.value = formant.f3; f3Node.Q.value = formant.resonance; f3Node.gain.value = 8;

        lowF.connect(midF); midF.connect(highF); highF.connect(fShift); fShift.connect(f1Node); f1Node.connect(f2Node); f2Node.connect(f3Node); f3Node.connect(finalOutput); finalOutput.connect(offline.destination);

        const s1 = offline.createBufferSource(); s1.buffer = buf; s1.detune.value = pitchCents;
        const g1 = offline.createGain();
        if(showAutomation) {
            g1.gain.setValueAtTime(volumeKeyframes[0].v, 0);
            volumeKeyframes.forEach(kf => g1.gain.linearRampToValueAtTime(kf.v, kf.t * buf.duration));
        }
        s1.connect(g1);

        if (track2Id && t2Buf) {
            const s2 = offline.createBufferSource(); s2.buffer = t2Buf; s2.detune.value = pitchCents;
            if (morphMode) {
                const conv = offline.createConvolver(); conv.buffer = t2Buf;
                const cg = offline.createGain(); cg.gain.value = 2.0;
                g1.connect(conv); conv.connect(cg); cg.connect(lowF);
            } else {
                g1.connect(lowF); const g2 = offline.createGain(); s2.connect(g2); g2.connect(lowF);
                s2.start(mergeOffset/1000);
            }
        } else g1.connect(lowF);
        
        s1.start(0);
        return await offline.startRendering();
    };

    const handlePlayPause = async () => {
        if(isPlaying) {
            if (sourceRef.current) { 
                try { sourceRef.current.stop(); } catch(e) {} 
                pauseOffsetRef.current = audioContext.currentTime - startTimeRef.current; 
                setIsPlaying(false); 
                setIsPaused(true); 
            }
            return;
        }
        if(!activeBuffer || !audioContext) return;
        const hasSelection = editTrim.end - editTrim.start > 1;
        const baseBuf = hasSelection ? AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end) : activeBuffer;
        const processedBuf = await renderStudioAudio(baseBuf);
        if(!processedBuf) return;
        const s = audioContext.createBufferSource(); s.buffer = processedBuf; s.connect(audioContext.destination);
        const startOffset = isPaused ? pauseOffsetRef.current : 0;
        if (startOffset >= processedBuf.duration) { pauseOffsetRef.current = 0; s.start(0); startTimeRef.current = audioContext.currentTime; }
        else { s.start(0, startOffset); startTimeRef.current = audioContext.currentTime - startOffset; }
        sourceRef.current = s; setIsPlaying(true); setIsPaused(false);
        s.onended = () => { if (Math.abs((audioContext.currentTime - startTimeRef.current) - processedBuf.duration) < 0.1) { setIsPlaying(false); setIsPaused(false); setPlayheadPos(0); pauseOffsetRef.current = 0; } };
    };

    const handleFade = async (type) => {
        if(!activeBuffer || !audioContext) return;
        pushUndo();
        const res = await AudioUtils.applyFade(audioContext, activeBuffer, type, editTrim.start, editTrim.end);
        onUpdateFile(res);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const fileId = e.dataTransfer.getData("fileId");
        if (fileId) setActiveFileId(fileId);
    };

    useEffect(() => {
        if(!canvasRef.current || !activeBuffer) return;
        const ctx = canvasRef.current.getContext('2d'); const w = canvasRef.current.width; const h = canvasRef.current.height;
        const data = activeBuffer.getChannelData(0); const step = Math.ceil(data.length/w);
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#f8f8f6'; ctx.fillRect(0,0,w,h);
        ctx.beginPath(); ctx.strokeStyle = '#3c78e8'; ctx.lineWidth = 1;
        for(let i=0;i<w;i++){ let min=1,max=-1; for(let j=0;j<step;j++){ const d=data[i*step+j]; if(d<min)min=d; if(d>max)max=d; } ctx.moveTo(i, h/2+min*h/2); ctx.lineTo(i, h/2+max*h/2); } ctx.stroke();
        const sX = (editTrim.start/100)*w; const eX = (editTrim.end/100)*w;
        ctx.fillStyle = 'rgba(60, 120, 232, 0.15)'; ctx.fillRect(sX, 0, eX-sX, h);
        ctx.strokeStyle = '#209ad6'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(sX,0); ctx.lineTo(sX,h); ctx.moveTo(eX,0); ctx.lineTo(eX,h); ctx.stroke();
        const phX = (playheadPos / 100) * w; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(phX, 0); ctx.lineTo(phX, h); ctx.stroke();
    }, [activeBuffer, editTrim, showAutomation, volumeKeyframes, playheadPos]);

    return (
        <div 
          className="flex-1 flex flex-col gap-4 animate-in fade-in overflow-hidden p-4 font-sans" 
          onMouseUp={()=>setDragTarget(null)}
          onDragOver={(e)=>e.preventDefault()}
          onDrop={handleDrop}
        >
            <div className="flex-[3] flex flex-col gap-4 min-h-0 font-sans">
                <div className="bg-white/50 rounded-xl border border-slate-300 p-2 flex justify-between items-center shadow-sm">
                    <div className="flex gap-1 font-sans">
                        <button onClick={handleUndo} disabled={undoStack.length === 0} title="실행 취소" className="p-2 hover:bg-slate-200 rounded text-slate-600 disabled:opacity-30 transition-colors"><Undo2 size={14}/></button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={() => { if(!activeBuffer || !audioContext) return; pushUndo(); setClipboard(AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end)); onUpdateFile(AudioUtils.deleteRange(audioContext, activeBuffer, editTrim.start, editTrim.end)); setEditTrim({start:0, end:0}); }} title="잘라내기" className="p-2 hover:bg-slate-200 rounded text-slate-600 transition-colors"><Scissors size={14}/></button>
                        <button onClick={() => { if(activeBuffer && audioContext) setClipboard(AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end)); }} title="복사" className="p-2 hover:bg-slate-200 rounded text-slate-600 transition-colors"><Copy size={14}/></button>
                        <button onClick={() => { if(!activeBuffer || !clipboard || !audioContext) return; pushUndo(); const pre = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, 0, editTrim.end); const post = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.end, 100); onUpdateFile(AudioUtils.concatBuffers(audioContext, AudioUtils.concatBuffers(audioContext, pre, clipboard), post)); }} disabled={!clipboard} title="붙여넣기" className="p-2 hover:bg-slate-200 rounded text-slate-600 disabled:opacity-30 transition-colors"><Clipboard size={14}/></button>
                        <button onClick={() => { if(!activeBuffer || !clipboard || !audioContext) return; pushUndo(); onUpdateFile(AudioUtils.mixBuffers(audioContext, activeBuffer, clipboard, editTrim.start)); }} disabled={!clipboard} title="오버레이 붙여넣기" className="p-2 hover:bg-slate-200 rounded text-indigo-500 disabled:opacity-30 transition-colors"><Layers size={14}/></button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={() => handleFade('in')} title="페이드 인" className="p-2 hover:bg-slate-200 rounded text-emerald-500 transition-colors"><TrendingUp size={14}/></button>
                        <button onClick={() => handleFade('out')} title="페이드 아웃" className="p-2 hover:bg-slate-200 rounded text-rose-500 transition-colors"><TrendingDown size={14}/></button>
                        <button onClick={() => { if(!activeBuffer || !audioContext) return; pushUndo(); const pre = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, 0, editTrim.start); const post = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.end, 100); const dur = (activeBuffer.duration * (editTrim.end - editTrim.start) / 100); onUpdateFile(AudioUtils.concatBuffers(audioContext, AudioUtils.concatBuffers(audioContext, pre, AudioUtils.createSilence(audioContext, dur)), post)); }} title="침묵" className="p-2 hover:bg-slate-200 rounded text-slate-400 transition-colors"><Eraser size={14}/></button>
                        <button onClick={()=>setShowStretchModal(true)} title="시간 늘리기" className="p-2 hover:bg-slate-200 rounded text-[#209ad6] transition-colors"><MoveHorizontal size={14}/></button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={async () => { if(!activeBuffer || !audioContext) return; const hasSel = editTrim.end - editTrim.start > 1; const b = hasSel ? AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end) : activeBuffer; const res = await renderStudioAudio(b); if(res) onAddToRack(res, (activeFile?.name || "Studio") + "_결과"); }} className="bg-[#a3cef0] hover:bg-[#209ad6] hover:text-white text-[#1f1e1d] px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 shadow-sm transition-colors font-sans"><LogIn size={14}/> 보관함에 저장</button>
                    </div>
                </div>
                <div className="flex-1 bg-white rounded-xl border border-slate-300 relative overflow-hidden shadow-inner font-sans">
                    {activeBuffer ? <canvas ref={canvasRef} width={1000} height={400} className="w-full h-full object-fill cursor-crosshair" 
                        onMouseDown={e=>{ const rect=e.currentTarget.getBoundingClientRect(); const p=(e.clientX-rect.left)/rect.width*100; if(Math.abs(p-editTrim.start)<2) setDragTarget('start'); else if(Math.abs(p-editTrim.end)<2) setDragTarget('end'); else setDragTarget('new'); if(dragTarget==='new') setEditTrim({start:p, end:p}); }}
                        onMouseMove={e=>{ if(!dragTarget) return; const rect=e.currentTarget.getBoundingClientRect(); const p=Math.max(0,Math.min(100, (e.clientX-rect.left)/rect.width*100)); if(dragTarget==='start') setEditTrim(pr=>({...pr, start:Math.min(p, pr.end)})); else if(dragTarget==='end') setEditTrim(pr=>({...pr, end:Math.max(p, pr.start)})); else setEditTrim({start:p, end:p}); }}
                    /> : <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 font-bold opacity-30 text-center px-8 text-sm gap-2">
                            <Upload size={32} />
                            보관함에서 파일을 선택하거나<br/>여기에 드래그하여 파일을 여세요
                         </div>}
                </div>
            </div>

            <div className="flex-[2] grid grid-cols-1 md:grid-cols-4 gap-4 min-h-0 overflow-y-auto custom-scrollbar font-sans">
                <div className="bg-white/40 rounded-xl border border-slate-300 p-3 flex flex-col gap-3">
                    <h4 className="text-[10px] font-black text-[#209ad6] uppercase tracking-widest flex items-center gap-2 font-sans"><Layers size={14}/> 합성 및 믹스</h4>
                    <select value={track2Id} onChange={e=>setTrack2Id(e.target.value)} className="w-full bg-white border border-slate-200 rounded p-1.5 text-[10px] outline-none font-bold">
                        <option value="">합성 트랙 선택...</option>
                        {files.filter(f=>f.id !== (activeFile ? activeFile.id : null)).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <div className="flex justify-between text-[10px] font-bold text-slate-600"><span>합성 오프셋</span><span>{mergeOffset}ms</span></div>
                    <input type="range" min="0" max="1000" value={mergeOffset} onChange={e=>setMergeOffset(Number(e.target.value))} className="w-full h-1 bg-slate-300 rounded appearance-none accent-[#209ad6]"/>
                    <label className="flex items-center gap-2 cursor-pointer mt-1 font-sans"><input type="checkbox" checked={morphMode} onChange={e=>setMorphMode(e.target.checked)} className="rounded text-[#209ad6]"/><span className="text-[10px] font-bold text-slate-500 font-sans">임펄스 모핑</span></label>
                    <div className="mt-auto pt-2 border-t border-slate-200 flex justify-between text-[10px] font-bold text-slate-600 font-sans"><span>마스터 볼륨</span><span>{Math.round(masterGain*100)}%</span></div>
                    <input type="range" min="0" max="2" step="0.1" value={masterGain} onChange={e=>setMasterGain(Number(e.target.value))} className="w-full h-1 bg-slate-300 rounded appearance-none accent-emerald-500"/>
                </div>

                <div className="bg-white/40 rounded-xl border border-slate-300 p-3 flex flex-col gap-3">
                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2 font-sans"><Activity size={14}/> 포먼트 및 공명</h4>
                    <div className="space-y-2">
                        {['f1', 'f2', 'f3'].map(f => (
                            <div key={f}>
                                <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-1 uppercase font-sans"><span>{f} (Hz)</span><span>{formant[f]}</span></div>
                                <input type="range" min="200" max={f === 'f1' ? 1200 : (f === 'f2' ? 3000 : 5000)} value={formant[f]} onChange={e=>setFormant({...formant, [f]: Number(e.target.value)})} className="w-full h-1 bg-slate-300 appearance-none accent-emerald-500"/>
                            </div>
                        ))}
                        <div className="pt-1 border-t border-slate-200">
                             <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-1 uppercase font-sans"><span>공명</span><span>{formant.resonance.toFixed(1)}</span></div>
                             <input type="range" min="1" max="20" step="0.1" value={formant.resonance} onChange={e=>setFormant({...formant, resonance: Number(e.target.value)})} className="w-full h-1 bg-slate-300 appearance-none accent-pink-500"/>
                        </div>
                    </div>
                </div>

                <div className="bg-white/40 rounded-xl border border-slate-300 p-3 flex flex-col gap-3">
                    <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2 font-sans"><SlidersHorizontal size={14}/> 밴드 EQ</h4>
                    <div className="space-y-3">
                        {['low', 'mid', 'high'].map(band => (
                            <div key={band}>
                                <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-1 uppercase font-sans"><span>{band}</span><span>{eq[band]}dB</span></div>
                                <input type="range" min="-24" max="24" value={eq[band]} onChange={e=>setEq({...eq, [band]: Number(e.target.value)})} className="w-full h-1 bg-slate-300 appearance-none accent-indigo-500 font-sans"/>
                            </div>
                        ))}
                    </div>
                    <div className="mt-auto flex justify-end gap-2">
                        <button onClick={handleStop} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-600 transition-all font-sans"><Square size={14} fill="currentColor"/></button>
                        <button onClick={handlePlayPause} className="flex-1 py-2 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-lg font-bold text-[10px] flex items-center justify-center gap-2">
                            {isPlaying ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>} {isPlaying ? '일시정지' : '미리보기'}
                        </button>
                    </div>
                </div>

                <div className="bg-white/40 rounded-xl border border-slate-300 p-3 flex flex-col gap-3">
                    <h4 className="text-[10px] font-black text-pink-500 uppercase tracking-widest flex items-center gap-2 font-sans"><Music size={14}/> 음색 및 피치</h4>
                    <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-bold text-slate-600 font-sans"><span>피치 (Cents)</span><span>{pitchCents}</span></div>
                        <input type="range" min="-1200" max="1200" step="10" value={pitchCents} onChange={e=>setPitchCents(Number(e.target.value))} className="w-full h-1 bg-slate-300 rounded appearance-none accent-blue-500 font-sans"/>
                        <div className="flex justify-between text-[10px] font-bold text-slate-600 font-sans font-sans"><span>젠더 시프트</span><span>{genderShift.toFixed(2)}x</span></div>
                        <input type="range" min="0.5" max="2.0" step="0.05" value={genderShift} onChange={e=>setGenderShift(Number(e.target.value))} className="w-full h-1 bg-slate-300 rounded appearance-none accent-pink-400 font-sans"/>
                    </div>
                </div>
            </div>
            {showStretchModal && <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50 animate-in zoom-in-95 font-sans"><div className="bg-[#e8e8e6] p-6 rounded-xl border border-slate-300 w-80 shadow-2xl font-sans"><h3 className="font-bold text-[#209ad6] mb-4 uppercase tracking-tighter text-sm font-sans font-sans">시간 늘리기 ({stretchRatio}%)</h3><input type="range" min="50" max="200" value={stretchRatio} onChange={e=>setStretchRatio(Number(e.target.value))} className="w-full h-1 bg-slate-300 rounded mb-6 appearance-none accent-[#209ad6]"/><button onClick={() => {
                if(!activeBuffer || !audioContext) return;
                pushUndo();
                const sel = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.start, editTrim.end);
                const ratio = stretchRatio/100;
                const off = new OfflineAudioContext(sel.numberOfChannels, Math.floor(sel.length*ratio), sel.sampleRate);
                const s = off.createBufferSource(); s.buffer=sel; s.playbackRate.value=1/ratio; s.connect(off.destination); s.start();
                off.startRendering().then(str => {
                    const pre = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, 0, editTrim.start);
                    const post = AudioUtils.createBufferFromSlice(audioContext, activeBuffer, editTrim.end, 100);
                    onUpdateFile(AudioUtils.concatBuffers(audioContext, AudioUtils.concatBuffers(audioContext, pre, str), post));
                    setShowStretchModal(false);
                });
            }} className="w-full py-3 bg-[#209ad6] text-white rounded-xl font-bold mb-2 font-sans transition-all">적용</button><button onClick={()=>setShowStretchModal(false)} className="w-full py-2 text-slate-500 font-bold text-xs uppercase font-sans font-sans">취소</button></div></div>}
        </div>
    );
};

// ==========================================
// Component: Consonant Tab
// ==========================================
const ConsonantTab = ({ audioContext, files, onAddToRack }) => {
    const [vowelId, setVowelId] = useState("");
    const [consonantId, setConsonantId] = useState("");
    const [offsetMs, setOffsetMs] = useState(0);
    const [consonantGain, setConsonantGain] = useState(1.0);
    const [vowelGain, setVowelGain] = useState(1.0);
    const [isPlaying, setIsPlaying] = useState(false);
    const sourceRef = useRef(null);

    const mixConsonant = async () => {
        const v = files.find(f => f.id === vowelId)?.buffer;
        const c = files.find(f => f.id === consonantId)?.buffer;
        if (!v || !audioContext) return null;
        const offSample = Math.floor((offsetMs/1000) * v.sampleRate);
        const totalSamples = c ? Math.max(v.length, offSample + c.length) : v.length;
        const offline = new OfflineAudioContext(v.numberOfChannels, totalSamples, v.sampleRate);
        const gV = offline.createGain(); gV.gain.value = vowelGain;
        const sV = offline.createBufferSource(); sV.buffer = v;
        sV.connect(gV); gV.connect(offline.destination); sV.start(0);
        if(c) {
            const gC = offline.createGain(); gC.gain.value = consonantGain;
            const sC = offline.createBufferSource(); sC.buffer = c;
            sC.connect(gC); gC.connect(offline.destination); sC.start(Math.max(0, offsetMs/1000));
        }
        return await offline.startRendering();
    };

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in overflow-hidden font-sans">
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm font-sans">
                <div className="flex items-center gap-3 border-b border-slate-200 pb-4 font-sans"><div className="p-2 bg-indigo-500 rounded-xl text-white font-sans font-sans font-sans font-sans font-sans"><Combine size={24}/></div><h2 className="text-xl font-black text-slate-800 tracking-tight font-sans">자음-모음 합성기</h2></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-sans">
                    <div className="space-y-4 bg-slate-50/50 p-6 rounded-2xl border border-slate-200 font-sans">
                        <label className="text-xs font-black text-indigo-500 uppercase tracking-widest block font-sans">Vowel (모음)</label>
                        <select value={vowelId} onChange={e=>setVowelId(e.target.value)} className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none focus:border-indigo-400 font-sans">{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        <div className="flex justify-between text-xs font-bold text-slate-500 px-1 font-sans"><span>볼륨</span><span>{Math.round(vowelGain*100)}%</span></div>
                        <input type="range" min="0" max="2" step="0.1" value={vowelGain} onChange={e=>setVowelGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500 font-sans"/>
                    </div>
                    <div className="space-y-4 bg-slate-50/50 p-6 rounded-2xl border border-slate-200 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
                        <label className="text-xs font-black text-pink-500 uppercase tracking-widest block font-sans">Consonant (자음)</label>
                        <select value={consonantId} onChange={e=>setConsonantId(e.target.value)} className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none focus:border-pink-400 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"><option value="">선택 안 함</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        <div className="flex justify-between text-xs font-bold text-slate-500 px-1 font-sans"><span>볼륨</span><span>{Math.round(consonantGain*100)}%</span></div>
                        <input type="range" min="0" max="2" step="0.1" value={consonantGain} onChange={e=>setConsonantGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-pink-500 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"/>
                    </div>
                </div>
                <div className="bg-white border border-slate-300 p-6 rounded-2xl shadow-inner space-y-4 font-sans font-sans">
                    <div className="flex justify-between items-end font-sans">
                        <div className="space-y-1 font-sans font-sans"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans font-sans">Offset Control</span><h3 className="text-sm font-bold text-slate-700 font-sans font-sans">자음 타격 오프셋: <span className="text-indigo-600 font-sans">{offsetMs}ms</span></h3></div>
                        <div className="flex gap-3 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
                            <button onClick={async () => { if(!audioContext) return; if(sourceRef.current) sourceRef.current.stop(); const b = await mixConsonant(); if(b) { const s = audioContext.createBufferSource(); s.buffer = b; s.connect(audioContext.destination); s.start(); sourceRef.current = s; setIsPlaying(true); s.onended = () => setIsPlaying(false); } }} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-100 active:scale-95 transition-all text-sm font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"><Play size={18} fill="currentColor"/> {isPlaying ? '재생 중' : '미리보기'}</button>
                            <button onClick={async () => { if(!audioContext) return; const b = await mixConsonant(); if(b) onAddToRack(b, "Consonant_Mix"); }} className="px-8 py-3 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl font-bold flex items-center gap-2 transition-all text-sm font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">보관함에 저장</button>
                        </div>
                    </div>
                    <input type="range" min="-200" max="500" value={offsetMs} onChange={e=>setOffsetMs(Number(e.target.value))} className="w-full h-2 bg-slate-100 rounded-full appearance-none accent-indigo-400 border border-slate-200 font-sans font-sans font-sans"/>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// Component: Advanced Tract Tab (Simulator)
// ==========================================
const AdvancedTractTab = ({ audioContext, files, onAddToRack }) => {
    const [larynxParams, setLarynxParams] = useState({ jitterOn: false, jitterDepth: 10, jitterRate: 5, breathOn: true, breathGain: 0.01, noiseSourceType: 'generated', noiseSourceFileId: "", loopOn: true });
    const [tractSourceType, setTractSourceType] = useState('synth'); 
    const [tractSourceFileId, setTractSourceFileId] = useState("");
    const [advDuration, setAdvDuration] = useState(2.0);
    const [fadeOutDuration, setFadeOutDuration] = useState(0.1); 
    const [isAdvPlaying, setIsAdvPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [playHeadPos, setPlayHeadPos] = useState(0); 
    const [liveTract, setLiveTract] = useState({ x: 0.5, y: 0.4, lips: 0.7, lipLen: 0.5, throat: 0.5, nasal: 0.2 }); 
    const [simIndex, setSimIndex] = useState(1);
    const [clickToAdd, setClickToAdd] = useState(false);
    
    // History
    const [simUndoStack, setSimUndoStack] = useState([]);

    const liveAudioRef = useRef(null); 
    const animRef = useRef(null);
    const canvasRef = useRef(null);
    const lastRenderedRef = useRef(null);
    const simStartTimeRef = useRef(0);
    const simPauseOffsetRef = useRef(0);
    const simPlaySourceRef = useRef(null);

    const [advTracks, setAdvTracks] = useState([
        { id: 'tongueX', name: '혀 위치 (X)', group: 'adj', color: '#60a5fa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'tongueY', name: '혀 높이 (Y)', group: 'adj', color: '#4ade80', points: [{t:0, v:0.4}, {t:1, v:0.4}], min:0, max:1 },
        { id: 'lips',    name: '입술 열기', group: 'adj', color: '#f472b6', points: [{t:0, v:0.7}, {t:1, v:0.7}], min:0, max:1 },
        { id: 'lipLen',  name: '입술 길이', group: 'adj', color: '#db2777', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 }, 
        { id: 'throat',  name: '목 조임',   group: 'adj', color: '#a78bfa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'nasal',   name: '비성 (콧소리)', group: 'adj', color: '#fb923c', points: [{t:0, v:0.2}, {t:1, v:0.2}], min:0, max:1 },
        { id: 'pitch',   name: '음정 (Hz)', group: 'edit', color: '#eab308', points: [{t:0, v:220}, {t:1, v:220}], min:50, max:800 },
        { id: 'gain',    name: '게인',     group: 'edit', color: '#ef4444', points: [{t:0, v:0}, {t:0.1, v:1}, {t:0.9, v:1}, {t:1, v:0}], min:0, max:1 },
        { id: 'breath',  name: '숨소리',   group: 'edit', color: '#22d3ee', points: [{t:0, v:0.01}, {t:1, v:0.01}], min:0, max:0.1 }
    ]);
    const [selectedTrackId, setSelectedTrackId] = useState('pitch'); 
    const [hoveredKeyframe, setHoveredKeyframe] = useState(null);
    const [draggingKeyframe, setDraggingKeyframe] = useState(null);

    const pushSimUndo = useCallback(() => {
        setSimUndoStack(prev => [...prev.slice(-9), JSON.parse(JSON.stringify(advTracks))]);
    }, [advTracks]);

    const handleSimUndo = useCallback(() => {
        if (simUndoStack.length === 0) return;
        const prevTracks = simUndoStack[simUndoStack.length - 1];
        setSimUndoStack(prev => prev.slice(0, -1));
        setAdvTracks(prevTracks);
    }, [simUndoStack]);

    const updateLiveAudioParams = useCallback((x, y, l, t, len, n, f1, f2, f3, nasF) => {
        if (!audioContext) return; const now = audioContext.currentTime; 
        const lF = 1.0 - (len * 0.3); const liF = 0.5 + (l * 0.5);
        const fr1 = (200 + (1 - y) * 600 - (t * 50)) * lF * liF; 
        const fr2 = (800 + x * 1400) * lF * liF; 
        const fr3 = (2000 + l * 1500) * lF;
        if(f1) f1.frequency.setTargetAtTime(Math.max(50, fr1), now, 0.01); 
        if(f2) f2.frequency.setTargetAtTime(fr2, now, 0.01); 
        if(f3) f3.frequency.setTargetAtTime(fr3, now, 0.01); 
        if(nasF) nasF.frequency.setTargetAtTime(Math.max(400, 10000 - (n * 9000)), now, 0.01);
    }, [audioContext]);

    const updateLiveAudio = useCallback((x, y, l, t, len, n) => { 
        if (liveAudioRef.current) updateLiveAudioParams(x, y, l, t, len, n, liveAudioRef.current.f1, liveAudioRef.current.f2, liveAudioRef.current.f3, liveAudioRef.current.nasF); 
    }, [updateLiveAudioParams]);

    const startLivePreview = useCallback(() => {
        if (!audioContext || liveAudioRef.current) return;
        let sNode;
        if (tractSourceType === 'file' && tractSourceFileId) { 
            const f = files.find(f => f.id === tractSourceFileId); 
            if (f?.buffer) { sNode = audioContext.createBufferSource(); sNode.buffer = f.buffer; sNode.loop = larynxParams.loopOn; } 
        }
        if (!sNode) { sNode = audioContext.createOscillator(); sNode.type = 'sawtooth'; sNode.frequency.value = 220; }
        const g = audioContext.createGain(); g.gain.value = 0.5;
        const f1 = audioContext.createBiquadFilter(); f1.type = 'peaking'; f1.Q.value = 4; f1.gain.value = 12;
        const f2 = audioContext.createBiquadFilter(); f2.type = 'peaking'; f2.Q.value = 4; f2.gain.value = 12;
        const f3 = audioContext.createBiquadFilter(); f3.type = 'peaking'; f3.Q.value = 4; f3.gain.value = 10;
        const nasF = audioContext.createBiquadFilter(); nasF.type = 'lowpass';
        updateLiveAudioParams(liveTract.x, liveTract.y, liveTract.lips, liveTract.throat, liveTract.lipLen, liveTract.nasal, f1, f2, f3, nasF);
        sNode.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); nasF.connect(g); g.connect(audioContext.destination);
        sNode.start(); liveAudioRef.current = { sNode, g, f1, f2, f3, nasF };
    }, [audioContext, tractSourceType, tractSourceFileId, files, larynxParams, liveTract, updateLiveAudioParams]);

    const stopLivePreview = useCallback(() => { if (liveAudioRef.current) { try { liveAudioRef.current.sNode.stop(); } catch(e) {} liveAudioRef.current.sNode.disconnect(); liveAudioRef.current = null; } }, []);

    const renderAdvancedAudio = useCallback(async () => {
        if (!audioContext) return null;
        const sr = audioContext.sampleRate; const len = Math.max(1, Math.floor(sr * advDuration)); const offline = new OfflineAudioContext(1, len, sr);
        let sNode;
        if (tractSourceType === 'file' && tractSourceFileId) { const f = files.find(f => f.id === tractSourceFileId); if (f?.buffer) { sNode = offline.createBufferSource(); sNode.buffer = f.buffer; sNode.loop = larynxParams.loopOn; } }
        if (!sNode) { sNode = offline.createOscillator(); sNode.type = 'sawtooth'; const tP = advTracks.find(t=>t.id==='pitch').points; if (tP.length > 0) { sNode.frequency.setValueAtTime(tP[0].v, 0); tP.forEach(p => sNode.frequency.linearRampToValueAtTime(p.v, p.t * advDuration)); } }
        let nNode;
        if (larynxParams.noiseSourceType === 'file' && larynxParams.noiseSourceFileId) { const f = files.find(f => f.id === larynxParams.noiseSourceFileId); if (f?.buffer) { nNode = offline.createBufferSource(); nNode.buffer = f.buffer; nNode.loop = larynxParams.loopOn; } }
        if (!nNode) { nNode = offline.createBufferSource(); const nb = offline.createBuffer(1, len, sr); const nd = nb.getChannelData(0); for(let i=0; i<len; i++) nd[i] = Math.random() * 2 - 1; nNode.buffer = nb; }
        const mG = offline.createGain(); const nG = offline.createGain(); const fG = offline.createGain(); 
        const nF = offline.createBiquadFilter(); nF.type = 'lowpass'; nF.frequency.value = 6000;
        nNode.connect(nF); nF.connect(nG); sNode.connect(mG); mG.connect(fG); nG.connect(fG);
        const getPts = (id) => advTracks.find(t=>t.id===id).points;
        const tI=getPts('gain'), tB=getPts('breath');
        if (tI.length > 0) { mG.gain.setValueAtTime(tI[0].v, 0); tI.forEach(p => mG.gain.linearRampToValueAtTime(p.v, p.t * advDuration)); }
        if (tB.length > 0 && larynxParams.breathOn) { nG.gain.setValueAtTime(tB[0].v * 0.4, 0); tB.forEach(p => nG.gain.linearRampToValueAtTime(p.v * 0.4, p.t * advDuration)); } else { nG.gain.value = 0; }
        const startFade = Math.max(0, advDuration - fadeOutDuration); fG.gain.setValueAtTime(1, 0); fG.gain.setValueAtTime(1, startFade); fG.gain.linearRampToValueAtTime(0, advDuration);
        const f1=offline.createBiquadFilter(), f2=offline.createBiquadFilter(), f3=offline.createBiquadFilter(), nasF=offline.createBiquadFilter(); 
        [f1,f2,f3].forEach(f=>{ f.type='peaking'; f.Q.value=4; f.gain.value=12; }); nasF.type='lowpass';
        for(let i=0; i<=120; i++) {
            const t = i/120; const time = t*advDuration;
            const getV = (pts) => { if(pts.length===0) return 0; if(pts.length===1) return pts[0].v; const idx = pts.findIndex(p=>p.t>=t); if(idx===-1) return pts[pts.length-1].v; if(idx===0) return pts[0].v; const p1=pts[idx-1], p2=pts[idx]; return p1.v + (p2.v - p1.v) * ((t - p1.t) / (p2.t - p1.t)); }
            const x=getV(getPts('tongueX')), y=getV(getPts('tongueY')), l=getV(getPts('lips')), th=getV(getPts('throat')), ln=getV(getPts('lipLen')), n=getV(getPts('nasal'));
            const lenF = 1.0 - (ln * 0.3); const lipF = 0.5 + (l * 0.5);
            f1.frequency.linearRampToValueAtTime(Math.max(50, (200 + (1 - y) * 600 - (th * 50))) * lenF * lipF, time); f2.frequency.linearRampToValueAtTime((800 + x * 1400) * lenF * lipF, time); f3.frequency.linearRampToValueAtTime((2000 + l * 1500) * lenF, time); f1.Q.linearRampToValueAtTime(2 + th * 4, time); nasF.frequency.linearRampToValueAtTime(Math.max(400, 10000 - (n * 9000)), time);
        }
        fG.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); nasF.connect(offline.destination); 
        sNode.start(0); nNode.start(0); 
        return await offline.startRendering();
    }, [audioContext, advDuration, advTracks, tractSourceType, tractSourceFileId, files, larynxParams, fadeOutDuration]);

    const handlePlayPauseSim = async () => {
        if(!audioContext) return;
        if(isAdvPlaying) {
            if(simPlaySourceRef.current) {
                try { simPlaySourceRef.current.stop(); } catch(e) {}
                simPauseOffsetRef.current += audioContext.currentTime - simStartTimeRef.current;
                if(animRef.current) cancelAnimationFrame(animRef.current);
                setIsAdvPlaying(false);
                setIsPaused(true);
            }
            return;
        }
        const res = lastRenderedRef.current || await renderAdvancedAudio();
        if(!res) return;
        lastRenderedRef.current = res;
        const s = audioContext.createBufferSource(); s.buffer = res; s.connect(audioContext.destination);
        let startFrom = isPaused ? simPauseOffsetRef.current : (playHeadPos * res.duration);
        if(startFrom >= res.duration) startFrom = 0;
        s.start(0, startFrom); simPlaySourceRef.current = s; simStartTimeRef.current = audioContext.currentTime; simPauseOffsetRef.current = startFrom;
        setIsAdvPlaying(true); setIsPaused(false);
        const animate = () => {
            if(!audioContext) return;
            const current = simPauseOffsetRef.current + (audioContext.currentTime - simStartTimeRef.current);
            setPlayHeadPos(current / (res.duration || 1));
            if (current < res.duration) animRef.current = requestAnimationFrame(animate);
            else { setIsAdvPlaying(false); setPlayHeadPos(0); simPauseOffsetRef.current = 0; }
        };
        animRef.current = requestAnimationFrame(animate);
    };

    useEffect(() => { 
        lastRenderedRef.current = null; 
        if(isAdvPlaying || isPaused) {
           if(simPlaySourceRef.current) try { simPlaySourceRef.current.stop(); } catch(e) {}
           if(animRef.current) cancelAnimationFrame(animRef.current); 
           setIsAdvPlaying(false); setIsPaused(false);
        }
    }, [advTracks, advDuration, tractSourceType, tractSourceFileId, larynxParams]);

    const handleTimelineMouseDown = useCallback((e) => {
        if(!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); const my = e.clientY - rect.top; const mx = e.clientX - rect.left; const t = Math.max(0, Math.min(1, mx / rect.width));
        if (my < RULER_HEIGHT) { 
            setPlayHeadPos(t); simPauseOffsetRef.current = t * (lastRenderedRef.current?.duration || advDuration);
            if(isAdvPlaying) { 
                if(simPlaySourceRef.current) try { simPlaySourceRef.current.stop(); } catch(e) {} 
                if(animRef.current) cancelAnimationFrame(animRef.current); 
                setIsAdvPlaying(false); setIsPaused(true); 
            }
            setDraggingKeyframe({ isPlayhead: true }); return; 
        }
        const track = advTracks.find(tr => tr.id === selectedTrackId); if (!track) return;
        const graphH = rect.height - RULER_HEIGHT;
        const hitIdx = track.points.findIndex(p => Math.hypot((p.t * rect.width)-mx, (RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * graphH)-my) < 15);
        if (hitIdx !== -1) {
            pushSimUndo();
            setDraggingKeyframe({ trackId: selectedTrackId, index: hitIdx });
        }
        else if (clickToAdd) {
            pushSimUndo();
            const val = track.min + ((1 - ((my - RULER_HEIGHT) / graphH)) * (track.max - track.min));
            const nPts = [...track.points, { t, v: val }].sort((a, b) => a.t - b.t);
            setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: nPts } : tr));
            setDraggingKeyframe({ trackId: selectedTrackId, index: nPts.findIndex(p => p.t === t) });
        }
    }, [selectedTrackId, advTracks, clickToAdd, isAdvPlaying, advDuration, pushSimUndo]);

    useEffect(() => {
        if(!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d'); const w = canvasRef.current.width; const h = canvasRef.current.height;
        const track = advTracks.find(t => t.id === selectedTrackId);
        if (!track) return; const graphH = h - RULER_HEIGHT;
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#f8f8f6'; ctx.fillRect(0, RULER_HEIGHT, w, graphH);
        ctx.strokeStyle = '#d1d1cf'; ctx.lineWidth = 1.2; ctx.beginPath(); for(let i=0; i<=10; i++) { const x = (i/10)*w; ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, h); } for(let i=0; i<=4; i++) { const y = RULER_HEIGHT + (i/4)*graphH; ctx.moveTo(0,y); ctx.lineTo(w,y); } ctx.stroke();
        ctx.beginPath(); ctx.strokeStyle = track.color; ctx.lineWidth = 2.8; track.points.forEach((p, i) => { const x = p.t * w; const normV = (p.v - track.min) / (track.max - track.min); const y = RULER_HEIGHT + (1 - normV) * graphH; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
        track.points.forEach((p, i) => { const x = p.t * w; const normV = (p.v - track.min) / (track.max - track.min); const y = RULER_HEIGHT + (1 - normV) * graphH; const isHovered = hoveredKeyframe && hoveredKeyframe.trackId === selectedTrackId && hoveredKeyframe.index === i; ctx.fillStyle = isHovered ? '#1f1e1d' : track.color; ctx.beginPath(); ctx.arc(x, y, isHovered ? 7 : 5, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); });
        ctx.fillStyle = '#d1d1cf'; ctx.fillRect(0, 0, w, RULER_HEIGHT); ctx.strokeStyle = '#a8a8a6'; ctx.beginPath(); ctx.moveTo(0, RULER_HEIGHT); ctx.lineTo(w, RULER_HEIGHT); ctx.stroke();
        const playX = playHeadPos * w; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(playX, 0); ctx.lineTo(playX, h); ctx.stroke(); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(playX - 7, 0); ctx.lineTo(playX + 7, 0); ctx.lineTo(playX, RULER_HEIGHT - 4); ctx.fill();
    }, [selectedTrackId, advTracks, playHeadPos, hoveredKeyframe]);

    return (
        <div className="flex-1 flex flex-col p-4 gap-4 animate-in fade-in overflow-hidden font-sans" onMouseUp={() => setDraggingKeyframe(null)}>
            <div className="flex-[3] flex gap-4 min-h-0 overflow-hidden">
                <div className="flex-1 bg-white/60 rounded-2xl border border-slate-300 flex flex-col relative overflow-hidden shadow-sm">
                    <div className="flex-1 relative flex items-center justify-center p-3 min-h-0">
                        <svg viewBox="55 55 290 290" className="absolute inset-0 w-full h-full opacity-[0.08] pointer-events-none fill-none stroke-slate-900 stroke-2"><path d="M 120 350 Q 120 300 120 280 Q 120 180 180 120 Q 220 80 280 80 Q 320 80 340 120 Q 350 140 350 180 L 350 200 Q 350 220 340 240 Q 330 260 300 280 L 250 300 Q 200 320 180 350" /><path d="M 280 140 Q 295 135 310 140" /><circle cx="300" cy="155" r="4" fill="currentColor" /><path d="M 350 180 L 375 200 L 355 215 Q 370 220 370 235 Q 370 250 350 255 L 350 270 Q 350 310 300 335 L 200 335" /><path d="M 185 200 Q 170 200 170 225 Q 170 250 185 250" /></svg>
                        <svg viewBox="55 55 290 290" className="w-full h-full max-h-full max-w-lg filter drop-shadow-lg z-10"><path d={`M 150 350 L 150 280 Q 150 150 250 150 Q 320 150 350 ${225 - liveTract.lips * 40} L 350 ${225 + liveTract.lips * 40} Q 320 350 250 350 Z`} fill="#f8fafc" stroke="#64748b" strokeWidth="2.5" /><path d="M 140 350 L 160 350" stroke="#94a3b8" strokeWidth={5 + liveTract.throat * 20} strokeLinecap="round" opacity="0.6"/><path d={`M 180 350 Q ${180 + liveTract.x * 120} ${330 - liveTract.y * 120} ${280 + liveTract.x * 50} ${250 + liveTract.y * 50}`} stroke="#f472b6" strokeWidth={18 + liveTract.throat * 12} strokeLinecap="round" fill="none" /><ellipse cx={350 + liveTract.lipLen * 20} cy="225" rx={6 + liveTract.lipLen * 30} ry={3 + liveTract.lips * 40} fill="#db2777" opacity="0.85" /></svg>
                        <div className="absolute inset-0 flex z-20">
                            <div className="flex-1 cursor-crosshair" onMouseDown={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const update = (ce) => { const x = Math.max(0, Math.min(1, (ce.clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, 1 - (ce.clientY - rect.top) / rect.height)); setLiveTract(prev => { const n = { ...prev, x, y }; updateLiveAudio(n.x, n.y, n.lips, n.throat, n.lipLen, n.nasal); return n; }); }; update(e); startLivePreview(); const mv = (me) => update(me); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); stopLivePreview(); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); }}></div>
                            <div className="w-36 bg-slate-400/5 hover:bg-slate-400/10 transition-colors cursor-move border-l border-slate-200" onMouseDown={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const update = (ce) => { const lipLen = Math.max(0, Math.min(1, (ce.clientX - rect.left) / rect.width)); const lips = Math.max(0, Math.min(1, 1 - (ce.clientY - rect.top) / rect.height)); setLiveTract(prev => { const n = { ...prev, lips, lipLen }; updateLiveAudio(n.x, n.y, n.lips, n.throat, n.lipLen, n.nasal); return n; }); }; update(e); startLivePreview(); const mv = (me) => update(me); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); stopLivePreview(); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); }}>
                                <div className="h-full w-full flex flex-col items-center justify-center opacity-30 pointer-events-none text-center p-2"><MoveHorizontal className="w-5 h-5 mb-1"/><span className="text-[8px] font-black uppercase tracking-widest">입술 컨트롤</span></div>
                            </div>
                        </div>
                    </div>
                    <div className="p-2 px-4 bg-white/80 border-t border-slate-200 flex justify-between items-center backdrop-blur-md shrink-0">
                        <button onClick={()=>{const t=playHeadPos; pushSimUndo(); setAdvTracks(prev=>prev.map(track=>{if(track.group!=='adj')return track;let val=null;if(track.id==='tongueX')val=liveTract.x;else if(track.id==='tongueY')val=liveTract.y;else if(track.id==='lips')val=liveTract.lips;else if(track.id==='lipLen')val=liveTract.lipLen;else if(track.id==='throat')val=liveTract.throat;else if(track.id==='nasal')val=liveTract.nasal;if(val===null)return track;const other=track.points.filter(p=>Math.abs(p.t-t)>0.005);return{...track,points:[...other,{t,v:val}].sort((a,b)=>a.t-b.t)};}));}} className="bg-[#209ad6] hover:bg-[#1a85b9] text-white px-4 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 active:scale-95 transition-all"><CircleDot className="w-3.5 h-3.5"/> 기록</button>
                        <div className="flex gap-1.5">
                            <button onClick={handlePlayPauseSim} className="bg-[#209ad6] hover:bg-[#1a85b9] px-4 py-1.5 rounded-lg text-white font-bold text-xs flex items-center gap-1 active:scale-95 transition-all">{isAdvPlaying ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>} {isAdvPlaying ? '일시정지' : '재생'}</button>
                            <button onClick={async()=>{ const res = await renderAdvancedAudio(); if(res) onAddToRack(res, "시뮬레이션_" + simIndex); setSimIndex(si => si + 1); }} className="bg-[#a3cef0] hover:bg-[#209ad6] hover:text-white text-[#1f1e1d] px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors">보관함에 저장</button>
                        </div>
                    </div>
                </div>
                <div className="w-72 bg-white/40 rounded-2xl border border-slate-300 p-3 flex flex-col gap-3 overflow-y-auto shrink-0 custom-scrollbar">
                    <h3 className="font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 text-[10px]"><Sliders size={20} className="text-[#209ad6]"/> 설정</h3>
                    <div className="space-y-4">
                        <div className="bg-white/50 p-2.5 rounded-xl border border-slate-200">
                           <span className="text-[9px] text-slate-500 font-bold uppercase block mb-1">음성 프리셋</span>
                           <div className="grid grid-cols-5 gap-1">{['A','I','U','E','O'].map(v=><button key={v} onClick={()=>{ let tX=0.5, tY=0.5, lips=0.5, len=0.5; switch(v) { case 'A': tX=0.2; tY=0.1; lips=1.0; len=0.5; break; case 'I': tX=0.9; tY=1.0; lips=1.0; len=1.0; break; case 'U': tX=0.2; tY=0.9; lips=0.2; len=0.1; break; case 'E': tX=0.8; tY=0.6; lips=0.8; len=0.8; break; case 'O': tX=0.2; tY=0.5; lips=0.4; len=0.2; break; } setLiveTract(prev=>({...prev, x:tX, y:tY, lips, lipLen:len})); updateLiveAudio(tX, tY, lips, liveTract.throat, len, liveTract.nasal); }} className="bg-white border border-slate-200 hover:bg-[#209ad6] hover:text-white text-slate-600 h-7 rounded-lg text-[10px] font-black shadow-xs transition-colors">{v}</button>)}</div>
                        </div>

                        <div className="space-y-3 px-1 text-[10px]">
                            {[
                                {id:'lips', label:'입술 열기', color:'accent-pink-400'},
                                {id:'lipLen', label:'입술 길이', color:'accent-pink-600'},
                                {id:'throat', label:'목 조임', color:'accent-purple-400'},
                                {id:'nasal', label:'비성 (콧소리)', color:'accent-orange-400'}
                            ].map(p => (
                                <div key={p.id} className="space-y-1">
                                    <div className="flex justify-between font-bold text-slate-500 uppercase tracking-tighter"><span>{p.label}</span><span>{Math.round(liveTract[p.id]*100)}%</span></div>
                                    <input type="range" min="0" max="1" step="0.01" value={liveTract[p.id]} 
                                           onChange={e=>{ const v=Number(e.target.value); const nxt = {...liveTract, [p.id]:v}; setLiveTract(nxt); updateLiveAudio(nxt.x, nxt.y, nxt.lips, nxt.throat, nxt.lipLen, nxt.nasal); }} 
                                           className={`w-full h-1 bg-slate-300 appearance-none rounded-full ${p.color}`}/>
                                </div>
                            ))}
                            <div className="h-px bg-slate-200 my-1"></div>
                            <div className="space-y-1"><span className="text-[9px] text-slate-500 font-bold uppercase">음원 소스 (Base)</span><select value={tractSourceType} onChange={e=>setTractSourceType(e.target.value)} className="w-full bg-white border border-slate-200 rounded p-1 outline-none font-bold text-[10px]"><option value="synth">기본 신디사이저</option><option value="file">보관함 파일</option></select></div>
                            {tractSourceType==='file' && <select value={tractSourceFileId} onChange={e=>setTractSourceFileId(e.target.value)} className="w-full bg-white border border-slate-200 rounded p-1 text-[9px] mt-1">{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>}
                            
                            <div className="space-y-1"><span className="text-[9px] text-slate-500 font-bold uppercase">노이즈 소스 (Noise)</span><select value={larynxParams.noiseSourceType} onChange={e=>setLarynxParams({...larynxParams, noiseSourceType:e.target.value})} className="w-full bg-white border border-slate-200 rounded p-1 outline-none font-bold text-[10px]"><option value="generated">기본 화이트 노이즈</option><option value="file">보관함 파일</option></select></div>
                            {larynxParams.noiseSourceType==='file' && <select value={larynxParams.noiseSourceFileId} onChange={e=>setLarynxParams({...larynxParams, noiseSourceFileId:e.target.value})} className="w-full bg-white border border-slate-200 rounded p-1 text-[9px] mt-1">{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>}

                            <div className="flex justify-between items-center pt-2 font-bold text-slate-600 uppercase"><span>반복 재생</span><input type="checkbox" checked={larynxParams.loopOn} onChange={e=>setLarynxParams(prev=>({...prev, loopOn:e.target.checked}))} className="w-3.5 h-3.5 rounded text-[#209ad6] border-slate-300"/></div>
                            <div className="pt-2 font-bold text-slate-600"><div className="flex justify-between mb-1.5 uppercase"><span>총 길이</span><span>{advDuration.toFixed(1)}s</span></div><input type="range" min="0.5" max="5" step="0.1" value={advDuration} onChange={e=>setAdvDuration(Number(e.target.value))} className="w-full h-1 bg-slate-300 appearance-none accent-[#209ad6] rounded-full"/></div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="h-4 bg-slate-200/50 rounded-full mx-2 relative overflow-hidden shrink-0 border border-slate-300">
                {advTracks.find(t => t.id === selectedTrackId)?.points.map((p, idx) => (<div key={idx} className="absolute w-1 h-full bg-indigo-500/40" style={{ left: `${p.t * 100}%`, transform: 'translateX(-50%)' }}/>))}
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: `${playHeadPos * 100}%` }} />
            </div>
            <div className="h-48 flex flex-col gap-2 bg-white/40 rounded-2xl border border-slate-300 p-2 shadow-sm relative overflow-hidden shrink-0">
                <div className="flex items-center justify-between gap-2 pb-0.5 mb-0.5 px-1">
                    <div className="flex gap-1 overflow-x-auto">
                        {advTracks.map(t=><button key={t.id} onClick={()=>setSelectedTrackId(t.id)} className={`px-2.5 py-1 text-[9px] font-black border rounded-full transition whitespace-nowrap shadow-xs ${selectedTrackId===t.id?'bg-[#209ad6] text-white border-[#209ad6]':'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>{t.name}</button>)}
                    </div>
                    <div className="flex gap-1">
                        <button onClick={handleSimUndo} disabled={simUndoStack.length === 0} title="실행 취소" className="p-1 rounded bg-white border border-slate-200 text-slate-400 hover:text-indigo-500 disabled:opacity-20 transition-colors"><Undo2 size={12}/></button>
                        <div className="w-px h-4 bg-slate-300 mx-0.5"></div>
                        <button onClick={()=>{ pushSimUndo(); setAdvTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, points: [{t:0, v:t.id === 'pitch' ? 220 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5))}, {t:1, v:t.id === 'pitch' ? 220 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5))}] } : t)); }} title="항목 초기화" className="p-1 rounded bg-white border border-slate-200 text-slate-400 hover:text-orange-500 transition-colors"><RotateCcw size={12}/></button>
                        <button onClick={()=>{ pushSimUndo(); setAdvTracks(prev => prev.map(t => ({ ...t, points: [{t:0, v:t.id === 'pitch' ? 220 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5))}, {t:1, v:t.id === 'pitch' ? 220 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5))}] }))); }} title="전체 초기화" className="p-1 rounded bg-white border border-slate-200 text-slate-400 hover:text-red-500 transition-colors font-bold uppercase"><RotateCcw size={12} className="stroke-[3]"/></button>
                        <button onClick={()=>setClickToAdd(!clickToAdd)} title="클릭 키프레임 토글" className={`p-1 rounded-lg border transition-all shadow-sm shrink-0 ${clickToAdd ? 'bg-[#209ad6] text-white border-[#209ad6]' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'}`}><MousePointer2 size={14}/></button>
                    </div>
                </div>
                <div className="flex-1 bg-white rounded-xl border border-slate-300 relative overflow-hidden shadow-inner">
                    <canvas ref={canvasRef} width={1000} height={200} className="w-full h-full block cursor-crosshair" onMouseDown={handleTimelineMouseDown} 
                        onMouseMove={(e)=>{
                            if(!canvasRef.current) return;
                            const rect=canvasRef.current.getBoundingClientRect(); const mx=e.clientX-rect.left; const my=e.clientY-rect.top; const t=Math.max(0,Math.min(1,mx/rect.width));
                            if(!draggingKeyframe) { const track=advTracks.find(t=>t.id===selectedTrackId); if(!track) return; const hitIdx=track.points.findIndex(p=>Math.hypot((p.t*rect.width)-mx, (RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (rect.height-RULER_HEIGHT))-my) < 15); setHoveredKeyframe(hitIdx!==-1?{trackId:selectedTrackId,index:hitIdx}:null); } 
                            else { if(draggingKeyframe.isPlayhead){setPlayHeadPos(t);}else{ const gH=rect.height-RULER_HEIGHT; const nV=Math.max(0,Math.min(1,1-((my-RULER_HEIGHT)/gH))); const track=advTracks.find(tr=>tr.id===draggingKeyframe.trackId); if(!track) return; const val=track.min+(nV*(track.max-track.min)); setAdvTracks(prev=>prev.map(tr=>tr.id===draggingKeyframe.trackId?{...tr,points:tr.points.map((p,i)=>i===draggingKeyframe.index?{t,v:val}:p)}:tr)); } }
                        }} onMouseUp={() => setDraggingKeyframe(null)}/>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// Main App Component
// ==========================================
const App = () => {
    const [audioContext, setAudioContext] = useState(null);
    const [files, setFiles] = useState([]);
    const [activeFileId, setActiveFileId] = useState(null);
    const [activeTab, setActiveTab] = useState('editor');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) setAudioContext(new Ctx());
        }
    }, []);

    const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

    const handleFileUpload = async (e) => {
        if(!audioContext) return;
        const selFiles = Array.from(e.target.files);
        for(const file of selFiles) {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const newFile = { id: Math.random().toString(36).substr(2, 9), name: file.name, buffer: audioBuffer };
            setFiles(prev => [...prev, newFile]);
            if(!activeFileId) setActiveFileId(newFile.id);
        }
    };

    const addToRack = (buffer, name) => {
        const newFile = { id: Math.random().toString(36).substr(2, 9), name: name || "새 오디오", buffer };
        setFiles(prev => [...prev, newFile]);
        setActiveFileId(newFile.id);
    };

    const renameFile = (id, newName) => { setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f)); };
    const updateFile = (newBuffer) => { setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, buffer: newBuffer } : f)); };
    const removeFile = (id) => { setFiles(prev => prev.filter(f => f.id !== id)); if(activeFileId === id) setActiveFileId(null); };

    return (
        <div className="h-screen w-full bg-[#f8f8f6] text-[#1f1e1d] flex flex-col font-sans overflow-hidden">
            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }`}</style>
            <header className="h-14 border-b border-slate-300 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-[#209ad6] p-1.5 rounded-lg text-white shadow-lg shadow-blue-200"><Activity size={20}/></div>
                    <div className="flex flex-col">
                        <h1 className="font-black text-xl tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-r from-[#b2d4ed] via-[#3c78e8] to-[#e3daf5]">OTONASHI</h1>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">AUgmented vocal-TracT and Nasal SImulator</span>
                    </div>
                </div>
                <nav className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button onClick={()=>setActiveTab('editor')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab==='editor'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>스튜디오</button>
                    <button onClick={()=>setActiveTab('consonant')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab==='consonant'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>자음 합성</button>
                    <button onClick={()=>setActiveTab('sim')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab==='sim'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>성도 시뮬레이터</button>
                </nav>
                <div className="flex items-center gap-3"><button className="text-slate-400 hover:text-slate-600 transition-colors"><Settings size={20}/></button><div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center shadow-inner"><User size={20} className="text-slate-400"/></div></div>
            </header>
            <main className="flex-1 flex overflow-hidden">
                <FileRack files={files} activeFileId={activeFileId} setActiveFileId={setActiveFileId} handleFileUpload={handleFileUpload} removeFile={removeFile} renameFile={renameFile} />
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
                    {activeTab === 'editor' && <StudioTab audioContext={audioContext} activeFile={activeFile} files={files} onUpdateFile={updateFile} onAddToRack={addToRack} setActiveFileId={setActiveFileId} />}
                    {activeTab === 'consonant' && <ConsonantTab audioContext={audioContext} files={files} onAddToRack={addToRack} />}
                    {activeTab === 'sim' && <AdvancedTractTab audioContext={audioContext} files={files} onAddToRack={addToRack} />}
                </div>
            </main>
        </div>
    );
};

export default App;
