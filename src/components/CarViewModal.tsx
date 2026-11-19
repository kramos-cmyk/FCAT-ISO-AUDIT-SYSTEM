import React, { useEffect, useState } from 'react';
import { Check, Download, ExternalLink, Send, X } from 'lucide-react';
import { api } from '../lib/api';
import {
  correctiveActionsOf,
  correctionsOf,
  evidenceLinksOf,
  fmtDate,
  fmtDateTime,
  followUpsOf,
  isAuditorRole,
  isRecordOverdue,
  possibleRootCausesOf,
  safeUrl,
} from '../lib/format';
import type { CarComment, CarRecord, SessionUser } from '../lib/types';
import { OfficialCarHeader } from './BrandCrest';
import { StatusLabel } from './StatusLabel';
import { useToast } from './Toast';

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
}: {
  carNo: string | null;
  user: SessionUser;
  company: Record<string, string>;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [record, setRecord] = useState<CarRecord | null>(null);
  const [comments, setComments] = useState<CarComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!carNo) return;
    let cancelled = false;
    setLoading(true);
    setRecord(null);
    setComments([]);
    Promise.all([api.getCAR(carNo), api.getCarComments(carNo)])
      .then(([rec, cmts]) => {
        if (cancelled) return;
        setRecord(rec);
        setComments(cmts || []);
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
  }, [carNo, showToast]);

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
        setComments((prev) => [...prev, res.comment!]);
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

        {/* Scrollable 3-Page Compliance Document View */}
        <div className="overflow-y-auto p-3 sm:p-6 space-y-6 flex-1">
          {loading ? (
            <div className="bg-white rounded-xl py-14 text-center text-sm text-[#7A6F6F]">
              Loading record details...
            </div>
          ) : !record ? (
            <div className="bg-white rounded-xl py-14 text-center text-sm text-[#7A6F6F]">
              Record not found.
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
                              {isAuditorRole(c.Role) && (
                                <span className="ml-2 text-[11px] font-semibold text-[#4A1219] bg-[#F3E8DE] px-2 py-0.5 rounded">
                                  {c.Role === 'Admin' ? 'System Admin' : 'Auditor'}
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

                  {isAuditorRole(user.role) && (
                    <div className="mt-4 pt-3 border-t border-[#EAD9D4]">
                      <textarea
                        rows={2}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Add a comment for the department..."
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
