import { useMemo } from 'react';
import { Step, AnalysisResult } from '../types/session';
import './InsightsTab.css';

interface Props {
  steps: Step[];
  analysis?: AnalysisResult;
  filesRead: string[];
  filesWritten: string[];
  onGoToStep: (index: number) => void;
}

interface Insight {
  type: 'optimization' | 'warning' | 'success' | 'info';
  icon: string;
  title: string;
  description: string;
  potentialSavings?: number;
  affectedSteps?: number[];
}

const InsightsTab = ({ steps, analysis, filesRead, filesWritten, onGoToStep }: Props) => {
  const insights = useMemo((): Insight[] => {
    const results: Insight[] = [];

    // File read patterns
    const fileReadCount = new Map<string, number>();
    steps.forEach(step => {
      if (step.toolName === 'Read' && step.toolInput?.file_path) {
        const path = step.toolInput.file_path;
        fileReadCount.set(path, (fileReadCount.get(path) || 0) + 1);
      }
    });

    // Duplicate reads insight
    const duplicateReads = Array.from(fileReadCount.entries()).filter(([_, count]) => count > 3);
    if (duplicateReads.length > 0) {
      const [mostReadFile, count] = duplicateReads[0];
      const fileName = mostReadFile.split('/').pop() || mostReadFile;
      results.push({
        type: 'optimization',
        icon: '💡',
        title: `Heavy File Re-reading Detected`,
        description: `${fileName} was read ${count} times. Consider implementing a caching strategy or breaking down the task to reduce redundant reads.`,
        potentialSavings: 0.15 * (count - 1),
      });
    }

    // Retry loop patterns from findings
    const retryLoops = analysis?.findings?.filter(f => f.rule === 'retry_loop') || [];
    if (retryLoops.length > 0) {
      const totalWasted = retryLoops.reduce((sum, f) => sum + (f.wastedCost || 0), 0);
      results.push({
        type: 'warning',
        icon: '🔁',
        title: `${retryLoops.length} Retry Loop${retryLoops.length > 1 ? 's' : ''} Detected`,
        description: `Operations were retried multiple times before succeeding. Consider adding error handling, validation, or breaking complex operations into smaller steps.`,
        potentialSavings: totalWasted,
        affectedSteps: retryLoops.flatMap(f => f.affectedSteps || []),
      });
    }

    // Context pressure insights
    const pressureFindings = analysis?.findings?.filter(f => f.rule === 'context_pressure') || [];
    if (pressureFindings.length > 0) {
      results.push({
        type: 'warning',
        icon: '⚠️',
        title: 'High Context Pressure Detected',
        description: `Token usage exceeded healthy thresholds during execution. Consider breaking the task into smaller sub-tasks or using subagents to manage context more efficiently.`,
        affectedSteps: pressureFindings.flatMap(f => f.affectedSteps || []),
      });
    }

    // Compaction insights
    const compactionFindings = analysis?.findings?.filter(f => f.rule === 'compaction_detected') || [];
    if (compactionFindings.length > 0) {
      const totalWasted = compactionFindings.reduce((sum, f) => sum + (f.wastedCost || 0), 0);
      results.push({
        type: 'info',
        icon: '🗜️',
        title: `${compactionFindings.length} Context Compaction${compactionFindings.length > 1 ? 's' : ''} Occurred`,
        description: `Context window was compacted to free up space. ${totalWasted > 0 ? `$${totalWasted.toFixed(4)} was spent re-reading files after compaction.` : 'No files needed to be re-read.'}`,
        potentialSavings: totalWasted,
        affectedSteps: compactionFindings.flatMap(f => f.affectedSteps || []),
      });
    }

    // Efficiency achievements
    const efficiency = analysis?.efficiency || 100;
    if (efficiency >= 90) {
      results.push({
        type: 'success',
        icon: '✨',
        title: 'Excellent Efficiency',
        description: `This session achieved ${efficiency.toFixed(1)}% efficiency with minimal wasted operations. Well-structured prompts and clear requirements contributed to this success.`,
      });
    } else if (efficiency < 70) {
      results.push({
        type: 'warning',
        icon: '📉',
        title: 'Low Efficiency Detected',
        description: `Efficiency is ${efficiency.toFixed(1)}%. Significant resources were wasted on failed operations or redundant work. Review findings for specific optimization opportunities.`,
        potentialSavings: analysis?.wastedCost || 0,
      });
    }

    // Cache usage insights
    const cacheMetrics = analysis?.contextMetrics;
    if (cacheMetrics && cacheMetrics.cacheHitRatio > 0) {
      const ratio = (cacheMetrics.cacheHitRatio * 100).toFixed(1);
      if (cacheMetrics.cacheHitRatio > 0.3) {
        results.push({
          type: 'success',
          icon: '💾',
          title: 'Effective Cache Utilization',
          description: `${ratio}% of tokens were served from cache, reducing costs significantly. The LLM effectively reused context from previous steps.`,
        });
      } else {
        results.push({
          type: 'info',
          icon: '💾',
          title: 'Low Cache Hit Rate',
          description: `Only ${ratio}% cache hit rate. This might indicate frequent context changes or insufficient context reuse opportunities.`,
        });
      }
    }

    // Edit patterns
    const editSteps = steps.filter(s => s.toolName === 'Edit');
    if (editSteps.length > 10) {
      results.push({
        type: 'info',
        icon: '✏️',
        title: 'High Number of Edits',
        description: `${editSteps.length} file edits were performed. Consider if some edits could be batched together or if the initial approach could be better planned to reduce iterations.`,
      });
    }

    // Bash command patterns
    const bashSteps = steps.filter(s => s.toolName === 'Bash');
    const bashFailures = bashSteps.filter(s => s.toolSuccess === false);
    if (bashFailures.length > 0) {
      results.push({
        type: 'warning',
        icon: '🐚',
        title: `${bashFailures.length} Failed Bash Command${bashFailures.length > 1 ? 's' : ''}`,
        description: `Command failures often indicate environment issues, missing dependencies, or incorrect assumptions. Review failed commands and consider adding validation steps.`,
        affectedSteps: bashFailures.map(s => s.index),
      });
    }

    // File write/read ratio
    if (filesWritten.length > 0) {
      const ratio = filesRead.length / filesWritten.length;
      if (ratio > 10) {
        results.push({
          type: 'optimization',
          icon: '📖',
          title: 'Read-Heavy Operation',
          description: `${filesRead.length} files read vs ${filesWritten.length} written (${ratio.toFixed(1)}:1 ratio). This suggests significant analysis/research work. Consider if some reads could be reduced.`,
        });
      } else if (ratio < 2) {
        results.push({
          type: 'info',
          icon: '✍️',
          title: 'Write-Heavy Operation',
          description: `${filesWritten.length} files written vs ${filesRead.length} read. This indicates a creative/generative task with minimal reference to existing code.`,
        });
      }
    }

    return results;
  }, [steps, analysis, filesRead, filesWritten]);

  const renderInsight = (insight: Insight, index: number) => (
    <div key={index} className={`insight-card ${insight.type}`}>
      <div className="insight-header">
        <span className="insight-icon">{insight.icon}</span>
        <h3 className="insight-title">{insight.title}</h3>
      </div>
      <p className="insight-description">{insight.description}</p>
      {insight.potentialSavings !== undefined && insight.potentialSavings > 0 && (
        <div className="insight-savings">
          <span className="savings-label">Potential Savings:</span>
          <span className="savings-value">${insight.potentialSavings.toFixed(4)}</span>
        </div>
      )}
      {insight.affectedSteps && insight.affectedSteps.length > 0 && (
        <div className="insight-steps">
          <span className="steps-label">Steps:</span>
          {insight.affectedSteps.slice(0, 10).map(idx => (
            <button key={idx} className="step-badge" onClick={() => onGoToStep(idx)}>
              #{idx}
            </button>
          ))}
          {insight.affectedSteps.length > 10 && (
            <span className="steps-more">+{insight.affectedSteps.length - 10}</span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="insights-tab">
      {insights.length === 0 ? (
        <div className="no-insights">
          <span className="no-insights-icon">✨</span>
          <h3>No Special Insights</h3>
          <p>This session ran smoothly without notable patterns or optimization opportunities.</p>
        </div>
      ) : (
        <div className="insights-grid">
          {insights.map((insight, index) => renderInsight(insight, index))}
        </div>
      )}
    </div>
  );
};

export default InsightsTab;
