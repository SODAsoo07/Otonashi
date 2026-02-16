
import React from 'react';
import { CircleDot, Pause, Play, Download, Save, Undo2, Redo2 } from 'lucide-react';
import { LiveTractState } from '../types';

interface TractVisualizerProps {
    liveTract: LiveTractState;
    manualPitch: number;
    manualGender: number;
    isAdvPlaying: boolean;
    undoStackLength: number;
    redoStackLength: number;
    onUndo: () => void;
    onRedo: () => void;
    onRecordSnapshot: () => void;
    onPlayToggle: () => void;
    onDownload: () => void;
    onSaveToRack: () => void;
    onMouseDown: (e: React.MouseEvent, mode: 'tongue' | 'lips' | 'nasal') => void;
}

const TractVisualizer: React.FC<TractVisualizerProps> = ({
    liveTract,
    isAdvPlaying,
    undoStackLength,
    redoStackLength,
    onUndo,
    onRedo,
    onRecordSnapshot,
    onPlayToggle,
    onDownload,
    onSaveToRack,
    onMouseDown
}) => {
    const lipOpening = liveTract.lips * 20;
    const lipProtrusion = liveTract.lipLen * 15;
    const nasalVelumAngle = liveTract.nasal * 40;

    return (
        <div className="flex-1 bg-white/60 dynamic-radius border border-slate-300 flex flex-col relative overflow-hidden shadow-sm min-h-[200px]">
            {/* Visualization Area */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden py-[3px]">
                <svg viewBox="100 50 280 340" className="w-full h-full max-h-full drop-shadow-lg select-none transition-all duration-300 p-0" preserveAspectRatio="xMidYMid meet">
                    <path d="M 120 380 L 120 280 Q 120 180 160 120 Q 200 60 280 60 Q 340 60 360 100 L 360 140 Q 360 150 350 150" fill="none" stroke="#cbd5e1" strokeWidth="3" />
                    <path d="M 350 190 Q 360 190 360 200 L 360 230 Q 340 230 340 250 Q 340 280 310 310 L 250 330 L 120 380" fill="none" stroke="#cbd5e1" strokeWidth="3" />
                    <path d={`M 220 380 L 220 250`} stroke="#e2e8f0" strokeWidth={30 + (1 - liveTract.throat) * 40} strokeLinecap="round" opacity="0.6" />
                    <path d={`M 260 140 Q 290 ${140 + nasalVelumAngle} 310 ${140 + nasalVelumAngle}`} stroke="#fbbf24" strokeWidth="6" fill="none" strokeLinecap="round" className="cursor-ns-resize" onMouseDown={(e) => onMouseDown(e, 'nasal')} />
                    <path d={`M 220 350 Q ${220 + liveTract.x * 120} ${330 - liveTract.y * 140} ${250 + liveTract.x * 90} ${230 + liveTract.y * 60}`} stroke="#f43f5e" strokeWidth={25 + liveTract.throat * 8} fill="none" strokeLinecap="round" opacity="0.9" className="cursor-crosshair" onMouseDown={(e) => onMouseDown(e, 'tongue')} />
                    <g transform={`translate(${lipProtrusion}, 0)`} className="cursor-move" onMouseDown={(e) => onMouseDown(e, 'lips')}>
                        <path d={`M 350 ${150 - lipOpening / 2} L 370 ${150 - lipOpening / 2}`} stroke="#ec4899" strokeWidth="10" strokeLinecap="round" />
                        <path d={`M 350 ${190 + lipOpening / 2} L 370 ${190 + lipOpening / 2}`} stroke="#ec4899" strokeWidth="10" strokeLinecap="round" />
                        <rect x="340" y="140" width="40" height="60" fill="transparent" />
                    </g>
                </svg>
            </div>

            {/* Control Bar */}
            <div className="p-2 px-4 bg-white/80 border-t flex justify-between items-center shrink-0 shadow-inner">
                <div className="flex gap-2">
                    <button onClick={onUndo} disabled={undoStackLength === 0} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 disabled:opacity-20 transition-all shadow-sm"><Undo2 size={16} /></button>
                    <button onClick={onRedo} disabled={redoStackLength === 0} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 disabled:opacity-20 transition-all shadow-sm"><Redo2 size={16} /></button>
                </div>
                <div className="flex gap-1.5 font-bold text-xs items-center">
                    <button onClick={onRecordSnapshot} className="dynamic-primary text-slate-900 px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95 transition-all"><CircleDot size={14} /> 기록</button>
                    <div className="w-px h-4 bg-slate-200 mx-1"></div>
                    <button onClick={onPlayToggle} className="bg-slate-800 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md active:scale-95 transition-all font-black">{isAdvPlaying ? <Pause size={14} /> : <Play size={14} />} {isAdvPlaying ? '중지' : '재생'}</button>
                    <button onClick={onDownload} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 shadow-sm transition-all flex items-center gap-1.5 font-black"><Download size={14} /> WAV</button>
                    <button onClick={onSaveToRack} className="bg-white border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 shadow-sm active:scale-95 transition-all font-black flex items-center gap-1.5"><Save size={14} /> 보관함</button>
                </div>
            </div>
        </div>
    );
};

export default TractVisualizer;
