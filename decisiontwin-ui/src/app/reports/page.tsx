'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/api-config';
import { FileText, Download, Calendar, TrendingUp, TrendingDown, Clock, Share2 } from 'lucide-react';

interface HistoricalSimulation {
  id: string;
  timestamp: string;
  sensitive_feature: string;
  years_simulated: number;
  threshold_adjustment: number;
  metrics: {
    demographic_parity_difference: number;
    demographic_parity_ratio: number;
    approval_rate_overall: number;
  };
  report?: string;
}

export default function Reports() {
  const [selectedSimulation, setSelectedSimulation] = useState<HistoricalSimulation | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const generateData = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE_URL}/generate-synthetic-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_count: 100, characteristics: ["gender", "race", "income", "credit_score"] })
      });
      return res.json();
    }
  });

  const { data: simulation } = useQuery({
    queryKey: ['simulate'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/simulate-bias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ years_to_simulate: 5, sensitive_feature: 'gender', threshold_adjustment: 0 })
      });
      return res.json();
    },
    enabled: generateData.isSuccess
  });

  const { data: report, isLoading: isReportLoading } = useQuery({
    queryKey: ['report'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demographic_parity_ratio: simulation?.metrics?.demographic_parity_ratio || 0.8,
          demographic_parity_difference: simulation?.metrics?.demographic_parity_difference || 0,
          sensitive_feature: 'gender',
          years_simulated: 5
        })
      });
      return res.json();
    },
    enabled: !!simulation?.metrics
  });

  useEffect(() => {
    if (!generateData.isSuccess) {
      generateData.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mockHistoricalData: HistoricalSimulation[] = [
    {
      id: 'sim_001',
      timestamp: '2026-04-26T10:30:00Z',
      sensitive_feature: 'gender',
      years_simulated: 5,
      threshold_adjustment: 0,
      metrics: { demographic_parity_difference: 0.15, demographic_parity_ratio: 0.78, approval_rate_overall: 0.72 },
      report: 'Gender bias analysis shows 22% disparity in approval rates. Immediate threshold review recommended.'
    },
    {
      id: 'sim_002',
      timestamp: '2026-04-25T14:20:00Z',
      sensitive_feature: 'race',
      years_simulated: 3,
      threshold_adjustment: 10,
      metrics: { demographic_parity_difference: 0.22, demographic_parity_ratio: 0.71, approval_rate_overall: 0.68 },
      report: 'Race-based disparity exceeds legal threshold. Counter-bias mechanisms required.'
    },
    {
      id: 'sim_003',
      timestamp: '2026-04-24T09:15:00Z',
      sensitive_feature: 'age_group',
      years_simulated: 7,
      threshold_adjustment: -5,
      metrics: { demographic_parity_difference: 0.08, demographic_parity_ratio: 0.89, approval_rate_overall: 0.75 },
      report: 'Age group analysis within acceptable bounds. Monitor for drift in subsequent quarters.'
    },
    {
      id: 'sim_004',
      timestamp: '2026-04-23T16:45:00Z',
      sensitive_feature: 'gender',
      years_simulated: 10,
      threshold_adjustment: 0,
      metrics: { demographic_parity_difference: 0.31, demographic_parity_ratio: 0.62, approval_rate_overall: 0.70 },
      report: 'Critical 10-year projection shows compounding disparity. Regulatory intervention likely required.'
    },
    {
      id: 'sim_005',
      timestamp: '2026-04-22T11:00:00Z',
      sensitive_feature: 'race',
      years_simulated: 1,
      threshold_adjustment: 20,
      metrics: { demographic_parity_difference: 0.12, demographic_parity_ratio: 0.85, approval_rate_overall: 0.65 },
      report: 'Initial baseline shows acceptable parity with current threshold adjustment. Continue monitoring.'
    }
  ];

  const exportToCSV = (data: HistoricalSimulation[]) => {
    const headers = ['ID', 'Timestamp', 'Sensitive Feature', 'Years Simulated', 'Threshold Adjustment', 'Demographic Parity Ratio', 'Demographic Parity Diff', 'Approval Rate'];
    const rows = data.map(sim => [
      sim.id,
      sim.timestamp,
      sim.sensitive_feature,
      sim.years_simulated,
      sim.threshold_adjustment,
      sim.metrics.demographic_parity_ratio,
      sim.metrics.demographic_parity_difference,
      sim.metrics.approval_rate_overall
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `decisiontwin_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const generatePDFReport = async () => {
    setGeneratingReport(true);
    const reportContent = `
DECISION TWIN - BIAS AUDIT REPORT
Generated: ${new Date().toISOString()}
=====================================

SIMULATION SUMMARY
------------------
Sensitive Feature: ${simulation?.sensitive_feature || 'gender'}
Years Simulated: ${simulation?.years_simulated || 5}
Threshold Adjustment: ${simulation?.threshold_adjustment || 0}

FAIRNESS METRICS
----------------
Demographic Parity Ratio: ${simulation?.metrics?.demographic_parity_ratio || 'N/A'}
Demographic Parity Difference: ${simulation?.metrics?.demographic_parity_difference || 'N/A'}
Overall Approval Rate: ${simulation?.metrics?.approval_rate_overall || 'N/A'}%

EXECUTIVE SUMMARY
------------------
${report?.report || 'Report generation in progress...'}

COMPLIANCE STATUS
-----------------
${(simulation?.metrics?.demographic_parity_ratio || 0) >= 0.8 
  ? '✓ PASS - Bias metrics within acceptable legal thresholds' 
  : '✗ FAIL - Bias metrics exceed legal thresholds (80% Rule violation)'}

=====================================
This report was generated by DecisionTwin AI Ethics Platform
    `;

    const blob = new Blob([reportContent], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bias_audit_report_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    setGeneratingReport(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateTrend = (current: number, previous: number) => {
    const diff = current - previous;
    return {
      value: Math.abs(diff).toFixed(3),
      direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral'
    };
  };

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-end border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Reports</h1>
          <p className="text-slate-400">Historical simulations, exports, and compliance documentation</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => exportToCSV(mockHistoricalData)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 bg-white rounded-xl transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={generatePDFReport}
            disabled={generatingReport}
            className="flex items-center gap-2 px-4 py-2 rounded btn-primary transition-colors disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            {generatingReport ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5" style={{ color: '#F97316' }} />
            <span className="text-sm text-slate-400">Total Simulations</span>
          </div>
          <span className="text-3xl font-bold text-slate-800">{mockHistoricalData.length}</span>
        </div>
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingDown className="w-5 h-5 text-rose-500" />
            <span className="text-sm text-slate-400">Avg Disparity Ratio</span>
          </div>
          <span className="text-3xl font-bold text-slate-800">
            {(mockHistoricalData.reduce((acc, s) => acc + s.metrics.demographic_parity_ratio, 0) / mockHistoricalData.length).toFixed(3)}
          </span>
        </div>
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <span className="text-sm text-slate-400">Pass Rate (80% Rule)</span>
          </div>
          <span className="text-3xl font-bold text-emerald-600">
            {Math.round((mockHistoricalData.filter(s => s.metrics.demographic_parity_ratio >= 0.8).length / mockHistoricalData.length) * 100)}%
          </span>
        </div>
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-5 h-5 text-amber-600" />
            <span className="text-sm text-slate-400">Last Simulation</span>
          </div>
          <span className="text-lg font-bold text-slate-800">
            {formatDate(mockHistoricalData[0].timestamp).split(',')[0]}
          </span>
        </div>
      </div>

      {/* Historical Simulations Table */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-6">Historical Simulations</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Date</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Sensitive Feature</th>
                <th className="text-right py-3 px-4 text-slate-400 font-medium">Years</th>
                <th className="text-right py-3 px-4 text-slate-400 font-medium">Parity Ratio</th>
                <th className="text-right py-3 px-4 text-slate-400 font-medium">Approval Rate</th>
                <th className="text-center py-3 px-4 text-slate-400 font-medium">Status</th>
                <th className="text-center py-3 px-4 text-slate-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mockHistoricalData.map((sim, idx) => {
                const prevSim = mockHistoricalData[idx + 1];
                const trend = prevSim ? calculateTrend(sim.metrics.demographic_parity_ratio, prevSim.metrics.demographic_parity_ratio) : null;
                const passesThreshold = sim.metrics.demographic_parity_ratio >= 0.8;
                
                return (
                  <tr 
                    key={sim.id} 
                    className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${selectedSimulation?.id === sim.id ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedSimulation(sim)}
                  >
                    <td className="py-3 px-4 text-slate-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {formatDate(sim.timestamp)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-800 capitalize">{sim.sensitive_feature.replace('_', ' ')}</td>
                    <td className="text-right py-3 px-4 font-mono text-slate-600">{sim.years_simulated}</td>
                    <td className="text-right py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <span className={`font-mono ${passesThreshold ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {sim.metrics.demographic_parity_ratio.toFixed(4)}
                        </span>
                        {trend && (
                          trend.direction === 'up' ? (
                            <TrendingUp className="w-4 h-4 text-emerald-600" />
                          ) : trend.direction === 'down' ? (
                            <TrendingDown className="w-4 h-4 text-rose-600" />
                          ) : null
                        )}
                      </div>
                    </td>
                    <td className="text-right py-3 px-4 font-mono" style={{ color: '#F97316' }}>
                      {(sim.metrics.approval_rate_overall * 100).toFixed(1)}%
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        passesThreshold 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                          : 'bg-rose-50 border-rose-200 text-rose-700'
                      }`}>
                        {passesThreshold ? 'Compliant' : 'Non-Compliant'}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportToCSV([sim]);
                        }}
                        className="p-2 hover:bg-slate-100 rounded transition-colors"
                        title="Export single simulation"
                      >
                        <Download className="w-4 h-4 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Simulation Detail */}
      {selectedSimulation && (
        <div className="glass-card p-6 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-1">Simulation Detail: {selectedSimulation.id}</h2>
              <p className="text-slate-400 text-sm">{formatDate(selectedSimulation.timestamp)}</p>
            </div>
            <button
              onClick={() => setSelectedSimulation(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="p-4 bg-[#F8FAFC] rounded-lg">
              <div className="text-sm text-slate-400 mb-1">Parity Ratio</div>
              <div className={`text-2xl font-bold ${selectedSimulation.metrics.demographic_parity_ratio >= 0.8 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {selectedSimulation.metrics.demographic_parity_ratio.toFixed(4)}
              </div>
            </div>
            <div className="p-4 bg-[#F8FAFC] rounded-lg">
              <div className="text-sm text-slate-400 mb-1">Parity Diff</div>
              <div className="text-2xl font-bold text-amber-600">
                {selectedSimulation.metrics.demographic_parity_difference.toFixed(4)}
              </div>
            </div>
            <div className="p-4 bg-[#F8FAFC] rounded-lg">
              <div className="text-sm text-slate-400 mb-1">Approval Rate</div>
              <div className="text-2xl font-bold" style={{ color: '#1E3A8A' }}>
                {(selectedSimulation.metrics.approval_rate_overall * 100).toFixed(1)}%
              </div>
            </div>
            <div className="p-4 bg-[#F8FAFC] rounded-lg">
              <div className="text-sm text-slate-400 mb-1">Years Simulated</div>
              <div className="text-2xl font-bold text-slate-800">
                {selectedSimulation.years_simulated}
              </div>
            </div>
          </div>

          <div className="p-6 bg-blue-50 border border-orange-300 rounded-lg">
            <h3 className="text-lg font-medium mb-3" style={{ color: '#F97316' }}>AI-Generated Report</h3>
            <p className="text-slate-600 leading-relaxed">{selectedSimulation.report}</p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => exportToCSV([selectedSimulation])}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 bg-white rounded-xl"
            >
              <Download className="w-4 h-4" />
              Export This Simulation
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 bg-white rounded-xl">
              <Share2 className="w-4 h-4" />
              Share Report
            </button>
          </div>
        </div>
      )}

      {/* Quick Audit Report */}
      {simulation && (
        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">Quick Audit Report</h2>
          <div className="p-6 bg-[#F8FAFC] rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5" style={{ color: '#F97316' }} />
              <span className="font-medium text-slate-800">Current Simulation Summary</span>
            </div>
            <div className="grid grid-cols-3 gap-6 mb-6">
              <div>
                <div className="text-sm text-slate-400">Fairness Ratio</div>
                <div className={`text-2xl font-bold ${(simulation?.metrics?.demographic_parity_ratio || 0) >= 0.8 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {simulation?.metrics?.demographic_parity_ratio?.toFixed(4) || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-400">Approval Rate</div>
                <div className="text-2xl font-bold" style={{ color: '#1E3A8A' }}>
                  {((simulation?.metrics?.approval_rate_overall || 0) * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-400">Compliance Status</div>
                <div className={`text-2xl font-bold ${(simulation?.metrics?.demographic_parity_ratio || 0) >= 0.8 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {(simulation?.metrics?.demographic_parity_ratio || 0) >= 0.8 ? 'PASS' : 'FAIL'}
                </div>
              </div>
            </div>
            <div className="p-4 bg-blue-50 border border-orange-300 rounded font-mono text-sm text-slate-600">
              {isReportLoading ? 'Generating report...' : report?.report || 'Report unavailable'}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}