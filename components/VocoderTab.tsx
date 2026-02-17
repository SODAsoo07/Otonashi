
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic2, Activity, Play, Save, Settings2, AudioLines, Music2, Cpu, Zap } from 'lucide-react';
import { AudioFile, EQBand } from '../types';
import { AudioUtils } from '../utils/audioUtils';
import ParametricEQ from './ParametricEQ';

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
    const [synthPitch, setSynthPitch] = useState(110); // A2
    const [synthDetune, setSynthDetune] = useState(0);
    const [noiseMix, setNoiseMix] = useState(0.1);

    // Vocoder Params
    const [bands, setBands] = useState(16);
    const [qFactor, setQFactor] = useState(5.0);
    const [mix, setMix] = useState(1.0); // Dry/Wet
    const [makeUpGain, setMakeUpGain] = useState(2.0);

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

    // Helper: Create Rectifier Curve for Envelope Follower
    const getRectifierCurve = useCallback(() => {
        const curve = new Float32Array(65536);
        for (let i = 0; i < 65536; i++) {
            const x = (i * 2) / 65536 - 1;
            curve[i] = Math.abs(x); // Absolute value (Full-wave rectification)
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

        // 1. Setup Modulator Source
        const modSource = offline.createBufferSource();
        modSource.buffer = modBuffer;

        // 2. Setup Carrier Source
        const carrierMix = offline.createGain();
        
        if (carrierMode === 'file' && carrierId) {
            const carFile = files.find(f => f.id === carrierId);
            if (carFile) {
                const carSource = offline.createBufferSource();
                carSource.buffer = carFile.buffer;
                carSource.loop = true; // Loop carrier to match modulator duration
                carSource.connect(carrierMix);
                carSource.start(0);
            }
        } else {
            // Synth Carrier (Sawtooth + Noise is classic for vocoders)
            const osc = offline.createOscillator();
            osc.type = synthWave;
            osc.frequency.value = synthPitch;
            osc.detune.value = synthDetune;
            
            const oscGain = offline.createGain();
            oscGain.gain.value = 1.0 - noiseMix;
            osc.connect(oscGain);
            oscGain.connect(carrierMix);
            osc.start(0);

            // Add Noise for sibilance/breathy characteristics
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

        // 3. Filter Bank & Envelope Followers
        const outputSum = offline.createGain();
        const rectifierCurve = getRectifierCurve();
        
        // Logarithmic frequency distribution
        const minFreq = 100;
        const maxFreq = 10000;
        const logMin = Math.log(minFreq);
        const logMax = Math.log(maxFreq);

        for (let i = 0; i < bands; i++) {
            const f = Math.exp(logMin + (logMax - logMin) * ((i + 0.5) / bands));
            
            // --- Modulator Analysis Path ---
            const modFilter = offline.createBiquadFilter();
            modFilter.type = 'bandpass';
            modFilter.frequency.value = f;
            modFilter.Q.value = qFactor;

            const rectifier = offline.createWaveShaper();
            rectifier.curve = rectifierCurve;

            const smoother = offline.createBiquadFilter();
            smoother.type = 'lowpass';
            smoother.frequency.value = 50; // Smooth out the envelope

            // Connect: Source -> Bandpass -> Rectifier -> Smoother
            modSource.connect(modFilter);
            modFilter.connect(rectifier);
            rectifier.connect(smoother);

            // --- Carrier Synthesis Path ---
            const carFilter = offline.createBiquadFilter();
            carFilter.type = 'bandpass';
            carFilter.frequency.value = f;
            carFilter.Q.value = qFactor;

            const bandGain = offline.createGain();
            bandGain.gain.value = 0; // Default 0, controlled by modulator envelope

            // Connect: Carrier -> Bandpass -> GainNode -> Sum
            carrierMix.connect(carFilter);
            carFilter.connect(bandGain);
            bandGain.connect(outputSum);

            // --- Control: Modulator Envelope -> Carrier Gain ---
            // We connect the smoothed envelope signal to the gain AudioParam
            smoother.connect(bandGain.gain);
        }

        // 4. Output Stage (Gain + EQ)
        const masterGain = offline.createGain();
        masterGain.gain.value = makeUpGain; // Make up for bandpass attenuation

        outputSum.connect(masterGain);

        // EQ Chain
        let lastNode: AudioNode = masterGain;
        eqBands.forEach(b => {
            if(b.on) {
                const f = offline.createBiquadFilter();
                f.type = b.type; f.frequency.value = b.freq; f.Q.value = b.q; f.gain.value = b.gain;
                lastNode.connect(f); lastNode = f;
            }
        });
        lastNode.connect(offline.destination);

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
        } else {
            alert("보코딩을 생성할 수 없습니다. 모듈레이터 파일을 확인해주세요.");
        }
    };

    const handleSave = async () => {
        const buf = generatedBuffer || await renderVocoder();
        if (buf) onAddToRack(buf, "Vocoder_Output");
    };

    // Draw Visualization
    useEffect(() => {
        const draw = async () => {
            const buf = generatedBuffer;
            if(!buf || !canvasRef.current) return;
            const ctx = canvasRef.current.getContext('2d'); if(!ctx) return;
            const w = canvasRef.current.width, h = canvasRef.current.height;
            const data = buf.getChannelData(0); 
            const step = Math.ceil(data.length / w);

            ctx.clearRect(0,0,w,h); 
            ctx.fillStyle = '#0f172a'; 
            ctx.fillRect(0,0,w,h);

            // Draw grid
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for(let i=0; i<w; i+=50) { ctx.moveTo(i,0); ctx.lineTo(i,h); }
            ctx.stroke();

            // Draw Waveform
            ctx.beginPath(); 
            ctx.strokeStyle = '#10b981'; // Emerald green
            ctx.lineWidth = 2;
            
            for(let i=0; i<w; i++){
                let min=1.0, max=-1.0;
                for(let j=0; j<step; j++) {
                    const idx = (i*step)+j; 
                    if(idx < data.length) { 
                        const datum = data[idx]; 
                        if(datum < min) min = datum; 
                        if(datum > max) max = datum; 
                    }
                }
                const y1 = h/2 + min * h/2.5;
                const y2 = h/2 + max * h/2.5;
                ctx.moveTo(i, y1); 
                ctx.lineTo(i, y2);
            }
            ctx.stroke();

            // Draw Playhead
            if (playheadTime > 0) {
                const px = (playheadTime / buf.duration) * w;
                ctx.beginPath(); 
                ctx.strokeStyle = '#ef4444'; 
                ctx.lineWidth = 2; 
                ctx.moveTo(px, 0); 
                ctx.lineTo(px, h); 
                ctx.stroke();
            }
        };
        draw();
    }, [generatedBuffer, playheadTime]);

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
                        
                        {/* 1. Modulator Section */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2"><Mic2 size={16}/> Modulator (Voice)</h3>
                            <select value={modulatorId} onChange={e=>setModulatorId(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 ring-emerald-200 text-slate-900">
                                <option value="">목소리 파일 선택...</option>
                                {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                            <p className="text-[10px] text-slate-400 font-bold">목소리의 리듬과 억양(Formant)을 추출하여 Carrier에 입힙니다.</p>
                        </div>

                        {/* 2. Carrier Section */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2"><Music2 size={16}/> Carrier (Synth)</h3>
                            
                            <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                                <button onClick={()=>setCarrierMode('synth')} className={`flex-1 py-1.5 rounded text-xs font-black transition-all ${carrierMode==='synth'?'bg-white text-emerald-700 shadow-sm':'text-slate-500'}`}>Synth</button>
                                <button onClick={()=>setCarrierMode('file')} className={`flex-1 py-1.5 rounded text-xs font-black transition-all ${carrierMode==='file'?'bg-white text-emerald-700 shadow-sm':'text-slate-500'}`}>File</button>
                            </div>

                            {carrierMode === 'synth' ? (
                                <div className="space-y-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-slate-500 font-bold"><span>Waveform</span><span className="text-emerald-600 uppercase">{synthWave}</span></div>
                                        <div className="flex gap-1">
                                            {['sawtooth', 'square', 'pulse'].map(w => (
                                                <button key={w} onClick={()=>setSynthWave(w as OscillatorType)} className={`flex-1 h-6 rounded border text-[10px] font-black uppercase ${synthWave===w?'bg-emerald-500 border-emerald-600 text-white':'bg-white border-slate-200 text-slate-500'}`}>{w.slice(0,3)}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Pitch</span><span>{synthPitch} Hz</span></div><input type="range" min="50" max="800" value={synthPitch} onChange={e=>setSynthPitch(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-emerald-500"/></div>
                                    <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Noise Mix</span><span>{Math.round(noiseMix*100)}%</span></div><input type="range" min="0" max="0.5" step="0.01" value={noiseMix} onChange={e=>setNoiseMix(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-emerald-500"/></div>
                                </div>
                            ) : (
                                <select value={carrierId} onChange={e=>setCarrierId(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none text-slate-900">
                                    <option value="">배경음(Pad/Chord) 파일 선택...</option>
                                    {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            )}
                        </div>

                        {/* 3. Vocoder Settings */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2"><Settings2 size={16}/> Settings</h3>
                            <div className="space-y-3">
                                <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Bands (Resolution)</span><span className="text-emerald-600">{bands}</span></div><input type="range" min="4" max="40" step="1" value={bands} onChange={e=>setBands(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-emerald-500"/></div>
                                <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Q-Factor (Resonance)</span><span className="text-emerald-600">{qFactor}</span></div><input type="range" min="1" max="20" step="0.5" value={qFactor} onChange={e=>setQFactor(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-emerald-500"/></div>
                                <div className="space-y-1"><div className="flex justify-between text-xs text-slate-500 font-bold"><span>Make-up Gain</span><span className="text-emerald-600">x{makeUpGain.toFixed(1)}</span></div><input type="range" min="1" max="10" step="0.5" value={makeUpGain} onChange={e=>setMakeUpGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-emerald-500"/></div>
                            </div>
                        </div>

                    </div>

                    {/* Visualizer & Actions */}
                    <div className="lg:col-span-2 flex flex-col gap-4">
                        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 relative overflow-hidden shadow-inner group min-h-[300px]">
                            <canvas ref={canvasRef} width={800} height={400} className="w-full h-full object-cover opacity-90"/>
                            {!generatedBuffer && <div className="absolute inset-0 flex items-center justify-center text-slate-600 font-bold text-sm">Modulator와 Carrier를 설정하고 생성하세요</div>}
                            <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
                                <span className="bg-emerald-900/50 text-emerald-400 px-2 py-1 rounded text-[10px] font-black border border-emerald-500/30 font-mono">{bands} BANDS</span>
                                <span className="bg-emerald-900/50 text-emerald-400 px-2 py-1 rounded text-[10px] font-black border border-emerald-500/30 font-mono">Q: {qFactor}</span>
                            </div>
                        </div>

                        <div className="h-24 bg-white rounded-2xl border border-slate-300 p-6 flex items-center justify-end shadow-sm gap-4">
                             <div className="flex-1 flex flex-col justify-center">
                                 <p className="text-xs text-slate-400 font-bold mb-1">TIP</p>
                                 <p className="text-xs text-slate-600">Modulator에는 <span className="text-emerald-600">목소리</span>, Carrier에는 <span className="text-emerald-600">화음이 풍부한 소리</span>(Sawtooth 등)를 사용하면 효과가 좋습니다.</p>
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
