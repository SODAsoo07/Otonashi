import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MoveHorizontal, CircleDot, Pause, Play, Sliders, RotateCcw, RefreshCw, MousePointer2 } from 'lucide-react';
import { AudioFile, AdvTrack, LarynxParams, LiveTractState } from '../types';
import { RULER_HEIGHT } from '../utils/audioUtils';

interface AdvancedTractTabProps {
  audioContext: AudioContext;
  files: AudioFile[];
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
}

const AdvancedTractTab: React.FC<AdvancedTractTabProps> = ({ audioContext, files, onAddToRack }) => {
    // --- State ---
    const [larynxParams, setLarynxParams] = useState<LarynxParams>({ jitterOn: false, jitterDepth: 10, jitterRate: 5, breathOn: true, breathGain: 0.1, noiseSourceType: 'generated', noiseSourceFileId: "", loopOn: true });
    const [tractSourceType, setTractSourceType] = useState('synth'); 
    const [tractSourceFileId, setTractSourceFileId] = useState("");
    const [synthWaveform, setSynthWaveform] = useState('sawtooth'); 
    const [pulseWidth, setPulseWidth] = useState(0.5);
    const [advDuration] = useState(2.0);
    const [fadeOutDuration] = useState(0.1); 
    const [isAdvPlaying, setIsAdvPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [playHeadPos, setPlayHeadPos] = useState(0); 
    const [liveTract, setLiveTract] = useState<LiveTractState>({ x: 0.5, y: 0.4, lips: 0.7, lipLen: 0.5, throat: 0.5, nasal: 0.2 }); 
    const [simIndex, setSimIndex] = useState(1);
    const [clickToAdd, setClickToAdd] = useState(false);
    const [selectedTrackId, setSelectedTrackId] = useState('pitch'); 
    const [hoveredKeyframe, setHoveredKeyframe] = useState<{trackId: string, index: number} | null>(null);
    const [draggingKeyframe, setDraggingKeyframe] = useState<{trackId?: string, index?: number, isPlayhead?: boolean} | null>(null);
    const [vibDepth] = useState(0);
    const [vibRate] = useState(5.0);
    const [advTracks, setAdvTracks] = useState<AdvTrack[]>([
        { id: 'tongueX', name: '혀 위치 (X)', group: 'adj', color: '#60a5fa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'tongueY', name: '혀 높이 (Y)', group: 'adj', color: '#4ade80', points: [{t:0, v:0.4}, {t:1, v:0.4}], min:0, max:1 },
        { id: 'lips',    name: '입술 열기', group: 'adj', color: '#f472b6', points: [{t:0, v:0.7}, {t:1, v:0.7}], min:0, max:1 },
        { id: 'lipLen',  name: '입술 길이', group: 'adj', color: '#db2777', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 }, 
        { id: 'throat',  name: '목 조임',   group: 'adj', color: '#a78bfa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'nasal',   name: '비성 (콧소리)', group: 'adj', color: '#fb923c', points: [{t:0, v:0.2}, {t:1, v:0.2}], min:0, max:1 },
        { id: 'pitch',   name: '음정 (Hz)', group: 'edit', color: '#eab308', points: [{t:0, v:220}, {t:1, v:220}], min:50, max:800 },
        { id: 'gain',    name: '게인',     group: 'edit', color: '#ef4444', points: [{t:0, v:0}, {t:0.1, v:1}, {t:0.9, v:1}, {t:1, v:0}], min:0, max:1 },
        { id: 'breath',  name: '숨소리',   group: 'edit', color: '#22d3ee', points: [{t:0, v:0.01}, {t:1, v:0.01}], min:0, max:0.1 }
    ]);
    
    const liveAudioRef = useRef<any>(null); 
    const animRef = useRef<number | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lastRenderedRef = useRef<AudioBuffer | null>(null);
    const simStartTimeRef = useRef(0);
    const simPauseOffsetRef = useRef(0);
    const simPlaySourceRef = useRef<AudioBufferSourceNode | null>(null);

    const updateLiveAudioParams = useCallback((x: number, y: number, l: number, t: number, len: number, n: number, f1: BiquadFilterNode, f2: BiquadFilterNode, f3: BiquadFilterNode, nasF: BiquadFilterNode) => {
        if (!audioContext) return; const now = audioContext.currentTime; 
        const lF = 1.0 - (len * 0.3); const liF = 0.5 + (l * 0.5);
        const fr1 = (200 + (1 - y) * 600 - (t * 50)) * lF * liF; 
        const fr2 = (800 + x * 1400) * lF * liF; 
        const fr3 = (2000 + l * 1500) * lF;
        if(f1) f1.frequency.setTargetAtTime(Math.max(50, fr1), now, 0.01); 
        if(f2) f2.frequency.setTargetAtTime(fr2, now, 0.01); 
        if(f3) f3.frequency.setTargetAtTime(fr3, now, 0.01); 
        if(nasF) nasF.frequency.setTargetAtTime(Math.max(400, 10000 - (n * 9000)), now, 0.01);
    }, [audioContext]);

    const updateLiveAudio = useCallback((x: number, y: number, l: number, t: number, len: number, n: number) => { 
        if (liveAudioRef.current) updateLiveAudioParams(x, y, l, t, len, n, liveAudioRef.current.f1, liveAudioRef.current.f2, liveAudioRef.current.f3, liveAudioRef.current.nasF); 
    }, [updateLiveAudioParams]);

    const startLivePreview = useCallback(() => {
        if (!audioContext || liveAudioRef.current) return;
        let sNode: AudioBufferSourceNode | OscillatorNode | undefined;
        if (tractSourceType === 'file' && tractSourceFileId) { 
            const f = files.find(f => f.id === tractSourceFileId); 
            if (f?.buffer) { 
                const bufNode = audioContext.createBufferSource();
                bufNode.buffer = f.buffer; 
                bufNode.loop = larynxParams.loopOn; 
                sNode = bufNode;
            } 
        }
        if (!sNode) { 
            const oscNode = audioContext.createOscillator(); 
            oscNode.type = (synthWaveform === 'noise' ? 'sawtooth' : (synthWaveform === 'complex' ? 'sawtooth' : synthWaveform)) as OscillatorType; 
            oscNode.frequency.value = 220; 
            sNode = oscNode;
        }
        const g = audioContext.createGain(); g.gain.value = 0.5;
        const f1 = audioContext.createBiquadFilter(); f1.type = 'peaking'; f1.Q.value = 4; f1.gain.value = 12;
        const f2 = audioContext.createBiquadFilter(); f2.type = 'peaking'; f2.Q.value = 4; f2.gain.value = 12;
        const f3 = audioContext.createBiquadFilter(); f3.type = 'peaking'; f3.Q.value = 4; f3.gain.value = 10;
        const nasF = audioContext.createBiquadFilter(); nasF.type = 'lowpass';
        updateLiveAudioParams(liveTract.x, liveTract.y, liveTract.lips, liveTract.throat, liveTract.lipLen, liveTract.nasal, f1, f2, f3, nasF);
        sNode.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); nasF.connect(g); g.connect(audioContext.destination);
        sNode.start(); liveAudioRef.current = { sNode, g, f1, f2, f3, nasF };
    }, [audioContext, tractSourceType, tractSourceFileId, files, larynxParams, liveTract, updateLiveAudioParams, synthWaveform]);

    const stopLivePreview = useCallback(() => { if (liveAudioRef.current) { try { liveAudioRef.current.sNode.stop(); } catch(e) {} liveAudioRef.current.sNode.disconnect(); liveAudioRef.current = null; } }, []);

    const handleTractMouseDown = useCallback((e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect(); 
        const update = (ce: MouseEvent | React.MouseEvent) => { 
            const x = Math.max(0, Math.min(1, (ce.clientX - rect.left) / rect.width)); 
            const y = Math.max(0, Math.min(1, 1 - (ce.clientY - rect.top) / rect.height)); 
            setLiveTract(prev => { const n = { ...prev, x, y }; updateLiveAudio(n.x, n.y, n.lips, n.throat, n.lipLen, n.nasal); return n; }); 
        };
        update(e); startLivePreview(); 
        const mv = (me: MouseEvent) => update(me); 
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); stopLivePreview(); }; 
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    }, [startLivePreview, stopLivePreview, updateLiveAudio]);

    const handleLipPadMouseDown = useCallback((e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect(); 
        const update = (ce: MouseEvent | React.MouseEvent) => { 
            const lipLen = Math.max(0, Math.min(1, (ce.clientX - rect.left) / rect.width)); 
            const lips = Math.max(0, Math.min(1, 1 - (ce.clientY - rect.top) / rect.height)); 
            setLiveTract(prev => { const n = { ...prev, lips, lipLen }; updateLiveAudio(n.x, n.y, n.lips, n.throat, n.lipLen, n.nasal); return n; }); 
        };
        update(e); startLivePreview(); 
        const mv = (me: MouseEvent) => update(me); 
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); stopLivePreview(); }; 
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    }, [startLivePreview, stopLivePreview, updateLiveAudio]);

    const renderAdvancedAudio = useCallback(async () => {
        if (!audioContext) return null;
        const sr = audioContext.sampleRate; const len = Math.max(1, Math.floor(sr * advDuration)); const offline = new OfflineAudioContext(1, len, sr);
        let sNode: AudioBufferSourceNode | OscillatorNode | GainNode | undefined; 
        if (tractSourceType === 'file' && tractSourceFileId) { 
            const f = files.find(f => f.id === tractSourceFileId); 
            if (f?.buffer) { 
                const bufNode = offline.createBufferSource(); 
                bufNode.buffer = f.buffer; 
                bufNode.loop = larynxParams.loopOn; 
                sNode = bufNode;
            } 
        }
        if (!sNode) { 
            if (synthWaveform === 'noise') { 
                const noiseNode = offline.createBufferSource();
                const nb = offline.createBuffer(1, len, sr); 
                const nd = nb.getChannelData(0); 
                for(let i=0; i<len; i++) nd[i] = Math.random() * 2 - 1; 
                noiseNode.buffer = nb; 
                sNode = noiseNode;
            } else if (synthWaveform === 'complex') {
                const osc1 = offline.createOscillator(); osc1.type = 'sawtooth';
                const osc2 = offline.createOscillator(); osc2.type = 'square'; 
                const mixG = offline.createGain();
                const bal = pulseWidth; 
                const g1 = offline.createGain(); g1.gain.value = 1 - bal;
                const g2 = offline.createGain(); g2.gain.value = bal;
                osc1.connect(g1); g1.connect(mixG);
                osc2.connect(g2); g2.connect(mixG);
                const tP = advTracks.find(t=>t.id==='pitch')?.points || [];
                if (tP.length > 0) { 
                    osc1.frequency.setValueAtTime(tP[0].v, 0); tP.forEach(p => osc1.frequency.linearRampToValueAtTime(p.v, p.t * advDuration));
                    osc2.frequency.setValueAtTime(tP[0].v, 0); tP.forEach(p => osc2.frequency.linearRampToValueAtTime(p.v, p.t * advDuration));
                }
                osc1.start(0); osc2.start(0);
                sNode = mixG; 
            } else if (synthWaveform === 'square') {
                const oscNode = offline.createOscillator(); 
                oscNode.type = 'square';
                const tP = advTracks.find(t=>t.id==='pitch')?.points || [];
                if (tP.length > 0) { oscNode.frequency.setValueAtTime(tP[0].v, 0); tP.forEach(p => oscNode.frequency.linearRampToValueAtTime(p.v, p.t * advDuration)); }
                sNode = oscNode;
            } else {
                const oscNode = offline.createOscillator(); 
                oscNode.type = synthWaveform as OscillatorType;
                const tP = advTracks.find(t=>t.id==='pitch')?.points || [];
                if (tP.length > 0) { oscNode.frequency.setValueAtTime(tP[0].v, 0); tP.forEach(p => oscNode.frequency.linearRampToValueAtTime(p.v, p.t * advDuration)); }
                sNode = oscNode;
            }
        }
        let nNode: AudioBufferSourceNode | undefined; 
        if (larynxParams.noiseSourceType === 'file' && larynxParams.noiseSourceFileId) { const f = files.find(f => f.id === larynxParams.noiseSourceFileId); if (f?.buffer) { nNode = offline.createBufferSource(); nNode.buffer = f.buffer; nNode.loop = larynxParams.loopOn; } }
        if (!nNode) { nNode = offline.createBufferSource(); const nb = offline.createBuffer(1, len, sr); const nd = nb.getChannelData(0); for(let i=0; i<len; i++) nd[i] = Math.random() * 2 - 1; nNode.buffer = nb; }
        const mG = offline.createGain(); const nG = offline.createGain(); const fG = offline.createGain(); 
        const nF = offline.createBiquadFilter(); nF.type = 'lowpass'; nF.frequency.value = 6000;
        nNode.connect(nF); nF.connect(nG); 
        // @ts-ignore - connect exists on both source and gain nodes
        if (sNode.connect) sNode.connect(mG); 
        mG.connect(fG); nG.connect(fG);
        const getPts = (id: string) => advTracks.find(t=>t.id===id)?.points || [];
        const tI=getPts('gain'), tB=getPts('breath');
        if (tI.length > 0) { mG.gain.setValueAtTime(tI[0].v, 0); tI.forEach(p => mG.gain.linearRampToValueAtTime(p.v, p.t * advDuration)); }
        if (tB.length > 0) { const baseGain = larynxParams.breathGain || 0.1; nG.gain.setValueAtTime(tB[0].v * baseGain, 0); tB.forEach(p => nG.gain.linearRampToValueAtTime(p.v * baseGain, p.t * advDuration)); }
        const startFade = Math.max(0, advDuration - fadeOutDuration); fG.gain.setValueAtTime(1, 0); fG.gain.setValueAtTime(1, startFade); fG.gain.linearRampToValueAtTime(0, advDuration);
        const f1=offline.createBiquadFilter(), f2=offline.createBiquadFilter(), f3=offline.createBiquadFilter(), nasF=offline.createBiquadFilter(); 
        [f1,f2,f3].forEach(f=>{ f.type='peaking'; f.Q.value=4; f.gain.value=12; }); nasF.type='lowpass';
        for(let i=0; i<=120; i++) {
            const t = i/120; const time = t * advDuration;
            const getV = (pts: any[]) => { if(pts.length===0) return 0; if(pts.length===1) return pts[0].v; const idx = pts.findIndex(p=>p.t>=t); if(idx===-1) return pts[pts.length-1].v; if(idx===0) return pts[0].v; const p1=pts[idx-1], p2=pts[idx]; return p1.v + (p2.v - p1.v) * ((t - p1.t) / (p2.t - p1.t)); }
            const x=getV(getPts('tongueX')), y=getV(getPts('tongueY')), l=getV(getPts('lips')), th=getV(getPts('throat')), ln=getV(getPts('lipLen')), n=getV(getPts('nasal'));
            const lF = 1.0 - (ln * 0.3); const lipF = 0.5 + (l * 0.5);
            f1.frequency.linearRampToValueAtTime(Math.max(50, (200 + (1 - y) * 600 - (th * 50))) * lF * lipF, time); f2.frequency.linearRampToValueAtTime((800 + x * 1400) * lF * lipF, time); f3.frequency.linearRampToValueAtTime((2000 + l * 1500) * lF, time); f1.Q.linearRampToValueAtTime(2 + th * 4, time); nasF.frequency.linearRampToValueAtTime(Math.max(400, 10000 - (n * 9000)), time);
        }
        if (vibDepth > 0 && (sNode as any).detune) { const lfo = offline.createOscillator(); lfo.frequency.value = vibRate; const lfoG = offline.createGain(); lfoG.gain.value = vibDepth * 10; lfo.connect(lfoG); lfoG.connect((sNode as any).detune); lfo.start(0); }
        fG.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); nasF.connect(offline.destination); 
        // @ts-ignore
        if(sNode.start) sNode.start(0); 
        nNode.start(0); return await offline.startRendering();
    }, [audioContext, advDuration, advTracks, tractSourceType, tractSourceFileId, files, larynxParams, fadeOutDuration, vibDepth, vibRate, synthWaveform, pulseWidth]);

    const handleSimulationPlay = async () => {
        if(isAdvPlaying) { if(simPlaySourceRef.current) simPlaySourceRef.current.stop(); simPauseOffsetRef.current = audioContext.currentTime - simStartTimeRef.current; if(animRef.current) cancelAnimationFrame(animRef.current); setIsAdvPlaying(false); setIsPaused(true); } 
        else {
             const res = lastRenderedRef.current || await renderAdvancedAudio(); if(!res) return; lastRenderedRef.current = res;
             const s = audioContext.createBufferSource(); s.buffer = res; s.connect(audioContext.destination);
             const offset = isPaused ? simPauseOffsetRef.current : 0;
             if (offset >= res.duration) { simPauseOffsetRef.current = 0; s.start(0); simStartTimeRef.current = audioContext.currentTime; } else { s.start(0, offset); simStartTimeRef.current = audioContext.currentTime - offset; }
             simPlaySourceRef.current = s; setIsAdvPlaying(true); setIsPaused(false);
             const animate = () => { if(!isAdvPlaying) return; const cur = (audioContext.currentTime - simStartTimeRef.current) + (isPaused ? 0 : offset); setPlayHeadPos(cur / advDuration); if (cur < advDuration) animRef.current = requestAnimationFrame(animate); else { setIsAdvPlaying(false); setPlayHeadPos(0); simPauseOffsetRef.current = 0; } };
             animRef.current = requestAnimationFrame(animate);
        }
    };

    const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
        if(!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); const mx = e.clientX - rect.left; const t = Math.max(0, Math.min(1, mx / rect.width));
        const my = e.clientY - rect.top;
        if (my < RULER_HEIGHT) { setPlayHeadPos(t); simPauseOffsetRef.current = t * (lastRenderedRef.current?.duration || advDuration); if(isAdvPlaying) { if(simPlaySourceRef.current) try { simPlaySourceRef.current.stop(); } catch(e) {} if(animRef.current) cancelAnimationFrame(animRef.current); setIsAdvPlaying(false); setIsPaused(true); } setDraggingKeyframe({ isPlayhead: true }); return; }
        const track = advTracks.find(tr => tr.id === selectedTrackId); if (!track) return;
        const graphH = rect.height - RULER_HEIGHT; const hitIdx = track.points.findIndex(p => Math.hypot((p.t * rect.width)-mx, (RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * graphH)-my) < 15);
        if (e.button === 2) { e.preventDefault(); if(hitIdx !== -1 && track.points.length > 2) setAdvTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, points: t.points.filter((_, i) => i !== hitIdx) } : t)); return; }
        if (hitIdx !== -1) setDraggingKeyframe({ trackId: selectedTrackId, index: hitIdx });
        else if (clickToAdd) { const val = track.min + ((1 - ((my - RULER_HEIGHT) / graphH)) * (track.max - track.min)); const nPts = [...track.points, { t, v: val }].sort((a, b) => a.t - b.t); setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: nPts } : tr)); setDraggingKeyframe({ trackId: selectedTrackId, index: nPts.findIndex(p => p.t === t) }); }
    }, [selectedTrackId, advTracks, clickToAdd, isAdvPlaying, advDuration]);

    const handleTimelineMouseMove = useCallback((e: React.MouseEvent) => {
        if(!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); const mx = e.clientX - rect.left; const my = e.clientY - rect.top; const t = Math.max(0, Math.min(1, mx / rect.width));
        if (!draggingKeyframe) { const track = advTracks.find(tr => tr.id === selectedTrackId); if(!track) return; const hitIdx = track.points.findIndex(p => Math.abs((p.t*rect.width)-mx) < 15); setHoveredKeyframe(hitIdx !== -1 ? { trackId: selectedTrackId, index: hitIdx } : null); return; }
        if (draggingKeyframe.isPlayhead) setPlayHeadPos(t);
        else if (draggingKeyframe.trackId && draggingKeyframe.index !== undefined) { const gH = rect.height - RULER_HEIGHT; const nV = Math.max(0, Math.min(1, 1 - ((my - RULER_HEIGHT) / gH))); const track = advTracks.find(tr => tr.id === draggingKeyframe.trackId); if(track) {const val = track.min + (nV * (track.max - track.min)); setAdvTracks(prev => prev.map(tr => tr.id === draggingKeyframe.trackId ? { ...tr, points: tr.points.map((p, i) => i === draggingKeyframe.index ? { t, v: val } : p) } : tr));} }
    }, [draggingKeyframe, selectedTrackId, advTracks]);

    useEffect(() => { const handleKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); handleSimulationPlay(); } }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey); }, [handleSimulationPlay]);

    useEffect(() => {
        if(!canvasRef.current) return; const ctx = canvasRef.current.getContext('2d'); if(!ctx) return; const w = canvasRef.current.width, h = canvasRef.current.height;
        const track = advTracks.find(t => t.id === selectedTrackId);
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#f8f8f6'; ctx.fillRect(0, RULER_HEIGHT, w, h - RULER_HEIGHT); ctx.strokeStyle = '#d1d1cf'; ctx.lineWidth = 1; ctx.beginPath(); for(let i=0; i<=10; i++) { const x = (i/10)*w; ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, h); } ctx.stroke();
        if (track) { ctx.beginPath(); ctx.strokeStyle = track.color; ctx.lineWidth = 2.5; track.points.forEach((p, i) => { const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); track.points.forEach((p, i) => { const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); const isH = hoveredKeyframe && hoveredKeyframe.index === i; ctx.fillStyle = isH ? '#1f1e1d' : track.color; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill(); }); }
        const px = playHeadPos * w; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px,0); ctx.lineTo(px,h); ctx.stroke();
    }, [selectedTrackId, advTracks, playHeadPos, hoveredKeyframe]);

    return (
        <div className="flex-1 flex flex-col p-4 gap-4 animate-in fade-in overflow-hidden font-sans font-bold" onMouseUp={() => setDraggingKeyframe(null)}>
            <div className="flex-[3] flex gap-4 min-h-0 overflow-hidden font-sans">
                <div className="flex-1 bg-white/60 rounded-3xl border border-slate-300 flex flex-col relative overflow-hidden shadow-sm">
                    <div className="flex-1 relative flex items-center justify-center p-3 min-h-0 font-sans">
                        <div className="relative w-[380px] h-[380px] transform scale-[0.85] origin-center">
                            <svg viewBox="55 55 290 290" className="absolute inset-0 w-full h-full opacity-[0.08] pointer-events-none fill-none stroke-slate-900 stroke-2"><path d="M 120 350 Q 120 300 120 280 Q 120 180 180 120 Q 220 80 280 80 Q 320 80 340 120 Q 350 140 350 180 L 350 200 Q 350 220 340 240 Q 330 260 300 280 L 250 300 Q 200 320 180 350" /><path d="M 280 140 Q 295 135 310 140" /><circle cx="300" cy="155" r="4" fill="currentColor" /><path d="M 350 180 L 375 200 L 355 215 Q 370 220 370 235 Q 370 250 350 255 L 350 270 Q 350 310 300 335 L 200 335" /><path d="M 185 200 Q 170 200 170 225 Q 170 250 185 250" /></svg>
                            <svg viewBox="55 55 290 290" className="w-full h-full max-h-full max-w-lg filter drop-shadow-lg z-10 font-sans"><path d={`M 150 350 L 150 280 Q 150 150 250 150 Q 320 150 350 ${225 - liveTract.lips * 40} L 350 ${225 + liveTract.lips * 40} Q 320 350 250 350 Z`} fill="#f8fafc" stroke="#64748b" strokeWidth="2.5" /><path d="M 140 350 L 160 350" stroke="#94a3b8" strokeWidth={5 + liveTract.throat * 20} strokeLinecap="round" opacity="0.6"/><path d={`M 180 350 Q ${180 + liveTract.x * 120} ${330 - liveTract.y * 120} ${280 + liveTract.x * 50} ${250 + liveTract.y * 50}`} stroke="#f472b6" strokeWidth={18 + liveTract.throat * 12} strokeLinecap="round" fill="none" /><ellipse cx={350 + liveTract.lipLen * 20} cy="225" rx={6 + liveTract.lipLen * 30} ry={3 + liveTract.lips * 40} fill="#db2777" opacity="0.85" /></svg>
                            <div className="absolute inset-0 flex z-20">
                                <div className="flex-1 bg-slate-500/5 hover:bg-slate-500/10 rounded-2xl cursor-crosshair border border-dashed border-slate-300 transition-colors flex items-center justify-center group font-sans" onMouseDown={handleTractMouseDown}><span className="text-[10px] text-slate-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity font-sans">혀 조작 (X, Y)</span></div>
                                <div className="w-24 bg-pink-500/5 hover:bg-pink-500/10 rounded-2xl cursor-ns-resize border border-dashed border-pink-200 transition-colors flex flex-col items-center justify-center group font-sans" onMouseDown={handleLipPadMouseDown}><MoveHorizontal className="w-5 h-5 text-pink-300 mb-1 font-sans"/><span className="text-[8px] text-pink-400 font-black uppercase tracking-widest text-center px-1 font-sans font-black">입술 컨트롤</span></div>
                            </div>
                        </div>
                    </div>
                    <div className="p-2 px-4 bg-white/80 border-t flex justify-between items-center shrink-0 font-sans">
                        <button onClick={()=>{const t=playHeadPos; const track = advTracks.find(t=>t.id===selectedTrackId); if(!track) return; setAdvTracks(prev=>prev.map(tr=>{if(tr.group!=='adj')return tr;let val=null;if(track.id==='tongueX')val=liveTract.x;else if(track.id==='tongueY')val=liveTract.y;else if(track.id==='lips')val=liveTract.lips;else if(track.id==='lipLen')val=liveTract.lipLen;else if(track.id==='throat')val=liveTract.throat;else if(track.id==='nasal')val=liveTract.nasal;if(val===null)return tr;return{...tr,points:[...tr.points.filter(p=>Math.abs(p.t-t)>0.005),{t,v:val}].sort((a,b)=>a.t-b.t)};}));}} className="bg-[#209ad6] hover:bg-[#1a85b9] text-white px-4 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 active:scale-95 transition-all font-sans font-bold"><CircleDot className="w-3.5 h-3.5"/> 기록</button>
                        <div className="flex gap-1.5 font-black uppercase text-[10px] font-bold"><button onClick={handleSimulationPlay} className="bg-slate-800 text-white px-4 py-1.5 rounded-lg flex items-center gap-2 font-bold">{isAdvPlaying ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>} {isAdvPlaying ? '일시정지' : '재생'}</button><button onClick={async()=>{ const res = await renderAdvancedAudio(); if(res) onAddToRack(res, "시뮬레이션_" + simIndex); setSimIndex(si => si + 1); }} className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors font-bold font-sans">보관함에 저장</button></div>
                    </div>
                </div>
                <div className="w-72 bg-white/40 rounded-2xl border border-slate-300 p-3 flex flex-col gap-3 overflow-y-auto shrink-0 custom-scrollbar font-sans font-bold">
                    <h3 className="font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 text-[10px] font-bold font-sans font-black font-sans"><Sliders size={20} className="text-[#209ad6]"/> 설정</h3>
                    <div className="space-y-4 font-bold text-slate-500 uppercase text-[9px] font-sans font-bold">
                        {[ {id:'lips', label:'입술 열기', color:'accent-pink-400'}, {id:'lipLen', label:'입술 길이', color:'accent-pink-600'}, {id:'throat', label:'목 조임', color:'accent-purple-400'}, {id:'nasal', label:'비성 (콧소리)', color:'accent-orange-400'} ].map(p => (
                            <div key={p.id} className="space-y-1 font-sans font-bold">
                                {/* @ts-ignore dynamic index */}
                                <div className="flex justify-between font-bold font-sans"><span>{p.label}</span><span>{Math.round(liveTract[p.id]*100)}%</span></div>
                                {/* @ts-ignore dynamic index */}
                                <input type="range" min="0" max="1" step="0.01" value={liveTract[p.id]} onChange={e=>{ const v=Number(e.target.value); const n = {...liveTract, [p.id]:v}; setLiveTract(n); updateLiveAudio(n.x, n.y, n.lips, n.throat, n.lipLen, n.nasal); }} className={`w-full h-1 bg-slate-300 appearance-none rounded-full font-bold ${p.color}`}/>
                            </div>
                        ))}
                        <div className="space-y-1 font-sans font-bold"><div className="flex justify-between font-bold font-sans"><span>숨소리 (Breath)</span><span>{Math.round(larynxParams.breathGain*100)}%</span></div><input type="range" min="0" max="1" step="0.01" value={larynxParams.breathGain} onChange={e=>setLarynxParams(p=>({...p, breathGain: Number(e.target.value)}))} className="w-full h-1 bg-slate-300 appearance-none rounded-full accent-cyan-400 font-bold"/></div>
                        <div className="h-px bg-slate-200 my-1 font-sans"></div>
                        
                        <div className="space-y-1 font-sans font-bold font-black uppercase font-sans"><span className="text-[9px] font-bold font-sans">음원 소스 (Base)</span><select value={tractSourceType} onChange={e=>setTractSourceType(e.target.value)} className="w-full bg-white border border-slate-200 rounded p-1 outline-none font-bold text-[10px] font-sans font-black font-sans"><option value="synth">기본 신디사이저</option><option value="file">보관함 파일</option></select></div>
                        {tractSourceType==='synth' && (
                          <div className="space-y-2 font-sans font-bold font-sans font-bold">
                            <div className="grid grid-cols-2 gap-1 font-sans font-bold">
                              {['sawtooth', 'sine', 'square', 'complex', 'noise'].map(t=>(<button key={t} onClick={()=>setSynthWaveform(t)} className={`py-1 rounded border text-[8px] font-black font-sans ${synthWaveform===t?'bg-indigo-500 text-white border-indigo-500 font-black':'bg-white text-slate-500'}`}>{t.toUpperCase()}</button>))}
                            </div>
                            <div className="space-y-1 font-sans font-bold">
                              <div className="flex justify-between font-bold text-indigo-600 font-sans"><span>파형 주기 (Pulse/Tone)</span><span>{Math.round(pulseWidth*100)}%</span></div>
                              <input type="range" min="0.05" max="0.95" step="0.01" value={pulseWidth} onChange={e=>setPulseWidth(Number(e.target.value))} className="w-full h-1 bg-slate-300 appearance-none rounded-full accent-indigo-500 font-sans"/>
                            </div>
                          </div>
                        )}
                        {tractSourceType==='file' && <select value={tractSourceFileId} onChange={e=>setTractSourceFileId(e.target.value)} className="w-full bg-white border border-slate-200 rounded p-1 text-[9px] font-sans font-bold font-sans font-bold">{files.map(f=><option key={f.id} value={f.id} className="font-sans font-bold font-sans font-bold">{f.name}</option>)}</select>}
                        
                        <div className="space-y-1 font-sans font-bold font-black uppercase font-sans font-bold"><span className="text-[9px] text-slate-500 font-bold font-sans">노이즈 소스 (Noise)</span><select value={larynxParams.noiseSourceType} onChange={e=>setLarynxParams({...larynxParams, noiseSourceType:e.target.value})} className="w-full bg-white border border-slate-200 rounded p-1 outline-none font-bold text-[10px] font-sans font-bold font-sans font-bold font-black"><option value="generated">기본 화이트 노이즈</option><option value="file">보관함 파일</option></select></div>
                        {larynxParams.noiseSourceType==='file' && <select value={larynxParams.noiseSourceFileId} onChange={e=>setLarynxParams({...larynxParams, noiseSourceFileId:e.target.value})} className="w-full bg-white border border-slate-200 rounded p-1 text-[9px] mt-1 font-sans font-bold font-sans font-bold">{files.map(f=><option key={f.id} value={f.id} className="font-sans font-bold">{f.name}</option>)}</select>}
                    </div>
                </div>
            </div>
            <div className="h-48 flex flex-col gap-2 bg-white/40 rounded-2xl border border-slate-300 p-2 shadow-sm relative overflow-hidden shrink-0 font-sans font-bold font-sans font-bold">
                 <div className="flex items-center justify-between gap-2 pb-0.5 px-1 font-sans font-bold font-sans font-bold">
                    <div className="flex gap-1 overflow-x-auto custom-scrollbar font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold">
                        {advTracks.map(t=><button key={t.id} onClick={()=>setSelectedTrackId(t.id)} className={`px-2.5 py-1 text-[9px] font-black border rounded-full transition whitespace-nowrap shadow-xs font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold ${selectedTrackId===t.id?'bg-[#209ad6] text-white border-[#209ad6] font-sans font-bold':'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 font-sans font-bold'}`}>{t.name}</button>)}
                    </div>
                    <div className="flex gap-1 font-sans font-bold font-sans font-bold font-sans font-bold">
                        <button onClick={()=>{ setAdvTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, points: [{t:0, v:t.id === 'pitch' ? 220 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5))}, {t:1, v:t.id === 'pitch' ? 220 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5))}] } : t)); }} title="항목 초기화" className="p-1 rounded bg-white border border-slate-200 text-slate-400 hover:text-orange-500 transition-colors font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold"><RotateCcw size={12}/></button>
                        <button onClick={()=>{ setAdvTracks(prev => prev.map(t => ({ ...t, points: [{t:0, v:t.id === 'pitch' ? 220 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5))}, {t:1, v:t.id === 'pitch' ? 220 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5))}] }))); }} title="전체 초기화" className="p-1 rounded bg-white border border-slate-200 text-slate-400 hover:text-red-500 transition-colors font-bold uppercase font-sans font-sans font-sans font-sans font-sans"><RefreshCw size={12} className="stroke-[3] font-sans font-sans font-sans font-sans font-sans"/></button>
                        <button onClick={()=>setClickToAdd(!clickToAdd)} className={`p-1 rounded-lg border transition-all shadow-sm shrink-0 font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold ${clickToAdd ? 'bg-[#209ad6] text-white border-[#209ad6]' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'}`}><MousePointer2 size={14}/></button>
                    </div>
                </div>
                <div className="flex-1 bg-white rounded-xl border border-slate-200 relative overflow-hidden shadow-inner font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold font-sans font-bold">
                    <canvas ref={canvasRef} width={1000} height={200} className="w-full h-full block cursor-crosshair font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans" onMouseDown={handleTimelineMouseDown} 
                        onMouseMove={handleTimelineMouseMove} onMouseUp={() => setDraggingKeyframe(null)} onContextMenu={e=>e.preventDefault()}/>
                </div>
            </div>
        </div>
    );
};

export default AdvancedTractTab;