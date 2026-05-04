import { useMemo, useState } from 'react';
import hljs from 'highlight.js';
import { diffLines } from 'diff';
import { Step } from '../types/session';
import 'highlight.js/styles/github-dark.css';
import './ToolRenderer.css';

// ─── Language detection ───────────────────────────────────────────────────
const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  mjs: 'javascript', cjs: 'javascript',
  py: 'python', pyi: 'python',
  rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
  swift: 'swift', scala: 'scala', php: 'php', cs: 'csharp',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  m: 'objectivec', mm: 'objectivec',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  ps1: 'powershell',
  json: 'json', jsonc: 'json',
  yaml: 'yaml', yml: 'yaml',
  toml: 'ini', ini: 'ini',
  md: 'markdown', markdown: 'markdown',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  sql: 'sql',
  graphql: 'graphql', gql: 'graphql',
  dockerfile: 'dockerfile',
  vue: 'xml', svelte: 'xml',
  lua: 'lua', dart: 'dart', r: 'r', jl: 'julia',
  ex: 'elixir', exs: 'elixir', erl: 'erlang',
  hs: 'haskell', clj: 'clojure', elm: 'elm',
};

const langFromPath = (path: string | undefined | null): string => {
  if (!path) return 'plaintext';
  const lower = path.toLowerCase();
  if (lower.endsWith('/dockerfile') || lower === 'dockerfile') return 'dockerfile';
  if (lower.endsWith('/makefile') || lower === 'makefile') return 'makefile';
  const m = lower.match(/\.([a-z0-9]+)$/);
  if (!m) return 'plaintext';
  return EXT_LANG[m[1]] || 'plaintext';
};

