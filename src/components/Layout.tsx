import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  Building2,
  Calendar,
  CheckCheck,
  ClipboardList,
  FilePlus2,
  FileText,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Settings,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { fmtDateTime, isAuditorRole, roleLabel } from '../lib/format';
import { useRealtimeSubscription, type RealtimeMessage } from '../lib/realtime';
import type { NotificationItem, SessionUser } from '../lib/types';
import { FCATLogo } from './BrandCrest';

export type AppPage =
  | 'admin'
  | 'overview'
  | 'users'
  | 'announcements'
  | 'helpdesk'
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
  { id: 'helpdesk', label: 'Help Desk', icon: LifeBuoy },
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
  { id: 'helpdesk', label: 'Help Desk', icon: LifeBuoy },
  { id: 'profile', label: 'My Profile', icon: UserCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'terms', label: 'Terms of Use', icon: FileText },
];

export function Layout({
  user,
  activePage,
  company,
  onNavigate,
  onViewCar,
  onOpenHelpDesk,
  onLogout,
  children,
}: {
  user: SessionUser;
  activePage: AppPage;
  company: Record<string, string>;
  onNavigate: (page: AppPage, carNo?: string) => void;
  onViewCar?: (carNo: string) => void;
  onOpenHelpDesk?: (tab: 'tickets' | 'dm', id?: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const bellWrapRef = useRef<HTMLDivElement | null>(null);

  const items =
    user.role === 'Admin'
      ? ADMIN_NAV
      : user.role === 'Auditor'
      ? AUDITOR_NAV
      : EMPLOYEE_NAV;
  const companyName = company.CompanyName || 'FCAT ISO Audit';
  const standard = company.Standard || 'ISO 9001:2015';

  const loadNotifications = useCallback(() => {
    api
      .getNotifications()
      .then((rows) => setNotifications(rows || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications, user.userId]);

  const handleRealtime = useCallback((evt: RealtimeMessage) => {
    if (evt.type === 'notification:new') {
      const notif = evt.payload as NotificationItem;
      if (!notif?.NotificationID) return;
      setNotifications((prev) =>
        prev.some((n) => n.NotificationID === notif.NotificationID) ? prev : [notif, ...prev]
      );
    }
  }, []);

  useRealtimeSubscription(handleRealtime, true);

  useEffect(() => {
    if (!notifOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (bellWrapRef.current && !bellWrapRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [notifOpen]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.Read).length, [notifications]);

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, Read: true })));
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.Read) {
      api.markNotificationRead(n.NotificationID).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) => (item.NotificationID === n.NotificationID ? { ...item, Read: true } : item))
      );
    }
    setNotifOpen(false);
    const ref = String(n.RelatedCARNo || '').trim();
    if (ref.startsWith('ANN:')) {
      onNavigate('announcements');
    } else if (ref.startsWith('AUDIT:')) {
      onNavigate(isAuditorRole(user.role) ? 'admin' : 'employee');
    } else if (ref.startsWith('HELP:')) {
      const ticketId = ref.slice(5);
      if (onOpenHelpDesk) onOpenHelpDesk('tickets', ticketId);
      else onNavigate('helpdesk');
    } else if (ref.startsWith('DM:')) {
      const senderId = ref.slice(3);
      if (onOpenHelpDesk) onOpenHelpDesk('dm', senderId);
      else onNavigate('helpdesk');
    } else if (ref && onViewCar) {
      onViewCar(ref);
    }
  };

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

        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          <span className="hidden md:inline text-xs sm:text-sm text-white/85 whitespace-nowrap">
            {user.name} · {roleLabel(user.role)}
          </span>

          {/* Notification Bell beside Log out */}
          <div className="relative" ref={bellWrapRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              className="relative inline-flex items-center justify-center p-2 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <Bell className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C9A227] text-[#4A1219] text-[10px] font-extrabold flex items-center justify-center shadow font-mono-tabular">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div
                role="dialog"
                aria-label="Notifications"
                className="absolute right-0 mt-2 w-80 sm:w-96 bg-white text-[#2B2323] border border-[#EAD9D4] rounded-xl shadow-2xl overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-[#EAD9D4] bg-[#FBF7F4] flex items-center justify-between gap-2">
                  <div className="font-bold text-sm text-[#4A1219] flex items-center gap-1.5">
                    <Bell className="h-4 w-4 text-[#6B1A25]" />
                    Notifications
                    {unreadCount > 0 && (
                      <span className="text-xs font-mono-tabular px-1.5 py-0.5 rounded bg-[#F4ECE9] text-[#6B1A25]">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#6B1A25] hover:underline cursor-pointer"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto divide-y divide-[#F0E4DF]">
                  {notifications.length === 0 ? (
                    <div className="py-10 px-4 text-center text-xs text-[#7A6F6F]">
                      You have no notifications yet.
                    </div>
                  ) : (
                    notifications.slice(0, 25).map((n) => {
                      const ref = String(n.RelatedCARNo || '').trim();
                      const NotifIcon = ref.startsWith('ANN:')
                        ? Megaphone
                        : ref.startsWith('AUDIT:')
                          ? Calendar
                          : ref.startsWith('HELP:')
                            ? LifeBuoy
                            : ref.startsWith('DM:')
                              ? MessageSquare
                              : ClipboardList;
                      return (
                        <button
                          key={n.NotificationID}
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-[#FCF6F3] transition-colors cursor-pointer flex items-start gap-2.5 ${
                            n.Read ? 'bg-white' : 'bg-[#FBF4F2]'
                          }`}
                        >
                          <div className="mt-0.5 flex items-center gap-1.5 shrink-0">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                n.Read ? 'bg-transparent' : 'bg-[#6B1A25]'
                              }`}
                            />
                            <NotifIcon className={`h-3.5 w-3.5 ${n.Read ? 'text-[#8C8080]' : 'text-[#6B1A25]'}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs leading-relaxed ${n.Read ? 'text-[#574D4D]' : 'text-[#2B2323] font-semibold'}`}>
                              {n.Message}
                            </div>
                            <div className="text-[11px] text-[#7A6F6F] mt-1 font-mono-tabular">
                              {fmtDateTime(n.CreatedAt)}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

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
