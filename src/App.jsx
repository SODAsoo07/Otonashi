import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Upload, Play, Pause, Square, Download, Scissors, Music, Sliders, Activity, 
  Layers, Zap, Mic2, Copy, Clipboard, TrendingUp, X, FileAudio, Plus, 
  LogIn, Edit2, CircleDot, User, MoveHorizontal, Check, MousePointer2, 
  SlidersHorizontal, RotateCcw, Combine, Undo2, TrendingDown,
  CloudUpload, DownloadCloud, UploadCloud, FlipHorizontal, ArrowLeftRight, Crop, FilePlus, Settings, HelpCircle, RefreshCw,
  History, SignalLow, SignalHigh, Redo2
} from 'lucide-react';

// Firebase Imports (Safe Import)
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// ==========================================
// 1. Firebase & Global Constants (Safe Init)
// ==========================================

let app = null;
let auth = null;
let db = null;
let appId = 'otonashi-v81';

try {
  const getEnvVar = (key) => {
    try { return import.meta.env[key] || ""; } catch (e) { return ""; }
  };

  const firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : {
        apiKey: getEnvVar('VITE_FIREBASE_API_KEY'),
        authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN'),
        projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID'),
        storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET'),
        messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID'),
        appId: getEnvVar('VITE_FIREBASE_APP_ID')
      };

  // Check if config is valid before initializing
  if (firebaseConfig && firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
  
  if (typeof __app_id !== 'undefined') {
      appId = __app_id.replace(/\//g, '_');
  }
  
} catch (e) {
  console.warn("Firebase Init Skipped (Offline Mode Active):", e);
}

const RULER_HEIGHT = 24;

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
  createSilence: (ctx, sec) => {
    if(!ctx) return null;
    return ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * sec)), ctx.sampleRate);
  },
  downloadWav: async (buffer, name) => {
    if (!buffer) return;
    const targetRate = 44100;
    const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * targetRate), targetRate);
    const s = offline.createBufferSource();
    s.buffer = buffer;
    s.connect(offline.destination);
    s.start(0);
    const rendered = await offline.startRendering();
    
    const pcmData = rendered.getChannelData(0);
    const wavLen = 44 + pcmData.length * 2;
    const arrayBuffer = new ArrayBuffer(wavLen);
    const view = new DataView(arrayBuffer);
    
    const writeString = (v, offset, string) => {
        for (let i = 0; i < string.length; i++) v.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); 
    view.setUint16(22, 1, true); 
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true); 
    view.setUint16(34, 16, true); 
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.length * 2, true);

    let offset = 44;
    for (let i = 0; i < pcmData.length; i++) {
        let sample = Math.max(-1, Math.min(1, pcmData[i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
        offset += 2;
    }

    const blob = new Blob([view], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.wav`;
    a.click();
  }
};

// ==========================================
// 3. UI Sub-Components
// ==========================================

const HelpModal = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div className="bg-white w-[800px] max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden font-sans" onClick={e => e.stopPropagation()}>
         <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
           <div className="flex items-center gap-2">
             <Activity className="text-[#209ad6] w-5 h-5"/>
             <h2 className="text-lg font-black text-slate-800 tracking-tight">OTONASHI 도움말</h2>
           </div>
           <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"><X size={20}/></button>
         </div>
         <div className="p-8 overflow-y-auto custom-scrollbar text-slate-600 leading-relaxed text-sm space-y-4">
            <p><strong>환영합니다!</strong> OTONASHI는 성도 시뮬레이션 및 오디오 편집 도구입니다.</p>
            <p>1. <strong>스튜디오</strong>: 파일을 드래그하여 로드하고, 자르거나 효과를 적용하세요. 그래프를 드래그하여 구간을 선택할 수 있습니다.</p>
            <p>2. <strong>자음 합성</strong>: 두 개의 소리를 믹싱하고 볼륨 곡선을 그려 발음을 조절하세요.</p>
            <p>3. <strong>성도 시뮬레이터</strong>: 혀와 입술 모양을 잡고 <code>키프레임 등록</code>을 통해 타임라인에 소리를 생성하세요.</p>
            <p className="text-xs text-slate-400 mt-4">* 클라우드 저장은 Firebase 설정이 필요합니다.</p>
         </div>
      </div>
    </div>
  );
};

const FadeModal = ({ type, onClose, onApply }) => {
    const [shape, setShape] = useState('linear');
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in zoom-in-95" onClick={onClose}>
            <div className="bg-white p-6 rounded-xl shadow-2xl w-80 font-sans" onClick={e=>e.stopPropagation()}>
                <h3 className="text-lg font-black text-slate-700 mb-4 flex items-center gap-2">
                    {type === 'in' ? <SignalLow size={20}/> : <SignalHigh size={20}/>}
                    Fade {type === 'in' ? 'In' : 'Out'} 설정
                </h3>
                <div className="flex gap-2 mb-6">
                    <button onClick={()=>setShape('linear')} className={`flex-1 py-3 rounded-lg border font-bold text-xs ${shape==='linear'?'bg-[#209ad6] text-white border-[#209ad6]':'bg-slate-50 text-slate-500 border-slate-200'}`}>직선 (Linear)</button>
                    <button onClick={()=>setShape('exponential')} className={`flex-1 py-3 rounded-lg border font-bold text-xs ${shape==='exponential'?'bg-[#209ad6] text-white border-[#209ad6]':'bg-slate-50 text-slate-500 border-slate-200'}`}>곡선 (Exp)</button>
                </div>
                <button onClick={()=>{ onApply(shape); onClose(); }} className="w-full py-3 bg-[#209ad6] text-white rounded-lg font-bold shadow-md hover:bg-[#1a85b9] transition-all">적용하기</button>
            </div>
        </div>
    );
};

const FileRack = ({ files, activeFileId, setActiveFileId, handleFileUpload, removeFile, renameFile, isSaving }) => {
  const [editingId, setEditingId] = useState(null);
  const [tempName, setTempName] = useState("");
  const submitRename = (id) => { if(tempName.trim()) renameFile(id, tempName.trim()); setEditingId(null); };

  return (
    <aside className="w-64 bg-white/40 border-r border-slate-300 flex flex-col shrink-0 font-sans z-20">
      <div className="p-4 border-b border-slate-300 flex justify-between items-center bg-slate-200/50">
        <span className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
          파일 보관함 {isSaving && <RefreshCw size={10} className="animate-spin text-blue-500" />}
        </span>
        <label className="cursor-pointer hover:bg-slate-300 p-1 rounded transition text-[#209ad6]" title="파일 추가">
          <Plus className="w-4 h-4"/><input type="file" multiple accept=".wav,.mp3,audio/*" className="hidden" onChange={handleFileUpload}/>
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-sans custom-scrollbar">
        {files.map(f => (
          <div key={f.id} draggable onDragStart={(e) => e.dataTransfer.setData("fileId", f.id)}
               className={`p-2.5 rounded-lg cursor-grab active:cursor-grabbing text-sm flex items-center gap-2 transition border group ${activeFileId === f.id ? 'bg-[#a3cef0]/30 border-[#209ad6]/40 text-[#1f1e1d]' : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-200'}`}>
            <div className="flex-1 flex items-center gap-2 overflow-hidden" onClick={() => setActiveFileId(f.id)}>
              <FileAudio className={`w-5 h-5 flex-shrink-0 ${activeFileId===f.id?'text-[#209ad6]':'text-slate-400'}`}/> 
              {editingId === f.id ? (
                <input autoFocus className="bg-white border border-blue-400 rounded px-1 w-full outline-none font-sans" value={tempName} onChange={e => setTempName(e.target.value)} onBlur={() => submitRename(f.id)} onKeyDown={e => e.key === 'Enter' && submitRename(f.id)} />
              ) : (
                <span className="truncate font-medium">{f.name}</span>
              )}
            </div>
            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                <button onClick={() => AudioUtils.downloadWav(f.buffer, f.name)} title="WAV 다운로드" className="p-1 hover:text-[#209ad6]"><Download size={14}/></button>
                <button onClick={() => { setEditingId(f.id); setTempName(f.name); }} title="이름 변경" className="p-1 hover:text-[#209ad6]"><Edit2 size={14}/></button>
                <button onClick={(e) => { e.stopPropagation(); removeFile(f.id); }} title="삭제" className="p-1 hover:text-red-500"><X size={14}/></button>
            </div>
          </div>
        ))}
        {files.length === 0 && <div className="text-center py-10 opacity-30 text-xs font-bold text-slate-400 uppercase">보관함이 비었습니다</div>}
      </div>
      <div className="p-3 text-xs text-slate-400 font-bold text-center border-t border-slate-200/50 uppercase tracking-tighter">
        Made by SODAsoo 탄산소다수
      </div>
    </aside>
  );
};

