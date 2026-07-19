import { AgentReplyBinding, CreatedAgentReplyBinding, ProactiveAgentMessagePage, SquareEvent, SyncConfig, SyncSnapshot } from '../types';
import { getRuntimeFetch } from './runtime_fetch';

const SNAPSHOT_TRANSFER_PROTOCOL = 'laphiny.snapshot-transfer.v1';
const LEGACY_SNAPSHOT_MAX_BYTES = 192 * 1024;
const DEFAULT_TRANSFER_PART_BYTES = 128 * 1024;
const MAX_TRANSFER_ATTEMPTS = 3;

interface SyncHealth {
  status: string;
  updatedAt?: string;
  syncRevision?: number;
  capabilities?: {
    snapshotTransfers?: {
      protocol?: string;
      maxPartBytes?: number;
      maxTransferBytes?: number;
      maxParts?: number;
      ttlMs?: number;
    };
  };
}

interface SnapshotTransferStatus {
  protocol: string;
  transferId: string;
  state: 'uploading' | 'committed';
  sha256: string;
  totalBytes: number;
  totalParts: number;
  receivedBytes: number;
  receivedParts: number[];
  baseRevision: number;
  committedRevision?: number;
  expiresAt: string;
  updatedAt: string;
}

class SyncHttpError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
    this.name = 'SyncHttpError';
  }
}

