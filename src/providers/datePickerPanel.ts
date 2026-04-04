import * as vscode from 'vscode';

export class DatePickerPanel {
  static show(
    context: vscode.ExtensionContext,
    onApply: (from: number, to: number) => void
  ): void {
    const panel = vscode.window.createWebviewPanel(
      'argusDatePicker',
      'Select Date Range',
      vscode.ViewColumn.Active,
      { enableScripts: true }
    );

    panel.webview.html = DatePickerPanel.getHtml();

    panel.webview.onDidReceiveMessage(
      (message) => {
        if (message.type === 'apply') {
          onApply(message.from, message.to);
          panel.dispose();
        } else if (message.type === 'cancel') {
          panel.dispose();
        }
      },
      undefined,
      context.subscriptions
    );
  }

  private static getHtml(): string {
    const today = new Date().toISOString().split('T')[0];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
    .container {
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 8px;
      padding: 24px;
      min-width: 320px;
    }
    h3 {
      margin: 0 0 20px 0;
      font-size: 14px;
      font-weight: 600;
    }
    .field {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 12px;
      margin-bottom: 6px;
      color: var(--vscode-descriptionForeground);
    }
    input[type="date"] {
      width: 100%;
      padding: 6px 8px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      box-sizing: border-box;
    }
    input[type="date"]:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .buttons {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 20px;
    }
    button {
      padding: 6px 14px;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
  </style>
</head>
<body>
  <div class="container">
    <h3>Custom Date Range</h3>
    <div class="field">
      <label>From</label>
      <input type="date" id="fromDate" value="${today}">
    </div>
    <div class="field">
      <label>To</label>
      <input type="date" id="toDate" value="${today}">
    </div>
    <div class="buttons">
      <button class="btn-secondary" id="cancelBtn">Cancel</button>
      <button class="btn-primary" id="applyBtn">Apply</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('applyBtn').addEventListener('click', () => {
      const from = new Date(document.getElementById('fromDate').value);
      const to = new Date(document.getElementById('toDate').value);
      // Set to end of day for 'to' date
      to.setHours(23, 59, 59, 999);
      vscode.postMessage({ type: 'apply', from: from.getTime(), to: to.getTime() });
    });
    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });
  </script>
</body>
</html>`;
  }
}
