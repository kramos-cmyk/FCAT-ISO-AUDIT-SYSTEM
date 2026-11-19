import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { evidenceLinksOf, fmtDate, fmtDateTime, isRecordOverdue, safeUrl } from '../lib/format';
import type { CarRecord, NotificationItem } from '../lib/types';
import { StatusLabel } from '../components/StatusLabel';
import { useToast } from '../components/Toast';

export function EmployeeDashboardPage({
  onViewCar,
  onEditCar,
}: {
  onViewCar: (carNo: string) => void;
  onEditCar: (carNo: string) => void;
}) {
  const { showToast } = useToast();
  const [records, setRecords] = useState<CarRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifLoading, setNotifLoading] = useState(true);
  const [exportingCar, setExportingCar] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCARs()
      .then((rows) => setRecords(rows || []))
      .catch((err) => showToast(err.message || 'Could not load department records.', 'error'))
      .finally(() => setLoading(false));

    api
      .getNotifications()
      .then((rows) => setNotifications(rows || []))
      .catch(() => {})
      .finally(() => setNotifLoading(false));
  }, [showToast]);

  const stats = useMemo(() => {
    const total = records.length;
    const open = records.filter((r) => r.Status === 'Open').length;
    const closed = records.filter((r) => r.Status === 'Closed').length;
    const flagged = records.filter((r) => r.AdminFlag === 'Needs Attention').length;
    const overdue = records.filter((r) => isRecordOverdue(r.AdminDeadline, r.Status)).length;

    const closedWithDates = records.filter((r) => r.Status === 'Closed' && r.CreatedAt && r.UpdatedAt);
    let avgDays = '—';
    if (closedWithDates.length > 0) {
      const sum = closedWithDates.reduce((acc, r) => {
        const diff = (new Date(r.UpdatedAt).getTime() - new Date(r.CreatedAt).getTime()) / 86400000;
        return acc + (Number.isFinite(diff) && diff >= 0 ? diff : 0);
      }, 0);
      avgDays = (sum / closedWithDates.length).toFixed(1);
    }

    return { total, open, closed, flagged, overdue, avgDays };
  }, [records]);

  const sortedRecords = useMemo(() => {
    return records.slice().sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime());
  }, [records]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.Read).length, [notifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.NotificationID === id ? { ...n, Read: true } : n)));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, Read: true })));
      showToast('All notifications marked as read.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update notifications.', 'error');
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
      {/* KPI Summary */}
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#4A1219] m-0">My Department&apos;s Compliance Records</h1>
        <p className="text-sm text-[#7A6F6F] mt-1">
          Findings raised by an Auditor for your department(s). Anyone in the same department can pick up an unclaimed record and work on it.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 tabular-nums">
          <StatTile label="Total" value={stats.total} />
          <StatTile label="Open" value={stats.open} tone="danger" />
          <StatTile label="Closed" value={stats.closed} tone="success" />
          <StatTile label="Needs Attention" value={stats.flagged} tone="warning" />
          <StatTile label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? 'danger' : 'neutral'} />
          <StatTile label="Avg. Days to Close" value={stats.avgDays} />
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="py-10 text-center text-sm text-[#7A6F6F]">Loading your records...</div>
          ) : sortedRecords.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#7A6F6F]">
              No records for your department(s) yet. New findings raised by an Auditor will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[900px] tabular-nums">
                <thead>
                  <tr className="border-b-2 border-[#EAD9D4] text-left text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">
                    <th className="py-3 pr-3">CAR No.</th>
                    <th className="py-3 pr-3">Type</th>
                    <th className="py-3 pr-3">Date Issued</th>
                    <th className="py-3 pr-3">Details</th>
                    <th className="py-3 pr-3">ISO Clause</th>
                    <th className="py-3 pr-3">Handled By</th>
                    <th className="py-3 pr-3">Status</th>
                    <th className="py-3 pr-3">Deadline</th>
                    <th className="py-3 pr-3">Evidence</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E4DF]">
                  {sortedRecords.map((r) => {
                    const flagged = r.AdminFlag === 'Needs Attention';
                    const canEdit = r.Status === 'Open' || flagged;
                    const overdue = isRecordOverdue(r.AdminDeadline, r.Status);
                    const links = evidenceLinksOf(r);
                    const previewText = r.Details || r.CorrectiveAction || '';

                    return (
                      <tr key={r.CARNo} className="hover:bg-[#FCF6F3] transition-colors">
                        <td className="py-3 pr-3 font-mono-tabular font-semibold text-[#4A1219] whitespace-nowrap">
                          {r.CARNo}
                        </td>
                        <td className="py-3 pr-3">{r.Type}</td>
                        <td className="py-3 pr-3 font-mono-tabular whitespace-nowrap">
                          {fmtDate(r.DateIssued) || r.DateIssued || '—'}
                        </td>
                        <td className="py-3 pr-3 max-w-[260px]">
                          <div className="truncate" title={previewText}>
                            {previewText || '—'}
                          </div>
                        </td>
                        <td className="py-3 pr-3 font-mono-tabular">{r.ISOClause || '—'}</td>
                        <td className="py-3 pr-3">
                          {r.EmployeeName && r.EmployeeName !== '(Unassigned)' ? (
                            r.EmployeeName
                          ) : (
                            <span className="text-[#7A6F6F]">Unclaimed</span>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusLabel status={flagged ? 'Needs Attention' : r.Status} />
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
                            '—'
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
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => onEditCar(r.CARNo)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer"
                            >
                              Edit
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
      </div>

      {/* Notifications from Auditors */}
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#6B1A25]" />
            <h2 className="text-lg font-bold text-[#4A1219] m-0">
              Notifications from Auditors{unreadCount > 0 ? ` (${unreadCount} unread)` : ''}
            </h2>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B1A25] hover:underline cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {notifLoading ? (
          <div className="text-sm text-[#7A6F6F]">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-[#7A6F6F]">No notifications yet.</div>
        ) : (
          <div className="divide-y divide-[#F0E4DF]">
            {notifications.slice(0, 12).map((n) => (
              <div
                key={n.NotificationID}
                className={`py-3 flex items-start justify-between gap-4 ${!n.Read ? 'bg-[#FCF6F3] -mx-2 px-2 rounded-lg' : ''}`}
              >
                <div className="min-w-0">
                  <div className={`text-sm ${!n.Read ? 'font-semibold text-[#2B2323]' : 'text-[#574D4D]'}`}>
                    {n.Message}
                  </div>
                  <div className="text-xs text-[#7A6F6F] mt-0.5 font-mono-tabular">
                    {fmtDateTime(n.CreatedAt)}
                    {n.RelatedCARNo ? (
                      <>
                        {' · '}
                        <button
                          type="button"
                          onClick={() => onViewCar(n.RelatedCARNo)}
                          className="text-[#6B1A25] font-semibold hover:underline cursor-pointer"
                        >
                          Open {n.RelatedCARNo}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                {!n.Read && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(n.NotificationID)}
                    className="shrink-0 text-xs font-semibold text-[#6B1A25] border border-[#EAD9D4] px-2.5 py-1 rounded-md hover:bg-white cursor-pointer"
                  >
                    Mark read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'danger' | 'success' | 'warning';
}) {
  const topBorder =
    tone === 'danger'
      ? 'border-t-[#9A2A1E]'
      : tone === 'success'
      ? 'border-t-[#2F6D39]'
      : tone === 'warning'
      ? 'border-t-[#C9A227]'
      : 'border-t-[#EAD9D4]';
  const valColor =
    tone === 'danger'
      ? 'text-[#9A2A1E]'
      : tone === 'success'
      ? 'text-[#2F6D39]'
      : tone === 'warning'
      ? 'text-[#8A6D00]'
      : 'text-[#4A1219]';

  return (
    <div className={`border border-[#EAD9D4] border-t-2 ${topBorder} rounded-lg p-3.5 bg-white`}>
      <div className={`text-2xl font-extrabold font-mono-tabular ${valColor}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-[#7A6F6F] mt-1">{label}</div>
    </div>
  );
}
