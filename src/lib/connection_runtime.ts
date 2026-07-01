import type { AgentProfile, HermesConnection } from '../types';
import { buildAgentProfileInquiryMessages, parseAgentProfileResponse } from './agent_profile';
import { HermesClient } from './hermes_client';

export type ConnectionHealthCheckResult =
  | {
      id: string;
      status: 'ok';
      latencyMs: number;
      modelsCount: number;
      checkedAt: string;
      rawStatus?: string;
    }
  | {
      id: string;
      status: 'error';
      error: string;
      checkedAt: string;
      latencyMs: number;
    };

export async function checkHermesConnection(connection: HermesConnection, timeoutMs = 8_000): Promise<ConnectionHealthCheckResult> {
  const startedAt = Date.now();
  try {
    const client = new HermesClient(connection);
    const [health, models] = await Promise.all([
      client.health({ timeoutMs }),
      client.models({ timeoutMs }),
    ]);
    return {
      id: connection.id,
      status: 'ok',
      latencyMs: Date.now() - startedAt,
      modelsCount: models.length,
      checkedAt: new Date().toISOString(),
      rawStatus: health.status,
    };
  } catch (error) {
    return {
      id: connection.id,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function generateAgentProfile(connection: HermesConnection): Promise<AgentProfile> {
  const client = new HermesClient(connection);
  const response = await client.chatCompletion({
    model: connection.model,
    messages: buildAgentProfileInquiryMessages(connection.name),
  }, {
    sessionId: `laphiny-profile-${connection.id}`,
    sessionKey: `laphiny-profile-${connection.id}`,
    timeoutMs: 60_000,
  });

  const text = response.choices?.[0]?.message?.content ?? '';
  return parseAgentProfileResponse(text, connection.name);
}
