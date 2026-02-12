import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Upload, Play, Pause, Square, Download, Scissors, Music, Sliders, Activity, 
  Layers, Zap, Mic2, Copy, Clipboard, TrendingUp, X, FileAudio, Plus, 
  LogIn, Edit2, CircleDot, User, MoveHorizontal, Check, MousePointer2, 
  SlidersHorizontal, RotateCcw, Combine, Undo2, Redo2, TrendingDown,
  CloudUpload, DownloadCloud, UploadCloud, FlipHorizontal, ArrowLeftRight, Crop, FilePlus, Settings, HelpCircle, RefreshCw,
  History, SignalLow, SignalHigh, SkipBack, SkipForward, Waves, ChevronRight
} from 'lucide-react';

// Firebase Imports (Safe Import)
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// ==========================================
// 1. Firebase & Global Constants (Safe Init)
// ==========================================
let app, auth, db;
const appId = 'otonashi-v95';

try {
  const firebaseConfig = {
    apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || "",
    authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: import.meta.env?.VITE_FIREBASE_APP_ID || ""
  };
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) { console.warn("Firebase Offline Mode Active"); }

const RULER_HEIGHT = 24;
const BASE_DURATION = 2.0;

// ==========================================
// 2. Audio Utility Functions
// ==========================================
const AudioUtils = {
  serializeBuffer: (buffer) => {
    if (!buffer) return null;
    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(Array.from(buffer.getChannelData(i)));
    }
    return { sampleRate: buffer.sampleRate, numberOfChannels: buffer.numberOfChannels, channels };
  },
  deserializeBuffer: async (ctx, data) => {
    if (!ctx || !data) return null;
    const { sampleRate, numberOfChannels, channels } = data;
    const buffer = ctx.createBuffer(numberOfChannels, channels[0].length, sampleRate);
    for (let i = 0; i < numberOfChannels; i++) {
      buffer.copyToChannel(new Float32Array(channels[i]), i);
    }
    return buffer;
  },
  createBufferFromSlice: (ctx, buf, startPct, endPct) => {
    if(!buf || !ctx) return null;
    const start = Math.floor(buf.length * (startPct/100));
    const end = Math.floor(buf.length * (endPct/100));
    if (end <= start) return null;
    const newBuf = ctx.createBuffer(buf.numberOfChannels, end - start, buf.sampleRate);
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
  insertBuffer: (ctx, base, insert, offsetPct) => {
    if(!base || !ctx) return insert;
    if(!insert) return base;
    const start = Math.floor(base.length * (offsetPct/100));
    const newLen = base.length + insert.length;
    const newBuf = ctx.createBuffer(base.numberOfChannels, newLen, base.sampleRate);
    for(let i=0; i<base.numberOfChannels; i++) {
        const ch = newBuf.getChannelData(i);
        const baseData = base.getChannelData(i);
        const insertData = insert.getChannelData(i % insert.numberOfChannels);
        ch.set(baseData.slice(0, start), 0);
        ch.set(insertData, start);
        ch.set(baseData.slice(start), start + insert.length);
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
        for(let s=0; s<overlay.length; s++) { if(startSample + s < newLen) ch[startSample + s] += overlayData[s]; }
    }
    return newBuf;
  },
  applyFade: async (ctx, buf, type, startPct, endPct, shape = 'linear') => {
    if(!buf || !ctx) return null;
    const offline = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
    const s = offline.createBufferSource(); s.buffer = buf;
    const g = offline.createGain();
    const start = (startPct/100) * buf.duration;
    const end = (endPct/100) * buf.duration;
    if (type === 'in') { 
        g.gain.setValueAtTime(0, start); 
        if(shape === 'exponential') g.gain.exponentialRampToValueAtTime(1, end);
        else g.gain.linearRampToValueAtTime(1, end);
    } else { 
        g.gain.setValueAtTime(1, start); 
        if(shape === 'exponential') g.gain.exponentialRampToValueAtTime(0.01, end);
        else g.gain.linearRampToValueAtTime(0, end);
    }
    s.connect(g); g.connect(offline.destination); s.start(0);
    return await offline.startRendering();
  },
  reverseBuffer: (ctx, buf) => {
    if(!buf || !ctx) return null;
    const newBuf = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for(let i=0; i<buf.numberOfChannels; i++){
        const ch = newBuf.getChannelData(i);
        const old = buf.getChannelData(i);
        for(let j=0; j<buf.length; j++) ch[j] = old[buf.length - 1 - j];
    }
    return newBuf;
  },
  downloadWav: async (buffer, name) => {
    if (!buffer) return;
    const targetRate = 44100;
    const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * targetRate), targetRate);
    const s = offline.createBufferSource();
    s.buffer = buffer; s.connect(offline.destination); s.start(0);
    const rendered = await offline.startRendering();
    const pcmData = rendered.getChannelData(0);
    const arrayBuffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(arrayBuffer);
    const writeStr = (v, o, str) => { for (let i=0; i<str.length; i++) v.setUint8(o+i, str.charCodeAt(i)); };
    writeStr(view, 0, 'RIFF'); view.setUint32(4, 36 + pcmData.length * 2, true);
    writeStr(view, 8, 'WAVE'); writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    writeStr(view, 36, 'data'); view.setUint32(40, pcmData.length * 2, true);
    let offset = 44;
    for (let i=0; i<pcmData.length; i++) {
        let sample = Math.max(-1, Math.min(1, pcmData[i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true); offset += 2;
    }
    const url = URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
    const a = document.createElement('a'); a.href = url; a.download = `${name}.wav`; a.click();
  }
};

// ==========================================
// 3. UI Sub-Components
// ==========================================

