import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Save, Undo2, RotateCcw, CircleDot, LogIn, Sliders } from 'lucide-react';
import * as AudioUtils from '../utils/AudioUtils';

const BASE_DURATION = 2.0;
const RULER_HEIGHT = 24;

export default function SimulatorTab({ files, onAddToRack }) {
    const audioContext = useRef(new (window.AudioContext || window.webkitAudioContext)()).current;
    const [isAdvPlaying, setIsAdvPlaying] = useState(false);
    const [playHeadPos, setPlayHeadPos] = useState(0); 
    const [loopCount, setLoopCount] = useState(1);
    const [liveTract, setLiveTract] = useState({ x: 0.5, y: 0.4, lips: 0.7, lipLen: 0.5, throat: 0.5, nasal: 0.2, volume: 1.0 }); 
    const [selectedTrackId, setSelectedTrackId] = useState('tongueX'); 
    const [advTracks, setAdvTracks] = useState([
        { id: 'tongueX', name: '혀 위치 (X)', color: '#60a5fa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'tongueY', name: '혀 위치 (Y)', color: '#4ade80', points: [{t:0, v:0.4}, {t:1, v:0.4}], min:0, max:1 },
        { id: 'lips',    name: '입술 열기', color: '#f472b6', points: [{t:0, v:0.7}, {t:1, v:0.7}], min:0, max:1 },
        { id: 'lipLen',  name: '입술 길이', color: '#db2777', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 }, 
        { id: 'throat',  name: '목 조임',   color: '#a78bfa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'nasal',   name: '비성',      color: '#fb923c', points: [{t:0, v:0.2}, {t:1, v:0.2}], min:0, max:1 },
        { id: 'volume',  name: '음량',      color: '#10b981', points: [{t:0, v:1.0}, {t:1, v:1.0}], min:0, max:2 }
    ]);

    const canvasRef = useRef(null);
    const waveCanvasRef = useRef(null); 
    const simPlaySourceRef = useRef(null);
    const startTimeRef = useRef(0);

    const renderOneCycle = useCallback(async () => {
        const sr = audioContext.sampleRate; const len = Math.floor(sr * BASE_DURATION);
        const offline = new OfflineAudioContext(1, len, sr);
        const osc = offline.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 220;
        const master = offline.createGain(); master.connect(offline.destination);
        const f1 = offline.createBiquadFilter(); f1.type = 'peaking'; f1.Q.value = 4; f1.gain.value = 12;
        const f2 = offline.createBiquadFilter(); f2.type = 'peaking'; f2.Q.value = 4; f2.gain.value = 12;
        osc.connect(f1); f1.connect(f2); f2.connect(master);
        const getV = (id, t) => { const p = advTracks.find(tr=>tr.id===id).points; const idx = p.findIndex(pt=>pt.t>=t); if(idx<=0) return p[0].v; const p1=p[idx-1], p2=p[idx]; return p1.v + (p2.v-p1.v)*((t-p1.t)/(p2.t-p1.t)); };
        for(let i=0; i<=40; i++) { const t = i/40; const time = t * BASE_DURATION; f1.frequency.linearRampToValueAtTime(300 + (1-getV('tongueY', t))*800, time); f2.frequency.linearRampToValueAtTime(1000 + getV('tongueX', t)*1500, time); master.gain.linearRampToValueAtTime(getV('volume', t), time); }
        osc.start(0); return await offline.startRendering();
    }, [audioContext, advTracks]);

    useEffect(() => {
        const draw = async () => {
            const cycle = await renderOneCycle(); if(!waveCanvasRef.current) return;
            const ctx = waveCanvasRef.current.getContext('2d'); const w = waveCanvasRef.current.width, h = waveCanvasRef.current.height;
            const data = cycle.getChannelData(0); const step = Math.ceil(data.length / w);
            ctx.clearRect(0,0,w,h); ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 1.5; ctx.beginPath();
            const centerY = h / 2 + 10; const amp = h * 0.15;
            for(let i=0; i<w; i++) { let min=1, max=-1; for(let j=0; j<step; j++) { const d = data[i*step+j]; if(d<min) min=d; if(d>max) max=d; } ctx.moveTo(i, centerY + min*amp); ctx.lineTo(i, centerY + max*amp); } ctx.stroke();
        }; draw();
    }, [advTracks, renderOneCycle]);

    useEffect(() => {
        if(!canvasRef.current) return; const ctx = canvasRef.current.getContext('2d'); const w = canvasRef.current.width, h = canvasRef.current.height;
        ctx.clearRect(0,0,w,h); ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'; ctx.fillRect(0, RULER_HEIGHT, w, h-RULER_HEIGHT);
        const track = advTracks.find(t=>t.id===selectedTrackId); ctx.beginPath(); ctx.strokeStyle = track.color; ctx.lineWidth = 3;
        track.points.forEach((p, i) => { const x = p.t * w; const y = RULER_HEIGHT + (1-(p.v-track.min)/(track.max-track.min))*(h-RULER_HEIGHT); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
        ctx.strokeStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(playHeadPos*w, 0); ctx.lineTo(playHeadPos*w, h); ctx.stroke();
    }, [selectedTrackId, advTracks, playHeadPos]);

    return (
        <div className="h-full flex flex-col p-4 gap-4 bg-slate-950 font-bold overflow-hidden">
            <div className="flex-[3] flex gap-4 min-h-0">
                <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 relative flex flex-col">
                    <div className="flex-1 relative flex items-center justify-center bg-slate-950/40">
                        <svg viewBox="0 0 400 400" className="w-full h-full max-w-[380px]">
                            <path d={`M 130 400 L 130 280 Q 130 150 250 150 Q 320 150 350 ${225 - liveTract.lips * 40} L 350 ${225 + liveTract.lips * 40} Q 320 350 250 350 Z`} fill="#1e293b" stroke="#3b82f6" strokeWidth="3" />
                            <path d={`M 180 400 Q ${180 + liveTract.x * 160} ${330 - liveTract.y * 120} ${280 + liveTract.x * 50} ${250 + liveTract.y * 50}`} stroke="#f472b6" strokeWidth="18" fill="none" strokeLinecap="round" />
                            {/* 우측 입술 패드 (가이드 준수) */}
                            <rect x="340" y="50" width="50" height="300" fill="none" stroke="#22c55e" strokeDasharray="4 2" rx="10" />
                            <circle cx="365" cy={350 - liveTract.lips * 250} r="6" fill="#22c55e" className="cursor-pointer" />
                        </svg>
                    </div>
                    <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-between items-center">
                        <div className="flex gap-2"><button className="p-2 bg-slate-800 rounded-lg text-slate-400"><Undo2 size={16}/></button><button className="p-2 bg-slate-800 rounded-lg text-red-500"><RotateCcw size={16}/></button></div>
                        <div className="flex gap-2 text-[10px]">
                            <button onClick={() => setIsAdvPlaying(!isAdvPlaying)} className="bg-blue-600 px-4 py-2 rounded-lg flex items-center gap-2">{isAdvPlaying ? <Pause size={14}/> : <Play size={14}/>} {isAdvPlaying ? 'STOP' : 'PLAY'}</button>
                            <button onClick={async() => { const c = await renderOneCycle(); let f = c; for(let i=1; i<loopCount; i++) f = AudioUtils.concatBuffers(audioContext, f, c); onAddToRack(f, "SIM_RESULT"); }} className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700 transition-all"><LogIn size={14}/> EXPORT</button>
                        </div>
                    </div>
                </div>
                <div className="w-64 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4">
                    <h3 className="text-[10px] text-blue-400 tracking-widest flex items-center gap-2 uppercase"><Sliders size={14}/> Parameters</h3>
                    {['lips','lipLen','throat','nasal'].map(p => (
                        <div key={p} className="space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-500 uppercase"><span>{p}</span><span>{Math.round(liveTract[p]*100)}%</span></div>
                            <input type="range" min="0" max="1" step="0.01" value={liveTract[p]} onChange={e => setLiveTract(prev => ({...prev, [p]: parseFloat(e.target.value)}))} className="w-full accent-blue-500 h-1 bg-slate-800 rounded-full" />
                        </div>
                    ))}
                    <div className="mt-auto pt-4 border-t border-slate-800 flex justify-between text-[10px] items-center"><span>LOOPS</span><input type="number" value={loopCount} onChange={e=>setLoopCount(parseInt(e.target.value))} className="w-12 bg-slate-800 text-center rounded border border-slate-700" /></div>
                </div>
            </div>
            <div className="h-44 bg-slate-900 rounded-2xl border border-slate-800 p-3 relative overflow-hidden flex flex-col gap-2">
                <canvas ref={waveCanvasRef} width={1000} height={150} className="absolute inset-0 w-full h-full opacity-40 pointer-events-none" />
                <div className="flex gap-2 overflow-x-auto pb-1 z-10">
                    {advTracks.map(t => <button key={t.id} onClick={() => setSelectedTrackId(t.id)} className={`px-3 py-1 text-[10px] rounded-full border transition-all whitespace-nowrap ${selectedTrackId === t.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>{t.name}</button>)}
                </div>
                <div className="flex-1 rounded-xl border border-slate-800 relative z-10 bg-slate-950/20">
                    <canvas ref={canvasRef} width={1000} height={120} className="w-full h-full cursor-crosshair" onMouseDown={(e) => { const rect = canvasRef.current.getBoundingClientRect(); setPlayHeadPos((e.clientX - rect.left) / rect.width); }} />
                </div>
            </div>
        </div>
    );
}
