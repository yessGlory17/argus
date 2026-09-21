// Anonymous feature-usage stats. Only the feature name (and the tab it was
// used from) is posted; the extension host drops anything not in its
// allowlist (TELEMETRY_FEATURES in src/telemetry/telemetry.ts) and sends each
// feature at most once per session panel.
export type Feature =
  | 'goto_step'
  | 'steps_search' | 'steps_tool_filter' | 'steps_status_filter' | 'steps_sort' | 'steps_clear_filters'
  | 'step_expand' | 'agent_steps_toggle' | 'raw_view'
  | 'map_play' | 'map_reset' | 'map_jump_end' | 'map_slider' | 'map_speed' | 'map_reset_view'
  | 'notes_open' | 'note_add' | 'note_delete';

const sent = new Set<string>();

export function trackFeature(feature: Feature, tab?: string): void {
  const key = `${feature}:${tab ?? ''}`;
  if (sent.has(key)) return;
  sent.add(key);
  window.vscodeApi?.postMessage({ type: 'telemetry', event: 'feature_used', feature, tab });
}
