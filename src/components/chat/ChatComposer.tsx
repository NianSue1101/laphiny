import { useState, type ComponentType, type ReactNode } from 'react';
import {
  ScrollView,
  TouchableOpacity,
  View,
  type TextInputProps,
  type TextProps,
} from 'react-native';

import type { Attachment, Room } from '../../types';
import { AttachmentPreview, IconButton, MiniButton } from '../Primitives';

type Styles = Record<string, any>;

interface ChatComposerProps {
  room?: Room | null;
  draft: string;
  pendingAttachments: Attachment[];
  selectedTargetIds: string[];
  selectedTargetSet: ReadonlySet<string>;
  sending: boolean;
  isDarkMode: boolean;
  androidKeyboardLift: number;
  modeBar: ReactNode;
  slashCommandPanel: ReactNode;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  TextInputComponent: ComponentType<TextInputProps>;
  onSelectAllTargets: () => void;
  onToggleTargetSelection: (connectionId: string) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onAttachImages: () => void;
  onAttachDocuments: () => void;
  onChangeDraft: (text: string) => void;
  onFocusInput: () => void;
  onSendMessage: () => void;
}

export function ChatComposer({
  room,
  draft,
  pendingAttachments,
  selectedTargetIds,
  selectedTargetSet,
  sending,
  isDarkMode,
  androidKeyboardLift,
  modeBar,
  slashCommandPanel,
  styles,
  TextComponent,
  TextInputComponent,
  onSelectAllTargets,
  onToggleTargetSelection,
  onPreviewAttachment,
  onRemoveAttachment,
  onAttachImages,
  onAttachDocuments,
  onChangeDraft,
  onFocusInput,
  onSendMessage,
}: ChatComposerProps) {
  const Text = TextComponent;
  const TextInput = TextInputComponent;
  const enabledMembers = room?.members.filter((member) => member.enabled) ?? [];
  const allTargetsSelected = Boolean(room && selectedTargetIds.length === enabledMembers.length);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);

  return (
    <View style={[styles.composer, isDarkMode && styles.composerDark, androidKeyboardLift > 0 && { marginBottom: androidKeyboardLift }]}>
      {room?.kind === 'group' ? (
        <View style={styles.mentionBar}>
          <Text style={styles.mentionHint}>本次回复</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mentionList}>
            <TouchableOpacity
              style={[styles.mentionChip, allTargetsSelected && styles.mentionChipSelected]}
              onPress={onSelectAllTargets}
            >
              <Text style={styles.mentionChipText}>@all</Text>
            </TouchableOpacity>
            {room.members.map((member) => (
              <TouchableOpacity
                key={member.connectionId}
                style={[
                  styles.mentionChip,
                  selectedTargetSet.has(member.connectionId) && styles.mentionChipSelected,
                  !member.enabled && styles.mentionChipDisabled,
                ]}
                onPress={() => onToggleTargetSelection(member.connectionId)}
                disabled={!member.enabled}
              >
                <Text style={[styles.mentionChipText, selectedTargetSet.has(member.connectionId) && styles.mentionChipTextSelected]}>
                  @{member.alias}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {modeBar}
      {slashCommandPanel}

      {pendingAttachments.length ? (
        <View style={styles.pendingAttachments}>
          {pendingAttachments.map((attachment) => (
            <View key={attachment.id} style={styles.pendingAttachmentRow}>
              <View style={styles.pendingAttachmentPreviewCell}>
                <AttachmentPreview
                  attachment={attachment}
                  actionIcon="eye-outline"
                  onPress={() => onPreviewAttachment(attachment)}
                />
              </View>
              <IconButton
                icon="close-outline"
                label={`移除 ${attachment.name}`}
                onPress={() => onRemoveAttachment(attachment.id)}
              />
            </View>
          ))}
        </View>
      ) : null}

      {attachmentMenuOpen ? (
        <View style={styles.composerAttachmentMenu}>
          <Text style={styles.mentionHint}>添加附件</Text>
          <View style={styles.toolActions}>
            <MiniButton icon="image-outline" label="图片" onPress={() => {
              setAttachmentMenuOpen(false);
              onAttachImages();
            }} />
            <MiniButton icon="document-attach-outline" label="文件" onPress={() => {
              setAttachmentMenuOpen(false);
              onAttachDocuments();
            }} />
          </View>
        </View>
      ) : null}

      <View style={styles.composerInputRow}>
        <IconButton
          icon={attachmentMenuOpen ? 'close-outline' : 'attach-outline'}
          label={attachmentMenuOpen ? '收起附件菜单' : '添加附件'}
          onPress={() => setAttachmentMenuOpen((open) => !open)}
          disabled={!room}
        />
        <TextInput
          style={[styles.composerInput, isDarkMode && styles.inputDark]}
          placeholder={getComposerPlaceholder(room)}
          placeholderTextColor="#9ca3af"
          multiline
          value={draft}
          onChangeText={onChangeDraft}
          onFocus={onFocusInput}
          textAlignVertical="top"
        />
        <IconButton icon={sending ? 'hourglass-outline' : 'send'} label="发送" onPress={onSendMessage} disabled={!room} variant="primary" />
      </View>
    </View>
  );
}

function getComposerPlaceholder(room?: Room | null): string {
  if (room?.kind === 'group') {
    return room.roleplay?.enabled
      ? '输入角色行动，或 /rp /scene /ooc'
      : '@成员名、@all 或 /council 后输入消息';
  }
  return '输入消息';
}
