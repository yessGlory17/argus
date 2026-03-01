import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Step } from '../types/session';

interface Props {
  steps: Step[];
  compactionPoints?: number[];
  pressureZones?: number[];
  onGoToStep?: (index: number) => void;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

export default function ContextTimeline({ steps, compactionPoints, pressureZones, onGoToStep }: Props) {
  const data = useMemo(() => {
    const entries: { index: number; step: string; cumInput: number; cumOutput: number; cumCache: number; isPressure?: boolean }[] = [];
    let cumInput = 0, cumOutput = 0, cumCache = 0;
    const pressureSet = new Set(pressureZones ?? []);

    for (const step of steps) {
      if (!step.usage) continue;
      cumInput += (step.usage.input_tokens ?? 0) + (step.usage.cache_creation_input_tokens ?? 0);
      cumOutput += step.usage.output_tokens ?? 0;
      cumCache += step.usage.cache_read_input_tokens ?? 0;
      entries.push({
        index: step.index,
        step: `#${step.index}`,
        cumInput,
        cumOutput,
        cumCache,
        isPressure: pressureSet.has(step.index)
      });
    }
    return entries;
  }, [steps, pressureZones]);

  if (data.length < 2) {
    return <div className="context-timeline-empty">Not enough data to display timeline</div>;
  }

  const compactionSet = new Set(compactionPoints ?? []);

  return (
    <div className="context-timeline-container">
      <h3 className="section-title">Token Timeline</h3>
      <div className="context-timeline-chart">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="step"
              stroke="rgba(255,255,255,0.4)"
              style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" }}
            />
            <YAxis
              tickFormatter={formatTokens}
              stroke="rgba(255,255,255,0.4)"
              style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '12px'
              }}
              labelStyle={{ color: 'var(--text-bright)', fontWeight: 600 }}
              formatter={(value: number | undefined) => [formatTokens(value ?? 0), '']}
            />

            {/* Compaction lines */}
            {data.map((d) =>
              compactionSet.has(d.index) ? (
                <ReferenceLine
                  key={`comp-${d.index}`}
                  x={d.step}
                  stroke="#f87171"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  opacity={0.7}
                />
              ) : null
            )}

            <Line
              type="monotone"
              dataKey="cumInput"
              stroke="#06b6d4"
              strokeWidth={2.5}
              dot={{ fill: '#06b6d4', r: 4 }}
              activeDot={{ r: 6, onClick: (_e, payload: any) => onGoToStep?.(payload.payload.index) }}
              name="Input"
            />
            <Line
              type="monotone"
              dataKey="cumOutput"
              stroke="#8b5cf6"
              strokeWidth={2.5}
              dot={{ fill: '#8b5cf6', r: 4 }}
              activeDot={{ r: 6 }}
              name="Output"
            />
            <Line
              type="monotone"
              dataKey="cumCache"
              stroke="#5eead4"
              strokeWidth={2.5}
              dot={{ fill: '#5eead4', r: 4 }}
              activeDot={{ r: 6 }}
              name="Cache"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="token-legend">
        <span className="token-legend-item"><span className="token-dot" style={{ background: '#06b6d4' }} />Input</span>
        <span className="token-legend-item"><span className="token-dot" style={{ background: '#8b5cf6' }} />Output</span>
        <span className="token-legend-item"><span className="token-dot" style={{ background: '#5eead4' }} />Cache</span>
        {(compactionPoints?.length ?? 0) > 0 && (
          <span className="token-legend-item"><span className="token-dot" style={{ background: '#f87171' }} />Compactions</span>
        )}
      </div>
    </div>
  );
}
