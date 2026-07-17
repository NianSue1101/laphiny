import { useState, type ComponentType } from 'react';
import { View, type TextProps } from 'react-native';

import type { OnboardingStep } from '../../lib/stage4_plus';
import { DisclosureSection, SecondaryButton } from '../Primitives';

type OnboardingPanelProps = {
  steps: OnboardingStep[];
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onDismiss: () => void;
};

export function OnboardingPanel({ steps, styles, TextComponent: Text, onDismiss }: OnboardingPanelProps) {
  const [open, setOpen] = useState(false);
  const completedSteps = steps.filter((step) => step.done).length;

  return (
    <DisclosureSection
      icon="compass-outline"
      title="新手引导"
      summary={`${completedSteps}/${steps.length} 已完成 · 连接、协作卡片、房间与记忆`}
      open={open}
      onToggle={() => setOpen((current) => !current)}
    >
      <Text style={styles.help}>按需查看剩余步骤；全部完成后会自动隐藏。</Text>
      {steps.map((step, index) => (
        <View key={step.id} style={styles.onboardingStep}>
          <Text style={[styles.onboardingIndex, step.done && styles.onboardingIndexDone]}>{step.done ? 'OK' : index + 1}</Text>
          <View style={styles.rowMain}>
            <Text style={styles.conflictItemTitle}>{step.title}</Text>
            <Text style={styles.help}>{step.body}</Text>
          </View>
        </View>
      ))}
      <View style={styles.toolActions}>
        <SecondaryButton icon="close-outline" label="暂时隐藏引导" onPress={onDismiss} />
      </View>
    </DisclosureSection>
  );
}
