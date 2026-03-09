import React from 'react';
import { Activity, AudioLines, Combine, Download, Grid, Info, Layers, Mic2, MonitorCheck, MousePointer2, PencilLine, Play, Save, Sparkles, Spline, Undo2, Wand2, X, Zap } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface HelpModalProps {
  onClose: () => void;
}

const HELP_TEXT = {
  ko: {
    title: 'OTONASHI 사용 가이드',
    introNote: '이 앱의 소스코드는 AI 보조로 작성되었습니다.',
    introTitle: 'OTONASHI는 웹 기반 보컬 신디사이저이자 성도 시뮬레이터입니다.',
    introBody: '사람 목소리, 신디사이저, 노이즈 같은 다양한 소스에 발음과 공명을 부여해 새로운 음색을 만드는 도구입니다.',
    sections: {
      studio: {
        title: '스튜디오',
        items: [
          '파형 선택, 잘라내기, 페이드, 오토메이션, 파라메트릭 EQ를 한곳에서 처리합니다.',
          '복사한 오디오를 Mix 또는 Imprint로 현재 파일에 재적용할 수 있습니다.',
          'Formant 패드와 Singer’s Formant로 모음감과 발성 위치를 미세 조정합니다.',
        ],
      },
      generator: {
        title: '자음 생성기',
        items: [
          '노이즈, 필터, ADSR, 버스트 트랜지언트를 조합해 S, Sh, T, K, P 같은 자음을 합성합니다.',
          '파일 소스와 신디사이저 소스를 섞어 보다 복합적인 질감을 만들 수 있습니다.',
        ],
      },
      consonant: {
        title: 'C-V 믹서',
        items: [
          '자음 파일과 모음 파일을 오프셋, 스트레치, 볼륨 커브로 정밀하게 결합합니다.',
          '무성/유성 프리셋과 마스터 EQ로 결과 톤을 빠르게 정리할 수 있습니다.',
        ],
      },
      simulator: {
        title: '성도 시뮬레이터',
        items: [
          '성도 파라미터와 타임라인 키프레임으로 발음 모션을 직접 설계합니다.',
          'AI 발음 분석, 피치 추출, 스펙트로그램 표시, 스튜디오/보코더 전송을 지원합니다.',
          '노이즈 소스와 글로털 소스를 분리 제어해 호흡감과 공명 특성을 조정할 수 있습니다.',
        ],
      },
      vocoder: {
        title: '보코더',
        items: [
          '음성 모듈레이터와 신스 또는 파일 캐리어를 채널 보코더 방식으로 결합합니다.',
          '폼란트 시프트, 치찰음 패스스루, 스펙트럼 드로잉, 프리즈를 활용해 특수 음색을 만들 수 있습니다.',
        ],
      },
      icons: {
        title: '주요 아이콘',
        items: [
          '재생/정지: 현재 탭의 결과를 미리 듣습니다.',
          '보관함 저장: 렌더된 오디오를 파일 랙에 추가합니다.',
          '다운로드: 현재 결과를 WAV 파일로 저장합니다.',
          '실행 취소: 직전 편집 상태로 되돌립니다.',
          '편집 모드: 타임라인에서 포인트를 추가/이동합니다.',
          '보간 모드: 곡선/직선 보간을 전환합니다.',
        ],
      },
    },
    projectTitle: '프로젝트 관리',
    projectBody: '상단 헤더의 저장/열기 버튼으로 현재 작업 파일과 UI 상태를 JSON 프로젝트로 내보내거나 다시 불러올 수 있습니다.',
    systemTitle: '권장 환경',
    minimum: '최소: i3 / Ryzen 3 급 CPU, 4GB RAM',
    recommended: '권장: i5 / Ryzen 5 이상 CPU, 16GB RAM',
    systemNote: '보코더와 분석 기능은 CPU 사용량이 높습니다.',
    confirm: '확인',
  },
  en: {
    title: 'OTONASHI Guide',
    introNote: 'This app was built with AI assistance.',
    introTitle: 'OTONASHI is a web-based vocal synthesizer and tract simulator.',
    introBody: 'It lets you add articulation and resonance to voices, synths, and noise sources to build new timbres.',
    sections: {
      studio: {
        title: 'Studio',
        items: [
          'Edit waveform regions with trim, cut, fades, automation, and parametric EQ.',
          'Reuse copied audio with Mix or Imprint to layer texture onto the active file.',
          'Use the formant pad and Singer’s Formant controls for vowel color and placement.',
        ],
      },
      generator: {
        title: 'Consonant Generator',
        items: [
          'Combine noise, filters, ADSR, and burst transients to synthesize sounds like S, Sh, T, K, and P.',
          'Blend file-based and synth-based sources for more complex consonant textures.',
        ],
      },
      consonant: {
        title: 'C-V Mixer',
        items: [
          'Align consonant and vowel files with offsets, stretch, and volume curves.',
          'Use voiced/unvoiced presets and master EQ to shape the final result quickly.',
        ],
      },
      simulator: {
        title: 'Tract Simulator',
        items: [
          'Design articulation with tract parameters and timeline keyframes.',
          'Supports AI articulation analysis, pitch extraction, spectrogram display, and send-to-Studio/Vocoder.',
          'Control glottis and breath sources separately for resonance and airflow detail.',
        ],
      },
      vocoder: {
        title: 'Vocoder',
        items: [
          'Combine a voice modulator with a synth or file carrier using a channel vocoder.',
          'Formant shift, sibilance passthrough, spectrum drawing, and freeze help create special textures.',
        ],
      },
      icons: {
        title: 'Key Icons',
        items: [
          'Play/Stop: preview the current tab output.',
          'Save to Rack: add rendered audio to the file rack.',
          'Download: export the current result as WAV.',
          'Undo: revert the last edit.',
          'Edit Mode: add or move points on the timeline.',
          'Curve Mode: switch interpolation between straight and curved motion.',
        ],
      },
    },
    projectTitle: 'Project Management',
    projectBody: 'Use the save/open buttons in the header to export the current files and UI state as a JSON project and load it again later.',
    systemTitle: 'Recommended Environment',
    minimum: 'Minimum: i3 / Ryzen 3 class CPU, 4GB RAM',
    recommended: 'Recommended: i5 / Ryzen 5 or better CPU, 16GB RAM',
    systemNote: 'The vocoder and analysis tools are CPU intensive.',
    confirm: 'Close',
  },
  ja: {
    title: 'OTONASHI ガイド',
    introNote: 'このアプリは AI 補助で作成されています。',
    introTitle: 'OTONASHI は Web ベースのボーカルシンセサイザー兼声道シミュレーターです。',
    introBody: '声、シンセ、ノイズなどのソースに発音と共鳴を与えて新しい音色を作れます。',
    sections: {
      studio: {
        title: 'スタジオ',
        items: [
          '波形の範囲選択、カット、フェード、オートメーション、パラメトリック EQ をまとめて扱います。',
          'コピーした音声を Mix / Imprint で現在のファイルに再適用できます。',
          'フォルマントパッドと Singer’s Formant で母音感や発声位置を細かく調整できます。',
        ],
      },
      generator: {
        title: '子音生成',
        items: [
          'ノイズ、フィルター、ADSR、バーストトランジェントを組み合わせて S、Sh、T、K、P などを合成します。',
          'ファイルソースとシンセソースを混ぜて複雑な子音テクスチャを作れます。',
        ],
      },
      consonant: {
        title: 'C-V ミキサー',
        items: [
          '子音と母音のファイルをオフセット、ストレッチ、音量カーブで精密に合わせます。',
          '有声/無声プリセットとマスター EQ で最終トーンを素早く整えられます。',
        ],
      },
      simulator: {
        title: '声道シミュレーター',
        items: [
          '声道パラメータとタイムラインのキーフレームで発音モーションを設計します。',
          'AI 発音解析、ピッチ抽出、スペクトログラム表示、スタジオ/ボコーダー送信に対応します。',
          '声門ソースと息成分を分けて制御し、共鳴と空気感を細かく調整できます。',
        ],
      },
      vocoder: {
        title: 'ボコーダー',
        items: [
          '音声モジュレーターとシンセまたはファイルキャリアをチャンネルボコーダー方式で結合します。',
          'フォルマントシフト、歯擦音パススルー、スペクトラム描画、フリーズで特殊な音色を作れます。',
        ],
      },
      icons: {
        title: '主なアイコン',
        items: [
          '再生/停止: 現在のタブの結果を試聴します。',
          'ラック保存: レンダリングした音声をファイルラックに追加します。',
          'ダウンロード: 現在の結果を WAV として保存します。',
          '取り消し: 直前の編集を戻します。',
          '編集モード: タイムラインでポイントを追加または移動します。',
          'カーブモード: 直線補間と曲線補間を切り替えます。',
        ],
      },
    },
    projectTitle: 'プロジェクト管理',
    projectBody: 'ヘッダーの保存/読み込みボタンで現在のファイルと UI 状態を JSON プロジェクトとして書き出し、後で再読み込みできます。',
    systemTitle: '推奨環境',
    minimum: '最低: i3 / Ryzen 3 クラス CPU、4GB RAM',
    recommended: '推奨: i5 / Ryzen 5 以上の CPU、16GB RAM',
    systemNote: 'ボコーダーと解析機能は CPU 使用量が高めです。',
    confirm: '閉じる',
  },
} as const;

