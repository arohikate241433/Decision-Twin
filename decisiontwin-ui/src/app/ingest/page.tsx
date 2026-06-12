'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/api-config';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X, Database, ArrowRight } from 'lucide-react';

export default function DataIngest() {
  const router = useRouter();
  const [domain, setDomain] = useState<'lending' | 'scholarship' | 'hiring'>('lending');
  const [protectedAttribute, setProtectedAttribute] = useState('gender');
  const [targetOutcome, setTargetOutcome] = useState('approved');
  
  const [useMock, setUseMock] = useState(true);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);

  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');

  // Preset column headers per domain (used when mock pack is selected)
  const presetColumns: Record<string, string[]> = {
    lending: ['gender', 'race', 'income', 'credit_score', 'zip_code', 'approved'],
    scholarship: ['rural_urban', 'gender', 'academic_score', 'family_income', 'selected'],
    hiring: ['gender', 'years_experience', 'technical_score', 'education_level', 'hired'],
  };

  // Default mappings per domain
  useEffect(() => {
    if (domain === 'lending') {
      setProtectedAttribute('gender');
      setTargetOutcome('approved');
    } else if (domain === 'scholarship') {
      setProtectedAttribute('rural_urban');
      setTargetOutcome('selected');
    } else if (domain === 'hiring') {
      setProtectedAttribute('gender');
      setTargetOutcome('hired');
    }
    // Reset CSV columns to presets when switching domain with mock enabled
    if (useMock) {
      setCsvColumns(presetColumns[domain] || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, useMock]);

  const handleCsvFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setCsvFile(file);
    setUseMock(false);
    // Parse CSV headers from the first line
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        const firstLine = text.split('\n')[0].trim();
        const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        setCsvColumns(headers);
        // Auto-select first column as protected attribute if not already in headers
        if (headers.length > 0 && !headers.includes(protectedAttribute)) {
          setProtectedAttribute(headers[0]);
        }
        if (headers.length > 1 && !headers.includes(targetOutcome)) {
          setTargetOutcome(headers[headers.length - 1]);
        }
      }
    };
    reader.readAsText(file.slice(0, 2048)); // Only read first 2KB for headers
  };

  const handleModelFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (ext === '.pkl' || ext === '.onnx') {
      setModelFile(file);
      setUseMock(false);
    } else {
      alert("Model file must be .pkl or .onnx");
    }
  };

  const uploadMutation = useMutation({
    onSuccess: (data) => {
      setUploadStatus('success');
      setUploadMessage(data.message || 'Session data ingested successfully.');
      setTimeout(() => {
        router.push('/');
      }, 1500);
    },
    onError: (error) => {
      setUploadStatus('error');
      setUploadMessage(`Ingestion failed: ${(error as Error).message}`);
    },
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('domain', domain);
      formData.append('protected_attribute', protectedAttribute);
      formData.append('target_outcome', targetOutcome);
      formData.append('use_mock', String(useMock));
      
      if (!useMock) {
        if (csvFile) {
          formData.append('file', csvFile);
        } else {
          throw new Error('Please upload a custom CSV dataset or select Use Mock Pack.');
        }
        if (modelFile) {
          formData.append('model_file', modelFile);
        }
      }

      const res = await fetch(`${API_BASE_URL}/upload-data`, {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to upload session data.');
      }
      return res.json();
    }
  });

  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto space-y-8 animate-fade-in-up">
      <header className="border-b border-slate-100 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 mb-2 tracking-tight">Data & Model Ingestion</h1>
          <p className="text-slate-400 text-sm">Configure Domain Packs, map evaluation features, and upload custom binaries</p>
        </div>
        <button
          onClick={() => router.push('/')}
          className="text-sm border border-slate-200 hover:border-slate-300 text-slate-600 px-4 py-2.5 rounded-xl bg-white transition-all font-semibold shadow-sm hover:shadow"
        >
          Back to Dashboard
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left: Domain configuration */}
        <div className="md:col-span-1 space-y-6">
          <div className="glass-card p-6 space-y-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Database className="w-5 h-5 text-orange-500" />
              Domain Config
            </h2>
            
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-500">Select Domain Pack</label>
              <select 
                value={domain} 
                onChange={(e) => setDomain(e.target.value as any)}
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl p-3 text-slate-700 focus:outline-none focus:border-orange-400 transition-colors text-sm font-medium"
              >
                <option value="lending">Lending (RBI Digital Lending Compliant)</option>
                <option value="scholarship">Scholarship Admissions (SDG 4 & 10 Aligned)</option>
                <option value="hiring">Hiring (D&I Diversity Aligned)</option>
              </select>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-600">Attribute Mapping</h3>
              
              <div className="space-y-2">
                <label className="block text-xs text-slate-400 font-medium">Protected Attribute (e.g. Gender, Area)</label>
                {(csvColumns.length > 0) ? (
                  <select
                    value={protectedAttribute}
                    onChange={(e) => setProtectedAttribute(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl p-2.5 text-slate-700 focus:outline-none focus:border-orange-400 font-mono text-sm"
                  >
                    {csvColumns.map((col) => (
                      <option key={`pa-${col}`} value={col}>{col}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={protectedAttribute}
                    onChange={(e) => setProtectedAttribute(e.target.value)}
                    placeholder="gender"
                    className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl p-2.5 text-slate-700 focus:outline-none focus:border-orange-400 font-mono text-sm"
                  />
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-xs text-slate-400 font-medium">Target Outcome (e.g. Approved, Selected)</label>
                {(csvColumns.length > 0) ? (
                  <select
                    value={targetOutcome}
                    onChange={(e) => setTargetOutcome(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl p-2.5 text-slate-700 focus:outline-none focus:border-orange-400 font-mono text-sm"
                  >
                    {csvColumns.map((col) => (
                      <option key={`to-${col}`} value={col}>{col}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={targetOutcome}
                    onChange={(e) => setTargetOutcome(e.target.value)}
                    placeholder="approved"
                    className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl p-2.5 text-slate-700 focus:outline-none focus:border-orange-400 font-mono text-sm"
                  />
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
              <input
                type="checkbox"
                id="useMock"
                checked={useMock}
                onChange={(e) => setUseMock(e.target.checked)}
                className="w-4 h-4 accent-orange-500 cursor-pointer"
              />
              <label htmlFor="useMock" className="text-sm text-slate-600 font-medium cursor-pointer select-none">
                Use pre-trained Mock Pack
              </label>
            </div>
          </div>
        </div>

        {/* Right: Upload controls */}
        <div className="md:col-span-2 space-y-6">
          {useMock ? (
            <div className="glass-card p-8 border border-orange-100 bg-orange-50/10 flex flex-col items-center justify-center text-center h-full min-h-[350px]">
              <Database className="w-16 h-16 text-orange-500 mb-4 animate-pulse" />
              <h3 className="text-xl font-bold text-slate-800 mb-2">Pre-trained Mock Pack Enabled</h3>
              <p className="text-slate-500 text-sm max-w-md mb-6 leading-relaxed">
                DecisionTwin will automatically run the simulation using realistic pre-generated datasets and scikit-learn Logistic Regression models for your selected <span className="text-orange-600 font-semibold capitalize">{domain}</span> pack.
              </p>
              <div className="text-xs text-slate-500 font-mono bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl">
                Mock CSV: {domain}_mock.csv | Model: {domain}_model.pkl
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* CSV Upload */}
              <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  1. Dataset CSV File
                </h3>
                
                <div className="border border-dashed border-slate-200 hover:border-orange-400 rounded-xl p-8 text-center transition-all bg-[#F8FAFC]/50 hover:bg-orange-50/5">
                  <input
                    type="file"
                    id="csv-file"
                    className="hidden"
                    accept=".csv"
                    onChange={(e) => handleCsvFile(e.target.files)}
                  />
                  <label htmlFor="csv-file" className="cursor-pointer space-y-2 block">
                    {csvFile ? (
                      <div>
                        <p className="text-emerald-600 font-bold">{csvFile.name}</p>
                        <p className="text-xs text-slate-400 mt-1">{(csvFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-slate-600 font-semibold text-sm">Click to select CSV dataset</p>
                        <p className="text-xs text-slate-400 mt-1">Must include the mapped protected attribute and target outcome columns</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Model Upload */}
              <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Database className="w-5 h-5 text-amber-600" />
                  2. ML Model File (Optional)
                </h3>
                
                <div className="border border-dashed border-slate-200 hover:border-orange-400 rounded-xl p-8 text-center transition-all bg-[#F8FAFC]/50 hover:bg-orange-50/5">
                  <input
                    type="file"
                    id="model-file"
                    className="hidden"
                    accept=".pkl,.onnx"
                    onChange={(e) => handleModelFile(e.target.files)}
                  />
                  <label htmlFor="model-file" className="cursor-pointer space-y-2 block">
                    {modelFile ? (
                      <div>
                        <p className="text-amber-600 font-bold">{modelFile.name}</p>
                        <p className="text-xs text-slate-400 mt-1">{(modelFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-slate-600 font-semibold text-sm">Click to select model (.pkl or .onnx)</p>
                        <p className="text-xs text-slate-400 mt-1">If omitted, pre-trained domain pack model will be evaluated</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Trigger Button */}
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending}
            className="w-full py-4 btn-primary flex items-center justify-center gap-2 disabled:opacity-50 font-semibold text-base transition-all"
          >
            {uploadMutation.isPending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Initialize DecisionTwin Session
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Alert */}
      {uploadStatus !== 'idle' && (
        <div className={`p-4 rounded-xl flex items-center gap-4 border ${
          uploadStatus === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
        }`}>
          {uploadStatus === 'success' ? (
            <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-6 h-6 flex-shrink-0" />
          )}
          <span className="flex-grow font-semibold text-sm">{uploadMessage}</span>
          <button onClick={() => setUploadStatus('idle')} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </main>
  );
}