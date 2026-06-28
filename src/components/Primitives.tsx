import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { AgentProfile, Attachment, Room } from '../types';
import type { ConnectionHealth, IconName } from '../app/app_types';
import { formatDateTime, getAttachmentSummary } from '../app/app_utils';
import { Ionicons } from './SafeIcon';

export function TabButton({ icon, label, active, onPress }: { icon: IconName; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={active ? '#ffffff' : '#4b5563'} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PrimaryButton({ icon, label, onPress, disabled = false }: { icon?: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.primaryButton, disabled && styles.disabledButton]} onPress={onPress} disabled={disabled}>
      {icon ? <Ionicons name={icon} size={16} color="#fff" /> : null}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({ icon, label, onPress, disabled = false }: { icon?: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.secondaryButton, disabled && styles.disabledButton]} onPress={onPress} disabled={disabled}>
      {icon ? <Ionicons name={icon} size={15} color="#2563eb" /> : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function AttachmentPreview({
  attachment,
  onPress,
  actionIcon = 'close-circle',
}: {
  attachment: Attachment;
  onPress?: () => void;
  actionIcon?: IconName;
}) {
  const summary = getAttachmentSummary(attachment);
  const isImage = attachment.kind === 'image' && Boolean(attachment.dataUrl || attachment.uri);
  const content = (
    <>
      {isImage ? (
        <Image source={{ uri: attachment.dataUrl ?? attachment.uri }} style={styles.attachmentThumb} />
      ) : (
        <View style={styles.attachmentIcon}>
          <Ionicons name={attachment.kind === 'text' ? 'document-text-outline' : 'document-outline'} size={18} color="#0f766e" />
        </View>
      )}
      <View style={styles.attachmentInfo}>
        <Text style={styles.attachmentName} numberOfLines={1}>{attachment.name}</Text>
        <Text style={styles.attachmentSummary} numberOfLines={2}>{summary}</Text>
      </View>
      {onPress ? <Ionicons name={actionIcon} size={16} color="#0f766e" /> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.attachmentPreview} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.attachmentPreview}>{content}</View>;
}

export function ConnectionProfileCard({ profile }: { profile?: AgentProfile }) {
  if (!profile) {
    return (
      <View style={styles.profileCardEmpty}>
        <Text style={styles.profileTitle}>协作卡片</Text>
        <Text style={styles.help}>尚未生成。点击“生成协作卡片”，Laphiny 会询问这个 Agent 自己，并保存公开人格/能力摘要用于群聊委托路由。</Text>
      </View>
    );
  }

  return (
    <View style={styles.profileCard}>
      <View style={styles.profileHeader}>
        <Text style={styles.profileTitle}>协作卡片</Text>
        {profile.updatedAt ? <Text style={styles.profileUpdated}>更新于 {formatDateTime(profile.updatedAt)}</Text> : null}
      </View>
      {profile.publicPersona ? <Text style={styles.profilePersona}>{profile.publicPersona}</Text> : null}
      {profile.personality ? <Text style={styles.help}>{profile.personality}</Text> : null}
      <ProfileList label="擅长" items={profile.strengths} />
      <ProfileList label="适合委托" items={profile.delegateWhen} />
      <ProfileList label="不适合" items={profile.avoidWhen} />
      {profile.collaborationStyle ? <Text style={styles.help}>协作方式：{profile.collaborationStyle}</Text> : null}
    </View>
  );
}

function ProfileList({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <View style={styles.profileLine}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileText}>{items.join('、')}</Text>
    </View>
  );
}

export function StatusToken({ icon, label, tone = 'default' }: { icon: IconName; label: string; tone?: 'default' | 'rp' | 'memory' | 'warning' }) {
  return (
    <View style={[styles.statusToken, getStatusTokenStyle(tone)]}>
      <Ionicons name={icon} size={13} color={getStatusTokenColor(tone)} />
      <Text style={[styles.statusTokenText, getStatusTokenTextStyle(tone)]}>{label}</Text>
    </View>
  );
}

export function AgentAvatar({ alias, size = 24, imageUri }: { alias: string; size?: number; imageUri?: string }) {
  const theme = getAgentTheme(alias);
  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={[
          styles.agentAvatar,
          { width: size, height: size, borderRadius: size / 2, borderColor: theme.border, backgroundColor: theme.bg },
        ]}
      />
    );
  }

  return (
    <View style={[styles.agentAvatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.bg, borderColor: theme.border }]}> 
      <Text style={[styles.agentAvatarText, { color: theme.text, fontSize: Math.max(10, Math.floor(size * 0.42)) }]}>{theme.symbol}</Text>
    </View>
  );
}

