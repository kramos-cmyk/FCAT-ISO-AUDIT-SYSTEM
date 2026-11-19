import React, { useState } from 'react';
import { api } from '../lib/api';
import { roleLabel } from '../lib/format';
import type { SessionUser } from '../lib/types';
import { useToast } from '../components/Toast';

export function ProfilePage({ user }: { user: SessionUser }) {
  const { showToast } = useToast();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPw || !newPw || !confirmPw) {
      showToast('Please fill in all fields.', 'error');
      return;
    }
    if (newPw !== confirmPw) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    if (newPw.length < 8) {
      showToast('New password must be at least 8 characters.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.changePassword(oldPw, newPw);
      if (res.ok) {
        showToast('Password updated.', 'success');
        setOldPw('');
        setNewPw('');
        setConfirmPw('');
      } else {
        showToast(res.error || 'Could not update password.', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#4A1219] m-0">My Profile</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
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
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">Email</label>
            <input
              type="text"
              disabled
              value={user.email || ''}
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
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">Role</label>
            <input
              type="text"
              disabled
              value={roleLabel(user.role)}
              className="w-full rounded-lg border border-[#EAD9D4] bg-[#F8F4F0] px-3 py-2 text-sm text-[#7A6F6F]"
            />
          </div>
        </div>
        <p className="text-xs text-[#7A6F6F] mt-4 m-0">
          To update your name, department, or position, contact your administrator.
        </p>
      </div>

      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-bold text-[#4A1219] m-0">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-3.5 mt-4 max-w-md">
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">
              Current Password <span className="text-[#A32424]">*</span>
            </label>
            <input
              type="password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">
              New Password <span className="text-[#A32424]">*</span>
            </label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="min 8 characters"
              className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">
              Confirm New Password <span className="text-[#A32424]">*</span>
            </label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
