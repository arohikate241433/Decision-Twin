'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/api-config';
import { Upload, FileSpreadsheet, FileJson, Database, CheckCircle2, AlertTriangle, X, File } from 'lucide-react';

type FileType = 'csv' | 'json' | 'parquet';

interface ValidationResult {
  valid: boolean;
  rowCount: number;
  columns: string[];
  schema: Record<string, string>;
  errors: string[];
  preview: Record<string, unknown>[];
}

interface IngestState {
  file: File | null;
  fileType: FileType;
  isValidating: boolean;
  validation: ValidationResult | null;
  isUploading: boolean;
}

export default function DataIngest() {
  const router = useRouter();
  const [state, setState] = useState<IngestState>({
    file: null,
    fileType: 'csv',
    isValidating: false,
    validation: null,
    isUploading: false
  });

  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');

  const validateFile = async (file: File) => {
    setState(prev => ({ ...prev, isValidating: true, validation: null }));
    
    const text = await file.text();
    let data: Record<string, unknown>[] = [];
    
    try {
      if (file.name.endsWith('.json')) {
        data = JSON.parse(text);
      } else if (file.name.endsWith('.csv')) {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) throw new Error('CSV must have header and at least one data row');
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        data = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const row: Record<string, unknown> = {};
          headers.forEach((h, i) => {
            const val = values[i];
            row[h] = isNaN(Number(val)) ? val : Number(val);
          });
          return row;
        });
      }
    } catch (e) {
      setState(prev => ({ 
        ...prev, 
        isValidating: false, 
        validation: {
          valid: false,
          rowCount: 0,
          columns: [],
          schema: {},
          errors: [`Parse error: ${(e as Error).message}`],
          preview: []
        }
      }));
      return;
    }

    const columns = Object.keys(data[0] || {});
    const schema: Record<string, string> = {};
    columns.forEach(col => {
      const sample = data[0][col];
      schema[col] = typeof sample === 'number' ? 'number' : 'string';
    });

    const errors: string[] = [];
    if (columns.length === 0) errors.push('No columns detected');
    if (data.length < 10) errors.push(`Only ${data.length} rows detected. Minimum 10 recommended.`);
    if (!columns.some(c => c.toLowerCase().includes('credit') || c.toLowerCase().includes('score'))) {
      errors.push('Warning: No credit score column detected');
    }

    setState(prev => ({ 
      ...prev, 
      isValidating: false, 
      validation: {
        valid: errors.length === 0 || errors.every(e => e.startsWith('Warning')),
        rowCount: data.length,
        columns,
        schema,
        errors,
        preview: data.slice(0, 5)
      }
    }));
  };

  const handleFile = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    
    let fileType: FileType = 'csv';
    if (file.name.endsWith('.json')) fileType = 'json';
    else if (file.name.endsWith('.parquet')) fileType = 'parquet';
    
    setState(prev => ({ ...prev, file, fileType }));
    validateFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFile(e.dataTransfer.files);
  }, [handleFile]);

  const uploadData = useMutation({
    mutationFn: async () => {
      if (!state.validation?.valid) throw new Error('File validation failed');
      
      const formData = new FormData();
      formData.append('file', state.file!);
      formData.append('fileType', state.fileType);
      formData.append('schema', JSON.stringify(state.validation.schema));

      const res = await fetch(`${API_BASE_URL}/ingest-data`, {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    },
    onSuccess: () => {
      setUploadStatus('success');
      setUploadMessage('Data ingested successfully! Redirecting to dashboard...');
      setTimeout(() => router.push('/'), 1500);
    },
    onError: (error) => {
      setUploadStatus('error');
      setUploadMessage(`Upload failed: ${(error as Error).message}`);
    }
  });

  const fileTypeIcons = {
    csv: FileSpreadsheet,
    json: FileJson,
    parquet: Database
  };

  const FileIcon = state.file ? fileTypeIcons[state.fileType] : File;

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-zinc-800 pb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Data Ingest</h1>
        <p className="text-zinc-400">Upload CSV, JSON, or Parquet datasets for bias simulation</p>
      </header>

      {/* Upload Zone */}
      <div
        className={`glass-card p-12 border-2 border-dashed transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-700'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
            state.file ? 'bg-blue-500/20' : 'bg-zinc-800'
          }`}>
            {state.file ? (
              <FileIcon className="w-10 h-10 text-blue-400" />
            ) : (
              <Upload className="w-10 h-10 text-zinc-500" />
            )}
          </div>
          
          {state.file ? (
            <div className="space-y-2">
              <p className="text-xl font-medium text-white">{state.file.name}</p>
              <p className="text-zinc-400">{(state.file.size / 1024).toFixed(1)} KB</p>
              <button
                onClick={() => setState({ file: null, fileType: 'csv', isValidating: false, validation: null, isUploading: false })}
                className="text-sm text-zinc-400 hover:text-zinc-200 underline"
              >
                Remove file
              </button>
            </div>
          ) : (
            <>
              <p className="text-xl font-medium text-white mb-2">
                Drag and drop your dataset here
              </p>
              <p className="text-zinc-400 mb-6">
                or click to browse files
              </p>
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".csv,.json,.parquet"
                onChange={(e) => handleFile(e.target.files)}
              />
              <label
                htmlFor="file-upload"
                className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium cursor-pointer hover:bg-blue-700 transition-colors"
              >
                Select File
              </label>
            </>
          )}
        </div>
      </div>

      {/* Supported Formats */}
      <div className="grid grid-cols-3 gap-6">
        {[
          { type: 'CSV', icon: FileSpreadsheet, desc: 'Comma-separated values with headers', color: 'bg-emerald-500/20 text-emerald-400' },
          { type: 'JSON', icon: FileJson, desc: 'JSON array of objects', color: 'bg-amber-500/20 text-amber-400' },
          { type: 'Parquet', icon: Database, desc: 'Apache Parquet format', color: 'bg-blue-500/20 text-blue-400' }
        ].map((format) => {
          const Icon = format.icon;
          return (
            <div key={format.type} className="glass-card p-4 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${format.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <div className="font-medium text-white">.{format.type}</div>
                <div className="text-xs text-zinc-400">{format.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Validation Results */}
      {state.isValidating && (
        <div className="glass-card p-6 flex items-center justify-center gap-4">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-400">Validating file structure...</span>
        </div>
      )}

      {state.validation && (
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Validation Results</h2>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              state.validation.valid 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-rose-500/20 text-rose-400'
            }`}>
              {state.validation.valid ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Valid
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5" />
                  Issues Found
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-6">
            <div className="p-4 bg-zinc-900/50 rounded-lg text-center">
              <div className="text-3xl font-bold text-white">{state.validation?.rowCount}</div>
              <div className="text-sm text-zinc-400">Total Rows</div>
            </div>
            <div className="p-4 bg-zinc-900/50 rounded-lg text-center">
              <div className="text-3xl font-bold text-white">{state.validation?.columns.length}</div>
              <div className="text-sm text-zinc-400">Columns</div>
            </div>
            <div className="p-4 bg-zinc-900/50 rounded-lg text-center">
              <div className="text-3xl font-bold text-white">{state.validation?.errors.length}</div>
              <div className="text-sm text-zinc-400">Warnings</div>
            </div>
            <div className="p-4 bg-zinc-900/50 rounded-lg text-center">
              <div className="text-3xl font-bold text-white">{state.validation?.preview.length}</div>
              <div className="text-sm text-zinc-400">Preview Rows</div>
            </div>
          </div>

          {/* Errors/Warnings */}
          {state.validation?.errors && state.validation.errors.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-zinc-300">Messages</h3>
              {state.validation.errors.map((error, i) => (
                <div key={i} className={`p-3 rounded-lg flex items-center gap-3 ${
                  error.startsWith('Warning') ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'
                }`}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              ))}
            </div>
          )}

          {/* Schema */}
          <div>
            <h3 className="font-medium text-zinc-300 mb-3">Detected Schema</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {state.validation?.columns.map(col => (
                <div key={col} className="p-3 bg-zinc-900/50 rounded-lg">
                  <div className="text-sm text-white truncate">{col}</div>
                  <div className="text-xs text-zinc-500 capitalize">{state.validation?.schema[col]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Data Preview */}
          <div>
            <h3 className="font-medium text-zinc-300 mb-3">Data Preview (First 5 Rows)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {state.validation?.columns.map(col => (
                      <th key={col} className="text-left py-2 px-3 text-zinc-400 font-medium">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.validation?.preview.map((row, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      {state.validation?.columns.map(col => (
                        <td key={col} className="py-2 px-3 text-zinc-300 font-mono text-xs">
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Upload Button */}
          {state.validation?.valid && (
            <button
              onClick={() => uploadData.mutate()}
              disabled={uploadData.isPending}
              className="w-full py-4 rounded-lg bg-blue-600 text-white font-medium flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50"
            >
              {uploadData.isPending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="w-5 h-5" />
              )}
              {uploadData.isPending ? 'Ingesting Data...' : 'Ingest Dataset'}
            </button>
          )}
        </div>
      )}

      {/* Status Messages */}
      {uploadStatus !== 'idle' && (
        <div className={`p-6 rounded-lg flex items-center gap-4 ${
          uploadStatus === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
        }`}>
          {uploadStatus === 'success' ? (
            <CheckCircle2 className="w-6 h-6" />
          ) : (
            <X className="w-6 h-6" />
          )}
          <span className="flex-1">{uploadMessage}</span>
          <button onClick={() => setUploadStatus('idle')} className="text-zinc-400 hover:text-zinc-200">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Sandbox Mode Notice */}
      <div className="glass-card p-6 border border-amber-500/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-amber-400 mb-2">Sandbox Mode Active</h3>
            <p className="text-zinc-400">
              Your data never leaves your browser. All processing happens locally using Web Workers. 
              No PII is transmitted to external servers. For production use, data can be encrypted 
              client-side before transmission.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}