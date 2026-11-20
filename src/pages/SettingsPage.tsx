import React, { useEffect, useState } from 'react';
import { Moon, Palette, RotateCcw, Rows3, Sun, Type } from 'lucide-react';
import { api } from '../lib/api';
import { isSystemAdminRole, roleLabel } from '../lib/format';
import {
  DEFAULT_PREFERENCES,
  loadUserPreferences,
  saveUserPreferences,
  type DensityMode,
  type TextSizeMode,
  type ThemeMode,
  type UserPreferences,
} from '../lib/preferences';
import type { SessionUser } from '../lib/types';
import type { AppPage } from '../components/Layout';
import { useToast } from '../components/Toast';

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  desc: string;
  swatchBg: string;
  swatchCard: string;
  swatchAccent: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'classic',
    label: 'FCAT Classic',
    desc: 'Warm cream & maroon',
    swatchBg: '#F8F4F0',
    swatchCard: '#FFFFFF',
    swatchAccent: '#6B1A25',
    icon: Palette,
  },
  {
    id: 'light',
    label: 'Crisp Light',
    desc: 'Clean neutral white',
    swatchBg: '#F3F4F6',
    swatchCard: '#FFFFFF',
    swatchAccent: '#6B1A25',
    icon: Sun,
  },
  {
    id: 'dark',
    label: 'Dark Mode',
    desc: 'Low-glare night slate',
    swatchBg: '#161213',
    swatchCard: '#282022',
    swatchAccent: '#C9A227',
    icon: Moon,
  },
];

