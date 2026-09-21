import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ParserService } from '../services/parserService';
import { AnalyzerService } from '../services/analyzerService';
import { DiscoveryService } from '../services/discoveryService';
import { SessionDetail } from '../types/models';
import {
  track, bucket, modelFamily, TELEMETRY_TABS, TELEMETRY_FEATURES, TELEMETRY_RULES,
} from '../telemetry/telemetry';

export class SessionWebviewProviderReact {
  private panels: Map<string, vscode.WebviewPanel> = new Map();
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private subagentWatchers: Map<string, fs.FSWatcher> = new Map();
  private liveUpdateCounts: Map<string, number> = new Map();
  private lastParseMs = 0;

  constructor(
    private context: vscode.ExtensionContext,
    private discoveryService: DiscoveryService,
    private parserService: ParserService,
    private analyzerService: AnalyzerService
  ) {}

  async openSessionDetail(sessionId: string): Promise<void> {
    return this.openSessionTab(sessionId, 'overview');
  }

  async openSessionTab(sessionId: string, tabType: string): Promise<void> {
    const panelKey = `${sessionId}`;

    // Check if panel already exists
    const existingPanel = this.panels.get(panelKey);
    if (existingPanel) {
      existingPanel.reveal();
      return;
    }

    // Load session data
    const loadStarted = Date.now();
    const sessionData = await this.loadSessionData(sessionId);
    if (!sessionData) {
      vscode.window.showErrorMessage('Failed to load session data');
      return;
    }

    // Create webview panel
    const panel = vscode.window.createWebviewPanel(
      'argusSession',
      `Argus: ${sessionData.prompt.substring(0, 30)}...`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview')),
        ],
      }
    );

    const openedAt = Date.now();
    this.trackSessionOpened(sessionId, sessionData, Date.now() - loadStarted);
    const featuresSeen = new Set<string>();

    // Set HTML content
    panel.webview.html = this.getWebviewContent(panel.webview);

    // Send session data to webview
    panel.webview.postMessage({
      type: 'sessionData',
      data: sessionData,
    });

    // Send top-level directory listing for the session cwd
    this.sendDirectoryTree(panel, sessionData.project);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'ready':
            // Webview is ready, send data
            panel.webview.postMessage({
              type: 'sessionData',
              data: sessionData,
            });
            panel.webview.postMessage({ type: 'liveMode', active: true });
            this.sendDirectoryTree(panel, sessionData.project);
            break;
          case 'telemetry':
            // Webview input is untrusted: only forward known tab names.
            if (message.event === 'tab_viewed' && TELEMETRY_TABS.has(message.tab)) {
              track('tab_viewed', { tab: message.tab });
            } else if (message.event === 'feature_used' && TELEMETRY_FEATURES.has(message.feature)) {
              // Once per feature (and source tab) per panel.
              const tab = TELEMETRY_TABS.has(message.tab) ? message.tab : undefined;
              const key = `${message.feature}:${tab ?? ''}`;
              if (!featuresSeen.has(key)) {
                featuresSeen.add(key);
                track('feature_used', { feature: message.feature, tab });
              }
            }
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    // Track panel
    this.panels.set(panelKey, panel);

    // Start watching the JSONL file for live updates
    this.startWatching(sessionId, panel);

    // Clean up when panel is closed
    panel.onDidDispose(() => {
      track('session_closed', {
        open_seconds: bucket((Date.now() - openedAt) / 1000, [0, 10, 60, 300, 1800, 7200]),
        live_updates: bucket(this.liveUpdateCounts.get(sessionId) ?? 0),
      });
      this.liveUpdateCounts.delete(sessionId);
      this.stopWatching(sessionId);
      this.panels.delete(panelKey);
    });
  }

  private trackSessionOpened(sessionId: string, data: SessionDetail, loadMs: number): void {
    let fileSizeKb = 0;
    const info = this.discoveryService.getSessionFilePath(sessionId);
    try {
      if (info) fileSizeKb = fs.statSync(info.filePath).size / 1024;
    } catch {
      // ignore
    }

    const analyses = [data.analysis, ...data.subagents.map((s) => s.analysis)];
    const ruleCounts = new Map<string, number>();
    let findingCount = 0;
    for (const analysis of analyses) {
      for (const f of analysis?.findings ?? []) {
        findingCount++;
        const rule = TELEMETRY_RULES.has(f.rule) ? f.rule : 'other';
        ruleCounts.set(rule, (ruleCounts.get(rule) ?? 0) + 1);
      }
    }

    const ctx = data.analysis?.contextMetrics;
    track('session_opened', {
      model_family: modelFamily(data.model),
      step_count: bucket(data.steps.length),
      subagent_count: bucket(data.subagents.length),
      finding_count: bucket(findingCount),
      load_ms: bucket(loadMs, [0, 100, 500, 1000, 3000, 10000]),
      parse_ms: bucket(this.lastParseMs, [0, 50, 200, 500, 1000, 3000]),
      file_size_kb: bucket(fileSizeKb, [0, 100, 1000, 10000, 50000]),
      peak_context_k: ctx ? bucket(ctx.peakInputTokens / 1000, [0, 50, 100, 150, 200, 500, 1000]) : undefined,
      compactions: ctx ? bucket(ctx.compactionCount, [0, 1, 2, 5, 10]) : undefined,
      cache_hit_pct: ctx ? bucket(ctx.cacheHitRatio * 100, [0, 25, 50, 75, 90]) : undefined,
    });

    for (const [rule, count] of ruleCounts) {
      track('analysis_rule_fired', { rule, rule_count: bucket(count, [0, 1, 2, 5, 10, 50]) });
    }
  }

  async openDashboard(): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'argusDashboard',
      'Argus Dashboard',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    const sessions = await this.discoveryService.getSessionList();

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: var(--vscode-font-family);
              color: var(--vscode-foreground);
              background: var(--vscode-editor-background);
              padding: 20px;
            }
            h1 { color: var(--vscode-foreground); }
          </style>
        </head>
        <body>
          <h1>📊 Argus Dashboard</h1>
          <p>${sessions.length} sessions found</p>
        </body>
      </html>
    `;
  }

  private startWatching(sessionId: string, panel: vscode.WebviewPanel): void {
    const sessionInfo = this.discoveryService.getSessionFilePath(sessionId);
    if (!sessionInfo) {
      return;
    }

    let debounceTimer: NodeJS.Timeout | undefined;
    let lastSize = 0;

    try {
      lastSize = fs.statSync(sessionInfo.filePath).size;
    } catch {
      // ignore
    }

    const triggerReload = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(async () => {
        try {
          const updatedData = await this.loadSessionData(sessionId);
          if (updatedData) {
            this.liveUpdateCounts.set(sessionId, (this.liveUpdateCounts.get(sessionId) ?? 0) + 1);
            panel.webview.postMessage({
              type: 'sessionData',
              data: updatedData,
            });
          }
        } catch (err) {
          console.error('Error reloading session for live update:', err);
        }
      }, 500);
    };

    // Lazy-mounts a watcher on the subagents/ directory for this session.
    // Claude Code creates the directory only when it first spawns an agent,
    // so we (re-)try whenever the main file changes until it appears.
    const ensureSubagentWatcher = () => {
      if (this.subagentWatchers.has(sessionId)) return;
      const subDir = this.parserService.getSubagentsDir(
        sessionInfo.projectDir,
        sessionId
      );
      if (!fs.existsSync(subDir)) return;
      try {
        const subWatcher = fs.watch(subDir, () => {
          // Any add/change inside the subagents dir → reuse the same debounce
          // so we don't double-reload when both main and agent files tick.
          triggerReload();
        });
        this.subagentWatchers.set(sessionId, subWatcher);
      } catch (err) {
        console.error('Failed to start subagent watcher:', err);
      }
    };

    try {
      const watcher = fs.watch(sessionInfo.filePath, async (eventType) => {
        if (eventType !== 'change') {
          return;
        }

        // Skip if file size hasn't changed (avoids duplicate events)
        try {
          const currentSize = fs.statSync(sessionInfo.filePath).size;
          if (currentSize === lastSize) {
            return;
          }
          lastSize = currentSize;
        } catch {
          return;
        }

        // Cheap to retry on every change — fs.watch only fires on real writes
        // and ensureSubagentWatcher short-circuits once mounted.
        ensureSubagentWatcher();
        triggerReload();
      });

      this.watchers.set(sessionId, watcher);

      // The dir may already exist (re-opening a finished session).
      ensureSubagentWatcher();

      // Notify webview that live mode is active
      panel.webview.postMessage({ type: 'liveMode', active: true });
    } catch (err) {
      console.error('Failed to start file watcher:', err);
    }
  }

  private sendDirectoryTree(panel: vscode.WebviewPanel, cwd: string): void {
    if (!cwd) {
      return;
    }
    try {
      if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
        return;
      }
      const entries = fs.readdirSync(cwd, { withFileTypes: true })
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      panel.webview.postMessage({
        type: 'directoryTree',
        cwd,
        entries,
      });
    } catch (err) {
      console.error('Failed to read directory tree:', err);
    }
  }

  private stopWatching(sessionId: string): void {
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(sessionId);
    }
    const subWatcher = this.subagentWatchers.get(sessionId);
    if (subWatcher) {
      subWatcher.close();
      this.subagentWatchers.delete(sessionId);
    }
  }

  private async loadSessionData(sessionId: string): Promise<SessionDetail | null> {
    try {
      console.log('🔍 Loading session:', sessionId);

      const sessionInfo = this.discoveryService.getSessionFilePath(sessionId);
      if (!sessionInfo) {
        console.error('❌ Session info not found for:', sessionId);
        return null;
      }

      console.log('📂 Session file:', sessionInfo.filePath);

      // Parse JSONL file
      const parseStarted = Date.now();
      const events = await this.parserService.parseFile(sessionInfo.filePath);
      this.lastParseMs = Date.now() - parseStarted;
      console.log('📊 Parsed events:', events.length);

      if (!events.length) {
        console.error('❌ No events found in session file');
        return null;
      }

      // Get metadata
      const metadata = await this.parserService.quickMetadataWithPrompt(sessionInfo.filePath);
      const prompt = metadata?.prompt || '';
      const project = metadata?.cwd || '';
      console.log('📝 Prompt:', prompt);

      // Build session
      console.log('🔨 Building session...');
      const session = this.parserService.buildSession(events, sessionId, prompt, project);
      console.log('✅ Session built:', session.steps.length, 'steps');

      // Parse subagents
      console.log('🤖 Parsing subagents...');
      const subagents = await this.parserService.parseSubagents(sessionInfo.projectDir, sessionId);
      session.subagents = subagents;
      // Link each subagent to the Task tool_use step that spawned it so the
      // webview can interleave its steps inline in the timeline.
      this.parserService.linkSubagentsToParents(session.steps, subagents);
      console.log('✅ Subagents parsed:', subagents.length);

      // Run analysis
      console.log('🔬 Running analysis...');
      session.analysis = this.analyzerService.analyze(session);
      console.log('✅ Analysis complete:', session.analysis.findings.length, 'findings');

      // Analyze subagents
      for (const subagent of session.subagents) {
        const subSession: SessionDetail = {
          sessionId: subagent.agentId,
          prompt: subagent.prompt,
          project: '',
          model: subagent.model,
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 0,
          totalCost: subagent.totalCost,
          steps: subagent.steps,
          subagents: [],
          filesRead: [],
          filesWritten: [],
          toolsUsed: {},
        };
        subagent.analysis = this.analyzerService.analyze(subSession);
      }

      console.log('✅ Session loaded successfully');
      return session;
    } catch (error) {
      console.error('❌ Error loading session:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      return null;
    }
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const webviewPath = path.join(this.context.extensionPath, 'out', 'webview');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, 'assets', 'main.js'))
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewPath, 'assets', 'main.css'))
    );

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; font-src ${webview.cspSource} https:; img-src ${webview.cspSource} https:;">
    <link rel="stylesheet" href="${styleUri}">
    <title>Argus Session Viewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script src="${scriptUri}"></script>
  </body>
</html>`;
  }
}
