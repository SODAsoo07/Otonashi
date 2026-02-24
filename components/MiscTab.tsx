import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Save, Activity, Zap, Waves, Volume2, RefreshCw } from 'lucide-react';
import { AudioFile } from '../types';
import { AudioUtils } from '../utils/audioUtils';

interface MiscTabProps {
    audioContext: AudioContext;
    files: AudioFile[];
    onAddToRack: (buffer: AudioBuffer, name: string) => void;
    isActive: boolean;
}

const MiscTab: React.FC<MiscTabProps> = ({ audioContext, files, onAddToRack, isActive }) => {
    const [selectedFileId, setSelectedFileId] = useState<string>('');
    const activeFile = files.find(f => f.id === selectedFileId) || null;

    // Harmonic Exciter State
    const [exciterOn, setExciterOn] = useState(false);
    const [exciterMix, setExciterMix] = useState(0.5); // 0.0 to 1.0
    const [exciterPitch, setExciterPitch] = useState(261.6); // C4 default

    // ADSR Envelope State
    const [adsrOn, setAdsrOn] = useState(false);
    const [attackMs, setAttackMs] = useState(10);
    const [decayMs, setDecayMs] = useState(50);
    const [sustainLevel, setSustainLevel] = useState(80); // 0-100%
    const [releaseMs, setReleaseMs] = useState(100);

    // Pitch Tuner State
    const [tuneOn, setTuneOn] = useState(false);
    const [detectedF0, setDetectedF0] = useState<number | null>(null);
    const [f0Curve, setF0Curve] = useState<{ t: number, f0: number, amp: number }[]>([]);
    const [targetPitch, setTargetPitch] = useState(261.6); // C4 default
    const [pitchShiftMode, setPitchShiftMode] = useState<'high_quality' | 'length_preserve'>('length_preserve');

    // Batch Processing State
    const [isBatchMode, setIsBatchMode] = useState(false);
    const [selectedBatchFiles, setSelectedBatchFiles] = useState<Set<string>>(new Set());

    // Player State
    const [isPlaying, setIsPlaying] = useState(false);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const oscNodeRef = useRef<OscillatorNode | null>(null);
    const oscGainNodeRef = useRef<GainNode | null>(null);
    const [playheadPos, setPlayheadPos] = useState(0);

    // Canvas
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Auto-select first file if available
    useEffect(() => {
        if (files.length > 0 && !selectedFileId) {
            setSelectedFileId(files[0].id);
        } else if (files.length === 0) {
            setSelectedFileId('');
            setSelectedBatchFiles(new Set());
        }

        // Auto-update batch selection to ensure deleted files are removed
        setSelectedBatchFiles(prev => {
            const next = new Set(prev);
            for (let id of next) {
                if (!files.find(f => f.id === id)) next.delete(id);
            }
            return next;
        });

    }, [files, selectedFileId]);

    // Draw waveform
    useEffect(() => {
        if (!canvasRef.current || !activeFile) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const w = canvasRef.current.width;
        const h = canvasRef.current.height;
        ctx.clearRect(0, 0, w, h);

        const data = activeFile.buffer.getChannelData(0);
        const step = Math.ceil(data.length / w);
        const amp = h / 2;

        ctx.beginPath();
        ctx.moveTo(0, amp);
        for (let i = 0; i < w; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const val = data[(i * step) + j];
                if (val < min) min = val;
                if (val > max) max = val;
            }
            ctx.lineTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
        ctx.strokeStyle = '#6366f1'; // indigo-500
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw F0 Curve if available
        if (f0Curve.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#f43f5e'; // rose-500 for F0
            ctx.lineWidth = 2;
            let first = true;
            for (const point of f0Curve) {
                if (point.f0 === 0) continue; // Skip unvoiced

                const px = (point.t / activeFile.buffer.duration) * w;
                // Map 50Hz-1000Hz to canvas height
                const normalizedF0 = Math.max(0, Math.min(1, (point.f0 - 50) / 950));
                const py = h - (normalizedF0 * h);

                if (first) {
                    ctx.moveTo(px, py);
                    first = false;
                } else {
                    ctx.lineTo(px, py);
                }
            }
            ctx.stroke();
        }

        if (isPlaying) {
            const px = playheadPos * w;
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillRect(px, 0, 2, h);
            requestAnimationFrame(() => setPlayheadPos(playheadPos)); // Just to trigger re-render cycle conceptually
        } else {
            setPlayheadPos(0);
        }

    }, [activeFile, playheadPos, isPlaying]);


    const stopAudio = useCallback(() => {
        if (sourceRef.current) { try { sourceRef.current.stop(); } catch (e) { } sourceRef.current = null; }
        if (oscNodeRef.current) { try { oscNodeRef.current.stop(); } catch (e) { } oscNodeRef.current = null; }
        if (gainNodeRef.current) { gainNodeRef.current.disconnect(); gainNodeRef.current = null; }
        if (oscGainNodeRef.current) { oscGainNodeRef.current.disconnect(); oscGainNodeRef.current = null; }
        setIsPlaying(false);
        setPlayheadPos(0);
    }, []);

    // Stop on unmount or tab switch
    useEffect(() => {
        if (!isActive) stopAudio();
        return () => stopAudio();
    }, [isActive, stopAudio]);


    const playAudio = async () => {
        if (!activeFile) return;
        stopAudio();

        setIsPlaying(true);
        const startTime = audioContext.currentTime;
        const duration = activeFile.buffer.duration;

        // Main source
        const source = audioContext.createBufferSource();
        source.buffer = activeFile.buffer;

        // Pitch Tuning
        if (tuneOn && detectedF0 && detectedF0 > 0) {
            const ratio = targetPitch / detectedF0;
            // Native Web Audio method for pitch-shifting without time-stretching 
            // is not trivial. For real-time preview, we will just use playbackRate 
            // (which changes length) to give an idea of the pitch, 
            // but offline render will use the precise length-preserving method.
            source.playbackRate.value = ratio;
        }

        const masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);

        // Apply ADSR envelope to masterGain if on
        if (adsrOn) {
            masterGain.gain.setValueAtTime(0, startTime);
            masterGain.gain.linearRampToValueAtTime(1.0, startTime + (attackMs / 1000));
            masterGain.gain.linearRampToValueAtTime(sustainLevel / 100, startTime + (attackMs / 1000) + (decayMs / 1000));

            // Release should happen at the end of the duration
            const releaseStart = startTime + duration - (releaseMs / 1000);
            if (releaseStart > startTime) {
                masterGain.gain.setValueAtTime(sustainLevel / 100, releaseStart);
                masterGain.gain.linearRampToValueAtTime(0.001, startTime + duration);
            }
        } else {
            masterGain.gain.value = 1.0;
        }

        // Dry signal
        const dryGain = audioContext.createGain();
        dryGain.gain.value = exciterOn ? (exciterMix > 1.0 ? Math.max(0, 1.0 - (exciterMix - 1.0)) : 1.0) : 1.0;
        source.connect(dryGain);
        dryGain.connect(masterGain);

        // Harmonic Exciter Path
        if (exciterOn) {
            setIsPlaying(false); // Pause UI while calculating

            const offlineCtx = new OfflineAudioContext(
                activeFile.buffer.numberOfChannels,
                activeFile.buffer.length,
                activeFile.buffer.sampleRate
            );

            const offlineSource = offlineCtx.createBufferSource();
            offlineSource.buffer = activeFile.buffer;

            // Amplitude Modulation (Ring Modulation-like) Exciter
            // Carrier: Sawtooth at target pitch
            // Modulator: Original Audio

            // 1. The Carrier oscillator
            const osc = offlineCtx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = exciterPitch;

            // Soften the harsh digital sawtooth to remove metallic noise
            const oscLp = offlineCtx.createBiquadFilter();
            oscLp.type = 'lowpass';
            oscLp.frequency.value = exciterPitch * 4; // Keep only lower, warmer harmonics
            oscLp.Q.value = 0.5; // Gentle slope

            // 2. Modulator: Extract Volume Envelope (Envelope Follower)
            // To avoid harsh intermodulation, we don't multiply raw audio and sawtooth.
            // We multiply the *volume envelope* of the audio and the sawtooth.

            const amGain = offlineCtx.createGain();
            amGain.gain.value = 0; // Controlled by envelope
            osc.connect(oscLp);
            oscLp.connect(amGain);

            const modulatorSource = offlineCtx.createBufferSource();
            modulatorSource.buffer = activeFile.buffer;

            // Pre-compression for Modulator to stabilize exciter dynamics (Phase 9)
            const modCompressor = offlineCtx.createDynamicsCompressor();
            modCompressor.threshold.value = -40; // Heavy compression
            modCompressor.ratio.value = 20;
            modCompressor.attack.value = 0.005;
            modCompressor.release.value = 0.050;

            // Rectify the signal (absolute value)
            const rectShaper = offlineCtx.createWaveShaper();
            const curve = new Float32Array(44100);
            for (let i = 0; i < 44100; ++i) {
                const x = (i * 2) / 44100 - 1;
                curve[i] = Math.abs(x);
            }
            rectShaper.curve = curve;

            // Lowpass filter to smooth it into an envelope
            const envFilter1 = offlineCtx.createBiquadFilter();
            envFilter1.type = 'lowpass';
            envFilter1.frequency.value = 30; // Slower 30Hz for less zipper noise
            envFilter1.Q.value = 0.5;

            const envFilter2 = offlineCtx.createBiquadFilter();
            envFilter2.type = 'lowpass';
            envFilter2.frequency.value = 30; // Secondary stage for smooth roll-off
            envFilter2.Q.value = 0.5;

            // Boost modulator signal slightly to ensure good modulation depth
            const modBoost = offlineCtx.createGain();
            modBoost.gain.value = 2.0;

            modulatorSource.connect(modCompressor);
            modCompressor.connect(rectShaper);
            rectShaper.connect(envFilter1);
            envFilter1.connect(envFilter2);
            envFilter2.connect(modBoost);
            modBoost.connect(amGain.gain);

            // Main mix on offline ctx
            // Dry signal remains at full volume up to 100% mix, then ducks if mix > 100%
            const dry = offlineCtx.createGain();
            dry.gain.value = exciterMix > 1.0 ? Math.max(0, 1.0 - (exciterMix - 1.0)) : 1.0;
            offlineSource.connect(dry);
            dry.connect(offlineCtx.destination);

            // Add the modulated (excited) signal on top
            const wet = offlineCtx.createGain();
            // Scaling wet by exciterMix. 
            wet.gain.value = exciterMix;
            amGain.connect(wet);
            // Optional: Highpass the wet signal to only add upper harmonics and avoid muddying the low end
            const hpFilter = offlineCtx.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.value = exciterPitch / 2;
            wet.connect(hpFilter);
            hpFilter.connect(offlineCtx.destination);

            offlineSource.start(0);
            modulatorSource.start(0);
            osc.start(0);

            const renderedBuffer = await offlineCtx.startRendering();

            // Now play the rendered buffer
            const renderedSource = audioContext.createBufferSource();
            renderedSource.buffer = renderedBuffer;
            renderedSource.connect(audioContext.destination);
            renderedSource.start();
            sourceRef.current = renderedSource;
            setIsPlaying(true);

        } else {
            // Normal playback
            source.start();
            sourceRef.current = source;
        }

        const animate = () => {
            if (!isPlaying && !sourceRef.current) return;
            const elapsed = audioContext.currentTime - startTime;
            if (elapsed < duration) {
                setPlayheadPos(elapsed / duration);
                requestAnimationFrame(animate);
            } else {
                stopAudio();
            }
        };
        requestAnimationFrame(animate);
    };

    const processOffline = async (file: AudioFile) => {
        // If all offline effects are off, just return the original
        if (!exciterOn && !adsrOn && !tuneOn) {
            return { buffer: file.buffer, suffix: 'Misc' };
        }

        const offlineCtx = new OfflineAudioContext(
            file.buffer.numberOfChannels,
            file.buffer.length,
            file.buffer.sampleRate
        );

        const offlineSource = offlineCtx.createBufferSource();
        offlineSource.buffer = file.buffer;

        // Amplitude Modulation (Ring Modulation-like) Exciter
        // Carrier: Sawtooth at target pitch
        // Modulator: Original Audio

        const osc = offlineCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = exciterPitch;

        const oscLp = offlineCtx.createBiquadFilter();
        oscLp.type = 'lowpass';
        oscLp.frequency.value = exciterPitch * 4;
        oscLp.Q.value = 0.5;

        // 2. Modulator: Extract Volume Envelope (Envelope Follower)
        const amGain = offlineCtx.createGain();
        amGain.gain.value = 0;
        osc.connect(oscLp);
        oscLp.connect(amGain);

        const modulatorSource = offlineCtx.createBufferSource();
        modulatorSource.buffer = file.buffer;

        // Pre-compression for Modulator to stabilize exciter dynamics (Phase 9)
        const modCompressor = offlineCtx.createDynamicsCompressor();
        modCompressor.threshold.value = -40; // Heavy compression
        modCompressor.ratio.value = 20;
        modCompressor.attack.value = 0.005;
        modCompressor.release.value = 0.050;

        // Rectify
        const rectShaper = offlineCtx.createWaveShaper();
        const curve = new Float32Array(44100);
        for (let i = 0; i < 44100; ++i) {
            const x = (i * 2) / 44100 - 1;
            curve[i] = Math.abs(x);
        }
        rectShaper.curve = curve;

        // Double lowpass filtering for smoother envelope (prevents pops)
        const envFilter1 = offlineCtx.createBiquadFilter();
        envFilter1.type = 'lowpass';
        envFilter1.frequency.value = 30; // 30Hz first stage
        envFilter1.Q.value = 0.5;

        const envFilter2 = offlineCtx.createBiquadFilter();
        envFilter2.type = 'lowpass';
        envFilter2.frequency.value = 30; // 30Hz second stage
        envFilter2.Q.value = 0.5;

        const modBoost = offlineCtx.createGain();
        modBoost.gain.value = 2.0;

        modulatorSource.connect(modCompressor);
        modCompressor.connect(rectShaper);
        rectShaper.connect(envFilter1);
        envFilter1.connect(envFilter2);
        envFilter2.connect(modBoost);
        modBoost.connect(amGain.gain);

        const dry = offlineCtx.createGain();
        dry.gain.value = exciterMix > 1.0 ? Math.max(0, 1.0 - (exciterMix - 1.0)) : 1.0;
        offlineSource.connect(dry);

        let finalWetOutput: AudioNode = offlineCtx.destination;
        let finalDryOutput: AudioNode = offlineCtx.destination;

        // Final Output Stage (ADSR)
        if (adsrOn) {
            const masterGain = offlineCtx.createGain();
            masterGain.connect(offlineCtx.destination);
            finalWetOutput = masterGain;
            finalDryOutput = masterGain;

            const duration = offlineSource.buffer!.duration;
            masterGain.gain.setValueAtTime(0, 0);
            masterGain.gain.linearRampToValueAtTime(1.0, attackMs / 1000);
            masterGain.gain.linearRampToValueAtTime(sustainLevel / 100, (attackMs / 1000) + (decayMs / 1000));

            const releaseStart = duration - (releaseMs / 1000);
            if (releaseStart > 0) {
                masterGain.gain.setValueAtTime(sustainLevel / 100, releaseStart);
                masterGain.gain.linearRampToValueAtTime(0.001, duration);
            }
        }

        // Pitch tuning offline logic (Length Changing / High Quality Mode)
        if (tuneOn && detectedF0 && detectedF0 > 0 && pitchShiftMode === 'high_quality') {
            const ratio = targetPitch / detectedF0;
            offlineSource.playbackRate.value = ratio;
        }

        dry.connect(finalDryOutput);

        if (exciterOn) {
            const wet = offlineCtx.createGain();
            wet.gain.value = exciterMix;
            amGain.connect(wet);

            const hpFilter = offlineCtx.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.value = exciterPitch / 2;
            wet.connect(hpFilter);
            hpFilter.connect(finalWetOutput);

            osc.start(0);
            modulatorSource.start(0);
        }

        offlineSource.start(0);

        const renderedBuffer = await offlineCtx.startRendering();

        // Pitch tuning offline logic (Length Preserving Mode via OLA)
        if (tuneOn && detectedF0 && detectedF0 > 0 && pitchShiftMode === 'length_preserve') {
            const ratio = targetPitch / detectedF0;
            // Use our new utility to pitch shift the already rendered ADSR/Exciter buffer
            const finalBuffer = await AudioUtils.pitchShiftLengthPreserving(offlineCtx, renderedBuffer, ratio);
            return { buffer: finalBuffer, suffix: 'Tune' };
        }

        return { buffer: renderedBuffer, suffix: tuneOn ? 'Tune' : 'Exc' };
    };

    const handleSave = async () => {
        if (!activeFile && !isBatchMode) return;

        if (isBatchMode) {
            const filesToProcess = files.filter(f => selectedBatchFiles.has(f.id));
            for (const f of filesToProcess) {
                const res = await processOffline(f);
                onAddToRack(res.buffer, `${f.name}_${res.suffix}`);
            }
        } else if (activeFile) {
            const res = await processOffline(activeFile);
            onAddToRack(res.buffer, `${activeFile.name}_${res.suffix}`);
        }
    };

    const analyzeF0AndCurve = () => {
        if (!activeFile) return;
        const pitch = AudioUtils.detectFundamentalPitch(activeFile.buffer);
        setDetectedF0(Math.round(pitch || 0));
        const curve = AudioUtils.detectPitchCurve(activeFile.buffer, 30, 256);
        setF0Curve(curve);
    };

    return (
        <div className="flex-1 flex flex-col p-6 gap-6 bg-slate-50 overflow-y-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        <Activity size={24} className="text-indigo-500" /> 후처리 (Post-Processing) 작업대
                    </h2>
                    <p className="text-xs font-bold text-slate-500 mt-1">무생물 소리를 UTAU 음원으로 원활하게 가공하기 위한 특수 목적 변환기입니다.</p>
                </div>
            </div>

            {/* Target File Selection */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <span className="text-sm font-black text-slate-700 shrink-0">대상 오디오:</span>
                <div className="flex items-center justify-between w-full">
                    <div className="flex-[2] flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {isBatchMode ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSelectedBatchFiles(new Set(files.map(f => f.id)))}
                                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold whitespace-nowrap"
                                >전체 선택</button>
                                <button
                                    onClick={() => setSelectedBatchFiles(new Set())}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-xs font-bold whitespace-nowrap"
                                >선택 해제</button>
                                {files.map(f => (
                                    <label key={f.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer whitespace-nowrap transition-all ${selectedBatchFiles.has(f.id) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'}`}>
                                        <input
                                            type="checkbox"
                                            checked={selectedBatchFiles.has(f.id)}
                                            onChange={(e) => {
                                                const next = new Set(selectedBatchFiles);
                                                if (e.target.checked) next.add(f.id); else next.delete(f.id);
                                                setSelectedBatchFiles(next);
                                            }}
                                            className="accent-indigo-500"
                                        />
                                        <span className="text-xs font-bold truncate max-w-[150px]">{f.name}</span>
                                    </label>
                                ))}
                                {files.length === 0 && <span className="text-xs text-slate-400 py-1.5">보관함이 비어 있습니다.</span>}
                            </div>
                        ) : (
                            <select
                                value={selectedFileId}
                                onChange={e => {
                                    setSelectedFileId(e.target.value);
                                    setDetectedF0(null); // Reset F0 on file change
                                    setF0Curve([]);
                                }}
                                className="w-full max-w-[300px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                            >
                                {files.length === 0 && <option value="" disabled>오디오 파일 없음</option>}
                                {files.map(f => (
                                    <option key={f.id} value={f.id}>{f.name} ({f.buffer.duration.toFixed(2)}s)</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-4 border-l border-slate-200 pl-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-slate-600">
                        <input type="checkbox" checked={isBatchMode} onChange={e => setIsBatchMode(e.target.checked)} className="rounded accent-indigo-500" />
                        다중 파일 (일괄 적용)
                    </label>
                    <button
                        onClick={isPlaying ? stopAudio : playAudio}
                        disabled={!activeFile || isBatchMode}
                        className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 text-white rounded-lg font-black flex items-center gap-2 transition-all active:scale-95 shadow-sm"
                    >
                        <Play size={16} fill="currentColor" /> {isPlaying ? '정지' : '미리보기'}
                    </button>
                </div>
            </div>

            {/* Visualizer */}
            <div className="bg-slate-900 h-40 rounded-2xl border border-slate-700 shadow-inner relative overflow-hidden flex-shrink-0">
                <canvas ref={canvasRef} width={1000} height={160} className="w-full h-full object-cover" />
                {!activeFile && (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-black uppercase tracking-widest bg-slate-900/50 backdrop-blur-sm">작업할 파일을 선택하세요</div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

                {/* 1. Harmonic Exciter */}
                <div className={`bg-white rounded-2xl border ${exciterOn ? 'border-indigo-300 shadow-md ring-2 ring-indigo-50 leading-none' : 'border-slate-200 shadow-sm'} overflow-hidden transition-all flex flex-col`}>
                    <div className={`p-4 border-b flex items-center justify-between ${exciterOn ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center gap-2">
                            <Zap size={18} className={exciterOn ? 'text-indigo-500' : 'text-slate-400'} />
                            <h3 className={`text-sm font-black uppercase tracking-wide ${exciterOn ? 'text-indigo-700' : 'text-slate-600'}`}>1. Harmonic Exciter</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={exciterOn} onChange={() => setExciterOn(!exciterOn)} />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                        </label>
                    </div>
                    <div className="p-5 flex-1 flex flex-col gap-6 opacity-100 transition-opacity" style={{ opacity: exciterOn ? 1 : 0.5 }}>
                        <p className="text-xs font-bold text-slate-500">원본 파형(Modulator)을 지정된 피치의 톱니파(Carrier) 모델에 직접 결합시키는 진폭 변조(AM) 기반 교차 합성을 사용합니다. 원본의 질감을 유지하면서 인간의 성대와 유사한 배음 구조를 풍성하게 더해줍니다.</p>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs font-black">
                                <span className="text-slate-500">Exciter Mix (합성 비율)</span>
                                <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{Math.round(exciterMix * 100)}%</span>
                            </div>
                            <input
                                type="range" min="0" max="1.5" step="0.01" value={exciterMix}
                                onChange={e => setExciterMix(Number(e.target.value))}
                                disabled={!exciterOn}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs font-black">
                                <span className="text-slate-500">Target Root Pitch (목표 배음)</span>
                                <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{exciterPitch.toFixed(1)} Hz</span>
                            </div>
                            <input
                                type="range" min="50" max="600" step="1" value={exciterPitch}
                                onChange={e => setExciterPitch(Number(e.target.value))}
                                disabled={!exciterOn}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 px-1 pt-1">
                                <span>50Hz (저음)</span>
                                <span>C4 (261.6Hz)</span>
                                <span>600Hz (고음)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. ADSR Envelope Shaper */}
                <div className={`bg-white rounded-2xl border ${adsrOn ? 'border-purple-300 shadow-md ring-2 ring-purple-50 leading-none' : 'border-slate-200 shadow-sm'} overflow-hidden transition-all flex flex-col`}>
                    <div className={`p-4 border-b flex items-center justify-between ${adsrOn ? 'bg-purple-50 border-purple-100' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center gap-2">
                            <Waves size={18} className={adsrOn ? 'text-purple-500' : 'text-slate-400'} />
                            <h3 className={`text-sm font-black uppercase tracking-wide ${adsrOn ? 'text-purple-700' : 'text-slate-600'}`}>2. ADSR Envelope</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={adsrOn} onChange={() => setAdsrOn(!adsrOn)} />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                        </label>
                    </div>
                    <div className="p-5 flex-1 flex flex-col gap-6 opacity-100 transition-opacity" style={{ opacity: adsrOn ? 1 : 0.5 }}>
                        <p className="text-xs font-bold text-slate-500">소리의 시작과 끝의 볼륨 형태(ADSR)를 성형하여 뚝 끊어지는 무생물 소리를 부드러운 발음처럼 다듬습니다.</p>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <div className="flex justify-between items-center text-[10px] font-black text-slate-500"><span>Attack (A)</span><span>{attackMs}ms</span></div>
                                <input type="range" min="0" max="500" step="1" value={attackMs} onChange={e => setAttackMs(Number(e.target.value))} disabled={!adsrOn} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none accent-purple-500" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between items-center text-[10px] font-black text-slate-500"><span>Decay (D)</span><span>{decayMs}ms</span></div>
                                <input type="range" min="0" max="1000" step="1" value={decayMs} onChange={e => setDecayMs(Number(e.target.value))} disabled={!adsrOn} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none accent-purple-500" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between items-center text-[10px] font-black text-slate-500"><span>Sustain (S)</span><span>{sustainLevel}%</span></div>
                                <input type="range" min="0" max="100" step="1" value={sustainLevel} onChange={e => setSustainLevel(Number(e.target.value))} disabled={!adsrOn} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none accent-purple-500" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between items-center text-[10px] font-black text-slate-500"><span>Release (R)</span><span>{releaseMs}ms</span></div>
                                <input type="range" min="0" max="2000" step="1" value={releaseMs} onChange={e => setReleaseMs(Number(e.target.value))} disabled={!adsrOn} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none accent-purple-500" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Pitch Tuner */}
                <div className={`bg-white rounded-2xl border ${tuneOn ? 'border-sky-300 shadow-md ring-2 ring-sky-50 leading-none' : 'border-slate-200 shadow-sm'} overflow-hidden transition-all flex flex-col`}>
                    <div className={`p-4 border-b flex items-center justify-between ${tuneOn ? 'bg-sky-50 border-sky-100' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center gap-2">
                            <Volume2 size={18} className={tuneOn ? 'text-sky-500' : 'text-slate-400'} />
                            <h3 className={`text-sm font-black uppercase tracking-wide ${tuneOn ? 'text-sky-700' : 'text-slate-600'}`}>3. Pitch Tuning</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={tuneOn} onChange={() => setTuneOn(!tuneOn)} />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500"></div>
                        </label>
                    </div>
                    <div className="p-5 flex-1 flex flex-col gap-6 opacity-100 transition-opacity" style={{ opacity: tuneOn ? 1 : 0.5 }}>
                        <p className="text-xs font-bold text-slate-500">무생물 소리의 고유 주파수를 파악하고, 지정된 음고(예: C4)로 전체 피치를 변경합니다. (음질 열화를 최소화하기 위해 단순 재생속도만 조절합니다. 발음시 길이가 바뀝니다)</p>

                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={analyzeF0AndCurve}
                                    disabled={!activeFile || !tuneOn || isBatchMode}
                                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 rounded text-xs font-black flex items-center gap-2 transition-all"
                                >
                                    <RefreshCw size={14} /> F0 곡선 분석
                                </button>
                                <div className="flex-1 text-center bg-slate-50 py-2 rounded border border-slate-200 text-sm font-black text-slate-700">
                                    {isBatchMode ? '(일괄 분석)' : (detectedF0 ? `${detectedF0} Hz` : '-- Hz')}
                                </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                <div className="flex justify-between items-center text-xs font-black">
                                    <span className="text-slate-500">Target Pitch (목표 음고)</span>
                                    <span className="text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">{targetPitch.toFixed(1)} Hz</span>
                                </div>
                                <input
                                    type="range" min="50" max="1000" step="1" value={targetPitch}
                                    onChange={e => setTargetPitch(Number(e.target.value))}
                                    disabled={!tuneOn}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
                                />
                                <div className="flex justify-between text-[10px] font-bold text-slate-400 px-1 pt-1">
                                    <span>G2 (98Hz)</span>
                                    <span>C4 (261.6Hz)</span>
                                    <span>B5 (987Hz)</span>
                                </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                <span className="text-xs font-black text-slate-500">품질 모드 설정 (Pitch Shift 방식)</span>
                                <div className="flex flex-col gap-2">
                                    <label className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-all ${pitchShiftMode === 'high_quality' ? 'bg-sky-50 border-sky-200' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
                                        <input type="radio" name="pitchMode" value="high_quality" checked={pitchShiftMode === 'high_quality'} onChange={() => setPitchShiftMode('high_quality')} disabled={!tuneOn} className="mt-0.5 accent-sky-500" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-700">음질 우선 (길이 변동 발생)</span>
                                            <span className="text-[10px] text-slate-500 mt-0.5 leading-tight">빠르고 깔끔하지만 원음 길이에 따라 최종 결과물 재생 길이가 달라집니다.</span>
                                        </div>
                                    </label>
                                    <label className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-all ${pitchShiftMode === 'length_preserve' ? 'bg-sky-50 border-sky-200' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
                                        <input type="radio" name="pitchMode" value="length_preserve" checked={pitchShiftMode === 'length_preserve'} onChange={() => setPitchShiftMode('length_preserve')} disabled={!tuneOn} className="mt-0.5 accent-sky-500" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-700">길이 보존 (OLA 기반)</span>
                                            <span className="text-[10px] text-slate-500 mt-0.5 leading-tight">입력과 출력의 길이가 동일하게 유지되나 위상 진동(Artfact)이 다소 들어갈 수 있습니다.</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Sticky Bottom Actions */}
            <div className="mt-auto pt-6 sticky bottom-0 bg-slate-50/90 backdrop-blur pb-2">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <span className="text-sm font-black text-slate-500">{isBatchMode ? `선택된 ${selectedBatchFiles.size}개 파일 일괄 처리 렌더링` : '적용된 설정으로 새 오디오 렌더링'}</span>
                    <button
                        onClick={handleSave}
                        disabled={isBatchMode ? selectedBatchFiles.size === 0 : !activeFile}
                        className="px-8 py-3 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-xl font-black flex items-center gap-2 transition-all active:scale-95 shadow-md"
                    >
                        <Save size={18} /> 보관함에 결과물 저장
                    </button>
                </div>
            </div>

        </div>
    );
};

export default MiscTab;
