import { Step } from '../types/session';
import './FlowTab.css';

interface Props {
  steps: Step[];
  onGoToStep: (index: number) => void;
}

const FlowTab = ({ steps, onGoToStep }: Props) => {
  // Build file dependency graph
  const fileOps = new Map<string, { reads: number[]; writes: number[] }>();

  steps.forEach(step => {
    if (step.toolName === 'Read' && step.toolInput?.file_path) {
      const path = step.toolInput.file_path;
      if (!fileOps.has(path)) fileOps.set(path, { reads: [], writes: [] });
      fileOps.get(path)!.reads.push(step.index);
    }
    if ((step.toolName === 'Write' || step.toolName === 'Edit') && step.toolInput?.file_path) {
      const path = step.toolInput.file_path;
      if (!fileOps.has(path)) fileOps.set(path, { reads: [], writes: [] });
      fileOps.get(path)!.writes.push(step.index);
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
              <div key={path} className="file-node">
                <div className="file-path" title={path}>
                  <code>{path.split('/').pop()}</code>
                  <span className="file-full-path">{path}</span>
                </div>
                <div className="file-ops">
                  {ops.reads.length > 0 && (
                    <div className="op-group read">
                      <span className="op-label">Read ({ops.reads.length}x)</span>
                      <div className="op-steps">
                        {ops.reads.slice(0, 8).map(idx => (
                          <button key={idx} className="step-link" onClick={() => onGoToStep(idx)}>
                            #{idx}
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
                        {ops.writes.slice(0, 8).map(idx => (
                          <button key={idx} className="step-link" onClick={() => onGoToStep(idx)}>
                            #{idx}
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
