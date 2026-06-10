import { create } from 'zustand';

export interface SimRecord {
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

interface SimulationState {
  yearsToSimulate: number;
  setYearsToSimulate: (years: number) => void;
  sensitiveFeature: string;
  setSensitiveFeature: (feature: string) => void;
  thresholdAdjustment: number;
  setThresholdAdjustment: (val: number) => void;
  isSimulating: boolean;
  setIsSimulating: (simulating: boolean) => void;
  dataSource: 'none' | 'real' | 'synthetic';
  setDataSource: (source: 'none' | 'real' | 'synthetic') => void;
  availableColumns: string[];
  setAvailableColumns: (cols: string[]) => void;
  rowCount: number;
  setRowCount: (count: number) => void;
  policyLabHistory: SimRecord[];
  addPolicyLabRecord: (record: SimRecord) => void;
  clearPolicyLabHistory: () => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  yearsToSimulate: 1,
  setYearsToSimulate: (years) => set({ yearsToSimulate: years }),
  sensitiveFeature: 'gender',
  setSensitiveFeature: (feature) => set({ sensitiveFeature: feature }),
  thresholdAdjustment: 0.0,
  setThresholdAdjustment: (val) => set({ thresholdAdjustment: val }),
  isSimulating: false,
  setIsSimulating: (simulating) => set({ isSimulating: simulating }),
  dataSource: 'none',
  setDataSource: (source) => set({ dataSource: source }),
  availableColumns: [],
  setAvailableColumns: (cols) => set({ availableColumns: cols }),
  rowCount: 0,
  setRowCount: (count) => set({ rowCount: count }),
  policyLabHistory: [],
  addPolicyLabRecord: (record) =>
    set((state) => ({ policyLabHistory: [record, ...state.policyLabHistory].slice(0, 50) })),
  clearPolicyLabHistory: () => set({ policyLabHistory: [] }),
}));
