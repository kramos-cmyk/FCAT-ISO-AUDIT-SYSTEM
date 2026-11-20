import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, History, Plus, RefreshCw, Search } from 'lucide-react';
import { api } from '../lib/api';
import { evidenceLinksOf, fmtDate, fmtDateTime, isRecordOverdue, normalizeInputDate, roleLabel, safeUrl } from '../lib/format';
import type { AuditLogItem, AuditSchedule, CarRecord } from '../lib/types';
import { AuditCalendarView } from '../components/AuditCalendarView';
import { ConfirmModal } from '../components/ConfirmModal';
import { StatusLabel } from '../components/StatusLabel';
import { useToast } from '../components/Toast';

type DashboardTab = 'submissions' | 'calendar' | 'audit-trail';
type AuditCategory = 'all' | 'auth' | 'submissions' | 'status' | 'users' | 'system';

interface ActionMeta {
  label: string;
  category: Exclude<AuditCategory, 'all'>;
  categoryLabel: string;
  badgeClass: string;
}

function describeAuditAction(action: string): ActionMeta {
  const code = String(action || '').trim().toUpperCase();
  switch (code) {
    case 'LOGIN':
      return {
        label: 'User Login',
        category: 'auth',
        categoryLabel: 'Logins & Security',
        badgeClass: 'bg-[#F4ECE9] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'LOGOUT':
      return {
        label: 'User Logout',
        category: 'auth',
        categoryLabel: 'Logins & Security',
        badgeClass: 'bg-[#F8F4F0] text-[#7A6F6F] border-[#EAD9D4]',
      };
    case 'DPO_CONFIRMED':
      return {
        label: 'DPO Notice Confirmed',
        category: 'auth',
        categoryLabel: 'Logins & Security',
        badgeClass: 'bg-[#E9F4EC] text-[#255A2D] border-[#C5E0CB]',
      };
    case 'CHANGE_PASSWORD':
      return {
        label: 'Password Changed',
        category: 'auth',
        categoryLabel: 'Logins & Security',
        badgeClass: 'bg-[#FBF0D6] text-[#6E5200] border-[#E7CF86]',
      };
    case 'SUBMIT_CAR':
      return {
        label: 'Form Submitted (New CAR)',
        category: 'submissions',
        categoryLabel: 'Submissions & Edits',
        badgeClass: 'bg-[#F9EAEA] text-[#6B1A25] border-[#E8C5C8]',
      };
    case 'UPDATE_CAR':
      return {
        label: 'CAR Form Updated',
        category: 'submissions',
        categoryLabel: 'Submissions & Edits',
        badgeClass: 'bg-[#F4ECE9] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'ADD_FOLLOWUP':
      return {
        label: 'Verification Follow-Up Added',
        category: 'submissions',
        categoryLabel: 'Submissions & Edits',
        badgeClass: 'bg-[#F4ECE9] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'ADD_COMMENT':
      return {
        label: 'CAR Comment Posted',
        category: 'submissions',
        categoryLabel: 'Submissions & Edits',
        badgeClass: 'bg-[#F8F4F0] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'UPLOAD_EVIDENCE':
      return {
        label: 'Evidence Uploaded',
        category: 'submissions',
        categoryLabel: 'Submissions & Edits',
        badgeClass: 'bg-[#F4ECE9] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'EXPORT_CAR':
      return {
        label: 'CAR PDF Exported',
        category: 'submissions',
        categoryLabel: 'Submissions & Edits',
        badgeClass: 'bg-[#F8F4F0] text-[#7A6F6F] border-[#EAD9D4]',
      };
    case 'FLAG_CAR':
      return {
        label: 'Flagged for Attention',
        category: 'status',
        categoryLabel: 'Status Change',
        badgeClass: 'bg-[#FBF0D6] text-[#6E5200] border-[#E7CF86]',
      };
    case 'CLOSE_CAR':
      return {
        label: 'CAR Closed',
        category: 'status',
        categoryLabel: 'Status Change',
        badgeClass: 'bg-[#E9F4EC] text-[#255A2D] border-[#C5E0CB]',
      };
    case 'REOPEN_CAR':
      return {
        label: 'CAR Reopened',
        category: 'status',
        categoryLabel: 'Status Change',
        badgeClass: 'bg-[#FBF0D6] text-[#6E5200] border-[#E7CF86]',
      };
    case 'SET_DEADLINE':
      return {
        label: 'Deadline Updated',
        category: 'status',
        categoryLabel: 'Status Change',
        badgeClass: 'bg-[#FBF0D6] text-[#6E5200] border-[#E7CF86]',
      };
    case 'CREATE_USER':
      return {
        label: 'User Account Created',
        category: 'users',
        categoryLabel: 'User Management',
        badgeClass: 'bg-[#F9EAEA] text-[#6B1A25] border-[#E8C5C8]',
      };
    case 'UPDATE_USER':
      return {
        label: 'User Account Updated',
        category: 'users',
        categoryLabel: 'User Management',
        badgeClass: 'bg-[#F4ECE9] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'LOCK_USER':
      return {
        label: 'User Account Locked',
        category: 'users',
        categoryLabel: 'User Management',
        badgeClass: 'bg-[#FDECEC] text-[#A32424] border-[#F4C2C2]',
      };
    case 'UNLOCK_USER':
      return {
        label: 'User Account Unlocked',
        category: 'users',
        categoryLabel: 'User Management',
        badgeClass: 'bg-[#E9F4EC] text-[#255A2D] border-[#C5E0CB]',
      };
    case 'CREATE_ANNOUNCEMENT':
      return {
        label: 'Announcement Published',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#F4ECE9] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'UPDATE_ANNOUNCEMENT':
      return {
        label: 'Announcement Updated',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#F8F4F0] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'DELETE_ANNOUNCEMENT':
      return {
        label: 'Announcement Deleted',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#FDECEC] text-[#A32424] border-[#F4C2C2]',
      };
    case 'ADD_ANNOUNCEMENT_COMMENT':
      return {
        label: 'Announcement Comment Posted',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#F8F4F0] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'DELETE_ANNOUNCEMENT_COMMENT':
      return {
        label: 'Announcement Comment Deleted',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#FDECEC] text-[#A32424] border-[#F4C2C2]',
      };
    case 'UPLOAD_ANNOUNCEMENT_IMAGE':
      return {
        label: 'Announcement Image Uploaded',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#F8F4F0] text-[#7A6F6F] border-[#EAD9D4]',
      };
    case 'UPDATE_COMPANY':
      return {
        label: 'Company Details Updated',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#F4ECE9] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'UPDATE_SETTINGS':
      return {
        label: 'Settings Updated',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#F8F4F0] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'ADD_DEPARTMENT':
      return {
        label: 'Department Added',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#E9F4EC] text-[#255A2D] border-[#C5E0CB]',
      };
    case 'REMOVE_DEPARTMENT':
      return {
        label: 'Department Removed',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#FDECEC] text-[#A32424] border-[#F4C2C2]',
      };
    case 'UPLOAD_TEMPLATE':
      return {
        label: 'Master Template Uploaded',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#F4ECE9] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'CREATE_HELPDESK_TICKET':
      return {
        label: 'Help Desk Concern Submitted',
        category: 'submissions',
        categoryLabel: 'Submissions & Edits',
        badgeClass: 'bg-[#F9EAEA] text-[#6B1A25] border-[#E8C5C8]',
      };
    case 'HELPDESK_STATUS':
      return {
        label: 'Help Desk Status Changed',
        category: 'status',
        categoryLabel: 'Status Change',
        badgeClass: 'bg-[#FBF0D6] text-[#6E5200] border-[#E7CF86]',
      };
    case 'SCHEDULE_AUDIT':
      return {
        label: 'Audit Scheduled',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#F9EAEA] text-[#6B1A25] border-[#E8C5C8]',
      };
    case 'UPDATE_AUDIT_SCHEDULE':
      return {
        label: 'Audit Schedule Updated',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#F4ECE9] text-[#4A1219] border-[#EAD9D4]',
      };
    case 'DELETE_AUDIT_SCHEDULE':
      return {
        label: 'Audit Schedule Removed',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#FDECEC] text-[#A32424] border-[#F4C2C2]',
      };
    default:
      if (code.startsWith('SHEETS_SYNC_')) {
        return {
          label: code.includes('PUSH') ? 'Synced Data to Google Sheets' : 'Pulled Data from Google Sheets',
          category: 'system',
          categoryLabel: 'Announcements & System',
          badgeClass: 'bg-[#F4ECE9] text-[#4A1219] border-[#EAD9D4]',
        };
      }
      return {
        label: code.replace(/_/g, ' ') || 'System Event',
        category: 'system',
        categoryLabel: 'Announcements & System',
        badgeClass: 'bg-[#F8F4F0] text-[#7A6F6F] border-[#EAD9D4]',
      };
  }
}

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
  const [activeTab, setActiveTab] = useState<DashboardTab>('submissions');

  const [records, setRecords] = useState<CarRecord[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [auditSchedules, setAuditSchedules] = useState<AuditSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  // Audit Trail tab state
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditCategory, setAuditCategory] = useState<AuditCategory>('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(15);

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
      const [cars, depts, schedules] = await Promise.all([
        api.listCARs(),
        api.getDepartments().catch(() => []),
        api.listAuditSchedules().catch(() => []),
      ]);
      setRecords(cars || []);
      setDepartments(depts || []);
      setAuditSchedules(schedules || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load submissions.');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    setAuditError('');
    try {
      const logs = await api.getAuditLogs(500);
      setAuditLogs(logs || []);
      setAuditLoaded(true);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Could not load audit trail.');
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'audit-trail' && !auditLoaded && !auditLoading) {
      loadAuditLogs();
    }
  }, [activeTab, auditLoaded, auditLoading, loadAuditLogs]);

  const deptOptions = useMemo(() => {
    return Array.from(new Set([...departments, ...records.map((r) => r.Department).filter(Boolean)])).sort();
  }, [departments, records]);

  const calendarBadgeCount = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayYmd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const openDeadlines = records.filter((r) => r.Status !== 'Closed' && normalizeInputDate(r.AdminDeadline)).length;
    const upcomingAudits = auditSchedules.filter(
      (s) => s.Status === 'Scheduled' && normalizeInputDate(s.AuditDate) >= todayYmd
    ).length;
    return openDeadlines + upcomingAudits;
  }, [records, auditSchedules]);

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

  const carNoSet = useMemo(() => new Set(records.map((r) => r.CARNo)), [records]);

  const auditSummary = useMemo(() => {
    let auth = 0;
    let submissions = 0;
    let status = 0;
    for (const log of auditLogs) {
      const cat = describeAuditAction(log.Action).category;
      if (cat === 'auth') auth += 1;
      else if (cat === 'submissions') submissions += 1;
      else if (cat === 'status') status += 1;
    }
    return { total: auditLogs.length, auth, submissions, status };
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      const meta = describeAuditAction(log.Action);
      if (auditCategory !== 'all' && meta.category !== auditCategory) return false;
      if (q) {
        const hay = [
          log.UserName || '',
          log.UserEmail || '',
          log.UserID || '',
          log.Action || '',
          meta.label,
          log.Details || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, auditCategory, auditSearch]);

  const auditTotalPages = Math.max(1, Math.ceil(filteredAuditLogs.length / auditPageSize));
  const safeAuditPage = Math.min(auditPage, auditTotalPages);

  const paginatedAuditLogs = useMemo(() => {
    const start = (safeAuditPage - 1) * auditPageSize;
    return filteredAuditLogs.slice(start, start + auditPageSize);
  }, [filteredAuditLogs, safeAuditPage, auditPageSize]);

  const auditPageNumbers = useMemo(() => {
    if (auditTotalPages <= 7) {
      return Array.from({ length: auditTotalPages }, (_, i) => i + 1);
    }
    const pages: Array<number | 'ellipsis'> = [1];
    const start = Math.max(2, safeAuditPage - 1);
    const end = Math.min(auditTotalPages - 1, safeAuditPage + 1);
    if (start > 2) pages.push('ellipsis');
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < auditTotalPages - 1) pages.push('ellipsis');
    pages.push(auditTotalPages);
    return pages;
  }, [auditTotalPages, safeAuditPage]);

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
      {/* Dashboard View Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#EAD9D4]">
        <button
          type="button"
          onClick={() => setActiveTab('submissions')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer -mb-px whitespace-nowrap shrink-0 ${
            activeTab === 'submissions'
              ? 'border-[#6B1A25] text-[#4A1219] bg-white rounded-t-lg'
              : 'border-transparent text-[#7A6F6F] hover:text-[#4A1219]'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          All Submissions
          <span className="text-xs font-mono-tabular px-1.5 py-0.5 rounded bg-[#F4ECE9] text-[#4A1219]">
            {records.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calendar')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer -mb-px whitespace-nowrap shrink-0 ${
            activeTab === 'calendar'
              ? 'border-[#6B1A25] text-[#4A1219] bg-white rounded-t-lg'
              : 'border-transparent text-[#7A6F6F] hover:text-[#4A1219]'
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          Schedule &amp; Calendar
          <span className="text-xs font-mono-tabular px-1.5 py-0.5 rounded bg-[#F4ECE9] text-[#4A1219]">
            {calendarBadgeCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit-trail')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer -mb-px whitespace-nowrap shrink-0 ${
            activeTab === 'audit-trail'
              ? 'border-[#6B1A25] text-[#4A1219] bg-white rounded-t-lg'
              : 'border-transparent text-[#7A6F6F] hover:text-[#4A1219]'
          }`}
        >
          <History className="h-4 w-4" />
          Audit Trail
        </button>
      </div>

      {activeTab === 'submissions' ? (
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
      ) : activeTab === 'calendar' ? (
      <AuditCalendarView
        records={records}
        schedules={auditSchedules}
        departments={departments}
        loading={loading}
        error={error}
        onReload={loadData}
        onSchedulesChange={setAuditSchedules}
        onViewCar={onViewCar}
        onEditCar={onEditCar}
        onSetDeadline={(carNo, currentDeadline) => {
          setDeadlineCarNo(carNo);
          setDeadlineDate(currentDeadline);
        }}
      />
      ) : (
      <div className="space-y-5">
        {/* Audit Trail Summary Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 tabular-nums">
          <div className="bg-white border border-[#EAD9D4] border-t-2 border-t-[#6B1A25] rounded-xl p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">Recent Events</div>
            <div className="text-2xl font-bold text-[#4A1219] mt-1">{auditSummary.total}</div>
          </div>
          <div className="bg-white border border-[#EAD9D4] border-t-2 border-t-[#4A1219] rounded-xl p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">Logins & Security</div>
            <div className="text-2xl font-bold text-[#4A1219] mt-1">{auditSummary.auth}</div>
          </div>
          <div className="bg-white border border-[#EAD9D4] border-t-2 border-t-[#2F6D39] rounded-xl p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">Submissions & Edits</div>
            <div className="text-2xl font-bold text-[#4A1219] mt-1">{auditSummary.submissions}</div>
          </div>
          <div className="bg-white border border-[#EAD9D4] border-t-2 border-t-[#C9A227] rounded-xl p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">Status Changes</div>
            <div className="text-2xl font-bold text-[#4A1219] mt-1">{auditSummary.status}</div>
          </div>
        </div>

        <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
            <div>
              <h1 className="text-2xl font-bold text-[#4A1219] m-0">Audit Trail</h1>
              <p className="text-xs text-[#7A6F6F] mt-1">
                Chronological accountability log of user logins, DPO confirmations, form submissions, status changes, and administrative actions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Filter by activity category"
                value={auditCategory}
                onChange={(e) => {
                  setAuditCategory(e.target.value as AuditCategory);
                  setAuditPage(1);
                }}
                className="rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25]"
              >
                <option value="all">All activities</option>
                <option value="auth">Logins &amp; Security</option>
                <option value="submissions">Submissions &amp; Edits</option>
                <option value="status">Status Changes</option>
                <option value="users">User Management</option>
                <option value="system">Announcements &amp; System</option>
              </select>

              <div className="relative">
                <Search className="h-4 w-4 text-[#7A6F6F] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => {
                    setAuditSearch(e.target.value);
                    setAuditPage(1);
                  }}
                  placeholder="Search user, action, CAR..."
                  className="rounded-lg border border-[#EAD9D4] pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25] w-56"
                />
              </div>

              <button
                type="button"
                disabled={auditLoading}
                onClick={loadAuditLogs}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#EAD9D4] hover:border-[#6B1A25] bg-white text-[#4A1219] font-semibold text-sm px-3.5 py-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${auditLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {auditLoading && !auditLoaded ? (
            <div className="py-12 text-center text-sm text-[#7A6F6F]">Loading audit trail...</div>
          ) : auditError ? (
            <div className="py-10 text-center text-sm text-[#A32424]">{auditError}</div>
          ) : filteredAuditLogs.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#7A6F6F]">
              No matching audit trail events found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[820px] tabular-nums">
                <thead>
                  <tr className="border-b-2 border-[#EAD9D4] text-left text-[11px] font-bold uppercase tracking-wider text-[#7A6F6F]">
                    <th className="py-3 pr-3">Timestamp</th>
                    <th className="py-3 pr-3">User</th>
                    <th className="py-3 pr-3">Category</th>
                    <th className="py-3 pr-3">Activity</th>
                    <th className="py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E4DF]">
                  {paginatedAuditLogs.map((log, idx) => {
                    const meta = describeAuditAction(log.Action);
                    const detailStr = String(log.Details || '').trim();
                    const isCarRef = Boolean(detailStr && (carNoSet.has(detailStr) || /^(CAR|NC|OFI)-/i.test(detailStr)));
                    return (
                      <tr key={`${log.Timestamp}-${log.UserID}-${log.Action}-${idx}`} className="hover:bg-[#FCF6F3] transition-colors">
                        <td className="py-3 pr-3 font-mono-tabular text-xs text-[#4A1219] whitespace-nowrap">
                          {fmtDateTime(log.Timestamp) || '—'}
                        </td>
                        <td className="py-3 pr-3">
                          {log.UserName ? (
                            <div>
                              <div className="font-semibold text-[#2B2323]">{log.UserName}</div>
                              <div className="text-xs text-[#7A6F6F]">
                                {log.UserEmail}
                                {log.UserRole ? ` · ${roleLabel(log.UserRole)}` : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="font-mono-tabular text-xs text-[#7A6F6F]">{log.UserID || 'System'}</span>
                          )}
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap">
                          <span className="text-xs font-medium text-[#7A6F6F]">{meta.categoryLabel}</span>
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded border ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-3 text-xs text-[#2B2323] max-w-md break-words">
                          {isCarRef ? (
                            <button
                              type="button"
                              onClick={() => onViewCar(detailStr)}
                              className="font-mono-tabular font-semibold text-[#6B1A25] hover:underline cursor-pointer"
                            >
                              {detailStr}
                            </button>
                          ) : detailStr ? (
                            <span>{detailStr}</span>
                          ) : (
                            <span className="text-[#7A6F6F]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination Controls */}
              <div className="mt-4 pt-4 border-t border-[#EAD9D4] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#7A6F6F]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tabular-nums">
                    Showing{' '}
                    <strong className="text-[#2B2323]">
                      {(safeAuditPage - 1) * auditPageSize + 1}
                    </strong>
                    –
                    <strong className="text-[#2B2323]">
                      {Math.min(safeAuditPage * auditPageSize, filteredAuditLogs.length)}
                    </strong>{' '}
                    of <strong className="text-[#2B2323]">{filteredAuditLogs.length}</strong> events
                  </span>

                  <label className="inline-flex items-center gap-1.5">
                    <span>Rows:</span>
                    <select
                      aria-label="Rows per page"
                      value={auditPageSize}
                      onChange={(e) => {
                        setAuditPageSize(Number(e.target.value));
                        setAuditPage(1);
                      }}
                      className="rounded-md border border-[#EAD9D4] bg-white px-2 py-1 text-xs text-[#2B2323] focus:outline-none focus:border-[#6B1A25]"
                    >
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-1 tabular-nums">
                  <button
                    type="button"
                    disabled={safeAuditPage <= 1}
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#EAD9D4] bg-white text-[#4A1219] font-semibold hover:border-[#6B1A25] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </button>

                  {auditPageNumbers.map((item, idx) =>
                    item === 'ellipsis' ? (
                      <span key={`e-${idx}`} className="px-2 py-1 text-[#7A6F6F]">
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setAuditPage(item)}
                        className={`min-w-[30px] px-2 py-1.5 rounded-md border font-semibold cursor-pointer ${
                          item === safeAuditPage
                            ? 'bg-[#6B1A25] border-[#6B1A25] text-white'
                            : 'bg-white border-[#EAD9D4] text-[#4A1219] hover:border-[#6B1A25]'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    disabled={safeAuditPage >= auditTotalPages}
                    onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#EAD9D4] bg-white text-[#4A1219] font-semibold hover:border-[#6B1A25] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

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
