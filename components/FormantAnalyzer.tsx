
import React, { useState, useRef, useEffect } from 'react';
import { Mic2, Activity, Play, Check, X, Wand2, Settings2, Sparkles, Layers, FileText, ToggleLeft, ToggleRight, AlertTriangle, Info } from 'lucide-react';
import { AudioFile } from '../types';
import { AudioUtils } from '../utils/audioUtils';

interface FormantAnalyzerProps {
    files: AudioFile[];
    audioContext: AudioContext;
    onClose: () => void;
    onApply: (trackData: { tongueX?: any[], tongueY?: any[], lips?: any[], lipLen?: any[], throat?: any[], nasal?: any[] }) => void;
}

// Vowel Anchors Definition
const VOWEL_ANCHORS = [
    { label: 'A', f1: 800, f2: 1200, tract: { x: 0.2, y: 0.1, lips: 0.9, lipLen: 0.5, throat: 0.1, nasal: 0.0 } },
    { label: 'E', f1: 500, f2: 1800, tract: { x: 0.6, y: 0.5, lips: 0.7, lipLen: 0.5, throat: 0.3, nasal: 0.0 } },
    { label: 'I', f1: 300, f2: 2500, tract: { x: 0.9, y: 0.9, lips: 0.2, lipLen: 0.5, throat: 0.2, nasal: 0.0 } },
    { label: 'O', f1: 500, f2: 850,  tract: { x: 0.2, y: 0.4, lips: 0.3, lipLen: 0.6, throat: 0.5, nasal: 0.0 } },
    { label: 'U', f1: 320, f2: 1100, tract: { x: 0.1, y: 0.8, lips: 0.2, lipLen: 0.8, throat: 0.4, nasal: 0.0 } },
    { label: 'N', f1: 220, f2: 1300, tract: { x: 0.5, y: 0.1, lips: 0.0, lipLen: 0.8, throat: 0.4, nasal: 1.0 } },
];

