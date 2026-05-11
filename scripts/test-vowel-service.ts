import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createVowelEngineServer } from '../packages/engine-service/src/index.js';
import type { VowelOnlyRenderRequest } from '../packages/engine-core/src/index.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

async function closeServer(server: ReturnType<typeof createVowelEngineServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function main(): Promise<void> {
  const raw = await readFile('examples/vowel-note.json', 'utf8');
  const request = JSON.parse(raw) as VowelOnlyRenderRequest;
  const server = createVowelEngineServer();

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert(health.ok, 'health endpoint should return 200');
    const healthBody = await health.json() as { ok?: boolean; service?: string };
    assert(healthBody.ok === true, 'health endpoint should report ok');
    assert(healthBody.service === 'otonashi-vowel-engine', 'health endpoint should identify service');

    const plan = await fetch(`${baseUrl}/v1/plan/vowel-only`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    assert(plan.ok, 'plan endpoint should return 200');
    const planBody = await plan.json() as { ok?: boolean; plan?: { frames?: unknown[] } };
    assert(planBody.ok === true, 'plan endpoint should report ok');
    assert(Array.isArray(planBody.plan?.frames), 'plan endpoint should include frames');
    assert(planBody.plan?.frames?.length === 4, 'plan endpoint should return four frames for example');

    const render = await fetch(`${baseUrl}/v1/render/vowel-only`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    assert(render.ok, 'render endpoint should return 200');
    assert(render.headers.get('content-type')?.startsWith('audio/wav'), 'render endpoint should return audio/wav');
    assert(render.headers.get('x-otonashi-frame-count') === '4', 'render endpoint should expose frame count');

    const wav = new Uint8Array(await render.arrayBuffer());
    assert(readAscii(wav, 0, 4) === 'RIFF', 'render endpoint should return RIFF WAV');
    assert(readAscii(wav, 8, 4) === 'WAVE', 'render endpoint should return WAVE marker');
    assert(wav.byteLength > 44, 'render endpoint should return audio data');

    await mkdir('out', { recursive: true });
    const output = resolve('out', 'vowel-service.wav');
    await writeFile(output, wav);

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      output,
      wavBytes: wav.byteLength,
      frameCount: render.headers.get('x-otonashi-frame-count'),
      durationSec: render.headers.get('x-otonashi-duration-sec'),
      peak: render.headers.get('x-otonashi-peak'),
      rms: render.headers.get('x-otonashi-rms'),
    }, null, 2));
  } finally {
    await closeServer(server);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
