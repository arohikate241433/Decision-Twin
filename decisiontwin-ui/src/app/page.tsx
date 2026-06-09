'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSimulationStore } from '@/store/useSimulationStore';
import { API_BASE_URL } from '@/lib/api-config';
import Link from 'next/link';
import { Play, ShieldAlert, CheckCircle2, RefreshCw, TrendingUp, TrendingDown, Upload, Database } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SimulationData {
  status: string;
  years_simulated: number;
  metrics: {
    demographic_parity_difference: number;
    demographic_parity_ratio: number;
    approval_rate_overall: number;
  };
  bias_flags: Array<{
    category: string;
    severity: string;
    value: number;
  }>;
}

interface TimeSeriesPoint {
  year: number;
  disparityRatio: number;
  approvalRate: number;
  parityDiff: number;
}

export default function Dashboard() {
  const {
    yearsToSimulate, setYearsToSimulate,
    sensitiveFeature, setSensitiveFeature,
    thresholdAdjustment, setThresholdAdjustment,
    dataSource, setDataSource,
    availableColumns, setAvailableColumns,
    rowCount, setRowCount,
  } = useSimulationStore();

  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesPoint[]>([]);

  // Check if real data is loaded
  const { data: status, isLoading: isCheckingStatus } = useQuery({
    queryKey: ['data-status'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/data-status`);
      return res.json() as Promise<{ has_data: boolean; columns: string[]; row_count: number; source: string }>;
    },
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!status) return;
    if (status.has_data) {
      const source = status.source === 'synthetic' || status.source === 'mock' ? 'synthetic' : 'real';
      setDataSource(source);
      setAvailableColumns(status.columns);
      setRowCount(status.row_count);
    } else {
      setDataSource('none');
    }
  }, [status]);

  const hasData = status?.has_data ?? false;

  const { data: simulation, isLoading } = useQuery<SimulationData>({
    queryKey: ['simulate', yearsToSimulate, sensitiveFeature, thresholdAdjustment],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/simulate-bias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ years_to_simulate: yearsToSimulate, sensitive_feature: sensitiveFeature, threshold_adjustment: thresholdAdjustment })
      });
      if (!res.ok) throw new Error(`simulate-bias failed: ${res.status}`);
      return res.json();
    },
    enabled: hasData,
    retry: false,
  });

  const { data: report, isLoading: isReportLoading } = useQuery({
    queryKey: ['report', yearsToSimulate, sensitiveFeature, thresholdAdjustment, simulation?.metrics?.demographic_parity_ratio],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demographic_parity_ratio: simulation!.metrics.demographic_parity_ratio,
          demographic_parity_difference: simulation!.metrics.demographic_parity_difference,
          sensitive_feature: sensitiveFeature,
          years_simulated: yearsToSimulate
        })
      });
      if (!res.ok) throw new Error(`generate-report failed: ${res.status}`);
      return res.json();
    },
    enabled: !!simulation?.metrics,
    retry: false,
  });

  useEffect(() => {
    if (simulation) {
      const newPoint = {
        year: simulation.years_simulated,
        disparityRatio: simulation.metrics.demographic_parity_ratio,
        approvalRate: simulation.metrics.approval_rate_overall * 100,
        parityDiff: simulation.metrics.demographic_parity_difference
      };
      setTimeSeriesData(prev => {
        const filtered = prev.filter(p => p.year !== simulation.years_simulated);
        return [...filtered, newPoint].sort((a, b) => a.year - b.year);
      });
    }
  }, [simulation]);

  const trendDirection = timeSeriesData.length >= 2
    ? timeSeriesData[timeSeriesData.length - 1].disparityRatio > timeSeriesData[0].disparityRatio ? 'up' : 'down'
    : null;

  const featureOptions = availableColumns.length > 0
    ? availableColumns.filter(c => !['credit_score', 'score', 'income', 'salary', 'rating', 'grade', 'points'].includes(c.toLowerCase()))
    : ['gender', 'race', 'age_group'];

  if (isCheckingStatus) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </main>
    );
  }

  if (!hasData) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
        <div className="glass-card p-12 max-w-lg w-full text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto">
            <Database className="w-10 h-10 text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">No Data Loaded</h2>
            <p className="text-zinc-400">
              Upload your real dataset to start simulating bias. Supported formats: CSV, JSON, Parquet.
            </p>
            <p className="text-zinc-500 text-sm mt-2">
              Your data needs columns like a numeric score field and at least one categorical demographic field (e.g. gender, race, age group).
            </p>
          </div>
          <Link
            href="/ingest"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
            <Upload className="w-5 h-5" />
            Upload Your Dataset
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-7xl mx-auto space-y-8">

      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">DecisionTwin</h1>
          <p className="text-zinc-400">Forensic AI Bias Simulation & Audit Platform</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">
            <span className="text-emerald-500 font-mono">{rowCount.toLocaleString()}</span> records loaded
            {dataSource === 'real' && <span className="ml-2 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs">Real Data</span>}
            {dataSource === 'synthetic' && <span className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs">Synthetic</span>}
          </span>
          <Link
            href="/ingest"
            className="px-4 py-2 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center gap-2 text-sm"
          >
            <Upload className="w-4 h-4" />
            Replace Dataset
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">

        <div className="col-span-12 md:col-span-4 space-y-6">          <div className="glass-card p-6 flex flex-col space-y-6">
            <h2 className="text-xl font-semibold mb-2">Control Panel</h2>

            <div className="space-y-4">
              <label className="block text-sm font-medium text-zinc-400">Sensitive Feature to Track</label>
              <select
                value={sensitiveFeature}
                onChange={(e) => setSensitiveFeature(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-300 focus:outline-none focus:border-blue-500"
              >
                {featureOptions.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <label className="block text-sm font-medium text-zinc-400 flex justify-between">
                <span>Time-Travel Horizon</span>
                <span className="text-blue-500 font-mono">Year {yearsToSimulate}</span>
              </label>
              <input
                type="range"
                min="1" max="10"
                value={yearsToSimulate}
                onChange={(e) => setYearsToSimulate(parseInt(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 thumb-pulse"
              />
              <p className="text-xs text-zinc-500">Simulate compounding feedback loops year over year.</p>
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <label className="block text-sm font-medium text-zinc-400 flex justify-between">
                <span>Policy Intervention: Threshold Tilt</span>
                <span className={thresholdAdjustment !== 0 ? "text-amber-500 font-mono" : "text-zinc-500 font-mono"}>
                  {thresholdAdjustment > 0 ? "+" : ""}{thresholdAdjustment}
                </span>
              </label>
              <input
                type="range"
                min="-50" max="50" step="5"
                value={thresholdAdjustment}
                onChange={(e) => setThresholdAdjustment(parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <p className="text-xs text-zinc-500">Inject policy changes to see What-If trade-offs.</p>
            </div>
          </div>

          {timeSeriesData.length >= 2 && (
            <div className="glass-card p-4">
              <div className="text-sm text-zinc-400 mb-2">Bias Trend</div>
              <div className="flex items-center gap-2">
                {trendDirection === 'up' ? (
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-rose-500" />
                )}
                <span className={`text-lg font-bold ${trendDirection === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {trendDirection === 'up' ? 'Improving' : 'Worsening'}
                </span>
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                From {timeSeriesData[0].disparityRatio.toFixed(3)} to {timeSeriesData[timeSeriesData.length - 1].disparityRatio.toFixed(3)}
              </div>
            </div>
          )}
        </div>

        <div className="col-span-12 md:col-span-8 flex flex-col space-y-6">

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="glass-card p-6">
              <h3 className="text-sm font-medium text-zinc-400">Systemic Disparate Impact</h3>
              <div className="mt-4 flex items-baseline gap-2">
                {isLoading ? <div className="h-8 w-24 bg-zinc-800 rounded animate-pulse"></div> : (
                  <>
                    <span className={`text-4xl font-mono font-bold ${(simulation?.metrics?.demographic_parity_ratio ?? 1) < 0.8 ? 'text-rose-600' : 'text-emerald-500'}`}>
                      {simulation?.metrics?.demographic_parity_ratio || 0.00}
                    </span>
                    <span className="text-sm text-zinc-500">Target &gt; 0.80</span>
                  </>
                )}
              </div>
            </div>

            <div className="glass-card p-6">
              <h3 className="text-sm font-medium text-zinc-400">Demographic Parity Diff</h3>
              <div className="mt-4 flex items-baseline gap-2">
                {isLoading ? <div className="h-8 w-24 bg-zinc-800 rounded animate-pulse"></div> : (
                  <>
                    <span className="text-4xl font-mono font-bold text-amber-500">
                      {simulation?.metrics?.demographic_parity_difference || 0.00}
                    </span>
                    <span className="text-sm text-zinc-500">variance</span>
                  </>
                )}
              </div>
            </div>

            <div className="glass-card p-6">
              <h3 className="text-sm font-medium text-zinc-400">Global Approval Rate</h3>
              <div className="mt-4 flex items-baseline gap-2">
                {isLoading ? <div className="h-8 w-24 bg-zinc-800 rounded animate-pulse"></div> : (
                  <>
                    <span className="text-4xl font-mono font-bold text-blue-500">
                      {((simulation?.metrics?.approval_rate_overall || 0) * 100).toFixed(1)}%
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {timeSeriesData.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-medium border-b border-zinc-800 pb-4 mb-4">Bias Drift Over Time</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="year" stroke="#71717a" tickFormatter={(v) => `Y${v}`} />
                  <YAxis stroke="#71717a" domain={[0, 1]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                    labelFormatter={(v) => `Year ${v}`}
                    formatter={(value: number) => [value.toFixed(4), '']}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="disparityRatio" name="Disparity Ratio" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} />
                  <Line type="monotone" dataKey="approvalRate" name="Approval %" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="glass-card p-6 flex flex-col min-h-[300px]">
            <h3 className="text-lg font-medium border-b border-zinc-800 pb-4 w-full">Longitudinal Audit Logs & Bias Flags</h3>
            <div className="mt-6 flex-grow">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4 pt-10">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                  <p className="text-zinc-400 text-sm font-mono">Running FairLearn matrices for Year {yearsToSimulate}...</p>
                </div>
              ) : (
                <ul className="space-y-4">
                  {simulation?.bias_flags?.map((flag, i: number) => (
                    <li key={i} className={`p-4 rounded border flex items-start gap-4 ${flag.severity === 'High' ? 'bg-rose-600/10 border-rose-600/30 text-rose-500' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'}`}>
                      {flag.severity === 'High' ? <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />}
                      <div>
                        <strong className="block">{flag.category} (Score: {flag.value})</strong>
                        <span className="text-sm opacity-80">
                          {flag.severity === 'High'
                            ? "Compliance violation. The disparate impact ratio is below the legal 80% threshold."
                            : "Within acceptable statistical parity boundaries. No immediate systemic intervention required."}
                        </span>
                      </div>
                    </li>
                  ))}

                  <div className="mt-8 p-6 bg-blue-900/10 border border-blue-500/20 rounded font-mono text-sm leading-relaxed text-zinc-300">
                    <h4 className="flex items-center gap-2 text-blue-400 mb-3"><Play className="w-4 h-4" /> Gemini 1.5 Pro Forensic Summary</h4>
                    {isReportLoading ? (
                      <div className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Gemini is analyzing simulated decisions...</div>
                    ) : (
                      <p>{report?.report || "Audit summary unavailable."}</p>
                    )}
                  </div>
                </ul>
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
