'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/api-config';
import {
  Play, ShieldAlert, CheckCircle2, RefreshCw, TrendingUp, TrendingDown,
  ArrowRight, ShieldCheck, DollarSign, Users, AlertCircle, FileText, Settings, Upload
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts';

interface BorderlineCase {
  row_index: number;
  traits: Record<string, any>;
  model_decision: number;
  actual_decision: number;
  is_overridden: boolean;
}

interface YearlyResult {
  year: number;
  metrics: {
    demographic_parity_ratio: number;
    demographic_parity_diff: number;
    disparate_impact: number;
  };
  average_target_rate: number;
  borderline_cases: BorderlineCase[];
}

interface SimulationResponse {
  status: string;
  years_simulated: number;
  adversarial_personas_count: number;
  adversarial_personas: any[];
  gemma_critique: string;
  yearly_results: YearlyResult[];
}

interface SessionState {
  has_data: boolean;
  model_path: string | null;
  domain: 'lending' | 'scholarship' | 'hiring';
  protected_attribute: string;
  target_outcome: string;
  years_simulated: number;
  row_count: number;
  columns: string[];
}

// ─── Recharts custom tooltip (light-mode) ─────────────────────────────────
const LightTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-4 py-3 text-xs"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #E2E8F0',
        boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
        minWidth: 160,
      }}
    >
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-500">{entry.dataKey}</span>
          </span>
          <span className="font-bold text-slate-800">
            {typeof entry.value === 'number' ? entry.value.toFixed(3) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [yearsToSimulate, setYearsToSimulate] = useState(5);
  const [selectedYearIndex, setSelectedYearIndex] = useState(0);

  // 1. Fetch Session Info
  const { data: session, isLoading: isSessionLoading } = useQuery<SessionState>({
    queryKey: ['session'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/session`);
      if (!res.ok) throw new Error('Failed to fetch session');
      return res.json();
    }
  });

  // 2. Simulation Mutation
  const simulateMutation = useMutation<SimulationResponse, Error, { generatePersonas: boolean }>({
    mutationFn: async ({ generatePersonas }) => {
      const res = await fetch(
        `${API_BASE_URL}/run-simulation?years=${yearsToSimulate}&generate_personas=${generatePersonas}&adversarial_count=15`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Simulation run failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['simulationResults'], data);
      setSelectedYearIndex(0);
      queryClient.invalidateQueries({ queryKey: ['auditReport'] });
    }
  });

  // 3. HITL Override Mutation
  const overrideMutation = useMutation({
    mutationFn: async (payload: { year: number; row_index: number; new_decision: number }) => {
      const res = await fetch(`${API_BASE_URL}/override-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Override failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['simulationResults'], (prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          gemma_critique: data.gemma_critique,
          yearly_results: data.yearly_results
        };
      });
      queryClient.invalidateQueries({ queryKey: ['auditReport'] });
    }
  });

  // 4. Audit Report Query (Agent 3)
  const {
    data: reportData,
    isLoading: isReportLoading,
    refetch: generateReport
  } = useQuery({
    queryKey: ['auditReport'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/generate-report`, { method: 'POST' });
      if (!res.ok) throw new Error('Report generation failed');
      return res.json();
    },
    enabled: false,
  });

  // Trigger initial simulation when session is verified
  useEffect(() => {
    if (session?.has_data) {
      simulateMutation.mutate({ generatePersonas: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.has_data]);

  const simulationResults = queryClient.getQueryData<SimulationResponse>(['simulationResults']);
  const activeYearResults = simulationResults?.yearly_results[selectedYearIndex];

  // Derive business KPIs
  const lastYearResults = simulationResults?.yearly_results[simulationResults.yearly_results.length - 1];
  const fairnessScore = lastYearResults
    ? Math.round(lastYearResults.metrics.demographic_parity_ratio * 100)
    : 100;

  let biasRisk = 'Low Risk';
  let riskColor = 'text-emerald-600 border-emerald-200 bg-emerald-50';
  if (fairnessScore < 50) {
    biasRisk = 'High Bias Risk';
    riskColor = 'text-rose-600 border-rose-200 bg-rose-50';
  } else if (fairnessScore < 80) {
    biasRisk = 'Medium Bias Risk';
    riskColor = 'text-amber-600 border-amber-200 bg-amber-50';
  }

  // Domain-aware label generator
  const domainLabels = {
    lending: {
      fineRiskLabel: 'Est. Potential Regulatory Fines',
      opportunityLabel: 'Projected Credit Access Loss',
      positiveDecision: 'Approved',
      negativeDecision: 'Rejected',
    },
    hiring: {
      fineRiskLabel: 'Est. D&I Non-Compliance Penalty',
      opportunityLabel: 'Talent Pipeline Loss',
      positiveDecision: 'Hired',
      negativeDecision: 'Not Hired',
    },
    scholarship: {
      fineRiskLabel: 'Est. Educational Equity Risk',
      opportunityLabel: 'Projected Access Inequality',
      positiveDecision: 'Selected',
      negativeDecision: 'Not Selected',
    },
  };
  const labels = domainLabels[(session?.domain as keyof typeof domainLabels)] || domainLabels.lending;

  const potentialFines = fairnessScore < 80
    ? ((80 - fairnessScore) * 35000 + 50000).toLocaleString('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
      })
    : '₹0 (Compliant)';

  const missedOpportunities = fairnessScore < 80
    ? `${Math.round((80 - fairnessScore) * 1.8)}% skew in selection yield`
    : 'Negligible (Optimized)';

  // Recharts data
  const chartData = simulationResults?.yearly_results.map(r => ({
    year: `Year ${r.year}`,
    'Fairness Ratio': r.metrics.demographic_parity_ratio,
    'Selection Rate': r.average_target_rate,
    'Parity Difference': r.metrics.demographic_parity_diff
  })) || [];

  // ─── Loading state ────────────────────────────────────────────────────────
  if (isSessionLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F7FA] space-y-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #FB923C 0%, #F97316 100%)' }}
        >
          <RefreshCw className="w-7 h-7 text-white animate-spin" />
        </div>
        <p className="text-slate-400 font-medium text-sm">Initializing DecisionTwin Workspace…</p>
      </div>
    );
  }

  // ─── No dataset — redirect to ingest ──────────────────────────────────────
  if (session && !session.has_data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F7FA] p-6">
        <div className="light-card max-w-md w-full p-8 text-center space-y-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ backgroundColor: '#FFF7ED' }}
          >
            <AlertCircle className="w-8 h-8 text-orange-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">No Ingested Dataset Detected</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Welcome to DecisionTwin. To run longitudinal fairness simulations, you must first load a
            pre-trained domain pack or upload a custom CSV dataset.
          </p>
          <button
            onClick={() => router.push('/ingest')}
            className="btn-primary w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
          >
            Go to Data Ingest
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ─── Main Dashboard ───────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-up">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
              Fairness Dashboard
            </h1>
            <span
              className="text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{
                backgroundColor: '#FFF7ED',
                color: '#F97316',
                border: '1px solid #FED7AA',
              }}
            >
              v1.0-Beta
            </span>
          </div>
          <p className="text-slate-400 text-sm font-medium">
            Multi-Agent Algorithmic Fairness Simulation, Risk Assessment &amp; Governance
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => router.push('/ingest')}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 bg-white rounded-xl transition-all text-sm font-medium"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            <Settings className="w-4 h-4" />
            Switch Domain
          </button>

          <span
            className="px-4 py-2.5 rounded-xl bg-white flex items-center gap-2 text-xs font-semibold text-slate-600"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #E2E8F0' }}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Domain:&nbsp;
            <span className="text-slate-800 capitalize">{session?.domain}</span>
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

      {/* ── Main Grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6">

        {/* ── Left Control Column ───────────────────────────────────────── */}
        <div className="col-span-12 lg:col-span-4 space-y-6">

          {/* Simulation Controls */}
          <div className="light-card p-6 space-y-6">
            <h2 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">
              Simulation Controls
            </h2>

            {/* Horizon Slider */}
            <div className="space-y-3">
              <label className="flex justify-between text-sm font-semibold text-slate-600">
                <span>Simulation Horizon</span>
                <span style={{ color: '#F97316' }} className="font-mono">
                  {yearsToSimulate} Virtual Years
                </span>
              </label>
              <input
                type="range"
                min="3" max="10"
                value={yearsToSimulate}
                onChange={(e) => setYearsToSimulate(parseInt(e.target.value))}
                className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: '#F97316' }}
              />
              <p className="text-xs text-slate-400">
                Simulate longitudinal compounding loops and state transitions.
              </p>
            </div>

            {/* Session info read-only */}
            <div className="space-y-2.5 pt-4 border-t border-slate-100 text-sm">
              {[
                { label: 'Protected Attribute', value: session?.protected_attribute },
                { label: 'Target Outcome',      value: session?.target_outcome },
                { label: 'Dataset Size',        value: `${session?.row_count} records` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-slate-400">{label}:</span>
                  <span className="font-mono text-slate-700 font-medium">{value}</span>
                </div>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => simulateMutation.mutate({ generatePersonas: false })}
                disabled={simulateMutation.isPending}
                className="btn-primary w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
              >
                {simulateMutation.isPending
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Play className="w-4 h-4" />
                }
                Run Standard Simulation
              </button>

              <button
                onClick={() => simulateMutation.mutate({ generatePersonas: true })}
                disabled={simulateMutation.isPending}
                className="w-full py-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                style={{
                  borderColor: '#E9D5FF',
                  color: '#7C3AED',
                  backgroundColor: simulateMutation.isPending ? undefined : '#FAF5FF',
                }}
              >
                {simulateMutation.isPending
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <AlertCircle className="w-4 h-4" />
                }
                Stress-Test (Agent 1 Edge Cases)
              </button>
            </div>
          </div>

          {/* Business & Compliance Risk */}
          <div className="light-card p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">
              Business &amp; Compliance Risk
            </h2>

            {/* Fine Card */}
            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEE2E2' }}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#FEE2E2' }}
              >
                <DollarSign className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">{labels.fineRiskLabel}</span>
                <strong className="text-base font-bold text-slate-800 font-mono">{potentialFines}</strong>
              </div>
            </div>

            {/* Opportunities Lost */}
            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE' }}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#DBEAFE' }}
              >
                <Users className="w-5 h-5" style={{ color: '#1E3A8A' }} />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">{labels.opportunityLabel}</span>
                <strong className="text-base font-bold text-slate-800 font-mono">{missedOpportunities}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Dashboard Column ────────────────────────────────────── */}
        <div className="col-span-12 lg:col-span-8 space-y-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Fairness Score */}
            <div className="light-card p-5 flex flex-col justify-between space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Fairness Score
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className="text-4xl font-extrabold font-mono"
                  style={{ color: fairnessScore >= 80 ? '#10b981' : fairnessScore >= 50 ? '#F97316' : '#f43f5e' }}
                >
                  {fairnessScore}
                </span>
                <span className="text-sm text-slate-400">/ 100</span>
              </div>
              <span className="text-xs text-slate-400">Target &gt; 80 (Demographic Parity)</span>
            </div>

            {/* Risk Level */}
            <div className="light-card p-5 flex flex-col justify-between space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Algorithmic Risk Level
              </span>
              <span
                className={`inline-flex self-start px-3 py-1 rounded-full border text-sm font-semibold capitalize ${riskColor}`}
              >
                {biasRisk}
              </span>
              <span className="text-xs text-slate-400">Based on Indian regulatory models</span>
            </div>

            {/* Adversarial Stress */}
            <div className="light-card p-5 flex flex-col justify-between space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Adversarial Stress Test
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold font-mono" style={{ color: '#7C3AED' }}>
                  {simulationResults?.adversarial_personas_count || 0}
                </span>
                <span className="text-sm text-slate-400">personas added</span>
              </div>
              <span className="text-xs text-slate-400">Simulated to test structural drift</span>
            </div>
          </div>

          {/* Recharts — Longitudinal Fairness Trajectory */}
          {chartData.length > 0 && (
            <div className="light-card p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-slate-800">
                  Longitudinal Fairness Trajectory
                </h3>
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                  Bias drift visualizer
                </span>
              </div>

              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis
                      dataKey="year"
                      stroke="#CBD5E1"
                      tick={{ fontSize: 11, fill: '#94A3B8' }}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#CBD5E1"
                      domain={[0, 1.1]}
                      tick={{ fontSize: 11, fill: '#94A3B8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<LightTooltip />} />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12, color: '#64748B' }}
                    />
                    {/* Orange — primary metric */}
                    <Line
                      type="monotone"
                      dataKey="Fairness Ratio"
                      stroke="#F97316"
                      strokeWidth={2.5}
                      activeDot={{ r: 7, fill: '#F97316', stroke: '#fff', strokeWidth: 2 }}
                      dot={{ fill: '#F97316', r: 3, strokeWidth: 0 }}
                    />
                    {/* Navy Blue — secondary metric */}
                    <Line
                      type="monotone"
                      dataKey="Selection Rate"
                      stroke="#1E3A8A"
                      strokeWidth={2}
                      dot={{ fill: '#1E3A8A', r: 3, strokeWidth: 0 }}
                    />
                    {/* Muted dashed — tertiary */}
                    <Line
                      type="monotone"
                      dataKey="Parity Difference"
                      stroke="#94A3B8"
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                      dot={{ fill: '#94A3B8', r: 2, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Gemma Critique */}
              <div
                className="p-3 rounded-xl text-xs text-slate-500 leading-relaxed"
                style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
              >
                <strong className="text-slate-700">Critique (Gemma 2 Simulation Critic):</strong>{' '}
                {simulationResults?.gemma_critique || 'Critique unavailable.'}
              </div>
            </div>
          )}

          {/* HITL Intervention Panel */}
          {simulationResults && activeYearResults && (
            <div className="light-card p-6 space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-4 gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-500" />
                    Intervention Panel (Human-in-the-Loop)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Manually override borderline algorithmic selections to mitigate bias accumulation.
                  </p>
                </div>

                {/* Year tabs */}
                <div
                  className="flex gap-1 p-1 rounded-xl text-xs"
                  style={{ backgroundColor: '#F1F5F9' }}
                >
                  {simulationResults.yearly_results.map((r, idx) => (
                    <button
                      key={r.year}
                      onClick={() => setSelectedYearIndex(idx)}
                      className="px-3 py-1.5 rounded-lg transition-all font-medium cursor-pointer"
                      style={
                        selectedYearIndex === idx
                          ? {
                              backgroundColor: '#ffffff',
                              color: '#1E293B',
                              fontWeight: 700,
                              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                            }
                          : { color: '#94A3B8' }
                      }
                    >
                      Year {r.year}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cases Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400">
                      <th className="py-2.5 px-3 font-semibold">Row #</th>
                      <th className="py-2.5 px-3 font-semibold">Demographics / Key Traits</th>
                      <th className="py-2.5 px-3 text-center font-semibold">Model Decision</th>
                      <th className="py-2.5 px-3 text-center font-semibold">Current Decision</th>
                      <th className="py-2.5 px-3 text-right font-semibold">HITL Override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeYearResults.borderline_cases.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                          No borderline cases flagged for Year {selectedYearIndex + 1}.
                        </td>
                      </tr>
                    ) : (
                      activeYearResults.borderline_cases.map((c) => {
                        const traitsStr = Object.entries(c.traits)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' | ');

                        return (
                          <tr
                            key={c.row_index}
                            className="border-b border-slate-50 transition-colors"
                            style={{ ':hover': { backgroundColor: '#F8FAFC' } } as any}
                          >
                            <td className="py-3 px-3 font-mono text-slate-400">#{c.row_index}</td>
                            <td
                              className="py-3 px-3 truncate max-w-xs text-slate-600 font-medium"
                              title={traitsStr}
                            >
                              {traitsStr}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold"
                                style={
                                  c.model_decision === 1
                                    ? { backgroundColor: '#D1FAE5', color: '#065F46' }
                                    : { backgroundColor: '#F1F5F9', color: '#64748B' }
                                }
                              >
                                {c.model_decision === 1 ? labels.positiveDecision : labels.negativeDecision}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold"
                                style={
                                  c.actual_decision === 1
                                    ? { backgroundColor: '#D1FAE5', color: '#065F46' }
                                    : { backgroundColor: '#FFE4E6', color: '#9F1239' }
                                }
                              >
                                {c.actual_decision === 1 ? labels.positiveDecision : labels.negativeDecision}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <button
                                onClick={() =>
                                  overrideMutation.mutate({
                                    year: selectedYearIndex + 1,
                                    row_index: c.row_index,
                                    new_decision: c.actual_decision === 1 ? 0 : 1,
                                  })
                                }
                                disabled={overrideMutation.isPending}
                                className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border cursor-pointer"
                                style={
                                  c.is_overridden
                                    ? {
                                        background: 'linear-gradient(135deg, #FB923C 0%, #F97316 100%)',
                                        borderColor: '#EA580C',
                                        color: '#fff',
                                      }
                                    : {
                                        borderColor: '#E2E8F0',
                                        color: '#475569',
                                        backgroundColor: '#fff',
                                      }
                                }
                              >
                                {c.is_overridden ? 'Revert Override' : 'Trigger Override'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compliance Audit Report */}
          <div className="light-card p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="w-5 h-5" style={{ color: '#1E3A8A' }} />
                  Compliance Governance Audit Report
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Agent 3 performs real-time regulatory compliance mapping against RBI, NITI Aayog, and DPDP 2023.
                </p>
              </div>
              <button
                onClick={() => generateReport()}
                disabled={isReportLoading}
                className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2"
              >
                {isReportLoading
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <FileText className="w-3.5 h-3.5" />
                }
                Generate Audit Report
              </button>
            </div>

            {/* Markdown Viewer */}
            {reportData && (
              <div
                className="rounded-xl p-6 max-h-[400px] overflow-y-auto text-sm text-slate-600 space-y-3 leading-relaxed"
                style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
              >
                {reportData.report.split('\n').map((line: string, i: number) => {
                  if (line.startsWith('# '))
                    return (
                      <h1
                        key={i}
                        className="text-xl font-extrabold text-slate-800 mt-4 mb-2 tracking-tight border-b border-slate-200 pb-2"
                      >
                        {line.replace('# ', '')}
                      </h1>
                    );
                  if (line.startsWith('## '))
                    return (
                      <h2 key={i} className="text-lg font-bold text-slate-800 mt-4 mb-2">
                        {line.replace('## ', '')}
                      </h2>
                    );
                  if (line.startsWith('### '))
                    return (
                      <h3 key={i} className="text-base font-bold text-slate-700 mt-3 mb-1">
                        {line.replace('### ', '')}
                      </h3>
                    );
                  if (line.startsWith('- '))
                    return (
                      <li key={i} className="ml-4 list-disc text-slate-500">
                        {line.replace('- ', '')}
                      </li>
                    );
                  return (
                    <p key={i} className="my-1 text-slate-500">
                      {line}
                    </p>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
