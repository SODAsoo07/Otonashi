
import React from 'react';
import { Info, X, Activity, Combine, Grid, Wand2, MousePointer2, Zap, AudioLines, Download } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface HelpModalProps {
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in font-sans" onClick={onClose}>
      <div className="bg-white w-[650px] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2 text-[#209ad6] font-black">
            <Info size={20}/> <span>{t.help.title}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar text-slate-600 text-sm space-y-8">
          <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
              <p className="text-[10px] text-slate-400 italic">{t.help.source}</p>
              <p className="text-xs text-slate-500 font-medium">{t.help.intro}</p>
          </div>

          <section className="space-y-3">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-blue-400 pl-2">
              <Activity size={18} className="text-blue-500"/> {t.help.sectionStudio}
            </h3>
            <p className="pl-3 leading-relaxed">{t.help.descStudio}</p>
            <div className="grid grid-cols-1 gap-2 pl-3">
              <div className="flex gap-2 items-start"><Zap size={14} className="mt-1 text-amber-500 shrink-0"/><span><b>{t.studio.automation}:</b> {t.common.volume} {t.common.settings}</span></div>
              <div className="flex gap-2 items-start"><AudioLines size={14} className="mt-1 text-indigo-500 shrink-0"/><span><b>{t.common.eq}:</b> Parametric EQ</span></div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-cyan-400 pl-2">
              <Wand2 size={18} className="text-cyan-500"/> {t.help.sectionGen}
            </h3>
            <p className="pl-3 leading-relaxed">{t.help.descGen}</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-indigo-400 pl-2">
              <Combine size={18} className="text-indigo-500"/> {t.help.sectionMix}
            </h3>
            <p className="pl-3 leading-relaxed">{t.help.descMix}</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2 border-l-4 border-rose-400 pl-2">
              <Grid size={18} className="text-rose-500"/> {t.help.sectionSim}
            </h3>
            <div className="pl-3 space-y-2">
              <p>{t.help.descSim}</p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li><b>{t.simulator.tracks.tongueX}, {t.simulator.tracks.tongueY}</b></li>
                <li><b>{t.simulator.tracks.lips} / {t.simulator.tracks.lipLen}</b></li>
                <li><b>{t.simulator.tracks.nasal}</b></li>
              </ul>
            </div>
          </section>

          <section className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2"><Download size={14}/> {t.help.projManage}</h4>
              <p className="text-[11px] text-slate-500">{t.help.projDesc}</p>
          </section>
        </div>
        
        <div className="p-4 border-t bg-slate-50 text-center">
          <button onClick={onClose} className="px-10 py-2.5 bg-[#209ad6] hover:bg-[#1a85b9] text-white rounded-xl font-bold transition-all shadow-md shadow-blue-100 active:scale-95">{t.help.confirm}</button>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
