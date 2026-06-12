'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/api-config';
import { Play, Brain, TreeDeciduous, BarChart3, CheckCircle2, XCircle } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

type ModelType = 'logistic' | 'random_forest' | 'decision_tree';

interface ModelResult {
  model: ModelType;
  metrics: {
    demographic_parity_difference: number;
    demographic_parity_ratio: number;
    approval_rate_overall: number;
    accuracy?: number;
  };
  bias_flags: Array<{
    category: string;
    severity: string;
    value: number;
  }>;
}

const modelInfo = {
  logistic: {
    name: 'Logistic Regression',
    icon: Brain,
    description: 'Linear model that learns the relationship between features and outcomes',
    color: '#1E3A8A' // Navy Blue accent
  },
  random_forest: {
    name: 'Random Forest',
    icon: TreeDeciduous,
    description: 'Ensemble method using multiple decision trees for robust predictions',
    color: '#10B981' // Emerald/Green
  },
  decision_tree: {
    name: 'Decision Tree',
    icon: BarChart3,
    description: 'Tree-based model that makes decisions based on feature thresholds',
    color: '#F97316' // Orange accent
  }
};

export default function ModelCompare() {
  const [selectedModels, setSelectedModels] = useState<ModelType[]>(['logistic']);
  const [sensitiveFeature, setSensitiveFeature] = useState('gender');
  const [yearsToSimulate, setYearsToSimulate] = useState(5);
  const [results, setResults] = useState<ModelResult[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

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

  useEffect(() => {
    if (!generateData.isSuccess) {
      generateData.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runComparison = async () => {
    if (!generateData.isSuccess) {
      generateData.mutate();
      return;
    }

    setIsSimulating(true);
    setResults([]);

    for (const model of selectedModels) {
      const res = await fetch(`${API_BASE_URL}/simulate-bias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          years_to_simulate: yearsToSimulate, 
          sensitive_feature: sensitiveFeature, 
          threshold_adjustment: 0,
          model_type: model
        })
      });
      const data = await res.json();
      setResults(prev => [...prev, { model, ...data }]);
    }

    setIsSimulating(false);
  };

  const toggleModel = (model: ModelType) => {
    setSelectedModels(prev => 
      prev.includes(model) 
        ? prev.filter(m => m !== model)
        : [...prev, model]
    );
  };

  const radarData = results.map(r => ({
    model: modelInfo[r.model].name,
    fairness: r.metrics.demographic_parity_ratio * 100,
    approval: r.metrics.approval_rate_overall * 100,
    parity: (1 - Math.abs(r.metrics.demographic_parity_difference)) * 100,
    accuracy: (r.metrics.accuracy || 0.75) * 100
  }));

  const barData = results.map(r => ({
    model: modelInfo[r.model].name,
    'Fairness Ratio': r.metrics.demographic_parity_ratio,
    'Approval Rate': r.metrics.approval_rate_overall,
    'Accuracy': r.metrics.accuracy || 0.75
  }));

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-up">
      <header className="border-b border-slate-100 pb-6">
        <h1 className="text-3xl font-extrabold text-slate-800 mb-2 tracking-tight">Model Comparison</h1>
        <p className="text-slate-400 text-sm">Compare different ML models for bias and performance</p>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Model Selection Panel */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="glass-card p-6 space-y-6">
            <h2 className="text-xl font-bold text-slate-800">Select Models</h2>
            
            <div className="space-y-3">
              {(Object.keys(modelInfo) as ModelType[]).map(model => {
                const info = modelInfo[model];
                const Icon = info.icon;
                const isSelected = selectedModels.includes(model);
                return (
                  <button
                    key={model}
                    onClick={() => toggleModel(model)}
                    className={`w-full p-4 rounded-2xl border transition-all text-left flex items-center justify-between ${
                      isSelected 
                        ? 'border-orange-200 bg-orange-50/50' 
                        : 'border-slate-100 bg-[#F8FAFC]/50 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${info.color}15` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: info.color }} />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">{info.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{info.description}</div>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isSelected && <CheckCircle2 className="w-4 h-4" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Simulation Parameters */}
          <div className="glass-card p-6 space-y-6">
            <h2 className="text-xl font-bold text-slate-800">Parameters</h2>
            
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-500">Sensitive Feature</label>
              <select
                value={sensitiveFeature}
                onChange={(e) => setSensitiveFeature(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl p-2.5 text-slate-700 focus:outline-none focus:border-orange-400 text-sm font-medium"
              >
                <option value="gender">Gender</option>
                <option value="race">Race</option>
                <option value="age_group">Age Group</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-500 flex justify-between">
                <span>Years to Simulate</span>
                <span className="text-orange-500 font-mono font-bold">{yearsToSimulate}</span>
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={yearsToSimulate}
                onChange={(e) => setYearsToSimulate(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
            </div>

            <button
              onClick={runComparison}
              disabled={selectedModels.length === 0 || isSimulating}
              className="w-full py-3.5 btn-primary flex items-center justify-center gap-2 disabled:opacity-50 font-semibold"
            >
              {isSimulating ? (
                <span className="animate-spin">⟳</span>
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isSimulating ? 'Running Simulations...' : 'Run Comparison'}
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {results.length === 0 ? (
            <div className="glass-card p-12 flex flex-col items-center justify-center text-center min-h-[400px]">
              <Brain className="w-16 h-16 text-slate-200 mb-4" />
              <h3 className="text-xl font-bold text-slate-400 mb-2">No Results Yet</h3>
              <p className="text-slate-400 text-sm max-w-xs">Select models and run comparison to see bias analysis</p>
            </div>
          ) : (
            <>
              {/* Results Table */}
              <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Comparison Results</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 text-left">
                        <th className="py-3 px-4 text-slate-400 font-semibold text-xs uppercase tracking-wider">Model</th>
                        <th className="text-right py-3 px-4 text-slate-400 font-semibold text-xs uppercase tracking-wider">Fairness Ratio</th>
                        <th className="text-right py-3 px-4 text-slate-400 font-semibold text-xs uppercase tracking-wider">Approval Rate</th>
                        <th className="text-right py-3 px-4 text-slate-400 font-semibold text-xs uppercase tracking-wider">Parity Diff</th>
                        <th className="text-right py-3 px-4 text-slate-400 font-semibold text-xs uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result, i) => {
                        const info = modelInfo[result.model];
                        const passesThreshold = result.metrics.demographic_parity_ratio >= 0.8;
                        return (
                           <tr key={i} className="border-b border-slate-100/50 hover:bg-slate-50/30">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <info.icon className="w-4 h-4" style={{ color: info.color }} />
                                <span className="text-slate-700 font-medium text-sm">{info.name}</span>
                              </div>
                            </td>
                            <td className="text-right py-3.5 px-4 font-mono text-slate-700 font-semibold text-sm">
                              {result.metrics.demographic_parity_ratio.toFixed(4)}
                            </td>
                            <td className="text-right py-3.5 px-4 font-mono text-slate-700 text-sm">
                              {(result.metrics.approval_rate_overall * 100).toFixed(1)}%
                            </td>
                            <td className="text-right py-3.5 px-4 font-mono text-slate-700 text-sm">
                              {result.metrics.demographic_parity_difference.toFixed(4)}
                            </td>
                            <td className="text-right py-3.5 px-4">
                              {passesThreshold ? (
                                <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Pass
                                </span>
                              ) : (
                                <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1">
                                  <XCircle className="w-3.5 h-3.5" /> Fail
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Radar Chart */}
                <div className="glass-card p-6">
                  <h3 className="text-base font-bold text-slate-800 mb-4">Performance Radar</h3>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#E2E8F0" />
                        <PolarAngleAxis dataKey="model" stroke="#94A3B8" tick={{ fontSize: 10, fontWeight: 500 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#94A3B8" tick={{ fontSize: 9 }} />
                        {selectedModels.map((model, i) => (
                          <Radar
                            key={model}
                            name={modelInfo[model].name}
                            dataKey={['fairness', 'approval', 'parity', 'accuracy'][i % 4]}
                            stroke={modelInfo[model].color}
                            fill={modelInfo[model].color}
                            fillOpacity={0.15}
                          />
                        ))}
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', fontSize: 11 }}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Bar Chart Comparison */}
                <div className="glass-card p-6">
                  <h3 className="text-base font-bold text-slate-800 mb-4">Metrics Comparison</h3>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="model" stroke="#CBD5E1" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                        <YAxis stroke="#CBD5E1" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', fontSize: 11 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="Fairness Ratio" fill="#F97316" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Approval Rate" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Accuracy" fill="#A855F7" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}