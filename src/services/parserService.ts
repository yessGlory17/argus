import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { RawEvent } from '../types/parser';
import { HistoryEntry, SessionDetail, Step, SubagentInfo } from '../types/models';
import { getClaudeConfigDir } from '../utils/claudePaths';

interface QuickMetadata {
  model: string;
  firstTimestamp: string;
  lastTimestamp: string;
  prompt: string;
  cwd: string;
}

export class ParserService {
  /**
   * Parse a JSONL file and return all events
   */
  async parseFile(filePath: string): Promise<RawEvent[]> {
    const events: RawEvent[] = [];
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const event = JSON.parse(trimmed) as RawEvent;
        events.push(event);
      } catch (err) {
        // Skip unparseable lines
        continue;
      }
    }

    return events;
  }

  /**
   * Extract quick metadata from a session file without full parsing
   */
  async quickMetadataWithPrompt(filePath: string): Promise<QuickMetadata | null> {
    try {
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let model = '';
      let firstTimestamp = '';
      let lastTimestamp = '';
      let prompt = '';
      let cwd = '';
      let foundFirst = false;

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const base: any = JSON.parse(trimmed);

          if (!base.type) {
            continue;
          }

          if (!foundFirst) {
            firstTimestamp = base.timestamp || '';
            foundFirst = true;
          }

          if (base.timestamp) {
            lastTimestamp = base.timestamp;
          }

          if (!cwd && base.cwd) {
            cwd = base.cwd;
          }

          // Extract model from assistant events
          if (!model && base.type === 'assistant' && base.message?.model) {
            if (base.message.model !== '<synthetic>') {
              model = base.message.model;
            }
          }

          // Extract prompt from user events
          if (!prompt && base.type === 'user') {
            prompt = this.extractPromptFromEvent(base);
          }

          // Stop early once we have all the metadata we need
          if (model && prompt && cwd) {
            rl.close();
            break;
          }
        } catch {
          continue;
        }
      }

      if (!foundFirst) {
        return null;
      }

      return {
        model,
        firstTimestamp,
        lastTimestamp,
        prompt,
        cwd,
      };
    } catch (err) {
      console.error('Error reading metadata from', filePath, err);
      return null;
    }
  }

  /**
   * Read history.jsonl and return a map of sessionId -> HistoryEntry
   */
  async readHistoryMap(): Promise<Map<string, HistoryEntry>> {
    const historyMap = new Map<string, HistoryEntry>();
    const historyPath = path.join(getClaudeConfigDir(), 'history.jsonl');

    if (!fs.existsSync(historyPath)) {
      return historyMap;
    }

    try {
      const fileStream = fs.createReadStream(historyPath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const entry = JSON.parse(trimmed) as HistoryEntry;
          if (entry.sessionId) {
            historyMap.set(entry.sessionId, entry);
          }
        } catch {
          continue;
        }
      }
    } catch (err) {
      console.error('Error reading history.jsonl:', err);
    }

    return historyMap;
  }

  /**
   * Build a SessionDetail from parsed events
   */
  buildSession(
    events: RawEvent[],
    sessionId: string,
    prompt: string,
    project: string
  ): SessionDetail {
    const steps: Step[] = [];
    const filesRead = new Set<string>();
    const filesWritten = new Set<string>();
    const toolsUsed = new Map<string, number>();

    let model = '';
    let startTime = new Date();
    let endTime = new Date();
    let totalCost = 0;

    // Track tool calls and their results
    const toolCallMap = new Map<string, Partial<Step>>();

    for (const event of events) {
      // Extract model
      if (!model && event.message?.model && event.message.model !== '<synthetic>') {
        model = event.message.model;
      }

      // Extract timestamps
      if (event.timestamp) {
        const ts = new Date(event.timestamp);
        if (!startTime || ts < startTime) {
          startTime = ts;
        }
        if (!endTime || ts > endTime) {
          endTime = ts;
        }
      }

      // Process assistant messages
      if (event.type === 'assistant' && event.message) {
        const usage = event.message.usage;
        const cost = usage ? this.calculateCost(usage, model) : 0;
        totalCost += cost;

        // Ensure content is an array
        const content = Array.isArray(event.message.content) ? event.message.content : [];

        for (const block of content) {
          if (block.type === 'thinking' && block.thinking) {
            steps.push({
              index: steps.length,
              type: 'thinking',
              timestamp: new Date(event.timestamp),
              uuid: event.uuid,
              messageId: event.message.id,
              content: block.thinking,
              usage,
              cost,
            });
          } else if (block.type === 'text' && block.text) {
            steps.push({
              index: steps.length,
              type: 'text',
              timestamp: new Date(event.timestamp),
              uuid: event.uuid,
              messageId: event.message.id,
              content: block.text,
              usage,
              cost: 0,
            });
          } else if (block.type === 'tool_use' && block.name) {
            const toolStep: Partial<Step> = {
              index: steps.length,
              type: 'tool_call',
              timestamp: new Date(event.timestamp),
              uuid: event.uuid,
              messageId: event.message.id,
              content: '',
              toolName: block.name,
              toolInput: block.input,
              cost: 0,
            };

            // Key by assistant event UUID — sourceToolAssistantUUID in
            // user events references this, not the tool_use block id.
            toolCallMap.set(event.uuid, toolStep);

            steps.push(toolStep as Step);

            // Track tool usage
            toolsUsed.set(block.name, (toolsUsed.get(block.name) || 0) + 1);

            // Track files from tool input
            if (block.name === 'Read' && block.input?.file_path) {
              filesRead.add(block.input.file_path);
            } else if (
              (block.name === 'Write' || block.name === 'Edit') &&
              block.input?.file_path
            ) {
              filesWritten.add(block.input.file_path);
            }
          }
        }
      }

      // Process tool results. The error flag (`is_error: true`) lives on
      // the tool_result content block inside `event.message.content`, not
      // on `event.toolUseResult` (which is often just a string preview of
      // the result body). Resolve the source-tool's UUID against the
      // tool_result blocks to find the matching one. Fall back to a
      // string-prefix check on `toolUseResult` for older session formats
      // that stored the result as a plain "Error: ..." string.
      if (event.type === 'user' && event.toolUseResult && event.sourceToolAssistantUUID) {
        const toolStep = toolCallMap.get(event.sourceToolAssistantUUID);
        if (toolStep && typeof toolStep.index === 'number') {
          const result = event.toolUseResult;
          steps[toolStep.index].toolResult = JSON.stringify(result);

          let isError = false;
          const blocks = event.message?.content;
          if (Array.isArray(blocks)) {
            for (const b of blocks) {
              if (b && b.type === 'tool_result' && b.is_error === true) {
                isError = true;
                break;
              }
            }
          }
          if (!isError && typeof result === 'object' && result !== null && (result as any).is_error === true) {
            isError = true;
          }
          if (!isError && typeof result === 'string' && /^error\b/i.test(result.trim())) {
            isError = true;
          }
          steps[toolStep.index].toolSuccess = !isError;
        }
      }
    }

    const durationMs = endTime.getTime() - startTime.getTime();

    return {
      sessionId,
      prompt,
      project,
      model,
      startTime,
      endTime,
      durationMs,
      totalCost,
      steps,
      subagents: [],
      filesRead: Array.from(filesRead),
      filesWritten: Array.from(filesWritten),
      toolsUsed: Object.fromEntries(toolsUsed),
    };
  }

  /**
   * Resolve the directory Claude Code writes sub-agent JSONLs into for a given
   * session. Layout is `<projectDir>/<sessionId>/subagents/`.
   */
  getSubagentsDir(projectDir: string, sessionId: string): string {
    return path.join(projectDir, sessionId, 'subagents');
  }

  /**
   * Parse all sub-agent JSONLs for a session. Each agent's steps are tagged
   * with its agentId so they can be threaded into the parent session timeline.
   */
  async parseSubagents(projectDir: string, sessionId: string): Promise<SubagentInfo[]> {
    const subagentsDir = this.getSubagentsDir(projectDir, sessionId);

    if (!fs.existsSync(subagentsDir)) {
      return [];
    }

    const subagents: SubagentInfo[] = [];

    try {
      const files = fs.readdirSync(subagentsDir);

      for (const file of files) {
        if (!file.endsWith('.jsonl')) {
          continue;
        }

        // Filenames carry an `agent-` prefix that the JSONL contents and the
        // spawning tool's `toolUseResult.agentId` do not. Strip it so the
        // canonical id matches across all three sources.
        const agentId = file.replace(/^agent-/, '').replace(/\.jsonl$/, '');
        const filePath = path.join(subagentsDir, file);
        const events = await this.parseFile(filePath);

        if (events.length === 0) {
          continue;
        }

        // Extract prompt from first user event
        let prompt = '';
        for (const event of events) {
          if (event.type === 'user') {
            prompt = this.extractPromptFromEvent(event);
            break;
          }
        }

        const session = this.buildSession(events, agentId, prompt, '');

        // Tag every step with its owning agentId so the flatten helper and
        // downstream tabs can distinguish agent activity from main session.
        for (const step of session.steps) {
          step.agentId = agentId;
        }

        // meta.json is written next to the JSONL with agentType + description.
        // The file keeps the `agent-` prefix even though the canonical id we
        // store internally does not.
        let agentType: string | undefined;
        let description: string | undefined;
        const metaPath = path.join(subagentsDir, `agent-${agentId}.meta.json`);
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            agentType = typeof meta.agentType === 'string' ? meta.agentType : undefined;
            description = typeof meta.description === 'string' ? meta.description : undefined;
          } catch {
            // ignore malformed meta
          }
        }

        subagents.push({
          agentId,
          prompt,
          model: session.model,
          agentType,
          description,
          startTime: session.startTime,
          endTime: session.endTime,
          durationMs: session.durationMs,
          filesRead: session.filesRead,
          filesWritten: session.filesWritten,
          toolsUsed: session.toolsUsed,
          stepCount: session.steps.length,
          totalCost: session.totalCost,
          steps: session.steps,
        });
      }
    } catch (err) {
      console.error('Error parsing subagents:', err);
    }

    return subagents;
  }

  /**
   * Walk the main session steps, find agent-spawning tool_use calls whose
   * result carries an `agentId`, and link the matching SubagentInfo back to
   * the spawning step via `parentStepIndex`. Different Claude Code versions
   * have used both "Task" and "Agent" as the tool name for the same launch
   * primitive — we match either.
   */
  linkSubagentsToParents(steps: Step[], subagents: SubagentInfo[]): void {
    if (subagents.length === 0) return;
    const byId = new Map<string, SubagentInfo>();
    for (const s of subagents) byId.set(s.agentId, s);

    for (const step of steps) {
      if (step.toolName !== 'Task' && step.toolName !== 'Agent') continue;
      if (!step.toolResult) continue;
      try {
        const result = JSON.parse(step.toolResult);
        const agentId = result?.agentId;
        if (typeof agentId !== 'string') continue;
        const sub = byId.get(agentId);
        if (sub) sub.parentStepIndex = step.index;
      } catch {
        // ignore unparseable results
      }
    }
  }

  // Helper methods

  private extractPromptFromEvent(event: any): string {
    try {
      if (!event.message?.content) {
        return '';
      }

      const content = event.message.content;

      // content is a string
      if (typeof content === 'string') {
        return this.truncatePrompt(content, 200);
      }

      // content is an array
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            return this.truncatePrompt(block.text, 200);
          }
        }
      }
    } catch {
      // ignore
    }

    return '';
  }

  private truncatePrompt(text: string, maxLen: number): string {
    if (text.length <= maxLen) {
      return text;
    }
    return text.substring(0, maxLen) + '...';
  }

  private calculateCost(usage: any, model: string): number {
    // Import from models.ts would be better, but for simplicity:
    const pricing: any = {
      'claude-opus-4-6': { in: 15, out: 75 },
      'claude-sonnet-4-5-20250929': { in: 3, out: 15 },
      'claude-sonnet-4-6': { in: 3, out: 15 },
      'claude-haiku-4-5-20251001': { in: 0.8, out: 4 },
    };

    const p = pricing[model] || pricing['claude-sonnet-4-5-20250929'];
    const inputCost = (usage.input_tokens * p.in) / 1_000_000;
    const outputCost = (usage.output_tokens * p.out) / 1_000_000;
    const cacheReadCost = (usage.cache_read_input_tokens * p.in * 0.1) / 1_000_000;
    const cacheCreateCost = (usage.cache_creation_input_tokens * p.in * 0.25) / 1_000_000;

    return inputCost + outputCost + cacheReadCost + cacheCreateCost;
  }
}
