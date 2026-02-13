import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Undo2, Redo2, Scissors, Crop, Copy, Clipboard, Layers, FlipHorizontal, SignalLow, SignalHigh, MoveHorizontal, SkipBack, SkipForward, Upload, LogIn, Sliders, Activity, SlidersHorizontal, Square, Pause, Play, Save, FilePlus } from 'lucide-react';
import { AudioUtils } from '../utils/AudioUtils';
import { FadeModal } from './Modals';

export const StudioTab = ({ audioContext, activeFile, onAddToRack, setActiveFileId, onEdit, onUndo, onRedo }) => {
    const [editTrim, setEditTrim] = useState({ start: 0, end: 100 });
    const [isPlaying, setIsPlaying] = useState(false);
    const [playheadPos, setPlayheadPos] = useState(0); 
    const [dragTarget, setDragTarget] = useState(null);
    const [selectionAnchor, setSelectionAnchor] = useState(null); 
    const [clipboard, setClipboard] = useState(null);
    
    // --- 파라미터 상태 ---
    const [masterGain, setMasterGain] = useState(1.0);
    const [pitchCents, setPitchCents] = useState(0);
    const [genderShift, setGenderShift] = useState(1.0); // 젠더(포먼트 시프트)
    const [resQ, setResQ] = useState(4.0); // 공명 조절 (Q)
    const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 });
    const [formant, setFormant] = useState({ f1: 500, f2: 1500, f3: 2500 });

    const [showStretchModal, setShowStretchModal] = useState(false);
    const [stretchRatio, setStretchRatio] = useState(100);
    const [fadeModalType, setFadeModalType] = useState(null);

    const canvasRef = useRef(null);
    const sourceRef = useRef(null);
    const startTimeRef = useRef(0);
    const pauseOffsetRef = useRef(0);
    const animationRef = useRef(null);

    const studioBuffer = activeFile?.buffer || null;
    const historyIndex = activeFile?.historyIndex || 0;
    const history = activeFile?.history || [];

    const handleEditAction = useCallback((newBuffer, label) => { if(activeFile) onEdit(activeFile.id, newBuffer, label); }, [activeFile, onEdit]);
    
    // --- 오디오 렌더링 로직 (포먼트 젠더/공명 복구) ---
    const renderStudioAudio = async (buf) => {
        if(!buf || !audioContext) return null;
        const offline = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
        const finalOutput = offline.createGain(); finalOutput.gain.value = masterGain;

        const lowF = offline.createBiquadFilter(); lowF.type = 'lowshelf'; lowF.frequency.value = 320; lowF.gain.value = eq.low;
        const midF = offline.createBiquadFilter(); midF.type = 'peaking'; midF.frequency.value = 1000; midF.gain.value = eq.mid;
        const highF = offline.createBiquadFilter(); highF.type = 'highshelf'; highF.frequency.value = 3200; highF.gain.value = eq.high;

        // 포먼트 필터 (젠더 시프트 및 공명 적용)
        const f1Node = offline.createBiquadFilter(); f1Node.type = 'peaking'; f1Node.frequency.value = formant.f1 * genderShift; f1Node.Q.value = resQ; f1Node.gain.value = 12;
        const f2Node = offline.createBiquadFilter(); f2Node.type = 'peaking'; f2Node.frequency.value = formant.f2 * genderShift; f2Node.Q.value = resQ; f2Node.gain.value = 10;
        const f3Node = offline.createBiquadFilter(); f3Node.type = 'peaking'; f3Node.frequency.value = formant.f3 * genderShift; f3Node.Q.value = resQ; f3Node.gain.value = 8;

        lowF.connect(midF); midF.connect(highF); highF.connect(f1Node); f1Node.connect(f2Node); f2Node.connect(f3Node); f3Node.connect(finalOutput); finalOutput.connect(offline.destination);

        const s1 = offline.createBufferSource(); s1.buffer = buf; s1.detune.value = pitchCents;
        s1.connect(lowF); s1.start(0);
        return await offline.startRendering();
    };

    // --- 파형 드로잉 (70% 크기 축소 적용) ---
    useEffect(() => {
        if(!canvasRef.current || !studioBuffer) return;
        const ctx = canvasRef.current.getContext('2d'); const w = canvasRef.current.width, h = canvasRef.current.height;
        const data = studioBuffer.getChannelData(0); const step = Math.ceil(data.length/w);
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#f8f8f6'; ctx.fillRect(0,0,w,h);
        ctx.beginPath(); ctx.strokeStyle = '#3c78e8'; ctx.lineWidth = 1;
        
        for(let i=0;i<w;i++){ 
            let min=1,max=-1; 
            for(let j=0;j<step;j++){ const d=data[i*step+j]; if(d<min)min=d; if(d>max)max=d; } 
            // 0.7을 곱해 파형 높이를 70%로 제한
            ctx.moveTo(i, h/2 + (min * h/2 * 0.7)); 
            ctx.lineTo(i, h/2 + (max * h/2 * 0.7)); 
        } ctx.stroke();

        const sX = (editTrim.start/100)*w, eX = (editTrim.end/100)*w;
        ctx.fillStyle = 'rgba(60, 120, 232, 0.15)'; ctx.fillRect(sX, 0, eX-sX, h);
        ctx.strokeStyle = '#209ad6'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(sX,0); ctx.lineTo(sX,h); ctx.moveTo(eX,0); ctx.lineTo(eX,h); ctx.stroke();
        const phX = (playheadPos / 100) * w; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(phX, 0); ctx.lineTo(phX, h); ctx.stroke();
    }, [studioBuffer, editTrim, playheadPos]);

    const handlePlayPause = async () => {
        if(isPlaying) { if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} pauseOffsetRef.current = audioContext.currentTime - startTimeRef.current; setIsPlaying(false); } return; }
        if(!studioBuffer || !audioContext) return;
        const processedBuf = await renderStudioAudio(studioBuffer);
        const s = audioContext.createBufferSource(); s.buffer = processedBuf; s.connect(audioContext.destination);
        const startOffset = pauseOffsetRef.current || 0;
        s.start(0, startOffset % processedBuf.duration); startTimeRef.current = audioContext.currentTime - (startOffset % processedBuf.duration);
        sourceRef.current = s; setIsPlaying(true);
        s.onended = () => { if (Math.abs((audioContext.currentTime - startTimeRef.current) - processedBuf.duration) < 0.1) { setIsPlaying(false); setPlayheadPos(0); pauseOffsetRef.current = 0; } };
    };

    return (
        <div className="flex-1 flex flex-col gap-4 p-4 font-sans overflow-y-auto custom-scrollbar h-full bg-slate-50">
            {fadeModalType && <FadeModal type={fadeModalType} onClose={()=>setFadeModalType(null)} onApply={async (shape) => { if(!studioBuffer) return; handleEditAction(await AudioUtils.applyFade(audioContext, studioBuffer, fadeModalType, editTrim.start, editTrim.end, shape), `Fade ${fadeModalType}`); }} />}
            
            <div className="flex-shrink-0 flex flex-col gap-4">
                <div className="bg-white rounded-xl border border-slate-300 p-2 flex justify-between items-center shadow-sm">
                    <div className="flex gap-1 font-bold">
                        <button onClick={() => onUndo(activeFile.id)} disabled={historyIndex <= 0} className="p-2 hover:bg-slate-200 rounded text-slate-600 disabled:opacity-30"><Undo2 size={16}/></button>
                        <button onClick={() => onRedo(activeFile.id)} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-slate-200 rounded text-slate-600 disabled:opacity-30"><Redo2 size={16}/></button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={() => { if(!studioBuffer) return; setClipboard(AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end)); handleEditAction(AudioUtils.deleteRange(audioContext, studioBuffer, editTrim.start, editTrim.end), "잘라내기"); }} className="p-2 hover:bg-slate-200 rounded text-slate-600"><Scissors size={16}/></button>
                        <button onClick={() => { if(!studioBuffer) return; handleEditAction(AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end), "크롭"); }} className="p-2 hover:bg-slate-200 rounded text-slate-600"><Crop size={16}/></button>
                        <button onClick={() => { if(!studioBuffer) return; setClipboard(AudioUtils.createBufferFromSlice(audioContext, studioBuffer, editTrim.start, editTrim.end)); }} className="p-2 hover:bg-slate-200 rounded text-slate-600"><Copy size={16}/></button>
                        <div className="w-px h-6 bg-slate-300 mx-1"></div>
                        <button onClick={() => { if(!clipboard || !studioBuffer) return; handleEditAction(AudioUtils.insertBuffer(audioContext, studioBuffer, clipboard, editTrim.end), "붙여넣기"); }} className="p-2 hover:bg-slate-200 rounded text-slate-600"><Clipboard size={16}/></button>
                        <button onClick={() => { if(!clipboard || !studioBuffer) return; handleEditAction(AudioUtils.mixBuffers(audioContext, studioBuffer, clipboard, editTrim.start), "오버레이"); }} className="p-2 hover:bg-slate-200 rounded text-indigo-500"><Layers size={16}/></button>
                        <button onClick={() => { if(!studioBuffer) return; handleEditAction(AudioUtils.reverseBuffer(audioContext, studioBuffer), "반전"); }} className="p-2 hover:bg-slate-200 rounded text-purple-500"><FlipHorizontal size={16}/></button>
                        <button onClick={()=>setFadeModalType('in')} className="p-2 hover:bg-slate-200 rounded text-emerald-500"><SignalLow size={16}/></button>
                        <button onClick={()=>setFadeModalType('out')} className="p-2 hover:bg-slate-200 rounded text-rose-500"><SignalHigh size={16}/></button>
                        <button onClick={()=>setShowStretchModal(true)} className="p-2 hover:bg-slate-200 rounded text-[#209ad6]"><MoveHorizontal size={16}/></button>
                    </div>
                    
                    <div className="flex gap-2">
                        {/* 덮어쓰기 저장 */}
                        <button 
                            onClick={async () => { 
                                if(!studioBuffer) return; 
                                const res = await renderStudioAudio(studioBuffer); 
                                if(res) handleEditAction(res, "효과 적용(덮어쓰기)"); 
                            }} 
                            className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded text-sm font-bold flex items-center gap-1 hover:bg-slate-50 transition-all"
                        >
                            <Save size={16}/> 현재 파일에 적용
                        </button>
                        {/* 새 파일로 저장 */}
                        <button 
                            onClick={async () => { 
                                if(!studioBuffer) return; 
                                const res = await renderStudioAudio(studioBuffer); 
                                if(res) onAddToRack(res, activeFile.name + "_편집본"); 
                            }} 
                            className="bg-[#a3cef0] text-[#1f1e1d] px-3 py-1.5 rounded text-sm font-bold flex items-center gap-1 hover:bg-[#209ad6] hover:text-white shadow-sm transition-all"
                        >
                            <FilePlus size={16}/> 새 파일로 보관함 저장
                        </button>
                    </div>
                </div>
                <div className="h-[500px] bg-white rounded-xl border border-slate-300 relative overflow-hidden shadow-inner group flex-shrink-0">
                    {studioBuffer ? (
                        <>
                            <canvas ref={canvasRef} width={1000} height={500} className="w-full h-full object-fill cursor-crosshair" 
                                onMouseDown={(e)=> { const r = canvasRef.current.getBoundingClientRect(); const p = ((e.clientX-r.left)/r.width)*100; if(Math.abs(p-editTrim.start)<2) setDragTarget('start'); else if(Math.abs(p-editTrim.end)<2) setDragTarget('end'); else { setDragTarget('new'); setSelectionAnchor(p); setEditTrim({start:p, end:p}); } }}
                                onMouseMove={(e)=> { if(!dragTarget)return; const r = canvasRef.current.getBoundingClientRect(); const p = Math.max(0, Math.min(100, ((e.clientX-r.left)/r.width)*100)); if(dragTarget==='start') setEditTrim(v=>({...v, start:Math.min(p, v.end)})); else if(dragTarget==='end') setEditTrim(v=>({...v, end:Math.max(p, v.start)})); else setEditTrim({start:Math.min(selectionAnchor, p), end:Math.max(selectionAnchor, p)}); }}
                                onMouseUp={()=>setDragTarget(null)}
                            />
                        </>
                    ) : <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 font-black uppercase">파일 없음</div>}
                </div>
            </div>

            {/* --- 조절 패널 (수치 입력창 추가됨) --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 min-h-min pb-10 font-bold">
                {/* 믹서 & 젠더 */}
                <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3 font-bold">
                    <h4 className="text-sm font-black text-[#209ad6] uppercase tracking-widest flex items-center gap-2"><Sliders size={18}/> 믹서 / 젠더</h4>
                    <div className="space-y-3">
                        <div>
                            <div className="flex justify-between text-[10px] font-black text-slate-500 mb-1"><span>마스터 볼륨</span><input type="number" step="0.1" value={masterGain} onChange={e=>setMasterGain(Number(e.target.value))} className="w-12 border rounded text-center"/></div>
                            <input type="range" min="0" max="2" step="0.1" value={masterGain} onChange={e=>setMasterGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-300 rounded appearance-none accent-emerald-500"/>
                        </div>
                        <div>
                            <div className="flex justify-between text-[10px] font-black text-slate-500 mb-1"><span>피치 (Cents)</span><input type="number" step="10" value={pitchCents} onChange={e=>setPitchCents(Number(e.target.value))} className="w-14 border rounded text-center"/></div>
                            <input type="range" min="-1200" max="1200" step="10" value={pitchCents} onChange={e=>setPitchCents(Number(e.target.value))} className="w-full h-1.5 bg-slate-300 appearance-none accent-[#209ad6]"/>
                        </div>
                        <div>
                            <div className="flex justify-between text-[10px] font-black text-slate-500 mb-1"><span>젠더 (Shift)</span><input type="number" step="0.05" value={genderShift} onChange={e=>setGenderShift(Number(e.target.value))} className="w-12 border rounded text-center"/></div>
                            <input type="range" min="0.5" max="2.0" step="0.05" value={genderShift} onChange={e=>setGenderShift(Number(e.target.value))} className="w-full h-1.5 bg-slate-300 appearance-none accent-pink-500"/>
                        </div>
                    </div>
                </div>

                {/* 포먼트 & 공명 */}
                <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3">
                    <h4 className="text-sm font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2"><Activity size={18}/> 포먼트 / 공명</h4>
                    <div className="space-y-2">
                        {['f1', 'f2', 'f3'].map(f => (
                            <div key={f}>
                                <div className="flex justify-between text-[10px] font-black text-slate-500 mb-1 uppercase"><span>{f}</span><input type="number" value={formant[f]} onChange={e=>setFormant({...formant, [f]: Number(e.target.value)})} className="w-14 border rounded text-center"/></div>
                                <input type="range" min="200" max="5000" value={formant[f]} onChange={e=>setFormant({...formant, [f]: Number(e.target.value)})} className="w-full h-1 bg-slate-300 appearance-none accent-emerald-500"/>
                            </div>
                        ))}
                        <div className="pt-1">
                            <div className="flex justify-between text-[10px] font-black text-slate-500 mb-1 uppercase"><span>공명 (Q)</span><input type="number" step="0.1" value={resQ} onChange={e=>setResQ(Number(e.target.value))} className="w-12 border rounded text-center"/></div>
                            <input type="range" min="1" max="20" step="0.1" value={resQ} onChange={e=>setResQ(Number(e.target.value))} className="w-full h-1 bg-slate-300 appearance-none accent-orange-500"/>
                        </div>
                    </div>
                </div>

                {/* 밴드 EQ */}
                <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3 font-bold">
                    <h4 className="text-sm font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2 font-bold"><SlidersHorizontal size={18}/> 밴드 EQ</h4>
                    {['low', 'mid', 'high'].map(band => (
                        <div key={band}>
                            <div className="flex justify-between text-[10px] font-black text-slate-500 mb-1 uppercase"><span>{band}</span><input type="number" value={eq[band]} onChange={e=>setEq({...eq, [band]: Number(e.target.value)})} className="w-12 border rounded text-center"/></div>
                            <input type="range" min="-24" max="24" value={eq[band]} onChange={e=>setEq({...eq, [band]: Number(e.target.value)})} className="w-full h-1.5 bg-slate-300 appearance-none accent-indigo-500"/>
                        </div>
                    ))}
                </div>

                {/* 재생 컨트롤 */}
                <div className="bg-white/40 rounded-xl border border-slate-300 p-4 flex flex-col gap-3 justify-end font-bold">
                    <div className="flex gap-2">
                        <button onClick={() => { if(sourceRef.current) sourceRef.current.stop(); setIsPlaying(false); setPlayheadPos(0); pauseOffsetRef.current = 0; }} className="p-3 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-600 transition-all"><Square size={20} fill="currentColor"/></button>
                        <button onClick={handlePlayPause} className="flex-1 py-3 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-lg font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all">{isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>} {isPlaying ? '중지' : '미리보기'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