export function SettingsPage({
  user,
  onNavigate,
}: {
  user: SessionUser;
  onNavigate: (page: AppPage) => void;
}) {
  const { showToast } = useToast();
  const isAdmin = isSystemAdminRole(user.role);

  // User workspace preferences (available to all users)
  const [prefs, setPrefs] = useState<UserPreferences>(() => loadUserPreferences(user.userId));

  // Admin-only system auto-email controls
  const [autoEmailEnabled, setAutoEmailEnabled] = useState('true');
  const [autoEmailOnFlag, setAutoEmailOnFlag] = useState('true');
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [emailFrom, setEmailFrom] = useState('');
  const [loaded, setLoaded] = useState(!isAdmin);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setPrefs(loadUserPreferences(user.userId));
  }, [user.userId]);

  useEffect(() => {
    if (!isAdmin) {
      setLoaded(true);
      return;
    }
    Promise.all([api.getSettings(), api.getEmailStatus().catch(() => null)])
      .then(([s, emailStatus]) => {
        if (s && s.AutoEmailEnabled !== undefined) setAutoEmailEnabled(String(s.AutoEmailEnabled));
        if (s && s.AutoEmailOnFlag !== undefined) setAutoEmailOnFlag(String(s.AutoEmailOnFlag));
        if (emailStatus) {
          setEmailConfigured(Boolean(emailStatus.configured));
          setEmailFrom(emailStatus.fromAddress || '');
        }
        setLoaded(true);
      })
      .catch(() => {
        showToast('Could not load settings. Please refresh the page.', 'error');
      });
  }, [isAdmin, showToast]);

  const updatePref = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveUserPreferences(user.userId, next);
    showToast('Appearance preference updated.', 'success');
  };

  const handleResetPrefs = () => {
    setPrefs(DEFAULT_PREFERENCES);
    saveUserPreferences(user.userId, DEFAULT_PREFERENCES);
    showToast('Appearance reset to FCAT Classic defaults.', 'success');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !loaded || saving) return;
    setSaving(true);
    try {
      await api.updateSettings({
        AutoEmailEnabled: autoEmailEnabled,
        AutoEmailOnFlag: autoEmailOnFlag,
      });
      showToast('Auto-email settings saved.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!isAdmin) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await api.sendTestEmail();
      if (!res.ok) {
        const msg = res.error || 'Could not send test email.';
        setTestResult({ ok: false, text: msg });
        showToast(msg, 'error');
        return;
      }
      const okMsg = `Test email sent to ${res.toEmail || user.email}.`;
      setTestResult({ ok: true, text: okMsg });
      showToast(okMsg, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send test email.';
      setTestResult({ ok: false, text: msg });
      showToast(msg, 'error');
    } finally {
      setSendingTest(false);
    }
  };

  const isDefaultPrefs =
    prefs.theme === DEFAULT_PREFERENCES.theme &&
    prefs.textSize === DEFAULT_PREFERENCES.textSize &&
    prefs.density === DEFAULT_PREFERENCES.density;

  return (
    <div className="space-y-6">
      {/* Appearance & Workspace Preferences (All Users) */}
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#4A1219] m-0">Settings</h1>
            <p className="text-xs text-[#7A6F6F] mt-1 mb-0">
              Personalize your portal theme, text readability, and table spacing on this device.
            </p>
          </div>
          {!isDefaultPrefs && (
            <button
              type="button"
              onClick={handleResetPrefs}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#EAD9D4] text-[#4A1219] hover:border-[#6B1A25] cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Defaults
            </button>
          )}
        </div>

        <div className="mt-5 space-y-5 max-w-2xl">
          {/* Theme selector */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4A1219] mb-2">
              <Palette className="h-3.5 w-3.5 text-[#6B1A25]" />
              Color Theme
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {THEME_OPTIONS.map((t) => {
                const Icon = t.icon;
                const active = prefs.theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => updatePref('theme', t.id)}
                    aria-pressed={active}
                    className={`text-left rounded-xl border p-3 transition-all cursor-pointer ${
                      active
                        ? 'border-[#6B1A25] ring-2 ring-[#6B1A25]/20 bg-[#FCF6F3]'
                        : 'border-[#EAD9D4] hover:border-[#6B1A25]/60 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div
                        className="h-7 w-12 rounded-md border border-black/10 flex items-center justify-between px-1.5"
                        style={{ backgroundColor: t.swatchBg }}
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-sm border border-black/10"
                          style={{ backgroundColor: t.swatchCard }}
                        />
                        <span
                          className="h-3.5 w-3.5 rounded-full"
                          style={{ backgroundColor: t.swatchAccent }}
                        />
                      </div>
                      <Icon className={`h-4 w-4 ${active ? 'text-[#6B1A25]' : 'text-[#7A6F6F]'}`} />
                    </div>
                    <div className="text-sm font-bold text-[#4A1219]">{t.label}</div>
                    <div className="text-[11px] text-[#7A6F6F] mt-0.5">{t.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Text Size & Layout Density */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4A1219] mb-2">
                <Type className="h-3.5 w-3.5 text-[#6B1A25]" />
                Text Size
              </div>
              <div className="grid grid-cols-3 gap-1.5 bg-[#FCF6F3] border border-[#EAD9D4] rounded-lg p-1">
                {(['compact', 'standard', 'large'] as TextSizeMode[]).map((mode) => {
                  const active = prefs.textSize === mode;
                  const label = mode === 'compact' ? 'Small' : mode === 'standard' ? 'Standard' : 'Large';
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updatePref('textSize', mode)}
                      aria-pressed={active}
                      className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#6B1A25] text-white shadow-xs'
                          : 'text-[#4A1219] hover:bg-white/70'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4A1219] mb-2">
                <Rows3 className="h-3.5 w-3.5 text-[#6B1A25]" />
                Table &amp; Row Spacing
              </div>
              <div className="grid grid-cols-2 gap-1.5 bg-[#FCF6F3] border border-[#EAD9D4] rounded-lg p-1">
                {(['comfortable', 'compact'] as DensityMode[]).map((mode) => {
                  const active = prefs.density === mode;
                  const label = mode === 'comfortable' ? 'Comfortable' : 'Compact';
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updatePref('density', mode)}
                      aria-pressed={active}
                      className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#6B1A25] text-white shadow-xs'
                          : 'text-[#4A1219] hover:bg-white/70'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Auto-Email Controls (Admin Only) */}
      {isAdmin && (
        <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#4A1219] m-0">System Auto-Email Delivery</h2>
          <p className="text-xs text-[#7A6F6F] mt-1 mb-0">
            Admin-only controls for automated institutional email alerts.
          </p>
          <form onSubmit={handleSave} className="space-y-4 mt-4 max-w-lg">
            <div>
              <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                System Auto-Email Delivery (Announcements, Concerns &amp; Tickets, CAR updates, Audit Schedules)
              </label>
              <select
                disabled={!loaded}
                value={autoEmailEnabled}
                onChange={(e) => setAutoEmailEnabled(e.target.value)}
                className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white disabled:bg-[#F8F4F0] focus:outline-none focus:border-[#6B1A25]"
              >
                <option value="true">Enabled — automatically email active accounts</option>
                <option value="false">Disabled — in-app notifications only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                Send email when a CAR record is flagged (Needs Attention)
              </label>
              <select
                disabled={!loaded}
                value={autoEmailOnFlag}
                onChange={(e) => setAutoEmailOnFlag(e.target.value)}
                className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white disabled:bg-[#F8F4F0] focus:outline-none focus:border-[#6B1A25]"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>

            {emailConfigured !== null && (
              <div className="rounded-lg border border-[#EAD9D4] bg-[#FCF6F3] px-3.5 py-2.5 text-xs text-[#4A1219] space-y-1">
                {emailConfigured ? (
                  <p className="m-0">
                    Automatic email delivery is{' '}
                    <strong>{autoEmailEnabled === 'false' ? 'paused by Admin' : 'active'}</strong>
                    {emailFrom ? ` via ${emailFrom}` : ''}. Announcements, Concerns &amp; Tickets, Audit Schedules, and CAR actions (new, edited, flagged, deadline, follow-up, reopened, closed, comments) are emailed to active accounts. Private direct messages stay strictly in-app for DPO &amp; security privacy.
                  </p>
                ) : (
                  <p className="m-0 text-[#7A6F6F]">
                    To deliver emails externally, configure an email relay (e.g. <span className="font-mono-tabular font-semibold">BREVO_API_KEY</span> or{' '}
                    <span className="font-mono-tabular font-semibold">SMTP_HOST</span>) in your server environment variables.
                  </p>
                )}
              </div>
            )}

            {testResult && (
              <div
                className={`rounded-lg border px-3.5 py-2.5 text-xs ${
                  testResult.ok
                    ? 'bg-[#E9F4EC] border-[#C5E0CB] text-[#255A2D]'
                    : 'bg-[#FDECEC] border-[#F4C2C2] text-[#A32424]'
                }`}
              >
                {testResult.text}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="submit"
                disabled={!loaded || saving}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                type="button"
                disabled={!loaded || sendingTest}
                onClick={handleSendTestEmail}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] bg-white cursor-pointer disabled:opacity-50"
              >
                {sendingTest ? 'Sending...' : 'Send Test Email'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Account Summary */}
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-bold text-[#4A1219] m-0">Account</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">Email</label>
            <input
              type="text"
              disabled
              value={user.email || ''}
              className="w-full rounded-lg border border-[#EAD9D4] bg-[#F8F4F0] px-3 py-2 text-sm text-[#7A6F6F]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">Role</label>
            <input
              type="text"
              disabled
              value={roleLabel(user.role)}
              className="w-full rounded-lg border border-[#EAD9D4] bg-[#F8F4F0] px-3 py-2 text-sm text-[#7A6F6F]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">Department</label>
            <input
              type="text"
              disabled
              value={user.department || ''}
              className="w-full rounded-lg border border-[#EAD9D4] bg-[#F8F4F0] px-3 py-2 text-sm text-[#7A6F6F]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">Position</label>
            <input
              type="text"
              disabled
              value={user.position || ''}
              className="w-full rounded-lg border border-[#EAD9D4] bg-[#F8F4F0] px-3 py-2 text-sm text-[#7A6F6F]"
            />
          </div>
        </div>
        <p className="text-xs text-[#7A6F6F] mt-4">
          Manage your password and Department/Services profile emblem from the{' '}
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="text-[#6B1A25] font-semibold hover:underline cursor-pointer"
          >
            My Profile
          </button>{' '}
          page.
        </p>
        <p className="text-xs text-[#7A6F6F] mt-1 mb-0">
          To lock/unlock accounts, a System Administrator or Auditor Account can do so from User Management.
        </p>
      </div>
    </div>
  );
}
