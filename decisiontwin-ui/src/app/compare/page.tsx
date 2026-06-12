'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/api-config';
import { Play, Brain, TreeDeciduous, BarChart3, CheckCircle2, XCircle, Upload, Trash2, RefreshCw, PackagePlus } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

// ── types ──────────────────────────────────────────────────────────────────
type BuiltinModelType = 'logistic' | 'random_forest' | 'decision_tree';

interface ModelEntry {
  id: string;          // model_type sent to backend
  name: string;
  description: string;
  color: string;
  icon: React.ElementType;
  isCustom: boolean;
}

interface ModelResult {
  id: string;
  name: string;
  color: string;
  metrics: {
    demographic_parity_difference: number;
    demographic_parity_ratio: number;
    approval_rate_overall: number;
    accuracy?: number;
  };
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

const CUSTOM_COLORS = ['#a855f7', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

export default function ModelCompare() {
  const [selectedIds, setSelectedIds] = useState<string[]>(['logistic']);
  const [sensitiveFeature, setSensitiveFeature] = useState('gender');
  const [yearsToSimulate, setYearsToSimulate] = useState(5);
  const [results, setResults] = useState<ModelResult[]>([]);
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({});
  const [isSimulating, setIsSimulating] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // ── fetch custom models list ─────────────────────────────────────────────
  const { data: customModelsData, refetch: refetchCustom } = useQuery({
    queryKey: ['custom-models'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/custom-models`);
      return res.json() as Promise<{ models: CustomModelMeta[] }>;
    },
  });

  const customModels: ModelEntry[] = (customModelsData?.models ?? []).map((m, i) => ({
    id: m.model_type,
    name: m.name,
    description: `Custom uploaded model: ${m.filename}`,
    color: CUSTOM_COLORS[i % CUSTOM_COLORS.length],
    icon: PackagePlus,
    isCustom: true,
  }));

  const builtinModels: ModelEntry[] = [
    { id: 'logistic', name: 'Logistic Regression', description: 'Linear model that learns the relationship between features and outcomes', color: '#3b82f6', icon: Brain, isCustom: false },
    { id: 'random_forest', name: 'Random Forest', description: 'Ensemble method using multiple decision trees for robust predictions', color: '#22c55e', icon: TreeDeciduous, isCustom: false },
    { id: 'decision_tree', name: 'Decision Tree', description: 'Tree-based model that makes decisions based on feature thresholds', color: '#f59e0b', icon: BarChart3, isCustom: false },
  ];

  const allModels = [...builtinModels, ...customModels];

  // ── upload custom model ───────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE_URL}/upload-model`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? 'Upload failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setUploadError('');
      refetchCustom();
      setSelectedIds(prev => [...prev, data.model_type]);
    },
    onError: (e: Error) => setUploadError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch(`${API_BASE_URL}/custom-models/${filename}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: (_, filename) => {
      refetchCustom();
      setSelectedIds(prev => prev.filter(id => id !== `custom_${filename}`));
      setResults(prev => prev.filter(r => r.id !== `custom_${filename}`));
    },
  });

  const handleFileDrop = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.endsWith('.pkl')) { setUploadError('Only .pkl files are supported.'); return; }
    setUploadError('');
    uploadMutation.mutate(file);
  }, [uploadMutation]);

  // ── run comparison ────────────────────────────────────────────────────────
  const runComparison = async () => {
    if (selectedIds.length === 0) return;
    setIsSimulating(true);
    setResults([]);
    setModelErrors({});
    for (const id of selectedIds) {
      const entry = allModels.find(m => m.id === id);
      if (!entry) continue;
      try {
        const res = await fetch(`${API_BASE_URL}/simulate-bias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ years_to_simulate: yearsToSimulate, sensitive_feature: sensitiveFeature, threshold_adjustment: 0, model_type: id }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
          setModelErrors(prev => ({ ...prev, [id]: errBody.detail ?? `HTTP ${res.status}` }));
          continue;
        }
        const data = await res.json();
        if (data?.metrics) {
          setResults(prev => [...prev, { id, name: entry.name, color: entry.color, metrics: data.metrics }]);
        }
      } catch (e) {
        setModelErrors(prev => ({ ...prev, [id]: (e as Error).message }));
      }
    }
    setIsSimulating(false);
  };

  const toggle = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  // ── chart data ────────────────────────────────────────────────────────────
  const barData = results.map(r => ({
    model: r.name.length > 16 ? r.name.slice(0, 14) + '…' : r.name,
    'Fairness Ratio': r.metrics.demographic_parity_ratio,
    'Approval Rate': r.metrics.approval_rate_overall,
    'Accuracy': r.metrics.accuracy ?? 0.75,
  }));

