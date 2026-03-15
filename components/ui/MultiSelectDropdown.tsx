import React, { useEffect, useMemo, useRef, useState } from 'react';

interface MultiSelectOption {
    value: string;
    label: string;
}

interface MultiSelectDropdownProps {
    options: MultiSelectOption[];
    selectedValues: string[];
    onChange: (nextValues: string[]) => void;
    placeholder: string;
    summaryLabel?: (count: number) => string;
    emptyLabel?: string;
    selectAllLabel?: string;
    clearLabel?: string;
    menuMaxHeightPx?: number;
    className?: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
    options,
    selectedValues,
    onChange,
    placeholder,
    summaryLabel,
    emptyLabel = 'No options',
    selectAllLabel = 'Select all',
    clearLabel = 'Clear',
    menuMaxHeightPx = 220,
    className,
}) => {
    const [open, setOpen] = useState(false);
    const [openUpward, setOpenUpward] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

    useEffect(() => {
        if (!open) return;
        const onClickAway = (e: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        window.addEventListener('mousedown', onClickAway);
        return () => window.removeEventListener('mousedown', onClickAway);
    }, [open]);

    useEffect(() => {
        if (!open || !rootRef.current) return;
        const rect = rootRef.current.getBoundingClientRect();
        const bottomSpace = window.innerHeight - rect.bottom;
        const topSpace = rect.top;
        const estimatedMenu = Math.min(menuMaxHeightPx + 56, 320);
        setOpenUpward(bottomSpace < estimatedMenu && topSpace > bottomSpace);
    }, [open, menuMaxHeightPx]);

    const toggleValue = (value: string, checked: boolean) => {
        const next = new Set(selectedSet);
        if (checked) next.add(value);
        else next.delete(value);
        onChange(Array.from(next));
    };

    return (
        <div ref={rootRef} className={`relative ${className ?? ''}`}>
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 text-left hover:border-indigo-300 hover:bg-indigo-50/40 transition-all"
                type="button"
            >
                {selectedValues.length > 0
                    ? (summaryLabel ? summaryLabel(selectedValues.length) : `${selectedValues.length} selected`)
                    : placeholder}
            </button>
            {open && (
                <div className={`absolute z-30 w-full bg-white border border-slate-200 rounded-xl shadow-lg p-2 ${openUpward ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <button
                            type="button"
                            onClick={() => onChange(options.map(o => o.value))}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold whitespace-nowrap"
                        >
                            {selectAllLabel}
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange([])}
                            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-lg text-[11px] font-bold whitespace-nowrap"
                        >
                            {clearLabel}
                        </button>
                    </div>
                    <div className="overflow-y-auto custom-scrollbar py-2 space-y-1" style={{ maxHeight: `${menuMaxHeightPx}px` }}>
                        {options.map(option => (
                            <label
                                key={option.value}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-md border cursor-pointer transition-all ${selectedSet.has(option.value) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedSet.has(option.value)}
                                    onChange={e => toggleValue(option.value, e.target.checked)}
                                    className="accent-indigo-500"
                                />
                                <span className="text-xs font-bold truncate">{option.label}</span>
                            </label>
                        ))}
                        {options.length === 0 && <span className="block text-xs text-slate-400 py-2 text-center">{emptyLabel}</span>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MultiSelectDropdown;
