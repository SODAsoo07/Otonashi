
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings2, AudioLines, Activity, Wand2, Mic2, Wind, Waves } from 'lucide-react';
import { AudioFile, AdvTrack, LarynxParams, LiveTractState, EQBand } from '../types';
import { AudioUtils } from '../utils/audioUtils';
import ParametricEQ from './ParametricEQ';
import FormantAnalyzer from './FormantAnalyzer';
import TractVisualizer from './TractVisualizer';
import TimelineEditor from './TimelineEditor';
import ParamInput from './ui/ParamInput';

interface AdvancedTractTabProps {
  audioContext: AudioContext;
  files: AudioFile[];
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
  isActive: boolean;
}

// Cubic Interpolation (Catmull-Rom Spline)
const cubicHermite = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const a = 2 * p0 - 5 * p1 + 4 * p2 - p3;
    const b = -p0 + 3 * p1 - 3 * p2 + p3;
    const c = p2 - p0; 
    const d = 2 * p1;
    return 0.5 * (a * t * t * t + b * t * t + c * t + d);
};

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
    const [playHeadPos, setPlayheadPos] = useState(0); 
    const [liveTract, setLiveTract] = useState<LiveTractState>({ x: 0.5, y: 0.4, lips: 0.7, lipLen: 0.5, throat: 0.5, nasal: 0.2 }); 
    const [manualPitch, setManualPitch] = useState(220);
    const [manualGender, setManualGender] = useState(1.0);
    const [simIndex, setSimIndex] = useState(1);
    const [simIntensity, setSimIntensity] = useState(1.0);
    
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedTrackId, setSelectedTrackId] = useState('pitch'); 
    
    const [sidebarWidth, setSidebarWidth] = useState(420);
    const [isResizing, setIsResizing] = useState(false);
    const [previewBuffer, setPreviewBuffer] = useState<AudioBuffer | null>(null);
    const [sidebarTab, setSidebarTab] = useState<'settings' | 'eq'>('settings');
    const [showAnalyzer, setShowAnalyzer] = useState(false);

    const [showSpectrogram, setShowSpectrogram] = useState(false);
    const [pitchFileId, setPitchFileId] = useState("");
    const [pitchSensitivity, setPitchSensitivity] = useState(0.5);
    const [ghostTracks, setGhostTracks] = useState<AdvTrack[] | null>(null);
    const [showGhost, setShowGhost] = useState(true);
    const spectrogramCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 80, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'lowshelf', freq: 200, gain: 0, q: 0.7, on: true },
        { id: 3, type: 'peaking', freq: 1500, gain: 0, q: 1.0, on: true },
        { id: 4, type: 'highshelf', freq: 6000, gain: 0, q: 0.7, on: true },
        { id: 5, type: 'lowpass', freq: 15000, gain: 0, q: 0.7, on: true }
    ]);

    const [advTracks, setAdvTracks] = useState<AdvTrack[]>([
        { id: 'tongueX', name: '혀 위치 (X)', group: 'adj', color: '#60a5fa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1, interpolation: 'curve' },
        { id: 'tongueY', name: '혀 높이 (Y)', group: 'adj', color: '#4ade80', points: [{t:0, v:0.4}, {t:1, v:0.4}], min:0, max:1, interpolation: 'curve' },
        { id: 'lips',    name: '입술 열기', group: 'adj', color: '#f472b6', points: [{t:0, v:0.7}, {t:1, v:0.7}], min:0, max:1, interpolation: 'curve' },
        { id: 'lipLen',  name: '입술 길이', group: 'adj', color: '#db2777', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1, interpolation: 'curve' }, 
        { id: 'throat',  name: '목 조임',   group: 'adj', color: '#a78bfa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1, interpolation: 'curve' },
        { id: 'nasal',   name: '연구개 (Velum)', group: 'adj', color: '#fb923c', points: [{t:0, v:0.2}, {t:1, v:0.2}], min:0, max:1, interpolation: 'curve' },
        { id: 'pitch',   name: '피치 (Hz)', group: 'edit', color: '#fbbf24', points: [{t:0, v:220}, {t:1, v:220}], min:50, max:600, interpolation: 'curve' },
        { id: 'gender',  name: '성별 (Shift)', group: 'edit', color: '#ec4899', points: [{t:0, v:1}, {t:1, v:1}], min:0.5, max:2.0, interpolation: 'curve' },
        { id: 'gain',    name: '게인 (Vol)', group: 'edit', color: '#ef4444', points: [{t:0, v:0}, {t:0.1, v:1}, {t:0.9, v:1}, {t:1, v:0}], min:0, max:1.5, interpolation: 'linear' },
        { id: 'breath',  name: '숨소리',     group: 'edit', color: '#22d3ee', points: [{t:0, v:0.01}, {t:1, v:0.01}], min:0, max:0.3, interpolation: 'linear' }
    ]);
    
    const [undoStack, setUndoStack] = useState<any[]>([]);
    const [redoStack, setRedoStack] = useState<any[]>([]);

    const isAdvPlayingRef = useRef(false);
    const liveAudioRef = useRef<any>(null); 
    const animRef = useRef<number | null>(null);
    const lastRenderedRef = useRef<AudioBuffer | null>(null);
    const simStartTimeRef = useRef(0);
    const simPauseOffsetRef = useRef(0);
    const simPlaySourceRef = useRef<AudioBufferSourceNode | null>(null);
    const previewDebounceRef = useRef<number | null>(null);

    const applyVowelPreset = (v: 'A' | 'E' | 'I' | 'O' | 'U' | 'W' | 'Y') => {
        const presets = {
            'A': { x: 0.2, y: 0.1, lips: 0.9, lipLen: 0.5, nasal: 0.0, throat: 0.1 },
            'E': { x: 0.6, y: 0.5, lips: 0.7, lipLen: 0.5, nasal: 0.0, throat: 0.3 },
            'I': { x: 0.9, y: 0.9, lips: 0.2, lipLen: 0.5, nasal: 0.0, throat: 0.2 },
            'O': { x: 0.2, y: 0.4, lips: 0.3, lipLen: 0.6, nasal: 0.0, throat: 0.5 },
            'U': { x: 0.1, y: 0.8, lips: 0.2, lipLen: 0.8, nasal: 0.0, throat: 0.4 },
            'W': { x: 0.0, y: 0.9, lips: 0.0, lipLen: 1.0, nasal: 0.0, throat: 0.4 }, // Labio-velar (extreme U)
            'Y': { x: 1.0, y: 0.9, lips: 0.8, lipLen: 0.1, nasal: 0.0, throat: 0.2 }  // Palatal (extreme I)
        };
        const p = presets[v];
        setLiveTract({ ...liveTract, ...p });
        updateLiveAudio(p.x, p.y, p.lips, p.throat, p.lipLen, p.nasal, manualPitch, manualGender);
        commitChange(`${v} 프리셋 적용`);
    };

    const handleAnalyzerApply = (data: { tongueX?: any[], tongueY?: any[], lips?: any[], lipLen?: any[], throat?: any[], nasal?: any[] }) => {
        const commonProps = { interpolation: 'curve' as const };
        const newTracks = advTracks.map(t => {
            if (t.id === 'tongueX' && data.tongueX) return { ...t, points: data.tongueX, ...commonProps };
            if (t.id === 'tongueY' && data.tongueY) return { ...t, points: data.tongueY, ...commonProps };
            if (t.id === 'lips' && data.lips) return { ...t, points: data.lips, ...commonProps };
            if (t.id === 'lipLen' && data.lipLen) return { ...t, points: data.lipLen, ...commonProps };
            if (t.id === 'throat' && data.throat) return { ...t, points: data.throat, ...commonProps };
            if (t.id === 'nasal' && data.nasal) return { ...t, points: data.nasal, ...commonProps };
            return t;
        });
        setAdvTracks(newTracks);
        setGhostTracks(newTracks); 
        setShowGhost(true);
        commitChange("AI 발음 분석 적용");
    };

    const handlePitchExtraction = () => {
        if (!pitchFileId) return;
        const f = files.find(f => f.id === pitchFileId);
        if (!f) return;
        const pts = AudioUtils.detectPitch(f.buffer, pitchSensitivity);
        const dur = advDuration;
        const normalizedPts = pts.map(p => ({ t: Math.min(1, p.t / dur), v: p.v })).filter(p => p.t <= 1);
        setAdvTracks(prev => prev.map(t => {
            if (t.id === 'pitch') return { ...t, points: normalizedPts, interpolation: 'curve' };
            return t;
        }));
        commitChange("피치 추출 적용");
    };

    useEffect(() => {
        if (!showSpectrogram || !tractSourceFileId) {
             spectrogramCanvasRef.current = null;
             return;
        }
        const f = files.find(f => f.id === tractSourceFileId);
        if (f && f.buffer) {
            const width = 1000;
            const height = 180;
            const data = AudioUtils.computeSpectrogram(f.buffer, width, height);
            if (data) {
                const cvs = document.createElement('canvas');
                cvs.width = width;
                cvs.height = height;
                const ctx = cvs.getContext('2d');
                if (ctx) {
                    const imgData = new ImageData(data, width, height);
                    ctx.putImageData(imgData, 0, 0);
                    spectrogramCanvasRef.current = cvs;
                }
            }
        }
    }, [showSpectrogram, tractSourceFileId, files]);

    useEffect(() => { isAdvPlayingRef.current = isAdvPlaying; }, [isAdvPlaying]);

    useEffect(() => {
        if (liveAudioRef.current && audioContext) {
            const now = audioContext.currentTime;
            const { f1, f2, f3 } = liveAudioRef.current;
            if (f1) f1.gain.setTargetAtTime(12 * simIntensity, now, 0.02);
            if (f2) f2.gain.setTargetAtTime(12 * simIntensity, now, 0.02);
            if (f3) f3.gain.setTargetAtTime(10 * simIntensity, now, 0.02);
        }
    }, [simIntensity, audioContext]);

    const getCurrentState = useCallback(() => ({
        larynxParams, tractSourceType, tractSourceFileId, synthWaveform, pulseWidth, liveTract, advTracks, manualPitch, manualGender, eqBands, simIntensity
    }), [larynxParams, tractSourceType, tractSourceFileId, synthWaveform, pulseWidth, liveTract, advTracks, manualPitch, manualGender, eqBands, simIntensity]);

    const commitChange = useCallback((label: string = "변경") => {
        const state = getCurrentState();
        setUndoStack(prev => [...prev.slice(-19), state]);
        setRedoStack([]);
    }, [getCurrentState]);

    const restoreState = (state: any) => {
        setLarynxParams(state.larynxParams); setTractSourceType(state.tractSourceType); setTractSourceFileId(state.tractSourceFileId);
        setSynthWaveform(state.synthWaveform); setPulseWidth(state.pulseWidth); setLiveTract(state.liveTract); setAdvTracks(state.advTracks);
        setManualPitch(state.manualPitch || 220); setManualGender(state.manualGender || 1.0); if(state.eqBands) setEqBands(state.eqBands);
        setSimIntensity(state.simIntensity !== undefined ? state.simIntensity : 1.0);
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

    const getValueAtTime = useCallback((trackId: string, t: number, tracks: AdvTrack[] = advTracks) => {
        const track = tracks.find(tr => tr.id === trackId);
        if (!track) return 0;
        const pts = track.points;
        if(pts.length === 0) return track.min;
        if(t <= pts[0].t) return pts[0].v;
        if(t >= pts[pts.length-1].t) return pts[pts.length-1].v;

        if (track.interpolation === 'curve') {
             let i = 0;
             while(i < pts.length - 1 && pts[i+1].t < t) i++;
             const p0 = i > 0 ? pts[i-1] : pts[i];
             const p1 = pts[i];
             const p2 = pts[i+1];
             const p3 = i < pts.length - 2 ? pts[i+2] : pts[i+1];
             const range = p2.t - p1.t;
             if (range === 0) return p1.v;
             const tLocal = (t - p1.t) / range;
             return Math.max(track.min, Math.min(track.max, cubicHermite(p0.v, p1.v, p2.v, p3.v, tLocal)));
        } 
        else {
            for(let i=0; i<pts.length-1; i++) {
                if(t >= pts[i].t && t <= pts[i+1].t) {
                    const ratio = (t - pts[i].t) / (pts[i+1].t - pts[i].t);
                    return pts[i].v + (pts[i+1].v - pts[i].v) * ratio;
                }
            }
        }
        return pts[0].v;
    }, [advTracks]);

    const syncVisualsToTime = useCallback((t: number) => {
        setLiveTract({
            x: getValueAtTime('tongueX', t),
            y: getValueAtTime('tongueY', t),
            lips: getValueAtTime('lips', t),
            lipLen: getValueAtTime('lipLen', t),
            throat: getValueAtTime('throat', t),
            nasal: getValueAtTime('nasal', t),
        });
        setManualPitch(getValueAtTime('pitch', t));
        setManualGender(getValueAtTime('gender', t));
    }, [getValueAtTime]);

    const updateLiveAudio = useCallback((x: number, y: number, l: number, t: number, len: number, n: number, pitch: number, gender: number) => { 
        if (!liveAudioRef.current || !audioContext) return;
        const now = audioContext.currentTime; const { f1, f2, f3, nasF, sNode, nG } = liveAudioRef.current;
        const lF = 1.0 - (len * 0.3); const liF = 0.5 + (l * 0.5);
        let fr1 = (200 + (1 - y) * 600 - (t * 50)) * lF * liF; 
        let fr2 = (800 + x * 1400) * lF * liF; 
        let fr3 = (2000 + l * 1500) * lF;
        fr1 *= gender; fr2 *= gender; fr3 *= gender;
        if(f1) f1.frequency.setTargetAtTime(Math.max(50, fr1), now, 0.01); 
        if(f2) f2.frequency.setTargetAtTime(fr2, now, 0.01); 
        if(f3) f3.frequency.setTargetAtTime(fr3, now, 0.01); 
        if(nasF) nasF.frequency.setTargetAtTime(Math.max(400, (10000 - (n * 9000)) * gender), now, 0.01);
        if(sNode instanceof OscillatorNode) sNode.frequency.setTargetAtTime(pitch, now, 0.01);
        if(nG) nG.gain.setTargetAtTime(getValueAtTime('breath', playHeadPos), now, 0.01);
    }, [audioContext, getValueAtTime, playHeadPos]);

    const startLivePreview = useCallback(() => {
        if (!audioContext || liveAudioRef.current) return;
        let sNode: any;
        let nNode: any;

        if (tractSourceType === 'file' && tractSourceFileId) { 
            const f = files.find(f => f.id === tractSourceFileId); 
            if (f?.buffer) { sNode = audioContext.createBufferSource(); sNode.buffer = f.buffer; sNode.loop = larynxParams.loopOn; } 
        }
        if (!sNode) { 
            if (synthWaveform === 'noise') {
                const bufferSize = audioContext.sampleRate * 2;
                const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                sNode = audioContext.createBufferSource(); sNode.buffer = buffer; sNode.loop = true;
            } else {
                sNode = audioContext.createOscillator(); 
                sNode.type = synthWaveform as OscillatorType; 
                sNode.frequency.value = manualPitch; 
            }
        }

        if (larynxParams.noiseSourceType === 'file' && larynxParams.noiseSourceFileId) {
            const f = files.find(f => f.id === larynxParams.noiseSourceFileId);
            if (f?.buffer) { nNode = audioContext.createBufferSource(); nNode.buffer = f.buffer; nNode.loop = larynxParams.loopOn; }
        } else {
            const bufferSize = audioContext.sampleRate * 2;
            const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            nNode = audioContext.createBufferSource(); nNode.buffer = buffer; nNode.loop = true;
        }
        
        const g = audioContext.createGain(); 
        g.gain.value = 0.1; // Reduced from 0.5 to 0.1 for comfortable listening
        const nG = audioContext.createGain(); nG.gain.value = getValueAtTime('breath', playHeadPos);

        const f1 = audioContext.createBiquadFilter(); f1.type = 'peaking'; f1.Q.value = 4; f1.gain.value = 12 * simIntensity;
        const f2 = audioContext.createBiquadFilter(); f2.type = 'peaking'; f2.Q.value = 4; f2.gain.value = 12 * simIntensity;
        const f3 = audioContext.createBiquadFilter(); f3.type = 'peaking'; f3.Q.value = 4; f3.gain.value = 10 * simIntensity;
        const nasF = audioContext.createBiquadFilter(); nasF.type = 'lowpass';
        
        let lastNode: AudioNode = nasF;
        eqBands.forEach(b => { if(b.on) { 
            const eq = audioContext.createBiquadFilter(); eq.type = b.type; eq.frequency.value = b.freq; eq.gain.value = b.gain; eq.Q.value = b.q;
            lastNode.connect(eq); lastNode = eq; 
        } });

        sNode.connect(f1); 
        nNode.connect(nG); nG.connect(f1);
        
        f1.connect(f2); f2.connect(f3); f3.connect(nasF); lastNode.connect(g); g.connect(audioContext.destination);
        sNode.start(); nNode.start();
        liveAudioRef.current = { sNode, nNode, nG, f1, f2, f3, nasF };
    }, [audioContext, tractSourceType, tractSourceFileId, files, larynxParams, synthWaveform, manualPitch, eqBands, getValueAtTime, playHeadPos, simIntensity]);

    const stopLivePreview = useCallback(() => { 
        if (liveAudioRef.current) { 
            try { liveAudioRef.current.sNode.stop(); if(liveAudioRef.current.nNode) liveAudioRef.current.nNode.stop(); } catch(e) {} 
            liveAudioRef.current = null; 
        } 
    }, []);

    const [controlMode, setControlMode] = useState<'tongue' | 'lips' | 'nasal' | null>(null);

    const handleSimulationMouseDown = useCallback((e: React.MouseEvent, mode: 'tongue' | 'lips' | 'nasal') => {
        setControlMode(mode);
        const rect = e.currentTarget.closest('svg')?.getBoundingClientRect();
        if (!rect) return;
        const update = (ce: any) => { 
            const relX = Math.max(0, Math.min(1, (ce.clientX - rect.left) / rect.width)); 
            const relY = Math.max(0, Math.min(1, 1 - (ce.clientY - rect.top) / rect.height)); 
            setLiveTract(prev => { 
                let n = { ...prev };
                if (mode === 'tongue') { n.x = relX; n.y = relY; }
                else if (mode === 'lips') { n.lipLen = 1 - relX; n.lips = relY; } 
                else if (mode === 'nasal') { n.nasal = relY; }
                updateLiveAudio(n.x, n.y, n.lips, n.throat, n.lipLen, n.nasal, manualPitch, manualGender); 
                return n; 
            }); 
        };
        update(e); startLivePreview(); 
        const mv = (me: MouseEvent) => update(me); 
        const up = () => { 
            window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); 
            stopLivePreview(); setControlMode(null); commitChange(`${mode} 조작`); 
        }; 
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    }, [startLivePreview, stopLivePreview, updateLiveAudio, manualPitch, manualGender, commitChange]);

    const renderAdvancedAudio = useCallback(async () => {
        if (!audioContext) return null;
        const sr = audioContext.sampleRate; 
        const len = Math.max(1, Math.floor(sr * advDuration)); 
        const offline = new OfflineAudioContext(1, len, sr);
        const getV = (id: string, t: number) => getValueAtTime(id, t);
        
        let sNode: AudioNode;
        if (tractSourceType === 'file' && tractSourceFileId) { 
            const f = files.find(f => f.id === tractSourceFileId); 
            if (f?.buffer) { 
                const b = offline.createBufferSource(); b.buffer = f.buffer; b.loop = larynxParams.loopOn; sNode = b; 
            } else {
                const osc = offline.createOscillator(); osc.type = 'sawtooth'; sNode = osc;
            }
        } else {
            if (synthWaveform === 'noise') {
                const bufferSize = sr * advDuration;
                const buffer = offline.createBuffer(1, bufferSize, sr);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                const noiseSrc = offline.createBufferSource(); noiseSrc.buffer = buffer; sNode = noiseSrc;
            } else {
                const osc = offline.createOscillator(); 
                osc.type = synthWaveform as any;
                const pitchTrack = advTracks.find(t=>t.id==='pitch');
                if(pitchTrack && pitchTrack.points.length > 0) {
                    const steps = 100;
                    for(let i=0; i<=steps; i++) {
                        const t = i/steps;
                        const val = getValueAtTime('pitch', t);
                        osc.frequency.linearRampToValueAtTime(val, t * advDuration);
                    }
                }
                sNode = osc;
            }
        }

        let nNode: AudioBufferSourceNode;
        if(larynxParams.noiseSourceType === 'file' && larynxParams.noiseSourceFileId) {
            const f = files.find(f => f.id === larynxParams.noiseSourceFileId);
            if (f?.buffer) {
                nNode = offline.createBufferSource(); nNode.buffer = f.buffer; nNode.loop = larynxParams.loopOn;
            } else {
                const bufferSize = sr * advDuration;
                const buffer = offline.createBuffer(1, bufferSize, sr);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                nNode = offline.createBufferSource(); nNode.buffer = buffer; nNode.loop = true;
            }
        } else {
            const bufferSize = sr * advDuration;
            const buffer = offline.createBuffer(1, bufferSize, sr);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            nNode = offline.createBufferSource(); nNode.buffer = buffer; nNode.loop = true;
        }

        const nG = offline.createGain();
        const mG = offline.createGain(); 
        const fG = offline.createGain(); 
        
        const steps = 60; 
        for(let i=0; i<=steps; i++) {
             const t = i/steps;
             const time = t * advDuration;
             // Scale the automation value by 0.25 to prevent clipping from filter resonance
             mG.gain.linearRampToValueAtTime(getValueAtTime('gain', t) * 0.25, time);
        }
        
        const startFade = Math.max(0, advDuration - fadeOutDuration); 
        fG.gain.setValueAtTime(1, 0); 
        fG.gain.setValueAtTime(1, startFade); 
        fG.gain.linearRampToValueAtTime(0, advDuration);

        const f1=offline.createBiquadFilter(), f2=offline.createBiquadFilter(), f3=offline.createBiquadFilter(), nasF=offline.createBiquadFilter(); 
        f1.type='peaking'; f1.Q.value=4; f1.gain.value=12 * simIntensity;
        f2.type='peaking'; f2.Q.value=4; f2.gain.value=12 * simIntensity;
        f3.type='peaking'; f3.Q.value=4; f3.gain.value=10 * simIntensity;
        nasF.type='lowpass';

        for(let i=0; i<=steps; i++) {
            const t = i/steps; 
            const time = t * advDuration;
            const x=getV('tongueX', t), y=getV('tongueY', t), l=getV('lips', t), th=getV('throat', t), ln=getV('lipLen', t), n=getV('nasal', t), gFactor=getV('gender', t);
            const lF = 1.0 - (ln * 0.3), lipF = 0.5 + (l * 0.5);
            f1.frequency.linearRampToValueAtTime(Math.max(50, (200 + (1-y)*600 - th*50)) * lF * lipF * gFactor, time); 
            f2.frequency.linearRampToValueAtTime((800 + x*1400) * lF * lipF * gFactor, time); 
            f3.frequency.linearRampToValueAtTime((2000 + l*1500) * lF * gFactor, time); 
            nasF.frequency.linearRampToValueAtTime(Math.max(400, 10000 - n*9000) * gFactor, time);
            const breathV = getV('breath', t);
            nG.gain.linearRampToValueAtTime(breathV, time);
        }

        sNode.connect(mG); 
        nNode.connect(nG); nG.connect(f1); 
        mG.connect(fG); 
        fG.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); 
        
        let lastNode: AudioNode = nasF;
        eqBands.forEach(b => { 
            if(b.on) { 
                const eq = offline.createBiquadFilter(); eq.type = b.type; eq.frequency.value = b.freq; eq.gain.value = b.gain; eq.Q.value = b.q;
                lastNode.connect(eq); lastNode = eq; 
            } 
        });
        
        lastNode.connect(offline.destination); 
        if((sNode as any).start) (sNode as any).start(0); 
        nNode.start(0);
        
        const renderedBuffer = await offline.startRendering();
        lastRenderedRef.current = renderedBuffer;
        return renderedBuffer;
    }, [audioContext, advDuration, advTracks, tractSourceType, tractSourceFileId, files, larynxParams, fadeOutDuration, synthWaveform, eqBands, getValueAtTime, simIntensity]);

    useEffect(() => {
        if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = window.setTimeout(async () => { 
            const buf = await renderAdvancedAudio(); 
            if (buf) {
                setPreviewBuffer(buf); 
            } 
        }, 500);
        return () => { if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current); };
    }, [renderAdvancedAudio]);

    const handleSimulationPlay = useCallback(async () => {
        if(isAdvPlaying) { 
            if(simPlaySourceRef.current) {
                try { simPlaySourceRef.current.stop(); } catch(e) {}
                simPlaySourceRef.current = null;
            }
            simPauseOffsetRef.current = audioContext.currentTime - simStartTimeRef.current; 
            if(animRef.current) cancelAnimationFrame(animRef.current); 
            setIsAdvPlaying(false); 
            setIsPaused(true); 
            isAdvPlayingRef.current = false;
        } else {
             if (audioContext.state === 'suspended') await audioContext.resume();
             const res = lastRenderedRef.current || await renderAdvancedAudio(); 
             if(!res) return;
             const s = audioContext.createBufferSource(); 
             s.buffer = res; 
             s.connect(audioContext.destination);
             const offset = isPaused ? simPauseOffsetRef.current : 0;
             let effectiveOffset = offset >= res.duration ? 0 : offset;
             s.start(0, effectiveOffset); 
             simStartTimeRef.current = audioContext.currentTime - effectiveOffset;
             simPlaySourceRef.current = s; 
             setIsAdvPlaying(true); 
             isAdvPlayingRef.current = true; 
             setIsPaused(false);
             const animate = () => { 
                 if(!isAdvPlayingRef.current) return;
                 const cur = audioContext.currentTime - simStartTimeRef.current;
                 const progress = Math.min(1, Math.max(0, cur / advDuration));
                 setPlayheadPos(progress); 
                 syncVisualsToTime(progress);
                 if (cur < advDuration) {
                     animRef.current = requestAnimationFrame(animate); 
                 } else { 
                     setIsAdvPlaying(false); 
                     setPlayheadPos(0); 
                     simPauseOffsetRef.current = 0; 
                     syncVisualsToTime(0); 
                     isAdvPlayingRef.current = false;
                 } 
             };
             animRef.current = requestAnimationFrame(animate);
        }
    }, [isAdvPlaying, isPaused, renderAdvancedAudio, audioContext, advDuration, syncVisualsToTime]);

    const handleDownloadResult = async () => {
        const res = lastRenderedRef.current || await renderAdvancedAudio();
        if (res) AudioUtils.downloadWav(res, `sim_output_${simIndex}.wav`);
    };

    const handleSaveToRack = async () => {
        const res = lastRenderedRef.current || await renderAdvancedAudio();
        if(res) {
            onAddToRack(res, "Sim_" + simIndex); 
            setSimIndex(s=>s+1);
        }
    };

    const recordSnapshot = () => {
        const t = playHeadPos; 
        setAdvTracks(prev=>prev.map(tr=>{
            if(tr.group!=='adj' && tr.id !== 'pitch' && tr.id !== 'gender') return tr; 
            let val=0; 
            if(tr.id==='tongueX')val=liveTract.x;else if(tr.id==='tongueY')val=liveTract.y;else if(tr.id==='lips')val=liveTract.lips;else if(tr.id==='lipLen')val=liveTract.lipLen;else if(tr.id==='throat')val=liveTract.throat;else if(tr.id==='nasal')val=liveTract.nasal; else if(tr.id==='pitch')val=manualPitch; else if(tr.id==='gender')val=manualGender; 
            return{...tr,points:[...tr.points.filter(p=>Math.abs(p.t-t)>0.005),{t,v:val}].sort((a,b)=>a.t-b.t)};
        })); 
        commitChange("기록");
    }

    const getCurrentValue = (trackId: string) => getValueAtTime(trackId, playHeadPos);

    return (
        <div className="flex-1 flex flex-col p-2 gap-2 animate-in fade-in overflow-hidden h-full">
            {showAnalyzer && <FormantAnalyzer files={files} audioContext={audioContext} onClose={()=>setShowAnalyzer(false)} onApply={handleAnalyzerApply} />}
            
            {/* Top Section (Visualizer + Settings) */}
            <div className="flex-1 flex gap-0 shrink-0 min-h-0 flex-[3]">
                {/* Responsive Visualizer */}
                <TractVisualizer 
                    liveTract={liveTract}
                    manualPitch={manualPitch}
                    manualGender={manualGender}
                    isAdvPlaying={isAdvPlaying}
                    undoStackLength={undoStack.length}
                    redoStackLength={redoStack.length}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onRecordSnapshot={recordSnapshot}
                    onPlayToggle={handleSimulationPlay}
                    onDownload={handleDownloadResult}
                    onSaveToRack={handleSaveToRack}
                    onMouseDown={handleSimulationMouseDown}
                />
                
                {/* Resizer Handle */}
                <div className={`w-1.5 hover:bg-blue-400/50 cursor-col-resize transition-colors ${isResizing ? 'dynamic-primary' : ''}`} onMouseDown={(e)=>{setIsResizing(true); e.preventDefault();}} />
                
                {/* Sidebar (Settings/EQ) */}
                <div className="bg-white/40 dynamic-radius border border-slate-300 flex flex-col overflow-hidden shrink-0 shadow-sm" style={{ width: `${sidebarWidth}px` }}>
                    <div className="flex border-b border-slate-300 bg-white/40">
                        <button onClick={()=>setSidebarTab('settings')} className={`flex-1 py-3 text-xs font-black transition-all ${sidebarTab==='settings'?'bg-white dynamic-primary-text border-b-2 dynamic-primary-border shadow-sm':'text-slate-500'}`}><Settings2 size={14} className="inline mr-1"/> 설정</button>
                        <button onClick={()=>setSidebarTab('eq')} className={`flex-1 py-3 text-xs font-black transition-all ${sidebarTab==='eq'?'bg-white text-pink-600 border-b-2 border-pink-500 shadow-sm':'text-slate-500'}`}><AudioLines size={14} className="inline mr-1"/> EQ</button>
                    </div>
                    <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 font-bold">
                        {sidebarTab === 'settings' ? (
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">Vowel Presets</h3>
                                    </div>
                                    <div className="flex gap-1 font-black">
                                        {(['A', 'E', 'I', 'O', 'U'] as const).map(v => (
                                            <button key={v} onClick={() => applyVowelPreset(v)} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-black text-slate-700 transition-all shadow-sm">{v}</button>
                                        ))}
                                    </div>
                                    <div className="flex gap-1 font-black">
                                        {(['W', 'Y'] as const).map(v => (
                                            <button key={v} onClick={() => applyVowelPreset(v)} className="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg text-xs font-black text-indigo-600 transition-all shadow-sm flex items-center justify-center gap-1">
                                                {v} <span className="text-[9px] opacity-60 font-bold">(Semi-vowel)</span>
                                            </button>
                                        ))}
                                    </div>
                                    <button onClick={() => setShowAnalyzer(true)} className="w-full py-2.5 mt-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm"><Wand2 size={14}/> AI 발음 분석 (Beta)</button>
                                </div>
                                <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity size={12}/> Pitch Analysis</h3>
                                    <select value={pitchFileId} onChange={e=>setPitchFileId(e.target.value)} className="w-full p-2 border rounded-lg text-xs font-bold outline-none text-slate-900">
                                        <option value="">분석할 파일 선택</option>
                                        {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-black text-slate-500"><span>Sensitivity</span><span className="text-indigo-600">{Math.round(pitchSensitivity * 100)}%</span></div>
                                        <input type="range" min="0" max="1" step="0.05" value={pitchSensitivity} onChange={e => setPitchSensitivity(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                    </div>
                                    <button onClick={handlePitchExtraction} disabled={!pitchFileId} className="w-full py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-black text-slate-700 disabled:opacity-50 transition-all shadow-sm">Extract Pitch & Apply</button>
                                </div>
                                <div className="space-y-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Mic2 size={12}/> Glottis Source</h3>
                                    <div className="flex gap-2 p-1 bg-slate-200 rounded-lg shadow-inner">
                                        <button onClick={()=>setTractSourceType('synth')} className={`flex-1 py-1.5 rounded text-[10px] font-black transition-all ${tractSourceType==='synth'?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>신디사이저</button>
                                        <button onClick={()=>setTractSourceType('file')} className={`flex-1 py-1.5 rounded text-[10px] font-black transition-all ${tractSourceType==='file'?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>파일</button>
                                    </div>
                                    {tractSourceType === 'synth' && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between"><span className="text-[10px] text-slate-500 uppercase font-black">Waveform</span><select value={synthWaveform} onChange={e=>setSynthWaveform(e.target.value)} className="text-[10px] bg-white border border-slate-200 rounded px-1 outline-none font-black text-slate-900"><option value="sawtooth">Sawtooth</option><option value="sine">Sine</option><option value="square">Square</option><option value="noise">Noise</option></select></div>
                                        </div>
                                    )}
                                    {tractSourceType === 'file' && (
                                        <div className="space-y-2">
                                            <select value={tractSourceFileId} onChange={e=>setTractSourceFileId(e.target.value)} className="w-full p-2 border rounded-lg text-xs font-bold outline-none text-slate-900"><option value="">파일 선택</option>{files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                                            <div className="space-y-1"><div className="flex justify-between text-[10px] font-black text-slate-500"><span>Simulation Intensity</span><span className="text-indigo-600">{Math.round(simIntensity * 100)}%</span></div><input type="range" min="0" max="1.5" step="0.05" value={simIntensity} onChange={e => setSimIntensity(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"/></div>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between pt-1">
                                        <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1"><Waves size={12}/> Spectrogram</span>
                                        <button onClick={()=>setShowSpectrogram(!showSpectrogram)} className={`w-8 h-4 rounded-full transition-colors relative ${showSpectrogram ? 'bg-indigo-500' : 'bg-slate-300'}`}><div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${showSpectrogram ? 'left-4.5' : 'left-0.5'}`}/></button>
                                    </div>
                                    <div className="h-px bg-slate-200 my-2" />
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Wind size={12}/> Noise Source (Breath)</h3>
                                    <div className="flex gap-2 p-1 bg-slate-200 rounded-lg shadow-inner">
                                        <button onClick={()=>setLarynxParams({...larynxParams, noiseSourceType: 'generated'})} className={`flex-1 py-1.5 rounded text-[10px] font-black transition-all ${larynxParams.noiseSourceType==='generated'?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>화이트 노이즈</button>
                                        <button onClick={()=>setLarynxParams({...larynxParams, noiseSourceType: 'file'})} className={`flex-1 py-1.5 rounded text-[10px] font-black transition-all ${larynxParams.noiseSourceType==='file'?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>파일 소스</button>
                                    </div>
                                    {larynxParams.noiseSourceType === 'file' && (
                                        <select value={larynxParams.noiseSourceFileId} onChange={e=>setLarynxParams({...larynxParams, noiseSourceFileId: e.target.value})} className="w-full p-2 border rounded-lg text-xs font-bold outline-none text-slate-900"><option value="">노이즈 파일 선택</option>{files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <ParamInput label="Pitch" value={manualPitch} min={50} max={600} step={1} onChange={setManualPitch} colorClass="text-amber-500" />
                                    <ParamInput label="Gender" value={manualGender} min={0.5} max={2.0} step={0.01} onChange={setManualGender} colorClass="text-pink-500" />
                                    <div className="h-px bg-slate-200 my-1" />
                                    {[ ['lips','입술 열기','text-pink-400'], ['lipLen','입술 길이','text-pink-600'], ['throat','목 조임','text-purple-400'], ['nasal','비성','text-orange-400'] ].map(([id,l,c]) => (
                                        <ParamInput key={id} label={l} value={(liveTract as any)[id]} min={0} max={1} step={0.01} onChange={(v:number)=>setLiveTract(p=>({...p,[id]:v}))} colorClass={c} />
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="h-[300px]"><ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={simPlaySourceRef.current} /></div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Bottom Section (Timeline Editor) - Responsive Flex */}
            <div className="flex-1 flex flex-col shrink-0 min-h-0 flex-[2]">
                <TimelineEditor 
                    advTracks={advTracks}
                    setAdvTracks={setAdvTracks}
                    selectedTrackId={selectedTrackId}
                    setSelectedTrackId={setSelectedTrackId}
                    playHeadPos={playHeadPos}
                    setPlayheadPos={setPlayheadPos}
                    syncVisualsToTime={syncVisualsToTime}
                    handleSimulationPlay={handleSimulationPlay}
                    isAdvPlaying={isAdvPlaying}
                    commitChange={commitChange}
                    isEditMode={isEditMode}
                    setIsEditMode={setIsEditMode}
                    showGhost={showGhost}
                    setShowGhost={setShowGhost}
                    ghostTracks={ghostTracks}
                    showSpectrogram={showSpectrogram}
                    spectrogramCanvas={spectrogramCanvasRef.current}
                    previewBuffer={previewBuffer}
                    getCurrentValue={getCurrentValue}
                    getValueAtTime={getValueAtTime}
                    simPauseOffsetRef={simPauseOffsetRef}
                    advDuration={advDuration}
                />
            </div>
        </div>
    );
};

export default AdvancedTractTab;
