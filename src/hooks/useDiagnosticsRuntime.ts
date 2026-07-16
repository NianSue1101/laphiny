import { useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { APP_VERSION } from '../config/app_config';
import { getErrorMessage, requestConfirm, showNotice } from '../app/app_utils';
import {
  appendDiagnosticLog as appendDiagnosticLogEntry,
  buildDiagnosticBundle,
  makeDiagnosticLog,
  sanitizeDiagnosticLogs,
} from '../lib/diagnostics';
import { LaphinyFeedbackClient } from '../lib/feedback_client';
import type {
  ChatMessage,
  DiagnosticLogEntry,
  FeedbackConfig,
  FeedbackLogEntry,
  HermesConnection,
  Room,
} from '../types';
import type { ServiceWorkerStatus, StorageBackendInfo } from '../app/app_types';

export const DEFAULT_FEEDBACK_BASE_URL = '/laphiny-feedback';
const DEFAULT_FEEDBACK_API_KEY = '';

export interface DiagnosticSummary {
  total: number;
  errors: number;
  warnings: number;
  recent: DiagnosticLogEntry[];
}

type DiagnosticContext = {
  connections: HermesConnection[];
  rooms: Room[];
  messagesByRoom: Record<string, ChatMessage[]>;
  storageBackend: StorageBackendInfo | null;
  messageBytes: number;
  networkOnline: boolean;
  serviceWorkerStatus: ServiceWorkerStatus;
  pwaInstalled: boolean;
  width: number;
  layoutMode: string;
};

type SavedTextFile = {
  uri: string;
  userVisible: boolean;
  locationLabel: string;
};

type UseDiagnosticsRuntimeOptions = {
  getDiagnosticContext: () => DiagnosticContext;
  saveTextFile: (filename: string, text: string, mimeType: string) => Promise<SavedTextFile | null>;
};

export function useDiagnosticsRuntime({ getDiagnosticContext, saveTextFile }: UseDiagnosticsRuntimeOptions) {
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLogEntry[]>([]);
  const [diagnosticLogsOpen, setDiagnosticLogsOpen] = useState(false);
  const [feedbackConfig, setFeedbackConfig] = useState<FeedbackConfig>({
    enabled: true,
    baseUrl: DEFAULT_FEEDBACK_BASE_URL,
    apiKey: DEFAULT_FEEDBACK_API_KEY,
    updatedAt: new Date().toISOString(),
  });
  const [feedbackLogs, setFeedbackLogs] = useState<FeedbackLogEntry[]>([]);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  const diagnosticSummary = useMemo<DiagnosticSummary>(() => {
    const recent = diagnosticLogs.slice(-50);
    return {
      total: diagnosticLogs.length,
      errors: recent.filter((log) => log.level === 'error').length,
      warnings: recent.filter((log) => log.level === 'warning').length,
      recent,
    };
  }, [diagnosticLogs]);

  function appendDiagnosticLog(input: Omit<DiagnosticLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) {
    const entry = makeDiagnosticLog(input);
    setDiagnosticLogs((current) => appendDiagnosticLogEntry(current, entry));
  }

  function replaceDiagnosticLogs(value: unknown) {
    setDiagnosticLogs(sanitizeDiagnosticLogs(value));
  }

  function mergeDiagnosticLogs(logs: DiagnosticLogEntry[]) {
    if (!logs.length) return;
    setDiagnosticLogs((current) => sanitizeDiagnosticLogs([...current, ...logs]));
  }

  function makeFeedbackClient(): LaphinyFeedbackClient | null {
    if (!feedbackConfig.enabled || !feedbackConfig.baseUrl.trim()) return null;
    return new LaphinyFeedbackClient(feedbackConfig);
  }

  function buildSanitizedDiagnosticObject(): Record<string, unknown> {
    const {
      connections,
      rooms,
      messagesByRoom,
      storageBackend,
      messageBytes,
      networkOnline,
      serviceWorkerStatus,
      pwaInstalled,
      width,
      layoutMode,
    } = getDiagnosticContext();
    const bundle = buildDiagnosticBundle({
      connections,
      rooms,
      messagesByRoom,
      diagnosticLogs,
      appVersion: APP_VERSION,
      storage: storageBackend ? { ...storageBackend, messageBytes } : { messageBytes },
      runtime: {
        platform: Platform.OS,
        online: networkOnline,
        serviceWorkerStatus,
        pwaInstalled,
        width,
        layoutMode,
      },
    });

    try {
      return JSON.parse(bundle) as Record<string, unknown>;
    } catch (error) {
      appendDiagnosticLog({
        level: 'warning',
        category: 'system',
        title: '诊断包解析失败',
        message: getErrorMessage(error),
      });
      return {
        version: 1,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        error: 'diagnostic_bundle_parse_failed',
      };
    }
  }

  async function uploadFeedbackLogs() {
    const client = makeFeedbackClient();
    if (!client) {
      showNotice('反馈后端未启用', '请先填写反馈后端地址并启用。');
      return;
    }
    const { rooms, connections } = getDiagnosticContext();
    setFeedbackBusy(true);
    try {
      const entry = await client.uploadFeedback({
        source: 'Laphiny App',
        appVersion: APP_VERSION,
        platform: Platform.OS,
        summary: `logs=${diagnosticLogs.length}, rooms=${rooms.length}, connections=${connections.length}`,
        diagnostics: buildSanitizedDiagnosticObject(),
      }, { timeoutMs: 20_000 });
      setFeedbackLogs((current) => [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 30));
      appendDiagnosticLog({
        level: 'success',
        category: 'sync',
        title: '反馈日志已上传',
        message: entry.id,
      });
      showNotice('反馈日志已上传', entry.id);
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'sync',
        title: '反馈日志上传失败',
        message: getErrorMessage(error),
      });
      showNotice('反馈上传失败', getErrorMessage(error));
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function exportDiagnosticBundle() {
    const filename = `laphiny-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const text = JSON.stringify(buildSanitizedDiagnosticObject(), null, 2);
    const savedTo = await saveTextFile(filename, text, 'application/json');
    if (savedTo) {
      showNotice(
        savedTo.userVisible ? '诊断 JSON 已保存' : '诊断 JSON 已保存到应用目录',
        savedTo.userVisible
          ? `已保存到 ${savedTo.locationLabel}：${filename}`
          : `系统目录选择不可用，已保存到应用私有目录：${savedTo.uri}`,
      );
      return;
    }
    showNotice('诊断导出失败', '当前环境无法写入 JSON 文件，请稍后重试。');
  }

  function clearDiagnosticLogs() {
    requestConfirm('清空诊断日志', '将清空当前设备保存的请求/同步/连接诊断日志。不会删除聊天记录。', () => {
      setDiagnosticLogs([]);
    });
  }

  return {
    diagnosticLogs,
    diagnosticLogsOpen,
    diagnosticSummary,
    feedbackBusy,
    feedbackConfig,
    feedbackLogs,
    appendDiagnosticLog,
    clearDiagnosticLogs,
    exportDiagnosticBundle,
    mergeDiagnosticLogs,
    replaceDiagnosticLogs,
    setDiagnosticLogsOpen,
    setFeedbackConfig,
    uploadFeedbackLogs,
  };
}
