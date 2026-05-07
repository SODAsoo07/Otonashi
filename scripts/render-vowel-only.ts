import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { renderVowelOnlyToWav } from '../packages/engine-renderer/src/index.js';
import type { VowelOnlyRenderRequest } from '../packages/engine-core/src/index.js';

interface CliArgs {
  input?: string;
  output?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') {
      args.input = argv[i + 1];
      i += 1;
    } else if (arg === '--output' || arg === '-o') {
      args.output = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    throw new Error('usage: npm run otonashi:render -- --input examples\\vowel-note.json --output out\\vowel-test.wav');
  }

  const inputPath = resolve(args.input);
  const outputPath = resolve(args.output);
  const raw = await readFile(inputPath, 'utf8');
  const request = JSON.parse(raw) as VowelOnlyRenderRequest;
  const { wav, result } = renderVowelOnlyToWav(request);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, wav);

  const d = result.diagnostics;
  console.log(JSON.stringify({
    output: outputPath,
    frames: d.frameCount,
    durationSec: Number(d.durationSec.toFixed(4)),
    sampleRate: result.pcm.sampleRate,
    peak: Number(d.peak.toFixed(6)),
    rms: Number(d.rms.toFixed(6)),
    limiterGainDb: Number(d.limiterGainDb.toFixed(3)),
    vowels: result.frames.map(frame => `${frame.lyric}:${frame.vowel}@${frame.pitchHz.toFixed(2)}Hz`),
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
