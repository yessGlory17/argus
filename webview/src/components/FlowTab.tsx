import { Step } from '../types/session';
import './FlowTab.css';

interface Props {
  steps: Step[];
  onGoToStep: (index: number) => void;
}

interface OpRef {
  stepIndex: number;
  agentId?: string;
}

const FlowTab = ({ steps, onGoToStep }: Props) => {
  // Build file dependency graph. Steps may include sub-agent activity (flat
  // list); we still group per file but tag each op with the agent that did it.
  const fileOps = new Map<string, { reads: OpRef[]; writes: OpRef[]; agentIds: Set<string> }>();

  steps.forEach(step => {
    const fp: string | undefined = step.toolInput?.file_path;
    if (!fp) return;
    const ref: OpRef = { stepIndex: step.globalIndex ?? step.index, agentId: step.agentId };
    if (!fileOps.has(fp)) fileOps.set(fp, { reads: [], writes: [], agentIds: new Set() });
    const bucket = fileOps.get(fp)!;
    if (step.agentId) bucket.agentIds.add(step.agentId);
    if (step.toolName === 'Read') {
      bucket.reads.push(ref);
    } else if (step.toolName === 'Write' || step.toolName === 'Edit') {
      bucket.writes.push(ref);
    }
  });

  const sortedFiles = Array.from(fileOps.entries()).sort((a, b) =>
    (b[1].reads.length + b[1].writes.length) - (a[1].reads.length + a[1].writes.length)
  );

  // Get unique file counts and operation counts from the fileOps Map
  let uniqueFilesRead = 0;
  let uniqueFilesWritten = 0;
  let readOperations = 0;
  let writeOperations = 0;

  fileOps.forEach((ops) => {
    if (ops.reads.length > 0) {
      uniqueFilesRead++;
      readOperations += ops.reads.length;
    }
    if (ops.writes.length > 0) {
      uniqueFilesWritten++;
      writeOperations += ops.writes.length;
    }
  });

  const totalOperations = readOperations + writeOperations;

  return (
    <div className="flow-tab">
      <div className="flow-summary">
        <div className="flow-stat">
          <div className="flow-label">Unique Files Read</div>
          <div className="flow-value">{uniqueFilesRead}</div>
          <div className="flow-sublabel">{readOperations} operations</div>
        </div>
        <div className="flow-stat">
          <div className="flow-label">Unique Files Written</div>
          <div className="flow-value">{uniqueFilesWritten}</div>
          <div className="flow-sublabel">{writeOperations} operations</div>
        </div>
        <div className="flow-stat">
          <div className="flow-label">Total Operations</div>
          <div className="flow-value">{totalOperations}</div>
        </div>
      </div>

      <div className="file-flow-graph">
        <h3>File Operations List</h3>
        {sortedFiles.length === 0 ? (
          <div className="empty">No file operations detected</div>
        ) : (
          <div className="file-list">
            {sortedFiles.map(([path, ops]) => (
              <div key={path} className={`file-node${ops.agentIds.size > 0 ? ' file-node-agent' : ''}`}>
                <div className="file-path" title={path}>
                  <code>{path.split('/').pop()}</code>
                  <span className="file-full-path">{path}</span>
                  {ops.agentIds.size > 0 && (
                    <span className="file-agent-badge" title={`${ops.agentIds.size} sub-agent${ops.agentIds.size > 1 ? 's' : ''} touched this file`}>
                      A×{ops.agentIds.size}
                    </span>
                  )}
                </div>
                <div className="file-ops">
                  {ops.reads.length > 0 && (
                    <div className="op-group read">
                      <span className="op-label">Read ({ops.reads.length}x)</span>
                      <div className="op-steps">
                        {ops.reads.slice(0, 8).map(ref => (
                          <button
                            key={ref.stepIndex}
                            className={`step-link${ref.agentId ? ' step-link-agent' : ''}`}
                            onClick={() => onGoToStep(ref.stepIndex)}
                            title={ref.agentId ? `agent ${ref.agentId.slice(0, 12)}` : undefined}
                          >
                            #{ref.stepIndex}
                          </button>
                        ))}
                        {ops.reads.length > 8 && <span>+{ops.reads.length - 8}</span>}
                      </div>
                    </div>
                  )}
                  {ops.writes.length > 0 && (
                    <div className="op-group write">
                      <span className="op-label">Write ({ops.writes.length}x)</span>
                      <div className="op-steps">
                        {ops.writes.slice(0, 8).map(ref => (
                          <button
                            key={ref.stepIndex}
                            className={`step-link${ref.agentId ? ' step-link-agent' : ''}`}
                            onClick={() => onGoToStep(ref.stepIndex)}
                            title={ref.agentId ? `agent ${ref.agentId.slice(0, 12)}` : undefined}
                          >
                            #{ref.stepIndex}
                          </button>
                        ))}
                        {ops.writes.length > 8 && <span>+{ops.writes.length - 8}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FlowTab;
