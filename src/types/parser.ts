// Parser types for JSONL events

export interface RawEvent {
  type: string;
  parentUuid?: string;
  uuid: string;
  sessionId: string;
  timestamp: string;
  cwd: string;
  gitBranch: string;
  version: string;
  slug: string;
  agentId?: string;
  isSidechain: boolean;
  userType: string;

  // Assistant-specific
  message?: AssistantMessage;
  requestId?: string;
  isApiErrorMessage?: boolean;
  error?: string;

  // User-specific (tool results)
  toolUseResult?: any;
  sourceToolAssistantUUID?: string;

  // Progress-specific
  data?: any;

  // System-specific
  subtype?: string;
  durationMs?: number;

  // File history snapshot
  snapshot?: any;
  isSnapshotUpdate?: boolean;
  messageId?: string;

  // Queue operation
  operation?: string;
}

export interface AssistantMessage {
  model: string;
  id: string;
  type: string;
  role: string;
  content: ContentBlock[];
  stop_reason?: string;
  usage?: UsageInfo;
}

export interface ContentBlock {
  type: string;

  // thinking
  thinking?: string;
  signature?: string;

  // text
  text?: string;

  // tool_use
  id?: string;
  name?: string;
  input?: any;

  // tool_result
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface ProgressData {
  type: string;
  output?: string;
  message?: any;
  prompt?: string;
}

export interface ToolUseResultRead {
  type: string;
  file?: {
    filePath: string;
    numLines: number;
    totalLines: number;
  };
}

export interface ToolUseResultBash {
  stdout: string;
  stderr: string;
  interrupted: boolean;
}

export interface ToolUseResultWrite {
  type: string;
  filePath: string;
}

export interface ToolUseResultAgent {
  status: string;
  prompt: string;
  content: string;
  agentId: string;
  totalDurationMs: number;
  totalTokens: number;
  totalToolUseCount: number;
}
