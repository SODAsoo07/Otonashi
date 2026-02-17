import React, { useState, useRef, useEffect } from 'react';
import { Mic2, Activity, Play, X, Wand2, Settings2, ToggleLeft, ToggleRight, AlertTriangle, Layers, Languages, AlignCenterVertical, FileCode, UploadCloud, Cpu } from 'lucide-react';
import { AudioFile } from '../types';
import { AudioUtils } from '../utils/audioUtils';
import { ModelUtils } from '../utils/modelUtils';

interface FormantAnalyzerProps {
    files: AudioFile[];
    audioContext: AudioContext;
    onClose: () => void;
    onApply: (trackData: { tongueX?: any[], tongueY?: any[], lips?: any[], lipLen?: any[], throat?: any[], nasal?: any[] }) => void;
}

type LanguageMode = 'JP' | 'KR' | 'EN';
type AnalysisMode = 'heuristic' | 'ai_model';

// Base Anchors (Japanese)
const ANCHORS_JP = [
    { label: 'A', f1: 800, f2: 1200, tract: { x: 0.2, y: 0.1, lips: 0.9, lipLen: 0.5, throat: 0.1, nasal: 0.0 } },
    { label: 'I', f1: 300, f2: 2500, tract: { x: 0.9, y: 0.9, lips: 0.2, lipLen: 0.5, throat: 0.2, nasal: 0.0 } },
    { label: 'U', f1: 320, f2: 1100, tract: { x: 0.1, y: 0.8, lips: 0.2, lipLen: 0.8, throat: 0.4, nasal: 0.0 } },
    { label: 'E', f1: 500, f2: 1800, tract: { x: 0.6, y: 0.5, lips: 0.7, lipLen: 0.5, throat: 0.3, nasal: 0.0 } },
    { label: 'O', f1: 500, f2: 850,  tract: { x: 0.2, y: 0.4, lips: 0.3, lipLen: 0.6, throat: 0.5, nasal: 0.0 } },
    { label: 'N', f1: 220, f2: 1300, tract: { x: 0.5, y: 0.1, lips: 0.0, lipLen: 0.8, throat: 0.4, nasal: 1.0 } },
];

// Korean Anchors (Adds Eu, Eo)
const ANCHORS_KR = [
    ...ANCHORS_JP.filter(a => a.label !== 'N'), 
    { label: '으', f1: 350, f2: 1400, tract: { x: 0.5, y: 0.8, lips: 0.2, lipLen: 0.0, throat: 0.3, nasal: 0.0 } },
    { label: '어', f1: 600, f2: 1000, tract: { x: 0.3, y: 0.3, lips: 0.5, lipLen: 0.3, throat: 0.6, nasal: 0.0 } }, 
    { label: 'N', f1: 220, f2: 1300, tract: { x: 0.5, y: 0.1, lips: 0.0, lipLen: 0.8, throat: 0.4, nasal: 1.0 } },
];

// English Anchors (Adds Ae, Uh)
const ANCHORS_EN = [
    ...ANCHORS_JP.filter(a => a.label !== 'N'),
    { label: 'Ae', f1: 700, f2: 1700, tract: { x: 0.5, y: 0.2, lips: 0.8, lipLen: 0.1, throat: 0.2, nasal: 0.0 } },
    { label: 'Uh', f1: 600, f2: 1200, tract: { x: 0.4, y: 0.4, lips: 0.4, lipLen: 0.4, throat: 0.5, nasal: 0.0 } },
    { label: 'N', f1: 220, f2: 1300, tract: { x: 0.5, y: 0.1, lips: 0.0, lipLen: 0.8, throat: 0.4, nasal: 1.0 } },
];

