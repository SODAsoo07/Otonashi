import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  MoveHorizontal, CircleDot, Pause, Play, Sliders, RotateCcw, RefreshCw, MousePointer2, 
  Undo2, Redo2, History, AudioLines, GripVertical, Settings2, PencilLine, Download, Save, 
  Mic2, Wind, Activity, Wand2, GitCommit, Spline, Repeat, Music, Check, X, Sparkles, 
  Layers, FileText, ToggleLeft, ToggleRight, AlertTriangle, Info 
} from 'lucide-react';
import { AudioFile, AdvTrack, LarynxParams, LiveTractState, EQBand, KeyframePoint } from '../types';
import { AudioUtils, RULER_HEIGHT } from '../utils/audioUtils';
import { Language, i18n } from '../utils/i18n';
import ParametricEQ from './ParametricEQ';

// --- FormantAnalyzer Component & Constants (Merged) ---

// Vowel Anchors Definition
const VOWEL_ANCHORS = [
    { label: 'A', f1: 800, f2: 1200, tract: { x: 0.2, y: 0.1, lips: 0.9, lipLen: 0.5, throat: 0.1, nasal: 0.0 } },
    { label: 'E', f1: 500, f2: 1800, tract: { x: 0.6, y: 0.5, lips: 0.7, lipLen: 0.5, throat: 0.3, nasal: 0.0 } },
    { label: 'I', f1: 300, f2: 2500, tract: { x: 0.9, y: 0.9, lips: 0.2, lipLen: 0.5, throat: 0.2, nasal: 0.0 } },
    { label: 'O', f1: 500, f2: 850,  tract: { x: 0.2, y: 0.4, lips: 0.3, lipLen: 0.6, throat: 0.5, nasal: 0.0 } },
    { label: 'U', f1: 320, f2: 1100, tract: { x: 0.1, y: 0.8, lips: 0.2, lipLen: 0.8, throat: 0.4, nasal: 0.0 } },
    { label: 'N', f1: 220, f2: 1300, tract: { x: 0.5, y: 0.1, lips: 0.0, lipLen: 0.8, throat: 0.4, nasal: 1.0 } },
];

interface FormantAnalyzerProps {
    files: AudioFile[];
    audioContext: AudioContext;
    onClose: () => void;
    onApply: (trackData: { tongueX?: any[], tongueY?: any[], lips?: any[], lipLen?: any[], throat?: any[], nasal?: any[] }) => void;
}

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

// --- End of FormantAnalyzer ---

interface AdvancedTractTabProps {
  lang: Language;
  audioContext: AudioContext;
  files: AudioFile[];
  onAddToRack: (buffer: AudioBuffer, name: string) => void;
  isActive: boolean;
}

const cubicHermite = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const a = 2 * p0 - 5 * p1 + 4 * p2 - p3;
    const b = -p0 + 3 * p1 - 3 * p2 + p3;
    const c = p2 - p0;
    const d = 2 * p1;
    return 0.5 * (a * t * t * t + b * t * t + c * t + d);
};

