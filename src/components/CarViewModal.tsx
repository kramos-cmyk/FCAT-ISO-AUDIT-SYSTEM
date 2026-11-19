import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Send, X } from 'lucide-react';
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

  const renderWhyFactors = (raw?: string) => {
    if (!raw) return <span className="text-[#7A6F6F]">—</span>;
    let parsed: Record<string, string[]> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return <span className="whitespace-pre-wrap">{raw}</span>;
    }
    const rows = WHY_FACTORS.map((factor) => {
      const whys = Array.isArray(parsed[factor]) ? parsed[factor] : [];
      const filled = whys.map((w) => String(w || '').trim()).filter(Boolean);
      if (filled.length === 0) return null;
      return (
        <div key={factor} className="mb-1.5 text-sm">
          <strong className="text-[#4A1219]">{factor}:</strong> {filled.join(' → ')}
        </div>
      );
    }).filter(Boolean);
    return rows.length > 0 ? <>{rows}</> : <span className="text-[#7A6F6F]">—</span>;
  };

  const status = record ? (record.AdminFlag === 'Needs Attention' ? 'Needs Attention' : record.Status) : 'Open';
  const overdue = record ? isRecordOverdue(record.AdminDeadline, record.Status) : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2323]/60 backdrop-blur-[2px] p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-[#EAD9D4] rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#EAD9D4] bg-[#F8F4F0]">
          <div className="font-display font-bold text-base sm:text-lg text-[#4A1219] truncate">
            {record ? `${record.CARNo} — Corrective Action Report` : `Loading ${carNo}...`}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-md text-[#7A6F6F] hover:text-[#2B2323] hover:bg-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6 space-y-5 flex-1">
          {loading ? (
            <div className="py-12 text-center text-sm text-[#7A6F6F]">Loading record details...</div>
          ) : !record ? (
            <div className="py-12 text-center text-sm text-[#7A6F6F]">Record not found.</div>
          ) : (
            <>
              <OfficialCarHeader
                companyName={company.CompanyName}
                standard={company.Standard}
                logoUrl={company.LogoUrl}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-[#4A1219] font-mono-tabular">{record.CARNo}</h2>
                    <StatusLabel status={status} />
                  </div>
                  <p className="text-xs text-[#7A6F6F] mt-1">
                    Handled by{' '}
                    {record.EmployeeName && record.EmployeeName !== '(Unassigned)'
                      ? record.EmployeeName
                      : 'Unclaimed'}{' '}
                    · Raised {fmtDateTime(record.CreatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={handleExport}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {exporting ? 'Generating PDF...' : 'Export as PDF (FO-RI-05)'}
                </button>
              </div>

              {record.AdminFlag === 'Needs Attention' && record.AdminNote && (
                <div className="bg-[#FBF0D6] border border-[#E7CF86] text-[#6B5300] rounded-lg px-4 py-3 text-sm">
                  <strong>Flagged by an Auditor:</strong> {record.AdminNote}
                </div>
              )}

              {record.AdminDeadline && (
                <div
                  className={`rounded-lg px-4 py-3 text-sm border ${
                    overdue
                      ? 'bg-[#FBE7E1] border-[#F3CFC5] text-[#9A2A1E]'
                      : 'bg-[#F8F4F0] border-[#EAD9D4] text-[#4A1219]'
                  }`}
                >
                  <strong>{overdue ? 'Overdue — deadline was ' : 'Deadline set by an Auditor: '}</strong>
                  {fmtDate(record.AdminDeadline)}
                </div>
              )}

              {/* Section 1 */}
              <SectionBlock title="1. Finding Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldRead label="Raised By (Auditor)" value={record.RaisedBy} />
                  <FieldRead
                    label="Received By"
                    value={
                      record.EmployeeName && record.EmployeeName !== '(Unassigned)'
                        ? record.EmployeeName
                        : 'Unclaimed'
                    }
                  />
                  <FieldRead label="Type of Finding" value={record.Type} />
                  <FieldRead label="Source" value={record.Source} />
                  <FieldRead label="Department / Process" value={record.Department} />
                  <FieldRead label="Date Issued" value={fmtDate(record.DateIssued) || record.DateIssued} />
                  <FieldRead label="ISO 9001 Clause" value={record.ISOClause} />
                  <FieldRead label="Related Company Document" value={record.CompanyDocument} />
                </div>
                <div className="mt-4 pt-3 border-t border-[#F0E4DF]">
                  <FieldRead label="Details of Incident or Nonconformity" value={record.Details} multiline />
                </div>
              </SectionBlock>

              {/* Section 2 */}
              <SectionBlock title="2. Correction (Immediate Action Taken)">
                {(() => {
                  const list = correctionsOf(record);
                  if (list.length === 0) return <EmptyLine text="None recorded." />;
                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-[#EAD9D4] text-left text-xs uppercase text-[#7A6F6F]">
                            <th className="py-2 pr-3">Correction</th>
                            <th className="py-2 pr-3">Date Completed</th>
                            <th className="py-2 pr-3">Person In-Charge</th>
                            <th className="py-2">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((c, idx) => (
                            <tr key={idx} className="border-b border-[#F0E4DF] last:border-b-0">
                              <td className="py-2 pr-3">{c.Correction || '—'}</td>
                              <td className="py-2 pr-3 font-mono-tabular whitespace-nowrap">
                                {c.DateCompleted || '—'}
                              </td>
                              <td className="py-2 pr-3">{c.PersonInCharge || '—'}</td>
                              <td className="py-2">{c.Result || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </SectionBlock>

              {/* Section 3 */}
              <SectionBlock title="3. Root Cause Analysis">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-[#7A6F6F] mb-1">
                      Contributing Factors (5 Whys)
                    </div>
                    {renderWhyFactors(record.RootCauseFactors)}
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-[#7A6F6F] mb-1">
                      Possible Root Cause(s)
                    </div>
                    {(() => {
                      const items = possibleRootCausesOf(record);
                      if (items.length === 0) return <span className="text-sm text-[#7A6F6F]">—</span>;
                      return (
                        <ul className="list-disc pl-5 text-sm space-y-1">
                          {items.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>
                  <FieldRead label="Validation Method" value={record.ValidationMethod} />
                  <FieldRead label="Validation Date" value={record.ValidationDate} />
                  <div className="md:col-span-2">
                    <FieldRead label="Results of Validation" value={record.ValidationResult} />
                  </div>
                </div>
              </SectionBlock>

              {/* Section 4 */}
              <SectionBlock title="4. Corrective Action Plan">
                <div className="mb-3">
                  <FieldRead label="True Root Cause" value={record.TrueRootCause} multiline />
                </div>
                {(() => {
                  const list = correctiveActionsOf(record);
                  if (list.length === 0) return <EmptyLine text="None recorded." />;
                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-[#EAD9D4] text-left text-xs uppercase text-[#7A6F6F]">
                            <th className="py-2 pr-3">Corrective Action</th>
                            <th className="py-2 pr-3">Person In-Charge / Target Date</th>
                            <th className="py-2">Date Implemented</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((c, idx) => (
                            <tr key={idx} className="border-b border-[#F0E4DF] last:border-b-0">
                              <td className="py-2 pr-3">{c.CorrectiveAction || '—'}</td>
                              <td className="py-2 pr-3">{c.ActionOwnerTargetDate || '—'}</td>
                              <td className="py-2 font-mono-tabular whitespace-nowrap">
                                {c.DateImplemented || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </SectionBlock>

              {/* Section 5 */}
              <SectionBlock title="5. General Evidence / Record">
                {(() => {
                  const links = evidenceLinksOf(record);
                  if (links.length === 0) return <EmptyLine text="No evidence attached." />;
                  return (
                    <div className="flex flex-wrap gap-3">
                      {links.map((url, idx) => (
                        <a
                          key={idx}
                          href={safeUrl(url)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B1A25] hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Evidence file {idx + 1}
                        </a>
                      ))}
                    </div>
                  );
                })()}
              </SectionBlock>

              {/* Section 6 */}
              <SectionBlock title="6. Sign-off">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldRead label="Prepared By" value={record.PreparedBy} />
                  <FieldRead label="Date Prepared" value={record.PreparedDate} />
                  <FieldRead label="Approved By" value={record.ApprovedBy} />
                  <FieldRead label="Date Approved" value={record.ApprovedDate} />
                  <FieldRead label="Conformed By" value={record.SignOffConformedBy} />
                  <FieldRead label="Date Conformed" value={record.SignOffConformedDate} />
                </div>
              </SectionBlock>

              {/* Section 7: Follow-up History */}
              {(() => {
                const fups = followUpsOf(record);
                if (fups.length === 0) return null;
                return (
                  <SectionBlock title="7. Auditor Follow-up / Verification History">
                    <div className="divide-y divide-[#F0E4DF]">
                      {fups
                        .slice()
                        .reverse()
                        .map((f, idx) => (
                          <div key={idx} className="py-2.5 first:pt-0 last:pb-0 text-sm space-y-1">
                            {f.CreatedAt && (
                              <div className="text-xs text-[#7A6F6F]">
                                {fmtDateTime(f.CreatedAt)}
                                {f.AddedBy ? ` · ${f.AddedBy}` : ''}
                              </div>
                            )}
                            <div>
                              <strong>Follow-up Date:</strong> {f.FollowUpDate}
                            </div>
                            <div>
                              <strong>Result of Verification:</strong> {f.ResultOfVerification}
                            </div>
                            <div>
                              <strong>Verified By:</strong> {f.VerifiedBy}
                              {f.ConformedBy ? ` · Conformed By: ${f.ConformedBy}` : ''}
                            </div>
                          </div>
                        ))}
                    </div>
                  </SectionBlock>
                );
              })()}

              {/* Comments */}
              <SectionBlock title="Comments">
                {comments.length === 0 ? (
                  <EmptyLine text="No comments yet." />
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
              </SectionBlock>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#EAD9D4] bg-[#F8F4F0] flex justify-end">
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

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#EAD9D4] rounded-lg overflow-hidden">
      <div className="bg-gradient-to-r from-[#6B1A25] to-[#4A1219] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider">
        {title}
      </div>
      <div className="p-4 bg-white">{children}</div>
    </div>
  );
}

function FieldRead({
  label,
  value,
  multiline,
}: {
  label: string;
  value?: string;
  multiline?: boolean;
}) {
  const hasVal = value !== undefined && value !== null && String(value).trim() !== '';
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-[#7A6F6F] mb-0.5">
        {label}
      </div>
      <div className={`text-sm text-[#2B2323] ${multiline ? 'whitespace-pre-wrap' : ''}`}>
        {hasVal ? value : <span className="text-[#7A6F6F]">—</span>}
      </div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="text-sm text-[#7A6F6F] py-1">{text}</div>;
}
