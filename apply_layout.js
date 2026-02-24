const fs = require('fs');
const filePath = 'components/StudioTab.tsx';
const src = fs.readFileSync(filePath, 'utf8');
const lines = src.split(/\r?\n/);

// Keep lines 1-554 (0-indexed: 0-553), which contain everything up to the toolbar section
// Then replace lines 555 (0-indexed) onward with the new layout
const keepLines = lines.slice(0, 555); // lines 1-555 (before the layout)

const newSection = `
                <div className="flex flex-col gap-4">
                    {/* Top row: Waveform (left) + Effects sidebar (right) */}
                    <div className="flex gap-4 items-stretch">
                        {/* Waveform canvas */}
                        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-700 shadow-inner overflow-hidden select-none h-[400px] relative">
                            <canvas ref={canvasRef} width={1200} height={400} className="w-full h-full object-cover cursor-crosshair"
                                onMouseDown={(e) => {
                                    const rect = canvasRef.current!.getBoundingClientRect();
                                    const xPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                    setPlayheadPos(xPct * 100);
                                    pauseOffsetRef.current = xPct * (activeBuffer?.duration || 0);
                                    const startX = xPct;
                                    setEditTrim({ start: startX, end: startX });
                                    const move = (me: MouseEvent) => {
                                        const curRect = canvasRef.current?.getBoundingClientRect();
                                        if (!curRect) return;
                                        const curX = Math.max(0, Math.min(1, (me.clientX - curRect.left) / curRect.width));
                                        setEditTrim({ start: Math.min(startX, curX), end: Math.max(startX, curX) });
                                    };
                                    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                                    window.addEventListener('mousemove', move);
                                    window.addEventListener('mouseup', up);
                                }}
                            />
                            <div className="absolute top-0 bottom-0 bg-white/10 border-x border-white/30 pointer-events-none" style={{ left: \`\${editTrim.start * 100}%\`, width: \`\${(editTrim.end - editTrim.start) * 100}%\` }} />
                            <div className="absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 transition-colors" style={{ left: \`calc(\${editTrim.start * 100}% - 4px)\` }} onMouseDown={(e) => { e.stopPropagation(); const startX = e.clientX; const initVal = editTrim.start; const rect = canvasRef.current!.getBoundingClientRect(); const move = (me: MouseEvent) => { const diff = (me.clientX - startX) / rect.width; setEditTrim(prev => ({ ...prev, start: Math.max(0, Math.min(prev.end, initVal + diff)) })); }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                            <div className="absolute top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 transition-colors" style={{ left: \`calc(\${editTrim.end * 100}% - 4px)\` }} onMouseDown={(e) => { e.stopPropagation(); const startX = e.clientX; const initVal = editTrim.end; const rect = canvasRef.current!.getBoundingClientRect(); const move = (me: MouseEvent) => { const diff = (me.clientX - startX) / rect.width; setEditTrim(prev => ({ ...prev, end: Math.min(1, Math.max(prev.start, initVal + diff)) })); }; const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }} />
                            {!activeBuffer && (
                                <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-black uppercase tracking-widest bg-slate-900/50 backdrop-blur-sm">\uC791\uC5C5\uD560 \uD30C\uC77C\uC744 \uBCF4\uAD00\uD568\uC5D0\uC11C \uC120\uD0DD\uD558\uC138\uC694</div>
                            )}
                            {clipboard && (
                                <div className="absolute top-4 right-4 bg-indigo-500/90 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg border border-white/20 backdrop-blur pointer-events-none animate-in fade-in slide-in-from-top-2">
                                    \uD83D\uDCCB \uD074\uB9BD\uBCF4\uB4DC\uC5D0 \uC624\uB514\uC624 \uC788\uC74C ({clipboard.duration.toFixed(2)}s)
                                </div>
                            )}
                        </div>

                        {/* Effects / Formant sidebar */}
                        <div className="w-[380px] shrink-0 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-sm h-[400px]">
                            <div className="flex border-b border-slate-200 bg-slate-50/50">
                                {[
                                    { id: 'effects', label: 'Effects' },
                                    { id: 'formant', label: 'Formant' }
                                ].map((tab) => (
                                    <button key={tab.id} onClick={() => setSideTab(tab.id as any)} className={\`flex-1 py-3 text-[10px] font-black uppercase tracking-tight transition-all \${sideTab === tab.id ? 'bg-white text-slate-900 border-b-2 border-indigo-500 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}\`}>{tab.label}</button>
                                ))}
                            </div>
                            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-4">
                                {sideTab === 'effects' && (
                                    <div className="space-y-4">
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Sparkles size={12} /> Reverb & Delay</h3>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEnableDelay(!enableDelay)} className={\`text-[9px] px-2 py-0.5 rounded border font-black \${enableDelay ? 'bg-indigo-500 text-white border-indigo-600' : 'bg-white text-slate-400'}\`}>DLY</button>
                                                    <button onClick={() => setEnableReverb(!enableReverb)} className={\`text-[9px] px-2 py-0.5 rounded border font-black \${enableReverb ? 'bg-indigo-500 text-white border-indigo-600' : 'bg-white text-slate-400'}\`}>REV</button>
                                                </div>
                                            </div>
                                            {enableDelay && (
                                                <>
                                                    <RangeControl label="Delay Time" value={delayTime} min={0} max={1} step={0.05} onChange={setDelayTime} unit="s" />
                                                    <RangeControl label="Feedback" value={delayFeedback} min={0} max={0.9} step={0.05} onChange={setDelayFeedback} unit="" />
                                                </>
                                            )}
                                            {enableReverb && (
                                                <RangeControl label="Reverb Mix" value={reverbMix} min={0} max={1} step={0.05} onChange={setReverbMix} unit="" />
                                            )}
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity size={12} /> Compressor</h3>
                                            <RangeControl label="Threshold" value={compThresh} min={-60} max={0} step={1} onChange={setCompThresh} unit="dB" />
                                            <RangeControl label="Ratio" value={compRatio} min={1} max={20} step={0.5} onChange={setCompRatio} unit=":1" />
                                        </div>
                                    </div>
                                )}
                                {sideTab === 'formant' && (
                                    <div className="space-y-3">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><AudioLines size={12} /> Formant</h3>
                                        <RangeControl label="F1 (Throat)" value={formant.f1} min={200} max={1200} step={10} onChange={v => setFormant({ ...formant, f1: v })} unit="Hz" />
                                        <RangeControl label="F2 (Mouth)" value={formant.f2} min={500} max={3000} step={10} onChange={v => setFormant({ ...formant, f2: v })} unit="Hz" />
                                        <RangeControl label="F3 (Front)" value={formant.f3} min={1500} max={4000} step={10} onChange={v => setFormant({ ...formant, f3: v })} unit="Hz" />
                                        <RangeControl label="F4 (Detail)" value={formant.f4} min={2500} max={5000} step={10} onChange={v => setFormant({ ...formant, f4: v })} unit="Hz" />
                                        <RangeControl label="Resonance (Q)" value={formant.resonance} min={0.1} max={10} step={0.1} onChange={v => setFormant({ ...formant, resonance: v })} unit="" />
                                        {/* Singer's Formant */}
                                        <div className={\`p-3 rounded-xl border space-y-3 transition-all \${singersFormantEnabled ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}\`}>
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                                    <Sparkles size={11} className={singersFormantEnabled ? 'text-amber-500' : 'text-slate-400'} />
                                                    <span className={singersFormantEnabled ? 'text-amber-700' : 'text-slate-400'}>Singer's Formant</span>
                                                </h3>
                                                <button onClick={() => setSingersFormantEnabled(!singersFormantEnabled)} className={\`relative inline-flex h-4 w-7 items-center rounded-full transition-colors \${singersFormantEnabled ? 'bg-amber-500' : 'bg-slate-300'}\`}>
                                                    <span className={\`inline-block h-3 w-3 transform rounded-full bg-white transition-transform \${singersFormantEnabled ? 'translate-x-3.5' : 'translate-x-0.5'}\`} />
                                                </button>
                                            </div>
                                            {singersFormantEnabled && (
                                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                                                    <p className="text-[9px] text-amber-700/70 font-bold leading-tight">2.5~4kHz \uB300\uC5ED\uC744 \uBD80\uC2A4\uD2B8\uD558\uC5EC \uC131\uC545\uC801 \uC874\uC7AC\uAC10\uC744 \uAC15\uD654\uD569\uB2C8\uB2E4.</p>
                                                    <RangeControl label="Center Freq" value={singersFormantFreq} min={2500} max={4000} step={50} onChange={setSingersFormantFreq} unit="Hz" />
                                                    <RangeControl label="Boost Gain" value={singersFormantGain} min={0} max={20} step={0.5} onChange={setSingersFormantGain} unit="dB" />
                                                    <RangeControl label="Q (Bandwidth)" value={singersFormantQ} min={0.5} max={10} step={0.5} onChange={setSingersFormantQ} unit="" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-3 border-t border-slate-200 bg-slate-50/50 shrink-0 space-y-2">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity size={14} /> Master Output</h3>
                                <div className="flex items-center gap-3">
                                    <div className="flex gap-1.5">
                                        <button onClick={() => setNormalizationEnabled(!normalizationEnabled)} className={\`py-1.5 px-2.5 rounded-lg border flex items-center gap-1.5 text-[10px] font-black transition-all \${normalizationEnabled ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-white text-slate-500 border-slate-200'}\`} title="\uD53C\uD06C \uB178\uBA40\uB77C\uC774\uC81C\uC774\uC158">
                                            <Activity size={11} className={normalizationEnabled ? 'text-indigo-200' : ''} /> Norm
                                        </button>
                                        <button onClick={() => setBypassEffects(!bypassEffects)} className={\`py-1.5 px-2.5 rounded-lg border flex items-center gap-1.5 text-[10px] font-black transition-all \${bypassEffects ? 'bg-amber-500 text-white border-amber-400' : 'bg-white text-slate-400 border-slate-200'}\`} title="\uD6A8\uACFC \uC77C\uC2DC \uD574\uC81C">
                                            <Power size={11} className={bypassEffects ? 'animate-pulse' : ''} /> Bypass
                                        </button>
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                                            <span>Gain</span>
                                            <span className="text-indigo-600">{(masterGain * 100).toFixed(0)}%</span>
                                        </div>
                                        <input type="range" min="0" max="2" step="0.01" value={masterGain} onChange={e => setMasterGain(Number(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none accent-indigo-500" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom row: EQ graph spanning full width */}
                    <div className="bg-slate-900 rounded-2xl border border-slate-700 relative flex flex-col shadow-inner h-[300px] overflow-hidden">
                        <ParametricEQ bands={eqBands} onChange={setEqBands} audioContext={audioContext} playingSource={sourceRef.current} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudioTab;
`;

const result = keepLines.join('\r\n') + '\r\n' + newSection.trim() + '\r\n';
fs.writeFileSync(filePath, result, 'utf8');
console.log('Done. Total lines:', result.split('\r\n').length);
