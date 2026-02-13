import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Undo2, RotateCcw, CircleDot, Pause, Play, LogIn, Sliders, X } from 'lucide-react';
import { AudioUtils } from '../utils/AudioUtils';

const BASE_DURATION = 2.0;
const RULER_HEIGHT = 24;

export const SimulatorTab = ({ audioContext, files, onAddToRack }) => {
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
    const handleSimUndo = useCallback(() => { if (simUndoStack.length === 0) return; setAdvTracks(simUndoStack[simUndoStack.length - 1]); setSimUndoStack(prev => prev.slice(0, -1)); }, [simUndoStack]);
    
    // --- 기능 1: 키프레임 등록 함수 (정의 위치 수정) ---
    const registerKeyframe = useCallback(() => {
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
            const threshold = 0.02;
            const idx = tr.points.findIndex(p => Math.abs(p.t - playHeadPos) < threshold);
            let n = [...tr.points];
            if (idx !== -1) n[idx] = { ...n[idx], v: val };
            else { n.push({ t: playHeadPos, v: val }); n.sort((a,b) => a.t - b.t); }
            return { ...tr, points: n };
        }));
        setManualPose(false); 
    }, [liveTract, playHeadPos, pushSimUndo]);

    const applyPreset = (type) => {
        setManualPose(true); let x=0.5, y=0.5, l=0.5;
        switch(type) { case 'A': x=0.2; y=0.1; l=1.0; break; case 'E': x=0.8; y=0.6; l=0.8; break; case 'I': x=0.9; y=1.0; l=0.4; break; case 'O': x=0.2; y=0.5; l=0.3; break; case 'U': x=0.3; y=0.9; l=0.1; break; }
        setLiveTract(p => ({...p, x, y, lips: l}));
    };

    const renderOneCycle = useCallback(async () => {
        if (!audioContext) return null;
        const sr = audioContext.sampleRate;
        const totalLen = Math.max(1, Math.floor(sr * BASE_DURATION));
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
        const s = audioContext.createBufferSource(); s.buffer = finalBuf;
        s.connect(audioContext.destination); s.start(0); simPlaySourceRef.current = s; setIsAdvPlaying(true); startTimeRef.current = audioContext.currentTime;
        const animate = () => {
            const elapsed = audioContext.currentTime - startTimeRef.current;
            if (elapsed >= finalBuf.duration) { setIsAdvPlaying(false); setPlayHeadPos(0); } 
            else { setPlayHeadPos((elapsed % BASE_DURATION) / BASE_DURATION); animRef.current = requestAnimationFrame(animate); }
        };
        animRef.current = requestAnimationFrame(animate);
    };

    // --- 기능 2: 하단 파형 시각화 (크기 축소 및 위치 하향 조정) ---
    const renderPreviewAndDraw = useCallback(async () => {
        if (!audioContext || !waveCanvasRef.current) return;
        const cycle = await renderOneCycle();
        if (!cycle) return;
        const ctx = waveCanvasRef.current.getContext('2d');
        const w = waveCanvasRef.current.width, h = waveCanvasRef.current.height;
        const data = cycle.getChannelData(0); const step = Math.ceil(data.length / w);
        ctx.clearRect(0,0,w,h); 
        ctx.lineWidth = 2.0; 
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)'; // 진한 파란색 투명도 조절
        ctx.beginPath();
        const centerY = h / 2 + 25; // 아래로 이동
        const amplitude = h * 0.08; // 80% 이상 크기 축소
        for(let i=0; i<w; i++) {
            let min=1, max=-1; for(let j=0; j<step; j++) { const d = data[i*step+j]; if(d<min) min=d; if(d>max) max=d; }
            ctx.moveTo(i, centerY + min * amplitude); ctx.lineTo(i, centerY + max * amplitude);
        } ctx.stroke();
    }, [audioContext, renderOneCycle]);

    useEffect(() => { renderPreviewAndDraw(); }, [advTracks, renderPreviewAndDraw]);

    // --- 기능 3: 마우스 조작 및 우클릭 삭제 ---
    const handleCanvasMouseDown = (e) => {
        e.preventDefault(); setManualPose(false); 
        const isRightClick = e.button === 2;
        const rect = canvasRef.current.getBoundingClientRect(); 
        const mx = (e.clientX - rect.left) * (1000/rect.width); 
        const my = (e.clientY - rect.top) * (150/rect.height);
        const t = Math.max(0, Math.min(1, mx / 1000));

        if (my < RULER_HEIGHT) { setPlayHeadPos(t); return; }
        
        const track = advTracks.find(tr => tr.id === selectedTrackId);
        const hitIdx = track.points.findIndex(p => {
            const px = p.t * 1000;
            const py = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (150 - RULER_HEIGHT);
            return Math.hypot(px - mx, py - my) < 15;
        });

        if (isRightClick) {
            if (hitIdx !== -1 && track.points.length > 1) {
                pushSimUndo();
                const newPoints = track.points.filter((_, i) => i !== hitIdx);
                setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: newPoints } : tr));
            }
            return;
        }

        pushSimUndo();
        if (hitIdx !== -1) setDraggingKeyframe({ index: hitIdx, trackId: selectedTrackId });
        else {
            const val = track.min + (1 - (my - RULER_HEIGHT) / (150-RULER_HEIGHT)) * (track.max - track.min);
            const newPoints = [...track.points, { t, v: Math.max(track.min, Math.min(track.max, val)) }].sort((a,b) => a.t - b.t);
            setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: newPoints } : tr));
        }
    };

    useEffect(() => {
        const move = (e) => {
            if (!draggingKeyframe) return; const rect = canvasRef.current.getBoundingClientRect();
            const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
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
        ctx.clearRect(0, 0, w, h); 
        
        ctx.fillStyle = 'rgba(245, 245, 245, 0.1)'; ctx.fillRect(0, RULER_HEIGHT, w, h - RULER_HEIGHT);
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.beginPath(); 
        for (let i = 0; i <= 10; i++) { const x = i * (w / 10); ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, h); } ctx.stroke();
        
        ctx.beginPath(); ctx.strokeStyle = track.color; ctx.lineWidth = 3; track.points.forEach((p, i) => { 
            const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); 
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); 
        }); ctx.stroke();
        track.points.forEach((p) => { 
            const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); 
            ctx.fillStyle = track.color; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); 
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); 
        });
        
        // 플레이헤드 빨간색 선 복구
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); 
        ctx.moveTo(playHeadPos * w, 0); ctx.lineTo(playHeadPos * w, h); ctx.stroke();
    }, [selectedTrackId, advTracks, playHeadPos]);

    return (
        <div className="flex-1 flex flex-col p-4 gap-4 animate-in fade-in overflow-hidden font-sans bg-slate-50 font-bold" onMouseUp={() => setDragPart(null)}>
            <div className="flex-[3] flex gap-4 min-h-0 overflow-hidden font-sans">
                <div className="flex-1 bg-white rounded-2xl border border-slate-300 relative overflow-hidden shadow-sm flex flex-col">
                    <div className="flex-1 relative flex items-center justify-center p-4 bg-slate-100/50">
                        <svg viewBox="0 0 400 400" className="w-full h-full max-w-[380px] drop-shadow-2xl">
                            <path d="M 50 250 Q 50 100 200 100 Q 350 100 350 250 L 350 400 L 50 400 Z" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                            <path d="M 350 220 Q 380 220 390 240" fill="none" stroke="#cbd5e1" strokeWidth="3" />
                            {/* 파란색 목구멍 시각화 개선 */}
                            <path d={`M 150 400 L 150 ${340 + (1 - liveTract.throat) * 40}`} stroke="#0ea5e9" strokeWidth={24 - liveTract.throat * 12} strokeLinecap="round" opacity="0.9"/>
                            
                            <path d={`M 150 400 L 150 280 Q 150 150 250 150 Q 320 150 350 ${225 - liveTract.lips * 40} L 350 ${225 + liveTract.lips * 40} Q 320 350 250 350 Z`} fill="#f8fafc" stroke="#64748b" strokeWidth="3" />
                            <path d={`M 180 400 Q ${180 + liveTract.x * 160} ${330 - liveTract.y * 120} ${280 + liveTract.x * 50} ${250 + liveTract.y * 50}`} stroke="#f472b6" strokeWidth="18" strokeLinecap="round" fill="none" />
                            
                            {/* 입술 드래그 영역 인식 강화 */}
                            <ellipse cx={350 + liveTract.lipLen * 20} cy="225" rx={20 + liveTract.lipLen * 20} ry={15 + liveTract.lips * 35} fill="#db2777" opacity="0.85" className="cursor-move hover:opacity-100" />
                        </svg>
                        <div className="absolute inset-0"
                            onMouseMove={(e) => {
                                if (!dragPart) return; const rect = e.currentTarget.getBoundingClientRect();
                                const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
                                if (dragPart === 'lips') setLiveTract(p => ({...p, lipLen: nx, lips: ny})); 
                                else if (dragPart === 'tongue') setLiveTract(p => ({ ...p, x: nx, y: ny }));
                            }}
                            onMouseDown={(e) => {
                                if (dragPart) return; setManualPose(true); const rect = e.currentTarget.getBoundingClientRect();
                                const nx = (e.clientX - rect.left) / rect.width, ny = (e.clientY - rect.top) / rect.height;
                                if (nx > 0.7 && ny > 0.3 && ny < 0.7) setDragPart('lips');
                                else if (nx > 0.3 && nx < 0.8 && ny > 0.4 && ny < 1.0) { setDragPart('tongue'); setLiveTract(p => ({ ...p, x: nx, y: 1 - ny })); }
                            }}
                        />
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                        <div className="flex gap-2"><button onClick={handleSimUndo} disabled={simUndoStack.length === 0} className="p-2 bg-white rounded-xl border border-slate-300 disabled:opacity-30"><Undo2 size={18} /></button><button onClick={() => { setAdvTracks(advTracks.map(t => ({ ...t, points: [{ t: 0, v: t.id==='pitch'?220:t.id==='volume'?1:0.5 }, { t: 1, v: t.id==='pitch'?220:t.id==='volume'?1:0.5 }] }))); setManualPose(false); }} className="p-2 bg-white rounded-xl border border-slate-300 text-red-500 font-bold"><RotateCcw size={18} /></button></div>
                        <div className="flex gap-2">
                             <button onClick={registerKeyframe} className="bg-[#209ad6] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg flex items-center gap-2"><CircleDot size={16}/> 키프레임 등록</button>
                             <button onClick={handlePlayPauseSim} className="bg-white border border-slate-300 text-slate-700 px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm">{isAdvPlaying ? <Pause size={16}/> : <Play size={16}/>} {isAdvPlaying ? '중지' : '재생'}</button>
                             <button onClick={async()=>{ const c = await renderOneCycle(); if(!c) return; let f = c; for(let i=1; i<loopCount; i++) f = AudioUtils.concatBuffers(audioContext, f, c); onAddToRack(f, "시뮬레이션_결과"); }} className="bg-[#a3cef0] text-[#1f1e1d] px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg hover:bg-[#209ad6] hover:text-white transition-all"><LogIn size={16} /> 보관함에 저장</button>
                        </div>
                    </div>
                </div>
                <div className="w-72 bg-white/40 rounded-2xl border border-slate-300 p-3 flex flex-col gap-4 overflow-y-auto custom-scrollbar font-bold font-sans">
                    <h3 className="font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 text-xs font-sans font-bold"><Sliders size={18} className="text-[#209ad6]"/> 파라미터</h3>
                    <div className="space-y-3">
                        <div className="flex gap-2 mb-2">{['A','E','I','O','U'].map(v => <button key={v} onClick={() => applyPreset(v)} className="flex-1 h-8 rounded-lg bg-white border border-slate-300 font-bold text-xs hover:bg-[#209ad6] hover:text-white transition-all">{v}</button>)}</div>
                        <div className="space-y-1 mb-2 font-sans"><div className="flex justify-between text-xs text-slate-700 font-black"><span>음량</span><span>{Math.round(liveTract.volume * 100)}%</span></div><input type="range" min="0" max="2" step="0.01" value={liveTract.volume} onChange={e => { setManualPose(true); setLiveTract(prev => ({ ...prev, volume: Number(e.target.value) })); }} className="w-full h-1.5 bg-slate-300 rounded-full accent-emerald-500" /></div>
                        {[{id:'lips',label:'입술 열기'},{id:'lipLen',label:'입술 길이'},{id:'throat',label:'목 조임'},{id:'nasal',label:'비성'}].map(p => (<div key={p.id} className="space-y-1 font-sans"><div className="flex justify-between text-xs text-slate-500 font-black"><span>{p.label}</span><span>{Math.round(liveTract[p.id]*100)}%</span></div><input type="range" min="0" max="1" step="0.01" value={liveTract[p.id]} onChange={e=>{setManualPose(true); setLiveTract(prev=>({...prev,[p.id]:Number(e.target.value)}));}} className="w-full h-1 bg-slate-300 rounded-full accent-[#209ad6]" /></div>))}
                        <div className="pt-2 border-t border-slate-200">
                             <div className="flex gap-2 mb-2">
                                <select value={synthType} onChange={e=>setSynthType(e.target.value)} className="w-24 text-[10px] p-1.5 rounded border border-slate-200"><option value="sawtooth">톱니파</option><option value="sine">사인파</option><option value="square">사각파</option><option value="triangle">삼각파</option><option value="noise">노이즈</option></select>
                                <select value={tractSourceFileId} onChange={e=>setTractSourceFileId(e.target.value)} className="flex-1 text-[10px] p-1.5 rounded border border-slate-200"><option value="">기본 신디</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                             </div>
                             <div className="flex justify-between items-center text-xs text-slate-500 font-black mt-2 font-sans"><span>반복 횟수</span><input type="number" min="1" step="1" value={loopCount} onChange={e => setLoopCount(parseInt(e.target.value) || 1)} className="w-12 border rounded px-1 text-center font-sans font-bold"/></div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="h-48 bg-white/40 rounded-3xl border border-slate-300 p-3 flex flex-col gap-2 shadow-inner relative overflow-hidden font-sans font-bold">
                <canvas ref={waveCanvasRef} width={1000} height={192} className="absolute inset-0 w-full h-full pointer-events-none z-0" />
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar z-10">
                    {advTracks.map(t => <button key={t.id} onClick={() => setSelectedTrackId(t.id)} className={`px-4 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap ${selectedTrackId === t.id ? 'bg-[#209ad6] text-white border-[#209ad6] shadow-md' : 'bg-white/80 text-slate-500 border-slate-200 hover:border-slate-300 font-sans font-bold'}`}>{t.name}</button>)}
                </div>
                <div className="flex-1 rounded-2xl border border-slate-200 relative overflow-hidden z-10 bg-transparent" onContextMenu={e=>e.preventDefault()}>
                    <canvas ref={canvasRef} width={1000} height={150} className="w-full h-full cursor-crosshair font-black" 
                        onMouseDown={handleCanvasMouseDown}
                    />
                </div>
            </div>
        </div>
    );
};
