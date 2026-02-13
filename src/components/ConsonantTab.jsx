import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Combine, MoveHorizontal, ArrowLeftRight, Play, Pause, LogIn, Trash2 } from 'lucide-react';
import * as AudioUtils from '../utils/AudioUtils';

export const ConsonantTab = ({ audioContext, files, onAddToRack }) => {
    const [vowelId, setVowelId] = useState("");
    const [consonantId, setConsonantId] = useState("");
    const [offsetMs, setOffsetMs] = useState(100); // 자음 오프셋
    const [vowelOffsetMs, setVowelOffsetMs] = useState(0); // 모음 오프셋
    const [vowelGain, setVowelGain] = useState(1.0);
    const [consonantGain, setConsonantGain] = useState(1.0);
    const [consonantStretch, setConsonantStretch] = useState(1.0);
    const [isPlaying, setIsPlaying] = useState(false);
    
    const [vVolumePts, setVVolumePts] = useState([{t:0,v:1}, {t:1,v:1}]);
    const [cVolumePts, setCVolumePts] = useState([{t:0,v:1}, {t:1,v:1}]);
    const [editMode, setEditMode] = useState('placement'); // 'placement', 'vVol', 'cVol'

    const canvasRef = useRef(null);
    const sourceRef = useRef(null);
    const [dragging, setDragging] = useState(null); 

    const getBuffer = (id) => files.find(f => f.id === id)?.buffer;

    const mixConsonant = async () => {
        const v = getBuffer(vowelId);
        const c = getBuffer(consonantId);
        if (!v || !audioContext) return null;
        
        const vOff = vowelOffsetMs / 1000;
        const cOff = offsetMs / 1000;
        const cLen = c ? (c.length / c.sampleRate) * consonantStretch : 0;
        
        const minStart = Math.min(vOff, cOff);
        const totalDuration = Math.max(vOff + v.duration, cOff + cLen) - minStart;
        
        const offline = new OfflineAudioContext(v.numberOfChannels, Math.ceil(totalDuration * v.sampleRate), v.sampleRate);
        
        // Vowel Path
        const sV = offline.createBufferSource(); sV.buffer = v;
        const gV = offline.createGain();
        gV.gain.setValueAtTime(vVolumePts[0].v * vowelGain, vOff - minStart);
        vVolumePts.forEach(p => gV.gain.linearRampToValueAtTime(p.v * vowelGain, vOff - minStart + p.t * v.duration));
        sV.connect(gV); gV.connect(offline.destination); sV.start(vOff - minStart);
        
        // Consonant Path
        if(c) {
            const sC = offline.createBufferSource(); sC.buffer = c;
            sC.playbackRate.value = 1 / consonantStretch;
            const gC = offline.createGain();
            const duration = c.duration * consonantStretch;
            gC.gain.setValueAtTime(cVolumePts[0].v * consonantGain, cOff - minStart);
            cVolumePts.forEach(p => gC.gain.linearRampToValueAtTime(p.v * consonantGain, cOff - minStart + p.t * duration));
            sC.connect(gC); gC.connect(offline.destination); sC.start(cOff - minStart);
        }
        return await offline.startRendering();
    };

    // --- 캔버스 드로잉 로직 ---
    useEffect(() => {
        if(!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        const w = canvasRef.current.width;
        const h = canvasRef.current.height;
        ctx.clearRect(0,0,w,h);
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(0,0,w,h);

        const msToPx = (ms) => (ms / 2000) * w; // 2초 윈도우 기준

        const drawWave = (buf, color, offsetMs, stretch = 1.0) => {
            if(!buf) return 0;
            const data = buf.getChannelData(0);
            const startX = msToPx(offsetMs);
            const drawnWidth = msToPx(buf.duration * 1000 * stretch);
            const step = Math.ceil(data.length / drawnWidth);
            
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            for(let i=0; i<drawnWidth; i++) {
                let min=1, max=-1;
                for(let j=0; j<step; j++) {
                    const d = data[Math.floor((i/drawnWidth)*data.length) + j] || 0;
                    if(d < min) min = d; if(d > max) max = d;
                }
                ctx.moveTo(startX + i, h/2 + min*(h/4));
                ctx.lineTo(startX + i, h/2 + max*(h/4));
            }
            ctx.stroke();
            return drawnWidth;
        };

        const drawEnvelope = (pts, color, startMs, widthPx) => {
            if(widthPx <= 0) return;
            const startX = msToPx(startMs);
            ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
            pts.forEach((p, i) => {
                const x = startX + p.t * widthPx;
                const y = h - (p.v * h * 0.8) - (h * 0.1);
                if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
            });
            ctx.stroke();
            pts.forEach(p => {
                const x = startX + p.t * widthPx;
                const y = h - (p.v * h * 0.8) - (h * 0.1);
                ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
            });
        };

        const vBuf = getBuffer(vowelId);
        const cBuf = getBuffer(consonantId);

        if(vBuf) {
            const dw = drawWave(vBuf, '#3b82f6', vowelOffsetMs);
            if(editMode === 'vVol') drawEnvelope(vVolumePts, '#1d4ed8', vowelOffsetMs, dw);
        }
        if(cBuf) {
            const dw = drawWave(cBuf, '#f97316', offsetMs, consonantStretch);
            if(editMode === 'cVol') drawEnvelope(cVolumePts, '#ea580c', offsetMs, dw);
            // 드래그 핸들 (끝부분)
            if(editMode === 'placement') {
                ctx.fillStyle = '#f97316';
                ctx.fillRect(msToPx(offsetMs) + dw - 5, h/2 - 20, 10, 40);
            }
        }

        // 중앙선
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke();
    }, [vowelId, consonantId, offsetMs, vowelOffsetMs, consonantStretch, vVolumePts, cVolumePts, editMode, files]);

    // --- 마우스 이벤트 ---
    const handleMouseDown = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (1000 / rect.width);
        const y = (e.clientY - rect.top) * (200 / rect.height);
        const isRightClick = e.button === 2;

        if (editMode === 'placement') {
            const cBuf = getBuffer(consonantId);
            if(cBuf) {
                const startX = (offsetMs / 2000) * 1000;
                const endX = startX + (cBuf.duration * 1000 * consonantStretch / 2000) * 1000;
                if (Math.abs(x - endX) < 15) { setDragging('cStretch'); return; }
                if (x > startX && x < endX) { setDragging('cMove'); return; }
            }
            const vBuf = getBuffer(vowelId);
            if(vBuf) {
                const startX = (vowelOffsetMs / 2000) * 1000;
                const endX = startX + (vBuf.duration * 1000 / 2000) * 1000;
                if (x > startX && x < endX) { setDragging('vMove'); return; }
            }
        } else {
            // 볼륨 포인트 조작
            const targetPts = editMode === 'vVol' ? vVolumePts : cVolumePts;
            const startMs = editMode === 'vVol' ? vowelOffsetMs : offsetMs;
            const buf = getBuffer(editMode === 'vVol' ? vowelId : consonantId);
            if(!buf) return;
            const widthPx = ((buf.duration * 1000 * (editMode==='cVol'?consonantStretch:1)) / 2000) * 1000;
            const startX = (startMs / 2000) * 1000;

            const hitIdx = targetPts.findIndex(p => Math.hypot(startX + p.t * widthPx - x, (200 - (p.v * 200 * 0.8 + 20)) - y) < 15);

            if (isRightClick) {
                if (hitIdx !== -1 && targetPts.length > 2) {
                    const newPts = targetPts.filter((_, i) => i !== hitIdx);
                    editMode === 'vVol' ? setVVolumePts(newPts) : setCVolumePts(newPts);
                }
                return;
            }

            if (hitIdx !== -1) setDragging(`${editMode}:${hitIdx}`);
            else {
                const t = Math.max(0, Math.min(1, (x - startX) / widthPx));
                const v = Math.max(0, Math.min(1, (180 - y) / 160));
                const newPts = [...targetPts, {t,v}].sort((a,b)=>a.t-b.t);
                editMode === 'vVol' ? setVVolumePts(newPts) : setCVolumePts(newPts);
            }
        }
    };

    useEffect(() => {
        const handleMove = (e) => {
            if(!dragging) return;
            if(dragging === 'cMove') setOffsetMs(p => Math.max(-500, Math.min(1500, p + e.movementX * 2)));
            if(dragging === 'vMove') setVowelOffsetMs(p => Math.max(-500, Math.min(1500, p + e.movementX * 2)));
            if(dragging === 'cStretch') {
                const rect = canvasRef.current.getBoundingClientRect();
                const x = (e.clientX - rect.left) * (1000 / rect.width);
                const startX = (offsetMs / 2000) * 1000;
                const cBuf = getBuffer(consonantId);
                if(cBuf) {
                    const originalWidthPx = (cBuf.duration * 1000 / 2000) * 1000;
                    setConsonantStretch(Math.max(0.1, (x - startX) / originalWidthPx));
                }
            }
            if(dragging.includes(':')) {
                const [mode, idxStr] = dragging.split(':');
                const idx = parseInt(idxStr);
                const rect = canvasRef.current.getBoundingClientRect();
                const x = (e.clientX - rect.left) * (1000 / rect.width);
                const y = (e.clientY - rect.top) * (200 / rect.height);
                const startMs = mode === 'vVol' ? vowelOffsetMs : offsetMs;
                const buf = getBuffer(mode === 'vVol' ? vowelId : consonantId);
                const widthPx = ((buf.duration * 1000 * (mode==='cVol'?consonantStretch:1)) / 2000) * 1000;
                const startX = (startMs / 2000) * 1000;

                const newPts = [...(mode === 'vVol' ? vVolumePts : cVolumePts)];
                newPts[idx] = {
                    t: Math.max(0, Math.min(1, (x - startX) / widthPx)),
                    v: Math.max(0, Math.min(1, (180 - y) / 160))
                };
                mode === 'vVol' ? setVVolumePts(newPts.sort((a,b)=>a.t-b.t)) : setCVolumePts(newPts.sort((a,b)=>a.t-b.t));
            }
        };
        const handleUp = () => setDragging(null);
        window.addEventListener('mousemove', handleMove); window.addEventListener('mouseup', handleUp);
        return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
    }, [dragging, vowelId, consonantId, offsetMs, vowelOffsetMs, consonantStretch, vVolumePts, cVolumePts]);

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in font-sans overflow-y-auto custom-scrollbar bg-slate-50">
            <div className="bg-white rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm font-bold">
                <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                    <div className="p-2 bg-indigo-500 rounded-xl text-white"><Combine size={24}/></div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">자음-모음 합성기</h2>
                </div>
                <div className="flex gap-2">
                    <button onClick={()=>setEditMode('placement')} className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${editMode==='placement'?'bg-indigo-500 text-white shadow-md':'bg-white text-slate-500 hover:bg-slate-50'}`}>위치 / 길이 (드래그)</button>
                    <button onClick={()=>setEditMode('vVol')} className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${editMode==='vVol'?'bg-blue-500 text-white shadow-md':'bg-white text-slate-500 hover:bg-slate-50'}`}>모음 볼륨 곡선</button>
                    <button onClick={()=>setEditMode('cVol')} className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${editMode==='cVol'?'bg-orange-500 text-white shadow-md':'bg-white text-slate-500 hover:bg-slate-50'}`}>자음 볼륨 곡선</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-slate-100 p-4 rounded-2xl space-y-2">
                        <label className="text-[10px] text-slate-400 uppercase">Vowel Selection</label>
                        <select value={vowelId} onChange={e=>setVowelId(e.target.value)} className="w-full p-2 rounded-lg border border-slate-300 bg-white text-sm">
                            <option value="">모음 선택...</option>
                            {files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <input type="range" min="0" max="2" step="0.1" value={vowelGain} onChange={e=>setVowelGain(Number(e.target.value))} className="w-full accent-blue-500"/>
                    </div>
                    <div className="bg-slate-100 p-4 rounded-2xl space-y-2">
                        <label className="text-[10px] text-slate-400 uppercase">Consonant Selection</label>
                        <select value={consonantId} onChange={e=>setConsonantId(e.target.value)} className="w-full p-2 rounded-lg border border-slate-300 bg-white text-sm">
                            <option value="">자음 선택...</option>
                            {files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <input type="range" min="0" max="2" step="0.1" value={consonantGain} onChange={e=>setConsonantGain(Number(e.target.value))} className="w-full accent-orange-500"/>
                    </div>
                </div>
                <div className="bg-white border border-slate-300 p-4 rounded-2xl shadow-inner space-y-4">
                    <div className="flex justify-between items-center text-xs text-slate-500">
                        <div className="flex gap-4">
                            <span className="flex items-center gap-1"><MoveHorizontal size={14}/> 자음 오프셋: <b className="text-orange-600">{Math.round(offsetMs)}ms</b></span>
                            <span className="flex items-center gap-1"><ArrowLeftRight size={14}/> 자음 길이: <b className="text-orange-600">{Math.round(consonantStretch*100)}%</b></span>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={async () => { if(sourceRef.current) sourceRef.current.stop(); const b = await mixConsonant(); if(b) { const s = audioContext.createBufferSource(); s.buffer = b; s.connect(audioContext.destination); s.start(); sourceRef.current = s; setIsPlaying(true); s.onended = () => setIsPlaying(false); } }} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2">{isPlaying ? <Pause size={16}/> : <Play size={16}/>} {isPlaying ? '중지' : '미리보기'}</button>
                             <button onClick={async () => { const b = await mixConsonant(); if(b) onAddToRack(b, "Mixed_Voice"); }} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center gap-2"><LogIn size={16}/> 저장</button>
                        </div>
                    </div>
                    <div className="h-[200px] bg-slate-900 rounded-xl overflow-hidden relative border border-slate-700 shadow-2xl" onContextMenu={e=>e.preventDefault()}>
                        <canvas ref={canvasRef} width={1000} height={200} className="w-full h-full block cursor-crosshair" onMouseDown={handleMouseDown} />
                    </div>
                </div>
            </div>
        </div>
    );
};
