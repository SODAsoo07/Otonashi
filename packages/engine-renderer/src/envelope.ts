export function envelopeAt(
  localSample: number,
  durationSamples: number,
  attackSamples: number,
  releaseSamples: number,
): number {
  const safeDuration = Math.max(1, durationSamples);
  const safeAttack = Math.max(0, Math.min(attackSamples, Math.floor(safeDuration * 0.45)));
  const safeRelease = Math.max(0, Math.min(releaseSamples, Math.floor(safeDuration * 0.45)));

  let value = 1;
  if (safeAttack > 0 && localSample < safeAttack) {
    value = localSample / safeAttack;
  }

  const releaseStart = safeDuration - safeRelease;
  if (safeRelease > 0 && localSample >= releaseStart) {
    const releaseT = (safeDuration - localSample) / safeRelease;
    value = Math.min(value, Math.max(0, releaseT));
  }

  return Math.max(0, Math.min(1, value));
}
