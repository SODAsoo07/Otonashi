
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Play, Save, Download, Settings, Music, Mic, Layers, Activity, Zap, ExternalLink, FileJson } from 'lucide-react';
import { AudioFile } from '../types';
import { AudioUtils } from '../utils/audioUtils';

interface VocoderTabProps {
  audioContext: AudioContext;
  files: AudioFile[];
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
  isActive: boolean;
}

const VocoderTab: React.FC<VocoderTabProps> = ({ audioContext, files, onAddToRack, isActive }) => {
    const [carrierId, setCarrierId] = useState("");
    const [modulatorId, setModulatorId] = useState("");
    const [bandsCount, setBandsCount] = useState(80);
    const [outputGain, setOutputGain] = useState(1.0);
    const [resynthesisMode, setResynthesisMode] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [resultBuffer, setResultBuffer] = useState<AudioBuffer | null>(null);
    const [progress, setProgress] = useState(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);

    const handleProcess = async () => {
        const car = files.find(f => f.id === carrierId)?.buffer;
        const mod = files.find(f => f.id === modulatorId)?.buffer;
        if (!car || !mod) return;

        setProgress(1); 
        const res = await AudioUtils.applyVocoder(audioContext, car, mod, bandsCount, resynthesisMode);
        setResultBuffer(res);
        setProgress(0);
    };

    const handleExportMel = () => {
        const mod = files.find(f => f.id === modulatorId)?.buffer;
        if (!mod) return;
        const melData = AudioUtils.generateMelData(mod, bandsCount);
        const blob = new Blob([JSON.stringify(melData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mel_spectrogram_${modulatorId}.json`;
        a.click();
    };

    const togglePlay = () => {
        if (isPlaying) {
            if (sourceRef.current) { sourceRef.current.stop(); sourceRef.current = null; }
            setIsPlaying(false);
            return;
        }
        if (!resultBuffer) return;
        const s = audioContext.createBufferSource();
        s.buffer = resultBuffer;
        const g = audioContext.createGain();
        g.gain.value = outputGain;
        s.connect(g); g.connect(audioContext.destination);
        s.start(0); sourceRef.current = s;
        setIsPlaying(true);
        s.onended = () => setIsPlaying(false);
    };

    const handleSave = () => { if (resultBuffer) onAddToRack(resultBuffer, "Neural_Vocoder_Res"); };

    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const w = canvasRef.current.width, h = canvasRef.current.height;
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);

        const drawBuffer = (buf: AudioBuffer | null, color: string, yOff: number, height: number, label: string) => {
            if (!buf) return;
            ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1;
            const data = buf.getChannelData(0); const step = Math.ceil(data.length / w);
            const amp = height / 2;
            for (let i = 0; i < w; i++) {
                let min = 1, max = -1;
                for (let j = 0; j < step; j++) {
                    const d = data[i * step + j] || 0;
                    if (d < min) min = d; if (d > max) max = d;
                }
                ctx.moveTo(i, yOff + amp + min * amp); ctx.lineTo(i, yOff + amp + max * amp);
            }
            ctx.stroke();
            ctx.fillStyle = color; ctx.globalAlpha = 0.6; ctx.font = 'bold 9px Inter';
            ctx.fillText(label, 10, yOff + 10); ctx.globalAlpha = 1.0;
        };

        const carBuf = files.find(f => f.id === carrierId)?.buffer;
        const modBuf = files.find(f => f.id === modulatorId)?.buffer;

        drawBuffer(carBuf, '#3b82f6', 10, 50, "CARRIER (Excitation/Synth)");
        drawBuffer(modBuf, '#f43f5e', 70, 50, "MODULATOR (Target Human Speech)");
        drawBuffer(resultBuffer, '#8b5cf6', 130, 80, "NEURAL RECONSTRUCTION");
    }, [carrierId, modulatorId, resultBuffer, files]);

    return (
        <div className="flex-1 p-6 flex flex-col gap-6 animate-in fade-in overflow-hidden font-sans font-bold">
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm h-full overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg"><Zap size={24}/></div>
                        <div className="flex flex-col">
                            <h2 className="text-xl text-slate-800 tracking-tight font-black">Neural-style Vocoder</h2>
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Excitation-Filter Resynthesis Engine</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <a href="https://github.com/openvpi/vocoders" target="_blank" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-[10px] font-black text-slate-600 transition-all shadow-sm">
                            <ExternalLink size={14}/> OpenVPI Vocoders
                        </a>
                        <button onClick={handleExportMel} disabled={!modulatorId} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-[10px] font-black text-indigo-600 transition-all shadow-sm disabled:opacity-50">
                            <FileJson size={14}/> Export Mel-Data
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className={`space-y-4 p-5 rounded-2xl border transition-all ${carrierId ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Music size={14}/> Carrier (Synthetic Source)</h3>
                        <select value={carrierId} onChange={e=>setCarrierId(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm font-bold bg-white outline-none">
                            <option value="">합성음/성도시뮬 출력 선택...</option>
                            {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <p className="text-[10px] text-slate-400 font-medium italic">* 성도 시뮬레이터나 자음 생성기에서 만든 인위적인 소리를 선택하세요.</p>
                    </div>

                    <div className={`space-y-4 p-5 rounded-2xl border transition-all ${modulatorId ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Mic size={14}/> Modulator (Human Reference)</h3>
                        <select value={modulatorId} onChange={e=>setModulatorId(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm font-bold bg-white outline-none">
                            <option value="">인간 목소리 샘플 선택...</option>
                            {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <p className="text-[10px] text-slate-400 font-medium italic">* 목표로 하는 인간 발음의 질감 정보를 추출할 원본입니다.</p>
                    </div>

                    <div className="space-y-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Settings size={14}/> Neural Params</h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200">
                                <span className="text-[10px] font-black text-slate-500 uppercase">Resynthesis Mode</span>
                                <button onClick={()=>setResynthesisMode(!resynthesisMode)} className={`w-8 h-4 rounded-full transition-colors relative ${resynthesisMode ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${resynthesisMode ? 'left-4.5' : 'left-0.5'}`}/>
                                </button>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-black text-slate-500"><span>Mel Bands</span><span className="text-indigo-600">{bandsCount}</span></div>
                                <input type="range" min="40" max="128" step="1" value={bandsCount} onChange={e=>setBandsCount(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-600 cursor-pointer"/>
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-black text-slate-500"><span>Output Gain</span><span className="text-indigo-600">{Math.round(outputGain*100)}%</span></div>
                                <input type="range" min="0" max="2" step="0.1" value={outputGain} onChange={e=>setOutputGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-600 cursor-pointer"/>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 relative overflow-hidden shadow-inner ring-1 ring-slate-800">
                    <canvas ref={canvasRef} width={1000} height={250} className="w-full h-full object-cover opacity-80"/>
                    {progress > 0 && (
                        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                            <Activity className="animate-spin text-indigo-500" size={32}/>
                            <span className="text-xs font-black text-indigo-400 tracking-widest uppercase animate-pulse">Computing High-Res Spectral Envelopes...</span>
                        </div>
                    )}
                </div>

                <div className="flex justify-center gap-4 py-2">
                    <button 
                        onClick={handleProcess} 
                        disabled={!carrierId || !modulatorId || progress > 0} 
                        className="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black flex items-center gap-3 shadow-xl shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50 text-base"
                    >
                        <Sparkles size={22}/> 질감 강화 및 재합성 실행
                    </button>
                    {resultBuffer && (
                        <>
                            <button onClick={togglePlay} className="px-8 py-5 bg-slate-800 text-white rounded-2xl font-black flex items-center gap-3 shadow-lg active:scale-95 transition-all text-base">
                                {isPlaying ? <Activity className="animate-pulse" size={20}/> : <Play size={20} fill="currentColor"/>} {isPlaying ? '재생 중...' : '결과 청취'}
                            </button>
                            <button onClick={handleSave} className="px-8 py-5 bg-white border border-slate-300 text-slate-900 hover:bg-slate-50 rounded-2xl font-black flex items-center gap-3 shadow-sm active:scale-95 transition-all text-base">
                                <Save size={20}/> 보관함 저장
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VocoderTab;
