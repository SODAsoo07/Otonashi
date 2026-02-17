
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MoveHorizontal, CircleDot, Pause, Play, Sliders, RotateCcw, RefreshCw, MousePointer2, Undo2, Redo2, History, AudioLines, GripVertical, Settings2, PencilLine } from 'lucide-react';
import { AudioFile, AdvTrack, LarynxParams, LiveTractState, EQBand } from '../types';
import { RULER_HEIGHT } from '../utils/audioUtils';
import ParametricEQ from './ParametricEQ';
import { useLanguage } from '../contexts/LanguageContext';

interface AdvancedTractTabProps {
  audioContext: AudioContext;
  files: AudioFile[];
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
  isActive: boolean;
}

type DragType = 'tongue' | 'lips' | 'nasal' | null;

const AdvancedTractTab: React.FC<AdvancedTractTabProps> = ({ audioContext, files, onAddToRack, isActive }) => {
    const { t } = useLanguage();
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
    
    const [isEditMode, setIsEditMode] = useState(false);
    const [dragType, setDragType] = useState<DragType>(null);
    
    const [selectedTrackId, setSelectedTrackId] = useState('pitch'); 
    const [hoveredKeyframe, setHoveredKeyframe] = useState<{trackId: string, index: number} | null>(null);
    const [draggingKeyframe, setDraggingKeyframe] = useState<{trackId?: string, index?: number, isPlayhead?: boolean} | null>(null);
    
    const [sidebarWidth, setSidebarWidth] = useState(420);
    const [isResizing, setIsResizing] = useState(false);
    const [previewBuffer, setPreviewBuffer] = useState<AudioBuffer | null>(null);
    const [sidebarTab, setSidebarTab] = useState<'settings' | 'eq'>('settings');

    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 80, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'lowshelf', freq: 200, gain: 0, q: 0.7, on: true },
        { id: 3, type: 'peaking', freq: 1500, gain: 0, q: 1.0, on: true },
        { id: 4, type: 'highshelf', freq: 6000, gain: 0, q: 0.7, on: true },
        { id: 5, type: 'lowpass', freq: 15000, gain: 0, q: 0.7, on: true }
    ]);

    const [advTracks, setAdvTracks] = useState<AdvTrack[]>([
        { id: 'tongueX', name: t.simulator.tracks.tongueX, group: 'adj', color: '#60a5fa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'tongueY', name: t.simulator.tracks.tongueY, group: 'adj', color: '#4ade80', points: [{t:0, v:0.4}, {t:1, v:0.4}], min:0, max:1 },
        { id: 'lips',    name: t.simulator.tracks.lips, group: 'adj', color: '#f472b6', points: [{t:0, v:0.7}, {t:1, v:0.7}], min:0, max:1 },
        { id: 'lipLen',  name: t.simulator.tracks.lipLen, group: 'adj', color: '#db2777', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 }, 
        { id: 'throat',  name: t.simulator.tracks.throat,   group: 'adj', color: '#a78bfa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1 },
        { id: 'nasal',   name: t.simulator.tracks.nasal, group: 'adj', color: '#fb923c', points: [{t:0, v:0.2}, {t:1, v:0.2}], min:0, max:1 },
        { id: 'pitch',   name: t.simulator.tracks.pitch, group: 'edit', color: '#fbbf24', points: [{t:0, v:220}, {t:1, v:220}], min:50, max:600 },
        { id: 'gender',  name: t.simulator.tracks.gender, group: 'edit', color: '#ec4899', points: [{t:0, v:1}, {t:1, v:1}], min:0.5, max:2.0 },
        { id: 'gain',    name: t.simulator.tracks.gain, group: 'edit', color: '#ef4444', points: [{t:0, v:0}, {t:0.1, v:1}, {t:0.9, v:1}, {t:1, v:0}], min:0, max:1.5 },
        { id: 'breath',  name: t.simulator.tracks.breath,     group: 'edit', color: '#22d3ee', points: [{t:0, v:0.01}, {t:1, v:0.01}], min:0, max:0.1 }
    ]);

    // 언어 변경 시 트랙 이름 업데이트
    useEffect(() => {
        setAdvTracks(prev => prev.map(track => {
            let newName = track.name;
            switch(track.id) {
                case 'tongueX': newName = t.simulator.tracks.tongueX; break;
                case 'tongueY': newName = t.simulator.tracks.tongueY; break;
                case 'lips': newName = t.simulator.tracks.lips; break;
                case 'lipLen': newName = t.simulator.tracks.lipLen; break;
                case 'throat': newName = t.simulator.tracks.throat; break;
                case 'nasal': newName = t.simulator.tracks.nasal; break;
                case 'pitch': newName = t.simulator.tracks.pitch; break;
                case 'gender': newName = t.simulator.tracks.gender; break;
                case 'gain': newName = t.simulator.tracks.gain; break;
                case 'breath': newName = t.simulator.tracks.breath; break;
            }
            return { ...track, name: newName };
        }));
    }, [t]);
    
    // --- History ---
    const [undoStack, setUndoStack] = useState<any[]>([]);
    const [redoStack, setRedoStack] = useState<any[]>([]);

    const isAdvPlayingRef = useRef(false);
    const liveAudioRef = useRef<any>(null); 
    const animRef = useRef<number | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lastRenderedRef = useRef<AudioBuffer | null>(null);
    const simStartTimeRef = useRef(0);
    const simPauseOffsetRef = useRef(0);
    const simPlaySourceRef = useRef<AudioBufferSourceNode | null>(null);
    const previewDebounceRef = useRef<number | null>(null);

    useEffect(() => { isAdvPlayingRef.current = isAdvPlaying; }, [isAdvPlaying]);

    const getCurrentState = useCallback(() => ({
        larynxParams, tractSourceType, tractSourceFileId, synthWaveform, pulseWidth, liveTract, advTracks, manualPitch, manualGender, eqBands
    }), [larynxParams, tractSourceType, tractSourceFileId, synthWaveform, pulseWidth, liveTract, advTracks, manualPitch, manualGender, eqBands]);

    const commitChange = useCallback((label: string = "변경") => {
        const state = getCurrentState();
        setUndoStack(prev => [...prev.slice(-19), state]);
        setRedoStack([]);
    }, [getCurrentState]);

    const restoreState = (state: any) => {
        setLarynxParams(state.larynxParams); setTractSourceType(state.tractSourceType); setTractSourceFileId(state.tractSourceFileId);
        setSynthWaveform(state.synthWaveform); setPulseWidth(state.pulseWidth); setLiveTract(state.liveTract); setAdvTracks(state.advTracks);
        setManualPitch(state.manualPitch || 220); setManualGender(state.manualGender || 1.0); if(state.eqBands) setEqBands(state.eqBands);
    };

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;
        const currentState = getCurrentState();
        const prevState = undoStack[undoStack.length - 1];
        setRedoStack(prev => [...prev, currentState]);
        setUndoStack(prev => prev.slice(0, -1));
        restoreState(prevState);
    }, [undoStack, getCurrentState]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const currentState = getCurrentState();
        const nextState = redoStack[redoStack.length - 1];
        setUndoStack(prev => [...prev, currentState]);
        setRedoStack(prev => prev.slice(0, -1));
        restoreState(nextState);
    }, [redoStack, getCurrentState]);

    const getValueAtTime = useCallback((trackId: string, t: number) => {
        const track = advTracks.find(tr => tr.id === trackId);
        if (!track) return 0;
        const pts = track.points;
        if(t <= pts[0].t) return pts[0].v;
        if(t >= pts[pts.length-1].t) return pts[pts.length-1].v;
        for(let i=0; i<pts.length-1; i++) {
            if(t >= pts[i].t && t <= pts[i+1].t) {
                const ratio = (t - pts[i].t) / (pts[i+1].t - pts[i].t);
                return pts[i].v + (pts[i+1].v - pts[i].v) * ratio;
            }
        }
        return pts[0].v;
    }, [advTracks]);

    const updateLiveAudio = useCallback((x: number, y: number, l: number, t: number, len: number, n: number, pitch: number, gender: number) => { 
        if (!liveAudioRef.current || !audioContext) return;
        const now = audioContext.currentTime; const { f1, f2, f3, nasF, sNode } = liveAudioRef.current;
        const lF = 1.0 - (len * 0.3); const liF = 0.5 + (l * 0.5);
        let fr1 = (200 + (1 - y) * 600 - (t * 50)) * lF * liF; 
        let fr2 = (800 + x * 1400) * lF * liF; 
        let fr3 = (2000 + l * 1500) * lF;
        fr1 *= gender; fr2 *= gender; fr3 *= gender;
        const timeConst = 0.015; // 더 부드러운 오디오 전환을 위해 타임 컨스턴트 적용
        if(f1) f1.frequency.setTargetAtTime(Math.max(50, fr1), now, timeConst); 
        if(f2) f2.frequency.setTargetAtTime(fr2, now, timeConst); 
        if(f3) f3.frequency.setTargetAtTime(fr3, now, timeConst); 
        if(nasF) nasF.frequency.setTargetAtTime(Math.max(400, (10000 - (n * 9000)) * gender), now, timeConst);
        if(sNode instanceof OscillatorNode) sNode.frequency.setTargetAtTime(pitch, now, timeConst);
    }, [audioContext]);

    const syncVisualsToTime = useCallback((t: number) => {
        const vals = ['tongueX', 'tongueY', 'lips', 'lipLen', 'throat', 'nasal', 'pitch', 'gender'].reduce((acc, id) => ({...acc, [id]: getValueAtTime(id, t)}), {} as any);
        setLiveTract({ x: vals.tongueX, y: vals.tongueY, lips: vals.lips, lipLen: vals.lipLen, throat: vals.throat, nasal: vals.nasal });
        setManualPitch(vals.pitch); setManualGender(vals.gender);
        updateLiveAudio(vals.tongueX, vals.tongueY, vals.lips, vals.throat, vals.lipLen, vals.nasal, vals.pitch, vals.gender);
    }, [getValueAtTime, updateLiveAudio]);

    const startLivePreview = useCallback(() => {
        if (!audioContext || liveAudioRef.current) return;
        let sNode: any;
        if (tractSourceType === 'file' && tractSourceFileId) { 
            const f = files.find(f => f.id === tractSourceFileId); 
            if (f?.buffer) { sNode = audioContext.createBufferSource(); sNode.buffer = f.buffer; sNode.loop = larynxParams.loopOn; } 
        }
        if (!sNode) { sNode = audioContext.createOscillator(); sNode.type = (synthWaveform === 'noise' || synthWaveform === 'complex') ? 'sawtooth' : (synthWaveform as OscillatorType); sNode.frequency.value = manualPitch; }
        const g = audioContext.createGain(); g.gain.value = 0.5;
        const f1 = audioContext.createBiquadFilter(); f1.type = 'peaking'; f1.Q.value = 4; f1.gain.value = 12;
        const f2 = audioContext.createBiquadFilter(); f2.type = 'peaking'; f2.Q.value = 4; f2.gain.value = 12;
        const f3 = audioContext.createBiquadFilter(); f3.type = 'peaking'; f3.Q.value = 4; f3.gain.value = 10;
        const nasF = audioContext.createBiquadFilter(); nasF.type = 'lowpass';
        let lastNode: AudioNode = nasF;
        eqBands.forEach(b => { if(b.on) { 
            const eq = audioContext.createBiquadFilter(); eq.type = b.type; eq.frequency.value = b.freq; eq.gain.value = b.gain; eq.Q.value = b.q;
            lastNode.connect(eq); lastNode = eq; 
        } });
        sNode.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); lastNode.connect(g); g.connect(audioContext.destination);
        sNode.start(); liveAudioRef.current = { sNode, f1, f2, f3, nasF };
    }, [audioContext, tractSourceType, tractSourceFileId, files, larynxParams, synthWaveform, manualPitch, eqBands]);

    const stopLivePreview = useCallback(() => { if (liveAudioRef.current) { try { liveAudioRef.current.sNode.stop(); } catch(e) {} liveAudioRef.current = null; } }, []);

    const handleTractMouseDown = useCallback((e: React.MouseEvent, type: DragType) => {
        const rect = e.currentTarget.closest('svg')!.getBoundingClientRect();
        setDragType(type);
        startLivePreview();

        const update = (ce: MouseEvent) => {
            const relX = (ce.clientX - rect.left) / rect.width;
            const relY = (ce.clientY - rect.top) / rect.height;

            requestAnimationFrame(() => {
                setLiveTract(prev => {
                    let next = { ...prev };
                    if (type === 'tongue') {
                        next.x = Math.max(0, Math.min(1, (relX - 0.2) / 0.5));
                        next.y = Math.max(0, Math.min(1, 1 - (relY - 0.3) / 0.6));
                    } else if (type === 'lips') {
                        next.lips = Math.max(0, Math.min(1, 1 - (relY - 0.2) / 0.4));
                        next.lipLen = Math.max(0, Math.min(1, (relX - 0.7) / 0.2));
                    } else if (type === 'nasal') {
                        next.nasal = Math.max(0, Math.min(1, (relY - 0.2) / 0.3));
                    }
                    updateLiveAudio(next.x, next.y, next.lips, next.throat, next.lipLen, next.nasal, manualPitch, manualGender);
                    return next;
                });
            });
        };

        const onMouseMove = (me: MouseEvent) => update(me);
        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            setDragType(null);
            stopLivePreview();
            commitChange("제스처 조작");
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [startLivePreview, stopLivePreview, updateLiveAudio, manualPitch, manualGender, commitChange]);

    const renderAdvancedAudio = useCallback(async () => {
        if (!audioContext) return null;
        const sr = audioContext.sampleRate; const lenSamples = Math.max(1, Math.floor(sr * advDuration)); const offline = new OfflineAudioContext(1, lenSamples, sr);
        const getV = (id: string, t: number) => getValueAtTime(id, t);
        let sNode: AudioNode;
        if (tractSourceType === 'file' && tractSourceFileId) { 
            const f = files.find(f => f.id === tractSourceFileId); 
            if (f?.buffer) { const b = offline.createBufferSource(); b.buffer = f.buffer; b.loop = larynxParams.loopOn; sNode = b; } else sNode = offline.createOscillator();
        } else {
            const osc = offline.createOscillator(); osc.type = (synthWaveform === 'noise' || synthWaveform === 'complex') ? 'sawtooth' : (synthWaveform as any);
            const pitchPts = advTracks.find(t=>t.id==='pitch')?.points || [];
            if(pitchPts.length) {
                osc.frequency.setValueAtTime(pitchPts[0].v, 0); pitchPts.forEach(p => osc.frequency.linearRampToValueAtTime(p.v, p.t * advDuration));
            }
            sNode = osc;
        }
        const mG = offline.createGain(); const fG = offline.createGain(); 
        const gainPts = advTracks.find(t=>t.id==='gain')?.points || [];
        if(gainPts.length) { mG.gain.setValueAtTime(gainPts[0].v, 0); gainPts.forEach(p => mG.gain.linearRampToValueAtTime(p.v, p.t * advDuration)); }
        const startFade = Math.max(0, advDuration - fadeOutDuration); fG.gain.setValueAtTime(1, 0); fG.gain.setValueAtTime(1, startFade); fG.gain.linearRampToValueAtTime(0, advDuration);
        const f1=offline.createBiquadFilter(), f2=offline.createBiquadFilter(), f3=offline.createBiquadFilter(), nasF=offline.createBiquadFilter(); 
        [f1,f2,f3].forEach(f=>{ f.type='peaking'; f.Q.value=4; f.gain.value=12; }); nasF.type='lowpass';
        const steps = 60; for(let i=0; i<=steps; i++) {
            const t = i/steps; const time = t * advDuration;
            const x=getV('tongueX', t), y=getV('tongueY', t), l=getV('lips', t), th=getV('throat', t), ln=getV('lipLen', t), n=getV('nasal', t), gFactor=getV('gender', t);
            const lF = 1.0 - (ln * 0.3), lipF = 0.5 + (l * 0.5);
            f1.frequency.linearRampToValueAtTime(Math.max(50, (200 + (1-y)*600 - th*50)) * lF * lipF * gFactor, time); 
            f2.frequency.linearRampToValueAtTime((800 + x*1400) * lF * lipF * gFactor, time); 
            f3.frequency.linearRampToValueAtTime((2000 + l*1500) * lF * gFactor, time); 
            nasF.frequency.linearRampToValueAtTime(Math.max(400, 10000 - n*9000) * gFactor, time);
        }
        sNode.connect(mG); mG.connect(fG); fG.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); 
        let lastNode: AudioNode = nasF;
        eqBands.forEach(b => { if(b.on) { 
            const eq = offline.createBiquadFilter(); eq.type = b.type; eq.frequency.value = b.freq; eq.gain.value = b.gain; eq.Q.value = b.q;
            lastNode.connect(eq); lastNode = eq; 
        } });
        lastNode.connect(offline.destination); if((sNode as any).start) (sNode as any).start(0); return await offline.startRendering();
    }, [audioContext, advDuration, advTracks, tractSourceType, tractSourceFileId, files, larynxParams, fadeOutDuration, synthWaveform, pulseWidth, eqBands, getValueAtTime]);

    useEffect(() => {
        if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = window.setTimeout(async () => { const buf = await renderAdvancedAudio(); if (buf) { setPreviewBuffer(buf); lastRenderedRef.current = buf; } }, 300);
        return () => { if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current); };
    }, [renderAdvancedAudio]);

    const handleSimulationPlay = useCallback(async () => {
        if(isAdvPlaying) { 
            if(simPlaySourceRef.current) try { simPlaySourceRef.current.stop(); } catch(e) {}
            simPauseOffsetRef.current = audioContext.currentTime - simStartTimeRef.current; 
            if(animRef.current) cancelAnimationFrame(animRef.current); 
            setIsAdvPlaying(false); setIsPaused(true); 
        } else {
             if (audioContext.state === 'suspended') await audioContext.resume();
             const res = lastRenderedRef.current || await renderAdvancedAudio(); if(!res) return;
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

    const handleTimelineMouseDown = (e: React.MouseEvent) => {
        if(!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); 
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const t = Math.max(0, Math.min(1, x / rect.width));
        
        if (y < RULER_HEIGHT + 3 && !isEditMode) {
            setPlayHeadPos(t); syncVisualsToTime(t);
            simPauseOffsetRef.current = t * advDuration; 
            if(isAdvPlaying) {
                if(simPlaySourceRef.current) try { simPlaySourceRef.current.stop(); } catch(e) {}
                setIsAdvPlaying(false);
            }
            setDraggingKeyframe({ isPlayhead: true });
            return;
        }

        if (isEditMode) {
            const track = advTracks.find(tr => tr.id === selectedTrackId);
            if (track) {
                const graphH = rect.height - RULER_HEIGHT;
                const hitIdx = track.points.findIndex(p => Math.hypot((p.t * rect.width)-x, (RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * graphH)-y) < 15);
                
                if (e.button === 2) { 
                    e.preventDefault(); 
                    if(hitIdx !== -1 && track.points.length > 2) { 
                        setAdvTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, points: t.points.filter((_, i) => i !== hitIdx) } : t)); 
                        commitChange("포인트 삭제"); 
                    } 
                    return; 
                }
                
                if (hitIdx !== -1) { setDraggingKeyframe({ trackId: selectedTrackId, index: hitIdx }); return; }
                
                if (y >= RULER_HEIGHT) {
                    const val = track.min + ((1 - ((y - RULER_HEIGHT) / graphH)) * (track.max - track.min)); 
                    const nPts = [...track.points, { t, v: val }].sort((a, b) => a.t - b.t); 
                    setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: nPts } : tr));
                    setDraggingKeyframe({ trackId: selectedTrackId, index: nPts.findIndex(p => p.t === t) }); 
                    commitChange("포인트 추가"); 
                }
            }
        } else {
            setPlayHeadPos(t); syncVisualsToTime(t);
            simPauseOffsetRef.current = t * advDuration; 
            if(isAdvPlaying) {
                if(simPlaySourceRef.current) try { simPlaySourceRef.current.stop(); } catch(e) {}
                setIsAdvPlaying(false);
            }
            setDraggingKeyframe({ isPlayhead: true });
        }
    };

    const handleTimelineMouseMove = (e: React.MouseEvent) => {
        if(!draggingKeyframe || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (draggingKeyframe.isPlayhead) { setPlayHeadPos(t); syncVisualsToTime(t); } 
        else if (draggingKeyframe.trackId && draggingKeyframe.index !== undefined) { 
            const gH = rect.height - RULER_HEIGHT; const nV = Math.max(0, Math.min(1, 1 - (((e.clientY - rect.top) - RULER_HEIGHT) / gH))); 
            setAdvTracks(prev => prev.map(tr => {
                if (tr.id !== draggingKeyframe.trackId) return tr;
                const valActual = tr.min + (nV * (tr.max - tr.min));
                return { ...tr, points: tr.points.map((p, i) => i === draggingKeyframe.index ? { t, v: valActual } : p).sort((a,b)=>a.t-b.t) }; 
            }));
        }
    };

    useEffect(() => {
        if(!canvasRef.current) return; const ctx = canvasRef.current.getContext('2d'); if(!ctx) return; const w = canvasRef.current.width, h = canvasRef.current.height;
        const track = advTracks.find(t => t.id === selectedTrackId);
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#f8f8f6'; ctx.fillRect(0, RULER_HEIGHT, w, h - RULER_HEIGHT); 
        if (previewBuffer) {
            ctx.save(); ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
            const data = previewBuffer.getChannelData(0); const step = Math.ceil(data.length / w);
            const waveH = h - RULER_HEIGHT; const amp = waveH / 2; const center = RULER_HEIGHT + amp;
            for (let i = 0; i < w; i++) {
                let min = 1.0, max = -1.0; for (let j = 0; j < step; j++) { const d = data[i * step + j] || 0; if (d < min) min = d; if (d > max) max = d; }
                ctx.moveTo(i, center + min * amp); ctx.lineTo(i, center + max * amp);
            }
            ctx.stroke(); ctx.restore();
        }
        if (track) {
            ctx.beginPath(); ctx.strokeStyle = track.color; ctx.lineWidth = 2.5; 
            track.points.forEach((p, i) => { const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); 
            ctx.stroke(); track.points.forEach((p, i) => { const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); ctx.fillStyle = (hoveredKeyframe?.index === i) ? '#1f1e1d' : track.color; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill(); }); 
        }
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(playHeadPos * w, 0); ctx.lineTo(playHeadPos * w, h); ctx.stroke();
    }, [selectedTrackId, advTracks, playHeadPos, hoveredKeyframe, previewBuffer]);

    const getCurrentValue = (trackId: string) => getValueAtTime(trackId, playHeadPos);

    const ParamInput = ({ label, value, min, max, step, onChange, colorClass }: any) => (
      <div className="space-y-1 font-sans font-bold">
        <div className={`flex justify-between font-bold items-center ${colorClass || 'text-slate-500'}`}>
          <span className="text-xs uppercase tracking-tighter">{label}</span>
          <input type="number" value={Number(value).toFixed(2)} step={step} onChange={e => onChange(Math.max(min, Math.min(max, parseFloat(e.target.value))))} className="w-14 bg-white/60 border border-slate-200 rounded px-1 text-right text-xs outline-none py-0.5" />
        </div>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-slate-300 appearance-none rounded-full cursor-pointer accent-blue-500" />
      </div>
    );

    const lipOpening = liveTract.lips * 20; 
    const lipProtrusion = liveTract.lipLen * 25; 
    const nasalVelumAngle = liveTract.nasal * 40; 

    return (
        <div className="flex-1 flex flex-col p-2 gap-2 animate-in fade-in overflow-hidden" onMouseUp={() => { if(draggingKeyframe) commitChange(); setDraggingKeyframe(null); }}>
            <div className="flex-[2] flex gap-0 shrink-0 min-h-0">
                <div className="flex-1 bg-white/60 rounded-2xl border border-slate-300 flex flex-col relative overflow-hidden shadow-sm">
                    <div className="flex-1 relative flex items-center justify-center px-5 py-2 overflow-hidden select-none">
                        <svg viewBox="100 50 280 340" className="w-[90%] h-[90%] drop-shadow-xl overflow-visible">
                            {/* 성도 가이드 라인 (외형) */}
                            <path d="M 120 380 L 120 280 Q 120 180 160 120 Q 200 60 280 60 Q 340 60 360 100 L 360 140 Q 360 150 350 150" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                            <path d="M 350 190 Q 360 190 360 200 L 360 230 Q 340 230 340 250 Q 340 280 310 310 L 250 330 L 120 380" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                            
                            {/* 목구멍 영역 */}
                            <path d={`M 220 380 L 220 250`} stroke="#f1f5f9" strokeWidth={30 + (1-liveTract.throat) * 40} strokeLinecap="round" opacity="0.8"/>
                            
                            {/* 연구개 (Velum) - 비성 조절 */}
                            <g className="cursor-ns-resize" onMouseDown={(e) => handleTractMouseDown(e, 'nasal')}>
                                <path d={`M 260 140 Q 290 ${140 + nasalVelumAngle} 310 ${140 + nasalVelumAngle}`} stroke="#fb923c" strokeWidth="6" fill="none" strokeLinecap="round" className="transition-all duration-75" />
                                <circle cx="310" cy={140 + nasalVelumAngle} r="4" fill="#fb923c" />
                                <rect x="250" y="120" width="70" height="60" fill="transparent" />
                            </g>

                            {/* 혀 (Tongue) - 위치 및 높이 조절 */}
                            <path 
                                d={`M 220 350 Q ${220 + liveTract.x * 120} ${330 - liveTract.y * 140} ${250 + liveTract.x * 90} ${230 + liveTract.y * 60}`} 
                                stroke="#f43f5e" 
                                strokeWidth={28 + liveTract.throat * 10} 
                                fill="none" 
                                strokeLinecap="round" 
                                opacity="0.95" 
                                className="cursor-move transition-all duration-75"
                                onMouseDown={(e) => handleTractMouseDown(e, 'tongue')}
                            />
                            
                            {/* 입술 (Lips) - 열기 및 길이 조절 */}
                            <g className="cursor-all-scroll" onMouseDown={(e) => handleTractMouseDown(e, 'lips')}>
                                <g transform={`translate(${lipProtrusion}, 0)`}>
                                    <path d={`M 350 ${150 - lipOpening/2} L 375 ${150 - lipOpening/2}`} stroke="#ec4899" strokeWidth="10" strokeLinecap="round" className="transition-all duration-75" />
                                    <path d={`M 350 ${190 + lipOpening/2} L 375 ${190 + lipOpening/2}`} stroke="#ec4899" strokeWidth="10" strokeLinecap="round" className="transition-all duration-75" />
                                    <rect x="340" y={140 - lipOpening/2} width="40" height={60 + lipOpening} fill="transparent" />
                                </g>
                            </g>

                            {/* 히트박스 시각화 (선택됨 표시) */}
                            {dragType === 'tongue' && <circle cx={220 + liveTract.x * 120} cy={330 - liveTract.y * 140} r="10" fill="none" stroke="#f43f5e" strokeDasharray="2,2" className="animate-pulse" />}
                            {dragType === 'lips' && <rect x={340 + lipProtrusion} y={140 - lipOpening/2} width="40" height={60 + lipOpening} fill="none" stroke="#ec4899" strokeDasharray="2,2" className="animate-pulse" />}
                            {dragType === 'nasal' && <rect x="250" y="120" width="70" height="60" fill="none" stroke="#fb923c" strokeDasharray="2,2" className="animate-pulse" />}
                        </svg>
                    </div>
                    <div className="p-2 px-4 bg-white/80 border-t flex justify-between items-center shrink-0 shadow-inner">
                        <div className="flex gap-2">
                            <button onClick={handleUndo} disabled={undoStack.length===0} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 disabled:opacity-20 transition-all shadow-sm"><Undo2 size={16}/></button>
                            <button onClick={handleRedo} disabled={redoStack.length===0} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 disabled:opacity-20 transition-all shadow-sm"><Redo2 size={16}/></button>
                        </div>
                        <div className="flex gap-1.5 font-bold text-xs items-center">
                            <button onClick={()=>{const t=playHeadPos; setAdvTracks(prev=>prev.map(tr=>{if(tr.group!=='adj' && tr.id !== 'pitch' && tr.id !== 'gender') return tr; let val=0; if(tr.id==='tongueX')val=liveTract.x;else if(tr.id==='tongueY')val=liveTract.y;else if(tr.id==='lips')val=liveTract.lips;else if(tr.id==='lipLen')val=liveTract.lipLen;else if(tr.id==='throat')val=liveTract.throat;else if(tr.id==='nasal')val=liveTract.nasal; else if(tr.id==='pitch')val=manualPitch; else if(tr.id==='gender')val=manualGender; return{...tr,points:[...tr.points.filter(p=>Math.abs(p.t-t)>0.005),{t,v:val}].sort((a,b)=>a.t-b.t)};})); commitChange("기록");}} className="bg-[#209ad6] text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all"><CircleDot size={14}/> {t.simulator.record}</button>
                            <div className="w-px h-4 bg-slate-200 mx-1"></div>
                            <button onClick={handleSimulationPlay} className="bg-slate-800 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md active:scale-95 transition-all">{isAdvPlaying ? <Pause size={14}/> : <Play size={14}/>} {isAdvPlaying ? t.common.stop : t.common.play}</button>
                            <button onClick={async()=>{ const res = await renderAdvancedAudio(); if(res) { onAddToRack(res, "Sim_" + simIndex); setSimIndex(s=>s+1); } }} className="bg-white border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 shadow-sm active:scale-95 transition-all">{t.simulator.saveToRack}</button>
                        </div>
                    </div>
                </div>
                <div className={`w-1.5 hover:bg-blue-400/50 cursor-col-resize transition-colors ${isResizing ? 'bg-blue-500' : ''}`} onMouseDown={(e)=>{setIsResizing(true); e.preventDefault();}} />
                <div className="bg-white/40 rounded-2xl border border-slate-300 flex flex-col overflow-hidden shrink-0 shadow-sm" style={{ width: `${sidebarWidth}px` }}>
                    <div className="flex border-b border-slate-300 bg-white/40">
                        <button onClick={()=>setSidebarTab('settings')} className={`flex-1 py-3 text-xs font-black transition-all ${sidebarTab==='settings'?'bg-white text-[#209ad6] border-b-2 border-[#209ad6] shadow-sm':'text-slate-500'}`}><Settings2 size={14} className="inline mr-1"/> {t.common.settings}</button>
                        <button onClick={()=>setSidebarTab('eq')} className={`flex-1 py-3 text-xs font-black transition-all ${sidebarTab==='eq'?'bg-white text-pink-600 border-b-2 border-pink-500 shadow-sm':'text-slate-500'}`}><AudioLines size={14} className="inline mr-1"/> {t.common.eq}</button>
                    </div>
                    <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                        {sidebarTab === 'settings' ? (
                            <div className="space-y-4">
                                <ParamInput label={t.simulator.tracks.pitch} value={manualPitch} min={50} max={600} step={1} onChange={setManualPitch} colorClass="text-amber-500" />
                                <ParamInput label={t.simulator.tracks.gender} value={manualGender} min={0.5} max={2.0} step={0.01} onChange={setManualGender} colorClass="text-pink-500" />
                                <div className="h-px bg-slate-200 my-1" />
                                {[ ['lips', t.simulator.tracks.lips, 'text-pink-400'], ['lipLen', t.simulator.tracks.lipLen, 'text-pink-600'], ['throat', t.simulator.tracks.throat, 'text-purple-400'], ['nasal', t.simulator.tracks.nasal, 'text-orange-400'] ].map(([id,l,c]) => (
                                    <ParamInput key={id} label={l} value={(liveTract as any)[id]} min={0} max={1} step={0.01} onChange={(v:number)=>setLiveTract(p=>({...p,[id]:v}))} colorClass={c} />
                                ))}
                                <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                    <p className="text-[10px] text-blue-600 font-bold leading-tight">{t.simulator.tip}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="h-[300px]"><ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={simPlaySourceRef.current} /></div>
                        )}
                    </div>
                </div>
            </div>
            <div className="min-h-[220px] bg-white/40 rounded-2xl border border-slate-300 p-2 shadow-sm relative shrink-0">
                 <div className="flex items-center justify-between gap-1.5 pb-1 px-1">
                    <div className="flex gap-1.5 overflow-x-auto custom-scrollbar py-1">
                        {advTracks.map(t=><button key={t.id} onClick={()=>setSelectedTrackId(t.id)} className={`px-2.5 py-1 text-[10px] font-black border rounded-full transition-all whitespace-nowrap ${selectedTrackId===t.id?'bg-[#209ad6] text-white border-[#209ad6] shadow-md':'bg-white text-slate-500 border-slate-200'}`}>{t.name}</button>)}
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <button 
                            onClick={()=>setIsEditMode(!isEditMode)} 
                            className={`p-1.5 rounded-lg border transition-all shadow-sm ${isEditMode?'bg-amber-400 text-white border-amber-500':'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}
                            title={isEditMode ? t.simulator.editMode : t.simulator.playheadMode}
                        >
                            <PencilLine size={16}/>
                        </button>
                    </div>
                </div>
                <div className="h-[180px] bg-white rounded-xl border border-slate-200 relative overflow-hidden shadow-inner">
                    <canvas 
                        ref={canvasRef} 
                        width={1000} 
                        height={180} 
                        className={`w-full h-full ${isEditMode ? 'cursor-crosshair' : 'cursor-text'}`} 
                        onMouseDown={handleTimelineMouseDown} 
                        onMouseMove={handleTimelineMouseMove} 
                        onContextMenu={e=>e.preventDefault()}
                    />
                    <div className="absolute top-1.5 left-1.5 bg-white/90 backdrop-blur border border-slate-200 px-2 py-1 rounded text-[10px] font-bold text-slate-600 flex gap-2 pointer-events-none shadow-sm">
                        <span>Time: {playHeadPos.toFixed(3)}s</span>
                        <span className="text-amber-600">Pitch: {Math.round(getCurrentValue('pitch'))}Hz</span>
                        <span className="text-pink-500">Gender: x{Number(getCurrentValue('gender')).toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdvancedTractTab;
