import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Save, Sparkles, FlipHorizontal, Activity } from 'lucide-react';
import * as AudioUtils from '../utils/AudioUtils';

export default function StudioTab({ activeFile, onFileEdit, onAddToRack }) {
  const [reverbWet, setReverbWet] = useState(0.3);
  const [delayTime, setDelayTime] = useState(0.3);
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!activeFile || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const buffer = activeFile.buffer;
    const data = buffer.getChannelData(0);
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1;
    const step = Math.ceil(data.length / canvasRef.current.width);
    const amp = canvasRef.current.height / 2;
    for (let i = 0; i < canvasRef.current.width; i++) {
      let min = 1, max = -1;
      for (let j = 0; j < step; j++) { const d = data[i * step + j]; if (d < min) min = d; if (d > max) max = d; }
      ctx.lineTo(i, (1 + min) * amp); ctx.lineTo(i, (1 + max) * amp);
    } ctx.stroke();
  }, [activeFile]);

  const applyEffect = async (type) => {
    if (!activeFile || isProcessing) return;
    setIsProcessing(true);
    try {
      let newBuffer;
      if (type === 'reverb') newBuffer = await AudioUtils.applyReverb(activeFile.buffer, reverbWet);
      else if (type === 'delay') newBuffer = await AudioUtils.applyDelay(activeFile.buffer, delayTime);
      else if (type === 'reverse') newBuffer = AudioUtils.reverseBuffer(activeFile.buffer);
      if (newBuffer) onFileEdit(activeFile.id, newBuffer);
    } finally { setIsProcessing(false); }
  };

  if (!activeFile) return <div className="h-full flex items-center justify-center text-slate-700 font-bold italic">SELECT A FILE TO START EDITING</div>;

  return (
    <div className="h-full flex flex-col p-6 gap-6 bg-slate-950 overflow-y-auto">
      <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 relative overflow-hidden shadow-2xl min-h-[300px]">
        <canvas ref={canvasRef} width={1200} height={400} className="w-full h-full" />
        <div className="absolute top-4 left-4 bg-slate-950/80 px-3 py-1 rounded-full border border-blue-500/30 text-[10px] text-blue-400 font-bold uppercase">{activeFile.name} | {activeFile.buffer.duration.toFixed(2)}s</div>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-col gap-2">
          <span className="text-[10px] text-slate-500 font-bold tracking-widest">REVERB</span>
          <div className="flex gap-2">
            <input type="range" min="0" max="1" step="0.01" value={reverbWet} onChange={e=>setReverbWet(parseFloat(e.target.value))} className="flex-1 accent-blue-500" />
            <input type="number" value={reverbWet} onChange={e=>setReverbWet(parseFloat(e.target.value))} className="w-12 bg-slate-800 text-[10px] border border-slate-700 rounded text-center" />
          </div>
          <button onClick={()=>applyEffect('reverb')} className="w-full bg-blue-600/20 text-blue-400 py-1 rounded text-[10px] font-bold hover:bg-blue-600/40">APPLY REVERB</button>
        </div>
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-col gap-2">
          <span className="text-[10px] text-slate-500 font-bold tracking-widest">DELAY</span>
          <div className="flex gap-2">
            <input type="range" min="0" max="2" step="0.01" value={delayTime} onChange={e=>setDelayTime(parseFloat(e.target.value))} className="flex-1 accent-blue-500" />
            <input type="number" value={delayTime} onChange={e=>setDelayTime(parseFloat(e.target.value))} className="w-12 bg-slate-800 text-[10px] border border-slate-700 rounded text-center" />
          </div>
          <button onClick={()=>applyEffect('delay')} className="w-full bg-blue-600/20 text-blue-400 py-1 rounded text-[10px] font-bold hover:bg-blue-600/40">APPLY DELAY</button>
        </div>
        <div className="grid grid-rows-2 gap-2">
          <button onClick={()=>applyEffect('reverse')} className="bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2"><FlipHorizontal size={14}/> REVERSE</button>
          <button onClick={()=>onAddToRack(activeFile.buffer, `Copy_${activeFile.name}`)} className="bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2"><Save size={14}/> SAVE NEW</button>
        </div>
      </div>
      {isProcessing && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4 text-blue-400 font-bold tracking-tighter"><Sparkles className="animate-spin" size={32}/> PROCESSING...</div>}
    </div>
  );
}
