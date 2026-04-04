import * as vscode from 'vscode';
import * as path from 'path';
import { SessionSummary, FilterState, DEFAULT_FILTER_STATE } from '../types/models';
import { DiscoveryService } from '../services/discoveryService';

export type SessionTreeElement = SessionTreeItem | GroupTreeItem;

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessions: SessionSummary[] = [];
  private forceRefresh: boolean = false;
  private filterState: FilterState = { ...DEFAULT_FILTER_STATE };

  constructor(
    private discoveryService: DiscoveryService,
    private extensionPath: string
  ) {}

  refresh(): void {
    this.forceRefresh = true;
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {}

  setFilters(state: FilterState): void {
    this.filterState = state;
    this._onDidChangeTreeData.fire();
  }

  getFilters(): FilterState {
    return { ...this.filterState };
  }

  async getTreeItem(element: SessionTreeElement): Promise<vscode.TreeItem> {
    return element;
  }

  async getChildren(element?: SessionTreeElement): Promise<SessionTreeElement[]> {
    // Group children
    if (element instanceof GroupTreeItem) {
      const filtered = this.applyFilters(this.sessions);
      const grouped = filtered.filter(s => this.getGroupKey(s) === element.groupKey);
      return grouped.map(s => new SessionTreeItem(s, this.extensionPath));
    }

    // Root level
    if (!element) {
      try {
        const useForceRefresh = this.forceRefresh;
        this.forceRefresh = false;
        this.sessions = await this.discoveryService.getSessionList(useForceRefresh);

        const filtered = this.applyFilters(this.sessions);

        if (this.filterState.groupMode === 'none') {
          return filtered.map(s => new SessionTreeItem(s, this.extensionPath));
        }

        // Build groups
        const groups = new Map<string, SessionSummary[]>();
        for (const s of filtered) {
          const key = this.getGroupKey(s);
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(s);
        }

        return Array.from(groups.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, sessions]) => new GroupTreeItem(key, this.getGroupLabel(key), sessions.length));
      } catch (error) {
        console.error('Error loading sessions:', error);
        return [];
      }
    }

    return [];
  }

  getSession(sessionId: string): SessionSummary | undefined {
    return this.sessions.find(s => s.sessionId === sessionId);
  }

  // --- Filtering ---

  private applyFilters(sessions: SessionSummary[]): SessionSummary[] {
    let result = sessions;

    // Text search
    const q = this.filterState.searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(s =>
        s.prompt.toLowerCase().includes(q) ||
        s.project.toLowerCase().includes(q)
      );
    }

    // Model filter
    if (this.filterState.selectedModels.length > 0) {
      result = result.filter(s => {
        const norm = this.normalizeModel(s.model);
        return this.filterState.selectedModels.includes(norm);
      });
    }

    // Date filter
    result = this.applyDateFilter(result);

    return result;
  }

  private applyDateFilter(sessions: SessionSummary[]): SessionSummary[] {
    const now = Date.now();
    switch (this.filterState.datePreset) {
      case '1h':
        return sessions.filter(s => now - s.lastModified.getTime() < 60 * 60 * 1000);
      case '24h':
        return sessions.filter(s => now - s.lastModified.getTime() < 24 * 60 * 60 * 1000);
      case '7d':
        return sessions.filter(s => now - s.lastModified.getTime() < 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return sessions.filter(s => now - s.lastModified.getTime() < 30 * 24 * 60 * 60 * 1000);
      case 'custom': {
        const from = this.filterState.customDateFrom ?? 0;
        const to = this.filterState.customDateTo ?? Infinity;
        return sessions.filter(s => {
          const t = s.lastModified.getTime();
          return t >= from && t <= to;
        });
      }
      default:
        return sessions;
    }
  }

  // --- Grouping ---

  private getGroupKey(session: SessionSummary): string {
    switch (this.filterState.groupMode) {
      case 'project':
        return session.project || 'Unknown Project';
      case 'model':
        return this.normalizeModel(session.model);
      default:
        return '';
    }
  }

  private getGroupLabel(key: string): string {
    if (this.filterState.groupMode === 'model') {
      switch (key) {
        case 'opus': return 'Claude Opus';
        case 'sonnet': return 'Claude Sonnet';
        case 'haiku': return 'Claude Haiku';
        default: return key;
      }
    }
    // For project grouping, show last path segment
    if (key.includes('/')) {
      return key.split('/').pop()!;
    }
    return key;
  }

  private normalizeModel(model: string): string {
    if (model.includes('opus')) return 'opus';
    if (model.includes('sonnet')) return 'sonnet';
    if (model.includes('haiku')) return 'haiku';
    return 'unknown';
  }
}

// --- Tree Items ---

export class GroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly groupKey: string,
    groupLabel: string,
    sessionCount: number
  ) {
    super(groupLabel, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${sessionCount}`;
    this.contextValue = 'sessionGroup';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

export class SessionTreeItem extends vscode.TreeItem {
  constructor(public readonly session: SessionSummary, extensionPath: string) {
    super(session.prompt || 'Untitled Session', vscode.TreeItemCollapsibleState.None);

    this.id = session.sessionId;
    this.tooltip = this.buildTooltip();
    this.description = this.buildDescription();
    this.iconPath = session.isActive
      ? vscode.Uri.file(path.join(extensionPath, 'resources', 'live.svg'))
      : vscode.Uri.file(path.join(extensionPath, 'resources', 'session.svg'));
    this.contextValue = 'session';

    this.command = {
      command: 'argus.openSessionDetail',
      title: 'Open Session',
      arguments: [session.sessionId],
    };
  }

  private buildTooltip(): vscode.MarkdownString {
    const s = this.session;
    const model = this.formatModel(s.model);
    const time = s.timestamp.toLocaleString();

    const md = new vscode.MarkdownString();
    md.supportThemeIcons = true;

    if (s.isActive) {
      md.appendMarkdown(`$(pulse) **Active Session**\n\n`);
    }

    md.appendMarkdown(`$(folder) \`${s.project}\`\n\n`);
    md.appendMarkdown(`$(hubot) ${model}\n\n`);
    md.appendMarkdown(`$(clock) ${time}\n\n`);
    md.appendMarkdown(`$(history) Updated ${this.relativeTime(s.lastModified)}\n\n`);

    if (s.prompt) {
      md.appendMarkdown(`---\n\n`);
      const prompt = s.prompt.length > 300 ? s.prompt.substring(0, 300) + '...' : s.prompt;
      md.appendMarkdown(`*${prompt}*`);
    }

    return md;
  }

  private buildDescription(): string {
    const parts: string[] = [];

    parts.push(this.formatModel(this.session.model));

    if (this.session.project) {
      const proj = this.session.project;
      const short = proj.includes('/') ? proj.split('/').pop()! : proj;
      parts.push(short);
    }

    parts.push(this.relativeTime(this.session.lastModified));

    return parts.join(' · ');
  }

  private formatModel(model: string): string {
    if (model.includes('opus')) return 'Claude Opus';
    if (model.includes('sonnet')) return 'Claude Sonnet';
    if (model.includes('haiku')) return 'Claude Haiku';
    return model || 'Unknown';
  }

  private relativeTime(date: Date): string {
    const now = Date.now();
    const diff = now - date.getTime();
    const sec = Math.floor(diff / 1000);

    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }
}
