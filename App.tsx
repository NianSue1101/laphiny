import 'react-native-url-polyfill/auto';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

import {
  APP_VERSION,
  DEFAULT_CONTEXT_LIMIT,
  DEFAULT_MODEL,
  MAX_DELEGATION_DEPTH,
  QUICK_COMMANDS,
} from './src/config/app_config';
import {
  AttachmentPreview,
  AgentAvatar,
  AgentBadge,
  ConnectionHealthDetails,
  ConnectionProfileCard,
  EmptyState,
  HealthBadge,
  HealthMetric,
  IconButton,
  MiniButton,
  PrimaryButton,
  RoomHint,
  SecondaryButton,
  StatusToken,
  TabButton,
} from './src/components/Primitives';
import { MarkdownText } from './src/components/MarkdownText';
import { Ionicons } from './src/components/SafeIcon';
import {
  buildChatHistory,
  buildChatHistoryForDelegation,
  buildChatHistoryForSequentialTurn,
  buildSummaryMessages,
} from './src/app/chat_history';
import {
  buildMarkdownExport,
  buildSearchSnippet,
  findPreviousUserMessageIndex,
  formatBytes,
  formatDateTime,
  formatTime,
  getCollaborationEventIcon,
  getDelegationTaskStatusLabel,
  getDiagnosticCategoryLabel,
  getDiagnosticLevelLabel,
  getDiagnosticLogIcon,
  getErrorMessage,
  getLayoutModeLabel,
  getServiceWorkerStatusLabel,
  getSquareEventIcon,
  getStatusLabel,
  getSyncConflictEntityLabel,
  getSyncConflictStatusLabel,
  getTeamTemplateModeLabel,
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

import { pickDocuments, pickImages } from './src/lib/attachments';
import { buildAgentProfileInquiryMessages, normalizeImportedAgentProfile, parseAgentProfileResponse, summarizeAgentProfile } from './src/lib/agent_profile';
import { extractAgentFileAttachments } from './src/lib/agent_files';
import { COLLABORATION_RITUALS, buildRitualConsensusMessages, buildRitualPrompt, getRitualHelpText, getRitualTargets, parseCollaborationRitualCommand, type CollaborationRitualId, type ParsedCollaborationRitual } from './src/lib/collaboration_rituals';
import { appendDiagnosticLog as appendDiagnosticLogEntry, buildDiagnosticBundle, makeDiagnosticLog, sanitizeDiagnosticLogs } from './src/lib/diagnostics';
import { HermesClient, normalizeHermesReplyText } from './src/lib/hermes_client';
import { buildGoalModePrompt, buildGoalReviewPrompt, parseGoalCommand, parseGoalPlanItems, parseGoalStatusSignal } from './src/lib/goal_mode';
import { resolveAssistantDelegations, resolveMentionTargets } from './src/lib/mentions';
import { buildRoomMemoryMessages, formatRoomMemoryForPrompt, parseRoomMemoryResponse, summarizeRoomMemory } from './src/lib/room_memory';
import { buildRoleplayTurnPrompt, getRoleplayTargets, isRoleplayUserTurn, makeDefaultRoleplayConfig, parseRoleplayCommand, summarizeRoleplayConfig } from './src/lib/roleplay';
import { buildRoomReplyNotification, type RoomReplyNotification } from './src/lib/room_reply_notifications';
import { buildSoulDailyDigest } from './src/lib/square_insights';
import { ROOM_MODES, STARTER_ROOM_TEMPLATES, buildOnboardingSteps, buildRoleplayArchiveMessages, buildSoulRelations, buildTaskBoard, getRoomModeDefinition, getRoomModeLabel, makeDefaultRoleplayArchive, parseRoleplayArchiveResponse, summarizeRoleplayArchive, type StarterRoomTemplate } from './src/lib/stage4_plus';
import { getSlashCommandSuggestions, getUxCommandKindLabel, UX_SLASH_COMMANDS, type UXCommandDefinition } from './src/lib/ux';
import { LaphinySyncClient } from './src/lib/sync_client';
import { buildSyncConflictReport, type SyncConflictReport } from './src/lib/sync_conflicts';
import {
  loadConnections,
  loadCollaborationEvents,
  loadDelegationTasks,
  loadDiagnosticLogs,
  loadProfileVersions,
  loadMessages,
  loadRooms,
  loadTeamTemplates,
  loadSquareEvents,
  loadSyncConfig,
  saveConnections,
  saveCollaborationEvents,
  saveDelegationTasks,
  saveDiagnosticLogs,
  saveProfileVersions,
  saveMessages,
  saveRooms,
  saveTeamTemplates,
  saveSquareEvents,
  saveSyncConfig,
} from './src/storage/repository';
import { describeStorageBackend } from './src/storage/kv';
import { AgentProfile, AgentProfileVersion, Attachment, ChatMessage, CollaborationEvent, DelegationTask, DiagnosticLogEntry, GoalSession, GoalStatusSignal, HermesConnection, RoleplayConfig, RoleplayArchive, Room, RoomMemoryCapsule, RoomMember, SquareEvent, SyncConfig, SyncSnapshot, TeamTemplate, RoomModeId } from './src/types';

const MESSAGE_AUTO_SCROLL_THRESHOLD = 96;
const MAX_GOAL_REVIEW_ROUNDS = 3;
const MAX_GOAL_DELEGATIONS_PER_ROUND = 3;

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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [rpArchiveGenerating, setRpArchiveGenerating] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [roomReplyNotification, setRoomReplyNotification] = useState<RoomReplyNotification | null>(null);
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
  const selectedRoomIdRef = useRef<string | null>(selectedRoomId);
  const tabRef = useRef<Tab>(tab);
  const roomsRef = useRef<Room[]>(rooms);
  const pollingSquareEventsRef = useRef(false);
  const { width, height } = useWindowDimensions();
  const maxWindowHeightRef = useRef(height);

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
    let mounted = true;

    Promise.all([
      loadConnections(),
      loadRooms(),
      loadMessages(),
      loadSyncConfig(),
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
  const onboardingSteps = useMemo(() => buildOnboardingSteps({ connections, rooms }), [connections, rooms]);
  const onboardingComplete = onboardingSteps.every((step) => step.done);
  const layoutMode = width >= 1200 ? 'desktop' : width >= 900 ? 'wide' : width >= 700 ? 'tablet' : 'compact';
  const isWideLayout = width >= 900;
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
  const groupMemberDraftSet = useMemo(() => new Set(groupMemberDraftIds), [groupMemberDraftIds]);
  const slashCommandSuggestions = useMemo(() => getSlashCommandSuggestions(draft), [draft]);
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
      setSelectedRoomId(existing.id);
      setTab('chat');
      return;
    }

    const room = makeRoom(connection.name, 'direct', [{ connectionId: connection.id, alias: connection.name, enabled: true }]);
    setRooms((current) => [...current, room]);
    setSelectedRoomId(room.id);
    setTab('chat');
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
    setSelectedRoomId(room.id);
    setGroupMemberDraftIds(enabledConnections.map((connection) => connection.id));
    setTab('chat');
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
    setSelectedRoomId(nextRoom.id);
    setTab('chat');
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
      if (finishedMessage.status === 'sent') {
        showRoomReplyNotification(roomId, finishedMessage);
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
    setSelectedRoomId(notification.roomId);
    setTab('chat');
    setRoomReplyNotification(null);
    if (replyNotificationTimerRef.current) {
      clearTimeout(replyNotificationTimerRef.current);
      replyNotificationTimerRef.current = null;
    }
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

    let streamedText = '';
    updateMessageInRoom(room.id, placeholderId, { content: '', status: 'running', error: undefined });

    try {
      const client = new HermesClient(connection);
      for await (const chunk of client.chatCompletionStream({
        model: connection.model,
        messages: buildChatHistory(previousMessages, room, member, text, attachments, connections, room.contextLimit ?? DEFAULT_CONTEXT_LIMIT),
        stream: true,
      }, {
        sessionId: room.sessionIds[connection.id],
        sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
        timeoutMs: 120_000,
        signal: controller.signal,
      })) {
        streamedText += chunk;
        queueStreamMessageUpdate(room.id, placeholderId, streamedText);
      }

      flushStreamMessage(room.id, placeholderId);
      const parsedReply = extractAgentFileAttachments(streamedText.trim());
      updateMessageInRoom(room.id, placeholderId, {
        content: parsedReply.content || (parsedReply.attachments.length ? '已生成附件' : '[Hermes 没有返回内容]'),
        attachments: parsedReply.attachments.length ? parsedReply.attachments : undefined,
        status: 'sent',
      });
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

    const turnMessages: ChatMessage[] = [...previousMessages, userMessage];
    const dispatchRoom = activeGoalForTurn ? { ...effectiveRoom, activeGoal: activeGoalForTurn } : effectiveRoom;
    const scheduledKeys = new Set<string>();
    const memberQueues = new Map<string, Promise<void>>();
    const scheduledPromises: Promise<void>[] = [];
    let goalDelegationCount = 0;
    let reviewedGoalDelegationCount = 0;
    let goalReviewRound = 0;

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
        for await (const chunk of client.chatCompletionStream({
          model: connection.model,
          messages: historyMessages,
          stream: true,
        }, {
          sessionId: room.sessionIds[connection.id],
          sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
          timeoutMs: 120_000,
          signal: controller.signal,
        })) {
          accumulated += chunk;
          queueStreamMessageUpdate(room.id, placeholder.id, accumulated);
        }

        flushStreamMessage(room.id, placeholder.id);
        const parsedReply = extractAgentFileAttachments(accumulated.trim());
        const answer = parsedReply.content || (parsedReply.attachments.length ? '已生成附件' : '[Hermes 没有返回内容]');
        const completedMessage: ChatMessage = {
          ...placeholder,
          content: answer,
          attachments: parsedReply.attachments.length ? parsedReply.attachments : undefined,
          status: 'sent',
        };
        turnMessages.push(completedMessage);
        updateMessageInRoom(room.id, placeholder.id, {
          content: answer,
          attachments: completedMessage.attachments,
          status: 'sent',
        });
        applyGoalAssistantResult(dispatchRoom, reply, completedMessage, answer);
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
      updateSelectedRoom({ memoryCapsule: capsule });
      appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, `房间记忆胶囊已更新（v${capsule.version}）：\n${summarizeRoomMemory(capsule)}`)]);
      appendCollaborationEvent({
        kind: 'memory_updated',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: memoryMember.alias,
        title: '房间记忆胶囊已更新',
        body: summarizeRoomMemory(capsule),
      });
      appendDiagnosticLog({
        level: 'success',
        category: 'chat',
        title: '房间记忆胶囊已更新',
        message: summarizeRoomMemory(capsule),
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: memoryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      showNotice('房间记忆已更新', summarizeRoomMemory(capsule));
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
          ? `已保存到 ${saved.locationLabel}。`
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
      anchor.click();
      if (encoding !== FileSystem.EncodingType.Base64) URL.revokeObjectURL(href);
      return { uri: filename, userVisible: true, locationLabel: '浏览器下载目录' };
    }

    if (Platform.OS === 'android') {
      const storage = FileSystem.StorageAccessFramework;
      try {
        const initialUri = storage.getUriForDirectoryInRoot('Download/Laphiny');
        const permission = await storage.requestDirectoryPermissionsAsync(initialUri);
        if (permission.granted) {
          const laphinyDirUri = await ensureAndroidLaphinyDirectory(permission.directoryUri);
          const fileUri = await storage.createFileAsync(laphinyDirUri, filenameWithoutExtension(filename), mimeType);
          await storage.writeAsStringAsync(fileUri, data, { encoding });
          return { uri: fileUri, userVisible: true, locationLabel: 'Download/Laphiny' };
        }
      } catch (error) {
        console.warn('Android attachment download via Storage Access Framework failed; falling back to app-private storage.', error);
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

  async function ensureAndroidLaphinyDirectory(directoryUri: string): Promise<string> {
    const storage = FileSystem.StorageAccessFramework;
    if (isLaphinyDirectoryUri(directoryUri)) return directoryUri;

    try {
      return await storage.makeDirectoryAsync(directoryUri, 'Laphiny');
    } catch {
      const children = await storage.readDirectoryAsync(directoryUri);
      const existing = children.find(isLaphinyDirectoryUri);
      if (existing) return existing;
      throw new Error('无法在下载目录创建 Laphiny 文件夹，请手动选择或创建 Download/Laphiny 后重试');
    }
  }

  function isLaphinyDirectoryUri(uri: string): boolean {
    try {
      return decodeURIComponent(uri).replace(/\/+$/, '').endsWith('/Laphiny');
    } catch {
      return uri.replace(/\/+$/, '').endsWith('/Laphiny');
    }
  }

  function sanitizeDownloadFilename(filename: string): string {
    return filename
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  function filenameWithoutExtension(filename: string): string {
    return filename.replace(/\.[^.]+$/, '') || 'laphiny-file';
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
      memoryCapsule: buildGoalMemoryCapsule(room, completedGoal, now),
    });
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId: room.id,
      roomName: room.name,
      source: 'Laphiny',
      title: '目标已沉淀到房间记忆',
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

  async function copyDiagnosticBundle() {
    const text = buildDiagnosticBundle({
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
    await Clipboard.setStringAsync(text);
    showNotice('诊断信息已复制', '已复制脱敏后的连接、房间、失败消息和最近诊断日志。');
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

  async function saveTextFile(filename: string, text: string, mimeType: string): Promise<{ uri: string; userVisible: boolean } | null> {
    if (Platform.OS === 'web') {
      try {
        const blob = new Blob([text], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
        return { uri: filename, userVisible: true };
      } catch {
        return null;
      }
    }

    if (Platform.OS === 'android') {
      const storage = FileSystem.StorageAccessFramework;
      try {
        const initialUri = storage.getUriForDirectoryInRoot('Download');
        const permission = await storage.requestDirectoryPermissionsAsync(initialUri);
        if (permission.granted) {
          const baseName = filename.replace(/\.json$/i, '');
          const fileUri = await storage.createFileAsync(permission.directoryUri, baseName, mimeType);
          await storage.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
          return { uri: fileUri, userVisible: true };
        }
      } catch (error) {
        console.warn('Android backup export via Storage Access Framework failed; falling back to app-private storage.', error);
      }
    }

    const directory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!directory) return null;
    const fileUri = `${directory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
    return { uri: fileUri, userVisible: false };
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
    <SafeAreaView style={styles.shell}>
      <ExpoStatusBar style="dark" />
      {renderRoomReplyNotification()}
      <View style={styles.header}>
        <View style={styles.brandBlock}>
          <Text style={styles.title}>Laphiny</Text>
          <Text style={styles.subtitle}>多 Hermes 协作聊天</Text>
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        <TabButton icon="chatbubble-ellipses-outline" label="聊天" active={tab === 'chat'} onPress={() => setTab('chat')} />
        <TabButton icon="planet-outline" label="灵庭" active={tab === 'square'} onPress={() => setTab('square')} />
        <TabButton icon="albums-outline" label="房间" active={tab === 'rooms'} onPress={() => setTab('rooms')} />
        <TabButton icon="git-network-outline" label="连接" active={tab === 'connections'} onPress={() => setTab('connections')} />
        <TabButton icon="settings-outline" label="设置" active={tab === 'settings'} onPress={() => setTab('settings')} />
      </ScrollView>

      {renderRuntimeBanner()}

      {tab === 'chat' ? renderChat() : null}
      {tab === 'square' ? renderSquare() : null}
      {tab === 'rooms' ? renderRooms() : null}
      {tab === 'connections' ? renderConnections() : null}
      {tab === 'settings' ? renderSettings() : null}
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
    if (Platform.OS !== 'web') return null;
    const shouldShow = !networkOnline || pwaInstallPrompt || serviceWorkerStatus === 'failed' || serviceWorkerStatus === 'registering';
    if (!shouldShow) return null;

    return (
      <View style={[styles.runtimeBanner, !networkOnline && styles.runtimeBannerOffline]}>
        <View style={styles.runtimeBannerTextBlock}>
          <Text style={styles.runtimeBannerTitle}>
            {!networkOnline ? '当前离线' : serviceWorkerStatus === 'registering' ? '正在准备离线缓存' : serviceWorkerStatus === 'failed' ? '离线缓存不可用' : '可以安装为应用'}
          </Text>
          <Text style={styles.runtimeBannerBody}>
            {!networkOnline
              ? '你仍可查看本地记录；Hermes 请求和同步会在网络恢复后再使用。'
              : serviceWorkerStatus === 'registering'
                ? '首次打开会注册 Service Worker，之后已访问资源可在弱网或离线时继续打开。'
                : serviceWorkerStatus === 'failed'
                  ? '浏览器没有成功注册 Service Worker；Web 仍可使用，但离线能力会受限。'
                  : '浏览器已提供安装入口，安装后可像独立应用一样打开 Laphiny。'}
          </Text>
        </View>
        {pwaInstallPrompt ? <SecondaryButton icon="download-outline" label="安装" onPress={installPwa} /> : null}
      </View>
    );
  }

  function renderMessageBubble(message: ChatMessage) {
    const displayContent = message.authorId === 'user'
      ? message.content
      : normalizeHermesReplyText(message.content);

    return (
      <View
        style={[
          styles.messageBubble,
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
        <MarkdownText content={displayContent} />
        {message.attachments?.length ? (
          <View style={styles.attachments}>
            {message.attachments.map((attachment) => (
              <AttachmentPreview
                key={attachment.id}
                attachment={attachment}
                actionIcon="download-outline"
                onPress={() => downloadAttachment(attachment)}
              />
            ))}
          </View>
        ) : null}
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

  function renderChat() {
    const roomDetailsOpen = !roomDetailsCollapsed;
    return (
      <View style={[styles.content, isWideLayout && styles.chatDesktop]}>
        {isWideLayout ? renderChatSidebar() : renderRoomRail()}
        <KeyboardAvoidingView
          style={styles.chatMain}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          enabled={keyboardAvoidanceEnabled}
        >

        {selectedRoom ? (
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

        <View style={[styles.composer, androidKeyboardLift > 0 && { marginBottom: androidKeyboardLift }]}>
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
                <AttachmentPreview
                  key={attachment.id}
                  attachment={attachment}
                  onPress={() => setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.composerInputRow}>
            <IconButton icon="image-outline" label="添加图片" onPress={attachImages} disabled={!selectedRoom || sending} />
            <IconButton icon="document-attach-outline" label="添加文件" onPress={attachDocuments} disabled={!selectedRoom || sending} />
            <TextInput
              style={styles.composerInput}
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

  function renderRoomRail() {
    return (
      <View style={styles.roomRail}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roomRailContent}>
          {rooms.map((room) => (
            <TouchableOpacity
              key={room.id}
              style={[styles.roomPill, room.id === selectedRoomId && styles.roomPillActive]}
              onPress={() => setSelectedRoomId(room.id)}
            >
              <Ionicons
                name={room.kind === 'group' ? 'people-outline' : 'person-outline'}
                size={14}
                color={room.id === selectedRoomId ? '#ffffff' : '#4b5563'}
              />
              <Text style={[styles.roomPillText, room.id === selectedRoomId && styles.roomPillTextActive]}>{room.name}</Text>
              {unreadByRoom[room.id] ? <Text style={styles.roomUnreadBadge}>{unreadByRoom[room.id]}</Text> : null}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.roomCreatePill} onPress={() => setTab('rooms')}>
            <Ionicons name="add" size={16} color="#2563eb" />
            <Text style={styles.roomCreateText}>新房间</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  function renderChatSidebar() {
    return (
      <View style={styles.chatSidebar}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarTitle}>房间</Text>
          <TouchableOpacity style={styles.sidebarIconButton} onPress={() => setTab('rooms')}>
            <Ionicons name="add" size={18} color="#2563eb" />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.sidebarRooms} contentContainerStyle={styles.sidebarRoomsContent}>
          {rooms.length === 0 ? <Text style={styles.help}>还没有房间。</Text> : null}
          {rooms.map((room) => {
            const roomMessages = messagesByRoom[room.id] ?? [];
            const lastMessage = roomMessages[roomMessages.length - 1];
            const active = room.id === selectedRoomId;
            const unread = unreadByRoom[room.id] ?? 0;
            return (
              <TouchableOpacity
                key={room.id}
                style={[styles.sidebarRoom, active && styles.sidebarRoomActive]}
                onPress={() => setSelectedRoomId(room.id)}
              >
                <View style={styles.sidebarRoomTop}>
                  <Text style={[styles.sidebarRoomTitle, active && styles.sidebarRoomTitleActive]}>{room.name}</Text>
                  {unread > 0 ? <Text style={styles.sidebarUnreadBadge}>{unread}</Text> : <Text style={styles.sidebarRoomMeta}>{room.members.length}</Text>}
                </View>
                <Text style={styles.sidebarRoomPreview} numberOfLines={2}>
                  {lastMessage ? `${lastMessage.authorName}: ${lastMessage.content || getStatusLabel(lastMessage.status)}` : '新的房间'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
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

  function renderRoomStatusBar() {
    if (!selectedRoom) return null;
    const enabledCount = selectedRoom.members.filter((member) => member.enabled).length;
    const openTaskCount = selectedRoomDelegationTasks.filter((task) => task.status === 'pending' || task.status === 'running').length;
    const modeLabel = selectedRoom.roleplay?.enabled
      ? '桌游 RP'
      : selectedRoom.kind === 'direct'
        ? '单聊'
        : getRoomModeLabel(selectedRoom.mode);
    const summaryAlias = selectedRoom.members.find((member) => member.connectionId === selectedRoom.summaryConnectionId)?.alias;
    const gmAlias = selectedRoom.members.find((member) => member.connectionId === selectedRoom.roleplay?.gmConnectionId)?.alias;

    return (
      <View style={styles.roomStatusBar}>
        <StatusToken icon={selectedRoom.roleplay?.enabled ? 'game-controller-outline' : selectedRoom.kind === 'group' ? 'git-network-outline' : 'person-outline'} label={`模式 ${modeLabel}`} tone={selectedRoom.roleplay?.enabled ? 'rp' : 'default'} />
        {selectedRoom.kind === 'group' ? <StatusToken icon="people-outline" label={`${enabledCount}/${selectedRoom.members.length} 可用`} tone="default" /> : null}
        {selectedRoom.roleplay?.enabled ? <StatusToken icon="sparkles-outline" label={`GM ${gmAlias ?? '未选'}`} tone="rp" /> : null}
        {selectedRoom.kind === 'group' && !selectedRoom.roleplay?.enabled ? <StatusToken icon="reader-outline" label={`总结 ${summaryAlias ?? '自动'}`} tone="default" /> : null}
        {selectedRoom.memoryCapsule ? <StatusToken icon="file-tray-full-outline" label={`记忆 v${selectedRoom.memoryCapsule.version}`} tone="memory" /> : null}
        {selectedRoom.roleplay?.archive ? <StatusToken icon="map-outline" label={`档案 v${selectedRoom.roleplay.archive.version}`} tone="rp" /> : null}
        {openTaskCount > 0 ? <StatusToken icon="git-branch-outline" label={`${openTaskCount} 个委托`} tone="warning" /> : null}
      </View>
    );
  }

  function renderActiveGoalPanel() {
    const activeGoal = selectedRoom?.activeGoal;
    if (!selectedRoom || !activeGoal || activeGoal.status === 'cancelled') return null;
    const waiting = activeGoal.status === 'awaiting_user';
    const statusLabel = getGoalStatusLabel(activeGoal.status, activeGoal.statusSignal);
    const planItems = activeGoal.planItems.slice(0, 8);

    return (
      <View style={styles.goalPanel}>
        <View style={styles.goalPanelHeader}>
          <View style={styles.rowMain}>
            <View style={styles.squareEventSource}>
              <Ionicons name="flag-outline" size={16} color="#2563eb" />
              <Text style={styles.goalTitle} numberOfLines={1}>目标模式 · {statusLabel}</Text>
            </View>
            <Text style={styles.help} numberOfLines={2}>{activeGoal.goal}</Text>
            <Text style={styles.goalMeta}>主 AI：{activeGoal.leadAlias} · 第 {activeGoal.round} 轮 · {formatDateTime(activeGoal.updatedAt)}</Text>
          </View>
          {waiting ? (
            <View style={styles.goalActionRow}>
              <MiniButton icon="play-circle-outline" label="继续" onPress={() => continueActiveGoalFromPanel(activeGoal)} />
              <MiniButton icon="checkmark-circle-outline" label="结束" onPress={() => finishActiveGoalFromPanel(activeGoal)} />
              <MiniButton icon="create-outline" label="调整" onPress={() => setDraft(`/goal @${activeGoal.leadAlias} ${activeGoal.goal} `)} />
            </View>
          ) : null}
        </View>

        {planItems.length ? (
          <View style={styles.goalPlanList}>
            {planItems.map((item) => (
              <View key={item.id} style={styles.goalPlanItem}>
                <View style={styles.conflictHeader}>
                  <Text style={styles.taskTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.badge, getGoalPlanItemStatusStyle(item.status)]}>{getGoalPlanItemStatusLabel(item.status)}</Text>
                </View>
                <Text style={styles.help} numberOfLines={2}>
                  {item.ownerAlias ? `负责人：${item.ownerAlias}` : '负责人：未指定'}
                  {item.deliverable ? ` · 产物：${item.deliverable}` : ''}
                </Text>
                {item.acceptance ? <Text style={styles.goalAcceptance} numberOfLines={2}>验收：{item.acceptance}</Text> : null}
              </View>
            ))}
          </View>
        ) : <Text style={styles.help}>等待主 AI 输出结构化计划卡。</Text>}

        {activeGoal.lastReview ? (
          <Text style={styles.goalReview} numberOfLines={4}>{activeGoal.lastReview}</Text>
        ) : null}
      </View>
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
    if (!selectedRoom?.roleplay?.enabled) return null;
    const roleplay = selectedRoom.roleplay;
    const gmAlias = selectedRoom.members.find((member) => member.connectionId === roleplay.gmConnectionId)?.alias ?? 'GM';
    return (
      <View style={styles.rpSceneCard}>
        <View style={styles.rpSceneHeader}>
          <View style={styles.squareEventSource}>
            <Ionicons name="game-controller-outline" size={16} color="#7c3aed" />
            <Text style={styles.rpSceneTitle}>{roleplay.genre || '自由冒险'} · {gmAlias} 主持</Text>
          </View>
          <Text style={styles.rpSceneBadge}>{roleplay.includeAllAgents === false ? '仅 GM' : '全员入戏'}</Text>
        </View>
        <Text style={styles.rpSceneTone}>{roleplay.tone || '沉浸、轻桌游、重角色互动'}</Text>
        {roleplay.currentScene ? <Text style={styles.rpSceneBody} numberOfLines={3}>{roleplay.currentScene}</Text> : <Text style={styles.rpSceneBody}>还没有当前场景。用 /scene 写下开场，或直接用 /rp 开始行动。</Text>}
        {roleplay.archive ? <Text style={styles.rpSceneArchive}>档案：{summarizeRoleplayArchive(roleplay.archive)}</Text> : null}
      </View>
    );
  }

  function renderComposerModeBar() {
    if (!selectedRoom) return null;
    const items = selectedRoom.kind === 'group'
      ? UX_SLASH_COMMANDS.filter((item) => ['council', 'redteam', 'review', 'retro', 'rp', 'scene', 'ooc'].includes(item.id))
      : UX_SLASH_COMMANDS.filter((item) => item.id === 'rp' || item.id === 'ooc');
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeShortcutList}>
        <TouchableOpacity style={[styles.modeShortcut, quickCommandsOpen && styles.modeShortcutActive]} onPress={() => setQuickCommandsOpen((open) => !open)}>
          <Ionicons name="apps-outline" size={14} color={quickCommandsOpen ? '#ffffff' : '#4b5563'} />
          <Text style={[styles.modeShortcutText, quickCommandsOpen && styles.modeShortcutTextActive]}>模式</Text>
        </TouchableOpacity>
        {items.slice(0, isWideLayout ? 7 : 5).map((command) => (
          <TouchableOpacity key={command.id} style={styles.modeShortcut} onPress={() => insertUxCommand(command)}>
            <Ionicons name={command.kind === 'roleplay' ? 'game-controller-outline' : 'sparkles-outline'} size={14} color="#4b5563" />
            <Text style={styles.modeShortcutText}>{command.command}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  function renderSlashCommandPanel() {
    if (!selectedRoom || slashCommandSuggestions.length === 0) return null;
    return (
      <View style={styles.slashPanel}>
        <Text style={styles.panelLabel}>指令补全</Text>
        {slashCommandSuggestions.map((command) => (
          <TouchableOpacity key={command.id} style={styles.slashCommandRow} onPress={() => insertUxCommand(command)}>
            <View style={styles.slashCommandIcon}>
              <Ionicons name={command.kind === 'roleplay' ? 'game-controller-outline' : command.kind === 'memory' ? 'file-tray-full-outline' : 'people-circle-outline'} size={16} color="#2563eb" />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.slashCommandTitle}>{command.command} · {command.label}</Text>
              <Text style={styles.help}>{getUxCommandKindLabel(command.kind)} · {command.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderCollaborationDrawer() {
    if (!selectedRoom || selectedRoom.kind !== 'group') return null;
    return (
      <View style={styles.collabDrawer}>
        <ScrollView style={styles.collabDrawerScroll} contentContainerStyle={styles.collabDrawerContent}>
          <View style={styles.drawerHeader}>
            <View>
              <Text style={styles.drawerTitle}>Soul 房间侧栏</Text>
              <Text style={styles.help}>协作、委托、记忆和 RP 场景集中在这里。</Text>
            </View>
            <TouchableOpacity style={styles.sidebarIconButton} onPress={() => setCollaborationDrawerOpen(false)}>
              <Ionicons name="close" size={18} color="#4b5563" />
            </TouchableOpacity>
          </View>
          {renderRoomStatusBar()}
          {renderRoleplaySceneCard()}
          {selectedRoom.lastSummary ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>最近共识 · {selectedRoom.lastSummary.authorName}</Text>
              <MarkdownText content={selectedRoom.lastSummary.content} />
            </View>
          ) : <Text style={styles.help}>还没有最近共识。可在工具里生成总结。</Text>}
          {selectedRoom.memoryCapsule ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>房间记忆胶囊 · v{selectedRoom.memoryCapsule.version}</Text>
              <Text style={styles.help}>{summarizeRoomMemory(selectedRoom.memoryCapsule)}</Text>
            </View>
          ) : null}
          {selectedRoom.roleplay?.archive ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>RP 剧本档案 · v{selectedRoom.roleplay.archive.version}</Text>
              <Text style={styles.help}>{summarizeRoleplayArchive(selectedRoom.roleplay.archive)}</Text>
              <Text style={styles.help}>主线：{selectedRoom.roleplay.archive.currentQuest}</Text>
            </View>
          ) : null}
          <Text style={styles.panelLabel}>任务看板</Text>
          {selectedTaskBoard.map((column) => (
            <View key={column.id} style={styles.drawerTaskColumn}>
              <Text style={styles.taskBoardTitle}>{column.label} · {column.tasks.length}</Text>
              {column.tasks.slice(0, 3).map((task) => (
                <Text key={task.id} style={styles.help} numberOfLines={2}>• {task.toAlias}：{task.taskText}</Text>
              ))}
            </View>
          ))}
          <Text style={styles.panelLabel}>委托任务</Text>
          {selectedRoomDelegationTasks.length ? selectedRoomDelegationTasks.slice(0, 8).map((task) => (
            <View key={task.id} style={styles.taskCard}>
              <View style={styles.conflictHeader}>
                <Text style={styles.taskTitle}>{task.fromAlias} → {task.toAlias}</Text>
                <Text style={[styles.badge, getDelegationTaskStatusStyle(task.status)]}>{getDelegationTaskStatusLabel(task.status)}</Text>
              </View>
              <Text style={styles.help} numberOfLines={3}>{task.taskText}</Text>
            </View>
          )) : <Text style={styles.help}>暂无委托任务。</Text>}
          <Text style={styles.panelLabel}>最近协作</Text>
          {selectedRoomCollaborationEvents.length ? selectedRoomCollaborationEvents.slice(0, 10).map((event) => (
            <View key={event.id} style={styles.timelineItem}>
              <Ionicons name={getCollaborationEventIcon(event.kind)} size={14} color="#2563eb" />
              <View style={styles.timelineBody}>
                <Text style={styles.timelineTitle}>{event.title}</Text>
                <Text style={styles.timelineMeta}>{formatDateTime(event.createdAt)}{event.source ? ` · ${event.source}` : ''}{event.target ? ` → ${event.target}` : ''}</Text>
              </View>
            </View>
          )) : <Text style={styles.help}>暂无协作时间线。</Text>}
        </ScrollView>
      </View>
    );
  }

  function renderMessageSearchPanel() {
    const query = messageSearchQuery.trim();
    return (
      <View style={styles.searchPanel}>
        <View style={styles.searchInputRow}>
          <Ionicons name="search-outline" size={16} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            value={messageSearchQuery}
            onChangeText={setMessageSearchQuery}
            placeholder="搜索全部房间消息、作者或附件名"
            placeholderTextColor="#9ca3af"
          />
          {query ? (
            <TouchableOpacity onPress={() => setMessageSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ) : null}
        </View>
        {query ? (
          <View style={styles.searchResults}>
            <Text style={styles.help}>找到 {messageSearchResults.length} 条匹配，最多显示前 8 条。</Text>
            {messageSearchResults.slice(0, 8).map((result) => (
              <TouchableOpacity
                key={`${result.room.id}-${result.message.id}`}
                style={[styles.searchResult, result.room.id === selectedRoomId && styles.searchResultActive]}
                onPress={() => {
                  setSelectedRoomId(result.room.id);
                  setTab('chat');
                }}
              >
                <View style={styles.searchResultHeader}>
                  <Text style={styles.searchResultTitle}>{result.room.name}</Text>
                  <Text style={styles.searchResultMeta}>{result.message.authorName} · {formatDateTime(result.message.createdAt)}</Text>
                </View>
                <Text style={styles.searchResultSnippet} numberOfLines={2}>{result.snippet}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  function renderRoomCollaborationDashboard() {
    if (!selectedRoom || selectedRoom.kind !== 'group') return null;
    const latestSummary = selectedRoom.lastSummary;
    return (
      <View style={styles.collabPanel}>
        <TouchableOpacity style={styles.collabPanelHeader} onPress={() => setCollaborationPanelOpen((open) => !open)}>
          <View style={styles.squareEventSource}>
            <Ionicons name="git-network-outline" size={16} color="#2563eb" />
            <Text style={styles.panelLabel}>Soul 协作时间线</Text>
          </View>
          <Text style={styles.help}>{collaborationPanelOpen ? '收起' : '展开'}</Text>
        </TouchableOpacity>
        {collaborationPanelOpen ? (
          <>
            {latestSummary ? (
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>最近共识 · {latestSummary.authorName} · {formatDateTime(latestSummary.createdAt)}</Text>
                <MarkdownText content={latestSummary.content} />
              </View>
            ) : <Text style={styles.help}>还没有房间共识。可在“工具 → 团队模板与总结”里生成。</Text>}
            {selectedRoom.roleplay?.enabled ? (
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>RP 房间 · {selectedRoom.members.find((member) => member.connectionId === selectedRoom.roleplay?.gmConnectionId)?.alias ?? 'GM'} 主持</Text>
                <Text style={styles.help}>{summarizeRoleplayConfig(selectedRoom.roleplay)}</Text>
                {selectedRoom.roleplay.currentScene ? <Text style={styles.help}>当前场景：{selectedRoom.roleplay.currentScene}</Text> : null}
              </View>
            ) : null}
            {selectedRoom.memoryCapsule ? (
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>房间记忆胶囊 · v{selectedRoom.memoryCapsule.version}</Text>
                <Text style={styles.help}>{summarizeRoomMemory(selectedRoom.memoryCapsule)}</Text>
              </View>
            ) : null}
            {selectedRoomDelegationTasks.length ? (
              <View style={styles.taskList}>
                {selectedRoomDelegationTasks.slice(0, 4).map((task) => (
                  <View key={task.id} style={styles.taskCard}>
                    <Text style={styles.taskTitle}>{task.fromAlias} → {task.toAlias} · {getDelegationTaskStatusLabel(task.status)}</Text>
                    <Text style={styles.help} numberOfLines={2}>{task.taskText}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {selectedRoomCollaborationEvents.length ? (
              <View style={styles.timelineList}>
                {selectedRoomCollaborationEvents.slice(0, 6).map((event) => (
                  <View key={event.id} style={styles.timelineItem}>
                    <Ionicons name={getCollaborationEventIcon(event.kind)} size={14} color="#2563eb" />
                    <View style={styles.timelineBody}>
                      <Text style={styles.timelineTitle}>{event.title}</Text>
                      <Text style={styles.timelineMeta}>{formatDateTime(event.createdAt)}{event.source ? ` · ${event.source}` : ''}{event.target ? ` → ${event.target}` : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : <Text style={styles.help}>本房间还没有协作事件。</Text>}
          </>
        ) : null}
      </View>
    );
  }

  function renderQuickCommands() {
    if (!selectedRoom) return null;

    return (
      <View style={styles.quickPanel}>
        <Text style={styles.panelLabel}>快捷指令</Text>
        <View style={styles.quickGrid}>
          {QUICK_COMMANDS.map((command) => {
            const targetInRoom = selectedRoom.members.some((member) => (
              member.enabled && member.alias.toLowerCase() === command.targetAlias.toLowerCase()
            ));
            const usable = targetInRoom || selectedRoom.kind === 'direct';
            return (
              <TouchableOpacity
                key={command.id}
                style={[styles.quickCommand, !usable && styles.quickCommandDisabled]}
                onPress={() => runQuickCommand(command)}
                disabled={!usable || sending}
              >
                <Ionicons name={command.icon} size={18} color={usable ? '#2563eb' : '#9ca3af'} />
                <View style={styles.quickCommandTextBlock}>
                  <Text style={[styles.quickCommandTitle, !usable && styles.quickCommandTitleDisabled]}>{command.label}</Text>
                  <Text style={styles.quickCommandTarget}>{usable ? `给 ${command.targetAlias}` : `缺少 ${command.targetAlias}`}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        {selectedRoom.kind === 'group' ? (
          <>
            <Text style={styles.panelLabel}>协作仪式</Text>
            <Text style={styles.help}>可直接输入 {getRitualHelpText()}，也可以先写任务再点下面按钮。</Text>
            <View style={styles.quickGrid}>
              {COLLABORATION_RITUALS.map((ritual) => (
                <TouchableOpacity
                  key={ritual.id}
                  style={styles.quickCommand}
                  onPress={() => runRitualCommand(ritual.id)}
                  disabled={sending}
                >
                  <Ionicons name={ritual.id === 'council' ? 'people-circle-outline' : ritual.id === 'redteam' ? 'warning-outline' : ritual.id === 'review' ? 'checkmark-done-outline' : 'repeat-outline'} size={18} color="#2563eb" />
                  <View style={styles.quickCommandTextBlock}>
                    <Text style={styles.quickCommandTitle}>{ritual.label}</Text>
                    <Text style={styles.quickCommandTarget}>{ritual.mode === 'parallel' ? '并行观点 + 共识' : '接力审查 + 共识'}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.panelLabel}>桌游店 RP</Text>
            <Text style={styles.help}>不用背命令：点击后会把对应指令放进输入框。</Text>
            <View style={styles.quickGrid}>
              {UX_SLASH_COMMANDS.filter((command) => command.kind === 'roleplay').map((command) => (
                <TouchableOpacity key={command.id} style={styles.quickCommand} onPress={() => insertUxCommand(command)} disabled={sending}>
                  <Ionicons name={command.id === 'rp-stop' ? 'stop-circle-outline' : command.id === 'scene' ? 'map-outline' : command.id === 'ooc' ? 'chatbox-ellipses-outline' : 'game-controller-outline'} size={18} color="#7c3aed" />
                  <View style={styles.quickCommandTextBlock}>
                    <Text style={styles.quickCommandTitle}>{command.label}</Text>
                    <Text style={styles.quickCommandTarget}>{command.command}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
      </View>
    );
  }

  function renderRoomTools() {
    if (!selectedRoom) return null;
    const messages = messagesByRoom[selectedRoom.id] ?? [];
    const attachmentsCount = messages.reduce((total, message) => total + (message.attachments?.length ?? 0), 0);

    return (
      <View style={styles.toolsPanel}>
        <View style={styles.toolMetricRow}>
          <View style={styles.toolMetric}>
            <Text style={styles.toolMetricValue}>{messages.length}</Text>
            <Text style={styles.toolMetricLabel}>消息</Text>
          </View>
          <View style={styles.toolMetric}>
            <Text style={styles.toolMetricValue}>{attachmentsCount}</Text>
            <Text style={styles.toolMetricLabel}>附件</Text>
          </View>
          <View style={styles.toolMetric}>
            <Text style={styles.toolMetricValue}>{selectedRoom.contextLimit ?? DEFAULT_CONTEXT_LIMIT}</Text>
            <Text style={styles.toolMetricLabel}>上下文</Text>
          </View>
        </View>

        <View style={styles.roomEditPanel}>
          <Text style={styles.panelLabel}>房间管理</Text>
          <View style={styles.inlineFormRow}>
            <TextInput
              style={[styles.input, styles.inlineInput]}
              value={roomNameDraft}
              onChangeText={setRoomNameDraft}
              placeholder="房间名称"
            />
            <MiniButton icon="save-outline" label="保存" onPress={renameSelectedRoom} />
          </View>
        </View>

        {renderRoomModePanel()}

        <View style={styles.contextControl}>
          <Text style={styles.panelLabel}>上下文预算</Text>
          <View style={styles.stepper}>
            <MiniButton icon="remove-outline" label="-4" onPress={() => updateContextLimit(-4)} />
            <MiniButton icon="add-outline" label="+4" onPress={() => updateContextLimit(4)} />
          </View>
        </View>

        {selectedRoom.kind === 'group' ? (
          <View style={styles.roomEditPanel}>
            <Text style={styles.panelLabel}>Soul 协作策略</Text>
            <View style={styles.toolActions}>
              <MiniButton icon="hand-left-outline" label={selectedRoom.defaultCollaborationMode === 'manual' || !selectedRoom.defaultCollaborationMode ? '默认：手动' : '切手动'} onPress={() => setRoomDefaultCollaborationMode('manual')} />
              <MiniButton icon="git-network-outline" label={selectedRoom.defaultCollaborationMode === 'parallel' ? '默认：并行' : '切并行'} onPress={() => setRoomDefaultCollaborationMode('parallel')} />
              <MiniButton icon="git-branch-outline" label={selectedRoom.defaultCollaborationMode === 'sequential' ? '默认：接力' : '切接力'} onPress={() => setRoomDefaultCollaborationMode('sequential')} />
              <MiniButton icon={selectedRoom.autoDelegationEnabled === false ? 'flash-off-outline' : 'flash-outline'} label={selectedRoom.autoDelegationEnabled === false ? '自动委托关' : '自动委托开'} onPress={toggleRoomAutoDelegation} />
            </View>
            <View style={styles.stepper}>
              <MiniButton icon="remove-outline" label="深度 -1" onPress={() => updateRoomDelegationDepth(-1)} />
              <Text style={styles.help}>最大委托深度：{selectedRoom.maxDelegationDepth ?? MAX_DELEGATION_DEPTH}</Text>
              <MiniButton icon="add-outline" label="深度 +1" onPress={() => updateRoomDelegationDepth(1)} />
            </View>
            <Text style={styles.help}>默认模式会在群聊无 @ 时自动决定是否叫全员；手动模式保持“无 @ 不回复”。</Text>
          </View>
        ) : null}

        {selectedRoom.kind === 'group' ? (
          <View style={styles.roomEditPanel}>
            <Text style={styles.panelLabel}>角色扮演 RP 模式</Text>
            <Text style={styles.help}>桌游店式多人 RP：选择一位主 Agent 作为 GM/主持人负责推进剧情，其他 Agent 作为角色、NPC 或氛围补充依次入戏。</Text>
            <View style={styles.toolActions}>
              <MiniButton icon={selectedRoom.roleplay?.enabled ? 'game-controller' : 'game-controller-outline'} label={selectedRoom.roleplay?.enabled ? '关闭 RP' : '开启 RP'} onPress={toggleSelectedRoomRoleplay} />
              <MiniButton icon={selectedRoom.roleplay?.includeAllAgents === false ? 'person-outline' : 'people-outline'} label={selectedRoom.roleplay?.includeAllAgents === false ? '仅 GM' : '全员入戏'} onPress={() => updateSelectedRoomRoleplay({ includeAllAgents: selectedRoom.roleplay?.includeAllAgents === false })} />
            </View>
            <Text style={styles.help}>状态：{summarizeRoleplayConfig(selectedRoom.roleplay)}</Text>
            <Text style={styles.help}>GM：{selectedRoom.members.find((member) => member.connectionId === selectedRoom.roleplay?.gmConnectionId)?.alias ?? selectedRoom.members.find((member) => member.enabled)?.alias ?? '未选择'}</Text>
            <View style={styles.toolActions}>
              {selectedRoom.members.filter((member) => member.enabled).map((member) => (
                <MiniButton key={member.connectionId} icon="sparkles-outline" label={`GM ${member.alias}`} onPress={() => updateSelectedRoomRoleplay({ gmConnectionId: member.connectionId })} />
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={selectedRoom.roleplay?.playerName ?? '玩家'}
              onChangeText={(playerName) => updateSelectedRoomRoleplay({ playerName })}
              placeholder="玩家称呼，例如：调查员 / 旅人 / 店员"
            />
            <TextInput
              style={styles.input}
              value={selectedRoom.roleplay?.genre ?? '奇幻冒险'}
              onChangeText={(genre) => updateSelectedRoomRoleplay({ genre })}
              placeholder="类型，例如：都市怪谈 / 奇幻冒险 / 科幻悬疑"
            />
            <TextInput
              style={styles.input}
              value={selectedRoom.roleplay?.tone ?? '沉浸、轻桌游、重角色互动'}
              onChangeText={(tone) => updateSelectedRoomRoleplay({ tone })}
              placeholder="基调，例如：温柔治愈 / 黑暗悬疑 / 轻松搞笑"
            />
            <TextInput
              style={[styles.input, styles.jsonPasteInput]}
              multiline
              value={selectedRoom.roleplay?.premise ?? ''}
              onChangeText={(premise) => updateSelectedRoomRoleplay({ premise })}
              placeholder="世界观 / 剧情前提 / 开局设定"
              textAlignVertical="top"
            />
            <TextInput
              style={[styles.input, styles.jsonPasteInput]}
              multiline
              value={selectedRoom.roleplay?.currentScene ?? ''}
              onChangeText={(currentScene) => updateSelectedRoomRoleplay({ currentScene })}
              placeholder="当前场景，可用 /scene 指令或在这里手动维护"
              textAlignVertical="top"
            />
            <Text style={styles.help}>输入 /rp 开始或继续故事；/scene 更新场景；/ooc 进行场外规则讨论。RP 开启后，普通输入也会自动进入“GM → 其他 Agent”的接力回合。</Text>
          </View>
        ) : null}

        {renderRoleplayArchivePanel()}
        {renderTaskBoardPanel()}

        {selectedRoom.kind === 'group' ? (
          <View style={styles.roomEditPanel}>
            <Text style={styles.panelLabel}>群成员</Text>
            {selectedRoom.members.map((member) => (
              <View key={member.connectionId} style={styles.memberEditorRow}>
                <TouchableOpacity
                  style={[styles.syncToggle, member.enabled && styles.syncToggleOn]}
                  onPress={() => updateSelectedRoomMember(member.connectionId, { enabled: !member.enabled })}
                >
                  <Text style={[styles.syncToggleText, member.enabled && styles.syncToggleTextOn]}>
                    {member.enabled ? '启用' : '停用'}
                  </Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, styles.memberAliasInput]}
                  value={member.alias}
                  onChangeText={(alias) => updateSelectedRoomMember(member.connectionId, { alias })}
                  placeholder="成员别名"
                />
                <MiniButton icon="remove-circle-outline" label="移除" onPress={() => removeMemberFromSelectedRoom(member)} />
              </View>
            ))}
            {availableConnectionsForSelectedRoom.length ? (
              <View style={styles.toolActions}>
                {availableConnectionsForSelectedRoom.map((connection) => (
                  <MiniButton key={connection.id} icon="add-circle-outline" label={`加入 ${connection.name}`} onPress={() => addMemberToSelectedRoom(connection)} />
                ))}
              </View>
            ) : (
              <Text style={styles.help}>没有可加入的新连接。</Text>
            )}
          </View>
        ) : null}

        {selectedRoom.kind === 'group' ? (
          <View style={styles.roomEditPanel}>
            <Text style={styles.panelLabel}>团队模板与总结</Text>
            <View style={styles.inlineFormRow}>
              <TextInput
                style={[styles.input, styles.inlineInput]}
                value={teamTemplateName}
                onChangeText={setTeamTemplateName}
                placeholder="模板名称"
              />
              <MiniButton icon="bookmark-outline" label="保存模板" onPress={saveSelectedRoomAsTeamTemplate} />
            </View>
            {selectedRoomTeamTemplates.length ? (
              <View style={styles.toolActions}>
                {selectedRoomTeamTemplates.slice(0, 4).map((template) => (
                  <MiniButton key={template.id} icon="albums-outline" label={`应用 ${template.name}`} onPress={() => applyTeamTemplateToSelectedRoom(template)} />
                ))}
              </View>
            ) : <Text style={styles.help}>还没有匹配当前房间成员的团队模板。</Text>}
            <Text style={styles.help}>总结者：{selectedRoom.members.find((member) => member.connectionId === selectedRoom.summaryConnectionId)?.alias ?? '自动选择首个启用成员'}</Text>
            <View style={styles.toolActions}>
              {selectedRoom.members.filter((member) => member.enabled).map((member) => (
                <MiniButton key={member.connectionId} icon="reader-outline" label={`总结者 ${member.alias}`} onPress={() => setRoomSummaryConnection(member.connectionId)} />
              ))}
              <MiniButton icon="sparkles-outline" label={summaryGenerating ? '总结中...' : '生成共识总结'} onPress={generateRoomSummary} />
            </View>
          </View>
        ) : null}

        {selectedRoom.kind === 'group' ? (
          <View style={styles.roomEditPanel}>
            <Text style={styles.panelLabel}>房间记忆胶囊</Text>
            {selectedRoom.memoryCapsule ? (
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>v{selectedRoom.memoryCapsule.version} · {selectedRoom.memoryCapsule.authorName ?? 'Laphiny'} · {formatDateTime(selectedRoom.memoryCapsule.updatedAt)}</Text>
                <Text style={styles.help}>{summarizeRoomMemory(selectedRoom.memoryCapsule)}</Text>
                <MarkdownText content={formatRoomMemoryForPrompt(selectedRoom.memoryCapsule)} />
              </View>
            ) : (
              <Text style={styles.help}>还没有房间记忆。生成后会把目标、共识、待办、偏好和未解决问题注入后续群聊上下文。</Text>
            )}
            <View style={styles.toolActions}>
              <MiniButton icon="sparkles-outline" label={memoryGenerating ? '生成中...' : selectedRoom.memoryCapsule ? '更新记忆' : '生成记忆'} onPress={generateRoomMemoryCapsule} />
              <MiniButton icon="trash-outline" label="清空记忆胶囊" onPress={clearRoomMemoryCapsule} />
            </View>
          </View>
        ) : null}

        <View style={styles.toolActions}>
          <MiniButton icon="download-outline" label="导出 JSON" onPress={() => exportSelectedRoom('json')} />
          <MiniButton icon="document-text-outline" label="导出 MD" onPress={() => exportSelectedRoom('markdown')} />
          <MiniButton icon="refresh-circle-outline" label="清空记忆" onPress={resetRoomSession} />
          <MiniButton icon="trash-outline" label="清空记录" onPress={clearSelectedRoomMessages} />
          <MiniButton icon="close-circle-outline" label="删除房间" onPress={deleteSelectedRoom} />
        </View>
      </View>
    );
  }

  function renderSettings() {
    return (
      <ScrollView style={styles.content} contentContainerStyle={styles.panel}>
        <View style={styles.squareHeader}>
          <View>
            <Text style={styles.sectionTitle}>设置</Text>
            <Text style={styles.help}>管理同步、备份、诊断日志和项目运行信息。</Text>
          </View>
          <Text style={styles.squareCount}>v{APP_VERSION}</Text>
        </View>

        <View style={styles.syncPanel}>
          <View style={styles.syncHeader}>
            <View style={styles.syncHeaderText}>
              <Text style={styles.cardTitle}>项目信息</Text>
              <Text style={styles.help}>Laphiny 是面向多 Hermes Agent 的本地优先协作聊天客户端。</Text>
            </View>
            <StatusToken icon="shield-checkmark-outline" label="本地优先" tone="memory" />
          </View>
          <View style={styles.storageInfoBox}>
            <Text style={styles.storageInfoText}>应用版本：{APP_VERSION} · Expo SDK 54 · React Native 0.81</Text>
            <Text style={styles.storageInfoText}>平台：{Platform.OS} · 布局 {getLayoutModeLabel(layoutMode)} / {Math.round(width)}px · {networkOnline ? '在线' : '离线'}</Text>
            <Text style={styles.storageInfoText}>Android 包名：site.nianxxz.laphiny · EAS 项目：2970a5e0-248d-49eb-a8b5-90c8c19ed6ee</Text>
            <Text style={styles.storageInfoText}>连接 {connections.length} 个 · 房间 {rooms.length} 个 · 消息 {storageSummary.messageCount} 条 / {storageSummary.messageSizeLabel}</Text>
          </View>
        </View>

        <View style={styles.syncPanel}>
          <View style={styles.syncHeader}>
            <View style={styles.syncHeaderText}>
              <Text style={styles.cardTitle}>SQLite 同步后端</Text>
              <Text style={styles.help}>连接自己的轻后端后，可在多设备间共享房间、消息和灵庭事件。</Text>
            </View>
            <TouchableOpacity
              style={[styles.syncToggle, syncConfig.enabled && styles.syncToggleOn]}
              onPress={() => setSyncConfig((current) => ({ ...current, enabled: !current.enabled, updatedAt: new Date().toISOString() }))}
            >
              <Text style={[styles.syncToggleText, syncConfig.enabled && styles.syncToggleTextOn]}>
                {syncConfig.enabled ? '已启用' : '未启用'}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            value={syncConfig.baseUrl}
            onChangeText={(baseUrl) => setSyncConfig((current) => ({ ...current, baseUrl, updatedAt: new Date().toISOString() }))}
            placeholder="https://your-sync.example/laphiny-sync"
            autoCapitalize="none"
            keyboardType="url"
          />
          <TextInput
            style={styles.input}
            value={syncConfig.apiKey}
            onChangeText={(apiKey) => setSyncConfig((current) => ({ ...current, apiKey, updatedAt: new Date().toISOString() }))}
            placeholder="同步 API Key，可留空"
            autoCapitalize="none"
            secureTextEntry
          />
          <View style={styles.syncMetaRow}>
            <Text style={styles.help}>上次拉取：{syncConfig.lastPulledAt ? formatDateTime(syncConfig.lastPulledAt) : '无'}</Text>
            <Text style={styles.help}>上次推送：{syncConfig.lastPushedAt ? formatDateTime(syncConfig.lastPushedAt) : '无'}</Text>
            <Text style={styles.help}>事件轮询：{syncConfig.lastEventPulledAt ? formatDateTime(syncConfig.lastEventPulledAt) : '无'}</Text>
          </View>
          <View style={styles.buttonRow}>
            <SecondaryButton icon="pulse-outline" label={syncing ? '检查中...' : '测试后端'} onPress={testSyncBackend} disabled={syncing} />
            <SecondaryButton icon="git-compare-outline" label={checkingSyncConflicts ? '检查中...' : '检查差异'} onPress={checkSyncConflicts} disabled={syncing || checkingSyncConflicts} />
            <SecondaryButton icon="cloud-download-outline" label="拉取快照" onPress={pullSyncSnapshot} disabled={syncing || checkingSyncConflicts} />
            <PrimaryButton icon="cloud-upload-outline" label="推送快照" onPress={pushSyncSnapshot} disabled={syncing || checkingSyncConflicts} />
          </View>
          {renderSyncConflictReport()}
        </View>

        <View style={styles.syncPanel}>
          <View style={styles.syncHeader}>
            <View style={styles.syncHeaderText}>
              <Text style={styles.cardTitle}>本地备份 / 恢复</Text>
              <Text style={styles.help}>导出完整 JSON 文件，或在另一台设备上传合并恢复。备份可能包含 API Key，请只保存在可信位置。</Text>
            </View>
            <Text style={styles.squareCount}>v5</Text>
          </View>
          <View style={styles.buttonRow}>
            <SecondaryButton icon="download-outline" label="导出备份文件" onPress={exportAppBackup} />
            <SecondaryButton icon="cloud-upload-outline" label="上传备份文件" onPress={importBackupFile} />
            <SecondaryButton icon="clipboard-outline" label="粘贴恢复" onPress={handlePasteBackup} disabled={!backupPaste.trim()} />
          </View>
          <TextInput
            style={[styles.input, styles.jsonPasteInput]}
            multiline
            value={backupPaste}
            onChangeText={setBackupPaste}
            placeholder="粘贴 Laphiny 完整备份 JSON，恢复时会合并当前数据。"
            autoCapitalize="none"
            textAlignVertical="top"
          />
        </View>

        <View style={styles.diagnosticPanel}>
          <View style={styles.syncHeader}>
            <View style={styles.syncHeaderText}>
              <Text style={styles.cardTitle}>诊断日志</Text>
              <Text style={styles.help}>记录最近的 Hermes 请求、Agent 委托、连接测试、同步和备份恢复结果。复制诊断包时会脱敏 API Key。</Text>
            </View>
            <TouchableOpacity
              style={[styles.syncToggle, diagnosticLogsOpen && styles.syncToggleOn]}
              onPress={() => setDiagnosticLogsOpen((open) => !open)}
            >
              <Text style={[styles.syncToggleText, diagnosticLogsOpen && styles.syncToggleTextOn]}>
                {diagnosticLogsOpen ? '已展开' : '已收起'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.healthMetricRow}>
            <HealthMetric label="总数" value={diagnosticSummary.total} tone="unknown" />
            <HealthMetric label="近 50 错误" value={diagnosticSummary.errors} tone={diagnosticSummary.errors > 0 ? 'error' : 'ok'} />
            <HealthMetric label="近 50 警告" value={diagnosticSummary.warnings} tone={diagnosticSummary.warnings > 0 ? 'checking' : 'ok'} />
          </View>
          <View style={styles.storageInfoBox}>
            <Text style={styles.storageInfoTitle}>存储后端</Text>
            <Text style={styles.storageInfoText}>密钥：{storageBackend?.secretBackend ?? '加载中'} · 长期记录：{storageBackend?.durableBackend ?? '加载中'} · SW {getServiceWorkerStatusLabel(serviceWorkerStatus)}{pwaInstalled ? ' · 已安装 PWA' : ''}</Text>
            {storageBackend?.durableDirectory ? <Text style={styles.storageInfoPath}>{storageBackend.durableDirectory}</Text> : null}
          </View>
          <View style={styles.buttonRow}>
            <SecondaryButton icon="copy-outline" label="复制诊断包" onPress={copyDiagnosticBundle} />
            <SecondaryButton icon="trash-outline" label="清空日志" onPress={clearDiagnosticLogs} disabled={diagnosticLogs.length === 0} />
          </View>
          {diagnosticLogsOpen ? (
            <View style={styles.diagnosticList}>
              {diagnosticSummary.recent.length === 0 ? (
                <Text style={styles.help}>还没有诊断日志。发送消息、测试连接或同步后会自动记录。</Text>
              ) : null}
              {[...diagnosticSummary.recent].reverse().map((log) => (
                <View key={log.id} style={styles.diagnosticItem}>
                  <View style={styles.diagnosticHeader}>
                    <View style={styles.squareEventSource}>
                      <Ionicons name={getDiagnosticLogIcon(log)} size={16} color="#2563eb" />
                      <Text style={styles.squareEventTitle}>{log.title}</Text>
                    </View>
                    <Text style={[styles.diagnosticLevel, getDiagnosticLevelStyle(log.level)]}>{getDiagnosticLevelLabel(log.level)}</Text>
                  </View>
                  <Text style={styles.squareEventMeta}>
                    {getDiagnosticCategoryLabel(log.category)}{log.connectionName ? ` · ${log.connectionName}` : ''}{log.roomName ? ` · ${log.roomName}` : ''}{log.durationMs != null ? ` · ${log.durationMs}ms` : ''}{log.requestId ? ` · ${log.requestId}` : ''}
                  </Text>
                  {log.message ? <Text style={styles.diagnosticMessage}>{log.message}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
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

        {renderSoulDailyPanel(dailyDigest)}

        {renderCollaborationArchive()}

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
            <MarkdownText content={event.body} />
          </View>
        ))}
      </ScrollView>
    );
  }

  function renderSoulDailyPanel(dailyDigest: ReturnType<typeof buildSoulDailyDigest>) {
    const openTasks = delegationTasks
      .filter((task) => task.status === 'pending' || task.status === 'running')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6);
    const memoryRooms = rooms.filter((room) => room.memoryCapsule).slice(0, 6);
    return (
      <View style={styles.diagnosticPanel}>
        <View style={styles.syncHeader}>
          <View>
            <Text style={styles.cardTitle}>今日小队动态</Text>
            <Text style={styles.help}>从今天 0 点起统计 Soul 小队活动：发言、委托、总结、房间记忆和活跃房间。</Text>
          </View>
          <Text style={styles.squareCount}>{dailyDigest.agentReplies} 次回复</Text>
        </View>
        <View style={styles.healthMetricRow}>
          <HealthMetric label="用户消息" value={dailyDigest.userMessages} tone="unknown" />
          <HealthMetric label="协作事件" value={dailyDigest.collaborationEvents} tone="checking" />
          <HealthMetric label="委托完成" value={dailyDigest.completedDelegations} tone={dailyDigest.completedDelegations > 0 ? 'ok' : 'unknown'} />
          <HealthMetric label="待处理" value={dailyDigest.pendingDelegations} tone={dailyDigest.pendingDelegations > 0 ? 'checking' : 'ok'} />
        </View>

        <Text style={styles.panelLabel}>Agent 今日表现</Text>
        {dailyDigest.agentStats.length ? dailyDigest.agentStats.slice(0, 8).map((stat) => (
          <View key={stat.connectionId} style={styles.conflictItem}>
            <View style={styles.conflictHeader}>
              <Text style={styles.conflictItemTitle}>{stat.name}</Text>
              <Text style={styles.help}>{stat.replies} 回复 · 接收 {stat.delegatedIn} 委托 · 完成 {stat.completedTasks} 个{stat.profileUpdated ? ' · 卡片已更新' : ''}</Text>
            </View>
          </View>
        )) : <Text style={styles.help}>今天还没有 Agent 活动。</Text>}

        <Text style={styles.panelLabel}>活跃房间</Text>
        {dailyDigest.activeRooms.length ? dailyDigest.activeRooms.map((room) => (
          <TouchableOpacity key={room.roomId} style={styles.conflictItem} onPress={() => { setSelectedRoomId(room.roomId); setTab('chat'); }}>
            <Text style={styles.conflictItemTitle}>{room.roomName}</Text>
            <Text style={styles.help}>{room.messages} 条消息 · {room.collaborations} 个协作事件</Text>
          </TouchableOpacity>
        )) : <Text style={styles.help}>今天还没有活跃房间。</Text>}

        <Text style={styles.panelLabel}>未完成委托任务</Text>
        {openTasks.length ? openTasks.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.conflictHeader}>
              <Text style={styles.taskTitle}>{task.fromAlias} → {task.toAlias}</Text>
              <Text style={[styles.badge, getDelegationTaskStatusStyle(task.status)]}>{getDelegationTaskStatusLabel(task.status)}</Text>
            </View>
            <Text style={styles.help}>{task.roomName} · {formatDateTime(task.updatedAt)}</Text>
            <Text style={styles.diagnosticMessage}>{task.taskText}</Text>
          </View>
        )) : <Text style={styles.help}>没有未完成的委托任务。</Text>}

        <Text style={styles.panelLabel}>房间记忆胶囊</Text>
        {memoryRooms.length ? memoryRooms.map((room) => (
          <TouchableOpacity key={room.id} style={styles.conflictItem} onPress={() => { setSelectedRoomId(room.id); setTab('chat'); setRoomToolsOpen(true); }}>
            <Text style={styles.conflictItemTitle}>{room.name}</Text>
            <Text style={styles.help}>{summarizeRoomMemory(room.memoryCapsule)}</Text>
          </TouchableOpacity>
        )) : <Text style={styles.help}>还没有房间记忆胶囊。可在群聊工具里生成。</Text>}
      </View>
    );
  }

  function renderCollaborationArchive() {
    const recentEvents = [...collaborationEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
    const recentTasks = [...delegationTasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
    return (
      <View style={styles.diagnosticPanel}>
        <View style={styles.syncHeader}>
          <View>
            <Text style={styles.cardTitle}>Soul 协作工作台</Text>
            <Text style={styles.help}>阶段四差异点：协作时间线、委托任务卡、团队模板和协作卡片版本都集中在这里。</Text>
          </View>
          <Text style={styles.squareCount}>{recentEvents.length} 条协作</Text>
        </View>

        <Text style={styles.panelLabel}>委托任务卡</Text>
        {recentTasks.length ? recentTasks.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.conflictHeader}>
              <Text style={styles.taskTitle}>{task.fromAlias} → {task.toAlias}</Text>
              <Text style={[styles.badge, getDelegationTaskStatusStyle(task.status)]}>{getDelegationTaskStatusLabel(task.status)}</Text>
            </View>
            <Text style={styles.help}>{task.roomName} · 深度 {task.depth} · {formatDateTime(task.updatedAt)}</Text>
            <Text style={styles.diagnosticMessage}>{task.taskText}</Text>
          </View>
        )) : <Text style={styles.help}>还没有 Agent-to-Agent 委托任务。</Text>}

        <Text style={styles.panelLabel}>团队模板</Text>
        {teamTemplates.length ? teamTemplates.map((template) => (
          <View key={template.id} style={styles.conflictItem}>
            <View style={styles.conflictHeader}>
              <View>
                <Text style={styles.conflictItemTitle}>{template.name}</Text>
                <Text style={styles.help}>{getTeamTemplateModeLabel(template.defaultMode)} · 委托深度 {template.maxDelegationDepth} · {template.autoDelegationEnabled ? '自动委托' : '不自动委托'}</Text>
              </View>
              <SecondaryButton icon="trash-outline" label="删除" onPress={() => deleteTeamTemplate(template)} />
            </View>
          </View>
        )) : <Text style={styles.help}>还没有保存团队模板。可在房间工具里保存当前小队配置。</Text>}

        <Text style={styles.panelLabel}>协作卡片版本</Text>
        {latestProfileVersions.length ? latestProfileVersions.map((version) => (
          <View key={version.id} style={styles.conflictItem}>
            <View style={styles.conflictHeader}>
              <View style={styles.rowMain}>
                <Text style={styles.conflictItemTitle}>{version.connectionName}</Text>
                <Text style={styles.help}>{formatDateTime(version.createdAt)} · {version.note ?? '协作卡片版本'}</Text>
                <Text style={styles.diagnosticMessage} numberOfLines={2}>{summarizeAgentProfile(version.profile)}</Text>
              </View>
              <SecondaryButton icon="reload-outline" label="回滚" onPress={() => restoreProfileVersion(version)} />
            </View>
          </View>
        )) : <Text style={styles.help}>生成或更新协作卡片后，这里会保留版本历史。</Text>}

        <Text style={styles.panelLabel}>最近协作时间线</Text>
        {recentEvents.length ? recentEvents.map((event) => (
          <View key={event.id} style={styles.timelineItemLarge}>
            <Ionicons name={getCollaborationEventIcon(event.kind)} size={16} color="#2563eb" />
            <View style={styles.timelineBody}>
              <Text style={styles.timelineTitle}>{event.title}</Text>
              <Text style={styles.timelineMeta}>{event.roomName} · {formatDateTime(event.createdAt)}{event.source ? ` · ${event.source}` : ''}{event.target ? ` → ${event.target}` : ''}</Text>
              {event.body ? <Text style={styles.help} numberOfLines={2}>{event.body}</Text> : null}
            </View>
          </View>
        )) : <Text style={styles.help}>还没有协作事件。</Text>}
      </View>
    );
  }

  function renderSyncConflictReport() {
    if (!syncConflictReport) {
      return <Text style={styles.help}>推送/拉取前可先点“检查差异”，只读取远端快照，不会修改本机数据。</Text>;
    }

    const summary = syncConflictReport.summary;
    return (
      <View style={styles.conflictPanel}>
        <View style={styles.conflictHeader}>
          <View>
            <Text style={styles.cardTitle}>同步差异预检</Text>
            <Text style={styles.help}>检查于 {formatDateTime(syncConflictReport.checkedAt)}。本报告只读远端数据，不会自动合并。</Text>
          </View>
          <Text style={[styles.badge, summary.total > 0 ? styles.diagnosticLevelWarning : styles.diagnosticLevelSuccess]}>
            {summary.total > 0 ? `${summary.total} 项差异` : '无差异'}
          </Text>
        </View>
        <View style={styles.healthMetricRow}>
          <HealthMetric label="本地独有" value={summary.localOnly} tone={summary.localOnly > 0 ? 'checking' : 'ok'} />
          <HealthMetric label="远端独有" value={summary.remoteOnly} tone={summary.remoteOnly > 0 ? 'checking' : 'ok'} />
          <HealthMetric label="本地较新" value={summary.localNewer} tone={summary.localNewer > 0 ? 'error' : 'ok'} />
          <HealthMetric label="远端较新" value={summary.remoteNewer} tone={summary.remoteNewer > 0 ? 'checking' : 'ok'} />
        </View>
        {summary.localNewer > 0 || summary.sameTimeDifferent > 0 ? (
          <Text style={styles.conflictWarning}>拉取快照会按 updatedAt 合并，远端较新的连接/房间会覆盖本地版本；本地较新的内容建议先推送或备份。</Text>
        ) : null}
        {syncConflictReport.items.length > 0 ? (
          <View style={styles.conflictList}>
            {syncConflictReport.items.slice(0, 12).map((item) => (
              <View key={`${item.entity}:${item.id}:${item.status}`} style={styles.conflictItem}>
                <Text style={styles.conflictItemTitle}>{getSyncConflictEntityLabel(item.entity)} · {item.label}</Text>
                <Text style={styles.conflictItemMeta}>{getSyncConflictStatusLabel(item.status)} · 本地 {item.localUpdatedAt ? formatDateTime(item.localUpdatedAt) : '无'} · 远端 {item.remoteUpdatedAt ? formatDateTime(item.remoteUpdatedAt) : '无'}</Text>
                {item.detail ? <Text style={styles.help}>{item.detail}</Text> : null}
              </View>
            ))}
            {syncConflictReport.truncated ? <Text style={styles.help}>差异较多，已展示最近 {syncConflictReport.items.length} 项；完整摘要会保留在诊断日志。</Text> : null}
          </View>
        ) : <Text style={styles.help}>本地与远端快照内容一致。</Text>}
      </View>
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

  function renderStarterTemplates() {
    return (
      <View style={styles.templateGrid}>
        {STARTER_ROOM_TEMPLATES.map((template) => (
          <TouchableOpacity key={template.id} style={styles.templateCard} onPress={() => createStarterRoom(template)}>
            <View style={styles.squareEventSource}>
              <Ionicons name={template.mode === 'tabletop' ? 'game-controller-outline' : template.mode === 'review' ? 'shield-checkmark-outline' : 'sparkles-outline'} size={16} color="#2563eb" />
              <Text style={styles.conflictItemTitle}>{template.title}</Text>
            </View>
            <Text style={styles.help}>{template.description}</Text>
            <Text style={styles.badge}>{getRoomModeLabel(template.mode)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderRoomModePanel() {
    if (!selectedRoom || selectedRoom.kind !== 'group') return null;
    return (
      <View style={styles.roomEditPanel}>
        <Text style={styles.panelLabel}>房间模式</Text>
        <Text style={styles.help}>一键切换整套默认行为：协作触发、委托开关、RP 舞台和提示词语气。</Text>
        <View style={styles.modeGrid}>
          {ROOM_MODES.map((mode) => (
            <TouchableOpacity
              key={mode.id}
              style={[styles.roomModeCard, selectedRoom.mode === mode.id && styles.roomModeCardActive]}
              onPress={() => applyRoomMode(mode.id)}
            >
              <Text style={[styles.roomModeTitle, selectedRoom.mode === mode.id && styles.roomModeTitleActive]}>{mode.label}</Text>
              <Text style={[styles.roomModeDescription, selectedRoom.mode === mode.id && styles.roomModeDescriptionActive]} numberOfLines={3}>{mode.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  function renderRoleplayArchivePanel() {
    if (!selectedRoom?.roleplay?.enabled) return null;
    const archive = selectedRoom.roleplay.archive;
    return (
      <View style={styles.roomEditPanel}>
        <View style={styles.syncHeader}>
          <View>
            <Text style={styles.panelLabel}>RP 剧本档案</Text>
            <Text style={styles.help}>长期记录世界观、章节、NPC、地点、道具、线索、谜团、玩家选择和 GM 幕后笔记。</Text>
          </View>
          <View style={styles.buttonRowCompact}>
            <MiniButton icon="file-tray-full-outline" label={rpArchiveGenerating ? '整理中...' : '整理档案'} onPress={generateRoleplayArchive} />
            {archive ? <MiniButton icon="trash-outline" label="清空" onPress={clearRoleplayArchive} /> : null}
          </View>
        </View>
        {archive ? (
          <View style={styles.archiveCard}>
            <Text style={styles.summaryTitle}>{archive.title} · 第 {archive.chapter} 章</Text>
            <Text style={styles.help}>{summarizeRoleplayArchive(archive)} · 更新于 {formatDateTime(archive.updatedAt)}</Text>
            <Text style={styles.diagnosticMessage}>主线：{archive.currentQuest}</Text>
            <Text style={styles.help}>NPC：{archive.npcs.slice(0, 4).join('、') || '暂无'} </Text>
            <Text style={styles.help}>线索：{archive.clues.slice(0, 4).join('、') || '暂无'} </Text>
            {archive.gmNotes ? <Text style={styles.conflictWarning}>GM 幕后笔记：{archive.gmNotes}</Text> : null}
          </View>
        ) : <Text style={styles.help}>还没有 RP 剧本档案。开始几轮剧情后，点击“整理档案”。</Text>}
      </View>
    );
  }

  function renderTaskBoardPanel() {
    if (!selectedRoom || selectedRoom.kind !== 'group') return null;
    return (
      <View style={styles.roomEditPanel}>
        <Text style={styles.panelLabel}>任务看板</Text>
        <Text style={styles.help}>委托任务会按状态进入看板。专业协作里是项目任务；RP 房间里也可作为主线/支线任务。</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.taskBoardRow}>
          {selectedTaskBoard.map((column) => (
            <View key={column.id} style={styles.taskBoardColumn}>
              <Text style={styles.taskBoardTitle}>{column.label} · {column.tasks.length}</Text>
              {column.tasks.slice(0, 5).map((task) => (
                <View key={task.id} style={styles.taskBoardItem}>
                  <Text style={styles.taskTitle}>{task.fromAlias} → {task.toAlias}</Text>
                  <Text style={styles.help} numberOfLines={3}>{task.taskText}</Text>
                </View>
              ))}
              {column.tasks.length === 0 ? <Text style={styles.help}>暂无</Text> : null}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  function renderSoulRelationsPanel() {
    return (
      <View style={styles.diagnosticPanel}>
        <View style={styles.syncHeader}>
          <View>
            <Text style={styles.cardTitle}>Soul 关系图</Text>
            <Text style={styles.help}>根据委托、完成、互相引用统计 Agent 之间的协作关系。</Text>
          </View>
          <Text style={styles.squareCount}>{soulRelations.length} 条关系</Text>
        </View>
        {soulRelations.length ? soulRelations.map((edge) => (
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

  function renderRooms() {
    return (
      <ScrollView style={styles.content} contentContainerStyle={styles.panel}>
        {renderOnboardingPanel()}
        <Text style={styles.sectionTitle}>房间模板</Text>
        <Text style={styles.help}>用模板一键创建工作室、审查室、桌游店或日常房间，不包含 API Key。你也可以创建后再微调成员和模式。</Text>
        {renderStarterTemplates()}

        <Text style={styles.sectionTitle}>创建单聊</Text>
        {enabledConnections.length === 0 ? <Text style={styles.muted}>还没有已启用的 Hermes 连接。</Text> : null}
        {enabledConnections.map((connection) => (
          <View key={connection.id} style={styles.rowCard}>
            <View style={styles.rowMain}>
              <Text style={styles.cardTitle}>{connection.name}</Text>
              <Text style={styles.muted}>{connection.baseUrl}</Text>
            </View>
            <SecondaryButton icon="chatbubble-outline" label="单聊" onPress={() => createDirectRoom(connection)} />
          </View>
        ))}

        <Text style={styles.sectionTitle}>创建群聊</Text>
        <TextInput style={styles.input} value={groupName} onChangeText={setGroupName} placeholder="群聊名称" />
        <View style={styles.roomEditPanel}>
          <View style={styles.conflictHeader}>
            <Text style={styles.panelLabel}>选择初始成员 · {groupMemberDraftIds.length}/{enabledConnections.length}</Text>
            <View style={styles.stepper}>
              <MiniButton icon="checkmark-done-outline" label="全选" onPress={() => setGroupMemberDraftIds(enabledConnections.map((connection) => connection.id))} />
              <MiniButton icon="remove-circle-outline" label="清空" onPress={() => setGroupMemberDraftIds([])} />
            </View>
          </View>
          <View style={styles.memberChips}>
            {enabledConnections.map((connection) => (
              <TouchableOpacity
                key={connection.id}
                style={[styles.memberChip, groupMemberDraftSet.has(connection.id) && styles.memberChipSelected]}
                onPress={() => setGroupMemberDraftIds((current) => (
                  current.includes(connection.id)
                    ? current.filter((id) => id !== connection.id)
                    : [...current, connection.id]
                ))}
              >
                <AgentBadge alias={connection.name} active={groupMemberDraftSet.has(connection.id)} imageUri={connection.avatarUri} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Text style={styles.help}>群聊只会加入上面选中的连接。发送时使用 @成员名、@all/@all-seq，或 /council /redteam /review /retro 启动协作仪式。</Text>
        <PrimaryButton icon="people-outline" label="创建群聊" onPress={createGroupRoom} disabled={groupMemberDraftIds.length < 2} />

        <Text style={styles.sectionTitle}>已有房间</Text>
        {rooms.map((room) => (
          <View key={room.id} style={styles.card}>
            <TouchableOpacity onPress={() => { setSelectedRoomId(room.id); setTab('chat'); }}>
              <Text style={styles.cardTitle}>{room.name}</Text>
              <Text style={styles.muted}>{room.kind === 'group' ? '群聊' : '单聊'} · {room.members.map((member) => `${member.enabled ? '' : '停用:'}${member.alias}`).join('、')}</Text>
              <Text style={styles.help}>{(messagesByRoom[room.id] ?? []).length} 条消息 · 更新于 {formatDateTime(room.updatedAt)}</Text>
            </TouchableOpacity>
            <View style={styles.buttonRow}>
              <SecondaryButton icon="chatbubble-ellipses-outline" label="进入" onPress={() => { setSelectedRoomId(room.id); setTab('chat'); }} />
              <SecondaryButton icon="options-outline" label="管理" onPress={() => { setSelectedRoomId(room.id); setTab('chat'); setRoomToolsOpen(true); }} />
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  function renderConnections() {
    return (
      <ScrollView style={styles.content} contentContainerStyle={styles.panel}>
        <Text style={styles.sectionTitle}>添加 Hermes Gateway</Text>
        <TextInput
          style={styles.input}
          value={connectionForm.name}
          onChangeText={(name) => setConnectionForm((current) => ({ ...current, name }))}
          placeholder="名称，例如 Flor"
        />
        <TextInput
          style={styles.input}
          value={connectionForm.baseUrl}
          onChangeText={(baseUrl) => setConnectionForm((current) => ({ ...current, baseUrl }))}
          placeholder="http://127.0.0.1:8642"
          autoCapitalize="none"
          keyboardType="url"
        />
        <TextInput
          style={styles.input}
          value={connectionForm.apiKey}
          onChangeText={(apiKey) => setConnectionForm((current) => ({ ...current, apiKey }))}
          placeholder="API Key，可留空"
          autoCapitalize="none"
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          value={connectionForm.model}
          onChangeText={(model) => setConnectionForm((current) => ({ ...current, model }))}
          placeholder="模型名"
          autoCapitalize="none"
        />
        <PrimaryButton icon="add-circle-outline" label="添加连接" onPress={addConnection} />
        <View style={styles.importSection}>
          <View style={styles.importRow}>
            <SecondaryButton icon="cloud-upload-outline" label="导入 JSON" onPress={importConnections} />
            <SecondaryButton icon="clipboard-outline" label="粘贴导入" onPress={handlePasteImport} disabled={!jsonPaste.trim()} />
          </View>
          <TextInput
            style={[styles.input, styles.jsonPasteInput]}
            multiline
            value={jsonPaste}
            onChangeText={setJsonPaste}
            placeholder={`[\n  {\n    "name": "My Hermes",\n    "baseUrl": "http://...",\n    "apiKey": "...",\n    "profile": { "publicPersona": "公开人格摘要", "strengths": ["擅长领域"] }\n  }\n]`}
            autoCapitalize="none"
            textAlignVertical="top"
          />
        </View>

        <Text style={styles.sectionTitle}>连接列表</Text>
        <View style={styles.healthPanel}>
          <View style={styles.healthPanelHeader}>
            <View>
              <Text style={styles.healthTitle}>连接健康</Text>
              <Text style={styles.help}>延迟、模型列表和最近错误会记录在这里。</Text>
            </View>
            <SecondaryButton
              icon="pulse-outline"
              label={healthSummary.checking > 0 ? '检查中...' : '刷新全部'}
              onPress={() => refreshConnectionHealth(true)}
              disabled={healthSummary.checking > 0}
            />
          </View>
          <View style={styles.healthMetricRow}>
            <HealthMetric label="可用" value={healthSummary.ok} tone="ok" />
            <HealthMetric label="失败" value={healthSummary.error} tone="error" />
            <HealthMetric label="检查中" value={healthSummary.checking} tone="checking" />
            <HealthMetric label="未知" value={healthSummary.unknown} tone="unknown" />
          </View>
        </View>
        {connections.length === 0 ? <Text style={styles.muted}>暂无连接。</Text> : null}
        {connections.map((connection) => {
          const editing = editingConnectionId === connection.id;
          return (
            <View key={connection.id} style={styles.card}>
              {editing ? (
                <View style={styles.editPanel}>
                  <Text style={styles.cardTitle}>编辑连接</Text>
                  <TextInput
                    style={styles.input}
                    value={connectionEditForm.name}
                    onChangeText={(name) => setConnectionEditForm((current) => ({ ...current, name }))}
                    placeholder="连接名称"
                  />
                  <TextInput
                    style={styles.input}
                    value={connectionEditForm.baseUrl}
                    onChangeText={(baseUrl) => setConnectionEditForm((current) => ({ ...current, baseUrl }))}
                    placeholder="Hermes API 地址"
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                  <TextInput
                    style={styles.input}
                    value={connectionEditForm.apiKey}
                    onChangeText={(apiKey) => setConnectionEditForm((current) => ({ ...current, apiKey }))}
                    placeholder="API Key，可留空"
                    autoCapitalize="none"
                    secureTextEntry
                  />
                  <TextInput
                    style={styles.input}
                    value={connectionEditForm.model}
                    onChangeText={(model) => setConnectionEditForm((current) => ({ ...current, model }))}
                    placeholder="模型名"
                    autoCapitalize="none"
                  />
                  <View style={styles.buttonRow}>
                    <PrimaryButton icon="save-outline" label="保存" onPress={() => saveConnectionEdit(connection)} />
                    <SecondaryButton icon="close-outline" label="取消" onPress={cancelEditConnection} />
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.connectionHeader}>
                    <AgentAvatar alias={connection.name} size={42} imageUri={connection.avatarUri} />
                    <View style={styles.rowMain}>
                      <Text style={styles.cardTitle}>{connection.name}</Text>
                      <Text style={styles.muted}>{connection.baseUrl}</Text>
                      <Text style={styles.help}>模型：{connection.model}</Text>
                    </View>
                    <View style={styles.connectionBadges}>
                      <Text style={[styles.badge, connection.enabled ? styles.badgeOn : styles.badgeOff]}>
                        {connection.enabled ? '启用' : '停用'}
                      </Text>
                      <HealthBadge health={connectionHealth[connection.id]} />
                    </View>
                  </View>
                  <ConnectionHealthDetails health={connectionHealth[connection.id]} />
                  <ConnectionProfileCard profile={connection.profile} />
                  <View style={styles.buttonRow}>
                    <SecondaryButton icon={connection.enabled ? 'pause-circle-outline' : 'play-circle-outline'} label={connection.enabled ? '停用' : '启用'} onPress={() => toggleConnection(connection.id)} />
                    <SecondaryButton icon="create-outline" label="编辑" onPress={() => beginEditConnection(connection)} />
                    <SecondaryButton icon="image-outline" label="换头像" onPress={() => chooseConnectionAvatar(connection)} />
                    {connection.avatarUri ? <SecondaryButton icon="close-circle-outline" label="清除头像" onPress={() => clearConnectionAvatar(connection)} /> : null}
                    <SecondaryButton
                      icon="pulse-outline"
                      label={testingConnectionId === connection.id ? '测试中...' : '测试'}
                      onPress={() => testConnection(connection)}
                      disabled={testingConnectionId === connection.id}
                    />
                    <SecondaryButton
                      icon="sparkles-outline"
                      label={profilingConnectionId === connection.id ? '生成中...' : connection.profile ? '更新协作卡片' : '生成协作卡片'}
                      onPress={() => refreshAgentProfile(connection)}
                      disabled={profilingConnectionId === connection.id}
                    />
                    <SecondaryButton icon="chatbubble-outline" label="单聊" onPress={() => createDirectRoom(connection)} disabled={!connection.enabled} />
                    <SecondaryButton icon="trash-outline" label="删除" onPress={() => deleteConnection(connection)} />
                  </View>
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  }
}

function getDelegationTaskStatusStyle(status: DelegationTask['status']) {
  if (status === 'done') return styles.diagnosticLevelSuccess;
  if (status === 'running' || status === 'pending') return styles.diagnosticLevelWarning;
  if (status === 'error') return styles.diagnosticLevelError;
  return styles.diagnosticLevelInfo;
}

function getGoalStatusLabel(status: GoalSession['status'], signal?: GoalStatusSignal): string {
  if (status === 'awaiting_user') return signal === 'blocked' ? '等待确认：受阻' : '等待确认：已完成';
  if (status === 'done') return '已结束';
  if (status === 'blocked') return '已受阻';
  if (status === 'reviewing') return '复盘中';
  if (status === 'running') return '推进中';
  if (status === 'planning') return '规划中';
  return '已取消';
}

function getGoalPlanItemStatusLabel(status: GoalSession['planItems'][number]['status']): string {
  if (status === 'done') return '完成';
  if (status === 'running') return '进行中';
  if (status === 'blocked') return '受阻';
  return '待办';
}

function getGoalPlanItemStatusStyle(status: GoalSession['planItems'][number]['status']) {
  if (status === 'done') return styles.diagnosticLevelSuccess;
  if (status === 'running' || status === 'todo') return styles.diagnosticLevelWarning;
  if (status === 'blocked') return styles.diagnosticLevelError;
  return styles.diagnosticLevelInfo;
}

function getDiagnosticLevelStyle(level: DiagnosticLogEntry['level']) {
  if (level === 'success') return styles.diagnosticLevelSuccess;
  if (level === 'warning') return styles.diagnosticLevelWarning;
  if (level === 'error') return styles.diagnosticLevelError;
  return styles.diagnosticLevelInfo;
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#f5f7fb',
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f5f7fb',
  },
  replyIsland: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 10 : 10,
    left: '50%',
    zIndex: 50,
    width: 460,
    maxWidth: '80%',
    marginLeft: -230,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: '#111827',
    shadowColor: '#111827',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  replyIslandCompact: {
    left: 16,
    right: 16,
    width: 'auto',
    maxWidth: 'auto',
    marginLeft: 0,
  },
  replyIslandDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
  },
  replyIslandTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  replyIslandTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  replyIslandPreview: {
    marginTop: 1,
    color: '#cbd5e1',
    fontSize: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  brandBlock: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    color: '#6b7280',
  },
  headerStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  statPillAccent: {
    borderColor: '#a7f3d0',
    backgroundColor: '#ecfdf5',
  },
  statText: {
    color: '#1f2937',
    fontSize: 12,
    fontWeight: '800',
  },
  statTextAccent: {
    color: '#065f46',
  },
  unreadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  unreadPillText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '800',
  },
  tabsScroll: {
    flexGrow: 0,
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  runtimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  runtimeBannerOffline: {
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
  },
  runtimeBannerTextBlock: {
    flex: 1,
    gap: 2,
  },
  runtimeBannerTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  runtimeBannerBody: {
    color: '#4b5563',
    fontSize: 12,
    lineHeight: 18,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  tabActive: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  tabText: {
    color: '#4b5563',
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  chatDesktop: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  chatSidebar: {
    width: 280,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sidebarTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  sidebarIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  sidebarRooms: {
    flex: 1,
  },
  sidebarRoomsContent: {
    padding: 8,
    gap: 8,
  },
  sidebarRoom: {
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  sidebarRoomActive: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  sidebarRoomTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sidebarRoomTitle: {
    flex: 1,
    color: '#111827',
    fontWeight: '800',
  },
  sidebarRoomTitleActive: {
    color: '#1d4ed8',
  },
  sidebarRoomMeta: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '800',
  },
  sidebarUnreadBadge: {
    overflow: 'hidden',
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    color: '#ffffff',
    backgroundColor: '#dc2626',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  sidebarRoomPreview: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 17,
  },
  chatMain: {
    flex: 1,
    minWidth: 0,
  },
  collabDrawer: {
    width: 310,
    minWidth: 290,
    maxWidth: 340,
    marginRight: 20,
    marginBottom: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  collabDrawerScroll: {
    flex: 1,
  },
  collabDrawerContent: {
    gap: 10,
    padding: 12,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  drawerTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
  },
  panel: {
    padding: 20,
    gap: 12,
  },
  roomRail: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  roomRailContent: {
    alignItems: 'center',
    gap: 8,
  },
  roomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  roomPillActive: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  roomPillText: {
    color: '#4b5563',
    fontWeight: '700',
  },
  roomPillTextActive: {
    color: '#fff',
  },
  roomUnreadBadge: {
    overflow: 'hidden',
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    color: '#ffffff',
    backgroundColor: '#dc2626',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  roomCreatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  roomCreateText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '800',
  },
  chatHeader: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    gap: 10,
  },
  roomDetailsScroll: {
    flexGrow: 0,
  },
  roomDetailsContent: {
    gap: 10,
    paddingBottom: 4,
  },
  roomHeaderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomTitleBlock: {
    gap: 2,
  },
  roomTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  roomSummary: {
    color: '#6b7280',
    fontSize: 12,
  },
  roomStatusBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  goalPanel: {
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#f8fbff',
  },
  goalPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  goalTitle: {
    color: '#1d4ed8',
    fontWeight: '900',
  },
  goalMeta: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  goalActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  goalPlanList: {
    gap: 8,
  },
  goalPlanItem: {
    gap: 5,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#ffffff',
  },
  goalAcceptance: {
    color: '#1e40af',
    fontSize: 12,
    lineHeight: 18,
  },
  goalReview: {
    color: '#374151',
    fontSize: 12,
    lineHeight: 18,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
  },
  statusToken: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
  },
  statusTokenDefault: {
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  statusTokenRp: {
    borderColor: '#ddd6fe',
    backgroundColor: '#f5f3ff',
  },
  statusTokenMemory: {
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
  },
  statusTokenWarning: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  statusTokenText: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusTokenTextDefault: {
    color: '#1d4ed8',
  },
  statusTokenTextRp: {
    color: '#6d28d9',
  },
  statusTokenTextMemory: {
    color: '#0f766e',
  },
  statusTokenTextWarning: {
    color: '#92400e',
  },
  rpSceneCard: {
    gap: 7,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    backgroundColor: '#faf5ff',
  },
  rpSceneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rpSceneTitle: {
    color: '#581c87',
    fontWeight: '900',
  },
  rpSceneBadge: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    color: '#6d28d9',
    backgroundColor: '#ede9fe',
    fontSize: 11,
    fontWeight: '800',
  },
  rpSceneTone: {
    color: '#7c3aed',
    fontSize: 12,
    fontWeight: '800',
  },
  rpSceneBody: {
    color: '#4c1d95',
    fontSize: 13,
    lineHeight: 20,
  },
  memberChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  memberChipSelected: {
    backgroundColor: '#111827',
  },
  memberChipDisabled: {
    opacity: 0.45,
  },
  agentBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  agentAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  agentAvatarText: {
    fontWeight: '900',
  },
  agentStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  memberChipText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
  },
  memberChipTextSelected: {
    color: '#ffffff',
  },
  memberChipTextDisabled: {
    color: '#9ca3af',
  },
  quickPanel: {
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  panelLabel: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '800',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickCommand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 150,
    flexGrow: 1,
    padding: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  quickCommandDisabled: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  quickCommandTextBlock: {
    flex: 1,
    gap: 2,
  },
  quickCommandTitle: {
    color: '#111827',
    fontWeight: '700',
  },
  quickCommandTitleDisabled: {
    color: '#9ca3af',
  },
  quickCommandTarget: {
    color: '#6b7280',
    fontSize: 12,
  },
  toolsPanel: {
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  toolMetricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolMetric: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  toolMetricValue: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  toolMetricLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  contextControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  stepper: {
    flexDirection: 'row',
    gap: 8,
  },
  toolActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomEditPanel: {
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  inlineFormRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineInput: {
    flex: 1,
  },
  memberEditorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberAliasInput: {
    flex: 1,
    minHeight: 38,
  },
  squareHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  squareCount: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    fontSize: 12,
    fontWeight: '800',
  },
  syncPanel: {
    gap: 10,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  diagnosticPanel: {
    gap: 10,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#f8fbff',
  },
  conflictPanel: {
    gap: 10,
    marginTop: 2,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
  },
  conflictHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  conflictWarning: {
    color: '#9a3412',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  conflictList: {
    gap: 8,
  },
  conflictItem: {
    gap: 3,
    padding: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#ffffff',
  },
  conflictItemTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  conflictItemMeta: {
    color: '#9a3412',
    fontSize: 12,
    fontWeight: '700',
  },
  diagnosticList: {
    gap: 8,
  },
  diagnosticItem: {
    gap: 5,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  diagnosticHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  diagnosticLevel: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '800',
  },
  diagnosticLevelInfo: {
    color: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  diagnosticLevelSuccess: {
    color: '#166534',
    backgroundColor: '#dcfce7',
  },
  diagnosticLevelWarning: {
    color: '#92400e',
    backgroundColor: '#fef3c7',
  },
  diagnosticLevelError: {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
  },
  diagnosticMessage: {
    color: '#374151',
    fontSize: 12,
    lineHeight: 18,
  },
  syncHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  syncHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  syncToggle: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  syncToggleOn: {
    backgroundColor: '#dcfce7',
  },
  syncToggleText: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '800',
  },
  syncToggleTextOn: {
    color: '#166534',
  },
  syncMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  squareEvent: {
    gap: 8,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  squareEventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  squareEventSource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  squareEventTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  squareEventMeta: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  messages: {
    flex: 1,
    paddingHorizontal: 20,
  },
  messagesContent: {
    gap: 10,
    paddingBottom: 18,
  },
  messageBubble: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  userMessage: {
    alignSelf: 'flex-end',
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  systemMessage: {
    alignSelf: 'center',
    maxWidth: '100%',
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  agentMessage: {
    borderColor: '#e0e7ff',
    backgroundColor: '#ffffff',
  },
  delegatedMessage: {
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
  },
  gmMessage: {
    borderColor: '#ddd6fe',
    backgroundColor: '#faf5ff',
  },
  rpCharacterMessage: {
    borderColor: '#fbcfe8',
    backgroundColor: '#fff1f2',
  },
  delegationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    alignSelf: 'flex-start',
  },
  delegationText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  messageBubbleWide: {
    maxWidth: 760,
  },
  messageMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  authorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  messageRoleBadge: {
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    color: '#4b5563',
    backgroundColor: '#f3f4f6',
    fontSize: 10,
    fontWeight: '900',
  },
  author: {
    color: '#111827',
    fontWeight: '800',
  },
  status: {
    flexShrink: 1,
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'right',
  },
  statusError: {
    color: '#b91c1c',
  },
  messageText: {
    color: '#1f2937',
    lineHeight: 22,
  },
  markdown: {
    gap: 8,
  },
  markdownText: {
    color: '#1f2937',
    lineHeight: 22,
  },
  markdownHeading: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  markdownListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  markdownBullet: {
    minWidth: 18,
    color: '#4b5563',
    fontWeight: '800',
    lineHeight: 22,
  },
  markdownListText: {
    flex: 1,
  },
  markdownQuote: {
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#bfdbfe',
  },
  markdownCodeBlock: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  markdownCodeText: {
    color: '#e5e7eb',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  markdownTable: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  markdownTableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  markdownTableHeader: {
    borderTopWidth: 0,
    backgroundColor: '#f9fafb',
  },
  markdownTableCell: {
    flex: 1,
    minWidth: 80,
    paddingHorizontal: 8,
    paddingVertical: 7,
    color: '#1f2937',
    fontSize: 12,
    lineHeight: 18,
  },
  inlineCode: {
    borderRadius: 4,
    backgroundColor: '#eef2ff',
    color: '#3730a3',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  inlineBold: {
    fontWeight: '800',
    color: '#111827',
  },
  streamingLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streamingText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  messageActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 8,
  },
  attachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 320,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccfbf1',
    backgroundColor: '#f0fdfa',
  },
  attachmentThumb: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#ccfbf1',
  },
  attachmentIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#ccfbf1',
  },
  attachmentInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  attachmentName: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },
  attachmentSummary: {
    color: '#0f766e',
    fontSize: 11,
    lineHeight: 15,
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f0fdfa',
  },
  attachmentText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '700',
  },
  composer: {
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  mentionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mentionHint: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '800',
  },
  mentionList: {
    gap: 6,
  },
  mentionChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  mentionChipSelected: {
    backgroundColor: '#111827',
  },
  mentionChipDisabled: {
    opacity: 0.45,
  },
  mentionChipText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
  },
  mentionChipTextSelected: {
    color: '#ffffff',
  },
  searchPanel: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  searchInput: {
    flex: 1,
    minHeight: 38,
    color: '#111827',
  },
  searchResults: {
    gap: 8,
  },
  searchResult: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  searchResultActive: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  searchResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  searchResultTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  searchResultMeta: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  searchResultSnippet: {
    color: '#4b5563',
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  importSection: {
    gap: 8,
    marginTop: 4,
  },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editPanel: {
    gap: 8,
  },
  jsonPasteInput: {
    minHeight: 120,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
  },
  modeShortcutList: {
    gap: 6,
    paddingRight: 4,
  },
  modeShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  modeShortcutActive: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  modeShortcutText: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '700',
  },
  modeShortcutTextActive: {
    color: '#ffffff',
  },
  slashPanel: {
    gap: 8,
    padding: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  slashCommandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  slashCommandIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  slashCommandTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  pendingAttachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pendingAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f0fdfa',
  },
  pendingAttachmentText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '700',
  },
  composerInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  iconButtonPrimary: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 128,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
    color: '#111827',
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: {
    color: '#374151',
    fontWeight: '700',
  },
  miniButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  miniButtonText: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.45,
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  card: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rowMain: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 16,
  },
  muted: {
    color: '#6b7280',
  },
  help: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 18,
  },
  hint: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fffbeb',
  },
  healthPanel: {
    gap: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  healthPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  healthTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  healthMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  healthMetric: {
    flex: 1,
    minWidth: 86,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  healthMetricOk: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  healthMetricError: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  healthMetricChecking: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  healthMetricUnknown: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  healthMetricValue: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  healthMetricLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  connectionBadges: {
    alignItems: 'flex-end',
    gap: 6,
  },
  badge: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
  },
  badgeOn: {
    color: '#166534',
    backgroundColor: '#dcfce7',
  },
  badgeOff: {
    color: '#7f1d1d',
    backgroundColor: '#fee2e2',
  },
  healthBadgeOk: {
    color: '#166534',
    backgroundColor: '#dcfce7',
  },
  healthBadgeError: {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
  },
  healthBadgeChecking: {
    color: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  healthBadgeUnknown: {
    color: '#4b5563',
    backgroundColor: '#f3f4f6',
  },
  profileCard: {
    gap: 7,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  profileCardEmpty: {
    gap: 5,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  profileTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  profileUpdated: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
  },
  profilePersona: {
    color: '#1e3a8a',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  profileLine: {
    gap: 2,
  },
  profileLabel: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
  },
  profileText: {
    color: '#1f2937',
    fontSize: 12,
    lineHeight: 18,
  },
  healthDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  healthDetailText: {
    color: '#1f2937',
    fontSize: 12,
    fontWeight: '700',
  },
  healthCheckedAt: {
    color: '#6b7280',
    fontSize: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  collabPanel: {
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#f8fbff',
  },
  collabPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryBox: {
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    backgroundColor: '#f5f3ff',
  },
  summaryTitle: {
    color: '#5b21b6',
    fontSize: 12,
    fontWeight: '800',
  },
  taskList: {
    gap: 8,
  },
  taskCard: {
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  taskTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  timelineList: {
    gap: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  timelineItemLarge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  timelineBody: {
    flex: 1,
    gap: 2,
  },
  timelineTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  timelineMeta: {
    color: '#6b7280',
    fontSize: 11,
    lineHeight: 16,
  },
  emptyState: {
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 440,
    gap: 10,
    paddingVertical: 34,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyBody: {
    color: '#6b7280',
    lineHeight: 20,
    textAlign: 'center',
  },


  storageInfoBox: {
    gap: 5,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  storageInfoTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  storageInfoText: {
    color: '#4b5563',
    fontSize: 12,
    lineHeight: 18,
  },
  storageInfoPath: {
    color: '#6b7280',
    fontSize: 11,
    fontFamily: Platform.select({ web: 'monospace', default: undefined }),
  },
  onboardingPanel: {
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  onboardingStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  onboardingIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    color: '#1d4ed8',
    backgroundColor: '#dbeafe',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '900',
  },
  onboardingIndexDone: {
    color: '#166534',
    backgroundColor: '#dcfce7',
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  templateCard: {
    flexGrow: 1,
    flexBasis: 220,
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#f8fbff',
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomModeCard: {
    flexGrow: 1,
    flexBasis: 132,
    minHeight: 92,
    gap: 6,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  roomModeCardActive: {
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
  },
  roomModeTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  roomModeTitleActive: {
    color: '#5b21b6',
  },
  roomModeDescription: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 17,
  },
  roomModeDescriptionActive: {
    color: '#4c1d95',
  },
  archiveCard: {
    gap: 7,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    backgroundColor: '#faf5ff',
  },
  buttonRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  taskBoardRow: {
    gap: 10,
    paddingVertical: 4,
  },
  taskBoardColumn: {
    width: 210,
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  taskBoardTitle: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
  },
  taskBoardItem: {
    gap: 4,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  drawerTaskColumn: {
    gap: 5,
    padding: 9,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  relationCard: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#ffffff',
  },
  relationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  relationArrow: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '900',
  },
  rpSceneArchive: {
    color: '#6d28d9',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
});