  const radarMetrics = ['Fairness', 'Approval', 'Low Parity Diff', 'Accuracy'];
  const radarData = radarMetrics.map(metric => {
    const point: Record<string, string | number> = { metric };
    results.forEach(r => {
      if (metric === 'Fairness') point[r.name] = parseFloat((r.metrics.demographic_parity_ratio * 100).toFixed(1));
      if (metric === 'Approval') point[r.name] = parseFloat((r.metrics.approval_rate_overall * 100).toFixed(1));
      if (metric === 'Low Parity Diff') point[r.name] = parseFloat(((1 - Math.abs(r.metrics.demographic_parity_difference)) * 100).toFixed(1));
      if (metric === 'Accuracy') point[r.name] = parseFloat(((r.metrics.accuracy ?? 0.75) * 100).toFixed(1));
    });
    return point;
  });

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-up">
      <header className="border-b border-slate-100 pb-6">
        <h1 className="text-3xl font-extrabold text-slate-800 mb-2 tracking-tight">Model Comparison</h1>
        <p className="text-slate-400 text-sm">Compare different ML models for bias and performance</p>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* ── Left Panel ── */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="glass-card p-6 space-y-6">
            <h2 className="text-xl font-bold text-slate-800">Select Models</h2>
            
            <div className="space-y-3">
              {builtinModels.map(model => {
                const Icon = model.icon;
                const isSelected = selectedIds.includes(model.id);
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

          {/* Custom Models */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-xl font-semibold">Custom Models</h2>
            <p className="text-xs text-zinc-500">Upload a scikit-learn model saved with <span className="font-mono text-zinc-400">joblib.dump(model, &apos;model.pkl&apos;)</span></p>

            {/* Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-700 hover:border-zinc-600'}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileDrop(e.dataTransfer.files); }}
            >
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
                  <span className="text-sm text-zinc-400">Validating & uploading...</span>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400 mb-3">Drag & drop a .pkl file here</p>
                  <input
                    type="file"
                    id="model-upload"
                    className="hidden"
                    accept=".pkl"
                    onChange={(e) => handleFileDrop(e.target.files)}
                  />
                  <label htmlFor="model-upload" className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm cursor-pointer transition-colors">
                    Browse File
                  </label>
                </>
              )}
            </div>

            {uploadError && (
              <p className="text-xs text-rose-400 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> {uploadError}
              </p>
            )}

            {/* Listed custom models */}
            {customModels.length > 0 ? (
              <div className="space-y-2">
                {customModels.map((model) => {
                  const isSelected = selectedIds.includes(model.id);
                  const filename = model.id.replace('custom_', '');
                  return (
                    <div
                      key={model.id}
                      className={`p-3 rounded-lg border transition-all ${isSelected ? 'border-purple-500/50 bg-purple-500/10' : 'border-zinc-800 bg-zinc-900/50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggle(model.id)} className="flex items-center gap-3 flex-1 text-left min-w-0">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${model.color}20` }}>
                            <PackagePlus className="w-4 h-4" style={{ color: model.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-white text-sm truncate">{model.name}</div>
                            <div className="text-xs text-zinc-500 truncate">{filename}</div>
                          </div>
                          <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-purple-500 bg-purple-500' : 'border-zinc-600'}`}>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                          </div>
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(filename)}
                          className="p-1.5 hover:bg-zinc-800 rounded transition-colors flex-shrink-0"
                          title="Delete model"
                        >
                          <Trash2 className="w-4 h-4 text-zinc-500 hover:text-rose-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 text-center py-2">No custom models uploaded yet</p>
            )}
          </div>

          {/* Parameters */}
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
                type="range" min="1" max="10"
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
              {isSimulating
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running ({results.length}/{selectedIds.length})...</>
                : <><Play className="w-4 h-4" /> Run Comparison</>
              }
            </button>
          </div>
        </div>

        {/* ── Results Area ── */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {results.length === 0 ? (
            <div className="glass-card p-12 flex flex-col items-center justify-center text-center min-h-[400px]">
              <Brain className="w-16 h-16 text-slate-200 mb-4" />
              <h3 className="text-xl font-bold text-slate-400 mb-2">No Results Yet</h3>
              <p className="text-slate-400 text-sm max-w-xs">Select models and run comparison to see bias analysis</p>
            </div>
          ) : (
            <>
              {/* Model errors */}
              {Object.entries(modelErrors).length > 0 && (
                <div className="glass-card p-6 space-y-3">
                  <h3 className="text-lg font-medium text-rose-400 flex items-center gap-2">
                    <XCircle className="w-5 h-5" /> Model Errors
                  </h3>
                  {Object.entries(modelErrors).map(([id, msg]) => {
                    const entry = allModels.find(m => m.id === id);
                    return (
                      <div key={id} className="flex items-start gap-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                        <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="text-rose-300 text-sm font-medium">{entry?.name ?? id}: </span>
                          <span className="text-rose-400 text-sm">{msg}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Results Table */}
              {results.length > 0 && (
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
                      {results.map((result) => {
                        const passes = result.metrics.demographic_parity_ratio >= 0.8;
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
              )}

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
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
