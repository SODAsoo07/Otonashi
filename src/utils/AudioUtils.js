/**
 * OTONASHI Audio Engine Utils (v95 Optimized)
 */

export const cloneBuffer = (audioBuffer) => {
  const newBuffer = new AudioBuffer({
    length: audioBuffer.length,
    numberOfChannels: audioBuffer.numberOfChannels,
    sampleRate: audioBuffer.sampleRate,
  });
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    newBuffer.copyToChannel(audioBuffer.getChannelData(i), i);
  }
  return newBuffer;
};

// 고속 렌더링 헬퍼
const renderEffect = async (sourceBuffer, effectChainFn) => {
  const offlineCtx = new OfflineAudioContext(
    sourceBuffer.numberOfChannels,
    sourceBuffer.length,
    sourceBuffer.sampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;
  const lastNode = effectChainFn(offlineCtx, source);
  lastNode.connect(offlineCtx.destination);
  source.start();
  return await offlineCtx.startRendering();
};

export const applyReverb = async (buffer, wetLevel = 0.3) => {
  return await renderEffect(buffer, (ctx, source) => {
    const convolver = ctx.createConvolver();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const irLen = ctx.sampleRate * 1.5;
    const impulse = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let i = 0; i < 2; i++) {
      const ch = impulse.getChannelData(i);
      for (let j = 0; j < irLen; j++) ch[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / irLen, 2);
    }
    convolver.buffer = impulse;
    dry.gain.value = 1 - wetLevel;
    wet.gain.value = wetLevel;
    source.connect(dry);
    source.connect(convolver);
    convolver.connect(wet);
    const out = ctx.createGain();
    dry.connect(out);
    wet.connect(out);
    return out;
  });
};

export const applyDelay = async (buffer, time = 0.3, feedback = 0.4) => {
  return await renderEffect(buffer, (ctx, source) => {
    const delay = ctx.createDelay();
    delay.delayTime.value = time;
    const fb = ctx.createGain();
    fb.gain.value = feedback;
    source.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    const out = ctx.createGain();
    source.connect(out);
    delay.connect(out);
    return out;
  });
};

// WAV 다운로드 (Worker 활용)
export const downloadWav = (buffer, filename = "otonashi_export.wav") => {
  // 복수 채널 데이터를 단일 평면 배열로 병합 (Interleaved PCM)
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length * numChannels;
  const result = new Float32Array(length);
  
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    const channelData = buffer.getChannelData(i);
    for (let j = 0; j < buffer.length; j++) {
      result[j * numChannels + i] = channelData[j];
    }
  }

  // Vite 전용 워커 로드 방식
  const worker = new Worker(new URL('./wavWorker.js', import.meta.url), { type: 'module' });
  
  worker.postMessage({
    bufferData: result,
    numChannels: numChannels,
    sampleRate: buffer.sampleRate
  }, [result.buffer]);

  worker.onmessage = (e) => {
    const blob = new Blob([e.data], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    worker.terminate();
  };
};
