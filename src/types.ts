export type HermesRole = 'system' | 'user' | 'assistant';

export interface HermesConnection {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoomMember {
  connectionId: string;
  alias: string;
  enabled: boolean;
}

export interface Room {
  id: string;
  name: string;
  kind: 'direct' | 'group';
  members: RoomMember[];
  sessionIds: Record<string, string>;
  sessionKey: string;
  createdAt: string;
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

export interface ChatMessage {
  id: string;
  roomId: string;
  role: HermesRole;
  authorId: 'user' | string;
  authorName: string;
  content: string;
  attachments?: Attachment[];
  status: ChatMessageStatus;
  error?: string;
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
  strippedText: string;
  reason: 'direct' | 'mentions' | 'all' | 'none';
}
