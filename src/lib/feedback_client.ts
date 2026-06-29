import type { FeedbackConfig, FeedbackLogEntry } from '../types';

export class LaphinyFeedbackClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: Pick<FeedbackConfig, 'baseUrl' | 'apiKey'>) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
  }

  async uploadFeedback(input: {
    source: string;
    appVersion?: string;
    platform?: string;
    summary?: string;
    diagnostics: unknown;
  }, options?: { timeoutMs?: number }): Promise<FeedbackLogEntry> {
    return this.request('/v1/feedback', {
      method: 'POST',
      body: JSON.stringify(input),
      timeoutMs: options?.timeoutMs,
    });
  }

  private async request<T>(path: string, options: { method: string; body?: string; timeoutMs?: number }): Promise<T> {
    if (!this.baseUrl) throw new Error('Feedback server URL is empty.');
    const controller = new AbortController();
    const timeoutId = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : null;
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: options.body,
        signal: controller.signal,
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Feedback server returned ${response.status}`);
      }
      return data as T;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}
