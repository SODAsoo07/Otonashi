
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Combine, MousePointer2, TrendingUp, Play, Save, Undo2, Redo2, History, Volume2, MoveHorizontal, AudioLines } from 'lucide-react';
import { AudioFile, KeyframePoint, EQBand } from '../types';
import { AudioUtils } from '../utils/audioUtils';
import ParametricEQ from './ParametricEQ';

interface ConsonantTabProps {
  audioContext: AudioContext;
  files: AudioFile[];
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
  isActive: boolean;
}

const ConsonantTab: React.FC<ConsonantTabProps> = ({ audioContext, files, onAddToRack, isActive }) => {
    const [vowelId, setVowelId] = useState("");
    const [consonantId, setConsonantId] = useState("");
    
    // Timing & Stretch
    const [vOffMs, setVOffMs] = useState(0);
    const [offsetMs, setOffsetMs] = useState(100);
    const [cStretch, setCStretch] = useState(100);
    const [vStretch, setVStretch] = useState(100); 

    const [editMode, setEditMode] = useState<'move' | 'volume'>('move'); 
    const [selectedTrack, setSelectedTrack] = useState<'vowel' | 'consonant'>('consonant');
    
    // Keyframes
    const [vVolPts, setVVolPts] = useState<KeyframePoint[]>([{t:0,v:1}, {t:1,v:1}]);
    const [cVolPts, setCVolPts] = useState<KeyframePoint[]>([{t:0,v:1}, {t:1,v:1}]);
    
    const [isPlaying, setIsPlaying] = useState(false);
    const [playheadTime, setPlayheadTime] = useState(0); // in seconds
    
    // Global Gains
    const [vowelGain, setVowelGain] = useState(1.0);
    const [consonantGain, setConsonantGain] = useState(1.0);

    // EQ Bands (Shared for final mix or selectable per track? Let's do Master EQ for simplicity in this tab)
    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 100, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'peaking', freq: 1000, gain: 0, q: 1.0, on: true },
        { id: 3, type: 'highshelf', freq: 8000, gain: 0, q: 0.7, on: true }
    ]);
    const [showEQ, setShowEQ] = useState(false);

    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);
    const animRef = useRef<number | null>(null);
    const [dragPoint, setDragPoint] = useState<{ type: 'vol' | 'move', index?: number } | null>(null);

    // History
    const [history, setHistory] = useState<any[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [showHistory, setShowHistory] = useState(false);

    const getCurrentState = useCallback(() => ({
        vowelId, consonantId, vOffMs, offsetMs, cStretch, vStretch, vVolPts, cVolPts, vowelGain, consonantGain, eqBands
    }), [vowelId, consonantId, vOffMs, offsetMs, cStretch, vStretch, vVolPts, cVolPts, vowelGain, consonantGain, eqBands]);

    const saveHistory = useCallback((label: string) => {
        const state = getCurrentState();
        setHistory(prev => {
            const newHist = prev.slice(0, historyIndex + 1);
            if (newHist.length > 0 && JSON.stringify(newHist[newHist.length-1].state) === JSON.stringify(state)) return prev;
            return [...newHist.slice(-9), { state, label }];
        });
        setHistoryIndex(prev => Math.min(prev + 1, 9));
    }, [getCurrentState, historyIndex]);

    useEffect(() => { if (history.length === 0) saveHistory("초기 상태"); }, []);

    const restoreState = (state: any) => {
        setVowelId(state.vowelId); setConsonantId(state.consonantId); setVOffMs(state.vOffMs);
        setOffsetMs(state.offsetMs); setCStretch(state.cStretch); setVStretch(state.vStretch || 100);
        setVVolPts(state.vVolPts); setCVolPts(state.cVolPts);
        setVowelGain(state.vowelGain || 1.0); setConsonantGain(state.consonantGain || 1.0);
        if(state.eqBands) setEqBands(state.eqBands);
    };

    const handleUndo = () => { if (historyIndex > 0) { const prev = historyIndex - 1; restoreState(history[prev].state); setHistoryIndex(prev); } };
    const handleRedo = () => { if (historyIndex < history.length - 1) { const next = historyIndex + 1; restoreState(history[next].state); setHistoryIndex(next); } };
    
    const commitChange = (label: string = "변경") => saveHistory(label);

    const getBuffer = (id: string) => files.find(f => f.id === id)?.buffer;

    const mixConsonant = async () => {
        const v = getBuffer(vowelId); const c = getBuffer(consonantId);
        if (!v || !audioContext) return null;
        
        const vRatio = vStretch / 100;
        const cRatio = cStretch / 100;
        
        const offsetSec = offsetMs / 1000;
        const vOffsetSec = vOffMs / 1000;
        
        const vLen = v.duration / vRatio;
        const cLen = c ? (c.duration / cRatio) : 0;
        
        const totalDur = Math.max(vOffsetSec + vLen, offsetSec + cLen) + 0.5;
        const offline = new OfflineAudioContext(1, Math.ceil(totalDur * v.sampleRate), v.sampleRate);
        
        // Master EQ Chain
        let outputNode: AudioNode = offline.destination;
        // Inverse chain: Source -> EQ -> Dest.
        // For Offline context, we build backwards or simply chain.
        let eqInput = offline.createGain();
        let currentEQNode = eqInput;

        eqBands.forEach(b => {
            if(b.on) {
                const f = offline.createBiquadFilter();
                f.type = b.type;
                f.frequency.value = b.freq;
                f.Q.value = b.q;
                f.gain.value = b.gain;
                currentEQNode.connect(f);
                currentEQNode = f;
            }
        });
        currentEQNode.connect(offline.destination);

        // Process Vowel
        const processedV = await AudioUtils.applyStretch(v, vRatio);
        if (processedV) {
            const sV = offline.createBufferSource(); 
            sV.buffer = processedV;
            const gV = offline.createGain(); 
            // Apply envelope * global gain
            gV.gain.setValueAtTime(vVolPts[0].v * vowelGain, 0); 
            vVolPts.forEach(p => gV.gain.linearRampToValueAtTime(p.v * vowelGain, vOffsetSec + p.t * processedV.duration));
            sV.connect(gV); gV.connect(eqInput); 
            sV.start(vOffsetSec);
        }

        // Process Consonant
        if(c) {
            const processedC = await AudioUtils.applyStretch(c, cRatio);
            if (processedC) {
                const sC = offline.createBufferSource(); sC.buffer = processedC;
                const gC = offline.createGain(); 
                const startT = Math.max(0, offsetSec);
                gC.gain.setValueAtTime(cVolPts[0].v * consonantGain, startT); 
                cVolPts.forEach(p => gC.gain.linearRampToValueAtTime(p.v * consonantGain, startT + p.t * processedC.duration));
                sC.connect(gC); gC.connect(eqInput); 
                sC.start(startT);
            }
        }
        return await offline.startRendering();
    };

    const togglePlay = useCallback(async () => {
         if(isPlaying) { 
             if(sourceRef.current) sourceRef.current.stop(); 
             pauseOffsetRef.current += audioContext.currentTime - startTimeRef.current; 
             if(animRef.current) cancelAnimationFrame(animRef.current); 
             setIsPlaying(false); 
         } else {
             const b = await mixConsonant();
             if(!b) return;
             const s = audioContext.createBufferSource(); s.buffer = b; s.connect(audioContext.destination);
             const offset = pauseOffsetRef.current % b.duration;
             
             s.start(0, offset); 
             sourceRef.current = s; 
             startTimeRef.current = audioContext.currentTime - offset; 
             setIsPlaying(true);
             
             const animate = () => { 
                 if(sourceRef.current) {
                     setPlayheadTime(audioContext.currentTime - startTimeRef.current);
                     animRef.current = requestAnimationFrame(animate); 
                 }
             };
             animRef.current = requestAnimationFrame(animate);
             
             s.onended = () => { 
                setIsPlaying(false); 
                pauseOffsetRef.current = 0; 
                setPlayheadTime(0);
                if(animRef.current) cancelAnimationFrame(animRef.current);
             };
         }
    }, [isPlaying, vowelId, consonantId, offsetMs, cStretch, vStretch, vowelGain, consonantGain, eqBands, mixConsonant, audioContext]);

    useEffect(() => { 
        if (!isActive) return;
        const handleKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); togglePlay(); } }; 
        window.addEventListener('keydown', handleKey); 
        return () => window.removeEventListener('keydown', handleKey); 
    }, [isActive, togglePlay]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if(!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1 - (e.clientY - rect.top) / rect.height;

        if (editMode === 'volume') {
            const pts = selectedTrack === 'vowel' ? vVolPts : cVolPts;
            const hitIdx = pts.findIndex(p => Math.abs(p.t - x) < 0.02 && Math.abs(p.v - y) < 0.1);
            if (e.button === 2) { e.preventDefault(); if (hitIdx !== -1 && pts.length > 2) { const n = pts.filter((_, i) => i !== hitIdx); selectedTrack === 'vowel' ? setVVolPts(n) : setCVolPts(n); } return; }
            if (hitIdx !== -1) setDragPoint({ type: 'vol', index: hitIdx });
            else { const nPts = [...pts, { t: x, v: y }].sort((a,b) => a.t - b.t); selectedTrack === 'vowel' ? setVVolPts(nPts) : setCVolPts(nPts); setDragPoint({ type: 'vol', index: nPts.findIndex(p=>p.t===x) }); }
        } else setDragPoint({ type: 'move' });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragPoint || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        if (dragPoint.type === 'vol' && dragPoint.index !== undefined) {
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
            const setter = selectedTrack === 'vowel' ? setVVolPts : setCVolPts;
            setter(prev => prev.map((p, i) => i === dragPoint.index ? { t: x, v: y } : p).sort((a,b)=>a.t-b.t));
        } else if (e.buttons === 1) {
            const dx = e.movementX;
            if(selectedTrack==='consonant') setOffsetMs(prev => prev + dx * 2); 
            else setVOffMs(prev => prev + dx * 2);
        }
    };

    const handleMouseUp = () => {
        if(dragPoint) commitChange();
        setDragPoint(null);
    };

    // Draw Canvas
    useEffect(() => {
        if(!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const w = canvasRef.current.width, h = canvasRef.current.height;
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#1e293b'; ctx.fillRect(0,0,w,h);
        
        const vBuf = getBuffer(vowelId); 
        const cBuf = getBuffer(consonantId);

        // Calculate Scale
        const vRealDur = vBuf ? vBuf.duration * (vStretch/100) : 0;
        const cRealDur = cBuf ? cBuf.duration * (cStretch/100) : 0;
        
        const vEnd = (vOffMs/1000) + vRealDur;
        const cEnd = (offsetMs/1000) + cRealDur;
        const totalDuration = Math.max(vEnd, cEnd, 1.0) * 1.2; // +20% padding
        
        const msToPx = (ms: number) => (ms / (totalDuration * 1000)) * w; 

        // Draw Waveform
        const drawWave = (buf: AudioBuffer, color: string, offMs: number, stretch: number, active: boolean, gainVal: number) => {
            if(!buf) return; 
            ctx.beginPath(); 
            ctx.strokeStyle = active ? color : '#475569'; 
            ctx.lineWidth = active ? 2 : 1;
            
            const data = buf.getChannelData(0); 
            const sX = msToPx(offMs); 
            const scaledDurMs = buf.duration * 1000 * (stretch/100);
            const wPx = msToPx(scaledDurMs);
            
            const step = Math.ceil(data.length / wPx);
            
            for(let i=0; i<wPx; i++) { 
                if(sX+i < 0 || sX+i > w) continue; 
                let min=1, max=-1; 
                const dataIdxStart = Math.floor(i * (data.length / wPx));
                const dataIdxEnd = Math.floor((i+1) * (data.length / wPx));
                
                for(let j=dataIdxStart; j<dataIdxEnd; j++) { 
                    const d = data[j]||0; 
                    if(d<min) min=d; 
                    if(d>max) max=d; 
                } 
                const visGain = Math.min(gainVal, 1.5); 
                const cy = active ? h/2 : (color.includes('3b82f6') ? h*0.3 : h*0.7); 
                ctx.moveTo(sX+i, cy + min*h/4*visGain); 
                ctx.lineTo(sX+i, cy + max*h/4*visGain); 
            } 
            ctx.stroke();
        };

        if(vBuf) drawWave(vBuf, '#3b82f6', vOffMs, vStretch, selectedTrack === 'vowel', vowelGain);
        if(cBuf) drawWave(cBuf, '#fb923c', offsetMs, cStretch, selectedTrack === 'consonant', consonantGain);

        // Draw Envelope Lines
        const drawLine = (pts: KeyframePoint[], color: string, active: boolean, offMs: number, realDurSec: number) => {
             if(!active) return; 
             ctx.beginPath(); 
             ctx.strokeStyle = color; 
             ctx.setLineDash([5,5]);
             const startPx = msToPx(offMs);
             const durPx = msToPx(realDurSec * 1000);
             pts.forEach((p, i) => { const x = startPx + (p.t * durPx); const y = (1 - p.v) * h; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); 
             ctx.stroke(); ctx.setLineDash([]);
             pts.forEach(p => { const x = startPx + (p.t * durPx); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, (1-p.v)*h, 4, 0, Math.PI*2); ctx.fill(); });
        };
        
        if(selectedTrack === 'vowel' && vBuf) drawLine(vVolPts, '#60a5fa', true, vOffMs, vRealDur);
        if(selectedTrack === 'consonant' && cBuf) drawLine(cVolPts, '#fb923c', true, offsetMs, cRealDur);

        // Draw Playhead
        if (playheadTime > 0) {
            const px = msToPx(playheadTime * 1000);
            if(px >= 0 && px <= w) {
                ctx.beginPath();
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.moveTo(px, 0);
                ctx.lineTo(px, h);
                ctx.stroke();
            }
        }

    }, [vowelId, consonantId, vOffMs, offsetMs, cStretch, vStretch, vVolPts, cVolPts, selectedTrack, files, vowelGain, consonantGain, playheadTime]);

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in overflow-hidden font-sans font-bold font-black" onMouseUp={handleMouseUp}>
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm font-sans h-full overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 font-black font-sans font-bold font-sans flex-shrink-0">
                    <div className="flex items-center gap-3 font-black"><div className="p-2 bg-indigo-500 rounded-xl text-white font-bold font-black"><Combine size={24}/></div><h2 className="text-xl text-slate-800 tracking-tight font-black font-sans">자음-모음 합성기</h2></div>
                    <div className="flex items-center gap-2">
                         <button onClick={()=>setShowEQ(!showEQ)} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${showEQ ? 'bg-white shadow text-pink-600' : 'text-slate-500'}`}><AudioLines size={16}/> Master EQ</button>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                            <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30 transition-all"><Undo2 size={16}/></button>
                            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30 transition-all"><Redo2 size={16}/></button>
                        </div>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <div className="flex bg-slate-100 p-1 rounded-lg gap-1 font-black">
                            <button onClick={()=>setEditMode('move')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all font-bold ${editMode==='move'?'bg-white shadow text-indigo-600 font-bold':'text-slate-500 font-bold'}`}><MousePointer2 size={16}/> 배치 모드</button>
                            <button onClick={()=>setEditMode('volume')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all font-bold ${editMode==='volume'?'bg-white shadow text-indigo-600 font-bold':'text-slate-500 font-bold'}`}><TrendingUp size={16}/> 볼륨 모드</button>
                        </div>
                    </div>
                </div>

                {showEQ && (
                    <div className="h-48 shrink-0 animate-in fade-in slide-in-from-top-4">
                        <ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={sourceRef.current} />
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-black font-sans font-bold flex-shrink-0">
                    <div className={`space-y-4 p-6 rounded-2xl border transition-all cursor-pointer font-bold ${selectedTrack==='vowel'?'bg-blue-50 border-blue-300 ring-2 ring-blue-100':'bg-white border-slate-200'}`} onClick={()=>setSelectedTrack('vowel')} onMouseUp={()=>commitChange()}>
                        <label className="text-sm font-black text-indigo-500 uppercase tracking-widest block font-black font-sans font-bold">모음 (Vowel)</label>
                        <select value={vowelId} onChange={e=>{setVowelId(e.target.value); commitChange("모음 변경");}} className="w-full p-2.5 border rounded-lg font-black text-base font-bold font-sans">{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-slate-500 px-1 font-sans"><span>Offset</span><span>{Math.round(vOffMs)}ms</span></div>
                                <input type="range" min="0" max="1000" value={vOffMs} onChange={e=>setVOffMs(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-400"/>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-slate-500 px-1 font-sans"><span>Stretch (길이)</span><span className="text-indigo-600">{vStretch}%</span></div>
                                <div className="flex items-center gap-2">
                                    <MoveHorizontal size={14} className="text-indigo-400"/>
                                    <input type="range" min="50" max="200" value={vStretch} onChange={e=>setVStretch(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500 font-bold"/>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-slate-500 px-1 font-sans"><span>Volume (전체)</span><span>{Math.round(vowelGain*100)}%</span></div>
                                <div className="flex items-center gap-2">
                                    <Volume2 size={14} className="text-slate-400"/>
                                    <input type="range" min="0" max="2" step="0.05" value={vowelGain} onChange={e=>setVowelGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-slate-500"/>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={`space-y-4 p-6 rounded-2xl border transition-all cursor-pointer font-bold ${selectedTrack==='consonant'?'bg-orange-50 border-orange-300 ring-2 ring-orange-100':'bg-white border-slate-200'}`} onClick={()=>setSelectedTrack('consonant')} onMouseUp={()=>commitChange()}>
                        <label className="text-sm font-black text-pink-500 uppercase tracking-widest block font-black font-sans font-bold">자음 (Consonant)</label>
                        <select value={consonantId} onChange={e=>{setConsonantId(e.target.value); commitChange("자음 변경");}} className="w-full p-2.5 border rounded-lg font-bold text-base font-bold font-sans"><option value="">선택 안 함</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-slate-500 px-1 font-sans"><span>Offset</span><span>{Math.round(offsetMs)}ms</span></div>
                                <input type="range" min="0" max="1000" value={offsetMs} onChange={e=>setOffsetMs(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-pink-400"/>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-slate-500 px-1 font-bold font-sans"><span>Stretch (길이)</span><span className="text-pink-600">{cStretch}%</span></div>
                                <div className="flex items-center gap-2">
                                    <MoveHorizontal size={14} className="text-pink-400"/>
                                    <input type="range" min="50" max="200" value={cStretch} onChange={e=>setCStretch(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-pink-500 font-bold"/>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-slate-500 px-1 font-sans"><span>Volume (전체)</span><span>{Math.round(consonantGain*100)}%</span></div>
                                <div className="flex items-center gap-2">
                                    <Volume2 size={14} className="text-slate-400"/>
                                    <input type="range" min="0" max="2" step="0.05" value={consonantGain} onChange={e=>setConsonantGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-slate-500"/>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-700 p-0 rounded-2xl shadow-inner min-h-[256px] flex-1 relative overflow-hidden select-none font-sans font-bold font-sans font-bold" onContextMenu={e=>e.preventDefault()}>
                    <canvas ref={canvasRef} width={1000} height={300} className={`w-full h-full font-bold font-sans ${editMode==='move'?'cursor-ew-resize':'cursor-crosshair'}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}/>
                    <div className="absolute bottom-3 right-3 text-xs text-slate-500 font-bold pointer-events-none font-black font-sans font-bold">{editMode==='move' ? '드래그하여 타이밍 조절' : '클릭: 점 추가 | 우클릭: 점 삭제'}</div>
                </div>
                <div className="flex justify-end gap-3 font-sans font-bold font-sans font-bold flex-shrink-0 pb-2"><button onClick={togglePlay} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-100 transition-all text-base font-bold font-sans font-bold"><Play size={20} fill="currentColor"/> {isPlaying ? 'STOP' : 'PREVIEW'}</button><button onClick={async () => { const b = await mixConsonant(); if(b) onAddToRack(b, "Consonant_Mix"); }} className="px-8 py-3 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl font-bold flex items-center gap-2 transition-all text-base font-black font-sans font-bold font-sans font-bold font-sans font-bold"><Save size={20}/> 저장</button></div>
            </div>
        </div>
    );
};

export default ConsonantTab;
