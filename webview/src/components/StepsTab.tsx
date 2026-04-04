import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Step, Subagent, Finding } from '../types/session';
import './StepsTab.css';

interface Props {
  steps: Step[];
  subagents: Subagent[];
  findings: Finding[];
  highlightStep: number | null;
}

/* ── SVG icons ── */
const SearchIcon = () => (
  <svg className="steps-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
  </svg>
);

const ChevronIcon = () => (
  <svg className="steps-dropdown-chevron" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
    <path d="M7.976 10.072l4.357-4.357.619.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/>
  </svg>
);

const CheckIcon = () => (
  <svg className="steps-dropdown-check" viewBox="0 0 16 16" fill="currentColor">
    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
  </svg>
);

/* ── Step icons per tool/type ── */
const stepIconProps = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const StepIcon = ({ step }: { step: Step }) => {
  const key = step.toolName || step.type;
  switch (key) {
    case 'Read':
      return (
        <svg className="step-icon step-icon-read" {...stepIconProps} stroke="currentColor">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 17H8"/><path d="M16 13h-2"/>
        </svg>
      );
    case 'Write':
      return (
        <svg className="step-icon step-icon-write" {...stepIconProps} stroke="currentColor">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/>
        </svg>
      );
    case 'Edit':
      return (
        <svg className="step-icon step-icon-edit" {...stepIconProps} stroke="currentColor">
          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
        </svg>
      );
    case 'Bash':
      return (
        <svg className="step-icon step-icon-bash" {...stepIconProps} stroke="currentColor">
          <polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>
        </svg>
      );
    case 'Grep':
      return (
        <svg className="step-icon step-icon-grep" {...stepIconProps} stroke="currentColor">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>
        </svg>
      );
    case 'Glob':
      return (
        <svg className="step-icon step-icon-glob" {...stepIconProps} stroke="currentColor">
          <circle cx="17" cy="17" r="3"/><path d="m21 21-1.9-1.9"/><path d="M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1"/>
        </svg>
      );
    case 'Agent':
      return (
        <svg className="step-icon step-icon-agent" {...stepIconProps} stroke="currentColor">
          <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
        </svg>
      );
    case 'thinking':
      return (
        <svg className="step-icon step-icon-thinking" {...stepIconProps} stroke="currentColor">
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>
        </svg>
      );
    case 'text':
      return (
        <svg className="step-icon step-icon-text" {...stepIconProps} stroke="currentColor">
          <path d="M7 10h10"/><path d="M7 14h4"/><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      );
    case 'error':
      return (
        <svg className="step-icon step-icon-error" {...stepIconProps} stroke="currentColor">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>
        </svg>
      );
    default:
      return (
        <svg className="step-icon step-icon-default" {...stepIconProps} stroke="currentColor">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      );
  }
};

// Dropdown trigger icons
const FilterIcon = () => (
  <svg className="steps-dropdown-trigger-icon" viewBox="0 0 16 16" fill="currentColor">
    <path d="M6 12v-1h4v1H6zM4 8v-1h8v1H4zM2 4v-1h12v1H2z"/>
  </svg>
);

const StatusIcon = () => (
  <svg className="steps-dropdown-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>
  </svg>
);

const SortIcon = () => (
  <svg className="steps-dropdown-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>
  </svg>
);

/* ── Dropdown component ── */
interface DropdownItem {
  value: string;
  label: string;
  count?: number;
}

interface DropdownProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  items: (DropdownItem | 'separator')[];
  selected: string | Set<string>;
  onSelect: (value: string) => void;
  isActive: boolean;
  multiSelect?: boolean;
  openDropdown: string | null;
  setOpenDropdown: (id: string | null) => void;
}

