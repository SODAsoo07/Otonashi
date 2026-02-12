const AdvancedTractTab = ({ audioContext, files, onAddToRack }) => {
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
            const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const track = advTracks.find(tr => tr.id === draggingKeyframe.trackId);
            const nv = Math.max(track.min, Math.min(track.max, track.min + (1 - (e.clientY - rect.top - RULER_HEIGHT) / (rect.height - RULER_HEIGHT)) * (track.max - track.min)));
            setAdvTracks(prev => prev.map(tr => tr.id === draggingKeyframe.trackId ? { ...tr, points: tr.points.map((p, i) => i === draggingKeyframe.index ? {t: nx, v: nv} : p).sort((a,b)=>a.t-b.t) } : tr));
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
                                else if (dragPart === 'tongue') setLiveTract(p => ({...p, x: x, y: y})); // [수정됨] y: 1-ny -> y: y
                            }} 
                            onMouseDown={(e) => {
                                if (dragPart) return; setManualPose(true); const rect = e.currentTarget.getBoundingClientRect();
                                const nx = (e.clientX - rect.left) / rect.width, ny = (e.clientY - rect.top) / rect.height;
                                if (nx > 0.8 && ny > 0.4 && ny < 0.7) setDragPart('lips');
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
                             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">입력 소스 / 노이즈 소스</span>
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
