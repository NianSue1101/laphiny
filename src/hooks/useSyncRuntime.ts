import { useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { getErrorMessage } from '../app/app_utils';
import type { DiagnosticLogEntry, SyncConfig, SyncSnapshot } from '../types';
import { LaphinySyncClient } from '../lib/sync_client';
import { buildSyncConflictReport, type SyncConflictReport } from '../lib/sync_conflicts';

type DiagnosticInput = Omit<DiagnosticLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string };

interface SyncRuntimeOptions {
  syncConfig: SyncConfig;
  setSyncConfig: Dispatch<SetStateAction<SyncConfig>>;
  buildSyncSnapshot: () => SyncSnapshot;
  applySyncSnapshot: (snapshot: SyncSnapshot) => void;
  appendDiagnosticLog: (input: DiagnosticInput) => void;
  showNotice: (title: string, message?: string) => void;
  getLocalMeta: () => { rooms: number; connections: number };
}

export function useSyncRuntime({
  syncConfig,
  setSyncConfig,
  buildSyncSnapshot,
  applySyncSnapshot,
  appendDiagnosticLog,
  showNotice,
  getLocalMeta,
}: SyncRuntimeOptions) {
  const [syncing, setSyncing] = useState(false);
  const [checkingSyncConflicts, setCheckingSyncConflicts] = useState(false);
  const [syncConflictReport, setSyncConflictReport] = useState<SyncConflictReport | null>(null);
  const autoPullingSyncRef = useRef(false);
  const lastAutoPullSyncAtRef = useRef(0);

  function makeSyncClient(): LaphinySyncClient | null {
    if (!syncConfig.enabled || !syncConfig.baseUrl.trim()) return null;
    return new LaphinySyncClient(syncConfig);
  }

  function clearSyncConflictReport() {
    setSyncConflictReport(null);
  }

  async function autoPullSyncSnapshot(reason: 'startup' | 'foreground') {
    const now = Date.now();
    if (now - lastAutoPullSyncAtRef.current < 8_000) return;
    if (autoPullingSyncRef.current || syncing || checkingSyncConflicts) return;

    const client = makeSyncClient();
    if (!client) return;

    autoPullingSyncRef.current = true;
    lastAutoPullSyncAtRef.current = now;
    const startedAt = Date.now();
    try {
      const snapshot = await client.pullSnapshot({ timeoutMs: 20_000 });
      applySyncSnapshot(snapshot);
      clearSyncConflictReport();
      setSyncConfig((current) => ({ ...current, lastPulledAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
      appendDiagnosticLog({
        level: 'success',
        category: 'sync',
        title: 'Auto sync completed',
        message: 'Remote snapshot was merged into this device.',
        durationMs: Date.now() - startedAt,
        meta: { reason, rooms: snapshot.rooms.length, connections: snapshot.connections.length },
      });
    } catch (error) {
      appendDiagnosticLog({
        level: 'warning',
        category: 'sync',
        title: 'Auto sync failed',
        message: getErrorMessage(error),
        durationMs: Date.now() - startedAt,
        meta: { reason },
      });
    } finally {
      autoPullingSyncRef.current = false;
    }
  }

  async function testSyncBackend() {
    const client = makeSyncClient();
    if (!client) {
      showNotice('同步未启用', '请先启用同步并填写后端地址。');
      return;
    }
    setSyncing(true);
    const startedAt = Date.now();
    try {
      const health = await client.health({ timeoutMs: 8_000 });
      appendDiagnosticLog({
        level: 'success',
        category: 'sync',
        title: '同步后端测试成功',
        message: `状态：${health.status ?? 'ok'}`,
        durationMs: Date.now() - startedAt,
      });
      showNotice('同步后端可用', `状态：${health.status ?? 'ok'}`);
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'sync',
        title: '同步后端测试失败',
        message: getErrorMessage(error),
        durationMs: Date.now() - startedAt,
      });
      showNotice('同步后端不可用', getErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  async function checkSyncConflicts() {
    const client = makeSyncClient();
    if (!client) {
      showNotice('同步未启用', '请先启用同步并填写后端地址。');
      return;
    }

    setCheckingSyncConflicts(true);
    const startedAt = Date.now();
    try {
      const remoteSnapshot = await client.pullSnapshot({ timeoutMs: 20_000 });
      const report = buildSyncConflictReport(buildSyncSnapshot(), remoteSnapshot);
      setSyncConflictReport(report);
      appendDiagnosticLog({
        level: report.summary.total > 0 ? 'warning' : 'success',
        category: 'sync',
        title: '同步差异检查完成',
        message: report.summary.total > 0
          ? `发现 ${report.summary.total} 项本地/远端差异，拉取或推送前请先确认。`
          : '本机和远端快照没有发现差异。',
        durationMs: Date.now() - startedAt,
        meta: {
          total: report.summary.total,
          localOnly: report.summary.localOnly,
          remoteOnly: report.summary.remoteOnly,
          localNewer: report.summary.localNewer,
          remoteNewer: report.summary.remoteNewer,
        },
      });
      showNotice(
        report.summary.total > 0 ? '发现同步差异' : '同步差异检查完成',
        report.summary.total > 0
          ? `共 ${report.summary.total} 项差异。请在同步面板查看摘要，再决定拉取或推送。`
          : '本机和远端快照没有发现差异。',
      );
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'sync',
        title: '同步差异检查失败',
        message: getErrorMessage(error),
        durationMs: Date.now() - startedAt,
      });
      showNotice('差异检查失败', getErrorMessage(error));
    } finally {
      setCheckingSyncConflicts(false);
    }
  }

  async function pushSyncSnapshot() {
    const client = makeSyncClient();
    if (!client) {
      showNotice('同步未启用', '请先启用同步并填写后端地址。');
      return;
    }
    setSyncing(true);
    const startedAt = Date.now();
    try {
      const snapshot = await client.pushSnapshot(buildSyncSnapshot(), { timeoutMs: 20_000 });
      applySyncSnapshot(snapshot);
      clearSyncConflictReport();
      setSyncConfig((current) => ({ ...current, lastPushedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
      appendDiagnosticLog({
        level: 'success',
        category: 'sync',
        title: '同步快照推送成功',
        message: '本机房间、消息和灵庭事件已发送到后端。',
        durationMs: Date.now() - startedAt,
        meta: getLocalMeta(),
      });
      showNotice('已推送同步快照', '本机房间、消息和灵庭事件已发送到后端。');
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'sync',
        title: '同步快照推送失败',
        message: getErrorMessage(error),
        durationMs: Date.now() - startedAt,
      });
      showNotice('推送失败', getErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  async function pullSyncSnapshot() {
    const client = makeSyncClient();
    if (!client) {
      showNotice('同步未启用', '请先启用同步并填写后端地址。');
      return;
    }
    setSyncing(true);
    const startedAt = Date.now();
    try {
      const snapshot = await client.pullSnapshot({ timeoutMs: 20_000 });
      applySyncSnapshot(snapshot);
      clearSyncConflictReport();
      setSyncConfig((current) => ({ ...current, lastPulledAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
      appendDiagnosticLog({
        level: 'success',
        category: 'sync',
        title: '同步快照拉取成功',
        message: '远端数据已合并到本机。',
        durationMs: Date.now() - startedAt,
        meta: { rooms: snapshot.rooms.length, connections: snapshot.connections.length },
      });
      showNotice('已拉取同步快照', '远端数据已合并到本机。');
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'sync',
        title: '同步快照拉取失败',
        message: getErrorMessage(error),
        durationMs: Date.now() - startedAt,
      });
      showNotice('拉取失败', getErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  return {
    checkingSyncConflicts,
    syncConflictReport,
    syncing,
    autoPullSyncSnapshot,
    checkSyncConflicts,
    clearSyncConflictReport,
    pullSyncSnapshot,
    pushSyncSnapshot,
    testSyncBackend,
  };
}
