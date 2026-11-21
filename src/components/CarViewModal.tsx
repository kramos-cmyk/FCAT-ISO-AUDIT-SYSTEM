import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Flag,
  History,
  MessageSquare,
  Paperclip,
  Pencil,
  PlusCircle,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  correctiveActionsOf,
  correctionsOf,
  evidenceLinksOf,
  fmtDate,
  fmtDateTime,
  followUpsOf,
  isAuditorRole,
  isCarRaisedByUser,
  isProcessOwnerRole,
  isRecordOverdue,
  isSystemAdminRole,
  possibleRootCausesOf,
  roleLabel,
  safeUrl,
} from '../lib/format';
import type { CarActivityEntry, CarActivityType, CarComment, CarRecord, SessionUser } from '../lib/types';
import { OfficialCarHeader } from './BrandCrest';
import { StatusLabel } from './StatusLabel';
import { useToast } from './Toast';

type ActivityFilter = 'all' | 'status' | 'evidence' | 'comment' | 'edits';

function activityVisualMeta(type: CarActivityType): {
  label: string;
  badgeClass: string;
  nodeClass: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  switch (type) {
    case 'created':
      return {
        label: 'CAR Raised',
        badgeClass: 'bg-[#F5E6E8] text-[#6B1A25] border-[#EAD9D4]',
        nodeClass: 'bg-[#6B1A25] text-white border-[#6B1A25]',
        Icon: PlusCircle,
      };
    case 'status':
      return {
        label: 'Status Change',
        badgeClass: 'bg-[#E9F5EC] text-[#255A2D] border-[#C6E3CC]',
        nodeClass: 'bg-[#2F6D39] text-white border-[#2F6D39]',
        Icon: CheckCircle2,
      };
    case 'flag':
      return {
        label: 'Flagged',
        badgeClass: 'bg-[#FBF0D6] text-[#7A5900] border-[#E7CF86]',
        nodeClass: 'bg-[#C98A00] text-white border-[#C98A00]',
        Icon: Flag,
      };
    case 'deadline':
      return {
        label: 'Deadline',
        badgeClass: 'bg-[#F2EDF9] text-[#5B3B8C] border-[#DCD0F0]',
        nodeClass: 'bg-[#6D47A6] text-white border-[#6D47A6]',
        Icon: CalendarClock,
      };
    case 'evidence':
      return {
        label: 'Evidence Update',
        badgeClass: 'bg-[#EBF3FE] text-[#1D4ED8] border-[#C6DCFD]',
        nodeClass: 'bg-[#1D4ED8] text-white border-[#1D4ED8]',
        Icon: Paperclip,
      };
    case 'comment':
      return {
        label: 'Comment',
        badgeClass: 'bg-[#EEF2FF] text-[#3730A3] border-[#C7D2FE]',
        nodeClass: 'bg-[#4338CA] text-white border-[#4338CA]',
        Icon: MessageSquare,
      };
    case 'followup':
      return {
        label: 'Verification Follow-up',
        badgeClass: 'bg-[#E6F7F5] text-[#0F5F56] border-[#BCE6E0]',
        nodeClass: 'bg-[#0F766E] text-white border-[#0F766E]',
        Icon: ClipboardCheck,
      };
    case 'owner_update':
      return {
        label: 'Process Owner Update',
        badgeClass: 'bg-[#FFF4E5] text-[#8C4A00] border-[#F4D5A6]',
        nodeClass: 'bg-[#B45309] text-white border-[#B45309]',
        Icon: Pencil,
      };
    case 'auditor_update':
      return {
        label: 'Auditor Update',
        badgeClass: 'bg-[#F7EBED] text-[#4A1219] border-[#E2C5C9]',
        nodeClass: 'bg-[#882130] text-white border-[#882130]',
        Icon: FileCheck2,
      };
    case 'assignment':
    default:
      return {
        label: 'Assignment',
        badgeClass: 'bg-[#F3F4F6] text-[#374151] border-[#D1D5DB]',
        nodeClass: 'bg-[#4B5563] text-white border-[#4B5563]',
        Icon: UserCheck,
      };
  }
}

function matchesActivityFilter(type: CarActivityType, filter: ActivityFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'status') return type === 'created' || type === 'status' || type === 'flag' || type === 'deadline';
  if (filter === 'evidence') return type === 'evidence';
  if (filter === 'comment') return type === 'comment';
  return type === 'owner_update' || type === 'auditor_update' || type === 'followup' || type === 'assignment';
}