export function AgentBadge({ alias, active = false, status = 'idle', imageUri }: { alias: string; active?: boolean; status?: 'idle' | 'running' | 'delegated' | 'gm' | 'disabled'; imageUri?: string }) {
  const theme = getAgentTheme(alias);
  return (
    <View style={styles.agentBadgeRow}>
      <AgentAvatar alias={alias} size={20} imageUri={imageUri} />
      <Text style={[styles.memberChipText, active && styles.memberChipTextSelected, status === 'disabled' && styles.memberChipTextDisabled]}>@{alias}</Text>
      <Text style={[styles.agentStatusDot, { backgroundColor: getAgentStatusColor(status), borderColor: active ? '#ffffff' : theme.border }]} />
    </View>
  );
}

export function HealthMetric({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'error' | 'checking' | 'unknown' }) {
  return (
    <View style={[styles.healthMetric, getHealthMetricStyle(tone)]}>
      <Text style={styles.healthMetricValue}>{value}</Text>
      <Text style={styles.healthMetricLabel}>{label}</Text>
    </View>
  );
}

export function HealthBadge({ health }: { health?: ConnectionHealth }) {
  const status = health?.status ?? 'unknown';
  const label = status === 'ok' ? '健康' : status === 'error' ? '异常' : status === 'checking' ? '检查中' : '未知';
  return <Text style={[styles.badge, getHealthBadgeStyle(status)]}>{label}</Text>;
}

export function ConnectionHealthDetails({ health }: { health?: ConnectionHealth }) {
  if (!health || health.status === 'unknown') {
    return <Text style={styles.help}>尚未检查。点击“测试”或“刷新全部”获取状态。</Text>;
  }

  if (health.status === 'checking') {
    return (
      <View style={styles.healthDetails}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.help}>正在检查健康状态...</Text>
      </View>
    );
  }

  return (
    <View style={styles.healthDetails}>
      <Text style={styles.healthDetailText}>
        {health.status === 'ok'
          ? `延迟 ${health.latencyMs ?? '-'} ms · 模型 ${health.modelsCount ?? 0} 个`
          : `最近错误：${health.error ?? '未知错误'}`}
      </Text>
      {health.checkedAt ? <Text style={styles.healthCheckedAt}>检查于 {formatDateTime(health.checkedAt)}</Text> : null}
    </View>
  );
}

