import React, { useState } from 'react';
import { api } from '../lib/api';
import { roleLabel } from '../lib/format';
import type { SessionUser } from '../lib/types';
import { DepartmentAvatar, getDepartmentVisual, splitDepartments } from '../components/DepartmentAvatar';
import { useToast } from '../components/Toast';

export function ProfilePage({ user }: { user: SessionUser }) {
  const { showToast } = useToast();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);

  const departments = splitDepartments(user.department);
  const primaryVisual = getDepartmentVisual(departments[0], user.role);

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

        {/* Department / Services Profile Image & Identity Header */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-[#FCF6F3] border border-[#EAD9D4]">
          <DepartmentAvatar department={user.department} role={user.role} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-[#4A1219] truncate">{user.name}</div>
            <div className="text-xs text-[#6F6464] mt-0.5">
              {user.position ? `${user.position} · ` : ''}
              {roleLabel(user.role)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {departments.length > 0 ? (
                departments.map((dept) => {
                  const vis = getDepartmentVisual(dept, user.role);
                  const DeptIcon = vis.icon;
                  return (
                    <span
                      key={dept}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${vis.bg} ${vis.fg} ${vis.ring}`}
                    >
                      <DeptIcon className="w-3.5 h-3.5 shrink-0" />
                      {dept}
                    </span>
                  );
                })
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${primaryVisual.bg} ${primaryVisual.fg} ${primaryVisual.ring}`}
                >
                  <primaryVisual.icon className="w-3.5 h-3.5 shrink-0" />
                  {primaryVisual.label}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
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
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">Department / Services</label>
            <input
              type="text"
              disabled
              value={user.department || 'Institutional / Admin'}
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
