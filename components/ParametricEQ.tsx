
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

    // Effect 1: Manage AnalyserNode lifecycle
    useEffect(() => {
        if (!audioContext) return;
        
        // Ensure analyser belongs to the current audioContext instance
        if (!analyserRef.current || analyserRef.current.context !== audioContext) {
            try {
                const newAnalyser = audioContext.createAnalyser();
                newAnalyser.fftSize = 512;
                newAnalyser.smoothingTimeConstant = 0.6;
                analyserRef.current = newAnalyser;
            } catch (e) {
                console.error("ParametricEQ: Failed to create AnalyserNode:", e);
            }
        }
    }, [audioContext]);

    // Effect 2: Manage connection between playingSource and AnalyserNode
    useEffect(() => {
        const analyser = analyserRef.current;
        const source = playingSource;

        if (!analyser || !source) return;

        let isConnected = false;

        // CRITICAL CHECK: The source and destination nodes MUST share the same BaseAudioContext instance.
        // This check handles cases where nodes might come from different tabs or offline contexts.
        if (source.context === analyser.context) {
            try {
                source.connect(analyser);
                isConnected = true;
            } catch (e) {
                console.warn("ParametricEQ: Connection attempt failed despite context match:", e);
            }
        } else {
            // Log for debugging if a cross-context connection is attempted
            console.debug("ParametricEQ: Context mismatch - ignoring connection attempt.", {
                sourceCtx: source.context,
                analyserCtx: analyser.context
            });
        }

        return () => {
            if (isConnected && source && analyser) {
                try {
                    // Safe cleanup: only disconnect if they are still in the same context
                    if (source.context === analyser.context) {
                        source.disconnect(analyser);
                    }
                } catch (e) {
                    // Fail silently during cleanup
                }
            }
        };
    }, [playingSource]);

    const getX = (freq: number, w: number) => {
        const min = Math.log10(20);
        const max = Math.log10(20000);
        return ((Math.log10(Math.max(20, freq)) - min) / (max - min)) * w;
    };

    const getY = (gain: number, h: number) => (1 - (gain + 20) / 40) * h;

    const getFreqFromX = (x: number, w: number) => {
        const min = Math.log10(20);
        const max = Math.log10(20000);
        return Math.pow(10, (x / w) * (max - min) + min);
    };

    const getGainFromY = (y: number, h: number) => (1 - y / h) * 40 - 20;

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const analyser = analyserRef.current;
        if (!canvas || !audioContext) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        const { width: w, height: h } = canvas;

        // Clear background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        // Grid lines (Logarithmic)
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        [100, 1000, 10000].forEach(f => {
            const x = getX(f, w);
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        });
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        // Spectrum visualization
        // Only attempt to visualize if analyser exists and matches context
        if (analyser && playingSource && playingSource.context === analyser.context) {
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);
            
            ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
            ctx.beginPath(); 
            ctx.moveTo(0, h);
            for(let i = 0; i < bufferLength; i++) {
                const f = (i * audioContext.sampleRate) / (2 * bufferLength);
                if (f < 20) continue; 
                if (f > 20000) break;
                ctx.lineTo(getX(f, w), h - (dataArray[i] / 255) * h);
            }
            ctx.lineTo(w, h); 
            ctx.fill();
        }

        // EQ Frequency Response Curve
        ctx.beginPath(); 
        ctx.strokeStyle = '#60a5fa'; 
        ctx.lineWidth = 2;
        const sr = audioContext.sampleRate;
        for (let x = 0; x < w; x += 4) {
            const f = getFreqFromX(x, w);
            let totalDB = 0;
            bands.forEach(b => { 
                if(b.on) {
                    try {
                        totalDB += 20 * Math.log10(AudioUtils.getBiquadMagnitude(f, b.type, b.freq, b.gain, b.q, sr)); 
                    } catch(e) {}
                }
            });
            const y = getY(totalDB, h);
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Band Handles (Interaction points)
        bands.forEach((b, i) => {
            const bx = getX(b.freq, w), by = getY(b.gain, h);
            ctx.beginPath(); 
            ctx.fillStyle = b.on ? (dragBandId === b.id ? '#fbbf24' : '#fff') : '#475569';
            ctx.arc(bx, by, 5, 0, Math.PI * 2); 
            ctx.fill();
            ctx.fillStyle = '#64748b'; 
            ctx.font = '9px Inter'; 
            ctx.fillText((i + 1).toString(), bx - 3, by - 10);
        });

        animationFrameRef.current = requestAnimationFrame(draw);
    }, [bands, audioContext, playingSource, dragBandId]);

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
        <canvas 
            ref={canvasRef} 
            width={600} 
            height={240} 
            className="w-full h-full cursor-crosshair rounded-lg bg-[#0f172a] shadow-inner border border-slate-700"
            onMouseDown={handleMouseDown} 
            onMouseMove={handleMouseMove} 
            onMouseUp={() => setDragBandId(null)} 
            onMouseLeave={() => setDragBandId(null)}
            onDoubleClick={(e) => {
                const rect = canvasRef.current!.getBoundingClientRect();
                const hit = bands.find(b => Math.hypot(getX(b.freq, rect.width) - (e.clientX - rect.left), getY(b.gain, rect.height) - (e.clientY - rect.top)) < 20);
                if (hit) onChange(bands.map(b => b.id === hit.id ? { ...b, on: !b.on } : b));
            }}
        />
    );
});

export default ParametricEQ;