const FormantAnalyzer: React.FC<FormantAnalyzerProps> = ({ files, audioContext, onClose, onApply }) => {
    const [selectedId, setSelectedId] = useState("");
    const [status, setStatus] = useState<'idle' | 'analyzing' | 'done'>('idle');
    const [result, setResult] = useState<{t:number, f1:number, f2:number, f3:number, energy:number, vowelProb: number[]}[]>([]);
    const [isConfirming, setIsConfirming] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Analysis Params
    const [smoothing, setSmoothing] = useState(0.55); 
    const [sensitivity, setSensitivity] = useState(1.0);
    const [useFilenameHint, setUseFilenameHint] = useState(false);
    const [detectedHints, setDetectedHints] = useState<string[]>([]);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Helper to parse filename into vowels
    const extractVowelsFromName = (name: string): string[] => {
        const raw = name.substring(0, name.lastIndexOf('.')) || name;
        const parts = raw.split(/[_'\-\s\.]+/);
        
        const vowels: string[] = [];
        const reA = /a|あ|か|さ|た|나|하|마|야|라|와|가|자|다|바|파|아/i;
        const reI = /i|い|き|し|ち|니|히|미|리|기|지|디|비|피|이/i;
        const reU = /u|う|く|す|つ|누|후|무|유|루|구|주|두|부|푸|우/i;
        const reE = /e|え|け|せ|て|네|헤|메|레|게|제|데|베|페|에/i;
        const reO = /o|お|こ|そ|と|노|호|모|요|로|고|조|도|보|포|오/i;
        const reN = /n|nn|ん|응|앙|잉|옹|웅|은|는/i;

        parts.forEach(part => {
            if (!part) return;
            if (reN.test(part) && (part.toLowerCase() === 'n' || part.toLowerCase() === 'nn' || part.endsWith('n') || part.includes('ん') || /[ㄴㅇㅁ]$/.test(part))) {
                vowels.push('N');
            } else if (reA.test(part) && (part.endsWith('a') || reA.test(part))) vowels.push('A');
            else if (reI.test(part) && (part.endsWith('i') || reI.test(part))) vowels.push('I');
            else if (reU.test(part) && (part.endsWith('u') || reU.test(part))) vowels.push('U');
            else if (reE.test(part) && (part.endsWith('e') || reE.test(part))) vowels.push('E');
            else if (reO.test(part) && (part.endsWith('o') || reO.test(part))) vowels.push('O');
        });
        return vowels;
    };

    useEffect(() => {
        setErrorMsg(null);
        if (selectedId) {
            const f = files.find(f => f.id === selectedId);
            if (f) {
                if (f.buffer.duration > 7.0) {
                    setErrorMsg("분석 부하를 줄이기 위해 7초 이하의 파일만 지원합니다.");
                } else if (useFilenameHint) {
                    setDetectedHints(extractVowelsFromName(f.name));
                }
            }
        } else {
            setDetectedHints([]);
        }
    }, [selectedId, useFilenameHint, files]);

    const analyze = async () => {
        const file = files.find(f => f.id === selectedId);
        if (!file) return;
        
        if (file.buffer.duration > 7.0) {
            setErrorMsg("7초 이하의 파일만 분석할 수 있습니다.");
            return;
        }

        setStatus('analyzing');
        setIsConfirming(false);
        const hints = useFilenameHint ? extractVowelsFromName(file.name) : [];
        setDetectedHints(hints);

        setTimeout(() => {
            try {
                const rawFormants = AudioUtils.analyzeFormants(file.buffer);
                
                let maxEnergy = 0;
                rawFormants.forEach(r => { if(r.energy > maxEnergy) maxEnergy = r.energy; });
                
                const processed = [];
                let last = { f1: 500, f2: 1500, f3: 2500 };
                const maxDist = 450; 
                const duration = file.buffer.duration;

                for(let i=0; i<rawFormants.length; i++) {
                    const curr = rawFormants[i];
                    
                    const smFactor = 0.3; 
                    curr.f1 = last.f1 * smFactor + curr.f1 * (1 - smFactor);
                    curr.f2 = last.f2 * smFactor + curr.f2 * (1 - smFactor);
                    curr.f3 = last.f3 * smFactor + curr.f3 * (1 - smFactor);
                    last = { f1: curr.f1, f2: curr.f2, f3: curr.f3 };

                    const relEnergy = curr.energy / (maxEnergy || 1);

                    let probs = VOWEL_ANCHORS.map(anchor => {
                        const dist = Math.sqrt(
                            Math.pow((curr.f1 - anchor.f1) * 1.5, 2) + 
                            Math.pow((curr.f2 - anchor.f2) * 0.8, 2)
                        );
                        let p = Math.exp(-(dist * dist) / (2 * Math.pow(maxDist / sensitivity, 2)));
                        
                        if (anchor.label === 'N' && relEnergy > 0.8) p *= 0.2; 
                        return p;
                    });

                    if (hints.length > 0) {
                        const segmentDur = duration / hints.length;
                        const hintIndex = Math.floor(curr.t / segmentDur);
                        const targetHint = hints[Math.min(hintIndex, hints.length - 1)];
                        const anchorIdx = VOWEL_ANCHORS.findIndex(v => v.label === targetHint);
                        if (anchorIdx !== -1) probs[anchorIdx] *= 5.0; 
                    }

                    probs = probs.map(p => Math.pow(p, 2.5));
                    const totalProb = probs.reduce((a, b) => a + b, 0) || 1;
                    const normProbs = probs.map(p => p / totalProb);

                    processed.push({ ...curr, vowelProb: normProbs });
                }
                setResult(processed);
                setStatus('done');
            } catch (e) {
                console.error(e);
                setStatus('idle');
            }
        }, 100);
    };

    useEffect(() => {
        if (status === 'done' && canvasRef.current && result.length > 0) {
            const ctx = canvasRef.current.getContext('2d');
            if (!ctx) return;
            const w = canvasRef.current.width;
            const h = canvasRef.current.height;
            const duration = result[result.length-1].t;

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, w, h);

            const cellH = h / VOWEL_ANCHORS.length;
            VOWEL_ANCHORS.forEach((v, i) => {
                ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
                ctx.fillRect(0, i * cellH, w, cellH);
                ctx.fillStyle = '#475569';
                ctx.font = '10px sans-serif';
                ctx.fillText(v.label, 10, i * cellH + cellH / 2 + 3);
            });

            if (useFilenameHint && detectedHints.length > 0) {
                const segW = w / detectedHints.length;
                detectedHints.forEach((hint, i) => {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                    ctx.fillRect(i * segW, 0, 1, h);
                    ctx.font = '24px font-black sans-serif';
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.textAlign = 'center';
                    ctx.fillText(hint, i * segW + segW/2, h/2);
                });
                ctx.textAlign = 'start';
            }

            const colors = ['#f43f5e', '#fb923c', '#fbbf24', '#34d399', '#3b82f6', '#a78bfa'];
            VOWEL_ANCHORS.forEach((_, vIdx) => {
                ctx.beginPath();
                ctx.strokeStyle = colors[vIdx];
                ctx.lineWidth = 2;
                result.forEach((p, i) => {
                    const x = (p.t / duration) * w;
                    const y = h - (p.vowelProb[vIdx] * (h * 0.8)) - 10;
                    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
                });
                ctx.stroke();
            });
        }
    }, [status, result, useFilenameHint, detectedHints]);

    const handleApplyRequest = () => {
        if (result.length === 0) return;
        setIsConfirming(true);
    };

    const confirmApply = () => {
        const tracks: any = { tongueX: [], tongueY: [], lips: [], lipLen: [], throat: [], nasal: [] };
        const duration = result[result.length-1].t;
        
        let maxEnergy = 0;
        result.forEach(r => { if(r.energy > maxEnergy) maxEnergy = r.energy; });
        const silenceThresh = maxEnergy * 0.15; 
        
        let lastParams = { x: 0.5, y: 0.5, lips: 0.5, lipLen: 0.5, throat: 0.5, nasal: 0 };
        let lastSavedParams = { ...lastParams };
        let lastSavedTime = -100;
        
        const alpha = 1.0 - smoothing; 
        
        // Smart Keyframe Thresholds
        // Adjusted: 0.09 provides a sparser keyframe distribution for smoother curve interpolation
        const changeThreshold = 0.09 * (3.5 - sensitivity); 
        const maxTimeGap = 1.5; 
        
        for(let i=0; i<result.length; i++) {
            const frame = result[i];
            const tNorm = frame.t / duration;
            
            let target = { x: 0, y: 0, lips: 0, lipLen: 0, throat: 0, nasal: 0 };
            
            // Blend Vowel Targets
            frame.vowelProb.forEach((prob, idx) => {
                const anchor = VOWEL_ANCHORS[idx].tract;
                target.x += anchor.x * prob;
                target.y += anchor.y * prob;
                target.lips += anchor.lips * prob;
                target.lipLen += anchor.lipLen * prob;
                target.throat += anchor.throat * prob;
                target.nasal += anchor.nasal * prob;
            });

            // Silence Detection
            if (frame.energy < silenceThresh) {
                const silenceFactor = 1.0 - (frame.energy / silenceThresh);
                target.lips = target.lips * (1.0 - silenceFactor); 
                target.nasal = target.nasal * (1.0 - silenceFactor); 
            }
            
            // EMA Smoothing
            const current = {
                x: lastParams.x + alpha * (target.x - lastParams.x),
                y: lastParams.y + alpha * (target.y - lastParams.y),
                lips: lastParams.lips + alpha * (target.lips - lastParams.lips),
                lipLen: lastParams.lipLen + alpha * (target.lipLen - lastParams.lipLen),
                throat: lastParams.throat + alpha * (target.throat - lastParams.throat),
                nasal: lastParams.nasal + alpha * (target.nasal - lastParams.nasal),
            };
            lastParams = current;

            // Smart Keyframing
            const delta = 
                Math.abs(current.x - lastSavedParams.x) + 
                Math.abs(current.y - lastSavedParams.y) + 
                Math.abs(current.lips - lastSavedParams.lips) +
                Math.abs(current.nasal - lastSavedParams.nasal);

            const timeGap = frame.t - lastSavedTime;
            const isLast = i === result.length - 1;

            if (isLast || delta > changeThreshold || timeGap > maxTimeGap) {
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

        onApply(tracks);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-[700px] flex flex-col overflow-hidden font-sans border border-slate-200 max-h-[90vh]">
                <div className="p-4 bg-slate-50 border-b flex justify-between items-center shrink-0">
                    <h3 className="font-black text-slate-700 flex items-center gap-2"><Wand2 size={18} className="text-purple-500"/> AI 모음/자음 모방</h3>
                    <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                    {/* File Selection */}
                    <div className="flex gap-2 items-end">
                        <div className="flex-1 space-y-1">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">분석할 파일</label>
                            <select value={selectedId} onChange={e=>{setSelectedId(e.target.value); setIsConfirming(false);}} className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 ring-purple-200">
                                <option value="">파일 선택...</option>
                                {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                            {errorMsg && (
                                <div className="flex items-center gap-2 text-xs font-bold text-red-500 mt-1 animate-pulse">
                                    <AlertTriangle size={14}/> {errorMsg}
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={analyze} 
                            disabled={!selectedId || status === 'analyzing' || !!errorMsg}
                            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-black text-sm flex items-center gap-2 transition-all disabled:opacity-50 h-10 shadow-md"
                        >
                            {status === 'analyzing' ? <Activity className="animate-spin" size={16}/> : <Play size={16}/>}
                            분석
                        </button>
                    </div>

                    {/* Visualization */}
                    <div className="bg-slate-900 rounded-xl overflow-hidden relative h-[220px] shadow-inner border border-slate-700 group shrink-0">
                        {status === 'idle' && <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs font-bold">오디오 파일을 선택하고 분석을 시작하세요</div>}
                        <canvas ref={canvasRef} width={650} height={220} className="w-full h-full object-cover"/>
                        {status === 'done' && (
                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg flex gap-3 text-[10px] font-mono font-bold text-white pointer-events-none border border-white/10">
                                <span className="text-[#f43f5e]">A</span>
                                <span className="text-[#fb923c]">E</span>
                                <span className="text-[#fbbf24]">I</span>
                                <span className="text-[#34d399]">O</span>
                                <span className="text-[#3b82f6]">U</span>
                                <span className="text-[#a78bfa]">N</span>
                            </div>
                        )}
                    </div>

                    {/* Settings */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Settings2 size={16} className="text-slate-400"/>
                            <h4 className="text-xs font-black text-slate-600 uppercase tracking-wider">생성 파라미터</h4>
                        </div>
                        
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                            {/* Filename Hint Toggle */}
                            <div className={`flex flex-col gap-3 p-4 rounded-lg border transition-all ${useFilenameHint ? 'bg-purple-50 border-purple-200 shadow-sm' : 'bg-white border-slate-200'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                                            <FileText size={14} className={useFilenameHint ? "text-purple-600" : "text-slate-400"}/>
                                            파일명 힌트 사용
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-medium">파일명(예: a'i.wav, u_ka_ma)을 분석하여 인식률을 획기적으로 높입니다.</p>
                                    </div>
                                    <button onClick={()=>setUseFilenameHint(!useFilenameHint)} className={`transition-colors ${useFilenameHint ? 'text-purple-600' : 'text-slate-300'}`}>
                                        {useFilenameHint ? <ToggleRight size={32} fill="currentColor"/> : <ToggleLeft size={32} fill="currentColor"/>}
                                    </button>
                                </div>
                                {useFilenameHint && (
                                    <div className="text-[11px] text-purple-700 bg-purple-100/50 p-3 rounded-md border border-purple-100 flex gap-2 items-start leading-relaxed">
                                        <Info size={16} className="shrink-0 mt-0.5"/>
                                        <div>
                                            <b>사용법:</b> 파일명에 <b>`_`, `'`</b> 또는 공백을 넣어 발음 구간을 나누세요.<br/>
                                            예: <code>u_ka_ma.wav</code> (3음절), <code>a'i.wav</code> (2음절).<br/>
                                            <span className="opacity-80 mt-1 block text-[10px]">* 히라가나, 한글 모음(아,이,우...), 알파벳(a,i,u...) 모두 인식합니다.</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {useFilenameHint && detectedHints.length > 0 && (
                                <div className="px-3 py-2 bg-white rounded-lg border border-slate-200 flex items-center gap-2">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Detected:</span>
                                    <div className="flex gap-1 flex-wrap">
                                        {detectedHints.map((h, i) => (
                                            <span key={i} className="text-xs font-black bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">{h}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-slate-600">
                                    <span>모션 스무딩 (Motion Smoothing)</span>
                                    <span className="text-purple-600">{Math.round(smoothing * 100)}%</span>
                                </div>
                                <input type="range" min="0" max="0.95" step="0.05" value={smoothing} onChange={e=>setSmoothing(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-purple-500"/>
                                <p className="text-[10px] text-slate-400 font-medium">값이 작을수록 움직임이 빠르고 날카로워집니다.</p>
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs font-bold text-slate-600">
                                    <span>분석 민감도 (Sensitivity)</span>
                                    <span className="text-purple-600">x{sensitivity.toFixed(1)}</span>
                                </div>
                                <input type="range" min="0.5" max="3.0" step="0.1" value={sensitivity} onChange={e=>setSensitivity(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-purple-500"/>
                                <p className="text-[10px] text-slate-400 font-medium">값이 클수록 모음 구분을 더 엄격하게 판단합니다.</p>
                            </div>
                        </div>

                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex gap-3 items-start">
                             <Sparkles size={16} className="text-blue-500 mt-0.5 shrink-0"/>
                             <div className="text-[11px] text-blue-700 leading-relaxed font-medium">
                                 <b>스마트 키프레임 적용됨:</b> 움직임이 급격한 구간(발음 변화)에는 키프레임을 많이, 일정한 구간에는 적게 생성하여 최적의 부드러움을 제공합니다. (자동으로 곡선 보간이 적용됩니다)
                             </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-slate-50 flex justify-end gap-2 shrink-0 h-[72px] items-center">
                    {isConfirming ? (
                         <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 w-full justify-between bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                            <div className="flex items-center gap-2 text-xs font-black text-red-600">
                                <AlertTriangle size={16}/> 주의: 기존 트랙의 키프레임이 덮어씌워집니다.
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setIsConfirming(false)} className="px-3 py-1.5 bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold shadow-sm transition-colors">취소</button>
                                <button onClick={confirmApply} className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-black shadow-md transition-all active:scale-95">확인 및 적용</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-lg text-sm font-bold transition-colors">취소</button>
                            <button 
                                onClick={handleApplyRequest} 
                                disabled={status !== 'done'}
                                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-black flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg active:scale-95"
                            >
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