const Dropdown = ({ id, icon, label, items, selected, onSelect, isActive, multiSelect, openDropdown, setOpenDropdown }: DropdownProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isOpen = openDropdown === id;

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenDropdown(isOpen ? null : id);
  }, [id, isOpen, setOpenDropdown]);

  const isSelected = (value: string) => {
    if (selected instanceof Set) return selected.has(value);
    return selected === value;
  };

  return (
    <div className={`steps-dropdown${isOpen ? ' open' : ''}`} ref={ref}>
      <button
        className={`steps-dropdown-trigger${isActive ? ' active' : ''}${isOpen ? ' open' : ''}`}
        onClick={toggle}
      >
        {icon}
        <span className="steps-dropdown-trigger-label">{label}</span>
        <ChevronIcon />
      </button>
      {isOpen && (
        <div className="steps-dropdown-menu" onClick={e => e.stopPropagation()}>
          {items.map((item, i) => {
            if (item === 'separator') return <div key={`sep-${i}`} className="steps-dropdown-separator" />;
            return (
              <button
                key={item.value}
                className={`steps-dropdown-item${isSelected(item.value) ? ' selected' : ''}`}
                onClick={() => { onSelect(item.value); if (!multiSelect) setOpenDropdown(null); }}
              >
                <CheckIcon />
                <span className="steps-dropdown-item-label">{item.label}</span>
                {item.count !== undefined && <span className="steps-dropdown-item-count">{item.count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ── Sort labels ── */
const SORT_LABELS: Record<string, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  'cost-desc': 'Cost ↓',
  'cost-asc': 'Cost ↑',
};

/* ── Main component ── */
const StepsTab = ({ steps, subagents, findings, highlightStep }: Props) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [toolFilter, setToolFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortMode, setSortMode] = useState('newest');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const toggleToolFilter = useCallback((value: string) => {
    setToolFilter(prev => {
      if (value === 'all') return new Set();
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const close = () => setOpenDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // Auto-expand highlighted step
  useEffect(() => {
    if (highlightStep !== null) {
      setExpandedSteps(prev => {
        const newSet = new Set(prev);
        newSet.add(highlightStep);
        return newSet;
      });
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

  // Map findings to step indices
  const stepFindings = useMemo(() => {
    const map = new Map<number, Finding[]>();
    findings.forEach(f => {
      f.affectedSteps?.forEach(idx => {
        if (!map.has(idx)) map.set(idx, []);
        map.get(idx)!.push(f);
      });
    });
    return map;
  }, [findings]);

  // Dynamic tool/type counts
  const toolCounts = useMemo(() => {
    const counts = new Map<string, number>();
    steps.forEach(s => {
      const key = s.toolName || s.type;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [steps]);

  // Status counts
  const statusCounts = useMemo(() => {
    let success = 0, failed = 0, issues = 0;
    steps.forEach(s => {
      if (s.toolSuccess === true) success++;
      if (s.toolSuccess === false) failed++;
      if (stepFindings.has(s.index)) issues++;
    });
    return { success, failed, issues };
  }, [steps, stepFindings]);

  // Build tool dropdown items
  const toolItems = useMemo((): (DropdownItem | 'separator')[] => {
    const types: DropdownItem[] = [];
    const tools: DropdownItem[] = [];

    toolCounts.forEach((count, key) => {
      if (key === 'thinking' || key === 'text') {
        types.push({ value: key, label: key.charAt(0).toUpperCase() + key.slice(1), count });
      } else {
        tools.push({ value: key, label: key, count });
      }
    });

    // Sort tools alphabetically
    tools.sort((a, b) => a.label.localeCompare(b.label));

    const items: (DropdownItem | 'separator')[] = [
      { value: 'all', label: 'All Steps', count: steps.length },
    ];
    if (types.length > 0) {
      items.push('separator', ...types);
    }
    if (tools.length > 0) {
      items.push('separator', ...tools);
    }
    return items;
  }, [toolCounts, steps.length]);

  // Build status dropdown items
  const statusItems: (DropdownItem | 'separator')[] = useMemo(() => [
    { value: 'all', label: 'All', count: steps.length },
    'separator',
    { value: 'success', label: 'Success', count: statusCounts.success },
    { value: 'failed', label: 'Failed', count: statusCounts.failed },
    { value: 'issues', label: 'Has Issues', count: statusCounts.issues },
  ], [steps.length, statusCounts]);

  // Build sort dropdown items
  const sortItems: (DropdownItem | 'separator')[] = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    'separator',
    { value: 'cost-desc', label: 'Cost: High → Low' },
    { value: 'cost-asc', label: 'Cost: Low → High' },
  ];

  // Filtered and sorted steps
  const filteredSteps = useMemo(() => {
    let result = [...steps];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        (s.toolName?.toLowerCase().includes(q)) ||
        (s.content?.toLowerCase().includes(q)) ||
        (s.toolInput && JSON.stringify(s.toolInput).toLowerCase().includes(q)) ||
        (s.toolResult?.toLowerCase().includes(q))
      );
    }

    // Tool filter (multi-select)
    if (toolFilter.size > 0) {
      result = result.filter(s => {
        const key = s.toolName || s.type;
        return toolFilter.has(key);
      });
    }

    // Status filter
    if (statusFilter === 'success') result = result.filter(s => s.toolSuccess === true);
    if (statusFilter === 'failed') result = result.filter(s => s.toolSuccess === false);
    if (statusFilter === 'issues') result = result.filter(s => stepFindings.has(s.index));

    // Sorting
    switch (sortMode) {
      case 'newest': result.sort((a, b) => b.index - a.index); break;
      case 'oldest': result.sort((a, b) => a.index - b.index); break;
      case 'cost-desc': result.sort((a, b) => b.cost - a.cost); break;
      case 'cost-asc': result.sort((a, b) => a.cost - b.cost); break;
    }

    return result;
  }, [steps, searchQuery, toolFilter, statusFilter, sortMode, stepFindings]);

  // Calculate duration for each step (time to next step)
  const stepDurations = useMemo(() => {
    const durations = new Map<number, number>();
    const sorted = [...steps].sort((a, b) => a.index - b.index);
    for (let i = 0; i < sorted.length; i++) {
      if (!sorted[i].timestamp) continue;
      const current = new Date(sorted[i].timestamp!).getTime();
      if (i + 1 < sorted.length && sorted[i + 1].timestamp) {
        const next = new Date(sorted[i + 1].timestamp!).getTime();
        const diff = next - current;
        if (diff >= 0) durations.set(sorted[i].index, diff);
      }
    }
    return durations;
  }, [steps]);

  const formatTime = (timestamp?: string | Date) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    const sec = ms / 1000;
    if (sec < 60) return `${sec.toFixed(1)}s`;
    const min = Math.floor(sec / 60);
    const rem = Math.round(sec % 60);
    return `${min}m ${rem}s`;
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

  const toolLabel = toolFilter.size === 0 ? 'Tool' : toolFilter.size === 1 ? [...toolFilter][0] : `${toolFilter.size} tools`;
  const statusLabel = statusFilter === 'all' ? 'Status' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1);
  const hasActiveFilters = searchQuery !== '' || toolFilter.size > 0 || statusFilter !== 'all' || sortMode !== 'newest';

  const clearAllFilters = () => {
    setSearchQuery('');
    setToolFilter(new Set());
    setStatusFilter('all');
    setSortMode('newest');
    setOpenDropdown(null);
  };

  return (
    <div className="steps-tab">
      <div className="steps-controls">
        <div className="steps-filter-bar" onClick={e => e.stopPropagation()}>
          <SearchIcon />
          <input
            className="steps-search-input"
            type="text"
            placeholder="Search steps..."
            spellCheck={false}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="steps-search-clear" onClick={() => setSearchQuery('')}>×</button>
          )}

          <div className="steps-divider" />
          <Dropdown
            id="tool"
            icon={<FilterIcon />}
            label={toolLabel}
            items={toolItems}
            selected={toolFilter.size === 0 ? 'all' : toolFilter}
            onSelect={toggleToolFilter}
            isActive={toolFilter.size > 0}
            multiSelect
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
          />

          <div className="steps-divider" />
          <Dropdown
            id="status"
            icon={<StatusIcon />}
            label={statusLabel}
            items={statusItems}
            selected={statusFilter}
            onSelect={setStatusFilter}
            isActive={statusFilter !== 'all'}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
          />

          <div className="steps-divider" />
          <Dropdown
            id="sort"
            icon={<SortIcon />}
            label={SORT_LABELS[sortMode]}
            items={sortItems}
            selected={sortMode}
            onSelect={setSortMode}
            isActive={sortMode !== 'newest'}
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
          />

          {hasActiveFilters && (
            <>
              <div className="steps-divider" />
              <button className="steps-clear-filters" onClick={clearAllFilters} title="Clear all filters">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
                </svg>
                <span>Clear</span>
              </button>
            </>
          )}
        </div>

        <div className="steps-filter-meta">
          <span className="steps-count">Showing {filteredSteps.length} / {steps.length}</span>
        </div>
      </div>

      <div className="steps-scroll">
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
                  <StepIcon step={step} />
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
                  {stepDurations.has(step.index) && (
                    <span className={`step-duration${(stepDurations.get(step.index)!) >= 5000 ? ' slow' : ''}`}>
                      {formatDuration(stepDurations.get(step.index)!)}
                    </span>
                  )}
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
    </div>
  );
};

export default StepsTab;
