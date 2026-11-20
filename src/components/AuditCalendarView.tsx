import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  correctiveActionsOf,
  fmtDate,
  followUpsOf,
  isRecordOverdue,
  normalizeInputDate,
} from '../lib/format';
import type {
  AuditSchedule,
  AuditScheduleStatus,
  AuditScheduleType,
  CarRecord,
} from '../lib/types';
import { ConfirmModal } from './ConfirmModal';
import { StatusLabel } from './StatusLabel';
import { useToast } from './Toast';

type CalendarEventKind = 'audit' | 'deadline' | 'followup' | 'target';
type EventFilterMode = 'all' | 'audits' | 'deadlines';

interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  kind: CalendarEventKind;
  title: string;
  subtitle: string;
  department: string;
  overdue?: boolean;
  closed?: boolean;
  schedule?: AuditSchedule;
  car?: CarRecord;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const AUDIT_TYPES: AuditScheduleType[] = [
  'Internal ISO Audit',
  'Department Audit',
  'Follow-Up Verification',
  'Surveillance Audit',
  'Management Review',
];

const AUDIT_STATUSES: AuditScheduleStatus[] = ['Scheduled', 'Completed', 'Cancelled'];

function toYmd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dayDiffFromToday(ymd: string, todayYmd: string): number {
  const a = parseYmd(ymd).getTime();
  const b = parseYmd(todayYmd).getTime();
  return Math.round((a - b) / 86400000);
}

