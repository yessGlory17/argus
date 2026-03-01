import { Step, AnalysisResult } from '../types/session';
import ContextTimeline from './ContextTimeline';
import './ContextTab.css';

interface Props {
  steps: Step[];
  analysis?: AnalysisResult;
  onGoToStep?: (index: number) => void;
}

const ContextTab = ({ steps, analysis, onGoToStep }: Props) => {
  // Calculate token metrics
  const totalInputTokens = steps.reduce((sum, s) =>
    sum + (s.usage?.input_tokens || 0) + (s.usage?.cache_creation_input_tokens || 0), 0);
  const totalOutputTokens = steps.reduce((sum, s) =>
    sum + (s.usage?.output_tokens || 0), 0);
  const totalCacheRead = steps.reduce((sum, s) =>
    sum + (s.usage?.cache_read_input_tokens || 0), 0);
  const totalCacheCreate = steps.reduce((sum, s) =>
    sum + (s.usage?.cache_creation_input_tokens || 0), 0);

  const avgInputPerStep = Math.round(totalInputTokens / steps.length);
  const cacheEfficiency = totalCacheRead > 0
    ? ((totalCacheRead / (totalInputTokens + totalCacheRead)) * 100).toFixed(1)
    : '0.0';

  // Find peak token step
  const peakStep = steps.reduce((max, s) => {
    const tokens = (s.usage?.input_tokens || 0) + (s.usage?.output_tokens || 0);
    const maxTokens = (max.usage?.input_tokens || 0) + (max.usage?.output_tokens || 0);
    return tokens > maxTokens ? s : max;
  }, steps[0]);

  const peakTokens = (peakStep?.usage?.input_tokens || 0) + (peakStep?.usage?.output_tokens || 0);

  return (
    <div className="context-tab">
      <div className="context-metrics">
        <div className="metric-card">
          <div className="metric-label">Total Input</div>
          <div className="metric-value">{totalInputTokens.toLocaleString()}</div>
          <div className="metric-sub">{avgInputPerStep.toLocaleString()} avg/step</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Output</div>
          <div className="metric-value">{totalOutputTokens.toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Cache Read</div>
          <div className="metric-value">{totalCacheRead.toLocaleString()}</div>
          <div className="metric-sub">{cacheEfficiency}% efficiency</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Cache Write</div>
          <div className="metric-value">{totalCacheCreate.toLocaleString()}</div>
        </div>
      </div>

      <ContextTimeline
        steps={steps}
        compactionPoints={analysis?.contextMetrics?.compactionPoints}
        pressureZones={analysis?.contextMetrics?.contextPressureZones}
        onGoToStep={onGoToStep}
      />

      <div className="usage-bars-section">
        <h3>Token Distribution</h3>
        <div className="usage-bars">
          <div className="usage-bar-item">
            <div className="usage-bar-label">
              <span>Input Tokens</span>
              <strong>{totalInputTokens.toLocaleString()}</strong>
            </div>
            <div className="usage-bar-track">
              <div className="usage-bar-fill input" style={{ width: '100%' }} />
            </div>
          </div>
          <div className="usage-bar-item">
            <div className="usage-bar-label">
              <span>Output Tokens</span>
              <strong>{totalOutputTokens.toLocaleString()}</strong>
            </div>
            <div className="usage-bar-track">
              <div
                className="usage-bar-fill output"
                style={{ width: `${Math.min((totalOutputTokens / totalInputTokens) * 100, 100)}%` }}
              />
            </div>
          </div>
          <div className="usage-bar-item">
            <div className="usage-bar-label">
              <span>Cache Read</span>
              <strong>{totalCacheRead.toLocaleString()}</strong>
            </div>
            <div className="usage-bar-track">
              <div
                className="usage-bar-fill cache"
                style={{ width: `${Math.min((totalCacheRead / totalInputTokens) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="peak-usage-section">
        <h3>Peak Usage</h3>
        <div className="peak-info">
          <div className="peak-stat">
            <span>Highest Step:</span>
            <code>#{peakStep?.index}</code>
          </div>
          <div className="peak-stat">
            <span>Total Tokens:</span>
            <strong>{peakTokens.toLocaleString()}</strong>
          </div>
          {peakStep?.toolName && (
            <div className="peak-stat">
              <span>Tool:</span>
              <code>{peakStep.toolName}</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContextTab;
