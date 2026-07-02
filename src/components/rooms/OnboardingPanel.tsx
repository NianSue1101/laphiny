import type { ComponentType } from 'react';
import { View, type TextProps } from 'react-native';

import type { OnboardingStep } from '../../lib/stage4_plus';
import { SecondaryButton } from '../Primitives';

type OnboardingPanelProps = {
  steps: OnboardingStep[];
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onDismiss: () => void;
};

export function OnboardingPanel({ steps, styles, TextComponent: Text, onDismiss }: OnboardingPanelProps) {
  return (
    <View style={styles.onboardingPanel}>
      <View style={styles.syncHeader}>
        <View>
          <Text style={styles.cardTitle}>第一次启动：把 Soul 小队带进房间</Text>
          <Text style={styles.help}>跟着这几步完成连接、协作卡片、房间和记忆胶囊。完成后这里会自动隐藏。</Text>
        </View>
        <SecondaryButton icon="close-outline" label="稍后" onPress={onDismiss} />
      </View>
      {steps.map((step, index) => (
        <View key={step.id} style={styles.onboardingStep}>
          <Text style={[styles.onboardingIndex, step.done && styles.onboardingIndexDone]}>{step.done ? 'OK' : index + 1}</Text>
          <View style={styles.rowMain}>
            <Text style={styles.conflictItemTitle}>{step.title}</Text>
            <Text style={styles.help}>{step.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
