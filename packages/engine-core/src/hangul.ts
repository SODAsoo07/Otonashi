const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const JUNG_COUNT = 21;
const JONG_COUNT = 28;

export const choList = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const;

export const jungList = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ',
] as const;

export const jongList = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ',
  'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const;

const vowelApproximation: Record<string, string> = {
  'ㅏ': 'ㅏ',
  'ㅐ': 'ㅐ',
  'ㅑ': 'ㅏ',
  'ㅒ': 'ㅐ',
  'ㅓ': 'ㅓ',
  'ㅔ': 'ㅔ',
  'ㅕ': 'ㅓ',
  'ㅖ': 'ㅔ',
  'ㅗ': 'ㅗ',
  'ㅘ': 'ㅏ',
  'ㅙ': 'ㅐ',
  'ㅚ': 'ㅚ',
  'ㅛ': 'ㅗ',
  'ㅜ': 'ㅜ',
  'ㅝ': 'ㅓ',
  'ㅞ': 'ㅔ',
  'ㅟ': 'ㅟ',
  'ㅠ': 'ㅜ',
  'ㅡ': 'ㅡ',
  'ㅢ': 'ㅡ',
  'ㅣ': 'ㅣ',
};

export interface HangulSyllable {
  cho: string;
  jung: string;
  jong: string | null;
}

export function decomposeHangul(char: string): HangulSyllable | null {
  if (!char) return null;
  const code = char.codePointAt(0);
  if (code === undefined || code < HANGUL_BASE || code > HANGUL_END) return null;

  const offset = code - HANGUL_BASE;
  const choIdx = Math.floor(offset / (JUNG_COUNT * JONG_COUNT));
  const jungIdx = Math.floor((offset % (JUNG_COUNT * JONG_COUNT)) / JONG_COUNT);
  const jongIdx = offset % JONG_COUNT;

  return {
    cho: choList[choIdx],
    jung: jungList[jungIdx],
    jong: jongIdx > 0 ? jongList[jongIdx] : null,
  };
}

export function approximateVowel(vowel: string): string {
  return vowelApproximation[vowel] ?? 'ㅏ';
}

export function extractVowelFromLyric(lyric: string): string {
  const trimmed = lyric.trim();
  if (!trimmed) return 'ㅏ';

  if (trimmed in vowelApproximation) {
    return approximateVowel(trimmed);
  }

  for (const char of trimmed) {
    const decomposed = decomposeHangul(char);
    if (decomposed) return approximateVowel(decomposed.jung);
  }

  return 'ㅏ';
}
