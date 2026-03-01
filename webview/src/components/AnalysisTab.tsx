import { AnalysisResult, Step } from '../types/session';
import './AnalysisTab.css';

interface Props {
  analysis?: AnalysisResult;
  steps: Step[];
  onGoToStep: (index: number) => void;
}

const AnalysisTab = ({ analysis, steps, onGoToStep }: Props) => {
  if (!analysis || !analysis.findings || analysis.findings.length === 0) {
    return (
      <div className="analysis-tab">
        <div className="empty-state">
          <p>No analysis findings. Session looks optimal!</p>
        </div>
      </div>
    );
  }

  const { findings, efficiency, wastedCost } = analysis;

  return (
    <div className="analysis-tab">
      <div className="debug-summary">
        <h3>Debug Summary</h3>
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-label">Findings</div>
            <div className="summary-value">{findings.length}</div>
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
            <div className="summary-value">{steps.length}</div>
          </div>
        </div>
      </div>

      <div className="findings-list">
        {findings.map((finding, i) => (
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
                {finding.affectedSteps.map(idx => (
                  <button key={idx} className="step-link" onClick={() => onGoToStep(idx)}>
                    #{idx}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnalysisTab;