const AdvancedTractTab: React.FC<AdvancedTractTabProps> = ({ lang, audioContext, files, onAddToRack, isActive }) => {
    const [larynxParams, setLarynxParams] = useState<LarynxParams>({ jitterOn: true, jitterDepth: 0.1, jitterRate: 20, breathOn: true, breathGain: 0.05, noiseSourceType: 'generated', noiseSourceFileId: "", loopOn: true });
    const [shimmerAmount, setShimmerAmount] = useState(0.05); 
    const [tractSourceType, setTractSourceType] = useState<'synth' | 'file'>('synth'); 
    const [tractSourceFileId, setTractSourceFileId] = useState("");
    const [synthWaveform, setSynthWaveform] = useState('sawtooth'); 
    const [advDuration] = useState(2.0);
    const [isAdvPlaying, setIsAdvPlaying] = useState(false);
    const [playHeadPos, setPlayheadPos] = useState(0); 
    const [liveTract, setLiveTract] = useState<LiveTractState>({ x: 0.5, y: 0.4, lips: 0.7, lipLen: 0.5, throat: 0.5, nasal: 0.2 }); 
    const [manualPitch, setManualPitch] = useState(220);
    const [manualGender, setManualGender] = useState(1.0);
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedTrackId, setSelectedTrackId] = useState('pitch'); 
    const [draggingKeyframe, setDraggingKeyframe] = useState<{trackId?: string, index?: number, isPlayhead?: boolean} | null>(null);
    const [draggingSim, setDraggingSim] = useState<'tongue' | 'lips' | 'nasal' | null>(null);
    const [previewBuffer, setPreviewBuffer] = useState<AudioBuffer | null>(null);
    const [showAnalyzer, setShowAnalyzer] = useState(false);
    const [sidebarTab, setSidebarTab] = useState<'larynx' | 'params'>('larynx');

    const [eqBands, setEqBands] = useState<EQBand[]>([
        { id: 1, type: 'highpass', freq: 80, gain: 0, q: 0.7, on: true },
        { id: 2, type: 'peaking', freq: 1500, gain: 0, q: 1.0, on: true },
        { id: 3, type: 'highshelf', freq: 6000, gain: 0, q: 0.7, on: true }
    ]);

    const [advTracks, setAdvTracks] = useState<AdvTrack[]>([
        { id: 'tongueX', name: '혀 위치 (X)', group: 'adj', color: '#60a5fa', points: [{t:0, v:0.5}, {t:1, v:0.5}], min:0, max:1, interpolation: 'curve' },
        { id: 'tongueY', name: '혀 높이 (Y)', group: 'adj', color: '#4ade80', points: [{t:0, v:0.4}, {t:1, v:0.4}], min:0, max:1, interpolation: 'curve' },
        { id: 'lips',    name: '입술 열기', group: 'adj', color: '#f472b6', points: [{t:0, v:0.7}, {t:1, v:0.7}], min:0, max:1, interpolation: 'curve' },
        { id: 'nasal',   name: '연구개 (Velum)', group: 'adj', color: '#fb923c', points: [{t:0, v:0.2}, {t:1, v:0.2}], min:0, max:1, interpolation: 'curve' },
        { id: 'pitch',   name: '피치 (Hz)', group: 'edit', color: '#fbbf24', points: [{t:0, v:220}, {t:1, v:220}], min:50, max:600, interpolation: 'curve' },
        { id: 'gender',  name: '성별 (Shift)', group: 'edit', color: '#ec4899', points: [{t:0, v:1}, {t:1, v:1}], min:0.5, max:2.0, interpolation: 'curve' },
        { id: 'gain',    name: '게인 (Vol)', group: 'edit', color: '#ef4444', points: [{t:0, v:0}, {t:0.1, v:1}, {t:0.9, v:1}, {t:1, v:0}], min:0, max:1.5, interpolation: 'linear' },
        { id: 'breath',  name: '숨소리',     group: 'edit', color: '#22d3ee', points: [{t:0, v:0.01}, {t:1, v:0.01}], min:0, max:0.3, interpolation: 'linear' }
    ]);
    
    const liveAudioRef = useRef<any>(null); 
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lastRenderedRef = useRef<AudioBuffer | null>(null);
    const simPlaySourceRef = useRef<AudioBufferSourceNode | null>(null);
    const previewDebounceRef = useRef<number | null>(null);

    const t = i18n[lang];

    const getValueAtTime = useCallback((trackId: string, tVal: number) => {
        const track = advTracks.find(tr => tr.id === trackId);
        if (!track) return 0;
        const pts = track.points;
        if(pts.length === 0) return track.min;
        if(tVal <= pts[0].t) return pts[0].v;
        if(tVal >= pts[pts.length-1].t) return pts[pts.length-1].v;
        if (track.interpolation === 'curve') {
             let i = 0; while(i < pts.length - 1 && pts[i+1].t < tVal) i++;
             const p0 = i > 0 ? pts[i-1] : pts[i], p1 = pts[i], p2 = pts[i+1], p3 = i < pts.length - 2 ? pts[i+2] : pts[i+1];
             const range = p2.t - p1.t; if (range === 0) return p1.v;
             const tLocal = (tVal - p1.t) / range;
             return Math.max(track.min, Math.min(track.max, cubicHermite(p0.v, p1.v, p2.v, p3.v, tLocal)));
        } else {
            for(let i=0; i<pts.length-1; i++) { if(tVal >= pts[i].t && tVal <= pts[i+1].t) { const ratio = (tVal - pts[i].t) / (pts[i+1].t - pts[i].t); return pts[i].v + (pts[i+1].v - pts[i].v) * ratio; } }
        }
        return pts[0].v;
    }, [advTracks]);

    const syncVisualsToTime = useCallback((tVal: number) => {
        setLiveTract({
            x: getValueAtTime('tongueX', tVal),
            y: getValueAtTime('tongueY', tVal),
            lips: getValueAtTime('lips', tVal),
            lipLen: 0.5, throat: 0.5,
            nasal: getValueAtTime('nasal', tVal),
        });
        setManualPitch(getValueAtTime('pitch', tVal));
        setManualGender(getValueAtTime('gender', tVal));
    }, [getValueAtTime]);

    const startLivePreview = useCallback(() => {
        if (!audioContext || liveAudioRef.current) return;
        let sNode: any; let nNode: any;
        if (tractSourceType === 'file' && tractSourceFileId) { 
            const f = files.find(fi => fi.id === tractSourceFileId); 
            if (f?.buffer) { sNode = audioContext.createBufferSource(); sNode.buffer = f.buffer; sNode.loop = larynxParams.loopOn; } 
        }
        if (!sNode) { 
            if (synthWaveform === 'noise') {
                const bufferSize = audioContext.sampleRate * 2; const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
                const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                sNode = audioContext.createBufferSource(); sNode.buffer = buffer; sNode.loop = true;
            } else { sNode = audioContext.createOscillator(); sNode.type = synthWaveform as OscillatorType; sNode.frequency.value = manualPitch; }
        }
        const bufferSize = audioContext.sampleRate * 2; const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        nNode = audioContext.createBufferSource(); nNode.buffer = buffer; nNode.loop = true;
        const g = audioContext.createGain(); g.gain.value = 0.5;
        const nG = audioContext.createGain(); nG.gain.value = larynxParams.breathGain;
        const f1 = audioContext.createBiquadFilter(); f1.type = 'peaking'; f1.Q.value = 4; f1.gain.value = 12;
        const f2 = audioContext.createBiquadFilter(); f2.type = 'peaking'; f2.Q.value = 4; f2.gain.value = 12;
        const f3 = audioContext.createBiquadFilter(); f3.type = 'peaking'; f3.Q.value = 4; f3.gain.value = 10;
        const nasF = audioContext.createBiquadFilter(); nasF.type = 'lowpass';
        let lastNode: AudioNode = nasF;
        eqBands.forEach(b => { if(b.on) { const eq = audioContext.createBiquadFilter(); eq.type = b.type; eq.frequency.value = b.freq; eq.gain.value = b.gain; eq.Q.value = b.q; lastNode.connect(eq); lastNode = eq; } });
        sNode.connect(f1); nNode.connect(nG); nG.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); lastNode.connect(g); g.connect(audioContext.destination);
        sNode.start(); nNode.start();
        liveAudioRef.current = { sNode, nNode, nG, f1, f2, f3, nasF, g };
    }, [audioContext, tractSourceType, tractSourceFileId, files, larynxParams, synthWaveform, manualPitch, eqBands]);

    const stopLivePreview = useCallback(() => { 
        if (liveAudioRef.current) { try { liveAudioRef.current.sNode.stop(); if(liveAudioRef.current.nNode) liveAudioRef.current.nNode.stop(); } catch(e) {} liveAudioRef.current = null; } 
    }, []);

    const updateLiveParams = useCallback(() => {
      if(!liveAudioRef.current) return;
      const { f1, f2, f3, nasF, sNode, g } = liveAudioRef.current;
      const now = audioContext.currentTime;
      const { x, y, lips, nasal } = liveTract;
      const gFactor = manualGender;
      const jitterVal = larynxParams.jitterOn ? (Math.random() - 0.5) * larynxParams.jitterDepth * manualPitch * 0.1 : 0;
      f1.frequency.setTargetAtTime(Math.max(50, (200 + (1-y)*600)) * gFactor, now, 0.02);
      f2.frequency.setTargetAtTime((800 + x * 1400) * gFactor, now, 0.02);
      f3.frequency.setTargetAtTime((2000 + lips * 1500) * gFactor, now, 0.02);
      nasF.frequency.setTargetAtTime(Math.max(400, 10000 - nasal * 9000) * gFactor, now, 0.02);
      if(sNode instanceof OscillatorNode) sNode.frequency.setTargetAtTime(manualPitch + jitterVal, now, 0.02);
      const shim = 1.0 + (Math.random() - 0.5) * shimmerAmount;
      g.gain.setTargetAtTime(0.5 * shim, now, 0.02);
    }, [liveTract, manualPitch, manualGender, audioContext, larynxParams, shimmerAmount]);

    useEffect(() => { updateLiveParams(); }, [liveTract, manualPitch, manualGender, updateLiveParams]);

    const renderAdvancedAudio = useCallback(async () => {
        if (!audioContext) return null;
        const sr = audioContext.sampleRate; const len = Math.max(1, Math.floor(sr * advDuration)); const offline = new OfflineAudioContext(1, len, sr);
        const getV = (id: string, tVal: number) => getValueAtTime(id, tVal);
        let sNode: AudioNode;
        if (tractSourceType === 'file' && tractSourceFileId) { 
            const f = files.find(fi => fi.id === tractSourceFileId); if (f?.buffer) { const b = offline.createBufferSource(); b.buffer = f.buffer; b.loop = larynxParams.loopOn; sNode = b; } else sNode = offline.createOscillator();
        } else {
            if (synthWaveform === 'noise') {
                const bufferSize = sr * advDuration; const buffer = offline.createBuffer(1, bufferSize, sr);
                const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                const noiseSrc = offline.createBufferSource(); noiseSrc.buffer = buffer; sNode = noiseSrc;
            } else {
                const osc = offline.createOscillator(); osc.type = synthWaveform as any;
                for(let i=0; i<=100; i++) { const tV = i/100; osc.frequency.linearRampToValueAtTime(getV('pitch', tV), tV * advDuration); }
                sNode = osc;
            }
        }
        const bufferSize = sr * advDuration; const buffer = offline.createBuffer(1, bufferSize, sr);
        const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const nNode = offline.createBufferSource(); nNode.buffer = buffer; nNode.loop = true;
        const nG = offline.createGain(); const mG = offline.createGain(); 
        for(let i=0; i<=60; i++) { const tV = i/60; mG.gain.linearRampToValueAtTime(getV('gain', tV), tV * advDuration); nG.gain.linearRampToValueAtTime(getV('breath', tV), tV * advDuration); }
        const f1=offline.createBiquadFilter(), f2=offline.createBiquadFilter(), f3=offline.createBiquadFilter(), nasF=offline.createBiquadFilter(); 
        [f1,f2,f3].forEach(f=>{ f.type='peaking'; f.Q.value=4; f.gain.value=12; }); nasF.type='lowpass';
        for(let i=0; i<=60; i++) {
            const tV = i/60; const time = tV * advDuration; const x=getV('tongueX', tV), y=getV('tongueY', tV), l=getV('lips', tV), n=getV('nasal', tV), gf=getV('gender', tV);
            f1.frequency.linearRampToValueAtTime(Math.max(50, (200 + (1-y)*600)) * gf, time); f2.frequency.linearRampToValueAtTime((800 + x*1400) * gf, time); 
            f3.frequency.linearRampToValueAtTime((2000 + l*1500) * gf, time); nasF.frequency.linearRampToValueAtTime(Math.max(400, 10000 - n*9000) * gf, time);
        }
        sNode.connect(mG); nNode.connect(nG); nG.connect(f1); mG.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(nasF); 
        let lastNode: AudioNode = nasF;
        eqBands.forEach(b => { if(b.on) { const eq = offline.createBiquadFilter(); eq.type = b.type; eq.frequency.value = b.freq; eq.gain.value = b.gain; eq.Q.value = b.q; lastNode.connect(eq); lastNode = eq; } });
        lastNode.connect(offline.destination); if((sNode as any).start) (sNode as any).start(0); nNode.start(0);
        const res = await offline.startRendering(); lastRenderedRef.current = res; return res;
    }, [audioContext, advDuration, advTracks, tractSourceType, tractSourceFileId, files, larynxParams, synthWaveform, eqBands, getValueAtTime]);

    useEffect(() => {
        if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = window.setTimeout(async () => { const buf = await renderAdvancedAudio(); if (buf) setPreviewBuffer(buf); }, 500);
        return () => { if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current); };
    }, [renderAdvancedAudio]);

    const handleSimulationMouseDown = (e: React.MouseEvent, part: 'tongue' | 'lips' | 'nasal') => {
        e.preventDefault(); setDraggingSim(part); if (!isAdvPlaying) startLivePreview();
    };

    const handleSimulationMouseMove = (e: React.MouseEvent) => {
        if (!draggingSim) return; const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width; const y = 1 - (e.clientY - rect.top) / rect.height;
        setLiveTract(prev => {
            const next = { ...prev };
            if (draggingSim === 'tongue') { next.x = Math.max(0, Math.min(1, (x - 0.1) / 0.8)); next.y = Math.max(0, Math.min(1, (y - 0.1) / 0.8)); } 
            else if (draggingSim === 'lips') { next.lips = Math.max(0, Math.min(1, y)); } 
            else if (draggingSim === 'nasal') { next.nasal = Math.max(0, Math.min(1, y)); }
            return next;
        });
    };

    const handleSimulationMouseUp = () => { if (draggingSim) { stopLivePreview(); setDraggingSim(null); } };

    const handleTimelineMouseDown = (e: React.MouseEvent) => {
        if(!canvasRef.current) return; const rect = canvasRef.current.getBoundingClientRect(); 
        const x = e.clientX - rect.left; const tV = Math.max(0, Math.min(1, x / rect.width));
        if (isEditMode) {
            const track = advTracks.find(tr => tr.id === selectedTrackId);
            if (track) {
                const gH = rect.height - RULER_HEIGHT; const y = e.clientY - rect.top;
                const hitIdx = track.points.findIndex(p => Math.hypot((p.t * rect.width)-x, (RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * gH)-y) < 15);
                if (hitIdx !== -1) { setDraggingKeyframe({ trackId: selectedTrackId, index: hitIdx }); return; }
                if (y >= RULER_HEIGHT) {
                    const val = track.min + ((1 - ((y - RULER_HEIGHT) / gH)) * (track.max - track.min)); 
                    const nPts = [...track.points, { t: tV, v: val }].sort((a, b) => a.t - b.t); 
                    setAdvTracks(prev => prev.map(tr => tr.id === selectedTrackId ? { ...tr, points: nPts } : tr));
                    setDraggingKeyframe({ trackId: selectedTrackId, index: nPts.findIndex(p => p.t === tV) });
                }
            }
        } else { setPlayheadPos(tV); syncVisualsToTime(tV); setDraggingKeyframe({ isPlayhead: true }); }
    };

    const handleTimelineMouseMove = (e: React.MouseEvent) => {
        if(!draggingKeyframe || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); 
        const tV = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (draggingKeyframe.isPlayhead) { setPlayheadPos(tV); syncVisualsToTime(tV); } 
        else if (draggingKeyframe.trackId && draggingKeyframe.index !== undefined) { 
            const gH = rect.height - RULER_HEIGHT; 
            const nV = Math.max(0, Math.min(1, 1 - (((e.clientY - rect.top) - RULER_HEIGHT) / gH))); 
            setAdvTracks(prev => prev.map(tr => {
                if (tr.id !== draggingKeyframe.trackId) return tr;
                const valActualClamped = tr.min + nV * (tr.max - tr.min);
                return { ...tr, points: tr.points.map((p, i) => i === draggingKeyframe.index ? { t: tV, v: valActualClamped } : p).sort((a,b)=>a.t-b.t) }; 
            }));
        }
    };

    useEffect(() => {
        if(!canvasRef.current) return; const ctx = canvasRef.current.getContext('2d'); if(!ctx) return; 
        const w = canvasRef.current.width, h = canvasRef.current.height;
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#f8f8f6'; ctx.fillRect(0, RULER_HEIGHT, w, h - RULER_HEIGHT); 
        if (previewBuffer) {
            ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.strokeStyle = '#94a3b8';
            const data = previewBuffer.getChannelData(0); const step = Math.ceil(data.length / w);
            for (let i = 0; i < w; i++) {
                let minVal = 1, maxVal = -1; for (let j = 0; j < step; j++) { const d = data[i * step + j] || 0; if (d < minVal) minVal = d; if (d > maxVal) maxVal = d; }
                ctx.moveTo(i, RULER_HEIGHT + (h-RULER_HEIGHT)/2 + minVal * (h-RULER_HEIGHT)/2.5); ctx.lineTo(i, RULER_HEIGHT + (h-RULER_HEIGHT)/2 + maxVal * (h-RULER_HEIGHT)/2.5);
            }
            ctx.stroke(); ctx.globalAlpha = 1;
        }
        const track = advTracks.find(tr => tr.id === selectedTrackId);
        if (track) {
            ctx.beginPath(); ctx.strokeStyle = track.color; ctx.lineWidth = 2.5; 
            if (track.interpolation === 'curve') {
                 for(let i=0; i<w; i++) { const tV = i / w; const v = getValueAtTime(track.id, tV); const y = RULER_HEIGHT + (1 - (v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); if(i===0) ctx.moveTo(i, y); else ctx.lineTo(i, y); }
            } else { track.points.forEach((p, i) => { const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); }
            ctx.stroke(); 
            track.points.forEach((p, i) => { const x = p.t * w; const y = RULER_HEIGHT + (1 - (p.v - track.min) / (track.max - track.min)) * (h - RULER_HEIGHT); ctx.fillStyle = track.color; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2); ctx.fill(); }); 
        }
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(playHeadPos * w, 0); ctx.lineTo(playHeadPos * w, h); ctx.stroke();
    }, [selectedTrackId, advTracks, playHeadPos, previewBuffer, getValueAtTime]);

    return (
        <div className="flex-1 flex flex-col p-6 gap-6 font-sans font-bold overflow-hidden" style={{ display: isActive ? 'flex' : 'none' }}>
            <div className="bg-white/60 rounded-3xl border border-slate-300 p-8 flex flex-col gap-6 shadow-sm h-full overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 shrink-0">
                    <div className="flex items-center gap-3"><div className="p-2 bg-rose-500 rounded-xl text-white shadow-lg"><Activity size={24}/></div><h2 className="text-xl text-slate-800 tracking-tight font-black">{t.app.tabs.sim}</h2></div>
                    <div className="flex items-center gap-3">
                         <button onClick={() => setShowAnalyzer(true)} className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-sm font-black flex items-center gap-2 border border-indigo-200 transition-all"><Wand2 size={16}/> AI 분석</button>
                         <button onClick={async () => { if(isAdvPlaying) { if(simPlaySourceRef.current) simPlaySourceRef.current.stop(); setIsAdvPlaying(false); } else { const b = await renderAdvancedAudio(); if(b) { const s = audioContext.createBufferSource(); s.buffer = b; s.loop = larynxParams.loopOn; s.connect(audioContext.destination); s.start(); simPlaySourceRef.current = s; setIsAdvPlaying(true); s.onended = () => setIsAdvPlaying(false); } } }} className="px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black flex items-center gap-2 shadow-lg transition-all active:scale-95 text-base">{isAdvPlaying ? <Pause size={20}/> : <Play size={20}/>}{isAdvPlaying ? t.common.stop : t.common.preview}</button>
                         <button onClick={async () => { const b = await renderAdvancedAudio(); if (b) onAddToRack(b, "Sim_Tract"); }} className="px-6 py-3 bg-white border border-slate-300 text-slate-900 hover:bg-slate-50 rounded-xl font-black flex items-center gap-2 transition-all"><Save size={20}/> {t.common.save}</button>
                    </div>
                </div>
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0 overflow-hidden">
                    <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                        <div className="flex bg-slate-100 p-1 rounded-xl gap-1 shrink-0">
                            <button onClick={() => setSidebarTab('larynx')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${sidebarTab==='larynx' ? 'bg-white shadow-sm' : 'text-slate-400'}`}>Larynx</button>
                            <button onClick={() => setSidebarTab('params')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${sidebarTab==='params' ? 'bg-white shadow-sm' : 'text-slate-400'}`}>Tracks</button>
                        </div>
                        {sidebarTab === 'larynx' ? (
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <h3 className="text-[11px] font-black text-slate-400 uppercase flex items-center gap-2"><Music size={14}/> Source</h3>
                                    <select value={tractSourceType} onChange={e=>setTractSourceType(e.target.value as any)} className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-black">{['synth', 'file'].map(v=><option key={v} value={v}>{v.toUpperCase()}</option>)}</select>
                                    {tractSourceType === 'file' ? (
                                        <select value={tractSourceFileId} onChange={e=>setTractSourceFileId(e.target.value)} className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-black">{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">{['sawtooth', 'square', 'noise'].map(w=><button key={w} onClick={()=>setSynthWaveform(w)} className={`p-2 rounded-lg border text-[10px] font-black transition-all ${synthWaveform===w?'bg-slate-900 text-white border-slate-900':'bg-slate-50'}`}>{w.toUpperCase()}</button>)}</div>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <h3 className="text-[11px] font-black text-slate-400 uppercase flex items-center gap-2"><Wind size={14}/> Larynx Params</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-black"><span>Jitter</span><span>{Math.round(larynxParams.jitterDepth * 100)}%</span></div>
                                        <input type="range" min="0" max="0.5" step="0.01" value={larynxParams.jitterDepth} onChange={e=>setLarynxParams({...larynxParams, jitterDepth: Number(e.target.value)})} className="w-full h-1 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-black"><span>Shimmer</span><span>{Math.round(shimmerAmount * 100)}%</span></div>
                                        <input type="range" min="0" max="0.3" step="0.01" value={shimmerAmount} onChange={e=>setShimmerAmount(Number(e.target.value))} className="w-full h-1 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-black"><span>Breath Mix</span><span>{Math.round(larynxParams.breathGain*100)}%</span></div>
                                        <input type="range" min="0" max="0.3" step="0.01" value={larynxParams.breathGain} onChange={e=>setLarynxParams({...larynxParams, breathGain: Number(e.target.value)})} className="w-full h-1 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                                    </div>
                                    <button onClick={()=>setLarynxParams({...larynxParams, loopOn: !larynxParams.loopOn})} className={`w-full p-2 rounded-lg border text-[10px] font-black flex items-center justify-center gap-2 transition-all ${larynxParams.loopOn?'bg-blue-600 text-white border-blue-600':'bg-slate-50'}`}><Repeat size={14}/> Loop Playback</button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {advTracks.map(track => (
                                    <button key={track.id} onClick={() => { setSelectedTrackId(track.id); setIsEditMode(true); }} className={`w-full p-3 rounded-xl border text-left transition-all ${selectedTrackId === track.id ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'}`}><div className="text-[9px] font-black uppercase opacity-60 mb-1">{track.name}</div><div className="text-sm font-black">{getValueAtTime(track.id, playHeadPos).toFixed(2)}</div></button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="lg:col-span-3 flex flex-col gap-6 overflow-hidden">
                        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 p-4 relative flex items-center justify-center overflow-hidden" onMouseMove={handleSimulationMouseMove} onMouseUp={handleSimulationMouseUp} onMouseLeave={handleSimulationMouseUp}>
                            <svg viewBox="0 0 400 300" className="w-full h-full max-w-md drop-shadow-2xl">
                                <rect x="50" y="50" width="300" height="200" fill="#1e293b" rx="20"/>
                                <circle cx={50 + liveTract.x * 300} cy={250 - liveTract.y * 200} r="15" fill="#f472b6" className="cursor-move" onMouseDown={(e) => handleSimulationMouseDown(e, 'tongue')}/>
                                <rect x="340" y={250 - liveTract.lips * 100} width="20" height={liveTract.lips * 100} fill="#ec4899" rx="5" className="cursor-move" onMouseDown={(e) => handleSimulationMouseDown(e, 'lips')}/>
                                <line x1="50" y1={250 - liveTract.nasal * 100} x2="350" y2={250 - liveTract.nasal * 100} stroke="#fbbf24" strokeWidth="4" className="cursor-move" onMouseDown={(e) => handleSimulationMouseDown(e, 'nasal')}/>
                            </svg>
                        </div>
                        <div className="h-48 shrink-0 bg-slate-900 border border-slate-700 rounded-2xl relative overflow-hidden group">
                            <canvas ref={canvasRef} width={1200} height={200} className="w-full h-full cursor-crosshair" onMouseDown={handleTimelineMouseDown} onMouseMove={handleTimelineMouseMove} onMouseUp={() => setDraggingKeyframe(null)}/>
                            <div className="absolute top-2 left-2 flex gap-1"><button onClick={() => setIsEditMode(!isEditMode)} className={`p-2 rounded-lg transition-all ${isEditMode ? 'bg-blue-600 text-white' : 'bg-black/50 text-white hover:bg-black/70'}`}><PencilLine size={16}/></button></div>
                        </div>
                    </div>
                </div>
            </div>
            {showAnalyzer && <FormantAnalyzer files={files} audioContext={audioContext} onClose={() => setShowAnalyzer(false)} onApply={(d)=>{ setAdvTracks(prev => prev.map(tr => (d as any)[tr.id] ? {...tr, points: (d as any)[tr.id]} : tr)); setShowAnalyzer(false); }} />}
        </div>
    );
};

export default AdvancedTractTab;