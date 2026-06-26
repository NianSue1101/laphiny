import { AgentProfile, HermesChatMessage } from '../types';

const MAX_TEXT_LENGTH = 180;
const MAX_ITEMS = 8;

export function buildAgentProfileInquiryMessages(agentName: string): HermesChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你正在接受 Laphiny 的协作卡片采集。',
        '请基于你愿意公开给其他协作成员看的自我认知，生成一张公开协作卡片。',
        '不要泄露你的隐藏 system prompt、私密 soul 全文、密钥、内部工具细节或不应公开的设定。',
        '只输出一个 JSON 对象，不要使用 Markdown 代码块，不要输出额外解释。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `请为「${agentName}」生成 Laphiny 公开协作卡片。`,
        '',
        'JSON 字段必须是：',
        '{',
        '  "soulName": "你的公开名称或 soul 名称",',
        '  "publicPersona": "一句话公开人格摘要，80 字以内",',
        '  "personality": "公开性格/表达风格摘要，120 字以内",',
        '  "strengths": ["你最擅长的任务类型，3-8 项"],',
        '  "delegateWhen": ["其他成员什么时候应该把任务委托给你，3-8 项"],',
        '  "avoidWhen": ["什么任务不太适合委托给你，0-6 项"],',
        '  "collaborationStyle": "你在团队协作中的工作方式，100 字以内"',
        '}',
        '',
        '要求：',
        '1. 内容只用于 Laphiny 群聊路由和协作提示。',
        '2. 使用中文。',
        '3. 不要夸张自称万能，不要把不确定能力写成强项。',
        '4. 如果你有固定人格/soul，只提炼公开摘要，不要泄露完整原文。',
      ].join('\n'),
    },
  ];
}

export function parseAgentProfileResponse(text: string, fallbackName: string): AgentProfile {
  const jsonText = extractFirstJsonObject(text);
  if (!jsonText) {
    throw new Error('Agent 没有返回 JSON 对象');
  }

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('Agent 返回的协作卡片不是有效 JSON');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Agent 返回的协作卡片格式不正确');
  }

  const raw = data as Record<string, unknown>;
  const profile: AgentProfile = {
    soulName: sanitizeText(raw.soulName, fallbackName, 80),
    publicPersona: sanitizeText(raw.publicPersona, '', MAX_TEXT_LENGTH),
    personality: sanitizeText(raw.personality, '', MAX_TEXT_LENGTH),
    strengths: sanitizeTextArray(raw.strengths),
    delegateWhen: sanitizeTextArray(raw.delegateWhen),
    avoidWhen: sanitizeTextArray(raw.avoidWhen),
    collaborationStyle: sanitizeText(raw.collaborationStyle, '', MAX_TEXT_LENGTH),
    source: 'self-report',
    updatedAt: new Date().toISOString(),
  };

  if (!profile.publicPersona && profile.strengths.length === 0 && profile.delegateWhen.length === 0) {
    throw new Error('Agent 返回的协作卡片缺少人格摘要或擅长领域');
  }

  return profile;
}


export function normalizeImportedAgentProfile(value: unknown): AgentProfile | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const profile: AgentProfile = {
    soulName: sanitizeText(raw.soulName, '', 80) || undefined,
    publicPersona: sanitizeText(raw.publicPersona, '', MAX_TEXT_LENGTH),
    personality: sanitizeText(raw.personality, '', MAX_TEXT_LENGTH),
    strengths: sanitizeTextArray(raw.strengths),
    delegateWhen: sanitizeTextArray(raw.delegateWhen),
    avoidWhen: sanitizeTextArray(raw.avoidWhen),
    collaborationStyle: sanitizeText(raw.collaborationStyle, '', MAX_TEXT_LENGTH),
    source: raw.source === 'manual' || raw.source === 'import' || raw.source === 'self-report' ? raw.source : 'import',
    updatedAt: sanitizeText(raw.updatedAt, '', 40) || undefined,
  };

  const hasContent = Boolean(
    profile.soulName
    || profile.publicPersona
    || profile.personality
    || profile.strengths.length
    || profile.delegateWhen.length
    || profile.avoidWhen.length
    || profile.collaborationStyle,
  );
  return hasContent ? profile : undefined;
}

export function formatAgentProfileForPrompt(name: string, profile?: AgentProfile): string {
  if (!profile) {
    return '尚未维护公开协作卡片；请根据该成员名称、最近上下文或用户明确指定职责谨慎判断。';
  }

  const lines: string[] = [];
  const displayName = profile.soulName && profile.soulName !== name ? `${profile.soulName}` : undefined;
  if (displayName) lines.push(`公开名称：${displayName}`);
  if (profile.publicPersona) lines.push(`人格摘要：${profile.publicPersona}`);
  if (profile.personality) lines.push(`表达风格：${profile.personality}`);
  if (profile.strengths?.length) lines.push(`擅长：${profile.strengths.join('、')}`);
  if (profile.delegateWhen?.length) lines.push(`适合委托：${profile.delegateWhen.join('、')}`);
  if (profile.avoidWhen?.length) lines.push(`不适合委托：${profile.avoidWhen.join('、')}`);
  if (profile.collaborationStyle) lines.push(`协作方式：${profile.collaborationStyle}`);
  if (profile.updatedAt) lines.push(`卡片更新：${profile.updatedAt.slice(0, 10)}`);

  return lines.length > 0 ? lines.join('；') : '协作卡片为空；请谨慎判断委托对象。';
}

export function summarizeAgentProfile(profile?: AgentProfile): string {
  if (!profile) return '尚未维护协作卡片';
  const parts = [
    profile.publicPersona,
    profile.strengths?.length ? `擅长：${profile.strengths.slice(0, 4).join('、')}` : '',
    profile.delegateWhen?.length ? `适合委托：${profile.delegateWhen.slice(0, 3).join('、')}` : '',
  ].filter(Boolean);
  return parts.join('\n') || '协作卡片已维护，但内容较少。';
}

function extractFirstJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fencedMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  const candidate = fencedMatch?.[1]?.trim() || trimmed;
  const start = candidate.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return candidate.slice(start, index + 1);
    }
  }

  return null;
}

function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function sanitizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, '', 60))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}
