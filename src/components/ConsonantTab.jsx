import React, { useState, useRef, useEffect } from 'react';
import { Combine, MoveHorizontal, ArrowLeftRight } from 'lucide-react';
import { AudioUtils } from '../utils/AudioUtils';

export const ConsonantTab = ({ audioContext, files, onAddToRack }) => {
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
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in font-sans overflow-y-auto bg-slate-50 font-bold">
            <div className="bg-white rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm">
                <div className="flex items-center gap-3 border-b border-slate-200 pb-4 font-sans font-bold"><div className="p-2 bg-indigo-500 rounded-xl text-white font-sans font-bold"><Combine size={24}/></div><h2 className="text-xl font-black text-slate-800 tracking-tight font-sans font-bold">자음-모음 합성기</h2></div>
                <div className="flex gap-2 font-sans font-bold"><button onClick={()=>setEditMode('placement')} className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${editMode==='placement'?'bg-indigo-500 text-white shadow-md font-sans font-bold':'bg-white text-slate-500 hover:bg-slate-50'}`}>위치 / 길이</button><button onClick={()=>setEditMode('vVol')} className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${editMode==='vVol'?'bg-blue-500 text-white shadow-md font-sans font-bold':'bg-white text-slate-500 hover:bg-slate-50'}`}>모음 볼륨</button><button onClick={()=>setEditMode('cVol')} className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${editMode==='cVol'?'bg-orange-500 text-white shadow-md font-sans font-bold':'bg-white text-slate-500 hover:bg-slate-50'}`}>자음 볼륨</button></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-3 font-sans font-bold"><select value={vowelId} onChange={e=>setVowelId(e.target.value)} className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm"><option value="">모음 선택...</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><input type="range" min="0" max="2" step="0.1" value={vowelGain} onChange={e=>setVowelGain(Number(e.target.value))} className="w-full accent-indigo-500"/></div>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-3 font-sans font-bold font-sans font-bold"><select value={consonantId} onChange={e=>setConsonantId(e.target.value)} className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm"><option value="">자음 선택...</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><input type="range" min="0" max="2" step="0.1" value={consonantGain} onChange={e=>setConsonantGain(Number(e.target.value))} className="w-full accent-pink-500"/></div>
                </div>
                <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-inner space-y-4 font-sans font-bold font-sans font-bold">
                    <div className="flex justify-between items-center font-sans font-bold font-sans font-bold">
                        <div className="flex gap-4 text-xs"><span>자음 오프셋: {Math.round(offsetMs)}ms</span><span>모음 오프셋: {Math.round(vowelOffsetMs)}ms</span><span>자음 스트레치: {Math.round(consonantStretch*100)}%</span></div>
                        <button onClick={async () => { if(sourceRef.current) sourceRef.current.stop(); const b = await mixConsonant(); if(b) { const s = audioContext.createBufferSource(); s.buffer = b; s.connect(audioContext.destination); s.start(); sourceRef.current = s; setIsPlaying(true); s.onended = () => setIsPlaying(false); } }} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-lg transition-all font-sans font-bold">{isPlaying ? '중지' : '미리보기'}</button>
                    </div>
                    <div className="h-48 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 relative font-sans font-bold font-sans font-bold">
                        <canvas ref={canvasRef} width={1000} height={192} className="w-full h-full block cursor-crosshair font-sans font-bold font-sans font-bold" 
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
