import { useState, useMemo } from 'react';
import { Step, Finding } from '../types/session';
import './GlobalSearch.css';

interface Props {
  steps: Step[];
  findings: Finding[];
  filesRead: string[];
  filesWritten: string[];
  onGoToStep: (index: number) => void;
  onClose: () => void;
}

type SearchResult = {
  type: 'step' | 'finding' | 'file';
  title: string;
  description: string;
  index?: number;
  stepIndex?: number;
};

const GlobalSearch = ({ steps, findings, filesRead, filesWritten, onGoToStep, onClose }: Props) => {
  const [query, setQuery] = useState('');

  const results = useMemo((): SearchResult[] => {
    if (!query || query.length < 2) return [];

    const q = query.toLowerCase();
    const matches: SearchResult[] = [];

    // Search in steps
    steps.forEach(step => {
      let matched = false;
      let description = '';

      // Search in tool name
      if (step.toolName?.toLowerCase().includes(q)) {
        matched = true;
        description = step.toolName;
      }

      // Search in tool input
      if (step.toolInput) {
        const inputStr = JSON.stringify(step.toolInput).toLowerCase();
        if (inputStr.includes(q)) {
          matched = true;
          if (step.toolInput.file_path) {
            description = step.toolInput.file_path;
          } else if (step.toolInput.command) {
            description = step.toolInput.command.substring(0, 80);
          } else if (step.toolInput.pattern) {
            description = `Pattern: ${step.toolInput.pattern}`;
          }
        }
      }

      // Search in tool result
      if (step.toolResult?.toLowerCase().includes(q)) {
        matched = true;
        const idx = step.toolResult.toLowerCase().indexOf(q);
        description = step.toolResult.substring(Math.max(0, idx - 40), idx + 40);
      }

      // Search in content (thinking)
      if (step.content?.toLowerCase().includes(q)) {
        matched = true;
        const idx = step.content.toLowerCase().indexOf(q);
        description = step.content.substring(Math.max(0, idx - 40), idx + 40);
      }

      if (matched) {
        matches.push({
          type: 'step',
          title: `Step #${step.index} - ${step.toolName || step.type}`,
          description,
          stepIndex: step.index,
        });
      }
    });

    // Search in findings
    findings.forEach((finding, idx) => {
      if (
        finding.title.toLowerCase().includes(q) ||
        finding.description.toLowerCase().includes(q)
      ) {
        matches.push({
          type: 'finding',
          title: finding.title,
          description: finding.description,
          index: idx,
          stepIndex: finding.affectedSteps?.[0],
        });
      }
    });

    // Search in files
    [...filesRead, ...filesWritten].forEach(file => {
      if (file.toLowerCase().includes(q)) {
        const isWritten = filesWritten.includes(file);
        matches.push({
          type: 'file',
          title: file.split('/').pop() || file,
          description: file,
        });
      }
    });

    return matches.slice(0, 50); // Limit results
  }, [query, steps, findings, filesRead, filesWritten]);

  const handleResultClick = (result: SearchResult) => {
    if (result.stepIndex !== undefined) {
      onGoToStep(result.stepIndex);
      onClose();
    }
  };

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-container" onClick={(e) => e.stopPropagation()}>
        <div className="search-header">
          <input
            type="text"
            className="search-input"
            placeholder="Search steps, findings, files... (min 2 chars)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button className="search-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="search-results">
          {query.length < 2 ? (
            <div className="search-hint">
              <span className="hint-icon">🔍</span>
              <p>Type at least 2 characters to search</p>
              <div className="hint-examples">
                <span>Examples:</span>
                <code>Read</code>
                <code>file.ts</code>
                <code>error</code>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="search-empty">
              <span className="empty-icon">❌</span>
              <p>No results found for "{query}"</p>
            </div>
          ) : (
            <>
              <div className="results-count">
                {results.length} result{results.length > 1 ? 's' : ''} found
              </div>
              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={`search-result ${result.type}`}
                  onClick={() => handleResultClick(result)}
                >
                  <div className="result-header">
                    <span className={`result-type-badge ${result.type}`}>
                      {result.type === 'step' && '📝'}
                      {result.type === 'finding' && '🔍'}
                      {result.type === 'file' && '📄'}
                      {result.type}
                    </span>
                    <span className="result-title">{result.title}</span>
                  </div>
                  <div className="result-description">{result.description}</div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="search-footer">
          <kbd>ESC</kbd> to close
          {results.length > 0 && <span>• Click on result to jump</span>}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
