import * as vscode from 'vscode';
import * as path from 'path';
import { SessionSummary, FilterState } from '../types/models';

export class SessionListViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'argusSessionList';
  private _view?: vscode.WebviewView;
  private _sessions: SessionSummary[] = [];
  private _filterState?: FilterState;
  private _extensionPath: string;

  constructor(
    extensionPath: string,
    private readonly _onSearch: (query: string) => void,
    private readonly _onOpenSession: (sessionId: string) => void,
    private readonly _onModelFilter: (model: string) => void,
    private readonly _onDateFilter: (preset: string, from?: number, to?: number) => void
  ) {
    this._extensionPath = extensionPath;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this._extensionPath, 'resources'))],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case 'search':
          this._onSearch(message.query);
          break;
        case 'openSession':
          this._onOpenSession(message.sessionId);
          break;
        case 'modelFilter':
          this._onModelFilter(message.model);
          break;
        case 'dateFilter':
          this._onDateFilter(message.preset, message.from, message.to);
          break;
      }
    });
  }

  updateSessions(sessions: SessionSummary[], filterState: FilterState): void {
    this._sessions = sessions;
    this._filterState = filterState;
    this._view?.webview.postMessage({
      type: 'update',
      sessions: sessions.map(s => ({
        ...s,
        timestamp: s.timestamp.toISOString(),
        lastModified: s.lastModified.toISOString(),
      })),
      filterState,
    });
  }

  clearSearch(): void {
    this._view?.webview.postMessage({ type: 'clearSearch' });
    this._view?.webview.postMessage({ type: 'clearModelFilter' });
    this._view?.webview.postMessage({ type: 'clearDateFilter' });
  }

  private getHtml(webview: vscode.Webview): string {
    const liveIconUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this._extensionPath, 'resources', 'live.svg'))
    );
    const sessionIconUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this._extensionPath, 'resources', 'session.svg'))
    );

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: transparent;
    overflow-x: hidden;
  }

  /* Search */
  .search-area {
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 8px 12px 6px;
    background: var(--vscode-sideBar-background);
  }
  .search-wrap {
    display: flex;
    align-items: center;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    padding: 0 8px;
  }
  .search-wrap:focus-within {
    border-color: var(--vscode-focusBorder);
  }
  .search-icon {
    color: var(--vscode-input-placeholderForeground);
    flex-shrink: 0;
    width: 14px;
    height: 14px;
  }
  .search-icon svg { display: block; }
  input {
    width: 100%;
    padding: 4px 6px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    background: transparent;
    color: var(--vscode-input-foreground);
    border: none;
    outline: none;
  }
  input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }
  .clear-btn {
    background: none;
    border: none;
    color: var(--vscode-input-placeholderForeground);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0 2px;
    display: none;
    flex-shrink: 0;
  }
  .clear-btn:hover { color: var(--vscode-input-foreground); }
  .clear-btn.visible { display: block; }

  .divider {
    width: 1px;
    height: 14px;
    background: var(--vscode-input-border, var(--vscode-widget-border, rgba(128,128,128,0.25)));
    flex-shrink: 0;
    margin: 0 6px;
  }

  /* Custom dropdown */
  .dropdown {
    position: relative;
    flex-shrink: 0;
  }
  .dropdown-trigger {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    border: none;
    background: transparent;
    color: var(--vscode-input-placeholderForeground);
    font-size: 11px;
    font-family: var(--vscode-font-family);
    white-space: nowrap;
    user-select: none;
    transition: color 0.1s, background 0.1s;
  }
  .dropdown-trigger:hover {
    color: var(--vscode-input-foreground);
    background: rgba(128,128,128,0.1);
  }
  .dropdown.open .dropdown-trigger,
  .dropdown-trigger.has-value {
    color: var(--vscode-input-foreground);
  }
  .dropdown-trigger-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }
  .dropdown-trigger-label {
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dropdown-trigger-chevron {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
    transition: transform 0.15s;
  }
  .dropdown.open .dropdown-trigger-chevron {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    right: -4px;
    min-width: 150px;
    background: var(--vscode-dropdown-background, var(--vscode-menu-background));
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-menu-border, var(--vscode-widget-border)));
    border-radius: 5px;
    padding: 4px 0;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.1);
    animation: dropdownIn 0.12s ease-out;
  }
  @keyframes dropdownIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .dropdown.open .dropdown-menu {
    display: block;
  }
  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px 4px 8px;
    cursor: pointer;
    color: var(--vscode-dropdown-foreground, var(--vscode-menu-foreground));
    font-size: 12px;
    font-family: var(--vscode-font-family);
    white-space: nowrap;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    transition: background 0.08s;
  }
  .dropdown-item:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .dropdown-item-check {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--vscode-focusBorder);
    opacity: 0;
  }
  .dropdown-item.selected .dropdown-item-check {
    opacity: 1;
  }
  .dropdown-item-label {
    flex: 1;
  }
  .dropdown-separator {
    height: 1px;
    background: var(--vscode-menu-separatorBackground, var(--vscode-widget-border, rgba(128,128,128,0.25)));
    margin: 4px 8px;
  }
  .dropdown-item-shortcut {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.7;
    margin-left: auto;
    padding-left: 12px;
  }

  /* Custom calendar picker */
  .cal-area {
    display: none;
    padding: 0;
    animation: calIn 0.15s ease-out;
  }
  @keyframes calIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .cal-area.visible { display: block; }

  .cal-sep {
    height: 1px;
    background: var(--vscode-menu-separatorBackground, var(--vscode-widget-border, rgba(128,128,128,0.25)));
    margin: 4px 0 0;
  }
  .cal-wrap {
    padding: 8px 10px 10px;
  }

  /* Range display */
  .cal-range-display {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
  }
  .cal-range-pill {
    flex: 1;
    text-align: center;
    padding: 4px 6px;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    background: var(--vscode-input-background);
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
    border-radius: 4px;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cal-range-pill.active {
    border-color: var(--vscode-focusBorder);
    color: var(--vscode-input-foreground);
  }
  .cal-range-pill.has-date {
    color: var(--vscode-input-foreground);
  }
  .cal-range-arrow {
    color: var(--vscode-descriptionForeground);
    opacity: 0.4;
    flex-shrink: 0;
  }

  /* Calendar header */
  .cal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .cal-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.08s, color 0.08s;
  }
  .cal-nav:hover {
    background: var(--vscode-list-hoverBackground);
    color: var(--vscode-foreground);
  }
  .cal-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--vscode-foreground);
    user-select: none;
  }

  /* Calendar grid */
  .cal-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: 2px;
  }
  .cal-wd {
    text-align: center;
    font-size: 9px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    padding: 2px 0;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    opacity: 0.7;
  }
  .cal-days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
  }
  .cal-day {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 1;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.08s;
    position: relative;
  }
  .cal-day:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .cal-day.other-month {
    color: var(--vscode-disabledForeground, rgba(128,128,128,0.4));
  }
  .cal-day.today {
    font-weight: 700;
    color: var(--vscode-focusBorder);
  }
  .cal-day.in-range {
    background: var(--vscode-editor-selectionBackground, rgba(38,79,120,0.3));
    border-radius: 0;
  }
  .cal-day.range-start {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 4px 0 0 4px;
    font-weight: 600;
  }
  .cal-day.range-end {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 0 4px 4px 0;
    font-weight: 600;
  }
  .cal-day.range-start.range-end {
    border-radius: 4px;
  }

  /* Calendar actions */
  .cal-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    margin-top: 8px;
  }
  .cal-btn {
    padding: 4px 14px;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .cal-btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .cal-btn.primary:hover {
    background: var(--vscode-button-hoverBackground);
  }
  .cal-btn.primary:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .cal-btn.secondary {
    background: transparent;
    color: var(--vscode-descriptionForeground);
  }
  .cal-btn.secondary:hover {
    color: var(--vscode-foreground);
  }

  /* Session list */
  .session-list {
    padding: 2px 0;
  }

  /* Group headers */
  .group-header {
    display: flex;
    align-items: center;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
    background: var(--vscode-sideBarSectionHeader-background, transparent);
    cursor: pointer;
    user-select: none;
  }
  .group-header:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .group-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-right: 2px;
    flex-shrink: 0;
    transition: transform 0.15s;
  }
  .group-chevron.collapsed { transform: rotate(-90deg); }
  .group-icon {
    width: 14px;
    height: 14px;
    margin-right: 5px;
    flex-shrink: 0;
    opacity: 0.8;
  }
  .group-count {
    margin-left: auto;
    opacity: 0.6;
    font-weight: normal;
  }

  /* Session items */
  .session-item {
    display: flex;
    align-items: center;
    padding: 4px 12px;
    cursor: pointer;
    gap: 8px;
    min-height: 22px;
  }
  .session-item.grouped {
    padding-left: 32px;
  }
  .session-item:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .session-item:focus {
    background: var(--vscode-list-focusBackground);
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
  .session-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .session-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--vscode-foreground);
  }
  .session-desc {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }

  /* Empty state */
  .empty {
    padding: 20px 12px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }
