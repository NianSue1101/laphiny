/**
 * Room log: per-room persistent message log on the tablet.
 *
 * All messages pass through the Laphiny client and are recorded here.
 * When any agent is called, the log is injected as chat history context.
 *
 * Endpoint: https://nianxxz.site/laphiny-log/<roomId>  (cloud nginx → frps → tablet)
 */

const LOG_URL = 'https://nianxxz.site/laphiny-log';

export interface RoomLogEntry {
  role: 'user' | 'assistant';
  author: string;
  content: string;
  timestamp: string;
}

export async function fetchRoomLogText(roomId: string, limit = 50): Promise<string> {
  try {
    const url = `${LOG_URL}/${encodeURIComponent(roomId)}?limit=${limit}`;
    const resp = await fetch(url);
    if (!resp.ok) return '';
    const entries: RoomLogEntry[] = await resp.json();
    if (!entries || entries.length === 0) return '';

    const lines = entries.map((e) => {
      const author = e.author || (e.role === 'user' ? '用户' : 'unknown');
      return `【${author}】：${e.content}`;
    });

    return `\n\n=== 以下为群聊历史记录 ===\n${lines.join('\n')}\n=== 历史记录结束 ===`;
  } catch {
    return '';
  }
}

export function appendRoomLog(roomId: string, entry: RoomLogEntry): void {
  const url = `${LOG_URL}/${encodeURIComponent(roomId)}`;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {});
}
