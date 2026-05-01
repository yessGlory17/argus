import { useState, useEffect } from 'react';
import { SessionDetail } from './types/session';
import StepsTab from './components/StepsTab';
import AnalysisTab from './components/AnalysisTab';
import CostTab from './components/CostTab';
import FlowTab from './components/FlowTab';
import ContextTab from './components/ContextTab';
import PerformanceTab from './components/PerformanceTab';
import InsightsTab from './components/InsightsTab';
import MapTab, { DirEntry } from './components/MapTab';
import SessionNotes from './components/SessionNotes';
import './styles/global.css';
import './styles/App.css';

type Tab = 'steps' | 'analysis' | 'cost' | 'flow' | 'map' | 'context' | 'performance' | 'insights';

function App() {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('steps');
  const [loading, setLoading] = useState(true);
  const [highlightStep, setHighlightStep] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [mapCwd, setMapCwd] = useState<string>('');
  const [mapEntries, setMapEntries] = useState<DirEntry[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'sessionData') {
        setSession(message.data);
        setLoading(false);
        if (isLive) {
          setLastUpdate(new Date());
        }
      } else if (message.type === 'liveMode') {
        setIsLive(message.active);
      } else if (message.type === 'directoryTree') {
        setMapCwd(message.cwd || '');
        setMapEntries(Array.isArray(message.entries) ? message.entries : []);
      }
    };

    window.addEventListener('message', handleMessage);

    if (window.vscodeApi) {
      window.vscodeApi.postMessage({ type: 'ready' });
    }

    return () => window.removeEventListener('message', handleMessage);
  }, [isLive]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading session data...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="error">
        <p>No session data available</p>
      </div>
    );
  }

  const findingCount = session.analysis?.findings?.length ?? 0;
  const totalCost = session.analysis?.totalCost ?? session.totalCost ?? 0;

  const goToStep = (stepIndex: number) => {
    setActiveTab('steps');
    setHighlightStep(stepIndex);
  };

  const formatModel = (model: string): string => {
    if (!model) return '';
    if (model.includes('opus')) return 'Opus';
    if (model.includes('sonnet')) return 'Sonnet';
    if (model.includes('haiku')) return 'Haiku';
    return model;
  };

  const formatDuration = (ms: number): string => {
    if (!ms) return '';
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${min}m ${remainder}s`;
  };

  return (
    <div className="app">
      <div className="detail-header">
        <h2>{session.prompt}</h2>
        <div className="detail-meta">
          <span>{session.project}</span>
          <span className="meta-badge">{formatModel(session.model)}</span>
          <span>{formatDuration(session.durationMs)}</span>
          <span className="meta-dim">{session.steps.length} steps</span>
          {isLive && <span className="live-badge"><span className="live-dot"></span>LIVE</span>}
        </div>
      </div>

      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'steps' ? 'active' : ''}`}
          onClick={() => setActiveTab('steps')}
        >
          Steps ({session.steps.length})
        </button>
        <button
          className={`tab ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('analysis')}
        >
          Analysis ({findingCount})
        </button>
        <button
          className={`tab ${activeTab === 'cost' ? 'active' : ''}`}
          onClick={() => setActiveTab('cost')}
        >
          Cost (${totalCost.toFixed(2)})
        </button>
        <button
          className={`tab ${activeTab === 'flow' ? 'active' : ''}`}
          onClick={() => setActiveTab('flow')}
        >
          Flow
        </button>
        <button
          className={`tab ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          Map
        </button>
        <button
          className={`tab ${activeTab === 'context' ? 'active' : ''}`}
          onClick={() => setActiveTab('context')}
        >
          Context
        </button>
        <button
          className={`tab ${activeTab === 'performance' ? 'active' : ''}`}
          onClick={() => setActiveTab('performance')}
        >
          Performance
        </button>
        <button
          className={`tab ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          Insights
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'steps' && (
          <StepsTab
            steps={session.steps}
            subagents={session.subagents}
            findings={session.analysis?.findings || []}
            highlightStep={highlightStep}
          />
        )}
        {activeTab === 'analysis' && (
          <AnalysisTab
            analysis={session.analysis}
            steps={session.steps}
            sessionTotalCost={session.totalCost}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'cost' && (
          <CostTab
            steps={session.steps}
            analysis={session.analysis}
            sessionTotalCost={session.totalCost}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'flow' && (
          <FlowTab
            steps={session.steps}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'map' && (
          <MapTab
            steps={session.steps}
            cwd={mapCwd || session.project}
            topLevelEntries={mapEntries}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'context' && (
          <ContextTab
            steps={session.steps}
            analysis={session.analysis}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'performance' && (
          <PerformanceTab
            steps={session.steps}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'insights' && (
          <InsightsTab
            steps={session.steps}
            analysis={session.analysis}
            filesRead={session.filesRead}
            filesWritten={session.filesWritten}
            onGoToStep={goToStep}
          />
        )}

        {/* Session Notes */}
        <SessionNotes sessionId={session.sessionId} />
      </div>
    </div>
  );
}

export default App;

declare global {
  interface Window {
    vscodeApi?: {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}
