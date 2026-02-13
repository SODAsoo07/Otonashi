import React, { useState, useRef, useEffect } from 'react';
import { Combine, MoveHorizontal, ArrowLeftRight, Play, Pause, LogIn } from 'lucide-react';
import * as AudioUtils from '../utils/AudioUtils';

export default function ConsonantTab({ files, onAddToRack }) {
    const audioContext = useRef(new (window.AudioContext || window.webkitAudioContext)()).current;
    const [vowelId, setVowelId] = useState("");
    const [consonantId, setConsonantId] = useState("");
    const [offsetMs, setOffsetMs] = useState(100);
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

    const getBuffer = (id) => files.find(f => f.id === id)?.buffer;

    const mixConsonant = async () => {
        const v = getBuffer(vowelId); const c = getBuffer(consonantId);
        if (!v) return null;
        const vOff = vowelOffsetMs / 1000; const cOff = offsetMs / 1000;
        const cLen = c ? (c.length / c.sampleRate) * consonantStretch : 0;
        const totalDuration = Math.max(vOff + v.duration, cOff + cLen);
        const offline = new OfflineAudioContext(v.numberOfChannels, Math.ceil(totalDuration * v.sampleRate), v.sampleRate);
        const sV = offline.createBufferSource(); sV.buffer = v;
        const gV = offline.createGain(); gV.gain.setValueAtTime(vVolumePts[0].v * vowelGain, vOff);
        vVolumePts.forEach(p => gV.gain.linearRampToValueAtTime(p.v * vowelGain, vOff + p.t * v.duration));
        sV.connect(gV); gV.connect(offline.destination); sV.start(vOff);
        if(c) {
            const sC = offline.createBufferSource(); sC.buffer = c; sC.playbackRate.value = 1/consonantStretch;
            const gC = offline.createGain(); gC.gain.setValueAtTime(cVolumePts[0].v * consonantGain, cOff);
            cVolumePts.forEach(p => gC.gain.linearRampToValueAtTime(p.v * consonantGain, cOff + p.t * (c.duration * consonantStretch)));
            sC.connect(gC); gC.connect(offline.destination); sC.start(cOff);
        }
        return await offline.startRendering();
    };

    useEffect(() => {
        if(!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        const w = canvasRef.current.width, h = canvasRef.current.height;
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#1e293b'; ctx.fillRect(0,0,w,h);
        const msToPx = (ms) => (ms / 2000) * w;
        const drawWave = (buf, color, offset, stretch = 1.0) => {
            if(!buf) return 0; ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1;
            const data = buf.getChannelData(0); const startX = msToPx(offset); const dw = msToPx(buf.duration * 1000 * stretch);
            const step = Math.ceil(data.length / dw);
            for(let i=0; i<dw; i++) {
                let min=1, max=-1; for(let j=0; j<step; j++) { const d = data[Math.floor((i/dw)*data.length)+j] || 0; if(d<min) min=d; if(d>max) max=d; }
                ctx.moveTo(startX+i, h/2+min*(h/4)); ctx.lineTo(startX+i, h/2+max*(h/4));
            } ctx.stroke(); return dw;
        };
        const drawEnv = (pts, color, start, width) => {
            if(width <= 0) return; const startX = msToPx(start); ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
            pts.forEach((p, i) => { const x = startX + p.t * width; const y = h - (p.v * h * 0.8) - (h * 0.1); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
            pts.forEach(p => { const x = startX+p.t*width; const y = h-(p.v*h*0.8)-(h*0.1); ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill(); });
        };
        const vBuf = getBuffer(vowelId); const cBuf = getBuffer(consonantId);
        if(vBuf) { const dw = drawWave(vBuf, '#3b82f6', vowelOffsetMs); if(editMode === 'vVol') drawEnv(vVolumePts, '#60a5fa', vowelOffsetMs, dw); }
        if(cBuf) { const dw = drawWave(cBuf, '#f97316', offsetMs, consonantStretch); if(editMode === 'cVol') drawEnv(cVolumePts, '#fb923c', offsetMs, dw); }
    }, [vowelId, consonantId, offsetMs, vowelOffsetMs, consonantStretch, vVolumePts, cVolumePts, editMode, files]);

    const handleMouseDown = (e) => {
        const rect = canvasRef.current.getBoundingClientRect(); const x = (e.clientX - rect.left) * (1000/rect.width); const y = (e.clientY - rect.top) * (200/rect.height);
        if (e.button === 2) { /* 우클릭 삭제 로직 */ return; }
        setDragging(editMode === 'placement' ? 'cMove' : `${editMode}:new`);
    };

    return (
        <div className="h-full p-6 flex flex-col gap-6 bg-slate-950 overflow-y-auto">
            <div className="bg-slate-900 rounded-3xl border border-slate-800 p-8 flex flex-col gap-6 font-bold shadow-2xl">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-4 text-blue-400"><Combine size={24}/> <h2 className="text-xl tracking-tighter">CONSONANT SYNTHESIZER</h2></div>
                <div className="flex gap-2">
                    {['placement', 'vVol', 'cVol'].map(m => <button key={m} onClick={()=>setEditMode(m)} className={`flex-1 py-2 text-[10px] rounded-lg border transition-all ${editMode===m ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>{m.toUpperCase()}</button>)}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <select value={vowelId} onChange={e=>setVowelId(e.target.value)} className="bg-slate-800 text-xs p-2 rounded border border-slate-700">
                        <option value="">SELECT VOWEL...</option>
                        {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <select value={consonantId} onChange={e=>setConsonantId(e.target.value)} className="bg-slate-800 text-xs p-2 rounded border border-slate-700">
                        <option value="">SELECT CONSONANT...</option>
                        {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                </div>
                <div className="h-[200px] bg-slate-950 rounded-xl border border-slate-800 relative overflow-hidden shadow-inner">
                    <canvas ref={canvasRef} width={1000} height={200} className="w-full h-full cursor-crosshair" onMouseDown={handleMouseDown} onContextMenu={e=>e.preventDefault()} />
                </div>
                <div className="flex gap-2">
                    <button onClick={async () => { if(sourceRef.current) sourceRef.current.stop(); const b = await mixConsonant(); if(b) { const s = audioContext.createBufferSource(); s.buffer = b; s.connect(audioContext.destination); s.start(); sourceRef.current = s; setIsPlaying(true); s.onended = () => setIsPlaying(false); } }} className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2">{isPlaying ? <Pause size={16}/> : <Play size={16}/>} PREVIEW</button>
                    <button onClick={async () => { const b = await mixConsonant(); if(b) onAddToRack(b, "Mixed_Output"); }} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2"><LogIn size={16}/> SAVE TO RACK</button>
                </div>
            </div>
        </div>
    );
}
