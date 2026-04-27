import * as fs from 'fs';
import * as path from 'path';
import { SessionSummary } from '../types/models';
import { getClaudeConfigDir } from '../utils/claudePaths';
import { ParserService } from './parserService';

export interface DiscoveredSession {
  sessionId: string;
  filePath: string;
  projectDir: string;
  project: string;
  model: string;
  prompt: string;
  timestamp: Date;
  lastModified: Date;
  source: 'history' | 'scan';
}

export interface DiscoveryResult {
  sessions: DiscoveredSession[];
  claudeDirs: string[];
}

interface SessionFileInfo {
  sessionId: string;
  filePath: string;
  projectDir: string;
}

export class DiscoveryService {
  private sessionIndex: Map<string, DiscoveredSession> = new Map();
  private claudeDirs: string[] = [];
  private lastDiscovery: Date = new Date(0);
  private parserService: ParserService;

  constructor() {
    this.parserService = new ParserService();
  }

  /**
   * Locate the user's ~/.claude directory if it has a projects/ subdirectory.
   * We intentionally do not scan the rest of the filesystem: it's slow and can
   * make the extension look like it's snooping on user files.
   */
  async findClaudeDirs(): Promise<string[]> {
    const mainClaudeDir = getClaudeConfigDir();
    return this.hasProjectsDir(mainClaudeDir) ? [mainClaudeDir] : [];
  }

  /**
   * Scan a .claude/projects/ directory for session files
   */
  scanProjectsDir(projectsDir: string): SessionFileInfo[] {
    const results: SessionFileInfo[] = [];

    try {
      const projectEntries = fs.readdirSync(projectsDir, { withFileTypes: true });

      for (const projEntry of projectEntries) {
        if (!projEntry.isDirectory()) {
          continue;
        }

        const projDir = path.join(projectsDir, projEntry.name);
        const files = fs.readdirSync(projDir, { withFileTypes: true });

        for (const file of files) {
          // Only include direct .jsonl children (not in subdirectories like subagents/)
          if (file.isDirectory() || !file.name.endsWith('.jsonl')) {
            continue;
          }

          const sessionId = file.name.replace('.jsonl', '');
          results.push({
            sessionId,
            filePath: path.join(projDir, file.name),
            projectDir: projDir,
          });
        }
      }
    } catch (err) {
      console.error('Error scanning projects dir:', projectsDir, err);
    }

    return results;
  }

  /**
   * Discover all sessions from all .claude directories
   */
  async discoverAllSessions(): Promise<DiscoveryResult> {
    // Step 1: Find all .claude directories
    const claudeDirs = await this.findClaudeDirs();

    // Step 2: Scan all projects directories
    const allFiles = new Map<string, SessionFileInfo>();

    for (const claudeDir of claudeDirs) {
      const projectsDir = path.join(claudeDir, 'projects');
      const files = this.scanProjectsDir(projectsDir);

      for (const file of files) {
        if (!allFiles.has(file.sessionId)) {
          allFiles.set(file.sessionId, file);
        }
      }
    }

    // Step 3: Read history.jsonl for display prompts
    const historyMap = await this.parserService.readHistoryMap();

    // Step 4: Extract metadata from each session file
    const sessions = await this.processMetadataConcurrently(allFiles, historyMap);

    return {
      sessions,
      claudeDirs,
    };
  }

  /**
   * Get session list with caching
   */
  async getSessionList(forceRefresh: boolean = false): Promise<SessionSummary[]> {
    const needsDiscovery =
      forceRefresh ||
      this.sessionIndex.size === 0 ||
      Date.now() - this.lastDiscovery.getTime() > 5 * 60 * 1000; // 5 minutes

    if (needsDiscovery) {
      await this.refreshDiscovery();
    }

    const now = Date.now();
    const summaries: SessionSummary[] = [];

    for (const ds of this.sessionIndex.values()) {
      // A session is "active" if its file was modified within the last 2 minutes
      const isActive = now - ds.lastModified.getTime() < 2 * 60 * 1000;

      summaries.push({
        sessionId: ds.sessionId,
        prompt: ds.prompt,
        project: ds.project,
        model: ds.model,
        timestamp: ds.timestamp,
        lastModified: ds.lastModified,
        isActive,
      });
    }

    // Sort by timestamp descending (newest first)
    summaries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return summaries;
  }