const StudioTab = ({ audioContext, activeFile, onAddToRack, setActiveFileId, onEdit, onUndo, onRedo }) => {
    const [studioBuffer, setStudioBuffer] = useState(null);
    const [editTrim, setEditTrim] = useState({ start: 0, end: 100 });
    const [isPlaying, setIsPlaying] = useState(false);
    const [playheadPos, setPlayheadPos] = useState(0); 
    const [dragTarget, setDragTarget] = useState(null);
    const [selectionAnchor, setSelectionAnchor] = useState(null); 
    const [clipboard, setClipboard] = useState(null);
    const [undoStack, setUndoStack] = useState([]);
    const [masterGain, setMasterGain] = useState(1.0);
    const [pitchCents, setPitchCents] = useState(0);
    const [genderShift, setGenderShift] = useState(1.0);
    const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 });
    const [formant, setFormant] = useState({ f1: 500, f2: 1500, f3: 2500, resonance: 4.0 });
    const [showAutomation, setShowAutomation] = useState(false);
    const [showStretchModal, setShowStretchModal] = useState(false);
    const [stretchRatio, setStretchRatio] = useState(100);
    const [volumeKeyframes, setVolumeKeyframes] = useState([{t:0, v:1}, {t:1, v:1}]);
    const [fadeModalType, setFadeModalType] = useState(null);

    const canvasRef = useRef(null);
    const sourceRef = useRef(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);
    const animationRef = useRef(null);
    const fileInputRef = useRef(null);

    const prevFileId = useRef(null);
    
    // ** Fixed File Loading & Selection Logic **
    useEffect(() => {
        if(activeFile && activeFile.id !== prevFileId.current) {
            setStudioBuffer(activeFile.buffer);
            setEditTrim({ start: 0, end: 100 }); // Default full selection
            prevFileId.current = activeFile.id;
            setUndoStack([]); // Reset local undo when file changes
        }
    }, [activeFile]);

    const pushUndo = useCallback(() => { if (studioBuffer) setUndoStack(prev => [...prev.slice(-19), studioBuffer]); }, [studioBuffer]);
    const updateStudioBuffer = (newBuf) => { setStudioBuffer(newBuf); };
    const handleUndo = useCallback(() => { 
        if (undoStack.length === 0) return; 
        const prevBuf = undoStack[undoStack.length - 1]; 
        setUndoStack(prev => prev.slice(0, -1)); 
        setStudioBuffer(prevBuf); 
    }, [undoStack]);
    
    const handleStop = useCallback(() => {
        if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} sourceRef.current = null; }
        setIsPlaying(false); setPlayheadPos(0); pauseOffsetRef.current = 0;
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }, []);

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

    const handleDrop = async (e) => { 
        e.preventDefault(); 
        const fileId = e.dataTransfer.getData("fileId"); 
        if (fileId) {
            setActiveFileId(fileId);
            return;
        }
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
            onAddToRack(buffer, file.name); 
        }
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
        const g1 = offline.createGain();
        if(showAutomation) {
            g1.gain.setValueAtTime(volumeKeyframes[0].v, 0);
            volumeKeyframes.forEach(kf => g1.gain.linearRampToValueAtTime(kf.v, kf.t * buf.duration));
        }
        s1.connect(g1);
        g1.connect(lowF);
        s1.start(0);
        return await offline.startRendering();
    };

    const handlePlayPause = async () => {
        if(isPlaying) {
            if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} pauseOffsetRef.current = audioContext.currentTime - startTimeRef.current; setIsPlaying(false); }
            return;
        }
        if(!studioBuffer || !audioContext) return;
        const processedBuf = await renderStudioAudio(studioBuffer);
        const s = audioContext.createBufferSource(); s.buffer = processedBuf; s.connect(audioContext.destination);
        const startOffset = pauseOffsetRef.current || 0;
        s.start(0, startOffset % processedBuf.duration); startTimeRef.current = audioContext.currentTime - (startOffset % processedBuf.duration);
        sourceRef.current = s; setIsPlaying(true);
        s.onended = () => { if (Math.abs((audioContext.currentTime - startTimeRef.current) - processedBuf.duration) < 0.1) { setIsPlaying(false); setPlayheadPos(0); pauseOffsetRef.current = 0; } };
    };

    useEffect(() => {
        if(!canvasRef.current || !studioBuffer) return;
        const ctx = canvasRef.current.getContext('2d'); const w = canvasRef.current.width; const h = canvasRef.current.height;
        const data = studioBuffer.getChannelData(0); const step = Math.ceil(data.length/w);
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#f8f8f6'; ctx.fillRect(0,0,w,h);
        ctx.beginPath(); ctx.strokeStyle = '#3c78e8'; ctx.lineWidth = 1;
        for(let i=0;i<w;i++){ let min=1,max=-1; for(let j=0;j<step;j++){ const d=data[i*step+j]; if(d<min)min=d; if(d>max)max=d; } ctx.moveTo(i, h/2+min*h/2); ctx.lineTo(i, h/2+max*h/2); } ctx.stroke();
        const sX = (editTrim.start/100)*w; const eX = (editTrim.end/100)*w;
        ctx.fillStyle = 'rgba(60, 120, 232, 0.15)'; ctx.fillRect(sX, 0, eX-sX, h);
        ctx.strokeStyle = '#209ad6'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(sX,0); ctx.lineTo(sX,h); ctx.moveTo(eX,0); ctx.lineTo(eX,h); ctx.stroke();
        const phX = (playheadPos / 100) * w; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(phX, 0); ctx.lineTo(phX, h); ctx.stroke();
        if(showAutomation) {
            ctx.beginPath(); ctx.strokeStyle = '#eab308'; ctx.lineWidth = 2;
            volumeKeyframes.forEach((kf, i) => { const x = kf.t * w; const y = h - (Math.min(kf.v, 2) / 2 * h); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); ctx.fillStyle = '#eab308'; ctx.fillRect(x-3, y-3, 6, 6); }); ctx.stroke();
        }
    }, [studioBuffer, editTrim, showAutomation, volumeKeyframes, playheadPos]);

    // ** Corrected Selection Logic: Dragging anywhere makes new selection **
    const handleCanvasMouseDown = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        if(showAutomation) {
             const x=e.clientX-rect.left; const y=e.clientY-rect.top; const t=x/rect.width; const v=2-(y/rect.height*2); setVolumeKeyframes(prev=>[...prev,{t:Math.max(0,Math.min(1,t)), v:Math.max(0,v)}].sort((a,b)=>a.t-b.t));
             return;
        }

        const p = ((e.clientX - rect.left) / rect.width) * 100;
        
        // Hit detection for resizing edges
        if (Math.abs(p - editTrim.start) < 2) setDragTarget('start');
        else if (Math.abs(p - editTrim.end) < 2) setDragTarget('end');
        else {
            // New selection anchor
            setDragTarget('new');
            setSelectionAnchor(p); 
            setEditTrim({ start: p, end: p });
        }
    };

    const handleCanvasMouseMove = (e) => {
        if (!dragTarget) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const p = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

        if (dragTarget === 'start') {
            setEditTrim(prev => ({ ...prev, start: Math.min(p, prev.end) }));
        } else if (dragTarget === 'end') {
            setEditTrim(prev => ({ ...prev, end: Math.max(p, prev.start) }));
        } else if (dragTarget === 'new' && selectionAnchor !== null) {
            const newStart = Math.min(selectionAnchor, p);
            const newEnd = Math.max(selectionAnchor, p);
            setEditTrim({ start: newStart, end: newEnd });
        }
    };

    return (
        <div className="flex-1 flex flex-col gap-4 p-4 font-sans overflow-y-auto custom-scrollbar h-full" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
            {fadeModalType && <FadeModal type={fadeModalType} onClose={()=>setFadeModalType(null)} onApply={async (shape) => {
                if(!studioBuffer) return; 
                pushUndo();
                updateStudioBuffer(await AudioUtils.applyFade(audioContext, studioBuffer, fadeModalType, editTrim.start, editTrim.end, shape));
            }} />}

            <div className="flex-shrink-0 flex flex-col gap-4">
                <div className="bg-white/50 rounded-xl border border-slate-300 p-2 flex justify-between items-center shadow-sm">
                    <div className="flex gap-1">
                        <button onClick={handleUndo} disabled={undoStack.length === 0} title="실행 취소" className="p-2 hover:bg-slate-200 rounded text-slate-600 disabled:opacity-30"><Undo2 size={16}/></button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={() => { if(!studioBuffer) return; pushUndo(); setClipboard(AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end)); updateStudioBuffer(AudioUtils.deleteRange(audioContext, studioBuffer, editTrim.start, editTrim.end)); }} title="잘라내기(삭제)" className="p-2 hover:bg-slate-200 rounded text-slate-600"><Scissors size={16}/></button>
                        <button onClick={() => { if(!studioBuffer) return; pushUndo(); updateStudioBuffer(AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end)); }} title="크롭" className="p-2 hover:bg-slate-200 rounded text-slate-600"><Crop size={16}/></button>
                        <button onClick={() => { if(!studioBuffer) return; setClipboard(AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end)); }} title="복사" className="p-2 hover:bg-slate-200 rounded text-slate-600"><Copy size={16}/></button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={() => { if(!clipboard || !studioBuffer) return; pushUndo(); updateStudioBuffer(AudioUtils.insertBuffer(audioContext, studioBuffer, clipboard, editTrim.end)); }} title="붙여넣기 (삽입)" className="p-2 hover:bg-slate-200 rounded text-slate-600"><Clipboard size={16}/></button>
                        <button onClick={() => { if(!clipboard || !studioBuffer) return; pushUndo(); updateStudioBuffer(AudioUtils.mixBuffers(audioContext, studioBuffer, clipboard, editTrim.start)); }} title="오버레이" className="p-2 hover:bg-slate-200 rounded text-indigo-500"><Layers size={16}/></button>
                        <button onClick={() => { if(!studioBuffer) return; pushUndo(); updateStudioBuffer(AudioUtils.reverseBuffer(audioContext, studioBuffer)); }} title="좌우 반전" className="p-2 hover:bg-slate-200 rounded text-purple-500"><FlipHorizontal size={16}/></button>
                        <button onClick={()=>setFadeModalType('in')} title="페이드 인 설정" className="p-2 hover:bg-slate-200 rounded text-emerald-500"><SignalLow size={16}/></button>
                        <button onClick={()=>setFadeModalType('out')} title="페이드 아웃 설정" className="p-2 hover:bg-slate-200 rounded text-rose-500"><SignalHigh size={16}/></button>
                        <button onClick={()=>setShowStretchModal(true)} title="시간 늘리기" className="p-2 hover:bg-slate-200 rounded text-[#209ad6]"><MoveHorizontal size={16}/></button>
                        <button onClick={()=>setShowAutomation(!showAutomation)} className={`p-2 rounded flex gap-1 items-center transition-all ${showAutomation?'bg-yellow-100 text-yellow-700':'hover:bg-slate-200 text-slate-600'}`}><Zap size={16}/><span className="text-xs font-bold font-sans">오토메이션</span></button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => { if(!studioBuffer) return; const sel = AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end); if(sel) onAddToRack(sel, (activeFile?.name || "Extract") + "_cut"); }} title="선택 영역 새 파일로 저장" className="bg-white text-slate-700 border border-slate-300 px-3 py-1.5 rounded text-sm font-bold flex items-center gap-1 hover:bg-slate-100 shadow-sm"><FilePlus size={18}/></button>
                        <button onClick={async () => { if(!studioBuffer || !audioContext) return; const res = await renderStudioAudio(studioBuffer); if(res) onAddToRack(res, (activeFile?.name || "Studio") + "_결과"); }} title="결과물 저장" className="bg-[#a3cef0] text-[#1f1e1d] px-3 py-1.5 rounded text-sm font-bold flex items-center gap-1 hover:bg-[#209ad6] hover:text-white shadow-sm"><LogIn size={18}/> 보관함에 저장</button>
                    </div>
                </div>
                <div className="h-[400px] bg-white rounded-xl border border-slate-300 relative overflow-hidden shadow-inner group flex-shrink-0">
                    {studioBuffer ? (
                        <>
                            <canvas ref={canvasRef} width={1000} height={400} className="w-full h-full object-fill cursor-crosshair" 
                                onMouseDown={handleCanvasMouseDown}
                                onMouseMove={handleCanvasMouseMove}
                                onMouseUp={()=>{ setDragTarget(null); setSelectionAnchor(null); }}
                            />
                        </>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 font-bold uppercase cursor-pointer hover:bg-slate-50 transition-colors"
                             onClick={() => fileInputRef.current.click()}>
                            <Upload size={40}/> 
                            <span>파일을 드래그하거나 여기를 클릭하세요</span>
                            <span className="text-[10px] text-slate-300 mt-2">또는 보관함에 파일을 추가 후 드래그하세요</span>
                            <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={(e)=>{
                                if(e.target.files.length>0) {
                                    const file = e.target.files[0];
                                    file.arrayBuffer().then(b => audioContext.decodeAudioData(b)).then(buf => {
                                        onAddToRack(buf, file.name);
                                    });
                                }
                            }}/>
                        </div>
                    )}
                </div>
            </div>
            {/* Control Panels */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 min-h-min pb-4">
                 {/* Reusing existing panels but placed here to fit layout */}
                 <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3">
                    <h4 className="text-sm font-black text-[#209ad6] uppercase tracking-widest flex items-center gap-2 font-sans"><Sliders size={18}/> 믹서</h4>
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-slate-500 uppercase"><span>마스터 볼륨</span><span>{Math.round(masterGain*100)}%</span></div>
                        <input type="range" min="0" max="2" step="0.1" value={masterGain} onChange={e=>setMasterGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-300 rounded appearance-none accent-emerald-500"/>
                        <div className="flex justify-between text-xs font-bold text-slate-500 uppercase mt-3"><span>피치 (Cents)</span><span>{pitchCents}</span></div>
                        <input type="range" min="-1200" max="1200" step="10" value={pitchCents} onChange={e=>setPitchCents(Number(e.target.value))} className="w-full h-1.5 bg-slate-300 appearance-none accent-[#209ad6]"/>
                        <div className="flex justify-between text-xs font-bold text-slate-500 uppercase mt-3"><span>젠더 시프트</span><span>{genderShift.toFixed(2)}x</span></div>
                        <input type="range" min="0.5" max="2.0" step="0.05" value={genderShift} onChange={e=>setGenderShift(Number(e.target.value))} className="w-full h-1.5 bg-slate-300 appearance-none accent-pink-500"/>
                    </div>
                </div>
                <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3">
                    <h4 className="text-sm font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2 font-sans"><Activity size={18}/> 포먼트</h4>
                    {['f1', 'f2', 'f3'].map(f => (<div key={f}><div className="flex justify-between text-xs font-bold text-slate-500 mb-1 uppercase"><span>{f} (Hz)</span><span>{formant[f]}</span></div><input type="range" min="200" max={5000} value={formant[f]} onChange={e=>setFormant({...formant, [f]: Number(e.target.value)})} className="w-full h-1.5 bg-slate-300 appearance-none accent-emerald-500"/></div>))}
                    <div className="flex justify-between text-xs font-bold text-slate-500 uppercase mt-2"><span>공명 (Q)</span><span>{formant.resonance.toFixed(1)}</span></div>
                    <input type="range" min="1" max="20" step="0.1" value={formant.resonance} onChange={e=>setFormant({...formant, resonance: Number(e.target.value)})} className="w-full h-1.5 bg-slate-300 appearance-none accent-pink-400"/>
                </div>
                <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3">
                    <h4 className="text-sm font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2 font-sans"><SlidersHorizontal size={18}/> 밴드 EQ</h4>
                    {['low', 'mid', 'high'].map(band => (<div key={band} className="mt-1"><div className="flex justify-between text-xs font-bold text-slate-500 mb-1 uppercase"><span>{band}</span><span>{eq[band]}dB</span></div><input type="range" min="-24" max="24" value={eq[band]} onChange={e=>setEq({...eq, [band]: Number(e.target.value)})} className="w-full h-1.5 bg-slate-300 appearance-none accent-indigo-500"/></div>))}
                </div>
                <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3 justify-end">
                    <div className="flex gap-2">
                        <button onClick={handleStop} title="정지" className="p-3 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-600 transition-all"><Square size={20} fill="currentColor"/></button>
                        <button onClick={handlePlayPause} title={isPlaying ? '일시정지' : '재생'} className="flex-1 py-3 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all">{isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>} {isPlaying ? '중지' : '미리보기'}</button>
                    </div>
                </div>
            </div>
            {showStretchModal && <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50 animate-in zoom-in-95 font-sans"><div className="bg-[#e8e8e6] p-6 rounded-xl border border-slate-300 w-80 shadow-2xl font-sans"><h3 className="font-bold text-[#209ad6] mb-4 uppercase tracking-tighter text-sm font-sans font-sans">시간 늘리기 ({stretchRatio}%)</h3><input type="range" min="50" max="200" value={stretchRatio} onChange={e=>setStretchRatio(Number(e.target.value))} className="w-full h-1 bg-slate-300 rounded mb-6 appearance-none accent-[#209ad6]"/><button onClick={() => {
                if(!studioBuffer || !audioContext) return;
                pushUndo();
                const sel = AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end);
                const ratio = stretchRatio/100;
                const off = new OfflineAudioContext(sel.numberOfChannels, Math.floor(sel.length*ratio), sel.sampleRate);
                const s = off.createBufferSource(); s.buffer=sel; s.playbackRate.value=1/ratio; s.connect(off.destination); s.start();
                off.startRendering().then(str => {
                    const pre = AudioUtils.createBufferFromSlice(audioContext, studioBuffer, 0, editTrim.start);
                    const post = AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.end, 100);
                    updateStudioBuffer(AudioUtils.concatBuffers(audioContext, AudioUtils.concatBuffers(audioContext, pre, str), post));
                    setShowStretchModal(false);
                });
            }} className="w-full py-3 bg-[#209ad6] text-white rounded-xl font-bold mb-2 font-sans transition-all">적용</button><button onClick={()=>setShowStretchModal(false)} className="w-full py-2 text-slate-500 font-bold text-xs uppercase font-sans font-sans">취소</button></div></div>}
        </div>
    );
};