const WHY_FACTORS = ['Man', 'Method', 'Machine', 'Material', 'Environment'] as const;

function formatSlashDate(raw: string | undefined | null): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return s;
}

function evidenceShortName(url: string, idx: number): string {
  try {
    const clean = url.split('?')[0];
    const parts = clean.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.length <= 28) return decodeURIComponent(last);
  } catch {
    // ignore decode issues
  }
  return `Evidence ${idx + 1}`;
}

function FormCheckbox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] leading-snug text-[#111111]">
      <span
        className="inline-flex h-3.5 w-3.5 items-center justify-center border border-[#111111] bg-white shrink-0"
        aria-checked={checked}
        role="checkbox"
      >
        {checked && <Check className="h-3 w-3 stroke-[2.75] text-[#111111]" />}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function CarViewModal({
  carNo,
  user,
  company,
  onClose,
  initialTab = 'document',
}: {
  carNo: string | null;
  user: SessionUser;
  company: Record<string, string>;
  onClose: () => void;
  initialTab?: 'document' | 'activity';
}) {
  const { showToast } = useToast();
  const [record, setRecord] = useState<CarRecord | null>(null);
  const [comments, setComments] = useState<CarComment[]>([]);
  const [activities, setActivities] = useState<CarActivityEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'document' | 'activity'>(initialTab);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!carNo) return;
    let cancelled = false;
    setActiveTab(initialTab);
    setActivityFilter('all');
    setLoading(true);
    setRecord(null);
    setComments([]);
    setActivities([]);
    Promise.all([api.getCAR(carNo), api.getCarComments(carNo), api.getCarActivities(carNo)])
      .then(([rec, cmts, acts]) => {
        if (cancelled) return;
        setRecord(rec);
        setComments(cmts || []);
        setActivities(acts || []);
      })
      .catch((err) => {
        if (!cancelled) showToast(err.message || 'Could not load record.', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [carNo, initialTab, showToast]);

  const activityCounts = useMemo(() => {
    return {
      all: activities.length,
      status: activities.filter((a) => matchesActivityFilter(a.ActivityType, 'status')).length,
      evidence: activities.filter((a) => matchesActivityFilter(a.ActivityType, 'evidence')).length,
      comment: activities.filter((a) => matchesActivityFilter(a.ActivityType, 'comment')).length,
      edits: activities.filter((a) => matchesActivityFilter(a.ActivityType, 'edits')).length,
    };
  }, [activities]);

  const filteredActivities = useMemo(
    () => activities.filter((a) => matchesActivityFilter(a.ActivityType, activityFilter)),
    [activities, activityFilter]
  );

  if (!carNo) return null;

  const handlePostComment = async () => {
    if (!commentText.trim()) {
      showToast('Please enter a comment.', 'error');
      return;
    }
    setPosting(true);
    try {
      const res = await api.addCarComment(carNo, commentText.trim());
      if (res.ok && res.comment) {
        const posted = res.comment;
        setComments((prev) => [...prev, posted]);
        setActivities((prev) => [
          {
            ActivityID: `ACT-${posted.CommentID}`,
            CARNo: carNo,
            UserID: posted.UserID,
            UserName: posted.UserName,
            Role: posted.Role,
            ActivityType: 'comment',
            Summary: 'Posted a comment',
            Details: posted.Message,
            CreatedAt: posted.CreatedAt,
          },
          ...prev,
        ]);
        setCommentText('');
        showToast('Comment posted.', 'success');
      } else {
        showToast(res.error || 'Could not post comment.', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to post comment.', 'error');
    } finally {
      setPosting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportCarPdf(carNo);
      showToast(`Exported ${carNo} PDF.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const status = record ? (record.AdminFlag === 'Needs Attention' ? 'Needs Attention' : record.Status) : 'Open';
  const overdue = record ? isRecordOverdue(record.AdminDeadline, record.Status) : false;

  const parsedWhys = (() => {
    const map: Record<string, string[]> = {};
    if (record?.RootCauseFactors) {
      try {
        const parsed = JSON.parse(record.RootCauseFactors);
        WHY_FACTORS.forEach((f) => {
          map[f] = Array.isArray(parsed[f])
            ? parsed[f].slice(0, 5).map((v: unknown) => String(v || ''))
            : ['', '', '', '', ''];
        });
        return map;
      } catch {
        // fallback below
      }
    }
    WHY_FACTORS.forEach((f) => {
      map[f] = ['', '', '', '', ''];
    });
    return map;
  })();

  const srcLower = String(record?.Source || '').trim().toLowerCase();
  const knownSources = [
    'internal audit',
    'external audit',
    'customer complaint',
    'unmet kpis',
    'nonconforming output/services',
  ];
  const isKnownSource = knownSources.includes(srcLower);

  const typeLower = String(record?.Type || '').trim().toLowerCase();
  const isNC = typeLower === 'nc' || typeLower.includes('(nc)') || typeLower.includes('nonconformity');
  const isOFI = typeLower === 'ofi' || typeLower.includes('(ofi)') || typeLower.includes('opportunity');

  const correctionsList = record ? correctionsOf(record) : [];
  const paddedCorrections = [...correctionsList];
  while (paddedCorrections.length < 2) {
    paddedCorrections.push({ Correction: '', DateCompleted: '', PersonInCharge: '', Result: '' });
  }

  const rootCauses = record ? possibleRootCausesOf(record) : [];
  const correctiveActions = record ? correctiveActionsOf(record) : [];
  const evLinks = record ? evidenceLinksOf(record) : [];
  const followUps = record ? followUpsOf(record) : [];

  const receivedName =
    record?.EmployeeName && record.EmployeeName !== '(Unassigned)' ? record.EmployeeName : '';
  const initiatedDisplay = record
    ? [record.RaisedBy, formatSlashDate(record.DateIssued)].filter(Boolean).join(' / ')
    : '';
  const receivedDisplay = record
    ? [receivedName, formatSlashDate(record.PreparedDate)].filter(Boolean).join(' / ')
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2323]/65 backdrop-blur-[2px] p-2 sm:p-5"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[#EFE9E4] border border-[#EAD9D4] rounded-xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#EAD9D4] bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="font-display font-bold text-base sm:text-lg text-[#4A1219] truncate">
              {record ? `${record.CARNo} — FO-RI-05 Corrective Action Report` : `Loading ${carNo}...`}
            </div>
            {record && <StatusLabel status={status} />}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {record && (
              <button
                type="button"
                disabled={exporting}
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {exporting ? 'Generating PDF...' : 'Export as PDF (FO-RI-05)'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-1.5 rounded-md text-[#7A6F6F] hover:text-[#2B2323] hover:bg-[#F8F4F0] cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Sub-Bar Tabs */}
        {record && (
          <div className="flex items-center gap-1 px-5 bg-[#FAF7F5] border-b border-[#EAD9D4]">
            <button
              type="button"
              onClick={() => setActiveTab('document')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'document'
                  ? 'border-[#6B1A25] text-[#4A1219]'
                  : 'border-transparent text-[#7A6F6F] hover:text-[#2B2323]'
              }`}
            >
              <FileText className="h-4 w-4" />
              FO-RI-05 Report
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'activity'
                  ? 'border-[#6B1A25] text-[#4A1219]'
                  : 'border-transparent text-[#7A6F6F] hover:text-[#2B2323]'
              }`}
            >
              <History className="h-4 w-4" />
              Activity Log
              <span className="ml-0.5 inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-mono-tabular bg-[#EFE5DF] text-[#4A1219]">
                {activities.length}
              </span>
            </button>
          </div>
        )}

        {/* Scrollable Content View */}
        <div className="overflow-y-auto p-3 sm:p-6 space-y-6 flex-1">
          {loading ? (
            <div className="bg-white rounded-xl py-14 text-center text-sm text-[#7A6F6F]">
              Loading record details...
            </div>
          ) : !record ? (
            <div className="bg-white rounded-xl py-14 text-center text-sm text-[#7A6F6F]">
              Record not found.
            </div>
          ) : activeTab === 'activity' ? (
            <div className="bg-white border border-[#EAD9D4] rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#EAD9D4] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#FCF9F7]">
                <div>
                  <h3 className="font-display font-bold text-base text-[#4A1219]">
                    CAR Activity History
                  </h3>
                  <p className="text-xs text-[#7A6F6F] mt-0.5">
                    Chronological audit trail of status changes, comments, evidence updates, and section edits for {record.CARNo}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'All', count: activityCounts.all },
                      { id: 'status', label: 'Status & Flags', count: activityCounts.status },
                      { id: 'evidence', label: 'Evidence', count: activityCounts.evidence },
                      { id: 'comment', label: 'Comments', count: activityCounts.comment },
                      { id: 'edits', label: 'Edits & Follow-ups', count: activityCounts.edits },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActivityFilter(tab.id)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                        activityFilter === tab.id
                          ? 'bg-[#6B1A25] text-white border-[#6B1A25]'
                          : 'bg-white text-[#4A1219] border-[#EAD9D4] hover:border-[#6B1A25]'
                      }`}
                    >
                      {tab.label}{' '}
                      <span className="font-mono-tabular opacity-80">({tab.count})</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-5">
                {filteredActivities.length === 0 ? (
                  <div className="py-10 text-center text-sm text-[#7A6F6F]">
                    No activity entries recorded for this filter yet.
                  </div>
                ) : (
                  <ol className="relative border-l-2 border-[#EAD9D4] ml-3.5 space-y-5">
                    {filteredActivities.map((entry) => {
                      const meta = activityVisualMeta(entry.ActivityType);
                      const Icon = meta.Icon;
                      return (
                        <li key={entry.ActivityID} className="pl-6 relative">
                          <span
                            className={`absolute -left-[13px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full border shadow-xs ${meta.nodeClass}`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="rounded-lg border border-[#EFE5DF] bg-[#FCF9F7] px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${meta.badgeClass}`}
                                >
                                  {meta.label}
                                </span>
                                <span className="text-sm font-semibold text-[#2B2323]">
                                  {entry.Summary}
                                </span>
                              </div>
                              <span className="text-xs text-[#7A6F6F] font-mono-tabular">
                                {fmtDateTime(entry.CreatedAt)}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#5E5252]">
                              <span className="font-semibold text-[#4A1219]">
                                {entry.UserName || 'System'}
                              </span>
                              {entry.Role && (
                                <span className="px-1.5 py-0.5 rounded bg-[#F3E8DE] text-[#4A1219] text-[11px] font-medium">
                                  {roleLabel(entry.Role)}
                                </span>
                              )}
                            </div>
                            {entry.Details && (
                              <div className="mt-2 rounded-md bg-white border border-[#EAD9D4] px-3 py-2 text-xs sm:text-sm text-[#2B2323] whitespace-pre-wrap break-words">
                                {entry.Details}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          ) : (
            <>
              {(record.AdminFlag === 'Needs Attention' && record.AdminNote) || record.AdminDeadline ? (
                <div className="space-y-2">
                  {record.AdminFlag === 'Needs Attention' && record.AdminNote && (
                    <div className="bg-[#FBF0D6] border border-[#E7CF86] text-[#6B5300] rounded-lg px-4 py-2.5 text-sm">
                      <strong>Flagged by an Auditor:</strong> {record.AdminNote}
                    </div>
                  )}
                  {record.AdminDeadline && (
                    <div
                      className={`rounded-lg px-4 py-2.5 text-sm border ${
                        overdue
                          ? 'bg-[#FBE7E1] border-[#F3CFC5] text-[#9A2A1E]'
                          : 'bg-white border-[#EAD9D4] text-[#4A1219]'
                      }`}
                    >
                      <strong>{overdue ? 'Overdue — deadline was ' : 'Deadline set by an Auditor: '}</strong>
                      {fmtDate(record.AdminDeadline)}
                    </div>
                  )}
                </div>
              ) : null}

              {/* ================================================================
                  PAGE 1 OF 3 — FINDING DETAILS & CORRECTION
                 ================================================================ */}
              <section
                aria-label="FO-RI-05 Page 1 of 3"
                className="bg-white border border-[#CFC7C2] shadow-md p-4 sm:p-7 text-[#111111] font-serif"
              >
                <OfficialCarHeader
                  companyName={company.CompanyName}
                  standard={company.Standard}
                  logoUrl={company.LogoUrl}
                  pageLabel="Page 1 of 3"
                  className="mb-3"
                />

                <div className="overflow-x-auto">
                  <div className="min-w-[660px] border border-[#111111] text-[13px] leading-snug">
                    {/* Row 1: Source of Incident or Nonconformity | CAR No & Date Issued */}
                    <div className="grid grid-cols-[1fr_195px] border-b border-[#111111]">
                      <div className="border-r border-[#111111] p-2.5">
                        <div className="font-bold mb-2">Source of Incident or Nonconformity</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 pl-3 pb-1">
                          <FormCheckbox checked={srcLower === 'internal audit'} label="Internal Audit" />
                          <FormCheckbox checked={srcLower === 'unmet kpis'} label="Unmet KPIs" />
                          <FormCheckbox checked={srcLower === 'external audit'} label="External Audit" />
                          <FormCheckbox
                            checked={srcLower === 'nonconforming output/services'}
                            label="Nonconforming Output/Services"
                          />
                          <FormCheckbox checked={srcLower === 'customer complaint'} label="Customer Complaint" />
                          <FormCheckbox
                            checked={srcLower === 'others' || (Boolean(srcLower) && !isKnownSource)}
                            label={srcLower && !isKnownSource && srcLower !== 'others' ? `Others: ${record.Source}` : 'Others'}
                          />
                        </div>
                      </div>

                      <div className="grid grid-rows-[auto_1fr]">
                        <div className="border-b border-[#111111] px-2.5 py-2">
                          <span className="font-bold">CAR No: </span>
                          <span>{record.CARNo || ''}</span>
                        </div>
                        <div className="px-2.5 py-2">
                          <div className="font-bold">Date Issued:</div>
                          <div className="mt-1">{formatSlashDate(record.DateIssued)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Department/Type | Company Document/ISO Clause | Details */}
                    <div className="grid grid-cols-[225px_125px_1fr] border-b border-[#111111]">
                      {/* Left Column */}
                      <div className="border-r border-[#111111] grid grid-rows-2">
                        <div className="border-b border-[#111111] p-2.5 min-h-[64px]">
                          <div className="font-bold">Department:/Process:</div>
                          <div className="mt-1 break-words">{record.Department || ''}</div>
                        </div>
                        <div className="p-2.5 min-h-[68px]">
                          <div className="font-bold mb-2.5">Type of Findings:</div>
                          <div className="flex items-center gap-7 pl-2">
                            <FormCheckbox checked={isNC} label="NC" />
                            <FormCheckbox checked={isOFI} label="OFI" />
                          </div>
                        </div>
                      </div>

                      {/* Middle Column */}
                      <div className="border-r border-[#111111] grid grid-rows-2">
                        <div className="border-b border-[#111111] p-2.5 min-h-[64px]">
                          <div className="font-bold leading-tight">
                            Company
                            <br />
                            Document:
                          </div>
                          <div className="mt-1 break-words">{record.CompanyDocument || ''}</div>
                        </div>
                        <div className="p-2.5 min-h-[68px]">
                          <div className="font-bold">ISO 9001 Clause:</div>
                          <div className="mt-1 break-words">{record.ISOClause || ''}</div>
                        </div>
                      </div>

                      {/* Right Column spanning both rows */}
                      <div className="p-2.5 min-h-[132px]">
                        <div className="font-bold">Details of Incident or Nonconformity</div>
                        <div className="mt-1.5 whitespace-pre-wrap break-words">{record.Details || ''}</div>
                      </div>
                    </div>

                    {/* Row 3: Initiated By/Date | Received by/Date */}
                    <div className="grid grid-cols-[225px_1fr] border-b border-[#111111]">
                      <div className="border-r border-[#111111] p-2.5 min-h-[54px]">
                        <div className="font-bold">Initiated By/Date:</div>
                        <div className="mt-1">{initiatedDisplay}</div>
                      </div>
                      <div className="p-2.5 min-h-[54px]">
                        <div className="font-bold">Received by/Date:</div>
                        <div className="mt-1">{receivedDisplay}</div>
                      </div>
                    </div>

                    {/* Row 4: Shaded Banner */}
                    <div className="bg-[#CCCCCC] border-b border-[#111111] py-1 px-3 text-center font-bold">
                      To be filled out by the Process Owner
                    </div>

                    {/* Row 5+: Correction Table */}
                    <table className="w-full border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[41%]" />
                        <col className="w-[16%]" />
                        <col className="w-[19%]" />
                        <col className="w-[24%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-[#111111]">
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold">
                            Correction (Immediate Action Taken)
                          </th>
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold">
                            Date Completed
                          </th>
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold">
                            Person In-Charge
                          </th>
                          <th className="py-1.5 px-2 text-center font-bold">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paddedCorrections.map((c, idx) => (
                          <tr
                            key={idx}
                            className={idx < paddedCorrections.length - 1 ? 'border-b border-[#111111]' : ''}
                          >
                            <td className="border-r border-[#111111] p-2.5 align-top min-h-[92px] h-24 whitespace-pre-wrap break-words">
                              {c.Correction || ''}
                            </td>
                            <td className="border-r border-[#111111] p-2.5 align-top text-center h-24 whitespace-nowrap">
                              {formatSlashDate(c.DateCompleted)}
                            </td>
                            <td className="border-r border-[#111111] p-2.5 align-top h-24 break-words">
                              {c.PersonInCharge || ''}
                            </td>
                            <td className="p-2.5 align-top h-24 whitespace-pre-wrap break-words">
                              {c.Result || ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* ================================================================
                  PAGE 2 OF 3 — ROOT CAUSE ANALYSIS (5 WHYS)
                 ================================================================ */}
              <section
                aria-label="FO-RI-05 Page 2 of 3"
                className="bg-white border border-[#CFC7C2] shadow-md p-4 sm:p-7 text-[#111111] font-serif"
              >
                <OfficialCarHeader
                  companyName={company.CompanyName}
                  standard={company.Standard}
                  logoUrl={company.LogoUrl}
                  pageLabel="Page 2 of 3"
                  className="mb-3"
                />

                <div className="overflow-x-auto">
                  <div className="min-w-[660px] border border-[#111111] text-[13px] leading-snug">
                    <div className="border-b border-[#111111] py-1.5 px-3 text-center font-bold">
                      Root Cause Analysis
                    </div>
                    <table className="w-full border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[16%]" />
                        <col className="w-[16.8%]" />
                        <col className="w-[16.8%]" />
                        <col className="w-[16.8%]" />
                        <col className="w-[16.8%]" />
                        <col className="w-[16.8%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-[#111111]">
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold">
                            Factors
                          </th>
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold">
                            Why 1?
                          </th>
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold">
                            Why 2?
                          </th>
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold">
                            Why 3?
                          </th>
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold">
                            Why 4?
                          </th>
                          <th className="py-1.5 px-2 text-center font-bold">Why 5?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {WHY_FACTORS.map((factor, fIdx) => {
                          const cells = parsedWhys[factor] || ['', '', '', '', ''];
                          return (
                            <tr
                              key={factor}
                              className={fIdx < WHY_FACTORS.length - 1 ? 'border-b border-[#111111]' : ''}
                            >
                              <td className="border-r border-[#111111] p-2.5 text-center align-middle font-bold h-24">
                                {factor}
                              </td>
                              {cells.map((val, wIdx) => (
                                <td
                                  key={wIdx}
                                  className={`${
                                    wIdx < 4 ? 'border-r border-[#111111] ' : ''
                                  }p-2.5 align-top h-24 whitespace-pre-wrap break-words text-[12.5px]`}
                                >
                                  {val || ''}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* ================================================================
                  PAGE 3 OF 3 — ROOT CAUSE VALIDATION, CORRECTIVE ACTION,
                  SIGN-OFFS & AUDITOR FOLLOW-UP
                 ================================================================ */}
              <section
                aria-label="FO-RI-05 Page 3 of 3"
                className="bg-white border border-[#CFC7C2] shadow-md p-4 sm:p-7 text-[#111111] font-serif"
              >
                <OfficialCarHeader
                  companyName={company.CompanyName}
                  standard={company.Standard}
                  logoUrl={company.LogoUrl}
                  pageLabel="Page 3 of 3"
                  className="mb-3"
                />

                <div className="overflow-x-auto">
                  <div className="min-w-[660px] border border-[#111111] text-[13px] leading-snug">
                    {/* Table A: Possible Root Cause/s | Validation Method | Date | Results of Validation */}
                    <table className="w-full border-collapse table-fixed border-b border-[#111111]">
                      <colgroup>
                        <col className="w-[32%]" />
                        <col className="w-[32%]" />
                        <col className="w-[13%]" />
                        <col className="w-[23%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-[#111111]">
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold">
                            Possible Root Cause/s
                          </th>
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold">
                            Validation Method
                          </th>
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold">
                            Date
                          </th>
                          <th className="py-1.5 px-2 text-center font-bold">Results of Validation</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border-r border-[#111111] p-2.5 align-top h-24 whitespace-pre-wrap break-words">
                            {rootCauses.length > 1 ? (
                              <ul className="list-disc pl-4 m-0 space-y-1">
                                {rootCauses.map((rc, i) => (
                                  <li key={i}>{rc}</li>
                                ))}
                              </ul>
                            ) : (
                              rootCauses[0] || ''
                            )}
                          </td>
                          <td className="border-r border-[#111111] p-2.5 align-top h-24 whitespace-pre-wrap break-words">
                            {record.ValidationMethod || ''}
                          </td>
                          <td className="border-r border-[#111111] p-2.5 align-top text-center h-24 whitespace-nowrap">
                            {formatSlashDate(record.ValidationDate)}
                          </td>
                          <td className="p-2.5 align-top h-24 whitespace-pre-wrap break-words">
                            {record.ValidationResult || ''}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Table B: True Root Cause | Corrective Action | Person In-Charge/Target Date | Evidence/Record | Date Implemented */}
                    <table className="w-full border-collapse table-fixed border-b border-[#111111]">
                      <colgroup>
                        <col className="w-[17%]" />
                        <col className="w-[23%]" />
                        <col className="w-[24%]" />
                        <col className="w-[17%]" />
                        <col className="w-[19%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-[#111111]">
                          <th className="border-r border-[#111111] py-2 px-2 text-center font-bold align-middle">
                            True Root Cause
                          </th>
                          <th className="border-r border-[#111111] py-2 px-2 text-center font-bold align-middle">
                            Corrective Action:
                          </th>
                          <th className="border-r border-[#111111] py-2 px-2 text-center font-bold align-middle">
                            Person In-Charge/
                            <br />
                            Target Date
                          </th>
                          <th className="border-r border-[#111111] py-2 px-2 text-center font-bold align-middle">
                            Evidence/
                            <br />
                            Record
                          </th>
                          <th className="py-2 px-2 text-center font-bold align-middle">
                            Date Implemented
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(correctiveActions.length > 0
                          ? correctiveActions
                          : [{ CorrectiveAction: '', ActionOwnerTargetDate: '', DateImplemented: '' }]
                        ).map((ca, idx, arr) => (
                          <tr key={idx} className={idx < arr.length - 1 ? 'border-b border-[#111111]' : ''}>
                            {idx === 0 && (
                              <td
                                rowSpan={arr.length}
                                className="border-r border-[#111111] p-2.5 align-top min-h-[96px] h-24 whitespace-pre-wrap break-words"
                              >
                                {record.TrueRootCause || ''}
                              </td>
                            )}
                            <td className="border-r border-[#111111] p-2.5 align-top h-24 whitespace-pre-wrap break-words">
                              {ca.CorrectiveAction || ''}
                            </td>
                            <td className="border-r border-[#111111] p-2.5 align-top h-24 whitespace-pre-wrap break-words">
                              {ca.ActionOwnerTargetDate || ''}
                            </td>
                            {idx === 0 && (
                              <td
                                rowSpan={arr.length}
                                className="border-r border-[#111111] p-2.5 align-top h-24 break-words"
                              >
                                {evLinks.length > 0 && (
                                  <div className="flex flex-col gap-1.5 font-sans text-xs">
                                    {evLinks.map((url, eIdx) => (
                                      <a
                                        key={eIdx}
                                        href={safeUrl(url)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline break-all"
                                      >
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                        <span>{evidenceShortName(url, eIdx)}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </td>
                            )}
                            <td className="p-2.5 align-top text-center h-24 whitespace-nowrap">
                              {formatSlashDate(ca.DateImplemented)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Sign-offs */}
                    <div className="grid grid-cols-3 gap-4 px-6 py-8 border-b border-[#111111] text-center">
                      <div>
                        <div className="min-h-[20px] font-bold mb-2">{record.PreparedBy || ''}</div>
                        <div className="font-bold">Prepared by</div>
                        <div className="font-bold mt-2">(Process Owner)</div>
                        <div className="font-bold mt-5">
                          Date:{' '}
                          <span className="font-normal">{formatSlashDate(record.PreparedDate)}</span>
                        </div>
                      </div>

                      <div>
                        <div className="min-h-[20px] font-bold mb-2">{record.ApprovedBy || ''}</div>
                        <div className="font-bold">Approved by:</div>
                        <div className="font-bold mt-2">(Immediate Head)</div>
                        <div className="font-bold mt-5">
                          Date:{' '}
                          <span className="font-normal">{formatSlashDate(record.ApprovedDate)}</span>
                        </div>
                      </div>

                      <div>
                        <div className="min-h-[20px] font-bold mb-2">
                          {record.SignOffConformedBy || ''}
                        </div>
                        <div className="font-bold">Conformed by:</div>
                        <div className="font-bold mt-2">(Auditor)</div>
                        <div className="font-bold mt-5">
                          Date received:{' '}
                          <span className="font-normal">
                            {formatSlashDate(record.SignOffConformedDate)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Gray Banner: To be filled out by the Auditor */}
                    <div className="bg-[#CCCCCC] border-b border-[#111111] py-1 px-3 text-center font-bold">
                      To be filled out by the Auditor
                    </div>

                    {/* Follow-up / Verification Table */}
                    <table className="w-full border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[13%]" />
                        <col className="w-[22%]" />
                        <col className="w-[20%]" />
                        <col className="w-[23%]" />
                        <col className="w-[22%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-[#111111]">
                          <th
                            rowSpan={2}
                            className="border-r border-[#111111] py-1.5 px-2 text-center font-bold align-middle"
                          >
                            Date
                          </th>
                          <th colSpan={4} className="py-1 px-2 text-center font-bold">
                            Ff-up/ Verification of Corrective Action
                          </th>
                        </tr>
                        <tr className="border-b border-[#111111]">
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold align-middle">
                            Result of Verification
                          </th>
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold align-middle">
                            Status (Closed/
                            <br />
                            Open)
                          </th>
                          <th className="border-r border-[#111111] py-1.5 px-2 text-center font-bold align-middle">
                            Verified By (Auditor)
                          </th>
                          <th className="py-1.5 px-2 text-center font-bold align-middle">
                            Conformed By
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(followUps.length > 0
                          ? followUps
                          : [{ FollowUpDate: '', ResultOfVerification: '', VerifiedBy: '', ConformedBy: '' }]
                        ).map((f, idx, arr) => (
                          <tr key={idx} className={idx < arr.length - 1 ? 'border-b border-[#111111]' : ''}>
                            <td className="border-r border-[#111111] p-2.5 align-top text-center h-28 whitespace-nowrap">
                              {formatSlashDate(f.FollowUpDate)}
                            </td>
                            <td className="border-r border-[#111111] p-2.5 align-top h-28 whitespace-pre-wrap break-words">
                              {f.ResultOfVerification || ''}
                            </td>
                            <td className="border-r border-[#111111] p-2.5 align-top text-center h-28">
                              {followUps.length > 0 && idx === arr.length - 1 ? record.Status || 'Open' : ''}
                            </td>
                            <td className="border-r border-[#111111] p-2.5 align-top h-28 break-words">
                              {f.VerifiedBy || ''}
                            </td>
                            <td className="p-2.5 align-top h-28 break-words">{f.ConformedBy || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* ================================================================
                  PORTAL COMMENTS THREAD (BELOW OFFICIAL FORM SHEETS)
                 ================================================================ */}
              <div className="border border-[#EAD9D4] rounded-lg overflow-hidden bg-white">
                <div className="bg-gradient-to-r from-[#6B1A25] to-[#4A1219] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider">
                  Comments &amp; Notes
                </div>
                <div className="p-4">
                  {comments.length === 0 ? (
                    <div className="text-sm text-[#7A6F6F] py-1">No comments yet.</div>
                  ) : (
                    <div className="divide-y divide-[#F0E4DF]">
                      {comments.map((c) => (
                        <div key={c.CommentID} className="py-2.5 first:pt-0 last:pb-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-[#2B2323]">
                              {c.UserName}
                              {c.Role && (
                                <span className="ml-2 text-[11px] font-semibold text-[#4A1219] bg-[#F3E8DE] px-2 py-0.5 rounded">
                                  {roleLabel(c.Role)}
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-[#7A6F6F] font-mono-tabular">
                              {fmtDateTime(c.CreatedAt)}
                            </span>
                          </div>
                          <p className="text-sm text-[#2B2323] mt-1 whitespace-pre-wrap">{c.Message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {(isSystemAdminRole(user.role) ||
                    (isAuditorRole(user.role) && isCarRaisedByUser(record, user)) ||
                    isProcessOwnerRole(user.role)) && (
                    <div className="mt-4 pt-3 border-t border-[#EAD9D4]">
                      <textarea
                        rows={2}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder={
                          isProcessOwnerRole(user.role) && !isAuditorRole(user.role)
                            ? 'Add a comment or response note for the auditor...'
                            : 'Add a comment for the department or auditor log...'
                        }
                        className="w-full rounded-lg border border-[#EAD9D4] px-3 py-2 text-sm focus:outline-none focus:border-[#6B1A25]"
                      />
                      <button
                        type="button"
                        disabled={posting}
                        onClick={handlePostComment}
                        className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {posting ? 'Posting...' : 'Post Comment'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#EAD9D4] bg-white flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#EAD9D4] bg-white hover:bg-[#FCF6F3] text-[#2B2323] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
