import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import { isSystemAdminRole, roleLabel } from '../lib/format';
import type { ManagedUser, SessionUser, UserRole } from '../lib/types';
import { StatusLabel } from '../components/StatusLabel';
import { useToast } from '../components/Toast';

export function UsersPage({ currentUser }: { currentUser: SessionUser }) {
  const { showToast } = useToast();
  const isSysAdmin = isSystemAdminRole(currentUser.role);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState<UserRole>('Employee');
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [deptError, setDeptError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [uRows, dRows] = await Promise.all([api.listUsers(), api.getDepartments().catch(() => [])]);
      setUsers(uRows || []);
      setDepartments(dRows || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load users.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const kpis = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.role === 'Admin' || u.role === 'Auditor').length;
    const employees = users.filter((u) => u.role === 'Employee').length;
    const locked = users.filter((u) => u.status === 'Locked').length;
    return { total, admins, employees, locked };
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (q) {
        return (
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, roleFilter, search]);

  const openModal = (u?: ManagedUser) => {
    setEditingUser(u || null);
    setName(u ? u.name : '');
    setEmail(u ? u.email : '');
    setPassword('');
    setPosition(u ? u.position || '' : '');
    setRole(u ? u.role : 'Employee');
    setSelectedDepts(
      u
        ? u.department
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean)
        : []
    );
    setDeptError('');
    setModalOpen(true);
  };

  const toggleDept = (dept: string) => {
    setDeptError('');
    setSelectedDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  };

  const modalDeptOptions = useMemo(() => {
    const current = editingUser
      ? editingUser.department
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      : [];
    return Array.from(new Set([...departments, ...current])).sort();
  }, [departments, editingUser]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDepts.length === 0) {
      setDeptError('Select at least one department.');
      return;
    }
    if (!name.trim() || !email.trim()) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }
    if (!editingUser && password.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    if (editingUser && password && password.length < 8) {
      showToast('New password must be at least 8 characters.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const res = await api.updateUser(editingUser.userId, {
          name: name.trim(),
          email: email.trim(),
          departments: selectedDepts,
          position: position.trim(),
          role,
          password: password || undefined,
        });
        if (!res.ok) {
          showToast(res.error || 'Could not update user.', 'error');
          return;
        }
        if (res.user) {
          setUsers((prev) => prev.map((x) => (x.userId === editingUser.userId ? res.user! : x)));
        }
        showToast('User updated.', 'success');
      } else {
        const res = await api.createUser({
          name: name.trim(),
          email: email.trim(),
          password,
          departments: selectedDepts,
          position: position.trim(),
          role,
        });
        if (!res.ok) {
          showToast(res.error || 'Could not create user.', 'error');
          return;
        }
        if (res.user) {
          setUsers((prev) => [...prev, res.user!]);
        }
        showToast('Account created.', 'success');
      }
      setModalOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLock = async (userId: string, lock: boolean) => {
    try {
      const res = await api.setUserLock(userId, lock);
      if (!res.ok) {
        showToast(res.error || 'Could not update this account.', 'error');
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.userId === userId ? { ...u, status: lock ? 'Locked' : 'Active' } : u))
      );
      showToast(lock ? 'Account locked.' : 'Account unlocked.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action failed.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#4A1219] m-0">User Overview</h1>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-4 tabular-nums">
          <div className="border border-[#EAD9D4] border-t-2 border-t-[#EAD9D4] rounded-lg p-4">
            <div className="text-2xl font-extrabold font-mono-tabular text-[#4A1219]">{kpis.total}</div>
            <div className="text-[11px] uppercase tracking-wider text-[#7A6F6F] mt-1">Total Users</div>
          </div>
          <div className="border border-[#EAD9D4] border-t-2 border-t-[#6B1A25] rounded-lg p-4">
            <div className="text-2xl font-extrabold font-mono-tabular text-[#4A1219]">{kpis.admins}</div>
            <div className="text-[11px] uppercase tracking-wider text-[#7A6F6F] mt-1">Auditor Accounts</div>
          </div>
          <div className="border border-[#EAD9D4] border-t-2 border-t-[#2F6D39] rounded-lg p-4">
            <div className="text-2xl font-extrabold font-mono-tabular text-[#2F6D39]">{kpis.employees}</div>
            <div className="text-[11px] uppercase tracking-wider text-[#7A6F6F] mt-1">Process Owners</div>
          </div>
          <div
            className={`border border-[#EAD9D4] border-t-2 ${
              kpis.locked > 0 ? 'border-t-[#C9A227]' : 'border-t-[#EAD9D4]'
            } rounded-lg p-4`}
          >
            <div
              className={`text-2xl font-extrabold font-mono-tabular ${
                kpis.locked > 0 ? 'text-[#8A6D00]' : 'text-[#4A1219]'
              }`}
            >
              {kpis.locked}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-[#7A6F6F] mt-1">Locked Accounts</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <h2 className="text-xl font-bold text-[#4A1219] m-0">User Management</h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
            >
              <option value="">All roles</option>
              <option value="Admin">System Administrator</option>
              <option value="Auditor">Auditor Account</option>
              <option value="Employee">Process Owner</option>
            </select>
            <div className="relative">
              <Search className="h-4 w-4 text-[#7A6F6F] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / email / dept"
                className="rounded-lg border border-[#EAD9D4] pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25] w-56"
              />
            </div>
            <button
              type="button"
              onClick={() => openModal()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9A227] hover:bg-[#A9861E] text-[#4A1219] font-bold text-sm px-4 py-2 cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Add User
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-[#7A6F6F]">Loading users...</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#7A6F6F]">No matching users.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b-2 border-[#EAD9D4] text-left text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">
                  <th className="py-3 pr-3">Name</th>
                  <th className="py-3 pr-3">Email</th>
                  <th className="py-3 pr-3">Role</th>
                  <th className="py-3 pr-3">Department</th>
                  <th className="py-3 pr-3">Position</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E4DF]">
                {filtered.map((u) => {
                  const isSelf = u.userId === currentUser.userId;
                  const targetRestricted = !isSysAdmin && u.role === 'Admin';
                  return (
                    <tr key={u.userId} className="hover:bg-[#FCF6F3]">
                      <td className="py-3 pr-3 font-medium">{u.name}</td>
                      <td className="py-3 pr-3">{u.email}</td>
                      <td className="py-3 pr-3">
                        {u.role === 'Admin' || u.role === 'Auditor' ? (
                          <StatusLabel status={roleLabel(u.role)} />
                        ) : (
                          'Process Owner'
                        )}
                      </td>
                      <td className="py-3 pr-3">{u.department}</td>
                      <td className="py-3 pr-3">{u.position || <span className="text-[#7A6F6F]">—</span>}</td>
                      <td className="py-3 pr-3">
                        <StatusLabel status={u.status} />
                      </td>
                      <td className="py-3 text-right whitespace-nowrap space-x-1.5">
                        {targetRestricted ? (
                          <span className="text-xs text-[#7A6F6F]">Restricted</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openModal(u)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer"
                            >
                              Edit
                            </button>
                            {isSelf ? (
                              <button
                                type="button"
                                disabled
                                title="You cannot lock your own account"
                                className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] text-[#7A6F6F] opacity-50 cursor-not-allowed"
                              >
                                Lock
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleToggleLock(u.userId, u.status !== 'Locked')}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                                  u.status === 'Locked'
                                    ? 'bg-[#2F6D39] hover:bg-[#255A2D] text-white'
                                    : 'border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219]'
                                }`}
                              >
                                {u.status === 'Locked' ? 'Unlock' : 'Lock'}
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit User Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2323]/55 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#EAD9D4] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[#4A1219] m-0">
              {editingUser ? 'Edit User' : 'Add Process Owner / Auditor Account'}
            </h3>
            <form onSubmit={handleSaveUser} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  Full Name <span className="text-[#A32424]">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  Email <span className="text-[#A32424]">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  {editingUser ? 'Reset Password (leave blank to keep current)' : 'Temporary Password'}{' '}
                  {!editingUser && <span className="text-[#A32424]">*</span>}
                </label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min 8 characters"
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                    Department(s) <span className="text-[#A32424]">*</span>
                  </label>
                  <div className="max-h-44 overflow-y-auto border border-[#EAD9D4] rounded-lg p-2.5 space-y-1.5">
                    {modalDeptOptions.map((d) => (
                      <label
                        key={d}
                        className="flex items-center gap-2 text-xs text-[#2B2323] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDepts.includes(d)}
                          onChange={() => toggleDept(d)}
                          className="rounded border-[#EAD9D4] accent-[#6B1A25]"
                        />
                        <span>
                          {d}
                          {!departments.includes(d) && (
                            <span className="text-[#7A6F6F]"> (legacy)</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                  {deptError && <div className="text-xs text-[#A32424] mt-1">{deptError}</div>}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#4A1219] mb-1">Position</label>
                    <input
                      type="text"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A1219] mb-1">Role</label>
                    <select
                      value={role}
                      disabled={Boolean(editingUser && editingUser.userId === currentUser.userId)}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white disabled:bg-[#F8F4F0] focus:outline-none focus:border-[#6B1A25]"
                    >
                      <option value="Employee">Process Owner</option>
                      <option value="Auditor">Auditor Account</option>
                      {isSysAdmin && <option value="Admin">System Administrator</option>}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#EAD9D4] text-[#2B2323] hover:bg-[#F8F4F0] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingUser ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
