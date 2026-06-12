'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { Eye, EyeOff, Lock, Mail, ShieldAlert, Sparkles, Brain } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]           = useState('');
  const [isLoading, setIsLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (email === 'admin@bank.com' && password === 'admin') {
      login({
        name: 'Admin User',
        role: 'Risk Officer & AI Ethics Compliance Lead',
        organization: 'Apex Global Banking',
        email: 'admin@bank.com',
      });
      router.replace('/');
    } else {
      setError('Invalid credentials. Hint: use admin@bank.com / admin');
      setIsLoading(false);
    }
  };

  return (
    /* Full-page light background with soft orange blob decorations */
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden bg-[#F5F7FA]">

      {/* Decorative blurred blobs */}
      <div
        className="absolute top-[-80px] right-[-80px] w-[420px] h-[420px] rounded-full blur-3xl pointer-events-none opacity-50"
        style={{ background: 'radial-gradient(circle, #FB923C55 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-80px] left-[-80px] w-[380px] h-[380px] rounded-full blur-3xl pointer-events-none opacity-40"
        style={{ background: 'radial-gradient(circle, #DBEAFE 0%, transparent 70%)' }}
      />

      <div className="w-full max-w-md space-y-8 relative z-10">

        {/* ── Brand Header ─────────────────────────────────────────────── */}
        <div className="text-center space-y-3">
          {/* Logo mark */}
          <div className="inline-flex items-center justify-center mb-2">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #FB923C 0%, #F97316 100%)', boxShadow: '0 8px 24px rgba(249,115,22,0.35)' }}
            >
              <Brain className="w-7 h-7 text-white" />
            </div>
          </div>

          {/* Platform badge */}
          <div className="flex justify-center">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: '#FFF7ED', color: '#F97316', border: '1px solid #FED7AA' }}
            >
              <Sparkles className="w-3 h-3" />
              AI Ethics &amp; Simulation Platform
            </span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">
            Decision<span style={{ color: '#F97316' }}>Twin</span>
          </h1>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Eliminating Invisible Bias through Longitudinal Simulation.
          </p>
        </div>

        {/* ── Login Card ───────────────────────────────────────────────── */}
        <div
          className="bg-white rounded-3xl p-8 space-y-6"
          style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)' }}
        >
          <h2 className="text-xl font-bold text-slate-800">Sign in to your account</h2>

          {/* Error alert */}
          {error && (
            <div
              className="flex items-center gap-3 p-3 rounded-xl text-xs leading-relaxed"
              style={{ backgroundColor: '#FFF5F5', border: '1px solid #FEE2E2', color: '#9F1239' }}
            >
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-xs font-semibold text-slate-500">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="login-email"
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-slate-800 placeholder-slate-400 transition-all outline-none"
                  style={{
                    backgroundColor: '#F8FAFC',
                    border: '1.5px solid #E2E8F0',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#F97316'; e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.1)'; }}
                  onBlur={(e)  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="login-password" className="text-xs font-semibold text-slate-500">
                  Password
                </label>
                <a
                  href="#"
                  className="text-xs font-medium transition-colors"
                  style={{ color: '#F97316' }}
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 rounded-xl text-sm text-slate-800 placeholder-slate-400 transition-all outline-none"
                  style={{
                    backgroundColor: '#F8FAFC',
                    border: '1.5px solid #E2E8F0',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#F97316'; e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.1)'; }}
                  onBlur={(e)  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400/30 focus:ring-offset-0 focus:outline-none cursor-pointer"
                style={{ accentColor: '#F97316' }}
              />
              <label htmlFor="remember-me" className="text-xs text-slate-500 cursor-pointer">
                Remember this device
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100" />
            </div>
            <span className="relative px-3 bg-white text-xs text-slate-400 uppercase tracking-wider">
              or continue with
            </span>
          </div>

          {/* Google SSO placeholder */}
          <button
            type="button"
            onClick={() => alert('Google authentication integration is planned for the next release phase.')}
            className="w-full py-3 px-4 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl flex items-center justify-center gap-2.5 transition-all"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google Workspace
          </button>
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs text-slate-400">
          Demo credentials:&nbsp;
          <span className="font-mono font-semibold text-slate-600">admin@bank.com</span>
          &nbsp;/&nbsp;
          <span className="font-mono font-semibold text-slate-600">admin</span>
        </p>

      </div>
    </div>
  );
}
