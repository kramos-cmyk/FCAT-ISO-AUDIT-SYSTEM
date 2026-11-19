import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import { evidenceLinksOf, fmtDate, isRecordOverdue, safeUrl } from '../lib/format';
import type { CarRecord } from '../lib/types';
import { ConfirmModal } from '../components/ConfirmModal';
import { StatusLabel } from '../components/StatusLabel';
import { useToast } from '../components/Toast';

export function AdminDashboardPage({
  onViewCar,
  onEditCar,
  onNewCar,
}: {
  onViewCar: (carNo: string) => void;
  onEditCar: (carNo: string) => void;
  onNewCar: () => void;
}) {
  const { showToast } = useToast();
  const [records, setRecords] = useState<CarRecord[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  // Flag modal
  const [flagCarNo, setFlagCarNo] = useState<string | null>(null);
  const [flagMessage, setFlagMessage] = useState('');
  const [flagBusy, setFlagBusy] = useState(false);

  // Deadline modal
  const [deadlineCarNo, setDeadlineCarNo] = useState<string | null>(null);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineBusy, setDeadlineBusy] = useState(false);

  // Close / Reopen confirm modal
  const [confirmAction, setConfirmAction] = useState<{
    type: 'close' | 'reopen';
    carNo: string;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [exportingCar, setExportingCar] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [cars, depts] = await Promise.all([api.listCARs(), api.getDepartments().catch(() => [])]);
      setRecords(cars || []);
      setDepartments(depts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load submissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const deptOptions = useMemo(() => {
    return Array.from(new Set([...departments, ...records.map((r) => r.Department).filter(Boolean)])).sort();
  }, [departments, records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records
      .filter((r) => {
        if (filterStatus) {
          if (filterStatus === 'Needs Attention' && r.AdminFlag !== 'Needs Attention') return false;
          if (filterStatus !== 'Needs Attention' && r.Status !== filterStatus) return false;
        }
        if (filterDept && r.Department !== filterDept) return false;
        if (q) {
          const matches =
            (r.EmployeeName || '').toLowerCase().includes(q) ||
            (r.CARNo || '').toLowerCase().includes(q) ||
            (r.Details || '').toLowerCase().includes(q) ||
            (r.Department || '').toLowerCase().includes(q);
          if (!matches) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime());
  }, [records, filterDept, filterStatus, search]);

  const handleFlagSubmit = async () => {
    if (!flagCarNo || !flagMessage.trim()) {
      showToast('Please enter a message.', 'error');
      return;
    }
    setFlagBusy(true);
    try {
      const res = await api.flagCAR(flagCarNo, flagMessage.trim());
      if (!res.ok) {
        showToast(res.error || 'Could not flag record.', 'error');
        return;
      }
      setRecords((prev) =>
        prev.map((r) =>
          r.CARNo === flagCarNo ? { ...r, AdminFlag: 'Needs Attention', AdminNote: flagMessage.trim() } : r
        )
      );
      showToast('Notification sent.', 'success');
      setFlagCarNo(null);
      setFlagMessage('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Flagging failed.', 'error');
    } finally {
      setFlagBusy(false);
    }
  };

  const handleDeadlineSubmit = async () => {
    if (!deadlineCarNo || !deadlineDate) {
      showToast('Please choose a date.', 'error');
      return;
    }
    setDeadlineBusy(true);
    try {
      const res = await api.setDeadline(deadlineCarNo, deadlineDate);
      if (!res.ok) {
        showToast(res.error || 'Could not set deadline.', 'error');
        return;
      }
      setRecords((prev) =>
        prev.map((r) => (r.CARNo === deadlineCarNo ? { ...r, AdminDeadline: deadlineDate } : r))
      );
      showToast('Deadline saved.', 'success');
      setDeadlineCarNo(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save deadline.', 'error');
    } finally {
      setDeadlineBusy(false);
    }
  };

  const handleConfirmStatus = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      if (confirmAction.type === 'close') {
        const res = await api.closeCAR(confirmAction.carNo);
        if (!res.ok) throw new Error(res.error || 'Could not close record.');
        setRecords((prev) =>
          prev.map((r) => (r.CARNo === confirmAction.carNo ? { ...r, Status: 'Closed' } : r))
        );
        showToast('Record closed.', 'success');
      } else {
        const res = await api.reopenCAR(confirmAction.carNo);
        if (!res.ok) throw new Error(res.error || 'Could not reopen record.');
        setRecords((prev) =>
          prev.map((r) => (r.CARNo === confirmAction.carNo ? { ...r, Status: 'Open' } : r))
        );
        showToast('Record reopened.', 'success');
      }
      setConfirmAction(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Status update failed.', 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleExport = async (carNo: string) => {
    setExportingCar(carNo);
    try {
      await api.exportCarPdf(carNo);
      showToast(`Exported ${carNo} PDF.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'PDF export failed.', 'error');
    } finally {
      setExportingCar(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-[#4A1219] m-0">All Submissions</h1>
            <p className="text-xs text-[#7A6F6F] mt-1">
              Review, assign deadlines, flag for attention, or close Corrective Action Reports across all departments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filter by department"
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
            >
              <option value="">All departments</option>
              {deptOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
            >
              <option value="">All statuses</option>
              <option value="Open">Open</option>
              <option value="Closed">Closed</option>
              <option value="Needs Attention">Needs Attention</option>
            </select>

            <div className="relative">
              <Search className="h-4 w-4 text-[#7A6F6F] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search handler / CAR no."
                className="rounded-lg border border-[#EAD9D4] pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25] w-52"
              />
            </div>

            <button
              type="button"
              onClick={onNewCar}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white font-semibold text-sm px-4 py-2 cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              New Finding
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-[#7A6F6F]">Loading submissions...</div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-[#A32424]">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#7A6F6F]">
            No matching records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[920px] tabular-nums">
              <thead>
                <tr className="border-b-2 border-[#EAD9D4] text-left text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">
                  <th className="py-3 pr-3">CAR No.</th>
                  <th className="py-3 pr-3">Handled By</th>
                  <th className="py-3 pr-3">Dept</th>
                  <th className="py-3 pr-3">Type</th>
                  <th className="py-3 pr-3">ISO Clause</th>
                  <th className="py-3 pr-3">Company Document</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 pr-3">Deadline</th>
                  <th className="py-3 pr-3">Evidence</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E4DF]">
                {filtered.map((r) => {
                  const status = r.AdminFlag === 'Needs Attention' ? 'Needs Attention' : r.Status;
                  const overdue = isRecordOverdue(r.AdminDeadline, r.Status);
                  const links = evidenceLinksOf(r);
                  return (
                    <tr key={r.CARNo} className="hover:bg-[#FCF6F3] transition-colors">
                      <td className="py-3 pr-3 font-mono-tabular font-semibold text-[#4A1219] whitespace-nowrap">
                        {r.CARNo}
                      </td>
                      <td className="py-3 pr-3">
                        {r.EmployeeName && r.EmployeeName !== '(Unassigned)' ? (
                          r.EmployeeName
                        ) : (
                          <span className="text-[#7A6F6F]">Unclaimed</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">{r.Department}</td>
                      <td className="py-3 pr-3">{r.Type}</td>
                      <td className="py-3 pr-3 font-mono-tabular">
                        {r.ISOClause || <span className="text-[#7A6F6F]">—</span>}
                      </td>
                      <td className="py-3 pr-3">
                        {r.CompanyDocument || <span className="text-[#7A6F6F]">—</span>}
                      </td>
                      <td className="py-3 pr-3">
                        <StatusLabel status={status} />
                      </td>
                      <td className="py-3 pr-3 font-mono-tabular whitespace-nowrap">
                        {r.AdminDeadline ? (
                          <span className={overdue ? 'text-[#A32424] font-bold' : ''}>
                            {fmtDate(r.AdminDeadline)}
                          </span>
                        ) : (
                          <span className="text-[#7A6F6F]">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {links.length > 0 ? (
                          <a
                            href={safeUrl(links[0])}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[#6B1A25] font-medium hover:underline"
                          >
                            View{links.length > 1 ? ` (${links.length})` : ''}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-[#A32424] font-medium">Missing</span>
                        )}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          onClick={() => onViewCar(r.CARNo)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditCar(r.CARNo)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFlagCarNo(r.CARNo);
                            setFlagMessage('');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer"
                        >
                          Flag
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeadlineCarNo(r.CARNo);
                            setDeadlineDate(r.AdminDeadline || '');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer"
                        >
                          Deadline
                        </button>
                        {r.Status !== 'Closed' ? (
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ type: 'close', carNo: r.CARNo })}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-[#2F6D39] hover:bg-[#255A2D] text-white cursor-pointer"
                          >
                            Close
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmAction({ type: 'reopen', carNo: r.CARNo })}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-[#C9A227] hover:bg-[#A9861E] text-[#4A1219] cursor-pointer"
                          >
                            Reopen
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={exportingCar === r.CARNo}
                          onClick={() => handleExport(r.CARNo)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer disabled:opacity-50"
                        >
                          {exportingCar === r.CARNo ? '...' : 'Export'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Flag Modal */}
      {flagCarNo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2323]/55 p-4" role="dialog" aria-modal="true">
          <div className="bg-white border border-[#EAD9D4] rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[#4A1219] m-0">Flag record for attention</h3>
            <p className="text-xs text-[#7A6F6F] mt-1">
              Sends a notification to whoever is handling this record (or the whole department, if unclaimed).
            </p>
            <label className="block text-xs font-semibold text-[#4A1219] mt-4 mb-1">CAR No.</label>
            <input
              type="text"
              value={flagCarNo}
              disabled
              className="w-full rounded-lg border border-[#EAD9D4] bg-[#F8F4F0] px-3 py-2 text-sm text-[#7A6F6F]"
            />
            <label className="block text-xs font-semibold text-[#4A1219] mt-3 mb-1">
              Message <span className="text-[#A32424]">*</span>
            </label>
            <textarea
              rows={3}
              value={flagMessage}
              onChange={(e) => setFlagMessage(e.target.value)}
              placeholder="e.g. Please attach evidence for Step 2 approval."
              className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
            />
            <div className="flex justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setFlagCarNo(null)}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#EAD9D4] text-[#2B2323] hover:bg-[#F8F4F0] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={flagBusy}
                onClick={handleFlagSubmit}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
              >
                {flagBusy ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deadline Modal */}
      {deadlineCarNo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2323]/55 p-4" role="dialog" aria-modal="true">
          <div className="bg-white border border-[#EAD9D4] rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[#4A1219] m-0">Set deadline</h3>
            <p className="text-xs text-[#7A6F6F] mt-1">
              Whoever is handling this record (or the whole department, if unclaimed) will be notified.
            </p>
            <label className="block text-xs font-semibold text-[#4A1219] mt-4 mb-1">CAR No.</label>
            <input
              type="text"
              value={deadlineCarNo}
              disabled
              className="w-full rounded-lg border border-[#EAD9D4] bg-[#F8F4F0] px-3 py-2 text-sm text-[#7A6F6F]"
            />
            <label className="block text-xs font-semibold text-[#4A1219] mt-3 mb-1">
              Deadline Date <span className="text-[#A32424]">*</span>
            </label>
            <input
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
            />
            <div className="flex justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setDeadlineCarNo(null)}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#EAD9D4] text-[#2B2323] hover:bg-[#F8F4F0] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deadlineBusy}
                onClick={handleDeadlineSubmit}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
              >
                {deadlineBusy ? 'Saving...' : 'Save Deadline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close / Reopen Confirm */}
      <ConfirmModal
        open={Boolean(confirmAction)}
        title={confirmAction?.type === 'close' ? `Close ${confirmAction?.carNo}?` : `Reopen ${confirmAction?.carNo}?`}
        description={
          confirmAction?.type === 'close'
            ? `Mark ${confirmAction?.carNo} as Closed? Process Owners will no longer be able to edit it unless flagged.`
            : `Reopen ${confirmAction?.carNo}? It will move back to Open status.`
        }
        confirmLabel={confirmAction?.type === 'close' ? 'Mark as Closed' : 'Reopen Record'}
        confirmVariant={confirmAction?.type === 'close' ? 'green' : 'gold'}
        busy={confirmBusy}
        onConfirm={handleConfirmStatus}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
