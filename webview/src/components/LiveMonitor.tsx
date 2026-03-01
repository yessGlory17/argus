import { useState, useEffect } from 'react';
import './LiveMonitor.css';

interface Props {
  isActive: boolean;
  onClose: () => void;
}

interface LiveStats {
  currentStep: number;
  totalSteps: number;
  currentCost: number;
  currentTool: string;
  elapsedTime: number;
  tokensUsed: number;
}

const LiveMonitor = ({ isActive, onClose }: Props) => {
  const [stats, setStats] = useState<LiveStats>({
    currentStep: 0,
    totalSteps: 0,
    currentCost: 0,
    currentTool: 'Initializing...',
    elapsedTime: 0,
    tokensUsed: 0,
  });

  // Simulated live updates (gerçekte VS Code extension'dan gelecek)
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        elapsedTime: prev.elapsedTime + 1,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isActive) {
    return null;
  }

  return (
    <div className="live-monitor active">
      <div className="live-header">
        <div className="live-badge active-badge">
          <span className="status-dot pulse"></span>
          Live Session
        </div>
        <button className="live-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="live-stats">
        <div className="live-stat">
          <div className="stat-label">Current Step</div>
          <div className="stat-value">
            {stats.currentStep} / {stats.totalSteps}
          </div>
        </div>

        <div className="live-stat">
          <div className="stat-label">Elapsed Time</div>
          <div className="stat-value">{formatTime(stats.elapsedTime)}</div>
        </div>

        <div className="live-stat">
          <div className="stat-label">Current Cost</div>
          <div className="stat-value">${stats.currentCost.toFixed(4)}</div>
        </div>

        <div className="live-stat">
          <div className="stat-label">Tokens Used</div>
          <div className="stat-value">{stats.tokensUsed.toLocaleString()}</div>
        </div>
      </div>

      <div className="live-current-action">
        <div className="action-label">Current Action:</div>
        <div className="action-tool">{stats.currentTool}</div>
      </div>

      <div className="live-footer">
        <div className="live-indicator">
          <span className="indicator-dot"></span>
          Monitoring in real-time
        </div>
      </div>
    </div>
  );
};

export default LiveMonitor;
