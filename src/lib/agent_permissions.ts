import type { AgentPermissionDecision, AgentPermissionRequest } from '../types';

export interface AgentPermissionExtraction {
  content: string;
  request?: AgentPermissionRequest;
}

type PermissionPayload = {
  title?: string;
  body?: string;
  action?: string;
  reason?: string;
  description?: string;
  request?: string;
};

const PERMISSION_BLOCK_PATTERN = /```(?:laphiny-permission|agent-permission|permission-request)\s*\n([\s\S]*?)```/gi;
const INLINE_PERMISSION_PATTERN = /^\s*(?:LAPHINY_PERMISSION|PERMISSION_REQUEST|权限请求|授权请求)\s*[:：]\s*(\{.*\})\s*$/im;

export function extractAgentPermissionRequest(rawContent: string, now = new Date().toISOString()): AgentPermissionExtraction {
  let request: AgentPermissionRequest | undefined;
  let content = rawContent.replace(PERMISSION_BLOCK_PATTERN, (full, rawBody: string) => {
    if (request) return '';
    const payload = parsePermissionPayload(rawBody);
    if (!payload) return full;
    request = buildPermissionRequest(payload, now);
    return '';
  });

  if (!request) {
    const inlineMatch = content.match(INLINE_PERMISSION_PATTERN);
    if (inlineMatch?.[1]) {
      const payload = parsePermissionPayload(inlineMatch[1]);
      if (payload) {
        request = buildPermissionRequest(payload, now);
        content = content.replace(inlineMatch[0], '');
      }
    }
  }

  const normalizedContent = content.replace(/\n{3,}/g, '\n\n').trim();
  if (!request && looksLikePlainPermissionRequest(normalizedContent)) {
    request = buildPermissionRequest({
      title: '需要你的确认',
      body: normalizedContent.slice(0, 600),
    }, now);
  }

  return {
    content: normalizedContent,
    request,
  };
}

export function getAgentPermissionKey(request: Pick<AgentPermissionRequest, 'key' | 'title' | 'action' | 'body'>): string {
  if (request.key) return request.key;
  return makePermissionKey(request.action || request.title || request.body);
}

export function buildAgentPermissionDecisionPrompt(request: AgentPermissionRequest, decision: AgentPermissionDecision): string {
  const decisionText = decision === 'deny'
    ? '拒绝'
    : decision === 'always'
      ? '总是同意'
      : '同意';
  return [
    '用户已经在 Laphiny 权限卡片中做出选择。',
    `选择：${decisionText}`,
    `请求：${request.title}`,
    request.action ? `动作：${request.action}` : null,
    request.reason ? `原因：${request.reason}` : null,
    '',
    decision === 'deny'
      ? '请不要执行被拒绝的动作，改为说明影响并给出无需该权限的下一步。'
      : '请继续刚才被权限请求中断的任务，不要再次要求用户手动发送确认消息。',
  ].filter(Boolean).join('\n');
}

function parsePermissionPayload(rawBody: string): PermissionPayload | null {
  const trimmed = rawBody.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as PermissionPayload;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return parseLoosePayload(trimmed);
  }
  return null;
}

function parseLoosePayload(rawBody: string): PermissionPayload | null {
  const payload: PermissionPayload = {};
  for (const line of rawBody.split(/\r?\n/)) {
    const match = line.match(/^\s*(title|body|action|reason|description|request)\s*[:：]\s*(.+?)\s*$/i);
    if (!match) continue;
    payload[match[1]!.toLowerCase() as keyof PermissionPayload] = match[2]!;
  }
  return Object.keys(payload).length ? payload : null;
}

function buildPermissionRequest(payload: PermissionPayload, now: string): AgentPermissionRequest {
  const title = cleanText(payload.title || payload.request || payload.action || '需要你的确认');
  const body = cleanText(payload.body || payload.description || payload.reason || payload.action || title);
  const action = payload.action ? cleanText(payload.action) : undefined;
  const reason = payload.reason ? cleanText(payload.reason) : undefined;
  const key = makePermissionKey(action || title);
  return {
    id: `perm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    key,
    title,
    body,
    action,
    reason,
    status: 'pending',
    createdAt: now,
  };
}

function looksLikePlainPermissionRequest(content: string): boolean {
  if (!content || content.length > 1200) return false;
  const normalized = content.toLowerCase();
  const hasPermissionWord = /权限|授权|确认|同意|允许|permission|approval|approve|allow/.test(normalized);
  const hasDecisionWord = /拒绝|总是同意|always|reject|deny/.test(normalized);
  const asksUser = /需要|请你|是否|请选择|requires?|please|confirm/.test(normalized);
  return hasPermissionWord && hasDecisionWord && asksUser;
}

function makePermissionKey(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 160) || 'generic-permission';
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
