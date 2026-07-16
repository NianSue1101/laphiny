export type HermesRole = 'system' | 'user' | 'assistant';

export interface AgentProfile {
  soulName?: string;
  publicPersona?: string;
  personality?: string;
  strengths: string[];
  delegateWhen: string[];
  avoidWhen: string[];
  collaborationStyle?: string;
  source?: 'self-report' | 'manual' | 'import';
  updatedAt?: string;
}


export interface AgentProfileVersion {
  id: string;
  connectionId: string;
  connectionName: string;
  profile: AgentProfile;
  note?: string;
  createdAt: string;
}

export interface HermesConnection {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  avatarUri?: string;
  profile?: AgentProfile;
  toolDelegation?: {
    supported: boolean;
    checkedAt: string;
    reason?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type AppThemeMode = 'light' | 'dark';
export type AppFontFamily = 'system' | 'lxgw-wenkai';

export interface AppPreferences {
  themeMode: AppThemeMode;
  fontFamily: AppFontFamily;
  /** Show reasoning supplied explicitly by a compatible Hermes endpoint. */
  showReasoning?: boolean;
  /** Include month/day in chat message timestamps. */
  showMessageDate?: boolean;
  /** Permission keys explicitly approved for future use, scoped to one Agent connection. */
  alwaysApprovedPermissionKeys?: string[];
  downloadDirectoryUri?: string;
  downloadDirectoryLabel?: string;
  updatedAt: string;
}

export interface FeedbackConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  updatedAt: string;
}

export interface FeedbackLogEntry {
  id: string;
  source: string;
  appVersion?: string;
  platform?: string;
  summary?: string;
  diagnostics: unknown;
  createdAt: string;
}

export interface RoomMember {
  connectionId: string;
  alias: string;
  enabled: boolean;
}




export type RoomModeId = 'studio' | 'council' | 'review' | 'tabletop' | 'daily';

export interface RoleplayArchive {
  id: string;
  title: string;
  chapter: number;
  world: string;
  currentQuest: string;
  playerCharacter: string;
  npcs: string[];
  locations: string[];
  items: string[];
  clues: string[];
  mysteries: string[];
  playerChoices: string[];
  gmNotes?: string;
  version: number;
  updatedAt: string;
}

export interface RoleplayConfig {
  enabled: boolean;
  gmConnectionId?: string;
  playerName: string;
  genre: string;
  tone: string;
  premise: string;
  currentScene?: string;
  includeAllAgents: boolean;
  archive?: RoleplayArchive;
  updatedAt: string;
}



export interface RoleplaySession {
  id: string;
  enabled: boolean;
  title: string;
  genre: string;
  gmConnectionId: string;
  gmAlias: string;
  playerName: string;
  scene: string;
  tone: string;
  tableRules: string[];
  chapter: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomMemoryCapsule {
  id: string;
  roomId: string;
  goal: string;
  decisions: string[];
  todos: string[];
  preferences: string[];
  openQuestions: string[];
  handoffNotes?: string;
  source: 'agent-generated' | 'manual' | 'import';
  authorName?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomKnowledgeItem {
  id: string;
  title: string;
  body: string;
  tags: string[];
  source: 'manual' | 'memory' | 'summary' | 'import';
  createdAt: string;
  updatedAt: string;
}

export type RoomBlackboardItemStatus = 'open' | 'pinned' | 'resolved';

export interface RoomBlackboardItem {
  id: string;
  text: string;
  authorName: string;
  status: RoomBlackboardItemStatus;
  createdAt: string;
  updatedAt: string;
}

export type RoomDecisionRecordStatus = 'active' | 'superseded';

export interface RoomDecisionRecord {
  id: string;
  title: string;
  rationale?: string;
  ownerName?: string;
  source: 'manual' | 'memory' | 'summary' | 'goal';
  status: RoomDecisionRecordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RoomSummary {
  id: string;
  roomId: string;
  authorConnectionId?: string;
  authorName: string;
  content: string;
  sourceMessageCount: number;
  createdAt: string;
}

export type GoalSessionStatus = 'planning' | 'running' | 'reviewing' | 'adjusting' | 'awaiting_user' | 'done' | 'blocked' | 'cancelled';
export type GoalPlanItemStatus = 'todo' | 'running' | 'done' | 'blocked';
export type GoalStatusSignal = 'done' | 'continue' | 'blocked';
export type GoalAcceptanceStatus = 'pending' | 'passed' | 'failed';

export interface GoalAcceptanceCriterion {
  id: string;
  text: string;
  status: GoalAcceptanceStatus;
  evidenceIds: string[];
  updatedAt: string;
}

export interface GoalEvidence {
  id: string;
  kind: 'message' | 'delegation' | 'artifact' | 'test' | 'review';
  summary: string;
  messageId?: string;
  taskId?: string;
  planItemIds: string[];
  createdAt: string;
}

export interface GoalReviewRecord {
  id: string;
  round: number;
  signal?: GoalStatusSignal;
  conclusion: string;
  nextStatus: GoalSessionStatus;
  evidenceIds: string[];
  createdAt: string;
}

export interface GoalPlanItem {
  id: string;
  title: string;
  ownerAlias?: string;
  ownerConnectionId?: string;
  reason?: string;
  input?: string;
  deliverable?: string;
  acceptance?: string;
  dependencyIds?: string[];
  evidenceIds?: string[];
  attempts?: number;
  status: GoalPlanItemStatus;
  taskId?: string;
  updatedAt: string;
}

export interface GoalSession {
  id: string;
  roomId: string;
  goal: string;
  leadConnectionId: string;
  leadAlias: string;
  round: number;
  status: GoalSessionStatus;
  statusSignal?: GoalStatusSignal;
  planItems: GoalPlanItem[];
  acceptanceCriteria: GoalAcceptanceCriterion[];
  evidence: GoalEvidence[];
  reviewHistory: GoalReviewRecord[];
  nextAction?: string;
  blockedReason?: string;
  maxRounds: number;
  noProgressRounds: number;
  progressFingerprint?: string;
  lastReview?: string;
  lastMessageId?: string;
  userDecision?: 'continue' | 'finish' | 'adjust';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Room {
  id: string;
  name: string;
  kind: 'direct' | 'group';
  members: RoomMember[];
  sessionIds: Record<string, string>;
  sessionKey: string;
  memberSessionKeys?: Record<string, string>;
  contextLimit?: number;
  mode?: RoomModeId;
  defaultCollaborationMode?: 'manual' | 'parallel' | 'sequential';
  summaryConnectionId?: string;
  autoDelegationEnabled?: boolean;
  agentToolDelegationEnabled?: boolean;
  maxDelegationDepth?: number;
  lastSummary?: RoomSummary;
  memoryCapsule?: RoomMemoryCapsule;
  pendingMemoryCapsule?: RoomMemoryCapsule;
  knowledgeBase?: RoomKnowledgeItem[];
  blackboardItems?: RoomBlackboardItem[];
  decisionRecords?: RoomDecisionRecord[];
  activeGoal?: GoalSession;
  roleplay?: RoleplayConfig;
  roleplaySession?: RoleplaySession;
  createdAt: string;
  updatedAt: string;
}


export type DiagnosticLogLevel = 'info' | 'success' | 'warning' | 'error';

export interface DiagnosticLogEntry {
  id: string;
  level: DiagnosticLogLevel;
  category: 'chat' | 'connection' | 'sync' | 'profile' | 'storage' | 'system';
  title: string;
  message?: string;
  roomId?: string;
  roomName?: string;
  connectionId?: string;
  connectionName?: string;
  requestId?: string;
  durationMs?: number;
  meta?: Record<string, string | number | boolean | null | undefined>;
  createdAt: string;
}

export interface SyncConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  lastPulledAt?: string;
  lastPushedAt?: string;
  lastEventPulledAt?: string;
  updatedAt: string;
}

export type SquareEventKind = 'message' | 'system' | 'task' | 'health' | 'collaboration' | 'summary';

export interface SquareEvent {
  id: string;
  kind: SquareEventKind;
  source: string;
  target?: string;
  roomId?: string;
  roomName?: string;
  title: string;
  body: string;
  createdAt: string;
}


export type CollaborationEventKind = 'user_message' | 'agent_reply_started' | 'agent_reply_completed' | 'delegation_created' | 'delegation_started' | 'delegation_completed' | 'summary_created' | 'template_applied' | 'ritual_started' | 'ritual_completed' | 'memory_updated' | 'roleplay_started' | 'roleplay_updated';

export interface CollaborationEvent {
  id: string;
  kind: CollaborationEventKind;
  roomId: string;
  roomName: string;
  source?: string;
  target?: string;
  taskId?: string;
  messageId?: string;
  title: string;
  body?: string;
  createdAt: string;
}

export type DelegationTaskStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled';

export interface DelegationTask {
  id: string;
  roomId: string;
  roomName: string;
  fromConnectionId: string;
  fromAlias: string;
  toConnectionId: string;
  toAlias: string;
  taskText: string;
  status: DelegationTaskStatus;
  depth: number;
  category?: 'delegation' | 'project' | 'roleplay-main' | 'roleplay-side';
  priority?: 'low' | 'normal' | 'high';
  dueAt?: string;
  tags?: string[];
  sourceMessageId?: string;
  resultMessageId?: string;
  goalId?: string;
  planItemId?: string;
  input?: string;
  deliverable?: string;
  acceptance?: string;
  evidence?: string[];
  attempts?: number;
  reassignedFromTaskId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TeamTemplate {
  id: string;
  name: string;
  description?: string;
  memberOrder: string[];
  defaultMode: 'manual' | 'parallel' | 'sequential';
  summaryConnectionId?: string;
  autoDelegationEnabled: boolean;
  maxDelegationDepth: number;
  createdAt: string;
  updatedAt: string;
}

export interface SyncSnapshot {
  connections: HermesConnection[];
  rooms: Room[];
  messagesByRoom: Record<string, ChatMessage[]>;
  squareEvents: SquareEvent[];
  collaborationEvents?: CollaborationEvent[];
  delegationTasks?: DelegationTask[];
  teamTemplates?: TeamTemplate[];
  profileVersions?: AgentProfileVersion[];
  updatedAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  uri?: string;
  dataUrl?: string;
  text?: string;
  kind: 'image' | 'text' | 'file';
}

export type ChatMessageStatus = 'local' | 'queued' | 'running' | 'sent' | 'stopped' | 'error';
export type AgentStreamPhase = 'queued' | 'connecting' | 'thinking' | 'responding' | 'delegating' | 'reviewing' | 'completed' | 'cancelled' | 'failed';
export type AgentStreamEventKind = 'status' | 'content' | 'reasoning' | 'delegation' | 'review' | 'terminal';

export interface AgentActivityNotice {
  id: string;
  kind: 'tool' | 'system';
  label: string;
  status: 'running' | 'completed' | 'failed' | 'info';
  tool?: string;
  createdAt: string;
}

export interface AgentStreamEvent {
  id: string;
  messageId: string;
  roomId: string;
  connectionId: string;
  phase: AgentStreamPhase;
  kind: AgentStreamEventKind;
  sequence: number;
  content?: string;
  reasoning?: string;
  error?: string;
  createdAt: string;
}

export interface AgentStreamState {
  messageId: string;
  roomId: string;
  connectionId: string;
  phase: AgentStreamPhase;
  sequence: number;
  content: string;
  reasoning?: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type AgentPermissionDecision = 'allow' | 'deny' | 'always';
export type AgentPermissionStatus = 'pending' | 'allowed' | 'denied' | 'always';

export interface AgentPermissionRequest {
  id: string;
  key: string;
  title: string;
  body: string;
  action?: string;
  reason?: string;
  status: AgentPermissionStatus;
  decision?: AgentPermissionDecision;
  createdAt: string;
  decidedAt?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  role: HermesRole;
  authorId: 'user' | string;
  authorName: string;
  content: string;
  reasoning?: string;
  activityNotices?: AgentActivityNotice[];
  streamPhase?: AgentStreamPhase;
  streamUpdatedAt?: string;
  retryOfMessageId?: string;
  attachments?: Attachment[];
  permissionRequest?: AgentPermissionRequest;
  status: ChatMessageStatus;
  error?: string;
  delegatedFrom?: string;
  delegationTaskId?: string;
  createdAt: string;
}

export interface HermesHealthResponse {
  status: string;
  [key: string]: unknown;
}

export interface HermesModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export interface HermesModelsResponse {
  object?: string;
  data: HermesModel[];
}

export interface ChatContentTextPart {
  type: 'text';
  text: string;
}

export interface ChatContentImagePart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export type ChatContentPart = ChatContentTextPart | ChatContentImagePart;

export interface HermesChatMessage {
  role: HermesRole;
  content: string | ChatContentPart[];
}

export interface HermesChatCompletionRequest {
  model: string;
  messages: HermesChatMessage[];
  stream?: boolean;
}

export interface HermesChatCompletionResponse {
  id?: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface TargetResolution {
  targets: RoomMember[];
  mentions: string[];
  ambiguousMentions?: Array<{ mention: string; candidateConnectionIds: string[] }>;
  strippedText: string;
  reason: 'direct' | 'mentions' | 'all' | 'all-seq' | 'ambiguous' | 'none';
}
