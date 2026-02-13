/**
 * OTONASHI Audio Engine Utils
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

// 빌드 에러 해결: reverseBuffer 추가
export const reverseBuffer = (buffer) => {
  const newBuffer = cloneBuffer(buffer);
  for (let i = 0; i < newBuffer.numberOfChannels; i++) {
    newBuffer.getChannelData(i).reverse();
  }
  return newBuffer;
};

// 빌드 에러 해결: concatBuffers 추가 (SimulatorTab에서 사용)
export const concatBuffers = (buffer1, buffer2, audioCtx) => {
  if (!buffer1) return buffer2;
  if (!buffer2) return buffer1;
  
  const numberOfChannels = Math.max(buffer1.numberOfChannels, buffer2.numberOfChannels);
  const tmpCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const newBuffer = tmpCtx.createBuffer(
    numberOfChannels,
    buffer1.length + buffer2.length,
    buffer1.sampleRate
  );

  for (let i = 0; i < numberOfChannels; i++) {
    const channelData = newBuffer.getChannelData(i);
    if (i < buffer1.numberOfChannels) channelData.set(buffer1.getChannelData(i), 0);
    if (i < buffer2.numberOfChannels) channelData.set(buffer2.getChannelData(i), buffer1.length);
  }
  return newBuffer;
};

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

export const downloadWav = (buffer, filename = "otonashi_export.wav") => {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length * numChannels;
  const result = new Float32Array(length);
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    const channelData = buffer.getChannelData(i);
    for (let j = 0; j < buffer.length; j++) result[j * numChannels + i] = channelData[j];
  }
  const worker = new Worker(new URL('./wavWorker.js', import.meta.url), { type: 'module' });
  worker.postMessage({ bufferData: result, numChannels, sampleRate: buffer.sampleRate }, [result.buffer]);
  worker.onmessage = (e) => {
    const blob = new Blob([e.data], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url); worker.terminate();
  };
};
