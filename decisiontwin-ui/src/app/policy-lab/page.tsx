'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/api-config';
import { useSimulationStore } from '@/store/useSimulationStore';
import { Play, TrendingUp, TrendingDown, ArrowRight, Lightbulb, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface SimulationResult {
  years_simulated: number;
  metrics: {
    demographic_parity_difference: number;
    demographic_parity_ratio: number;
    approval_rate_overall: number;
  };
}

interface TradeoffPoint {
  offset: number;
  fairness: number;
  approval: number;
}

export default function PolicyLab() {
  const { addPolicyLabRecord } = useSimulationStore();

  const [sensitiveFeature, setSensitiveFeature] = useState('gender');
  const [baseThreshold, setBaseThreshold] = useState(0);
  const [compareThreshold, setCompareThreshold] = useState(15);
  const [simulationData, setSimulationData] = useState<SimulationResult[]>([]);
  const [tradeoffData, setTradeoffData] = useState<TradeoffPoint[]>([]);
  const [isRunningTradeoff, setIsRunningTradeoff] = useState(false);

  // Check if real data is loaded (to gate the run button)
  const { data: dataStatus } = useQuery({
    queryKey: ['data-status'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/data-status`);
      return res.json() as Promise<{ has_data: boolean; columns: string[] }>;
    },
  });

  const hasData = dataStatus?.has_data ?? false;

  const runSimulation = useMutation({
    mutationFn: async ({ years, threshold }: { years: number; threshold: number }) => {
      const res = await fetch(`${API_BASE_URL}/simulate-bias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          years_to_simulate: years,
          sensitive_feature: sensitiveFeature,
          threshold_adjustment: threshold,
        })
      });
      return { years, threshold, ...(await res.json()) };
    },
    onSuccess: (data) => {
      if (data?.metrics) {
        setSimulationData(prev => {
          const filtered = prev.filter(r => r.years_simulated !== data.years_simulated);
          return [...filtered, { years_simulated: data.years_simulated, metrics: data.metrics }];
        });
      }
    }
  });

  const runLongitudinalSimulation = () => {
    setSimulationData([]);
    for (let year = 1; year <= 10; year++) {
      runSimulation.mutate({ years: year, threshold: baseThreshold });
    }
  };

  // After all 10 years complete, save the year-10 result to Reports history
  useEffect(() => {
    if (simulationData.length === 10) {
      const last = simulationData.find(r => r.years_simulated === 10);
      if (last) {
        addPolicyLabRecord({
          id: `sim_${Date.now()}`,
          timestamp: new Date().toISOString(),
          sensitive_feature: sensitiveFeature,
          years_simulated: 10,
          threshold_adjustment: baseThreshold,
          metrics: last.metrics,
        });
      }
    }
  }, [simulationData]);

  // Build trade-off chart by running simulations at 4 threshold offsets using real data
  const runTradeoffAnalysis = async () => {
    if (!hasData) return;
    setIsRunningTradeoff(true);
    const offsets = [-30, -15, 0, 15, 30];
    const results: TradeoffPoint[] = [];
    for (const offset of offsets) {
      try {
        const res = await fetch(`${API_BASE_URL}/simulate-bias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ years_to_simulate: 5, sensitive_feature: sensitiveFeature, threshold_adjustment: offset })
        });
        const data = await res.json();
        if (data?.metrics) {
          results.push({
            offset,
            fairness: data.metrics.demographic_parity_ratio,
            approval: parseFloat((data.metrics.approval_rate_overall * 100).toFixed(2)),
          });
        }
      } catch { /* skip failed offset */ }
    }
    setTradeoffData(results);
    setIsRunningTradeoff(false);
  };

  // Run trade-off analysis whenever sensitive feature changes and data is available
  useEffect(() => {
    if (hasData) runTradeoffAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensitiveFeature, hasData]);

  const chartData = simulationData
    .sort((a, b) => a.years_simulated - b.years_simulated)
    .map(r => ({
      year: `Year ${r.years_simulated}`,
      disparityRatio: r.metrics.demographic_parity_ratio,
      approvalRate: parseFloat((r.metrics.approval_rate_overall * 100).toFixed(2)),
      parityDiff: r.metrics.demographic_parity_difference,
    }));

  const tradeoffChartData = tradeoffData.map(t => ({
    threshold: t.offset > 0 ? `+${t.offset}` : String(t.offset),
    fairness: t.fairness,
    approval: t.approval,
  }));

  // Dynamic recommendations from real simulation results
  const lastResult = simulationData.find(r => r.years_simulated === 10) ?? simulationData[simulationData.length - 1];
  const recommendations = lastResult ? [
    {
      icon: lastResult.metrics.demographic_parity_ratio < 0.8 ? TrendingDown : TrendingUp,
      title: lastResult.metrics.demographic_parity_ratio < 0.8 ? 'Lower Thresholds Required' : 'Thresholds Acceptable',
      description: lastResult.metrics.demographic_parity_ratio < 0.8
        ? `Parity ratio ${lastResult.metrics.demographic_parity_ratio.toFixed(3)} is below the 80% rule. Reduce threshold offset to improve fairness.`
        : `Parity ratio ${lastResult.metrics.demographic_parity_ratio.toFixed(3)} is within legal bounds.`,
      impact: lastResult.metrics.demographic_parity_ratio < 0.8 ? 'Critical' : 'Low',
    },
    {
      icon: Lightbulb,
      title: 'Periodic Auditing',
      description: `Approval rate: ${(lastResult.metrics.approval_rate_overall * 100).toFixed(1)}%. Parity diff: ${lastResult.metrics.demographic_parity_difference.toFixed(3)}. ${lastResult.metrics.demographic_parity_difference > 0.1 ? 'Significant group disparity detected.' : 'Disparity within acceptable range.'}`,
      impact: lastResult.metrics.demographic_parity_difference > 0.1 ? 'High Impact' : 'Medium Impact',
    },
    {
      icon: ArrowRight,
      title: 'Feedback Loop Correction',
      description: simulationData.length >= 2
        ? `Bias trend is ${simulationData[simulationData.length - 1].metrics.demographic_parity_ratio > simulationData[0].metrics.demographic_parity_ratio ? 'improving ↑' : 'worsening ↓'} over the simulated period.`
        : 'Run the simulation to see long-term trend direction.',
      impact: 'Medium Impact',
    },
  ] : [
    {
      icon: TrendingDown,
      title: 'Lower Credit Thresholds',
      description: 'Reducing the approval threshold increases approval rates for marginalized groups.',
      impact: 'High Impact',
    },
    {
      icon: Lightbulb,
      title: 'Periodic Auditing',
      description: 'Quarterly bias audits can catch drift before it compounds over multiple years.',
      impact: 'Medium Impact',
    },
    {
      icon: ArrowRight,
      title: 'Feedback Loop Correction',
      description: 'Implement counter-bias mechanisms that counteract the drift penalty.',
      impact: 'Critical',
    },
  ];

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-zinc-800 pb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Policy Lab</h1>
        <p className="text-zinc-400">Test What-If policy scenarios and visualize trade-offs</p>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Control Panel */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="glass-card p-6 space-y-6">
            <h2 className="text-xl font-semibold">Simulation Controls</h2>

            <div className="space-y-4">
              <label className="block text-sm font-medium text-zinc-400">Sensitive Feature</label>
              <select
                value={sensitiveFeature}
                onChange={(e) => { setSensitiveFeature(e.target.value); setSimulationData([]); }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-300 focus:outline-none focus:border-blue-500"
              >
                <option value="gender">Gender</option>
                <option value="race">Race</option>
                <option value="age_group">Age Group</option>
              </select>
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <label className="block text-sm font-medium text-zinc-400 flex justify-between">
                <span>Threshold Offset</span>
                <span className="text-blue-500 font-mono">{baseThreshold > 0 ? `+${baseThreshold}` : baseThreshold}</span>
              </label>
              <input
                type="range"
                min="-50"
                max="50"
                step="5"
                value={baseThreshold}
                onChange={(e) => setBaseThreshold(parseInt(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <p className="text-xs text-zinc-500">Negative = lower bar (more approvals). Positive = stricter.</p>
            </div>

            <button
              onClick={runLongitudinalSimulation}
              disabled={runSimulation.isPending || !hasData}
              className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {runSimulation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Running Year {simulationData.length + 1}/10...</>
              ) : (
                <><Play className="w-4 h-4" /> Run 10-Year Simulation</>
              )}
            </button>
            {!hasData && (
              <p className="text-xs text-amber-500 text-center">Upload a dataset first to run simulations.</p>
            )}
          </div>

          {/* Policy Recommendations */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-xl font-semibold">Policy Recommendations</h2>
            {recommendations.map((rec, i) => (
              <div key={i} className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                <div className="flex items-center gap-3 mb-2">
                  <rec.icon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <span className="font-medium text-white text-sm">{rec.title}</span>
                  <span className={`text-xs px-2 py-1 rounded ml-auto flex-shrink-0 ${
                    rec.impact === 'Critical' ? 'bg-rose-500/20 text-rose-400' :
                    rec.impact === 'High Impact' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-zinc-700 text-zinc-400'
                  }`}>
                    {rec.impact}
                  </span>
                </div>
                <p className="text-sm text-zinc-400">{rec.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Visualization Area */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Longitudinal Chart */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-medium mb-4">Longitudinal Bias Drift (10 Years)</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="year" stroke="#71717a" />
                  <YAxis stroke="#71717a" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                    labelStyle={{ color: '#e4e4e7' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="disparityRatio" stroke="#ef4444" name="Disparity Ratio" strokeWidth={2} dot={{ fill: '#ef4444' }} />
                  <Line type="monotone" dataKey="approvalRate" stroke="#22c55e" name="Approval Rate %" strokeWidth={2} dot={{ fill: '#22c55e' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-zinc-500">
                {runSimulation.isPending ? 'Running simulation on your dataset...' : 'Run simulation to see longitudinal drift'}
              </div>
            )}
          </div>

          {/* Threshold Comparison */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-medium mb-4">Threshold Comparison Impact</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Compare Offset</label>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="5"
                  value={compareThreshold}
                  onChange={(e) => setCompareThreshold(parseInt(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <span className="text-amber-500 font-mono mt-2 block">
                  {compareThreshold > 0 ? `+${compareThreshold}` : compareThreshold}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Base Offset ({baseThreshold > 0 ? `+${baseThreshold}` : baseThreshold}):</span>
                  <span className="text-blue-400 font-mono">{baseThreshold}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Compare Offset ({compareThreshold > 0 ? `+${compareThreshold}` : compareThreshold}):</span>
                  <span className="text-amber-400 font-mono">{compareThreshold}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                  <span className="text-zinc-300 font-medium">Impact:</span>
                  <span className={`font-mono ${compareThreshold < baseThreshold ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {compareThreshold < baseThreshold ? (
                      <><TrendingUp className="w-4 h-4 inline" /> +{Math.abs(baseThreshold - compareThreshold) * 0.1}% approvals</>
                    ) : (
                      <><TrendingDown className="w-4 h-4 inline" /> -{Math.abs(compareThreshold - baseThreshold) * 0.1}% approvals</>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Trade-off Matrix */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Fairness vs. Approval Trade-off</h3>
              {isRunningTradeoff && (
                <span className="flex items-center gap-2 text-xs text-zinc-400">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Calculating from your data...
                </span>
              )}
            </div>
            {tradeoffChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={tradeoffChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="threshold" stroke="#71717a" label={{ value: 'Threshold Offset', position: 'insideBottom', offset: -2, fill: '#71717a', fontSize: 11 }} />
                  <YAxis stroke="#71717a" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Bar dataKey="fairness" name="Fairness (Ratio)" fill="#22c55e" />
                  <Bar dataKey="approval" name="Approval Rate %" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-zinc-500">
                {isRunningTradeoff ? 'Calculating trade-offs from your dataset...' : hasData ? 'Loading trade-off data...' : 'Upload a dataset to see real trade-off analysis'}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
