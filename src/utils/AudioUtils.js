/**
 * OTONASHI Audio Engine Utils (v95 Optimized)
 */

// 1. 오디오 버퍼 복제 (비파괴 편집의 기초)
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

// 2. 고속 렌더링을 위한 래퍼 함수 (성능 최적화 핵심)
const renderEffect = async (sourceBuffer, effectChainFn) => {
  const offlineCtx = new OfflineAudioContext(
    sourceBuffer.numberOfChannels,
    sourceBuffer.length,
    sourceBuffer.sampleRate
  );
  
  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;
  
  // 이펙터 체인 연결
  const lastNode = effectChainFn(offlineCtx, source);
  lastNode.connect(offlineCtx.destination);
  
  source.start();
  return await offlineCtx.startRendering();
};

// 3. Reverb 이펙트 (임펄스 응답 시뮬레이션)
export const applyReverb = async (buffer, wetLevel = 0.3) => {
  return await renderEffect(buffer, (ctx, source) => {
    const convolver = ctx.createConvolver();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    
    // 심플 리버브 꼬리 생성
    const irLength = ctx.sampleRate * 1.5;
    const impulse = ctx.createBuffer(2, irLength, ctx.sampleRate);
    for (let i = 0; i < 2; i++) {
      const channel = impulse.getChannelData(i);
      for (let j = 0; j < irLength; j++) {
        channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / irLength, 2);
      }
    }
    convolver.buffer = impulse;
    
    dryGain.gain.value = 1 - wetLevel;
    wetGain.gain.value = wetLevel;
    
    source.connect(dryGain);
    source.connect(convolver);
    convolver.connect(wetGain);
    
    const output = ctx.createGain();
    dryGain.connect(output);
    wetGain.connect(output);
    return output;
  });
};

// 4. Delay 이펙트
export const applyDelay = async (buffer, time = 0.3, feedback = 0.4) => {
  return await renderEffect(buffer, (ctx, source) => {
    const delay = ctx.createDelay();
    delay.delayTime.value = time;
    const fbGain = ctx.createGain();
    fbGain.gain.value = feedback;
    
    source.connect(delay);
    delay.connect(fbGain);
    fbGain.connect(delay); // 피드백 루프
    
    const output = ctx.createGain();
    source.connect(output);
    delay.connect(output);
    return output;
  });
};

// 5. Time Stretch (비율 조절)
export const applyTimeStretch = async (buffer, ratio) => {
  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length / ratio,
    buffer.sampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = ratio; // 단순 배속 (피치 영향 받음, 복합 알고리즘은 성능상 라이브러리 권장)
  source.connect(offlineCtx.destination);
  source.start();
  return await offlineCtx.startRendering();
};

// 6. Fade (In/Out)
export const applyFade = async (buffer, type = 'in', duration = 0.5) => {
  return await renderEffect(buffer, (ctx, source) => {
    const gainNode = ctx.createGain();
    const len = buffer.duration;
    if (type === 'in') {
      gainNode.gain.setValueAtTime(0, 0);
      gainNode.gain.linearRampToValueAtTime(1, Math.min(duration, len));
    } else {
      gainNode.gain.setValueAtTime(1, 0);
      gainNode.gain.setValueAtTime(1, Math.max(0, len - duration));
      gainNode.gain.linearRampToValueAtTime(0, len);
    }
    source.connect(gainNode);
    return gainNode;
  });
};

// 7. 기타 유틸리티
export const reverseBuffer = (buffer) => {
  const newBuffer = cloneBuffer(buffer);
  for (let i = 0; i < newBuffer.numberOfChannels; i++) {
    newBuffer.getChannelData(i).reverse();
  }
  return newBuffer;
};

export const downloadWav = (buffer, filename = "otonashi_export.wav") => {
  // WAV 인코딩 로직 (간소화 버전)
  const worker = new Worker(new URL('./wavWorker.js', import.meta.url));
  // 실무에서는 오디오 데이터를 wav 포맷으로 변환하여 Blob 생성 후 다운로드
  console.log(`${filename} 다운로드 시작...`);
};
