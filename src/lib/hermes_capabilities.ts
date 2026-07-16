import { LAPHINY_DELEGATION_TOOL } from './connection_directory';

export type HermesToolDelegationCompatibility =
  | 'compatible'
  | 'responses_unavailable'
  | 'plugin_missing'
  | 'plugin_disabled'
  | 'metadata_incompatible'
  | 'probe_failed'
  | 'runtime_failed';

export type HermesToolDelegationSupport = {
  supported: boolean;
  compatibility: HermesToolDelegationCompatibility;
  protocol: 'laphiny.delegation.v1';
  reasonCode?: string;
  reason?: string;
  suggestedFix?: string;
};

type ToolsetMetadata = {
  enabled?: boolean;
  tools?: unknown;
};

export function evaluateHermesToolDelegationSupport(
  capabilities: unknown,
  toolsetsPayload: unknown,
): HermesToolDelegationSupport {
  if (!hasResponsesApi(capabilities)) {
    return unsupported(
      'responses_unavailable',
      'responses_api_unavailable',
      'Gateway 未声明 Responses API',
      '请升级 Hermes Gateway 并启用 Responses API；当前仍可使用兼容委托块。',
    );
  }

  const toolsets = normalizeToolsets(toolsetsPayload);
  if (!toolsets) {
    return unsupported(
      'metadata_incompatible',
      'toolsets_metadata_incompatible',
      'Gateway 返回了无法识别的 toolsets 元数据',
      '请更新 Hermes Gateway 或插件，并重新测试连接。',
    );
  }

  const matching = toolsets.filter((toolset) => (
    Array.isArray(toolset.tools) && toolset.tools.includes(LAPHINY_DELEGATION_TOOL)
  ));
  if (matching.length === 0) {
    return unsupported(
      'plugin_missing',
      'delegation_tool_missing',
      `未发现 ${LAPHINY_DELEGATION_TOOL}`,
      '请安装或启用 laphiny-hermes-delegation 插件；当前仍可使用兼容委托块。',
    );
  }
  if (!matching.some((toolset) => toolset.enabled !== false)) {
    return unsupported(
      'plugin_disabled',
      'delegation_tool_disabled',
      `${LAPHINY_DELEGATION_TOOL} 所在工具集已禁用`,
      '请启用 laphiny-hermes-delegation 工具集并重启 Gateway。',
    );
  }
  return { supported: true, compatibility: 'compatible', protocol: 'laphiny.delegation.v1' };
}
function hasResponsesApi(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const features = (value as { features?: unknown }).features;
  return Boolean(features && typeof features === 'object' && (features as { responses_api?: unknown }).responses_api === true);
}

function normalizeToolsets(value: unknown): ToolsetMetadata[] | null {
  if (Array.isArray(value)) return value.filter(isToolsetMetadata);
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  return data.filter(isToolsetMetadata);
}

function isToolsetMetadata(value: unknown): value is ToolsetMetadata {
  return Boolean(value && typeof value === 'object');
}

function unsupported(
  compatibility: Exclude<HermesToolDelegationCompatibility, 'compatible' | 'probe_failed' | 'runtime_failed'>,
  reasonCode: string,
  reason: string,
  suggestedFix: string,
): HermesToolDelegationSupport {
  return { supported: false, compatibility, protocol: 'laphiny.delegation.v1', reasonCode, reason, suggestedFix };
}
