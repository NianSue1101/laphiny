import type { ComponentType } from 'react';
import { View, type TextProps } from 'react-native';

import type { SoulRelationEdge } from '../lib/stage4_plus';
import { AgentAvatar, HealthMetric } from './Primitives';

interface SoulRelationsPanelProps {
  relations: SoulRelationEdge[];
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
}

export function SoulRelationsPanel({ relations, styles, TextComponent: Text }: SoulRelationsPanelProps) {
  return (
    <View style={styles.diagnosticPanel}>
      <View style={styles.syncHeader}>
        <View>
          <Text style={styles.cardTitle}>Soul 关系图</Text>
          <Text style={styles.help}>根据委托、完成、互相引用统计 Agent 之间的协作关系。</Text>
        </View>
        <Text style={styles.squareCount}>{relations.length} 条关系</Text>
      </View>
      {relations.length ? relations.map((edge) => (
        <View key={edge.id} style={styles.relationCard}>
          <View style={styles.relationHeader}>
            <AgentAvatar alias={edge.fromName} size={26} />
            <Text style={styles.relationArrow}>→</Text>
            <AgentAvatar alias={edge.toName} size={26} />
            <View style={styles.rowMain}>
              <Text style={styles.conflictItemTitle}>{edge.fromName} → {edge.toName}</Text>
              <Text style={styles.help}>{edge.label} · 强度 {edge.strength}</Text>
            </View>
          </View>
          <View style={styles.healthMetricRow}>
            <HealthMetric label="委托" value={edge.delegations} tone={edge.delegations ? 'checking' : 'unknown'} />
            <HealthMetric label="完成" value={edge.completions} tone={edge.completions ? 'ok' : 'unknown'} />
            <HealthMetric label="引用" value={edge.mentions} tone={edge.mentions ? 'checking' : 'unknown'} />
          </View>
        </View>
      )) : <Text style={styles.help}>还没有足够的协作数据。多进行几次委托或接力后，这里会出现关系图。</Text>}
    </View>
  );
}
