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
  subagents: Subagent[];
  filesRead: string[];
  filesWritten: string[];
  toolsUsed: Record<string, number>;
  analysis?: AnalysisResult;
}

export interface Step {
  index: number;
  type: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: string;
  toolSuccess?: boolean;
  content?: string;
  timestamp?: string;
  cost: number;
  usage?: TokenUsage;
  agentId?: string;
  globalIndex?: number;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface Subagent {
  agentId: string;
  prompt: string;
  model: string;
  agentType?: string;
  description?: string;
  parentStepIndex?: number;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  filesRead?: string[];
  filesWritten?: string[];
  toolsUsed?: Record<string, number>;
  stepCount: number;
  totalCost: number;
  steps: Step[];
  analysis?: AnalysisResult;
}

/**
 * Build a chronologically interleaved list of main + sub-agent steps. Each
 * agent's steps follow the Task step that spawned them, and every step gets a
 * stable `globalIndex` for cross-tab navigation.
 */
export function flattenSessionSteps(session: SessionDetail): Step[] {
  const spawnedAt = new Map<number, Subagent[]>();
  for (const sub of session.subagents) {
    if (typeof sub.parentStepIndex === 'number') {
      const arr = spawnedAt.get(sub.parentStepIndex) ?? [];
      arr.push(sub);
      spawnedAt.set(sub.parentStepIndex, arr);
    }
  }

  const out: Step[] = [];
  const push = (s: Step, agentId?: string) => {
    out.push({ ...s, agentId: agentId ?? s.agentId, globalIndex: out.length });
  };

  for (const main of session.steps) {
    push(main);
    const subs = spawnedAt.get(main.index);
    if (!subs) continue;
    for (const sub of subs) {
      for (const sStep of sub.steps) push(sStep, sub.agentId);
    }
  }
  for (const sub of session.subagents) {
    if (typeof sub.parentStepIndex !== 'number') {
      for (const sStep of sub.steps) push(sStep, sub.agentId);
    }
  }
  return out;
}

export interface AnalysisResult {
  findings: Finding[];
  totalCost: number;
  wastedCost: number;
  efficiency: number;
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

export interface Finding {
  rule?: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  wastedCost?: number;
  affectedSteps?: number[];
}

export type ViewMode = 'overview' | 'steps' | 'findings' | 'files' | 'subagents' | 'cost' | 'context';
