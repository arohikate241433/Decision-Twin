'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/api-config';
import { Search, User, Filter } from 'lucide-react';

interface Persona {
  persona_id: string;
  traits: {
    age_group: string;
    gender: string;
    race: string;
    credit_score: number;
    income: number;
    location?: string;
  };
  metadata?: Record<string, unknown>;
}

export default function PersonaExplorer() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGender, setFilterGender] = useState<string>('all');
  const [filterRace, setFilterRace] = useState<string>('all');
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: personas, isLoading } = useQuery({
    queryKey: ['personas'],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/generate-synthetic-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona_count: 100, characteristics: ["gender", "race", "income", "credit_score"] })
        });
        if (!res.ok) {
          console.error("Failed to fetch personas:", res.status);
          return [];
        }
        const json = await res.json();
        return (json.data as Persona[]) || [];
      } catch (err) {
        console.error("Error in personas query:", err);
        return [];
      }
    },
  });

  const filteredPersonas = personas?.filter(p => {
    const matchesSearch = searchTerm === '' || 
      p.persona_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.traits.gender.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.traits.race.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGender = filterGender === 'all' || p.traits.gender === filterGender;
    const matchesRace = filterRace === 'all' || p.traits.race === filterRace;
    return matchesSearch && matchesGender && matchesRace;
  }) || [];

  const paginatedPersonas = filteredPersonas.slice(page * pageSize, (page + 1) * pageSize);

  const uniqueGenders = [...new Set(personas?.map(p => p.traits.gender) || [])];
  const uniqueRaces = [...new Set(personas?.map(p => p.traits.race) || [])];

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Persona Explorer</h1>
        <p className="text-slate-400">Explore individual synthetic personas and their credit profiles</p>
      </header>

      {/* Search and Filters */}
      <div className="glass-card p-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[300px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by ID, gender, or race..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-slate-700 focus:outline-none focus:border-orange-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
              className="bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-orange-400"
            >
              <option value="all">All Genders</option>
              {uniqueGenders.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select
              value={filterRace}
              onChange={(e) => setFilterRace(e.target.value)}
              className="bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-orange-400"
            >
              <option value="all">All Races</option>
              {uniqueRaces.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="text-sm text-slate-500">
            {filteredPersonas.length} personas found
          </div>
        </div>
      </div>

      {/* Persona Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="glass-card p-6 animate-pulse">
              <div className="h-20 bg-slate-100 rounded mb-4" />
              <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
              <div className="h-4 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {paginatedPersonas.map((persona) => (
            <div
              key={persona.persona_id}
              className="glass-card p-6 cursor-pointer hover:shadow-md transition-all"
              onClick={() => setSelectedPersona(persona)}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                  <User className="w-6 h-6" style={{ color: '#1E3A8A' }} />
                </div>
                <div>
                  <div className="font-mono text-sm text-slate-400">{persona.persona_id}</div>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Gender:</span>
                  <span className="text-slate-600">{persona.traits.gender}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Race:</span>
                  <span className="text-slate-600">{persona.traits.race}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Credit Score:</span>
                  <span className={persona.traits.credit_score >= 650 ? 'text-emerald-600' : 'text-rose-600'}>
                    {persona.traits.credit_score}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Income:</span>
                  <span className="text-slate-600">${persona.traits.income.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex justify-center gap-4">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 bg-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Previous
        </button>
        <span className="px-4 py-2 text-slate-400">
          Page {page + 1} of {Math.max(1, Math.ceil(filteredPersonas.length / pageSize))}
        </span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={(page + 1) * pageSize >= filteredPersonas.length}
          className="px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-600 bg-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Next
        </button>
      </div>

      {/* Persona Detail Modal */}
      {selectedPersona && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="glass-card max-w-lg w-full p-8 relative">
            <button
              onClick={() => setSelectedPersona(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-700"
            >
              ×
            </button>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <User className="w-8 h-8" style={{ color: '#1E3A8A' }} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">{selectedPersona.persona_id}</h3>
                <p className="text-slate-400 text-sm">Detailed Persona Profile</p>
              </div>
            </div>
            <div className="space-y-4">
              {Object.entries(selectedPersona.traits).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500 capitalize">{key.replace('_', ' ')}</span>
                  <span className="text-slate-600 font-mono">
                    {typeof value === 'number' ? (key === 'income' ? `$${value.toLocaleString()}` : value) : value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}