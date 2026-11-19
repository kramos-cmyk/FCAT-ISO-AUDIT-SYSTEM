import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { isRecordOverdue } from '../lib/format';
import type { CarRecord } from '../lib/types';
import { useToast } from '../components/Toast';

export function OverviewPage() {
  const { showToast } = useToast();
  const [records, setRecords] = useState<CarRecord[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [deptFilter, setDeptFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listCARs(), api.getDepartments().catch(() => [])])
      .then(([cars, depts]) => {
        setRecords(cars || []);
        setDepartments(depts || []);
      })
      .catch((err) => showToast(err.message || 'Could not load overview data.', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const kpis = useMemo(() => {
    const total = records.length;
    const closed = records.filter((r) => r.Status === 'Closed').length;
    const flagged = records.filter((r) => r.AdminFlag === 'Needs Attention').length;
    const open = records.filter((r) => r.Status === 'Open' && r.AdminFlag !== 'Needs Attention').length;
    const closureRate = total ? Math.round((closed / total) * 100) : 0;
    const overdue = records.filter((r) => isRecordOverdue(r.AdminDeadline, r.Status)).length;

    const closedWithDates = records.filter((r) => r.Status === 'Closed' && r.CreatedAt && r.UpdatedAt);
    let avgDays = '—';
    if (closedWithDates.length > 0) {
      const totalDays = closedWithDates.reduce((sum, r) => {
        const days = (new Date(r.UpdatedAt).getTime() - new Date(r.CreatedAt).getTime()) / 86400000;
        return sum + (Number.isFinite(days) && days >= 0 ? days : 0);
      }, 0);
      avgDays = (totalDays / closedWithDates.length).toFixed(1);
    }

    const now = new Date();
    const newThisMonth = records.filter((r) => {
      const d = new Date(r.CreatedAt);
      return !Number.isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    return [
      { label: 'Total Records', value: total, tone: 'neutral' as const },
      { label: 'Open', value: open, tone: 'danger' as const },
      { label: 'Needs Attention', value: flagged, tone: 'warning' as const },
      { label: 'Overdue', value: overdue, tone: overdue > 0 ? ('danger' as const) : ('neutral' as const) },
      { label: 'Closed', value: closed, tone: 'success' as const },
      { label: 'Closure Rate', value: `${closureRate}%`, tone: 'neutral' as const },
      { label: 'Avg. Days to Close', value: avgDays, tone: 'neutral' as const },
      { label: 'New This Month', value: newThisMonth, tone: 'neutral' as const },
    ];
  }, [records]);

  const allDeptNames = useMemo(() => {
    return Array.from(new Set([...departments, ...records.map((r) => r.Department).filter(Boolean)])).sort();
  }, [departments, records]);

  const deptRows = useMemo(() => {
    return allDeptNames
      .filter((d) => !deptFilter || d === deptFilter)
      .map((dept) => {
        const rows = records.filter((r) => r.Department === dept);
        const total = rows.length;
        const closed = rows.filter((r) => r.Status === 'Closed').length;
        const flagged = rows.filter((r) => r.AdminFlag === 'Needs Attention').length;
        const open = rows.filter((r) => r.Status === 'Open' && r.AdminFlag !== 'Needs Attention').length;
        const overdue = rows.filter((r) => isRecordOverdue(r.AdminDeadline, r.Status)).length;
        const closureRate = total ? Math.round((closed / total) * 100) : 0;
        return { dept, total, open, flagged, overdue, closed, closureRate };
      });
  }, [allDeptNames, records, deptFilter]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#4A1219] m-0">Overview</h1>
        {loading ? (
          <div className="py-8 text-sm text-[#7A6F6F]">Loading overview metrics...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-4 tabular-nums">
            {kpis.map((k) => (
              <div
                key={k.label}
                className={`border border-[#EAD9D4] border-t-2 rounded-lg p-4 bg-white ${
                  k.tone === 'danger'
                    ? 'border-t-[#9A2A1E]'
                    : k.tone === 'success'
                    ? 'border-t-[#2F6D39]'
                    : k.tone === 'warning'
                    ? 'border-t-[#C9A227]'
                    : 'border-t-[#EAD9D4]'
                }`}
              >
                <div
                  className={`text-2xl font-extrabold font-mono-tabular ${
                    k.tone === 'danger'
                      ? 'text-[#9A2A1E]'
                      : k.tone === 'success'
                      ? 'text-[#2F6D39]'
                      : k.tone === 'warning'
                      ? 'text-[#8A6D00]'
                      : 'text-[#4A1219]'
                  }`}
                >
                  {k.value}
                </div>
                <div className="text-[11px] uppercase tracking-wider text-[#7A6F6F] mt-1">{k.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-[#4A1219] m-0">By Department</h2>
          <select
            aria-label="Filter department breakdown"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
          >
            <option value="">All departments</option>
            {allDeptNames.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-8 text-sm text-[#7A6F6F]">Loading department breakdown...</div>
        ) : deptRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#7A6F6F]">No departments found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[640px] tabular-nums">
              <thead>
                <tr className="border-b-2 border-[#EAD9D4] text-left text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">
                  <th className="py-3 pr-3">Department</th>
                  <th className="py-3 pr-3">Total</th>
                  <th className="py-3 pr-3">Open</th>
                  <th className="py-3 pr-3">Needs Attention</th>
                  <th className="py-3 pr-3">Overdue</th>
                  <th className="py-3 pr-3">Closed</th>
                  <th className="py-3">Closure Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E4DF]">
                {deptRows.map((row) => (
                  <tr key={row.dept} className="hover:bg-[#FCF6F3]">
                    <td className="py-2.5 pr-3 font-medium">{row.dept}</td>
                    <td className="py-2.5 pr-3 font-mono-tabular">{row.total}</td>
                    <td className="py-2.5 pr-3 font-mono-tabular">{row.open}</td>
                    <td className="py-2.5 pr-3 font-mono-tabular">
                      {row.flagged > 0 ? (
                        <span className="text-[#8A6D00] font-bold">{row.flagged}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="py-2.5 pr-3 font-mono-tabular">
                      {row.overdue > 0 ? (
                        <span className="text-[#A32424] font-bold">{row.overdue}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="py-2.5 pr-3 font-mono-tabular">{row.closed}</td>
                    <td className="py-2.5 font-mono-tabular">{row.closureRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
