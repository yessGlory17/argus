import { useMemo } from 'react';
import { AnalysisResult, Step, Subagent, Finding } from '../types/session';
import './AnalysisTab.css';

interface Props {
  analysis?: AnalysisResult;
  steps: Step[];
  subagents: Subagent[];
  flatSteps: Step[];
  sessionTotalCost: number;
  onGoToStep: (globalIndex: number) => void;
}

type StepResolver = (localIdx: number) => number | undefined;

const renderFinding = (
  finding: Finding,
  i: number,
  resolveStep: StepResolver,
  onGoToStep: (gi: number) => void
) => (
  <div key={i} className={`finding-card ${finding.severity}`}>
    <div className="finding-header">
      <span className="finding-severity">{finding.severity}</span>
      <h3>{finding.title}</h3>
    </div>
    <p className="finding-description">{finding.description}</p>
    {finding.wastedCost && finding.wastedCost > 0 && (
      <div className="finding-cost">Wasted: ${finding.wastedCost.toFixed(4)}</div>
    )}
    {finding.affectedSteps && finding.affectedSteps.length > 0 && (
      <div className="finding-steps">
        <span>Affected steps:</span>
        {finding.affectedSteps.map(idx => {
          const gi = resolveStep(idx);
          if (gi === undefined) {
            return <span key={idx} className="step-link disabled">#{idx}</span>;
          }
          return (
            <button key={idx} className="step-link" onClick={() => onGoToStep(gi)}>
              #{gi}
            </button>
          );
        })}
      </div>
    )}
  </div>
);

const AnalysisTab = ({ analysis, steps, subagents, flatSteps, onGoToStep }: Props) => {
  // Build resolvers from (agentId | undefined, localIdx) → globalIndex so
  // findings can navigate into the unified timeline.
  const { mainResolver, getAgentResolver } = useMemo(() => {
    const main = new Map<number, number>();
    const byAgent = new Map<string, Map<number, number>>();
    for (const s of flatSteps) {
      const gi = s.globalIndex ?? s.index;
      if (s.agentId) {
        let m = byAgent.get(s.agentId);
        if (!m) {
          m = new Map();
          byAgent.set(s.agentId, m);
        }
        m.set(s.index, gi);
      } else {
        main.set(s.index, gi);
      }
    }
    return {
      mainResolver: ((idx: number) => main.get(idx)) as StepResolver,
      getAgentResolver: (agentId: string): StepResolver => {
        const m = byAgent.get(agentId);
        return (idx: number) => m?.get(idx);
      },
    };
  }, [flatSteps]);

  const mainFindings = analysis?.findings ?? [];
  const agentFindings = subagents.flatMap(s => s.analysis?.findings ?? []);
  const totalFindings = mainFindings.length + agentFindings.length;

  if (totalFindings === 0) {
    return (
      <div className="analysis-tab">
        <div className="empty-state">
          <p>No analysis findings. Session looks optimal!</p>
        </div>
      </div>
    );
  }

  const efficiency = analysis?.efficiency ?? 100;
  const wastedCost =
    (analysis?.wastedCost ?? 0) +
    subagents.reduce((acc, s) => acc + (s.analysis?.wastedCost ?? 0), 0);

  return (
    <div className="analysis-tab">
      <div className="debug-summary">
        <h3>Debug Summary</h3>
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-label">Findings</div>
            <div className="summary-value">{totalFindings}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Efficiency</div>
            <div className="summary-value">{efficiency.toFixed(1)}%</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Wasted Cost</div>
            <div className="summary-value">${wastedCost.toFixed(4)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total Steps</div>
            <div className="summary-value">{flatSteps.length}</div>
          </div>
        </div>
      </div>

      {mainFindings.length > 0 && (
        <div className="findings-section">
          <div className="findings-section-header">
            <h3>Main session ({mainFindings.length})</h3>
            <span className="findings-section-meta">{steps.length} steps</span>
          </div>
          <div className="findings-list">
            {mainFindings.map((f, i) => renderFinding(f, i, mainResolver, onGoToStep))}
          </div>
        </div>
      )}

      {subagents.map(sub => {
        const findings = sub.analysis?.findings ?? [];
        if (findings.length === 0) return null;
        const resolve = getAgentResolver(sub.agentId);
        return (
          <div className="findings-section" key={sub.agentId}>
            <div className="findings-section-header findings-section-agent">
              <h3>
                <span className="agent-section-label">
                  {sub.agentType || 'agent'}
                </span>
                {sub.description || sub.prompt.slice(0, 80)}
              </h3>
              <span className="findings-section-meta">
                {sub.stepCount} steps · ${sub.totalCost.toFixed(4)}
              </span>
            </div>
            <div className="findings-list">
              {findings.map((f, i) => renderFinding(f, i, resolve, onGoToStep))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AnalysisTab;
