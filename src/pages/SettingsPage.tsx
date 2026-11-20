import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { roleLabel } from '../lib/format';
import type { SessionUser } from '../lib/types';
import type { AppPage } from '../components/Layout';
import { useToast } from '../components/Toast';

export function SettingsPage({
  user,
  onNavigate,
}: {
  user: SessionUser;
  onNavigate: (page: AppPage) => void;
}) {
  const { showToast } = useToast();
  const [notifyEmail, setNotifyEmail] = useState('true');
  const [notifyOnFlag, setNotifyOnFlag] = useState('true');
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [emailFrom, setEmailFrom] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getEmailStatus().catch(() => null)])
      .then(([s, emailStatus]) => {
        const flagKey = `NotifyOnFlag_${user.userId}`;
        const emailKey = `NotifyEmail_${user.userId}`;
        if (s && s[flagKey] !== undefined) setNotifyOnFlag(String(s[flagKey]));
        if (s && s[emailKey] !== undefined) setNotifyEmail(String(s[emailKey]));
        if (emailStatus) {
          setEmailConfigured(Boolean(emailStatus.configured));
          setEmailFrom(emailStatus.fromAddress || '');
        }
        setLoaded(true);
      })
      .catch(() => {
        showToast('Could not load your settings. Please refresh the page.', 'error');
      });
  }, [user.userId, showToast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loaded || saving) return;
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      updates[`NotifyEmail_${user.userId}`] = notifyEmail;
      updates[`NotifyOnFlag_${user.userId}`] = notifyOnFlag;
      await api.updateSettings(updates);
      showToast('Settings saved.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
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

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#4A1219] m-0">Settings</h1>
        <form onSubmit={handleSave} className="space-y-4 mt-4 max-w-lg">
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">Full Name</label>
            <input
              type="text"
              disabled
              value={user.name || ''}
              className="w-full rounded-lg border border-[#EAD9D4] bg-[#F8F4F0] px-3 py-2 text-sm text-[#7A6F6F]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">
              Auto-send email for notifications (Announcements, Concerns &amp; Tickets, CAR updates, Audit Schedules)
            </label>
            <select
              disabled={!loaded}
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white disabled:bg-[#F8F4F0] focus:outline-none focus:border-[#6B1A25]"
            >
              <option value="true">Yes — automatically email my account ({user.email})</option>
              <option value="false">No — in-app notifications only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">
              Notify me by email when a record is flagged
            </label>
            <select
              disabled={!loaded}
              value={notifyOnFlag}
              onChange={(e) => setNotifyOnFlag(e.target.value)}
              className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white disabled:bg-[#F8F4F0] focus:outline-none focus:border-[#6B1A25]"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          {emailConfigured !== null && (
            <div className="rounded-lg border border-[#EAD9D4] bg-[#FCF6F3] px-3.5 py-2.5 text-xs text-[#4A1219] space-y-1">
              {emailConfigured ? (
                <p className="m-0">
                  Automatic email delivery is active{emailFrom ? ` via ${emailFrom}` : ''}. Announcements, Concerns &amp; Tickets, Audit Schedules, and CAR actions (new, edited, flagged, deadline, follow-up, reopened, closed, comments) will be emailed to <strong>{user.email}</strong>. Private direct messages stay strictly in-app for DPO &amp; security privacy.
                </p>
              ) : (
                <p className="m-0 text-[#7A6F6F]">
                  To deliver emails externally, configure <span className="font-mono-tabular font-semibold">GOOGLE_MAIL_WEBHOOK_URL</span> (recommended for Render Free Tier) or{' '}
                  <span className="font-mono-tabular font-semibold">SMTP_HOST</span>,{' '}
                  <span className="font-mono-tabular font-semibold">SMTP_PORT</span>,{' '}
                  <span className="font-mono-tabular font-semibold">SMTP_USER</span>, and{' '}
                  <span className="font-mono-tabular font-semibold">SMTP_PASS</span> in your server environment variables.
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
          Manage your password from the{' '}
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
