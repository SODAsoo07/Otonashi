import React, { useState, useRef, useEffect } from 'react';
import { Combine, MousePointer2, TrendingUp, Play, Save } from 'lucide-react';
import { AudioFile, KeyframePoint } from '../types';
import { AudioUtils } from '../utils/audioUtils';

interface ConsonantTabProps {
  audioContext: AudioContext;
  files: AudioFile[];
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
}

const ConsonantTab: React.FC<ConsonantTabProps> = ({ audioContext, files, onAddToRack }) => {
    const [vowelId, setVowelId] = useState("");
    const [consonantId, setConsonantId] = useState("");
    const [vOffMs, setVOffMs] = useState(0);
    const [offsetMs, setOffsetMs] = useState(100);
    const [cStretch, setCStretch] = useState(100);
    const [editMode, setEditMode] = useState<'move' | 'volume'>('move'); 
    const [selectedTrack, setSelectedTrack] = useState<'vowel' | 'consonant'>('consonant');
    const [vVolPts, setVVolPts] = useState<KeyframePoint[]>([{t:0,v:1}, {t:1,v:1}]);
    const [cVolPts, setCVolPts] = useState<KeyframePoint[]>([{t:0,v:1}, {t:1,v:1}]);
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Gains
    const [vowelGain] = useState(1.0);
    const [consonantGain] = useState(1.0);

    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);
    const animRef = useRef<number | null>(null);
    const [dragPoint, setDragPoint] = useState<{ type: 'vol' | 'move', index?: number } | null>(null);

    const getBuffer = (id: string) => files.find(f => f.id === id)?.buffer;

    const mixConsonant = async () => {
        const v = getBuffer(vowelId); const c = getBuffer(consonantId);
        if (!v || !audioContext) return null;
        const offsetSec = offsetMs / 1000;
        const cRatio = cStretch / 100;
        const cLen = c ? (c.duration / cRatio) : 0;
        const totalDur = Math.max(v.duration + vOffMs/1000, offsetSec + cLen) + 1.0;
        const offline = new OfflineAudioContext(2, Math.ceil(totalDur * v.sampleRate), v.sampleRate);
        const sV = offline.createBufferSource(); sV.buffer = v;
        const gV = offline.createGain(); 
        gV.gain.setValueAtTime(vVolPts[0].v * vowelGain, 0); vVolPts.forEach(p => gV.gain.linearRampToValueAtTime(p.v * vowelGain, p.t * v.duration));
        sV.connect(gV); gV.connect(offline.destination); sV.start(vOffMs/1000);
        if(c) {
            const processedC = await AudioUtils.applyStretch(c, cRatio);
            if (processedC) {
                const sC = offline.createBufferSource(); sC.buffer = processedC;
                const gC = offline.createGain(); const startT = Math.max(0, offsetSec);
                gC.gain.setValueAtTime(cVolPts[0].v * consonantGain, startT); cVolPts.forEach(p => gC.gain.linearRampToValueAtTime(p.v * consonantGain, startT + p.t * processedC.duration));
                sC.connect(gC); gC.connect(offline.destination); sC.start(startT);
            }
        }
        return await offline.startRendering();
    };

    const togglePlay = async () => {
         if(isPlaying) { if(sourceRef.current) sourceRef.current.stop(); pauseOffsetRef.current += audioContext.currentTime - startTimeRef.current; if(animRef.current) cancelAnimationFrame(animRef.current); setIsPlaying(false); } 
         else {
             const b = await mixConsonant();
             if(!b) return;
             const s = audioContext.createBufferSource(); s.buffer = b; s.connect(audioContext.destination);
             const offset = pauseOffsetRef.current % b.duration;
             s.start(0, offset); sourceRef.current = s; startTimeRef.current = audioContext.currentTime; setIsPlaying(true);
             const animate = () => { if(isPlaying) animRef.current = requestAnimationFrame(animate); };
             animRef.current = requestAnimationFrame(animate);
             s.onended = () => { if(audioContext.currentTime - startTimeRef.current >= b.duration - offset) { setIsPlaying(false); pauseOffsetRef.current = 0; } };
         }
    };

    useEffect(() => { const handleKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); togglePlay(); } }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey); }, [isPlaying, vowelId, consonantId, offsetMs, cStretch]);

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

    const handleMouseUp = () => setDragPoint(null);

    useEffect(() => {
        if(!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const w = canvasRef.current.width, h = canvasRef.current.height;
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#1e293b'; ctx.fillRect(0,0,w,h);
        const msToPx = (ms: number) => (ms / 2000) * w; 
        const drawWave = (buf: AudioBuffer, color: string, off: number, stretch: number, active: boolean) => {
            if(!buf) return; ctx.beginPath(); ctx.strokeStyle = active ? color : '#475569'; ctx.lineWidth = active ? 2 : 1;
            const data = buf.getChannelData(0); const sX = msToPx(off); const wPx = msToPx(buf.duration * 1000 * stretch);
            const step = Math.ceil(data.length / wPx);
            for(let i=0; i<wPx; i++) { if(sX+i < 0 || sX+i > w) continue; let min=1, max=-1; for(let j=0; j<step; j++) { const d = data[Math.floor(i*step)+j]||0; if(d<min) min=d; if(d>max) max=d; } const cy = active ? h/2 : (color==='#3b82f6'?h*0.3:h*0.7); ctx.moveTo(sX+i, cy + min*h/4); ctx.lineTo(sX+i, cy + max*h/4); } ctx.stroke();
        };
        const vBuf = getBuffer(vowelId); const cBuf = getBuffer(consonantId);
        if(vBuf) drawWave(vBuf, '#3b82f6', vOffMs, 1.0, selectedTrack === 'vowel');
        if(cBuf) drawWave(cBuf, '#fb923c', offsetMs, 1/(cStretch/100), selectedTrack === 'consonant');
        const drawLine = (pts: KeyframePoint[], color: string, active: boolean) => {
             if(!active) return; ctx.beginPath(); ctx.strokeStyle = color; ctx.setLineDash([5,5]);
             pts.forEach((p, i) => { const x=p.t*w; const y=(1-p.v)*h; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); ctx.setLineDash([]);
             pts.forEach(p => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.t*w, (1-p.v)*h, 4, 0, Math.PI*2); ctx.fill(); });
        };
        if(selectedTrack === 'vowel') drawLine(vVolPts, '#60a5fa', true);
        if(selectedTrack === 'consonant') drawLine(cVolPts, '#fb923c', true);
    }, [vowelId, consonantId, vOffMs, offsetMs, cStretch, vVolPts, cVolPts, selectedTrack, files]);

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in overflow-hidden font-sans font-bold font-black" onMouseUp={handleMouseUp}>
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm font-sans">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 font-black font-sans font-bold font-sans">
                    <div className="flex items-center gap-3 font-black"><div className="p-2 bg-indigo-500 rounded-xl text-white font-bold font-black"><Combine size={24}/></div><h2 className="text-xl text-slate-800 tracking-tight font-black font-sans">자음-모음 합성기</h2></div>
                    <div className="flex bg-slate-100 p-1 rounded-lg gap-1 font-black">
                        <button onClick={()=>setEditMode('move')} className={`px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all font-bold ${editMode==='move'?'bg-white shadow text-indigo-600 font-bold':'text-slate-500 font-bold'}`}><MousePointer2 size={14}/> 배치 모드</button>
                        <button onClick={()=>setEditMode('volume')} className={`px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all font-bold ${editMode==='volume'?'bg-white shadow text-indigo-600 font-bold':'text-slate-500 font-bold'}`}><TrendingUp size={14}/> 볼륨 모드</button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-black font-sans font-bold">
                    <div className={`space-y-4 p-6 rounded-2xl border transition-all cursor-pointer font-bold ${selectedTrack==='vowel'?'bg-blue-50 border-blue-300 ring-2 ring-blue-100':'bg-white border-slate-200'}`} onClick={()=>setSelectedTrack('vowel')}>
                        <label className="text-xs font-black text-indigo-500 uppercase tracking-widest block font-black font-sans font-bold">모음 (Vowel)</label>
                        <select value={vowelId} onChange={e=>setVowelId(e.target.value)} className="w-full p-2 border rounded font-black text-sm font-bold font-sans">{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        <div className="flex justify-between text-xs font-bold text-slate-500 px-1 font-sans"><span>Offset</span><span>{Math.round(vOffMs)}ms</span></div>
                    </div>
                    <div className={`space-y-4 p-6 rounded-2xl border transition-all cursor-pointer font-bold ${selectedTrack==='consonant'?'bg-orange-50 border-orange-300 ring-2 ring-orange-100':'bg-white border-slate-200'}`} onClick={()=>setSelectedTrack('consonant')}>
                        <label className="text-xs font-black text-pink-500 uppercase tracking-widest block font-black font-sans font-bold">자음 (Consonant)</label>
                        <select value={consonantId} onChange={e=>setConsonantId(e.target.value)} className="w-full p-2 border rounded font-bold text-sm font-bold font-sans"><option value="">선택 안 함</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                        <div className="flex justify-between text-xs font-bold text-slate-500 px-1 font-bold font-sans"><span>스트레치</span><span>{cStretch}%</span></div>
                        <input type="range" min="50" max="200" value={cStretch} onChange={e=>setCStretch(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-pink-500 font-bold"/>
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-700 p-0 rounded-2xl shadow-inner h-64 relative overflow-hidden select-none font-sans font-bold font-sans font-bold" onContextMenu={e=>e.preventDefault()}>
                    <canvas ref={canvasRef} width={1000} height={256} className={`w-full h-full font-bold font-sans ${editMode==='move'?'cursor-ew-resize':'cursor-crosshair'}`} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}/>
                    <div className="absolute bottom-3 right-3 text-[10px] text-slate-500 font-bold pointer-events-none font-black font-sans font-bold">{editMode==='move' ? '드래그하여 타이밍 조절' : '클릭: 점 추가 | 우클릭: 점 삭제'}</div>
                </div>
                <div className="flex justify-end gap-3 font-sans font-bold font-sans font-bold"><button onClick={togglePlay} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-100 transition-all text-sm font-bold font-sans font-bold"><Play size={18} fill="currentColor"/> {isPlaying ? 'STOP' : 'PREVIEW'}</button><button onClick={async () => { const b = await mixConsonant(); if(b) onAddToRack(b, "Consonant_Mix"); }} className="px-8 py-3 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl font-bold flex items-center gap-2 transition-all text-sm font-black font-sans font-bold font-sans font-bold font-sans font-bold"><Save size={18}/> 저장</button></div>
            </div>
        </div>
    );
};

export default ConsonantTab;