import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Wand2, Play, Save, Sliders, Activity, Volume2, Mic2, FileAudio, Undo2, Redo2, History } from 'lucide-react';
import { AudioFile } from '../types';

interface ConsonantGeneratorTabProps {
  audioContext: AudioContext;
  files: AudioFile[];
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
}

const ConsonantGeneratorTab: React.FC<ConsonantGeneratorTabProps> = ({ audioContext, files, onAddToRack }) => {
    // Envelope Params
    const [duration, setDuration] = useState(200); // Total duration in ms
    const [attack, setAttack] = useState(10); // ms
    const [decay, setDecay] = useState(50); // ms
    const [sustain, setSustain] = useState(0.2); // Level 0-1
    const [release, setRelease] = useState(100); // ms
    
    // Filter Params
    const [filterType, setFilterType] = useState<BiquadFilterType>('highpass');
    const [frequency, setFrequency] = useState(4000);
    const [Q, setQ] = useState(1.0);
    const [gain, setGain] = useState(1.0); // Output gain
    const [noiseType, setNoiseType] = useState<'white' | 'pink'>('white');

    // Voice Source Params
    const [baseSource, setBaseSource] = useState<'synth' | 'file'>('synth');
    const [sourceMix, setSourceMix] = useState(0); // 0 = Noise only, 1 = Voice only
    const [voiceFreq, setVoiceFreq] = useState(120);
    const [voiceWave, setVoiceWave] = useState<OscillatorType>('sawtooth');
    
    // File Source Params
    const [selectedFileId, setSelectedFileId] = useState("");

    const [isPlaying, setIsPlaying] = useState(false);
    const [generatedBuffer, setGeneratedBuffer] = useState<AudioBuffer | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);

    // History
    const [history, setHistory] = useState<any[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [showHistory, setShowHistory] = useState(false);

    // Snapshot state for history
    const getCurrentState = useCallback(() => ({
        duration, attack, decay, sustain, release, filterType, frequency, Q, gain, noiseType, baseSource, sourceMix, voiceFreq, voiceWave, selectedFileId
    }), [duration, attack, decay, sustain, release, filterType, frequency, Q, gain, noiseType, baseSource, sourceMix, voiceFreq, voiceWave, selectedFileId]);

    const saveHistory = useCallback((label: string) => {
        const state = getCurrentState();
        setHistory(prev => {
            const newHist = prev.slice(0, historyIndex + 1);
            if (newHist.length > 0 && JSON.stringify(newHist[newHist.length-1].state) === JSON.stringify(state)) return prev;
            return [...newHist.slice(-9), { state, label }];
        });
        setHistoryIndex(prev => Math.min(prev + 1, 9));
    }, [getCurrentState, historyIndex]);

    // Initial history
    useEffect(() => {
        if (history.length === 0) saveHistory("초기 상태");
    }, []);

    const restoreState = (state: any) => {
        setDuration(state.duration); setAttack(state.attack); setDecay(state.decay); setSustain(state.sustain); setRelease(state.release);
        setFilterType(state.filterType); setFrequency(state.frequency); setQ(state.Q); setGain(state.gain); setNoiseType(state.noiseType);
        setBaseSource(state.baseSource); setSourceMix(state.sourceMix); setVoiceFreq(state.voiceFreq); setVoiceWave(state.voiceWave); setSelectedFileId(state.selectedFileId);
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const prevIndex = historyIndex - 1;
            restoreState(history[prevIndex].state);
            setHistoryIndex(prevIndex);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            restoreState(history[nextIndex].state);
            setHistoryIndex(nextIndex);
        }
    };

    // Wrapper for setters to save history on interaction end (simplified by using separate effects or saving on mouse up/change)
    // For sliders, better to save onMouseUp. But React state updates are async.
    // We'll use a simple "Record Change" approach on key interactions if possible, or just add a manual snapshot.
    // Actually, let's auto-save on change but debounce or check diff? 
    // Implementing robust undo for sliders in this architecture is tricky. 
    // I will trigger saveHistory when the user *commits* a change (e.g., Preset load) and also add an effect that watches all params with debounce?
    // No, debounce is bad for history. I will add onMouseUp handlers to sliders to commit history.

    const commitChange = (label: string = "파라미터 변경") => saveHistory(label);

    // Preset configurations
    const loadPreset = (type: 's' | 'sh' | 't' | 'k' | 'h' | 'g' | 'n' | 'm' | 'z') => {
        setBaseSource('synth');
        if(type === 's') {
            setFilterType('highpass'); setFrequency(4500); setQ(2); setDuration(250); setAttack(20); setDecay(50); setSustain(0.8); setRelease(100); setNoiseType('white'); setSourceMix(0);
        } else if (type === 'sh') {
            setFilterType('bandpass'); setFrequency(2500); setQ(1.5); setDuration(250); setAttack(30); setDecay(50); setSustain(0.8); setRelease(100); setNoiseType('white'); setSourceMix(0);
        } else if (type === 't') {
            setFilterType('highpass'); setFrequency(3000); setQ(1); setDuration(80); setAttack(2); setDecay(15); setSustain(0); setRelease(20); setNoiseType('white'); setSourceMix(0);
        } else if (type === 'k') {
            setFilterType('lowpass'); setFrequency(1500); setQ(1); setDuration(100); setAttack(5); setDecay(30); setSustain(0); setRelease(30); setNoiseType('pink'); setSourceMix(0);
        } else if (type === 'h') {
            setFilterType('bandpass'); setFrequency(1000); setQ(0.5); setDuration(200); setAttack(40); setDecay(50); setSustain(0.6); setRelease(80); setNoiseType('pink'); setSourceMix(0);
        } else if (type === 'g') {
            setFilterType('lowpass'); setFrequency(800); setQ(1); setDuration(100); setAttack(10); setDecay(40); setSustain(0.1); setRelease(30); setNoiseType('pink'); setSourceMix(0.4); setVoiceWave('sawtooth'); setVoiceFreq(100);
        } else if (type === 'n') {
            setFilterType('bandpass'); setFrequency(1200); setQ(2); setDuration(300); setAttack(30); setDecay(20); setSustain(0.9); setRelease(80); setNoiseType('pink'); setSourceMix(0.8); setVoiceWave('triangle'); setVoiceFreq(120);
        } else if (type === 'm') {
            setFilterType('lowpass'); setFrequency(300); setQ(1); setDuration(300); setAttack(30); setDecay(20); setSustain(0.9); setRelease(80); setNoiseType('pink'); setSourceMix(0.9); setVoiceWave('sine'); setVoiceFreq(120);
        } else if (type === 'z') {
            setFilterType('highpass'); setFrequency(4000); setQ(2); setDuration(250); setAttack(20); setDecay(50); setSustain(0.8); setRelease(100); setNoiseType('white'); setSourceMix(0.3); setVoiceWave('sawtooth'); setVoiceFreq(120);
        }
        // Defer history save to allow state update
        setTimeout(() => saveHistory("프리셋 " + type.toUpperCase()), 50);
    };

    const generateAudio = async () => {
        if (!audioContext) return null;
        
        // Ensure duration covers the envelope
        const totalDurationSec = duration / 1000;
        const sr = audioContext.sampleRate;
        const offline = new OfflineAudioContext(1, Math.ceil(totalDurationSec * sr), sr);

        // Mix Node
        const mixNode = offline.createGain();

        if (baseSource === 'file') {
             // File Source
             const file = files.find(f => f.id === selectedFileId);
             if (file?.buffer) {
                 const src = offline.createBufferSource();
                 src.buffer = file.buffer;
                 src.connect(mixNode);
                 src.start(0);
             }
        } else {
             // Synth Source (Noise + Osc)
            // 1. Noise Source
            if (sourceMix < 1.0) {
                const bufferSize = sr * totalDurationSec;
                const buffer = offline.createBuffer(1, bufferSize, sr);
                const data = buffer.getChannelData(0);
                
                if (noiseType === 'white') {
                    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                } else {
                    // Pink Noise
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
                        data[i] *= 0.11; 
                        b6 = white * 0.115926;
                    }
                }
                const noiseSrc = offline.createBufferSource();
                noiseSrc.buffer = buffer;
                const noiseGain = offline.createGain();
                noiseGain.gain.value = 1.0 - sourceMix;
                noiseSrc.connect(noiseGain);
                noiseGain.connect(mixNode);
                noiseSrc.start(0);
            }

            // 2. Voice Source (Oscillator)
            if (sourceMix > 0.0) {
                const osc = offline.createOscillator();
                osc.type = voiceWave;
                osc.frequency.value = voiceFreq;
                const oscGain = offline.createGain();
                oscGain.gain.value = sourceMix;
                osc.connect(oscGain);
                oscGain.connect(mixNode);
                osc.start(0);
            }
        }

        // Filter
        const filter = offline.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = frequency;
        filter.Q.value = Q;

        // Gain Envelope (ADSR)
        const amp = offline.createGain();
        const t0 = 0;
        const tAtt = attack / 1000;
        const tDec = decay / 1000;
        const tRel = release / 1000;
        
        const decayEndTime = t0 + tAtt + tDec;
        const releaseStartTime = Math.max(decayEndTime, totalDurationSec - tRel);

        amp.gain.setValueAtTime(0, t0);
        amp.gain.linearRampToValueAtTime(gain, t0 + tAtt); // Attack
        amp.gain.linearRampToValueAtTime(gain * sustain, decayEndTime); // Decay
        amp.gain.setValueAtTime(gain * sustain, releaseStartTime); // Sustain Hold
        amp.gain.linearRampToValueAtTime(0, totalDurationSec); // Release

        mixNode.connect(filter);
        filter.connect(amp);
        amp.connect(offline.destination);

        return await offline.startRendering();
    };

    const handleGenerateAndPlay = async () => {
        const buf = await generateAudio();
        if (buf) {
            setGeneratedBuffer(buf);
            const source = audioContext.createBufferSource();
            source.buffer = buf;
            source.connect(audioContext.destination);
            source.start();
            sourceRef.current = source;
            setIsPlaying(true);
            source.onended = () => setIsPlaying(false);
        }
    };

    const handleSave = async () => {
        const buf = generatedBuffer || await generateAudio();
        if (buf) {
            onAddToRack(buf, `Gen_${filterType}_${frequency}Hz`);
        }
    };

    // Visualization
    useEffect(() => {
        const draw = async () => {
            const buf = generatedBuffer || await generateAudio();
            if(!buf || !canvasRef.current) return;
            
            const ctx = canvasRef.current.getContext('2d');
            if(!ctx) return;
            const w = canvasRef.current.width;
            const h = canvasRef.current.height;
            const data = buf.getChannelData(0);
            const step = Math.ceil(data.length / w);
            
            ctx.clearRect(0,0,w,h);
            ctx.fillStyle = '#1e293b'; 
            ctx.fillRect(0,0,w,h);
            
            ctx.beginPath();
            ctx.strokeStyle = '#22d3ee'; 
            ctx.lineWidth = 2;
            
            for(let i=0; i<w; i++){
                let min=1.0, max=-1.0;
                for(let j=0; j<step; j++) {
                    const datum = data[(i*step)+j];
                    if(datum < min) min = datum;
                    if(datum > max) max = datum;
                }
                ctx.moveTo(i, h/2 + min * h/2.5);
                ctx.lineTo(i, h/2 + max * h/2.5);
            }
            ctx.stroke();

            // Draw Envelope Overlay
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            const tTotal = duration;
            const pxAtt = (attack / tTotal) * w;
            const pxDec = (decay / tTotal) * w;
            const pxRel = (release / tTotal) * w;
            const pxSus = w - pxAtt - pxDec - pxRel;
            
            ctx.moveTo(0, h);
            ctx.lineTo(pxAtt, h - (h * gain * 0.9)); 
            ctx.lineTo(pxAtt + pxDec, h - (h * gain * sustain * 0.9)); 
            if (pxSus > 0) ctx.lineTo(pxAtt + pxDec + pxSus, h - (h * gain * sustain * 0.9));
            ctx.lineTo(w, h); 
            ctx.stroke();
        };
        draw();
    }, [duration, attack, decay, sustain, release, filterType, frequency, Q, gain, noiseType, sourceMix, voiceFreq, voiceWave, generatedBuffer, baseSource, selectedFileId]);

    useEffect(() => {
        setGeneratedBuffer(null);
    }, [duration, attack, decay, sustain, release, filterType, frequency, Q, gain, noiseType, sourceMix, voiceFreq, voiceWave, baseSource, selectedFileId]);

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in overflow-hidden font-sans font-bold">
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm h-full">
                 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-500 rounded-xl text-white shadow-lg shadow-cyan-200">
                            <Wand2 size={24}/>
                        </div>
                        <h2 className="text-xl text-slate-800 tracking-tight font-black">자음 생성기</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                            <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30 transition-all"><Undo2 size={16}/></button>
                            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 hover:bg-white rounded text-slate-600 disabled:opacity-30 transition-all"><Redo2 size={16}/></button>
                            <div className="relative">
                                <button onClick={()=>setShowHistory(!showHistory)} className={`p-1.5 rounded text-slate-600 transition-all ${showHistory ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-white'}`}><History size={16}/></button>
                                {showHistory && <div className="absolute top-10 right-0 bg-white border border-slate-200 rounded-lg shadow-xl w-48 z-50 p-2 text-xs">
                                    <h4 className="font-black text-slate-400 px-2 py-1 uppercase text-[10px]">History</h4>
                                    <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                                        {history.length === 0 && <div className="p-2 text-slate-400 italic">내역 없음</div>}
                                        {history.slice().reverse().map((h, i) => {
                                            const realIdx = history.length - 1 - i;
                                            return (
                                                <div key={realIdx} onClick={()=>{restoreState(h.state); setHistoryIndex(realIdx);}} className={`p-2 hover:bg-slate-50 rounded flex justify-between cursor-pointer ${realIdx === historyIndex ? 'bg-indigo-50 font-bold text-indigo-600' : ''}`}>
                                                    <span>{h.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>}
                            </div>
                        </div>
                        <div className="w-px h-6 bg-slate-300 mx-2"></div>
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-xs text-slate-400 font-bold uppercase">Presets</span>
                            <div className="flex gap-2">
                                <button onClick={()=>loadPreset('t')} className="px-3 py-1 bg-white border rounded-lg text-xs hover:bg-slate-50 font-bold text-slate-600">T</button>
                                <button onClick={()=>loadPreset('k')} className="px-3 py-1 bg-white border rounded-lg text-xs hover:bg-slate-50 font-bold text-slate-600">K</button>
                                <button onClick={()=>loadPreset('s')} className="px-3 py-1 bg-white border rounded-lg text-xs hover:bg-slate-50 font-bold text-slate-600">S</button>
                                <button onClick={()=>loadPreset('sh')} className="px-3 py-1 bg-white border rounded-lg text-xs hover:bg-slate-50 font-bold text-slate-600">SH</button>
                                <button onClick={()=>loadPreset('g')} className="px-3 py-1 bg-white border border-indigo-100 rounded-lg text-xs hover:bg-indigo-50 font-bold text-indigo-600">G</button>
                                <button onClick={()=>loadPreset('n')} className="px-3 py-1 bg-white border border-indigo-100 rounded-lg text-xs hover:bg-indigo-50 font-bold text-indigo-600">N</button>
                            </div>
                        </div>
                    </div>
                 </div>

                 <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0">
                    <div className="lg:col-span-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2" onMouseUp={()=>commitChange()}>
                        
                        {/* Source Selection & Settings */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
                             <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2"><Mic2 size={16}/> 소스 (Source)</h3>
                                <div className="flex bg-slate-100 p-0.5 rounded-lg">
                                    <button onClick={()=>setBaseSource('synth')} className={`px-4 py-1.5 text-xs rounded-md font-bold transition-all ${baseSource==='synth'?'bg-white shadow text-slate-800':'text-slate-400'}`}>합성</button>
                                    <button onClick={()=>setBaseSource('file')} className={`px-4 py-1.5 text-xs rounded-md font-bold transition-all ${baseSource==='file'?'bg-white shadow text-slate-800':'text-slate-400'}`}>파일</button>
                                </div>
                             </div>

                             {baseSource === 'synth' ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-slate-500 font-bold">
                                            <span className={sourceMix < 0.5 ? 'text-cyan-600' : ''}>Noise</span>
                                            <span className={sourceMix > 0.5 ? 'text-indigo-600' : ''}>Voice</span>
                                        </div>
                                        <input type="range" min="0" max="1" step="0.05" value={sourceMix} onChange={e=>setSourceMix(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-slate-600"/>
                                        <div className="flex justify-between text-[10px] text-slate-400">
                                            <span>{Math.round((1-sourceMix)*100)}%</span>
                                            <span>{Math.round(sourceMix*100)}%</span>
                                        </div>
                                    </div>

                                    {/* Voice Settings */}
                                    <div className={`space-y-3 transition-opacity ${sourceMix === 0 ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                        <div className="flex gap-1">
                                            {['sine', 'triangle', 'sawtooth', 'square'].map(t => (
                                                <button key={t} onClick={()=>setVoiceWave(t as OscillatorType)} className={`flex-1 py-1.5 text-[10px] rounded border font-bold uppercase transition-all ${voiceWave===t ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                    {t.substr(0,3)}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs text-slate-500 font-bold"><span>Voice Pitch</span><span>{voiceFreq} Hz</span></div>
                                            <input type="range" min="50" max="400" step="1" value={voiceFreq} onChange={e=>setVoiceFreq(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                        </div>
                                    </div>
                                    
                                    {/* Noise Settings */}
                                    <div className={`flex gap-4 pt-2 border-t border-slate-100 transition-opacity ${sourceMix === 1 ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                                            <input type="radio" checked={noiseType==='white'} onChange={()=>setNoiseType('white')} className="accent-cyan-500"/> White
                                        </label>
                                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                                            <input type="radio" checked={noiseType==='pink'} onChange={()=>setNoiseType('pink')} className="accent-cyan-500"/> Pink
                                        </label>
                                    </div>
                                </div>
                             ) : (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><FileAudio size={14}/> 파일 선택</label>
                                        <select value={selectedFileId} onChange={e=>setSelectedFileId(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm font-bold text-slate-700 outline-none focus:border-indigo-400">
                                            <option value="">파일 선택 안 함</option>
                                            {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                        </select>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        선택한 오디오 파일을 소스로 사용하여 필터와 엔벨로프를 적용합니다. 자음 샘플이나 타악기 소리를 불러와 가공해보세요.
                                    </p>
                                </div>
                             )}
                        </div>

                        {/* Filter Section */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
                            <h3 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2"><Sliders size={16}/> 필터 (Filter)</h3>
                            <div className="space-y-4">
                                <div className="flex gap-2">
                                    {['highpass', 'lowpass', 'bandpass'].map(t => (
                                        <button key={t} onClick={()=>setFilterType(t as BiquadFilterType)} className={`flex-1 py-2 text-[10px] rounded border font-bold uppercase transition-all ${filterType===t ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                            {t}
                                        </button>
                                    ))}
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs text-slate-500 font-bold"><span>Frequency</span><span>{frequency} Hz</span></div>
                                    <input type="range" min="100" max="8000" step="10" value={frequency} onChange={e=>setFrequency(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-cyan-500"/>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs text-slate-500 font-bold"><span>Resonance (Q)</span><span>{Q}</span></div>
                                    <input type="range" min="0.1" max="20" step="0.1" value={Q} onChange={e=>setQ(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-cyan-500"/>
                                </div>
                            </div>
                        </div>

                        {/* Envelope Section */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
                            <h3 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2"><Activity size={16}/> 엔벨로프 (ADSR)</h3>
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs text-slate-500 font-bold"><span>Duration</span><span>{duration} ms</span></div>
                                    <input type="range" min="20" max="1000" value={duration} onChange={e=>setDuration(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-slate-500 font-bold"><span>Attack</span><span>{attack} ms</span></div>
                                        <input type="range" min="0" max="200" value={attack} onChange={e=>setAttack(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-slate-500 font-bold"><span>Decay</span><span>{decay} ms</span></div>
                                        <input type="range" min="0" max="200" value={decay} onChange={e=>setDecay(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-slate-500 font-bold"><span>Sustain</span><span>{Math.round(sustain*100)}%</span></div>
                                        <input type="range" min="0" max="1" step="0.01" value={sustain} onChange={e=>setSustain(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-slate-500 font-bold"><span>Release</span><span>{release} ms</span></div>
                                        <input type="range" min="0" max="500" value={release} onChange={e=>setRelease(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Visualizer & Action Column */}
                    <div className="lg:col-span-2 flex flex-col gap-4">
                        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 relative overflow-hidden shadow-inner group">
                             <canvas ref={canvasRef} width={800} height={400} className="w-full h-full object-cover opacity-80"/>
                             <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
                                <span className="bg-black/50 text-white px-2 py-1 rounded text-xs backdrop-blur font-mono">{duration}ms</span>
                                <span className="bg-black/50 text-cyan-400 px-2 py-1 rounded text-xs backdrop-blur font-mono">{filterType.toUpperCase()} {frequency}Hz</span>
                                {baseSource === 'synth' && sourceMix > 0 && <span className="bg-black/50 text-indigo-400 px-2 py-1 rounded text-xs backdrop-blur font-mono">VOICE {voiceFreq}Hz</span>}
                                {baseSource === 'file' && <span className="bg-black/50 text-orange-400 px-2 py-1 rounded text-xs backdrop-blur font-mono">FILE SOURCE</span>}
                             </div>
                        </div>
                        <div className="h-24 bg-white rounded-2xl border border-slate-300 p-6 flex items-center justify-between shadow-sm">
                             <div className="flex items-center gap-6">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-black text-slate-400 uppercase">Output Gain</span>
                                    <div className="flex items-center gap-3">
                                        <Volume2 size={20} className="text-slate-500"/>
                                        <input type="range" min="0" max="2" step="0.1" value={gain} onChange={e=>setGain(Number(e.target.value))} className="w-32 h-2 bg-slate-200 rounded-full appearance-none accent-slate-600"/>
                                        <span className="text-sm font-bold text-slate-600 w-10">{Math.round(gain*100)}%</span>
                                    </div>
                                </div>
                             </div>
                             <div className="flex gap-4">
                                 <button onClick={handleGenerateAndPlay} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-95 text-base">
                                    <Play size={20} fill="currentColor"/> {isPlaying ? '재생 중...' : '생성 및 재생'}
                                 </button>
                                 <button onClick={handleSave} className="px-8 py-4 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 text-base">
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