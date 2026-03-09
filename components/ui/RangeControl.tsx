import React from 'react';

interface RangeControlProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    unit?: string;
}

const getPrecision = (step: number) => {
    if (!Number.isFinite(step) || step <= 0) {
        return 1;
    }

    const stepText = String(step);
    if (stepText.includes('e-')) {
        return Number(stepText.split('e-')[1]);
    }

    return stepText.includes('.') ? stepText.split('.')[1].length : 0;
};

const RangeControl: React.FC<RangeControlProps> = ({ label, value, min, max, step, onChange, unit }) => {
    const precision = getPrecision(step);
    const displayValue = typeof value === 'number' ? value.toFixed(precision) : value;

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-500">
                <span>{label}</span>
                <span className="text-indigo-600">{displayValue}{unit}</span>
            </div>
            <input 
                type="range" 
                min={min} 
                max={max} 
                step={step} 
                value={value} 
                onChange={e => onChange(Number(e.target.value))} 
                className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500"
            />
        </div>
    );
};

export default RangeControl;
