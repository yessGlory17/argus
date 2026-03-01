import * as vscode from 'vscode';
import { DiscoveryService } from './services/discoveryService';
import { ParserService } from './services/parserService';
import { AnalyzerService } from './services/analyzerService';
import { SessionTreeProvider } from './providers/sessionTreeProvider';
import { SessionWebviewProviderReact } from './providers/sessionWebviewProviderReact';

export function activate(context: vscode.ExtensionContext) {
  console.log('✅ Argus extension is now active (React UI)');

  // Initialize services
  const discoveryService = new DiscoveryService();
  const parserService = new ParserService();
  const analyzerService = new AnalyzerService();

  // Initialize providers
  const treeProvider = new SessionTreeProvider(discoveryService);
  const webviewProvider = new SessionWebviewProviderReact(
    context,
    discoveryService,
    parserService,
    analyzerService
  );

  // Register tree view
  const treeView = vscode.window.createTreeView('argusSessionList', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(treeView);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('argus.refreshSessions', async () => {
      console.log('🔄 Refresh sessions command triggered');
      try {
        await discoveryService.refreshDiscovery();
        console.log('✅ Discovery refresh completed');
        treeProvider.refresh();
        console.log('✅ Tree view refresh triggered');
        const sessionCount = (await discoveryService.getSessionList()).length;
        vscode.window.showInformationMessage(`Sessions refreshed (${sessionCount} found)`);
      } catch (error) {
        console.error('❌ Error refreshing sessions:', error);
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage('Failed to refresh sessions: ' + msg);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('argus.openSessionDetail', async (sessionId: string) => {
      console.log('🎯 Command triggered: argus.openSessionDetail');
      console.log('📌 SessionId:', sessionId);
      try {
        await webviewProvider.openSessionDetail(sessionId);
      } catch (error) {
        console.error('❌ Failed to open session:', error);
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage('Failed to open session: ' + msg);
      }
    })
  );

  // Initial discovery on activation
  console.log('🔍 Starting initial discovery...');
  discoveryService.refreshDiscovery().then(() => {
    console.log('✅ Initial discovery complete');
    treeProvider.refresh();
  });

  // Watch for .claude directory changes
  const watcher = vscode.workspace.createFileSystemWatcher('**/.claude/projects/**/*.jsonl');

  watcher.onDidCreate(() => {
    console.log('📝 New session file detected');
    discoveryService.refreshDiscovery().then(() => treeProvider.refresh());
  });

  watcher.onDidChange(() => {
    console.log('📝 Session file changed');
    treeProvider.refresh();
  });

  watcher.onDidDelete(() => {
    console.log('🗑️ Session file deleted');
    discoveryService.refreshDiscovery().then(() => treeProvider.refresh());
  });

  context.subscriptions.push(watcher);

  // Status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(pulse) Argus';
  statusBarItem.tooltip = 'Claude Code Session Debugger';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  console.log('✅ Argus extension fully initialized');
}

export function deactivate() {
  console.log('👋 Argus extension is now deactivated');
}
