import * as vscode from 'vscode';
import { SessionSummary } from '../types/models';
import { DiscoveryService } from '../services/discoveryService';

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessions: SessionSummary[] = [];
  private forceRefresh: boolean = false;

  constructor(private discoveryService: DiscoveryService) {}

  refresh(): void {
    console.log('🔄 TreeView refresh called');
    this.forceRefresh = true;
    this._onDidChangeTreeData.fire();
  }

  async getTreeItem(element: SessionTreeItem): Promise<vscode.TreeItem> {
    return element;
  }

  async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
    console.log('📋 getChildren called, element:', element?.contextValue || 'root');

    if (!element) {
      // Root level - show sessions only
      try {
        const useForceRefresh = this.forceRefresh;
        this.forceRefresh = false;

        this.sessions = await this.discoveryService.getSessionList(useForceRefresh);
        console.log('📊 Sessions loaded:', this.sessions.length, '(forceRefresh:', useForceRefresh, ')');

        if (this.sessions.length === 0) {
          console.warn('⚠️ No sessions found!');
        } else {
          console.log('✅ First session:', {
            id: this.sessions[0].sessionId,
            prompt: this.sessions[0].prompt?.substring(0, 50),
            project: this.sessions[0].project
          });
        }

        const items = this.sessions.map(session => new SessionTreeItem(session));
        console.log('📦 Created', items.length, 'tree items');
        return items;
      } catch (error) {
        console.error('❌ Error loading sessions:', error);
        vscode.window.showErrorMessage(`Failed to load sessions: ${error}`);
        return [];
      }
    }

    // No children for sessions
    return [];
  }

  getSession(sessionId: string): SessionSummary | undefined {
    return this.sessions.find(s => s.sessionId === sessionId);
  }
}

class SessionTreeItem extends vscode.TreeItem {
  constructor(public readonly session: SessionSummary) {
    super(session.prompt || 'Untitled Session', vscode.TreeItemCollapsibleState.None);

    this.id = session.sessionId;
    this.tooltip = this.buildTooltip();
    this.description = this.buildDescription();
    this.iconPath = this.getIcon();
    this.contextValue = 'session';

    // Make session clickable - opens webview directly
    this.command = {
      command: 'argus.openSessionDetail',
      title: 'Open Session',
      arguments: [session.sessionId],
    };

    console.log('🎨 Created session tree item:', {
      id: this.id,
      label: this.label,
      collapsible: 'no'
    });
  }

  private buildTooltip(): string {
    const s = this.session;
    return [
      `Project: ${s.project}`,
      `Model: ${s.model}`,
      `Time: ${s.timestamp.toLocaleString()}`,
      s.isActive ? '● Active' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildDescription(): string {
    const parts: string[] = [];

    if (this.session.project) {
      parts.push(this.session.project);
    }

    if (this.session.isActive) {
      parts.push('● Active');
    }

    return parts.join(' • ');
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.session.isActive) {
      return new vscode.ThemeIcon('pulse', new vscode.ThemeColor('charts.green'));
    }

    // Icon based on model
    if (this.session.model.includes('opus')) {
      return new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.purple'));
    } else if (this.session.model.includes('sonnet')) {
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.blue'));
    } else if (this.session.model.includes('haiku')) {
      return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.orange'));
    }

    return new vscode.ThemeIcon('file');
  }
}
