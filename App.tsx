import 'react-native-url-polyfill/auto';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  BackHandler,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';

import {
  APP_VERSION,
  DEFAULT_CONTEXT_LIMIT,
  DEFAULT_MODEL,
  MAX_DELEGATION_DEPTH,
} from './src/config/app_config';
import { ActiveGoalPanel } from './src/components/ActiveGoalPanel';
import { AppText as Text, AppTextInput as TextInput, setAppTextFontFamily } from './src/components/AppText';
import { AttachmentPreviewModal } from './src/components/AttachmentPreviewModal';
import { ChatSidebar } from './src/components/ChatSidebar';
import { CollaborationDrawer } from './src/components/CollaborationDrawer';
import { ConnectionsTab } from './src/components/connections';
import { ComposerModeBar, SlashCommandPanel } from './src/components/ChatCommandPanels';
import {
  AttachmentPreview,
  AgentAvatar,
  AgentBadge,
  EmptyState,
  IconButton,
  MiniButton,
  PrimaryButton,
  RoomHint,
  SecondaryButton,
  TabButton,
} from './src/components/Primitives';
import { MarkdownText } from './src/components/MarkdownText';
import { MessageSearchPanel } from './src/components/MessageSearchPanel';
import { MobileRoomPicker } from './src/components/MobileRoomPicker';
import { RoleplayArchivePanel } from './src/components/RoleplayArchivePanel';
import { RoomCollaborationDashboard } from './src/components/RoomCollaborationDashboard';
import { RoomGrowthPanel } from './src/components/RoomGrowthPanel';
import { RoomManagementPanel } from './src/components/RoomManagementPanel';
import { RoomRail } from './src/components/RoomRail';
import { RoomStatusBar } from './src/components/RoomStatusBar';
import { RoomsTab, RoomToolsPanel } from './src/components/rooms';
import { RoleplaySceneCard } from './src/components/RoleplaySceneCard';
import { RuntimeBanner } from './src/components/RuntimeBanner';
import { QuickCommandsPanel } from './src/components/QuickCommandsPanel';
import { CollaborationArchivePanel } from './src/components/square/CollaborationArchivePanel';
import { SoulDailyPanel } from './src/components/square/SoulDailyPanel';
import {
  SettingsTab,
} from './src/components/settings';
import { SoulRelationsPanel } from './src/components/SoulRelationsPanel';
import { TaskBoardPanel } from './src/components/TaskBoardPanel';
import { Ionicons } from './src/components/SafeIcon';
import {
  buildChatHistory,
  buildChatHistoryForDelegation,
  buildChatHistoryForSequentialTurn,
  buildSummaryMessages,
} from './src/app/chat_history';
import { getDelegationTaskStatusStyle, getGoalPlanItemStatusStyle, styles } from './src/app/app_styles';
import {
  buildMarkdownExport,
  buildSearchSnippet,
  findPreviousUserMessageIndex,
  formatBytes,
  formatDateTime,
  formatTime,
  getDelegationTaskStatusLabel,
  getErrorMessage,
  getSquareEventIcon,
  getStatusLabel,
  getWebBasePath,
  isAbortError,
  isSecureWebContext,
  latestSquareEventTime,
  makeAssistantPlaceholder,
  makeId,
  makeLocalNotice,
  makeRoom,
  mergeByUpdatedAt,
  mergeCollaborationEvents,
  mergeDelegationTasks,
  mergeMessagesByRoom,
  mergeProfileVersions,
  mergeSquareEvents,
  normalizeBackupSnapshot,
  requestConfirm,
  showNotice,
} from './src/app/app_utils';
import {
  getBlackboardStatusLabel,
  getDecisionStatusLabel,
  getGoalPlanItemStatusLabel,
  getGoalStatusLabel,
} from './src/app/app_status_labels';
import type {
  ConnectionFormState,
  ConnectionHealth,
  LaphinyBackup,
  MessageSearchResult,
  QuickCommand,
  PWAInstallPromptEvent,
  ScheduledReply,
  SendTargetSelection,
  ServiceWorkerStatus,
  StorageBackendInfo,
  Tab,
} from './src/app/app_types';
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

const NOTIFICATION_CHANNEL_ID = 'laphiny-agent-replies';

import { pickDocuments, pickImages } from './src/lib/attachments';
import { buildAgentProfileInquiryMessages, normalizeImportedAgentProfile, parseAgentProfileResponse, summarizeAgentProfile } from './src/lib/agent_profile';
import { extractAgentFileAttachments } from './src/lib/agent_files';
import { buildAgentPermissionDecisionPrompt, extractAgentPermissionRequest, getAgentPermissionKey } from './src/lib/agent_permissions';
import { COLLABORATION_RITUALS, buildRitualConsensusMessages, buildRitualPrompt, getRitualTargets, parseCollaborationRitualCommand, type CollaborationRitualId, type ParsedCollaborationRitual } from './src/lib/collaboration_rituals';
import { appendDiagnosticLog as appendDiagnosticLogEntry, buildDiagnosticBundle, makeDiagnosticLog, sanitizeDiagnosticLogs } from './src/lib/diagnostics';
import { HermesClient, normalizeHermesReplyText } from './src/lib/hermes_client';
import { runHermesCompletion } from './src/lib/hermes_completion';
import { beginBackgroundAgentTask, shouldStreamHermesReplies } from './src/lib/background_agent';
import { buildGoalModePrompt, buildGoalReviewPrompt, parseGoalCommand, parseGoalPlanItems, parseGoalStatusSignal } from './src/lib/goal_mode';
import { resolveAssistantDelegations, resolveMentionTargets } from './src/lib/mentions';
import { applyMemoryCapsuleToRoomGrowth, applyRoomStatePatchFromText, stripRoomStatePatchBlocks, summarizeRoomGrowth } from './src/lib/room_growth';
import { buildRoomMemoryMessages, parseRoomMemoryResponse, summarizeRoomMemory } from './src/lib/room_memory';
import { buildRoleplayTurnPrompt, getRoleplayTargets, isRoleplayUserTurn, makeDefaultRoleplayConfig, parseRoleplayCommand, summarizeRoleplayConfig } from './src/lib/roleplay';
import { buildRoomReplyNotification, type RoomReplyNotification } from './src/lib/room_reply_notifications';
import { buildSoulDailyDigest } from './src/lib/square_insights';
import { buildOnboardingSteps, buildRoleplayArchiveMessages, buildSoulRelations, buildTaskBoard, getRoomModeDefinition, makeDefaultRoleplayArchive, parseRoleplayArchiveResponse, summarizeRoleplayArchive, type StarterRoomTemplate } from './src/lib/stage4_plus';
import { getSlashCommandSuggestions, getUxCommandKindLabel, type UXCommandDefinition } from './src/lib/ux';
import { LaphinySyncClient } from './src/lib/sync_client';
import { buildSyncConflictReport, type SyncConflictReport } from './src/lib/sync_conflicts';
import { LaphinyFeedbackClient } from './src/lib/feedback_client';
import {
  loadAppPreferences,
  loadConnections,
  loadCollaborationEvents,
  loadDelegationTasks,
  loadDiagnosticLogs,
  loadFeedbackConfig,
  loadProfileVersions,
  loadMessages,
  loadRooms,
  loadTeamTemplates,
  loadSquareEvents,
  loadSyncConfig,
  saveAppPreferences,
  saveConnections,
  saveCollaborationEvents,
  saveDelegationTasks,
  saveDiagnosticLogs,
  saveFeedbackConfig,
  saveProfileVersions,
  saveMessages,
  saveRooms,
  saveTeamTemplates,
  saveSquareEvents,
  saveSyncConfig,
} from './src/storage/repository';
import { describeStorageBackend } from './src/storage/kv';
import { AgentPermissionDecision, AgentPermissionRequest, AgentProfile, AgentProfileVersion, AppPreferences, Attachment, ChatMessage, CollaborationEvent, DelegationTask, DiagnosticLogEntry, FeedbackConfig, FeedbackLogEntry, GoalSession, GoalStatusSignal, HermesConnection, RoleplayConfig, RoleplayArchive, Room, RoomBlackboardItemStatus, RoomDecisionRecordStatus, RoomMemoryCapsule, RoomMember, SquareEvent, SyncConfig, SyncSnapshot, TeamTemplate, RoomModeId } from './src/types';

