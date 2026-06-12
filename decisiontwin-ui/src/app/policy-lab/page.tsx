'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/api-config';
import { useSimulationStore } from '@/store/useSimulationStore';
import { Play, TrendingUp, TrendingDown, ArrowRight, Lightbulb, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';

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

const SCORE_KEYWORDS = ['credit_score', 'score', 'income', 'salary', 'rating', 'grade',
  'points', 'amount', 'balance', 'price', 'value', '_id'];

export default function PolicyLab() {
  const { addPolicyLabRecord } = useSimulationStore();

  const [sensitiveFeature, setSensitiveFeature] = useState('gender');
  const [baseThreshold, setBaseThreshold] = useState(0);
  const [compareThreshold, setCompareThreshold] = useState(15);
  const [simulationData, setSimulationData] = useState<SimulationResult[]>([]);
  const [tradeoffData, setTradeoffData] = useState<TradeoffPoint[]>([]);
  const [isRunningTradeoff, setIsRunningTradeoff] = useState(false);
  const [isRunningLongitudinal, setIsRunningLongitudinal] = useState(false);
  const [longitudinalError, setLongitudinalError] = useState('');
  const [tradeoffError, setTradeoffError] = useState('');

  // ── Data status ──────────────────────────────────────────────────────────
  const { data: dataStatus } = useQuery({
    queryKey: ['data-status'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/data-status`);
      if (!res.ok) throw new Error(`data-status ${res.status}`);
      return res.json() as Promise<{ has_data: boolean; columns: string[] }>;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const hasData = dataStatus?.has_data ?? false;

  const featureOptions = (dataStatus?.columns && dataStatus.columns.length > 0)
    ? dataStatus.columns.filter(c => !SCORE_KEYWORDS.includes(c.toLowerCase()))
    : ['gender', 'race', 'age_group'];

  // Reset feature + results when a new dataset is ingested
  const prevColsKey = useRef('');
  useEffect(() => {
    const key = (dataStatus?.columns ?? []).join(',');
    if (key && key !== prevColsKey.current) {
      prevColsKey.current = key;
      if (!featureOptions.includes(sensitiveFeature)) {
        setSensitiveFeature(featureOptions[0] ?? 'gender');
      }
      setSimulationData([]);
      setTradeoffData([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(dataStatus?.columns ?? []).join(',')]);

  // ── Longitudinal simulation (all 10 years in parallel) ──────────────────
  const runLongitudinalSimulation = async () => {
    setSimulationData([]);
    setLongitudinalError('');
    setIsRunningLongitudinal(true);
    try {
      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, i) => i + 1).map(year =>
          fetch(`${API_BASE_URL}/simulate-bias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              years_to_simulate: year,
              sensitive_feature: sensitiveFeature,
              threshold_adjustment: baseThreshold,
            }),
          })
            .then(async r => {
              if (!r.ok) {
                const e = await r.json().catch(() => ({ detail: `HTTP ${r.status}` }));
                throw new Error(e.detail ?? `HTTP ${r.status}`);
              }
              return r.json();
            })
            .catch(() => null)
        )
      );

      const results: SimulationResult[] = responses
        .filter(d => d?.metrics)
        .map(d => ({ years_simulated: d.years_simulated, metrics: d.metrics }))
        .sort((a, b) => a.years_simulated - b.years_simulated);

      if (results.length === 0) {
        setLongitudinalError('All simulation calls failed. Check that your dataset has suitable columns.');
      }
      setSimulationData(results);
    } catch (e) {
      setLongitudinalError((e as Error).message);
    } finally {
      setIsRunningLongitudinal(false);
    }
  };

  // Save year-10 result to history
  useEffect(() => {
    if (simulationData.length >= 10) {
      const last = simulationData.find(r => r.years_simulated === 10) ?? simulationData[simulationData.length - 1];
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationData]);

  // ── Trade-off analysis (5 offsets in parallel) ───────────────────────────
  const tradeoffAbortRef = useRef<AbortController | null>(null);

  const runTradeoffAnalysis = async (feature: string) => {
    if (tradeoffAbortRef.current) tradeoffAbortRef.current.abort();
    const ctrl = new AbortController();
    tradeoffAbortRef.current = ctrl;

    setIsRunningTradeoff(true);
    setTradeoffError('');
    setTradeoffData([]);

    const offsets = [-30, -15, 0, 15, 30];
    try {
      const responses = await Promise.all(
        offsets.map(offset =>
          fetch(`${API_BASE_URL}/simulate-bias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              years_to_simulate: 5,
              sensitive_feature: feature,
              threshold_adjustment: offset,
            }),
            signal: ctrl.signal,
          })
            .then(r => r.json())
            .catch(() => null)
        )
      );

      if (ctrl.signal.aborted) return;

      const results: TradeoffPoint[] = responses
        .map((data, i) =>
          data?.metrics
            ? {
                offset: offsets[i],
                fairness: data.metrics.demographic_parity_ratio,
                approval: parseFloat((data.metrics.approval_rate_overall * 100).toFixed(2)),
              }
            : null
        )
        .filter(Boolean) as TradeoffPoint[];

      if (results.length === 0) {
        setTradeoffError('Trade-off analysis returned no data.');
      }
      setTradeoffData(results);
    } catch {
      // aborted — ignore
    } finally {
      if (!ctrl.signal.aborted) setIsRunningTradeoff(false);
    }
  };

  // Auto-run tradeoff when data is ready or feature changes
  useEffect(() => {
    if (hasData) {
      runTradeoffAnalysis(sensitiveFeature);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, sensitiveFeature]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = [...simulationData]
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

  // Recommendations
  const lastResult =
    simulationData.find(r => r.years_simulated === 10) ??
    simulationData[simulationData.length - 1];

  const recommendations = lastResult
    ? [
        {
          icon: lastResult.metrics.demographic_parity_ratio < 0.8 ? TrendingDown : TrendingUp,
          title: lastResult.metrics.demographic_parity_ratio < 0.8 ? 'Lower Thresholds Required' : 'Thresholds Acceptable',
          description:
            lastResult.metrics.demographic_parity_ratio < 0.8
              ? `Parity ratio ${lastResult.metrics.demographic_parity_ratio.toFixed(3)} is below 80% rule. Reduce threshold offset.`
              : `Parity ratio ${lastResult.metrics.demographic_parity_ratio.toFixed(3)} is within legal bounds.`,
          impact: lastResult.metrics.demographic_parity_ratio < 0.8 ? 'Critical' : 'Low',
        },
        {
          icon: Lightbulb,
          title: 'Periodic Auditing',
          description: `Approval rate: ${(lastResult.metrics.approval_rate_overall * 100).toFixed(1)}%. Parity diff: ${lastResult.metrics.demographic_parity_difference.toFixed(3)}. ${lastResult.metrics.demographic_parity_difference > 0.1 ? 'Significant disparity detected.' : 'Within acceptable range.'}`,
          impact: lastResult.metrics.demographic_parity_difference > 0.1 ? 'High Impact' : 'Medium Impact',
        },
        {
          icon: ArrowRight,
          title: 'Feedback Loop Correction',
          description:
            simulationData.length >= 2
              ? `Bias is ${simulationData[simulationData.length - 1].metrics.demographic_parity_ratio > simulationData[0].metrics.demographic_parity_ratio ? 'improving ↑' : 'worsening ↓'} over the simulated period.`
              : 'Run the simulation to see long-term trend direction.',
          impact: 'Medium Impact',
        },
      ]
    : [
        { icon: TrendingDown, title: 'Lower Credit Thresholds', description: 'Reducing the threshold increases approvals for marginalized groups.', impact: 'High Impact' },
        { icon: Lightbulb, title: 'Periodic Auditing', description: 'Quarterly audits catch drift before it compounds.', impact: 'Medium Impact' },
        { icon: ArrowRight, title: 'Feedback Loop Correction', description: 'Implement counter-bias mechanisms to counteract drift penalty.', impact: 'Critical' },
      ];

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Policy Lab</h1>
        <p className="text-slate-500">Test What-If policy scenarios and visualize trade-offs</p>
      </header>

      <div className="grid grid-cols-12 gap-8">

        {/* ── Control Panel ── */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="glass-card p-6 space-y-6">
            <h2 className="text-xl font-semibold text-slate-800">Simulation Controls</h2>
            
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-500">Sensitive Feature</label>
              <select
                value={sensitiveFeature}
                onChange={(e) => setSensitiveFeature(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl p-2 text-slate-700 focus:outline-none focus:border-orange-400"
              >
                {featureOptions.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
              <label className="block text-sm font-medium text-slate-500 flex justify-between">
                <span>Base Credit Threshold</span>
                <span className="font-mono" style={{ color: '#1E3A8A' }}>{baseThreshold}</span>
              </label>
              <input
                type="range" min="-50" max="50" step="5"
                value={baseThreshold}
                onChange={(e) => setBaseThreshold(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#F97316' }}
              />
              <p className="text-xs text-slate-500">Adjust the base credit score threshold for approval.</p>
            </div>

            <button
              onClick={runLongitudinalSimulation}
              disabled={isRunningLongitudinal}
              className="btn-primary w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {isRunningLongitudinal
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Simulating 10 years...</>
                : <><Play className="w-4 h-4" /> Run 10-Year Simulation</>
              }
            </button>
            {!hasData && (
              <p className="text-xs text-amber-500 text-center">Upload a dataset first to run simulations.</p>
            )}
          </div>

          {/* Recommendations */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-xl font-semibold text-slate-800">Policy Recommendations</h2>
            {recommendations.map((rec, i) => (
              <div key={i} className="p-4 bg-[#F8FAFC] rounded-lg border border-slate-100">
                <div className="flex items-center gap-3 mb-2">
                  <rec.icon className="w-5 h-5 text-amber-600" />
                  <span className="font-medium text-slate-800">{rec.title}</span>
                  <span className={`text-xs px-2 py-1 rounded font-medium ${
                    rec.impact === 'Critical' ? 'bg-rose-50 text-rose-700' :
                    rec.impact === 'High Impact' ? 'bg-blue-50 text-blue-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {rec.impact}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{rec.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Visualization Area ── */}
        <div className="col-span-12 lg:col-span-8 space-y-6">

          {/* Longitudinal Chart */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-medium text-slate-800 mb-4">Longitudinal Bias Drift (10 Years)</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="year" stroke="#CBD5E1" tick={{ fill: '#94A3B8' }} />
                  <YAxis stroke="#CBD5E1" tick={{ fill: '#94A3B8' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
                    labelStyle={{ color: '#1E293B' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="disparityRatio" stroke="#EF4444" name="Disparity Ratio" strokeWidth={2} />
                  <Line type="monotone" dataKey="approvalRate" stroke="#10B981" name="Approval Rate %" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-400">
                Run simulation to see longitudinal drift
              </div>
            )}
          </div>

          {/* Threshold Comparison */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-medium text-slate-800 mb-4">Threshold Comparison Impact</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-500 mb-2">Compare Threshold</label>
                <input
                  type="range" min="-50" max="50" step="5"
                  value={compareThreshold}
                  onChange={(e) => setCompareThreshold(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: '#F97316' }}
                />
                <span className="font-mono mt-2 block" style={{ color: '#F97316' }}>{compareThreshold}</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Base Threshold ({baseThreshold}):</span>
                  <span className="font-mono" style={{ color: '#1E3A8A' }}>{(baseThreshold - 650 + 0.75).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Compare Threshold ({compareThreshold}):</span>
                  <span className="font-mono" style={{ color: '#F97316' }}>{(compareThreshold - 650 + 0.75).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-slate-700 font-medium">Impact:</span>
                  <span className={`font-mono font-medium ${compareThreshold < baseThreshold ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {compareThreshold < baseThreshold ? (
                      <><TrendingUp className="w-4 h-4 inline" /> +{(baseThreshold - compareThreshold) * 0.1}% approval</>
                    ) : (
                      <><TrendingDown className="w-4 h-4 inline" /> -{(compareThreshold - baseThreshold) * 0.1}% approval</>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Trade-off Matrix */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-medium text-slate-800 mb-4">Fairness vs. Approval Trade-off</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={[
                { threshold: 600, fairness: 0.95, approval: 85 },
                { threshold: 650, fairness: 0.82, approval: 75 },
                { threshold: 700, fairness: 0.70, approval: 60 },
                { threshold: 750, fairness: 0.58, approval: 45 }
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="threshold" stroke="#CBD5E1" tick={{ fill: '#94A3B8' }} label={{ value: 'Credit Threshold', position: 'insideBottom', fill: '#94A3B8' }} />
                <YAxis stroke="#CBD5E1" tick={{ fill: '#94A3B8' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
                  labelStyle={{ color: '#1E293B' }}
                />
                <Legend />
                <Bar dataKey="fairness" name="Fairness (Ratio)" fill="#10B981" />
                <Bar dataKey="approval" name="Approval Rate %" fill="#1E3A8A" />
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      </div>
    </main>
  );
}
