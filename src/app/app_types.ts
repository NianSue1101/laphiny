import type {
  AgentProfileVersion,
  Attachment,
  ChatMessage,
  CollaborationEvent,
  DelegationTask,
  Room,
  RoomMember,
  SquareEvent,
  TeamTemplate,
} from '../types';
import type { GoalModeCommand } from '../lib/goal_mode';

export type Tab = 'chat' | 'connections' | 'rooms' | 'square' | 'settings';
export type IconName = string;

export type QuickCommand = {
  id: string;
  label: string;
  icon: IconName;
  targetAlias: string;
  prompt: string;
};

export type ScheduledReply = {
  member: RoomMember;
  text: string;
  attachments: Attachment[];
  depth: number;
  delegatedFrom?: string;
  delegatedFromConnectionId?: string;
  delegatorMessage?: string;
  taskId?: string;
  delegationAttemptId?: string;
  goalMode?: GoalModeCommand;
  goalReviewRound?: number;
  retryOfMessageId?: string;
};

export type ConnectionFormState = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type MessageSearchResult = {
  room: Room;
  message: ChatMessage;
  snippet: string;
};

export type StorageBackendInfo = {
  secretBackend: string;
  durableBackend: string;
  durableDirectory?: string;
};

export type PWAInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type ServiceWorkerStatus = 'unsupported' | 'registering' | 'registered' | 'failed';

export type ConnectionHealth = {
  status: 'unknown' | 'checking' | 'ok' | 'error';
  latencyMs?: number;
  modelsCount?: number;
  checkedAt?: string;
  error?: string;
};

export type RestoreCollections = {
  collaborationEvents?: CollaborationEvent[];
  delegationTasks?: DelegationTask[];
  teamTemplates?: TeamTemplate[];
  profileVersions?: AgentProfileVersion[];
  squareEvents?: SquareEvent[];
};
