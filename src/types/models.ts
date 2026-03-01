// Core data models ported from Go

export interface HistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
}

export interface SessionSummary {
  sessionId: string;
  prompt: string;
  project: string;
  model: string;
  timestamp: Date;
  isActive: boolean;
}

export interface DashboardStats {
  totalSessions: number;
  activeSessions: number;
  totalCost: number;
  costByModel: Record<string, number>;
  costByProject: Record<string, number>;
  modelUsage: Record<string, number>;
  recentSessions: SessionSummary[];
}

export interface SessionDetail {
  sessionId: string;
  prompt: string;
  project: string;
  model: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  totalCost: number;
  steps: Step[];
  subagents: SubagentInfo[];
  filesRead: string[];
  filesWritten: string[];
  toolsUsed: Record<string, number>;
  analysis?: AnalysisResult;
}

export type StepType = 'thinking' | 'tool_call' | 'text' | 'error' | 'subagent';

export interface Step {
  index: number;
  type: StepType;
  timestamp: Date;
  uuid: string;
  messageId: string;
  content: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: string;
  toolSuccess?: boolean;
  usage?: Usage;
  cost: number;
  agentId?: string;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface SubagentInfo {
  agentId: string;
  prompt: string;
  model: string;
  stepCount: number;
  totalCost: number;
  steps: Step[];
  analysis?: AnalysisResult;
}

export interface AnalysisResult {
  findings: Finding[];
  totalCost: number;
  wastedCost: number;
  efficiency: number; // percentage
  stepCosts: StepCost[];
  dependencies?: StepDependency[];
  contextMetrics?: ContextMetrics;
}

export interface ContextMetrics {
  peakInputTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheRead: number;
  totalCacheCreation: number;
  cacheHitRatio: number;
  compactionCount: number;
  avgTokensPerStep: number;
  tokenBurnRate: number;
  contextPressureZones: number[];
  compactionPoints: number[];
}

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  title: string;
  description: string;
  steps: number[];
  wastedCost: number;
  details?: any;
  confidence?: number;
  category?: string;
}

export interface StepDependency {
  fromStep: number;
  toStep: number;
  filePath: string;
  type: string;
}

export interface StepCost {
  stepIndex: number;
  cost: number;
}

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadRatio: number;
  cacheCreateRatio: number;
}

export const MODEL_PRICES: Record<string, ModelPricing> = {
  'claude-opus-4-6': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheReadRatio: 0.10,
    cacheCreateRatio: 0.25,
  },
  'claude-sonnet-4-5-20250929': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheReadRatio: 0.10,
    cacheCreateRatio: 0.25,
  },
  'claude-sonnet-4-6': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheReadRatio: 0.10,
    cacheCreateRatio: 0.25,
  },
  'claude-haiku-4-5-20251001': {
    inputPerMillion: 0.80,
    outputPerMillion: 4.0,
    cacheReadRatio: 0.10,
    cacheCreateRatio: 0.25,
  },
};

export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICES[model] || MODEL_PRICES['claude-sonnet-4-5-20250929'];
}

export function calculateCost(usage: Usage | undefined, model: string): number {
  if (!usage) {
    return 0;
  }

  const pricing = getModelPricing(model);
  const inputCost = (usage.input_tokens * pricing.inputPerMillion) / 1_000_000;
  const outputCost = (usage.output_tokens * pricing.outputPerMillion) / 1_000_000;
  const cacheReadCost = (usage.cache_read_input_tokens * pricing.inputPerMillion * pricing.cacheReadRatio) / 1_000_000;
  const cacheCreateCost = (usage.cache_creation_input_tokens * pricing.inputPerMillion * pricing.cacheCreateRatio) / 1_000_000;

  return inputCost + outputCost + cacheReadCost + cacheCreateCost;
}
