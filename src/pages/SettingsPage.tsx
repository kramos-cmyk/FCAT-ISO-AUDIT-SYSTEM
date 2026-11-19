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
  const [notifyOnFlag, setNotifyOnFlag] = useState('true');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        const key = `NotifyOnFlag_${user.userId}`;
        if (s && s[key] !== undefined) setNotifyOnFlag(String(s[key]));
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
      updates[`NotifyOnFlag_${user.userId}`] = notifyOnFlag;
      await api.updateSettings(updates);
      showToast('Settings saved.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#4A1219] m-0">Settings</h1>
        <form onSubmit={handleSave} className="space-y-4 mt-4 max-w-md">
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
          <button
            type="submit"
            disabled={!loaded || saving}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
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
          To lock/unlock accounts, an Auditor Account can do so from User Management.
        </p>
      </div>
    </div>
  );
}
