import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { DEFAULT_CONTEXT_LIMIT, MAX_DELEGATION_DEPTH } from '../../config/app_config';
import { getRenderableMessageArtifacts } from '../../lib/chat_rendering';
import type { ChatNoticeAction } from '../../lib/chat_notice_actions';
import type { ChatMessage, GoalSession, RoomMember } from '../../types';
import { ActiveGoalPanel } from '../ActiveGoalPanel';
import { ChatSidebar } from '../ChatSidebar';
import { CollaborationDrawer } from '../CollaborationDrawer';
import { ComposerModeBar, SlashCommandPanel } from '../ChatCommandPanels';
import { MessageSearchPanel } from '../MessageSearchPanel';
import { MobileRoomPicker } from '../MobileRoomPicker';
import { QuickCommandsPanel } from '../QuickCommandsPanel';
import { RoleplayArchivePanel } from '../RoleplayArchivePanel';
import { RoleplaySceneCard } from '../RoleplaySceneCard';
import { RoomCollaborationDashboard } from '../RoomCollaborationDashboard';
import { RoomGrowthPanel } from '../RoomGrowthPanel';
import { RoomRail } from '../RoomRail';
import { RoomStatusBar } from '../RoomStatusBar';
import { TaskBoardPanel } from '../TaskBoardPanel';
import { RoomToolsPanel } from '../rooms';
import {
  ChatComposer,
  ChatQuickSettingsSheet,
  ChatMessagesList,
  ChatRoomHeader,
  FocusedChatHeader,
  MessageBubble,
  MobileRoomDetailsDrawer,
  InlineDelegationTaskCard,
} from './index';

