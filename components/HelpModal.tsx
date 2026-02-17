
import React from 'react';
import { Info, X, Activity, Combine, Grid, Wand2, MousePointer2, Zap, AudioLines, Download, Layers, Sparkles, Mic2, Play, Save, Undo2, PencilLine, Spline, ZapOff, ExternalLink, FileJson } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => (
  <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in font-sans" onClick={onClose}>
    <div className="bg-white w-[700px] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()}>
      <div className="p-4 border-b flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-2 text-[#209ad6] font-black">
          <Info size={20}/> <span>OTONASHI 전문 가이드</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
      </div>
      
      <div className="p-6 overflow-y-auto custom-scrollbar text-slate-600 text-sm space-y-8">
        <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
            <p className="text-[10px] text-slate-400 italic">※ OTONASHI는 물리 모델링과 신경망 질감 전이를 결합한 하이브리드 엔진입니다.</p>
        </div>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-indigo-600 pl-2">
            <Zap size={18} className="text-indigo-600"/> 신경망 보코더 & 외부 연동 (NEW)
          </h3>
          <div className="pl-3 space-y-3">
            <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                <p className="text-xs font-black text-indigo-700 mb-1">인위적인 소리에 생명력을 불어넣는 법:</p>
                <p className="text-xs text-indigo-600 leading-relaxed">
                    성도 시뮬레이터에서 나온 '정확하지만 기계적인 발음'을 <b>Carrier</b>로, 실제 사람의 목소리를 <b>Modulator</b>로 설정하세요. 
                    <b>Resynthesis Mode</b>는 인간 발음의 미세한 공기 흐름과 질감을 합성음에 입힙니다.
                </p>
            </div>
            <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1"><FileJson size={14}/> 외부 보코더 (PC-NSF-HiFiGAN 등) 사용:</p>
                <p className="text-[11px] text-slate-500">
                    전문적인 보컬 생성을 원하신다면 <b>Export Mel-Data</b> 버튼을 통해 추출된 데이터를 외부 신경망 보코더에 입력값으로 사용할 수 있습니다.
                </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-rose-400 pl-2">
            <Grid size={18} className="text-rose-500"/> 성도 시뮬레이터 (Simulator)
          </h3>
          <div className="pl-3 space-y-2">
            <p>혀와 입술의 기하학적 배치를 통해 소리를 만듭니다. <b>AI 분석</b> 버튼을 눌러 실제 오디오의 조음 모션을 역추적할 수 있습니다.</p>
            <div className="flex gap-2 items-center text-xs bg-slate-100 p-2 rounded-lg">
                <Sparkles size={12} className="text-purple-500"/><span><b>Tip:</b> 시뮬레이터 결과를 보코더의 Carrier로 보내면 가장 사실적인 결과가 나옵니다.</span>
            </div>
          </div>
        </section>

        <section className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2"><Download size={14}/> 프로젝트 내보내기</h4>
            <p className="text-[11px] text-slate-500">작업 중인 모든 오디오 데이터와 설정값은 하나의 .json 파일로 저장되어 나중에 다시 불러올 수 있습니다.</p>
        </section>
      </div>
      
      <div className="p-4 border-t bg-slate-50 text-center">
        <button onClick={onClose} className="px-10 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md active:scale-95">시작하기</button>
      </div>
    </div>
  </div>
);

export default HelpModal;
