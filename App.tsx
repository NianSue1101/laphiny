import 'react-native-url-polyfill/auto';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, BackHandler, FlatList, NativeScrollEvent, NativeSyntheticEvent, Platform, Keyboard, SafeAreaView, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';

import { APP_VERSION, DEFAULT_CONTEXT_LIMIT, DEFAULT_MODEL, MAX_DELEGATION_DEPTH } from './src/config/app_config';
import { AppShellHeader } from './src/components/AppShellHeader';
import { AppText as Text, AppTextInput as TextInput, setAppTextFontFamily } from './src/components/AppText';
import { AttachmentPreviewModal } from './src/components/AttachmentPreviewModal';
import { ChatWorkspace } from './src/components/chat';
import { ConnectionsTab } from './src/components/connections';
import { RoomManagementPanel } from './src/components/RoomManagementPanel';
import { OnboardingPanel, RoomsTab } from './src/components/rooms';
import { RuntimeBanner } from './src/components/RuntimeBanner';
import { SquareTab } from './src/components/square/SquareTab';
import { SettingsTab } from './src/components/settings';
import { Ionicons } from './src/components/SafeIcon';
import { getDelegationTaskStatusStyle, getGoalPlanItemStatusStyle, styles } from './src/app/app_styles';
import {
  buildSearchSnippet,
  findPreviousUserMessageIndex,
  formatBytes,
  getErrorMessage,
  makeAssistantPlaceholder,
  makeId,
  mergeByUpdatedAt,
  mergeCollaborationEvents,
  mergeDelegationTasks,
  mergeMessagesByRoom,
  mergeProfileVersions,
  mergeSquareEvents,
  requestConfirm,
  showNotice,
} from './src/app/app_utils';
import type { MessageSearchResult, QuickCommand, ScheduledReply, StorageBackendInfo, Tab } from './src/app/app_types';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

import { buildAgentPermissionDecisionPrompt, getAgentPermissionKey } from './src/lib/agent_permissions';
import { COLLABORATION_RITUALS, type CollaborationRitualId } from './src/lib/collaboration_rituals';
import { parseGoalPlanItems, parseGoalStatusSignal } from './src/lib/goal_mode';
import { buildGoalMemoryCapsule, getGoalStatusFromSignal, mergeGoalPlanItems } from './src/lib/goal_session';
import { summarizeRoomGrowth } from './src/lib/room_growth';
import { makeDefaultRoleplayConfig } from './src/lib/roleplay';
import { buildOnboardingSteps, buildSoulRelations, buildTaskBoard, getRoomModeDefinition } from './src/lib/stage4_plus';
import { getSlashCommandSuggestions, type UXCommandDefinition } from './src/lib/ux';
import { buildAppBackup as buildAppBackupData, buildSyncSnapshot as buildSyncSnapshotData, normalizeBackupSnapshot, type SyncSnapshotCollections } from './src/lib/sync_snapshot';
import { DEFAULT_FEEDBACK_BASE_URL, useDiagnosticsRuntime } from './src/hooks/useDiagnosticsRuntime';
import { useConnectionRuntime } from './src/hooks/useConnectionRuntime';
import { useChatDispatchRuntime } from './src/hooks/useChatDispatchRuntime';
import { useDownloadRuntime } from './src/hooks/useDownloadRuntime';
import { useAppPersistence } from './src/hooks/useAppPersistence';
import { useMessageHistoryRuntime } from './src/hooks/useMessageHistoryRuntime';
import { useAppUiEffects } from './src/hooks/useAppUiEffects';
import { usePwaRuntime } from './src/hooks/usePwaRuntime';
import { useRoomAiRuntime } from './src/hooks/useRoomAiRuntime';
import { useRoomCreationRuntime } from './src/hooks/useRoomCreationRuntime';
import { useRoomToolsRuntime } from './src/hooks/useRoomToolsRuntime';
import { useReplyNotifications } from './src/hooks/useReplyNotifications';
import { useStreamRegistry } from './src/hooks/useStreamRegistry';
import { useSyncEffects } from './src/hooks/useSyncEffects';
import { useSyncRuntime } from './src/hooks/useSyncRuntime';
import { AgentPermissionDecision, AgentPermissionRequest, AgentProfileVersion, AppPreferences, Attachment, ChatMessage, CollaborationEvent, DelegationTask, GoalSession, HermesConnection, Room, RoomMember, SquareEvent, SyncConfig, SyncSnapshot, TeamTemplate, RoomModeId } from './src/types';

const MESSAGE_AUTO_SCROLL_THRESHOLD = 96;