function formatMonthTitle(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function eventChipStyle(ev: CalendarEvent): {
  box: string;
  tag: string;
} {
  if (ev.kind === 'audit') {
    if (ev.schedule?.Status === 'Completed') {
      return {
        box: 'bg-[#E9F4EC] border-[#C5E0CB] text-[#255A2D]',
        tag: 'Done',
      };
    }
    if (ev.schedule?.Status === 'Cancelled') {
      return {
        box: 'bg-[#F8F4F0] border-[#EAD9D4] text-[#7A6F6F] line-through',
        tag: 'Cancelled',
      };
    }
    return {
      box: 'bg-[#F9EAEA] border-[#E8C5C8] text-[#6B1A25]',
      tag: 'Audit',
    };
  }

  if (ev.kind === 'deadline') {
    if (ev.closed) {
      return {
        box: 'bg-[#E9F4EC] border-[#C5E0CB] text-[#255A2D]',
        tag: 'Closed',
      };
    }
    if (ev.overdue) {
      return {
        box: 'bg-[#FDECEC] border-[#F4C2C2] text-[#A32424]',
        tag: 'Overdue',
      };
    }
    return {
      box: 'bg-[#FBF0D6] border-[#E7CF86] text-[#6E5200]',
      tag: 'Due',
    };
  }

  if (ev.kind === 'followup') {
    return {
      box: 'bg-[#E9F4EC] border-[#C5E0CB] text-[#255A2D]',
      tag: 'Verify',
    };
  }

  return {
    box: 'bg-[#F4ECE9] border-[#EAD9D4] text-[#4A1219]',
    tag: 'Target',
  };
}

export function AuditCalendarView({
  records,
  schedules,
  departments,
  loading,
  error,
  onReload,
  onSchedulesChange,
  onViewCar,
  onEditCar,
  onSetDeadline,
}: {
  records: CarRecord[];
  schedules: AuditSchedule[];
  departments: string[];
  loading: boolean;
  error: string;
  onReload: () => void;
  onSchedulesChange: React.Dispatch<React.SetStateAction<AuditSchedule[]>>;
  onViewCar: (carNo: string) => void;
  onEditCar: (carNo: string) => void;
  onSetDeadline: (carNo: string, currentDeadline: string) => void;
}) {
  const { showToast } = useToast();

  const todayYmd = useMemo(() => toYmd(new Date()), []);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(() => toYmd(new Date()));

  const [filterMode, setFilterMode] = useState<EventFilterMode>('all');
  const [filterDept, setFilterDept] = useState('');
  const [includeTargets, setIncludeTargets] = useState(true);

  // Create / Edit Audit Schedule Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<AuditSchedule | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<AuditScheduleType>('Internal ISO Audit');
  const [formDate, setFormDate] = useState('');
  const [formTimeWindow, setFormTimeWindow] = useState('');
  const [formDept, setFormDept] = useState('All Services');
  const [formLeadAuditor, setFormLeadAuditor] = useState('');
  const [formStatus, setFormStatus] = useState<AuditScheduleStatus>('Scheduled');
  const [formNotes, setFormNotes] = useState('');
  const [formBusy, setFormBusy] = useState(false);

  // Delete Schedule Confirmation
  const [deleteTarget, setDeleteTarget] = useState<AuditSchedule | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const deptOptions = useMemo(() => {
    const set = new Set<string>(departments);
    records.forEach((r) => {
      if (r.Department) set.add(r.Department);
    });
    schedules.forEach((s) => {
      if (s.Department && s.Department !== 'All Services') set.add(s.Department);
    });
    return Array.from(set).sort();
  }, [departments, records, schedules]);

  // Build unified calendar events from scheduled audits + CAR dates
  const allEvents = useMemo<CalendarEvent[]>(() => {
    const events: CalendarEvent[] = [];

    for (const s of schedules) {
      const ymd = normalizeInputDate(s.AuditDate);
      if (!ymd) continue;
      events.push({
        id: `aud-${s.ScheduleID}`,
        date: ymd,
        kind: 'audit',
        title: s.Title,
        subtitle: [s.AuditType, s.TimeWindow, s.LeadAuditor ? `Lead: ${s.LeadAuditor}` : '']
          .filter(Boolean)
          .join(' · '),
        department: s.Department || 'All Services',
        overdue: s.Status === 'Scheduled' && ymd < todayYmd,
        closed: s.Status === 'Completed',
        schedule: s,
      });
    }

    for (const r of records) {
      const deadlineYmd = normalizeInputDate(r.AdminDeadline);
      if (deadlineYmd) {
        events.push({
          id: `car-deadline-${r.CARNo}`,
          date: deadlineYmd,
          kind: 'deadline',
          title: `${r.CARNo} Response Deadline`,
          subtitle: [
            r.Type || 'CAR',
            r.EmployeeName && r.EmployeeName !== '(Unassigned)' ? r.EmployeeName : '',
            r.ISOClause ? `ISO ${r.ISOClause}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          department: r.Department || 'Unassigned',
          overdue: isRecordOverdue(deadlineYmd, r.Status),
          closed: r.Status === 'Closed',
          car: r,
        });
      }

      if (includeTargets) {
        const followUps = followUpsOf(r);
        followUps.forEach((fu, idx) => {
          const fuYmd = normalizeInputDate(fu.FollowUpDate);
          if (!fuYmd) return;
          events.push({
            id: `car-fu-${r.CARNo}-${idx}`,
            date: fuYmd,
            kind: 'followup',
            title: `${r.CARNo} Verification Follow-Up`,
            subtitle: [
              fu.VerifiedBy ? `Verified by ${fu.VerifiedBy}` : 'Verification audit',
              fu.ResultOfVerification || '',
            ]
              .filter(Boolean)
              .join(' · '),
            department: r.Department || 'Unassigned',
            closed: r.Status === 'Closed',
            car: r,
          });
        });

        const actions = correctiveActionsOf(r);
        actions.forEach((ca, idx) => {
          const tYmd = normalizeInputDate(ca.ActionOwnerTargetDate);
          if (!tYmd) return;
          events.push({
            id: `car-target-${r.CARNo}-${idx}`,
            date: tYmd,
            kind: 'target',
            title: `${r.CARNo} Corrective Action Target`,
            subtitle: ca.CorrectiveAction ? ca.CorrectiveAction.slice(0, 75) : 'Action target date',
            department: r.Department || 'Unassigned',
            overdue: r.Status !== 'Closed' && !ca.DateImplemented && tYmd < todayYmd,
            closed: Boolean(ca.DateImplemented) || r.Status === 'Closed',
            car: r,
          });
        });
      }
    }

    return events;
  }, [schedules, records, includeTargets, todayYmd]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev) => {
      if (filterMode === 'audits' && ev.kind !== 'audit') return false;
      if (filterMode === 'deadlines' && ev.kind !== 'deadline') return false;
      if (filterDept && ev.department !== filterDept && ev.department !== 'All Services') return false;
      return true;
    });
  }, [allEvents, filterMode, filterDept]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const kindRank: Record<CalendarEventKind, number> = {
      deadline: 0,
      audit: 1,
      followup: 2,
      target: 3,
    };
    for (const ev of filteredEvents) {
      const list = map.get(ev.date) || [];
      list.push(ev);
      map.set(ev.date, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        if (Boolean(a.overdue) !== Boolean(b.overdue)) return a.overdue ? -1 : 1;
        return kindRank[a.kind] - kindRank[b.kind] || a.title.localeCompare(b.title);
      });
    }
    return map;
  }, [filteredEvents]);

  // Summary metrics
  const metrics = useMemo(() => {
    let overdueDeadlines = 0;
    let dueWithin7Days = 0;
    let upcomingAudits = 0;
    let followUpsOrMonth = 0;

    for (const r of records) {
      const d = normalizeInputDate(r.AdminDeadline);
      if (!d || r.Status === 'Closed') continue;
      const diff = dayDiffFromToday(d, todayYmd);
      if (diff < 0) overdueDeadlines += 1;
      else if (diff <= 7) dueWithin7Days += 1;
    }

    const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    for (const s of schedules) {
      const d = normalizeInputDate(s.AuditDate);
      if (!d) continue;
      if (s.Status === 'Scheduled' && d >= todayYmd) upcomingAudits += 1;
      if (d.startsWith(monthPrefix) && s.Status !== 'Cancelled') followUpsOrMonth += 1;
    }

    return { overdueDeadlines, dueWithin7Days, upcomingAudits, followUpsOrMonth };
  }, [records, schedules, todayYmd, viewYear, viewMonth]);

  // Build 42-day (6 week) calendar grid for (viewYear, viewMonth)
  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
    const cells: Array<{ ymd: string; day: number; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      cells.push({
        ymd: toYmd(d),
        day: d.getDate(),
        inMonth: d.getMonth() === viewMonth && d.getFullYear() === viewYear,
      });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const selectedDayEvents = useMemo(() => {
    return eventsByDate.get(selectedDate) || [];
  }, [eventsByDate, selectedDate]);

  // Upcoming & Overdue agenda list (audits + open CAR deadlines)
  const priorityQueue = useMemo(() => {
    const overdue = filteredEvents
      .filter((ev) => ev.kind === 'deadline' && ev.overdue)
      .sort((a, b) => a.date.localeCompare(b.date));

    const upcoming = filteredEvents
      .filter((ev) => {
        if (ev.date < todayYmd) return false;
        if (ev.kind === 'audit') return ev.schedule?.Status === 'Scheduled';
        if (ev.kind === 'deadline') return !ev.closed;
        return ev.kind === 'followup';
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
      .slice(0, 12);

    return { overdue, upcoming };
  }, [filteredEvents, todayYmd]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(toYmd(now));
  };

  const jumpToDate = (ymd: string) => {
    const d = parseYmd(ymd);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(ymd);
  };

  const openCreateModal = (presetDate?: string) => {
    setEditingSchedule(null);
    setFormTitle('');
    setFormType('Internal ISO Audit');
    setFormDate(presetDate || selectedDate || todayYmd);
    setFormTimeWindow('09:00 AM - 11:00 AM');
    setFormDept(filterDept || 'All Services');
    setFormLeadAuditor('');
    setFormStatus('Scheduled');
    setFormNotes('');
    setModalOpen(true);
  };

  const openEditModal = (sched: AuditSchedule) => {
    setEditingSchedule(sched);
    setFormTitle(sched.Title);
    setFormType(sched.AuditType);
    setFormDate(normalizeInputDate(sched.AuditDate));
    setFormTimeWindow(sched.TimeWindow || '');
    setFormDept(sched.Department || 'All Services');
    setFormLeadAuditor(sched.LeadAuditor || '');
    setFormStatus(sched.Status || 'Scheduled');
    setFormNotes(sched.Notes || '');
    setModalOpen(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('Please enter an audit title.', 'error');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      showToast('Please choose a valid audit date.', 'error');
      return;
    }
    setFormBusy(true);
    try {
      if (editingSchedule) {
        const res = await api.updateAuditSchedule(editingSchedule.ScheduleID, {
          Title: formTitle.trim(),
          AuditType: formType,
          AuditDate: formDate,
          TimeWindow: formTimeWindow.trim(),
          Department: formDept || 'All Services',
          LeadAuditor: formLeadAuditor.trim(),
          Status: formStatus,
          Notes: formNotes.trim(),
        });
        if (!res.ok || !res.schedule) {
          showToast(res.error || 'Could not update audit schedule.', 'error');
          return;
        }
        onSchedulesChange((prev) =>
          prev
            .map((s) => (s.ScheduleID === editingSchedule.ScheduleID ? res.schedule! : s))
            .sort((a, b) => a.AuditDate.localeCompare(b.AuditDate))
        );
        showToast('Audit schedule updated.', 'success');
      } else {
        const res = await api.createAuditSchedule({
          Title: formTitle.trim(),
          AuditType: formType,
          AuditDate: formDate,
          TimeWindow: formTimeWindow.trim(),
          Department: formDept || 'All Services',
          LeadAuditor: formLeadAuditor.trim(),
          Notes: formNotes.trim(),
        });
        if (!res.ok || !res.schedule) {
          showToast(res.error || 'Could not schedule audit.', 'error');
          return;
        }
        onSchedulesChange((prev) =>
          [...prev, res.schedule!].sort((a, b) => a.AuditDate.localeCompare(b.AuditDate))
        );
        showToast('Audit added to calendar.', 'success');
      }
      jumpToDate(formDate);
      setModalOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save schedule.', 'error');
    } finally {
      setFormBusy(false);
    }
  };

  const handleToggleScheduleStatus = async (sched: AuditSchedule, nextStatus: AuditScheduleStatus) => {
    try {
      const res = await api.updateAuditSchedule(sched.ScheduleID, { Status: nextStatus });
      if (!res.ok || !res.schedule) {
        showToast(res.error || 'Could not update schedule status.', 'error');
        return;
      }
      onSchedulesChange((prev) =>
        prev.map((s) => (s.ScheduleID === sched.ScheduleID ? res.schedule! : s))
      );
      showToast(`Audit marked as ${nextStatus}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update status.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await api.deleteAuditSchedule(deleteTarget.ScheduleID);
      if (!res.ok) {
        showToast(res.error || 'Could not delete schedule.', 'error');
        return;
      }
      onSchedulesChange((prev) => prev.filter((s) => s.ScheduleID !== deleteTarget.ScheduleID));
      showToast('Scheduled audit removed.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top 4 Summary Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 tabular-nums">
        <div className="bg-white border border-[#EAD9D4] border-t-2 border-t-[#A32424] rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">
            Overdue CAR Deadlines
          </div>
          <div
            className={`text-2xl font-bold font-mono-tabular mt-1 ${
              metrics.overdueDeadlines > 0 ? 'text-[#A32424]' : 'text-[#4A1219]'
            }`}
          >
            {metrics.overdueDeadlines}
          </div>
        </div>
        <div className="bg-white border border-[#EAD9D4] border-t-2 border-t-[#C9A227] rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">
            Deadlines Next 7 Days
          </div>
          <div className="text-2xl font-bold font-mono-tabular text-[#8A6D00] mt-1">
            {metrics.dueWithin7Days}
          </div>
        </div>
        <div className="bg-white border border-[#EAD9D4] border-t-2 border-t-[#6B1A25] rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">
            Upcoming Audits
          </div>
          <div className="text-2xl font-bold font-mono-tabular text-[#4A1219] mt-1">
            {metrics.upcomingAudits}
          </div>
        </div>
        <div className="bg-white border border-[#EAD9D4] border-t-2 border-t-[#2F6D39] rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">
            Audits This Month
          </div>
          <div className="text-2xl font-bold font-mono-tabular text-[#2F6D39] mt-1">
            {metrics.followUpsOrMonth}
          </div>
        </div>
      </div>

      {/* Main Calendar + Day Agenda Workspace */}
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        {/* Header & Action Toolbar */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-[#EAD9D4]">
          <div>
            <h1 className="text-2xl font-bold text-[#4A1219] m-0">Audit &amp; CAR Deadline Calendar</h1>
            <p className="text-xs text-[#7A6F6F] mt-1">
              Track upcoming internal audits, CAR response deadlines, and verification follow-ups in one schedule.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Segmented Filter */}
            <div
              className="inline-flex items-center p-1 rounded-lg bg-[#F8F4F0] border border-[#EAD9D4]"
              role="group"
              aria-label="Filter calendar events"
            >
              {(
                [
                  ['all', 'All Events'],
                  ['audits', 'Audits Only'],
                  ['deadlines', 'CAR Deadlines'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilterMode(mode)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    filterMode === mode
                      ? 'bg-white text-[#4A1219] shadow-xs'
                      : 'text-[#7A6F6F] hover:text-[#4A1219]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter calendar by service"
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="rounded-lg border border-[#EAD9D4] px-3 py-2 text-xs font-medium bg-white text-[#2B2323] focus:outline-none focus:border-[#6B1A25] max-w-[220px]"
            >
              <option value="">All services</option>
              {deptOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A1219] px-2.5 py-2 rounded-lg border border-[#EAD9D4] bg-white cursor-pointer select-none whitespace-nowrap shrink-0">
              <input
                type="checkbox"
                checked={includeTargets}
                onChange={(e) => setIncludeTargets(e.target.checked)}
                className="accent-[#6B1A25] rounded cursor-pointer"
              />
              Follow-ups &amp; Targets
            </label>

            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white font-semibold text-sm px-4 py-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <CalendarPlus className="h-4 w-4" />
              Schedule Audit
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-14 text-center text-sm text-[#7A6F6F]">Loading calendar schedule...</div>
        ) : error ? (
          <div className="py-12 text-center space-y-3">
            <div className="text-sm text-[#A32424]">{error}</div>
            <button
              type="button"
              onClick={onReload}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5 items-start">
            {/* Left 8 Columns: Monthly Grid */}
            <div className="lg:col-span-8 space-y-3">
              {/* Month Navigation Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={goPrevMonth}
                    className="p-2 rounded-lg border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] bg-white cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h2 className="text-lg font-bold text-[#4A1219] m-0 min-w-[170px] text-center">
                    {formatMonthTitle(viewYear, viewMonth)}
                  </h2>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={goNextMonth}
                    className="p-2 rounded-lg border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] bg-white cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToday}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] bg-white cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Today
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="border border-[#EAD9D4] rounded-xl overflow-hidden bg-white">
                {/* Weekday Header */}
                <div className="grid grid-cols-7 bg-[#F8F4F0] border-b border-[#EAD9D4]">
                  {WEEKDAYS.map((wd) => (
                    <div
                      key={wd}
                      className="py-2 px-2 text-center text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]"
                    >
                      {wd}
                    </div>
                  ))}
                </div>

                {/* 6-Week Date Cells */}
                <div className="grid grid-cols-7 divide-x divide-y divide-[#F0E4DF]">
                  {calendarCells.map((cell) => {
                    const dayEvents = eventsByDate.get(cell.ymd) || [];
                    const isToday = cell.ymd === todayYmd;
                    const isSelected = cell.ymd === selectedDate;
                    const visibleEvents = dayEvents.slice(0, 3);
                    const overflowCount = dayEvents.length - visibleEvents.length;

                    return (
                      <div
                        key={cell.ymd}
                        onClick={() => setSelectedDate(cell.ymd)}
                        role="button"
                        tabIndex={0}
                        aria-label={`${fmtDate(cell.ymd)}, ${dayEvents.length} scheduled item${
                          dayEvents.length === 1 ? '' : 's'
                        }`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedDate(cell.ymd);
                          }
                        }}
                        className={`group relative min-h-[104px] p-1.5 sm:p-2 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#6B1A25] ${
                          isSelected
                            ? 'bg-[#FCF6F3] ring-1 ring-inset ring-[#6B1A25]'
                            : cell.inMonth
                            ? 'bg-white hover:bg-[#FCF8F6]'
                            : 'bg-[#FBF8F6] text-[#A29595] hover:bg-[#F8F4F0]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 text-xs font-mono-tabular rounded-md ${
                              isToday
                                ? 'bg-[#6B1A25] text-white font-bold'
                                : isSelected
                                ? 'text-[#6B1A25] font-bold'
                                : cell.inMonth
                                ? 'text-[#2B2323] font-semibold'
                                : 'text-[#A29595]'
                            }`}
                          >
                            {cell.day}
                          </span>

                          <button
                            type="button"
                            title={`Schedule audit on ${cell.ymd}`}
                            aria-label={`Schedule audit on ${cell.ymd}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openCreateModal(cell.ymd);
                            }}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-[#7A6F6F] hover:text-[#6B1A25] hover:bg-[#F4ECE9] transition-opacity cursor-pointer"
                          >
                            <CalendarPlus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="space-y-1">
                          {visibleEvents.map((ev) => {
                            const style = eventChipStyle(ev);
                            return (
                              <div
                                key={ev.id}
                                title={`${style.tag}: ${ev.title} (${ev.department})`}
                                className={`px-1.5 py-0.5 rounded border text-[11px] leading-tight truncate ${style.box}`}
                              >
                                <span className="font-bold mr-1">{style.tag}</span>
                                <span>{ev.car ? ev.car.CARNo : ev.title}</span>
                              </div>
                            );
                          })}
                          {overflowCount > 0 && (
                            <div className="text-[11px] font-semibold text-[#6B1A25] px-1">
                              +{overflowCount} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Clean Legend */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#7A6F6F] pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-[#F9EAEA] border border-[#E8C5C8]" />
                  Scheduled Audit
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-[#FBF0D6] border border-[#E7CF86]" />
                  CAR Deadline (Open)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-[#FDECEC] border border-[#F4C2C2]" />
                  Overdue Deadline
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-[#E9F4EC] border border-[#C5E0CB]" />
                  Completed / Follow-Up
                </span>
                {includeTargets && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-xs bg-[#F4ECE9] border border-[#EAD9D4]" />
                    Action Target Date
                  </span>
                )}
              </div>
            </div>

            {/* Right 4 Columns: Selected Day Detail + Upcoming Queue */}
            <div className="lg:col-span-4 space-y-5 lg:border-l lg:border-[#EAD9D4] lg:pl-6">
              {/* Selected Date Agenda */}
              <div>
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#EAD9D4]">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">
                      Selected Date
                    </div>
                    <h3 className="text-lg font-bold text-[#4A1219] m-0">
                      {fmtDate(selectedDate)}
                      {selectedDate === todayYmd && (
                        <span className="ml-2 text-xs font-sans font-semibold text-[#6B1A25]">
                          · Today
                        </span>
                      )}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => openCreateModal(selectedDate)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] bg-white cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Add Audit
                  </button>
                </div>

                {selectedDayEvents.length === 0 ? (
                  <div className="py-7 text-center border-b border-[#F0E4DF]">
                    <CalendarDays className="h-7 w-7 text-[#C9A227] mx-auto mb-2" />
                    <p className="text-xs text-[#7A6F6F] m-0">
                      No audits or CAR deadlines on {fmtDate(selectedDate)}.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#F0E4DF]">
                    {selectedDayEvents.map((ev) => {
                      const style = eventChipStyle(ev);
                      const sched = ev.schedule;
                      const car = ev.car;

                      return (
                        <div key={ev.id} className="py-3.5 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-[11px] font-semibold">
                                <span className={`px-1.5 py-0.5 rounded border ${style.box}`}>
                                  {style.tag}
                                </span>
                                <span className="text-[#7A6F6F] truncate">{ev.department}</span>
                              </div>
                              <div className="text-sm font-semibold text-[#2B2323] mt-1 break-words">
                                {ev.title}
                              </div>
                            </div>
                            {car && (
                              <StatusLabel
                                status={car.AdminFlag === 'Needs Attention' ? 'Needs Attention' : car.Status}
                              />
                            )}
                          </div>

                          {ev.subtitle && (
                            <p className="text-xs text-[#7A6F6F] m-0 leading-relaxed">{ev.subtitle}</p>
                          )}

                          {sched?.Notes && (
                            <p className="text-xs text-[#4A1219] bg-[#F8F4F0] rounded-md px-2.5 py-1.5 m-0">
                              {sched.Notes}
                            </p>
                          )}

                          {/* Action Buttons */}
                          {car && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <button
                                type="button"
                                onClick={() => onViewCar(car.CARNo)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer"
                              >
                                <Eye className="h-3 w-3" />
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => onEditCar(car.CARNo)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer"
                              >
                                <Edit3 className="h-3 w-3" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => onSetDeadline(car.CARNo, car.AdminDeadline || '')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer"
                              >
                                <CalendarClock className="h-3 w-3" />
                                Deadline
                              </button>
                            </div>
                          )}

                          {sched && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {sched.Status !== 'Completed' ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleScheduleStatus(sched, 'Completed')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-[#2F6D39] hover:bg-[#255A2D] text-white cursor-pointer"
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Complete
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleToggleScheduleStatus(sched, 'Scheduled')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer"
                                >
                                  Reopen
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openEditModal(sched)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-[#EAD9D4] hover:border-[#6B1A25] text-[#4A1219] cursor-pointer"
                              >
                                <Edit3 className="h-3 w-3" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(sched)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-[#F4C2C2] text-[#A32424] hover:bg-[#FDECEC] cursor-pointer"
                              >
                                <Trash2 className="h-3 w-3" />
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Overdue Alert Queue (if any) */}
              {priorityQueue.overdue.length > 0 && (
                <div className="pt-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#A32424] pb-2 border-b border-[#F4C2C2]">
                    Overdue CAR Responses ({priorityQueue.overdue.length})
                  </div>
                  <div className="divide-y divide-[#F0E4DF] max-h-56 overflow-y-auto">
                    {priorityQueue.overdue.map((ev) => {
                      const daysLate = Math.abs(dayDiffFromToday(ev.date, todayYmd));
                      return (
                        <button
                          key={`ov-${ev.id}`}
                          type="button"
                          onClick={() => jumpToDate(ev.date)}
                          className="w-full py-2.5 text-left hover:bg-[#FCF6F3] transition-colors cursor-pointer flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#2B2323] truncate">
                              {ev.car?.CARNo || ev.title} · {ev.department}
                            </div>
                            <div className="text-[11px] text-[#7A6F6F] font-mono-tabular">
                              Due {fmtDate(ev.date)}
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-[#A32424] font-mono-tabular whitespace-nowrap shrink-0">
                            {daysLate}d late
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Upcoming Audits & Deadlines Queue */}
              <div className="pt-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F] pb-2 border-b border-[#EAD9D4]">
                  Upcoming Audits &amp; Deadlines
                </div>
                {priorityQueue.upcoming.length === 0 ? (
                  <p className="text-xs text-[#7A6F6F] py-4 m-0">
                    No upcoming audits or open CAR deadlines scheduled.
                  </p>
                ) : (
                  <div className="divide-y divide-[#F0E4DF] max-h-72 overflow-y-auto">
                    {priorityQueue.upcoming.map((ev) => {
                      const diff = dayDiffFromToday(ev.date, todayYmd);
                      const style = eventChipStyle(ev);
                      return (
                        <button
                          key={`up-${ev.id}`}
                          type="button"
                          onClick={() => jumpToDate(ev.date)}
                          className="w-full py-2.5 text-left hover:bg-[#FCF6F3] transition-colors cursor-pointer flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${style.box}`}>
                                {style.tag}
                              </span>
                              <span className="text-xs font-semibold text-[#2B2323] truncate">
                                {ev.car ? ev.car.CARNo : ev.title}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#7A6F6F] truncate mt-0.5">
                              {ev.department}
                              {ev.schedule?.TimeWindow ? ` · ${ev.schedule.TimeWindow}` : ''}
                            </div>
                          </div>
                          <div className="text-right whitespace-nowrap shrink-0">
                            <div className="text-[11px] font-mono-tabular font-semibold text-[#4A1219]">
                              {fmtDate(ev.date)}
                            </div>
                            <div className="text-[10px] font-mono-tabular text-[#7A6F6F]">
                              {diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff}d`}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Audit Schedule Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2323]/55 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveSchedule}
            className="bg-white border border-[#EAD9D4] rounded-xl max-w-lg w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-[#4A1219] m-0">
                {editingSchedule ? 'Edit Scheduled Audit' : 'Schedule Upcoming Audit'}
              </h3>
            </div>
            <p className="text-xs text-[#7A6F6F] mt-1">
              Plan internal ISO audits, departmental checks, or follow-up verification sessions.
            </p>

            <div className="space-y-3.5 mt-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  Audit Title <span className="text-[#A32424]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Q4 ISO 9001:2015 Internal Audit — Registrar"
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#4A1219] mb-1">Audit Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as AuditScheduleType)}
                    className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
                  >
                    {AUDIT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                    Audit Date <span className="text-[#A32424]">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                    Service / Process Area
                  </label>
                  <select
                    value={formDept}
                    onChange={(e) => setFormDept(e.target.value)}
                    className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
                  >
                    <option value="All Services">All Services</option>
                    {deptOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                    Time Window
                  </label>
                  <div className="relative">
                    <Clock className="h-3.5 w-3.5 text-[#7A6F6F] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={formTimeWindow}
                      onChange={(e) => setFormTimeWindow(e.target.value)}
                      placeholder="e.g. 09:00 AM - 11:30 AM"
                      className="w-full rounded-lg border border-[#EAD9D4] pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                    Lead Auditor
                  </label>
                  <input
                    type="text"
                    value={formLeadAuditor}
                    onChange={(e) => setFormLeadAuditor(e.target.value)}
                    placeholder="e.g. Quality Assurance Team"
                    className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                  />
                </div>

                {editingSchedule && (
                  <div>
                    <label className="block text-xs font-semibold text-[#4A1219] mb-1">Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as AuditScheduleStatus)}
                      className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
                    >
                      {AUDIT_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A1219] mb-1">
                  Scope / Notes
                </label>
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="ISO clauses covered, checklist focus, or required process owners..."
                  className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-5 pt-4 border-t border-[#EAD9D4]">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#EAD9D4] text-[#2B2323] hover:bg-[#F8F4F0] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formBusy}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
              >
                {formBusy ? 'Saving...' : editingSchedule ? 'Save Changes' : 'Save Audit Date'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Delete Audit Schedule */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove scheduled audit?"
        description={
          deleteTarget
            ? `Remove "${deleteTarget.Title}" on ${fmtDate(deleteTarget.AuditDate)} from the audit calendar?`
            : ''
        }
        confirmLabel="Remove Audit"
        confirmVariant="danger"
        busy={deleteBusy}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
