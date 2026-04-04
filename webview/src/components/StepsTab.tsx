import { useState, useEffect } from 'react';
import { Step, Subagent, Finding } from '../types/session';
import './StepsTab.css';

interface Props {
  steps: Step[];
  subagents: Subagent[];
  findings: Finding[];
  highlightStep: number | null;
}

const StepsTab = ({ steps, subagents, findings, highlightStep }: Props) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState('all');

  // Auto-expand highlighted step
  useEffect(() => {
    if (highlightStep !== null) {
      setExpandedSteps(prev => {
        const newSet = new Set(prev);
        newSet.add(highlightStep);
        return newSet;
      });
      // Scroll to highlighted step
      setTimeout(() => {
        const element = document.querySelector('.step-item.highlight');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [highlightStep]);

  const toggleStep = (index: number) => {
    const newSet = new Set(expandedSteps);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setExpandedSteps(newSet);
  };

  const stepFindings = new Map<number, Finding[]>();
  findings.forEach(f => {
    f.affectedSteps?.forEach(idx => {
      if (!stepFindings.has(idx)) stepFindings.set(idx, []);
      stepFindings.get(idx)!.push(f);
    });
  });

  const filteredSteps = steps.filter(step => {
    if (filter === 'all') return true;
    if (filter === 'thinking') return step.type === 'thinking';
    if (filter === 'tool') return step.toolName !== undefined;
    if (filter === 'text') return step.type === 'text';
    if (filter === 'issues') return stepFindings.has(step.index);
    return true;
  }).reverse(); // Yeniden eskiye sıralama

  const formatTime = (timestamp?: Date) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getStepSummary = (step: Step): string => {
    if (!step.toolName || !step.toolInput) return '';

    try {
      switch (step.toolName) {
        case 'Read':
          return step.toolInput.file_path || '';
        case 'Write':
          return step.toolInput.file_path || '';
        case 'Edit':
          return step.toolInput.file_path || '';
        case 'Grep':
          return `"${step.toolInput.pattern}"${step.toolInput.path ? ` in ${step.toolInput.path}` : ''}`;
        case 'Glob':
          return `"${step.toolInput.pattern}"${step.toolInput.path ? ` in ${step.toolInput.path}` : ''}`;
        case 'Bash':
          const cmd = step.toolInput.command || '';
          return cmd.length > 60 ? cmd.substring(0, 60) + '...' : cmd;
        case 'Agent':
          const desc = step.toolInput.description || step.toolInput.prompt || '';
          return desc.length > 60 ? desc.substring(0, 60) + '...' : desc;
        default:
          return '';
      }
    } catch {
      return '';
    }
  };

  return (
    <div className="steps-tab">
      <div className="steps-controls">
        <div className="filter-buttons">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            All Tools
          </button>
          <button className={filter === 'thinking' ? 'active' : ''} onClick={() => setFilter('thinking')}>
            Thinking
          </button>
          <button className={filter === 'tool' ? 'active' : ''} onClick={() => setFilter('tool')}>
            Tool
          </button>
          <button className={filter === 'text' ? 'active' : ''} onClick={() => setFilter('text')}>
            Text
          </button>
          <button className={filter === 'issues' ? 'active' : ''} onClick={() => setFilter('issues')}>
            Issues Only
          </button>
        </div>
        <span className="steps-count">Showing {filteredSteps.length} / {steps.length}</span>
      </div>

      <div className="steps-list">
        {filteredSteps.map(step => {
          const isExpanded = expandedSteps.has(step.index);
          const hasIssues = stepFindings.has(step.index);
          const isHighlighted = highlightStep === step.index;

          return (
            <div
              key={step.index}
              className={`step-item ${isExpanded ? 'expanded' : ''} ${isHighlighted ? 'highlight' : ''} ${hasIssues ? 'has-issues' : ''}`}
            >
              <button className="step-header" onClick={() => toggleStep(step.index)}>
                <div className="step-left">
                  <span className={`step-dot ${step.type}`}></span>
                  <span className="step-index">#{step.index}</span>
                  <span className="step-time">{formatTime(step.timestamp)}</span>
                  <span className="step-type">{step.toolName || step.type}</span>
                  {step.toolSuccess === false && <span className="step-failed">✕</span>}
                  {step.toolSuccess === true && <span className="step-success">✓</span>}
                  {getStepSummary(step) && (
                    <span className="step-summary">{getStepSummary(step)}</span>
                  )}
                </div>
                <div className="step-right">
                  <span className="step-cost">${step.cost.toFixed(4)}</span>
                  <span className="step-expand">▶</span>
                </div>
              </button>

              {isExpanded && (
                <div className="step-details">
                  {hasIssues && (
                    <div className="step-findings">
                      {stepFindings.get(step.index)!.map((f, i) => (
                        <div key={i} className={`finding-inline ${f.severity}`}>
                          <strong>{f.title}</strong>
                          <p>{f.description}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {step.toolInput && (
                    <div className="detail-section">
                      <div className="detail-label">Tool Input</div>
                      <pre className="detail-code">{JSON.stringify(step.toolInput, null, 2)}</pre>
                    </div>
                  )}

                  {step.toolResult && (
                    <div className="detail-section">
                      <div className="detail-label">Tool Result</div>
                      <pre className="detail-code">
                        {(() => {
                          try {
                            const parsed = JSON.parse(step.toolResult);
                            const pretty = JSON.stringify(parsed, null, 2);
                            return pretty.length > 2000 ? pretty.substring(0, 2000) + '...' : pretty;
                          } catch {
                            return step.toolResult.length > 2000 ? step.toolResult.substring(0, 2000) + '...' : step.toolResult;
                          }
                        })()}
                      </pre>
                    </div>
                  )}

                  {step.type === 'text' && step.content && (
                    <div className="detail-section">
                      <div className="detail-label">Text</div>
                      <pre className="detail-text">
                        {step.content.length > 2000 ? step.content.substring(0, 2000) + '...' : step.content}
                      </pre>
                    </div>
                  )}

                  {step.type === 'thinking' && step.content && (
                    <div className="detail-section">
                      <div className="detail-label">Thinking</div>
                      <pre className="detail-text">
                        {step.content.length > 2000 ? step.content.substring(0, 2000) + '...' : step.content}
                      </pre>
                    </div>
                  )}

                  {step.usage && (
                    <div className="detail-section">
                      <div className="detail-label">Token Usage</div>
                      <div className="token-grid">
                        <div>Input: <strong>{step.usage.input_tokens}</strong></div>
                        <div>Output: <strong>{step.usage.output_tokens}</strong></div>
                        <div>Cache Read: <strong>{step.usage.cache_read_input_tokens}</strong></div>
                        <div>Cache Create: <strong>{step.usage.cache_creation_input_tokens}</strong></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {subagents.length > 0 && (
        <div className="subagents-section">
          <h3>Subagents ({subagents.length})</h3>
          {subagents.map(sub => (
            <div key={sub.agentId} className="subagent-item">
              <code>{sub.agentId.substring(0, 12)}</code>
              <span>{sub.prompt.substring(0, 80)}...</span>
              <span>{sub.stepCount} steps</span>
              <span>${sub.totalCost.toFixed(4)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StepsTab;
