import React from 'react';

interface ParamInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  colorClass?: string;
}

const ParamInput: React.FC<ParamInputProps> = ({ label, value, min, max, step, onChange, colorClass }) => (
  <div className="space-y-1 font-sans font-bold">
    <div className={`flex justify-between font-bold items-center ${colorClass || 'text-slate-500'}`}>
      <span className="text-xs uppercase tracking-tighter">{label}</span>
      <input 
        type="number" 
        value={Number(value).toFixed(2)} 
        step={step} 
        onChange={e => onChange(Math.max(min, Math.min(max, parseFloat(e.target.value))))} 
        className="w-14 bg-white/60 border border-slate-200 rounded px-1 text-right text-xs outline-none py-0.5 font-bold" 
      />
    </div>
    <input 
      type="range" 
      min={min} 
      max={max} 
      step={step} 
      value={value} 
      onChange={e => onChange(parseFloat(e.target.value))} 
      className="w-full h-1 bg-slate-300 appearance-none rounded-full cursor-pointer dynamic-primary" 
    />
  </div>
);

export default ParamInput;