const SECTION_ICONS = {
  studio: Activity,
  generator: Wand2,
  consonant: Combine,
  simulator: Grid,
  vocoder: Sparkles,
  icons: MousePointer2,
} as const;

const ICON_GUIDE = [Play, Save, Download, Undo2, PencilLine, Spline];

const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  const { language } = useLanguage();
  const text = HELP_TEXT[language];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in font-sans" onClick={onClose}>
      <div className="bg-white w-[680px] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2 text-[#209ad6] font-black">
            <Info size={20} /> <span>{text.title}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar text-slate-600 text-sm space-y-8">
          <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
            <p className="text-[10px] text-slate-400 italic">{text.introNote}</p>
            <p className="text-xs text-slate-500 font-medium">{text.introTitle}</p>
            <p className="text-[11px] text-slate-400 mt-1">{text.introBody}</p>
          </div>

          {(['studio', 'generator', 'consonant', 'simulator', 'vocoder'] as const).map(sectionKey => {
            const section = text.sections[sectionKey];
            const Icon = SECTION_ICONS[sectionKey];
            return (
              <section key={sectionKey} className="space-y-3">
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-blue-400 pl-2">
                  <Icon size={18} className="text-blue-500" /> {section.title}
                </h3>
                <div className="grid grid-cols-1 gap-2 pl-3">
                  {section.items.map(item => (
                    <div key={item} className="flex gap-2 items-start">
                      <Zap size={14} className="mt-1 text-amber-500 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          <section className="space-y-3">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-slate-400 pl-2">
              <MousePointer2 size={18} className="text-slate-500" /> {text.sections.icons.title}
            </h3>
            <div className="grid grid-cols-2 gap-2 pl-3 text-xs text-slate-600 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
              {text.sections.icons.items.map((item, index) => {
                const Icon = ICON_GUIDE[index];
                return (
                  <div key={item} className="flex items-center gap-2">
                    <Icon size={14} className="text-slate-800" />
                    <span>{item}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2">
              <Download size={14} /> {text.projectTitle}
            </h4>
            <p className="text-[11px] text-slate-500">{text.projectBody}</p>
          </section>

          <section className="bg-slate-800 text-slate-300 p-4 rounded-xl space-y-2 border border-slate-700">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <MonitorCheck size={14} className="text-emerald-400" /> {text.systemTitle}
            </h4>
            <div className="grid grid-cols-1 gap-2 text-[11px]">
              <div className="flex items-center gap-2">
                <Mic2 size={12} className="text-slate-400" />
                <span>{text.minimum}</span>
              </div>
              <div className="flex items-center gap-2 text-white">
                <AudioLines size={12} className="text-emerald-400" />
                <span>{text.recommended}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-700 mt-2">{text.systemNote}</p>
          </section>
        </div>

        <div className="p-4 border-t bg-slate-50 text-center">
          <button onClick={onClose} className="px-10 py-2.5 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-xl font-bold transition-all shadow-md shadow-blue-100 active:scale-95">
            {text.confirm}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
