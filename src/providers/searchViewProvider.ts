import * as vscode from 'vscode';

export class SearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'argusSearch';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _onSearch: (query: string) => void
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === 'search') {
        this._onSearch(message.query);
      }
    });
  }

  clearSearch(): void {
    this._view?.webview.postMessage({ type: 'clear' });
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      padding: 8px 8px 4px 8px;
      background: transparent;
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
      font-size: 14px;
      flex-shrink: 0;
    }
    input {
      width: 100%;
      padding: 5px 6px;
      font-size: 13px;
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
      font-size: 14px;
      padding: 2px;
      display: none;
      flex-shrink: 0;
    }
    .clear-btn:hover {
      color: var(--vscode-input-foreground);
    }
    .clear-btn.visible {
      display: block;
    }
  </style>
</head>
<body>
  <div class="search-wrap">
    <span class="search-icon">&#x1F50D;</span>
    <input type="text" id="search" placeholder="Search sessions..." spellcheck="false">
    <button class="clear-btn" id="clearBtn">&times;</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('search');
    const clearBtn = document.getElementById('clearBtn');
    let timer;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      clearBtn.classList.toggle('visible', input.value.length > 0);
      timer = setTimeout(() => {
        vscode.postMessage({ type: 'search', query: input.value });
      }, 250);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.remove('visible');
      vscode.postMessage({ type: 'search', query: '' });
      input.focus();
    });

    window.addEventListener('message', (event) => {
      if (event.data.type === 'clear') {
        input.value = '';
        clearBtn.classList.remove('visible');
      }
    });
  </script>
</body>
</html>`;
  }
}