export class LaphinySyncClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(config: Pick<SyncConfig, 'baseUrl' | 'apiKey'>, fetchImpl?: typeof globalThis.fetch) {
    this.baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
    this.apiKey = config.apiKey.trim();
    this.fetchImpl = fetchImpl ?? getRuntimeFetch();
  }

  async health(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<SyncHealth> {
    return this.request('/v1/health', { method: 'GET', timeoutMs: options?.timeoutMs, signal: options?.signal });
  }

  async pullSnapshot(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<SyncSnapshot> {
    return this.request('/v1/snapshot', { method: 'GET', timeoutMs: options?.timeoutMs, signal: options?.signal });
  }

  async pushSnapshot(snapshot: SyncSnapshot, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<SyncSnapshot> {
    const payload = JSON.stringify(snapshot);
    const totalBytes = utf8Bytes(payload).length;
    if (totalBytes <= LEGACY_SNAPSHOT_MAX_BYTES) {
      return this.pushLegacySnapshot(payload, options);
    }

    const health = await this.health(options);
    const capability = health.capabilities?.snapshotTransfers;
    if (capability?.protocol === SNAPSHOT_TRANSFER_PROTOCOL) {
      return this.pushSnapshotTransfer(snapshot, payload, totalBytes, health.syncRevision ?? 0, capability, options);
    }
    return this.pushLegacySnapshot(payload, options);
  }

  async listEvents(options?: { since?: string; timeoutMs?: number; signal?: AbortSignal }): Promise<SquareEvent[]> {
    const query = options?.since ? `?since=${encodeURIComponent(options.since)}` : '';
    return this.request(`/v1/events${query}`, { method: 'GET', timeoutMs: options?.timeoutMs, signal: options?.signal });
  }

  async appendEvent(event: SquareEvent, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<SquareEvent> {
    return this.request('/v1/events', {
      method: 'POST',
      body: JSON.stringify(event),
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  async listAgentMessages(options?: { after?: number; limit?: number; timeoutMs?: number; signal?: AbortSignal }): Promise<ProactiveAgentMessagePage> {
    const query = new URLSearchParams();
    if (options?.after != null) query.set('after', String(options.after));
    if (options?.limit != null) query.set('limit', String(options.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/v1/agent/messages${suffix}`, {
      method: 'GET',
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  async acknowledgeAgentMessages(deviceId: string, lastSequence: number, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<{ deviceId: string; lastSequence: number; updatedAt?: string }> {
    return this.request('/v1/agent/acks', {
      method: 'POST',
      body: JSON.stringify({ deviceId, lastSequence }),
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  async *streamAgentMessages(options?: { after?: number; connectTimeoutMs?: number; signal?: AbortSignal }): AsyncGenerator<import('../types').ProactiveAgentMessageEvent, void, undefined> {
    if (!this.baseUrl) throw new Error('Sync backend URL is empty');
    const query = options?.after != null ? `?after=${encodeURIComponent(String(options.after))}` : '';
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (options?.signal?.aborted) controller.abort();
    else options?.signal?.addEventListener('abort', onAbort, { once: true });
    const timeoutId = options?.connectTimeoutMs
      ? setTimeout(() => controller.abort(), options.connectTimeoutMs)
      : null;

    let response: Response;
    try {
      const headers: Record<string, string> = { accept: 'text/event-stream' };
      if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
      response = await this.fetchImpl(`${this.baseUrl}/v1/agent/stream${query}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      options?.signal?.removeEventListener('abort', onAbort);
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!response.ok) {
      options?.signal?.removeEventListener('abort', onAbort);
      throw new Error(`HTTP ${response.status}: ${await response.text() || response.statusText}`);
    }
    if (!response.body?.getReader) {
      options?.signal?.removeEventListener('abort', onAbort);
      throw new Error('Sync backend did not return a readable Agent event stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let ended = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          ended = true;
          break;
        }
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/gu, '\n');
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const event = parseProactiveMessageSseFrame(frame);
          if (event) yield event;
        }
      }
    } finally {
      if (!ended && !controller.signal.aborted) {
        try { await reader.cancel(); } catch { /* stream already closed */ }
      }
      options?.signal?.removeEventListener('abort', onAbort);
    }
  }

  async listAgentBindings(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<{ bindings: AgentReplyBinding[] }> {
    return this.request('/v1/agent-bindings', {
      method: 'GET',
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  async createAgentBinding(input: { roomId: string; connectionId: string; authorName?: string; expiresAt?: string }, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<CreatedAgentReplyBinding> {
    return this.request('/v1/agent-bindings', {
      method: 'POST',
      body: JSON.stringify(input),
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  async revokeAgentBinding(bindingId: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<AgentReplyBinding> {
    return this.request(`/v1/agent-bindings/${encodeURIComponent(bindingId)}`, {
      method: 'DELETE',
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: string;
      contentType?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('Sync backend URL is empty');
    }

    const controller = new AbortController();
    const timeoutId = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : null;
    const releaseAbort = options.signal
      ? (() => {
          const onAbort = () => controller.abort();
          if (options.signal!.aborted) controller.abort();
          else options.signal!.addEventListener('abort', onAbort, { once: true });
          return () => options.signal!.removeEventListener('abort', onAbort);
        })()
      : null;

    const headers: Record<string, string> = {};
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    if (options.body !== undefined) headers['content-type'] = options.contentType ?? 'application/json';

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method,
        headers,
        body: options.body,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        let code: string | undefined;
        let message = text || response.statusText;
        try {
          const errorBody = JSON.parse(text) as { error?: unknown; message?: unknown };
          if (typeof errorBody.error === 'string') code = errorBody.error;
          if (typeof errorBody.message === 'string') message = errorBody.message;
        } catch {
          // Preserve plain-text proxy and legacy server errors.
        }
        throw new SyncHttpError(response.status, code, `HTTP ${response.status}: ${message}`);
      }
      return text ? (JSON.parse(text) as T) : ({} as T);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      releaseAbort?.();
    }
  }

  private async pushLegacySnapshot(
    payload: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<SyncSnapshot> {
    try {
      return await this.request('/v1/snapshot', {
        method: 'PUT',
        body: payload,
        timeoutMs: options?.timeoutMs,
        signal: options?.signal,
      });
    } catch (error) {
      if (error instanceof SyncHttpError && error.status === 413) {
        throw new Error('同步快照超过旧版后端的请求体限制。请升级 laphiny-sync 后端以启用可恢复的分块同步。');
      }
      throw error;
    }
  }

  private async pushSnapshotTransfer(
    snapshot: SyncSnapshot,
    payload: string,
    totalBytes: number,
    baseRevision: number,
    capability: NonNullable<NonNullable<SyncHealth['capabilities']>['snapshotTransfers']>,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<SyncSnapshot> {
    const maxPartBytes = normalizePartBytes(capability.maxPartBytes);
    if (capability.maxTransferBytes != null && totalBytes > capability.maxTransferBytes) {
      throw new Error(`同步快照为 ${totalBytes} 字节，超过后端允许的 ${capability.maxTransferBytes} 字节。`);
    }
    const parts = splitUtf8Text(payload, maxPartBytes);
    if (capability.maxParts != null && parts.length > capability.maxParts) {
      throw new Error(`同步快照需要 ${parts.length} 个分块，超过后端允许的 ${capability.maxParts} 个。`);
    }
    const sha256 = sha256Hex(payload);
    const transferId = `snapshot_${sha256}`;
    let status = await this.request<SnapshotTransferStatus>('/v1/snapshot-transfers', {
      method: 'POST',
      body: JSON.stringify({
        protocol: SNAPSHOT_TRANSFER_PROTOCOL,
        transferId,
        sha256,
        totalBytes,
        totalParts: parts.length,
        baseRevision,
      }),
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
    if (status.state === 'committed') return snapshot;

    const received = new Set(status.receivedParts);
    for (let index = 0; index < parts.length; index += 1) {
      if (received.has(index)) continue;
      status = await this.uploadSnapshotPartWithRecovery(transferId, index, parts[index]!, options);
      if (status.state === 'committed') return snapshot;
    }
    await this.commitSnapshotTransferWithRecovery(transferId, options);
    return snapshot;
  }

  private async uploadSnapshotPartWithRecovery(
    transferId: string,
    partIndex: number,
    body: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<SnapshotTransferStatus> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_TRANSFER_ATTEMPTS; attempt += 1) {
      try {
        return await this.request(`/v1/snapshot-transfers/${encodeURIComponent(transferId)}/parts/${partIndex}`, {
          method: 'PUT',
          body,
          contentType: 'text/plain; charset=utf-8',
          timeoutMs: options?.timeoutMs,
          signal: options?.signal,
        });
      } catch (error) {
        lastError = error;
        if (!isRetryableTransferError(error, options?.signal) || attempt === MAX_TRANSFER_ATTEMPTS) throw error;
        const status = await this.readSnapshotTransferStatus(transferId, options);
        if (status.state === 'committed' || status.receivedParts.includes(partIndex)) return status;
        await waitBeforeTransferRetry(attempt, options?.signal);
      }
    }
    throw lastError;
  }

  private async commitSnapshotTransferWithRecovery(
    transferId: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<SnapshotTransferStatus> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_TRANSFER_ATTEMPTS; attempt += 1) {
      try {
        return await this.request(`/v1/snapshot-transfers/${encodeURIComponent(transferId)}/commit`, {
          method: 'POST',
          body: '{}',
          timeoutMs: options?.timeoutMs,
          signal: options?.signal,
        });
      } catch (error) {
        lastError = error;
        if (!isRetryableTransferError(error, options?.signal) || attempt === MAX_TRANSFER_ATTEMPTS) throw error;
        const status = await this.readSnapshotTransferStatus(transferId, options);
        if (status.state === 'committed') return status;
        await waitBeforeTransferRetry(attempt, options?.signal);
      }
    }
    throw lastError;
  }

  private readSnapshotTransferStatus(
    transferId: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<SnapshotTransferStatus> {
    return this.request(`/v1/snapshot-transfers/${encodeURIComponent(transferId)}`, {
      method: 'GET',
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }
}

function normalizePartBytes(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) return DEFAULT_TRANSFER_PART_BYTES;
  return Math.min(value!, DEFAULT_TRANSFER_PART_BYTES);
}

function isRetryableTransferError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false;
  if (error instanceof SyncHttpError) {
    return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
}

function waitBeforeTransferRetry(attempt: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.min(250, 50 * attempt));
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

export function splitUtf8Text(text: string, maxBytes: number): string[] {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('maxBytes must be a positive integer');
  if (!text) return [];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let low = start + 1;
    let high = Math.min(text.length, start + maxBytes);
    let best = start;
    while (low <= high) {
      const candidate = Math.floor((low + high) / 2);
      let safeEnd = candidate;
      if (safeEnd < text.length && isHighSurrogate(text.charCodeAt(safeEnd - 1)) && isLowSurrogate(text.charCodeAt(safeEnd))) safeEnd -= 1;
      if (safeEnd <= start) safeEnd = Math.min(text.length, start + 2);
      const size = utf8Bytes(text.slice(start, safeEnd)).length;
      if (size <= maxBytes) {
        best = safeEnd;
        low = candidate + 1;
      } else {
        high = candidate - 1;
      }
    }
    if (best <= start) throw new Error('Unable to split UTF-8 snapshot payload');
    parts.push(text.slice(start, best));
    start = best;
  }
  return parts;
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function sha256Hex(text: string): string {
  const bytes = utf8Bytes(text);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15]!;
      const y = words[index - 2]!;
      const sigma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const sigma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }
    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + SHA256_CONSTANTS[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }
  return Array.from(hash, (value) => value.toString(16).padStart(8, '0')).join('');
}

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function parseProactiveMessageSseFrame(frame: string): import('../types').ProactiveAgentMessageEvent | null {
  let eventName = '';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) eventName = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart());
  }
  if (eventName !== 'proactive-message' || dataLines.length === 0) return null;
  try {
    const value = JSON.parse(dataLines.join('\n')) as import('../types').ProactiveAgentMessageEvent;
    return value?.protocol === 'laphiny.proactive-message.v1' ? value : null;
  } catch {
    return null;
  }
}
