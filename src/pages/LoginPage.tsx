import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  LogIn,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { safeUrl } from '../lib/format';
import type { SessionUser } from '../lib/types';
import { FCATLogo } from '../components/BrandCrest';
import { PortalInfoModal, type PortalModalKind } from '../components/PortalInfoModals';
import { OFFICIAL_WEBSITE_URL } from '../lib/fcatPortalInfo';

const OFFICIAL_SCHOOL_LOGO = '/fcat-logo.png';
const LEGACY_DRIVE_LOGO_ID = '1AjBH5OjVr9uuo3Wlb7VywM7eAkXD7zlR';

function resolveCrestSrc(logoUrl?: string): string {
  const safe = safeUrl(logoUrl);
  if (!safe || safe.includes(LEGACY_DRIVE_LOGO_ID)) return OFFICIAL_SCHOOL_LOGO;
  return safe;
}

export function LoginPage({
  company,
  notice,
  onLoginSuccess,
}: {
  company: Record<string, string>;
  notice?: string;
  onLoginSuccess: (token: string, user: SessionUser) => void;
}) {
  const [loginOpen, setLoginOpen] = useState<boolean>(Boolean(notice));
  const [activeModal, setActiveModal] = useState<PortalModalKind | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [crestFailed, setCrestFailed] = useState(false);

  useEffect(() => {
    if (notice) {
      setActiveModal(null);
      setLoginOpen(true);
    }
  }, [notice]);

  useEffect(() => {
    if (!loginOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLoginOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loginOpen]);

  const crestSrc = crestFailed ? OFFICIAL_SCHOOL_LOGO : resolveCrestSrc(company.LogoUrl);
  const companyName = company.CompanyName || 'Fernandez College of Arts and Technology';
  const standard = company.Standard || 'ISO 9001:2015';

  const openInfoModal = (kind: PortalModalKind) => {
    setMobileMenuOpen(false);
    setLoginOpen(false);
    setActiveModal(kind);
  };

  const openLoginModal = () => {
    setMobileMenuOpen(false);
    setActiveModal(null);
    setLoginOpen(true);
  };

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
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[#33090F] bg-[url('/assets/aistudio/FCAT_Background_9d8d0c62.png')] bg-cover bg-center bg-no-repeat bg-fixed text-white">
      {/* Readability scrim keeping the FCAT campus building clearly visible */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#2A050E]/80 via-[#380714]/50 to-[#22040B]/30"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#23030B]/45 via-transparent to-[#1B0208]/65"
      />

      {/* Subtle Decorative Concentric Arcs (top-left) */}
      <svg
        aria-hidden="true"
        viewBox="0 0 420 420"
        className="pointer-events-none absolute -top-20 -left-20 w-[380px] h-[380px] sm:w-[520px] sm:h-[520px] text-white/10"
        fill="none"
      >
        <circle cx="140" cy="140" r="140" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="140" cy="140" r="175" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="140" cy="140" r="210" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="140" cy="140" r="245" stroke="currentColor" strokeWidth="1.2" />
      </svg>

      {/* Top Navigation Bar */}
      <header className="relative z-20 border-b border-white/15 bg-[#3B0613]/55 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              setActiveModal(null);
              setLoginOpen(false);
              setMobileMenuOpen(false);
            }}
            className="flex items-center gap-2.5 text-white text-left cursor-pointer shrink-0"
          >
            <img
              src={crestSrc}
              alt="FCAT Seal"
              referrerPolicy="no-referrer"
              onError={() => {
                if (crestSrc !== OFFICIAL_SCHOOL_LOGO) setCrestFailed(true);
              }}
              className="h-9 w-9 rounded-full object-contain bg-white p-0.5 border border-[#F3B700]/70"
            />
            <div className="leading-tight">
              <div className="font-bold text-sm sm:text-base tracking-tight">FCAT ISO Audit</div>
              <div className="text-[10px] text-white/75 hidden sm:block">{standard} Compliance</div>
            </div>
          </button>

          <nav aria-label="Portal overview navigation" className="hidden md:flex items-center gap-7 text-sm font-medium">
            <button
              type="button"
              onClick={() => openInfoModal('programs')}
              className={`transition-colors cursor-pointer ${
                activeModal === 'programs' ? 'text-[#F3B700] font-semibold' : 'text-white/90 hover:text-[#F3B700]'
              }`}
            >
              Programs &amp; Enrollment
            </button>
            <button
              type="button"
              onClick={() => openInfoModal('scholarship')}
              className={`transition-colors cursor-pointer ${
                activeModal === 'scholarship' ? 'text-[#F3B700] font-semibold' : 'text-white/90 hover:text-[#F3B700]'
              }`}
            >
              Scholarship
            </button>
            <button
              type="button"
              onClick={() => openInfoModal('about')}
              className={`transition-colors cursor-pointer ${
                activeModal === 'about' ? 'text-[#F3B700] font-semibold' : 'text-white/90 hover:text-[#F3B700]'
              }`}
            >
              About FCAT
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openLoginModal}
              className="inline-flex items-center gap-2 rounded-lg border border-white/40 bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              Log in
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#5C091E]/95 px-4 py-3 space-y-1.5 text-sm">
            <button
              type="button"
              onClick={() => openInfoModal('programs')}
              className="block w-full text-left px-3 py-2 rounded-lg text-white/95 hover:bg-white/10 cursor-pointer"
            >
              Programs &amp; Enrollment
            </button>
            <button
              type="button"
              onClick={() => openInfoModal('scholarship')}
              className="block w-full text-left px-3 py-2 rounded-lg text-white/95 hover:bg-white/10 cursor-pointer"
            >
              Scholarship
            </button>
            <button
              type="button"
              onClick={() => openInfoModal('about')}
              className="block w-full text-left px-3 py-2 rounded-lg text-white/95 hover:bg-white/10 cursor-pointer"
            >
              About FCAT
            </button>
            <button
              type="button"
              onClick={() => openInfoModal('history')}
              className="block w-full text-left px-3 py-2 rounded-lg text-[#F3B700] hover:bg-white/10 cursor-pointer font-semibold"
            >
              Version History (Learn More)
            </button>
          </div>
        )}
      </header>

      {/* Full-Screen Hero Main Area */}
      <main className="relative z-10 flex-1 flex items-center">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-10 sm:py-14 grid grid-cols-1 lg:grid-cols-12 items-center gap-10 lg:gap-12">
          {/* Left Column: Typography & Actions */}
          <div className="lg:col-span-7 text-left">
            <h1 className="font-display text-3xl sm:text-5xl lg:text-[3.4rem] font-bold text-white leading-[1.12] tracking-tight m-0 drop-shadow-md">
              {companyName}
            </h1>

            <div className="mt-4 mb-3">
              <span className="inline-block rounded-full bg-[#F8C6D4] text-[#6B0F28] px-4 py-1 text-sm sm:text-base font-bold shadow-sm">
                is now on
              </span>
            </div>

            <h2 className="font-display text-2xl sm:text-4xl lg:text-[2.7rem] font-bold text-white leading-[1.15] m-0 drop-shadow-md">
              ISO Audit &amp; Compliance Management System
            </h2>

            <p className="mt-5 text-sm sm:text-base text-white/90 max-w-xl leading-relaxed drop-shadow-sm">
              FCAT has unified its {standard} Corrective Action Reports (FO-RI-05), internal audit
              schedules, department compliance tracking, and verified follow-ups into one centralized
              portal.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4 sm:gap-6">
              <button
                type="button"
                onClick={() => openInfoModal('history')}
                className="inline-flex items-center gap-2 rounded-full bg-[#F3B700] hover:bg-[#DDA600] text-[#4A1219] font-bold text-sm px-6 py-3 shadow-lg transition-colors cursor-pointer"
              >
                <ArrowDown className="h-4 w-4" />
                Learn more
              </button>

              <a
                href={OFFICIAL_WEBSITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-white/95 hover:text-[#F3B700] transition-colors py-2"
              >
                <Globe className="h-4 w-4" />
                Visit the official website
              </a>
            </div>
          </div>

          {/* Right Column: Official FCAT Seal & Orbital Crest */}
          <div className="lg:col-span-5 flex items-center justify-center">
            <div className="relative flex items-center justify-center p-4 sm:p-6">
              {/* Thin orbital accent rings */}
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-full border border-white/15 scale-110"
              />
              <div
                aria-hidden="true"
                className="absolute inset-3 rounded-full border border-[#F3B700]/25 scale-105"
              />

              <div className="relative h-60 w-60 sm:h-76 sm:w-76 lg:h-[360px] lg:w-[360px] rounded-full bg-white/95 p-2 shadow-2xl border-4 border-white/85 flex items-center justify-center">
                <img
                  src={crestSrc}
                  alt="Fernandez College of Arts and Technology Official Seal"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    if (crestSrc !== OFFICIAL_SCHOOL_LOGO) setCrestFailed(true);
                  }}
                  className="h-full w-full rounded-full object-contain"
                />

                {/* Overlapping lower-left crest badge */}
                <div
                  aria-hidden="true"
                  className="absolute -bottom-1 left-2 sm:left-4 h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-[#750D28] border-2 border-white shadow-xl flex flex-col items-center justify-center text-white"
                >
                  <ShieldCheck className="h-7 w-7 sm:h-8 sm:w-8 text-[#F3B700]" />
                  <span className="text-[9px] font-bold tracking-wider uppercase mt-0.5">ISO 9001</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Subtle Full-Screen Bottom Bar */}
      <footer className="relative z-10 border-t border-white/15 bg-[#26040C]/45 backdrop-blur-xs px-4 sm:px-8 py-3 text-[11px] sm:text-xs text-white/80">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            &copy; {new Date().getFullYear()} {companyName} &middot; ISO Audit Management System
          </div>
          <div className="text-white/90 font-medium">
            Information Technology Services Department 2026
          </div>
        </div>
      </footer>

      {/* Pop-Up Modals for Programs, Scholarship, About FCAT & Learn More (Version History) */}
      <PortalInfoModal
        kind={activeModal}
        onClose={() => setActiveModal(null)}
        onOpenLogin={openLoginModal}
      />

      {/* Sign-In Modal */}
      {loginOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#23060E]/60 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLoginOpen(false);
          }}
        >
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-[#EAD9D4] relative text-[#2B2323]">
            <div className="h-1.5 bg-gradient-to-r from-[#C9A227] to-[#6B1A25]" />
            <button
              type="button"
              onClick={() => setLoginOpen(false)}
              aria-label="Close login modal"
              className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-[#7A6F6F] hover:text-[#2B2323] hover:bg-[#F8F4F0] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-8">
              <div className="flex justify-center mb-3">
                <FCATLogo logoUrl={company.LogoUrl} size="lg" alt="FCAT Seal" />
              </div>
              <h2 id="login-modal-title" className="text-2xl font-bold text-center text-[#4A1219] m-0">
                FCAT ISO Audit
              </h2>
              <p className="text-xs text-center text-[#7A6F6F] mt-1 mb-6">
                Corrective Actions &amp; Compliance Portal
              </p>

              {!error && notice && (
                <div
                  role="status"
                  className="mb-4 rounded-lg bg-[#FBF0D6] border border-[#E7CF86] text-[#6B5300] px-3.5 py-2.5 text-xs font-medium"
                >
                  {notice}
                </div>
              )}

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
                    autoFocus
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

              <p className="text-xs text-center text-[#7A6F6F] mt-5 mb-0">
                Forgot your password? Contact your administrator.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
