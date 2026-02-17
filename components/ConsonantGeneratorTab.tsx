
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Wand2, Play, Save, Sliders, Activity, Volume2, Mic2, Zap, AudioLines } from 'lucide-react';
import { AudioFile, EQBand, FilterState } from '../types';
import ParametricEQ from './ParametricEQ';
import FilterControl from './ui/FilterControl';

interface ConsonantGeneratorTabProps {
  audioContext: AudioContext;
  files: AudioFile[];
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
  isActive: boolean;
}

const ConsonantGeneratorTab: React.FC<ConsonantGeneratorTabProps> = ({ audioContext, files, onAddToRack, isActive }) => {
    // Envelope Params
    const [duration, setDuration] = useState(200); 
    const [attack, setAttack] = useState(10); 
    const [decay, setDecay] = useState(50); 
    const [sustain, setSustain] = useState(0.2); 
    const [release, setRelease] = useState(100); 
    
    // Transient (Burst) Params
    const [transientOn, setTransientOn] = useState(false);
    const [transientGain, setTransientGain] = useState(0.8);
    const [transientFreq, setTransientFreq] = useState(1000); // Center freq for burst
    const [transientDecay, setTransientDecay] = useState(15); // Very short decay
    
    // Filter Params
    const [hpFilter, setHpFilter] = useState<FilterState>({ on: false, freq: 2000, q: 1.0 });
    const [lpFilter, setLpFilter] = useState<FilterState>({ on: false, freq: 8000, q: 1.0 });
    const [bpFilter, setBpFilter] = useState<FilterState>({ on: false, freq: 4000, q: 1.0 });

    const [gain, setGain] = useState(1.0); 
    const [noiseType, setNoiseType] = useState<'white' | 'pink'>('white');

    // Voice Source Params
    const [baseSource, setBaseSource] = useState<'synth' | 'file'>('synth');
    const [sourceMix, setSourceMix] = useState(0); 
    const [voiceFreq, setVoiceFreq] = useState(120);
    const [voiceWave, setVoiceWave] = useState<OscillatorType>('sawtooth');
    
    // EQ Bands
    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 100, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'peaking', freq: 2000, gain: 0, q: 1.0, on: true },
        { id: 3, type: 'highshelf', freq: 10000, gain: 0, q: 0.7, on: true }
    ]);
    const [showEQ, setShowEQ] = useState(false);
    const [selectedFileId, setSelectedFileId] = useState("");

    const [isPlaying, setIsPlaying] = useState(false);
    const [generatedBuffer, setGeneratedBuffer] = useState<AudioBuffer | null>(null);
    const [playheadTime, setPlayheadTime] = useState(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);

    // History
    const [history, setHistory] = useState<any[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const applyConsonantPreset = (char: 'S' | 'Sh' | 'T' | 'K' | 'P') => {
        // Reset base params for clear start
        setBaseSource('synth');
        setSourceMix(0); 
        setNoiseType('white');
        
        switch(char) {
            case 'S':
                setDuration(250); setAttack(30); setDecay(100); setSustain(0.7); setRelease(80);
                setHpFilter({on:true, freq: 3500, q: 0.8});
                setBpFilter({on:false, freq: 4000, q: 1});
                setLpFilter({on:false, freq: 8000, q: 1});
                setTransientOn(false);
                break;
            case 'Sh':
                setDuration(250); setAttack(30); setDecay(100); setSustain(0.8); setRelease(100);
                setHpFilter({on:true, freq: 1500, q: 0.7});
                setBpFilter({on:true, freq: 2500, q: 0.8}); // Characteristic resonance
                setLpFilter({on:true, freq: 6000, q: 1.0});
                setTransientOn(false);
                break;
            case 'T':
                setDuration(60); setAttack(2); setDecay(25); setSustain(0); setRelease(20);
                setHpFilter({on:true, freq: 3500, q: 1.0});
                setBpFilter({on:false, freq: 4000, q: 1});
                setLpFilter({on:false, freq: 8000, q: 1});
                setTransientOn(true); setTransientGain(0.9); setTransientFreq(4500); setTransientDecay(8);
                break;
            case 'K':
                setDuration(80); setAttack(5); setDecay(40); setSustain(0); setRelease(30);
                setHpFilter({on:false, freq: 2000, q: 1});
                setBpFilter({on:true, freq: 1500, q: 2.5}); // Velar pinch (Mid resonance)
                setLpFilter({on:false, freq: 8000, q: 1});
                setTransientOn(true); setTransientGain(0.8); setTransientFreq(1500); setTransientDecay(12);
                break;
            case 'P':
                setDuration(60); setAttack(2); setDecay(30); setSustain(0); setRelease(30);
                setNoiseType('pink'); // Darker noise
                setHpFilter({on:false, freq: 200, q: 1});
                setBpFilter({on:false, freq: 500, q: 1});
                setLpFilter({on:true, freq: 800, q: 1.0}); // Low focus
                setTransientOn(true); setTransientGain(1.0); setTransientFreq(300); setTransientDecay(10);
                break;
        }
        commitChange(`${char} 프리셋 적용`);
    };

    const getCurrentState = useCallback(() => ({
        duration, attack, decay, sustain, release, hpFilter, lpFilter, bpFilter, gain, noiseType, baseSource, sourceMix, voiceFreq, voiceWave, selectedFileId, eqBands,
        transientOn, transientGain, transientFreq, transientDecay
    }), [duration, attack, decay, sustain, release, hpFilter, lpFilter, bpFilter, gain, noiseType, baseSource, sourceMix, voiceFreq, voiceWave, selectedFileId, eqBands, transientOn, transientGain, transientFreq, transientDecay]);

    const saveHistory = useCallback((label: string) => {
        const state = getCurrentState();
        setHistory(prev => {
            const newHist = prev.slice(0, historyIndex + 1);
            if (newHist.length > 0 && JSON.stringify(newHist[newHist.length-1].state) === JSON.stringify(state)) return prev;
            return [...newHist.slice(-9), { state, label }];
        });
        setHistoryIndex(prev => Math.min(prev + 1, 9));
    }, [getCurrentState, historyIndex]);

    useEffect(() => { if (history.length === 0) saveHistory("초기 상태"); }, []);

    const restoreState = (state: any) => {
        setDuration(state.duration); setAttack(state.attack); setDecay(state.decay); setSustain(state.sustain); setRelease(state.release);
        setHpFilter(state.hpFilter); setLpFilter(state.lpFilter); setBpFilter(state.bpFilter); 
        setGain(state.gain); setNoiseType(state.noiseType);
        setBaseSource(state.baseSource); setSourceMix(state.sourceMix); setVoiceFreq(state.voiceFreq); setVoiceWave(state.voiceWave); setSelectedFileId(state.selectedFileId);
        if(state.eqBands) setEqBands(state.eqBands);
        if(state.transientOn !== undefined) {
            setTransientOn(state.transientOn); setTransientGain(state.transientGain); setTransientFreq(state.transientFreq); setTransientDecay(state.transientDecay);
        }
    };

    const handleUndo = () => { if (historyIndex > 0) { const p = historyIndex - 1; restoreState(history[p].state); setHistoryIndex(p); } };
    const handleRedo = () => { if (historyIndex < history.length - 1) { const n = historyIndex + 1; restoreState(history[n].state); setHistoryIndex(n); } };
    const commitChange = (label: string = "파라미터 변경") => saveHistory(label);

    const generateAudio = async () => {
        if (!audioContext) return null;
        
        const totalDurationSec = duration / 1000;
        const sr = audioContext.sampleRate;
        const offline = new OfflineAudioContext(1, Math.ceil(totalDurationSec * sr), sr);
        const finalMix = offline.createGain();

        // 1. Transient (Burst) Generator
        if (transientOn) {
            const tDur = transientDecay / 1000;
            const tBufSize = Math.ceil(tDur * sr);
            const tBuf = offline.createBuffer(1, tBufSize, sr);
            const tData = tBuf.getChannelData(0);
            
            // Generate simple noise burst
            for (let i = 0; i < tBufSize; i++) tData[i] = (Math.random() * 2 - 1);

            const tSrc = offline.createBufferSource();
            tSrc.buffer = tBuf;
            
            // Color the burst
            const tFilter = offline.createBiquadFilter();
            tFilter.type = 'bandpass';
            tFilter.frequency.value = transientFreq;
            tFilter.Q.value = 1.0;

            const tAmp = offline.createGain();
            tAmp.gain.setValueAtTime(transientGain, 0);
            tAmp.gain.exponentialRampToValueAtTime(0.01, tDur);

            tSrc.connect(tFilter);
            tFilter.connect(tAmp);
            tAmp.connect(finalMix);
            tSrc.start(0);
        }

        // 2. Main Body (Noise + Tone)
        const sourceMixNode = offline.createGain();

        if (baseSource === 'file') {
             const file = files.find(f => f.id === selectedFileId);
             if (file?.buffer) {
                 const src = offline.createBufferSource();
                 src.buffer = file.buffer;
                 src.connect(sourceMixNode);
                 src.start(0);
             }
        } else {
            // Noise
            if (sourceMix < 1.0) {
                const bufferSize = sr * totalDurationSec;
                const buffer = offline.createBuffer(1, bufferSize, sr);
                const data = buffer.getChannelData(0);
                if (noiseType === 'white') {
                    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                } else {
                    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
                    for (let i = 0; i < bufferSize; i++) {
                        const white = Math.random() * 2 - 1;
                        b0 = 0.99886 * b0 + white * 0.0555179;
                        b1 = 0.99332 * b1 + white * 0.0750759;
                        b2 = 0.96900 * b2 + white * 0.1538520;
                        b3 = 0.86650 * b3 + white * 0.3104856;
                        b4 = 0.55000 * b4 + white * 0.5329522;
                        b5 = -0.7616 * b5 - white * 0.0168980;
                        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                        data[i] *= 0.11; b6 = white * 0.115926;
                    }
                }
                const noiseSrc = offline.createBufferSource(); noiseSrc.buffer = buffer;
                const noiseGain = offline.createGain(); noiseGain.gain.value = 1.0 - sourceMix;
                noiseSrc.connect(noiseGain); noiseGain.connect(sourceMixNode);
                noiseSrc.start(0);
            }
            // Voice
            if (sourceMix > 0.0) {
                const osc = offline.createOscillator(); osc.type = voiceWave; osc.frequency.value = voiceFreq;
                const oscGain = offline.createGain(); oscGain.gain.value = sourceMix;
                osc.connect(oscGain); oscGain.connect(sourceMixNode);
                osc.start(0);
            }
        }

        // Filter Chain
        let currentNode: AudioNode = sourceMixNode;
        if (hpFilter.on) {
            const f = offline.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hpFilter.freq; f.Q.value = hpFilter.q;
            currentNode.connect(f); currentNode = f;
        }
        if (lpFilter.on) {
            const f = offline.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpFilter.freq; f.Q.value = lpFilter.q;
            currentNode.connect(f); currentNode = f;
        }
        if (bpFilter.on) {
            const f = offline.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bpFilter.freq; f.Q.value = bpFilter.q;
            currentNode.connect(f); currentNode = f;
        }

        const amp = offline.createGain();
        const t0 = 0, tAtt = attack / 1000, tDec = decay / 1000, tRel = release / 1000;
        const decayEndTime = t0 + tAtt + tDec;
        const releaseStartTime = Math.max(decayEndTime, totalDurationSec - tRel);

        amp.gain.setValueAtTime(0, t0);
        amp.gain.linearRampToValueAtTime(gain, t0 + tAtt); 
        amp.gain.linearRampToValueAtTime(gain * sustain, decayEndTime); 
        amp.gain.setValueAtTime(gain * sustain, releaseStartTime); 
        amp.gain.linearRampToValueAtTime(0, totalDurationSec); 

        currentNode.connect(amp);
        amp.connect(finalMix);
        
        // Master EQ Chain
        let eqNode: AudioNode = finalMix;
        eqBands.forEach(b => {
            if(b.on) {
                const f = offline.createBiquadFilter(); f.type = b.type; f.frequency.value = b.freq; f.Q.value = b.q; f.gain.value = b.gain;
                eqNode.connect(f); eqNode = f;
            }
        });
        
        eqNode.connect(offline.destination);
        return await offline.startRendering();
    };

    const handleGenerateAndPlay = useCallback(async () => {
        if(isPlaying) {
             if(sourceRef.current) { try{sourceRef.current.stop()}catch(e){} sourceRef.current = null; }
             setIsPlaying(false); setPlayheadTime(0); return;
        }
        const buf = await generateAudio();
        if (buf) {
            setGeneratedBuffer(buf);
            const source = audioContext.createBufferSource(); source.buffer = buf; source.connect(audioContext.destination); source.start();
            sourceRef.current = source; setIsPlaying(true);
            const startTime = audioContext.currentTime;
            const animate = () => {
                const elapsed = audioContext.currentTime - startTime;
                if(elapsed < buf.duration) { setPlayheadTime(elapsed); requestAnimationFrame(animate); } else { setIsPlaying(false); setPlayheadTime(0); }
            };
            requestAnimationFrame(animate);
        }
    }, [isPlaying, generateAudio, audioContext]);

    useEffect(() => { 
        if (!isActive) return;
        const handleKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); handleGenerateAndPlay(); } }; 
        window.addEventListener('keydown', handleKey); 
        return () => window.removeEventListener('keydown', handleKey); 
    }, [isActive, handleGenerateAndPlay]);

    const handleSave = async () => {
        const buf = generatedBuffer || await generateAudio();
        if (buf) { onAddToRack(buf, `Gen_Sound`); }
    };

    useEffect(() => {
        const draw = async () => {
            const buf = generatedBuffer || await generateAudio();
            if(!buf || !canvasRef.current) return;
            const ctx = canvasRef.current.getContext('2d'); if(!ctx) return;
            const w = canvasRef.current.width, h = canvasRef.current.height;
            const data = buf.getChannelData(0); const step = Math.ceil(data.length / w);
            ctx.clearRect(0,0,w,h); ctx.fillStyle = '#1e293b'; ctx.fillRect(0,0,w,h);
            ctx.beginPath(); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2;
            for(let i=0; i<w; i++){
                let min=1.0, max=-1.0;
                for(let j=0; j<step; j++) {
                    const idx = (i*step)+j; if(idx < data.length) { const datum = data[idx]; if(datum < min) min = datum; if(datum > max) max = datum; }
                }
                ctx.moveTo(i, h/2 + min * h/2.5); ctx.lineTo(i, h/2 + max * h/2.5);
            }
            ctx.stroke();
            if (playheadTime > 0) {
                const durationSec = duration / 1000; const px = (playheadTime / durationSec) * w;
                if(px >= 0 && px <= w) { ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke(); }
            }
        };
        draw();
    }, [duration, attack, decay, sustain, release, hpFilter, lpFilter, bpFilter, gain, noiseType, sourceMix, voiceFreq, voiceWave, generatedBuffer, baseSource, selectedFileId, playheadTime, eqBands, transientOn, transientGain, transientFreq, transientDecay]);

    useEffect(() => { setGeneratedBuffer(null); }, [duration, attack, decay, sustain, release, hpFilter, lpFilter, bpFilter, gain, noiseType, sourceMix, voiceFreq, voiceWave, baseSource, selectedFileId, eqBands, transientOn, transientGain, transientFreq, transientDecay]);

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in overflow-hidden font-sans font-bold">
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm h-full overflow-y-auto custom-scrollbar">
                 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-500 rounded-xl text-white shadow-lg shadow-cyan-200"><Wand2 size={24}/></div>
                        <h2 className="text-xl text-slate-800 tracking-tight font-black">자음 생성기</h2>
                    </div>
                    <div className="flex items-center gap-2 font-black">
                         <span className="text-xs text-slate-400 font-black mr-2 uppercase tracking-tight">Quick Presets:</span>
                         <button onClick={()=>applyConsonantPreset('S')} className="w-8 h-8 flex items-center justify-center bg-white hover:bg-indigo-50 border border-slate-300 rounded-lg text-xs font-black text-indigo-900 transition-all shadow-sm">S</button>
                         <button onClick={()=>applyConsonantPreset('Sh')} className="w-8 h-8 flex items-center justify-center bg-white hover:bg-indigo-50 border border-slate-300 rounded-lg text-xs font-black text-indigo-900 transition-all shadow-sm">Sh</button>
                         <div className="w-px h-6 bg-slate-300 mx-1"></div>
                         <button onClick={()=>applyConsonantPreset('T')} className="w-8 h-8 flex items-center justify-center bg-white hover:bg-pink-50 border border-slate-300 rounded-lg text-xs font-black text-pink-900 transition-all shadow-sm">T</button>
                         <button onClick={()=>applyConsonantPreset('K')} className="w-8 h-8 flex items-center justify-center bg-white hover:bg-pink-50 border border-slate-300 rounded-lg text-xs font-black text-pink-900 transition-all shadow-sm">K</button>
                         <button onClick={()=>applyConsonantPreset('P')} className="w-8 h-8 flex items-center justify-center bg-white hover:bg-pink-50 border border-slate-300 rounded-lg text-xs font-black text-pink-900 transition-all shadow-sm">P</button>
                         <div className="w-px h-6 bg-slate-300 mx-2"></div>
                         <button onClick={()=>setShowEQ(!showEQ)} className={`px-4 py-2 rounded-md text-sm font-black flex items-center gap-2 transition-all ${showEQ ? 'bg-white shadow text-pink-600' : 'text-slate-500'}`}><AudioLines size={16}/> Master EQ</button>
                    </div>
                 </div>

                 {showEQ && (
                    <div className="flex justify-center mb-4 animate-in fade-in slide-in-from-top-4 shrink-0">
                        <div className="w-full max-w-4xl h-48">
                            <ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={sourceRef.current} />
                        </div>
                    </div>
                 )}

                 <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0">
                    <div className="lg:col-span-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2" onMouseUp={()=>commitChange()}>
                        {/* Source Selection */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2"><Mic2 size={16}/> 소스 (Source)</h3>
                            <div className="space-y-3">
                                <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                                    <button onClick={()=>setBaseSource('synth')} className={`flex-1 py-1.5 rounded text-xs font-black transition-all ${baseSource==='synth'?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>신디사이저</button>
                                    <button onClick={()=>setBaseSource('file')} className={`flex-1 py-1.5 rounded text-xs font-black transition-all ${baseSource==='file'?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>파일</button>
                                </div>
                                {baseSource==='file' ? (
                                    <select value={selectedFileId} onChange={e=>setSelectedFileId(e.target.value)} className="w-full p-2 border rounded text-xs font-black text-slate-900"><option value="">파일 선택</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Noise Mix</span><span>{Math.round((1-sourceMix)*100)}%</span></div><input type="range" min="0" max="1" step="0.05" value={1-sourceMix} onChange={e=>setSourceMix(1-Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"/></div>
                                        <div className="flex gap-2"><button onClick={()=>setNoiseType('white')} className={`flex-1 py-1 text-[10px] font-black rounded border ${noiseType==='white'?'bg-slate-700 text-white':'bg-white text-slate-500'}`}>White Noise</button><button onClick={()=>setNoiseType('pink')} className={`flex-1 py-1 text-[10px] font-black rounded border ${noiseType==='pink'?'bg-slate-700 text-white':'bg-white text-slate-500'}`}>Pink Noise</button></div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Transient Generator (New) */}
                        <div className={`bg-white p-6 rounded-xl border transition-all shadow-sm space-y-4 ${transientOn ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200'}`}>
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2"><Zap size={16} className={transientOn ? "text-amber-500" : ""}/> Transient (Burst)</h3>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={transientOn} onChange={e=>setTransientOn(e.target.checked)} className="sr-only peer"/>
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                </label>
                            </div>
                            {transientOn && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Burst Gain</span><span>{Math.round(transientGain*100)}%</span></div><input type="range" min="0" max="1.5" step="0.1" value={transientGain} onChange={e=>setTransientGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-amber-500"/></div>
                                    <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Burst Freq</span><span>{transientFreq} Hz</span></div><input type="range" min="100" max="8000" step="100" value={transientFreq} onChange={e=>setTransientFreq(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-amber-500"/></div>
                                    <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Burst Decay</span><span>{transientDecay} ms</span></div><input type="range" min="5" max="50" step="1" value={transientDecay} onChange={e=>setTransientDecay(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-amber-500"/></div>
                                </div>
                            )}
                        </div>
                        
                        {/* Multi-Filter Section */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2"><Sliders size={16}/> 멀티 필터</h3>
                            <div className="space-y-3">
                                <FilterControl label="Highpass" state={hpFilter} onChange={setHpFilter} minFreq={200} />
                                <FilterControl label="Bandpass" state={bpFilter} onChange={setBpFilter} minFreq={100} />
                                <FilterControl label="Lowpass" state={lpFilter} onChange={setLpFilter} minFreq={500} />
                            </div>
                        </div>

                        {/* Envelope Section */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
                            <h3 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2"><Activity size={16}/> 엔벨로프 (ADSR)</h3>
                            <div className="space-y-4">
                                <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Duration</span><span>{duration} ms</span></div><input type="range" min="20" max="1000" value={duration} onChange={e=>setDuration(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-indigo-500"/></div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                    <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Attack</span><span>{attack} ms</span></div><input type="range" min="0" max="200" value={attack} onChange={e=>setAttack(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-indigo-500"/></div>
                                    <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Decay</span><span>{decay} ms</span></div><input type="range" min="0" max="200" value={decay} onChange={e=>setDecay(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-indigo-500"/></div>
                                    <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Sustain</span><span>{Math.round(sustain*100)}%</span></div><input type="range" min="0" max="1" step="0.01" value={sustain} onChange={e=>setSustain(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-indigo-500"/></div>
                                    <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Release</span><span>{release} ms</span></div><input type="range" min="0" max="500" value={release} onChange={e=>setRelease(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-indigo-500"/></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Visualizer & Action Column */}
                    <div className="lg:col-span-2 flex flex-col gap-4">
                        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 relative overflow-hidden shadow-inner group">
                             <canvas ref={canvasRef} width={800} height={400} className="w-full h-full object-cover opacity-80"/>
                             <div className="absolute top-4 right-4 flex flex-col items-end gap-1 font-black">
                                {transientOn && <span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded text-xs backdrop-blur font-mono border border-amber-500/30">Transient ON</span>}
                                {hpFilter.on && <span className="bg-black/50 text-cyan-400 px-2 py-1 rounded text-xs backdrop-blur font-mono">HP {hpFilter.freq}Hz</span>}
                                {bpFilter.on && <span className="bg-black/50 text-cyan-400 px-2 py-1 rounded text-xs backdrop-blur font-mono">BP {bpFilter.freq}Hz</span>}
                                {lpFilter.on && <span className="bg-black/50 text-cyan-400 px-2 py-1 rounded text-xs backdrop-blur font-mono">LP {lpFilter.freq}Hz</span>}
                             </div>
                        </div>
                        <div className="h-24 bg-white rounded-2xl border border-slate-300 p-6 flex items-center justify-between shadow-sm">
                             <div className="flex items-center gap-6">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-tighter">Output Gain</span>
                                    <div className="flex items-center gap-3">
                                        <Volume2 size={20} className="text-slate-500"/>
                                        <input type="range" min="0" max="2" step="0.1" value={gain} onChange={e=>setGain(Number(e.target.value))} className="w-32 h-2 bg-slate-200 rounded-full appearance-none accent-slate-600"/>
                                        <span className="text-sm font-black text-slate-900 w-10">{Math.round(gain*100)}%</span>
                                    </div>
                                </div>
                             </div>
                             <div className="flex gap-4">
                                 <button onClick={handleGenerateAndPlay} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black flex items-center gap-2 shadow-lg transition-all active:scale-95 text-base">
                                    <Play size={20} fill="currentColor"/> {isPlaying ? '재생 중...' : '생성 및 재생'}
                                 </button>
                                 <button onClick={handleSave} className="px-8 py-4 bg-white border border-slate-300 text-slate-900 hover:bg-slate-50 rounded-xl font-black flex items-center gap-2 transition-all active:scale-95 text-base">
                                    <Save size={20}/> 보관함에 저장
                                 </button>
                             </div>
                        </div>
                    </div>
                 </div>
            </div>
        </div>
    );
};

export default ConsonantGeneratorTab;