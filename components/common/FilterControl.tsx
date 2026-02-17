import React from 'react';
import { FilterState } from '../../types';

interface FilterControlProps {
    label: string;
    state: FilterState;
    onChange: (s: FilterState) => void;
    minFreq: number;
}

const FilterControl: React.FC<FilterControlProps> = ({ label, state, onChange, minFreq }) => (
    <div className={`space-y-2 p-3 rounded-lg border transition-all ${state.on ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
        <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-black cursor-pointer select-none">
                <input type="checkbox" checked={state.on} onChange={e => onChange({...state, on: e.target.checked})} className="rounded accent-indigo-500"/> 
                {label}
            </label>
            {state.on && (
                <input 
                    type="number" 
                    value={state.freq} 
                    onChange={e => onChange({...state, freq: Number(e.target.value)})} 
                    className="w-16 text-[10px] text-slate-900 font-mono font-black bg-white border border-slate-300 rounded px-1 text-right focus:outline-none focus:border-indigo-500"
                />
            )}
        </div>
        {state.on && (
            <div className="space-y-1">
                <input type="range" min={minFreq} max={20000} step="100" value={state.freq} onChange={e=>onChange({...state, freq: Number(e.target.value)})} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"/>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">Q</span>
                    <input type="range" min="0.1" max="20" step="0.1" value={state.q} onChange={e=>onChange({...state, q: Number(e.target.value)})} className="flex-1 h-1.5 bg-slate-200 rounded-full appearance-none accent-slate-400"/>
                    <input 
                        type="number" 
                        step="0.1"
                        value={state.q} 
                        onChange={e => onChange({...state, q: Number(e.target.value)})} 
                        className="w-10 text-[9px] text-slate-500 font-mono bg-transparent text-right outline-none"
                    />
                </div>
            </div>
        )}
    </div>
);

export default FilterControl;