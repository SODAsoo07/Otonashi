import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Undo2, Redo2, Scissors, Crop, Copy, Clipboard, Layers, 
  FlipHorizontal, SignalLow, SignalHigh, MoveHorizontal, 
  Play, Square, Save, Download, Sparkles
} from 'lucide-react';
import * as AudioUtils from '../utils/AudioUtils'; // 수정된 임포트 방식
import { FadeModal } from './Modals';

export default function StudioTab({ activeFile, onFileEdit, onAddToRack }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  
  // 이펙터 상태
  const [reverbWet, setReverbWet] = useState(0.3);
  const [delayTime, setDelayTime] = useState(0.3);
  const [isProcessing, setIsProcessing] = useState(false);

  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);

  // 파형 시각화 (진한 파란색 계열)
  useEffect(() => {
    if (!activeFile || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const buffer = activeFile.buffer;
    const data = buffer.getChannelData(0);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6'; // Blue-500
    ctx.lineWidth = 1;

    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;

    for (let i = 0; i < canvas.width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.lineTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();
  }, [activeFile]);

  // 이펙트 적용 핸들러 (성능 최적화 적용)
  const applyEffect = async (type) => {
    if (!activeFile || isProcessing) return;
    setIsProcessing(true);
    
    let newBuffer;
    try {
      if (type === 'reverb') {
        newBuffer = await AudioUtils.applyReverb(activeFile.buffer, reverbWet);
      } else if (type === 'delay') {
        newBuffer = await AudioUtils.applyDelay(activeFile.buffer, delayTime, 0.4);
      } else if (type === 'reverse') {
        newBuffer = AudioUtils.reverseBuffer(activeFile.buffer);
      }
      
      onFileEdit(activeFile.id, newBuffer);
    } catch (err) {
      console.error("Effect processing failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 수치 직접 입력 핸들러 (가이드 준수)
  const handleNumInput = (val, setter, min, max) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setter(Math.max(min, Math.min(max, num)));
    }
  };

  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 italic">
        파일을 선택하여 편집을 시작하세요.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 gap-6 overflow-y-auto bg-slate-950">
      {/* 파형 영역 (70% 높이) */}
      <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 relative overflow-hidden shadow-2xl">
        <canvas ref={canvasRef} width={1200} height={400} className="w-full h-full" />
        <div className="absolute top-4 left-4 bg-slate-950/80 px-3 py-1 rounded-full border border-blue-500/30 text-[10px] font-bold text-blue-400">
          {activeFile.name} - {(activeFile.buffer.duration).toFixed(2)}s
        </div>
      </div>

      {/* 컨트롤 패널 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 기본 도구 */}
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
          <h3 className="text-[10px] font-bold text-slate-500 mb-3 tracking-widest">BASIC TOOLS</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => applyEffect('reverse')} className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 p-2 rounded text-xs transition-colors">
              <FlipHorizontal size={14} /> Reverse
            </button>
            <button onClick={() => onAddToRack(activeFile.buffer, `Copy_${activeFile.name}`)} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 p-2 rounded text-xs transition-colors text-white">
              <Save size={14} /> Save New
            </button>
          </div>
        </div>

        {/* 이펙터 (Reverb / Delay) */}
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 col-span-2">
          <h3 className="text-[10px] font-bold text-slate-500 mb-3 tracking-widest">EFFECTS & OPTIMIZATION</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-slate-400">REVERB WET</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="bg-slate-800 w-12 text-[10px] text-center rounded border border-slate-700"
                  value={reverbWet}
                  onChange={(e) => handleNumInput(e.target.value, setReverbWet, 0, 1)}
                />
              </div>
              <div className="flex gap-2">
                <input type="range" min="0" max="1" step="0.01" value={reverbWet} onChange={(e) => setReverbWet(parseFloat(e.target.value))} className="flex-1 accent-blue-500" />
                <button onClick={() => applyEffect('reverb')} disabled={isProcessing} className="p-1 px-2 bg-blue-500/20 text-blue-400 rounded text-[10px] hover:bg-blue-500/40">APPLY</button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-slate-400">DELAY TIME (s)</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="bg-slate-800 w-12 text-[10px] text-center rounded border border-slate-700"
                  value={delayTime}
                  onChange={(e) => handleNumInput(e.target.value, setDelayTime, 0, 2)}
                />
              </div>
              <div className="flex gap-2">
                <input type="range" min="0" max="2" step="0.01" value={delayTime} onChange={(e) => setDelayTime(parseFloat(e.target.value))} className="flex-1 accent-blue-500" />
                <button onClick={() => applyEffect('delay')} disabled={isProcessing} className="p-1 px-2 bg-blue-500/20 text-blue-400 rounded text-[10px] hover:bg-blue-500/40">APPLY</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isProcessing && (
        <div className="absolute inset-0 bg-slate-950/50 flex items-center justify-center backdrop-blur-sm z-50">
          <div className="flex flex-col items-center gap-3">
            <Sparkles className="animate-spin text-blue-400" />
            <span className="text-xs font-bold animate-pulse text-blue-400">PROCESSING AUDIO...</span>
          </div>
        </div>
      )}
    </div>
  );
}
