import type { ComponentType } from "react";
import { View, type TextProps } from "react-native";

import {
  formatDateTime,
  getSyncConflictEntityLabel,
  getSyncConflictStatusLabel,
} from "../../app/app_utils";
import type { SyncConflictReport } from "../../lib/sync_conflicts";
import { HealthMetric } from "../Primitives";

type Styles = Record<string, any>;

interface SyncConflictReportPanelProps {
  report: SyncConflictReport | null;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
}

export function SyncConflictReportPanel({
  report,
  styles,
  TextComponent: Text,
}: SyncConflictReportPanelProps) {
  if (!report) {
    return (
      <Text style={styles.help}>
        推送/拉取前可先点“检查差异”，只读取远端快照，不会修改本机数据。
      </Text>
    );
  }

  const summary = report.summary;
  return (
    <View style={styles.conflictPanel}>
      <View style={styles.conflictHeader}>
        <View>
          <Text style={styles.cardTitle}>同步差异预检</Text>
          <Text style={styles.help}>
            检查于 {formatDateTime(report.checkedAt)}
            。本报告只读远端数据，不会自动合并。
          </Text>
        </View>
        <Text
          style={[
            styles.badge,
            summary.total > 0
              ? styles.diagnosticLevelWarning
              : styles.diagnosticLevelSuccess,
          ]}
        >
          {summary.total > 0 ? `${summary.total} 项差异` : "无差异"}
        </Text>
      </View>
      <View style={styles.healthMetricRow}>
        <HealthMetric
          label="本地独有"
          value={summary.localOnly}
          tone={summary.localOnly > 0 ? "checking" : "ok"}
        />
        <HealthMetric
          label="远端独有"
          value={summary.remoteOnly}
          tone={summary.remoteOnly > 0 ? "checking" : "ok"}
        />
        <HealthMetric
          label="本地较新"
          value={summary.localNewer}
          tone={summary.localNewer > 0 ? "error" : "ok"}
        />
        <HealthMetric
          label="远端较新"
          value={summary.remoteNewer}
          tone={summary.remoteNewer > 0 ? "checking" : "ok"}
        />
      </View>
      {summary.localNewer > 0 || summary.sameTimeDifferent > 0 ? (
        <Text style={styles.conflictWarning}>
          拉取快照会按 updatedAt
          合并，远端较新的连接/房间会覆盖本地版本；本地较新的内容建议先推送或备份。
        </Text>
      ) : null}
      {report.items.length > 0 ? (
        <View style={styles.conflictList}>
          {report.items.slice(0, 12).map((item) => (
            <View
              key={`${item.entity}:${item.id}:${item.status}`}
              style={styles.conflictItem}
            >
              <Text style={styles.conflictItemTitle}>
                {getSyncConflictEntityLabel(item.entity)} · {item.label}
              </Text>
              <Text style={styles.conflictItemMeta}>
                {getSyncConflictStatusLabel(item.status)} · 本地{" "}
                {item.localUpdatedAt
                  ? formatDateTime(item.localUpdatedAt)
                  : "无"}{" "}
                · 远端{" "}
                {item.remoteUpdatedAt
                  ? formatDateTime(item.remoteUpdatedAt)
                  : "无"}
              </Text>
              {item.detail ? (
                <Text style={styles.help}>{item.detail}</Text>
              ) : null}
            </View>
          ))}
          {report.truncated ? (
            <Text style={styles.help}>
              差异较多，已展示最近 {report.items.length}{" "}
              项；完整摘要会保留在诊断日志。
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.help}>本地与远端快照内容一致。</Text>
      )}
    </View>
  );
}
