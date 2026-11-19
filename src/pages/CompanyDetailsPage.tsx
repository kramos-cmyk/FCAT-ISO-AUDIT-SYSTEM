import React, { useEffect, useState } from 'react';
import { CheckCircle2, Database, FileSpreadsheet, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api';
import type { SessionUser, StorageStatus } from '../lib/types';
import { useToast } from '../components/Toast';

function safeColor(c: string | undefined, fallback: string) {
  return /^#[0-9A-Fa-f]{3,8}$/.test(c || '') ? c! : fallback;
}

export function CompanyDetailsPage({
  user,
  onCompanyUpdated,
}: {
  user: SessionUser;
  onCompanyUpdated: () => void;
}) {
  const { showToast } = useToast();
  const isAdmin = user.role === 'Admin';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [standard, setStandard] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#7A1E2B');
  const [accentGreen, setAccentGreen] = useState('#3A7D44');
  const [accentGold, setAccentGold] = useState('#D4A017');

  // Departments management (Admin)
  const [departments, setDepartments] = useState<string[]>([]);
  const [newDept, setNewDept] = useState('');
  const [deptBusy, setDeptBusy] = useState(false);

  // Master Template (Admin)
  const [templateUrl, setTemplateUrl] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);

  // Storage & Google Sheets Sync (Admin)
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [sheetIdInput, setSheetIdInput] = useState('');
  const [saJsonInput, setSaJsonInput] = useState('');
  const [testingSheet, setTestingSheet] = useState(false);
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [sheetTestMsg, setSheetTestMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getCompanyDetails(false),
      api.getDepartments().catch(() => []),
      api.getSettings().catch(() => ({} as Record<string, string>)),
      isAdmin ? api.getStorageStatus().catch(() => null) : Promise.resolve(null),
    ])
      .then(([c, depts, settings, st]) => {
        setCompanyName(c.CompanyName || '');
        setAddress(c.Address || '');
        setStandard(c.Standard || '');
        setLogoUrl(c.LogoUrl || '');
        setPrimaryColor(c.PrimaryColor || '#7A1E2B');
        setAccentGreen(c.AccentGreen || '#3A7D44');
        setAccentGold(c.AccentGold || '#D4A017');
        setDepartments(depts || []);
        setTemplateUrl(settings?.FO_RI_05_TEMPLATE_URL || '');
        if (st) {
          setStorageStatus(st);
          setSheetIdInput(st.spreadsheetId || '');
        }
      })
      .catch((err) => showToast(err.message || 'Could not load company details.', 'error'))
      .finally(() => setLoading(false));
  }, [isAdmin, showToast]);

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (logoUrl.trim() && !/^https:\/\//i.test(logoUrl.trim()) && !logoUrl.trim().startsWith('/uploads/')) {
      showToast('Logo URL must be a valid https:// link.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateCompanyDetails({
        CompanyName: companyName,
        Address: address,
        Standard: standard,
        LogoUrl: logoUrl.trim(),
      });
      if (!res.ok) throw new Error(res.error || 'Could not save company details.');
      showToast('Company details saved.', 'success');
      onCompanyUpdated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddDepartment = async () => {
    if (!newDept.trim()) return;
    setDeptBusy(true);
    try {
      const res = await api.addDepartment(newDept.trim());
      if (res.ok && res.departments) {
        setDepartments(res.departments);
        setNewDept('');
        showToast('Department added.', 'success');
      } else {
        showToast(res.error || 'Could not add department.', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add department.', 'error');
    } finally {
      setDeptBusy(false);
    }
  };

  const handleRemoveDepartment = async (name: string) => {
    setDeptBusy(true);
    try {
      const res = await api.removeDepartment(name);
      if (res.ok && res.departments) {
        setDepartments(res.departments);
        showToast(`Removed ${name}.`, 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove department.', 'error');
    } finally {
      setDeptBusy(false);
    }
  };

  const handleUploadTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTemplateBusy(true);
    try {
      const res = await api.uploadFormTemplate(file);
      if (res.ok && res.url) {
        setTemplateUrl(res.url);
        showToast('Master FO-RI-05 template uploaded.', 'success');
      } else {
        showToast(res.error || 'Upload failed.', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed.', 'error');
    } finally {
      setTemplateBusy(false);
      e.target.value = '';
    }
  };

  const handleTestSheet = async () => {
    setTestingSheet(true);
    setSheetTestMsg('');
    try {
      const res = await api.testSheetsConnection(sheetIdInput, saJsonInput || undefined);
      if (res.ok) {
        setSheetTestMsg(`Connected to "${res.title}" (${res.tabs?.length || 0} tabs found).`);
        showToast('Google Sheet connection succeeded!', 'success');
      } else {
        setSheetTestMsg(res.error || 'Connection failed.');
        showToast(res.error || 'Connection failed.', 'error');
      }
    } catch (err) {
      setSheetTestMsg(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      setTestingSheet(false);
    }
  };

  const handleSyncSheets = async (direction: 'pull-from-sheets' | 'push-to-sheets') => {
    setSyncingSheet(true);
    try {
      const res = await api.syncSheets(direction, sheetIdInput || undefined, saJsonInput || undefined);
      if (res.ok && res.summary) {
        showToast(
          `Sync complete: ${res.summary.cars} CARs, ${res.summary.users} users, ${res.summary.departments} departments.`,
          'success'
        );
        const depts = await api.getDepartments().catch(() => []);
        if (depts.length) setDepartments(depts);
      } else {
        showToast(res.error || 'Sync failed.', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sync failed.', 'error');
    } finally {
      setSyncingSheet(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-10 text-center text-sm text-[#7A6F6F]">
        Loading company details...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#4A1219] m-0">Company Details</h1>
        <form onSubmit={handleSaveCompany} className="space-y-4 mt-4">
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">Company Name</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm disabled:bg-[#F8F4F0]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">Address</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm disabled:bg-[#F8F4F0]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">Certified Standard</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={standard}
              onChange={(e) => setStandard(e.target.value)}
              className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm disabled:bg-[#F8F4F0]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#4A1219] mb-1">
              Logo URL (Google Drive or HTTPS link)
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm disabled:bg-[#F8F4F0]"
            />
          </div>
          {isAdmin && (
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </form>
      </div>

      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-bold text-[#4A1219] m-0">Brand Colors</h2>
        <div className="flex flex-wrap gap-5 mt-4">
          <div className="text-center">
            <div
              className="w-14 h-14 rounded-lg border border-[#EAD9D4]"
              style={{ backgroundColor: safeColor(primaryColor, '#7A1E2B') }}
            />
            <span className="text-xs text-[#7A6F6F] mt-1 block">Maroon</span>
          </div>
          <div className="text-center">
            <div
              className="w-14 h-14 rounded-lg border border-[#EAD9D4]"
              style={{ backgroundColor: safeColor(accentGreen, '#3A7D44') }}
            />
            <span className="text-xs text-[#7A6F6F] mt-1 block">Green</span>
          </div>
          <div className="text-center">
            <div
              className="w-14 h-14 rounded-lg border border-[#EAD9D4]"
              style={{ backgroundColor: safeColor(accentGold, '#D4A017') }}
            />
            <span className="text-xs text-[#7A6F6F] mt-1 block">Gold</span>
          </div>
        </div>
      </div>

      {isAdmin && (
        <>
          {/* Department Directory Manager */}
          <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#4A1219] m-0">Departments Directory</h2>
            <p className="text-xs text-[#7A6F6F] mt-1">
              Single source of truth for Department dropdowns across user accounts and CAR routing.
            </p>
            <div className="flex gap-2 mt-3 max-w-md">
              <input
                type="text"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                placeholder="Add new department..."
                className="flex-1 rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
              />
              <button
                type="button"
                disabled={deptBusy}
                onClick={handleAddDepartment}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {departments.map((d) => (
                <div
                  key={d}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-[#F0E4DF] bg-[#FCF6F3]/60 text-xs"
                >
                  <span className="truncate font-medium">{d}</span>
                  <button
                    type="button"
                    disabled={deptBusy}
                    onClick={() => handleRemoveDepartment(d)}
                    aria-label={`Remove ${d}`}
                    className="text-[#7A6F6F] hover:text-[#A32424] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Master FO-RI-05 Template */}
          <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#4A1219] m-0">FO-RI-05 Master Reference Template</h2>
            <p className="text-xs text-[#7A6F6F] mt-1">
              Upload an official reference document for auditors and process owners.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-[#6B1A25] text-[#6B1A25] hover:bg-[#6B1A25] hover:text-white cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                {templateBusy ? 'Uploading...' : 'Upload Master Template'}
                <input type="file" className="hidden" onChange={handleUploadTemplate} />
              </label>
              {templateUrl && (
                <a
                  href={templateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-[#2F6D39] hover:underline"
                >
                  View current template
                </a>
              )}
            </div>
          </div>

          {/* Database & Existing Google Sheet Integration */}
          <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {storageStatus?.mode === 'sheets' ? (
                  <FileSpreadsheet className="h-5 w-5 text-[#2F6D39]" />
                ) : (
                  <Database className="h-5 w-5 text-[#6B1A25]" />
                )}
                <h2 className="text-lg font-bold text-[#4A1219] m-0">
                  Database &amp; Existing Google Sheet Connection
                </h2>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-[#F8F4F0] border border-[#EAD9D4] text-[#4A1219]">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#2F6D39]" />
                Active Mode: {storageStatus?.mode === 'sheets' ? 'Live Google Sheet' : 'SQLite Database'}
              </span>
            </div>

            <p className="text-xs text-[#574D4D] leading-relaxed m-0">
              The portal runs on a persistent SQLite database out of the box and can also connect directly to your
              existing Google Sheet (matching all 12 tabs: <span className="font-mono-tabular">Users</span>,{' '}
              <span className="font-mono-tabular">CAR_Records</span>,{' '}
              <span className="font-mono-tabular">CAR_WhyWhy</span>,{' '}
              <span className="font-mono-tabular">Departments</span>, etc.). On Render, set{' '}
              <span className="font-mono-tabular font-semibold">GOOGLE_SPREADSHEET_ID</span> and{' '}
              <span className="font-mono-tabular font-semibold">GOOGLE_SERVICE_ACCOUNT_JSON</span> in Environment
              Variables to switch live storage to your spreadsheet, or use the sync tools below to import/export
              existing records.
            </p>

            {storageStatus?.sheetsInitError && (
              <div className="text-xs bg-[#FBE7E1] border border-[#F3CFC5] text-[#9A2A1E] rounded-lg px-3.5 py-2">
                Google Sheets initialization fallback notice: {storageStatus.sheetsInitError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  Existing Google Spreadsheet ID
                </label>
                <input
                  type="text"
                  value={sheetIdInput}
                  onChange={(e) => setSheetIdInput(e.target.value)}
                  placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm font-mono-tabular focus:outline-none focus:border-[#6B1A25]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  Service Account JSON {storageStatus?.serviceAccountConfigured ? '(configured via env — paste to override for sync)' : ''}
                </label>
                <textarea
                  rows={3}
                  value={saJsonInput}
                  onChange={(e) => setSaJsonInput(e.target.value)}
                  placeholder='{"type":"service_account","client_email":"...","private_key":"..."}'
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-xs font-mono-tabular focus:outline-none focus:border-[#6B1A25]"
                />
              </div>
            </div>

            {sheetTestMsg && (
              <div className="text-xs bg-[#F8F4F0] border border-[#EAD9D4] rounded-lg px-3.5 py-2 text-[#2B2323]">
                {sheetTestMsg}
              </div>
            )}

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                disabled={testingSheet}
                onClick={handleTestSheet}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-[#6B1A25] text-[#6B1A25] hover:bg-[#6B1A25] hover:text-white cursor-pointer disabled:opacity-50"
              >
                {testingSheet ? 'Testing...' : 'Test Sheet Connection'}
              </button>
              <button
                type="button"
                disabled={syncingSheet}
                onClick={() => handleSyncSheets('pull-from-sheets')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#2F6D39] hover:bg-[#255A2D] text-white cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncingSheet ? 'animate-spin' : ''}`} />
                Import from Existing Google Sheet → SQLite
              </button>
              <button
                type="button"
                disabled={syncingSheet}
                onClick={() => handleSyncSheets('push-to-sheets')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#C9A227] hover:bg-[#A9861E] text-[#4A1219] cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncingSheet ? 'animate-spin' : ''}`} />
                Backup SQLite → Google Sheet
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
