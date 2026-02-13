import React from 'react';
import { Info, X, Activity, Combine, Grid, Wand2 } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => (
  <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in font-sans" onClick={onClose}>
    <div className="bg-white w-[600px] max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()}>
      <div className="p-4 border-b flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-2 text-indigo-600 font-black">
          <Info size={20}/> <span>OTONASHI 가이드</span>
        </div>
        <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
      </div>
      <div className="p-6 overflow-y-auto custom-scrollbar text-slate-600 text-sm space-y-6">
        <section>
          <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Activity size={16}/> 스튜디오
          </h3>
          <p>파형 편집, 이펙트 적용, 트랙 합성을 수행합니다. 파형을 드래그하여 파일을 열 수 있습니다.</p>
        </section>
        <section>
          <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Wand2 size={16}/> 자음 생성기
          </h3>
          <p>노이즈와 필터를 사용하여 파열음(T, K)이나 마찰음(S, SH) 등의 인공적인 자음 소리를 생성합니다. 프리셋을 선택하거나 필터와 엔벨로프(ADSR)를 직접 조작하여 원하는 소리를 만들고 보관함에 저장할 수 있습니다.</p>
        </section>
        <section>
          <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Combine size={16}/> 자음-모음 합성기
          </h3>
          <p>자음과 모음 트랙을 정밀하게 결합합니다. [이동 모드]에서 드래그하여 타이밍을, [볼륨 모드]에서 키프레임을 조절하세요.</p>
        </section>
        <section>
          <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Grid size={16}/> 성도 시뮬레이터
          </h3>
          <p>발성 기관 모델을 조작하여 소리를 생성합니다. 외부 노이즈 파일을 불러와 숨소리나 마찰음을 구현할 수 있습니다.</p>
        </section>
      </div>
      <div className="p-4 border-t bg-slate-50 text-center">
        <button onClick={onClose} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold">닫기</button>
      </div>
    </div>
  </div>
);

export default HelpModal;