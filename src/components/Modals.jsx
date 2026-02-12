import React, { useState } from 'react';
import { X, Activity, Music, Combine, Settings, History, Check, SignalLow, SignalHigh } from 'lucide-react';

export const HelpModal = ({ onClose }) => (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div className="bg-white w-[800px] max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden font-sans" onClick={e => e.stopPropagation()}>
         <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
           <div className="flex items-center gap-2 font-sans"><Activity className="text-[#209ad6] w-5 h-5"/><h2 className="text-lg font-black text-slate-800 tracking-tight font-sans">OTONASHI 가이드</h2></div>
           <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"><X size={20}/></button>
         </div>
         <div className="p-8 overflow-y-auto custom-scrollbar text-slate-600 text-sm space-y-8 font-sans font-bold">
            <section><h3 className="text-lg font-bold text-[#209ad6] mb-3 flex items-center gap-2 border-b pb-2"><Music size={20}/> 1. 스튜디오</h3><p>파일을 드래그하여 로드하고 상단 툴바로 편집하세요. 스페이스바로 재생/정지가 가능합니다.</p></section>
            <section><h3 className="text-lg font-bold text-[#209ad6] mb-3 flex items-center gap-2 border-b pb-2"><Combine size={20}/> 2. 자음 합성</h3><p>모음 위에 자음을 얹어 타이밍과 볼륨을 조절하세요. 볼륨 점은 우클릭으로 삭제합니다.</p></section>
            <section><h3 className="text-lg font-bold text-[#209ad6] mb-3 flex items-center gap-2 border-b pb-2"><Activity size={20}/> 3. 성도 시뮬레이터</h3><p>혀와 입술을 드래그하여 조음하고 키프레임을 등록하세요. 하단 배경에 실시간 파형이 표시됩니다.</p></section>
         </div>
      </div>
    </div>
);

export const HistoryModal = ({ history, currentIndex, onJump, onClose }) => (
    <div className="fixed inset-0 z-[120] flex items-center justify-end bg-black/20 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
        <div className="bg-white w-80 h-full shadow-2xl flex flex-col font-sans border-l border-slate-200" onClick={e=>e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="font-black text-slate-700 flex items-center gap-2 font-sans"><History size={18}/> 작업 내역</h3>
                <button onClick={onClose}><X size={18} className="text-slate-400 hover:text-slate-600"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {history.map((item, idx) => (
                    <div key={idx} onClick={() => onJump(idx)}
                         className={`p-3 rounded-lg cursor-pointer text-sm flex items-center justify-between group transition-all font-sans ${idx === currentIndex ? 'bg-[#209ad6] text-white shadow-md' : 'hover:bg-slate-100 text-slate-600'}`}>
                        <div className="flex flex-col">
                            <span className="font-bold">{item.label}</span>
                            <span className={`text-[10px] ${idx===currentIndex?'text-blue-100':'text-slate-400'}`}>{new Date(item.timestamp).toLocaleTimeString()}</span>
                        </div>
                        {idx === currentIndex && <Check size={16}/>}
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export const FadeModal = ({ type, onClose, onApply }) => {
    const [shape, setShape] = useState('linear');
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in zoom-in-95 font-sans" onClick={onClose}>
            <div className="bg-white p-6 rounded-xl shadow-2xl w-80 font-sans" onClick={e=>e.stopPropagation()}>
                <h3 className="text-lg font-black text-slate-700 mb-4 flex items-center gap-2 font-bold font-sans">{type === 'in' ? <SignalLow size={20}/> : <SignalHigh size={20}/>} Fade 설정</h3>
                <div className="flex gap-2 mb-6">
                    <button onClick={()=>setShape('linear')} className={`flex-1 py-3 rounded-lg border font-bold text-xs ${shape==='linear'?'bg-[#209ad6] text-white border-[#209ad6] font-sans':'bg-slate-50 text-slate-500 border-slate-200'}`}>직선</button>
                    <button onClick={()=>setShape('exponential')} className={`flex-1 py-3 rounded-lg border font-bold text-xs ${shape==='exponential'?'bg-[#209ad6] text-white border-[#209ad6] font-sans':'bg-slate-50 text-slate-500 border-slate-200'}`}>곡선</button>
                </div>
                <button onClick={()=>{ onApply(shape); onClose(); }} className="w-full py-3 bg-[#209ad6] text-white rounded-lg font-bold shadow-md hover:bg-[#1a85b9] transition-all font-sans">적용</button>
            </div>
        </div>
    );
};