export function ChatWorkspace(props: any) {
  const [quickSettingsAction, setQuickSettingsAction] = useState<ChatNoticeAction | null>(null);
  const {
    activeStreamIds,
    addMemberToSelectedRoom,
    addRoomBlackboardItem,
    addRoomDecisionRecord,
    addRoomKnowledgeItem,
    adjustRoomContextLimit,
    androidKeyboardLift,
    applyRoomModeInline,
    applyTeamTemplateToSelectedRoom,
    attachDocuments,
    attachImages,
    availableConnectionsForSelectedRoom,
    blackboardDraft,
    clearRoleplayArchive,
    clearRoomMemoryCapsule,
    clearSelectedRoomMessages,
    collaborationDrawerOpen,
    collaborationPanelOpen,
    confirmPendingRoomMemoryCapsule,
    copyAgentReply,
    decisionRationaleDraft,
    decisionTitleDraft,
    deleteSelectedRoom,
    discardPendingRoomMemoryCapsule,
    dispatchMessage,
    draft,
    exportSelectedRoom,
    exportCollaborationReport,
    generateRoleplayArchive,
    generateRoomMemoryCapsule,
    generateRoomSummary,
    getConnectionAvatarUri,
    getDelegationTaskStatusStyle,
    getGoalPlanItemStatusStyle,
    handleMessagesContentSizeChange,
    handleMessagesScroll,
    messageHistoryRuntime,
    insertMention,
    insertUxCommand,
    isDarkMode,
    isWideLayout,
    keyboardAvoidanceEnabled,
    knowledgeBodyDraft,
    knowledgeTitleDraft,
    lastEditableUserMessage,
    leaveFocusedChat,
    memoryGenerating,
    beginEditLastUserMessage,
    messageScrollRef,
    messageSearchQuery,
    messageSearchResults,
    messagesByRoom,
    mobileDetailsTouchStartRef,
    mobileFocusedChat,
    mobileFocusedRoomId,
    mobileRoomDetailsOpen,
    normalizedSearchQuery,
    openFocusedChatRoom,
    openRoomManagement,
    pendingAttachments,
    pendingMessageScrollToEndRef,
    quickCommandsOpen,
    removeMemberFromSelectedRoom,
    removeRoomBlackboardItem,
    removeRoomDecisionRecord,
    removeRoomKnowledgeItem,
    resetRoomSession,
    resolveAgentPermissionRequest,
    retryMessage,
    retryDelegationTask,
    roomDetailsCollapsed,
    roomDetailsMaxHeight,
    roomGrowthPanel,
    roomStreamSummaries,
    roomToolsOpen,
    rooms,
    rpArchiveGenerating,
    runQuickCommand,
    runRitualCommand,
    selectedFontFamily,
    showReasoning,
    showMessageDate,
    selectedMessages,
    selectedRoom,
    selectedRoomCollaborationEvents,
    selectedRoomDelegationTasks,
    selectedRoomGrowth,
    selectedRoomId,
    selectedRoomSoulRelations,
    selectedRoomTeamTemplates,
    selectedTargetIds,
    selectedTargetSet,
    selectedTaskBoard,
    selectAllTargets,
    sending,
    sendMessage,
    saveSelectedRoomAsTeamTemplate,
    setBlackboardDraft,
    setCollaborationDrawerOpen,
    setCollaborationPanelOpen,
    setDecisionRationaleDraft,
    setDecisionTitleDraft,
    setDraft,
    setKnowledgeBodyDraft,
    setKnowledgeTitleDraft,
    setMessageSearchQuery,
    setMobileRoomDetailsOpen,
    setPendingAttachments,
    setQuickCommandsOpen,
    setRoomDefaultCollaborationMode,
    setRoomDetailsCollapsed,
    setRoomSummaryConnection,
    setRoomToolsOpen,
    setTab,
    setTeamTemplateName,
    setPreviewAttachment,
    stopMessage,
    stoppingStreamIds,
    styles,
    summaryGenerating,
    slashCommandSuggestions,
    taskBoardPanel,
    teamTemplateName,
    Text,
    TextInput,
    toggleRoomAutoDelegation,
    toggleRoomToolDelegation,
    toggleRoomMemberEnabledInline,
    toggleSelectedRoomRoleplay,
    toggleTargetSelection,
    updateContextLimit,
    updateRoomBlackboardItemStatus,
    updateRoomDecisionStatus,
    updateRoomDelegationDepth,
    updateRoomDelegationsPerRound,
    updateSelectedRoomMember,
    updateSelectedRoomRoleplay,
    unreadByRoom,
    visibleSelectedMessages,
    width,
  } = props;
  const {
    historyByRoom,
    historyLoadError,
    historySearchError,
    loadEarlierMessages,
    refreshMessageHistory,
    searchingFullHistory,
  } = messageHistoryRuntime;
  // The 900px breakpoint enables the desktop shell; the collaboration drawer
  // needs more room, so it uses a separate, explicit breakpoint.
  const isCollaborationLayout = isWideLayout && width >= 1200;
  function renderMessageBubble(message: ChatMessage) {
    const inlineDelegations = selectedRoomDelegationTasks.filter((task: any) => task.sourceMessageId === message.id);
    return (
      <View style={styles.messageThreadItem}>
        <MessageBubble
          message={message}
          renderable={getRenderableMessageArtifacts(message)}
          isDarkMode={isDarkMode}
          isWideLayout={isCollaborationLayout}
          selectedFontFamily={selectedFontFamily}
          showReasoning={showReasoning}
          showMessageDate={showMessageDate}
          isLastEditableUserMessage={message.id === lastEditableUserMessage?.id}
          sending={sending}
          stopping={Boolean(stoppingStreamIds[message.id])}
          styles={styles}
          TextComponent={Text}
          getConnectionAvatarUri={getConnectionAvatarUri}
          getMessageBubbleStyle={getMessageBubbleStyle}
          getMessageRoleBadge={getMessageRoleBadge}
          onPreviewAttachment={setPreviewAttachment}
          onResolvePermissionRequest={resolveAgentPermissionRequest}
          onCopyAgentReply={copyAgentReply}
          onStopMessage={stopMessage}
          onRetryMessage={retryMessage}
          onEditLastUserMessage={beginEditLastUserMessage}
          onOpenNoticeAction={setQuickSettingsAction}
        />
        {inlineDelegations.map((task: any) => (
          <InlineDelegationTaskCard
            key={task.id}
            task={task}
            styles={styles}
            TextComponent={Text}
            onRetry={(item) => void retryDelegationTask(item)}
          />
        ))}
      </View>
    );
  }

  function renderChatComposer() {
    return (
      <ChatComposer
        room={selectedRoom}
        draft={draft}
        pendingAttachments={pendingAttachments}
        selectedTargetIds={selectedTargetIds}
        selectedTargetSet={selectedTargetSet}
        sending={sending}
        isDarkMode={isDarkMode}
        androidKeyboardLift={androidKeyboardLift}
        modeBar={renderComposerModeBar()}
        slashCommandPanel={renderSlashCommandPanel()}
        styles={styles}
        TextComponent={Text}
        TextInputComponent={TextInput}
        onSelectAllTargets={selectAllTargets}
        onToggleTargetSelection={toggleTargetSelection}
        onPreviewAttachment={setPreviewAttachment}
        onRemoveAttachment={(attachmentId) => setPendingAttachments((current: any[]) => current.filter((item: any) => item.id !== attachmentId))}
        onAttachImages={attachImages}
        onAttachDocuments={attachDocuments}
        onChangeDraft={setDraft}
        onFocusInput={() => {
          pendingMessageScrollToEndRef.current = true;
          setTimeout(() => messageScrollRef.current?.scrollToEnd({ animated: true }), 180);
        }}
        onSendMessage={sendMessage}
      />
    );
  }

  function renderChatRoomHeader(focused: boolean) {
    if (!selectedRoom || focused) return null;
    return (
      <ChatRoomHeader
        room={selectedRoom}
        roomDetailsOpen={!roomDetailsCollapsed}
        quickCommandsOpen={quickCommandsOpen}
        roomToolsOpen={roomToolsOpen}
        collaborationDrawerOpen={collaborationDrawerOpen}
        isWideLayout={isWideLayout}
        roomDetailsMaxHeight={roomDetailsMaxHeight}
        selectedTargetIds={selectedTargetIds}
        selectedTargetSet={selectedTargetSet}
        contextLimitFallback={DEFAULT_CONTEXT_LIMIT}
        detailsLeadContent={(
          <>
            {renderRoomStatusBar()}
            {renderActiveGoalPanel()}
            {renderRoleplaySceneCard()}
          </>
        )}
        detailsTailContent={(
          <>
            {quickCommandsOpen ? renderQuickCommands() : null}
            {roomToolsOpen ? renderRoomTools() : null}
            {renderMessageSearchPanel()}
            {!isWideLayout ? renderRoomCollaborationDashboard() : null}
          </>
        )}
        styles={styles}
        TextComponent={Text}
        getConnectionAvatarUri={getConnectionAvatarUri}
        getMemberRuntimeStatus={getMemberRuntimeStatus}
        onSelectAllTargets={selectAllTargets}
        onToggleTargetSelection={toggleTargetSelection}
        onInsertMention={insertMention}
        onToggleQuickCommands={() => {
          setRoomDetailsCollapsed(false);
          setQuickCommandsOpen((open: boolean) => !open);
        }}
        onToggleRoomTools={() => {
          setRoomDetailsCollapsed(false);
          setRoomToolsOpen((open: boolean) => !open);
        }}
        onToggleCollaborationDrawer={() => setCollaborationDrawerOpen((open: boolean) => !open)}
        onToggleRoomDetails={() => setRoomDetailsCollapsed((collapsed: boolean) => !collapsed)}
      />
    );
  }

  function renderChatMessagesList() {
    return (
      <ChatMessagesList
        messageScrollRef={messageScrollRef}
        room={selectedRoom}
        messages={visibleSelectedMessages}
        normalizedSearchQuery={normalizedSearchQuery}
        styles={styles}
        TextComponent={Text}
        hasOlderMessages={Boolean(selectedRoom && (historyByRoom[selectedRoom.id]?.nextOlderPage ?? -1) >= 0)}
        loadingOlderMessages={Boolean(selectedRoom && historyByRoom[selectedRoom.id]?.loading)}
        historyError={selectedRoom ? historyByRoom[selectedRoom.id]?.error ?? historyLoadError : historyLoadError}
        renderMessageBubble={renderMessageBubble}
        onContentSizeChange={handleMessagesContentSizeChange}
        onScroll={handleMessagesScroll}
        onOpenRoomsTab={() => setTab('rooms')}
        onLoadOlderMessages={() => selectedRoom && void loadEarlierMessages(selectedRoom.id)}
        onRetryHistory={() => {
          if (selectedRoom && historyByRoom[selectedRoom.id]?.error) {
            void loadEarlierMessages(selectedRoom.id);
          } else {
            void refreshMessageHistory();
          }
        }}
      />
    );
  }

  function renderChat() {
    const focused = !isWideLayout && selectedRoom && mobileFocusedRoomId === selectedRoom.id;
    if (!isWideLayout && !focused && roomDetailsCollapsed && !roomToolsOpen && !quickCommandsOpen && !normalizedSearchQuery) {
      return renderMobileRoomPicker();
    }

    return (
        <View style={[styles.content, isDarkMode && styles.contentDark, isWideLayout && styles.chatDesktop, focused && styles.focusedChatContent]}>
        {isWideLayout ? renderChatSidebar() : focused ? null : renderRoomRail()}
        <KeyboardAvoidingView
          style={[styles.chatMain, focused && styles.focusedChatMain, focused && isDarkMode && styles.focusedChatMainDark]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          enabled={keyboardAvoidanceEnabled}
          onTouchStart={focused ? handleMobileDetailsTouchStart : undefined}
          onTouchEnd={focused ? handleMobileDetailsTouchEnd : undefined}
        >

        {focused ? renderFocusedChatHeader() : null}
        {focused ? renderMobileRoomDetailsDrawer() : null}

        {renderChatRoomHeader(Boolean(focused))}

        {renderChatMessagesList()}

        {renderChatComposer()}
        <ChatQuickSettingsSheet
          action={quickSettingsAction}
          room={selectedRoom}
          sending={sending}
          styles={styles}
          TextComponent={Text}
          onClose={() => setQuickSettingsAction(null)}
          onUpdateDelegationsPerRound={updateRoomDelegationsPerRound}
          onToggleAutoDelegation={toggleRoomAutoDelegation}
          onToggleToolDelegation={toggleRoomToolDelegation}
          onConfirmMemory={() => {
            confirmPendingRoomMemoryCapsule();
            setQuickSettingsAction(null);
          }}
          onDiscardMemory={() => {
            discardPendingRoomMemoryCapsule();
            setQuickSettingsAction(null);
          }}
          onGenerateMemory={() => {
            generateRoomMemoryCapsule();
            setQuickSettingsAction(null);
          }}
          onContinueGoal={() => {
            if (selectedRoom?.activeGoal) continueActiveGoalFromPanel(selectedRoom.activeGoal);
            setQuickSettingsAction(null);
          }}
          onAdjustGoal={() => {
            if (selectedRoom?.activeGoal) {
              const activeGoal = selectedRoom.activeGoal;
              setDraft(`/goal @${activeGoal.leadAlias} ${activeGoal.goal} `);
            }
            setQuickSettingsAction(null);
          }}
          onToggleRoleplay={toggleSelectedRoomRoleplay}
        />
        </KeyboardAvoidingView>
        {isCollaborationLayout && collaborationDrawerOpen ? renderCollaborationDrawer() : null}
      </View>
    );
  }

  function renderFocusedChatHeader() {
    if (!selectedRoom) return null;
    return (
      <FocusedChatHeader
        room={selectedRoom}
        isDarkMode={isDarkMode}
        detailsOpen={mobileRoomDetailsOpen}
        styles={styles}
        TextComponent={Text}
        onBack={leaveFocusedChat}
        onToggleDetails={() => setMobileRoomDetailsOpen((open: boolean) => !open)}
      />
    );
  }

  function renderMobileRoomDetailsDrawer() {
    if (!selectedRoom || !mobileRoomDetailsOpen) return null;
    return (
      <MobileRoomDetailsDrawer
        room={selectedRoom}
        isDarkMode={isDarkMode}
        isWideLayout={isWideLayout}
        selectedFontFamily={selectedFontFamily}
        memoryGenerating={memoryGenerating}
        leadContent={(
          <>
            {renderRoomStatusBar()}
            {renderActiveGoalPanel()}
            {renderRoleplaySceneCard()}
          </>
        )}
        roomGrowthPanel={renderRoomGrowthPanel()}
        taskBoardPanel={renderTaskBoardPanel()}
        collaborationDashboard={renderRoomCollaborationDashboard()}
        styles={styles}
        TextComponent={Text}
        onClose={() => setMobileRoomDetailsOpen(false)}
        onConfirmPendingMemory={confirmPendingRoomMemoryCapsule}
        onDiscardPendingMemory={discardPendingRoomMemoryCapsule}
        onGenerateMemory={generateRoomMemoryCapsule}
        onExportCollaborationReport={exportCollaborationReport}
      />
    );
  }

  function renderMobileRoomPicker() {
    return (
      <MobileRoomPicker
        rooms={rooms}
        messagesByRoom={messagesByRoom}
        unreadByRoom={unreadByRoom}
        roomStreamSummaries={roomStreamSummaries}
        isDarkMode={isDarkMode}
        styles={styles}
        TextComponent={Text}
        onCreateRoom={() => setTab('rooms')}
        onOpenRoom={openFocusedChatRoom}
        onManageRoom={openRoomManagement}
      />
    );
  }

  function renderRoomRail() {
    return (
      <RoomRail
        rooms={rooms}
        selectedRoomId={selectedRoomId}
        unreadByRoom={unreadByRoom}
        roomStreamSummaries={roomStreamSummaries}
        styles={styles}
        TextComponent={Text}
        onOpenRoom={openFocusedChatRoom}
        onCreateRoom={() => setTab('rooms')}
      />
    );
  }

  function renderChatSidebar() {
    return (
      <ChatSidebar
        rooms={rooms}
        selectedRoomId={selectedRoomId}
        messagesByRoom={messagesByRoom}
        unreadByRoom={unreadByRoom}
        roomStreamSummaries={roomStreamSummaries}
        styles={styles}
        TextComponent={Text}
        onOpenRoom={openFocusedChatRoom}
        onCreateRoom={() => setTab('rooms')}
      />
    );
  }

  function getMemberRuntimeStatus(member: RoomMember): 'idle' | 'running' | 'delegated' | 'gm' | 'disabled' {
    if (!member.enabled) return 'disabled';
    if (selectedRoom?.roleplay?.enabled && selectedRoom.roleplay.gmConnectionId === member.connectionId) return 'gm';
    if (selectedMessages.some((message: ChatMessage) => message.authorId === member.connectionId && message.status === 'running')) return 'running';
    if (selectedRoomDelegationTasks.some((task: any) => task.toConnectionId === member.connectionId && (task.status === 'pending' || task.status === 'running'))) return 'delegated';
    return 'idle';
  }

  function getMessageBubbleStyle(message: ChatMessage) {
    if (message.authorId === 'user') return styles.userMessage;
    if (message.authorId === 'system') return styles.systemMessage;
    if (message.delegatedFrom) return styles.delegatedMessage;
    if (selectedRoom?.roleplay?.enabled && selectedRoom.roleplay.gmConnectionId === message.authorId) return styles.gmMessage;
    if (selectedRoom?.roleplay?.enabled && message.authorId !== 'user') return styles.rpCharacterMessage;
    return styles.agentMessage;
  }

  function getMessageRoleBadge(message: ChatMessage): string {
    if (message.delegatedFrom) return '委托';
    if (selectedRoom?.roleplay?.enabled && selectedRoom.roleplay.gmConnectionId === message.authorId) return 'GM';
    if (selectedRoom?.roleplay?.enabled && message.authorId !== 'user') return '入戏';
    if (message.status === 'running') return '思考';
    return 'Soul';
  }

  function handleMobileDetailsTouchStart(event: any) {
    if (!mobileFocusedChat) return;
    const touch = event.nativeEvent.touches?.[0];
    if (!touch) return;
    mobileDetailsTouchStartRef.current = { x: touch.pageX, y: touch.pageY };
  }

  function handleMobileDetailsTouchEnd(event: any) {
    const start = mobileDetailsTouchStartRef.current;
    mobileDetailsTouchStartRef.current = null;
    if (!mobileFocusedChat || !start) return;
    const touch = event.nativeEvent.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.pageX - start.x;
    const dy = touch.pageY - start.y;
    if (Math.abs(dy) > 80 || Math.abs(dx) < 58) return;
    if (dx < 0) {
      setMobileRoomDetailsOpen(true);
    } else if (dx > 0 && mobileRoomDetailsOpen) {
      setMobileRoomDetailsOpen(false);
    }
  }

  function renderRoomStatusBar() {
    return (
      <RoomStatusBar
        room={selectedRoom}
        delegationTasks={selectedRoomDelegationTasks}
        streamSummary={selectedRoom ? roomStreamSummaries[selectedRoom.id] : undefined}
        styles={styles}
      />
    );
  }

  function renderActiveGoalPanel() {
    return (
      <ActiveGoalPanel
        activeGoal={selectedRoom?.activeGoal}
        styles={styles}
        TextComponent={Text}
        getPlanItemStatusStyle={getGoalPlanItemStatusStyle}
        onContinue={continueActiveGoalFromPanel}
        onFinish={finishActiveGoalFromPanel}
        onAdjust={(activeGoal) => setDraft(`/goal @${activeGoal.leadAlias} ${activeGoal.goal} `)}
      />
    );
  }

  function continueActiveGoalFromPanel(activeGoal: GoalSession) {
    if (!selectedRoom || sending) return;
    void dispatchMessage(selectedRoom, '继续', []);
  }

  function finishActiveGoalFromPanel(activeGoal: GoalSession) {
    if (!selectedRoom || sending) return;
    void dispatchMessage(selectedRoom, '结束', []);
  }

  function renderRoleplaySceneCard() {
    return <RoleplaySceneCard room={selectedRoom} styles={styles} TextComponent={Text} />;
  }

  function renderComposerModeBar() {
    return (
      <ComposerModeBar
        room={selectedRoom}
        quickCommandsOpen={quickCommandsOpen}
        isWideLayout={isWideLayout}
        styles={styles}
        TextComponent={Text}
        onToggleQuickCommands={() => setQuickCommandsOpen((open: boolean) => !open)}
        onInsertCommand={insertUxCommand}
      />
    );
  }

  function renderSlashCommandPanel() {
    return (
      <SlashCommandPanel
        room={selectedRoom}
        suggestions={slashCommandSuggestions}
        styles={styles}
        TextComponent={Text}
        onInsertCommand={insertUxCommand}
      />
    );
  }

  function renderCollaborationDrawer() {
    return (
      <CollaborationDrawer
        room={selectedRoom}
        taskBoard={selectedTaskBoard}
        delegationTasks={selectedRoomDelegationTasks}
        collaborationEvents={selectedRoomCollaborationEvents}
        growth={selectedRoomGrowth}
        selectedFontFamily={selectedFontFamily}
        styles={styles}
        TextComponent={Text}
        getDelegationTaskStatusStyle={getDelegationTaskStatusStyle}
        onRetryDelegation={(task) => void retryDelegationTask(task)}
        onReassignDelegation={(task, targetConnectionId) => void retryDelegationTask(task, targetConnectionId)}
        streamSummary={selectedRoom ? roomStreamSummaries[selectedRoom.id] : undefined}
        onClose={() => setCollaborationDrawerOpen(false)}
      />
    );
  }

  function renderMessageSearchPanel() {
    return (
      <MessageSearchPanel
        query={messageSearchQuery}
        results={messageSearchResults}
        selectedRoomId={selectedRoomId}
        loading={searchingFullHistory}
        error={historySearchError}
        styles={styles}
        TextComponent={Text}
        TextInputComponent={TextInput}
        onChangeQuery={setMessageSearchQuery}
        onOpenRoom={openFocusedChatRoom}
      />
    );
  }

  function renderRoomCollaborationDashboard() {
    return (
      <RoomCollaborationDashboard
        room={selectedRoom}
        open={collaborationPanelOpen}
        growth={selectedRoomGrowth}
        delegationTasks={selectedRoomDelegationTasks}
        collaborationEvents={selectedRoomCollaborationEvents}
        selectedFontFamily={selectedFontFamily}
        styles={styles}
        TextComponent={Text}
        getDelegationTaskStatusStyle={getDelegationTaskStatusStyle}
        onRetryDelegation={(task) => void retryDelegationTask(task)}
        onReassignDelegation={(task, targetConnectionId) => void retryDelegationTask(task, targetConnectionId)}
        onToggleOpen={() => setCollaborationPanelOpen((open: boolean) => !open)}
      />
    );
  }

  function renderQuickCommands() {
    return (
      <QuickCommandsPanel
        room={selectedRoom}
        sending={sending}
        styles={styles}
        TextComponent={Text}
        onRunQuickCommand={runQuickCommand}
        onRunRitualCommand={runRitualCommand}
        onInsertUxCommand={insertUxCommand}
      />
    );
  }

  function renderRoomTools() {
    if (!selectedRoom) return null;
    return (
      <RoomToolsPanel
        room={selectedRoom}
        messages={messagesByRoom[selectedRoom.id] ?? []}
        contextLimitFallback={DEFAULT_CONTEXT_LIMIT}
        maxDelegationDepthFallback={MAX_DELEGATION_DEPTH}
        selectedFontFamily={selectedFontFamily}
        teamTemplateName={teamTemplateName}
        selectedRoomTeamTemplates={selectedRoomTeamTemplates}
        availableConnectionsForRoom={availableConnectionsForSelectedRoom}
        summaryGenerating={summaryGenerating}
        memoryGenerating={memoryGenerating}
        roleplayArchivePanel={renderRoleplayArchivePanel()}
        taskBoardPanel={renderTaskBoardPanel()}
        roomGrowthPanel={renderRoomGrowthPanel()}
        styles={styles}
        TextComponent={Text}
        TextInputComponent={TextInput}
        onOpenRoomManagement={openRoomManagement}
        onSetDefaultCollaborationMode={setRoomDefaultCollaborationMode}
        onToggleRoomAutoDelegation={toggleRoomAutoDelegation}
        onToggleRoomToolDelegation={toggleRoomToolDelegation}
        onUpdateRoomDelegationsPerRound={updateRoomDelegationsPerRound}
        onUpdateRoomDelegationDepth={updateRoomDelegationDepth}
        onToggleRoomRoleplay={toggleSelectedRoomRoleplay}
        onUpdateRoomRoleplay={updateSelectedRoomRoleplay}
        onUpdateRoomMember={updateSelectedRoomMember}
        onRemoveRoomMember={removeMemberFromSelectedRoom}
        onAddRoomMember={addMemberToSelectedRoom}
        onChangeTeamTemplateName={setTeamTemplateName}
        onSaveTeamTemplate={saveSelectedRoomAsTeamTemplate}
        onApplyTeamTemplate={applyTeamTemplateToSelectedRoom}
        onSetSummaryConnection={setRoomSummaryConnection}
        onGenerateSummary={generateRoomSummary}
        onConfirmPendingMemory={confirmPendingRoomMemoryCapsule}
        onDiscardPendingMemory={discardPendingRoomMemoryCapsule}
        onGenerateMemory={generateRoomMemoryCapsule}
        onClearMemory={clearRoomMemoryCapsule}
        onExportRoom={exportSelectedRoom}
        onExportCollaborationReport={exportCollaborationReport}
        onResetSession={resetRoomSession}
        onClearMessages={clearSelectedRoomMessages}
        onDeleteRoom={deleteSelectedRoom}
      />
    );
  }

  function renderRoleplayArchivePanel() {
    return (
      <RoleplayArchivePanel
        room={selectedRoom}
        generating={rpArchiveGenerating}
        styles={styles}
        TextComponent={Text}
        onGenerate={generateRoleplayArchive}
        onClear={clearRoleplayArchive}
      />
    );
  }

  function renderTaskBoardPanel() {
    return <TaskBoardPanel room={selectedRoom} columns={selectedTaskBoard} styles={styles} TextComponent={Text} />;
  }

  function renderRoomGrowthPanel() {
    return (
      <RoomGrowthPanel
        room={selectedRoom}
        growth={selectedRoomGrowth}
        soulRelations={selectedRoomSoulRelations}
        knowledgeTitleDraft={knowledgeTitleDraft}
        knowledgeBodyDraft={knowledgeBodyDraft}
        blackboardDraft={blackboardDraft}
        decisionTitleDraft={decisionTitleDraft}
        decisionRationaleDraft={decisionRationaleDraft}
        styles={styles}
        TextComponent={Text}
        TextInputComponent={TextInput}
        onChangeKnowledgeTitle={setKnowledgeTitleDraft}
        onChangeKnowledgeBody={setKnowledgeBodyDraft}
        onAddKnowledgeItem={addRoomKnowledgeItem}
        onRemoveKnowledgeItem={removeRoomKnowledgeItem}
        onChangeBlackboardDraft={setBlackboardDraft}
        onAddBlackboardItem={addRoomBlackboardItem}
        onUpdateBlackboardStatus={updateRoomBlackboardItemStatus}
        onRemoveBlackboardItem={removeRoomBlackboardItem}
        onChangeDecisionTitle={setDecisionTitleDraft}
        onChangeDecisionRationale={setDecisionRationaleDraft}
        onAddDecisionRecord={addRoomDecisionRecord}
        onUpdateDecisionStatus={updateRoomDecisionStatus}
        onRemoveDecisionRecord={removeRoomDecisionRecord}
      />
    );
  }
  return renderChat();
}
