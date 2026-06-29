import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_PORT = 8788;
const MAX_BODY_BYTES = 512 * 1024;

export function createApp({
  apiKey = process.env.LAPHINY_FEEDBACK_API_KEY || '',
  dataDir = process.env.LAPHINY_FEEDBACK_DIR || 'feedback-logs',
} = {}) {
  return async function app(request, response) {
    setCors(response);
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      if (!isAuthorized(request, apiKey)) {
        sendJson(response, 401, { error: 'Unauthorized' });
        return;
      }

      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/v1/health') {
        sendJson(response, 200, { status: 'ok', updatedAt: new Date().toISOString() });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/feedback') {
        const body = await readJson(request);
        const entry = normalizeFeedbackEntry(body);
        await appendFeedbackEntry(dataDir, entry);
        sendJson(response, 200, entry);
        return;
      }

      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function startServer(options = {}) {
  const app = createApp(options);
  const server = createServer(app);
  const port = Number(options.port ?? process.env.LAPHINY_FEEDBACK_PORT ?? DEFAULT_PORT);
  const host = options.host ?? process.env.LAPHINY_FEEDBACK_HOST ?? '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`Laphiny feedback server listening on http://${host}:${port}`);
  });
  return server;
}

function normalizeFeedbackEntry(value) {
  if (!value || typeof value !== 'object') throw new Error('Feedback body must be an object.');
  return {
    id: makeId('feedback'),
    source: typeof value.source === 'string' ? value.source.slice(0, 120) : 'Laphiny',
    appVersion: typeof value.appVersion === 'string' ? value.appVersion.slice(0, 40) : undefined,
    platform: typeof value.platform === 'string' ? value.platform.slice(0, 40) : undefined,
    summary: typeof value.summary === 'string' ? value.summary.slice(0, 500) : undefined,
    diagnostics: value.diagnostics ?? {},
    createdAt: new Date().toISOString(),
  };
}

async function appendFeedbackEntry(dataDir, entry) {
  await mkdir(dataDir, { recursive: true });
  const filePath = path.join(dataDir, 'feedback.jsonl');
  const line = `${JSON.stringify(entry)}\n`;
  const previous = await readFile(filePath, 'utf8').catch(() => '');
  await writeFile(filePath, previous + line, 'utf8');
}

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error('Request body too large.');
  }
  return raw ? JSON.parse(raw) : {};
}

function isAuthorized(request, apiKey) {
  if (!apiKey) return true;
  const header = request.headers.authorization ?? '';
  return header === `Bearer ${apiKey}`;
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
