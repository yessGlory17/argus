import * as https from 'https';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { GA_MEASUREMENT_ID, GA_API_SECRET } from './config';

// Anonymous usage telemetry sent to GA4 via the Measurement Protocol.
//
// Privacy rules enforced here (see README "Telemetry"):
// - Goes through vscode.env.createTelemetryLogger, so nothing is sent when the
//   user has VS Code telemetry off. `argus.telemetry.enabled` is a second switch.
// - Only allowlisted event names and parameter keys leave the machine, and
//   only primitive values. Never send prompts, paths, project names, session
//   IDs, search text or error messages — use enums and buckets instead.
// - client_id is a random UUID stored by this extension, not the VS Code
//   machine ID, so it can't be joined with other telemetry.

export type TelemetryEvent =
  | 'first_install'
  | 'extension_updated'
  | 'extension_activated'
  | 'sessions_discovered'
  | 'session_opened'
  | 'session_closed'
  | 'tab_viewed'
  | 'feature_used'
  | 'analysis_rule_fired'
  | 'filter_changed'
  | 'filters_cleared'
  | 'sessions_refreshed'
  | 'error_occurred';

type Params = Record<string, string | number | boolean | undefined>;

const ALLOWED_PARAMS = new Set([
  // common
  'ext_version', 'vscode_version', 'os', 'remote_name', 'ui_kind', 'ui_language', 'argus_language',
  // lifecycle
  'previous_version',
  // discovery
  'session_count', 'project_count', 'duration_ms',
  // session
  'model_family', 'step_count', 'subagent_count', 'finding_count', 'load_ms', 'open_seconds', 'live_updates',
  'parse_ms', 'file_size_kb', 'peak_context_k', 'compactions', 'cache_hit_pct',
  // analysis
  'rule', 'rule_count',
  // ui
  'tab', 'filter', 'filter_value', 'feature',
  // errors
  'where', 'error_name',
]);

const ENDPOINT_HOST = 'www.google-analytics.com';
const FLUSH_INTERVAL_MS = 15_000;
const MAX_BATCH = 25; // Measurement Protocol limit per request
const MAX_QUEUE = 200;
// Caps traffic even if a webview misbehaves and floods us with messages.
const MAX_EVENTS_PER_MINUTE = 60;

interface GaEvent {
  name: string;
  params: Record<string, string | number>;
}

let logger: vscode.TelemetryLogger | undefined;
let clientId = '';
let sessionId = '';
let debugMode = false;
let output: vscode.OutputChannel | undefined;
let queue: GaEvent[] = [];
let flushTimer: NodeJS.Timeout | undefined;
let rateWindowStart = 0;
let rateWindowCount = 0;

function userEnabled(): boolean {
  return vscode.workspace.getConfiguration('argus').get<boolean>('telemetry.enabled', true);
}

function sanitize(data: Record<string, unknown> | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!data) return out;
  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_PARAMS.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value ? 'true' : 'false';
    else if (typeof value === 'string') out[key] = value.slice(0, 100); // GA param value limit
  }
  return out;
}

async function post(events: GaEvent[]): Promise<void> {
  if (!debugMode) {
    return send('/mp/collect', events);
  }
  // Dev host: validate the payload (result goes to the output channel), then
  // send it for real flagged as debug_mode so it shows up in GA's DebugView.
  await send('/debug/mp/collect', events);
  await send('/mp/collect', events.map((e) => ({ ...e, params: { ...e.params, debug_mode: 1 } })));
}

function send(endpoint: string, events: GaEvent[]): Promise<void> {
  const body = JSON.stringify({
    client_id: clientId,
    non_personalized_ads: true,
    events,
  });
  const path = endpoint +
    `?measurement_id=${encodeURIComponent(GA_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(GA_API_SECRET)}`;

  return new Promise((resolve) => {
    const req = https.request(
      {
        host: ENDPOINT_HOST,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 5000,
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => { if (debugMode) text += chunk; });
        res.on('end', () => {
          if (debugMode) output?.appendLine(`← ${endpoint} ${res.statusCode} ${text.trim()}`);
          resolve();
        });
      }
    );
    // Telemetry must never surface errors to the user.
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.end(body);
  });
}

async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  const pending = queue;
  queue = [];
  for (let i = 0; i < pending.length; i += MAX_BATCH) {
    await post(pending.slice(i, i + MAX_BATCH));
  }
}

