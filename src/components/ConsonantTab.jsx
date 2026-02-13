import React, { useState, useRef, useEffect } from 'react';
import { Combine, MoveHorizontal, ArrowLeftRight, Play, Pause, LogIn, Trash2 } from 'lucide-react';
import * as AudioUtils from '../utils/AudioUtils';

export default function ConsonantTab({ files, onAddToRack }) {
    // App.jsx에서 관리하는 Context가 없을 경우를 대비해 내부에서 생성 가능하도록 처리
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

    const getBuffer = (id) => files?.find(f => f.id === id)?.buffer;

    const mixConsonant = async () => {
        const v = getBuffer(vowelId);
        const c = getBuffer(consonantId);
        if (!v) return null;
        
        const vOff = vowelOffsetMs / 1000;
        const cOff = offsetMs / 1000;
        const cLen = c ? (c.length / c.sampleRate) * consonantStretch : 0;
        const totalDuration = Math.max(vOff + v.duration, cOff + cLen);
        
        const offline = new OfflineAudioContext(v.numberOfChannels, Math.ceil(totalDuration * v.sampleRate), v.sampleRate);
        
        const sV = offline.createBufferSource(); sV.buffer = v;
        const gV = offline.createGain();
        gV.gain.setValueAtTime(vVolumePts[0].v * vowelGain, vOff);
        vVolumePts.forEach(p => gV.gain.linearRampToValueAtTime(p.v * vowelGain, vOff + p.t * v.duration));
        sV.connect(gV); gV.connect(offline.destination); sV.start(vOff);
        
        if(c) {
            const sC = offline.createBufferSource(); sC.buffer = c;
            sC.playbackRate.value = 1 / consonantStretch;
            const gC = offline.createGain();
            const duration = c.duration * consonantStretch;
            gC.gain.setValueAtTime(cVolumePts[0].v * consonantGain, cOff);
            cVolumePts.forEach(p => gC.gain.linearRampToValueAtTime(p.v * consonantGain, cOff + p.t * duration));
            sC.connect(gC); gC.connect(offline.destination); sC.start(cOff);
        }
        return await offline.startRendering();
    };

    // ... (useEffect for canvas 및 handleMouseDown 로직 동일하게 유지)

    return (
        <div className="h-full p-6 flex flex-col gap-6 bg-slate-50 overflow-y-auto">
            <div className="bg-white rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm font-bold">
                <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                    <Combine className="text-indigo-500" size={24}/>
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">자음-모음 합성기</h2>
                </div>
                <div className="flex gap-2">
                    <button onClick={()=>setEditMode('placement')} className={`flex-1 py-2 text-xs rounded-lg border ${editMode==='placement'?'bg-indigo-500 text-white':'bg-white text-slate-500'}`}>위치 / 길이</button>
                    <button onClick={()=>setEditMode('vVol')} className={`flex-1 py-2 text-xs rounded-lg border ${editMode==='vVol'?'bg-blue-500 text-white':'bg-white text-slate-500'}`}>모음 볼륨</button>
                    <button onClick={()=>setEditMode('cVol')} className={`flex-1 py-2 text-xs rounded-lg border ${editMode==='cVol'?'bg-orange-500 text-white':'bg-white text-slate-500'}`}>자음 볼륨</button>
                </div>
                {/* ... 컨트롤 레이아웃 */}
                <div className="flex gap-2 justify-end">
                    <button onClick={async () => { 
                        if(sourceRef.current) sourceRef.current.stop(); 
                        const b = await mixConsonant(); 
                        if(b) { const s = audioContext.createBufferSource(); s.buffer = b; s.connect(audioContext.destination); s.start(); sourceRef.current = s; setIsPlaying(true); s.onended = () => setIsPlaying(false); } 
                    }} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold flex items-center gap-2">
                        {isPlaying ? <Pause size={16}/> : <Play size={16}/>} 미리보기
                    </button>
                    <button onClick={async () => { const b = await mixConsonant(); if(b) onAddToRack(b, "Mixed_Voice"); }} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold flex items-center gap-2"><LogIn size={16}/> 저장</button>
                </div>
                <div className="h-[200px] bg-slate-900 rounded-xl overflow-hidden relative">
                    <canvas ref={canvasRef} width={1000} height={200} className="w-full h-full block cursor-crosshair" onMouseDown={/* handleMouseDown */} />
                </div>
            </div>
        </div>
    );
}