</style>
</head>
<body>
  <div class="search-area">
    <div class="search-wrap">
      <span class="search-icon">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
      </span>
      <input type="text" id="search" placeholder="Search sessions..." spellcheck="false">
      <button class="clear-btn" id="clearBtn">&times;</button>
      <span class="divider"></span>
      <div class="dropdown" id="modelDropdown">
        <button class="dropdown-trigger" id="modelTrigger">
          <svg class="dropdown-trigger-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 12v-1h4v1H6zM4 8v-1h8v1H4zM2 4v-1h12v1H2z"/>
          </svg>
          <span class="dropdown-trigger-label" id="modelLabel">All</span>
          <svg class="dropdown-trigger-chevron" viewBox="0 0 16 16" fill="currentColor">
            <path d="M7.976 10.072l4.357-4.357.619.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/>
          </svg>
        </button>
        <div class="dropdown-menu" id="modelMenu">
          <button class="dropdown-item selected" data-value="">
            <svg class="dropdown-item-check" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
            <span class="dropdown-item-label">All Models</span>
          </button>
          <div class="dropdown-separator"></div>
          <button class="dropdown-item" data-value="opus">
            <svg class="dropdown-item-check" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
            <span class="dropdown-item-label">Opus</span>
          </button>
          <button class="dropdown-item" data-value="sonnet">
            <svg class="dropdown-item-check" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
            <span class="dropdown-item-label">Sonnet</span>
          </button>
          <button class="dropdown-item" data-value="haiku">
            <svg class="dropdown-item-check" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
            <span class="dropdown-item-label">Haiku</span>
          </button>
        </div>
      </div>
      <span class="divider"></span>
      <div class="dropdown" id="dateDropdown">
        <button class="dropdown-trigger" id="dateTrigger">
          <svg class="dropdown-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6.5"/>
            <path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>
            <circle cx="18" cy="18" r="3"/><path d="m22 22-1.5-1.5"/>
          </svg>
          <span class="dropdown-trigger-label" id="dateLabel">All</span>
          <svg class="dropdown-trigger-chevron" viewBox="0 0 16 16" fill="currentColor">
            <path d="M7.976 10.072l4.357-4.357.619.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/>
          </svg>
        </button>
        <div class="dropdown-menu" id="dateMenu">
          <button class="dropdown-item selected" data-value="all">
            <svg class="dropdown-item-check" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
            <span class="dropdown-item-label">All Time</span>
          </button>
          <div class="dropdown-separator"></div>
          <button class="dropdown-item" data-value="1h">
            <svg class="dropdown-item-check" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
            <span class="dropdown-item-label">Last 1 hour</span>
            <span class="dropdown-item-shortcut">1h</span>
          </button>
          <button class="dropdown-item" data-value="24h">
            <svg class="dropdown-item-check" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
            <span class="dropdown-item-label">Last 24 hours</span>
            <span class="dropdown-item-shortcut">24h</span>
          </button>
          <button class="dropdown-item" data-value="7d">
            <svg class="dropdown-item-check" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
            <span class="dropdown-item-label">Last 7 days</span>
            <span class="dropdown-item-shortcut">7d</span>
          </button>
          <button class="dropdown-item" data-value="30d">
            <svg class="dropdown-item-check" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
            <span class="dropdown-item-label">Last 30 days</span>
            <span class="dropdown-item-shortcut">30d</span>
          </button>
          <div class="dropdown-separator"></div>
          <button class="dropdown-item" data-value="custom" id="dateCustomToggle">
            <svg class="dropdown-item-check" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
            <span class="dropdown-item-label">Custom range...</span>
          </button>
          <div class="cal-area" id="calArea">
            <div class="cal-sep"></div>
            <div class="cal-wrap">
              <div class="cal-range-display">
                <div class="cal-range-pill active" id="calFromPill">From</div>
                <svg class="cal-range-arrow" width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/></svg>
                <div class="cal-range-pill" id="calToPill">To</div>
              </div>
              <div class="cal-header">
                <button class="cal-nav" id="calPrev">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>
                </button>
                <span class="cal-title" id="calTitle"></span>
                <button class="cal-nav" id="calNext">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>
                </button>
              </div>
              <div class="cal-weekdays" id="calWeekdays"></div>
              <div class="cal-days" id="calDays"></div>
              <div class="cal-actions">
                <button class="cal-btn secondary" id="calCancel">Cancel</button>
                <button class="cal-btn primary" id="calApply" disabled>Apply</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="session-list" id="list"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('search');
    const clearBtn = document.getElementById('clearBtn');
    const listEl = document.getElementById('list');
    const LIVE_ICON = '${liveIconUri}';
    const SESSION_ICON = '${sessionIconUri}';

    // Custom dropdown
    const dropdown = document.getElementById('modelDropdown');
    const trigger = document.getElementById('modelTrigger');
    const modelLabel = document.getElementById('modelLabel');
    const modelMenu = document.getElementById('modelMenu');
    let selectedModel = '';

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dateDropdown.classList.remove('open');
      dropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
      dateDropdown.classList.remove('open');
    });

    modelMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    modelMenu.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const val = item.dataset.value;
        selectedModel = val;
        const labels = { '': 'All', 'opus': 'Opus', 'sonnet': 'Sonnet', 'haiku': 'Haiku' };
        modelLabel.textContent = labels[val] || 'All';
        trigger.classList.toggle('has-value', val !== '');

        modelMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');

        dropdown.classList.remove('open');
        vscode.postMessage({ type: 'modelFilter', model: val });
      });
    });

    // Date dropdown
    const dateDropdown = document.getElementById('dateDropdown');
    const dateTrigger = document.getElementById('dateTrigger');
    const dateLabel = document.getElementById('dateLabel');
    const dateMenu = document.getElementById('dateMenu');
    const dateCustomToggle = document.getElementById('dateCustomToggle');
    const calArea = document.getElementById('calArea');
    const calFromPill = document.getElementById('calFromPill');
    const calToPill = document.getElementById('calToPill');
    const calTitle = document.getElementById('calTitle');
    const calWeekdays = document.getElementById('calWeekdays');
    const calDays = document.getElementById('calDays');
    const calPrev = document.getElementById('calPrev');
    const calNext = document.getElementById('calNext');
    const calApply = document.getElementById('calApply');
    const calCancel = document.getElementById('calCancel');
    let selectedDate = 'all';

    // Calendar state
    let calViewYear = new Date().getFullYear();
    let calViewMonth = new Date().getMonth();
    let calFromDate = null;
    let calToDate = null;
    let calSelecting = 'from'; // 'from' or 'to'

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

    function calInit() {
      calWeekdays.innerHTML = WEEKDAYS.map(d => '<div class="cal-wd">' + d + '</div>').join('');
    }
    calInit();

    function formatDateShort(d) {
      if (!d) return null;
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + mm + '-' + dd;
    }
    function formatPill(d) {
      if (!d) return null;
      return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }
    function sameDay(a, b) {
      return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }
    function dayTs(d) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }

    function calRender() {
      calTitle.textContent = MONTHS[calViewMonth] + ' ' + calViewYear;

      // First day of month (shift to Monday-start)
      const first = new Date(calViewYear, calViewMonth, 1);
      let startDay = first.getDay() - 1;
      if (startDay < 0) startDay = 6;
      const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
      const daysInPrev = new Date(calViewYear, calViewMonth, 0).getDate();

      const today = new Date();
      let html = '';

      // Previous month's trailing days
      for (let i = startDay - 1; i >= 0; i--) {
        const day = daysInPrev - i;
        html += '<button class="cal-day other-month" data-y="' + (calViewMonth === 0 ? calViewYear-1 : calViewYear) + '" data-m="' + (calViewMonth === 0 ? 11 : calViewMonth-1) + '" data-d="' + day + '">' + day + '</button>';
      }

      // Current month
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(calViewYear, calViewMonth, d);
        let cls = 'cal-day';
        if (dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate()) cls += ' today';
        if (sameDay(dt, calFromDate)) cls += ' range-start';
        if (sameDay(dt, calToDate)) cls += ' range-end';
        if (calFromDate && calToDate && dayTs(dt) > dayTs(calFromDate) && dayTs(dt) < dayTs(calToDate)) cls += ' in-range';
        html += '<button class="' + cls + '" data-y="' + calViewYear + '" data-m="' + calViewMonth + '" data-d="' + d + '">' + d + '</button>';
      }

      // Next month's leading days
      const totalCells = startDay + daysInMonth;
      const remaining = (7 - (totalCells % 7)) % 7;
      for (let d = 1; d <= remaining; d++) {
        html += '<button class="cal-day other-month" data-y="' + (calViewMonth === 11 ? calViewYear+1 : calViewYear) + '" data-m="' + (calViewMonth === 11 ? 0 : calViewMonth+1) + '" data-d="' + d + '">' + d + '</button>';
      }

      calDays.innerHTML = html;

      // Update pills
      calFromPill.textContent = formatPill(calFromDate) || 'From';
      calFromPill.classList.toggle('has-date', !!calFromDate);
      calFromPill.classList.toggle('active', calSelecting === 'from');
      calToPill.textContent = formatPill(calToDate) || 'To';
      calToPill.classList.toggle('has-date', !!calToDate);
      calToPill.classList.toggle('active', calSelecting === 'to');

      calApply.disabled = !(calFromDate && calToDate);

      // Bind day clicks
      calDays.querySelectorAll('.cal-day').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const y = parseInt(btn.dataset.y);
          const m = parseInt(btn.dataset.m);
          const d = parseInt(btn.dataset.d);
          const picked = new Date(y, m, d);

          if (calSelecting === 'from') {
            calFromDate = picked;
            // If from > to, reset to
            if (calToDate && dayTs(picked) > dayTs(calToDate)) calToDate = null;
            calSelecting = 'to';
          } else {
            if (dayTs(picked) < dayTs(calFromDate)) {
              // If picked before from, swap: set as new from
              calToDate = calFromDate;
              calFromDate = picked;
            } else {
              calToDate = picked;
            }
            calSelecting = 'from';
          }
          calRender();
        });
      });
    }

    calFromPill.addEventListener('click', (e) => {
      e.stopPropagation();
      calSelecting = 'from';
      calRender();
    });
    calToPill.addEventListener('click', (e) => {
      e.stopPropagation();
      calSelecting = 'to';
      calRender();
    });

    calPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      calViewMonth--;
      if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
      calRender();
    });
    calNext.addEventListener('click', (e) => {
      e.stopPropagation();
      calViewMonth++;
      if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
      calRender();
    });

    const dateLabels = { 'all': 'All', '1h': '1h', '24h': '24h', '7d': '7d', '30d': '30d', 'custom': 'Custom' };

    dateTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('open');
      dateDropdown.classList.toggle('open');
    });

    dateMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    dateMenu.querySelectorAll('.dropdown-item').forEach(item => {
      if (item.id === 'dateCustomToggle') return;
      item.addEventListener('click', () => {
        const val = item.dataset.value;
        selectedDate = val;
        dateLabel.textContent = dateLabels[val] || 'All';
        dateTrigger.classList.toggle('has-value', val !== 'all');

        dateMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        calArea.classList.remove('visible');

        dateDropdown.classList.remove('open');
        vscode.postMessage({ type: 'dateFilter', preset: val });
      });
    });

    dateCustomToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const showing = calArea.classList.toggle('visible');
      if (showing) {
        calViewYear = new Date().getFullYear();
        calViewMonth = new Date().getMonth();
        if (!calFromDate) calSelecting = 'from';
        calRender();
      }
    });

    calApply.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!calFromDate || !calToDate) return;
      const from = new Date(calFromDate.getFullYear(), calFromDate.getMonth(), calFromDate.getDate());
      const to = new Date(calToDate.getFullYear(), calToDate.getMonth(), calToDate.getDate(), 23, 59, 59, 999);

      selectedDate = 'custom';
      const fStr = formatDateShort(calFromDate);
      const tStr = formatDateShort(calToDate);
      dateLabel.textContent = fStr.slice(5) + ' ~ ' + tStr.slice(5);
      dateTrigger.classList.add('has-value');

      dateMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
      dateCustomToggle.classList.add('selected');
      calArea.classList.remove('visible');

      dateDropdown.classList.remove('open');
      vscode.postMessage({ type: 'dateFilter', preset: 'custom', from: from.getTime(), to: to.getTime() });
    });

    calCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      calArea.classList.remove('visible');
    });

    let sessions = [];
    let filterState = {};
    let collapsedGroups = new Set();
    let debounceTimer;

    // Search input
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      clearBtn.classList.toggle('visible', input.value.length > 0);
      debounceTimer = setTimeout(() => {
        vscode.postMessage({ type: 'search', query: input.value });
      }, 250);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.remove('visible');
      vscode.postMessage({ type: 'search', query: '' });
      input.focus();
    });

    // Messages from extension
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'update') {
        sessions = msg.sessions;
        filterState = msg.filterState;
        render();
      } else if (msg.type === 'clearSearch') {
        input.value = '';
        clearBtn.classList.remove('visible');
      } else if (msg.type === 'clearModelFilter') {
        selectedModel = '';
        modelLabel.textContent = 'All';
        trigger.classList.remove('has-value');
        modelMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
        modelMenu.querySelector('.dropdown-item[data-value=""]').classList.add('selected');
      } else if (msg.type === 'clearDateFilter') {
        selectedDate = 'all';
        dateLabel.textContent = 'All';
        dateTrigger.classList.remove('has-value');
        dateMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
        dateMenu.querySelector('.dropdown-item[data-value="all"]').classList.add('selected');
        calArea.classList.remove('visible');
        calFromDate = null;
        calToDate = null;
        calSelecting = 'from';
      }
    });

    function relativeTime(isoStr) {
      const diff = Date.now() - new Date(isoStr).getTime();
      const sec = Math.floor(diff / 1000);
      if (sec < 60) return 'just now';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'm ago';
      const hr = Math.floor(min / 60);
      if (hr < 24) return hr + 'h ago';
      const days = Math.floor(hr / 24);
      if (days < 7) return days + 'd ago';
      if (days < 30) return Math.floor(days / 7) + 'w ago';
      return Math.floor(days / 30) + 'mo ago';
    }

    function formatModel(model) {
      if (model.includes('opus')) return 'Opus';
      if (model.includes('sonnet')) return 'Sonnet';
      if (model.includes('haiku')) return 'Haiku';
      return model || '';
    }

    function shortProject(project) {
      if (!project) return '';
      return project.includes('/') ? project.split('/').pop() : project;
    }

    function normalizeModel(model) {
      if (model.includes('opus')) return 'opus';
      if (model.includes('sonnet')) return 'sonnet';
      if (model.includes('haiku')) return 'haiku';
      return 'unknown';
    }

    function getGroupKey(s) {
      if (filterState.groupMode === 'project') return s.project || 'Unknown Project';
      if (filterState.groupMode === 'model') return normalizeModel(s.model);
      return '';
    }

    function getGroupLabel(key) {
      if (filterState.groupMode === 'model') {
        if (key === 'opus') return 'Claude Opus';
        if (key === 'sonnet') return 'Claude Sonnet';
        if (key === 'haiku') return 'Claude Haiku';
        return key;
      }
      if (key.includes('/')) return key.split('/').pop();
      return key;
    }

    function groupIcon() {
      if (filterState.groupMode === 'project') {
        return '<svg class="group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/></svg>';
      }
      if (filterState.groupMode === 'model') {
        return '<svg class="group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>';
      }
      return '';
    }

    function renderSessionItem(s, grouped) {
      const icon = s.isActive ? LIVE_ICON : SESSION_ICON;
      const desc = [formatModel(s.model), shortProject(s.project), relativeTime(s.lastModified)]
        .filter(Boolean).join(' · ');
      const cls = grouped ? 'session-item grouped' : 'session-item';
      return '<div class="' + cls + '" tabindex="0" data-id="' + s.sessionId + '">'
        + '<img class="session-icon" src="' + icon + '">'
        + '<span class="session-label">' + escapeHtml(s.prompt || 'Untitled Session') + '</span>'
        + '<span class="session-desc">' + escapeHtml(desc) + '</span>'
        + '</div>';
    }

    function escapeHtml(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function render() {
      if (!sessions.length) {
        listEl.innerHTML = '<div class="empty">No sessions found</div>';
        return;
      }

      const groupMode = filterState.groupMode || 'none';

      if (groupMode === 'none') {
        listEl.innerHTML = sessions.map(s => renderSessionItem(s, false)).join('');
      } else {
        const groups = new Map();
        for (const s of sessions) {
          const key = getGroupKey(s);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(s);
        }

        let html = '';
        const sorted = Array.from(groups.entries()).sort(([a],[b]) => a.localeCompare(b));
        for (const [key, items] of sorted) {
          const isCollapsed = collapsedGroups.has(key);
          const chevronCls = isCollapsed ? 'group-chevron collapsed' : 'group-chevron';
          const chevronSvg = '<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M7.976 10.072l4.357-4.357.619.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg>';
          html += '<div class="group-header" data-group="' + escapeHtml(key) + '">'
            + '<span class="' + chevronCls + '">' + chevronSvg + '</span>'
            + groupIcon()
            + escapeHtml(getGroupLabel(key))
            + '<span class="group-count">' + items.length + '</span>'
            + '</div>';
          if (!isCollapsed) {
            html += items.map(s => renderSessionItem(s, true)).join('');
          }
        }
        listEl.innerHTML = html;
      }

      // Bind click handlers
      listEl.querySelectorAll('.session-item').forEach(el => {
        el.addEventListener('click', () => {
          vscode.postMessage({ type: 'openSession', sessionId: el.dataset.id });
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            vscode.postMessage({ type: 'openSession', sessionId: el.dataset.id });
          }
        });
      });

      listEl.querySelectorAll('.group-header').forEach(el => {
        el.addEventListener('click', () => {
          const key = el.dataset.group;
          if (collapsedGroups.has(key)) {
            collapsedGroups.delete(key);
          } else {
            collapsedGroups.add(key);
          }
          render();
        });
      });
    }
  </script>
</body>
</html>`;
  }
}
