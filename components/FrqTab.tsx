import React, { useState, useRef, useEffect } from 'react';
import { Download, Activity, FileCheck2 } from 'lucide-react';
import { AudioFile } from '../types';
import { AudioUtils } from '../utils/audioUtils';

interface FrqTabProps {
    audioContext: AudioContext;
    files: AudioFile[];
    isActive: boolean;
}

const FrqTab: React.FC<FrqTabProps> = ({ files }) => {
    const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
    const [f0Curve, setF0Curve] = useState<{ t: number, f0: number, amp: number }[]>([]);
    const [detectedF0, setDetectedF0] = useState<number | null>(null);
    const [isInterpolate, setIsInterpolate] = useState(false);
    const [isForcePitchOn, setIsForcePitchOn] = useState(false);
    const [forcePitch, setForcePitch] = useState<number>(261.6);
    const [isDraggingPitch, setIsDraggingPitch] = useState(false);
    const dragStartY = useRef<number>(0);
    const dragStartPitch = useRef<number>(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const handlePitchDragStart = (e: React.MouseEvent<HTMLInputElement>) => {
        if (!isForcePitchOn) return;
        setIsDraggingPitch(true);
        dragStartY.current = e.clientY;
        dragStartPitch.current = forcePitch;
        e.preventDefault(); // Prevent text selection
    };

    useEffect(() => {
        const handlePitchDrag = (e: MouseEvent) => {
            if (!isDraggingPitch) return;
            const deltaY = dragStartY.current - e.clientY;
            // Adjust sensitivity (e.g., 1 pixel = 0.5 Hz)
            const newPitch = Math.max(50, Math.min(2000, dragStartPitch.current + deltaY * 0.5));
            setForcePitch(Number(newPitch.toFixed(1)));
        };

        const handlePitchDragEnd = () => {
            setIsDraggingPitch(false);
        };

        if (isDraggingPitch) {
            window.addEventListener('mousemove', handlePitchDrag);
            window.addEventListener('mouseup', handlePitchDragEnd);
        }

        return () => {
            window.removeEventListener('mousemove', handlePitchDrag);
            window.removeEventListener('mouseup', handlePitchDragEnd);
        };
    }, [isDraggingPitch]);

    const activeFile = files.find(f => f.id === selectedFileId) || null;

    useEffect(() => {
        if (!activeFile) {
            setF0Curve([]);
            setDetectedF0(null);
            return;
        }
        // Auto-analyze when file or interpolation option changes
        const pitch = AudioUtils.detectFundamentalPitch(activeFile.buffer);
        setDetectedF0(Math.round(pitch || 0));
        const curve = AudioUtils.detectPitchCurve(activeFile.buffer, 30, 256, isInterpolate, isForcePitchOn ? forcePitch : null);
        setF0Curve(curve);
    }, [activeFile, isInterpolate, isForcePitchOn, forcePitch]);

    useEffect(() => {
        if (!canvasRef.current || !activeFile) return;
        const ctx = canvasRef.current.getContext('2d', { alpha: false });
        if (!ctx) return;
        const { width: w, height: h } = canvasRef.current;

        ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, w, h);

        const data = activeFile.buffer.getChannelData(0);
        const step = Math.ceil(data.length / w);
        const amp = h / 2;

        ctx.beginPath(); ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1;
        for (let i = 0; i < w; i++) {
            let min = 1.0, max = -1.0;
            const start = i * step;
            const end = Math.min(start + step, data.length);
            for (let j = start; j < end; j++) {
                const datum = data[j]; if (datum < min) min = datum; if (datum > max) max = datum;
            }
            ctx.moveTo(i, amp + min * amp); ctx.lineTo(i, amp + max * amp);
        }
        ctx.stroke();

        if (f0Curve.length > 0) {
            ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
            f0Curve.forEach((pt, idx) => {
                const x = (pt.t / activeFile.buffer.duration) * w;
                const minF0 = 50, maxF0 = 1000;
                let y = h - ((pt.f0 - minF0) / (maxF0 - minF0)) * h;
                y = Math.max(0, Math.min(h, y));
                if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }
    }, [activeFile, f0Curve]);

    const handleDownloadFrq = () => {
        if (!activeFile || f0Curve.length === 0) return;
        const stepSamples = 256; // Standard UTAU frq hop size
        const frqBuffer = AudioUtils.generateFrqBuffer(f0Curve, stepSamples);

        const blob = new Blob([frqBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const baseName = activeFile.name.replace(/\.[^/.]+$/, "");
        a.download = `${baseName}_wav.frq`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex-1 flex flex-col p-6 gap-6 bg-slate-50 overflow-y-auto w-full">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        <Activity size={24} className="text-pink-500" /> FRQ 주파수 맵 추출기
                    </h2>
                    <p className="text-xs font-bold text-slate-500 mt-1">UTAU 엔진과 완벽하게 호환되는 F0 및 진폭 바이너리 데이터를 생성하고 다운로드합니다.</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col gap-6">

                {/* File Selection */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest">대상 오디오 선택</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                        {files.map(f => (
                            <button
                                key={f.id}
                                onClick={() => setSelectedFileId(f.id)}
                                className={`px-4 py-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${selectedFileId === f.id ? 'border-pink-500 bg-pink-50 text-pink-700 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600'}`}
                            >
                                <FileCheck2 size={16} className={selectedFileId === f.id ? 'text-pink-500 shrink-0' : 'text-slate-400 shrink-0'} />
                                <span className="text-sm font-bold truncate">{f.name}</span>
                            </button>
                        ))}
                        {files.length === 0 && (
                            <div className="col-span-full py-8 text-center text-slate-400 text-sm font-bold bg-slate-100 rounded-xl border border-dashed border-slate-300">
                                보관함에 오디오 파일이 없습니다.
                            </div>
                        )}
                    </div>
                </div>

                {/* Analysis Result */}
                {activeFile && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center gap-4">
                            <div className="bg-slate-800 text-white px-4 py-2 rounded-xl text-lg font-black min-w-[140px] text-center border border-slate-700 shadow-inner flex flex-col">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">평균 기준 F0</span>
                                {detectedF0 ? `${detectedF0} Hz` : '분석 실패'}
                            </div>
                            <div className="flex flex-col gap-1 ml-4 justify-center">
                                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={isInterpolate}
                                        onChange={(e) => setIsInterpolate(e.target.checked)}
                                        disabled={isForcePitchOn}
                                        className="w-4 h-4 text-pink-500 rounded border-slate-300 focus:ring-pink-500 disabled:opacity-50"
                                    />
                                    <span className={isForcePitchOn ? 'opacity-50' : ''}>F0 끊김 보정 (Interpolation)</span>
                                </label>
                                <span className={`text-[10px] font-bold ${isForcePitchOn ? 'text-slate-300' : 'text-slate-400'}`}>무음/노이즈 구간의 유실된 피치를 잇습니다.</span>
                            </div>

                            <div className="flex flex-col gap-1 ml-4 justify-center border-l-2 border-slate-200 pl-4">
                                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={isForcePitchOn}
                                        onChange={(e) => setIsForcePitchOn(e.target.checked)}
                                        className="w-4 h-4 text-pink-500 rounded border-slate-300 focus:ring-pink-500"
                                    />
                                    타겟 피치 강제 덮어쓰기
                                </label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="number"
                                        value={forcePitch}
                                        onChange={(e) => setForcePitch(Number(e.target.value))}
                                        onMouseDown={handlePitchDragStart}
                                        disabled={!isForcePitchOn}
                                        className={`w-20 px-2 py-0.5 text-sm border border-slate-300 rounded focus:border-pink-500 focus:ring-pink-500 disabled:bg-slate-100 disabled:text-slate-400 font-bold text-slate-700 text-center ${isForcePitchOn ? 'cursor-ns-resize' : ''}`}
                                        step="0.1"
                                    />
                                    <span className="text-xs font-bold text-slate-400">Hz</span>
                                </div>
                            </div>

                            <button
                                onClick={handleDownloadFrq}
                                disabled={f0Curve.length === 0}
                                className="px-6 py-3 bg-pink-500 hover:bg-pink-600 disabled:bg-slate-300 text-white rounded-xl font-black flex items-center gap-2 active:scale-95 transition-all shadow-md ml-auto"
                            >
                                <Download size={18} /> UTAU용 .frq 파일 다운로드
                            </button>
                        </div>

                        {/* Visualizer */}
                        <div className="bg-slate-900 h-64 rounded-2xl border border-slate-700 shadow-inner relative overflow-hidden">
                            <canvas ref={canvasRef} width={1200} height={256} className="w-full h-full object-cover" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FrqTab;

