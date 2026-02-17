
import React from 'react';
import { Info, X, Activity, Combine, Grid, Wand2, MousePointer2, Zap, AudioLines, Download, Layers, Sparkles, Mic2, Play, Save, Undo2, PencilLine, Spline } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => (
  <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in font-sans" onClick={onClose}>
    <div className="bg-white w-[650px] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()}>
      <div className="p-4 border-b flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-2 text-[#209ad6] font-black">
          <Info size={20}/> <span>OTONASHI 가이드</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
      </div>
      
      <div className="p-6 overflow-y-auto custom-scrollbar text-slate-600 text-sm space-y-8">
        <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
            <p className="text-[10px] text-slate-400 italic">※ 이 앱은 실험적인 오디오 합성 도구입니다.</p>
            <p className="text-xs text-slate-500 font-medium">OTONASHI는 소리에 성도(Vocal Tract)의 공명 특성을 부여하는 <b className="text-slate-700">보컬 신디사이저(Vocal Synthesizer)</b>입니다.</p>
            <p className="text-[11px] text-slate-600 mt-2 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                <b>"말하는 악기 만들기"</b><br/>
                인간의 목소리를 있는 그대로 모방하는 것에 그치지 않습니다.<br/> 
                신디사이저, 노이즈, 기계음 같은 <b>비인간적 소스(Non-human Source)</b>를 입력으로 사용하여, 
                마치 악기나 기계가 말을 하는 듯한 독특한 <b>보코더(Vocoder) 사운드</b>를 디자인해보세요.
            </p>
        </div>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-blue-400 pl-2">
            <Activity size={18} className="text-blue-500"/> 스튜디오 (Studio)
          </h3>
          <div className="grid grid-cols-1 gap-2 pl-3">
            <div className="flex gap-2 items-start"><Zap size={14} className="mt-1 text-amber-500 shrink-0"/><span><b>오토메이션 & EQ:</b> 파형 위에 직접 볼륨 변화를 그리고, EQ로 주파수 특성을 조각합니다.</span></div>
            <div className="flex gap-2 items-start"><AudioLines size={14} className="mt-1 text-indigo-500 shrink-0"/><span><b>Formant Filter:</b> Formant Pad를 이용해 소리의 '모음(Vowel)' 특성을 실시간으로 변조합니다.</span></div>
            <div className="flex gap-2 items-start"><Layers size={14} className="mt-1 text-slate-500 shrink-0"/><span><b>텍스처 입히기 (Imprint):</b> 클립보드에 복사된 소리의 질감(주파수 응답)을 현재 선택된 구간에 덮어씌웁니다 (Convolution).</span></div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-cyan-400 pl-2">
            <Wand2 size={18} className="text-cyan-500"/> 자음 생성기 (Transient Gen)
          </h3>
          <div className="pl-3 space-y-2">
            <p className="leading-relaxed">노이즈와 필터를 조합하여 'S', 'T', 'K' 같은 날카로운 기계적 마찰음/파열음을 합성합니다.</p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-500">
                <li><b>Transient (Burst):</b> 강한 어택감을 주는 짧은 파열음을 생성합니다.</li>
                <li><b>Multi-Filter:</b> 복잡한 필터 조합으로 금속성 소리나 바람 소리를 만듭니다.</li>
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-rose-400 pl-2">
            <Grid size={18} className="text-rose-500"/> 성도 시뮬레이터 (Tract Sim)
          </h3>
          <div className="pl-3 space-y-2">
            <p>물리적 성도 모델을 통해 소스가 입안에서 어떻게 울리는지 시뮬레이션합니다.</p>
            <div className="grid grid-cols-1 gap-1 text-xs bg-slate-100 p-2 rounded-lg">
                <div className="flex gap-2 items-center"><Mic2 size={12} className="text-slate-500"/><span><b>Excitation Source:</b> 성대를 대신할 소스(Sawtooth, Noise, 또는 외부 파일)를 선택합니다.</span></div>
                <div className="flex gap-2 items-center"><Sparkles size={12} className="text-purple-500"/><span><b>AI 모션 (Beta):</b> 실제 음성 파일에서 혀와 입술의 움직임을 추출하여, 선택한 소스에 적용합니다.</span></div>
            </div>
          </div>
        </section>

        <section className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2"><Download size={14}/> 데이터 관리</h4>
            <p className="text-[11px] text-slate-500">작업 중인 모든 오디오와 설정은 <b>.json 프로젝트 파일</b>로 내보내거나 불러올 수 있습니다.</p>
        </section>
      </div>
      
      <div className="p-4 border-t bg-slate-50 text-center">
        <button onClick={onClose} className="px-10 py-2.5 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-xl font-bold transition-all shadow-md shadow-blue-100 active:scale-95">확인했습니다</button>
      </div>
    </div>
  </div>
);

export default HelpModal;