export function MiniButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.miniButton} onPress={onPress}>
      <Ionicons name={icon} size={13} color="#4b5563" />
      <Text style={styles.miniButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  variant = 'ghost',
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'ghost' | 'primary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <TouchableOpacity
      accessibilityLabel={label}
      style={[styles.iconButton, isPrimary && styles.iconButtonPrimary, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={20} color={isPrimary ? '#ffffff' : '#4b5563'} />
    </TouchableOpacity>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={22} color="#2563eb" />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel && onAction ? <SecondaryButton icon="arrow-forward-outline" label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function RoomHint({ room }: { room: Room }) {
  return (
    <View style={styles.hint}>
      <Text style={styles.help}>
        {room.kind === 'group'
          ? `群聊成员：${room.members.map((member) => `@${member.alias}`).join('、')}。使用 @all 并行回复，或 @all-seq 接力协作。`
          : `单聊：${room.members[0]?.alias ?? 'Hermes'}`}
      </Text>
    </View>
  );
}

type AgentTheme = { symbol: string; bg: string; border: string; text: string };

function getAgentTheme(alias: string): AgentTheme {
  const normalized = alias.toLowerCase();
  if (normalized.includes('flor')) return { symbol: 'F', bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d' };
  if (normalized.includes('laper')) return { symbol: 'L', bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' };
  if (normalized.includes('aril')) return { symbol: 'A', bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' };
  if (normalized.includes('derux')) return { symbol: 'D', bg: '#ecfdf5', border: '#bbf7d0', text: '#047857' };
  const first = alias.trim().slice(0, 1).toUpperCase() || 'S';
  const palette = [
    { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
    { bg: '#eef2ff', border: '#c7d2fe', text: '#4338ca' },
    { bg: '#f0fdfa', border: '#99f6e4', text: '#0f766e' },
    { bg: '#fefce8', border: '#fde68a', text: '#a16207' },
  ];
  const index = alias.split('').reduce((total, char) => total + char.charCodeAt(0), 0) % palette.length;
  return { symbol: first, ...(palette[index] ?? palette[0]!) };
}

function getAgentStatusColor(status: 'idle' | 'running' | 'delegated' | 'gm' | 'disabled'): string {
  if (status === 'running') return '#2563eb';
  if (status === 'delegated') return '#f59e0b';
  if (status === 'gm') return '#7c3aed';
  if (status === 'disabled') return '#d1d5db';
  return '#22c55e';
}

function getHealthMetricStyle(tone: 'ok' | 'error' | 'checking' | 'unknown') {
  if (tone === 'ok') return styles.healthMetricOk;
  if (tone === 'error') return styles.healthMetricError;
  if (tone === 'checking') return styles.healthMetricChecking;
  return styles.healthMetricUnknown;
}

function getHealthBadgeStyle(status: ConnectionHealth['status']) {
  if (status === 'ok') return styles.healthBadgeOk;
  if (status === 'error') return styles.healthBadgeError;
  if (status === 'checking') return styles.healthBadgeChecking;
  return styles.healthBadgeUnknown;
}

function getStatusTokenStyle(tone: 'default' | 'rp' | 'memory' | 'warning') {
  if (tone === 'rp') return styles.statusTokenRp;
  if (tone === 'memory') return styles.statusTokenMemory;
  if (tone === 'warning') return styles.statusTokenWarning;
  return styles.statusTokenDefault;
}

function getStatusTokenTextStyle(tone: 'default' | 'rp' | 'memory' | 'warning') {
  if (tone === 'rp') return styles.statusTokenTextRp;
  if (tone === 'memory') return styles.statusTokenTextMemory;
  if (tone === 'warning') return styles.statusTokenTextWarning;
  return styles.statusTokenTextDefault;
}

function getStatusTokenColor(tone: 'default' | 'rp' | 'memory' | 'warning'): string {
  if (tone === 'rp') return '#7c3aed';
  if (tone === 'memory') return '#0f766e';
  if (tone === 'warning') return '#b45309';
  return '#2563eb';
}

const styles = StyleSheet.create({
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  tabActive: { backgroundColor: '#111827', borderColor: '#111827' },
  tabText: { color: '#4b5563', fontWeight: '700' },
  tabTextActive: { color: '#ffffff' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#2563eb', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 8 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d1d5db', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8 },
  secondaryButtonText: { color: '#374151', fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
  attachmentPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 10, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' },
  attachmentThumb: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#d1fae5' },
  attachmentIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#d1fae5' },
  attachmentInfo: { flex: 1, minWidth: 0 },
  attachmentName: { fontWeight: '800', color: '#064e3b' },
  attachmentSummary: { marginTop: 2, color: '#047857', fontSize: 12 },
  profileCard: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#f5f3ff' },
  profileCardEmpty: { gap: 6, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  profileTitle: { fontWeight: '900', color: '#4c1d95' },
  profileUpdated: { color: '#6d28d9', fontSize: 12 },
  profilePersona: { color: '#312e81', fontWeight: '700' },
  profileLine: { gap: 2 },
  profileLabel: { color: '#6d28d9', fontSize: 12, fontWeight: '800' },
  profileText: { color: '#312e81', lineHeight: 19 },
  help: { color: '#6b7280', lineHeight: 20 },
  statusToken: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  statusTokenDefault: { backgroundColor: '#ffffff', borderColor: '#e5e7eb' },
  statusTokenRp: { backgroundColor: '#faf5ff', borderColor: '#ddd6fe' },
  statusTokenMemory: { backgroundColor: '#f0fdfa', borderColor: '#ccfbf1' },
  statusTokenWarning: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statusTokenText: { fontSize: 12, fontWeight: '700' },
  statusTokenTextDefault: { color: '#1d4ed8' },
  statusTokenTextRp: { color: '#6d28d9' },
  statusTokenTextMemory: { color: '#0f766e' },
  statusTokenTextWarning: { color: '#b45309' },
  agentAvatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  agentAvatarText: { fontWeight: '900' },
  agentBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberChipText: { fontWeight: '800', color: '#374151' },
  memberChipTextSelected: { color: '#ffffff' },
  memberChipTextDisabled: { color: '#9ca3af' },
  agentStatusDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1 },
  healthMetric: { flex: 1, borderRadius: 12, padding: 10, borderWidth: 1 },
  healthMetricOk: { backgroundColor: '#ecfdf5', borderColor: '#bbf7d0' },
  healthMetricError: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  healthMetricChecking: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  healthMetricUnknown: { backgroundColor: '#f9fafb', borderColor: '#e5e7eb' },
  healthMetricValue: { fontWeight: '900', color: '#111827', fontSize: 18 },
  healthMetricLabel: { color: '#6b7280', fontSize: 12 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  healthBadgeOk: { color: '#047857', backgroundColor: '#d1fae5' },
  healthBadgeError: { color: '#b91c1c', backgroundColor: '#fee2e2' },
  healthBadgeChecking: { color: '#1d4ed8', backgroundColor: '#dbeafe' },
  healthBadgeUnknown: { color: '#6b7280', backgroundColor: '#f3f4f6' },
  healthDetails: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  healthDetailText: { color: '#374151' },
  healthCheckedAt: { color: '#9ca3af', fontSize: 12 },
  miniButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: '#f3f4f6' },
  miniButtonText: { color: '#4b5563', fontSize: 12, fontWeight: '700' },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  iconButtonPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff' },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff' },
  emptyTitle: { color: '#111827', fontWeight: '900', fontSize: 18, textAlign: 'center' },
  emptyBody: { color: '#6b7280', lineHeight: 21, textAlign: 'center' },
  hint: { padding: 10, borderRadius: 14, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
});