const FormantAnalyzer: React.FC<FormantAnalyzerProps> = ({ files, audioContext, onClose, onApply }) => {
    const [selectedId, setSelectedId] = useState("");
    const [status, setStatus] = useState<'idle' | 'analyzing' | 'done' | 'calibrating' | 'loading_model'>('idle');
    const [result, setResult] = useState<{t:number, f1:number, f2:number, f3:number, energy:number, zcr:number, vowelProb: number[]}[]>([]);
    const [modelResult, setModelResult] = useState<any>(null); // To store ONNX output
    const [isConfirming, setIsConfirming] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Modes
    const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('heuristic');
    
    // Heuristic Params
    const [language, setLanguage] = useState<LanguageMode>('JP');
    const [smoothing, setSmoothing] = useState(0.55); 
    const [sensitivity, setSensitivity] = useState(1.0);
    const [detectConsonants, setDetectConsonants] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // AI Model Params
    const [modelFile, setModelFile] = useState<File | null>(null);
    const [modelName, setModelName] = useState<string>("");

    useEffect(() => {
        setErrorMsg(null);
        if (selectedId) {
            const f = files.find(f => f.id === selectedId);
            if (f && f.buffer.duration > 7.0 && analysisMode === 'heuristic') {
                 setErrorMsg("휴리스틱 분석은 부하를 줄이기 위해 7초 이하 파일만 권장합니다.");
            }
        }
    }, [selectedId, files, analysisMode]);

    const getAnchors = () => {
        switch(language) {
            case 'KR': return ANCHORS_KR;
            case 'EN': return ANCHORS_EN;
            default: return ANCHORS_JP;
        }
    };

    const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            if (file.name.endsWith('.onnx')) {
                setModelFile(file);
                setModelName(file.name);
            } else {
                alert("Please select a valid .onnx file.");
            }
        }
    };

    const analyze = async () => {
        const file = files.find(f => f.id === selectedId);
        if (!file) return;
        
        setIsConfirming(false);

        if (analysisMode === 'ai_model') {
            if (!modelFile) return;
            setStatus('loading_model');
            try {
                const modelBuffer = await modelFile.arrayBuffer();
                // Resample to 16k (Common for speech models)
                const inputData = await ModelUtils.resampleBuffer(file.buffer, 16000);
                
                setStatus('analyzing');
                const output = await ModelUtils.runInference(modelBuffer, inputData);
                
                if (output) {
                    setModelResult(output);
                    setStatus('done');
                } else {
                    setErrorMsg("Model inference failed to produce output.");
                    setStatus('idle');
                }
            } catch (e) {
                console.error(e);
                setErrorMsg("AI Inference Failed. Check console for details.");
                setStatus('idle');
            }
        } else {
            // Heuristic
            setStatus('analyzing');
            const anchors = getAnchors();
            setTimeout(() => {
                try {
                    const rawFormants = AudioUtils.analyzeFormants(file.buffer);
                    let maxEnergy = 0;
                    rawFormants.forEach(r => maxEnergy = Math.max(maxEnergy, r.energy));
                    
                    const processed = [];
                    let last = { f1: 500, f2: 1500, f3: 2500 };
                    const maxDist = 450; 

                    for(let i=0; i<rawFormants.length; i++) {
                        const curr = rawFormants[i];
                        curr.f1 = last.f1 * 0.3 + curr.f1 * 0.7;
                        curr.f2 = last.f2 * 0.3 + curr.f2 * 0.7;
                        last = { f1: curr.f1, f2: curr.f2, f3: curr.f3 };

                        let probs = anchors.map(anchor => {
                            const dist = Math.sqrt(Math.pow((curr.f1 - anchor.f1)*1.5, 2) + Math.pow((curr.f2 - anchor.f2)*0.8, 2));
                            return Math.exp(-(dist * dist) / (2 * Math.pow(maxDist / sensitivity, 2)));
                        });

                        const total = probs.reduce((a,b)=>a+b,0) || 1;
                        processed.push({ ...curr, vowelProb: probs.map(p=>p/total) });
                    }
                    setResult(processed);
                    setStatus('done');
                } catch (e) { setStatus('idle'); }
            }, 100);
        }
    };

    const confirmApply = () => {
        const file = files.find(f => f.id === selectedId);
        if (!file) return;

        const tracks: any = { tongueX: [], tongueY: [], lips: [], lipLen: [], throat: [], nasal: [] };
        
        if (analysisMode === 'ai_model' && modelResult) {
            // Mapping Model Result directly to tracks
            const duration = file.buffer.duration;
            const len = modelResult.tongueX.length;
            
            for(let i=0; i<len; i++) {
                // Downsample keyframes to avoid performance hit (every 2 frames approx)
                if (i % 2 !== 0 && i !== len-1) continue; 
                
                const tNorm = i / (len - 1); // 0 to 1
                
                tracks.tongueX.push({ t: tNorm, v: modelResult.tongueX[i] });
                tracks.tongueY.push({ t: tNorm, v: modelResult.tongueY[i] });
                tracks.lips.push({ t: tNorm, v: modelResult.lips[i] });
                tracks.lipLen.push({ t: tNorm, v: modelResult.lipLen[i] });
                tracks.throat.push({ t: tNorm, v: modelResult.throat[i] });
                tracks.nasal.push({ t: tNorm, v: modelResult.nasal[i] });
            }
        } else {
            // Heuristic Application
            const duration = result[result.length-1].t;
            const anchors = getAnchors();
            let maxEnergy = 0; result.forEach(r => maxEnergy = Math.max(maxEnergy, r.energy));
            const silenceThresh = maxEnergy * 0.1;
            const closureThresh = maxEnergy * 0.3; 

            let lastParams = { x: 0.5, y: 0.5, lips: 0.5, lipLen: 0.5, throat: 0.5, nasal: 0 };
            let lastSavedParams = { ...lastParams };
            let lastSavedTime = -100;
            const alpha = 1.0 - smoothing;

            for(let i=0; i<result.length; i++) {
                const frame = result[i];
                const tNorm = frame.t / duration;
                let target = { x: 0, y: 0, lips: 0, lipLen: 0, throat: 0, nasal: 0 };
                
                // Vowel Blend
                frame.vowelProb.forEach((prob, idx) => {
                    const anchor = anchors[idx].tract;
                    target.x += anchor.x * prob;
                    target.y += anchor.y * prob;
                    target.lips += anchor.lips * prob;
                    target.lipLen += anchor.lipLen * prob;
                    target.throat += anchor.throat * prob;
                    target.nasal += anchor.nasal * prob;
                });

                // Silence/Consonant Logic
                const isSilence = frame.energy < silenceThresh;
                if (isSilence) { target.lips *= 0.1; target.nasal = 0; }

                if (detectConsonants && !isSilence) {
                    const isLowEnergy = frame.energy < closureThresh && frame.energy > silenceThresh;
                    const isLowZCR = frame.zcr < 0.15;
                    if (isLowEnergy && isLowZCR) { target.lips = 0.0; target.lipLen = 0.6; if (frame.f1 < 300) target.nasal = 0.8; }
                    if (frame.zcr > 0.3) {
                         const intensity = Math.min(1, (frame.zcr - 0.3) * 5);
                         target.x = target.x * (1-intensity) + 0.8 * intensity; 
                         target.y = target.y * (1-intensity) + 0.9 * intensity; 
                         target.lips = target.lips * (1-intensity) + 0.3 * intensity; 
                         target.lipLen = target.lipLen * (1-intensity) + 0.2 * intensity; 
                    }
                }

                // Smoothing
                const current = {
                    x: lastParams.x + alpha * (target.x - lastParams.x),
                    y: lastParams.y + alpha * (target.y - lastParams.y),
                    lips: lastParams.lips + alpha * (target.lips - lastParams.lips),
                    lipLen: lastParams.lipLen + alpha * (target.lipLen - lastParams.lipLen),
                    throat: lastParams.throat + alpha * (target.throat - lastParams.throat),
                    nasal: lastParams.nasal + alpha * (target.nasal - lastParams.nasal),
                };
                lastParams = current;

                // Keyframe optimization
                const delta = Math.abs(current.x - lastSavedParams.x) + Math.abs(current.lips - lastSavedParams.lips);
                if (i === result.length - 1 || delta > 0.05 || (frame.t - lastSavedTime) > 0.1) {
                    tracks.tongueX.push({ t: tNorm, v: current.x });
                    tracks.tongueY.push({ t: tNorm, v: current.y });
                    tracks.lips.push({ t: tNorm, v: current.lips });
                    tracks.lipLen.push({ t: tNorm, v: current.lipLen });
                    tracks.throat.push({ t: tNorm, v: current.throat });
                    tracks.nasal.push({ t: tNorm, v: current.nasal });
                    lastSavedParams = { ...current };
                    lastSavedTime = frame.t;
                }
            }
        }
        
        onApply(tracks);
        onClose();
    };

    const handleApplyRequest = () => setIsConfirming(true);

    // Visualization
    useEffect(() => {
        if (status === 'done' && canvasRef.current && analysisMode === 'heuristic' && result.length > 0) {
            const ctx = canvasRef.current.getContext('2d');
            if (!ctx) return;
            const w = canvasRef.current.width, h = canvasRef.current.height;
            const anchors = getAnchors();
            
            ctx.clearRect(0,0,w,h);
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0,0,w,h);
            
            const colors = ['#f43f5e', '#fb923c', '#fbbf24', '#34d399', '#3b82f6', '#a78bfa', '#ec4899', '#6366f1'];
            anchors.forEach((_, vIdx) => {
                ctx.beginPath(); ctx.strokeStyle = colors[vIdx % colors.length]; ctx.lineWidth = 2;
                result.forEach((p, i) => { const x = (i / result.length) * w; const y = h - (p.vowelProb[vIdx] * h * 0.9); if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
                ctx.stroke();
            });
        }
        
        // AI Model Visualization (Simple Line for Tongue X)
        if (status === 'done' && canvasRef.current && analysisMode === 'ai_model' && modelResult) {
            const ctx = canvasRef.current.getContext('2d');
            if (!ctx) return;
            const w = canvasRef.current.width, h = canvasRef.current.height;
            ctx.clearRect(0,0,w,h); ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,w,h);
            
            const drawTrack = (data: number[], color: string) => {
                ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
                for(let i=0; i<data.length; i++) {
                    const x = (i / data.length) * w; const y = h - (data[i] * h * 0.9);
                    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
                }
                ctx.stroke();
            };
            drawTrack(modelResult.tongueX, '#f43f5e');
            drawTrack(modelResult.lips, '#fbbf24');
        }
    }, [status, result, modelResult, analysisMode, language]);

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-[700px] flex flex-col overflow-hidden font-sans border border-slate-200 max-h-[90vh]">
                <div className="p-4 bg-slate-50 border-b flex justify-between items-center shrink-0">
                    <h3 className="font-black text-slate-700 flex items-center gap-2"><Wand2 size={18} className="text-purple-500"/> AI 발음 분석기</h3>
                    <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                    {/* Mode Selection */}
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button onClick={()=>setAnalysisMode('heuristic')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 ${analysisMode==='heuristic'?'bg-white text-slate-900 shadow-sm':'text-slate-400'}`}>
                            <Activity size={14}/> 휴리스틱 분석 (Formant)
                        </button>
                        <button onClick={()=>setAnalysisMode('ai_model')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 ${analysisMode==='ai_model'?'bg-white text-purple-600 shadow-sm':'text-slate-400'}`}>
                            <Cpu size={14}/> 외부 AI 모델 (.onnx)
                        </button>
                    </div>

                    <div className="flex gap-2 items-end">
                        <div className="flex-1 space-y-1">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">분석할 오디오</label>
                            <select value={selectedId} onChange={e=>{setSelectedId(e.target.value); setIsConfirming(false);}} className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 ring-purple-200">
                                <option value="">파일 선택...</option>
                                {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                            {errorMsg && <div className="flex items-center gap-2 text-xs font-bold text-red-500 mt-1 animate-pulse"><AlertTriangle size={14}/> {errorMsg}</div>}
                        </div>
                        
                        {analysisMode === 'heuristic' && (
                            <div className="space-y-1 w-28">
                                 <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Languages size={12}/> 언어 선택</label>
                                 <select value={language} onChange={e=>setLanguage(e.target.value as LanguageMode)} className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-black outline-none">
                                    <option value="JP">일본어 (JP)</option>
                                    <option value="KR">한국어 (KR)</option>
                                    <option value="EN">영어 (EN)</option>
                                 </select>
                            </div>
                        )}

                        <button onClick={analyze} disabled={!selectedId || status === 'analyzing' || !!errorMsg || (analysisMode==='ai_model' && !modelFile)} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-black text-sm flex items-center gap-2 transition-all disabled:opacity-50 h-10 shadow-md">
                            {status.includes('analyzing') || status.includes('loading') ? <Activity className="animate-spin" size={16}/> : <Play size={16}/>} 분석
                        </button>
                    </div>

                    {/* AI Model Uploader */}
                    {analysisMode === 'ai_model' && (
                        <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 border-dashed border-2 flex flex-col items-center justify-center gap-2 text-purple-800">
                            <UploadCloud size={32} className="opacity-50"/>
                            <div className="text-center">
                                <label className="cursor-pointer bg-purple-600 text-white px-4 py-1.5 rounded-lg text-xs font-black hover:bg-purple-700 transition-colors shadow-sm inline-block mb-1">
                                    .ONNX 모델 업로드
                                    <input type="file" accept=".onnx" className="hidden" onChange={handleModelUpload}/>
                                </label>
                                <p className="text-[10px] opacity-70 font-bold">{modelName || "WFL 모델 파일이 필요합니다."}</p>
                            </div>
                            <p className="text-[9px] text-purple-600/70 text-center px-4">
                                * 모델은 [1, samples] 형태의 오디오 입력을 받고, [Time, 6] 형태의 성도 파라미터(TongueX/Y, Lips, etc)를 출력해야 합니다.
                            </p>
                        </div>
                    )}

                    {/* Visualization Area */}
                    <div className="bg-slate-900 rounded-xl overflow-hidden relative h-[220px] shadow-inner border border-slate-700 group shrink-0">
                        {status === 'idle' && <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs font-bold">오디오 파일을 선택하고 분석을 시작하세요</div>}
                        <canvas ref={canvasRef} width={650} height={220} className="w-full h-full object-cover"/>
                        {status === 'done' && analysisMode === 'heuristic' && (
                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg flex gap-2 flex-wrap max-w-[300px] justify-end text-[10px] font-mono font-bold text-white pointer-events-none border border-white/10">
                                {getAnchors().map(a => <span key={a.label} className="opacity-80">{a.label}</span>)}
                            </div>
                        )}
                        {status === 'done' && analysisMode === 'ai_model' && (
                             <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold text-white border border-white/10">
                                AI Model Output
                             </div>
                        )}
                    </div>

                    {/* Heuristic Params */}
                    {analysisMode === 'heuristic' && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-1">
                                    <div className="flex justify-between text-xs font-bold text-slate-600"><span>모션 스무딩</span><span className="text-purple-600">{Math.round(smoothing * 100)}%</span></div>
                                    <input type="range" min="0" max="0.95" step="0.05" value={smoothing} onChange={e=>setSmoothing(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-purple-500"/>
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className="flex justify-between text-xs font-bold text-slate-600"><span>분석 민감도</span><span className="text-purple-600">x{sensitivity.toFixed(1)}</span></div>
                                    <input type="range" min="0.5" max="3.0" step="0.1" value={sensitivity} onChange={e=>setSensitivity(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-purple-500"/>
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
                                <div className="flex items-center gap-2"><AlignCenterVertical size={16} className="text-purple-500"/><span className="text-xs font-black text-slate-700">자음 탐지 강화 (M/P, S/Sh)</span></div>
                                <button onClick={()=>setDetectConsonants(!detectConsonants)} className={`transition-colors ${detectConsonants ? 'text-purple-600' : 'text-slate-300'}`}>{detectConsonants ? <ToggleRight size={32} fill="currentColor"/> : <ToggleLeft size={32} fill="currentColor"/>}</button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-slate-50 flex justify-end gap-2 shrink-0 h-[72px] items-center">
                    {isConfirming ? (
                         <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 w-full justify-between bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                            <div className="flex items-center gap-2 text-xs font-black text-red-600"><AlertTriangle size={16}/> 주의: 기존 트랙이 덮어씌워집니다.</div>
                            <div className="flex gap-2">
                                <button onClick={() => setIsConfirming(false)} className="px-3 py-1.5 bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold shadow-sm transition-colors">취소</button>
                                <button onClick={confirmApply} className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-black shadow-md transition-all active:scale-95">확인 및 적용</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-lg text-sm font-bold transition-colors">취소</button>
                            <button onClick={handleApplyRequest} disabled={status !== 'done'} className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-black flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg active:scale-95">
                                <Layers size={16}/> 트랙 생성 및 적용
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FormantAnalyzer;