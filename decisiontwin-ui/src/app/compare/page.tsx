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

interface CustomModelMeta {
  filename: string;
  model_type: string;
  name: string;
}

// ── built-in model definitions ─────────────────────────────────────────────
const BUILTIN_COLORS: Record<BuiltinModelType, string> = {
  logistic: '#3b82f6',
  random_forest: '#22c55e',
  decision_tree: '#f59e0b',
};

const CUSTOM_COLORS = ['#a855f7', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

export default function ModelCompare() {
  const [selectedIds, setSelectedIds] = useState<string[]>(['logistic']);
  const [sensitiveFeature, setSensitiveFeature] = useState('gender');
  const [yearsToSimulate, setYearsToSimulate] = useState(5);
  const [results, setResults] = useState<ModelResult[]>([]);
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
    for (const id of selectedIds) {
      const entry = allModels.find(m => m.id === id);
      if (!entry) continue;
      try {
        const res = await fetch(`${API_BASE_URL}/simulate-bias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ years_to_simulate: yearsToSimulate, sensitive_feature: sensitiveFeature, threshold_adjustment: 0, model_type: id }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.metrics) {
          setResults(prev => [...prev, { id, name: entry.name, color: entry.color, metrics: data.metrics }]);
        }
      } catch { /* skip failed model */ }
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
    <main className="min-h-screen p-8 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-zinc-800 pb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Model Comparison</h1>
        <p className="text-zinc-400">Compare built-in and custom ML models for bias and performance on your ingested data</p>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* ── Left Panel ── */}
        <div className="col-span-12 lg:col-span-4 space-y-6">

          {/* Built-in Models */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-xl font-semibold">Built-in Models</h2>
            <div className="space-y-3">
              {builtinModels.map(model => {
                const Icon = model.icon;
                const isSelected = selectedIds.includes(model.id);
                return (
                  <button
                    key={model.id}
                    onClick={() => toggle(model.id)}
                    className={`w-full p-4 rounded-lg border transition-all text-left ${isSelected ? 'border-blue-500/50 bg-blue-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${model.color}20` }}>
                        <Icon className="w-5 h-5" style={{ color: model.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white text-sm">{model.name}</div>
                        <div className="text-xs text-zinc-400 truncate">{model.description}</div>
                      </div>
                      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-zinc-600'}`}>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </div>
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
            <h2 className="text-xl font-semibold">Parameters</h2>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-400">Sensitive Feature</label>
              <select
                value={sensitiveFeature}
                onChange={(e) => setSensitiveFeature(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-300 focus:outline-none focus:border-blue-500"
              >
                <option value="gender">Gender</option>
                <option value="race">Race</option>
                <option value="age_group">Age Group</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-400 flex justify-between">
                <span>Years to Simulate</span>
                <span className="text-blue-500 font-mono">{yearsToSimulate}</span>
              </label>
              <input
                type="range" min="1" max="10"
                value={yearsToSimulate}
                onChange={(e) => setYearsToSimulate(parseInt(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            <button
              onClick={runComparison}
              disabled={selectedIds.length === 0 || isSimulating}
              className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50"
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
            <div className="glass-card p-12 flex flex-col items-center justify-center text-center">
              <Brain className="w-16 h-16 text-zinc-700 mb-4" />
              <h3 className="text-xl font-medium text-zinc-400 mb-2">No Results Yet</h3>
              <p className="text-zinc-500">Select models and run comparison to see bias analysis on your ingested data</p>
            </div>
          ) : (
            <>
              {/* Results Table */}
              <div className="glass-card p-6">
                <h3 className="text-lg font-medium mb-4">Comparison Results</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-3 px-4 text-zinc-400 font-medium">Model</th>
                        <th className="text-right py-3 px-4 text-zinc-400 font-medium">Fairness Ratio</th>
                        <th className="text-right py-3 px-4 text-zinc-400 font-medium">Approval Rate</th>
                        <th className="text-right py-3 px-4 text-zinc-400 font-medium">Parity Diff</th>
                        <th className="text-right py-3 px-4 text-zinc-400 font-medium">Accuracy</th>
                        <th className="text-center py-3 px-4 text-zinc-400 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result) => {
                        const passes = result.metrics.demographic_parity_ratio >= 0.8;
                        return (
                          <tr key={result.id} className="border-b border-zinc-800/50">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: result.color }} />
                                <span className="text-white text-sm">{result.name}</span>
                              </div>
                            </td>
                            <td className={`text-right py-3 px-4 font-mono text-sm ${passes ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {result.metrics.demographic_parity_ratio.toFixed(4)}
                            </td>
                            <td className="text-right py-3 px-4 font-mono text-white text-sm">
                              {(result.metrics.approval_rate_overall * 100).toFixed(1)}%
                            </td>
                            <td className="text-right py-3 px-4 font-mono text-amber-400 text-sm">
                              {result.metrics.demographic_parity_difference.toFixed(4)}
                            </td>
                            <td className="text-right py-3 px-4 font-mono text-zinc-300 text-sm">
                              {((result.metrics.accuracy ?? 0.75) * 100).toFixed(1)}%
                            </td>
                            <td className="text-center py-3 px-4">
                              {passes ? (
                                <span className="flex items-center justify-center gap-1 text-emerald-500 text-sm">
                                  <CheckCircle2 className="w-4 h-4" /> Pass
                                </span>
                              ) : (
                                <span className="flex items-center justify-center gap-1 text-rose-500 text-sm">
                                  <XCircle className="w-4 h-4" /> Fail
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

              {/* Radar Chart */}
              <div className="glass-card p-6">
                <h3 className="text-lg font-medium mb-4">Performance Radar</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#3f3f46" />
                    <PolarAngleAxis dataKey="metric" stroke="#71717a" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#71717a" />
                    {results.map(r => (
                      <Radar
                        key={r.id}
                        name={r.name}
                        dataKey={r.name}
                        stroke={r.color}
                        fill={r.color}
                        fillOpacity={0.15}
                      />
                    ))}
                    <Legend />
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Bar Chart */}
              <div className="glass-card p-6">
                <h3 className="text-lg font-medium mb-4">Metrics Comparison</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis dataKey="model" stroke="#71717a" />
                    <YAxis stroke="#71717a" />
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }} />
                    <Legend />
                    <Bar dataKey="Fairness Ratio" fill="#3b82f6" />
                    <Bar dataKey="Approval Rate" fill="#22c55e" />
                    <Bar dataKey="Accuracy" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
