
import React, { useRef, useEffect, useState, useMemo, memo, useCallback } from 'react';
import { EQBand } from '../types';
import { AudioUtils } from '../utils/audioUtils';

interface ParametricEQProps {
  bands: EQBand[];
  onChange: (bands: EQBand[]) => void;
  audioContext: AudioContext;
  playingSource: AudioNode | null; 
}

const ParametricEQ: React.FC<ParametricEQProps> = memo(({ bands, onChange, audioContext, playingSource }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const [dragBandId, setDragBandId] = useState<number | null>(null);
    const animationFrameRef = useRef<number>(0);

    // Sync AnalyserNode with the current AudioContext
    useEffect(() => {
        if (!audioContext) return;

        // If context changed or analyser not created, create it
        if (!analyserRef.current || analyserRef.current.context !== audioContext) {
            // Cleanup old connection if any
            if (analyserRef.current) {
                try { analyserRef.current.disconnect(); } catch(e) {}
            }
            analyserRef.current = audioContext.createAnalyser();
            analyserRef.current.fftSize = 1024;
            analyserRef.current.smoothingTimeConstant = 0.5;
        }

        // Handle source connection
        if (playingSource && analyserRef.current) {
            // CRITICAL: Only connect if contexts match to avoid "different audio context" error
            if (playingSource.context === audioContext) {
                try {
                    playingSource.connect(analyserRef.current);
                } catch (e) {
                    console.warn("Failed to connect playingSource to Analyser:", e);
                }
                
                return () => {
                    try {
                        if (playingSource && analyserRef.current) {
                            playingSource.disconnect(analyserRef.current);
                        }
                    } catch (e) {
                        // Source might already be stopped/disposed or context closed
                    }
                };
            } else {
                console.warn("ParametricEQ: playingSource belongs to a different context than provided audioContext.", playingSource.context, audioContext);
            }
        }
    }, [audioContext, playingSource]);

    const getX = (freq: number, w: number) => ((Math.log10(freq) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) * w;
    const getY = (gain: number, h: number) => (1 - (gain + 20) / 40) * h;
    const getFreqFromX = (x: number, w: number) => Math.pow(10, (x / w) * (Math.log10(20000) - Math.log10(20)) + Math.log10(20));
    const getGainFromY = (y: number, h: number) => (1 - y / h) * 40 - 20;

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !audioContext) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        const { width: w, height: h } = canvas;

        // Background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = '#1e293b';
        ctx.beginPath();
        [100, 1000, 10000].forEach(f => { const x = getX(f, w); ctx.moveTo(x, 0); ctx.lineTo(x, h); });
        ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();

        // Analyzer Spectrum
        if (analyserRef.current && analyserRef.current.context === audioContext) {
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyserRef.current.getByteFrequencyData(dataArray);
            
            ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
            ctx.beginPath(); ctx.moveTo(0, h);
            for(let i=0; i<bufferLength; i++) {
                const f = (i * audioContext.sampleRate) / (2 * bufferLength);
                if (f < 20) continue; if (f > 20000) break;
                ctx.lineTo(getX(f, w), h - (dataArray[i] / 255) * h);
            }
            ctx.lineTo(w, h); ctx.fill();
        }

        // Response Curve
        ctx.beginPath(); ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2;
        const sr = audioContext.sampleRate;
        for (let x = 0; x < w; x += 4) {
            const f = getFreqFromX(x, w);
            let totalDB = 0;
            bands.forEach(b => { if(b.on) totalDB += 20 * Math.log10(AudioUtils.getBiquadMagnitude(f, b.type, b.freq, b.gain, b.q, sr)); });
            const y = getY(totalDB, h);
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Handles
        bands.forEach((b, i) => {
            const bx = getX(b.freq, w), by = getY(b.gain, h);
            ctx.beginPath(); ctx.fillStyle = b.on ? (dragBandId===b.id?'#fbbf24':'#fff') : '#475569';
            ctx.arc(bx, by, 5, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#64748b'; ctx.font = '9px Inter'; ctx.fillText((i+1).toString(), bx-3, by-10);
        });

        animationFrameRef.current = requestAnimationFrame(draw);
    }, [bands, audioContext, dragBandId]);

    useEffect(() => {
        animationFrameRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, [draw]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const w = rect.width, h = rect.height;
        const hit = bands.find(b => Math.hypot(getX(b.freq, w) - mx, getY(b.gain, h) - my) < 20);
        if (hit) setDragBandId(hit.id);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (dragBandId === null) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const mx = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const my = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        const freq = getFreqFromX(mx, rect.width);
        const gain = getGainFromY(my, rect.height);
        onChange(bands.map(b => b.id === dragBandId ? { ...b, freq, gain: (b.type.includes('pass')) ? 0 : gain } : b));
    };

    return (
        <canvas ref={canvasRef} width={600} height={240} className="w-full h-full cursor-crosshair rounded-lg bg-[#0f172a] shadow-inner border border-slate-700"
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={()=>setDragBandId(null)} onMouseLeave={()=>setDragBandId(null)}
            onDoubleClick={(e)=>{
                const rect = canvasRef.current!.getBoundingClientRect();
                const hit = bands.find(b => Math.hypot(getX(b.freq, rect.width) - (e.clientX - rect.left), getY(b.gain, rect.height) - (e.clientY - rect.top)) < 20);
                if (hit) onChange(bands.map(b => b.id === hit.id ? { ...b, on: !b.on } : b));
            }}
        />
    );
});

export default ParametricEQ;
