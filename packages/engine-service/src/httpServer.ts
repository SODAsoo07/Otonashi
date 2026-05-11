import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { planVowelOnly, type VowelOnlyRenderRequest } from '../../engine-core/src/index.js';
import { renderVowelOnlyToWav } from '../../engine-renderer/src/index.js';

export interface VowelEngineServerOptions {
  maxBodyBytes?: number;
}

export interface ErrorBody {
  ok: false;
  error: string;
}

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const SERVICE_VERSION = 'vowel-only-0.1';

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body, null, 2), 'utf8');
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.byteLength,
  });
  response.end(payload);
}

function sendError(response: ServerResponse, statusCode: number, message: string): void {
  sendJson(response, statusCode, {
    ok: false,
    error: message,
  } satisfies ErrorBody);
}

async function readBody(request: IncomingMessage, maxBodyBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBodyBytes) {
      throw new Error(`request body exceeds ${maxBodyBytes} bytes`);
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

async function readJsonRequest(request: IncomingMessage, maxBodyBytes: number): Promise<VowelOnlyRenderRequest> {
  const body = await readBody(request, maxBodyBytes);
  if (body.byteLength === 0) {
    throw new Error('request body is empty');
  }
  return JSON.parse(body.toString('utf8')) as VowelOnlyRenderRequest;
}

function routePath(request: IncomingMessage): string {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  return url.pathname.replace(/\/+$/, '') || '/';
}

export function createVowelEngineServer(options: VowelEngineServerOptions = {}): Server {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return createServer(async (request, response) => {
    const path = routePath(request);
    const method = request.method ?? 'GET';

    try {
      if (method === 'OPTIONS') {
        response.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        response.end();
        return;
      }

      if (method === 'GET' && path === '/health') {
        sendJson(response, 200, {
          ok: true,
          service: 'otonashi-vowel-engine',
          version: SERVICE_VERSION,
        });
        return;
      }

      if (method === 'POST' && path === '/v1/plan/vowel-only') {
        const requestBody = await readJsonRequest(request, maxBodyBytes);
        const plan = planVowelOnly(requestBody);
        sendJson(response, 200, {
          ok: true,
          schemaVersion: SERVICE_VERSION,
          plan,
        });
        return;
      }

      if (method === 'POST' && path === '/v1/render/vowel-only') {
        const requestBody = await readJsonRequest(request, maxBodyBytes);
        const { wav, result } = renderVowelOnlyToWav(requestBody);
        response.writeHead(200, {
          'content-type': 'audio/wav',
          'content-length': wav.byteLength,
          'x-otonashi-frame-count': String(result.diagnostics.frameCount),
          'x-otonashi-duration-sec': result.diagnostics.durationSec.toFixed(6),
          'x-otonashi-peak': result.diagnostics.peak.toFixed(6),
          'x-otonashi-rms': result.diagnostics.rms.toFixed(6),
          'x-otonashi-limiter-gain-db': result.diagnostics.limiterGainDb.toFixed(3),
        });
        response.end(wav);
        return;
      }

      sendError(response, 404, `unsupported route: ${method} ${path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(response, 400, message);
    }
  });
}
