import React, { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import type { SessionUser } from '../lib/types';
import { FCATLogo } from '../components/BrandCrest';

export function LoginPage({
  company,
  onLoginSuccess,
}: {
  company: Record<string, string>;
  onLoginSuccess: (token: string, user: SessionUser) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.login(email.trim(), password);
      if (res.ok && res.token && res.user) {
        onLoginSuccess(res.token, res.user);
      } else {
        setError(res.error || 'Login failed.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        background:
          'radial-gradient(circle at 18% 22%, rgba(201,162,39,.16) 0%, transparent 42%), radial-gradient(circle at 84% 78%, rgba(201,162,39,.11) 0%, transparent 46%), linear-gradient(150deg, #6B1A25 0%, #4A1219 65%, #33090F 100%)',
      }}
    >
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-[#EAD9D4]">
        <div className="h-1 bg-gradient-to-r from-[#C9A227] to-[#6B1A25]" />
        <div className="p-8">
          <div className="flex justify-center mb-3">
            <FCATLogo logoUrl={company.LogoUrl} size="lg" alt="FCAT Seal" />
          </div>
          <h1 className="text-2xl font-bold text-center text-[#4A1219] m-0">FCAT ISO Audit</h1>
          <p className="text-xs text-center text-[#7A6F6F] mt-1 mb-6">
            Corrective Actions &amp; Compliance Portal
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg bg-[#FBE7E1] border border-[#F3CFC5] text-[#9A2A1E] px-3.5 py-2.5 text-xs font-medium"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-[#4A1219] mb-1.5">
                Email <span className="text-[#A32424]">*</span>
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@fcat.com.ph"
                className="w-full rounded-lg border border-[#EAD9D4] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#6B1A25]"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-[#4A1219] mb-1.5">
                Password <span className="text-[#A32424]">*</span>
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-[#EAD9D4] pl-3.5 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#6B1A25]"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-2.5 flex items-center text-[#7A6F6F] hover:text-[#2B2323] cursor-pointer"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white font-bold text-sm py-2.5 px-4 transition-colors cursor-pointer disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Signing in...' : 'Log In'}
            </button>
          </form>

          <p className="text-xs text-center text-[#7A6F6F] mt-5">
            Forgot your password? Contact your administrator.
          </p>
        </div>
      </div>

      <footer className="mt-6 text-xs text-white/75 text-center">
        &copy; {new Date().getFullYear()} FCAT ISO Audit Management System. All rights reserved.
      </footer>
    </div>
  );
}
