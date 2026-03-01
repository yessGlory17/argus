import { useMemo } from 'react';
import { Step } from '../types/session';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import './PerformanceTab.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface Props {
  steps: Step[];
  onGoToStep: (index: number) => void;
}

const PerformanceTab = ({ steps, onGoToStep }: Props) => {
  const performanceData = useMemo(() => {
    // Calculate duration for each step
    const stepsWithDuration = steps.map((step, idx) => {
      const nextStep = steps[idx + 1];
      let duration = 0;

      if (step.timestamp && nextStep?.timestamp) {
        const current = new Date(step.timestamp).getTime();
        const next = new Date(nextStep.timestamp).getTime();
        duration = next - current;
      }

      return {
        ...step,
        duration,
      };
    });

    // Find slowest steps
    const sorted = [...stepsWithDuration]
      .filter(s => s.duration > 0)
      .sort((a, b) => b.duration - a.duration);
    const slowest = sorted.slice(0, 10);

    // Duration by tool type
    const durationByType: Record<string, number> = {};
    stepsWithDuration.forEach(step => {
      const key = step.toolName || step.type;
      durationByType[key] = (durationByType[key] || 0) + step.duration;
    });

    const totalDuration = Object.values(durationByType).reduce((sum, d) => sum + d, 0);

    return {
      stepsWithDuration,
      slowest,
      durationByType,
      totalDuration,
    };
  }, [steps]);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const sec = (ms / 1000).toFixed(1);
    return `${sec}s`;
  };

  // Chart data for slowest operations
  const chartData = {
    labels: performanceData.slowest.map(s => `#${s.index} ${s.toolName || s.type}`),
    datasets: [
      {
        label: 'Duration (ms)',
        data: performanceData.slowest.map(s => s.duration),
        backgroundColor: 'rgba(86, 156, 214, 0.8)',
        borderColor: 'rgba(86, 156, 214, 1)',
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: 'Top 10 Slowest Operations',
        color: '#CCCCCC',
        font: { size: 14 },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { color: '#999999' },
        grid: { color: 'rgba(255,255,255,0.1)' },
      },
      x: {
        ticks: { color: '#999999', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.1)' },
      },
    },
    onClick: (_event: any, elements: any[]) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        const step = performanceData.slowest[index];
        onGoToStep(step.index);
      }
    },
  };

  return (
    <div className="performance-tab">
      <div className="perf-summary">
        <div className="perf-card">
          <div className="perf-label">Total Duration</div>
          <div className="perf-value">{formatDuration(performanceData.totalDuration)}</div>
        </div>
        <div className="perf-card">
          <div className="perf-label">Slowest Step</div>
          <div className="perf-value">
            {performanceData.slowest[0] ? formatDuration(performanceData.slowest[0].duration) : '-'}
          </div>
          <div className="perf-sub">
            {performanceData.slowest[0] && `#${performanceData.slowest[0].index}`}
          </div>
        </div>
        <div className="perf-card">
          <div className="perf-label">Avg Duration</div>
          <div className="perf-value">
            {formatDuration(performanceData.totalDuration / steps.length)}
          </div>
        </div>
      </div>

      <div className="chart-section">
        <div className="chart-container">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      <div className="duration-breakdown">
        <h3>Duration by Tool Type</h3>
        <div className="duration-table">
          {Object.entries(performanceData.durationByType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, duration]) => (
              <div key={type} className="duration-row">
                <div className="duration-row-header">
                  <span className="duration-type">{type}</span>
                  <span className="duration-value">{formatDuration(duration)}</span>
                </div>
                <div className="duration-bar-container">
                  <div
                    className="duration-bar"
                    style={{
                      width: `${(duration / performanceData.totalDuration) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="slowest-steps-section">
        <h3>Slowest Steps Detail</h3>
        <div className="slowest-steps-list">
          {performanceData.slowest.map(step => (
            <div
              key={step.index}
              className="slowest-step-item"
              onClick={() => onGoToStep(step.index)}
            >
              <div className="slowest-step-header">
                <span className="slowest-step-index">#{step.index}</span>
                <span className="slowest-step-type">{step.toolName || step.type}</span>
                <span className="slowest-step-duration">{formatDuration(step.duration)}</span>
              </div>
              {step.toolInput?.file_path && (
                <div className="slowest-step-detail">{step.toolInput.file_path}</div>
              )}
              {step.toolInput?.command && (
                <div className="slowest-step-detail">
                  {step.toolInput.command.substring(0, 80)}
                  {step.toolInput.command.length > 80 && '...'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PerformanceTab;
