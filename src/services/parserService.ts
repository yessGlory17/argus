import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { RawEvent } from '../types/parser';
import { HistoryEntry, SessionDetail, Step, SubagentInfo } from '../types/models';

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
    const historyPath = path.join(os.homedir(), '.claude', 'history.jsonl');

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

            if (block.id) {
              toolCallMap.set(block.id, toolStep);
            }

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

      // Process tool results
      if (event.type === 'user' && event.toolUseResult && event.sourceToolAssistantUUID) {
        const toolStep = toolCallMap.get(event.sourceToolAssistantUUID);
        if (toolStep && typeof toolStep.index === 'number') {
          const result = event.toolUseResult;
          steps[toolStep.index].toolResult = JSON.stringify(result);
          steps[toolStep.index].toolSuccess = !result.is_error;
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
   * Parse subagent files
   */
  async parseSubagents(projectDir: string, sessionId: string): Promise<SubagentInfo[]> {
    const subagentsDir = path.join(projectDir, 'subagents', sessionId);

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

        const agentId = file.replace('.jsonl', '');
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

        subagents.push({
          agentId,
          prompt,
          model: session.model,
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
