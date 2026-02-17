
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Undo2, Redo2, Scissors, FilePlus, Sparkles, Activity, Square, Play, Pause, Save, AudioLines, Power, Trash2, 
  ArrowLeftRight, Volume2, MoveHorizontal, Wand2, RefreshCw, Layers, ZoomIn, TrendingUp, TrendingDown
} from 'lucide-react';
import { AudioFile, KeyframePoint, FormantParams, EQBand } from '../types';
import { AudioUtils, RULER_HEIGHT } from '../utils/audioUtils';
import { Language, i18n } from '../utils/i18n';
import ParametricEQ from './ParametricEQ';
import FormantPad from './FormantPad';

interface StudioTabProps {
  lang: Language;
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

const StudioTab: React.FC<StudioTabProps> = ({ lang, audioContext, activeFile, files, onUpdateFile, onAddToRack, setActiveFileId, isActive }) => {
    const [editTrim, setEditTrim] = useState({ start: 0, end: 1 });
    const [isPlaying, setIsPlaying] = useState(false);
    const [playheadPos, setPlayheadPos] = useState(0); 
    const [showAutomation, setShowAutomation] = useState(true);
    const [volumeKeyframes, setVolumeKeyframes] = useState<KeyframePoint[]>([{t:0, v:1}, {t:1, v:1}]);
    const [zoomLevel, setZoomLevel] = useState(1); // 확대 레벨 (1~10)
    
    const [sideTab, setSideTab] = useState<'effects' | 'formant'>('effects');
    const [undoStack, setUndoStack] = useState<UndoState[]>([]);
    const [redoStack, setRedoStack] = useState<UndoState[]>([]);
    
    const [masterGain, setMasterGain] = useState(1.0);
    const [formant, setFormant] = useState<FormantParams>({ f1: 500, f2: 1500, f3: 2500, f4: 3500, resonance: 4.0 });
    
    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 60, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'lowshelf', freq: 100, gain: 0, q: 0.7, on: true },
        { id: 3, type: 'peaking', freq: 1000, gain: 0, q: 1.0, on: true },
        { id: 4, type: 'highshelf', freq: 5000, gain: 0, q: 0.7, on: true },
        { id: 5, type: 'lowpass', freq: 18000, gain: 0, q: 0.7, on: true }
    ]);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const animRef = useRef<number | null>(null);
    const startTimeRef = useRef(0);
    const [dragging, setDragging] = useState<{type: 'selection' | 'automation', index?: number} | null>(null);

    const t = i18n[lang].common;

    const pushUndo = useCallback((buf: AudioBuffer, label: string) => {
        setUndoStack(prev => [...prev.slice(-19), { buffer: buf, label }]);
        setRedoStack([]);
    }, []);

    const handleLocalUndo = () => {
        if (undoStack.length === 0 || !activeFile) return;
        const last = undoStack[undoStack.length - 1];
        setRedoStack(prev => [...prev, { buffer: activeFile.buffer, label: last.label }]);
        setUndoStack(prev => prev.slice(0, -1));
        onUpdateFile(last.buffer);
    };

    const handleLocalRedo = () => {
        if (redoStack.length === 0 || !activeFile) return;
        const last = redoStack[redoStack.length - 1];
        setUndoStack(prev => [...prev, { buffer: activeFile.buffer, label: last.label }]);
        setRedoStack(prev => prev.slice(0, -1));
        onUpdateFile(last.buffer);
    };

    const handleCrop = () => {
        if (!activeFile) return;
        const newBuf = AudioUtils.createBufferFromSlice(audioContext, activeFile.buffer, editTrim.start, editTrim.end);
        if (newBuf) {
            pushUndo(activeFile.buffer, "Crop");
            onUpdateFile(newBuf);
            setEditTrim({ start: 0, end: 1 });
        }
    };

    const handleDeleteRange = () => {
        if (!activeFile) return;
        const newBuf = AudioUtils.deleteRange(audioContext, activeFile.buffer, editTrim.start, editTrim.end);
        if (newBuf) {
            pushUndo(activeFile.buffer, "Delete Range");
            onUpdateFile(newBuf);
            setEditTrim({ start: 0, end: 1 });
        }
    };

    const handleNormalize = () => {
      if (!activeFile) return;
      const newBuf = AudioUtils.normalizeBuffer(audioContext, activeFile.buffer);
      pushUndo(activeFile.buffer, "Normalize");
      onUpdateFile(newBuf);
    };

    const handleReverse = () => {
      if (!activeFile) return;
      const newBuf = AudioUtils.reverseBuffer(audioContext, activeFile.buffer);
      pushUndo(activeFile.buffer, "Reverse");
      onUpdateFile(newBuf);
    };

    const handleFade = async (type: 'in' | 'out') => {
        if (!activeFile) return;
        const newBuf = await AudioUtils.applyFade(audioContext, activeFile.buffer, type, editTrim.start, editTrim.end);
        if (newBuf) {
            pushUndo(activeFile.buffer, `Fade ${type}`);
            onUpdateFile(newBuf);
        }
    };

    const renderProcessed = async () => {
        if (!activeFile) return null;
        const sr = activeFile.buffer.sampleRate;
        const offline = new OfflineAudioContext(activeFile.buffer.numberOfChannels, activeFile.buffer.length, sr);
        const source = offline.createBufferSource();
        source.buffer = activeFile.buffer;
        const gain = offline.createGain();
        gain.gain.setValueAtTime(volumeKeyframes[0].v * masterGain, 0);
        volumeKeyframes.forEach(p => gain.gain.linearRampToValueAtTime(p.v * masterGain, p.t * activeFile.buffer.duration));
        source.connect(gain);
        let lastNode: AudioNode = gain;
        eqBands.forEach(b => { if (b.on) { const f = offline.createBiquadFilter(); f.type = b.type; f.frequency.value = b.freq; f.Q.value = b.q; f.gain.value = b.gain; lastNode.connect(f); lastNode = f; } });
        lastNode.connect(offline.destination);
        source.start(0);
        return await offline.startRendering();
    };

    const togglePlay = async () => {
        if (isPlaying) {
            if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} }
            setIsPlaying(false);
            if (animRef.current) cancelAnimationFrame(animRef.current);
            setPlayheadPos(0);
        } else {
            const buf = await renderProcessed();
            if (!buf) return;
            const source = audioContext.createBufferSource();
            source.buffer = buf;
            source.connect(audioContext.destination);
            source.start(0);
            sourceRef.current = source;
            setIsPlaying(true);
            startTimeRef.current = audioContext.currentTime;
            const animate = () => {
                const elapsed = audioContext.currentTime - startTimeRef.current;
                const progress = elapsed / buf.duration;
                if (progress < 1) { 
                    setPlayheadPos(progress); 
                    // 재생 헤드 위치가 화면 밖으로 나가면 스크롤 이동
                    if (scrollContainerRef.current) {
                        const container = scrollContainerRef.current;
                        const scrollLeft = progress * container.scrollWidth - container.clientWidth / 2;
                        container.scrollLeft = scrollLeft;
                    }
                    animRef.current = requestAnimationFrame(animate); 
                } 
                else { setIsPlaying(false); setPlayheadPos(0); }
            };
            animRef.current = requestAnimationFrame(animate);
            source.onended = () => setIsPlaying(false);
        }
    };

    useEffect(() => {
        if (!canvasRef.current || !activeFile) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { width: w, height: h } = canvas;
        const buffer = activeFile.buffer;
        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / w);

        ctx.clearRect(0,0,w,h); 
        ctx.fillStyle = '#0f172a'; 
        ctx.fillRect(0,0,w,h);
        
        // Grid
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1; ctx.beginPath();
        for(let i=1; i<20 * zoomLevel; i++){ ctx.moveTo(i * w / (20 * zoomLevel), 0); ctx.lineTo(i * w / (20 * zoomLevel), h); }
        ctx.stroke();

        // Selection
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.fillRect(editTrim.start * w, 0, (editTrim.end - editTrim.start) * w, h);

        // Waveform
        ctx.beginPath(); ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1;
        for(let i=0; i<w; i++){
            let minVal=1, maxVal=-1;
            for(let j=0; j<step; j++){
                const d = data[i*step + j] || 0;
                if(d < minVal) minVal = d; if(d > maxVal) maxVal = d;
            }
            ctx.moveTo(i, h/2 + minVal * h/2.2); ctx.lineTo(i, h/2 + maxVal * h/2.2);
        }
        ctx.stroke();

        // Automation
        if(showAutomation) {
            ctx.beginPath(); ctx.strokeStyle = '#f43f5e'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
            volumeKeyframes.forEach((p, i) => {
                const x = p.t * w; const y = h - (p.v * h * 0.8) - (h * 0.1);
                if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
            });
            ctx.stroke(); ctx.setLineDash([]);
            volumeKeyframes.forEach(p => {
                ctx.fillStyle = '#f43f5e'; ctx.beginPath(); ctx.arc(p.t * w, h - (p.v * h * 0.8) - (h * 0.1), 4, 0, Math.PI*2); ctx.fill();
            });
        }

        ctx.fillStyle = '#60a5fa'; [editTrim.start, editTrim.end].forEach(pos => { ctx.fillRect(pos * w - 2, 0, 4, h); });

        if(isPlaying || playheadPos > 0) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(playheadPos * w, 0); ctx.lineTo(playheadPos * w, h); ctx.stroke();
        }
    }, [activeFile, editTrim, isPlaying, playheadPos, volumeKeyframes, showAutomation, zoomLevel]);

    const handleCanvasInteraction = (e: React.MouseEvent) => {
        if(!canvasRef.current || !activeFile) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1 - (e.clientY - rect.top) / rect.height;

        if (showAutomation) {
            const hitIdx = volumeKeyframes.findIndex(p => Math.abs(p.t - x) < (0.02 / zoomLevel) && Math.abs(p.v - y) < 0.1);
            if (hitIdx !== -1) { setDragging({ type: 'automation', index: hitIdx }); return; } 
            else if (e.shiftKey) { setVolumeKeyframes([...volumeKeyframes, { t: x, v: Math.max(0, Math.min(1, y)) }].sort((a,b) => a.t - b.t)); return; }
        }
        const nearStart = Math.abs(editTrim.start - x) < (0.01 / zoomLevel);
        const nearEnd = Math.abs(editTrim.end - x) < (0.01 / zoomLevel);
        if (nearStart) setDragging({ type: 'selection', index: 0 });
        else if (nearEnd) setDragging({ type: 'selection', index: 1 });
        else { setEditTrim({ start: x, end: x }); setDragging({ type: 'selection', index: 1 }); }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragging || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
        if (dragging.type === 'selection') {
            if (dragging.index === 0) setEditTrim(prev => ({ ...prev, start: Math.min(x, prev.end - 0.001) }));
            else setEditTrim(prev => ({ ...prev, end: Math.max(x, prev.start + 0.001) }));
        } else if (dragging.type === 'automation' && dragging.index !== undefined) {
            setVolumeKeyframes(prev => prev.map((p, i) => i === dragging.index ? { t: x, v: y } : p).sort((a,b)=>a.t-b.t));
        }
    };

    return (
        <div className="flex-1 flex flex-col p-6 gap-6 font-sans font-bold overflow-hidden" style={{ display: isActive ? 'flex' : 'none' }}>
            <div className="flex-1 flex gap-6 min-h-0">
                <div className="flex-1 bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-4 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500 rounded-xl text-white font-black"><Activity size={24}/></div>
                            <h2 className="text-xl text-slate-800 tracking-tight font-black truncate max-w-[300px]">{activeFile ? activeFile.name : 'Studio Editor'}</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={handleLocalUndo} disabled={undoStack.length === 0} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 disabled:opacity-30"><Undo2 size={18}/></button>
                            <button onClick={handleLocalRedo} disabled={redoStack.length === 0} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 disabled:opacity-30"><Redo2 size={18}/></button>
                        </div>
                    </div>
                    {!activeFile ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
                            <AudioLines size={64} className="opacity-20"/>
                            <p className="font-black">파일을 선택하여 편집을 시작하세요</p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col gap-6 min-h-0">
                            <div ref={scrollContainerRef} className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 relative overflow-x-auto overflow-y-hidden shadow-inner group custom-scrollbar">
                                <canvas 
                                    ref={canvasRef} 
                                    width={1200 * zoomLevel} height={400} 
                                    className="h-full cursor-crosshair" 
                                    onMouseDown={handleCanvasInteraction} 
                                    onMouseMove={handleMouseMove} 
                                    onMouseUp={() => setDragging(null)}
                                />
                                <div className="absolute top-4 left-4 flex gap-2">
                                    <button onClick={() => setShowAutomation(!showAutomation)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${showAutomation ? 'bg-rose-500 text-white shadow-lg' : 'bg-black/50 text-slate-400 hover:bg-black/70'}`}><Volume2 size={14}/> {t.automation}</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-6 gap-4 shrink-0">
                                <button onClick={handleCrop} className="flex flex-col items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl hover:bg-blue-50 transition-all"><Scissors size={18} className="text-blue-500"/><span className="text-[9px] uppercase font-black">{t.crop}</span></button>
                                <button onClick={handleDeleteRange} className="flex flex-col items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl hover:bg-red-50 transition-all"><Trash2 size={18} className="text-red-500"/><span className="text-[9px] uppercase font-black">{t.delete}</span></button>
                                <button onClick={() => handleFade('in')} className="flex flex-col items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl hover:bg-cyan-50 transition-all"><TrendingUp size={18} className="text-cyan-500"/><span className="text-[9px] uppercase font-black">{t.fadeIn}</span></button>
                                <button onClick={() => handleFade('out')} className="flex flex-col items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl hover:bg-cyan-50 transition-all"><TrendingDown size={18} className="text-cyan-600"/><span className="text-[9px] uppercase font-black">{t.fadeOut}</span></button>
                                <button onClick={handleReverse} className="flex flex-col items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl hover:bg-indigo-50 transition-all"><ArrowLeftRight size={18} className="text-indigo-500"/><span className="text-[9px] uppercase font-black">Reverse</span></button>
                                <button onClick={handleNormalize} className="flex flex-col items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl hover:bg-amber-50 transition-all"><Layers size={18} className="text-amber-500"/><span className="text-[9px] uppercase font-black">Normalize</span></button>
                            </div>
                            <div className="flex justify-between items-center bg-slate-100 p-4 rounded-2xl border border-slate-200 gap-6">
                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col"><span className="text-[10px] text-slate-400 uppercase">Master Gain</span><div className="flex items-center gap-3"><input type="range" min="0" max="2" step="0.05" value={masterGain} onChange={e=>setMasterGain(Number(e.target.value))} className="w-24 h-1.5 bg-slate-300 rounded-full appearance-none accent-slate-600"/><span className="text-xs font-black w-8">{Math.round(masterGain*100)}%</span></div></div>
                                    <div className="flex flex-col"><span className="text-[10px] text-slate-400 uppercase">Zoom</span><div className="flex items-center gap-3"><input type="range" min="1" max="10" step="1" value={zoomLevel} onChange={e=>setZoomLevel(Number(e.target.value))} className="w-24 h-1.5 bg-slate-300 rounded-full appearance-none accent-blue-600"/><ZoomIn size={14} className="text-blue-600"/></div></div>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={togglePlay} className="px-10 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black flex items-center gap-2 shadow-lg transition-all active:scale-95">{isPlaying ? <Square size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}{isPlaying ? t.stop : t.preview}</button>
                                    <button onClick={async () => { const b = await renderProcessed(); if(b) onUpdateFile(b); }} className="px-6 py-3 bg-white border border-slate-300 text-slate-900 hover:bg-slate-50 rounded-xl font-black flex items-center gap-2 transition-all active:scale-95"><Save size={20}/> {t.save}</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="w-80 flex flex-col gap-6 shrink-0 overflow-y-auto custom-scrollbar">
                    <div className="bg-white/60 rounded-3xl border border-slate-300 p-6 flex flex-col gap-6 shadow-sm flex-1">
                        <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                            <button onClick={() => setSideTab('effects')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${sideTab==='effects' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{t.effects}</button>
                            <button onClick={() => setSideTab('formant')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${sideTab==='formant' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{t.formants}</button>
                        </div>
                        {sideTab === 'effects' ? ( <div className="flex-1 flex flex-col gap-4"><ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={sourceRef.current} /></div> ) 
                        : ( <div className="flex-1"><FormantPad formant={formant} onChange={setFormant} /></div> )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudioTab;
