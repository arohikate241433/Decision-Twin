'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, Users, FlaskConical, FileText,
  Database, BarChart3, LogOut, Brain,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

const navItems = [
  { href: '/',            label: 'Dashboard',       icon: Activity },
  { href: '/personas',    label: 'Persona Explorer', icon: Users },
  { href: '/policy-lab',  label: 'Policy Lab',       icon: FlaskConical },
  { href: '/compare',     label: 'Model Compare',    icon: BarChart3 },
  { href: '/reports',     label: 'Reports',          icon: FileText },
  { href: '/ingest',      label: 'Data Ingest',      icon: Database },
];

export default function Navigation() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuthStore();

  // Hide sidebar entirely on the login page
  if (pathname === '/login') return null;

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <aside
      className="flex flex-col w-64 shrink-0 bg-white h-full"
      style={{ boxShadow: '4px 0 24px rgba(0,0,0,0.05)' }}
    >
      {/* ── Brand ──────────────────────────────────────────────── */}
      <div className="px-6 pt-7 pb-6">
        <Link
          href="/"
          className="flex items-center gap-3 group"
          title="DecisionTwin Home"
        >
          {/* Coral logo mark */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #FB923C 0%, #F97316 100%)' }}
          >
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div className="leading-tight">
            <span className="block text-sm font-extrabold text-slate-800 tracking-tight">
              Decision
              <span style={{ color: '#F97316' }}>Twin</span>
            </span>
            <span className="block text-[10px] text-slate-400 font-medium tracking-wide">
              AI Ethics Platform
            </span>
          </div>
        </Link>
      </div>

      {/* ── Nav Label ──────────────────────────────────────────── */}
      <p className="px-6 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        Main Menu
      </p>

      {/* ── Navigation Items ───────────────────────────────────── */}
      <nav className="flex-1 flex flex-col gap-0.5 px-3">
        {navItems.map((item) => {
          const Icon     = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-150 ${
                isActive ? 'nav-item-active' : 'nav-item-inactive'
              }`}
            >
              <Icon
                className="w-4 h-4 shrink-0"
                style={{ color: isActive ? '#F97316' : undefined }}
              />
              <span>{item.label}</span>

              {/* Orange dot for active item */}
              {isActive && (
                <span
                  className="ml-auto w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: '#F97316' }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── User Profile & Logout ──────────────────────────────── */}
      {user && (
        <div
          className="mt-auto mx-3 mb-4 p-3 rounded-2xl flex items-center gap-3"
          style={{ backgroundColor: '#F8FAFC' }}
        >
          {/* Avatar initials */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)' }}
          >
            {user.name?.slice(0, 2).toUpperCase() || 'DT'}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{user.name}</p>
            <p className="text-[10px] text-slate-400 truncate">{user.role}</p>
          </div>

          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
    </aside>
  );
}