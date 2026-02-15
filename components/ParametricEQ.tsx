
import React, { useRef, useEffect, useState } from 'react';
import { EQBand } from '../types';
import { AudioUtils } from '../utils/audioUtils';

interface ParametricEQProps {
  bands: EQBand[];
  onChange: (bands: EQBand[]) => void;
  audioContext: AudioContext;
  playingSource: AudioNode | null; 
  activeBuffer?: AudioBuffer | null;
  currentTime?: number;
}

const ParametricEQ: React.FC<ParametricEQProps> = ({ bands, onChange, audioContext, playingSource, activeBuffer, currentTime = 0 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const requestRef = useRef<number>(0);
    const [dragBandId, setDragBandId] = useState<number | null>(null);

    // Initialize Analyser
    useEffect(() => {
        if (!audioContext) return;
        if (!analyserRef.current) {
            analyserRef.current = audioContext.createAnalyser();
            analyserRef.current.fftSize = 2048;
            analyserRef.current.smoothingTimeConstant = 0.6;
        }

        if (playingSource) {
            try {
                // If playing, connect source to analyser
                playingSource.connect(analyserRef.current);
            } catch(e) { /* ignore */ }
        }

    }, [audioContext, playingSource]);

    // Scrubbing Analysis Logic
    useEffect(() => {
        // If not playing, manually feed data to analyser to visualize current frame
        if (!playingSource && activeBuffer && analyserRef.current && audioContext) {
            try {
                // Get data at current time
                const sampleRate = activeBuffer.sampleRate;
                const startSample = Math.floor(currentTime * sampleRate);
                const fftSize = analyserRef.current.fftSize;
                
                if (startSample >= 0 && startSample < activeBuffer.length) {
                    const sliceLen = fftSize;
                    const sliceBuffer = audioContext.createBuffer(1, sliceLen, sampleRate);
                    const channelData = activeBuffer.getChannelData(0);
                    
                    // Copy data safely
                    const end = Math.min(startSample + sliceLen, activeBuffer.length);
                    const slice = channelData.slice(startSample, end);
                    sliceBuffer.copyToChannel(slice, 0);

                    // Create a one-shot source to feed the analyser
                    const source = audioContext.createBufferSource();
                    source.buffer = sliceBuffer;
                    source.connect(analyserRef.current);
                    source.start();
                    // We don't connect to destination, so it's silent but feeds analyser
                }
            } catch (e) {
                console.error("Analysis error", e);
            }
        }
    }, [activeBuffer, currentTime, playingSource, audioContext]);

    const getX = (freq: number, width: number) => {
        const minF = 20; const maxF = 20000;
        const logMin = Math.log10(minF); const logMax = Math.log10(maxF);
        const logF = Math.log10(freq);
        return ((logF - logMin) / (logMax - logMin)) * width;
    };

    const getY = (gain: number, height: number) => {
        const minG = -20; const maxG = 20;
        return (1 - (gain - minG) / (maxG - minG)) * height;
    };

    const getFreqFromX = (x: number, width: number) => {
        const minF = 20; const maxF = 20000;
        const logMin = Math.log10(minF); const logMax = Math.log10(maxF);
        const logF = (x / width) * (logMax - logMin) + logMin;
        return Math.pow(10, logF);
    };

    const getGainFromY = (y: number, height: number) => {
        const minG = -20; const maxG = 20;
        const norm = 1 - (y / height);
        return minG + norm * (maxG - minG);
    };

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        // Grid Lines
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        [100, 1000, 10000].forEach(f => { const x = getX(f, w); ctx.moveTo(x, 0); ctx.lineTo(x, h); });
        ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); 
        ctx.stroke();

        // RTA (Real Time Analyzer)
        if (analyserRef.current) {
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyserRef.current.getByteFrequencyData(dataArray);

            ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
            ctx.beginPath();
            ctx.moveTo(0, h);
            for(let i=0; i<bufferLength; i++) {
                const freq = (i * audioContext.sampleRate) / (2 * bufferLength);
                if (freq < 20) continue;
                if (freq > 20000) break;
                
                const x = getX(freq, w);
                const v = dataArray[i] / 255;
                const y = h - (v * h);
                ctx.lineTo(x, y);
            }
            ctx.lineTo(w, h);
            ctx.fill();
        }

        // Aggregate Response Curve
        ctx.beginPath();
        ctx.strokeStyle = '#60a5fa'; 
        ctx.lineWidth = 2;
        
        const sampleRate = audioContext.sampleRate;
        for (let x = 0; x < w; x+=2) {
            const freq = getFreqFromX(x, w);
            let totalGainDB = 0;
            bands.forEach(b => {
                if (!b.on) return;
                const mag = AudioUtils.getBiquadMagnitude(freq, b.type, b.freq, b.gain, b.q, sampleRate);
                totalGainDB += 20 * Math.log10(mag);
            });
            const y = getY(totalGainDB, h);
            if (x===0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Draw Handles
        bands.forEach((b, i) => {
            const x = getX(b.freq, w);
            const y = getY(b.gain, h);
            ctx.beginPath();
            ctx.fillStyle = b.on ? (dragBandId === b.id ? '#fbbf24' : '#ffffff') : '#475569';
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px Inter';
            ctx.fillText((i+1).toString(), x - 3, y - 10);
        });

        requestRef.current = requestAnimationFrame(draw);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(draw);
        return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
    }, [bands, audioContext, playingSource, dragBandId]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const w = rect.width; const h = rect.height;

        let hitId: number | null = null;
        bands.forEach(b => {
             const bx = getX(b.freq, w);
             const by = getY(b.gain, h);
             if (Math.hypot(bx - mx, by - my) < 15) hitId = b.id;
        });

        if (hitId !== null) {
            setDragBandId(hitId);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (dragBandId === null) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const w = rect.width; const h = rect.height;
        const mx = Math.max(0, Math.min(w, e.clientX - rect.left));
        const my = Math.max(0, Math.min(h, e.clientY - rect.top));

        const freq = getFreqFromX(mx, w);
        const gain = getGainFromY(my, h);

        onChange(bands.map(b => b.id === dragBandId ? { ...b, freq, gain: (b.type === 'lowpass' || b.type === 'highpass') ? 0 : gain } : b));
    };

    const handleWheel = (e: React.WheelEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const mx = e.clientX - rect.left; 
        const my = e.clientY - rect.top;
        const w = rect.width; const h = rect.height;
        
        let hitId: number | null = null;
        bands.forEach(b => {
             const bx = getX(b.freq, w);
             const by = getY(b.gain, h);
             if (Math.hypot(bx - mx, by - my) < 30) hitId = b.id;
        });

        if (hitId !== null) {
            e.preventDefault();
            const band = bands.find(b => b.id === hitId);
            if (band) {
                const newQ = Math.max(0.1, Math.min(20, band.q + (e.deltaY > 0 ? -0.2 : 0.2)));
                onChange(bands.map(b => b.id === hitId ? { ...b, q: newQ } : b));
            }
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const mx = e.clientX - rect.left; 
        const my = e.clientY - rect.top;
        const w = rect.width; const h = rect.height;
        
        let hitId: number | null = null;
        bands.forEach(b => {
             const bx = getX(b.freq, w);
             const by = getY(b.gain, h);
             if (Math.hypot(bx - mx, by - my) < 15) hitId = b.id;
        });

        if (hitId !== null) {
            onChange(bands.map(b => b.id === hitId ? { ...b, on: !b.on } : b));
        }
    };

    return (
        <div ref={containerRef} className="relative w-full h-full bg-[#0f172a] rounded-lg overflow-hidden border border-slate-700 shadow-inner">
            <canvas 
                ref={canvasRef} 
                width={800} 
                height={250} 
                className="w-full h-full cursor-crosshair"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={() => setDragBandId(null)}
                onMouseLeave={() => setDragBandId(null)}
                onWheel={handleWheel}
                onDoubleClick={handleDoubleClick}
                onContextMenu={e=>e.preventDefault()}
            />
        </div>
    );
};

export default ParametricEQ;