const safeHighlight = (code: string, lang: string): string => {
  try {
    if (lang && lang !== 'plaintext' && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── Parse tool result safely ─────────────────────────────────────────────
type ParsedResult = { ok: boolean; value: any };
const parseToolResult = (raw?: string): ParsedResult => {
  if (!raw) return { ok: false, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: true, value: raw };
  }
};

// Pull a human-readable error string out of whatever shape the tool result
// happens to take. Errored tool calls land here as either a plain "Error: …"
// string, an object with a `.content` / `.error` / `.message` field, or
// simply the entire stdout/stderr blob — handle each case.
const extractErrorMessage = (result: any): string => {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  if (typeof result !== 'object') return String(result);

  const candidates = [
    (result as any).error,
    (result as any).message,
    (result as any).errorMessage,
    (result as any).stderr,
    (result as any).content,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c;
  }
  // Bash-shaped errors: keep stdout if stderr was empty.
  if (typeof (result as any).stdout === 'string') return (result as any).stdout;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
};

// ─── Code block with line numbers ─────────────────────────────────────────
interface CodeBlockProps {
  code: string;
  language?: string;
  startLine?: number;
  showLineNumbers?: boolean;
}

const CodeBlock = ({ code, language, startLine = 1, showLineNumbers = true }: CodeBlockProps) => {
  const lang = language || 'plaintext';
  const lines = code.split('\n');
  // Drop a trailing empty line that comes from a final \n so we don't render a blank row.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const highlighted = safeHighlight(code, lang).split('\n');
  if (highlighted.length > lines.length) highlighted.length = lines.length;
  const gutterWidth = String(startLine + lines.length - 1).length;

  return (
    <pre className="tr-code">
      <code className={`hljs language-${lang}`}>
        {lines.map((_, i) => (
          <div key={i} className="tr-code-line">
            {showLineNumbers && (
              <span
                className="tr-code-gutter"
                style={{ minWidth: `${gutterWidth}ch` }}
              >
                {startLine + i}
              </span>
            )}
            <span
              className="tr-code-content"
              dangerouslySetInnerHTML={{ __html: highlighted[i] || '&nbsp;' }}
            />
          </div>
        ))}
      </code>
    </pre>
  );
};

// ─── Renderers ────────────────────────────────────────────────────────────
const PathHeader = ({
  path,
  badge,
  badgeKind,
  meta,
}: {
  path: string;
  badge?: string;
  badgeKind?: 'success' | 'info' | 'warn' | 'error';
  meta?: string;
}) => (
  <div className="tr-path-header">
    {badge && <span className={`tr-badge tr-badge-${badgeKind ?? 'info'}`}>{badge}</span>}
    <span className="tr-path" title={path}>{path}</span>
    {meta && <span className="tr-meta">{meta}</span>}
  </div>
);

const ReadRenderer = ({ input, result }: { input: any; result: any }) => {
  const filePath: string = input?.file_path || result?.file?.filePath || '';
  const offset: number | undefined = input?.offset;
  const limit: number | undefined = input?.limit;
  const file = result?.file ?? {};
  const totalLines: number | undefined = file.totalLines;
  const numLines: number | undefined = file.numLines;
  const content: string | undefined = file.content;
  const startLine = offset && offset > 0 ? offset : 1;

  let metaParts: string[] = [];
  if (typeof numLines === 'number' && typeof totalLines === 'number') {
    metaParts.push(`${numLines}/${totalLines} lines`);
  } else if (typeof totalLines === 'number') {
    metaParts.push(`${totalLines} lines`);
  }
  if (offset) metaParts.push(`from line ${offset}`);
  if (limit) metaParts.push(`limit ${limit}`);
  if (file.originalSize) metaParts.push(`${formatSize(file.originalSize)}`);

  return (
    <div className="tr-block">
      <PathHeader
        path={filePath}
        badge="READ"
        badgeKind="info"
        meta={metaParts.join(' · ')}
      />
      {content ? (
        <CodeBlock
          code={content}
          language={langFromPath(filePath)}
          startLine={startLine}
        />
      ) : (
        <div className="tr-empty">No content body returned with this read.</div>
      )}
    </div>
  );
};

const WriteRenderer = ({ input, result }: { input: any; result: any }) => {
  const filePath: string = input?.file_path || result?.filePath || '';
  const content: string = input?.content ?? result?.content ?? '';
  const isCreate = result?.type === 'create';
  return (
    <div className="tr-block">
      <PathHeader
        path={filePath}
        badge={isCreate ? 'CREATE' : 'WRITE'}
        badgeKind={isCreate ? 'success' : 'info'}
        meta={`${content.split('\n').length} lines · ${formatSize(content.length)}`}
      />
      <CodeBlock code={content} language={langFromPath(filePath)} />
    </div>
  );
};

interface DiffSpec {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

const DiffView = ({ filePath, spec }: { filePath: string; spec: DiffSpec }) => {
  const lang = langFromPath(filePath);
  const parts = useMemo(
    () => diffLines(spec.oldString || '', spec.newString || ''),
    [spec.oldString, spec.newString]
  );
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    if (p.added) added += p.count ?? 0;
    if (p.removed) removed += p.count ?? 0;
  }
  return (
    <div className="tr-diff">
      <div className="tr-diff-stats">
        <span className="tr-diff-add">+{added}</span>
        <span className="tr-diff-del">−{removed}</span>
        {spec.replaceAll && <span className="tr-diff-flag">replace_all</span>}
      </div>
      <div className="tr-diff-body">
        {parts.map((part, i) => {
          const lines = part.value.split('\n');
          if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
          const cls = part.added ? 'tr-diff-add-line' : part.removed ? 'tr-diff-del-line' : 'tr-diff-ctx-line';
          const sign = part.added ? '+' : part.removed ? '−' : ' ';
          return lines.map((ln, j) => (
            <div key={`${i}-${j}`} className={`tr-diff-line ${cls}`}>
              <span className="tr-diff-sign">{sign}</span>
              <span
                className="tr-diff-content"
                dangerouslySetInnerHTML={{ __html: safeHighlight(ln || ' ', lang) }}
              />
            </div>
          ));
        })}
      </div>
    </div>
  );
};

const EditRenderer = ({ input, result }: { input: any; result: any }) => {
  const filePath: string = input?.file_path || result?.filePath || '';
  const oldString: string = input?.old_string ?? result?.oldString ?? '';
  const newString: string = input?.new_string ?? result?.newString ?? '';
  const replaceAll: boolean = input?.replace_all ?? result?.replaceAll ?? false;
  return (
    <div className="tr-block">
      <PathHeader path={filePath} badge="EDIT" badgeKind="info" />
      <DiffView filePath={filePath} spec={{ oldString, newString, replaceAll }} />
    </div>
  );
};

const MultiEditRenderer = ({ input, result }: { input: any; result: any }) => {
  const filePath: string = input?.file_path || result?.filePath || '';
  const edits: any[] = input?.edits || [];
  return (
    <div className="tr-block">
      <PathHeader
        path={filePath}
        badge="MULTI-EDIT"
        badgeKind="info"
        meta={`${edits.length} edit${edits.length === 1 ? '' : 's'}`}
      />
      <div className="tr-multi-edits">
        {edits.map((e, i) => (
          <div key={i} className="tr-multi-edit-item">
            <div className="tr-multi-edit-header">Edit {i + 1}</div>
            <DiffView
              filePath={filePath}
              spec={{
                oldString: e.old_string ?? '',
                newString: e.new_string ?? '',
                replaceAll: e.replace_all,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const BashRenderer = ({ input, result }: { input: any; result: any }) => {
  const cmd: string = input?.command || '';
  const description: string | undefined = input?.description;
  let stdout = '';
  let stderr = '';
  let interrupted = false;
  let exitCode: number | undefined;
  if (typeof result === 'object' && result !== null) {
    stdout = String(result.stdout ?? '');
    stderr = String(result.stderr ?? '');
    interrupted = !!result.interrupted;
    exitCode = result.exit_code ?? result.exitCode;
  } else if (typeof result === 'string') {
    stdout = result;
  }
  const errored = exitCode !== undefined ? exitCode !== 0 : !!stderr.trim();

  return (
    <div className="tr-block tr-bash">
      <div className="tr-bash-header">
        <span className="tr-badge tr-badge-bash">BASH</span>
        {description && <span className="tr-bash-desc">{description}</span>}
        {interrupted && <span className="tr-badge tr-badge-warn">interrupted</span>}
        {exitCode !== undefined && (
          <span className={`tr-badge ${errored ? 'tr-badge-error' : 'tr-badge-success'}`}>
            exit {exitCode}
          </span>
        )}
      </div>
      <div className="tr-bash-cmd">
        <span className="tr-bash-prompt">$</span>
        <span
          className="tr-bash-cmd-text"
          dangerouslySetInnerHTML={{ __html: safeHighlight(cmd, 'bash') }}
        />
      </div>
      {stdout && (
        <pre className="tr-bash-stdout">
          <code>{stdout}</code>
        </pre>
      )}
      {stderr && (
        <pre className="tr-bash-stderr">
          <code>{stderr}</code>
        </pre>
      )}
    </div>
  );
};

const GrepRenderer = ({ input, result }: { input: any; result: any }) => {
  const pattern: string = input?.pattern || '';
  const path: string | undefined = input?.path;
  const glob: string | undefined = input?.glob;
  const outputMode: string | undefined = input?.output_mode;
  const text =
    typeof result === 'string' ? result : result?.content ?? result?.matches ?? '';
  const lines = String(text).split('\n').filter((l) => l.trim().length > 0);

  return (
    <div className="tr-block">
      <div className="tr-grep-header">
        <span className="tr-badge tr-badge-info">GREP</span>
        <code className="tr-grep-pattern">{pattern}</code>
        {path && <span className="tr-meta">in {path}</span>}
        {glob && <span className="tr-meta">glob: {glob}</span>}
        {outputMode && <span className="tr-meta">{outputMode}</span>}
        <span className="tr-meta">{lines.length} match{lines.length === 1 ? '' : 'es'}</span>
      </div>
      <pre className="tr-grep-body">
        <code>{lines.join('\n')}</code>
      </pre>
    </div>
  );
};

const GlobRenderer = ({ input, result }: { input: any; result: any }) => {
  const pattern: string = input?.pattern || '';
  const path: string | undefined = input?.path;
  const text = typeof result === 'string' ? result : result?.content ?? '';
  const files = String(text).split('\n').filter((l) => l.trim().length > 0);

  return (
    <div className="tr-block">
      <div className="tr-grep-header">
        <span className="tr-badge tr-badge-info">GLOB</span>
        <code className="tr-grep-pattern">{pattern}</code>
        {path && <span className="tr-meta">in {path}</span>}
        <span className="tr-meta">{files.length} file{files.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="tr-glob-list">
        {files.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
    </div>
  );
};

const TaskRenderer = ({ input, result }: { input: any; result: any }) => {
  // Coerce every field to a primitive so React never sees an object/array
  // child. Older sessions occasionally carry odd shapes here that crashed
  // the previous render path.
  const asStr = (v: unknown): string =>
    v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);
  const asNum = (v: unknown): number | undefined =>
    typeof v === 'number' && !Number.isNaN(v) ? v : undefined;

  const inputObj = input && typeof input === 'object' ? input : {};
  const resultObj = result && typeof result === 'object' && !Array.isArray(result) ? result : {};

  const description: string = asStr(inputObj.description);
  const prompt: string = asStr(inputObj.prompt);
  const subagentType: string = asStr(inputObj.subagent_type);
  const agentId: string = asStr(resultObj.agentId);
  const status: string = asStr(resultObj.status);
  const totalDurationMs = asNum(resultObj.totalDurationMs);
  const totalTokens = asNum(resultObj.totalTokens);
  const totalToolUseCount = asNum(resultObj.totalToolUseCount);
  const content: string =
    typeof result === 'string' ? result : asStr(resultObj.content);

  return (
    <div className="tr-block">
      <div className="tr-task-header">
        <span className="tr-badge tr-badge-task">TASK</span>
        {subagentType && <span className="tr-task-type">{subagentType}</span>}
        {description && <span className="tr-task-desc">{description}</span>}
      </div>
      {(agentId || status) && (
        <div className="tr-task-meta">
          {status && <span className={`tr-badge tr-badge-${status === 'completed' ? 'success' : 'info'}`}>{status}</span>}
          {totalDurationMs !== undefined && <span className="tr-meta">{formatDuration(totalDurationMs)}</span>}
          {totalTokens !== undefined && <span className="tr-meta">{totalTokens.toLocaleString()} tokens</span>}
          {totalToolUseCount !== undefined && <span className="tr-meta">{totalToolUseCount} tool calls</span>}
          {agentId && <span className="tr-meta tr-mono">{agentId.slice(0, 8)}</span>}
        </div>
      )}
      <div className="tr-task-prompt">
        <div className="tr-section-label">Prompt</div>
        <pre className="tr-text">{prompt}</pre>
      </div>
      {content && (
        <div className="tr-task-result">
          <div className="tr-section-label">Result</div>
          <pre className="tr-text">{content}</pre>
        </div>
      )}
    </div>
  );
};

const TodoWriteRenderer = ({ input }: { input: any; result: any }) => {
  const todos: any[] = input?.todos || [];
  return (
    <div className="tr-block">
      <div className="tr-todo-header">
        <span className="tr-badge tr-badge-info">TODO</span>
        <span className="tr-meta">{todos.length} item{todos.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="tr-todo-list">
        {todos.map((t, i) => {
          const status = t.status || 'pending';
          const text = t.activeForm && status === 'in_progress' ? t.activeForm : t.content || '';
          return (
            <li key={i} className={`tr-todo-item tr-todo-${status}`}>
              <span className="tr-todo-icon" aria-hidden>
                {status === 'completed' ? '✓' : status === 'in_progress' ? '◐' : '○'}
              </span>
              <span className="tr-todo-text">{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const WebFetchRenderer = ({ input, result }: { input: any; result: any }) => {
  const url: string = input?.url || '';
  const prompt: string | undefined = input?.prompt;
  const content =
    typeof result === 'string'
      ? result
      : result?.content || result?.text || JSON.stringify(result, null, 2);
  return (
    <div className="tr-block">
      <div className="tr-task-header">
        <span className="tr-badge tr-badge-info">FETCH</span>
        <a href={url} className="tr-link" target="_blank" rel="noreferrer">{url}</a>
      </div>
      {prompt && (
        <div className="tr-task-prompt">
          <div className="tr-section-label">Prompt</div>
          <pre className="tr-text">{prompt}</pre>
        </div>
      )}
      <div className="tr-task-result">
        <div className="tr-section-label">Result</div>
        <pre className="tr-text">{content}</pre>
      </div>
    </div>
  );
};

const WebSearchRenderer = ({ input, result }: { input: any; result: any }) => {
  const query: string = input?.query || '';
  const content =
    typeof result === 'string' ? result : result?.content || JSON.stringify(result, null, 2);
  return (
    <div className="tr-block">
      <div className="tr-task-header">
        <span className="tr-badge tr-badge-info">SEARCH</span>
        <code className="tr-grep-pattern">{query}</code>
      </div>
      <pre className="tr-text">{content}</pre>
    </div>
  );
};

const RawView = ({ step }: { step: Step }) => {
  const result = parseToolResult(step.toolResult);
  return (
    <div className="tr-raw">
      {step.toolInput !== undefined && (
        <div className="tr-raw-section">
          <div className="tr-section-label">Tool Input</div>
          <pre className="tr-code-raw">{JSON.stringify(step.toolInput, null, 2)}</pre>
        </div>
      )}
      {step.toolResult !== undefined && (
        <div className="tr-raw-section">
          <div className="tr-section-label">Tool Result</div>
          <pre className="tr-code-raw">
            {result.ok && typeof result.value === 'object'
              ? JSON.stringify(result.value, null, 2)
              : String(result.value ?? step.toolResult)}
          </pre>
        </div>
      )}
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────
const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
};

// ─── Dispatcher ───────────────────────────────────────────────────────────
const RENDERERS: Record<string, (props: { input: any; result: any }) => JSX.Element> = {
  Read: ReadRenderer,
  Write: WriteRenderer,
  Edit: EditRenderer,
  MultiEdit: MultiEditRenderer,
  Bash: BashRenderer,
  Grep: GrepRenderer,
  Glob: GlobRenderer,
  Task: TaskRenderer,
  Agent: TaskRenderer,
  TodoWrite: TodoWriteRenderer,
  WebFetch: WebFetchRenderer,
  WebSearch: WebSearchRenderer,
};

interface ToolRendererProps {
  step: Step;
}

const ToolRenderer = ({ step }: ToolRendererProps) => {
  const [showRaw, setShowRaw] = useState(false);
  const tool = step.toolName;
  const renderer = tool ? RENDERERS[tool] : undefined;
  const parsed = useMemo(() => parseToolResult(step.toolResult), [step.toolResult]);

  // No tool data at all — nothing to render.
  if (!step.toolInput && !step.toolResult) return null;

  const hasPretty = !!renderer;
  const isError = step.toolSuccess === false;
  const errorMessage = isError ? extractErrorMessage(parsed.value) : '';

  return (
    <div className={`tool-renderer${isError ? ' tool-renderer-error' : ''}`}>
      <div className="tr-toolbar">
        <span className="tr-tool-name">{tool || 'tool'}</span>
        {isError && <span className="tr-toolbar-error-badge">ERROR</span>}
        {hasPretty && (
          <div className="tr-toggle">
            <button
              className={`tr-toggle-btn${!showRaw ? ' active' : ''}`}
              onClick={() => setShowRaw(false)}
              type="button"
            >
              Pretty
            </button>
            <button
              className={`tr-toggle-btn${showRaw ? ' active' : ''}`}
              onClick={() => setShowRaw(true)}
              type="button"
            >
              Raw
            </button>
          </div>
        )}
      </div>

      {/* Error banner — pretty view only. The full message is shown verbatim
          (no truncation) so the operator can debug from a glance. The raw
          view already exposes the same data via the JSON dump. */}
      {!showRaw && isError && errorMessage && (
        <div className="tr-error-banner">
          <div className="tr-error-banner-head">
            <svg
              className="tr-error-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="tr-error-banner-label">Tool returned an error</span>
          </div>
          <pre className="tr-error-banner-body">{errorMessage}</pre>
        </div>
      )}

      {hasPretty && !showRaw ? (
        renderer!({ input: step.toolInput, result: parsed.value })
      ) : (
        <RawView step={step} />
      )}
    </div>
  );
};

export default ToolRenderer;