const MESSAGE_AUTO_SCROLL_THRESHOLD = 96;
const MAX_GOAL_REVIEW_ROUNDS = 3;
const MAX_GOAL_DELEGATIONS_PER_ROUND = 3;
const DEFAULT_FEEDBACK_BASE_URL = '/laphiny-feedback';
const DEFAULT_FEEDBACK_API_KEY = '';

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
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLogEntry[]>([]);
  const [collaborationEvents, setCollaborationEvents] = useState<CollaborationEvent[]>([]);
  const [delegationTasks, setDelegationTasks] = useState<DelegationTask[]>([]);
  const [teamTemplates, setTeamTemplates] = useState<TeamTemplate[]>([]);
  const [profileVersions, setProfileVersions] = useState<AgentProfileVersion[]>([]);
  const [appPreferences, setAppPreferences] = useState<AppPreferences>({ themeMode: 'light', fontFamily: 'system', updatedAt: new Date().toISOString() });
  const [feedbackConfig, setFeedbackConfig] = useState<FeedbackConfig>({ enabled: true, baseUrl: DEFAULT_FEEDBACK_BASE_URL, apiKey: DEFAULT_FEEDBACK_API_KEY, updatedAt: new Date().toISOString() });
  const [feedbackLogs, setFeedbackLogs] = useState<FeedbackLogEntry[]>([]);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
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
  const [activeStreamIds, setActiveStreamIds] = useState<Record<string, true>>({});
  const [stoppingStreamIds, setStoppingStreamIds] = useState<Record<string, true>>({});
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [groupMemberDraftIds, setGroupMemberDraftIds] = useState<string[]>([]);
  const [quickCommandsOpen, setQuickCommandsOpen] = useState(false);
  const [collaborationDrawerOpen, setCollaborationDrawerOpen] = useState(true);
  const [roomToolsOpen, setRoomToolsOpen] = useState(false);
  const [roomDetailsCollapsed, setRoomDetailsCollapsed] = useState(true);
  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null);
  const [profilingConnectionId, setProfilingConnectionId] = useState<string | null>(null);
  const [connectionHealth, setConnectionHealth] = useState<Record<string, ConnectionHealth>>({});
  const [syncing, setSyncing] = useState(false);
  const [checkingSyncConflicts, setCheckingSyncConflicts] = useState(false);
  const [syncConflictReport, setSyncConflictReport] = useState<SyncConflictReport | null>(null);
  const [networkOnline, setNetworkOnline] = useState(() => Platform.OS !== 'web' || typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pwaInstallPrompt, setPwaInstallPrompt] = useState<PWAInstallPromptEvent | null>(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState<ServiceWorkerStatus>('unsupported');
  const [connectionForm, setConnectionForm] = useState<ConnectionFormState>({ name: '', baseUrl: '', apiKey: '', model: DEFAULT_MODEL });
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [connectionEditForm, setConnectionEditForm] = useState<ConnectionFormState>({ name: '', baseUrl: '', apiKey: '', model: DEFAULT_MODEL });
  const [jsonPaste, setJsonPaste] = useState('');
  const [backupPaste, setBackupPaste] = useState('');
  const [groupName, setGroupName] = useState('Hermes 群聊');
  const [roomNameDraft, setRoomNameDraft] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [diagnosticLogsOpen, setDiagnosticLogsOpen] = useState(true);
  const [collaborationPanelOpen, setCollaborationPanelOpen] = useState(true);
  const [teamTemplateName, setTeamTemplateName] = useState('默认 Soul 小队');
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [memoryGenerating, setMemoryGenerating] = useState(false);
  const [knowledgeTitleDraft, setKnowledgeTitleDraft] = useState('');
  const [knowledgeBodyDraft, setKnowledgeBodyDraft] = useState('');
  const [blackboardDraft, setBlackboardDraft] = useState('');
  const [decisionTitleDraft, setDecisionTitleDraft] = useState('');
  const [decisionRationaleDraft, setDecisionRationaleDraft] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [rpArchiveGenerating, setRpArchiveGenerating] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [roomReplyNotification, setRoomReplyNotification] = useState<RoomReplyNotification | null>(null);
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
  const autoPullingSyncRef = useRef(false);
  const lastAutoPullSyncAtRef = useRef(0);
  const streamControllersRef = useRef<Record<string, AbortController>>({});
  const streamFlushTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const streamBuffersRef = useRef<Record<string, string>>({});
  const saveMessagesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyNotificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayedGoalMessageIdsRef = useRef<Set<string>>(new Set());
  const alwaysApprovedPermissionKeysRef = useRef<Set<string>>(new Set());
  const notificationsPermissionRef = useRef<'unknown' | 'granted' | 'denied'>('unknown');
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const selectedRoomIdRef = useRef<string | null>(selectedRoomId);
  const tabRef = useRef<Tab>(tab);
  const roomsRef = useRef<Room[]>(rooms);
  const mobileDetailsTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pollingSquareEventsRef = useRef(false);
  const { width, height } = useWindowDimensions();
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
    void prepareAgentNotifications();
  }, []);

  useEffect(() => {
    setAppTextFontFamily(selectedFontFamily);
    forceFontRender((value) => value + 1);
  }, [selectedFontFamily]);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      loadConnections(),
      loadRooms(),
      loadMessages(),
      loadSyncConfig(),
      loadAppPreferences(),
      loadFeedbackConfig(),
      loadSquareEvents(),
      loadDiagnosticLogs(),
      loadCollaborationEvents(),
      loadDelegationTasks(),
      loadTeamTemplates(),
      loadProfileVersions(),
      describeStorageBackend(),
    ])
      .then(([
        loadedConnections,
        loadedRooms,
        loadedMessages,
        loadedSyncConfig,
        loadedAppPreferences,
        loadedFeedbackConfig,
        loadedSquareEvents,
        loadedDiagnosticLogs,
        loadedCollaborationEvents,
        loadedDelegationTasks,
        loadedTeamTemplates,
        loadedProfileVersions,
        loadedStorageBackend,
      ]) => {
        if (!mounted) return;
        setConnections(loadedConnections);
        setRooms(loadedRooms);
        setMessagesByRoom(loadedMessages);
        setSyncConfig(loadedSyncConfig);
        setAppPreferences(loadedAppPreferences);
        setFeedbackConfig(loadedFeedbackConfig);
        setSquareEvents(loadedSquareEvents);
        setDiagnosticLogs(sanitizeDiagnosticLogs(loadedDiagnosticLogs));
        setCollaborationEvents(loadedCollaborationEvents.slice(-500));
        setDelegationTasks(loadedDelegationTasks.slice(-200));
        setTeamTemplates(loadedTeamTemplates);
        setProfileVersions(loadedProfileVersions.slice(-100));
        setStorageBackend(loadedStorageBackend);
        setSelectedRoomId(loadedRooms[0]?.id ?? null);
        hydratedRef.current = true;
        setHydrated(true);
      })
      .catch((error) => {
        showNotice('加载本地数据失败', getErrorMessage(error));
        hydratedRef.current = true;
        setHydrated(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (hydratedRef.current) void saveConnections(connections);
  }, [connections]);

  useEffect(() => {
    if (hydratedRef.current) void saveRooms(rooms);
  }, [rooms]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (saveMessagesTimerRef.current) {
      clearTimeout(saveMessagesTimerRef.current);
    }
    saveMessagesTimerRef.current = setTimeout(() => {
      saveMessagesTimerRef.current = null;
      void saveMessages(messagesByRoom);
    }, 350);
  }, [messagesByRoom]);

  useEffect(() => {
    if (hydratedRef.current) void saveSyncConfig(syncConfig);
  }, [syncConfig]);

  useEffect(() => {
    if (hydratedRef.current) void saveAppPreferences(appPreferences);
  }, [appPreferences]);

  useEffect(() => {
    if (hydratedRef.current) void saveFeedbackConfig(feedbackConfig);
  }, [feedbackConfig]);

  useEffect(() => {
    if (hydratedRef.current) void saveSquareEvents(squareEvents);
  }, [squareEvents]);

  useEffect(() => {
    if (hydratedRef.current) void saveDiagnosticLogs(diagnosticLogs);
  }, [diagnosticLogs]);

  useEffect(() => {
    if (hydratedRef.current) void saveCollaborationEvents(collaborationEvents);
  }, [collaborationEvents]);

  useEffect(() => {
    if (hydratedRef.current) void saveDelegationTasks(delegationTasks);
  }, [delegationTasks]);

  useEffect(() => {
    if (hydratedRef.current) void saveTeamTemplates(teamTemplates);
  }, [teamTemplates]);

  useEffect(() => {
    if (hydratedRef.current) void saveProfileVersions(profileVersions);
  }, [profileVersions]);

  useEffect(() => {
    return () => {
      if (saveMessagesTimerRef.current) {
        clearTimeout(saveMessagesTimerRef.current);
      }
      if (replyNotificationTimerRef.current) {
        clearTimeout(replyNotificationTimerRef.current);
      }
      for (const timer of Object.values(streamFlushTimersRef.current)) {
        clearTimeout(timer);
      }
      streamFlushTimersRef.current = {};
      streamBuffersRef.current = {};
    };
  }, []);

  const connectionById = useMemo(() => new Map(connections.map((connection) => [connection.id, connection])), [connections]);
  const enabledConnections = useMemo(() => connections.filter((connection) => connection.enabled), [connections]);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedMessages = selectedRoom ? messagesByRoom[selectedRoom.id] ?? [] : [];
  const lastEditableUserMessage = [...selectedMessages].reverse().find((message) => message.authorId === 'user') ?? null;
  const normalizedSearchQuery = messageSearchQuery.trim().toLowerCase();

  useEffect(() => {
    if (tab !== 'chat' || !selectedRoomId) return;
    setRoomReplyNotification((current) => (current?.roomId === selectedRoomId ? null : current));
  }, [selectedRoomId, tab]);
  const messageSearchResults = useMemo(() => {
    if (!normalizedSearchQuery) return [] as MessageSearchResult[];
    const results: MessageSearchResult[] = [];
    for (const room of rooms) {
      for (const message of messagesByRoom[room.id] ?? []) {
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
  }, [messagesByRoom, rooms, normalizedSearchQuery, messageSearchQuery]);
  const selectedSearchMessageIds = useMemo(() => new Set(
    messageSearchResults
      .filter((result) => result.room.id === selectedRoomId)
      .map((result) => result.message.id),
  ), [messageSearchResults, selectedRoomId]);
  const visibleSelectedMessages = normalizedSearchQuery
    ? selectedMessages.filter((message) => selectedSearchMessageIds.has(message.id))
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
  const sending = Object.keys(activeStreamIds).length > 0;
  const totalUnread = Object.values(unreadByRoom).reduce<number>((total, count) => total + Number(count ?? 0), 0);
  const selectedTargetSet = useMemo(() => new Set(selectedTargetIds), [selectedTargetIds]);
  const slashCommandSuggestions = useMemo(() => getSlashCommandSuggestions(draft), [draft]);

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

  const healthSummary = useMemo(() => {
    let ok = 0;
    let error = 0;
    let checking = 0;
    for (const connection of connections) {
      const status = connectionHealth[connection.id]?.status ?? 'unknown';
      if (status === 'ok') ok += 1;
      if (status === 'error') error += 1;
      if (status === 'checking') checking += 1;
    }
    return { ok, error, checking, unknown: Math.max(0, connections.length - ok - error - checking) };
  }, [connections, connectionHealth]);
  const diagnosticSummary = useMemo(() => {
    const recent = diagnosticLogs.slice(-50);
    return {
      total: diagnosticLogs.length,
      errors: recent.filter((log) => log.level === 'error').length,
      warnings: recent.filter((log) => log.level === 'warning').length,
      recent,
    };
  }, [diagnosticLogs]);
  const storageSummary = useMemo(() => {
    const messageBytes = JSON.stringify(messagesByRoom).length;
    const messageCount = Object.values(messagesByRoom).reduce<number>((total, messages) => total + (Array.isArray(messages) ? messages.length : 0), 0);
    return {
      messageBytes,
      messageCount,
      messageSizeLabel: formatBytes(messageBytes),
    };
  }, [messagesByRoom]);

  useEffect(() => {
    setSelectedTargetIds([]);
  }, [selectedRoomId]);

  useEffect(() => {
    if (isWideLayout || tab !== 'chat') {
      setMobileFocusedRoomId(null);
      setMobileRoomDetailsOpen(false);
    }
  }, [isWideLayout, tab]);

  useEffect(() => {
    if (mobileFocusedRoomId && !rooms.some((room) => room.id === mobileFocusedRoomId)) {
      setMobileFocusedRoomId(null);
      setMobileRoomDetailsOpen(false);
    }
    if (managedRoomId && !rooms.some((room) => room.id === managedRoomId)) {
      setManagedRoomId(null);
    }
  }, [managedRoomId, mobileFocusedRoomId, rooms]);

  useEffect(() => {
    setRoomNameDraft(selectedRoom?.name ?? '');
  }, [selectedRoomId, selectedRoom?.name]);

  useEffect(() => {
    const enabledIds = enabledConnections.map((connection) => connection.id);
    setGroupMemberDraftIds((current) => {
      const kept = current.filter((id) => enabledIds.includes(id));
      return kept.length > 0 ? kept : enabledIds;
    });
  }, [enabledConnections]);

  useEffect(() => {
    setRoomDetailsCollapsed(!isWideLayout);
    setQuickCommandsOpen(false);
    setRoomToolsOpen(false);
    setMessageSearchQuery('');
  }, [selectedRoomId, isWideLayout]);

  useEffect(() => {
    if (selectedRoomId && tab === 'chat') {
      setUnreadByRoom((current) => {
        if (!current[selectedRoomId]) return current;
        const next = { ...current };
        delete next[selectedRoomId];
        return next;
      });
    }
    if (tab === 'square') {
      setUnreadByRoom((current) => {
        if (!current.__square) return current;
        const next = { ...current };
        delete next.__square;
        return next;
      });
    }
  }, [selectedRoomId, tab]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = totalUnread > 0 ? `(${totalUnread}) Laphiny` : 'Laphiny';
    }
  }, [totalUnread]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const updateNetworkState = () => {
      setNetworkOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPwaInstallPrompt(event as PWAInstallPromptEvent);
    };
    const handleInstalled = () => {
      setPwaInstallPrompt(null);
      setPwaInstalled(true);
      appendDiagnosticLog({
        level: 'success',
        category: 'system',
        title: 'PWA 已安装',
        message: '浏览器已确认 Laphiny 安装为应用。',
      });
    };

    updateNetworkState();
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    if ('serviceWorker' in navigator && isSecureWebContext()) {
      setServiceWorkerStatus('registering');
      const basePath = getWebBasePath();
      navigator.serviceWorker.register(`${basePath}sw.js`, { scope: basePath })
        .then(() => {
          setServiceWorkerStatus('registered');
        })
        .catch((error) => {
          setServiceWorkerStatus('failed');
          appendDiagnosticLog({
            level: 'warning',
            category: 'system',
            title: 'Service Worker 注册失败',
            message: getErrorMessage(error),
          });
        });
    }

    return () => {
      window.removeEventListener('online', updateNetworkState);
      window.removeEventListener('offline', updateNetworkState);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !syncConfig.enabled || !syncConfig.baseUrl.trim()) return;
    let cancelled = false;

    const poll = async () => {
      if (pollingSquareEventsRef.current) return;
      pollingSquareEventsRef.current = true;
      try {
        const client = new LaphinySyncClient(syncConfig);
        const since = syncConfig.lastEventPulledAt ?? latestSquareEventTime(squareEvents);
        const events = await client.listEvents({ since, timeoutMs: 10_000 });
        if (cancelled || events.length === 0) return;

        setSquareEvents((current) => mergeSquareEvents([...current, ...events]).slice(-300));
        const latest = latestSquareEventTime(events);
        setSyncConfig((current) => ({
          ...current,
          lastEventPulledAt: latest || current.lastEventPulledAt,
          updatedAt: new Date().toISOString(),
        }));
        if (tab !== 'square') {
          setUnreadByRoom((current) => ({
            ...current,
            __square: (current.__square ?? 0) + events.length,
          }));
        }
      } catch {
        // Polling should stay quiet; manual sync actions surface errors.
      } finally {
        pollingSquareEventsRef.current = false;
      }
    };

    void poll();
    const intervalId = setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [hydrated, syncConfig.enabled, syncConfig.baseUrl, syncConfig.apiKey, syncConfig.lastEventPulledAt, squareEvents, tab]);

  useEffect(() => {
    if (!hydrated || !syncConfig.enabled || !syncConfig.baseUrl.trim()) return;

    void autoPullSyncSnapshot('startup');

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') void autoPullSyncSnapshot('foreground');
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void autoPullSyncSnapshot('foreground');
      }
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      subscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [hydrated, syncConfig.enabled, syncConfig.baseUrl, syncConfig.apiKey]);

  function normalizeConnectionForm(form: ConnectionFormState): ConnectionFormState | null {
    const name = form.name.trim();
    const baseUrl = form.baseUrl.trim().replace(/\/+$/, '');
    const apiKey = form.apiKey.trim();
    const model = form.model.trim() || DEFAULT_MODEL;

    if (!name || !baseUrl) {
      showNotice('请填写连接名称和 Hermes API 地址');
      return null;
    }

    try {
      const url = new URL(baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        showNotice('Hermes API 地址必须以 http:// 或 https:// 开头');
        return null;
      }
    } catch {
      showNotice('Hermes API 地址格式不正确');
      return null;
    }

    return { name, baseUrl, apiKey, model };
  }

  function addConnection() {
    const normalized = normalizeConnectionForm(connectionForm);
    if (!normalized) return;

    const now = new Date().toISOString();
    const connection: HermesConnection = {
      id: makeId('conn'),
      ...normalized,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    setConnections((current) => [...current, connection]);
    setConnectionForm({ name: '', baseUrl: '', apiKey: '', model: DEFAULT_MODEL });
  }

  function handlePasteImport() {
    const text = jsonPaste.trim();
    if (!text) return;
    importConnectionsFromText(text);
    setJsonPaste('');
  }

  function importConnectionsFromText(text: string) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      showNotice('JSON 格式错误', '文本不是有效的 JSON');
      return;
    }

    if (!Array.isArray(data)) {
      showNotice('JSON 格式错误', 'JSON 必须是连接对象数组');
      return;
    }

    const now = new Date().toISOString();
    const imported: HermesConnection[] = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (!item || typeof item !== 'object') continue;
      const name = String((item as Record<string, unknown>).name ?? '').trim();
      const baseUrl = String((item as Record<string, unknown>).baseUrl ?? '').trim();
      if (!name || !baseUrl) continue;

      const rawItem = item as Record<string, unknown>;
      imported.push({
        id: makeId('conn'),
        name,
        baseUrl,
        apiKey: String(rawItem.apiKey ?? ''),
        model: String(rawItem.model || DEFAULT_MODEL),
        enabled: rawItem.enabled !== false,
        avatarUri: typeof rawItem.avatarUri === 'string' ? rawItem.avatarUri : undefined,
        profile: normalizeImportedAgentProfile(rawItem.profile),
        createdAt: now,
        updatedAt: now,
      });
    }

    if (imported.length === 0) {
      showNotice('没有可导入的连接', 'JSON 中没有有效的连接数据');
      return;
    }

    setConnections((current) => {
      const existingNames = new Set(current.map((c) => c.name));
      const newOnes = imported.filter((c) => !existingNames.has(c.name));
      if (newOnes.length === 0) {
        showNotice('没有新连接', '全部连接已存在');
        return current;
      }
      const skipped = imported.length - newOnes.length;
      showNotice(
        '导入完成',
        `已导入 ${newOnes.length} 个连接${skipped > 0 ? `，跳过 ${skipped} 个已存在` : ''}`,
      );
      return [...current, ...newOnes];
    });
  }

  async function importConnections() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset) return;

      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      importConnectionsFromText(text);
    } catch (error) {
      showNotice('导入失败', getErrorMessage(error));
    }
  }

  async function testConnection(connection: HermesConnection) {
    setTestingConnectionId(connection.id);
    setConnectionHealth((current) => ({
      ...current,
      [connection.id]: { ...current[connection.id], status: 'checking' },
    }));
    const startedAt = Date.now();
    try {
      const client = new HermesClient(connection);
      const [health, models] = await Promise.all([client.health({ timeoutMs: 8_000 }), client.models({ timeoutMs: 8_000 })]);
      const latencyMs = Date.now() - startedAt;
      setConnectionHealth((current) => ({
        ...current,
        [connection.id]: {
          status: 'ok',
          latencyMs,
          modelsCount: models.length,
          checkedAt: new Date().toISOString(),
        },
      }));
      appendDiagnosticLog({
        level: 'success',
        category: 'connection',
        title: '连接测试成功',
        message: `${connection.name} 可用，模型数 ${models.length}。`,
        connectionId: connection.id,
        connectionName: connection.name,
        durationMs: latencyMs,
        meta: { models: models.length, status: health.status ?? 'ok' },
      });
      showNotice('连接成功', `状态：${health.status ?? 'ok'}\n模型数：${models.length}`);
    } catch (error) {
      setConnectionHealth((current) => ({
        ...current,
        [connection.id]: {
          status: 'error',
          error: getErrorMessage(error),
          checkedAt: new Date().toISOString(),
        },
      }));
      appendDiagnosticLog({
        level: 'error',
        category: 'connection',
        title: '连接测试失败',
        message: getErrorMessage(error),
        connectionId: connection.id,
        connectionName: connection.name,
        durationMs: Date.now() - startedAt,
      });
      showNotice('连接失败', getErrorMessage(error));
    } finally {
      setTestingConnectionId(null);
    }
  }

  async function refreshAgentProfile(connection: HermesConnection) {
    setProfilingConnectionId(connection.id);
    try {
      const client = new HermesClient(connection);
      const response = await client.chatCompletion({
        model: connection.model,
        messages: buildAgentProfileInquiryMessages(connection.name),
      }, {
        sessionId: `laphiny-profile-${connection.id}`,
        sessionKey: `laphiny-profile-${connection.id}`,
        timeoutMs: 60_000,
      });

      const text = response.choices?.[0]?.message?.content ?? '';
      const profile = parseAgentProfileResponse(text, connection.name);
      setProfileVersions((current) => [
        ...current,
        {
          id: makeId('profile'),
          connectionId: connection.id,
          connectionName: connection.name,
          profile,
          note: connection.profile ? '自动更新协作卡片' : '首次生成协作卡片',
          createdAt: new Date().toISOString(),
        },
      ].slice(-100));
      setConnections((current) => current.map((item) => (
        item.id === connection.id
          ? { ...item, profile, updatedAt: new Date().toISOString() }
          : item
      )));
      appendDiagnosticLog({
        level: 'success',
        category: 'profile',
        title: '协作卡片已更新',
        message: summarizeAgentProfile(profile),
        connectionId: connection.id,
        connectionName: connection.name,
        meta: { strengths: profile.strengths.length, delegateWhen: profile.delegateWhen.length },
      });
      showNotice('协作卡片已更新', summarizeAgentProfile(profile));
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'profile',
        title: '协作卡片更新失败',
        message: getErrorMessage(error),
        connectionId: connection.id,
        connectionName: connection.name,
      });
      showNotice('协作卡片更新失败', getErrorMessage(error));
    } finally {
      setProfilingConnectionId(null);
    }
  }

  async function refreshConnectionHealth(showResult = false) {
    const targets = connections.filter((connection) => connection.enabled);
    if (targets.length === 0) {
      if (showResult) showNotice('没有可检查的连接', '请先启用至少一个 Hermes Gateway。');
      return;
    }

    setConnectionHealth((current) => {
      const next = { ...current };
      for (const connection of targets) {
        next[connection.id] = { ...next[connection.id], status: 'checking' };
      }
      return next;
    });

    const results = await Promise.all(targets.map(async (connection) => {
      const startedAt = Date.now();
      try {
        const client = new HermesClient(connection);
        const [health, models] = await Promise.all([client.health({ timeoutMs: 8_000 }), client.models({ timeoutMs: 8_000 })]);
        return {
          id: connection.id,
          health: {
            status: 'ok' as const,
            latencyMs: Date.now() - startedAt,
            modelsCount: models.length,
            checkedAt: new Date().toISOString(),
            error: health.status && health.status !== 'ok' ? `状态：${health.status}` : undefined,
          },
        };
      } catch (error) {
        return {
          id: connection.id,
          health: {
            status: 'error' as const,
            error: getErrorMessage(error),
            checkedAt: new Date().toISOString(),
          },
        };
      }
    }));

    setConnectionHealth((current) => {
      const next = { ...current };
      for (const result of results) {
        next[result.id] = result.health;
      }
      return next;
    });

    if (showResult) {
      const okCount = results.filter((result) => result.health.status === 'ok').length;
      appendDiagnosticLog({
        level: okCount === results.length ? 'success' : 'warning',
        category: 'connection',
        title: '批量健康检查完成',
        message: `${okCount}/${results.length} 个连接可用。`,
        meta: { ok: okCount, total: results.length },
      });
      showNotice('健康检查完成', `${okCount}/${results.length} 个连接可用。`);
    }
  }

  function toggleConnection(connectionId: string) {
    setConnections((current) => current.map((connection) => (
      connection.id === connectionId
        ? { ...connection, enabled: !connection.enabled, updatedAt: new Date().toISOString() }
        : connection
    )));
  }

  function beginEditConnection(connection: HermesConnection) {
    setEditingConnectionId(connection.id);
    setConnectionEditForm({
      name: connection.name,
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      model: connection.model,
    });
  }

  function cancelEditConnection() {
    setEditingConnectionId(null);
    setConnectionEditForm({ name: '', baseUrl: '', apiKey: '', model: DEFAULT_MODEL });
  }

  function saveConnectionEdit(connection: HermesConnection) {
    const normalized = normalizeConnectionForm(connectionEditForm);
    if (!normalized) return;

    const now = new Date().toISOString();
    setConnections((current) => current.map((item) => (
      item.id === connection.id ? { ...item, ...normalized, updatedAt: now } : item
    )));
    setRooms((current) => current.map((room) => {
      const members = room.members.map((member) => (
        member.connectionId === connection.id && member.alias === connection.name
          ? { ...member, alias: normalized.name }
          : member
      ));
      const name = room.kind === 'direct' && room.members[0]?.connectionId === connection.id && room.name === connection.name
        ? normalized.name
        : room.name;
      return { ...room, name, members, updatedAt: now };
    }));
    cancelEditConnection();
    showNotice('连接已更新', `${connection.name} 已保存为 ${normalized.name}。`);
  }

  async function chooseConnectionAvatar(connection: HermesConnection) {
    try {
      const images = await pickImages();
      const image = images[0];
      if (!image?.dataUrl && !image?.uri) return;
      const avatarUri = image.dataUrl ?? image.uri;
      setConnections((current) => current.map((item) => (
        item.id === connection.id ? { ...item, avatarUri, updatedAt: new Date().toISOString() } : item
      )));
      showNotice('头像已更新', connection.name);
    } catch (error) {
      showNotice('头像选择失败', getErrorMessage(error));
    }
  }

  function clearConnectionAvatar(connection: HermesConnection) {
    setConnections((current) => current.map((item) => (
      item.id === connection.id ? { ...item, avatarUri: undefined, updatedAt: new Date().toISOString() } : item
    )));
  }

  function deleteConnection(connection: HermesConnection) {
    const directRoomIds = rooms
      .filter((room) => room.kind === 'direct' && room.members.some((member) => member.connectionId === connection.id))
      .map((room) => room.id);
    const groupCount = rooms.filter((room) => room.kind === 'group' && room.members.some((member) => member.connectionId === connection.id)).length;

    requestConfirm(
      '删除连接',
      `将删除 ${connection.name} 的连接配置${directRoomIds.length ? `，并删除 ${directRoomIds.length} 个对应单聊房间` : ''}${groupCount ? `，从 ${groupCount} 个群聊移除这个成员` : ''}。此操作不会删除其他 Hermes 服务数据。`,
      () => {
        const now = new Date().toISOString();
        setConnections((current) => current.filter((item) => item.id !== connection.id));
        setConnectionHealth((current) => {
          const next = { ...current };
          delete next[connection.id];
          return next;
        });
        setSelectedTargetIds((current) => current.filter((id) => id !== connection.id));
        setRooms((current) => {
          const next = current
            .map((room) => {
              if (room.kind !== 'group') return room;
              const members = room.members.filter((member) => member.connectionId !== connection.id);
              if (members.length === room.members.length) return room;
              const sessionIds = { ...room.sessionIds };
              const memberSessionKeys = { ...(room.memberSessionKeys ?? {}) };
              delete sessionIds[connection.id];
              delete memberSessionKeys[connection.id];
              return { ...room, members, sessionIds, memberSessionKeys, updatedAt: now };
            })
            .filter((room) => !(room.kind === 'direct' && room.members.some((member) => member.connectionId === connection.id)))
            .filter((room) => room.members.length > 0);
          if (selectedRoomId && !next.some((room) => room.id === selectedRoomId)) {
            setSelectedRoomId(next[0]?.id ?? null);
          }
          return next;
        });
        if (directRoomIds.length) {
          setMessagesByRoom((current) => {
            const next = { ...current };
            for (const roomId of directRoomIds) delete next[roomId];
            return next;
          });
        }
        if (editingConnectionId === connection.id) cancelEditConnection();
      },
    );
  }

  function createDirectRoom(connection: HermesConnection) {
    const existing = rooms.find((room) => room.kind === 'direct' && room.members[0]?.connectionId === connection.id);
    if (existing) {
      openFocusedChatRoom(existing.id);
      return;
    }

    const room = makeRoom(connection.name, 'direct', [{ connectionId: connection.id, alias: connection.name, enabled: true }]);
    setRooms((current) => [...current, room]);
    openFocusedChatRoom(room.id);
  }

  function createGroupRoom() {
    const selectedConnections = enabledConnections.filter((connection) => groupMemberDraftIds.includes(connection.id));
    const members = selectedConnections.map<RoomMember>((connection) => ({
      connectionId: connection.id,
      alias: connection.name,
      enabled: true,
    }));

    if (members.length < 2) {
      showNotice('群聊至少需要两个已启用 Hermes 连接');
      return;
    }

    const baseRoom = makeRoom(groupName.trim() || 'Hermes 群聊', 'group', members);
    const room: Room = { ...baseRoom, mode: 'studio' };
    setRooms((current) => [...current, room]);
    openFocusedChatRoom(room.id);
    setGroupMemberDraftIds(enabledConnections.map((connection) => connection.id));
  }



  function createStarterRoom(template: StarterRoomTemplate) {
    const members = enabledConnections.slice(0, Math.max(template.minimumConnections, 1)).map<RoomMember>((connection) => ({
      connectionId: connection.id,
      alias: connection.name,
      enabled: true,
    }));
    if (members.length < template.minimumConnections) {
      showNotice('连接不足', `${template.title} 至少需要 ${template.minimumConnections} 个已启用连接。`);
      return;
    }
    const definition = getRoomModeDefinition(template.mode);
    const room = makeRoom(template.roomName, members.length > 1 ? 'group' : 'direct', members);
    const gm = members[0];
    const roleplay = definition.roleplayEnabled ? {
      ...makeDefaultRoleplayConfig(gm?.connectionId),
      ...template.roleplay,
      enabled: true,
      gmConnectionId: gm?.connectionId,
      playerName: template.roleplay?.playerName ?? '玩家',
      archive: makeDefaultRoleplayArchive(template.roomName, { ...makeDefaultRoleplayConfig(gm?.connectionId), ...template.roleplay, enabled: true } as RoleplayConfig),
      updatedAt: new Date().toISOString(),
    } : undefined;
    const nextRoom: Room = {
      ...room,
      mode: template.mode,
      defaultCollaborationMode: definition.defaultCollaborationMode,
      autoDelegationEnabled: definition.autoDelegationEnabled,
      roleplay,
    };
    setRooms((current) => [...current, nextRoom]);
    openFocusedChatRoom(nextRoom.id);
    appendCollaborationEvent({
      kind: definition.roleplayEnabled ? 'roleplay_started' : 'template_applied',
      roomId: nextRoom.id,
      roomName: nextRoom.name,
      source: 'Laphiny',
      title: `已创建${template.title}`,
      body: template.description,
    });
  }

  async function attachImages() {
    try {
      const images = await pickImages();
      setPendingAttachments((current) => [...current, ...images]);
    } catch (error) {
      showNotice('选择图片失败', getErrorMessage(error));
    }
  }

  async function attachDocuments() {
    try {
      const documents = await pickDocuments();
      setPendingAttachments((current) => [...current, ...documents]);
    } catch (error) {
      showNotice('选择文件失败', getErrorMessage(error));
    }
  }

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

  function showRoomReplyNotification(roomId: string, message: ChatMessage) {
    const notification = buildRoomReplyNotification({
      roomId,
      message,
      rooms: roomsRef.current,
      activeRoomId: selectedRoomIdRef.current,
      activeTab: tabRef.current,
    });
    if (!notification) return;
    setRoomReplyNotification(notification);
    if (replyNotificationTimerRef.current) {
      clearTimeout(replyNotificationTimerRef.current);
    }
    replyNotificationTimerRef.current = setTimeout(() => {
      setRoomReplyNotification((current) => (current?.id === notification.id ? null : current));
      replyNotificationTimerRef.current = null;
    }, 8000);
  }

  function openReplyNotification(notification: RoomReplyNotification) {
    openFocusedChatRoom(notification.roomId);
    setRoomReplyNotification(null);
    if (replyNotificationTimerRef.current) {
      clearTimeout(replyNotificationTimerRef.current);
      replyNotificationTimerRef.current = null;
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

  async function prepareAgentNotifications(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    if (notificationsPermissionRef.current === 'granted') return true;
    if (notificationsPermissionRef.current === 'denied') return false;

    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
          name: 'Agent replies',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 180, 80, 180],
          lightColor: '#2563eb',
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      const resolved = existing.granted ? existing : await Notifications.requestPermissionsAsync();
      notificationsPermissionRef.current = resolved.granted ? 'granted' : 'denied';
      return resolved.granted;
    } catch (error) {
      notificationsPermissionRef.current = 'denied';
      console.warn('Failed to prepare local notifications.', error);
      return false;
    }
  }

  async function notifyAgentReplyFinished(roomId: string, message: ChatMessage, mode: 'reply' | 'goal' | 'permission' = 'reply') {
    if (Platform.OS === 'web') return;
    if (message.authorId === 'user' || message.authorId === 'system' || message.status === 'running' || message.status === 'error') return;
    if (appStateRef.current === 'active') return;
    const pendingPermission = message.permissionRequest?.status === 'pending';
    if (message.permissionRequest && !pendingPermission) return;
    const notificationMode = pendingPermission ? 'permission' : mode;

    const ready = await prepareAgentNotifications();
    if (!ready) return;

    const room = roomsRef.current.find((item) => item.id === roomId);
    const roomName = room?.name ?? 'Laphiny';
    const attachmentHint = message.attachments?.length ? ` · ${message.attachments.length} 个附件` : '';
    const preview = normalizeHermesReplyText(message.content).trim().replace(/\s+/g, ' ').slice(0, 120);
    const title = notificationMode === 'permission'
      ? `${roomName} · ${message.authorName} 需要确认`
      : notificationMode === 'goal'
      ? `${roomName} · 目标模式已更新`
      : `${roomName} · ${message.authorName} 已回复`;
    const body = notificationMode === 'permission'
      ? `${message.permissionRequest?.title ?? '权限请求'}：${message.permissionRequest?.body ?? preview}`.slice(0, 180)
      : `${preview || (notificationMode === 'goal' ? '目标模式本轮处理完成' : '新的回复已完成')}${attachmentHint}`;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { roomId, messageId: message.id, mode: notificationMode },
          sound: true,
        },
        trigger: Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null,
      });
    } catch (error) {
      console.warn('Failed to schedule local notification.', error);
    }
  }

  function notifyGoalSessionFinished(room: Room, goal: GoalSession) {
    void notifyAgentReplyFinished(room.id, {
      id: goal.lastMessageId ?? goal.id,
      roomId: room.id,
      role: 'assistant',
      authorId: goal.leadConnectionId,
      authorName: goal.leadAlias,
      content: goal.lastReview || goal.goal,
      status: goal.status === 'blocked' ? 'stopped' : 'sent',
      createdAt: goal.completedAt ?? goal.updatedAt,
    }, 'goal');
  }

  function extractAgentReplyArtifacts(rawContent: string): {
    content: string;
    attachments: Attachment[];
    permissionRequest?: AgentPermissionRequest;
  } {
    const fileReply = extractAgentFileAttachments(rawContent);
    const permissionReply = extractAgentPermissionRequest(fileReply.content);
    return {
      content: permissionReply.content,
      attachments: fileReply.attachments,
      permissionRequest: permissionReply.request,
    };
  }

  function getRenderableMessageArtifacts(message: ChatMessage): { content: string; attachments: Attachment[] } {
    const currentAttachments = message.attachments ?? [];
    if (message.authorId === 'user') return { content: message.content, attachments: currentAttachments };
    const fileReply = extractAgentFileAttachments(message.content);
    if (!fileReply.attachments.length) return { content: message.content, attachments: currentAttachments };
    return {
      content: fileReply.content || (currentAttachments.length || fileReply.attachments.length ? '已生成附件' : message.content),
      attachments: mergeRenderableAttachments(currentAttachments, fileReply.attachments),
    };
  }

  function mergeRenderableAttachments(current: Attachment[], extracted: Attachment[]): Attachment[] {
    const seen = new Set(current.map((attachment) => `${attachment.name}:${attachment.size}:${attachment.kind}`));
    const merged = [...current];
    for (const attachment of extracted) {
      const key = `${attachment.name}:${attachment.size}:${attachment.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(attachment);
    }
    return merged;
  }

  function getAgentReplyFallback(parsedReply: { content: string; attachments: Attachment[]; permissionRequest?: AgentPermissionRequest }) {
    if (parsedReply.content) return parsedReply.content;
    if (parsedReply.permissionRequest) return parsedReply.permissionRequest.body;
    if (parsedReply.attachments.length) return '已生成附件';
    return '[Hermes 没有返回内容]';
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

  function setStreamActive(messageId: string, active: boolean) {
    setActiveStreamIds((current) => {
      if (active) return { ...current, [messageId]: true };
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  function flushStreamMessage(roomId: string, messageId: string) {
    const content = streamBuffersRef.current[messageId];
    if (content === undefined) return;
    delete streamBuffersRef.current[messageId];
    const timer = streamFlushTimersRef.current[messageId];
    if (timer) {
      clearTimeout(timer);
      delete streamFlushTimersRef.current[messageId];
    }
    updateMessageInRoom(roomId, messageId, { content });
  }

  function queueStreamMessageUpdate(roomId: string, messageId: string, content: string) {
    streamBuffersRef.current[messageId] = content;
    if (streamFlushTimersRef.current[messageId]) return;
    streamFlushTimersRef.current[messageId] = setTimeout(() => {
      flushStreamMessage(roomId, messageId);
    }, 80);
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

  function stopMessage(messageId: string) {
    if (!streamControllersRef.current[messageId]) return;
    setStoppingStreamIds((current) => ({ ...current, [messageId]: true }));
    streamControllersRef.current[messageId]?.abort();
  }

  function getSendTargets(room: Room, rawText: string, explicitTargetIds = selectedTargetIds): SendTargetSelection {
    const goalMode = parseGoalCommand(rawText);
    if (goalMode) {
      const resolution = resolveMentionTargets(room, rawText);
      const explicitTargetSet = new Set(explicitTargetIds);
      const manuallySelectedTargets = room.members.filter((member) => (
        member.enabled && explicitTargetSet.has(member.connectionId)
      ));
      const summaryTarget = room.members.find((member) => member.enabled && member.connectionId === room.summaryConnectionId);
      const strippedGoal = parseGoalCommand(resolution.strippedText)?.goal.trim();
      const promptGoal = strippedGoal || goalMode.goal;
      const commandLead = goalMode.leadMention
        ? room.members.find((member) => member.enabled && (
          member.alias.toLowerCase() === goalMode.leadMention?.toLowerCase()
          || member.connectionId.toLowerCase() === goalMode.leadMention?.toLowerCase()
        ))
        : undefined;
      const leadMember = commandLead
        ?? manuallySelectedTargets[0]
        ?? resolution.targets[0]
        ?? summaryTarget
        ?? room.members.find((member) => member.enabled);
      const normalizedGoalMode = { ...goalMode, goal: promptGoal };

      return {
        targets: leadMember ? [leadMember] : [],
        textForHermes: leadMember
          ? buildGoalModePrompt({ goal: promptGoal, room, leadMember, connections })
          : promptGoal,
        mode: 'sequential',
        goalMode: normalizedGoalMode,
      };
    }

    const ritual = room.kind === 'group' ? parseCollaborationRitualCommand(rawText) : null;
    if (ritual) {
      return {
        targets: getRitualTargets(room),
        textForHermes: buildRitualPrompt(ritual, room),
        mode: ritual.definition.mode,
        ritual,
      };
    }

    const resolution = resolveMentionTargets(room, rawText);
    const explicitTargetSet = new Set(explicitTargetIds);
    const manuallySelectedTargets = room.members.filter((member) => (
      member.enabled && explicitTargetSet.has(member.connectionId)
    ));
    const textForHermes = resolution.strippedText || rawText;

    if (
      room.kind === 'group'
      && isRoleplayUserTurn(room, rawText)
      && manuallySelectedTargets.length === 0
      && resolution.targets.length === 0
    ) {
      return {
        targets: getRoleplayTargets(room),
        textForHermes: buildRoleplayTurnPrompt(room, rawText),
        mode: 'sequential',
      };
    }

    if (room.kind === 'group' && manuallySelectedTargets.length > 0) {
      return {
        targets: manuallySelectedTargets,
        textForHermes,
        mode: resolution.reason === 'all-seq' || room.defaultCollaborationMode === 'sequential' ? 'sequential' : 'parallel',
      };
    }

    if (room.kind === 'group' && resolution.targets.length === 0 && room.defaultCollaborationMode && room.defaultCollaborationMode !== 'manual') {
      return {
        targets: room.members.filter((member) => member.enabled),
        textForHermes,
        mode: room.defaultCollaborationMode === 'sequential' ? 'sequential' : 'parallel',
      };
    }

    return {
      targets: resolution.targets,
      textForHermes,
      mode: resolution.reason === 'all-seq' ? 'sequential' : 'parallel',
    };
  }

  async function streamHermesReply({
    room,
    member,
    placeholderId,
    text,
    attachments,
    previousMessages,
  }: {
    room: Room;
    member: RoomMember;
    placeholderId: string;
    text: string;
    attachments: Attachment[];
    previousMessages: ChatMessage[];
  }) {
    const connection = connectionById.get(member.connectionId);
    if (!connection) {
      updateMessageInRoom(room.id, placeholderId, { status: 'error', error: 'Hermes 连接不存在', content: '发送失败' });
      return;
    }

    const controller = new AbortController();
    streamControllersRef.current[placeholderId] = controller;
    setStreamActive(placeholderId, true);
    const releaseBackgroundAgentTask = await beginBackgroundAgentTask();

    let streamedText = '';
    updateMessageInRoom(room.id, placeholderId, { content: '', status: 'running', error: undefined });

    try {
      const client = new HermesClient(connection);
      const shouldStream = shouldStreamHermesReplies();
      streamedText = await runHermesCompletion(client, {
        request: {
          model: connection.model,
          messages: buildChatHistory(previousMessages, room, member, text, attachments, connections, room.contextLimit ?? DEFAULT_CONTEXT_LIMIT),
        },
        sessionId: room.sessionIds[connection.id],
        sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
        timeoutMs: 120_000,
        signal: controller.signal,
        stream: shouldStream,
        onChunk: (content) => queueStreamMessageUpdate(room.id, placeholderId, content),
      });

      flushStreamMessage(room.id, placeholderId);
      const parsedReply = extractAgentReplyArtifacts(streamedText.trim());
      const permissionRequest = applyAlwaysPermissionIfNeeded(parsedReply.permissionRequest);
      const answer = getAgentReplyFallback({ ...parsedReply, permissionRequest });
      const completedMessage: ChatMessage = {
        id: placeholderId,
        roomId: room.id,
        role: 'assistant',
        authorId: member.connectionId,
        authorName: member.alias,
        content: answer,
        attachments: parsedReply.attachments.length ? parsedReply.attachments : undefined,
        permissionRequest,
        status: 'sent',
        createdAt: new Date().toISOString(),
      };
      updateMessageInRoom(room.id, placeholderId, {
        content: answer,
        attachments: parsedReply.attachments.length ? parsedReply.attachments : undefined,
        permissionRequest,
        status: 'sent',
      });
      if (permissionRequest?.status === 'always') {
        void continueAgentAfterPermission(room, member, completedMessage, 'always');
      }
    } catch (error) {
      flushStreamMessage(room.id, placeholderId);
      if (isAbortError(error)) {
        updateMessageInRoom(room.id, placeholderId, {
          content: streamedText.trim() || '已停止生成',
          status: 'stopped',
        });
        return;
      }

      updateMessageInRoom(room.id, placeholderId, {
        status: 'error',
        error: getErrorMessage(error),
        content: streamedText.trim() || '发送失败',
      });
    } finally {
      delete streamControllersRef.current[placeholderId];
      delete streamBuffersRef.current[placeholderId];
      const timer = streamFlushTimersRef.current[placeholderId];
      if (timer) {
        clearTimeout(timer);
        delete streamFlushTimersRef.current[placeholderId];
      }
      setStreamActive(placeholderId, false);
      setStoppingStreamIds((current) => {
        const next = { ...current };
        delete next[placeholderId];
        return next;
      });
      await releaseBackgroundAgentTask();
    }
  }

  async function dispatchMessage(room: Room, rawText: string, attachments: Attachment[], explicitTargetIds = selectedTargetIds) {
    if (!rawText && attachments.length === 0) {
      return;
    }

    const previousMessages = messagesByRoom[room.id] ?? [];
    const now = new Date().toISOString();
    const parsedRoleplayCommand = room.kind === 'group' ? parseRoleplayCommand(rawText) : null;

    if (parsedRoleplayCommand?.kind === 'stop') {
      const userMessage: ChatMessage = {
        id: makeId('msg'),
        roomId: room.id,
        role: 'user',
        authorId: 'user',
        authorName: '你',
        content: rawText,
        attachments,
        status: 'sent',
        createdAt: now,
      };
      appendMessagesToRoom(room.id, [userMessage, makeLocalNotice(room.id, '桌游店 RP 模式已关闭。群聊恢复普通协作触发规则。')]);
      updateRoomById(room.id, { roleplay: { ...(room.roleplay ?? makeDefaultRoleplayConfig()), enabled: false, updatedAt: now } });
      appendCollaborationEvent({
        kind: 'roleplay_updated',
        roomId: room.id,
        roomName: room.name,
        source: '用户',
        messageId: userMessage.id,
        title: 'RP 模式已关闭',
        body: rawText,
      });
      setDraft('');
      setPendingAttachments([]);
      return;
    }

    let effectiveRoom = room;
    if (room.kind === 'group' && parsedRoleplayCommand) {
      const gm = getRoleplayTargets(room)[0] ?? room.members.find((member) => member.enabled);
      const base = room.roleplay ?? makeDefaultRoleplayConfig(gm?.connectionId);
      const nextRoleplay: RoleplayConfig = {
        ...base,
        enabled: true,
        gmConnectionId: base.gmConnectionId ?? gm?.connectionId,
        premise: parsedRoleplayCommand.kind === 'start' && parsedRoleplayCommand.topic ? parsedRoleplayCommand.topic : base.premise,
        currentScene: parsedRoleplayCommand.kind === 'scene' && parsedRoleplayCommand.topic ? parsedRoleplayCommand.topic : base.currentScene,
        archive: base.archive ?? makeDefaultRoleplayArchive(room.name, base),
        updatedAt: now,
      };
      effectiveRoom = { ...room, roleplay: nextRoleplay, mode: 'tabletop', defaultCollaborationMode: 'manual' };
      updateRoomById(room.id, { roleplay: nextRoleplay, mode: 'tabletop', defaultCollaborationMode: 'manual' });
    }

    const startsNewGoal = Boolean(parseGoalCommand(rawText));
    const goalControl = getGoalControlCommand(effectiveRoom, rawText);
    if (goalControl?.type === 'finish') {
      const userMessage: ChatMessage = {
        id: makeId('msg'),
        roomId: room.id,
        role: 'user',
        authorId: 'user',
        authorName: '你',
        content: rawText,
        attachments,
        status: 'sent',
        createdAt: now,
      };
      setDraft('');
      setPendingAttachments([]);
      setSelectedTargetIds([]);
      appendMessagesToRoom(room.id, [userMessage, makeLocalNotice(room.id, '目标已结束，并已沉淀到房间记忆。')]);
      finishActiveGoal(effectiveRoom, 'finish');
      return;
    }

    let sendSelection = getSendTargets(effectiveRoom, rawText, explicitTargetIds);
    if (goalControl?.type === 'continue' && effectiveRoom.activeGoal) {
      const leadMember = getActiveGoalLeadMember(effectiveRoom);
      if (leadMember) {
        sendSelection = {
          targets: [leadMember],
          textForHermes: buildGoalReviewPrompt({
            goal: effectiveRoom.activeGoal.goal,
            room: effectiveRoom,
            leadMember,
            connections,
            round: effectiveRoom.activeGoal.round + 1,
          }),
          mode: 'sequential',
          goalMode: { id: 'goal', goal: effectiveRoom.activeGoal.goal },
        };
        updateRoomById(room.id, {
          activeGoal: {
            ...effectiveRoom.activeGoal,
            status: 'reviewing',
            statusSignal: undefined,
            round: effectiveRoom.activeGoal.round + 1,
            userDecision: 'continue',
            updatedAt: now,
          },
        });
      }
    }

    const { targets, textForHermes, mode, ritual, goalMode } = sendSelection;
    const goalLeadMember = goalMode ? targets[0] : undefined;
    const userMessage: ChatMessage = {
      id: makeId('msg'),
      roomId: room.id,
      role: 'user',
      authorId: 'user',
      authorName: '你',
      content: rawText || '[附件]',
      attachments,
      status: 'sent',
      createdAt: now,
    };

    setDraft('');
    setPendingAttachments([]);
    setSelectedTargetIds([]);
    appendMessagesToRoom(room.id, [userMessage]);
    let activeGoalForTurn = effectiveRoom.activeGoal;
    if (startsNewGoal && goalMode && goalLeadMember) {
      const activeGoal = makeGoalSession(room.id, goalMode.goal, goalLeadMember, now, userMessage.id);
      activeGoalForTurn = activeGoal;
      updateRoomById(room.id, { activeGoal });
    }
    const roleplayTurn = effectiveRoom.kind === 'group' && effectiveRoom.roleplay?.enabled && targets.length > 0 && mode === 'sequential' && isRoleplayUserTurn(effectiveRoom, rawText);
    appendCollaborationEvent({
      kind: ritual ? 'ritual_started' : roleplayTurn ? 'roleplay_updated' : 'user_message',
      roomId: room.id,
      roomName: room.name,
      source: '用户',
      messageId: userMessage.id,
      title: ritual ? `启动${ritual.definition.label}` : roleplayTurn ? '玩家推进 RP 回合' : '用户发起协作轮次',
      body: rawText || '[附件]',
    });

    if (targets.length === 0) {
      const errorText = room.kind === 'group'
        ? '请选择本次回复成员，或使用 @成员名 / @all / @all-seq / 协作仪式命令，或开启 RP 模式后输入角色行动。'
        : '这个房间没有可用的 Hermes 成员。';
      appendMessagesToRoom(room.id, [makeLocalNotice(room.id, errorText)]);
      appendDiagnosticLog({
        level: 'warning',
        category: 'chat',
        title: '消息未发送给 Hermes',
        message: errorText,
        roomId: room.id,
        roomName: room.name,
        meta: { kind: room.kind },
      });
      return;
    }

    const releaseBackgroundAgentTurn = await beginBackgroundAgentTask();
    try {
    const turnMessages: ChatMessage[] = [...previousMessages, userMessage];
    const dispatchRoom = activeGoalForTurn ? { ...effectiveRoom, activeGoal: activeGoalForTurn } : effectiveRoom;
    const scheduledKeys = new Set<string>();
    const memberQueues = new Map<string, Promise<void>>();
    const scheduledPromises: Promise<void>[] = [];
    let goalDelegationCount = 0;
    let reviewedGoalDelegationCount = 0;
    let goalReviewRound = 0;
    let lastGoalTerminalMessage: ChatMessage | null = null;

    const scheduleReply = (reply: ScheduledReply): Promise<void> | null => {
      const normalizedTask = reply.text.trim().replace(/\s+/g, ' ').slice(0, 160);
      const key = [
        reply.delegatedFromConnectionId ?? 'user',
        reply.member.connectionId,
        reply.depth,
        normalizedTask,
      ].join('::');
      if (scheduledKeys.has(key)) return null;
      scheduledKeys.add(key);

      const previousForMember = memberQueues.get(reply.member.connectionId) ?? Promise.resolve();
      const taskPromise = previousForMember.then(() => runReply(reply));
      memberQueues.set(reply.member.connectionId, taskPromise.catch(() => {}));
      scheduledPromises.push(taskPromise);
      return taskPromise;
    };

    const runReply = async (reply: ScheduledReply) => {
      const placeholder = makeAssistantPlaceholder(dispatchRoom.id, reply.member);
      if (reply.delegatedFrom) {
        placeholder.delegatedFrom = reply.delegatedFrom;
      }
      if (reply.goalMode) {
        delayedGoalMessageIdsRef.current.add(placeholder.id);
      }
      appendMessagesToRoom(room.id, [placeholder]);

      const connection = connectionById.get(reply.member.connectionId);
      if (!connection) {
        updateMessageInRoom(room.id, placeholder.id, { status: 'error', error: 'Hermes 连接不存在', content: '发送失败' });
        appendDiagnosticLog({
          level: 'error',
          category: 'chat',
          title: 'Hermes 回复失败',
          message: 'Hermes 连接不存在',
          roomId: room.id,
          roomName: room.name,
          connectionId: reply.member.connectionId,
          connectionName: reply.member.alias,
        });
        return;
      }

      const controller = new AbortController();
      streamControllersRef.current[placeholder.id] = controller;
      setStreamActive(placeholder.id, true);
      const releaseBackgroundAgentTask = await beginBackgroundAgentTask();
      updateMessageInRoom(room.id, placeholder.id, { status: 'running', content: '', error: undefined });
      const requestId = makeId('req');
      const startedAt = Date.now();
      let promptMessagesCount = 0;
      let accumulated = '';

      if (reply.taskId) {
        updateDelegationTask(reply.taskId, { status: 'running' });
        appendCollaborationEvent({
          kind: 'delegation_started',
          roomId: room.id,
          roomName: room.name,
          source: reply.delegatedFrom,
          target: reply.member.alias,
          taskId: reply.taskId,
          messageId: placeholder.id,
          title: `${reply.member.alias} 开始处理委托`,
          body: reply.text,
        });
      } else {
        appendCollaborationEvent({
          kind: 'agent_reply_started',
          roomId: room.id,
          roomName: room.name,
          target: reply.member.alias,
          messageId: placeholder.id,
          title: `${reply.member.alias} 开始回复`,
          body: reply.text,
        });
      }

      try {
        const hasEarlierTurnReply = mode === 'sequential' && turnMessages.some((message) => (
          message.role === 'assistant' && message.status === 'sent' && message.authorId !== 'system'
        ));
        const historyMessages = reply.delegatedFrom
          ? buildChatHistoryForDelegation(
              [...turnMessages],
              dispatchRoom,
              reply.member,
              reply.text,
              reply.delegatedFrom,
              reply.delegatorMessage ?? reply.text,
              connections,
              room.contextLimit ?? DEFAULT_CONTEXT_LIMIT,
            )
          : hasEarlierTurnReply
            ? buildChatHistoryForSequentialTurn(
                [...turnMessages],
                dispatchRoom,
                reply.member,
                reply.text,
                reply.attachments,
                connections,
                room.contextLimit ?? DEFAULT_CONTEXT_LIMIT,
              )
            : buildChatHistory(
                previousMessages,
                dispatchRoom,
                reply.member,
                reply.text,
                reply.attachments,
                connections,
                room.contextLimit ?? DEFAULT_CONTEXT_LIMIT,
              );

        promptMessagesCount = historyMessages.length;
        appendDiagnosticLog({
          level: 'info',
          category: 'chat',
          title: reply.delegatedFrom ? '委托请求开始' : 'Hermes 请求开始',
          message: `${reply.member.alias} 正在处理${reply.delegatedFrom ? ` ${reply.delegatedFrom} 的委托` : '用户消息'}。`,
          roomId: room.id,
          roomName: room.name,
          connectionId: connection.id,
          connectionName: reply.member.alias,
          requestId,
          meta: { mode, depth: reply.depth, attachments: reply.attachments.length, promptMessages: promptMessagesCount },
        });

        const client = new HermesClient(connection);
        const shouldStream = shouldStreamHermesReplies();
        accumulated = await runHermesCompletion(client, {
          request: {
            model: connection.model,
            messages: historyMessages,
          },
          sessionId: room.sessionIds[connection.id],
          sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
          timeoutMs: reply.goalMode ? 240_000 : 180_000,
          signal: controller.signal,
          stream: shouldStream,
          onChunk: (content) => queueStreamMessageUpdate(room.id, placeholder.id, content),
        });

        flushStreamMessage(room.id, placeholder.id);
        const parsedReply = extractAgentReplyArtifacts(accumulated.trim());
        const permissionRequest = applyAlwaysPermissionIfNeeded(parsedReply.permissionRequest);
        const rawAnswer = getAgentReplyFallback({ ...parsedReply, permissionRequest });
        const answer = stripRoomStatePatchBlocks(rawAnswer) || rawAnswer;
        const completedMessage: ChatMessage = {
          ...placeholder,
          content: answer,
          attachments: parsedReply.attachments.length ? parsedReply.attachments : undefined,
          permissionRequest,
          status: 'sent',
        };
        if (reply.goalMode) {
          lastGoalTerminalMessage = completedMessage;
        }
        turnMessages.push(completedMessage);
        updateMessageInRoom(room.id, placeholder.id, {
          content: answer,
          attachments: completedMessage.attachments,
          permissionRequest,
          status: 'sent',
        });
        if (permissionRequest?.status !== 'pending') {
          applyAgentRoomStatePatch(room.id, reply.member.alias, rawAnswer, completedMessage.id);
          applyGoalAssistantResult(dispatchRoom, reply, completedMessage, answer);
        }
        if (permissionRequest?.status === 'always') {
          void continueAgentAfterPermission(room, reply.member, completedMessage, 'always');
        }
        appendDiagnosticLog({
          level: 'success',
          category: 'chat',
          title: reply.delegatedFrom ? '委托请求完成' : 'Hermes 请求完成',
          message: `${reply.member.alias} 返回 ${answer.length} 字。`,
          roomId: room.id,
          roomName: room.name,
          connectionId: connection.id,
          connectionName: reply.member.alias,
          requestId,
          durationMs: Date.now() - startedAt,
          meta: { mode, depth: reply.depth, chars: answer.length, promptMessages: promptMessagesCount },
        });
        if (reply.taskId) {
          updateDelegationTask(reply.taskId, { status: 'done', resultMessageId: completedMessage.id });
          appendCollaborationEvent({
            kind: 'delegation_completed',
            roomId: room.id,
            roomName: room.name,
            source: reply.delegatedFrom,
            target: reply.member.alias,
            taskId: reply.taskId,
            messageId: completedMessage.id,
            title: `${reply.member.alias} 完成委托`,
            body: answer,
          });
        } else {
          appendCollaborationEvent({
            kind: 'agent_reply_completed',
            roomId: room.id,
            roomName: room.name,
            target: reply.member.alias,
            messageId: completedMessage.id,
            title: `${reply.member.alias} 完成回复`,
            body: answer,
          });
        }

        if (room.kind === 'group' && room.autoDelegationEnabled !== false && reply.depth < (room.maxDelegationDepth ?? MAX_DELEGATION_DEPTH)) {
          const delegations = resolveAssistantDelegations(room, answer, reply.member.connectionId);
          const acceptedDelegations = reply.goalMode ? delegations.slice(0, MAX_GOAL_DELEGATIONS_PER_ROUND) : delegations;
          if (reply.goalMode && delegations.length > acceptedDelegations.length) {
            appendMessagesToRoom(room.id, [
              makeLocalNotice(room.id, `目标模式本轮最多接收 ${MAX_GOAL_DELEGATIONS_PER_ROUND} 个委托，已忽略 ${delegations.length - acceptedDelegations.length} 个额外委托。`),
            ]);
          }
          for (const delegation of acceptedDelegations) {
            const taskText = delegation.taskText || '请根据上一条回复和群聊上下文继续处理这个委托任务。';
            appendDiagnosticLog({
              level: 'info',
              category: 'chat',
              title: 'Agent 委托已排队',
              message: `${reply.member.alias} → ${delegation.target.alias}: ${taskText.slice(0, 120)}`,
              roomId: room.id,
              roomName: room.name,
              connectionId: delegation.target.connectionId,
              connectionName: delegation.target.alias,
              requestId,
              meta: { depth: reply.depth + 1 },
            });
            const task = createDelegationTask({
              roomId: room.id,
              roomName: room.name,
              fromConnectionId: reply.member.connectionId,
              fromAlias: reply.member.alias,
              toConnectionId: delegation.target.connectionId,
              toAlias: delegation.target.alias,
              taskText,
              depth: reply.depth + 1,
              sourceMessageId: completedMessage.id,
            });
            if (goalMode) {
              goalDelegationCount += 1;
            }
            scheduleReply({
              member: delegation.target,
              text: taskText,
              attachments: [],
              depth: reply.depth + 1,
              delegatedFrom: reply.member.alias,
              delegatedFromConnectionId: reply.member.connectionId,
              delegatorMessage: answer,
              taskId: task.id,
              goalMode: reply.goalMode,
            });
          }
        }
      } catch (error) {
        flushStreamMessage(room.id, placeholder.id);
        if (isAbortError(error)) {
          const stoppedContent = accumulated.trim() || '已停止生成';
          const stoppedMessage: ChatMessage = {
            ...placeholder,
            content: stoppedContent,
            status: 'stopped',
          };
          if (reply.goalMode) {
            lastGoalTerminalMessage = stoppedMessage;
          }
          turnMessages.push(stoppedMessage);
          updateMessageInRoom(room.id, placeholder.id, {
            content: stoppedContent,
            status: 'stopped',
          });
          updateDelegationTask(reply.taskId, { status: 'cancelled', resultMessageId: stoppedMessage.id });
          appendDiagnosticLog({
            level: 'warning',
            category: 'chat',
            title: 'Hermes 请求已停止',
            message: `${reply.member.alias} 的回复被手动停止。`,
            roomId: room.id,
            roomName: room.name,
            connectionId: connection.id,
            connectionName: reply.member.alias,
            requestId,
            durationMs: Date.now() - startedAt,
          });
          return;
        }

        updateDelegationTask(reply.taskId, { status: 'error', error: getErrorMessage(error), resultMessageId: placeholder.id });
        updateMessageInRoom(room.id, placeholder.id, {
          status: 'error',
          error: getErrorMessage(error),
          content: reply.delegatedFrom ? '转发失败' : '发送失败',
        });
        appendDiagnosticLog({
          level: 'error',
          category: 'chat',
          title: reply.delegatedFrom ? '委托请求失败' : 'Hermes 请求失败',
          message: getErrorMessage(error),
          roomId: room.id,
          roomName: room.name,
          connectionId: connection.id,
          connectionName: reply.member.alias,
          requestId,
          durationMs: Date.now() - startedAt,
          meta: { mode, depth: reply.depth, promptMessages: promptMessagesCount },
        });
      } finally {
        delete streamControllersRef.current[placeholder.id];
        delete streamBuffersRef.current[placeholder.id];
        const timer = streamFlushTimersRef.current[placeholder.id];
        if (timer) {
          clearTimeout(timer);
          delete streamFlushTimersRef.current[placeholder.id];
        }
        setStreamActive(placeholder.id, false);
        setStoppingStreamIds((current) => {
          const next = { ...current };
          delete next[placeholder.id];
          return next;
        });
        await releaseBackgroundAgentTask();
      }
    };

    if (mode === 'sequential') {
      for (const member of targets) {
        const task = scheduleReply({ member, text: textForHermes, attachments, depth: 0, goalMode });
        if (task) await task;
      }
    } else {
      for (const member of targets) {
        scheduleReply({ member, text: textForHermes, attachments, depth: 0, goalMode });
      }
    }

    let cursor = 0;
    while (cursor < scheduledPromises.length) {
      const batch = scheduledPromises.slice(cursor);
      cursor = scheduledPromises.length;
      await Promise.allSettled(batch);
      if (
        goalMode
        && goalLeadMember
        && cursor >= scheduledPromises.length
        && goalDelegationCount > reviewedGoalDelegationCount
        && goalReviewRound < MAX_GOAL_REVIEW_ROUNDS
      ) {
        reviewedGoalDelegationCount = goalDelegationCount;
        goalReviewRound += 1;
        scheduleReply({
          member: goalLeadMember,
          text: buildGoalReviewPrompt({ goal: goalMode.goal, room: dispatchRoom, leadMember: goalLeadMember, connections, round: goalReviewRound }),
          attachments: [],
          depth: goalReviewRound,
          goalMode,
          goalReviewRound,
        });
      }
    }

    if (ritual?.definition.autoConsensus) {
      await generateRitualConsensus(dispatchRoom, ritual, turnMessages);
    }
    const terminalGoalMessage = lastGoalTerminalMessage as ChatMessage | null;
    if (goalMode && terminalGoalMessage && !terminalGoalMessage.permissionRequest) {
      showRoomReplyNotification(room.id, terminalGoalMessage);
      void notifyAgentReplyFinished(room.id, terminalGoalMessage, 'goal');
      for (const message of turnMessages) {
        delayedGoalMessageIdsRef.current.delete(message.id);
      }
    }
    } finally {
      await releaseBackgroundAgentTurn();
    }
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

  function updateSelectedRoom(patch: Partial<Room>) {
    if (!selectedRoom) return;
    updateRoomById(selectedRoom.id, patch);
  }

  function updateRoomById(roomId: string, patch: Partial<Room>) {
    const now = new Date().toISOString();
    setRooms((current) => current.map((room) => (
      room.id === roomId ? { ...room, ...patch, updatedAt: now } : room
    )));
  }

  function applyAgentRoomStatePatch(roomId: string, authorName: string, text: string, sourceMessageId?: string) {
    const now = new Date().toISOString();
    const room = roomsRef.current.find((item) => item.id === roomId);
    if (!room) return;
    const application = applyRoomStatePatchFromText(room, text, authorName, now, makeId);
    if (!application) return;
    updateRoomById(roomId, application.patch);
    const appliedCounts = application.counts;
    const total = appliedCounts.knowledge + appliedCounts.blackboard + appliedCounts.decisions + appliedCounts.resolvedBlackboard;
    if (total <= 0) return;
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId,
      roomName: room?.name ?? '未知房间',
      source: authorName,
      messageId: sourceMessageId,
      title: `${authorName} 更新房间状态`,
      body: `知识 ${appliedCounts.knowledge} · 黑板 ${appliedCounts.blackboard} · 决策 ${appliedCounts.decisions} · 已解决 ${appliedCounts.resolvedBlackboard}`,
    });
    appendDiagnosticLog({
      level: 'success',
      category: 'chat',
      title: 'Agent 房间状态写入完成',
      message: `${authorName} 通过 laphiny-room-state 更新了房间状态。`,
      roomId,
      roomName: room?.name,
      meta: appliedCounts,
    });
  }

  function renameSelectedRoom() {
    if (!selectedRoom) return;
    const name = roomNameDraft.trim();
    if (!name) {
      showNotice('房间名不能为空');
      return;
    }
    updateSelectedRoom({ name });
    showNotice('房间已重命名', name);
  }

  function addRoomKnowledgeItem() {
    if (!selectedRoom) return;
    const title = knowledgeTitleDraft.trim();
    const body = knowledgeBodyDraft.trim();
    if (!title || !body) {
      showNotice('知识条目不完整', '请填写标题和内容。');
      return;
    }
    const now = new Date().toISOString();
    updateSelectedRoom({
      knowledgeBase: [
        ...(selectedRoom.knowledgeBase ?? []),
        {
          id: makeId('knowledge'),
          title,
          body,
          tags: ['manual'],
          source: 'manual' as const,
          createdAt: now,
          updatedAt: now,
        },
      ].slice(-80),
    });
    setKnowledgeTitleDraft('');
    setKnowledgeBodyDraft('');
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: 'Laphiny',
      title: '房间知识库已补充',
      body: title,
    });
  }

  function removeRoomKnowledgeItem(itemId: string) {
    if (!selectedRoom) return;
    updateSelectedRoom({
      knowledgeBase: (selectedRoom.knowledgeBase ?? []).filter((item) => item.id !== itemId),
    });
  }

  function addRoomBlackboardItem() {
    if (!selectedRoom) return;
    const text = blackboardDraft.trim();
    if (!text) {
      showNotice('黑板内容不能为空');
      return;
    }
    const now = new Date().toISOString();
    updateSelectedRoom({
      blackboardItems: [
        ...(selectedRoom.blackboardItems ?? []),
        {
          id: makeId('blackboard'),
          text,
          authorName: '用户',
          status: 'open' as const,
          createdAt: now,
          updatedAt: now,
        },
      ].slice(-120),
    });
    setBlackboardDraft('');
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: '用户',
      title: '协作黑板已更新',
      body: text,
    });
  }

  function updateRoomBlackboardItemStatus(itemId: string, status: RoomBlackboardItemStatus) {
    if (!selectedRoom) return;
    const now = new Date().toISOString();
    updateSelectedRoom({
      blackboardItems: (selectedRoom.blackboardItems ?? []).map((item) => (
        item.id === itemId ? { ...item, status, updatedAt: now } : item
      )),
    });
  }

  function removeRoomBlackboardItem(itemId: string) {
    if (!selectedRoom) return;
    updateSelectedRoom({
      blackboardItems: (selectedRoom.blackboardItems ?? []).filter((item) => item.id !== itemId),
    });
  }

  function addRoomDecisionRecord() {
    if (!selectedRoom) return;
    const title = decisionTitleDraft.trim();
    const rationale = decisionRationaleDraft.trim();
    if (!title) {
      showNotice('决策标题不能为空');
      return;
    }
    const now = new Date().toISOString();
    updateSelectedRoom({
      decisionRecords: [
        ...(selectedRoom.decisionRecords ?? []),
        {
          id: makeId('decision'),
          title,
          rationale: rationale || undefined,
          ownerName: '用户',
          source: 'manual' as const,
          status: 'active' as const,
          createdAt: now,
          updatedAt: now,
        },
      ].slice(-80),
    });
    setDecisionTitleDraft('');
    setDecisionRationaleDraft('');
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: '用户',
      title: '决策记录已新增',
      body: title,
    });
  }

  function updateRoomDecisionStatus(itemId: string, status: RoomDecisionRecordStatus) {
    if (!selectedRoom) return;
    const now = new Date().toISOString();
    updateSelectedRoom({
      decisionRecords: (selectedRoom.decisionRecords ?? []).map((item) => (
        item.id === itemId ? { ...item, status, updatedAt: now } : item
      )),
    });
  }

  function removeRoomDecisionRecord(itemId: string) {
    if (!selectedRoom) return;
    updateSelectedRoom({
      decisionRecords: (selectedRoom.decisionRecords ?? []).filter((item) => item.id !== itemId),
    });
  }

  function deleteSelectedRoom() {
    if (!selectedRoom) return;
    const roomToDelete = selectedRoom;
    requestConfirm('删除房间', `将删除「${roomToDelete.name}」及其本地消息记录。不会删除 Hermes 连接配置或服务端记忆。`, () => {
      setRooms((current) => {
        const next = current.filter((room) => room.id !== roomToDelete.id);
        setSelectedRoomId(next[0]?.id ?? null);
        return next;
      });
      setMessagesByRoom((current) => {
        const next = { ...current };
        delete next[roomToDelete.id];
        return next;
      });
      setUnreadByRoom((current) => {
        const next = { ...current };
        delete next[roomToDelete.id];
        return next;
      });
      setRoomToolsOpen(false);
    });
  }

  function updateSelectedRoomRoleplay(patch: Partial<RoleplayConfig>) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const enabledMember = selectedRoom.members.find((member) => member.enabled);
    const base = selectedRoom.roleplay ?? makeDefaultRoleplayConfig(enabledMember?.connectionId);
    const next: RoleplayConfig = {
      ...base,
      ...patch,
      gmConnectionId: patch.gmConnectionId ?? base.gmConnectionId ?? enabledMember?.connectionId,
      updatedAt: new Date().toISOString(),
    };
    updateSelectedRoom({ roleplay: next });
  }

  function toggleSelectedRoomRoleplay() {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const enabledMember = selectedRoom.members.find((member) => member.enabled);
    const current = selectedRoom.roleplay ?? makeDefaultRoleplayConfig(enabledMember?.connectionId);
    const nextEnabled = !current.enabled;
    updateSelectedRoom({
      mode: nextEnabled ? 'tabletop' : selectedRoom.mode,
      roleplay: {
        ...current,
        enabled: nextEnabled,
        gmConnectionId: current.gmConnectionId ?? enabledMember?.connectionId,
        archive: nextEnabled ? current.archive ?? makeDefaultRoleplayArchive(selectedRoom.name, current) : current.archive,
        updatedAt: new Date().toISOString(),
      },
    });
    appendCollaborationEvent({
      kind: nextEnabled ? 'roleplay_started' : 'roleplay_updated',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: 'Laphiny',
      title: nextEnabled ? 'RP 模式已开启' : 'RP 模式已关闭',
      body: nextEnabled ? summarizeRoleplayConfig({ ...current, enabled: true }) : '已切回普通 Soul 协作模式。',
    });
    showNotice(nextEnabled ? 'RP 模式已开启' : 'RP 模式已关闭', nextEnabled ? '普通输入会由 GM 先推进剧情，再让其他 Agent 入戏回应。' : '群聊已恢复普通协作触发规则。');
  }



  function applyRoomMode(mode: RoomModeId) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const definition = getRoomModeDefinition(mode);
    const enabledMember = selectedRoom.members.find((member) => member.enabled);
    const baseRoleplay = selectedRoom.roleplay ?? makeDefaultRoleplayConfig(enabledMember?.connectionId);
    const nextRoleplay: RoleplayConfig | undefined = definition.roleplayEnabled
      ? {
          ...baseRoleplay,
          enabled: true,
          gmConnectionId: baseRoleplay.gmConnectionId ?? enabledMember?.connectionId,
          archive: baseRoleplay.archive ?? makeDefaultRoleplayArchive(selectedRoom.name, baseRoleplay),
          updatedAt: new Date().toISOString(),
        }
      : selectedRoom.roleplay
        ? { ...selectedRoom.roleplay, enabled: false, updatedAt: new Date().toISOString() }
        : undefined;
    updateSelectedRoom({
      mode,
      defaultCollaborationMode: definition.defaultCollaborationMode,
      autoDelegationEnabled: definition.autoDelegationEnabled,
      roleplay: nextRoleplay,
    });
    appendCollaborationEvent({
      kind: definition.roleplayEnabled ? 'roleplay_started' : 'template_applied',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: 'Laphiny',
      title: `房间模式切换为${definition.label}`,
      body: definition.description,
    });
    showNotice('房间模式已切换', `${definition.label}：${definition.description}`);
  }

  async function generateRoleplayArchive() {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const roleplay = selectedRoom.roleplay;
    if (!roleplay?.enabled) {
      showNotice('请先开启 RP 模式');
      return;
    }
    const gm = selectedRoom.members.find((member) => member.connectionId === roleplay.gmConnectionId && member.enabled)
      ?? selectedRoom.members.find((member) => member.enabled);
    if (!gm) {
      showNotice('没有可用于整理档案的 GM');
      return;
    }
    const connection = connectionById.get(gm.connectionId);
    if (!connection) {
      showNotice('GM 连接不存在');
      return;
    }
    const messages = (messagesByRoom[selectedRoom.id] ?? []).filter((message) => message.status === 'sent');
    const fallback = roleplay.archive ?? makeDefaultRoleplayArchive(selectedRoom.name, roleplay);
    setRpArchiveGenerating(true);
    const requestId = makeId('rpArchive');
    const startedAt = Date.now();
    try {
      const client = new HermesClient(connection);
      const response = await client.chatCompletion({
        model: connection.model,
        messages: buildRoleplayArchiveMessages(selectedRoom, messages),
        stream: false,
      }, {
        sessionId: `laphiny-rp-archive-${selectedRoom.id}`,
        sessionKey: selectedRoom.memberSessionKeys?.[connection.id] ?? selectedRoom.sessionKey,
        timeoutMs: 90_000,
      });
      const text = response.choices?.[0]?.message?.content ?? '';
      const archive = parseRoleplayArchiveResponse(text, fallback);
      updateSelectedRoomRoleplay({ archive });
      appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, `RP 剧本档案已更新（v${archive.version}）：${summarizeRoleplayArchive(archive)}`)]);
      appendCollaborationEvent({
        kind: 'roleplay_updated',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: gm.alias,
        title: 'RP 剧本档案已更新',
        body: summarizeRoleplayArchive(archive),
      });
      appendDiagnosticLog({
        level: 'success',
        category: 'chat',
        title: 'RP 剧本档案已更新',
        message: summarizeRoleplayArchive(archive),
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: gm.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      showNotice('RP 档案已更新', summarizeRoleplayArchive(archive));
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'chat',
        title: 'RP 剧本档案更新失败',
        message: getErrorMessage(error),
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: gm.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      showNotice('RP 档案更新失败', getErrorMessage(error));
    } finally {
      setRpArchiveGenerating(false);
    }
  }

  function clearRoleplayArchive() {
    if (!selectedRoom?.roleplay?.archive) return;
    requestConfirm('清空 RP 剧本档案', '只会清空 Laphiny 记录的剧本档案，不会删除聊天记录或 Hermes Soul 记忆。', () => {
      updateSelectedRoomRoleplay({ archive: undefined });
      appendCollaborationEvent({
        kind: 'roleplay_updated',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: 'Laphiny',
        title: 'RP 剧本档案已清空',
        body: '用户清空了当前房间的 RP 档案。',
      });
    });
  }

  function updateSelectedRoomMember(connectionId: string, patch: Partial<RoomMember>) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const now = new Date().toISOString();
    setRooms((current) => current.map((room) => (
      room.id === selectedRoom.id
        ? {
            ...room,
            members: room.members.map((member) => (member.connectionId === connectionId ? { ...member, ...patch } : member)),
            updatedAt: now,
          }
        : room
    )));
    if (patch.enabled === false) {
      setSelectedTargetIds((current) => current.filter((id) => id !== connectionId));
    }
  }

  function removeMemberFromSelectedRoom(member: RoomMember) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    if (selectedRoom.members.length <= 1) {
      showNotice('至少保留一个成员');
      return;
    }
    requestConfirm('移除成员', `将从「${selectedRoom.name}」移除 ${member.alias}。历史消息会保留。`, () => {
      const now = new Date().toISOString();
      setRooms((current) => current.map((room) => {
        if (room.id !== selectedRoom.id) return room;
        const sessionIds = { ...room.sessionIds };
        const memberSessionKeys = { ...(room.memberSessionKeys ?? {}) };
        delete sessionIds[member.connectionId];
        delete memberSessionKeys[member.connectionId];
        return {
          ...room,
          members: room.members.filter((item) => item.connectionId !== member.connectionId),
          sessionIds,
          memberSessionKeys,
          updatedAt: now,
        };
      }));
      setSelectedTargetIds((current) => current.filter((id) => id !== member.connectionId));
    });
  }

  function addMemberToSelectedRoom(connection: HermesConnection) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const now = new Date().toISOString();
    setRooms((current) => current.map((room) => {
      if (room.id !== selectedRoom.id || room.members.some((member) => member.connectionId === connection.id)) return room;
      return {
        ...room,
        members: [...room.members, { connectionId: connection.id, alias: connection.name, enabled: connection.enabled }],
        sessionIds: { ...room.sessionIds, [connection.id]: `laphiny-${room.id}-${connection.id}` },
        memberSessionKeys: { ...(room.memberSessionKeys ?? {}), [connection.id]: `laphiny-${room.id}-key` },
        updatedAt: now,
      };
    }));
  }

  function updateContextLimit(delta: number) {
    if (!selectedRoom) return;
    const currentLimit = selectedRoom.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
    updateSelectedRoom({ contextLimit: Math.max(4, Math.min(80, currentLimit + delta)) });
  }

  function setRoomDefaultCollaborationMode(mode: Room['defaultCollaborationMode']) {
    updateSelectedRoom({ defaultCollaborationMode: mode });
  }

  function toggleRoomAutoDelegation() {
    if (!selectedRoom) return;
    updateSelectedRoom({ autoDelegationEnabled: selectedRoom.autoDelegationEnabled === false });
  }

  function updateRoomDelegationDepth(delta: number) {
    if (!selectedRoom) return;
    const next = Math.max(0, Math.min(6, (selectedRoom.maxDelegationDepth ?? MAX_DELEGATION_DEPTH) + delta));
    updateSelectedRoom({ maxDelegationDepth: next });
  }

  function setRoomSummaryConnection(connectionId?: string) {
    updateSelectedRoom({ summaryConnectionId: connectionId });
  }

  function saveSelectedRoomAsTeamTemplate() {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const name = teamTemplateName.trim() || `${selectedRoom.name} 模板`;
    const now = new Date().toISOString();
    const template: TeamTemplate = {
      id: makeId('team'),
      name,
      description: `由「${selectedRoom.name}」保存的 Soul 小队模板`,
      memberOrder: selectedRoom.members.map((member) => member.connectionId),
      defaultMode: selectedRoom.defaultCollaborationMode ?? 'manual',
      summaryConnectionId: selectedRoom.summaryConnectionId,
      autoDelegationEnabled: selectedRoom.autoDelegationEnabled !== false,
      maxDelegationDepth: selectedRoom.maxDelegationDepth ?? MAX_DELEGATION_DEPTH,
      createdAt: now,
      updatedAt: now,
    };
    setTeamTemplates((current) => [...current, template].slice(-50));
    appendCollaborationEvent({
      kind: 'template_applied',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: 'Laphiny',
      title: '团队模板已保存',
      body: name,
    });
    showNotice('团队模板已保存', name);
  }

  function applyTeamTemplateToSelectedRoom(template: TeamTemplate) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const memberById = new Map(selectedRoom.members.map((member) => [member.connectionId, member]));
    const orderedMembers = [
      ...template.memberOrder.map((id) => memberById.get(id)).filter((member): member is RoomMember => Boolean(member)),
      ...selectedRoom.members.filter((member) => !template.memberOrder.includes(member.connectionId)),
    ];
    updateSelectedRoom({
      members: orderedMembers,
      defaultCollaborationMode: template.defaultMode,
      summaryConnectionId: template.summaryConnectionId,
      autoDelegationEnabled: template.autoDelegationEnabled,
      maxDelegationDepth: template.maxDelegationDepth,
    });
    appendCollaborationEvent({
      kind: 'template_applied',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: 'Laphiny',
      title: '团队模板已应用',
      body: template.name,
    });
    showNotice('团队模板已应用', template.name);
  }

  function deleteTeamTemplate(template: TeamTemplate) {
    requestConfirm('删除团队模板', `将删除「${template.name}」。不会影响已有房间。`, () => {
      setTeamTemplates((current) => current.filter((item) => item.id !== template.id));
    });
  }

  function restoreProfileVersion(version: AgentProfileVersion) {
    setConnections((current) => current.map((connection) => (
      connection.id === version.connectionId
        ? { ...connection, profile: version.profile, updatedAt: new Date().toISOString() }
        : connection
    )));
    showNotice('协作卡片已回滚', version.connectionName);
  }

  async function generateRoomSummary() {
    if (!selectedRoom) return;
    const messages = (messagesByRoom[selectedRoom.id] ?? []).filter((message) => message.status === 'sent');
    if (messages.length === 0) {
      showNotice('没有可总结的消息');
      return;
    }

    const summaryMember = selectedRoom.members.find((member) => member.connectionId === selectedRoom.summaryConnectionId && member.enabled)
      ?? selectedRoom.members.find((member) => member.enabled);
    if (!summaryMember) {
      showNotice('没有可用于总结的成员');
      return;
    }
    const connection = connectionById.get(summaryMember.connectionId);
    if (!connection) {
      showNotice('总结成员连接不存在');
      return;
    }

    setSummaryGenerating(true);
    const requestId = makeId('summary');
    const startedAt = Date.now();
    try {
      const client = new HermesClient(connection);
      const history = buildSummaryMessages(selectedRoom, summaryMember, messages, connections, selectedRoom.contextLimit ?? DEFAULT_CONTEXT_LIMIT);
      const response = await client.chatCompletion({
        model: connection.model,
        messages: history,
        stream: false,
      }, {
        sessionId: `laphiny-summary-${selectedRoom.id}`,
        sessionKey: selectedRoom.memberSessionKeys?.[connection.id] ?? selectedRoom.sessionKey,
        timeoutMs: 90_000,
      });
      const content = response.choices?.[0]?.message?.content?.trim() || '没有生成总结。';
      const summary = {
        id: makeId('summary'),
        roomId: selectedRoom.id,
        authorConnectionId: summaryMember.connectionId,
        authorName: summaryMember.alias,
        content,
        sourceMessageCount: messages.length,
        createdAt: new Date().toISOString(),
      };
      updateSelectedRoom({ lastSummary: summary });
      appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, `本轮共识总结（${summaryMember.alias}）：
${content}`)]);
      appendCollaborationEvent({
        kind: 'summary_created',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: summaryMember.alias,
        title: `${summaryMember.alias} 生成房间共识`,
        body: content,
      });
      appendDiagnosticLog({
        level: 'success',
        category: 'chat',
        title: '房间总结已生成',
        message: `${summaryMember.alias} 总结了 ${messages.length} 条消息。`,
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: summaryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'chat',
        title: '房间总结生成失败',
        message: getErrorMessage(error),
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: summaryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      showNotice('总结失败', getErrorMessage(error));
    } finally {
      setSummaryGenerating(false);
    }
  }

  async function generateRitualConsensus(room: Room, ritual: ParsedCollaborationRitual, turnMessages: ChatMessage[]) {
    const summaryMember = room.members.find((member) => member.connectionId === room.summaryConnectionId && member.enabled)
      ?? room.members.find((member) => member.enabled);
    if (!summaryMember) return;
    const connection = connectionById.get(summaryMember.connectionId);
    if (!connection) return;

    const agentMessages = turnMessages.filter((message) => (
      message.roomId === room.id
      && message.role === 'assistant'
      && message.status === 'sent'
      && message.authorId !== 'system'
    ));
    if (!agentMessages.length) return;

    const transcript = agentMessages.map((message) => `${message.authorName}：${message.content}`).join('\n\n');
    const requestId = makeId('ritual');
    const startedAt = Date.now();
    try {
      const client = new HermesClient(connection);
      const response = await client.chatCompletion({
        model: connection.model,
        messages: buildRitualConsensusMessages({ ritual, room, transcript, summaryMember }),
        stream: false,
      }, {
        sessionId: `laphiny-ritual-${room.id}`,
        sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
        timeoutMs: 90_000,
      });
      const content = response.choices?.[0]?.message?.content?.trim() || '没有生成仪式共识。';
      const summary = {
        id: makeId('summary'),
        roomId: room.id,
        authorConnectionId: summaryMember.connectionId,
        authorName: summaryMember.alias,
        content,
        sourceMessageCount: agentMessages.length,
        createdAt: new Date().toISOString(),
      };
      updateRoomById(room.id, { lastSummary: summary });
      appendMessagesToRoom(room.id, [makeLocalNotice(room.id, `${ritual.definition.label}最终共识（${summaryMember.alias}）：\n${content}`)]);
      appendCollaborationEvent({
        kind: 'ritual_completed',
        roomId: room.id,
        roomName: room.name,
        source: summaryMember.alias,
        title: `${ritual.definition.label}已完成`,
        body: content,
      });
      appendDiagnosticLog({
        level: 'success',
        category: 'chat',
        title: '协作仪式共识已生成',
        message: `${ritual.definition.label} · ${summaryMember.alias} 汇总 ${agentMessages.length} 条成员发言。`,
        roomId: room.id,
        roomName: room.name,
        connectionId: connection.id,
        connectionName: summaryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
        meta: { ritual: ritual.definition.id, messages: agentMessages.length },
      });
    } catch (error) {
      appendDiagnosticLog({
        level: 'warning',
        category: 'chat',
        title: '协作仪式共识生成失败',
        message: getErrorMessage(error),
        roomId: room.id,
        roomName: room.name,
        connectionId: connection.id,
        connectionName: summaryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
        meta: { ritual: ritual.definition.id },
      });
    }
  }

  async function generateRoomMemoryCapsule() {
    if (!selectedRoom) return;
    const messages = (messagesByRoom[selectedRoom.id] ?? []).filter((message) => message.status === 'sent');
    if (!messages.length) {
      showNotice('没有可生成记忆的消息');
      return;
    }
    const memoryMember = selectedRoom.members.find((member) => member.connectionId === selectedRoom.summaryConnectionId && member.enabled)
      ?? selectedRoom.members.find((member) => member.enabled);
    if (!memoryMember) {
      showNotice('没有可用于生成记忆的成员');
      return;
    }
    const connection = connectionById.get(memoryMember.connectionId);
    if (!connection) {
      showNotice('记忆生成成员连接不存在');
      return;
    }

    setMemoryGenerating(true);
    const requestId = makeId('memory');
    const startedAt = Date.now();
    try {
      const client = new HermesClient(connection);
      const response = await client.chatCompletion({
        model: connection.model,
        messages: buildRoomMemoryMessages(selectedRoom, memoryMember, messages),
        stream: false,
      }, {
        sessionId: `laphiny-memory-${selectedRoom.id}`,
        sessionKey: selectedRoom.memberSessionKeys?.[connection.id] ?? selectedRoom.sessionKey,
        timeoutMs: 90_000,
      });
      const text = response.choices?.[0]?.message?.content ?? '';
      const previousVersion = selectedRoom.memoryCapsule?.version ?? 0;
      const capsule: RoomMemoryCapsule = {
        ...parseRoomMemoryResponse(text, selectedRoom.id, memoryMember.alias),
        version: previousVersion + 1,
      };
      updateSelectedRoom({ pendingMemoryCapsule: capsule });
      appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, `房间记忆草案已生成（v${capsule.version}），请在房间工具里确认后再沉淀：\n${summarizeRoomMemory(capsule)}`)]);
      appendCollaborationEvent({
        kind: 'memory_updated',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: memoryMember.alias,
        title: '房间记忆草案待确认',
        body: summarizeRoomMemory(capsule),
      });
      appendDiagnosticLog({
        level: 'success',
        category: 'chat',
        title: '房间记忆草案已生成',
        message: summarizeRoomMemory(capsule),
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: memoryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      showNotice('记忆草案已生成', '请在房间工具里确认后再写入长期房间记忆。');
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'chat',
        title: '房间记忆胶囊生成失败',
        message: getErrorMessage(error),
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: memoryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      showNotice('记忆生成失败', getErrorMessage(error));
    } finally {
      setMemoryGenerating(false);
    }
  }

  function clearRoomMemoryCapsule() {
    if (!selectedRoom?.memoryCapsule) return;
    requestConfirm('清空房间记忆胶囊', '只会清空 Laphiny 的房间共享记忆，不会影响任何 Hermes Soul 的长期记忆。', () => {
      updateSelectedRoom({ memoryCapsule: undefined });
      appendCollaborationEvent({
        kind: 'memory_updated',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: 'Laphiny',
        title: '房间记忆胶囊已清空',
        body: '用户清空了当前房间的共享记忆胶囊。',
      });
    });
  }

  function confirmPendingRoomMemoryCapsule() {
    if (!selectedRoom?.pendingMemoryCapsule) return;
    const now = new Date().toISOString();
    const capsule: RoomMemoryCapsule = {
      ...selectedRoom.pendingMemoryCapsule,
      updatedAt: now,
    };
    const growth = applyMemoryCapsuleToRoomGrowth(selectedRoom, capsule, now, makeId);
    updateSelectedRoom({
      ...growth,
      memoryCapsule: capsule,
      pendingMemoryCapsule: undefined,
    });
    appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, `房间记忆已确认并沉淀（v${capsule.version}）：\n${summarizeRoomMemory(capsule)}`)]);
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: '用户',
      title: '房间记忆已确认沉淀',
      body: summarizeRoomMemory(capsule),
    });
    showNotice('记忆已沉淀', '知识库、协作黑板和决策记录已根据这次记忆同步更新。');
  }

  function discardPendingRoomMemoryCapsule() {
    if (!selectedRoom?.pendingMemoryCapsule) return;
    requestConfirm('丢弃记忆草案', '这只会丢弃当前待确认的房间记忆草案，不影响已确认记忆。', () => {
      updateSelectedRoom({ pendingMemoryCapsule: undefined });
      appendCollaborationEvent({
        kind: 'memory_updated',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: '用户',
        title: '房间记忆草案已丢弃',
      });
    });
  }

  function resetRoomSession() {
    if (!selectedRoom) return;
    requestConfirm('清空 Hermes 记忆', '将为当前房间生成新的 sessionKey，后续请求不会继续旧会话。', () => {
      updateSelectedRoom({
        sessionIds: {},
        sessionKey: `laphiny-${selectedRoom.id}-${Date.now().toString(36)}`,
      });
      appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, '已重置当前房间的 Hermes 会话。')]);
    });
  }

  function clearSelectedRoomMessages() {
    if (!selectedRoom) return;
    requestConfirm('清空本地记录', '这只会清空当前设备里的这个房间消息，不会删除连接配置。', () => {
      setMessagesByRoom((current) => ({
        ...current,
        [selectedRoom.id]: [],
      }));
    });
  }

  async function exportSelectedRoom(format: 'json' | 'markdown') {
    if (!selectedRoom) return;
    const messages = messagesByRoom[selectedRoom.id] ?? [];
    const text = format === 'json'
      ? JSON.stringify({ room: selectedRoom, messages }, null, 2)
      : buildMarkdownExport(selectedRoom, messages);

    await Clipboard.setStringAsync(text);
    showNotice(format === 'json' ? 'JSON 已复制' : 'Markdown 已复制', '当前房间记录已复制到剪贴板。');
  }

  async function copyAgentReply(message: ChatMessage) {
    const text = normalizeHermesReplyText(message.content).trim();
    if (!text) {
      showNotice('暂无可复制内容', '这条回复还没有文本内容。');
      return;
    }

    await Clipboard.setStringAsync(text);
    showNotice('回复已复制', `${message.authorName} 的回复已复制到剪贴板。`);
  }

  async function downloadAttachment(attachment: Attachment) {
    try {
      const saved = await saveAttachmentToDownloads(attachment);
      if (!saved) {
        showNotice('附件暂不可下载', '目前支持下载 AI 回发的 txt、md、png、jpg 文件。');
        return;
      }
      showNotice(
        saved.userVisible ? '附件已保存' : '附件已保存到应用目录',
        saved.userVisible
          ? `${attachment.name} 已保存到 ${saved.locationLabel}。`
          : `系统未授予下载目录权限，已保存到应用私有目录：${saved.uri}`,
      );
    } catch (error) {
      showNotice('附件保存失败', getErrorMessage(error));
    }
  }

  async function saveAttachmentToDownloads(attachment: Attachment): Promise<{ uri: string; userVisible: boolean; locationLabel: string } | null> {
    const filename = sanitizeDownloadFilename(attachment.name);
    if (!filename) return null;

    if (attachment.kind === 'text' && typeof attachment.text === 'string') {
      return saveDownloadFile({
        filename,
        mimeType: attachment.mimeType || 'text/plain',
        data: attachment.text,
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    if (attachment.kind === 'image' && attachment.dataUrl) {
      const base64 = getBase64FromDataUrl(attachment.dataUrl);
      if (!base64) return null;
      return saveDownloadFile({
        filename,
        mimeType: attachment.mimeType || 'image/png',
        data: base64,
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    return null;
  }

  async function saveDownloadFile({
    filename,
    mimeType,
    data,
    encoding,
  }: {
    filename: string;
    mimeType: string;
    data: string;
    encoding: FileSystem.EncodingType;
  }): Promise<{ uri: string; userVisible: boolean; locationLabel: string }> {
    if (Platform.OS === 'web') {
      const href = encoding === FileSystem.EncodingType.Base64
        ? `data:${mimeType};base64,${data}`
        : URL.createObjectURL(new Blob([data], { type: mimeType }));
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      if (encoding !== FileSystem.EncodingType.Base64) {
        setTimeout(() => URL.revokeObjectURL(href), 1000);
      }
      return { uri: filename, userVisible: true, locationLabel: '浏览器默认下载目录' };
    }

    if (Platform.OS === 'android') {
      const storage = FileSystem.StorageAccessFramework;
      const mime = normalizeDownloadMimeType(filename, mimeType);
      const writeToDirectory = async (directoryUri: string, locationLabel: string) => {
        const fileUri = await storage.createFileAsync(directoryUri, filename, mime);
        await storage.writeAsStringAsync(fileUri, data, { encoding });
        return { uri: fileUri, userVisible: true, locationLabel };
      };

      if (appPreferences.downloadDirectoryUri) {
        try {
          return await writeToDirectory(appPreferences.downloadDirectoryUri, appPreferences.downloadDirectoryLabel ?? '已选择下载目录');
        } catch (error) {
          console.warn('Saved Android download directory is no longer writable; requesting a fresh directory.', error);
          updateAppPreferences({ downloadDirectoryUri: undefined, downloadDirectoryLabel: undefined });
        }
      }

      try {
        const initialUri = storage.getUriForDirectoryInRoot('Download');
        const permission = await storage.requestDirectoryPermissionsAsync(initialUri);
        if (permission.granted) {
          updateAppPreferences({ downloadDirectoryUri: permission.directoryUri, downloadDirectoryLabel: '已选择下载目录' });
          return await writeToDirectory(permission.directoryUri, '已选择下载目录');
        }
      } catch (error) {
        console.warn('Android download via Storage Access Framework failed; falling back to app-private storage.', error);
      }
    }

    const directory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!directory) throw new Error('当前设备没有可写入的文件目录');
    const laphinyDir = `${directory}Laphiny/`;
    const info = await FileSystem.getInfoAsync(laphinyDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(laphinyDir, { intermediates: true });
    }
    const fileUri = `${laphinyDir}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, data, { encoding });
    return { uri: fileUri, userVisible: false, locationLabel: '应用私有目录/Laphiny' };
  }

  function sanitizeDownloadFilename(filename: string): string {
    return filename
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  function normalizeDownloadMimeType(filename: string, mimeType: string): string {
    const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    if (extension === 'txt') return 'text/plain';
    if (extension === 'md') return 'text/markdown';
    if (extension === 'png') return 'image/png';
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
    return mimeType || 'application/octet-stream';
  }

  function getBase64FromDataUrl(dataUrl: string): string | null {
    const match = dataUrl.match(/^data:image\/(?:png|jpeg);base64,([a-z0-9+/=]+)$/i);
    return match?.[1] ?? null;
  }

  function getConnectionAvatarUri(connectionId: string): string | undefined {
    return connectionById.get(connectionId)?.avatarUri;
  }

  function makeGoalSession(roomId: string, goal: string, leadMember: RoomMember, now: string, sourceMessageId?: string): GoalSession {
    return {
      id: makeId('goal'),
      roomId,
      goal: goal || '未命名目标',
      leadConnectionId: leadMember.connectionId,
      leadAlias: leadMember.alias,
      round: 1,
      status: 'running',
      planItems: [],
      lastMessageId: sourceMessageId,
      createdAt: now,
      updatedAt: now,
    };
  }

  function getGoalControlCommand(room: Room, rawText: string): { type: 'continue' | 'finish' } | null {
    const activeGoal = room.activeGoal;
    if (!activeGoal || activeGoal.status !== 'awaiting_user') return null;
    const normalized = rawText.trim().toLowerCase();
    if (!normalized) return null;
    if (['继续', '繼續', 'continue', '/goal-continue'].includes(normalized)) return { type: 'continue' };
    if (['结束', '完成', '結束', 'finish', 'end', '/goal-finish', '/goal-end'].includes(normalized)) return { type: 'finish' };
    return null;
  }

  function getActiveGoalLeadMember(room: Room): RoomMember | undefined {
    const activeGoal = room.activeGoal;
    if (!activeGoal) return undefined;
    return room.members.find((member) => member.enabled && member.connectionId === activeGoal.leadConnectionId)
      ?? room.members.find((member) => member.enabled && member.alias === activeGoal.leadAlias)
      ?? room.members.find((member) => member.enabled);
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

  function getGoalStatusFromSignal(signal: GoalStatusSignal | null): GoalSession['status'] {
    if (signal === 'done' || signal === 'blocked') return 'awaiting_user';
    if (signal === 'continue') return 'running';
    return 'reviewing';
  }

  function mergeGoalPlanItems(current: GoalSession['planItems'], incoming: GoalSession['planItems']): GoalSession['planItems'] {
    const byId = new Map(current.map((item) => [item.id, item]));
    for (const item of incoming) {
      const existing = byId.get(item.id);
      byId.set(item.id, existing ? { ...existing, ...item } : item);
    }
    return Array.from(byId.values());
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

  function buildGoalMemoryCapsule(room: Room, goal: GoalSession, now: string): RoomMemoryCapsule {
    const previous = room.memoryCapsule;
    const doneItems = goal.planItems.filter((item) => item.status === 'done').map((item) => item.title);
    const remainingItems = goal.planItems.filter((item) => item.status !== 'done').map((item) => `${item.title}${item.ownerAlias ? `（${item.ownerAlias}）` : ''}`);
    return {
      id: previous?.id ?? makeId('memory'),
      roomId: room.id,
      goal: goal.goal,
      decisions: uniqueStrings([
        ...(previous?.decisions ?? []),
        `${goal.status === 'blocked' ? '目标暂停/受阻' : '目标完成'}：${goal.goal}`,
        ...doneItems.map((item) => `完成：${item}`),
      ]).slice(-12),
      todos: uniqueStrings([
        ...remainingItems,
        ...(previous?.todos ?? []),
      ]).slice(0, 12),
      preferences: previous?.preferences ?? [],
      openQuestions: uniqueStrings([
        ...(goal.status === 'blocked' ? ['目标受阻，需要用户确认下一步。'] : []),
        ...(previous?.openQuestions ?? []),
      ]).slice(0, 12),
      handoffNotes: goal.lastReview || previous?.handoffNotes,
      source: 'agent-generated',
      authorName: goal.leadAlias,
      version: (previous?.version ?? 0) + 1,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
  }

  function uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
    return result;
  }

  function beginEditLastUserMessage() {
    if (!selectedRoom || !lastEditableUserMessage) return;
    const roomMessages = messagesByRoom[selectedRoom.id] ?? [];
    const messageIndex = roomMessages.findIndex((message) => message.id === lastEditableUserMessage.id);
    if (messageIndex < 0) return;

    for (const message of roomMessages.slice(messageIndex + 1)) {
      if (message.status === 'running') {
        streamControllersRef.current[message.id]?.abort();
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

  function appendDiagnosticLog(input: Omit<DiagnosticLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) {
    const entry = makeDiagnosticLog(input);
    setDiagnosticLogs((current) => appendDiagnosticLogEntry(current, entry));
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

  function makeFeedbackClient(): LaphinyFeedbackClient | null {
    if (!feedbackConfig.enabled || !feedbackConfig.baseUrl.trim()) return null;
    return new LaphinyFeedbackClient(feedbackConfig);
  }

  function buildSanitizedDiagnosticObject(): Record<string, unknown> {
    const bundle = buildDiagnosticBundle({
      connections,
      rooms,
      messagesByRoom,
      diagnosticLogs,
      appVersion: APP_VERSION,
      storage: storageBackend ? { ...storageBackend, messageBytes: storageSummary.messageBytes } : { messageBytes: storageSummary.messageBytes },
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

  function makeSyncClient(): LaphinySyncClient | null {
    if (!syncConfig.enabled || !syncConfig.baseUrl.trim()) return null;
    return new LaphinySyncClient(syncConfig);
  }

  function buildSyncSnapshot(): SyncSnapshot {
    return {
      connections,
      rooms,
      messagesByRoom,
      squareEvents,
      collaborationEvents,
      delegationTasks,
      teamTemplates,
      profileVersions,
      updatedAt: new Date().toISOString(),
    };
  }

  function applySyncSnapshot(snapshot: SyncSnapshot) {
    setSyncConflictReport(null);
    setConnections((current) => mergeByUpdatedAt(current, snapshot.connections));
    setRooms((current) => mergeByUpdatedAt(current, snapshot.rooms));
    setMessagesByRoom((current) => mergeMessagesByRoom(current, snapshot.messagesByRoom));
    setSquareEvents((current) => mergeSquareEvents([...current, ...(snapshot.squareEvents ?? [])]).slice(-300));
    if (snapshot.collaborationEvents?.length) setCollaborationEvents((current) => mergeCollaborationEvents([...current, ...(snapshot.collaborationEvents ?? [])]).slice(-500));
    if (snapshot.delegationTasks?.length) setDelegationTasks((current) => mergeDelegationTasks([...current, ...(snapshot.delegationTasks ?? [])]).slice(-200));
    if (snapshot.teamTemplates?.length) setTeamTemplates((current) => mergeByUpdatedAt(current, snapshot.teamTemplates ?? []));
    if (snapshot.profileVersions?.length) setProfileVersions((current) => mergeProfileVersions([...current, ...(snapshot.profileVersions ?? [])]).slice(-100));
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

  function buildAppBackup(): LaphinyBackup {
    return {
      version: 5,
      exportedAt: new Date().toISOString(),
      ...buildSyncSnapshot(),
      syncConfig,
      diagnosticLogs,
    };
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
      if (snapshot.diagnosticLogs?.length) {
        setDiagnosticLogs((current) => sanitizeDiagnosticLogs([...current, ...(snapshot.diagnosticLogs ?? [])]));
      }
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

  async function saveTextFile(filename: string, text: string, mimeType: string): Promise<{ uri: string; userVisible: boolean; locationLabel: string } | null> {
    try {
      return await saveDownloadFile({
        filename,
        mimeType,
        data: text,
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (error) {
      console.warn('Text file export failed.', error);
      return null;
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

  async function installPwa() {
    if (!pwaInstallPrompt) {
      showNotice('暂时不能安装', '当前浏览器还没有提供安装入口。请确认正在使用 HTTPS 或浏览器菜单中的“安装应用”。');
      return;
    }

    try {
      await pwaInstallPrompt.prompt();
      const choice = await pwaInstallPrompt.userChoice;
      setPwaInstallPrompt(null);
      appendDiagnosticLog({
        level: choice.outcome === 'accepted' ? 'success' : 'info',
        category: 'system',
        title: choice.outcome === 'accepted' ? 'PWA 安装已接受' : 'PWA 安装已取消',
        message: `平台：${choice.platform || 'unknown'}`,
      });
    } catch (error) {
      appendDiagnosticLog({
        level: 'warning',
        category: 'system',
        title: 'PWA 安装触发失败',
        message: getErrorMessage(error),
      });
      showNotice('安装失败', getErrorMessage(error));
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
      setSyncConfig((current) => ({ ...current, lastPushedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
      appendDiagnosticLog({
        level: 'success',
        category: 'sync',
        title: '同步快照推送成功',
        message: '本机房间、消息和灵庭事件已发送到后端。',
        durationMs: Date.now() - startedAt,
        meta: { rooms: rooms.length, connections: connections.length },
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
      <View style={[styles.header, isDarkMode && styles.headerDark]}>
        <View style={styles.brandBlock}>
          <Text style={[styles.title, isDarkMode && styles.titleDark]}>Laphiny</Text>
          <Text style={[styles.subtitle, isDarkMode && styles.subtitleDark]}>多 Hermes 协作聊天</Text>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.statPill}>
            <Ionicons name="chatbubbles-outline" size={14} color="#1f2937" />
            <Text style={styles.statText}>{rooms.length} 房间</Text>
          </View>
          <View style={[styles.statPill, styles.statPillAccent]}>
            <Ionicons name="radio-outline" size={14} color="#065f46" />
            <Text style={[styles.statText, styles.statTextAccent]}>{enabledConnections.length} 可用</Text>
          </View>
          {totalUnread > 0 ? (
            <View style={styles.unreadPill}>
              <Ionicons name="notifications" size={14} color="#991b1b" />
              <Text style={styles.unreadPillText}>{totalUnread} 未读</Text>
            </View>
          ) : null}
        </View>
      </View>
      ) : null}

      {!mobileFocusedChat ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        <TabButton icon="chatbubble-ellipses-outline" label="聊天" active={tab === 'chat'} onPress={() => setTab('chat')} />
        <TabButton icon="planet-outline" label="灵庭" active={tab === 'square'} onPress={() => setTab('square')} />
        <TabButton icon="albums-outline" label="房间" active={tab === 'rooms'} onPress={() => setTab('rooms')} />
        <TabButton icon="git-network-outline" label="连接" active={tab === 'connections'} onPress={() => setTab('connections')} />
        <TabButton icon="settings-outline" label="设置" active={tab === 'settings'} onPress={() => setTab('settings')} />
      </ScrollView>
      ) : null}

      {!mobileFocusedChat ? renderRuntimeBanner() : null}
      {renderAttachmentPreviewModal()}

      {tab === 'chat' ? renderChat() : null}
      {tab === 'square' ? renderSquare() : null}
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
          onboardingPanel={renderOnboardingPanel()}
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

  function renderMessageBubble(message: ChatMessage) {
    const renderable = getRenderableMessageArtifacts(message);
    const displayContent = message.authorId === 'user'
      ? renderable.content
      : normalizeHermesReplyText(renderable.content);

    return (
      <View
        style={[
          styles.messageBubble,
          isDarkMode && styles.messageBubbleDark,
          getMessageBubbleStyle(message),
          isWideLayout && styles.messageBubbleWide,
        ]}
      >
        {message.delegatedFrom ? (
          <View style={styles.delegationBadge}>
            <Ionicons name="git-branch-outline" size={12} color="#6b7280" />
            <Text style={styles.delegationText}>→ {message.delegatedFrom} 委托</Text>
          </View>
        ) : null}
        <View style={styles.messageMeta}>
          <View style={styles.authorBlock}>
            {message.authorId !== 'user' && message.authorId !== 'system' ? <AgentAvatar alias={message.authorName} size={22} imageUri={getConnectionAvatarUri(message.authorId)} /> : null}
            <Text style={styles.author}>{message.authorName}</Text>
            {message.authorId !== 'user' && message.authorId !== 'system' ? <Text style={styles.messageRoleBadge}>{getMessageRoleBadge(message)}</Text> : null}
          </View>
          <Text style={[styles.status, message.status === 'error' && styles.statusError]}>
            {getStatusLabel(message.status)} · {formatTime(message.createdAt)}
            {message.error ? ` · ${message.error}` : ''}
          </Text>
        </View>
        <MarkdownText content={displayContent} fontFamily={selectedFontFamily} />
        {renderable.attachments.length ? (
          <View style={styles.attachments}>
            {renderable.attachments.map((attachment) => (
              <AttachmentPreview
                key={attachment.id}
                attachment={attachment}
                actionIcon="eye-outline"
                onPress={() => setPreviewAttachment(attachment)}
              />
            ))}
          </View>
        ) : null}
        {message.permissionRequest ? renderAgentPermissionPanel(message) : null}
        {message.authorId !== 'user' && message.authorId !== 'system' ? (
          <View style={styles.messageActions}>
            <MiniButton icon="copy-outline" label="复制" onPress={() => copyAgentReply(message)} />
            {message.status === 'running' ? (
              <MiniButton icon="stop-circle-outline" label={stoppingStreamIds[message.id] ? '停止中' : '停止'} onPress={() => stopMessage(message.id)} />
            ) : (
              <MiniButton icon="refresh-outline" label="重试" onPress={() => retryMessage(message)} />
            )}
          </View>
        ) : null}
        {message.authorId === 'user' && message.id === lastEditableUserMessage?.id && !sending ? (
          <View style={styles.messageActions}>
            <MiniButton icon="create-outline" label="编辑并回滚" onPress={beginEditLastUserMessage} />
          </View>
        ) : null}
      </View>
    );
  }

  function renderAgentPermissionPanel(message: ChatMessage) {
    const request = message.permissionRequest;
    if (!request) return null;
    const pending = request.status === 'pending';
    const statusText = request.status === 'pending'
      ? '等待选择'
      : request.status === 'denied'
        ? '已拒绝'
        : request.status === 'always'
          ? '已设为总是同意'
          : '已同意';

    return (
      <View style={styles.permissionPanel}>
        <View style={styles.permissionHeader}>
          <View style={styles.permissionTitleRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#92400e" />
            <Text style={styles.permissionTitle}>{request.title}</Text>
          </View>
          <Text style={[styles.permissionStatus, !pending && styles.permissionStatusDone]}>{statusText}</Text>
        </View>
        <Text style={styles.permissionBody}>{request.body}</Text>
        {request.reason ? <Text style={styles.permissionReason}>{request.reason}</Text> : null}
        {pending ? (
          <View style={styles.permissionActions}>
            <TouchableOpacity style={[styles.permissionButton, styles.permissionButtonPrimary]} onPress={() => resolveAgentPermissionRequest(message, 'allow')}>
              <Ionicons name="checkmark-outline" size={15} color="#ffffff" />
              <Text style={[styles.permissionButtonText, styles.permissionButtonTextPrimary]}>同意</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.permissionButton} onPress={() => resolveAgentPermissionRequest(message, 'deny')}>
              <Ionicons name="close-outline" size={15} color="#374151" />
              <Text style={styles.permissionButtonText}>拒绝</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.permissionButton} onPress={() => resolveAgentPermissionRequest(message, 'always')}>
              <Ionicons name="infinite-outline" size={15} color="#374151" />
              <Text style={styles.permissionButtonText}>总是同意</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  }

  function renderChat() {
    const roomDetailsOpen = !roomDetailsCollapsed;
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

        {selectedRoom && !focused ? (
          <View style={styles.chatHeader}>
            <View style={styles.roomTitleBlock}>
              <Text style={styles.roomTitle}>{selectedRoom.name}</Text>
              <Text style={styles.roomSummary}>
                {selectedRoom.kind === 'group' ? '群聊' : '单聊'} · {selectedRoom.members.length} 位 Hermes · 上下文 {selectedRoom.contextLimit ?? DEFAULT_CONTEXT_LIMIT} 条
              </Text>
            </View>
            <View style={styles.roomHeaderActions}>
              <MiniButton
                icon={quickCommandsOpen ? 'flash' : 'flash-outline'}
                label="模式"
                onPress={() => {
                  setRoomDetailsCollapsed(false);
                  setQuickCommandsOpen((open) => !open);
                }}
              />
              <MiniButton
                icon={roomToolsOpen ? 'options' : 'options-outline'}
                label="工具"
                onPress={() => {
                  setRoomDetailsCollapsed(false);
                  setRoomToolsOpen((open) => !open);
                }}
              />
              {isWideLayout && selectedRoom.kind === 'group' ? (
                <MiniButton
                  icon={collaborationDrawerOpen ? 'albums' : 'albums-outline'}
                  label={collaborationDrawerOpen ? '收起侧栏' : '协作侧栏'}
                  onPress={() => setCollaborationDrawerOpen((open) => !open)}
                />
              ) : null}
              <MiniButton
                icon={roomDetailsOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
                label={roomDetailsOpen ? '收起详情' : '展开详情'}
                onPress={() => setRoomDetailsCollapsed((collapsed) => !collapsed)}
              />
            </View>
            {roomDetailsOpen ? (
              <ScrollView
                style={[styles.roomDetailsScroll, { maxHeight: roomDetailsMaxHeight }]}
                contentContainerStyle={styles.roomDetailsContent}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {renderRoomStatusBar()}
                {renderActiveGoalPanel()}
                {renderRoleplaySceneCard()}
                <View style={styles.memberChips}>
                  {selectedRoom.kind === 'group' ? (
                    <TouchableOpacity
                      style={[
                        styles.memberChip,
                        selectedTargetIds.length === selectedRoom.members.filter((member) => member.enabled).length && styles.memberChipSelected,
                      ]}
                      onPress={selectAllTargets}
                    >
                      <Text style={styles.memberChipText}>@all</Text>
                    </TouchableOpacity>
                  ) : null}
                  {selectedRoom.members.map((member) => (
                    <TouchableOpacity
                      key={member.connectionId}
                      style={[styles.memberChip, selectedTargetSet.has(member.connectionId) && styles.memberChipSelected, !member.enabled && styles.memberChipDisabled]}
                      onPress={() => selectedRoom.kind === 'group' ? toggleTargetSelection(member.connectionId) : insertMention(`@${member.alias}`)}
                      disabled={selectedRoom.kind === 'group' && !member.enabled}
                    >
                      <AgentBadge alias={member.alias} active={selectedTargetSet.has(member.connectionId)} status={getMemberRuntimeStatus(member)} imageUri={getConnectionAvatarUri(member.connectionId)} />
                    </TouchableOpacity>
                  ))}
                </View>
                {quickCommandsOpen ? renderQuickCommands() : null}
                {roomToolsOpen ? renderRoomTools() : null}
                {renderMessageSearchPanel()}
                {!isWideLayout ? renderRoomCollaborationDashboard() : null}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        <FlatList
          ref={messageScrollRef}
          data={selectedRoom ? visibleSelectedMessages : []}
          keyExtractor={(message) => message.id}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={handleMessagesContentSizeChange}
          onScroll={handleMessagesScroll}
          scrollEventThrottle={80}
          initialNumToRender={18}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          ListEmptyComponent={(
            !selectedRoom ? (
              <EmptyState
                icon="albums-outline"
                title="还没有可聊天的房间"
                body="先在房间页创建单聊或群聊，再回到这里开始对话。"
                actionLabel="去创建"
                onAction={() => setTab('rooms')}
              />
            ) : selectedRoom && normalizedSearchQuery ? (
              <EmptyState
                icon="search-outline"
                title="当前房间没有匹配消息"
                body="搜索会跨全部房间进行；可以点击上方结果跳转到其他房间。"
              />
            ) : (
              <EmptyState
                icon="sparkles-outline"
                title="新的对话已经就绪"
                body={selectedRoom.kind === 'group' ? '点成员标签选择回复对象；也可以输入 @成员名、@all/@all-seq、/council 等协作仪式，或在 RP 模式下输入 /rp /scene /ooc。' : '输入消息后发送，Laphiny 会保留最近上下文。'}
              />
            )
          )}
          renderItem={({ item }) => renderMessageBubble(item)}
        />

        <View style={[styles.composer, isDarkMode && styles.composerDark, androidKeyboardLift > 0 && { marginBottom: androidKeyboardLift }]}>
          {selectedRoom?.kind === 'group' ? (
            <View style={styles.mentionBar}>
              <Text style={styles.mentionHint}>本次回复</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mentionList}>
                <TouchableOpacity
                  style={[
                    styles.mentionChip,
                    selectedTargetIds.length === selectedRoom.members.filter((member) => member.enabled).length && styles.mentionChipSelected,
                  ]}
                  onPress={selectAllTargets}
                >
                  <Text style={styles.mentionChipText}>@all</Text>
                </TouchableOpacity>
                {selectedRoom.members.map((member) => (
                  <TouchableOpacity
                    key={member.connectionId}
                    style={[styles.mentionChip, selectedTargetSet.has(member.connectionId) && styles.mentionChipSelected, !member.enabled && styles.mentionChipDisabled]}
                    onPress={() => toggleTargetSelection(member.connectionId)}
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

          {renderComposerModeBar()}
          {renderSlashCommandPanel()}

          {pendingAttachments.length ? (
            <View style={styles.pendingAttachments}>
              {pendingAttachments.map((attachment) => (
                <View key={attachment.id} style={styles.pendingAttachmentRow}>
                  <View style={styles.pendingAttachmentPreviewCell}>
                    <AttachmentPreview
                      attachment={attachment}
                      actionIcon="eye-outline"
                      onPress={() => setPreviewAttachment(attachment)}
                    />
                  </View>
                  <IconButton
                    icon="close-outline"
                    label={`移除 ${attachment.name}`}
                    onPress={() => setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                  />
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.composerInputRow}>
            <IconButton icon="image-outline" label="添加图片" onPress={attachImages} disabled={!selectedRoom || sending} />
            <IconButton icon="document-attach-outline" label="添加文件" onPress={attachDocuments} disabled={!selectedRoom || sending} />
            <TextInput
              style={[styles.composerInput, isDarkMode && styles.inputDark]}
              placeholder={selectedRoom?.kind === 'group' ? (selectedRoom.roleplay?.enabled ? '输入角色行动，或 /rp /scene /ooc' : '@成员名、@all 或 /council 后输入消息') : '输入消息'}
              placeholderTextColor="#9ca3af"
              multiline
              value={draft}
              onChangeText={setDraft}
              onFocus={() => {
                pendingMessageScrollToEndRef.current = true;
                setTimeout(() => messageScrollRef.current?.scrollToEnd({ animated: true }), 180);
              }}
              textAlignVertical="top"
            />
            <IconButton icon={sending ? 'hourglass-outline' : 'send'} label="发送" onPress={sendMessage} disabled={sending || !selectedRoom} variant="primary" />
          </View>
        </View>
        </KeyboardAvoidingView>
        {isWideLayout && collaborationDrawerOpen ? renderCollaborationDrawer() : null}
      </View>
    );
  }

  function renderFocusedChatHeader() {
    if (!selectedRoom) return null;
    return (
      <View style={[styles.focusedChatHeader, isDarkMode && styles.focusedChatHeaderDark]}>
        <TouchableOpacity style={styles.focusedBackButton} onPress={leaveFocusedChat} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={isDarkMode ? '#e5e7eb' : '#111827'} />
          <Text style={[styles.focusedBackText, isDarkMode && styles.titleDark]}>返回</Text>
        </TouchableOpacity>
        <View style={styles.focusedChatTitleBlock}>
          <Text style={[styles.focusedChatTitle, isDarkMode && styles.titleDark]} numberOfLines={1}>{selectedRoom.name}</Text>
          <Text style={[styles.focusedChatMeta, isDarkMode && styles.subtitleDark]} numberOfLines={1}>
            {selectedRoom.kind === 'group' ? '群聊' : '单聊'} · {selectedRoom.members.filter((member) => member.enabled).length}/{selectedRoom.members.length}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.focusedDetailsButton, mobileRoomDetailsOpen && styles.focusedDetailsButtonActive]}
          onPress={() => setMobileRoomDetailsOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={mobileRoomDetailsOpen ? '关闭房间详情' : '打开房间详情'}
        >
          <Ionicons name={mobileRoomDetailsOpen ? 'close-outline' : 'albums-outline'} size={18} color={mobileRoomDetailsOpen ? '#ffffff' : '#2563eb'} />
        </TouchableOpacity>
      </View>
    );
  }

  function renderMobileRoomDetailsDrawer() {
    if (!selectedRoom || !mobileRoomDetailsOpen) return null;
    return (
      <View style={styles.mobileDetailsLayer} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.mobileDetailsBackdrop}
          activeOpacity={1}
          onPress={() => setMobileRoomDetailsOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="关闭房间详情"
        />
        <View style={[styles.mobileDetailsCard, isDarkMode && styles.mobileDetailsCardDark]}>
          <View style={styles.mobileDetailsHeader}>
            <View style={styles.rowMain}>
              <Text style={[styles.cardTitle, isDarkMode && styles.titleDark]} numberOfLines={1}>房间详情</Text>
              <Text style={[styles.help, isDarkMode && styles.subtitleDark]} numberOfLines={1}>左滑打开 · 右滑或点击空白关闭</Text>
            </View>
            <TouchableOpacity style={styles.sidebarIconButton} onPress={() => setMobileRoomDetailsOpen(false)}>
              <Ionicons name="close" size={18} color="#4b5563" />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.mobileDetailsScroll}
            contentContainerStyle={styles.mobileDetailsContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {renderRoomStatusBar()}
            {renderActiveGoalPanel()}
            {renderRoleplaySceneCard()}

            {selectedRoom.lastSummary ? (
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>最近共识 · {selectedRoom.lastSummary.authorName}</Text>
                <MarkdownText content={selectedRoom.lastSummary.content} fontFamily={selectedFontFamily} />
              </View>
            ) : null}

            {selectedRoom.kind === 'group' ? (
              <View style={styles.roomEditPanel}>
                <Text style={styles.panelLabel}>房间记忆胶囊</Text>
                {selectedRoom.pendingMemoryCapsule ? (
                  <View style={styles.summaryBox}>
                    <Text style={styles.summaryTitle}>待确认记忆草案 · v{selectedRoom.pendingMemoryCapsule.version}</Text>
                    <Text style={styles.help}>{summarizeRoomMemory(selectedRoom.pendingMemoryCapsule)}</Text>
                    <View style={styles.toolActions}>
                      <MiniButton icon="checkmark-circle-outline" label="确认沉淀" onPress={confirmPendingRoomMemoryCapsule} />
                      <MiniButton icon="close-circle-outline" label="丢弃草案" onPress={discardPendingRoomMemoryCapsule} />
                    </View>
                  </View>
                ) : null}
                {selectedRoom.memoryCapsule ? (
                  <View style={styles.summaryBox}>
                    <Text style={styles.summaryTitle}>v{selectedRoom.memoryCapsule.version} · {selectedRoom.memoryCapsule.authorName ?? 'Laphiny'} · {formatDateTime(selectedRoom.memoryCapsule.updatedAt)}</Text>
                    <Text style={styles.help}>{summarizeRoomMemory(selectedRoom.memoryCapsule)}</Text>
                  </View>
                ) : (
                  <Text style={styles.help}>还没有房间记忆。生成并确认后，会沉淀到成长层并进入后续群聊上下文。</Text>
                )}
                <View style={styles.toolActions}>
                  <MiniButton icon="sparkles-outline" label={memoryGenerating ? '生成中...' : selectedRoom.memoryCapsule ? '更新记忆' : '生成记忆'} onPress={generateRoomMemoryCapsule} />
                </View>
              </View>
            ) : null}

            {renderRoomGrowthPanel()}
            {renderTaskBoardPanel()}
            {!isWideLayout ? renderRoomCollaborationDashboard() : null}
          </ScrollView>
        </View>
      </View>
    );
  }

  function renderMobileRoomPicker() {
    return (
      <MobileRoomPicker
        rooms={rooms}
        messagesByRoom={messagesByRoom}
        unreadByRoom={unreadByRoom}
        isDarkMode={isDarkMode}
        styles={styles}
        TextComponent={Text}
        onCreateRoom={() => setTab('rooms')}
        onOpenRoom={openFocusedChatRoom}
        onManageRoom={openRoomManagement}
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

  function renderRoomRail() {
    return (
      <RoomRail
        rooms={rooms}
        selectedRoomId={selectedRoomId}
        unreadByRoom={unreadByRoom}
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
    if (selectedMessages.some((message) => message.authorId === member.connectionId && message.status === 'running')) return 'running';
    if (selectedRoomDelegationTasks.some((task) => task.toConnectionId === member.connectionId && (task.status === 'pending' || task.status === 'running'))) return 'delegated';
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
    return <RoomStatusBar room={selectedRoom} delegationTasks={selectedRoomDelegationTasks} styles={styles} />;
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
        onToggleQuickCommands={() => setQuickCommandsOpen((open) => !open)}
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
        onToggleOpen={() => setCollaborationPanelOpen((open) => !open)}
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
        onResetSession={resetRoomSession}
        onClearMessages={clearSelectedRoomMessages}
        onDeleteRoom={deleteSelectedRoom}
      />
    );
  }

  function renderSquare() {
    const events = [...squareEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const dailyDigest = buildSoulDailyDigest({ rooms, connections, messagesByRoom, collaborationEvents, delegationTasks });
    return (
      <ScrollView style={styles.content} contentContainerStyle={styles.panel}>
        <View style={styles.squareHeader}>
          <View>
            <Text style={styles.sectionTitle}>灵庭</Text>
            <Text style={styles.help}>沉淀 Hermes 回复、委托任务、房间记忆与 Soul 小队动态。</Text>
          </View>
          <Text style={styles.squareCount}>{events.length} 条事件</Text>
        </View>

        <SoulDailyPanel
          dailyDigest={dailyDigest}
          delegationTasks={delegationTasks}
          rooms={rooms}
          styles={styles}
          TextComponent={Text}
          getDelegationTaskStatusStyle={getDelegationTaskStatusStyle}
          onOpenRoom={openFocusedChatRoom}
          onOpenRoomManagement={openRoomManagement}
        />

        <CollaborationArchivePanel
          collaborationEvents={collaborationEvents}
          delegationTasks={delegationTasks}
          teamTemplates={teamTemplates}
          latestProfileVersions={latestProfileVersions}
          styles={styles}
          TextComponent={Text}
          getDelegationTaskStatusStyle={getDelegationTaskStatusStyle}
          onDeleteTeamTemplate={deleteTeamTemplate}
          onRestoreProfileVersion={restoreProfileVersion}
        />

        {renderSoulRelationsPanel()}

        {events.length === 0 ? (
          <EmptyState
            icon="planet-outline"
            title="灵庭还没有事件"
            body="当 Hermes 回复、系统提示、委托任务或同步日志出现时，灵庭会沉淀为 Soul 小队的活动时间线。"
          />
        ) : null}

        {events.map((event) => (
          <View key={event.id} style={styles.squareEvent}>
            <View style={styles.squareEventHeader}>
              <View style={styles.squareEventSource}>
                <Ionicons name={getSquareEventIcon(event.kind)} size={16} color="#2563eb" />
                <Text style={styles.squareEventTitle}>{event.title}</Text>
              </View>
              <Text style={styles.status}>{formatDateTime(event.createdAt)}</Text>
            </View>
            <Text style={styles.squareEventMeta}>
              {event.source}{event.roomName ? ` · ${event.roomName}` : ''}{event.target ? ` → ${event.target}` : ''}
            </Text>
            <MarkdownText content={event.body} fontFamily={selectedFontFamily} />
          </View>
        ))}
      </ScrollView>
    );
  }

  function renderOnboardingPanel() {
    if (onboardingDismissed || onboardingComplete) return null;
    return (
      <View style={styles.onboardingPanel}>
        <View style={styles.syncHeader}>
          <View>
            <Text style={styles.cardTitle}>第一次启动：把 Soul 小队带进房间</Text>
            <Text style={styles.help}>跟着这几步完成连接、协作卡片、房间和记忆胶囊。完成后这里会自动隐藏。</Text>
          </View>
          <SecondaryButton icon="close-outline" label="稍后" onPress={() => setOnboardingDismissed(true)} />
        </View>
        {onboardingSteps.map((step, index) => (
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

  function renderSoulRelationsPanel() {
    return <SoulRelationsPanel relations={soulRelations} styles={styles} TextComponent={Text} />;
  }

}