type MessageListSignature = {
  roomId: string | null;
  messageCount: number;
  lastMessageId: string | null;
};

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [connections, setConnections] = useState<HermesConnection[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  const [squareEvents, setSquareEvents] = useState<SquareEvent[]>([]);
  const [collaborationEvents, setCollaborationEvents] = useState<CollaborationEvent[]>([]);
  const [delegationTasks, setDelegationTasks] = useState<DelegationTask[]>([]);
  const [teamTemplates, setTeamTemplates] = useState<TeamTemplate[]>([]);
  const [profileVersions, setProfileVersions] = useState<AgentProfileVersion[]>([]);
  const [appPreferences, setAppPreferences] = useState<AppPreferences>({ themeMode: 'light', fontFamily: 'system', showReasoning: false, updatedAt: new Date().toISOString() });
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [managedRoomId, setManagedRoomId] = useState<string | null>(null);
  const [, forceFontRender] = useState(0);
  const [storageBackend, setStorageBackend] = useState<StorageBackendInfo | null>(null);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({ enabled: false, baseUrl: '', apiKey: '', updatedAt: new Date().toISOString() });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<Tab>('chat');
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [quickCommandsOpen, setQuickCommandsOpen] = useState(false);
  const [collaborationDrawerOpen, setCollaborationDrawerOpen] = useState(true);
  const [roomToolsOpen, setRoomToolsOpen] = useState(false);
  const [roomDetailsCollapsed, setRoomDetailsCollapsed] = useState(true);
  const [backupPaste, setBackupPaste] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [collaborationPanelOpen, setCollaborationPanelOpen] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [mobileFocusedRoomId, setMobileFocusedRoomId] = useState<string | null>(null);
  const [mobileRoomDetailsOpen, setMobileRoomDetailsOpen] = useState(false);
  const [fontsLoaded] = useFonts({
    LXGWWenKai: require('./assets/fonts/LXGWWenKai-Regular.ttf'),
  });
  const hydratedRef = useRef(false);
  const messageScrollRef = useRef<FlatList<ChatMessage> | null>(null);
  const messageListAtBottomRef = useRef(true);
  const pendingMessageScrollToEndRef = useRef(false);
  const messageListSignatureRef = useRef<MessageListSignature>({ roomId: null, messageCount: 0, lastMessageId: null });
  const saveMessagesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayedGoalMessageIdsRef = useRef<Set<string>>(new Set());
  const alwaysApprovedPermissionKeysRef = useRef<Set<string>>(new Set());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const selectedRoomIdRef = useRef<string | null>(selectedRoomId);
  const tabRef = useRef<Tab>(tab);
  const roomsRef = useRef<Room[]>(rooms);
  const mobileDetailsTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pollingSquareEventsRef = useRef(false);
  const { width, height } = useWindowDimensions();
  const {
    activeStreamIds,
    stoppingStreamIds,
    cleanupAllStreams,
    cleanupStream,
    flushStreamMessage,
    queueStreamMessageUpdate,
    registerStreamController,
    setStreamActive,
    stopMessage,
  } = useStreamRegistry(updateMessageInRoom);
  const {
    copyAgentReply,
    downloadAttachment,
    saveTextFile,
  } = useDownloadRuntime({
    appPreferences,
    updateAppPreferences,
    copyText: (text) => Clipboard.setStringAsync(text),
  });
  const {
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
  } = useDiagnosticsRuntime({
    getDiagnosticContext: () => ({
      connections,
      rooms,
      messagesByRoom,
      storageBackend,
      messageBytes: storageSummary.messageBytes,
      networkOnline,
      serviceWorkerStatus,
      pwaInstalled,
      width,
      layoutMode,
    }),
    saveTextFile,
  });
  const {
    networkOnline,
    pwaInstallPrompt,
    pwaInstalled,
    serviceWorkerStatus,
    installPwa,
  } = usePwaRuntime({ appendDiagnosticLog });
  const {
    roomReplyNotification,
    notifyAgentReplyFinished,
    notifyGoalSessionFinished,
    openReplyNotification,
    setRoomReplyNotification,
    showRoomReplyNotification,
  } = useReplyNotifications({
    appStateRef,
    roomsRef,
    selectedRoomIdRef,
    tabRef,
    openFocusedChatRoom,
  });
  const {
    connectionEditForm,
    connectionForm,
    connectionHealth,
    editingConnectionId,
    healthSummary,
    jsonPaste,
    profilingConnectionId,
    testingConnectionId,
    addConnection,
    beginEditConnection,
    cancelEditConnection,
    chooseConnectionAvatar,
    clearConnectionAvatar,
    deleteConnection,
    handlePasteImport,
    importConnections,
    refreshAgentProfile,
    refreshConnectionHealth,
    saveConnectionEdit,
    setConnectionEditForm,
    setConnectionForm,
    setJsonPaste,
    testConnection,
    toggleConnection,
  } = useConnectionRuntime({
    connections,
    rooms,
    selectedRoomId,
    setConnections,
    setRooms,
    setMessagesByRoom,
    setProfileVersions,
    setSelectedRoomId,
    setSelectedTargetIds,
    appendDiagnosticLog,
  });
  const {
    checkingSyncConflicts,
    syncConflictReport,
    syncing,
    autoPullSyncSnapshot,
    checkSyncConflicts,
    clearSyncConflictReport,
    pullSyncSnapshot,
    pushSyncSnapshot,
    testSyncBackend,
  } = useSyncRuntime({
    syncConfig,
    setSyncConfig,
    buildSyncSnapshot,
    applySyncSnapshot,
    appendDiagnosticLog,
    showNotice,
    getLocalMeta: () => ({ rooms: rooms.length, connections: connections.length }),
  });
  useSyncEffects({
    autoPullSyncSnapshot,
    hydrated,
    pollingSquareEventsRef,
    setSquareEvents,
    setSyncConfig,
    setUnreadByRoom,
    squareEvents,
    syncConfig,
    tab,
  });
  const maxWindowHeightRef = useRef(height);
  const isDarkMode = appPreferences.themeMode === 'dark';
  const selectedFontFamily = appPreferences.fontFamily === 'lxgw-wenkai' && fontsLoaded ? 'LXGWWenKai' : undefined;

  selectedRoomIdRef.current = selectedRoomId;
  tabRef.current = tab;
  roomsRef.current = rooms;
  if (height > maxWindowHeightRef.current) {
    maxWindowHeightRef.current = height;
  }

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    appStateRef.current = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, []);


  useEffect(() => {
    setAppTextFontFamily(selectedFontFamily);
    forceFontRender((value) => value + 1);
  }, [selectedFontFamily]);

  useAppPersistence({
    hydratedRef,
    saveMessagesTimerRef,
    cleanupAllStreams,
    replaceDiagnosticLogs,
    setHydrated,
    setConnections,
    setRooms,
    setMessagesByRoom,
    setSyncConfig,
    setAppPreferences,
    setFeedbackConfig,
    setSquareEvents,
    setCollaborationEvents,
    setDelegationTasks,
    setTeamTemplates,
    setProfileVersions,
    setStorageBackend,
    setSelectedRoomId,
    connections,
    rooms,
    messagesByRoom,
    syncConfig,
    appPreferences,
    feedbackConfig,
    squareEvents,
    diagnosticLogs,
    collaborationEvents,
    delegationTasks,
    teamTemplates,
    profileVersions,
  });

  const connectionById = useMemo(() => new Map(connections.map((connection) => [connection.id, connection])), [connections]);
  const enabledConnections = useMemo(() => connections.filter((connection) => connection.enabled), [connections]);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedMessages = selectedRoom ? messagesByRoom[selectedRoom.id] ?? [] : [];
  const lastEditableUserMessage = [...selectedMessages].reverse().find((message) => message.authorId === 'user') ?? null;
  const normalizedSearchQuery = messageSearchQuery.trim().toLowerCase();
  const {
    historyByRoom,
    historySearchError,
    loadEarlierMessages,
    searchingFullHistory,
    searchMessagesByRoom,
  } = useMessageHistoryRuntime({
    hydrated,
    normalizedSearchQuery,
    setMessagesByRoom,
  });
  const messageSearchSourceByRoom = useMemo(() => (
    searchMessagesByRoom ? mergeMessagesByRoom(searchMessagesByRoom, messagesByRoom) : messagesByRoom
  ), [messagesByRoom, searchMessagesByRoom]);
  const {
    groupMemberDraftIds,
    groupName,
    attachDocuments,
    attachImages,
    createDirectRoom,
    createGroupRoom,
    createStarterRoom,
    setGroupMemberDraftIds,
    setGroupName,
  } = useRoomCreationRuntime({
    enabledConnections,
    rooms,
    setPendingAttachments,
    setRooms,
    appendCollaborationEvent,
    openFocusedChatRoom,
  });
  const {
    blackboardDraft,
    decisionRationaleDraft,
    decisionTitleDraft,
    knowledgeBodyDraft,
    knowledgeTitleDraft,
    roomNameDraft,
    teamTemplateName,
    addMemberToSelectedRoom,
    addRoomBlackboardItem,
    addRoomDecisionRecord,
    addRoomKnowledgeItem,
    applyAgentRoomStatePatch,
    applyRoomMode,
    applyTeamTemplateToSelectedRoom,
    clearRoleplayArchive,
    clearRoomMemoryCapsule,
    clearSelectedRoomMessages,
    confirmPendingRoomMemoryCapsule,
    deleteSelectedRoom,
    deleteTeamTemplate,
    discardPendingRoomMemoryCapsule,
    exportSelectedRoom,
    removeMemberFromSelectedRoom,
    removeRoomBlackboardItem,
    removeRoomDecisionRecord,
    removeRoomKnowledgeItem,
    renameSelectedRoom,
    resetRoomSession,
    restoreProfileVersion,
    saveSelectedRoomAsTeamTemplate,
    setBlackboardDraft,
    setDecisionRationaleDraft,
    setDecisionTitleDraft,
    setKnowledgeBodyDraft,
    setKnowledgeTitleDraft,
    setRoomDefaultCollaborationMode,
    setRoomNameDraft,
    setRoomSummaryConnection,
    setTeamTemplateName,
    toggleRoomAutoDelegation,
    toggleSelectedRoomRoleplay,
    updateContextLimit,
    updateRoomBlackboardItemStatus,
    updateRoomById,
    updateRoomDecisionStatus,
    updateRoomDelegationDepth,
    updateSelectedRoom,
    updateSelectedRoomMember,
    updateSelectedRoomRoleplay,
  } = useRoomToolsRuntime({
    selectedRoom,
    roomsRef,
    messagesByRoom,
    setConnections,
    setMessagesByRoom,
    setRooms,
    setSelectedRoomId,
    setSelectedTargetIds,
    setTeamTemplates,
    setUnreadByRoom,
    setRoomToolsOpen,
    appendCollaborationEvent,
    appendDiagnosticLog,
    appendMessagesToRoom,
  });
  const {
    memoryGenerating,
    rpArchiveGenerating,
    summaryGenerating,
    generateRitualConsensus,
    generateRoleplayArchive,
    generateRoomMemoryCapsule,
    generateRoomSummary,
  } = useRoomAiRuntime({
    selectedRoom,
    messagesByRoom,
    connections,
    connectionById,
    appendMessagesToRoom,
    appendCollaborationEvent,
    appendDiagnosticLog,
    updateRoomById,
    updateSelectedRoom,
    updateSelectedRoomRoleplay,
  });
  const {
    dispatchMessage,
    streamHermesReply,
  } = useChatDispatchRuntime({
    appendCollaborationEvent,
    appendDiagnosticLog,
    appendMessagesToRoom,
    applyAgentRoomStatePatch,
    applyAlwaysPermissionIfNeeded,
    applyGoalAssistantResult,
    cleanupStream,
    connectionById,
    connections,
    continueAgentAfterPermission,
    createDelegationTask,
    delayedGoalMessageIdsRef,
    finishActiveGoal,
    flushStreamMessage,
    generateRitualConsensus,
    messagesByRoom,
    notifyAgentReplyFinished,
    queueStreamMessageUpdate,
    registerStreamController,
    selectedTargetIds,
    setDraft,
    setPendingAttachments,
    setSelectedTargetIds,
    setStreamActive,
    showRoomReplyNotification,
    updateDelegationTask,
    updateMessageInRoom,
    updateRoomById,
  });

  useEffect(() => {
    if (tab !== 'chat' || !selectedRoomId) return;
    setRoomReplyNotification((current) => (current?.roomId === selectedRoomId ? null : current));
  }, [selectedRoomId, tab]);
  const messageSearchResults = useMemo(() => {
    if (!normalizedSearchQuery) return [] as MessageSearchResult[];
    const results: MessageSearchResult[] = [];
    for (const room of rooms) {
      for (const message of messageSearchSourceByRoom[room.id] ?? []) {
        const haystack = [room.name, message.authorName, message.content, ...(message.attachments?.map((attachment) => attachment.name) ?? [])]
          .join('\n')
          .toLowerCase();
        if (haystack.includes(normalizedSearchQuery)) {
          results.push({
            room,
            message,
            snippet: buildSearchSnippet(message, messageSearchQuery),
          });
        }
      }
    }
    return results.sort((a, b) => b.message.createdAt.localeCompare(a.message.createdAt)).slice(0, 50);
  }, [messageSearchSourceByRoom, rooms, normalizedSearchQuery, messageSearchQuery]);
  const selectedSearchMessageIds = useMemo(() => new Set(
    messageSearchResults
      .filter((result) => result.room.id === selectedRoomId)
      .map((result) => result.message.id),
  ), [messageSearchResults, selectedRoomId]);
  const visibleSelectedMessages = normalizedSearchQuery
    ? (messageSearchSourceByRoom[selectedRoomId ?? ''] ?? selectedMessages).filter((message) => selectedSearchMessageIds.has(message.id))
    : selectedMessages;
  const latestVisibleMessage = visibleSelectedMessages.length > 0
    ? visibleSelectedMessages[visibleSelectedMessages.length - 1] ?? null
    : null;

  useEffect(() => {
    const previous = messageListSignatureRef.current;
    const roomChanged = selectedRoomId !== previous.roomId;
    const messageAppended = selectedRoomId === previous.roomId && visibleSelectedMessages.length > previous.messageCount;
    const latestMessageChanged = selectedRoomId === previous.roomId && latestVisibleMessage?.id !== previous.lastMessageId;

    if (roomChanged) {
      messageListAtBottomRef.current = true;
      pendingMessageScrollToEndRef.current = true;
      scrollMessagesToEnd(false);
    } else if ((messageAppended || latestMessageChanged) && messageListAtBottomRef.current) {
      pendingMessageScrollToEndRef.current = true;
    }

    messageListSignatureRef.current = {
      roomId: selectedRoomId,
      messageCount: visibleSelectedMessages.length,
      lastMessageId: latestVisibleMessage?.id ?? null,
    };
  }, [selectedRoomId, visibleSelectedMessages.length, latestVisibleMessage?.id]);

  function scrollMessagesToEnd(animated: boolean) {
    requestAnimationFrame(() => {
      messageScrollRef.current?.scrollToEnd({ animated });
    });
  }

  function handleMessagesScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    messageListAtBottomRef.current = distanceFromBottom <= MESSAGE_AUTO_SCROLL_THRESHOLD;
  }

  function handleMessagesContentSizeChange() {
    const shouldScrollToEnd = pendingMessageScrollToEndRef.current || messageListAtBottomRef.current;
    if (!shouldScrollToEnd) return;

    const animated = !pendingMessageScrollToEndRef.current;
    pendingMessageScrollToEndRef.current = false;
    scrollMessagesToEnd(animated);
  }

  const availableConnectionsForSelectedRoom = useMemo(() => {
    if (!selectedRoom || selectedRoom.kind !== 'group') return [] as HermesConnection[];
    const existing = new Set(selectedRoom.members.map((member) => member.connectionId));
    return connections.filter((connection) => !existing.has(connection.id));
  }, [connections, selectedRoom]);
  const selectedRoomCollaborationEvents = useMemo(() => {
    if (!selectedRoom) return [] as CollaborationEvent[];
    return collaborationEvents
      .filter((event) => event.roomId === selectedRoom.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 24);
  }, [collaborationEvents, selectedRoom]);
  const selectedRoomDelegationTasks = useMemo(() => {
    if (!selectedRoom) return [] as DelegationTask[];
    return delegationTasks
      .filter((task) => task.roomId === selectedRoom.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 12);
  }, [delegationTasks, selectedRoom]);
  const selectedRoomTeamTemplates = useMemo(() => {
    if (!selectedRoom || selectedRoom.kind !== 'group') return [] as TeamTemplate[];
    const memberSet = new Set(selectedRoom.members.map((member) => member.connectionId));
    return teamTemplates.filter((template) => template.memberOrder.some((id) => memberSet.has(id)));
  }, [selectedRoom, teamTemplates]);
  const latestProfileVersions = useMemo(() => {
    return [...profileVersions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
  }, [profileVersions]);
  const selectedTaskBoard = useMemo(() => buildTaskBoard(selectedRoomDelegationTasks), [selectedRoomDelegationTasks]);
  const soulRelations = useMemo(() => buildSoulRelations({ rooms, connections, collaborationEvents, delegationTasks, messagesByRoom }), [rooms, connections, collaborationEvents, delegationTasks, messagesByRoom]);
  const selectedRoomSoulRelations = useMemo(() => (
    selectedRoom
      ? buildSoulRelations({
          rooms: [selectedRoom],
          connections,
          collaborationEvents: selectedRoomCollaborationEvents,
          delegationTasks: selectedRoomDelegationTasks,
          messagesByRoom: { [selectedRoom.id]: messagesByRoom[selectedRoom.id] ?? [] },
        })
      : []
  ), [connections, messagesByRoom, selectedRoom, selectedRoomCollaborationEvents, selectedRoomDelegationTasks]);
  const selectedRoomGrowth = useMemo(() => selectedRoom ? summarizeRoomGrowth(selectedRoom) : null, [selectedRoom]);
  const onboardingSteps = useMemo(() => buildOnboardingSteps({ connections, rooms }), [connections, rooms]);
  const onboardingComplete = onboardingSteps.every((step) => step.done);
  const layoutMode = width >= 1200 ? 'desktop' : width >= 900 ? 'wide' : width >= 700 ? 'tablet' : 'compact';
  const isWideLayout = width >= 900;
  const mobileFocusedChat = !isWideLayout && tab === 'chat' && Boolean(selectedRoom && mobileFocusedRoomId === selectedRoom.id);
  const keyboardAvoidanceEnabled = Platform.OS !== 'web' && !isWideLayout;
  const androidWindowAlreadyResized = Platform.OS === 'android'
    && keyboardHeight > 0
    && height < maxWindowHeightRef.current - 80;
  const androidKeyboardLift = Platform.OS === 'android' && keyboardAvoidanceEnabled && !androidWindowAlreadyResized
    ? Math.min(keyboardHeight, Math.floor(height * 0.45))
    : 0;
  const roomDetailsMaxHeight = Math.max(
    180,
    Math.floor(height * (keyboardAvoidanceEnabled && keyboardHeight > 0 ? 0.28 : 0.42)),
  );
  // Other rooms and members can keep streaming while the user starts a new turn.
  // The dispatch runtime serializes each individual member where necessary.
  const sending = selectedMessages.some((message) => message.status === 'running');
  const totalUnread = Object.values(unreadByRoom).reduce<number>((total, count) => total + Number(count ?? 0), 0);
  const selectedTargetSet = useMemo(() => new Set(selectedTargetIds), [selectedTargetIds]);
  const slashCommandSuggestions = useMemo(() => getSlashCommandSuggestions(draft), [draft]);
  useAppUiEffects({
    isWideLayout,
    managedRoomId,
    mobileFocusedRoomId,
    rooms,
    selectedRoomId,
    setManagedRoomId,
    setMessageSearchQuery,
    setMobileFocusedRoomId,
    setMobileRoomDetailsOpen,
    setQuickCommandsOpen,
    setRoomDetailsCollapsed,
    setRoomToolsOpen,
    setSelectedTargetIds,
    setUnreadByRoom,
    tab,
    totalUnread,
  });

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (mobileRoomDetailsOpen) {
        setMobileRoomDetailsOpen(false);
        return true;
      }
      if (mobileFocusedChat) {
        leaveFocusedChat();
        return true;
      }
      if (tab !== 'chat') {
        setTab('chat');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [mobileFocusedChat, mobileRoomDetailsOpen, tab]);

  const storageSummary = useMemo(() => {
    const messageBytes = JSON.stringify(messagesByRoom).length;
    const messageCount = Object.values(messagesByRoom).reduce<number>((total, messages) => total + (Array.isArray(messages) ? messages.length : 0), 0);
    return {
      messageBytes,
      messageCount,
      messageSizeLabel: formatBytes(messageBytes),
    };
  }, [messagesByRoom]);









  function appendMessagesToRoom(roomId: string, messages: ChatMessage[]) {
    setMessagesByRoom((current) => ({
      ...current,
      [roomId]: [...(current[roomId] ?? []), ...messages],
    }));
    for (const message of messages) {
      if (message.authorId === 'system') {
        appendSquareEvent(makeSquareEventFromMessage(roomId, message));
      }
    }
    const incomingCount = messages.filter((message) => message.authorId !== 'user').length;
    if (incomingCount > 0 && (roomId !== selectedRoomId || tab !== 'chat')) {
      setUnreadByRoom((current) => ({
        ...current,
        [roomId]: (current[roomId] ?? 0) + incomingCount,
      }));
    }
    const latestAgentMessage = [...messages].reverse().find((message) => (
      message.authorId !== 'user' && message.authorId !== 'system' && message.status !== 'running'
    ));
    if (latestAgentMessage) {
      showRoomReplyNotification(roomId, latestAgentMessage);
      void notifyAgentReplyFinished(roomId, latestAgentMessage);
    }
  }

  function updateMessageInRoom(roomId: string, messageId: string, patch: Partial<ChatMessage>) {
    let completedMessage: ChatMessage | null = null;
    setMessagesByRoom((current) => ({
      ...current,
      [roomId]: (current[roomId] ?? []).map((message) => (
        message.id === messageId
          ? (() => {
              const next = { ...message, ...patch };
              if (message.authorId !== 'user' && patch.status && patch.status !== 'running') {
                completedMessage = next;
              }
              return next;
            })()
          : message
      )),
    }));
    const finishedMessage = completedMessage as ChatMessage | null;
    if (finishedMessage) {
      appendSquareEvent(makeSquareEventFromMessage(roomId, finishedMessage));
      const delayedForGoal = delayedGoalMessageIdsRef.current.has(finishedMessage.id);
      const pendingPermission = finishedMessage.permissionRequest?.status === 'pending';
      if (finishedMessage.status === 'sent' && (!delayedForGoal || pendingPermission)) {
        if (pendingPermission) {
          delayedGoalMessageIdsRef.current.delete(finishedMessage.id);
        }
        showRoomReplyNotification(roomId, finishedMessage);
        void notifyAgentReplyFinished(roomId, finishedMessage);
      }
    }
  }

  function openFocusedChatRoom(roomId: string) {
    setSelectedRoomId(roomId);
    setTab('chat');
    if (!isWideLayout) {
      setMobileFocusedRoomId(roomId);
      setMobileRoomDetailsOpen(false);
      setRoomDetailsCollapsed(true);
      setQuickCommandsOpen(false);
      setRoomToolsOpen(false);
      setMessageSearchQuery('');
    }
  }

  function openRoomManagement(roomId: string) {
    setSelectedRoomId(roomId);
    setManagedRoomId(roomId);
    setTab('rooms');
    setMobileFocusedRoomId(null);
    setMobileRoomDetailsOpen(false);
    setRoomDetailsCollapsed(true);
    setQuickCommandsOpen(false);
    setRoomToolsOpen(false);
    setMessageSearchQuery('');
  }

  function leaveFocusedChat() {
    setMobileRoomDetailsOpen(false);
    setMobileFocusedRoomId(null);
    Keyboard.dismiss();
  }

  function updateRoomInline(roomId: string, patch: Partial<Room>) {
    updateRoomById(roomId, patch);
  }

  function adjustRoomContextLimit(room: Room, delta: number) {
    const currentLimit = room.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
    updateRoomInline(room.id, { contextLimit: Math.max(4, Math.min(80, currentLimit + delta)) });
  }

  function toggleRoomMemberEnabledInline(room: Room, member: RoomMember) {
    updateRoomInline(room.id, {
      members: room.members.map((item) => (
        item.connectionId === member.connectionId ? { ...item, enabled: !item.enabled } : item
      )),
    });
  }

  function applyRoomModeInline(room: Room, mode: RoomModeId) {
    const definition = getRoomModeDefinition(mode);
    updateRoomInline(room.id, {
      mode,
      defaultCollaborationMode: definition.defaultCollaborationMode,
      autoDelegationEnabled: definition.autoDelegationEnabled,
      maxDelegationDepth: room.maxDelegationDepth ?? MAX_DELEGATION_DEPTH,
      roleplay: definition.roleplayEnabled
        ? { ...(room.roleplay ?? makeDefaultRoleplayConfig()), enabled: true, updatedAt: new Date().toISOString() }
        : room.roleplay ? { ...room.roleplay, enabled: false, updatedAt: new Date().toISOString() } : room.roleplay,
    });
  }

  function applyAlwaysPermissionIfNeeded(permissionRequest: AgentPermissionRequest | undefined): AgentPermissionRequest | undefined {
    if (!permissionRequest) return undefined;
    const permissionKey = getAgentPermissionKey(permissionRequest);
    if (!alwaysApprovedPermissionKeysRef.current.has(permissionKey)) return permissionRequest;
    return {
      ...permissionRequest,
      status: 'always',
      decision: 'always',
      decidedAt: new Date().toISOString(),
    };
  }

  async function continueAgentAfterPermission(room: Room, member: RoomMember, message: ChatMessage, decision: AgentPermissionDecision) {
    if (!message.permissionRequest) return;
    const placeholder = makeAssistantPlaceholder(room.id, member);
    appendMessagesToRoom(room.id, [placeholder]);
    await streamHermesReply({
      room,
      member,
      placeholderId: placeholder.id,
      text: buildAgentPermissionDecisionPrompt(message.permissionRequest, decision),
      attachments: [],
      previousMessages: messagesByRoom[room.id] ?? [],
    });
  }

  function resolveAgentPermissionRequest(message: ChatMessage, decision: AgentPermissionDecision) {
    const request = message.permissionRequest;
    if (!request || request.status !== 'pending') return;

    const nextRequest: AgentPermissionRequest = {
      ...request,
      status: decision === 'deny' ? 'denied' : decision === 'always' ? 'always' : 'allowed',
      decision,
      decidedAt: new Date().toISOString(),
    };
    if (decision === 'always') {
      alwaysApprovedPermissionKeysRef.current.add(getAgentPermissionKey(request));
    }
    updateMessageInRoom(message.roomId, message.id, { permissionRequest: nextRequest });

    const room = roomsRef.current.find((item) => item.id === message.roomId);
    const member = room?.members.find((item) => item.connectionId === message.authorId && item.enabled);
    if (!room || !member) {
      showNotice('无法继续权限请求', '对应的房间或 Agent 已不可用。');
      return;
    }

    void continueAgentAfterPermission(room, member, { ...message, permissionRequest: nextRequest }, decision);
  }

  function toggleTargetSelection(connectionId: string) {
    setSelectedTargetIds((current) => (
      current.includes(connectionId)
        ? current.filter((id) => id !== connectionId)
        : [...current, connectionId]
    ));
  }

  function selectAllTargets() {
    if (!selectedRoom) return;
    const enabledMemberIds = selectedRoom.members.filter((member) => member.enabled).map((member) => member.connectionId);
    setSelectedTargetIds((current) => (current.length === enabledMemberIds.length ? [] : enabledMemberIds));
  }

  async function sendMessage() {
    if (!selectedRoom) {
      showNotice('请先创建或选择房间');
      return;
    }

    const rawText = draft.trim();
    await dispatchMessage(selectedRoom, rawText, pendingAttachments);
  }

  async function retryMessage(message: ChatMessage) {
    if (!selectedRoom || message.authorId === 'user' || message.authorId === 'system') return;
    if (activeStreamIds[message.id]) return;

    const member = selectedRoom.members.find((item) => item.connectionId === message.authorId);
    if (!member) {
      showNotice('无法重试', '这个 Hermes 成员不在当前房间中。');
      return;
    }

    const messageIndex = selectedMessages.findIndex((item) => item.id === message.id);
    const userMessageIndex = findPreviousUserMessageIndex(selectedMessages, messageIndex);
    if (userMessageIndex < 0) {
      showNotice('无法重试', '没有找到这条回复对应的用户消息。');
      return;
    }

    const userMessage = selectedMessages[userMessageIndex];
    if (!userMessage) {
      showNotice('无法重试', '这条回复对应的用户消息已不存在。');
      return;
    }

    // Re-dispatch the original message content through dispatchMessage
    // which handles streaming, auto-forward, and all edge cases properly.
    const originalText = userMessage.content.replace(/^\[附件\]$/, '');
    const originalAttachments = userMessage.attachments ?? [];
    await dispatchMessage(selectedRoom, originalText, originalAttachments);
  }

  function insertMention(token: string) {
    setDraft((current) => {
      const spacer = current.length === 0 || /\s$/.test(current) ? '' : ' ';
      return `${current}${spacer}${token} `;
    });
  }

  async function runQuickCommand(command: QuickCommand) {
    if (!selectedRoom) {
      showNotice('请先选择房间');
      return;
    }

    const targetMember = selectedRoom.members.find((member) => (
      member.enabled && member.alias.toLowerCase() === command.targetAlias.toLowerCase()
    ));
    const fallbackMember = selectedRoom.kind === 'direct' ? selectedRoom.members.find((member) => member.enabled) : undefined;
    const member = targetMember ?? fallbackMember;
    if (!member) {
      showNotice('无法发送快捷指令', `当前房间没有可用的 ${command.targetAlias}。`);
      return;
    }

    await dispatchMessage(selectedRoom, command.prompt, [], [member.connectionId]);
  }

  async function runRitualCommand(ritualId: CollaborationRitualId) {
    if (!selectedRoom) {
      showNotice('请先选择房间');
      return;
    }
    if (selectedRoom.kind !== 'group') {
      showNotice('协作仪式只适用于群聊');
      return;
    }
    const ritual = COLLABORATION_RITUALS.find((item) => item.id === ritualId);
    if (!ritual) return;
    const prompt = draft.trim() || '请根据当前房间上下文执行这个协作仪式。';
    await dispatchMessage(selectedRoom, `${ritual.slash} ${prompt}`, pendingAttachments);
  }

  function insertUxCommand(command: UXCommandDefinition) {
    if (command.id === 'memory') {
      setRoomToolsOpen(true);
      setDraft((current) => current.trim() ? current : '请在工具里生成或更新房间记忆胶囊。');
      return;
    }
    setDraft(command.insertText);
    setQuickCommandsOpen(false);
  }

  function getConnectionAvatarUri(connectionId: string): string | undefined {
    return connectionById.get(connectionId)?.avatarUri;
  }

  function updateActiveGoal(roomId: string, updater: (goal: GoalSession) => GoalSession) {
    setRooms((current) => current.map((room) => {
      if (room.id !== roomId || !room.activeGoal) return room;
      return { ...room, activeGoal: updater(room.activeGoal), updatedAt: new Date().toISOString() };
    }));
  }

  function applyGoalAssistantResult(room: Room, reply: ScheduledReply, message: ChatMessage, answer: string) {
    if (!reply.goalMode || !room.activeGoal || reply.member.connectionId !== room.activeGoal.leadConnectionId) return;

    const now = new Date().toISOString();
    const signal = parseGoalStatusSignal(answer);
    const parsedItems = parseGoalPlanItems(answer, room, now);
    updateActiveGoal(room.id, (goal) => {
      const nextStatus = getGoalStatusFromSignal(signal);
      return {
        ...goal,
        round: Math.max(goal.round, reply.goalReviewRound ?? goal.round),
        status: nextStatus,
        statusSignal: signal ?? goal.statusSignal,
        planItems: parsedItems.length ? mergeGoalPlanItems(goal.planItems, parsedItems) : goal.planItems,
        lastReview: answer,
        lastMessageId: message.id,
        updatedAt: now,
      };
    });
  }

  function finishActiveGoal(room: Room, decision: 'finish') {
    const activeGoal = room.activeGoal;
    if (!activeGoal) return;
    const now = new Date().toISOString();
    const finalStatus = activeGoal.statusSignal === 'blocked' ? 'blocked' : 'done';
    const completedGoal: GoalSession = {
      ...activeGoal,
      status: finalStatus,
      userDecision: decision,
      updatedAt: now,
      completedAt: now,
    };
    updateRoomById(room.id, {
      activeGoal: completedGoal,
      pendingMemoryCapsule: buildGoalMemoryCapsule(room, completedGoal, now),
    });
    notifyGoalSessionFinished(room, completedGoal);
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId: room.id,
      roomName: room.name,
      source: 'Laphiny',
      title: '目标记忆草案待确认',
      body: completedGoal.goal,
    });
  }

  function beginEditLastUserMessage() {
    if (!selectedRoom || !lastEditableUserMessage) return;
    const roomMessages = messagesByRoom[selectedRoom.id] ?? [];
    const messageIndex = roomMessages.findIndex((message) => message.id === lastEditableUserMessage.id);
    if (messageIndex < 0) return;

    for (const message of roomMessages.slice(messageIndex + 1)) {
      if (message.status === 'running') {
        stopMessage(message.id);
      }
    }

    setDraft(lastEditableUserMessage.content.replace(/^\[附件\]$/, ''));
    setPendingAttachments(lastEditableUserMessage.attachments ?? []);
    setMessagesByRoom((current) => ({
      ...current,
      [selectedRoom.id]: roomMessages.slice(0, messageIndex),
    }));
    setSelectedTargetIds([]);
    showNotice('已回滚到上一条消息', '你可以在输入框里修改后重新发送。');
  }

  function appendSquareEvent(event: SquareEvent) {
    setSquareEvents((current) => mergeSquareEvents([...current, event]).slice(-300));
  }

  function appendCollaborationEvent(input: Omit<CollaborationEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) {
    const event: CollaborationEvent = {
      ...input,
      id: input.id ?? makeId('collab'),
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    setCollaborationEvents((current) => mergeCollaborationEvents([...current, event]).slice(-500));
    if (event.kind === 'delegation_created' || event.kind === 'summary_created' || event.kind === 'template_applied' || event.kind === 'ritual_started' || event.kind === 'ritual_completed' || event.kind === 'memory_updated' || event.kind === 'roleplay_started' || event.kind === 'roleplay_updated') {
      appendSquareEvent({
        id: `evt_${event.id}`,
        kind: event.kind === 'summary_created' || event.kind === 'ritual_completed' || event.kind === 'memory_updated' ? 'summary' : 'collaboration',
        source: event.source ?? 'Laphiny',
        target: event.target,
        roomId: event.roomId,
        roomName: event.roomName,
        title: event.title,
        body: event.body ?? '',
        createdAt: event.createdAt,
      });
    }
  }

  function updateAppPreferences(patch: Partial<AppPreferences>) {
    setAppPreferences((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  }

  function createDelegationTask(input: Omit<DelegationTask, 'id' | 'status' | 'createdAt' | 'updatedAt'>): DelegationTask {
    const now = new Date().toISOString();
    const task: DelegationTask = {
      ...input,
      id: makeId('task'),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    setDelegationTasks((current) => mergeDelegationTasks([...current, task]).slice(-200));
    appendCollaborationEvent({
      kind: 'delegation_created',
      roomId: input.roomId,
      roomName: input.roomName,
      source: input.fromAlias,
      target: input.toAlias,
      taskId: task.id,
      title: `${input.fromAlias} 委托 ${input.toAlias}`,
      body: input.taskText,
    });
    return task;
  }

  function updateDelegationTask(taskId: string | undefined, patch: Partial<DelegationTask>) {
    if (!taskId) return;
    const now = new Date().toISOString();
    setDelegationTasks((current) => current.map((task) => (
      task.id === taskId
        ? { ...task, ...patch, updatedAt: now, completedAt: patch.status === 'done' || patch.status === 'error' || patch.status === 'cancelled' ? now : task.completedAt }
        : task
    )));
  }

  function makeSquareEventFromMessage(roomId: string, message: ChatMessage): SquareEvent {
    const room = rooms.find((item) => item.id === roomId);
    const kind: SquareEvent['kind'] = message.authorId === 'system' ? 'system' : 'message';
    return {
      id: `evt_${message.id}_${message.status}`,
      kind,
      source: message.authorName,
      roomId,
      roomName: room?.name,
      title: kind === 'system' ? '系统提示' : `${message.authorName} 更新`,
      body: message.error ? `${message.content}\n\n${message.error}` : message.content,
      createdAt: new Date().toISOString(),
    };
  }

  function collectSyncSnapshotCollections(): SyncSnapshotCollections {
    return {
      connections,
      rooms,
      messagesByRoom,
      squareEvents,
      collaborationEvents,
      delegationTasks,
      teamTemplates,
      profileVersions,
    };
  }

  function buildSyncSnapshot(): SyncSnapshot {
    return buildSyncSnapshotData(collectSyncSnapshotCollections());
  }

  function applySyncSnapshot(snapshot: SyncSnapshot) {
    clearSyncConflictReport();
    setConnections((current) => mergeByUpdatedAt(current, snapshot.connections));
    setRooms((current) => mergeByUpdatedAt(current, snapshot.rooms));
    setMessagesByRoom((current) => mergeMessagesByRoom(current, snapshot.messagesByRoom));
    setSquareEvents((current) => mergeSquareEvents([...current, ...(snapshot.squareEvents ?? [])]).slice(-300));
    if (snapshot.collaborationEvents?.length) setCollaborationEvents((current) => mergeCollaborationEvents([...current, ...(snapshot.collaborationEvents ?? [])]).slice(-500));
    if (snapshot.delegationTasks?.length) setDelegationTasks((current) => mergeDelegationTasks([...current, ...(snapshot.delegationTasks ?? [])]).slice(-200));
    if (snapshot.teamTemplates?.length) setTeamTemplates((current) => mergeByUpdatedAt(current, snapshot.teamTemplates ?? []));
    if (snapshot.profileVersions?.length) setProfileVersions((current) => mergeProfileVersions([...current, ...(snapshot.profileVersions ?? [])]).slice(-100));
  }

  function buildAppBackup() {
    return buildAppBackupData(collectSyncSnapshotCollections(), syncConfig, diagnosticLogs);
  }

  async function exportAppBackup() {
    const filename = `laphiny-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const text = JSON.stringify(buildAppBackup(), null, 2);
    const savedTo = await saveTextFile(filename, text, 'application/json');
    if (savedTo) {
      if (Platform.OS === 'web') {
        showNotice('备份下载已开始', '完整备份包含连接、房间、消息和同步配置，可能包含 API Key。请只保存在可信位置。');
      } else if (savedTo.userVisible) {
        showNotice('备份文件已导出', `已保存为 ${filename}。完整备份可能包含 API Key，请只保存在可信位置；如果保存到下载目录，导入完成后建议删除或移到安全位置。`);
      } else {
        await Clipboard.setStringAsync(savedTo.uri);
        showNotice('备份文件已导出', `完整备份可能包含 API Key。系统目录选择不可用，已保存到应用私有目录，路径已复制：${savedTo.uri}`);
      }
      return;
    }

    await Clipboard.setStringAsync(text);
    showNotice('备份已复制', '当前环境无法直接保存文件，完整 JSON 已复制到剪贴板。请妥善保存，其中可能包含 API Key。');
  }

  function importBackupFromText(text: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      showNotice('备份 JSON 格式错误', '文本不是有效 JSON。');
      return;
    }

    const snapshot = normalizeBackupSnapshot(parsed);
    if (!snapshot) {
      showNotice('备份格式不兼容', '没有找到 connections / rooms / messagesByRoom 等必要字段。');
      return;
    }

    requestConfirm('合并恢复备份', '将按 updatedAt 合并连接和房间，并按消息 id 合并聊天记录；不会先清空当前数据。', () => {
      applySyncSnapshot(snapshot);
      if (snapshot.syncConfig) setSyncConfig({ ...snapshot.syncConfig, updatedAt: new Date().toISOString() });
      mergeDiagnosticLogs(snapshot.diagnosticLogs ?? []);
      appendDiagnosticLog({
        level: 'success',
        category: 'storage',
        title: '备份恢复完成',
        message: `连接 ${snapshot.connections.length} 个，房间 ${snapshot.rooms.length} 个。`,
        meta: { connections: snapshot.connections.length, rooms: snapshot.rooms.length },
      });
      setBackupPaste('');
      showNotice('备份已恢复', `连接 ${snapshot.connections.length} 个，房间 ${snapshot.rooms.length} 个。`);
    });
  }

  async function importBackupFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      importBackupFromText(text);
    } catch (error) {
      showNotice('备份导入失败', getErrorMessage(error));
    }
  }

  function handlePasteBackup() {
    const text = backupPaste.trim();
    if (!text) return;
    importBackupFromText(text);
  }

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.muted}>正在加载 Laphiny...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.shell, isDarkMode && styles.shellDark]}>
      <ExpoStatusBar style={isDarkMode ? 'light' : 'dark'} />
      {renderRoomReplyNotification()}
      {!mobileFocusedChat ? (
        <AppShellHeader
          activeTab={tab}
          roomsCount={rooms.length}
          enabledConnectionsCount={enabledConnections.length}
          totalUnread={totalUnread}
          isDarkMode={isDarkMode}
          styles={styles}
          TextComponent={Text}
          onChangeTab={setTab}
        />
      ) : null}
      {!mobileFocusedChat ? renderRuntimeBanner() : null}
      {renderAttachmentPreviewModal()}

      {tab === 'chat' ? (
        <ChatWorkspace
          {...{
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
            generateRoleplayArchive,
            generateRoomMemoryCapsule,
            generateRoomSummary,
            getConnectionAvatarUri,
            getDelegationTaskStatusStyle,
            getGoalPlanItemStatusStyle,
            handleMessagesContentSizeChange,
            handleMessagesScroll,
            historyByRoom,
            historySearchError,
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
            loadEarlierMessages,
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
            roomDetailsCollapsed,
            roomDetailsMaxHeight,
            roomToolsOpen,
            rooms,
            rpArchiveGenerating,
            runQuickCommand,
            runRitualCommand,
             selectedFontFamily,
             showReasoning: Boolean(appPreferences.showReasoning),
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
            searchingFullHistory,
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
            setPreviewAttachment,
            setQuickCommandsOpen,
            setRoomDefaultCollaborationMode,
            setRoomDetailsCollapsed,
            setRoomSummaryConnection,
            setRoomToolsOpen,
            setTab,
            setTeamTemplateName,
            stopMessage,
            stoppingStreamIds,
            styles,
            summaryGenerating,
            slashCommandSuggestions,
            teamTemplateName,
            Text,
            TextInput,
            toggleRoomAutoDelegation,
            toggleRoomMemberEnabledInline,
            toggleSelectedRoomRoleplay,
            toggleTargetSelection,
            updateContextLimit,
            updateRoomBlackboardItemStatus,
            updateRoomDecisionStatus,
            updateRoomDelegationDepth,
            updateSelectedRoomMember,
            updateSelectedRoomRoleplay,
            unreadByRoom,
            visibleSelectedMessages,
            width,
          }}
        />
      ) : null}
      {tab === 'square' ? (
        <SquareTab
          squareEvents={squareEvents}
          rooms={rooms}
          connections={connections}
          messagesByRoom={messagesByRoom}
          collaborationEvents={collaborationEvents}
          delegationTasks={delegationTasks}
          teamTemplates={teamTemplates}
          latestProfileVersions={latestProfileVersions}
          soulRelations={soulRelations}
          selectedFontFamily={selectedFontFamily}
          styles={styles}
          TextComponent={Text}
          getDelegationTaskStatusStyle={getDelegationTaskStatusStyle}
          onOpenRoom={openFocusedChatRoom}
          onOpenRoomManagement={openRoomManagement}
          onDeleteTeamTemplate={deleteTeamTemplate}
          onRestoreProfileVersion={restoreProfileVersion}
        />
      ) : null}
      {tab === 'rooms' ? (
        <RoomsTab
          rooms={rooms}
          enabledConnections={enabledConnections}
          messagesByRoom={messagesByRoom}
          groupName={groupName}
          groupMemberDraftIds={groupMemberDraftIds}
          managedRoomId={managedRoomId}
          styles={styles}
          TextComponent={Text}
          TextInputComponent={TextInput}
          onboardingPanel={!onboardingDismissed && !onboardingComplete ? (
            <OnboardingPanel
              steps={onboardingSteps}
              styles={styles}
              TextComponent={Text}
              onDismiss={() => setOnboardingDismissed(true)}
            />
          ) : null}
          setGroupName={setGroupName}
          setGroupMemberDraftIds={setGroupMemberDraftIds}
          setManagedRoomId={setManagedRoomId}
          createStarterRoom={createStarterRoom}
          createDirectRoom={createDirectRoom}
          createGroupRoom={createGroupRoom}
          openFocusedChatRoom={openFocusedChatRoom}
          renderRoomManagementPanel={renderRoomManagementPanel}
        />
      ) : null}
      {tab === 'connections' ? (
        <ConnectionsTab
          connections={connections}
          connectionForm={connectionForm}
          connectionEditForm={connectionEditForm}
          editingConnectionId={editingConnectionId}
          jsonPaste={jsonPaste}
          healthSummary={healthSummary}
          connectionHealth={connectionHealth}
          testingConnectionId={testingConnectionId}
          profilingConnectionId={profilingConnectionId}
          styles={styles}
          TextComponent={Text}
          TextInputComponent={TextInput}
          setConnectionForm={setConnectionForm}
          setConnectionEditForm={setConnectionEditForm}
          setJsonPaste={setJsonPaste}
          addConnection={addConnection}
          importConnections={importConnections}
          handlePasteImport={handlePasteImport}
          refreshConnectionHealth={refreshConnectionHealth}
          toggleConnection={toggleConnection}
          beginEditConnection={beginEditConnection}
          cancelEditConnection={cancelEditConnection}
          saveConnectionEdit={saveConnectionEdit}
          chooseConnectionAvatar={chooseConnectionAvatar}
          clearConnectionAvatar={clearConnectionAvatar}
          testConnection={testConnection}
          refreshAgentProfile={refreshAgentProfile}
          createDirectRoom={createDirectRoom}
          deleteConnection={deleteConnection}
        />
      ) : null}
      {tab === 'settings' ? (
        <SettingsTab
          appVersion={APP_VERSION}
          layoutMode={layoutMode}
          width={width}
          networkOnline={networkOnline}
          connectionsCount={connections.length}
          roomsCount={rooms.length}
          storageSummary={storageSummary}
          appPreferences={appPreferences}
          fontsLoaded={fontsLoaded}
          syncConfig={syncConfig}
          syncing={syncing}
          checkingSyncConflicts={checkingSyncConflicts}
          syncConflictReport={syncConflictReport}
          backupPaste={backupPaste}
          feedbackConfig={feedbackConfig}
          feedbackBusy={feedbackBusy}
          feedbackLogs={feedbackLogs}
          diagnosticLogs={diagnosticLogs}
          diagnosticLogsOpen={diagnosticLogsOpen}
          diagnosticSummary={diagnosticSummary}
          storageBackend={storageBackend}
          serviceWorkerStatus={serviceWorkerStatus}
          pwaInstalled={pwaInstalled}
          defaultFeedbackBaseUrl={DEFAULT_FEEDBACK_BASE_URL}
          styles={styles}
          TextComponent={Text}
          TextInputComponent={TextInput}
          updateAppPreferences={updateAppPreferences}
          setSyncConfig={setSyncConfig}
          testSyncBackend={testSyncBackend}
          checkSyncConflicts={checkSyncConflicts}
          pullSyncSnapshot={pullSyncSnapshot}
          pushSyncSnapshot={pushSyncSnapshot}
          exportAppBackup={exportAppBackup}
          importBackupFile={importBackupFile}
          handlePasteBackup={handlePasteBackup}
          setBackupPaste={setBackupPaste}
          setFeedbackConfig={setFeedbackConfig}
          uploadFeedbackLogs={uploadFeedbackLogs}
          setDiagnosticLogsOpen={setDiagnosticLogsOpen}
          exportDiagnosticBundle={exportDiagnosticBundle}
          clearDiagnosticLogs={clearDiagnosticLogs}
        />
      ) : null}
    </SafeAreaView>
  );

  function renderRoomReplyNotification() {
    if (!roomReplyNotification) return null;
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.replyIsland, width < 720 && styles.replyIslandCompact]}
        onPress={() => openReplyNotification(roomReplyNotification)}
      >
        <View style={styles.replyIslandDot}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color="#ffffff" />
        </View>
        <View style={styles.replyIslandTextBlock}>
          <Text style={styles.replyIslandTitle} numberOfLines={1}>
            {roomReplyNotification.roomName} · {roomReplyNotification.authorName}
          </Text>
          <Text style={styles.replyIslandPreview} numberOfLines={1}>{roomReplyNotification.preview}</Text>
        </View>
        <Ionicons name="arrow-forward-outline" size={15} color="#ffffff" />
      </TouchableOpacity>
    );
  }

  function renderRuntimeBanner() {
    return (
      <RuntimeBanner
        networkOnline={networkOnline}
        serviceWorkerStatus={serviceWorkerStatus}
        canInstallPwa={Boolean(pwaInstallPrompt)}
        styles={styles}
        TextComponent={Text}
        onInstallPwa={installPwa}
      />
    );
  }

  function renderAttachmentPreviewModal() {
    return (
      <AttachmentPreviewModal
        attachment={previewAttachment}
        compact={width < 720}
        styles={styles}
        TextComponent={Text}
        onDownload={downloadAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    );
  }

  function renderRoomManagementPanel(room: Room) {
    return (
      <RoomManagementPanel
        room={room}
        messageCount={(messagesByRoom[room.id] ?? []).length}
        enabledConnections={enabledConnections}
        connectionById={connectionById}
        styles={styles}
        TextComponent={Text}
        TextInputComponent={TextInput}
        updateRoomInline={updateRoomInline}
        adjustRoomContextLimit={adjustRoomContextLimit}
        applyRoomModeInline={applyRoomModeInline}
        toggleRoomMemberEnabledInline={toggleRoomMemberEnabledInline}
        chooseConnectionAvatar={chooseConnectionAvatar}
        openFocusedChatRoom={openFocusedChatRoom}
        closeManagement={() => setManagedRoomId(null)}
      />
    );
  }

}