// ... [ConsonantTab & AdvancedTractTab remains unchanged from previous good version] ...
// To be safe, I will include ConsonantTab and AdvancedTractTab as well in the final output block 
// to ensure no function is missing context.

const ConsonantTab = ({ audioContext, files, onAddToRack }) => {
    // ... [Same implementation as before] ...
    // ... Copying ConsonantTab logic ...
    const [vowelId, setVowelId] = useState("");
    const [consonantId, setConsonantId] = useState("");
    const [offsetMs, setOffsetMs] = useState(0);
    const [vowelGain, setVowelGain] = useState(1.0);
    const [consonantGain, setConsonantGain] = useState(1.0);
    const [consonantStretch, setConsonantStretch] = useState(1.0);
    const [isPlaying, setIsPlaying] = useState(false);
    
    const [vVolumePts, setVVolumePts] = useState([{t:0,v:1}, {t:1,v:1}]);
    const [cVolumePts, setCVolumePts] = useState([{t:0,v:1}, {t:1,v:1}]);
    const [editMode, setEditMode] = useState('placement'); 

    const sourceRef = useRef(null);
    const canvasRef = useRef(null);
    const [dragging, setDragging] = useState(null); 

    const mixConsonant = async () => {
        const v = files.find(f => f.id === vowelId)?.buffer;
        const c = files.find(f => f.id === consonantId)?.buffer;
        if (!v || !audioContext) return null;
        
        const cLen = c ? (c.length / c.sampleRate) * consonantStretch : 0;
        const offSec = offsetMs/1000;
        const totalDuration = Math.max(v.duration, offSec + cLen);
        const totalSamples = Math.ceil(totalDuration * v.sampleRate);
        const offline = new OfflineAudioContext(v.numberOfChannels, totalSamples, v.sampleRate);
        
        const sV = offline.createBufferSource(); sV.buffer = v;
        const gV = offline.createGain(); 
        gV.gain.setValueAtTime(vVolumePts[0].v * vowelGain, 0);
        vVolumePts.forEach(p => gV.gain.linearRampToValueAtTime(p.v * vowelGain, p.t * v.duration));
        sV.connect(gV); gV.connect(offline.destination); sV.start(0);
        
        if(c) {
            const sC = offline.createBufferSource(); sC.buffer = c;
            sC.playbackRate.value = 1 / consonantStretch;
            const gC = offline.createGain(); 
            const startTime = Math.max(0, offSec);
            const duration = c.duration * consonantStretch;
            gC.gain.setValueAtTime(cVolumePts[0].v * consonantGain, startTime);
            cVolumePts.forEach(p => gC.gain.linearRampToValueAtTime(p.v * consonantGain, startTime + p.t * duration));
            sC.connect(gC); gC.connect(offline.destination); 
            sC.start(startTime);
        }
        return await offline.startRendering();
    };

    useEffect(() => {
        if(!canvasRef.current || !audioContext) return;
        const ctx = canvasRef.current.getContext('2d');
        const w = canvasRef.current.width; const h = canvasRef.current.height;
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0,0,w,h);
        const drawWave = (buf, color, offsetY, widthScale = 1.0) => {
            if(!buf) return 0;
            const data = buf.getChannelData(0); const pixelWidth = (buf.duration * widthScale / 2.0) * w;
            const amp = h / 4; ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
            for(let i=0; i<pixelWidth; i++) {
                let min=1.0, max=-1.0; const startIdx = Math.floor((i/pixelWidth) * data.length); const endIdx = Math.floor(((i+1)/pixelWidth) * data.length);
                for(let j=startIdx; j<endIdx; j++) { const datum = data[j]; if(datum < min) min = datum; if(datum > max) max = datum; }
                if (isFinite(min) && isFinite(max)) { ctx.moveTo(i, offsetY + min * amp); ctx.lineTo(i, offsetY + max * amp); }
            }
            ctx.stroke(); return pixelWidth;
        };
        const drawEnvelope = (points, color, widthPx, offsetX = 0) => {
            ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
            points.forEach((p, i) => { const x = offsetX + p.t * widthPx; const y = h - (p.v * h); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
            points.forEach(p => { const x = offsetX + p.t * widthPx; const y = h - (p.v * h); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill(); });
        };
        const vBuf = files.find(f => f.id === vowelId)?.buffer; const cBuf = files.find(f => f.id === consonantId)?.buffer;
        let vWidth = 0; if(vBuf) { vWidth = drawWave(vBuf, '#3b82f6', h/2); if (editMode === 'vVol') drawEnvelope(vVolumePts, '#1d4ed8', vWidth, 0); }
        if(cBuf) {
            const pixelOffset = offsetMs / (2000 / w); ctx.save(); ctx.translate(pixelOffset, 0);
            const drawnWidth = drawWave(cBuf, '#f97316', h/2, consonantStretch);
            if (editMode === 'placement') { ctx.fillStyle = '#3b82f6'; ctx.fillRect(drawnWidth - 6, h/2 - 25, 12, 50); } ctx.restore();
            if (editMode === 'cVol') drawEnvelope(cVolumePts, '#ea580c', drawnWidth, pixelOffset);
        }
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke();
    }, [vowelId, consonantId, offsetMs, consonantStretch, files, audioContext, vVolumePts, cVolumePts, editMode]);

    const handleCanvasMouseDown = (e) => {
        const rect = canvasRef.current.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top; const w = canvasRef.current.width; const h = canvasRef.current.height;
        if (editMode === 'placement') {
            const pixelOffset = offsetMs / (2000 / w); const cBuf = files.find(f => f.id === consonantId)?.buffer;
            if (cBuf) { const pixelWidth = (cBuf.duration * consonantStretch / 2.0) * w; if (Math.abs(x * (w/rect.width) - (pixelOffset + pixelWidth)) < 20) { setDragging('stretch'); return; } }
            setDragging('offset');
        } else if (editMode === 'vVol') {
            const vBuf = files.find(f => f.id === vowelId)?.buffer; if (!vBuf) return;
            const width = (vBuf.duration / 2.0) * w; const hitIdx = vVolumePts.findIndex(p => Math.hypot(x*(w/rect.width) - p.t*width, y*(h/rect.height) - (h-p.v*h)) < 10);
            if (hitIdx !== -1) setDragging(`vPoint:${hitIdx}`);
            else { const t = Math.max(0, Math.min(1, (x * (w/rect.width)) / width)); const v = Math.max(0, Math.min(1, 1 - (y * (h/rect.height)) / h)); const newPts = [...vVolumePts, {t,v}].sort((a,b)=>a.t-b.t); setVVolumePts(newPts); setDragging(`vPoint:${newPts.findIndex(p=>p.t===t)}`); }
        } else if (editMode === 'cVol') {
             const cBuf = files.find(f => f.id === consonantId)?.buffer; if (!cBuf) return;
             const pixelOffset = offsetMs / (2000 / w); const width = (cBuf.duration * consonantStretch / 2.0) * w;
             const hitIdx = cVolumePts.findIndex(p => Math.hypot(x*(w/rect.width) - (pixelOffset + p.t*width), y*(h/rect.height) - (h-p.v*h)) < 10);
             if (hitIdx !== -1) setDragging(`cPoint:${hitIdx}`);
             else { const t = Math.max(0, Math.min(1, (x*(w/rect.width) - pixelOffset) / width)); const v = Math.max(0, Math.min(1, 1 - (y*(h/rect.height)) / h)); const newPts = [...cVolumePts, {t,v}].sort((a,b)=>a.t-b.t); setCVolumePts(newPts); setDragging(`cPoint:${newPts.findIndex(p=>p.t===t)}`); }
        }
    };

    useEffect(() => {
        const move = (e) => {
            if(!dragging) return;
            const rect = canvasRef.current.getBoundingClientRect(); const w = canvasRef.current.width; const h = canvasRef.current.height;
            if (dragging === 'offset') setOffsetMs(prev => Math.max(-500, Math.min(1500, prev + e.movementX * 4)));
            else if (dragging === 'stretch') { const pixelOffset = offsetMs / (2000 / w); const newWidthPx = (e.clientX - rect.left) * (w / rect.width) - pixelOffset; const cBuf = files.find(f => f.id === consonantId)?.buffer; if (cBuf && newWidthPx > 10) setConsonantStretch(newWidthPx / ((cBuf.duration / 2.0) * w)); }
            else if (dragging.startsWith('vPoint:')) { const idx = parseInt(dragging.split(':')[1]); const vBuf = files.find(f => f.id === vowelId)?.buffer; if (vBuf) { const t = Math.max(0, Math.min(1, (e.clientX - rect.left) * (w/rect.width) / ((vBuf.duration/2.0)*w))); const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) * (h/rect.height) / h)); setVVolumePts(prev => { const next = [...prev]; next[idx] = {t,v}; return next.sort((a,b)=>a.t-b.t); }); } }
            else if (dragging.startsWith('cPoint:')) { const idx = parseInt(dragging.split(':')[1]); const cBuf = files.find(f => f.id === consonantId)?.buffer; if (cBuf) { const width = (cBuf.duration * consonantStretch / 2.0) * w; const t = Math.max(0, Math.min(1, ((e.clientX - rect.left) * (w/rect.width) - (offsetMs/(2000/w))) / width)); const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) * (h/rect.height) / h)); setCVolumePts(prev => { const next = [...prev]; next[idx] = {t,v}; return next.sort((a,b)=>a.t-b.t); }); } }
        };
        const up = () => setDragging(null);
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [dragging, offsetMs, consonantId, vowelId, consonantStretch, files]);

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in font-sans overflow-hidden">
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                    <div className="p-2 bg-indigo-500 rounded-xl text-white"><Combine size={24}/></div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">자음-모음 합성기</h2>
                </div>
                <div className="flex gap-2 mb-2">
                    <button onClick={()=>setEditMode('placement')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors ${editMode==='placement'?'bg-indigo-500 text-white shadow-md':'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>배치 / 길이 조절</button>
                    <button onClick={()=>setEditMode('vVol')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors ${editMode==='vVol'?'bg-blue-500 text-white shadow-md':'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>모음 볼륨 (Vowel)</button>
                    <button onClick={()=>setEditMode('cVol')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors ${editMode==='cVol'?'bg-orange-500 text-white shadow-md':'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>자음 볼륨 (Consonant)</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4 bg-slate-50/50 p-6 rounded-2xl border border-slate-200">
                        <div className="flex justify-between items-center"><label className="text-xs font-black text-indigo-500 uppercase block">Vowel Volume (모음 볼륨)</label><span className="text-xs font-bold text-slate-500">{Math.round(vowelGain*100)}%</span></div>
                        <select value={vowelId} onChange={e=>setVowelId(e.target.value)} className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none"><option value="">모음 트랙 선택...</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        <input type="range" min="0" max="2" step="0.1" value={vowelGain} onChange={e=>setVowelGain(Number(e.target.value))} className="w-full h-2 accent-indigo-500"/>
                    </div>
                    <div className="space-y-4 bg-slate-50/50 p-6 rounded-2xl border border-slate-200">
                        <div className="flex justify-between items-center"><label className="text-xs font-black text-pink-500 uppercase block">Consonant Volume (자음 볼륨)</label><span className="text-xs font-bold text-slate-500">{Math.round(consonantGain*100)}%</span></div>
                        <select value={consonantId} onChange={e=>setConsonantId(e.target.value)} className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none"><option value="">자음 트랙 선택...</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        <input type="range" min="0" max="2" step="0.1" value={consonantGain} onChange={e=>setConsonantGain(Number(e.target.value))} className="w-full h-2 accent-pink-500"/>
                    </div>
                </div>
                <div className="bg-white border border-slate-300 p-6 rounded-2xl shadow-inner space-y-4">
                    <div className="flex justify-between items-center">
                        <div className="flex gap-4">
                            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><MoveHorizontal size={18} className="text-slate-400"/> 오프셋: <span className="text-indigo-600 font-bold">{Math.round(offsetMs)}ms</span></h3>
                            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><ArrowLeftRight size={18} className="text-slate-400"/> 길이: <span className="text-pink-600 font-bold">{Math.round(consonantStretch*100)}%</span></h3>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={async () => { if(!audioContext) return; if(sourceRef.current) sourceRef.current.stop(); const b = await mixConsonant(); if(b) { const s = audioContext.createBufferSource(); s.buffer = b; s.connect(audioContext.destination); s.start(); sourceRef.current = s; setIsPlaying(true); s.onended = () => setIsPlaying(false); } }} title="미리보기" className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all">{isPlaying ? '재생 중' : '미리보기'}</button>
                            <button onClick={async () => { if(!audioContext) return; const b = await mixConsonant(); if(b) onAddToRack(b, "Consonant_Mix"); }} title="보관함에 저장" className="px-8 py-3 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl font-bold transition-all shadow-sm">보관함에 저장</button>
                        </div>
                    </div>
                    <div className="relative h-48 w-full bg-slate-100 rounded-xl overflow-hidden border border-slate-200 cursor-ew-resize group shadow-inner">
                        <canvas ref={canvasRef} width={1000} height={192} className="w-full h-full block" onMouseDown={handleCanvasMouseDown}/>
                        <div className="absolute top-2 right-2 text-xs font-bold text-slate-400 bg-white/80 px-2 py-1 rounded pointer-events-none border border-slate-200 uppercase tracking-tighter">
                            {editMode === 'placement' ? 'Drag Body to Move / Edge Handle to Stretch' : 'Click to Add Volume Point, Drag to Adjust'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AdvancedTractTab = ({ audioContext, files, onAddToRack }) => {
    // ... [AdvancedTractTab implementation same as previous correct version] ...
    const [isAdvPlaying, setIsAdvPlaying] = useState(false);
    const [playHeadPos, setPlayHeadPos] = useState(0); 
    const [advDuration, setAdvDuration] = useState(2.0);
    const [intensity, setIntensity] = useState(1.0);
    const [tractSourceFileId, setTractSourceFileId] = useState("");
    const [noiseSourceFileId, setNoiseSourceFileId] = useState("");
    const [manualPose, setManualPose] = useState(false);
    const [liveTract, setLiveTract] = useState({ x: 0.5, y: 0.4, lips: 0.7, lipLen: 0.5, throat: 0.5, nasal: 0.2, volume: 1.0 }); 
    const [simUndoStack, setSimUndoStack] = useState([]);
    const [selectedTrackId, setSelectedTrackId] = useState('tongueX'); 
    const [draggingKeyframe, setDraggingKeyframe] = useState(null); 
    const [dragPart, setDragPart] = useState(null); 

    const canvasRef = useRef(null);
    const simPlaySourceRef = useRef(null);
    const animRef = useRef(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);

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
            let newPoints = [...tr.points];
            if (idx !== -1) newPoints[idx] = { ...newPoints[idx], v: val };
            else { newPoints.push({ t: playHeadPos, v: val }); newPoints.sort((a,b) => a.t - b.t); }
            return { ...tr, points: newPoints };
        }));
        setManualPose(false); 
    };

    const applyPreset = (type) => {
        setManualPose(true); let x=0.5, y=0.5, l=0.5;
        switch(type) {
            case 'A': x=0.2; y=0.1; l=1.0; break;
            case 'E': x=0.8; y=0.6; l=0.8; break;
            case 'I': x=0.9; y=1.0; l=0.4; break;
            case 'O': x=0.2; y=0.5; l=0.3; break;
            case 'U': x=0.3; y=0.9; l=0.1; break;
        }
        setLiveTract(prev => ({...prev, x, y, lips: l}));
    };

    const getInterpolatedValue = useCallback((trackId, t) => {
        const track = advTracks.find(tr => tr.id === trackId);
        if (!track || track.points.length === 0) return 0;
        const idx = track.points.findIndex(p => p.t >= t);
        if (idx === -1) return track.points[track.points.length - 1].v;
        if (idx === 0) return track.points[0].v;
        const p1 = track.points[idx - 1], p2 = track.points[idx];
        return p1.v + (p2.v - p1.v) * ((t - p1.t) / (p2.t - p1.t));
    }, [advTracks]);

    useEffect(() => {
        if (manualPose || dragPart) return; 
        const x = getInterpolatedValue('tongueX', playHeadPos);
        const y = getInterpolatedValue('tongueY', playHeadPos);
        const lips = getInterpolatedValue('lips', playHeadPos);
        const lipLen = getInterpolatedValue('lipLen', playHeadPos);
        const throat = getInterpolatedValue('throat', playHeadPos);
        const nasal = getInterpolatedValue('nasal', playHeadPos);
        const volume = getInterpolatedValue('volume', playHeadPos);
        setLiveTract({ x, y, lips, lipLen, throat, nasal, volume });
    }, [playHeadPos, isAdvPlaying, draggingKeyframe, advTracks, getInterpolatedValue, dragPart, manualPose]);

    const renderAdvancedAudio = useCallback(async () => {
        if (!audioContext) return null;
        const sr = audioContext.sampleRate; const totalLen = Math.max(1, Math.floor(sr * advDuration));
        const offline = new OfflineAudioContext(1, totalLen, sr);
        let sNode;
        const customInput = files.find(f => f.id === tractSourceFileId)?.buffer;
        if (customInput) { sNode = offline.createBufferSource(); sNode.buffer = customInput; sNode.loop = true; } 
        else { sNode = offline.createOscillator(); sNode.type = 'sawtooth'; const tP = advTracks.find(t=>t.id==='pitch').points; sNode.frequency.setValueAtTime(tP[0].v, 0); tP.forEach(p => sNode.frequency.linearRampToValueAtTime(p.v, p.t * advDuration)); }
        let nNode;
        const customNoise = files.find(f => f.id === noiseSourceFileId)?.buffer;
        if (customNoise) { nNode = offline.createBufferSource(); nNode.buffer = customNoise; nNode.loop = true; } 
        else { nNode = offline.createBufferSource(); const nb = offline.createBuffer(1, totalLen, sr); const nd = nb.getChannelData(0); for(let i=0; i<totalLen; i++) nd[i] = Math.random() * 2 - 1; nNode.buffer = nb; }
        const nGain = offline.createGain(); const bP = advTracks.find(t=>t.id==='breath').points; nGain.gain.setValueAtTime(bP[0].v, 0); bP.forEach(p => nGain.gain.linearRampToValueAtTime(p.v, p.t * advDuration));
        
        const masterGainNode = offline.createGain(); const vP = advTracks.find(t=>t.id==='volume').points;
        masterGainNode.gain.setValueAtTime(vP[0].v, 0); vP.forEach(p => masterGainNode.gain.linearRampToValueAtTime(p.v, p.t * advDuration));

        const f1=offline.createBiquadFilter(), f2=offline.createBiquadFilter(), f3=offline.createBiquadFilter(), nasF=offline.createBiquadFilter();
        [f1,f2,f3].forEach(f=>{ f.type='peaking'; f.Q.value=4 * intensity; f.gain.value=12 * intensity; }); nasF.type='lowpass';
        const getPts = (id) => advTracks.find(t=>t.id===id).points;
        for(let i=0; i<=60; i++) {
            const t = i/60; const time = t * advDuration;
            const getV = (pts) => { if(pts.length===0) return 0; const idx = pts.findIndex(p=>p.t>=t); if(idx<=0) return pts[0].v; const p1=pts[idx-1], p2=pts[idx]; return p1.v + (p2.v-p1.v)*((t-p1.t)/(p2.t-p1.t)); };
            const x=getV(getPts('tongueX')), y=getV(getPts('tongueY')), l=getV(getPts('lips')), th=getV(getPts('throat')), n=getV(getPts('nasal'));
            f1.frequency.linearRampToValueAtTime(Math.max(50, 200 + (1-y)*600 - th*50), time); f2.frequency.linearRampToValueAtTime(800 + x*1400, time); f3.frequency.linearRampToValueAtTime(2000 + l*1500, time); nasF.frequency.linearRampToValueAtTime(10000 - n*9000, time);
        }
        sNode.connect(f1); nGain.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); nasF.connect(masterGainNode); masterGainNode.connect(offline.destination);
        sNode.start(0); nNode.start(0); return await offline.startRendering();
    }, [audioContext, advDuration, advTracks, intensity, tractSourceFileId, noiseSourceFileId, files]);

    const handlePlayPauseSim = async () => {
        if (!audioContext) return; setManualPose(false); 
        if (isAdvPlaying) { if (simPlaySourceRef.current) { try { simPlaySourceRef.current.stop(); } catch (e) {} pauseOffsetRef.current = audioContext.currentTime - startTimeRef.current; if (animRef.current) cancelAnimationFrame(animRef.current); setIsAdvPlaying(false); } return; }
        const res = await renderAdvancedAudio(); if (!res) return;
        const s = audioContext.createBufferSource(); s.buffer = res; s.connect(audioContext.destination);
        const startOffset = pauseOffsetRef.current % res.duration; s.start(0, startOffset);
        startTimeRef.current = audioContext.currentTime - startOffset; simPlaySourceRef.current = s; setIsAdvPlaying(true);
        const animate = () => { const elapsed = audioContext.currentTime - startTimeRef.current; if (elapsed >= res.duration) { setIsAdvPlaying(false); setPlayHeadPos(0); pauseOffsetRef.current = 0; } else { setPlayHeadPos(elapsed / res.duration); animRef.current = requestAnimationFrame(animate); } };
        animRef.current = requestAnimationFrame(animate);
    };

    const handleCanvasMouseDown = (e) => {
        e.preventDefault(); setManualPose(false); 
        const rect = canvasRef.current.getBoundingClientRect(); const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
        const t = Math.max(0, Math.min(1, mx / rect.width));
        if (my < RULER_HEIGHT) { setPlayHeadPos(t); pauseOffsetRef.current = t * advDuration; setDraggingKeyframe({ isPlayhead: true }); return; }
        const graphH = rect.height - RULER_HEIGHT; const track = advTracks.find(tr => tr.id === selectedTrackId);
        const hitIndex = track.points.findIndex(p => Math.hypot(p.t * rect.width - mx, RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * graphH - my) < 10);
        pushSimUndo();
        if (hitIndex !== -1) setDraggingKeyframe({ index: hitIndex, trackId: selectedTrackId });
        else {
            const val = track.min + (1 - (my - RULER_HEIGHT) / graphH) * (track.max - track.min);
            const newPoint = { t, v: Math.max(track.min, Math.min(track.max, val)) };
            const newPoints = [...track.points, newPoint].sort((a,b) => a.t - b.t);
            setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: newPoints } : tr));
            setDraggingKeyframe({ index: newPoints.indexOf(newPoint), trackId: selectedTrackId });
        }
    };

    const handleCanvasContextMenu = (e) => {
        e.preventDefault(); const rect = canvasRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
        const graphH = rect.height - RULER_HEIGHT; const track = advTracks.find(tr => tr.id === selectedTrackId);
        const hitIndex = track.points.findIndex(p => Math.hypot(p.t * rect.width - mx, RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * graphH - my) < 10);
        if (hitIndex !== -1) { pushSimUndo(); setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: tr.points.filter((_, i) => i !== hitIndex) } : tr)); }
    };

    useEffect(() => {
        const move = (e) => {
            if (!draggingKeyframe) return;
            const rect = canvasRef.current.getBoundingClientRect();
            if (draggingKeyframe.isPlayhead) { const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); setPlayHeadPos(t); pauseOffsetRef.current = t * advDuration; return; }
            const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const track = advTracks.find(tr => tr.id === draggingKeyframe.trackId);
            const v = Math.max(track.min, Math.min(track.max, track.min + (1 - (e.clientY - rect.top - RULER_HEIGHT) / (rect.height - RULER_HEIGHT)) * (track.max - track.min)));
            setAdvTracks(prev => prev.map(tr => tr.id === draggingKeyframe.trackId ? { ...tr, points: tr.points.map((p, i) => i === draggingKeyframe.index ? {t,v} : p).sort((a,b)=>a.t-b.t) } : tr));
        };
        const up = () => setDraggingKeyframe(null);
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [draggingKeyframe, advTracks, advDuration]);

    useEffect(() => {
        if(!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d'); const w = canvasRef.current.width; const h = canvasRef.current.height;
        const track = advTracks.find(t => t.id === selectedTrackId);
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#f8f8f6'; ctx.fillRect(0,RULER_HEIGHT,w,h-RULER_HEIGHT);
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.beginPath(); for(let i=0; i<=10; i++) { const x = i*(w/10); ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, h); } ctx.stroke();
        ctx.beginPath(); ctx.strokeStyle = track.color; ctx.lineWidth = 3; track.points.forEach((p, i) => { const x=p.t*w; const y=RULER_HEIGHT+(1-(p.v-track.min)/(track.max-track.min))*(h-RULER_HEIGHT); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
        track.points.forEach((p) => { const x=p.t*w; const y=RULER_HEIGHT+(1-(p.v-track.min)/(track.max-track.min))*(h-RULER_HEIGHT); ctx.fillStyle = track.color; ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth=2; ctx.stroke(); });
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(playHeadPos * w,0); ctx.lineTo(playHeadPos * w,h); ctx.stroke();
    }, [selectedTrackId, advTracks, playHeadPos]);

    return (
        <div className="flex-1 flex flex-col p-4 gap-4 animate-in fade-in overflow-hidden font-sans" onMouseUp={() => { setDragPart(null); }}>
            <div className="flex-[3] flex gap-4 min-h-0 overflow-hidden">
                <div className="flex-1 bg-white/60 rounded-2xl border border-slate-300 relative overflow-hidden shadow-sm flex flex-col">
                    <div className="flex-1 relative flex items-center justify-center p-4 bg-slate-100/50">
                        <svg viewBox="0 0 400 400" className="w-full h-full max-w-[380px] max-h-[380px] drop-shadow-2xl">
                            <path d="M 50 250 Q 50 100 200 100 Q 350 100 350 250 L 350 400 L 50 400 Z" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                            <path d="M 350 220 Q 380 220 390 240" fill="none" stroke="#cbd5e1" strokeWidth="3" />
                            <path d="M 120 400 L 120 600" stroke="#94a3b8" strokeWidth={Math.max(2, 40 - liveTract.throat * 30)} strokeLinecap="round" opacity="0.5" />
                            <path d={`M 150 400 L 150 280 Q 150 150 250 150 Q 320 150 350 ${225 - liveTract.lips * 40} L 350 ${225 + liveTract.lips * 40} Q 320 350 250 350 Z`} fill="#f8fafc" stroke="#64748b" strokeWidth="3" />
                            <path d={`M 180 400 Q ${180 + liveTract.x * 160} ${330 - liveTract.y * 120} ${280 + liveTract.x * 50} ${250 + liveTract.y * 50}`} stroke="#f472b6" strokeWidth="18" strokeLinecap="round" fill="none" />
                            <ellipse cx={350 + liveTract.lipLen * 20} cy="225" rx={6 + liveTract.lipLen * 30} ry={3 + liveTract.lips * 40} fill="#db2777" opacity="0.85" className="cursor-ew-resize hover:opacity-100" />
                        </svg>
                        <div className="absolute inset-0" 
                            onMouseMove={(e) => {
                                if (!dragPart) return; const rect = e.currentTarget.getBoundingClientRect();
                                const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
                                if (dragPart === 'lips') setLiveTract(p => ({...p, lipLen: x, lips: y}));
                                else if (dragPart === 'tongue') setLiveTract(p => ({...p, x, y}));
                            }} 
                            onMouseDown={(e) => {
                                if (dragPart) return; setManualPose(true); const rect = e.currentTarget.getBoundingClientRect();
                                const nx = (e.clientX - rect.left) / rect.width, ny = (e.clientY - rect.top) / rect.height;
                                if (nx > 0.8 && ny > 0.4 && ny < 0.7) { setDragPart('lips'); } 
                                else if (nx > 0.3 && nx < 0.8 && ny > 0.4 && ny < 1.0) { setDragPart('tongue'); setLiveTract(p => ({...p, x: nx, y: 1-ny})); }
                            }} 
                        />
                    </div>
                    <div className="p-4 bg-slate-50/80 border-t border-slate-200 flex justify-between items-center backdrop-blur-md">
                        <div className="flex gap-2">
                            <button onClick={handleSimUndo} disabled={simUndoStack.length === 0} title="실행 취소" className="p-2 bg-white rounded-xl border border-slate-300 disabled:opacity-30 hover:bg-slate-50 transition-all"><Undo2 size={18}/></button>
                            <button onClick={() => { pushSimUndo(); setAdvTracks(prev => prev.map(t => ({...t, points: [{t:0,v:t.id==='pitch'?220:t.id==='volume'?1:0.5},{t:1,v:t.id==='pitch'?220:t.id==='volume'?1:0.5}]}))); setManualPose(false); }} title="초기화" className="p-2 bg-white rounded-xl border border-slate-300 text-red-500 hover:bg-red-50 transition-all"><RotateCcw size={18}/></button>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={registerKeyframe} className="bg-[#209ad6] hover:bg-[#1a85b9] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg active:scale-95 transition-all flex items-center gap-2"><CircleDot size={16}/> 키프레임 등록</button>
                             <button onClick={handlePlayPauseSim} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center gap-2">{isAdvPlaying ? <Pause size={16}/> : <Play size={16}/>} {isAdvPlaying ? '일시정지' : '재생'}</button>
                             <button onClick={async()=>{ const res = await renderAdvancedAudio(); if(res) onAddToRack(res, "시뮬레이션_결과"); }} className="bg-[#a3cef0] hover:bg-[#209ad6] hover:text-white text-[#1f1e1d] px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg active:scale-95 transition-all flex items-center gap-1"><LogIn size={16}/> 보관함에 저장</button>
                        </div>
                    </div>
                </div>
                <div className="w-72 bg-white/40 rounded-2xl border border-slate-300 p-3 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                    <h3 className="font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 text-xs"><Sliders size={18} className="text-[#209ad6]"/> 파라미터</h3>
                    <div className="space-y-3">
                        <div className="flex gap-2 mb-2">
                             {['A','E','I','O','U'].map(v=><button key={v} onClick={()=>applyPreset(v)} title={`모음 ${v}`} className="flex-1 h-8 rounded-lg bg-white border border-slate-300 font-bold text-xs hover:bg-[#209ad6] hover:text-white transition-all">{v}</button>)}
                        </div>
                        <div className="flex gap-2 mb-4">
                             <button onClick={()=>{setAdvTracks(prev=>prev.map(t=>t.id==='pitch'?{...t,points:[{t:0,v:110},{t:1,v:110}]}:t))}} className="flex-1 py-1.5 bg-white border border-slate-300 rounded-lg text-blue-500 text-xs font-bold hover:bg-blue-50 shadow-sm">Male</button>
                             <button onClick={()=>{setAdvTracks(prev=>prev.map(t=>t.id==='pitch'?{...t,points:[{t:0,v:330},{t:1,v:330}]}:t))}} className="flex-1 py-1.5 bg-white border border-slate-300 rounded-lg text-pink-500 text-xs font-bold hover:bg-pink-50 shadow-sm">Female</button>
                        </div>
                        <div className="space-y-1 mb-2">
                             <div className="flex justify-between text-xs font-bold text-slate-700 uppercase"><span>음량 (Volume)</span><span>{Math.round(liveTract.volume * 100)}%</span></div>
                             <input type="range" min="0" max="2" step="0.01" value={liveTract.volume} onChange={e=>{ setManualPose(true); setLiveTract(prev=>({...prev, volume: Number(e.target.value)})); }} className="w-full h-1.5 bg-slate-300 appearance-none rounded-full accent-emerald-500"/>
                        </div>
                        {[{id:'lips', label:'입술 열기'}, {id:'lipLen', label:'입술 길이'}, {id:'throat', label:'목 조임'}, {id:'nasal', label:'비성'}].map(p => (
                            <div key={p.id} className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-slate-500 uppercase"><span>{p.label}</span><span>{Math.round(liveTract[p.id]*100)}%</span></div>
                                <input type="range" min="0" max="1" step="0.01" value={liveTract[p.id]} 
                                    onChange={e=>{ setManualPose(true); setLiveTract(prev=>({...prev, [p.id]:Number(e.target.value)})); }} 
                                    className="w-full h-1.5 bg-slate-300 appearance-none rounded-full accent-[#209ad6]"/>
                            </div>
                        ))}
                        <div className="pt-2 border-t border-slate-200">
                             <div className="flex justify-between text-xs font-bold text-emerald-600 uppercase"><span>시뮬레이션 강도 (과장)</span><span>{Math.round(intensity*100)}%</span></div>
                             <input type="range" min="0" max="3" step="0.1" value={intensity} onChange={e=>setIntensity(Number(e.target.value))} className="w-full h-1.5 bg-slate-300 appearance-none rounded-full accent-emerald-500"/>
                        </div>
                        <div className="space-y-1 mt-2">
                             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">입력 소스 / 노이즈 소스</span>
                             <select value={tractSourceFileId} onChange={e=>setTractSourceFileId(e.target.value)} className="w-full text-xs p-1.5 rounded border border-slate-200"><option value="">기본 신디사이저</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                             <select value={noiseSourceFileId} onChange={e=>setNoiseSourceFileId(e.target.value)} className="w-full text-xs p-1.5 rounded border border-slate-200 mt-1"><option value="">기본 화이트 노이즈</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase mt-2"><span>반복 시간 (s)</span><input type="number" step="0.1" value={advDuration} onChange={e=>setAdvDuration(Number(e.target.value))} className="w-12 border rounded px-1"/></div>
                    </div>
                </div>
            </div>
            <div className="h-48 bg-white/40 rounded-3xl border border-slate-300 p-3 flex flex-col gap-2 shadow-inner">
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                    {advTracks.map(t=><button key={t.id} onClick={()=>setSelectedTrackId(t.id)} className={`px-4 py-1.5 text-xs font-black rounded-full border transition-all whitespace-nowrap ${selectedTrackId===t.id?'bg-[#209ad6] text-white border-[#209ad6] shadow-md':'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>{t.name}</button>)}
                </div>
                <div className="flex-1 bg-white rounded-2xl border border-slate-200 relative overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
                    <canvas ref={canvasRef} width={1000} height={150} className="w-full h-full cursor-crosshair" onMouseDown={handleCanvasMouseDown} onContextMenu={handleCanvasContextMenu}/>
                </div>
            </div>
        </div>
    );
};

const App = () => {
    const [audioContext, setAudioContext] = useState(null);
    const [files, setFiles] = useState([]);
    const [activeFileId, setActiveFileId] = useState(null);
    const [activeTab, setActiveTab] = useState('editor');
    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') { const Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx) setAudioContext(new Ctx()); }
    }, []);

    const addToRack = (buffer, name) => { const newFile = { id: Math.random().toString(36).substr(2, 9), name: name || "새 오디오", buffer }; setFiles(prev => [...prev, newFile]); setActiveFileId(newFile.id); };
    const renameFile = (id, newName) => { setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f)); };
    const removeFile = (id) => { setFiles(prev => prev.filter(f => f.id !== id)); if(activeFileId === id) setActiveFileId(null); };
    const updateFile = (newBuffer) => { setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, buffer: newBuffer } : f)); };

    const handleFileUpload = async (e) => {
        if(!audioContext) return; const selFiles = Array.from(e.target.files);
        for(const file of selFiles) { const buffer = await audioContext.decodeAudioData(await file.arrayBuffer()); addToRack(buffer, file.name); }
    };

    const exportProject = async () => {
        const data = { files: await Promise.all(files.map(async f => ({ id: f.id, name: f.name, data: AudioUtils.serializeBuffer(f.buffer) }))), exportDate: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `otonashi_project_${new Date().getTime()}.json`; a.click();
    };

    const importProject = async (e) => {
        const file = e.target.files[0]; if(!file || !audioContext) return;
        const reader = new FileReader(); reader.onload = async (re) => {
            const data = JSON.parse(re.target.result);
            const loadedFiles = await Promise.all(data.files.map(async f => ({ id: f.id, name: f.name, buffer: await AudioUtils.deserializeBuffer(audioContext, f.data) })));
            setFiles(loadedFiles);
        };
        reader.readAsText(file);
    };

    return (
        <div className="h-screen w-full bg-[#f8f8f6] text-[#1f1e1d] flex flex-col font-sans overflow-hidden">
            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }`}</style>
            <header className="h-14 border-b border-slate-300 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
                <div className="flex items-center gap-3 font-sans">
                    <div className="bg-[#209ad6] p-1.5 rounded-lg text-white shadow-lg shadow-blue-200 font-sans font-sans font-sans"><Activity size={24}/></div>
                    <div className="flex flex-col font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
                        <h1 className="font-black text-2xl tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-r from-[#b2d4ed] via-[#3c78e8] to-[#e3daf5] font-sans font-sans font-sans font-sans font-sans font-sans">OTONASHI</h1>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">AUgmented vocal-TracT and Nasal SImulator</span>
                    </div>
                </div>
                <nav className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
                    <button onClick={()=>setActiveTab('editor')} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab==='editor'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>스튜디오</button>
                    <button onClick={()=>setActiveTab('consonant')} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab==='consonant'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>자음 합성</button>
                    <button onClick={()=>setActiveTab('sim')} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab==='sim'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>성도 시뮬레이터</button>
                </nav>
                <div className="flex items-center gap-3 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
                    <button onClick={exportProject} title="프로젝트 저장" className="p-2.5 bg-white border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] hover:bg-slate-50 shadow-sm"><DownloadCloud size={20}/></button>
                    <label className="p-2.5 bg-white border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] hover:bg-slate-50 shadow-sm cursor-pointer" title="프로젝트 불러오기"><UploadCloud size={20}/><input type="file" className="hidden" accept=".json" onChange={importProject}/></label>
                    <div className="w-px h-6 bg-slate-300 mx-1"></div>
                    <button onClick={() => setShowHelp(true)} className="text-slate-400 hover:text-slate-600 transition-colors"><Settings size={22}/></button>
                    <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center shadow-inner font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans"><User size={24} className="text-slate-400 font-sans font-sans font-sans font-sans font-sans font-sans"/></div>
                </div>
            </header>
            <main className="flex-1 flex overflow-hidden font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
                <FileRack files={files} activeFileId={activeFileId} setActiveFileId={setActiveFileId} handleFileUpload={handleFileUpload} removeFile={removeFile} renameFile={renameFile} />
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden relative shadow-inner font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
                    {activeTab === 'editor' && <StudioTab audioContext={audioContext} activeFile={files.find(f=>f.id===activeFileId)} files={files} onUpdateFile={updateFile} onAddToRack={addToRack} setActiveFileId={setActiveFileId} />}
                    {activeTab === 'consonant' && <ConsonantTab audioContext={audioContext} files={files} onAddToRack={addToRack} />}
                    {activeTab === 'sim' && <AdvancedTractTab audioContext={audioContext} files={files} onAddToRack={addToRack} />}
                </div>
            </main>
        </div>
    );
};

export default App;
