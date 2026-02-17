
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic2, Activity, Play, Save, Settings2, AudioLines, Music2, Cpu, Zap, Snowflake, Pencil, RotateCcw, Camera, MoveVertical, Lightbulb } from 'lucide-react';
import { AudioFile, EQBand } from '../types';
import { AudioUtils } from '../utils/audioUtils';
import ParametricEQ from './ParametricEQ';
import RangeControl from './ui/RangeControl';

interface VocoderTabProps {
  audioContext: AudioContext;
  files: AudioFile[];
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
  isActive: boolean;
}

const VocoderTab: React.FC<VocoderTabProps> = ({ audioContext, files, onAddToRack, isActive }) => {
    // Sources
    const [modulatorId, setModulatorId] = useState("");
    const [carrierMode, setCarrierMode] = useState<'synth' | 'file'>('synth');
    const [carrierId, setCarrierId] = useState("");
    
    // Synth Carrier Params
    const [synthWave, setSynthWave] = useState<OscillatorType>('sawtooth');
    const [synthPitch, setSynthPitch] = useState(110);
    const [synthDetune, setSynthDetune] = useState(0);
    const [noiseMix, setNoiseMix] = useState(0.1);

    // Vocoder Params
    const [bands, setBands] = useState(16);
    const [qFactor, setQFactor] = useState(5.0);
    const [makeUpGain, setMakeUpGain] = useState(4.0);
    
    // New Features
    const [reactionTime, setReactionTime] = useState(40); // ms (Smoothing)
    const [sibilanceAmount, setSibilanceAmount] = useState(0.0);
    const [sibilanceFreq, setSibilanceFreq] = useState(5000);
    const [freeze, setFreeze] = useState(false);
    
    // Formant Shift
    const [enableFormantShift, setEnableFormantShift] = useState(false);
    const [formantShift, setFormantShift] = useState(1.0); // 0.5 to 2.0

    // Spectral Drawing (Band Gains)
    const [bandGains, setBandGains] = useState<number[]>(new Array(16).fill(1.0));

    const [isPlaying, setIsPlaying] = useState(false);
    const [generatedBuffer, setGeneratedBuffer] = useState<AudioBuffer | null>(null);
    const [playheadTime, setPlayheadTime] = useState(0);

    // EQ
    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 100, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'peaking', freq: 2000, gain: 0, q: 1.0, on: true },
        { id: 3, type: 'highshelf', freq: 8000, gain: 0, q: 0.7, on: true }
    ]);
    const [showEQ, setShowEQ] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    
    // Smooth Drawing State
    const lastDrawPos = useRef<{ bandIdx: number, gain: number } | null>(null);

    // Update bandGains array when band count changes
    useEffect(() => {
        setBandGains(prev => {
            if (prev.length === bands) return prev;
            // Resample old gains to new length (simple interpolation could be better, but reset or fill is basic)
            // Let's just create new array to be safe, maybe fill with 1s
            return new Array(bands).fill(1.0);
        });
    }, [bands]);

    // Helper: Create Rectifier Curve
    const getRectifierCurve = useCallback(() => {
        const curve = new Float32Array(65536);
        for (let i = 0; i < 65536; i++) {
            curve[i] = Math.abs((i * 2) / 65536 - 1);
        }
        return curve;
    }, []);

    const renderVocoder = async () => {
        if (!audioContext || !modulatorId) return null;
        const modFile = files.find(f => f.id === modulatorId);
        if (!modFile) return null;

        const modBuffer = modFile.buffer;
        const duration = modBuffer.duration;
        const sr = audioContext.sampleRate;
        const offline = new OfflineAudioContext(1, Math.ceil(duration * sr), sr);

        // 1. Setup Modulator
        const modSource = offline.createBufferSource();
        modSource.buffer = modBuffer;
        
        // 2. Setup Carrier
        const carrierMix = offline.createGain();
        
        if (carrierMode === 'file' && carrierId) {
            const carFile = files.find(f => f.id === carrierId);
            if (carFile) {
                const carSource = offline.createBufferSource();
                carSource.buffer = carFile.buffer;
                carSource.loop = true;
                carSource.connect(carrierMix);
                carSource.start(0);
            }
        } else {
            const osc = offline.createOscillator();
            osc.type = synthWave;
            osc.frequency.value = synthPitch;
            osc.detune.value = synthDetune;
            const oscGain = offline.createGain();
            oscGain.gain.value = 1.0 - noiseMix;
            osc.connect(oscGain);
            oscGain.connect(carrierMix);
            osc.start(0);

            if (noiseMix > 0) {
                const noiseBuf = offline.createBuffer(1, sr * duration, sr);
                const d = noiseBuf.getChannelData(0);
                for(let i=0; i<d.length; i++) d[i] = Math.random() * 2 - 1;
                const noiseSrc = offline.createBufferSource();
                noiseSrc.buffer = noiseBuf;
                const noiseGain = offline.createGain();
                noiseGain.gain.value = noiseMix;
                noiseSrc.connect(noiseGain);
                noiseGain.connect(carrierMix);
                noiseSrc.start(0);
            }
        }

        // 3. Vocoder Logic
        const outputSum = offline.createGain();
        const rectifierCurve = getRectifierCurve();
        
        const minFreq = 100;
        const maxFreq = 10000;
        const logMin = Math.log(minFreq);
        const logMax = Math.log(maxFreq);

        // Calculate smoothing freq from reaction time
        // approx: f = 1000 / (reactionTime + 5);
        const smoothFreq = 1000 / (Math.max(1, reactionTime) + 5);

        for (let i = 0; i < bands; i++) {
            // Base frequency for this band
            const f = Math.exp(logMin + (logMax - logMin) * ((i + 0.5) / bands));
            
            // Carrier Frequency (Synthesis) - Applied Shift if enabled
            const synthesisFreq = enableFormantShift ? Math.min(sr/2, f * formantShift) : f;

            // Carrier Filter
            const carFilter = offline.createBiquadFilter();
            carFilter.type = 'bandpass';
            carFilter.frequency.value = synthesisFreq;
            carFilter.Q.value = qFactor;
            
            const bandGain = offline.createGain();
            bandGain.gain.value = 0;

            carrierMix.connect(carFilter);
            carFilter.connect(bandGain);
            bandGain.connect(outputSum);

            // Control Path
            const userGainVal = bandGains[i] || 0;
            
            if (freeze) {
                // Freeze Mode: Static Gain based on Drawing
                // We ignore the modulator envelope and just use the drawn gain
                // SAFETY: Attenuate significantly (x0.06) because static summation of bands is much louder than dynamic envelopes
                bandGain.gain.value = userGainVal * 0.06; 
            } else {
                // Dynamic Mode
                // Modulator Filter (Analysis) - Always uses original frequency 'f'
                const modFilter = offline.createBiquadFilter();
                modFilter.type = 'bandpass';
                modFilter.frequency.value = f;
                modFilter.Q.value = qFactor;

                const rectifier = offline.createWaveShaper();
                rectifier.curve = rectifierCurve;

                const smoother = offline.createBiquadFilter();
                smoother.type = 'lowpass';
                smoother.frequency.value = smoothFreq;

                modSource.connect(modFilter);
                modFilter.connect(rectifier);
                rectifier.connect(smoother);
                
                // Apply User Drawing Gain
                const gainScaler = offline.createGain();
                gainScaler.gain.value = userGainVal;
                
                smoother.connect(gainScaler);
                gainScaler.connect(bandGain.gain);
            }
        }

        // 4. Sibilance Passthrough
        if (sibilanceAmount > 0) {
            const sibFilter = offline.createBiquadFilter();
            sibFilter.type = 'highpass';
            sibFilter.frequency.value = sibilanceFreq;
            
            const sibGain = offline.createGain();
            sibGain.gain.value = sibilanceAmount;
            
            modSource.connect(sibFilter);
            sibFilter.connect(sibGain);
            sibGain.connect(outputSum);
        }

        // Output
        const masterGain = offline.createGain();
        masterGain.gain.value = makeUpGain;
        outputSum.connect(masterGain);

        // Master EQ
        let lastNode: AudioNode = masterGain;
        eqBands.forEach(b => {
            if(b.on) {
                const f = offline.createBiquadFilter();
                f.type = b.type; f.frequency.value = b.freq; f.Q.value = b.q; f.gain.value = b.gain;
                lastNode.connect(f); lastNode = f;
            }
        });

        // SAFETY: Master Limiter for Hearing Protection
        // Prevents unexpected loudness spikes especially from Freeze mode
        const limiter = offline.createDynamicsCompressor();
        limiter.threshold.value = -1.0; 
        limiter.knee.value = 0;
        limiter.ratio.value = 20.0; // Hard limiting behavior
        limiter.attack.value = 0.005;
        limiter.release.value = 0.1;
        
        lastNode.connect(limiter);
        limiter.connect(offline.destination);

        modSource.start(0);
        return await offline.startRendering();
    };

    const handleGenerate = async () => {
        if(isPlaying) {
             if(sourceRef.current) { try{sourceRef.current.stop()}catch(e){} sourceRef.current = null; }
             setIsPlaying(false); setPlayheadTime(0); return;
        }

        const buf = await renderVocoder();
        if (buf) {
            setGeneratedBuffer(buf);
            const source = audioContext.createBufferSource();
            source.buffer = buf;
            source.connect(audioContext.destination);
            source.start();
            sourceRef.current = source;
            setIsPlaying(true);

            const startTime = audioContext.currentTime;
            const animate = () => {
                const elapsed = audioContext.currentTime - startTime;
                if(elapsed < buf.duration) {
                    setPlayheadTime(elapsed);
                    requestAnimationFrame(animate);
                } else {
                    setIsPlaying(false);
                    setPlayheadTime(0);
                }
            };
            requestAnimationFrame(animate);
        }
    };

    const handleSave = async () => {
        const buf = generatedBuffer || await renderVocoder();
        if (buf) onAddToRack(buf, "Vocoder_Output");
    };

    const handleCapture = () => {
        if (!modulatorId) return;
        const modFile = files.find(f => f.id === modulatorId);
        if (!modFile) return;

        const time = playheadTime > 0 ? playheadTime : 0; // Capture at cursor
        const sliceSize = 2048;
        const startSample = Math.floor(time * modFile.buffer.sampleRate);
        if (startSample + sliceSize > modFile.buffer.length) return;

        const data = modFile.buffer.getChannelData(0).slice(startSample, startSample + sliceSize);
        
        // Simple Magnitude Analysis per Band
        const windowed = new Float32Array(sliceSize);
        for(let i=0; i<sliceSize; i++) windowed[i] = data[i] * (0.54 - 0.46 * Math.cos(2*Math.PI*i/(sliceSize-1)));

        const minFreq = 100; const maxFreq = 10000;
        const logMin = Math.log(minFreq); const logMax = Math.log(maxFreq);
        const sr = modFile.buffer.sampleRate;
        const newGains = [...bandGains];

        for(let b=0; b<bands; b++) {
            const f = Math.exp(logMin + (logMax - logMin) * ((b + 0.5) / bands));
            let real = 0; 
            let imag = 0;
            const omega = 2 * Math.PI * f / sr;
            
            for(let n=0; n<sliceSize; n++) {
                real += windowed[n] * Math.cos(omega * n);
                imag -= windowed[n] * Math.sin(omega * n);
            }
            const mag = Math.sqrt(real*real + imag*imag);
            newGains[b] = Math.min(2.0, mag * 0.2); 
        }
        setBandGains(newGains);
    };

    // Canvas Interaction (Smoothed)
    const handleCanvasDraw = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const w = rect.width;
        const h = rect.height;

        // Map X to Band Index
        const bandWidth = w / bands;
        const bandIdx = Math.floor(x / bandWidth);
        const gain = Math.max(0, Math.min(2, 2 - (y / h) * 2));

        if (bandIdx >= 0 && bandIdx < bands) {
            setBandGains(prev => {
                const n = [...prev];
                
                // Interpolation logic
                if (lastDrawPos.current) {
                    const startIdx = lastDrawPos.current.bandIdx;
                    const endIdx = bandIdx;
                    const startGain = lastDrawPos.current.gain;
                    const endGain = gain;
                    
                    const dist = Math.abs(endIdx - startIdx);
                    const step = startIdx < endIdx ? 1 : -1;
                    
                    // Fill gaps between previous mouse pos and current
                    for(let i=0; i<=dist; i++) {
                         const currIdx = startIdx + (i * step);
                         const progress = i / dist; 
                         const interpGain = dist === 0 ? endGain : (startGain + (endGain - startGain) * progress);
                         if (currIdx >= 0 && currIdx < bands) {
                             n[currIdx] = interpGain;
                         }
                    }
                } else {
                    // Single point click
                    n[bandIdx] = gain;
                }
                return n;
            });
            lastDrawPos.current = { bandIdx, gain };
        }
    };

    const resetDrawing = () => { lastDrawPos.current = null; };

    useEffect(() => {
        const draw = () => {
            if (!canvasRef.current) return;
            const ctx = canvasRef.current.getContext('2d'); if (!ctx) return;
            const w = canvasRef.current.width, h = canvasRef.current.height;

            // Clear
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);

            // 1. Draw Waveform (if exists)
            if (generatedBuffer) {
                ctx.beginPath(); 
                ctx.strokeStyle = '#334155'; 
                ctx.lineWidth = 1;
                const data = generatedBuffer.getChannelData(0); 
                const step = Math.ceil(data.length / w);
                for(let i=0; i<w; i+=2){
                    let min=1.0, max=-1.0;
                    for(let j=0; j<step; j++) {
                        const idx = (i*step)+j; 
                        if(idx < data.length) { 
                            const d = data[idx]; 
                            if(d < min) min = d; if(d > max) max = d; 
                        }
                    }
                    const y1 = h/2 + min * h/3;
                    const y2 = h/2 + max * h/3;
                    ctx.moveTo(i, y1); ctx.lineTo(i, y2);
                }
                ctx.stroke();
            }

            // 2. Draw Spectral Bands (Drawing UI)
            const bandW = w / bands;
            const gap = 2;
            
            bandGains.forEach((g, i) => {
                const x = i * bandW;
                const barH = (g / 2) * h; // map 0-2 to 0-h
                const y = h - barH;
                
                // Color based on gain and freeze state
                const hue = freeze ? 200 : 160; // Blue if frozen, Green if dynamic
                const saturation = 50 + (g/2)*50;
                ctx.fillStyle = `hsla(${hue}, ${saturation}%, 50%, 0.6)`;
                if (freeze) ctx.fillStyle = `hsla(190, 80%, 60%, 0.7)`;
                
                ctx.fillRect(x + gap/2, y, bandW - gap, barH);
                
                // Top Cap
                ctx.fillStyle = `hsla(${hue}, 80%, 80%, 0.9)`;
                ctx.fillRect(x + gap/2, y, bandW - gap, 2);
            });

            // 3. Playhead
            if (playheadTime > 0 && generatedBuffer) {
                const px = (playheadTime / generatedBuffer.duration) * w;
                ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; 
                ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
            }
        };
        draw();
    }, [generatedBuffer, playheadTime, bandGains, bands, freeze]);

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in overflow-hidden font-sans font-bold">
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm h-full overflow-y-auto custom-scrollbar">
                
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500 rounded-xl text-white shadow-lg shadow-emerald-200"><Cpu size={24}/></div>
                        <h2 className="text-xl text-slate-800 tracking-tight font-black">보코더 (Channel Vocoder)</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={()=>setShowEQ(!showEQ)} className={`px-4 py-2 rounded-md text-sm font-black flex items-center gap-2 transition-all ${showEQ ? 'bg-white shadow text-pink-600' : 'text-slate-500'}`}><AudioLines size={16}/> Master EQ</button>
                    </div>
                </div>

                 {/* EQ Panel */}
                 {showEQ && (
                    <div className="h-48 shrink-0 animate-in fade-in slide-in-from-top-4">
                        <ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={sourceRef.current} />
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
                    {/* Controls Column */}
                    <div className="lg:col-span-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
                        
                        {/* 1. Source Config */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-xs font-black text-slate-500 uppercase flex items-center gap-2"><Mic2 size={14}/> Sources</h3>
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase">Modulator (Voice)</label>
                                    <select value={modulatorId} onChange={e=>setModulatorId(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs font-bold outline-none text-slate-900">
                                        <option value="">파일 선택...</option>
                                        {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase">Carrier (Synth/File)</label>
                                    <div className="flex gap-2">
                                         <div className="flex-1 flex bg-slate-100 rounded p-0.5">
                                            <button onClick={()=>setCarrierMode('synth')} className={`flex-1 text-[10px] rounded font-black ${carrierMode==='synth'?'bg-white shadow text-emerald-600':'text-slate-400'}`}>Synth</button>
                                            <button onClick={()=>setCarrierMode('file')} className={`flex-1 text-[10px] rounded font-black ${carrierMode==='file'?'bg-white shadow text-emerald-600':'text-slate-400'}`}>File</button>
                                         </div>
                                    </div>
                                    {carrierMode === 'file' ? (
                                        <select value={carrierId} onChange={e=>setCarrierId(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs font-bold outline-none text-slate-900">
                                            <option value="">파일 선택...</option>
                                            {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                        </select>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            <select value={synthWave} onChange={e=>setSynthWave(e.target.value as OscillatorType)} className="p-1.5 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold"><option value="sawtooth">Sawtooth</option><option value="square">Square</option><option value="pulse">Pulse</option></select>
                                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-2"><span className="text-[10px] text-slate-400">Pitch</span><input type="number" value={synthPitch} onChange={e=>setSynthPitch(Number(e.target.value))} className="w-full bg-transparent text-xs font-bold outline-none"/></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 2. Vocoder Settings */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-xs font-black text-slate-500 uppercase flex items-center gap-2"><Settings2 size={14}/> Processing</h3>
                            <div className="space-y-4">
                                <RangeControl label="Reaction Speed" value={reactionTime} min={5} max={200} step={1} onChange={setReactionTime} unit="ms" />
                                <RangeControl label="Band Count" value={bands} min={4} max={32} step={1} onChange={setBands} unit="" />
                                <div className="h-px bg-slate-100"/>
                                
                                {/* Formant Shift Control */}
                                <div className={`space-y-2 p-2 rounded-lg border transition-all ${enableFormantShift ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <MoveVertical size={12} className={enableFormantShift ? "text-indigo-500" : "text-slate-400"}/>
                                            <span className="text-[10px] font-black text-slate-500 uppercase">Formant Shift</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={enableFormantShift} onChange={e=>setEnableFormantShift(e.target.checked)} className="sr-only peer"/>
                                            <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500"></div>
                                        </label>
                                    </div>
                                    {enableFormantShift && (
                                        <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                                            <div className="flex justify-between text-[9px] font-bold text-slate-400">
                                                <span>Deep (x0.5)</span>
                                                <span className="text-indigo-600">x{formantShift.toFixed(2)}</span>
                                                <span>High (x2.0)</span>
                                            </div>
                                            <input type="range" min="0.5" max="2.0" step="0.05" value={formantShift} onChange={e=>setFormantShift(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                        </div>
                                    )}
                                </div>

                                <div className="h-px bg-slate-100"/>
                                
                                {/* Sibilance Controls */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1"><Zap size={10}/> Sibilance (치찰음)</span>
                                        <span className="text-emerald-600 text-[10px]">{Math.round(sibilanceAmount*100)}%</span>
                                    </div>
                                    <input type="range" min="0" max="1.0" step="0.05" value={sibilanceAmount} onChange={e=>setSibilanceAmount(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-emerald-500"/>
                                    {sibilanceAmount > 0 && (
                                         <RangeControl label="Sibilance Freq" value={sibilanceFreq} min={2000} max={10000} step={100} onChange={setSibilanceFreq} unit="Hz" />
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        {/* 3. Spectral Freeze & Recipes */}
                        <div className="space-y-4">
                            <div className={`p-5 rounded-xl border shadow-sm space-y-3 transition-colors ${freeze ? 'bg-cyan-50 border-cyan-200' : 'bg-white border-slate-200'}`}>
                                 <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-black text-slate-500 uppercase flex items-center gap-2"><Snowflake size={14} className={freeze ? "text-cyan-500" : ""}/> Spectral Freeze</h3>
                                    <button onClick={()=>setFreeze(!freeze)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${freeze ? 'bg-cyan-500' : 'bg-slate-300'}`}>
                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${freeze ? 'translate-x-4.5' : 'translate-x-1'}`}/>
                                    </button>
                                 </div>
                                 <p className="text-[10px] text-slate-400 font-bold leading-tight">
                                    {freeze 
                                        ? "Modulator 엔벨로프를 무시하고, 현재 그려진 Band Gain을 고정 필터로 사용합니다. UTAU 보이스뱅크 제작에 유용합니다."
                                        : "Modulator의 엔벨로프를 실시간으로 추적합니다."
                                    }
                                 </p>
                                 <div className="pt-2 flex gap-2">
                                    <button onClick={()=>{setBandGains(new Array(bands).fill(1.0))}} className="flex-1 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-[10px] font-black text-slate-600 flex items-center justify-center gap-1 shadow-sm"><RotateCcw size={12}/> Reset Draw</button>
                                    <button onClick={handleCapture} disabled={!generatedBuffer && !modulatorId} className="flex-1 py-1.5 bg-white border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-[10px] font-black text-slate-600 flex items-center justify-center gap-1 shadow-sm" title="현재 재생 위치의 Modulator 스펙트럼을 캡처하여 Drawing에 적용합니다."><Camera size={12}/> Capture at Cursor</button>
                                 </div>
                            </div>

                            {/* Usage Recipes */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                                <h3 className="text-xs font-black text-slate-500 uppercase flex items-center gap-2"><Lightbulb size={14} className="text-amber-500"/> Usage Recipes</h3>
                                <ul className="text-[10px] text-slate-600 space-y-3 font-medium">
                                    <li className="flex flex-col gap-1">
                                        <span className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-black w-fit text-[9px]">🤖 로봇 보이스 (Classic Robot)</span>
                                        <div className="pl-1 border-l-2 border-slate-300 leading-tight text-slate-500">
                                            Modulator: <b>사람 목소리</b><br/>
                                            Carrier: <b>Synth (Sawtooth)</b>
                                        </div>
                                    </li>
                                    <li className="flex flex-col gap-1">
                                        <span className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-black w-fit text-[9px]">🥁 텍스처 합성 (Texture)</span>
                                        <div className="pl-1 border-l-2 border-slate-300 leading-tight text-slate-500">
                                            Modulator: <b>드럼 루프</b><br/>
                                            Carrier: <b>패드 / 스트링 (File)</b>
                                        </div>
                                    </li>
                                    <li className="flex flex-col gap-1">
                                        <span className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-black w-fit text-[9px]">👻 속삭임 (Whisper)</span>
                                        <div className="pl-1 border-l-2 border-slate-300 leading-tight text-slate-500">
                                            Modulator: <b>사람 목소리</b><br/>
                                            Carrier: <b>Synth (Noise Mix 100%)</b>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        </div>

                    </div>

                    {/* Visualizer & Actions */}
                    <div className="lg:col-span-2 flex flex-col gap-4">
                        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 relative overflow-hidden shadow-inner group min-h-[300px]">
                            <canvas 
                                ref={canvasRef} 
                                width={800} 
                                height={400} 
                                className="w-full h-full object-cover cursor-crosshair"
                                onMouseDown={(e)=>{ setIsDrawing(true); resetDrawing(); handleCanvasDraw(e); }}
                                onMouseMove={(e)=>{ if(isDrawing) handleCanvasDraw(e); }}
                                onMouseUp={()=>{ setIsDrawing(false); resetDrawing(); }}
                                onMouseLeave={()=>{ setIsDrawing(false); resetDrawing(); }}
                            />
                            
                            {/* Overlay Info */}
                            <div className="absolute top-4 left-4 flex gap-2 pointer-events-none">
                                <div className="bg-black/40 backdrop-blur text-white text-[10px] font-black px-2 py-1 rounded border border-white/10 flex items-center gap-1"><Pencil size={10}/> Draw on spectrum to adjust bands</div>
                            </div>
                            <div className="absolute top-4 right-4 flex flex-col items-end gap-1 pointer-events-none">
                                {freeze && <span className="bg-cyan-500/80 text-white px-2 py-1 rounded text-[10px] font-black shadow-lg animate-pulse">❄️ FROZEN</span>}
                            </div>
                        </div>

                        <div className="h-24 bg-white rounded-2xl border border-slate-300 p-6 flex items-center justify-end shadow-sm gap-4">
                             <div className="flex-1 flex flex-col justify-center">
                                 <p className="text-xs text-slate-400 font-bold mb-1">TIP</p>
                                 <p className="text-xs text-slate-600">스펙트럼을 드로잉하여 음색을 조절하거나, <span className="text-cyan-600 font-black">Capture & Freeze</span>를 사용해 정지된 모음 소리를 만드세요.</p>
                             </div>
                             <button onClick={handleGenerate} disabled={!modulatorId} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black flex items-center gap-2 shadow-lg transition-all active:scale-95 text-base disabled:opacity-50 disabled:scale-100">
                                <Play size={20} fill="currentColor"/> {isPlaying ? '재생 중...' : '보코딩 및 재생'}
                             </button>
                             <button onClick={handleSave} disabled={!generatedBuffer} className="px-8 py-4 bg-white border border-slate-300 text-slate-900 hover:bg-slate-50 rounded-xl font-black flex items-center gap-2 transition-all active:scale-95 text-base disabled:opacity-50">
                                <Save size={20}/> 보관함에 저장
                             </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default VocoderTab;
