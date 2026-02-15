
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MoveHorizontal, CircleDot, Pause, Play, Sliders, RotateCcw, RefreshCw, MousePointer2, Undo2, Redo2, History, Mic2, AudioLines } from 'lucide-react';
import { AudioFile, AdvTrack, LarynxParams, LiveTractState, EQBand } from '../types';
import { RULER_HEIGHT } from '../utils/audioUtils';
import ParametricEQ from './ParametricEQ';

interface AdvancedTractTabProps {
  audioContext: AudioContext;
  files: AudioFile[];
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
  isActive: boolean;
}

const AdvancedTractTab: React.FC<AdvancedTractTabProps> = ({ audioContext, files, onAddToRack, isActive }) => {
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
    const [manualPitch, setManualPitch] = useState(220);
    const [manualGender, setManualGender] = useState(1.0);
    const [simIndex, setSimIndex] = useState(1);
    const [clickToAdd, setClickToAdd] = useState(false);
    const [selectedTrackId, setSelectedTrackId] = useState('pitch'); 
    const [hoveredKeyframe, setHoveredKeyframe] = useState<{trackId: string, index: number} | null>(null);
    const [draggingKeyframe, setDraggingKeyframe] = useState<{trackId?: string, index?: number, isPlayhead?: boolean} | null>(null);
    
    // Waveform Preview State
    const [previewBuffer, setPreviewBuffer] = useState<AudioBuffer | null>(null);

    // EQ
    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'lowshelf', freq: 100, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'peaking', freq: 1500, gain: 0, q: 1.0, on: true },
        { id: 3, type: 'highshelf', freq: 8000, gain: 0, q: 0.7, on: true }
    ]);
    const [showEQ, setShowEQ] = useState(false);

    // Tracks Configuration
    const [advTracks, setAdvTracks] = useState<AdvTrack[]>([
        { id: 'tongueX', name: '혀 위치 (X)', group: 'adj', color: '#60a5fa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'tongueY', name: '혀 높이 (Y)', group: 'adj', color: '#4ade80', points: [{t:0, v:0.4}, {t:1, v:0.4}], min:0, max:1 },
        { id: 'lips',    name: '입술 열기', group: 'adj', color: '#f472b6', points: [{t:0, v:0.7}, {t:1, v:0.7}], min:0, max:1 },
        { id: 'lipLen',  name: '입술 길이', group: 'adj', color: '#db2777', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 }, 
        { id: 'throat',  name: '목 조임',   group: 'adj', color: '#a78bfa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'nasal',   name: '연구개 (Velum)', group: 'adj', color: '#fb923c', points: [{t:0, v:0.2}, {t:1, v:0.2}], min:0, max:1 },
        { id: 'pitch',   name: '피치 (Hz)', group: 'edit', color: '#fbbf24', points: [{t:0, v:220}, {t:1, v:220}], min:50, max:600 },
        { id: 'gender',  name: '성별 (Shift)', group: 'edit', color: '#ec4899', points: [{t:0, v:1}, {t:1, v:1}], min:0.5, max:2.0 },
        { id: 'gain',    name: '게인 (Vol)', group: 'edit', color: '#ef4444', points: [{t:0, v:0}, {t:0.1, v:1}, {t:0.9, v:1}, {t:1, v:0}], min:0, max:1.5 },
        { id: 'breath',  name: '숨소리',     group: 'edit', color: '#22d3ee', points: [{t:0, v:0.01}, {t:1, v:0.01}], min:0, max:0.1 }
    ]);
    
    const [history, setHistory] = useState<any[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [showHistory, setShowHistory] = useState(false);

    const isAdvPlayingRef = useRef(false);
    const liveAudioRef = useRef<any>(null); 
    const animRef = useRef<number | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lastRenderedRef = useRef<AudioBuffer | null>(null);
    const simStartTimeRef = useRef(0);
    const simPauseOffsetRef = useRef(0);
    const simPlaySourceRef = useRef<AudioBufferSourceNode | null>(null);
    const previewDebounceRef = useRef<number | null>(null);

    useEffect(() => {
        isAdvPlayingRef.current = isAdvPlaying;
    }, [isAdvPlaying]);

    const getCurrentState = useCallback(() => ({
        larynxParams, tractSourceType, tractSourceFileId, synthWaveform, pulseWidth, liveTract, advTracks, manualPitch, manualGender, eqBands
    }), [larynxParams, tractSourceType, tractSourceFileId, synthWaveform, pulseWidth, liveTract, advTracks, manualPitch, manualGender, eqBands]);

    const saveHistory = useCallback((label: string) => {
        const state = getCurrentState();
        setHistory(prev => {
            const newHist = prev.slice(0, historyIndex + 1);
            if (newHist.length > 0 && JSON.stringify(newHist[newHist.length-1].state) === JSON.stringify(state)) return prev;
            return [...newHist.slice(-9), { state, label }];
        });
        setHistoryIndex(prev => Math.min(prev + 1, 9));
    }, [getCurrentState, historyIndex]);

    useEffect(() => { if (history.length === 0) saveHistory("초기 상태"); }, [saveHistory]);

    const restoreState = (state: any) => {
        setLarynxParams(state.larynxParams); setTractSourceType(state.tractSourceType); setTractSourceFileId(state.tractSourceFileId);
        setSynthWaveform(state.synthWaveform); setPulseWidth(state.pulseWidth); setLiveTract(state.liveTract); setAdvTracks(state.advTracks);
        setManualPitch(state.manualPitch || 220); setManualGender(state.manualGender || 1.0);
        if(state.eqBands) setEqBands(state.eqBands);
    };

    const handleUndo = () => { if (historyIndex > 0) { const prev = historyIndex - 1; restoreState(history[prev].state); setHistoryIndex(prev); } };
    const handleRedo = () => { if (historyIndex < history.length - 1) { const next = historyIndex + 1; restoreState(history[next].state); setHistoryIndex(next); } };
    const commitChange = (label: string = "변경") => saveHistory(label);

    const getValueAtTime = useCallback((trackId: string, t: number) => {
        const track = advTracks.find(tr => tr.id === trackId);
        if (!track) return 0;
        let val = track.points[0].v;
        for(let i=0; i<track.points.length-1; i++) {
            if(t >= track.points[i].t && t <= track.points[i+1].t) {
                const ratio = (t - track.points[i].t) / (track.points[i+1].t - track.points[i].t);
                val = track.points[i].v + (track.points[i+1].v - track.points[i].v) * ratio;
                break;
            }
        }
        if(t > track.points[track.points.length-1].t) val = track.points[track.points.length-1].v;
        return val;
    }, [advTracks]);

    const updateLiveAudioParams = useCallback((x: number, y: number, l: number, t: number, len: number, n: number, pitch: number, gender: number, f1: BiquadFilterNode, f2: BiquadFilterNode, f3: BiquadFilterNode, nasF: BiquadFilterNode, osc?: OscillatorNode) => {
        if (!audioContext) return; const now = audioContext.currentTime; 
        const lF = 1.0 - (len * 0.3); const liF = 0.5 + (l * 0.5);
        
        let fr1 = (200 + (1 - y) * 600 - (t * 50)) * lF * liF; 
        let fr2 = (800 + x * 1400) * lF * liF; 
        let fr3 = (2000 + l * 1500) * lF;

        fr1 *= gender; fr2 *= gender; fr3 *= gender;

        if(f1) f1.frequency.setTargetAtTime(Math.max(50, fr1), now, 0.01); 
        if(f2) f2.frequency.setTargetAtTime(fr2, now, 0.01); 
        if(f3) f3.frequency.setTargetAtTime(fr3, now, 0.01); 
        if(nasF) nasF.frequency.setTargetAtTime(Math.max(400, (10000 - (n * 9000)) * gender), now, 0.01);
        if(osc && tractSourceType === 'synth') osc.frequency.setTargetAtTime(pitch, now, 0.01);
    }, [audioContext, tractSourceType]);

    const updateLiveAudio = useCallback((x: number, y: number, l: number, t: number, len: number, n: number, pitch: number, gender: number) => { 
        if (liveAudioRef.current) updateLiveAudioParams(x, y, l, t, len, n, pitch, gender, liveAudioRef.current.f1, liveAudioRef.current.f2, liveAudioRef.current.f3, liveAudioRef.current.nasF, liveAudioRef.current.sNode instanceof OscillatorNode ? liveAudioRef.current.sNode : undefined); 
    }, [updateLiveAudioParams]);

    const syncVisualsToTime = useCallback((t: number) => {
        const x = getValueAtTime('tongueX', t);
        const y = getValueAtTime('tongueY', t);
        const lips = getValueAtTime('lips', t);
        const lipLen = getValueAtTime('lipLen', t);
        const throat = getValueAtTime('throat', t);
        const nasal = getValueAtTime('nasal', t);
        const pitch = getValueAtTime('pitch', t);
        const gender = getValueAtTime('gender', t);

        setLiveTract({ x, y, lips, lipLen, throat, nasal });
        setManualPitch(pitch);
        setManualGender(gender);
        updateLiveAudio(x, y, lips, throat, lipLen, nasal, pitch, gender);
    }, [getValueAtTime, updateLiveAudio]);

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
            oscNode.frequency.value = manualPitch; 
            sNode = oscNode;
        }
        const g = audioContext.createGain(); g.gain.value = 0.5;
        const f1 = audioContext.createBiquadFilter(); f1.type = 'peaking'; f1.Q.value = 4; f1.gain.value = 12;
        const f2 = audioContext.createBiquadFilter(); f2.type = 'peaking'; f2.Q.value = 4; f2.gain.value = 12;
        const f3 = audioContext.createBiquadFilter(); f3.type = 'peaking'; f3.Q.value = 4; f3.gain.value = 10;
        const nasF = audioContext.createBiquadFilter(); nasF.type = 'lowpass';
        updateLiveAudioParams(liveTract.x, liveTract.y, liveTract.lips, liveTract.throat, liveTract.lipLen, liveTract.nasal, manualPitch, manualGender, f1, f2, f3, nasF);
        
        let lastNode: AudioNode = nasF;
        const eqNodes: BiquadFilterNode[] = [];
        eqBands.forEach(b => {
            if(b.on) {
                const eq = audioContext.createBiquadFilter();
                eq.type = b.type;
                eq.frequency.value = b.freq;
                eq.gain.value = b.gain;
                eq.Q.value = b.q;
                lastNode.connect(eq);
                lastNode = eq;
                eqNodes.push(eq);
            }
        });

        sNode.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); 
        lastNode.connect(g); g.connect(audioContext.destination);
        sNode.start(); 
        liveAudioRef.current = { sNode, g, f1, f2, f3, nasF, eqNodes };
    }, [audioContext, tractSourceType, tractSourceFileId, files, larynxParams, liveTract, updateLiveAudioParams, synthWaveform, manualPitch, manualGender, eqBands]);

    const stopLivePreview = useCallback(() => { if (liveAudioRef.current) { try { liveAudioRef.current.sNode.stop(); } catch(e) {} liveAudioRef.current.sNode.disconnect(); liveAudioRef.current = null; } }, []);

    const handleTractMouseDown = useCallback((e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect(); 
        const update = (ce: MouseEvent | React.MouseEvent) => { 
            const x = Math.max(0, Math.min(1, (ce.clientX - rect.left) / rect.width)); 
            const y = Math.max(0, Math.min(1, 1 - (ce.clientY - rect.top) / rect.height)); 
            setLiveTract(prev => { const n = { ...prev, x, y }; updateLiveAudio(n.x, n.y, n.lips, n.throat, n.lipLen, n.nasal, manualPitch, manualGender); return n; }); 
        };
        update(e); startLivePreview(); 
        const mv = (me: MouseEvent) => update(me); 
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); stopLivePreview(); commitChange("제스처 조작"); }; 
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    }, [startLivePreview, stopLivePreview, updateLiveAudio, manualPitch, manualGender]);

    const handleLipPadMouseDown = useCallback((e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect(); 
        const update = (ce: MouseEvent | React.MouseEvent) => { 
            const lipLen = Math.max(0, Math.min(1, (ce.clientX - rect.left) / rect.width)); 
            const lips = Math.max(0, Math.min(1, 1 - (ce.clientY - rect.top) / rect.height)); 
            setLiveTract(prev => { const n = { ...prev, lips, lipLen }; updateLiveAudio(n.x, n.y, n.lips, n.throat, n.lipLen, n.nasal, manualPitch, manualGender); return n; }); 
        };
        update(e); startLivePreview(); 
        const mv = (me: MouseEvent) => update(me); 
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); stopLivePreview(); commitChange("입술 조작"); }; 
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    }, [startLivePreview, stopLivePreview, updateLiveAudio, manualPitch, manualGender]);

    const handleVelumMouseDown = useCallback((e: React.MouseEvent) => {
        const startY = e.clientY;
        const startVal = liveTract.nasal;
        const update = (ce: MouseEvent) => {
            const deltaY = ce.clientY - startY;
            const newVal = Math.max(0, Math.min(1, startVal + deltaY / 100)); 
            setLiveTract(prev => { 
                const n = { ...prev, nasal: newVal }; 
                updateLiveAudio(n.x, n.y, n.lips, n.throat, n.lipLen, n.nasal, manualPitch, manualGender); 
                return n; 
            });
        };
        startLivePreview();
        const mv = (me: MouseEvent) => update(me);
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); stopLivePreview(); commitChange("비성 조작"); }; 
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
        e.stopPropagation();
    }, [liveTract.nasal, startLivePreview, stopLivePreview, updateLiveAudio, manualPitch, manualGender]);

    const renderAdvancedAudio = useCallback(async () => {
        if (!audioContext) return null;
        const sr = audioContext.sampleRate; const len = Math.max(1, Math.floor(sr * advDuration)); const offline = new OfflineAudioContext(1, len, sr);
        let sNode: AudioNode | undefined; 
        const getPts = (id: string) => advTracks.find(t=>t.id===id)?.points || [];
        const getV = (pts: any[], tRatio: number) => { 
            if(pts.length===0) return 0; if(pts.length===1) return pts[0].v; 
            for(let i=0; i<pts.length-1; i++) {
                if(tRatio >= pts[i].t && tRatio <= pts[i+1].t) {
                     const ratio = (tRatio - pts[i].t) / (pts[i+1].t - pts[i].t);
                     return pts[i].v + (pts[i+1].v - pts[i].v) * ratio;
                }
            }
            if(tRatio < pts[0].t) return pts[0].v; return pts[pts.length-1].v;
        };

        if (tractSourceType === 'file' && tractSourceFileId) { 
            const f = files.find(f => f.id === tractSourceFileId); 
            if (f?.buffer) { const bufNode = offline.createBufferSource(); bufNode.buffer = f.buffer; bufNode.loop = larynxParams.loopOn; sNode = bufNode; } 
        }
        
        const pitchPts = getPts('pitch');
        if (!sNode) { 
            if (synthWaveform === 'noise') { 
                const noiseNode = offline.createBufferSource(); const nb = offline.createBuffer(1, len, sr); const nd = nb.getChannelData(0); 
                for(let i=0; i<len; i++) nd[i] = Math.random() * 2 - 1; noiseNode.buffer = nb; sNode = noiseNode;
            } else if (synthWaveform === 'complex') {
                const osc1 = offline.createOscillator(); osc1.type = 'sawtooth';
                const osc2 = offline.createOscillator(); osc2.type = 'square'; 
                const mixG = offline.createGain();
                const bal = pulseWidth; 
                const g1 = offline.createGain(); g1.gain.value = 1 - bal;
                const g2 = offline.createGain(); g2.gain.value = bal;
                osc1.connect(g1); g1.connect(mixG); osc2.connect(g2); g2.connect(mixG);
                if (pitchPts.length > 0) { 
                    osc1.frequency.setValueAtTime(pitchPts[0].v, 0); pitchPts.forEach(p => osc1.frequency.linearRampToValueAtTime(p.v, p.t * advDuration));
                    osc2.frequency.setValueAtTime(pitchPts[0].v, 0); pitchPts.forEach(p => osc2.frequency.linearRampToValueAtTime(p.v, p.t * advDuration));
                }
                osc1.start(0); osc2.start(0); sNode = mixG; 
            } else {
                const oscNode = offline.createOscillator(); oscNode.type = synthWaveform === 'square' ? 'square' : (synthWaveform as OscillatorType);
                if (pitchPts.length > 0) { oscNode.frequency.setValueAtTime(pitchPts[0].v, 0); pitchPts.forEach(p => oscNode.frequency.linearRampToValueAtTime(p.v, p.t * advDuration)); }
                sNode = oscNode;
            }
        }
        
        let nNode: AudioBufferSourceNode | undefined; 
        if (larynxParams.noiseSourceType === 'file' && larynxParams.noiseSourceFileId) { const f = files.find(f => f.id === larynxParams.noiseSourceFileId); if (f?.buffer) { nNode = offline.createBufferSource(); nNode.buffer = f.buffer; nNode.loop = larynxParams.loopOn; } }
        if (!nNode) { nNode = offline.createBufferSource(); const nb = offline.createBuffer(1, len, sr); const nd = nb.getChannelData(0); for(let i=0; i<len; i++) nd[i] = Math.random() * 2 - 1; nNode.buffer = nb; }
        
        const mG = offline.createGain(); const nG = offline.createGain(); const fG = offline.createGain(); 
        const nF = offline.createBiquadFilter(); nF.type = 'lowpass'; nF.frequency.value = 6000;
        nNode.connect(nF); nF.connect(nG); sNode.connect(mG); mG.connect(fG); nG.connect(fG);

        const tI=getPts('gain'), tB=getPts('breath');
        if (tI.length > 0) { mG.gain.setValueAtTime(tI[0].v, 0); tI.forEach(p => mG.gain.linearRampToValueAtTime(p.v, p.t * advDuration)); } else { mG.gain.value = 1; }
        if (tB.length > 0) { const baseGain = larynxParams.breathGain || 0.1; nG.gain.setValueAtTime(tB[0].v * baseGain, 0); tB.forEach(p => nG.gain.linearRampToValueAtTime(p.v * baseGain, p.t * advDuration)); }
        
        const startFade = Math.max(0, advDuration - fadeOutDuration); fG.gain.setValueAtTime(1, 0); fG.gain.setValueAtTime(1, startFade); fG.gain.linearRampToValueAtTime(0, advDuration);
        
        const f1=offline.createBiquadFilter(), f2=offline.createBiquadFilter(), f3=offline.createBiquadFilter(), nasF=offline.createBiquadFilter(); 
        [f1,f2,f3].forEach(f=>{ f.type='peaking'; f.Q.value=4; f.gain.value=12; }); nasF.type='lowpass';
        
        const tongueXPts=getPts('tongueX'), tongueYPts=getPts('tongueY'), lipsPts=getPts('lips'), throatPts=getPts('throat'), lipLenPts=getPts('lipLen'), nasalPts=getPts('nasal'), genderPts=getPts('gender');
        const steps = Math.ceil(advDuration * 60);
        for(let i=0; i<=steps; i++) {
            const tRatio = i/steps; const time = tRatio * advDuration;
            const x=getV(tongueXPts, tRatio), y=getV(tongueYPts, tRatio);
            const l=getV(lipsPts, tRatio), th=getV(throatPts, tRatio);
            const ln=getV(lipLenPts, tRatio), n=getV(nasalPts, tRatio);
            const gFactor=getV(genderPts, tRatio);
            const lF = 1.0 - (ln * 0.3); const lipF = 0.5 + (l * 0.5);
            const baseF1 = Math.max(50, (200 + (1 - y) * 600 - (th * 50))) * lF * lipF;
            const baseF2 = (800 + x * 1400) * lF * lipF;
            const baseF3 = (2000 + l * 1500) * lF;
            const baseNasal = Math.max(400, 10000 - (n * 9000));
            f1.frequency.linearRampToValueAtTime(baseF1 * gFactor, time); 
            f2.frequency.linearRampToValueAtTime(baseF2 * gFactor, time); 
            f3.frequency.linearRampToValueAtTime(baseF3 * gFactor, time); 
            f1.Q.linearRampToValueAtTime(2 + th * 4, time); 
            nasF.frequency.linearRampToValueAtTime(baseNasal * gFactor, time);
        }
        
        fG.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); 
        let lastNode: AudioNode = nasF;
        eqBands.forEach(b => { if(b.on) { const eq = offline.createBiquadFilter(); eq.type = b.type; eq.frequency.value = b.freq; eq.gain.value = b.gain; eq.Q.value = b.q; lastNode.connect(eq); lastNode = eq; } });
        lastNode.connect(offline.destination); if((sNode as any).start) (sNode as any).start(0); nNode.start(0); return await offline.startRendering();
    }, [audioContext, advDuration, advTracks, tractSourceType, tractSourceFileId, files, larynxParams, fadeOutDuration, synthWaveform, pulseWidth, eqBands]);

    useEffect(() => {
        if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = window.setTimeout(async () => {
            const buf = await renderAdvancedAudio();
            if (buf) { setPreviewBuffer(buf); lastRenderedRef.current = buf; }
        }, 300);
        return () => { if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current); };
    }, [renderAdvancedAudio]);

    const handleSimulationPlay = useCallback(async () => {
        if(isAdvPlaying) { 
            if(simPlaySourceRef.current) try { simPlaySourceRef.current.stop(); } catch(e) {}
            simPauseOffsetRef.current = audioContext.currentTime - simStartTimeRef.current; 
            if(animRef.current) cancelAnimationFrame(animRef.current); 
            setIsAdvPlaying(false); setIsPaused(true); 
        } else {
             const res = lastRenderedRef.current || await renderAdvancedAudio(); if(!res) return; lastRenderedRef.current = res;
             const s = audioContext.createBufferSource(); s.buffer = res; s.connect(audioContext.destination);
             const offset = isPaused ? simPauseOffsetRef.current : 0;
             let effectiveOffset = offset >= res.duration ? 0 : offset;
             s.start(0, effectiveOffset); simStartTimeRef.current = audioContext.currentTime - effectiveOffset;
             simPlaySourceRef.current = s; setIsAdvPlaying(true); isAdvPlayingRef.current = true; setIsPaused(false);
             const animate = () => { 
                 if(!isAdvPlayingRef.current) return;
                 const cur = audioContext.currentTime - simStartTimeRef.current;
                 const progress = Math.min(1, Math.max(0, cur / advDuration));
                 setPlayHeadPos(progress); syncVisualsToTime(progress);
                 if (cur < advDuration) animRef.current = requestAnimationFrame(animate); 
                 else { setIsAdvPlaying(false); setPlayHeadPos(0); simPauseOffsetRef.current = 0; syncVisualsToTime(0); } 
             };
             animRef.current = requestAnimationFrame(animate);
        }
    }, [isAdvPlaying, isPaused, renderAdvancedAudio, audioContext, advDuration, syncVisualsToTime]);

    const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
        if(!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); 
        const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
        const t = Math.max(0, Math.min(1, mx / rect.width));
        const track = advTracks.find(tr => tr.id === selectedTrackId);
        if (track) {
            const graphH = rect.height - RULER_HEIGHT;
            const hitIdx = track.points.findIndex(p => Math.hypot((p.t * rect.width)-mx, (RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * graphH)-my) < 15);
            if (e.button === 2) { 
                e.preventDefault(); if(hitIdx !== -1 && track.points.length > 2) { 
                    setAdvTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, points: t.points.filter((_, i) => i !== hitIdx) } : t)); commitChange("포인트 삭제"); 
                } return; 
            }
            if (hitIdx !== -1) { setDraggingKeyframe({ trackId: selectedTrackId, index: hitIdx }); return; }
            if (clickToAdd && my >= RULER_HEIGHT) {
                const val = track.min + ((1 - ((my - RULER_HEIGHT) / graphH)) * (track.max - track.min)); 
                const nPts = [...track.points, { t, v: val }].sort((a, b) => a.t - b.t); 
                setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: nPts } : tr)); 
                const newIndex = nPts.findIndex(p => p.t === t && p.v === val);
                setDraggingKeyframe({ trackId: selectedTrackId, index: newIndex }); commitChange("포인트 추가"); return;
            }
        }
        if (my < RULER_HEIGHT || !clickToAdd) { 
            setPlayHeadPos(t); syncVisualsToTime(t);
            simPauseOffsetRef.current = t * (lastRenderedRef.current?.duration || advDuration); 
            if(isAdvPlaying) { if(simPlaySourceRef.current) try { simPlaySourceRef.current.stop(); } catch(e) {} if(animRef.current) cancelAnimationFrame(animRef.current); setIsAdvPlaying(false); setIsPaused(true); } 
            setDraggingKeyframe({ isPlayhead: true }); return; 
        }
    }, [selectedTrackId, advTracks, clickToAdd, isAdvPlaying, advDuration, syncVisualsToTime, commitChange]);

    const handleTimelineMouseMove = useCallback((e: React.MouseEvent) => {
        if(!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); const mx = e.clientX - rect.left; const my = e.clientY - rect.top; const t = Math.max(0, Math.min(1, mx / rect.width));
        if (!draggingKeyframe) { 
            const track = advTracks.find(tr => tr.id === selectedTrackId); if(!track) return; 
            const graphH = rect.height - RULER_HEIGHT;
            const hitIdx = track.points.findIndex(p => Math.hypot((p.t * rect.width)-mx, (RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * graphH)-my) < 15); 
            setHoveredKeyframe(hitIdx !== -1 ? { trackId: selectedTrackId, index: hitIdx } : null); return; 
        }
        if (draggingKeyframe.isPlayhead) { setPlayHeadPos(t); syncVisualsToTime(t); } 
        else if (draggingKeyframe.trackId && draggingKeyframe.index !== undefined) { 
            const gH = rect.height - RULER_HEIGHT; const nV = Math.max(0, Math.min(1, 1 - ((my - RULER_HEIGHT) / gH))); 
            const draggingIdx = draggingKeyframe.index;
            setAdvTracks(prev => prev.map(tr => {
                if (tr.id !== draggingKeyframe.trackId) return tr;
                const valActual = tr.min + (nV * (tr.max - tr.min));
                return { ...tr, points: tr.points.map((p, i) => i === draggingIdx ? { t, v: valActual } : p).sort((a,b)=>a.t-b.t) }; 
            }));
        }
    }, [draggingKeyframe, selectedTrackId, advTracks, syncVisualsToTime]);

    useEffect(() => {
        if(!canvasRef.current) return; const ctx = canvasRef.current.getContext('2d'); if(!ctx) return; const w = canvasRef.current.width, h = canvasRef.current.height;
        const track = advTracks.find(t => t.id === selectedTrackId);
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#f8f8f6'; ctx.fillRect(0, RULER_HEIGHT, w, h - RULER_HEIGHT); ctx.strokeStyle = '#d1d1cf'; ctx.lineWidth = 1; ctx.beginPath(); for(let i=0; i<=10; i++) { const x = (i/10)*w; ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, h); } ctx.stroke();
        
        if (previewBuffer && !showEQ) {
            ctx.save(); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
            const data = previewBuffer.getChannelData(0); const step = Math.ceil(data.length / w);
            const waveH = h - RULER_HEIGHT; const amp = waveH / 2; const center = RULER_HEIGHT + amp;
            for (let i = 0; i < w; i++) {
                let minVal = 1.0, maxVal = -1.0;
                for (let j = 0; j < step; j++) { const d = data[i * step + j] || 0; if (d < minVal) minVal = d; if (d > maxVal) maxVal = d; }
                ctx.moveTo(i, center + minVal * amp); ctx.lineTo(i, center + maxVal * amp);
            }
            ctx.stroke(); ctx.restore();
        }

        if (track) { ctx.beginPath(); ctx.strokeStyle = track.color; ctx.lineWidth = 2.5; track.points.forEach((p, i) => { const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); track.points.forEach((p, i) => { const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); const isH = hoveredKeyframe && hoveredKeyframe.index === i; ctx.fillStyle = isH ? '#1f1e1d' : track.color; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill(); }); }
        const px = playHeadPos * w; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px,0); ctx.lineTo(px,h); ctx.stroke();
    }, [selectedTrackId, advTracks, playHeadPos, hoveredKeyframe, previewBuffer, showEQ]);

    const getCurrentValue = (trackId: string) => {
        const track = advTracks.find(t => t.id === trackId); if (!track) return 0;
        let val = track.points[0].v;
        for(let i=0; i<track.points.length-1; i++) { if(playHeadPos >= track.points[i].t && playHeadPos <= track.points[i+1].t) { const ratio = (playHeadPos - track.points[i].t) / (track.points[i+1].t - track.points[i].t); val = track.points[i].v + (track.points[i+1].v - track.points[i].v) * ratio; break; } }
        if(playHeadPos > track.points[track.points.length-1].t) val = track.points[track.points.length-1].v; return val;
    };

    const getTonguePath = () => {
      const bx = 220, by = 350;
      const cp1x = bx + liveTract.x * 120, cp1y = by - 20 - liveTract.y * 140;
      const endX = bx + 30 + liveTract.x * 90, endY = by - 120 + liveTract.y * 60;
      return `M ${bx} ${by} Q ${cp1x} ${cp1y} ${endX} ${endY}`;
    };

    const ParamInput = ({ label, value, min, max, step, onChange, colorClass }: any) => (
      <div className="space-y-1.5 font-sans font-bold">
        <div className={`flex justify-between font-bold items-center ${colorClass || 'text-slate-500'}`}>
          <span className="text-[10px] uppercase tracking-tighter">{label}</span>
          <input type="number" value={typeof value === 'number' ? parseFloat(value.toFixed(3)) : value} step={step} 
            onChange={e => { const v = parseFloat(e.target.value); if(!isNaN(v)) onChange(Math.max(min, Math.min(max, v))); }}
            className="w-16 bg-white/60 border border-slate-200 rounded px-1 text-right text-[10px] outline-none font-mono py-0.5" />
        </div>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} 
          className={`w-full h-1.5 bg-slate-300 appearance-none rounded-full cursor-pointer ${colorClass ? 'accent-' + colorClass.split('-')[1] + '-' + colorClass.split('-')[2] : 'accent-slate-500'}`} />
      </div>
    );

    return (
        <div className="flex-1 flex flex-col p-3 gap-4 animate-in fade-in font-sans font-bold" onMouseUp={() => { if(draggingKeyframe) commitChange(); setDraggingKeyframe(null); }}>
            <div className="flex-[2] flex gap-4 shrink-0 font-sans">
                <div className="flex-1 bg-white/60 rounded-3xl border border-slate-300 flex flex-col relative overflow-hidden shadow-sm lg:aspect-auto">
                    <div className="flex-1 relative flex items-center justify-center p-8 font-sans overflow-hidden">
                        <div className="relative w-full h-full transition-all duration-300">
                            <svg viewBox="100 50 280 340" className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-sm">
                                <path d="M 120 380 L 120 280 Q 120 180 160 120 Q 200 60 280 60 Q 340 60 360 100 L 360 150 L 370 170 L 360 190 Q 340 190 340 220 Q 340 250 310 280 L 250 300 L 120 380" 
                                    fill="#fdfdfb" stroke="#cbd5e1" strokeWidth="3" strokeLinejoin="round" />
                                <path d={`M 220 380 L 220 250`} stroke="#e2e8f0" strokeWidth={30 + (1-liveTract.throat) * 40} strokeLinecap="butt" opacity="0.8"/>
                                <path d="M 330 160 L 260 160 Q 220 160 220 200" stroke="#64748b" strokeWidth="4" fill="none" strokeLinecap="round"/>
                                <g>
                                    <path d={`M 260 160 Q 290 ${160 + liveTract.nasal * 40} 310 ${160 + liveTract.nasal * 40}`} 
                                          stroke="#fbbf24" strokeWidth="4" fill="none" strokeLinecap="round" className="transition-all duration-75"/>
                                    <path d={`M 260 150 Q 290 ${150 + liveTract.nasal * 40} 310 ${150 + liveTract.nasal * 40} L 310 ${170 + liveTract.nasal * 40} Q 290 ${170 + liveTract.nasal * 40} 260 170 Z`} 
                                          fill="transparent" stroke="transparent" className="cursor-ns-resize pointer-events-auto hover:fill-yellow-400/20" onMouseDown={handleVelumMouseDown} />
                                    <text x="235" y="145" className="text-[10px] font-bold fill-amber-500 opacity-80 select-none pointer-events-none font-sans">연구개 (Velum)</text>
                                </g>
                                <path d={getTonguePath()} stroke="#f43f5e" strokeWidth={25 + liveTract.throat * 5} strokeLinecap="round" fill="none" className="transition-all duration-75"/>
                                <g transform={`translate(${330 + liveTract.lipLen * 20}, 200)`}>
                                    <path d={`M 0 -5 Q 10 ${-5 - liveTract.lips * 15} 20 -5`} stroke="#fda4af" strokeWidth="6" fill="none" strokeLinecap="round" />
                                    <path d={`M 0 5 Q 10 ${5 + liveTract.lips * 15} 20 5`} stroke="#fda4af" strokeWidth="6" fill="none" strokeLinecap="round" />
                                </g>
                                <path d="M 220 360 L 220 320" stroke="#bae6fd" strokeWidth="2" strokeDasharray="4,4" className="animate-pulse"/>
                            </svg>
                            <div className="absolute inset-0 z-20 pointer-events-none">
                                <div className="absolute left-[20%] top-[40%] bottom-[10%] right-[15%] bg-rose-500/0 hover:bg-rose-500/5 rounded-full cursor-crosshair transition-colors flex items-center justify-center group pointer-events-auto" onMouseDown={handleTractMouseDown} >
                                    <span className="text-[10px] text-rose-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity select-none bg-white/90 border border-rose-100 px-2 py-1 rounded shadow-sm">혀 (Tongue)</span>
                                </div>
                                <div className="absolute right-[0%] top-[40%] bottom-[40%] w-[25%] bg-emerald-500/0 hover:bg-emerald-500/5 rounded-xl cursor-move transition-colors flex flex-col items-center justify-center group pointer-events-auto" onMouseDown={handleLipPadMouseDown} >
                                    <MoveHorizontal className="w-6 h-6 text-emerald-400 mb-0.5 opacity-50 group-hover:opacity-100"/>
                                    <span className="text-[9px] text-emerald-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity select-none bg-white/90 border border-emerald-100 px-1.5 py-0.5 rounded shadow-sm">입술 (Lips)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-3 px-6 bg-white/80 border-t flex justify-between items-center shrink-0 font-sans">
                        <button onClick={()=>{const t=playHeadPos; setAdvTracks(prev=>prev.map(tr=>{if(tr.group!=='adj' && tr.id !== 'pitch' && tr.id !== 'gender') return tr; let val=null; if(tr.id==='tongueX')val=liveTract.x;else if(tr.id==='tongueY')val=liveTract.y;else if(tr.id==='lips')val=liveTract.lips;else if(tr.id==='lipLen')val=liveTract.lipLen;else if(tr.id==='throat')val=liveTract.throat;else if(tr.id==='nasal')val=liveTract.nasal; else if(tr.id==='pitch')val=manualPitch; else if(tr.id==='gender')val=manualGender; if(val===null)return tr;return{...tr,points:[...tr.points.filter(p=>Math.abs(p.t-t)>0.005),{t,v:val}].sort((a,b)=>a.t-b.t)};})); commitChange("키프레임 기록");}} className="bg-[#209ad6] hover:bg-[#1a85b9] text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 active:scale-95 transition-all font-sans font-bold shadow-md shadow-blue-100"><CircleDot className="w-4 h-4"/> 기록 (Record)</button>
                        <div className="flex gap-2 font-black uppercase text-xs font-bold">
                            <button onClick={handleSimulationPlay} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-slate-700 transition-colors">
                                {isAdvPlaying ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>} {isAdvPlaying ? '일시정지' : '재생'}
                            </button>
                            <button onClick={async()=>{ const res = await renderAdvancedAudio(); if(res) onAddToRack(res, "시뮬레이션_" + simIndex); setSimIndex(si => si + 1); }} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg transition-colors font-bold font-sans hover:border-slate-400">
                                보관함에 저장
                            </button>
                        </div>
                    </div>
                </div>
                <div className="w-80 bg-white/40 rounded-2xl border border-slate-300 p-5 flex flex-col gap-4 overflow-y-auto shrink-0 custom-scrollbar font-sans font-bold">
                    <div className="flex items-center justify-between">
                        <h3 className="font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 text-xs font-bold font-sans"><Sliders size={20} className="text-[#209ad6]"/> 설정</h3>
                        <div className="flex items-center gap-1">
                            <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30 transition-all"><Undo2 size={16}/></button>
                            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30 transition-all"><Redo2 size={16}/></button>
                            <div className="relative">
                                <button onClick={()=>setShowHistory(!showHistory)} className={`p-1.5 rounded text-slate-600 transition-all ${showHistory ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-white'}`}><History size={16}/></button>
                                {showHistory && <div className="absolute top-8 right-0 bg-white border border-slate-200 rounded-lg shadow-xl w-48 z-50 p-2 text-xs">
                                    <h4 className="font-black text-slate-400 px-2 py-1 uppercase text-[10px]">History</h4>
                                    <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                                        {history.length === 0 && <div className="p-2 text-slate-400 italic">내역 없음</div>}
                                        {history.slice().reverse().map((h, i) => { const realIdx = history.length - 1 - i; return ( <div key={realIdx} onClick={()=>{restoreState(h.state); setHistoryIndex(realIdx);}} className={`p-2 hover:bg-slate-50 rounded flex justify-between cursor-pointer ${realIdx === historyIndex ? 'bg-indigo-50 font-bold text-indigo-600' : ''}`}> <span>{h.label}</span> </div> ); })}
                                    </div>
                                </div>}
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4" onMouseUp={()=>commitChange()}>
                        <div className="space-y-2 font-sans font-bold font-black uppercase"><span className="text-[10px] text-slate-500 font-bold">음원 소스 (Base)</span><select value={tractSourceType} onChange={e=>setTractSourceType(e.target.value)} className="w-full bg-white border border-slate-200 rounded p-2 outline-none font-bold text-[10px]"><option value="synth">기본 신디사이저</option><option value="file">보관함 파일</option></select></div>
                        {tractSourceType==='synth' && (
                          <div className="space-y-4 font-sans font-bold">
                            <div className="grid grid-cols-2 gap-2">
                              {['sawtooth', 'sine', 'square', 'complex', 'noise'].map(t=>(<button key={t} onClick={()=>setSynthWaveform(t)} className={`py-2 rounded border text-[10px] font-black ${synthWaveform===t?'bg-indigo-500 text-white border-indigo-500':'bg-white text-slate-500'}`}>{t.toUpperCase()}</button>))}
                            </div>
                            <ParamInput label="Pulse Width" value={pulseWidth} min={0.05} max={0.95} step={0.01} onChange={setPulseWidth} colorClass="text-indigo-600" />
                            <ParamInput label="Pitch (수동)" value={manualPitch} min={50} max={600} step={1} onChange={setManualPitch} colorClass="text-amber-500" />
                          </div>
                        )}
                        {tractSourceType==='file' && <select value={tractSourceFileId} onChange={e=>setTractSourceFileId(e.target.value)} className="w-full bg-white border border-slate-200 rounded p-2 text-[10px]">{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>}
                        <ParamInput label="Gender (Shift)" value={manualGender} min={0.5} max={2.0} step={0.01} onChange={setManualGender} colorClass="text-pink-500" />
                        <div className="h-px bg-slate-200 my-2"></div>
                        {[ {id:'lips', label:'입술 열기', color:'text-pink-400'}, {id:'lipLen', label:'입술 길이', color:'text-pink-600'}, {id:'throat', label:'목 조임', color:'text-purple-400'}, {id:'nasal', label:'비성 (콧소리)', color:'text-orange-400'} ].map(p => (
                            <ParamInput key={p.id} label={p.label} value={(liveTract as any)[p.id]} min={0} max={1} step={0.01} 
                              onChange={(v: number) => { const n = {...liveTract, [p.id]: v}; setLiveTract(n); updateLiveAudio(n.x, n.y, n.lips, n.throat, n.lipLen, n.nasal, manualPitch, manualGender); }} 
                              colorClass={p.color} />
                        ))}
                        <ParamInput label="숨소리 (Breath)" value={larynxParams.breathGain} min={0} max={1} step={0.01} onChange={(v: number) => setLarynxParams(p=>({...p, breathGain: v}))} colorClass="text-cyan-400" />
                        <div className="space-y-2 font-sans font-bold font-black uppercase"><span className="text-[10px] text-slate-500 font-bold">노이즈 소스 (Noise)</span><select value={larynxParams.noiseSourceType} onChange={e=>setLarynxParams({...larynxParams, noiseSourceType:e.target.value})} className="w-full bg-white border border-slate-200 rounded p-2 outline-none font-bold text-[10px]"><option value="generated">기본 화이트 노이즈</option><option value="file">보관함 파일</option></select></div>
                        {larynxParams.noiseSourceType==='file' && <select value={larynxParams.noiseSourceFileId} onChange={e=>setLarynxParams({...larynxParams, noiseSourceFileId:e.target.value})} className="w-full bg-white border border-slate-200 rounded p-2 text-[10px] mt-1">{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>}
                    </div>
                </div>
            </div>
            <div className="min-h-[320px] flex flex-col gap-3 bg-white/40 rounded-2xl border border-slate-300 p-3 shadow-sm relative shrink-0 font-sans font-bold mb-6">
                 <div className="flex items-center justify-between gap-2 pb-0.5 px-1 font-sans font-bold">
                    <div className="flex gap-2 overflow-x-auto custom-scrollbar font-sans font-bold">
                        {advTracks.map(t=><button key={t.id} onClick={()=>setSelectedTrackId(t.id)} className={`px-3 py-1.5 text-xs font-black border rounded-full transition whitespace-nowrap shadow-xs font-sans font-bold ${selectedTrackId===t.id?'bg-[#209ad6] text-white border-[#209ad6]':'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>{t.name}</button>)}
                    </div>
                    <div className="flex gap-2 font-sans font-bold">
                        <button onClick={()=>setShowEQ(!showEQ)} title="Toggle EQ" className={`p-1.5 rounded bg-white border border-slate-200 transition-colors ${showEQ ? 'text-pink-600 border-pink-200' : 'text-slate-400 hover:text-slate-600'}`}><AudioLines size={16}/></button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={()=>{ setAdvTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, points: [{t:0, v:t.id === 'pitch' ? 220 : (t.id === 'gender' ? 1 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5)))}, {t:1, v:t.id === 'pitch' ? 220 : (t.id === 'gender' ? 1 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5)))}] } : t)); commitChange("트랙 초기화");}} title="항목 초기화" className="p-1.5 rounded bg-white border border-slate-200 text-slate-400 hover:text-orange-500 transition-colors"><RotateCcw size={16}/></button>
                        <button onClick={()=>{ setAdvTracks(prev => prev.map(t => ({ ...t, points: [{t:0, v:t.id === 'pitch' ? 220 : (t.id === 'gender' ? 1 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5)))}, {t:1, v:t.id === 'pitch' ? 220 : (t.id === 'gender' ? 1 : (t.id === 'gain' ? 1 : (t.id === 'breath' ? 0.01 : 0.5)))}] }))); commitChange("전체 초기화");}} title="전체 초기화" className="p-1.5 rounded bg-white border border-slate-200 text-slate-400 hover:text-red-500 transition-colors font-bold uppercase"><RefreshCw size={16} className="stroke-[3]"/></button>
                        <button onClick={()=>setClickToAdd(!clickToAdd)} className={`p-1.5 rounded-lg border transition-all shadow-sm shrink-0 ${clickToAdd ? 'bg-[#209ad6] text-white border-[#209ad6]' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'}`}><MousePointer2 size={18}/></button>
                    </div>
                </div>
                <div className="h-[220px] flex relative min-h-0">
                    <div className={`flex-1 bg-white rounded-xl border border-slate-200 relative overflow-hidden shadow-inner font-sans font-bold ${showEQ ? 'hidden' : 'block'}`}>
                        <canvas ref={canvasRef} width={1000} height={220} className="w-full h-full block cursor-crosshair" onMouseDown={handleTimelineMouseDown} 
                            onMouseMove={handleTimelineMouseMove} onMouseUp={() => { if(draggingKeyframe) commitChange("키프레임 이동"); setDraggingKeyframe(null); }} onContextMenu={e=>e.preventDefault()}/>
                        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 shadow-sm pointer-events-none flex items-center gap-3">
                            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse"></span> <span className="font-mono">{playHeadPos.toFixed(3)}s</span></div>
                            <div className="w-px h-3 bg-slate-300"></div>
                            <div className="flex items-center gap-1 text-amber-600"><span className="text-[10px] uppercase">Pitch</span> <span className="font-mono">{Math.round(getCurrentValue('pitch'))} Hz</span></div>
                            <div className="w-px h-3 bg-slate-300"></div>
                            <div className="flex items-center gap-1 text-pink-500"><span className="text-[10px] uppercase">Gender</span> <span className="font-mono">x{getCurrentValue('gender').toFixed(2)}</span></div>
                        </div>
                    </div>
                    {showEQ && (
                        <div className="flex-1 animate-in fade-in bg-[#0f172a] rounded-xl border border-slate-700 shadow-inner p-3 overflow-hidden">
                            <ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={simPlaySourceRef.current} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdvancedTractTab;
