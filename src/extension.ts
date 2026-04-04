import * as vscode from 'vscode';
import { DiscoveryService } from './services/discoveryService';
import { ParserService } from './services/parserService';
import { AnalyzerService } from './services/analyzerService';
import { SessionWebviewProviderReact } from './providers/sessionWebviewProviderReact';
import { SessionListViewProvider } from './providers/sessionListViewProvider';
import { DatePickerPanel } from './providers/datePickerPanel';
import { FilterState, DEFAULT_FILTER_STATE, GroupMode, DatePreset, SessionSummary } from './types/models';

export function activate(context: vscode.ExtensionContext) {
  // Initialize services
  const discoveryService = new DiscoveryService();
  const parserService = new ParserService();
  const analyzerService = new AnalyzerService();

  // Initialize providers
  const webviewProvider = new SessionWebviewProviderReact(
    context,
    discoveryService,
    parserService,
    analyzerService
  );

  // Filter state
  let filterState: FilterState = { ...DEFAULT_FILTER_STATE };
  let allSessions: SessionSummary[] = [];

  // --- Filtering logic ---

  function normalizeModel(model: string): string {
    if (model.includes('opus')) return 'opus';
    if (model.includes('sonnet')) return 'sonnet';
    if (model.includes('haiku')) return 'haiku';
    return 'unknown';
  }

  function applyFilters(sessions: SessionSummary[]): SessionSummary[] {
    let result = sessions;

    // Text search
    const q = filterState.searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(s =>
        s.prompt.toLowerCase().includes(q) ||
        s.project.toLowerCase().includes(q)
      );
    }

    // Model filter
    if (filterState.selectedModels.length > 0) {
      result = result.filter(s =>
        filterState.selectedModels.includes(normalizeModel(s.model))
      );
    }

    // Date filter
    const now = Date.now();
    switch (filterState.datePreset) {
      case '1h':
        result = result.filter(s => now - s.lastModified.getTime() < 60 * 60 * 1000);
        break;
      case '24h':
        result = result.filter(s => now - s.lastModified.getTime() < 24 * 60 * 60 * 1000);
        break;
      case '7d':
        result = result.filter(s => now - s.lastModified.getTime() < 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        result = result.filter(s => now - s.lastModified.getTime() < 30 * 24 * 60 * 60 * 1000);
        break;
      case 'custom': {
        const from = filterState.customDateFrom ?? 0;
        const to = filterState.customDateTo ?? Infinity;
        result = result.filter(s => {
          const t = s.lastModified.getTime();
          return t >= from && t <= to;
        });
        break;
      }
    }

    return result;
  }

  function refreshList() {
    const filtered = applyFilters(allSessions);
    listViewProvider.updateSessions(filtered, filterState);
  }

  function syncContextKeys() {
    const models = filterState.selectedModels;
    vscode.commands.executeCommand('setContext', 'argus.filter.opus', models.includes('opus'));
    vscode.commands.executeCommand('setContext', 'argus.filter.sonnet', models.includes('sonnet'));
    vscode.commands.executeCommand('setContext', 'argus.filter.haiku', models.includes('haiku'));
    vscode.commands.executeCommand('setContext', 'argus.filter.date', filterState.datePreset);
    vscode.commands.executeCommand('setContext', 'argus.group', filterState.groupMode);

    const hasActive =
      filterState.searchQuery !== '' ||
      filterState.selectedModels.length > 0 ||
      filterState.datePreset !== 'all' ||
      filterState.groupMode !== 'none';
    vscode.commands.executeCommand('setContext', 'argus.hasActiveFilters', hasActive);
  }

  function toggleModel(model: string) {
    const idx = filterState.selectedModels.indexOf(model);
    if (idx >= 0) {
      filterState.selectedModels.splice(idx, 1);
    } else {
      filterState.selectedModels.push(model);
    }
    syncContextKeys();
    refreshList();
  }

  function setDatePreset(preset: DatePreset) {
    filterState.datePreset = preset;
    if (preset !== 'custom') {
      filterState.customDateFrom = undefined;
      filterState.customDateTo = undefined;
    }
    syncContextKeys();
    refreshList();
  }

  function setGroupMode(mode: GroupMode) {
    filterState.groupMode = mode;
    syncContextKeys();
    refreshList();
  }

  // Initialize context keys
  syncContextKeys();

  // Register session list webview view
  const listViewProvider = new SessionListViewProvider(
    context.extensionPath,
    (query) => {
      filterState.searchQuery = query;
      syncContextKeys();
      refreshList();
    },
    (sessionId) => {
      vscode.commands.executeCommand('argus.openSessionDetail', sessionId);
    },
    (model) => {
      filterState.selectedModels = model ? [model] : [];
      syncContextKeys();
      refreshList();
    },
    (preset, from, to) => {
      filterState.datePreset = preset as any;
      if (preset === 'custom') {
        filterState.customDateFrom = from;
        filterState.customDateTo = to;
      } else {
        filterState.customDateFrom = undefined;
        filterState.customDateTo = undefined;
      }
      syncContextKeys();
      refreshList();
    }
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SessionListViewProvider.viewId, listViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // --- Commands ---

  context.subscriptions.push(
    vscode.commands.registerCommand('argus.refreshSessions', async () => {
      try {
        await discoveryService.refreshDiscovery();
        allSessions = await discoveryService.getSessionList(true);
        refreshList();
        vscode.window.showInformationMessage(`Sessions refreshed (${allSessions.length} found)`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage('Failed to refresh sessions: ' + msg);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('argus.openSessionDetail', async (sessionId: string) => {
      try {
        await webviewProvider.openSessionDetail(sessionId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage('Failed to open session: ' + msg);
      }
    })
  );

  // Clear filters
  context.subscriptions.push(
    vscode.commands.registerCommand('argus.clearFilters', () => {
      filterState = { ...DEFAULT_FILTER_STATE };
      listViewProvider.clearSearch();
      syncContextKeys();
      refreshList();
    })
  );

  // Model toggles
  context.subscriptions.push(
    vscode.commands.registerCommand('argus.toggleModelOpus', () => toggleModel('opus')),
    vscode.commands.registerCommand('argus.toggleModelSonnet', () => toggleModel('sonnet')),
    vscode.commands.registerCommand('argus.toggleModelHaiku', () => toggleModel('haiku'))
  );

  // Date presets
  context.subscriptions.push(
    vscode.commands.registerCommand('argus.setDateAll', () => setDatePreset('all')),
    vscode.commands.registerCommand('argus.setDate1h', () => setDatePreset('1h')),
    vscode.commands.registerCommand('argus.setDate24h', () => setDatePreset('24h')),
    vscode.commands.registerCommand('argus.setDate7d', () => setDatePreset('7d')),
    vscode.commands.registerCommand('argus.setDate30d', () => setDatePreset('30d'))
  );

  // Custom date range
  context.subscriptions.push(
    vscode.commands.registerCommand('argus.setDateCustom', () => {
      DatePickerPanel.show(context, (from, to) => {
        filterState.datePreset = 'custom';
        filterState.customDateFrom = from;
        filterState.customDateTo = to;
        syncContextKeys();
        refreshList();
      });
    })
  );

  // Grouping
  context.subscriptions.push(
    vscode.commands.registerCommand('argus.setGroupNone', () => setGroupMode('none')),
    vscode.commands.registerCommand('argus.setGroupProject', () => setGroupMode('project')),
    vscode.commands.registerCommand('argus.setGroupModel', () => setGroupMode('model'))
  );

  // Initial discovery
  discoveryService.refreshDiscovery().then(async () => {
    allSessions = await discoveryService.getSessionList();
    refreshList();
  });

  // Watch for .claude directory changes
  const watcher = vscode.workspace.createFileSystemWatcher('**/.claude/projects/**/*.jsonl');

  watcher.onDidCreate(async () => {
    await discoveryService.refreshDiscovery();
    allSessions = await discoveryService.getSessionList(true);
    refreshList();
  });

  watcher.onDidChange(async () => {
    allSessions = await discoveryService.getSessionList();
    refreshList();
  });

  watcher.onDidDelete(async () => {
    await discoveryService.refreshDiscovery();
    allSessions = await discoveryService.getSessionList(true);
    refreshList();
  });

  context.subscriptions.push(watcher);

  // Status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(pulse) Argus';
  statusBarItem.tooltip = 'Claude Code Session Debugger';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate() {}
