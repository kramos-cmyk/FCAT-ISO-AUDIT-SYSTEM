import React, { useState } from 'react';
import {
  BarChart3,
  Building2,
  ClipboardList,
  FilePlus2,
  FileText,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { isAuditorRole, roleLabel } from '../lib/format';
import type { SessionUser } from '../lib/types';
import { FCATLogo } from './BrandCrest';

export type AppPage =
  | 'admin'
  | 'overview'
  | 'users'
  | 'announcements'
  | 'form'
  | 'company'
  | 'profile'
  | 'settings'
  | 'terms'
  | 'employee';

interface NavItem {
  id: AppPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_NAV: NavItem[] = [
  { id: 'admin', label: 'Auditor Dashboard', icon: ClipboardList },
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'form', label: 'New CAR / NC / OFI', icon: FilePlus2 },
  { id: 'company', label: 'Company Details', icon: Building2 },
  { id: 'profile', label: 'My Profile', icon: UserCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'terms', label: 'Terms of Use', icon: FileText },
];

const AUDITOR_NAV: NavItem[] = ADMIN_NAV.filter((item) => item.id !== 'company');

const EMPLOYEE_NAV: NavItem[] = [
  { id: 'employee', label: 'My Department', icon: ClipboardList },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'profile', label: 'My Profile', icon: UserCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'terms', label: 'Terms of Use', icon: FileText },
];

export function Layout({
  user,
  activePage,
  company,
  onNavigate,
  onLogout,
  children,
}: {
  user: SessionUser;
  activePage: AppPage;
  company: Record<string, string>;
  onNavigate: (page: AppPage, carNo?: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const items =
    user.role === 'Admin'
      ? ADMIN_NAV
      : user.role === 'Auditor'
      ? AUDITOR_NAV
      : EMPLOYEE_NAV;
  const companyName = company.CompanyName || 'FCAT ISO Audit';
  const standard = company.Standard || 'ISO 9001:2015';

  const handleNavClick = (id: AppPage) => {
    setMobileOpen(false);
    onNavigate(id);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F4F0] text-[#2B2323]">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-[#6B1A25] to-[#4A1219] text-white border-b-2 border-[#C9A227]/70 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden p-2 -ml-1 rounded-md hover:bg-white/10 cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => handleNavClick(isAuditorRole(user.role) ? 'admin' : 'employee')}
            className="flex items-center gap-2.5 text-left min-w-0 cursor-pointer"
          >
            <FCATLogo logoUrl={company.LogoUrl} size="sm" alt={companyName} />
            <span className="font-display font-bold text-base sm:text-lg tracking-tight truncate">
              {companyName}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <span className="hidden sm:inline text-xs sm:text-sm text-white/85 whitespace-nowrap">
            {user.name} · {roleLabel(user.role)}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 bg-[#C9A227] hover:bg-[#A9861E] text-[#4A1219] font-bold text-xs sm:text-sm px-3.5 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile Backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed lg:static inset-y-0 left-0 z-20 w-60 bg-white border-r border-[#EAD9D4] py-5 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
            mobileOpen ? 'translate-x-0 pt-16' : '-translate-x-full'
          }`}
        >
          <nav className="flex-1 space-y-0.5 px-2" aria-label="Primary Navigation">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-colors text-left cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-[#F7ECEC] text-[#6B1A25] font-bold'
                      : 'text-[#2B2323] font-medium hover:bg-[#FCF6F3] hover:text-[#6B1A25]'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#6B1A25]' : 'text-[#7A6F6F]'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="px-4 pt-4 mt-4 border-t border-[#F0E4DF] text-xs text-[#7A6F6F]">
            <div className="font-semibold text-[#4A1219] truncate">{user.name}</div>
            <div className="truncate mt-0.5">{user.department || roleLabel(user.role)}</div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-[1280px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Institutional Footer */}
      <footer className="bg-white border-t border-[#EAD9D4] px-5 py-3.5 text-center text-xs text-[#7A6F6F]">
        <span>
          &copy; {new Date().getFullYear()} {companyName}
        </span>
        <span className="mx-2 text-[#A9861E]" aria-hidden="true">
          &bull;
        </span>
        <span>{standard}</span>
        <span className="mx-2 text-[#A9861E]" aria-hidden="true">
          &bull;
        </span>
        <span>Corrective Actions &amp; Compliance Portal</span>
      </footer>
    </div>
  );
}
