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
          <Info size={20}/> <span>OTONASHI 사용 가이드</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
      </div>
      
      <div className="p-6 overflow-y-auto custom-scrollbar text-slate-600 text-sm space-y-8">
        <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
            <p className="text-[10px] text-slate-400 italic">※ 이 앱의 소스코드는 AI를 통해 작성되었습니다.</p>
            <p className="text-xs text-slate-500 font-medium">OTONASHI는 웹 기반의 **보컬 신디사이저(Vocal Synthesizer)**이자 성도 시뮬레이터입니다.</p>
            <p className="text-[11px] text-slate-400 mt-1">인간의 목소리뿐만 아니라 신디사이저, 노이즈 등 다양한 소스(Source)에 **발음(Articulation)을 부여**하여 독창적인 사운드를 합성할 수 있는 도구입니다.</p>
        </div>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-blue-400 pl-2">
            <Activity size={18} className="text-blue-500"/> 스튜디오 (Studio)
          </h3>
          <div className="grid grid-cols-1 gap-2 pl-3">
            <div className="flex gap-2 items-start"><Zap size={14} className="mt-1 text-amber-500 shrink-0"/><span><b>오토메이션 & EQ:</b> 파형 위에 직접 볼륨 변화를 그리고, 파라메트릭 EQ로 주파수를 정밀하게 제어합니다.</span></div>
            <div className="flex gap-2 items-start"><AudioLines size={14} className="mt-1 text-indigo-500 shrink-0"/><span><b>Formant Filter:</b> Formant Pad를 사용하여 모음의 특성(F1, F2)을 시각적으로 변경하거나 성별(Gender)을 변조할 수 있습니다.</span></div>
            <div className="flex gap-2 items-start"><Layers size={14} className="mt-1 text-slate-500 shrink-0"/><span><b>클립보드 고급 기능:</b> 복사한 오디오를 <b>Mix(겹쳐넣기)</b>하거나, <b>Imprint(텍스처 입히기)</b>를 통해 소리의 질감만 현재 선택 영역에 입힐 수 있습니다.</span></div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-cyan-400 pl-2">
            <Wand2 size={18} className="text-cyan-500"/> 자음 생성기 (Consonant Gen)
          </h3>
          <div className="pl-3 space-y-2">
            <p className="leading-relaxed">노이즈와 필터를 조합하여 'S', 'T', 'K' 같은 기계적인 자음 소리를 합성합니다.</p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-500">
                <li><b>Transient (Burst):</b> 파열음(P, T, K)의 날카로운 시작음을 생성합니다.</li>
                <li><b>Multi-Filter:</b> High/Low/Bandpass 필터를 조합하여 복잡한 공명을 만듭니다.</li>
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-indigo-400 pl-2">
            <Combine size={18} className="text-indigo-500"/> 자음-모음 합성기 (C-V Mixer)
          </h3>
          <p className="pl-3 leading-relaxed">두 개의 오디오 파일(자음/모음)을 정밀하게 결합합니다. <b>Offset</b>으로 타이밍을 맞추고, <b>Stretch</b>로 길이를 조절한 뒤 <b>Master EQ</b>로 최종 톤을 정리하세요.</p>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-rose-400 pl-2">
            <Grid size={18} className="text-rose-500"/> 성도 시뮬레이터 (Simulator)
          </h3>
          <div className="pl-3 space-y-2">
            <p>인간의 발성 기관을 물리적으로 모델링하여 소리에 발음을 입힙니다. 파일이나 신디사이저를 소스(Glottis)로 사용할 수 있습니다.</p>
            <div className="grid grid-cols-1 gap-1 text-xs bg-slate-100 p-2 rounded-lg">
                <div className="flex gap-2 items-center"><Sparkles size={12} className="text-purple-500"/><span><b>AI 분석 (Beta):</b> 기존 음성 파일의 발음을 분석하여 혀와 입술의 움직임을 추출하고, 이를 다른 소스에 적용합니다.</span></div>
                <div className="flex gap-2 items-center"><Mic2 size={12} className="text-red-500"/><span><b>Pitch 추출:</b> 원본 음성의 피치 곡선을 추출하여 시뮬레이터 소스에 적용합니다.</span></div>
                <div className="flex gap-2 items-center"><AudioLines size={12} className="text-blue-500"/><span><b>Spectrogram:</b> 배경에 스펙트로그램을 띄워 주파수 변화를 눈으로 보며 작업할 수 있습니다.</span></div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-slate-400 pl-2">
            <MousePointer2 size={18} className="text-slate-500"/> 주요 아이콘 가이드
          </h3>
          <div className="grid grid-cols-2 gap-2 pl-3 text-xs text-slate-600 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
            <div className="flex items-center gap-2"><Play size={14} className="text-slate-800"/> <span><b>재생/정지:</b> 오디오 미리듣기</span></div>
            <div className="flex items-center gap-2"><Save size={14} className="text-slate-800"/> <span><b>보관함 저장:</b> 결과물을 목록에 추가</span></div>
            <div className="flex items-center gap-2"><Download size={14} className="text-green-600"/> <span><b>다운로드:</b> .wav 파일로 내보내기</span></div>
            <div className="flex items-center gap-2"><Undo2 size={14} className="text-slate-500"/> <span><b>실행 취소:</b> 이전 상태로 되돌리기</span></div>
            <div className="flex items-center gap-2"><PencilLine size={14} className="text-amber-500"/> <span><b>편집 모드:</b> 그래프에 점 추가/이동</span></div>
            <div className="flex items-center gap-2"><Spline size={14} className="text-indigo-500"/> <span><b>보간 모드:</b> 곡선/직선 연결 변경</span></div>
          </div>
        </section>

        <section className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2"><Download size={14}/> 프로젝트 관리</h4>
            <p className="text-[11px] text-slate-500">상단 헤더의 <b>저장(Download)</b> 버튼을 누르면 작업 중인 모든 파일이 포함된 .json 프로젝트 파일을 내보냅니다. 나중에 <b>열기(Upload)</b> 버튼으로 다시 불러올 수 있습니다.</p>
        </section>
      </div>
      
      <div className="p-4 border-t bg-slate-50 text-center">
        <button onClick={onClose} className="px-10 py-2.5 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-xl font-bold transition-all shadow-md shadow-blue-100 active:scale-95">확인했습니다</button>
      </div>
    </div>
  </div>
);

export default HelpModal;