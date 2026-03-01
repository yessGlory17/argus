import * as vscode from 'vscode';
import { ParserService } from '../services/parserService';
import { AnalyzerService } from '../services/analyzerService';
import { DiscoveryService } from '../services/discoveryService';
import { SessionDetail } from '../types/models';

export class SessionWebviewProvider {
  private panels: Map<string, vscode.WebviewPanel> = new Map();

  constructor(
    private context: vscode.ExtensionContext,
    private discoveryService: DiscoveryService,
    private parserService: ParserService,
    private analyzerService: AnalyzerService
  ) {}

  async openSessionDetail(sessionId: string): Promise<void> {
    // Open overview tab by default
    return this.openSessionTab(sessionId, 'overview');
  }

  async openSessionTab(sessionId: string, tabType: string): Promise<void> {
    const panelKey = `${sessionId}-${tabType}`;
    
    // Check if panel already exists
    const existingPanel = this.panels.get(panelKey);
    if (existingPanel) {
      existingPanel.reveal();
      return;
    }

    // Load session data
    const sessionData = await this.loadSessionData(sessionId);
    if (!sessionData) {
      vscode.window.showErrorMessage('Failed to load session data');
      return;
    }

    // Create webview panel - open beside (to the right)
    const tabTitle = this.getTabTitle(tabType);
    const panel = vscode.window.createWebviewPanel(
      'argusSessionTab',
      `${sessionData.prompt.substring(0, 30)}... - ${tabTitle}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    // Generate HTML content based on tab type
    panel.webview.html = this.getTabContent(panel.webview, sessionData, tabType);

    // Track panel
    this.panels.set(panelKey, panel);

    // Clean up when panel is closed
    panel.onDidDispose(() => {
      this.panels.delete(panelKey);
    });
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

    panel.webview.html = this.getDashboardContent(panel.webview, sessions);
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
      const events = await this.parserService.parseFile(sessionInfo.filePath);
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

  private getTabTitle(tabType: string): string {
    switch (tabType) {
      case 'overview': return 'Overview';
      case 'steps': return 'Steps';
      case 'findings': return 'Findings';
      case 'files': return 'Files';
      case 'subagents': return 'Subagents';
      case 'cost': return 'Cost Analysis';
      default: return tabType;
    }
  }

  private getTabContent(webview: vscode.Webview, session: SessionDetail, tabType: string): string {
    const analysis = session.analysis;
    const baseStyles = this.getBaseStyles();

    switch (tabType) {
      case 'overview':
        return this.getOverviewContent(webview, session, analysis, baseStyles);
      case 'steps':
        return this.getStepsContent(webview, session, baseStyles);
      case 'findings':
        return this.getFindingsContent(webview, session, analysis, baseStyles);
      case 'files':
        return this.getFilesContent(webview, session, baseStyles);
      case 'subagents':
        return this.getSubagentsContent(webview, session, baseStyles);
      case 'cost':
        return this.getCostContent(webview, session, analysis, baseStyles);
      default:
        return this.getOverviewContent(webview, session, analysis, baseStyles);
    }
  }

  private getBaseStyles(): string {
    return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
        padding: 20px;
        line-height: 1.6;
      }

      h1 {
        font-size: 24px;
        margin-bottom: 20px;
        border-bottom: 2px solid var(--vscode-panel-border);
        padding-bottom: 10px;
      }

      h2 {
        font-size: 18px;
        margin: 20px 0 10px 0;
        color: var(--vscode-foreground);
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
      }

      .stat-card {
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        padding: 15px;
      }

      .stat-label {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 5px;
      }

      .stat-value {
        font-size: 20px;
        font-weight: bold;
      }

      .finding {
        background: var(--vscode-editorWidget-background);
        border-left: 3px solid;
        border-radius: 4px;
        padding: 15px;
        margin-bottom: 10px;
      }

      .finding.error { border-color: var(--vscode-errorForeground); }
      .finding.warning { border-color: var(--vscode-editorWarning-foreground); }
      .finding.info { border-color: var(--vscode-editorInfo-foreground); }

      .step {
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-panel-border);
        padding: 10px;
        margin-bottom: 5px;
        border-radius: 4px;
      }

      .file-item {
        padding: 5px 10px;
        margin: 3px 0;
        background: var(--vscode-editorWidget-background);
        border-radius: 3px;
        font-family: monospace;
        font-size: 13px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }

      th, td {
        padding: 8px;
        text-align: left;
        border-bottom: 1px solid var(--vscode-panel-border);
      }

      th {
        background: var(--vscode-editorWidget-background);
        font-weight: bold;
      }
    `;
  }

  private getOverviewContent(webview: vscode.Webview, session: SessionDetail, analysis: any, baseStyles: string): string {
    return `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <style>${baseStyles}</style>
</head><body>
  <h1>📊 Overview</h1>
  <p><strong>Prompt:</strong> ${this.escapeHtml(session.prompt)}</p>
  <p><strong>Project:</strong> ${this.escapeHtml(session.project)}</p>
  <p><strong>Model:</strong> ${this.escapeHtml(session.model)}</p>
  
  <h2>Statistics</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total Steps</div>
      <div class="stat-value">${session.steps.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Cost</div>
      <div class="stat-value">$${session.totalCost.toFixed(4)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Efficiency</div>
      <div class="stat-value">${(analysis?.efficiency || 100).toFixed(1)}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Duration</div>
      <div class="stat-value">${(session.durationMs / 1000).toFixed(1)}s</div>
    </div>
  </div>
</body></html>`;
  }

    private getStepsContent(webview: vscode.Webview, session: SessionDetail, baseStyles: string): string {
    // Safely escape JSON for embedding in HTML
    const stepsData = JSON.stringify(session.steps)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');

    return `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <style>
    ${baseStyles}

    .step {
      cursor: pointer;
      transition: background 0.2s;
    }

    .step:hover {
      background: var(--vscode-list-hoverBackground) !important;
    }

    .step.expanded {
      background: var(--vscode-list-activeSelectionBackground) !important;
    }

    .step-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .step-details {
      display: none;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--vscode-panel-border);
      font-size: 13px;
    }

    .step.expanded .step-details {
      display: block;
    }

    .detail-section {
      margin-bottom: 10px;
    }

    .detail-label {
      font-weight: bold;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 3px;
    }

    .detail-content {
      background: var(--vscode-editor-background);
      padding: 8px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 300px;
      overflow-y: auto;
    }

    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      margin-left: 5px;
    }

    .badge.success {
      background: var(--vscode-testing-iconPassed);
      color: white;
    }

    .badge.error {
      background: var(--vscode-testing-iconFailed);
      color: white;
    }
  </style>
</head><body>
  <h1>📝 Steps (${session.steps.length} total)</h1>
  <div id="steps-container"></div>

  <script>
    (function() {
      try {
        const steps = ${stepsData};
        const container = document.getElementById('steps-container');

        if (!container) {
          console.error('Steps container not found');
          return;
        }

        steps.forEach((step, idx) => {
          const stepDiv = document.createElement('div');
          stepDiv.className = 'step';
          stepDiv.onclick = () => toggleStep(idx);

          // Step header
          const header = document.createElement('div');
          header.className = 'step-header';

          const leftInfo = document.createElement('span');
          const toolName = step.toolName ? '(' + step.toolName + ')' : '';
          const successBadge = step.toolSuccess === true ? '<span class="badge success">✓</span>' : '';
          const errorBadge = step.toolSuccess === false ? '<span class="badge error">✗</span>' : '';
          leftInfo.innerHTML = '<strong>#' + step.index + '</strong> - ' + step.type + ' ' + toolName + ' ' + successBadge + errorBadge;

          const rightInfo = document.createElement('span');
          rightInfo.textContent = '$' + (step.cost || 0).toFixed(4);

          header.appendChild(leftInfo);
          header.appendChild(rightInfo);
          stepDiv.appendChild(header);

          // Step details (hidden by default)
          const details = document.createElement('div');
          details.className = 'step-details';

          // Timestamp
          if (step.timestamp) {
            const tsSection = document.createElement('div');
            tsSection.className = 'detail-section';
            const tsLabel = document.createElement('div');
            tsLabel.className = 'detail-label';
            tsLabel.textContent = '⏰ Timestamp';
            const tsContent = document.createElement('div');
            tsContent.className = 'detail-content';
            tsContent.textContent = new Date(step.timestamp).toLocaleString();
            tsSection.appendChild(tsLabel);
            tsSection.appendChild(tsContent);
            details.appendChild(tsSection);
          }

          // Tool Input
          if (step.toolInput) {
            const inputSection = document.createElement('div');
            inputSection.className = 'detail-section';
            const inputLabel = document.createElement('div');
            inputLabel.className = 'detail-label';
            inputLabel.textContent = '📥 Tool Input';
            const inputContent = document.createElement('div');
            inputContent.className = 'detail-content';
            inputContent.textContent = JSON.stringify(step.toolInput, null, 2);
            inputSection.appendChild(inputLabel);
            inputSection.appendChild(inputContent);
            details.appendChild(inputSection);
          }

          // Tool Result
          if (step.toolResult) {
            const resultSection = document.createElement('div');
            resultSection.className = 'detail-section';
            const resultLabel = document.createElement('div');
            resultLabel.className = 'detail-label';
            resultLabel.textContent = '📤 Tool Result';
            const resultContent = document.createElement('div');
            resultContent.className = 'detail-content';
            const truncated = step.toolResult.substring(0, 1000);
            resultContent.textContent = truncated + (step.toolResult.length > 1000 ? '...' : '');
            resultSection.appendChild(resultLabel);
            resultSection.appendChild(resultContent);
            details.appendChild(resultSection);
          }

          // Thinking Content
          if (step.type === 'thinking' && step.content) {
            const thinkingSection = document.createElement('div');
            thinkingSection.className = 'detail-section';
            const thinkingLabel = document.createElement('div');
            thinkingLabel.className = 'detail-label';
            thinkingLabel.textContent = '💭 Thinking';
            const thinkingContent = document.createElement('div');
            thinkingContent.className = 'detail-content';
            const truncated = step.content.substring(0, 1000);
            thinkingContent.textContent = truncated + (step.content.length > 1000 ? '...' : '');
            thinkingSection.appendChild(thinkingLabel);
            thinkingSection.appendChild(thinkingContent);
            details.appendChild(thinkingSection);
          }

          // Text Content
          if (step.type === 'text' && step.content) {
            const textSection = document.createElement('div');
            textSection.className = 'detail-section';
            const textLabel = document.createElement('div');
            textLabel.className = 'detail-label';
            textLabel.textContent = '💬 Text';
            const textContent = document.createElement('div');
            textContent.className = 'detail-content';
            textContent.textContent = step.content;
            textSection.appendChild(textLabel);
            textSection.appendChild(textContent);
            details.appendChild(textSection);
          }

          // Usage
          if (step.usage) {
            const usageSection = document.createElement('div');
            usageSection.className = 'detail-section';
            const usageLabel = document.createElement('div');
            usageLabel.className = 'detail-label';
            usageLabel.textContent = '📊 Token Usage';
            const usageContent = document.createElement('div');
            usageContent.className = 'detail-content';
            usageContent.textContent = 'Input: ' + (step.usage.input_tokens || 0) + '\\n' +
              'Output: ' + (step.usage.output_tokens || 0) + '\\n' +
              'Cache Read: ' + (step.usage.cache_read_input_tokens || 0) + '\\n' +
              'Cache Create: ' + (step.usage.cache_creation_input_tokens || 0);
            usageSection.appendChild(usageLabel);
            usageSection.appendChild(usageContent);
            details.appendChild(usageSection);
          }

          stepDiv.appendChild(details);
          container.appendChild(stepDiv);
        });

        function toggleStep(idx) {
          const stepDivs = document.querySelectorAll('.step');
          if (stepDivs[idx]) {
            stepDivs[idx].classList.toggle('expanded');
          }
        }
      } catch (error) {
        console.error('Error rendering steps:', error);
        const container = document.getElementById('steps-container');
        if (container) {
          container.innerHTML = '<p style="color: var(--vscode-errorForeground);">Error loading steps: ' + error.message + '</p>';
        }
      }
    })();
  </script>
</body></html>`;
  }


  private getFindingsContent(webview: vscode.Webview, session: SessionDetail, analysis: any, baseStyles: string): string {
    const findings = analysis?.findings || [];
    const findingsHtml = findings.map((f: any) => `
      <div class="finding ${f.severity}">
        <strong>${this.escapeHtml(f.title)}</strong>
        <p>${this.escapeHtml(f.description)}</p>
        ${f.wastedCost > 0 ? `<p><em>Wasted: $${f.wastedCost.toFixed(4)}</em></p>` : ''}
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <style>${baseStyles}</style>
</head><body>
  <h1>⚠️ Findings (${findings.length})</h1>
  ${findings.length > 0 ? findingsHtml : '<p>No findings</p>'}
</body></html>`;
  }

  private getFilesContent(webview: vscode.Webview, session: SessionDetail, baseStyles: string): string {
    const readFiles = session.filesRead.map(f => `<div class="file-item">📖 ${this.escapeHtml(f)}</div>`).join('');
    const writtenFiles = session.filesWritten.map(f => `<div class="file-item">✏️ ${this.escapeHtml(f)}</div>`).join('');

    return `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <style>${baseStyles}</style>
</head><body>
  <h1>📁 Files</h1>
  <h2>Read (${session.filesRead.length})</h2>
  ${readFiles || '<p>No files read</p>'}
  <h2>Written (${session.filesWritten.length})</h2>
  ${writtenFiles || '<p>No files written</p>'}
</body></html>`;
  }

  private getSubagentsContent(webview: vscode.Webview, session: SessionDetail, baseStyles: string): string {
    const subagentsHtml = session.subagents.map(sub => `
      <div class="finding info">
        <strong>${this.escapeHtml(sub.prompt.substring(0, 80))}</strong>
        <p>Steps: ${sub.stepCount} | Cost: $${sub.totalCost.toFixed(4)} | Model: ${sub.model}</p>
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <style>${baseStyles}</style>
</head><body>
  <h1>🤖 Subagents (${session.subagents.length})</h1>
  ${subagentsHtml || '<p>No subagents</p>'}
</body></html>`;
  }

  private getCostContent(webview: vscode.Webview, session: SessionDetail, analysis: any, baseStyles: string): string {
    return `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <style>${baseStyles}</style>
</head><body>
  <h1>💰 Cost Analysis</h1>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total Cost</div>
      <div class="stat-value">$${session.totalCost.toFixed(4)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Wasted Cost</div>
      <div class="stat-value">$${(analysis?.wastedCost || 0).toFixed(4)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Efficiency</div>
      <div class="stat-value">${(analysis?.efficiency || 100).toFixed(1)}%</div>
    </div>
  </div>
  <h2>Cost per Tool</h2>
  <table>
    <tr><th>Tool</th><th>Uses</th></tr>
    ${Object.entries(session.toolsUsed).map(([tool, count]) => 
      `<tr><td>${tool}</td><td>${count}</td></tr>`
    ).join('')}
  </table>
</body></html>`;
  }

  private getDashboardContent(webview: vscode.Webview, sessions: any[]): string {
    return `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <style>${this.getBaseStyles()}</style>
</head><body>
  <h1>📊 Argus Dashboard</h1>
  <p>${sessions.length} sessions found</p>
</body></html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