const HistoryModal = ({ history, currentIndex, onJump, onClose }) => (
    <div className="fixed inset-0 z-[120] flex items-center justify-end bg-black/20 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
        <div className="bg-white w-80 h-full shadow-2xl flex flex-col font-sans border-l border-slate-200" onClick={e=>e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="font-black text-slate-700 flex items-center gap-2"><History size={18}/> 작업 내역</h3>
                <button onClick={onClose}><X size={18} className="text-slate-400 hover:text-slate-600"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {history.map((item, idx) => (
                    <div key={idx} onClick={() => onJump(idx)}
                         className={`p-3 rounded-lg cursor-pointer text-sm flex items-center justify-between group transition-all ${idx === currentIndex ? 'bg-[#209ad6] text-white shadow-md' : 'hover:bg-slate-100 text-slate-600'}`}>
                        <div className="flex flex-col">
                            <span className="font-bold">{item.label}</span>
                            <span className={`text-[10px] ${idx===currentIndex?'text-blue-100':'text-slate-400'}`}>{new Date(item.timestamp).toLocaleTimeString()}</span>
                        </div>
                        {idx === currentIndex && <Check size={16}/>}
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const HelpModal = ({ onClose }) => (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div className="bg-white w-[800px] max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden font-sans" onClick={e => e.stopPropagation()}>
         <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 font-sans">
           <div className="flex items-center gap-2 font-sans"><Activity className="text-[#209ad6] w-5 h-5 font-sans"/><h2 className="text-lg font-black text-slate-800 tracking-tight font-sans">OTONASHI 사용자 가이드</h2></div>
           <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors font-sans"><X size={20}/></button>
         </div>
         <div className="p-8 overflow-y-auto custom-scrollbar text-slate-600 leading-relaxed text-sm space-y-8 font-sans font-bold font-sans">
            <section><h3 className="text-lg font-bold text-[#209ad6] mb-3 flex items-center gap-2 border-b pb-2 font-sans"><Music size={20}/> 1. 스튜디오</h3><p>파일을 드래그하여 로드하고 상단 툴바로 편집하세요. 스페이스바로 재생/정지가 가능합니다.</p></section>
            <section><h3 className="text-lg font-bold text-[#209ad6] mb-3 flex items-center gap-2 border-b pb-2 font-sans"><Combine size={20}/> 2. 자음 합성</h3><p>모음 위에 자음을 얹어 타이밍과 볼륨을 조절하세요. 볼륨 점은 우클릭으로 삭제합니다.</p></section>
            <section><h3 className="text-lg font-bold text-[#209ad6] mb-3 flex items-center gap-2 border-b pb-2 font-sans"><Activity size={20}/> 3. 성도 시뮬레이터</h3><p>혀와 입술을 드래그하여 조음하고 키프레임을 등록하세요. 하단 배경에 실시간 파형이 표시됩니다.</p></section>
         </div>
      </div>
    </div>
);

const FadeModal = ({ type, onClose, onApply }) => {
    const [shape, setShape] = useState('linear');
    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in zoom-in-95 font-sans" onClick={onClose}>
            <div className="bg-white p-6 rounded-xl shadow-2xl w-80 font-sans" onClick={e=>e.stopPropagation()}>
                <h3 className="text-lg font-black text-slate-700 mb-4 flex items-center gap-2 font-bold font-sans">{type === 'in' ? <SignalLow size={20}/> : <SignalHigh size={20}/>} Fade 설정</h3>
                <div className="flex gap-2 mb-6 font-sans">
                    <button onClick={()=>setShape('linear')} className={`flex-1 py-3 rounded-lg border font-bold text-xs font-sans ${shape==='linear'?'bg-[#209ad6] text-white border-[#209ad6]':'bg-slate-50 text-slate-500 border-slate-200'}`}>직선</button>
                    <button onClick={()=>setShape('exponential')} className={`flex-1 py-3 rounded-lg border font-bold text-xs font-sans ${shape==='exponential'?'bg-[#209ad6] text-white border-[#209ad6]':'bg-slate-50 text-slate-500 border-slate-200'}`}>곡선</button>
                </div>
                <button onClick={()=>{ onApply(shape); onClose(); }} className="w-full py-3 bg-[#209ad6] text-white rounded-lg font-bold shadow-md hover:bg-[#1a85b9] transition-all font-sans">적용</button>
            </div>
        </div>
    );
};

const FileRack = ({ files, activeFileId, setActiveFileId, handleFileUpload, removeFile, renameFile, isSaving }) => {
    const [editingId, setEditingId] = useState(null);
    const [tempName, setTempName] = useState("");
    const submitRename = (id) => { if(tempName.trim()) renameFile(id, tempName.trim()); setEditingId(null); };
  
    return (
      <aside className="w-64 bg-white/40 border-r border-slate-300 flex flex-col shrink-0 font-sans z-20 h-full">
        <div className="p-4 border-b border-slate-300 flex justify-between items-center bg-slate-200/50 font-bold font-sans">
          <span className="text-sm text-slate-600 uppercase tracking-wider flex items-center gap-2 font-sans">파일 보관함 {isSaving && <RefreshCw size={10} className="animate-spin text-blue-500 font-sans" />}</span>
          <label className="cursor-pointer hover:bg-slate-300 p-1 rounded transition text-[#209ad6] font-sans"><Plus className="w-4 h-4 font-sans"/><input type="file" multiple accept="audio/*" className="hidden font-sans" onChange={handleFileUpload}/></label>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar font-sans">
          {files.map(f => (
            <div key={f.id} draggable onDragStart={(e) => e.dataTransfer.setData("fileId", f.id)}
                 className={`p-2.5 rounded-lg cursor-grab active:cursor-grabbing text-sm flex items-center gap-2 transition border group font-sans ${activeFileId === f.id ? 'bg-[#a3cef0]/30 border-[#209ad6]/40 text-[#1f1e1d]' : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-200'}`}>
              <div className="flex-1 flex items-center gap-2 overflow-hidden font-bold font-sans" onClick={() => setActiveFileId(f.id)}>
                <FileAudio className={`w-5 h-5 flex-shrink-0 font-sans ${activeFileId===f.id?'text-[#209ad6] font-sans':'text-slate-400 font-sans'}`}/> 
                {editingId === f.id ? <input autoFocus className="bg-white border border-blue-400 rounded px-1 w-full outline-none font-sans" value={tempName} onChange={e => setTempName(e.target.value)} onBlur={() => submitRename(f.id)} onKeyDown={e => e.key === 'Enter' && submitRename(f.id)} /> : <span className="truncate font-sans">{f.name}</span>}
              </div>
              <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1 font-sans">
                  <button onClick={() => AudioUtils.downloadWav(f.buffer, f.name)} className="p-1 hover:text-[#209ad6] font-sans"><Download size={14}/></button>
                  <button onClick={() => { setEditingId(f.id); setTempName(f.name); }} className="p-1 hover:text-[#209ad6] font-sans"><Edit2 size={14}/></button>
                  <button onClick={(e) => { e.stopPropagation(); if(window.confirm("정말 삭제하시겠습니까?")) removeFile(f.id); }} className="p-1 hover:text-red-500 font-sans font-bold font-sans"><X size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    );
};

// ==========================================
// 4. Tab Implementation Components
// ==========================================

const StudioTab = ({ audioContext, activeFile, onAddToRack, setActiveFileId, onEdit, onUndo, onRedo }) => {
    const [editTrim, setEditTrim] = useState({ start: 0, end: 100 });
    const [isPlaying, setIsPlaying] = useState(false);
    const [playheadPos, setPlayheadPos] = useState(0); 
    const [dragTarget, setDragTarget] = useState(null);
    const [selectionAnchor, setSelectionAnchor] = useState(null); 
    const [clipboard, setClipboard] = useState(null);
    const [masterGain, setMasterGain] = useState(1.0);
    const [pitchCents, setPitchCents] = useState(0);
    const [genderShift, setGenderShift] = useState(1.0);
    const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 });
    const [formant, setFormant] = useState({ f1: 500, f2: 1500, f3: 2500, resonance: 4.0 });
    const [showStretchModal, setShowStretchModal] = useState(false);
    const [stretchRatio, setStretchRatio] = useState(100);
    const [fadeModalType, setFadeModalType] = useState(null);

    const canvasRef = useRef(null);
    const sourceRef = useRef(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);
    const animationRef = useRef(null);
    const fileInputRef = useRef(null);

    const studioBuffer = activeFile?.buffer || null;
    const historyIndex = activeFile?.historyIndex || 0;
    const history = activeFile?.history || [];

    const handleEditAction = useCallback((newBuffer, label) => { if(activeFile) onEdit(activeFile.id, newBuffer, label); }, [activeFile, onEdit]);
    const handleStop = useCallback(() => { if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} sourceRef.current = null; } setIsPlaying(false); setPlayheadPos(0); pauseOffsetRef.current = 0; if (animationRef.current) cancelAnimationFrame(animationRef.current); }, []);

    const updatePlayhead = useCallback(() => {
        if (!isPlaying || !studioBuffer || !audioContext) return;
        const elapsed = audioContext.currentTime - startTimeRef.current;
        const currentPos = ((elapsed / studioBuffer.duration) * 100) % 100;
        setPlayheadPos(currentPos);
        animationRef.current = requestAnimationFrame(updatePlayhead);
    }, [isPlaying, studioBuffer, audioContext]);

    useEffect(() => {
        if (isPlaying) animationRef.current = requestAnimationFrame(updatePlayhead);
        else if (animationRef.current) cancelAnimationFrame(animationRef.current);
        return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
    }, [isPlaying, updatePlayhead]);

    useEffect(() => {
        const handleKeyDown = (e) => { if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); handlePlayPause(); } };
        window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, studioBuffer]);

    const handlePlayPause = async () => {
        if(isPlaying) { if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} pauseOffsetRef.current = audioContext.currentTime - startTimeRef.current; setIsPlaying(false); } return; }
        if(!studioBuffer || !audioContext) return;
        const processedBuf = await renderStudioAudio(studioBuffer);
        const s = audioContext.createBufferSource(); s.buffer = processedBuf; s.connect(audioContext.destination);
        const startOffset = pauseOffsetRef.current || 0;
        s.start(0, startOffset % processedBuf.duration); startTimeRef.current = audioContext.currentTime - (startOffset % processedBuf.duration);
        sourceRef.current = s; setIsPlaying(true);
        s.onended = () => { if (Math.abs((audioContext.currentTime - startTimeRef.current) - processedBuf.duration) < 0.1) { setIsPlaying(false); setPlayheadPos(0); pauseOffsetRef.current = 0; } };
    };

    const renderStudioAudio = async (buf) => {
        if(!buf || !audioContext) return null;
        const offline = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
        const finalOutput = offline.createGain(); finalOutput.gain.value = masterGain;
        const lowF = offline.createBiquadFilter(); lowF.type = 'lowshelf'; lowF.frequency.value = 320; lowF.gain.value = eq.low;
        const midF = offline.createBiquadFilter(); midF.type = 'peaking'; midF.frequency.value = 1000; midF.gain.value = eq.mid;
        const highF = offline.createBiquadFilter(); highF.type = 'highshelf'; highF.frequency.value = 3200; highF.gain.value = eq.high;
        const f1Node = offline.createBiquadFilter(); f1Node.type = 'peaking'; f1Node.frequency.value = formant.f1 * genderShift; f1Node.Q.value = formant.resonance; f1Node.gain.value = 12;
        const f2Node = offline.createBiquadFilter(); f2Node.type = 'peaking'; f2Node.frequency.value = formant.f2 * genderShift; f2Node.Q.value = formant.resonance; f2Node.gain.value = 10;
        const f3Node = offline.createBiquadFilter(); f3Node.type = 'peaking'; f3Node.frequency.value = formant.f3 * genderShift; f3Node.Q.value = formant.resonance; f3Node.gain.value = 8;
        lowF.connect(midF); midF.connect(highF); highF.connect(f1Node); f1Node.connect(f2Node); f2Node.connect(f3Node); f3Node.connect(finalOutput); finalOutput.connect(offline.destination);
        const s1 = offline.createBufferSource(); s1.buffer = buf; s1.detune.value = pitchCents;
        s1.connect(lowF); s1.start(0);
        return await offline.startRendering();
    };

    useEffect(() => {
        if(!canvasRef.current || !studioBuffer) return;
        const ctx = canvasRef.current.getContext('2d'); const w = canvasRef.current.width, h = canvasRef.current.height;
        const data = studioBuffer.getChannelData(0); const step = Math.ceil(data.length/w);
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#f8f8f6'; ctx.fillRect(0,0,w,h);
        ctx.beginPath(); ctx.strokeStyle = '#3c78e8'; ctx.lineWidth = 1;
        for(let i=0;i<w;i++){ let min=1,max=-1; for(let j=0;j<step;j++){ const d=data[i*step+j]; if(d<min)min=d; if(d>max)max=d; } ctx.moveTo(i, h/2+min*h/2); ctx.lineTo(i, h/2+max*h/2); } ctx.stroke();
        const sX = (editTrim.start/100)*w, eX = (editTrim.end/100)*w;
        ctx.fillStyle = 'rgba(60, 120, 232, 0.15)'; ctx.fillRect(sX, 0, eX-sX, h);
        ctx.strokeStyle = '#209ad6'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(sX,0); ctx.lineTo(sX,h); ctx.moveTo(eX,0); ctx.lineTo(eX,h); ctx.stroke();
        const phX = (playheadPos / 100) * w; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(phX, 0); ctx.lineTo(phX, h); ctx.stroke();
    }, [studioBuffer, editTrim, playheadPos]);

    const handleCanvasMouseDown = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const p = ((e.clientX - rect.left) / rect.width) * 100;
        if (Math.abs(p - editTrim.start) < 2) setDragTarget('start');
        else if (Math.abs(p - editTrim.end) < 2) setDragTarget('end');
        else { setDragTarget('new'); setSelectionAnchor(p); setEditTrim({ start: p, end: p }); }
    };

    const handleCanvasMouseMove = (e) => {
        if (!dragTarget) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const p = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        if (dragTarget === 'start') setEditTrim(prev => ({ ...prev, start: Math.min(p, prev.end) }));
        else if (dragTarget === 'end') setEditTrim(prev => ({ ...prev, end: Math.max(p, prev.start) }));
        else if (dragTarget === 'new' && selectionAnchor !== null) setEditTrim({ start: Math.min(selectionAnchor, p), end: Math.max(selectionAnchor, p) });
    };

    return (
        <div className="flex-1 flex flex-col gap-4 p-4 font-sans overflow-y-auto custom-scrollbar h-full bg-slate-50 font-sans" 
             onDragOver={e=>e.preventDefault()}
             onDrop={async e=>{
                 e.preventDefault();
                 if(e.dataTransfer.files.length > 0) {
                     const file = e.dataTransfer.files[0]; const buffer = await audioContext.decodeAudioData(await file.arrayBuffer()); onAddToRack(buffer, file.name);
                 } else { const id = e.dataTransfer.getData("fileId"); if(id) setActiveFileId(id); }
             }}>
            <div className="flex-shrink-0 flex flex-col gap-4 font-sans">
                <div className="bg-white rounded-xl border border-slate-300 p-2 flex justify-between items-center shadow-sm">
                    <div className="flex gap-1 font-bold">
                        <button onClick={() => onUndo(activeFile.id)} disabled={historyIndex <= 0} className="p-2 hover:bg-slate-200 rounded text-slate-600 disabled:opacity-30"><Undo2 size={16}/></button>
                        <button onClick={() => onRedo(activeFile.id)} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-slate-200 rounded text-slate-600 disabled:opacity-30"><Redo2 size={16}/></button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={() => { if(!studioBuffer) return; setClipboard(AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end)); handleEditAction(AudioUtils.deleteRange(audioContext, studioBuffer, editTrim.start, editTrim.end), "잘라내기"); }} title="잘라내기" className="p-2 hover:bg-slate-200 rounded text-slate-600"><Scissors size={16}/></button>
                        <button onClick={() => { if(!studioBuffer) return; handleEditAction(AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end), "크롭"); }} title="크롭" className="p-2 hover:bg-slate-200 rounded text-slate-600"><Crop size={16}/></button>
                        <button onClick={() => { if(!studioBuffer) return; setClipboard(AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end)); }} title="복사" className="p-2 hover:bg-slate-200 rounded text-slate-600"><Copy size={16}/></button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={() => { if(!clipboard || !studioBuffer) return; handleEditAction(AudioUtils.insertBuffer(audioContext, studioBuffer, clipboard, editTrim.end), "붙여넣기"); }} title="붙여넣기" className="p-2 hover:bg-slate-200 rounded text-slate-600"><Clipboard size={16}/></button>
                        <button onClick={() => { if(!clipboard || !studioBuffer) return; handleEditAction(AudioUtils.mixBuffers(audioContext, studioBuffer, clipboard, editTrim.start), "오버레이"); }} title="오버레이" className="p-2 hover:bg-slate-200 rounded text-indigo-500"><Layers size={16}/></button>
                        <button onClick={() => { if(!studioBuffer) return; handleEditAction(AudioUtils.reverseBuffer(audioContext, studioBuffer), "반전"); }} title="좌우 반전" className="p-2 hover:bg-slate-200 rounded text-purple-500"><FlipHorizontal size={16}/></button>
                        <button onClick={()=>setFadeModalType('in')} className="p-2 hover:bg-slate-200 rounded text-emerald-500 font-sans font-bold"><SignalLow size={16}/></button>
                        <button onClick={()=>setFadeModalType('out')} className="p-2 hover:bg-slate-200 rounded text-rose-500 font-sans font-bold"><SignalHigh size={16}/></button>
                        <button onClick={()=>setShowStretchModal(true)} className="p-2 hover:bg-slate-200 rounded text-[#209ad6] font-sans font-bold"><MoveHorizontal size={16}/></button>
                    </div>
                    <button onClick={async () => { if(!studioBuffer) return; const res = await renderStudioAudio(studioBuffer); if(res) onAddToRack(res, activeFile.name + "_결과"); }} className="bg-[#a3cef0] text-[#1f1e1d] px-3 py-1.5 rounded text-sm font-bold flex items-center gap-1 hover:bg-[#209ad6] hover:text-white shadow-sm font-sans transition-all"><LogIn size={18}/> 보관함에 저장</button>
                </div>
                <div className="h-[500px] bg-white rounded-xl border border-slate-300 relative overflow-hidden shadow-inner group flex-shrink-0 font-sans">
                    {studioBuffer ? (
                        <>
                            <canvas ref={canvasRef} width={1000} height={500} className="w-full h-full object-fill cursor-crosshair font-sans" onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={()=>setDragTarget(null)} />
                            <div className="absolute top-2 right-2 flex gap-1 opacity-50 group-hover:opacity-100 transition-opacity font-sans">
                                <button onClick={()=>{setPlayheadPos(0); pauseOffsetRef.current=0;}} className="p-1 bg-white border rounded hover:text-[#209ad6] font-sans font-bold"><SkipBack size={16}/></button>
                                <button onClick={()=>{setPlayheadPos(100); pauseOffsetRef.current=studioBuffer.duration;}} className="p-1 bg-white border rounded hover:text-[#209ad6] font-sans font-bold"><SkipForward size={16}/></button>
                                <button onClick={()=>setEditTrim({start:0, end:100})} className="p-1 bg-white border rounded text-[10px] font-black font-sans">FULL</button>
                            </div>
                        </>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 font-black uppercase cursor-pointer hover:bg-slate-50 transition-colors font-sans"
                             onClick={() => fileInputRef.current.click()}>
                            <Upload size={40}/> <span>파일을 드래그하거나 클릭하세요</span>
                            <input type="file" ref={fileInputRef} className="hidden font-sans" accept="audio/*" onChange={async (e)=>{ if(e.target.files.length>0){ const f=e.target.files[0]; onAddToRack(await audioContext.decodeAudioData(await f.arrayBuffer()), f.name); } }}/>
                        </div>
                    )}
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 min-h-min pb-10 font-sans">
                <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3 font-sans">
                    <h4 className="text-sm font-black text-[#209ad6] uppercase tracking-widest flex items-center gap-2 font-sans"><Sliders size={18}/> 믹서</h4>
                    <div className="space-y-2 font-sans"><div className="flex justify-between text-xs font-black text-slate-500 font-sans"><span>볼륨</span><span>{Math.round(masterGain*100)}%</span></div><input type="range" min="0" max="2" step="0.1" value={masterGain} onChange={e=>setMasterGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-300 rounded appearance-none accent-emerald-500 font-sans"/><div className="flex justify-between text-xs font-black text-slate-500 mt-3 font-sans"><span>피치</span><span>{pitchCents}</span></div><input type="range" min="-1200" max="1200" step="10" value={pitchCents} onChange={e=>setPitchCents(Number(e.target.value))} className="w-full h-1.5 bg-slate-300 appearance-none accent-[#209ad6] font-sans"/></div>
                </div>
                <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3 font-sans">
                    <h4 className="text-sm font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2 font-sans font-bold"><Activity size={18}/> 포먼트</h4>
                    {['f1', 'f2', 'f3'].map(f => (<div key={f} className="font-sans font-bold"><div className="flex justify-between text-xs font-black text-slate-500 mb-1 uppercase font-sans font-bold"><span>{f}</span><span>{formant[f]}Hz</span></div><input type="range" min="200" max={5000} value={formant[f]} onChange={e=>setFormant({...formant, [f]: Number(e.target.value)})} className="w-full h-1.5 bg-slate-300 appearance-none accent-emerald-500 font-sans"/></div>))}
                </div>
                <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3 font-sans font-bold">
                    <h4 className="text-sm font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2 font-sans font-bold font-sans font-bold font-sans font-bold"><SlidersHorizontal size={18}/> 밴드 EQ</h4>
                    {['low', 'mid', 'high'].map(band => (<div key={band} className="font-sans font-bold font-sans font-bold"><div className="flex justify-between text-xs font-black text-slate-500 mb-1 uppercase font-sans font-bold font-sans font-bold font-sans font-bold"><span>{band}</span><span>{eq[band]}dB</span></div><input type="range" min="-24" max="24" value={eq[band]} onChange={e=>setEq({...eq, [band]: Number(e.target.value)})} className="w-full h-1.5 bg-slate-300 appearance-none accent-indigo-500 font-sans font-bold font-sans font-bold font-sans font-bold"/></div>))}
                </div>
                <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3 justify-end font-sans font-bold">
                    <div className="flex gap-2 font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold">
                        <button onClick={handleStop} className="p-3 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-600 transition-all font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold"><Square size={20} fill="currentColor"/></button>
                        <button onClick={handlePlayPause} className="flex-1 py-3 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-lg font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold">{isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>} {isPlaying ? '중지' : '미리보기'}</button>
                    </div>
                </div>
            </div>
            {showStretchModal && <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-[110] animate-in zoom-in-95 font-sans font-bold"><div className="bg-white p-6 rounded-xl border border-slate-300 w-80 shadow-2xl font-sans font-bold"><h3 className="font-black text-[#209ad6] mb-4 uppercase text-sm font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold">시간 늘리기 ({stretchRatio}%)</h3><input type="range" min="50" max="200" value={stretchRatio} onChange={e=>setStretchRatio(Number(e.target.value))} className="w-full h-1 bg-slate-300 rounded mb-6 appearance-none accent-[#209ad6] font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold"/><button onClick={() => {
                const sel = AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end); const ratio = stretchRatio/100;
                const off = new OfflineAudioContext(sel.numberOfChannels, Math.floor(sel.length*ratio), sel.sampleRate);
                const s = off.createBufferSource(); s.buffer=sel; s.playbackRate.value=1/ratio; s.connect(off.destination); s.start();
                off.startRendering().then(str => {
                    const pre = AudioUtils.createBufferFromSlice(audioContext, studioBuffer, 0, editTrim.start);
                    const post = AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.end, 100);
                    handleEditAction(AudioUtils.concatBuffers(audioContext, AudioUtils.concatBuffers(audioContext, pre, str), post), "시간 늘리기"); setShowStretchModal(false);
                });
            }} className="w-full py-3 bg-[#209ad6] text-white rounded-xl font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold">적용</button></div></div>}
        </div>
    );
};

