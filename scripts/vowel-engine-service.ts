import { createVowelEngineServer } from '../packages/engine-service/src/index.js';

interface CliArgs {
  host: string;
  port: number;
}

function parseArgs(argv: string[]): CliArgs {
  let host = process.env.OTONASHI_ENGINE_HOST || '127.0.0.1';
  let port = Number(process.env.OTONASHI_ENGINE_PORT || 38240);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--host') {
      host = argv[i + 1] || host;
      i += 1;
    } else if (arg === '--port' || arg === '-p') {
      const parsed = Number(argv[i + 1]);
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) port = parsed;
      i += 1;
    }
  }

  return { host, port };
}

const args = parseArgs(process.argv.slice(2));
const server = createVowelEngineServer();

server.listen(args.port, args.host, () => {
  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : args.port;
  console.log(JSON.stringify({
    ok: true,
    service: 'otonashi-vowel-engine',
    health: `http://${args.host}:${resolvedPort}/health`,
    render: `http://${args.host}:${resolvedPort}/v1/render/vowel-only`,
    plan: `http://${args.host}:${resolvedPort}/v1/plan/vowel-only`,
  }, null, 2));
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
