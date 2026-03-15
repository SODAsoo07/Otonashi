import React from 'react';

type Tone = 'neutral' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky';

interface EditorModeItem {
    label: string;
    value: string;
    tone?: Tone;
}

interface EditorModeBarProps {
    title?: string;
    items: EditorModeItem[];
    hint?: string;
    className?: string;
}

const toneClassMap: Record<Tone, string> = {
    neutral: 'bg-slate-50 text-slate-700 border-slate-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
};

const EditorModeBar: React.FC<EditorModeBarProps> = ({ title, items, hint, className }) => {
    return (
        <div className={`sticky top-0 z-30 bg-white/90 backdrop-blur border border-slate-200 rounded-xl px-3 py-2 shadow-sm ${className ?? ''}`}>
            <div className="flex flex-wrap items-center gap-2">
                {title && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">{title}</span>
                )}
                {items.map((item, idx) => (
                    <div
                        key={`${item.label}-${idx}`}
                        className={`inline-flex items-center gap-1.5 text-[11px] font-black border rounded-md px-2 py-1 ${toneClassMap[item.tone ?? 'neutral']}`}
                    >
                        <span className="opacity-70">{item.label}</span>
                        <span>{item.value}</span>
                    </div>
                ))}
                {hint && (
                    <span className="text-[10px] font-bold text-slate-400 ml-auto">{hint}</span>
                )}
            </div>
        </div>
    );
};

export default EditorModeBar;
