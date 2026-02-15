
import React, { useRef, useState, useEffect } from 'react';
import { FormantParams } from '../types';

interface FormantPadProps {
    formant: FormantParams;
    onChange: (f: FormantParams) => void;
}

const FormantPad: React.FC<FormantPadProps> = ({ formant, onChange }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dragging, setDragging] = useState(false);

    // Vowel approximants (F2 on X, F1 on Y)
    // Using standard standard acoustic vowel chart orientation:
    // F2 decreases left-to-right (Front to Back)
    // F1 increases top-to-bottom (Close to Open)
    // However, usually XY pads maps Low->High, Left->Right / Bottom->Top.
    // Let's stick to simple Low->High mapping for controls:
    // X: F2 (500 -> 3000 Hz)
    // Y: F1 (200 -> 1200 Hz)
    
    // Vowel Approx Locations (F2, F1)
    const vowels = [
        { l: 'i', f2: 2300, f1: 280 },
        { l: 'e', f2: 1800, f1: 500 },
        { l: 'a', f2: 1300, f1: 800 },
        { l: 'o', f2: 900,  f1: 500 },
        { l: 'u', f2: 800,  f1: 300 },
    ];

    const minF1 = 200; const maxF1 = 1200;
    const minF2 = 500; const maxF2 = 3000;

    const draw = () => {
        const cvs = canvasRef.current;
        if(!cvs) return;
        const ctx = cvs.getContext('2d');
        if(!ctx) return;
        const w = cvs.width;
        const h = cvs.height;

        ctx.clearRect(0,0,w,h);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0,0,w,h);

        // Grid
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
        ctx.setLineDash([]);

        // Vowel Labels
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        vowels.forEach(v => {
            const x = ((v.f2 - minF2) / (maxF2 - minF2)) * w;
            const y = h - ((v.f1 - minF1) / (maxF1 - minF1)) * h;
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillText(v.l, x, y);
        });

        // Current Position
        const cx = ((formant.f2 - minF2) / (maxF2 - minF2)) * w;
        const cy = h - ((formant.f1 - minF1) / (maxF1 - minF1)) * h;

        // F3 Ring (Visualizing resonance)
        const rSize = (formant.resonance / 10) * 20;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.arc(cx, cy, 10 + rSize, 0, Math.PI*2);
        ctx.stroke();

        // Cursor
        ctx.beginPath();
        ctx.fillStyle = '#38bdf8';
        ctx.arc(cx, cy, 6, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowColor = '#0ea5e9';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
    };

    useEffect(() => {
        draw();
    }, [formant]);

    const handleInput = (e: React.MouseEvent) => {
        if(!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mx = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const my = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

        const newF2 = minF2 + (mx / rect.width) * (maxF2 - minF2);
        const newF1 = minF1 + ((rect.height - my) / rect.height) * (maxF1 - minF1);
        
        onChange({ ...formant, f1: newF1, f2: newF2 });
    };

    return (
        <div className="flex flex-col gap-4 bg-[#1e293b] p-4 rounded-lg border border-slate-600 shadow-inner">
             <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                <span>Formant Filter</span>
                <span className="text-cyan-400 font-mono">F1: {Math.round(formant.f1)} | F2: {Math.round(formant.f2)}</span>
             </div>
             <canvas 
                ref={canvasRef} 
                width={250} 
                height={200} 
                className="w-full h-[200px] cursor-crosshair rounded border border-slate-700 bg-slate-900"
                onMouseDown={(e) => { setDragging(true); handleInput(e); }}
                onMouseMove={(e) => { if(dragging) handleInput(e); }}
                onMouseUp={() => setDragging(false)}
                onMouseLeave={() => setDragging(false)}
             />
             <div className="flex gap-4 items-center">
                 <span className="text-xs font-bold text-slate-500 w-8">Res</span>
                 <input type="range" min="0.1" max="10" step="0.1" value={formant.resonance} onChange={e => onChange({...formant, resonance: Number(e.target.value)})} className="flex-1 h-1.5 bg-slate-700 rounded appearance-none accent-cyan-500"/>
             </div>
             <div className="flex gap-4 items-center">
                 <span className="text-xs font-bold text-slate-500 w-8">F3</span>
                 <input type="range" min="1500" max="5000" step="10" value={formant.f3} onChange={e => onChange({...formant, f3: Number(e.target.value)})} className="flex-1 h-1.5 bg-slate-700 rounded appearance-none accent-cyan-500"/>
             </div>
        </div>
    );
};

export default FormantPad;