  /**
   * Get session file path from cache
   */
  getSessionFilePath(sessionId: string): { filePath: string; projectDir: string } | undefined {
    const ds = this.sessionIndex.get(sessionId);
    if (ds) {
      return {
        filePath: ds.filePath,
        projectDir: ds.projectDir,
      };
    }
    return undefined;
  }

  /**
   * Refresh discovery cache
   */
  async refreshDiscovery(): Promise<void> {
    const result = await this.discoverAllSessions();

    this.sessionIndex.clear();
    for (const session of result.sessions) {
      this.sessionIndex.set(session.sessionId, session);
    }

    this.claudeDirs = result.claudeDirs;
    this.lastDiscovery = new Date();
  }

  /**
   * Get list of discovered .claude directories
   */
  getClaudeDirs(): string[] {
    return [...this.claudeDirs];
  }

  // Helper methods

  private hasProjectsDir(claudeDir: string): boolean {
    try {
      const projectsPath = path.join(claudeDir, 'projects');
      const stat = fs.statSync(projectsPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async processMetadataConcurrently(
    files: Map<string, SessionFileInfo>,
    historyMap: Map<string, any>
  ): Promise<DiscoveredSession[]> {
    const sessions: DiscoveredSession[] = [];

    for (const info of files.values()) {
      const session = await this.processSessionFile(info, historyMap);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  private async processSessionFile(
    info: SessionFileInfo,
    historyMap: Map<string, any>
  ): Promise<DiscoveredSession | null> {
    const metadata = await this.parserService.quickMetadataWithPrompt(info.filePath);
    if (!metadata) {
      return null;
    }

    const ds: DiscoveredSession = {
      sessionId: info.sessionId,
      filePath: info.filePath,
      projectDir: info.projectDir,
      project: '',
      model: metadata.model || 'unknown',
      prompt: '',
      timestamp: new Date(),
      lastModified: new Date(),
      source: 'scan',
    };

    // Get file modification time
    try {
      const stat = fs.statSync(info.filePath);
      ds.lastModified = stat.mtime;
    } catch {
      // ignore
    }

    // Prefer history data for prompt and project
    const historyEntry = historyMap.get(info.sessionId);
    if (historyEntry) {
      ds.source = 'history';
      ds.prompt = historyEntry.display || metadata.prompt;
      if (historyEntry.project) {
        ds.project = this.humanProjectName(historyEntry.project);
      }
      ds.timestamp = new Date(historyEntry.timestamp);
    } else {
      ds.source = 'scan';
      ds.prompt = metadata.prompt;

      // Parse timestamp from first event
      if (metadata.firstTimestamp) {
        const parsed = this.parseTimestamp(metadata.firstTimestamp);
        if (parsed) {
          ds.timestamp = parsed;
        } else {
          ds.timestamp = ds.lastModified;
        }
      } else {
        ds.timestamp = ds.lastModified;
      }
    }

    // Derive project name from cwd or directory name
    if (!ds.project) {
      if (metadata.cwd) {
        ds.project = this.humanProjectName(metadata.cwd);
      } else {
        ds.project = this.projectNameFromDir(info.projectDir);
      }
    }

    return ds;
  }

  private humanProjectName(pathStr: string): string {
    const parts = pathStr.split(path.sep).filter(p => p);
    if (parts.length === 0) {
      return pathStr;
    }
    if (parts.length <= 2) {
      return parts.join('/');
    }
    return parts.slice(-2).join('/');
  }

  private projectNameFromDir(dirPath: string): string {
    const base = path.basename(dirPath);
    const parts = base.split('-').filter((p: string) => p);

    if (parts.length === 0) {
      return base;
    }
    if (parts.length <= 2) {
      return parts.join('/');
    }
    return parts.slice(-2).join('/');
  }

  private parseTimestamp(ts: string): Date | null {
    try {
      return new Date(ts);
    } catch {
      return null;
    }
  }
}