const sender: vscode.TelemetrySender = {
  sendEventData(eventName, data) {
    if (!userEnabled()) return;
    const now = Date.now();
    if (now - rateWindowStart > 60_000) {
      rateWindowStart = now;
      rateWindowCount = 0;
    }
    if (++rateWindowCount > MAX_EVENTS_PER_MINUTE) return;
    // The logger prefixes names with the extension id ("publisher.name/event").
    const name = eventName.split('/').pop() || eventName;
    const params = {
      ...sanitize(data),
      session_id: sessionId,
      // Required for GA to count the user as active/engaged.
      engagement_time_msec: 100,
    };
    if (debugMode) output?.appendLine(`→ ${name} ${JSON.stringify(params)}`);
    if (queue.length >= MAX_QUEUE) return;
    queue.push({ name, params });
    if (queue.length >= MAX_BATCH) void flush();
    else if (!flushTimer) flushTimer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
  },
  // Error objects carry messages and stack traces with local paths — never
  // forward them. Errors are reported as `error_occurred` events instead.
  sendErrorData() {},
  flush,
};

export function initTelemetry(context: vscode.ExtensionContext): void {
  if (!GA_MEASUREMENT_ID || !GA_API_SECRET) return;
  if (typeof vscode.env.createTelemetryLogger !== 'function') return;

  debugMode = context.extensionMode !== vscode.ExtensionMode.Production;
  if (debugMode) {
    output = vscode.window.createOutputChannel('Argus Telemetry');
    context.subscriptions.push(output);
  }

  clientId = context.globalState.get<string>('argus.telemetry.clientId') ?? '';
  if (!clientId) {
    clientId = crypto.randomUUID();
    void context.globalState.update('argus.telemetry.clientId', clientId);
  }
  sessionId = String(Math.floor(Date.now() / 1000));

  const version = String(context.extension.packageJSON.version ?? '');
  logger = vscode.env.createTelemetryLogger(sender, {
    // Built-ins include the VS Code machine ID; send our own minimal set.
    ignoreBuiltInCommonProperties: true,
    // Unhandled errors carry stack traces with local paths.
    ignoreUnhandledErrors: true,
    additionalCommonProperties: {
      ext_version: version,
      vscode_version: vscode.version,
      os: process.platform,
      remote_name: vscode.env.remoteName ?? 'local',
      ui_kind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop',
      ui_language: vscode.env.language,
    },
  });
  context.subscriptions.push(logger);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('argus.telemetry.enabled') && !userEnabled()) {
        queue = [];
      }
    })
  );

  const previous = context.globalState.get<string>('argus.telemetry.lastVersion');
  if (!previous) {
    track('first_install');
  } else if (previous !== version) {
    track('extension_updated', { previous_version: previous });
  }
  void context.globalState.update('argus.telemetry.lastVersion', version);

  track('extension_activated', {
    argus_language: vscode.workspace.getConfiguration('argus').get<string>('language', 'en'),
  });
}

export function track(event: TelemetryEvent, params?: Params): void {
  logger?.logUsage(event, params);
}

export function trackError(where: string, error: unknown): void {
  track('error_occurred', {
    where,
    // Only the class name (e.g. "TypeError"), never the message.
    error_name: error instanceof Error && /^[A-Za-z0-9_]{1,40}$/.test(error.name) ? error.name : 'unknown',
  });
}

export function flushTelemetry(): Promise<void> {
  return logger ? flush() : Promise.resolve();
}

// Coarse buckets keep numbers useful for analysis without fingerprinting.
export function bucket(n: number, edges: number[] = [0, 1, 10, 50, 200, 1000]): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  for (let i = 1; i < edges.length; i++) {
    if (n < edges[i]) return `${edges[i - 1]}-${edges[i] - 1}`;
  }
  return `${edges[edges.length - 1]}+`;
}

// Webview features reported via `feature_used`. Anything else from the
// webview is dropped, so adding a feature means adding it here too.
export const TELEMETRY_FEATURES = new Set([
  'goto_step',
  'steps_search', 'steps_tool_filter', 'steps_status_filter', 'steps_sort', 'steps_clear_filters',
  'step_expand', 'agent_steps_toggle', 'raw_view',
  'map_play', 'map_reset', 'map_jump_end', 'map_slider', 'map_speed', 'map_reset_view',
  'notes_open', 'note_add', 'note_delete',
]);

export const TELEMETRY_TABS = new Set(['steps', 'analysis', 'cost', 'flow', 'map', 'context', 'performance', 'insights']);

export const TELEMETRY_RULES = new Set([
  'duplicate_read', 'unused_read', 'retry_loop', 'failed_tool', 'context_pressure', 'compaction_detected',
]);

export function modelFamily(model: string | undefined): string {
  const m = (model ?? '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('fable')) return 'fable';
  return m ? 'other' : 'unknown';
}