const ConsonantTab = ({ audioContext, files, onAddToRack }) => {
    const [vowelId, setVowelId] = useState("");
    const [consonantId, setConsonantId] = useState("");
    const [offsetMs, setOffsetMs] = useState(0); 
    const [vowelOffsetMs, setVowelOffsetMs] = useState(0); 
    const [vowelGain, setVowelGain] = useState(1.0);
    const [consonantGain, setConsonantGain] = useState(1.0);
    const [consonantStretch, setConsonantStretch] = useState(1.0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [vVolumePts, setVVolumePts] = useState([{t:0,v:1}, {t:1,v:1}]);
    const [cVolumePts, setCVolumePts] = useState([{t:0,v:1}, {t:1,v:1}]);
    const [editMode, setEditMode] = useState('placement'); 
    const canvasRef = useRef(null);
    const sourceRef = useRef(null);
    const [dragging, setDragging] = useState(null); 

    const mixConsonant = async () => {
        const v = files.find(f => f.id === vowelId)?.buffer; const c = files.find(f => f.id === consonantId)?.buffer;
        if (!v || !audioContext) return null;
        const vOff = vowelOffsetMs/1000, cOff = offsetMs/1000; const cLen = c ? (c.length / c.sampleRate) * consonantStretch : 0;
        const minStart = Math.min(vOff, cOff); const totalDuration = Math.max(vOff + v.duration, cOff + cLen) - minStart;
        const offline = new OfflineAudioContext(v.numberOfChannels, Math.ceil(totalDuration * v.sampleRate), v.sampleRate);
        const sV = offline.createBufferSource(); sV.buffer = v; const gV = offline.createGain(); 
        gV.gain.setValueAtTime(vVolumePts[0].v * vowelGain, vOff - minStart);
        vVolumePts.forEach(p => gV.gain.linearRampToValueAtTime(p.v * vowelGain, vOff - minStart + p.t * v.duration));
        sV.connect(gV); gV.connect(offline.destination); sV.start(vOff - minStart);
        if(c) {
            const sC = offline.createBufferSource(); sC.buffer = c; sC.playbackRate.value = 1 / consonantStretch;
            const gC = offline.createGain(); const duration = c.duration * consonantStretch;
            gC.gain.setValueAtTime(cVolumePts[0].v * consonantGain, cOff - minStart);
            cVolumePts.forEach(p => gC.gain.linearRampToValueAtTime(p.v * consonantGain, cOff - minStart + p.t * duration));
            sC.connect(gC); gC.connect(offline.destination); sC.start(cOff - minStart);
        }
        return await offline.startRendering();
    };

    useEffect(() => {
        if(!canvasRef.current || !audioContext) return;
        const ctx = canvasRef.current.getContext('2d'); const w = canvasRef.current.width, h = canvasRef.current.height;
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0,0,w,h);
        const vBuf = files.find(f => f.id === vowelId)?.buffer, cBuf = files.find(f => f.id === consonantId)?.buffer;
        const drawWave = (buf, color, offsetY, widthScale = 1.0, startMs=0) => {
            if(!buf) return 0;
            const data = buf.getChannelData(0); const pixOff = startMs / (2000/w);
            const drawnWidth = (buf.duration * widthScale / 2.0) * w;
            ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
            for(let i=0; i<drawnWidth; i++) {
                let min=1, max=-1; const idx = Math.floor((i/drawnWidth)*data.length);
                const d = data[idx]; if(d<min)min=d; if(d>max)max=d;
                ctx.moveTo(pixOff+i, offsetY+min*h/4); ctx.lineTo(pixOff+i, offsetY+max*h/4);
            } ctx.stroke(); return drawnWidth;
        };
        const drawEnv = (pts, color, pixOff, width) => {
            if(!width) return; ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth=2;
            pts.forEach((p,i)=> { const x=pixOff+p.t*width; const y=h-(p.v*h); if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
            pts.forEach(p=> { const x=pixOff+p.t*width; const y=h-(p.v*h); ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill(); });
        };
        if(vBuf) { const dw = drawWave(vBuf, '#3b82f6', h/2, 1, vowelOffsetMs); if(editMode==='vVol') drawEnv(vVolumePts, '#1d4ed8', vowelOffsetMs/(2000/w), dw); }
        if(cBuf) { const dw = drawWave(cBuf, '#f97316', h/2, consonantStretch, offsetMs); if(editMode==='cVol') drawEnv(cVolumePts, '#ea580c', offsetMs/(2000/w), dw); }
    }, [vowelId, consonantId, offsetMs, vowelOffsetMs, consonantStretch, vVolumePts, cVolumePts, editMode, files]);

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in font-sans overflow-y-auto bg-slate-50 font-bold font-sans font-bold">
            <div className="bg-white rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm">
                <div className="flex items-center gap-3 border-b border-slate-200 pb-4 font-sans font-bold"><div className="p-2 bg-indigo-500 rounded-xl text-white font-sans font-bold font-sans font-bold font-sans font-bold"><Combine size={24}/></div><h2 className="text-xl font-black text-slate-800 tracking-tight font-sans font-bold font-sans font-bold font-sans font-bold">자음-모음 합성기</h2></div>
                <div className="flex gap-2 font-sans font-bold font-sans font-bold font-sans font-bold"><button onClick={()=>setEditMode('placement')} className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${editMode==='placement'?'bg-indigo-500 text-white shadow-md':'bg-white text-slate-500 hover:bg-slate-50 font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold'}`}>위치 / 길이</button><button onClick={()=>setEditMode('vVol')} className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${editMode==='vVol'?'bg-blue-500 text-white shadow-md font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold':'bg-white text-slate-500 hover:bg-slate-50'}`}>모음 볼륨</button><button onClick={()=>setEditMode('cVol')} className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${editMode==='cVol'?'bg-orange-500 text-white shadow-md font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold':'bg-white text-slate-500 hover:bg-slate-50'}`}>자음 볼륨</button></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-sans font-bold font-sans font-bold font-sans font-bold">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-3 font-sans font-bold font-sans font-bold font-sans font-bold"><select value={vowelId} onChange={e=>setVowelId(e.target.value)} className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold"><option value="">모음 선택...</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><input type="range" min="0" max="2" step="0.1" value={vowelGain} onChange={e=>setVowelGain(Number(e.target.value))} className="w-full accent-indigo-500"/></div>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-3 font-sans font-bold font-sans font-bold font-sans font-bold"><select value={consonantId} onChange={e=>setConsonantId(e.target.value)} className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold"><option value="">자음 선택...</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><input type="range" min="0" max="2" step="0.1" value={consonantGain} onChange={e=>setConsonantGain(Number(e.target.value))} className="w-full accent-pink-500 font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold"/></div>
                </div>
                <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-inner space-y-4 font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold">
                    <div className="flex justify-between items-center font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold">
                        <div className="flex gap-4 text-xs font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold"><span>자음 오프셋: {Math.round(offsetMs)}ms</span><span>모음 오프셋: {Math.round(vowelOffsetMs)}ms</span><span>자음 스트레치: {Math.round(consonantStretch*100)}%</span></div>
                        <button onClick={async () => { if(sourceRef.current) sourceRef.current.stop(); const b = await mixConsonant(); if(b) { const s = audioContext.createBufferSource(); s.buffer = b; s.connect(audioContext.destination); s.start(); sourceRef.current = s; setIsPlaying(true); s.onended = () => setIsPlaying(false); } }} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-lg font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold transition-all">{isPlaying ? '중지' : '미리보기'}</button>
                    </div>
                    <div className="h-48 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 relative font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold">
                        <canvas ref={canvasRef} width={1000} height={192} className="w-full h-full block cursor-crosshair font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold" 
                            onMouseDown={(e)=> {
                                const rect = canvasRef.current.getBoundingClientRect(); const x = (e.clientX-rect.left)*(1000/rect.width); const y = (e.clientY-rect.top)*(192/rect.height);
                                if(editMode==='placement') setDragging('cOff');
                                else if(editMode==='vVol') { 
                                     const vBuf = files.find(f => f.id === vowelId)?.buffer; if(!vBuf) return; const width = (vBuf.duration / 2.0) * 1000;
                                     const hitIdx = vVolumePts.findIndex(p=>Math.hypot(x-(vowelOffsetMs/(2000/1000)+p.t*width), y-(192-p.v*192))<15); 
                                     if(hitIdx===-1) { setVVolumePts(p => [...p, { t: Math.max(0, Math.min(1, (x - (vowelOffsetMs/2)) / width)), v: Math.max(0, Math.min(1, 1-(y/192))) }].sort((a,b)=>a.t-b.t)); } else setDragging(`vPoint:${hitIdx}`); 
                                } else if(editMode==='cVol') {
                                     const cBuf = files.find(f => f.id === consonantId)?.buffer; if(!cBuf) return; const width = (cBuf.duration * consonantStretch / 2.0) * 1000;
                                     const hitIdx = cVolumePts.findIndex(p=>Math.hypot(x-(offsetMs/(2000/1000)+p.t*width), y-(192-p.v*192))<15); 
                                     if(hitIdx===-1) { setCVolumePts(p => [...p, { t: Math.max(0, Math.min(1, (x - (offsetMs/2)) / width)), v: Math.max(0, Math.min(1, 1-(y/192))) }].sort((a,b)=>a.t-b.t)); } else setDragging(`cPoint:${hitIdx}`);
                                }
                            }}
                            onMouseMove={(e)=> {
                                if(!dragging) return; const rect = canvasRef.current.getBoundingClientRect(); const x = (e.clientX-rect.left)*(1000/rect.width), y = (e.clientY-rect.top)*(192/rect.height);
                                if(dragging === 'cOff') setOffsetMs(p => p + e.movementX*4);
                                else if(dragging.startsWith('vPoint')) {
                                     const vBuf = files.find(f => f.id === vowelId)?.buffer; if(!vBuf) return; const width = (vBuf.duration / 2.0) * 1000;
                                     setVVolumePts(prev => { const n = [...prev]; n[parseInt(dragging.split(':')[1])] = { t: Math.max(0, Math.min(1, (x - (vowelOffsetMs/2)) / width)), v: Math.max(0, Math.min(1, 1-(y/192))) }; return n.sort((a,b)=>a.t-b.t); });
                                } else if(dragging.startsWith('cPoint')) {
                                     const cBuf = files.find(f => f.id === consonantId)?.buffer; if(!cBuf) return; const width = (cBuf.duration * consonantStretch / 2.0) * 1000;
                                     setCVolumePts(prev => { const n = [...prev]; n[parseInt(dragging.split(':')[1])] = { t: Math.max(0, Math.min(1, (x - (offsetMs/2)) / width)), v: Math.max(0, Math.min(1, 1-(y/192))) }; return n.sort((a,b)=>a.t-b.t); });
                                }
                            }}
                            onMouseUp={()=>setDragging(null)}
                            onContextMenu={(e)=> {
                                e.preventDefault(); const rect = canvasRef.current.getBoundingClientRect(); const x = (e.clientX-rect.left)*(1000/rect.width), y = (e.clientY-rect.top)*(192/rect.height);
                                if(editMode==='vVol') {
                                     const vBuf = files.find(f => f.id === vowelId)?.buffer; if(!vBuf) return; const width = (vBuf.duration / 2.0) * 1000;
                                     const idx = vVolumePts.findIndex(p=>Math.hypot(x-(vowelOffsetMs/2+p.t*width), y-(192-p.v*192))<15);
                                     if(idx!==-1 && vVolumePts.length > 2) setVVolumePts(p => p.filter((_,i)=>i!==idx));
                                } else if(editMode==='cVol') {
                                     const cBuf = files.find(f => f.id === consonantId)?.buffer; if(!cBuf) return; const width = (cBuf.duration * consonantStretch / 2.0) * 1000;
                                     const idx = cVolumePts.findIndex(p=>Math.hypot(x-(offsetMs/2+p.t*width), y-(192-p.v*192))<15);
                                     if(idx!==-1 && cVolumePts.length > 2) setCVolumePts(p => p.filter((_,i)=>i!==idx));
                                }
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

const AdvancedTractTab = ({ audioContext, files, onAddToRack }) => {
    const [isAdvPlaying, setIsAdvPlaying] = useState(false);
    const [playHeadPos, setPlayHeadPos] = useState(0); 
    const [loopCount, setLoopCount] = useState(1);
    const [intensity, setIntensity] = useState(1.0);
    const [synthType, setSynthType] = useState('sawtooth');
    const [tractSourceFileId, setTractSourceFileId] = useState("");
    const [noiseSourceFileId, setNoiseSourceFileId] = useState("");
    const [manualPose, setManualPose] = useState(false);
    const [liveTract, setLiveTract] = useState({ x: 0.5, y: 0.4, lips: 0.7, lipLen: 0.5, throat: 0.5, nasal: 0.2, volume: 1.0 }); 
    const [simUndoStack, setSimUndoStack] = useState([]);
    const [selectedTrackId, setSelectedTrackId] = useState('tongueX'); 
    const [draggingKeyframe, setDraggingKeyframe] = useState(null); 
    const [dragPart, setDragPart] = useState(null); 

    const canvasRef = useRef(null);
    const waveCanvasRef = useRef(null); 
    const simPlaySourceRef = useRef(null);
    const animRef = useRef(null);
    const analyserRef = useRef(null); 
    const startTimeRef = useRef(0);

    const [advTracks, setAdvTracks] = useState([
        { id: 'tongueX', name: '혀 위치 (X)', color: '#60a5fa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'tongueY', name: '혀 위치 (Y)', color: '#4ade80', points: [{t:0, v:0.4}, {t:1, v:0.4}], min:0, max:1 },
        { id: 'lips',    name: '입술 열기', color: '#f472b6', points: [{t:0, v:0.7}, {t:1, v:0.7}], min:0, max:1 },
        { id: 'lipLen',  name: '입술 길이', color: '#db2777', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 }, 
        { id: 'throat',  name: '목 조임',   color: '#a78bfa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'nasal',   name: '비성',      color: '#fb923c', points: [{t:0, v:0.2}, {t:1, v:0.2}], min:0, max:1 },
        { id: 'volume',  name: '음량',      color: '#10b981', points: [{t:0, v:1.0}, {t:1, v:1.0}], min:0, max:2 },
        { id: 'pitch',   name: '음정 (Hz)', color: '#eab308', points: [{t:0, v:220}, {t:1, v:220}], min:50, max:800 },
        { id: 'breath',  name: '숨소리 (Noise)', color: '#94a3b8', points: [{t:0, v:0}, {t:1, v:0}], min:0, max:1 }
    ]);

    const pushSimUndo = useCallback(() => { setSimUndoStack(prev => [...prev.slice(-9), JSON.parse(JSON.stringify(advTracks))]); }, [advTracks]);
    const handleSimUndo = useCallback(() => { if (simUndoStack.length === 0) return; const prevTracks = simUndoStack[simUndoStack.length - 1]; setSimUndoStack(prev => prev.slice(0, -1)); setAdvTracks(prevTracks); }, [simUndoStack]);
    
    const registerKeyframe = () => {
        pushSimUndo();
        setAdvTracks(prev => prev.map(tr => {
            let val = 0;
            switch(tr.id) {
                case 'tongueX': val = liveTract.x; break;
                case 'tongueY': val = liveTract.y; break;
                case 'lips': val = liveTract.lips; break;
                case 'lipLen': val = liveTract.lipLen; break;
                case 'throat': val = liveTract.throat; break;
                case 'nasal': val = liveTract.nasal; break;
                case 'volume': val = liveTract.volume; break;
                default: return tr;
            }
            const threshold = 0.02; const idx = tr.points.findIndex(p => Math.abs(p.t - playHeadPos) < threshold);
            let n = [...tr.points]; if (idx !== -1) n[idx] = { ...n[idx], v: val }; else { n.push({ t: playHeadPos, v: val }); n.sort((a,b) => a.t - b.t); }
            return { ...tr, points: n };
        }));
        setManualPose(false); 
    };

    const applyPreset = (type) => {
        setManualPose(true); let x=0.5, y=0.5, l=0.5;
        switch(type) { case 'A': x=0.2; y=0.1; l=1.0; break; case 'E': x=0.8; y=0.6; l=0.8; break; case 'I': x=0.9; y=1.0; l=0.4; break; case 'O': x=0.2; y=0.5; l=0.3; break; case 'U': x=0.3; y=0.9; l=0.1; break; }
        setLiveTract(p => ({...p, x, y, lips: l}));
    };

    const renderOneCycle = useCallback(async () => {
        if (!audioContext) return null;
        const sr = audioContext.sampleRate; const totalLen = Math.max(1, Math.floor(sr * BASE_DURATION));
        const offline = new OfflineAudioContext(1, totalLen, sr);
        let sNode; const customInput = files.find(f => f.id === tractSourceFileId)?.buffer;
        if (customInput) { sNode = offline.createBufferSource(); sNode.buffer = customInput; sNode.loop = true; } 
        else if (synthType === 'noise') {
            const b = offline.createBuffer(1, totalLen, sr); const d = b.getChannelData(0);
            for (let i = 0; i < totalLen; i++) d[i] = Math.random() * 2 - 1;
            sNode = offline.createBufferSource(); sNode.buffer = b;
        } else {
            sNode = offline.createOscillator(); sNode.type = synthType;
            const tP = advTracks.find(t=>t.id==='pitch').points; sNode.frequency.setValueAtTime(tP[0].v, 0); 
            tP.forEach(p => sNode.frequency.linearRampToValueAtTime(p.v, p.t * BASE_DURATION)); 
        }
        let nNode; const customNoise = files.find(f => f.id === noiseSourceFileId)?.buffer;
        if (customNoise) { nNode = offline.createBufferSource(); nNode.buffer = customNoise; nNode.loop = true; } 
        else { nNode = offline.createBufferSource(); const nb = offline.createBuffer(1, totalLen, sr); const nd = nb.getChannelData(0); for(let i=0; i<totalLen; i++) nd[i] = Math.random() * 2 - 1; nNode.buffer = nb; }
        const nGain = offline.createGain(); const bP = advTracks.find(t=>t.id==='breath').points; nGain.gain.setValueAtTime(bP[0].v, 0); bP.forEach(p => nGain.gain.linearRampToValueAtTime(p.v, p.t * BASE_DURATION));
        const masterGainNode = offline.createGain(); const vP = advTracks.find(t=>t.id==='volume').points;
        masterGainNode.gain.setValueAtTime(vP[0].v, 0); vP.forEach(p => masterGainNode.gain.linearRampToValueAtTime(p.v, p.t * BASE_DURATION));
        const f1=offline.createBiquadFilter(), f2=offline.createBiquadFilter(), f3=offline.createBiquadFilter(), nasF=offline.createBiquadFilter();
        [f1,f2,f3].forEach(f=>{ f.type='peaking'; f.Q.value=4 * intensity; f.gain.value=12 * intensity; }); nasF.type='lowpass';
        const getPts = (id) => advTracks.find(t=>t.id===id).points;
        for(let i=0; i<=60; i++) {
            const t = i/60; const time = t * BASE_DURATION;
            const getV = (pts) => { if(pts.length===0) return 0; const idx = pts.findIndex(p=>p.t>=t); if(idx<=0) return pts[0].v; const p1=pts[idx-1], p2=pts[idx]; return p1.v + (p2.v-p1.v)*((t-p1.t)/(p2.t-p1.t)); };
            const x=getV(getPts('tongueX')), y=getV(getPts('tongueY')), l=getV(getPts('lips')), th=getV(getPts('throat')), n=getV(getPts('nasal'));
            f1.frequency.linearRampToValueAtTime(Math.max(50, 200 + (1-y)*600 - th*50), time); f2.frequency.linearRampToValueAtTime(800 + x*1400, time); f3.frequency.linearRampToValueAtTime(2000 + l*1500, time); nasF.frequency.linearRampToValueAtTime(10000 - n*9000, time);
        }
        sNode.connect(f1); nGain.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); nasF.connect(masterGainNode); masterGainNode.connect(offline.destination);
        sNode.start(0); nNode.start(0); return await offline.startRendering();
    }, [audioContext, advTracks, intensity, tractSourceFileId, noiseSourceFileId, files, synthType]);

    const handlePlayPauseSim = async () => {
        if (isAdvPlaying) { if (simPlaySourceRef.current) try { simPlaySourceRef.current.stop(); } catch (e) {} if (animRef.current) cancelAnimationFrame(animRef.current); setIsAdvPlaying(false); setPlayHeadPos(0); return; }
        const oneCycle = await renderOneCycle(); if (!oneCycle) return;
        let finalBuf = oneCycle; if (loopCount > 1) { for(let i=1; i<loopCount; i++) finalBuf = AudioUtils.concatBuffers(audioContext, finalBuf, oneCycle); }
        const s = audioContext.createBufferSource(); s.buffer = finalBuf; const analyser = audioContext.createAnalyser(); analyser.fftSize = 2048; analyserRef.current = analyser;
        s.connect(analyser); analyser.connect(audioContext.destination); s.start(0); simPlaySourceRef.current = s; setIsAdvPlaying(true); startTimeRef.current = audioContext.currentTime;
        const animate = () => {
            const elapsed = audioContext.currentTime - startTimeRef.current;
            if (elapsed >= finalBuf.duration) { setIsAdvPlaying(false); setPlayHeadPos(0); } 
            else { const currentCycleTime = elapsed % BASE_DURATION; setPlayHeadPos(currentCycleTime / BASE_DURATION); drawWaveform(); animRef.current = requestAnimationFrame(animate); }
        };
        animRef.current = requestAnimationFrame(animate);
    };

    const drawWaveform = () => {
        if(!analyserRef.current || !waveCanvasRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount); analyserRef.current.getByteTimeDomainData(data);
        const ctx = waveCanvasRef.current.getContext('2d'); const w = waveCanvasRef.current.width, h = waveCanvasRef.current.height;
        ctx.clearRect(0,0,w,h); ctx.lineWidth=2; ctx.strokeStyle='#94a3b8'; ctx.beginPath();
        const slice = w * 1.0 / data.length; let x = 0;
        for(let i=0; i<data.length; i++) { const v = data[i]/128.0; const y = v*h/2; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); x+=slice; } ctx.stroke();
    };

    useEffect(() => {
        const move = (e) => {
            if (!draggingKeyframe) return; const rect = canvasRef.current.getBoundingClientRect();
            const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            if (draggingKeyframe.isPlayhead) { setPlayHeadPos(nx); return; }
            const track = advTracks.find(tr => tr.id === draggingKeyframe.trackId);
            const nv = Math.max(track.min, Math.min(track.max, track.min + (1 - (e.clientY - rect.top - RULER_HEIGHT) / (rect.height - RULER_HEIGHT)) * (track.max - track.min)));
            setAdvTracks(prev => prev.map(tr => tr.id === draggingKeyframe.trackId ? { ...tr, points: tr.points.map((p, i) => i === draggingKeyframe.index ? { t: nx, v: nv } : p).sort((a, b) => a.t - b.t) } : tr));
        };
        const up = () => setDraggingKeyframe(null);
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [draggingKeyframe, advTracks]);

    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d'); const w = canvasRef.current.width, h = canvasRef.current.height;
        const track = advTracks.find(t => t.id === selectedTrackId);
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(0, RULER_HEIGHT, w, h - RULER_HEIGHT);
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= 10; i++) { const x = i * (w / 10); ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, h); } ctx.stroke();
        ctx.beginPath(); ctx.strokeStyle = track.color; ctx.lineWidth = 3; track.points.forEach((p, i) => { const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
        track.points.forEach((p) => { const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); ctx.fillStyle = track.color; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); });
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(playHeadPos * w, 0); ctx.lineTo(playHeadPos * w, h); ctx.stroke();
    }, [selectedTrackId, advTracks, playHeadPos]);

    return (
        <div className="flex-1 flex flex-col p-4 gap-4 animate-in fade-in overflow-hidden font-sans bg-slate-50 font-sans font-bold" onMouseUp={() => { setDragPart(null); }}>
            <div className="flex-[3] flex gap-4 min-h-0 overflow-hidden font-sans">
                <div className="flex-1 bg-white rounded-2xl border border-slate-300 relative overflow-hidden shadow-sm flex flex-col">
                    <div className="flex-1 relative flex items-center justify-center p-4 bg-slate-100/50">
                        <svg viewBox="0 0 400 400" className="w-full h-full max-w-[380px] drop-shadow-2xl font-sans">
                            <path d="M 50 250 Q 50 100 200 100 Q 350 100 350 250 L 350 400 L 50 400 Z" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                            <path d="M 350 220 Q 380 220 390 240" fill="none" stroke="#cbd5e1" strokeWidth="3" />
                            <path d="M 120 400 L 120 600" stroke="#94a3b8" strokeWidth={Math.max(2, 40 - liveTract.throat * 30)} strokeLinecap="round" opacity="0.5" />
                            <path d={`M 150 400 L 150 280 Q 150 150 250 150 Q 320 150 350 ${225 - liveTract.lips * 40} L 350 ${225 + liveTract.lips * 40} Q 320 350 250 350 Z`} fill="#f8fafc" stroke="#64748b" strokeWidth="3" />
                            <path d={`M 180 400 Q ${180 + liveTract.x * 160} ${330 - liveTract.y * 120} ${280 + liveTract.x * 50} ${250 + liveTract.y * 50}`} stroke="#f472b6" strokeWidth="18" strokeLinecap="round" fill="none" />
                            <ellipse cx={350 + liveTract.lipLen * 20} cy="225" rx={6 + liveTract.lipLen * 30} ry={3 + liveTract.lips * 40} fill="#db2777" opacity="0.85" className="cursor-move hover:opacity-100" />
                        </svg>
                        <div className="absolute inset-0 font-sans"
                            onMouseMove={(e) => {
                                if (!dragPart) return; const rect = e.currentTarget.getBoundingClientRect();
                                const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
                                if (dragPart === 'lips') setLiveTract(p => ({...p, lipLen: x, lips: y})); else if (dragPart === 'tongue') setLiveTract(p => ({ ...p, x, y }));
                            }}
                            onMouseDown={(e) => {
                                if (dragPart) return; setManualPose(true); const rect = e.currentTarget.getBoundingClientRect();
                                const nx = (e.clientX - rect.left) / rect.width, ny = (e.clientY - rect.top) / rect.height;
                                if (nx > 0.75 && ny > 0.4 && ny < 0.7) { setDragPart('lips'); }
                                else if (nx > 0.3 && nx < 0.8 && ny > 0.4 && ny < 1.0) { setDragPart('tongue'); setLiveTract(p => ({ ...p, x: nx, y: 1 - ny })); }
                            }}
                        />
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center font-bold">
                        <div className="flex gap-2">
                            <button onClick={handleSimUndo} disabled={simUndoStack.length === 0} className="p-2 bg-white rounded-xl border border-slate-300 disabled:opacity-30"><Undo2 size={18} /></button>
                            <button onClick={() => { pushSimUndo(); setAdvTracks(prev => prev.map(t => ({ ...t, points: [{ t: 0, v: t.id === 'pitch' ? 220 : t.id === 'volume' ? 1 : 0.5 }, { t: 1, v: t.id === 'pitch' ? 220 : t.id === 'volume' ? 1 : 0.5 }] }))); setManualPose(false); }} className="p-2 bg-white rounded-xl border border-slate-300 text-red-500 font-bold"><RotateCcw size={18} /></button>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={registerKeyframe} className="bg-[#209ad6] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg active:scale-95 transition-all flex items-center gap-2"><CircleDot size={16} /> 키프레임 등록</button>
                            <button onClick={handlePlayPauseSim} className="bg-white border border-slate-300 text-slate-700 px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center gap-2 font-sans font-bold font-sans font-bold">{isAdvPlaying ? <Pause size={16} /> : <Play size={16} />} {isAdvPlaying ? '중지' : '재생'}</button>
                            <button onClick={async () => {
                                const c = await renderOneCycle(); if (!c) return;
                                let f = c; for (let i = 1; i < loopCount; i++) f = AudioUtils.concatBuffers(audioContext, f, c);
                                onAddToRack(f, "시뮬레이션_결과");
                            }} className="bg-[#a3cef0] hover:bg-[#209ad6] hover:text-white text-[#1f1e1d] px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg active:scale-95 transition-all flex items-center gap-1 font-sans font-bold transition-all"><LogIn size={16} /> 보관함에 저장</button>
                        </div>
                    </div>
                </div>
                <div className="w-72 bg-white/40 rounded-2xl border border-slate-300 p-3 flex flex-col gap-4 overflow-y-auto custom-scrollbar font-bold font-sans">
                    <h3 className="font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 text-xs"><Sliders size={18} className="text-[#209ad6]" /> 파라미터</h3>
                    <div className="space-y-3 font-sans">
                        <div className="flex gap-2 mb-2 font-sans">{['A','E','I','O','U'].map(v => <button key={v} onClick={() => applyPreset(v)} className="flex-1 h-8 rounded-lg bg-white border border-slate-300 font-bold text-xs hover:bg-[#209ad6] hover:text-white transition-all font-sans font-bold">{v}</button>)}</div>
                        <div className="space-y-1 mb-2 font-sans">
                            <div className="flex justify-between text-xs text-slate-700 font-black font-sans font-bold font-sans"><span>음량</span><span>{Math.round(liveTract.volume * 100)}%</span></div>
                            <input type="range" min="0" max="2" step="0.01" value={liveTract.volume} onChange={e => { setManualPose(true); setLiveTract(prev => ({ ...prev, volume: Number(e.target.value) })); }} className="w-full h-1.5 bg-slate-300 rounded-full accent-emerald-500 font-sans" />
                        </div>
                        {[{id:'lips',label:'입술 열기'},{id:'lipLen',label:'입술 길이'},{id:'throat',label:'목 조임'},{id:'nasal',label:'비성'}].map(p => (
                            <div key={p.id} className="space-y-1 font-sans">
                                <div className="flex justify-between text-xs text-slate-500 font-black font-sans"><span>{p.label}</span><span>{Math.round(liveTract[p.id]*100)}%</span></div>
                                <input type="range" min="0" max="1" step="0.01" value={liveTract[p.id]} onChange={e=>{setManualPose(true); setLiveTract(prev=>({...prev,[p.id]:Number(e.target.value)}));}} className="w-full h-1 bg-slate-300 rounded-full accent-[#209ad6] font-sans" />
                            </div>
                        ))}
                        <div className="pt-2 border-t border-slate-200 font-sans">
                             <div className="flex justify-between text-xs font-black text-slate-400 uppercase tracking-widest mb-1 font-sans"><span>소스 설정</span></div>
                             <div className="flex gap-2 font-sans">
                                <select value={synthType} onChange={e=>setSynthType(e.target.value)} className="w-24 text-[10px] p-1.5 rounded border border-slate-200 font-sans font-bold font-sans"><option value="sawtooth">톱니파</option><option value="sine">사인파</option><option value="square">사각파</option><option value="triangle">삼각파</option><option value="noise">노이즈</option></select>
                                <select value={tractSourceFileId} onChange={e=>setTractSourceFileId(e.target.value)} className="flex-1 text-[10px] p-1.5 rounded border border-slate-200 font-sans font-bold font-sans"><option value="">기본 신디</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                             </div>
                             <div className="flex justify-between items-center text-xs text-slate-500 font-black mt-2 font-sans"><span>반복 횟수</span><input type="number" min="1" step="1" value={loopCount} onChange={e => setLoopCount(parseInt(e.target.value) || 1)} className="w-12 border rounded px-1 text-center font-sans" /></div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="h-48 bg-white/40 rounded-3xl border border-slate-300 p-3 flex flex-col gap-2 shadow-inner relative overflow-hidden font-sans">
                <canvas ref={waveCanvasRef} width={1000} height={192} className="absolute inset-0 w-full h-full pointer-events-none opacity-20 z-0" />
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar z-10 font-black font-sans">
                    {advTracks.map(t => <button key={t.id} onClick={() => setSelectedTrackId(t.id)} className={`px-4 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap font-sans font-black ${selectedTrackId === t.id ? 'bg-[#209ad6] text-white border-[#209ad6] shadow-md' : 'bg-white/80 text-slate-500 border-slate-200 hover:border-slate-300'}`}>{t.name}</button>)}
                </div>
                <div className="flex-1 rounded-2xl border border-slate-200 relative overflow-hidden z-10 bg-white/50 backdrop-blur-[1px] font-sans" onContextMenu={e=>e.preventDefault()}>
                    <canvas ref={canvasRef} width={1000} height={150} className="w-full h-full cursor-crosshair font-black font-sans" 
                        onMouseDown={(e)=> {
                            const rect = canvasRef.current.getBoundingClientRect(); const mx = (e.clientX-rect.left)*(1000/rect.width), my = (e.clientY-rect.top)*(150/rect.height);
                            const t = Math.max(0, Math.min(1, mx / 1000)); if (my < RULER_HEIGHT) { setPlayHeadPos(t); return; }
                            const track = advTracks.find(tr => tr.id === selectedTrackId);
                            const hitIdx = track.points.findIndex(p => Math.hypot(p.t*1000-mx, RULER_HEIGHT+(1-(p.v-track.min)/(track.max-track.min))*(150-RULER_HEIGHT)-my) < 15);
                            if(hitIdx!==-1) setDraggingKeyframe({ index: hitIdx, trackId: selectedTrackId });
                            else { const nv = track.min+(1-(my-RULER_HEIGHT)/(150-RULER_HEIGHT))*(track.max-track.min); const nP = [...track.points, {t,v:nv}].sort((a,b)=>a.t-b.t); setAdvTracks(prev=>prev.map(tr=>tr.id===selectedTrackId?{...tr,points:nP}:tr)); }
                        }}
                        onMouseMove={(e)=> {
                            if(!draggingKeyframe) return; const rect = canvasRef.current.getBoundingClientRect(); const mx = (e.clientX-rect.left)*(1000/rect.width), my = (e.clientY-rect.top)*(150/rect.height);
                            const t = Math.max(0, Math.min(1, mx / 1000)); const track = advTracks.find(tr => tr.id === draggingKeyframe.trackId);
                            const nv = Math.max(track.min, Math.min(track.max, track.min+(1-(my-RULER_HEIGHT)/(150-RULER_HEIGHT))*(track.max-track.min)));
                            setAdvTracks(prev=>prev.map(tr=>tr.id===draggingKeyframe.trackId?{...tr,points:tr.points.map((p,i)=>i===draggingKeyframe.index?{t,v:nv}:p).sort((a,b)=>a.t-b.t)}:tr));
                        }}
                        onMouseUp={()=>setDraggingKeyframe(null)}
                        onContextMenu={(e)=> {
                            e.preventDefault(); const rect = canvasRef.current.getBoundingClientRect(); const mx = (e.clientX-rect.left)*(1000/rect.width), my = (e.clientY-rect.top)*(150/rect.height);
                            const track = advTracks.find(tr => tr.id === selectedTrackId);
                            const hitIdx = track.points.findIndex(p => Math.hypot(p.t*1000-mx, RULER_HEIGHT+(1-(p.v-track.min)/(track.max-track.min))*(150-RULER_HEIGHT)-my) < 15);
                            if(hitIdx!==-1 && track.points.length > 2) setAdvTracks(prev=>prev.map(tr=>tr.id===selectedTrackId?{...tr,points:tr.points.filter((_,i)=>i!==hitIdx)}:tr));
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 5. App Root Component
// ==========================================

const App = () => {
    const [audioContext, setAudioContext] = useState(null);
    const [files, setFiles] = useState([]);
    const [activeFileId, setActiveFileId] = useState(null);
    const [activeTab, setActiveTab] = useState('editor');
    const [showHelp, setShowHelp] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => { if (typeof window !== 'undefined') { const Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx) setAudioContext(new Ctx()); } }, []);

    const addToRack = (buffer, name) => { 
        const newFile = { id: Math.random().toString(36).substr(2, 9), name: name || "새 오디오", buffer, history: [{ label: "원본", data: buffer, timestamp: Date.now() }], historyIndex: 0 }; 
        setFiles(prev => [...prev, newFile]); setActiveFileId(newFile.id); 
    };

    const handleFileEdit = (id, newBuffer, label) => {
        setFiles(prev => prev.map(f => {
            if (f.id !== id) return f;
            const currentHistory = f.history.slice(0, f.historyIndex + 1);
            const newHistory = [...currentHistory, { label, data: newBuffer, timestamp: Date.now() }];
            if (newHistory.length > 20) newHistory.shift();
            return { ...f, buffer: newBuffer, history: newHistory, historyIndex: newHistory.length - 1 };
        }));
    };

    const handleUndo = (id) => { setFiles(prev => prev.map(f => { if (f.id !== id || f.historyIndex <= 0) return f; const newIndex = f.historyIndex - 1; return { ...f, buffer: f.history[newIndex].data, historyIndex: newIndex }; })); };
    const handleRedo = (id) => { setFiles(prev => prev.map(f => { if (f.id !== id || f.historyIndex >= f.history.length - 1) return f; const newIndex = f.historyIndex + 1; return { ...f, buffer: f.history[newIndex].data, historyIndex: newIndex }; })); };

    const handleFileUpload = async (e) => { if(!audioContext) return; for(const file of Array.from(e.target.files)) { const buffer = await audioContext.decodeAudioData(await file.arrayBuffer()); addToRack(buffer, file.name); } };

    const exportProject = async () => {
        const data = { files: await Promise.all(files.map(async f => ({ id: f.id, name: f.name, history: f.history.map(h => ({ label: h.label, timestamp: h.timestamp, data: AudioUtils.serializeBuffer(h.data) })), historyIndex: f.historyIndex }))), exportDate: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `otonashi_project.json`; a.click();
    };

    const importProject = async (e) => {
        const file = e.target.files[0]; if(!file || !audioContext) return;
        const reader = new FileReader(); reader.onload = async (re) => {
            try {
                const data = JSON.parse(re.target.result);
                const loaded = await Promise.all(data.files.map(async f => {
                    const h = await Promise.all(f.history.map(async item => ({ label: item.label, timestamp: item.timestamp, data: await AudioUtils.deserializeBuffer(audioContext, item.data) })));
                    return { id: f.id, name: f.name, buffer: h[f.historyIndex].data, history: h, historyIndex: f.historyIndex };
                }));
                setFiles(loaded); if (loaded.length > 0) setActiveFileId(loaded[0].id);
            } catch (err) { alert("파일을 불러올 수 없습니다."); }
        }; reader.readAsText(file);
    };

    const activeFile = files.find(f => f.id === activeFileId);

    return (
        <div className="h-screen w-full bg-[#f8f8f6] text-[#1f1e1d] flex flex-col font-sans overflow-hidden font-sans font-bold">
            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
            {showHistory && activeFile && <HistoryModal history={activeFile.history} currentIndex={activeFile.historyIndex} onJump={(idx) => { setFiles(prev=>prev.map(f=>f.id===activeFile.id?{...f,buffer:f.history[idx].data,historyIndex:idx}:f)); setShowHistory(false); }} onClose={() => setShowHistory(false)} />}
            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }`}</style>
            <header className="h-14 border-b border-slate-300 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm font-sans font-bold font-sans">
                <div className="flex items-center gap-3">
                    <div className="bg-[#209ad6] p-1.5 rounded-lg text-white shadow-lg"><Activity size={24}/></div>
                    <div className="flex flex-col font-bold font-sans">
                        <h1 className="font-black text-2xl tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-r from-[#b2d4ed] via-[#3c78e8] to-[#e3daf5] font-sans font-bold font-sans">OTONASHI</h1>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">AUgmented vocal-TracT and Nasal SImulator</span>
                    </div>
                </div>
                <nav className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 font-bold font-sans font-bold font-sans">
                    <button onClick={()=>setActiveTab('editor')} className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${activeTab==='editor'?'bg-white text-[#209ad6] shadow-sm border border-slate-200 font-sans font-bold font-sans':'text-slate-500 hover:text-slate-800'}`}>스튜디오</button>
                    <button onClick={()=>setActiveTab('consonant')} className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${activeTab==='consonant'?'bg-white text-[#209ad6] shadow-sm border border-slate-200 font-sans font-bold font-sans':'text-slate-500 hover:text-slate-800'}`}>자음 합성</button>
                    <button onClick={()=>setActiveTab('sim')} className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${activeTab==='sim'?'bg-white text-[#209ad6] shadow-sm border border-slate-200 font-sans font-bold font-sans':'text-slate-500 hover:text-slate-800'}`}>성도 시뮬레이터</button>
                </nav>
                <div className="flex items-center gap-3 font-bold font-sans font-bold font-sans">
                    <button onClick={() => setShowHistory(true)} className="flex items-center gap-1 p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] hover:bg-white shadow-sm transition-all"><History size={18}/> <span className="text-xs hidden md:inline font-black font-sans">History</span></button>
                    <button onClick={exportProject} className="p-2.5 bg-white border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] shadow-sm transition-all font-sans font-black font-sans font-bold font-sans font-bold"><DownloadCloud size={20}/></button>
                    <label className="p-2.5 bg-white border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] shadow-sm cursor-pointer transition-all font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold"><UploadCloud size={20}/><input type="file" className="hidden" accept=".json" onChange={importProject}/></label>
                    <button onClick={() => setShowHelp(true)} className="text-slate-400 hover:text-slate-600 transition-colors font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold"><Settings size={22}/></button>
                    <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center shadow-inner font-sans font-black transition-all font-sans font-bold font-sans font-bold"><User size={24} className="text-slate-400 font-sans font-black"/></div>
                </div>
            </header>
            <main className="flex-1 flex overflow-hidden font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold">
                <FileRack files={files} activeFileId={activeFileId} setActiveFileId={setActiveFileId} handleFileUpload={handleFileUpload} removeFile={removeFile} renameFile={renameFile} />
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto relative shadow-inner custom-scrollbar h-full font-sans font-bold">
                    <div className={activeTab === 'editor' ? 'block h-full' : 'hidden'}>
                        <StudioTab audioContext={audioContext} activeFile={activeFile} onAddToRack={addToRack} setActiveFileId={setActiveFileId} onEdit={handleFileEdit} onUndo={handleUndo} onRedo={handleRedo} />
                    </div>
                    <div className={activeTab === 'consonant' ? 'block h-full' : 'hidden'}>
                        <ConsonantTab audioContext={audioContext} files={files} onAddToRack={addToRack} />
                    </div>
                    <div className={activeTab === 'sim' ? 'block h-full' : 'hidden'}>
                        <AdvancedTractTab audioContext={audioContext} files={files} onAddToRack={addToRack} />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
