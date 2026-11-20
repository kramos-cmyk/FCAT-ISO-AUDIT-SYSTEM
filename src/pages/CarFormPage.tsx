import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Plus, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api';
import {
  correctiveActionsOf,
  correctionsOf,
  evidenceLinksOf,
  fmtDateTime,
  followUpsOf,
  isAuditorRole,
  isProcessOwnerRole,
  normalizeInputDate,
  possibleRootCausesOf,
  safeUrl,
} from '../lib/format';
import type {
  CarRecord,
  CorrectionEntry,
  CorrectiveActionEntry,
  FollowUpEntry,
  SessionUser,
} from '../lib/types';
import { OfficialCarHeader } from '../components/BrandCrest';
import { useToast } from '../components/Toast';

const FACTORS = ['Man', 'Method', 'Machine', 'Material', 'Environment'] as const;
type WhyMap = Record<(typeof FACTORS)[number], string[]>;

function emptyWhys(): WhyMap {
  return {
    Man: ['', '', '', '', ''],
    Method: ['', '', '', '', ''],
    Machine: ['', '', '', '', ''],
    Material: ['', '', '', '', ''],
    Environment: ['', '', '', '', ''],
  };
}

export function CarFormPage({
  carNo,
  user,
  company,
  mode,
  onDone,
}: {
  carNo?: string;
  user: SessionUser;
  company: Record<string, string>;
  mode?: 'auditor' | 'owner';
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const canBeAuditor = isAuditorRole(user.role);
  const canBeOwner = isProcessOwnerRole(user.role);
  const isDualRole = canBeAuditor && canBeOwner;
  const [roleMode, setRoleMode] = useState<'auditor' | 'owner'>(() =>
    mode === 'owner' && canBeOwner ? 'owner' : canBeAuditor ? 'auditor' : 'owner'
  );
  const isAuditor = roleMode === 'auditor' && canBeAuditor;

  useEffect(() => {
    setRoleMode(mode === 'owner' && canBeOwner ? 'owner' : canBeAuditor ? 'auditor' : 'owner');
  }, [mode, carNo, canBeAuditor, canBeOwner]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [departments, setDepartments] = useState<string[]>([]);
  const [editRecord, setEditRecord] = useState<CarRecord | null>(null);

  // Section 1: Finding Details
  const [customCarNo, setCustomCarNo] = useState('');
  const [receivedService, setReceivedService] = useState('');
  const [type, setType] = useState('');
  const [source, setSource] = useState('');
  const [department, setDepartment] = useState('');
  const [dateIssued, setDateIssued] = useState('');
  const [isoClause, setIsoClause] = useState('');
  const [companyDoc, setCompanyDoc] = useState('');
  const [details, setDetails] = useState('');

  // Section 2: Correction
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([]);

  // Section 3: Root Cause Analysis
  const [whyMap, setWhyMap] = useState<WhyMap>(emptyWhys());
  const [possibleRootCauses, setPossibleRootCauses] = useState<string[]>([]);
  const [validationMethod, setValidationMethod] = useState('');
  const [validationDate, setValidationDate] = useState('');
  const [validationResult, setValidationResult] = useState('');

  // Section 4: Corrective Action Plan
  const [trueRootCause, setTrueRootCause] = useState('');
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveActionEntry[]>([]);

  // Section 5: General Evidence
  const [existingEvidence, setExistingEvidence] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // Section 6: Sign-off
  const [preparedBy, setPreparedBy] = useState('');
  const [preparedDate, setPreparedDate] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [approvedDate, setApprovedDate] = useState('');
  const [conformedBy, setConformedBy] = useState('');
  const [conformedDate, setConformedDate] = useState('');

  // Section 7: Follow-up (Auditor only)
  const [followUps, setFollowUps] = useState<FollowUpEntry[]>([]);
  const [nfDate, setNfDate] = useState('');
  const [nfVerifiedBy, setNfVerifiedBy] = useState('');
  const [nfResult, setNfResult] = useState('');
  const [nfConformedBy, setNfConformedBy] = useState('');
  const [addingFollowUp, setAddingFollowUp] = useState(false);

  // Field validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!carNo && !canBeAuditor) {
      showToast(
        'Only Auditors can raise a new finding. Open an existing record from your department list to work on it.',
        'error'
      );
      onDone();
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.getDepartments().catch(() => []),
      carNo ? api.getCAR(carNo) : Promise.resolve(null),
    ])
      .then(([depts, rec]) => {
        if (cancelled) return;
        setDepartments(depts || []);

        if (carNo && !rec) {
          showToast('Record not found.', 'error');
          onDone();
          return;
        }

        if (rec) {
          setEditRecord(rec);
          setReceivedService(
            !rec.EmployeeID && rec.EmployeeName && rec.EmployeeName !== '(Unassigned)'
              ? rec.EmployeeName
              : ''
          );
          setType(rec.Type || '');
          setSource(rec.Source || '');
          setDepartment(rec.Department || '');
          setDateIssued(normalizeInputDate(rec.DateIssued));
          setIsoClause(rec.ISOClause || '');
          setCompanyDoc(rec.CompanyDocument || '');
          setDetails(rec.Details || '');

          setCorrections(correctionsOf(rec));
          setPossibleRootCauses(possibleRootCausesOf(rec));
          setValidationMethod(rec.ValidationMethod || '');
          setValidationDate(normalizeInputDate(rec.ValidationDate));
          setValidationResult(rec.ValidationResult || '');

          setTrueRootCause(rec.TrueRootCause || '');
          setCorrectiveActions(correctiveActionsOf(rec));
          setExistingEvidence(evidenceLinksOf(rec));

          setPreparedBy(rec.PreparedBy || '');
          setPreparedDate(normalizeInputDate(rec.PreparedDate));
          setApprovedBy(rec.ApprovedBy || '');
          setApprovedDate(normalizeInputDate(rec.ApprovedDate));
          setConformedBy(rec.SignOffConformedBy || '');
          setConformedDate(normalizeInputDate(rec.SignOffConformedDate));

          setFollowUps(followUpsOf(rec));

          if (rec.RootCauseFactors) {
            try {
              const parsed = JSON.parse(rec.RootCauseFactors);
              const next = emptyWhys();
              for (const f of FACTORS) {
                if (Array.isArray(parsed[f])) {
                  next[f] = [0, 1, 2, 3, 4].map((i) => String(parsed[f][i] ?? ''));
                }
              }
              setWhyMap(next);
            } catch {
              setWhyMap(emptyWhys());
            }
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : 'Could not load this form.', 'error');
          onDone();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [carNo, canBeAuditor]);

  const deptOptions = useMemo(() => {
    const list = departments.slice();
    if (editRecord?.Department && !list.includes(editRecord.Department)) {
      list.push(editRecord.Department);
    }
    if (receivedService && !list.includes(receivedService)) {
      list.push(receivedService);
    }
    return list.sort();
  }, [departments, editRecord, receivedService]);

  const handleReceivedServiceChange = (nextService: string) => {
    setReceivedService(nextService);
    if (nextService && !department) {
      setDepartment(nextService);
      setErrors((prev) => ({ ...prev, Department: '' }));
    }
  };

  const handleDepartmentChange = (nextDept: string) => {
    setDepartment(nextDept);
  };

  const isOFI = type === 'Opportunity for Improvement (OFI)';
  const lockSection1 = !isAuditor;

  const validate = (): boolean => {
    const nextErr: Record<string, string> = {};
    if (!type) nextErr.Type = 'This field is required.';
    if (!source) nextErr.Source = 'This field is required.';
    if (!department) nextErr.Department = 'This field is required.';
    if (!dateIssued) nextErr.DateIssued = 'This field is required.';
    if (!isOFI && !details.trim()) nextErr.Details = 'This field is required.';

    if (!editRecord && customCarNo.trim() && !/^[A-Za-z0-9._-]{1,40}$/.test(customCarNo.trim())) {
      nextErr.CARNo = 'Only letters, numbers, periods, hyphens, and underscores (max 40 chars).';
    }

    if (!isAuditor) {
      const validCorrections = corrections.filter((c) =>
        Object.values(c).some((v) => String(v || '').trim() !== '')
      );
      if (validCorrections.length === 0) nextErr.CorrectionEntries = 'Add at least one correction.';

      const validRcs = possibleRootCauses.map((s) => s.trim()).filter(Boolean);
      if (validRcs.length === 0) nextErr.PossibleRootCauseEntries = 'Add at least one possible root cause.';

      const validCas = correctiveActions.filter((c) =>
        Object.values(c).some((v) => String(v || '').trim() !== '')
      );
      if (validCas.length === 0) nextErr.CorrectiveActionEntries = 'Add at least one corrective action.';

      if (!validationMethod.trim()) nextErr.ValidationMethod = 'This field is required.';
      if (!validationDate) nextErr.ValidationDate = 'This field is required.';
      if (!validationResult.trim()) nextErr.ValidationResult = 'This field is required.';
      if (!trueRootCause.trim()) nextErr.TrueRootCause = 'This field is required.';
      if (!preparedBy.trim()) nextErr.PreparedBy = 'This field is required.';
      if (!preparedDate) nextErr.PreparedDate = 'This field is required.';
      if (!approvedBy.trim()) nextErr.ApprovedBy = 'This field is required.';
      if (!approvedDate) nextErr.ApprovedDate = 'This field is required.';
      if (!conformedBy.trim()) nextErr.SignOffConformedBy = 'This field is required.';
      if (!conformedDate) nextErr.SignOffConformedDate = 'This field is required.';

      if (existingEvidence.length === 0 && pendingFiles.length === 0) {
        nextErr.Evidence = 'You must attach at least one general evidence file before saving.';
      }
    }

    setErrors(nextErr);
    return Object.keys(nextErr).length === 0;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const accepted: File[] = [];
    for (const f of files) {
      if (f.size > 15 * 1024 * 1024) {
        showToast(`${f.name} is too large (max 15MB).`, 'error');
      } else {
        accepted.push(f);
      }
    }
    if (accepted.length > 0) {
      setPendingFiles((prev) => [...prev, ...accepted]);
      setErrors((prev) => ({ ...prev, Evidence: '' }));
    }
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      showToast('Please complete all required fields and attach evidence.', 'error');
      return;
    }

    setSaving(true);
    try {
      const carRef = editRecord ? editRecord.CARNo : customCarNo.trim() || 'PENDING';
      const uploadedUrls: string[] = [];
      for (const f of pendingFiles) {
        const up = await api.uploadEvidence(carRef, f);
        if (!up.ok || !up.url) throw new Error(up.error || `Failed to upload ${f.name}`);
        uploadedUrls.push(up.url);
      }

      const allEvidence = [...existingEvidence, ...uploadedUrls];
      const cleanedCorrections = corrections.filter((c) =>
        Object.values(c).some((v) => String(v || '').trim() !== '')
      );
      const cleanedRcs = possibleRootCauses.map((s) => s.trim()).filter(Boolean);
      const cleanedCas = correctiveActions.filter((c) =>
        Object.values(c).some((v) => String(v || '').trim() !== '')
      );

      const payload: Record<string, unknown> = {
        Type: type,
        Source: source,
        Department: department,
        DateIssued: dateIssued,
        ISOClause: isoClause.trim(),
        CompanyDocument: companyDoc.trim(),
        Details: details.trim(),
        CorrectionEntries: JSON.stringify(cleanedCorrections),
        RootCauseFactors: JSON.stringify(whyMap),
        PossibleRootCauseEntries: JSON.stringify(cleanedRcs),
        ValidationMethod: validationMethod.trim(),
        ValidationDate: validationDate,
        ValidationResult: validationResult.trim(),
        TrueRootCause: trueRootCause.trim(),
        CorrectiveActionEntries: JSON.stringify(cleanedCas),
        EvidenceLinks: JSON.stringify(allEvidence),
        PreparedBy: preparedBy.trim(),
        PreparedDate: preparedDate,
        ApprovedBy: approvedBy.trim(),
        ApprovedDate: approvedDate,
        SignOffConformedBy: conformedBy.trim(),
        SignOffConformedDate: conformedDate,
      };

      if (isAuditor) {
        payload.ReceivedService = receivedService;
        payload.EmployeeID = '';
      } else if (editRecord) {
        payload.submitAs = 'owner';
      }

      if (editRecord) {
        const res = await api.updateCAR(editRecord.CARNo, payload);
        if (!res.ok) {
          showToast(res.error || 'Could not save changes.', 'error');
          return;
        }
        showToast(`Changes saved: ${editRecord.CARNo}`, 'success');
        onDone();
      } else {
        if (customCarNo.trim()) payload.CARNo = customCarNo.trim();
        const res = await api.submitCAR(payload);
        if (!res.ok) {
          showToast(res.error || 'Could not save record.', 'error');
          return;
        }
        showToast(`Saved successfully: ${res.carNo}`, 'success');
        onDone();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFollowUp = async () => {
    if (!editRecord) return;
    if (!nfDate || !nfResult.trim() || !nfVerifiedBy.trim()) {
      showToast('Follow-up date, result of verification, and verified by are required.', 'error');
      return;
    }
    setAddingFollowUp(true);
    try {
      const res = await api.addFollowUp(editRecord.CARNo, {
        FollowUpDate: nfDate,
        ResultOfVerification: nfResult.trim(),
        VerifiedBy: nfVerifiedBy.trim(),
        ConformedBy: nfConformedBy.trim(),
      });
      if (!res.ok) {
        showToast(res.error || 'Could not add follow-up.', 'error');
        return;
      }
      setFollowUps((res.entries as FollowUpEntry[]) || []);
      setNfDate('');
      setNfResult('');
      setNfVerifiedBy('');
      setNfConformedBy('');
      showToast('Follow-up added.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add follow-up.', 'error');
    } finally {
      setAddingFollowUp(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-10 text-center text-sm text-[#7A6F6F]">
        Loading form...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <OfficialCarHeader
        companyName={company.CompanyName}
        standard={company.Standard}
        logoUrl={company.LogoUrl}
      />

      {editRecord && editRecord.AdminFlag === 'Needs Attention' && (
        <div className="bg-[#FBF0D6] border border-[#E7CF86] text-[#6B5300] rounded-xl px-5 py-3.5 text-sm">
          <strong>This record was flagged by an Auditor:</strong> {editRecord.AdminNote || ''}
          <div className="text-xs mt-1">
            Update the details below and save to resubmit — this will clear the flag.
          </div>
        </div>
      )}

      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm space-y-6">
        {isDualRole && editRecord && (
          <div className="bg-[#FAF6F4] border border-[#EAD9D4] rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-[#4A1219]">
              <div className="font-bold">Dual-Role Account: Auditor &amp; Process Owner</div>
              <div className="text-[#7A6F6F] mt-0.5">
                {isAuditor
                  ? 'Currently editing in Auditor Mode (Finding Details & Follow-up Verification).'
                  : 'Currently editing in Process Owner Mode (Department Response, Evidence & Flag Resubmission).'}
              </div>
            </div>
            <div className="inline-flex rounded-lg border border-[#EAD9D4] bg-white p-0.5 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  setRoleMode('owner');
                  setErrors({});
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                  roleMode === 'owner'
                    ? 'bg-[#6B1A25] text-white'
                    : 'text-[#4A1219] hover:bg-[#F8F4F0]'
                }`}
              >
                Process Owner Mode
              </button>
              <button
                type="button"
                onClick={() => {
                  setRoleMode('auditor');
                  setErrors({});
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                  roleMode === 'auditor'
                    ? 'bg-[#6B1A25] text-white'
                    : 'text-[#4A1219] hover:bg-[#F8F4F0]'
                }`}
              >
                Auditor Mode
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-[#7A6F6F] m-0">
          Based on FO-RI-05 Corrective Action Report. Fields marked{' '}
          <span className="text-[#A32424]">*</span> are required.
          {editRecord ? (
            <>
              {' '}
              CAR No. <strong className="font-mono-tabular text-[#4A1219]">{editRecord.CARNo}</strong>.
            </>
          ) : null}
        </p>

        {/* SECTION 1 */}
        <FormSection title={`1. Finding Details${!isAuditor ? ' (set by Auditor)' : ''}`}>
          {!isAuditor && (
            <p className="text-xs text-[#7A6F6F] mt-0 mb-3">
              These fields were set by the Auditor who raised this finding and cannot be changed here.
            </p>
          )}

          {isAuditor ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Raised By (Auditor)" />
                <input
                  type="text"
                  disabled
                  value={editRecord ? editRecord.RaisedBy || user.name : user.name}
                  className={disabledInputCls}
                />
              </div>
              <div>
                <FieldLabel label="Received By (Service — accounts with this service can view)" />
                <select
                  value={receivedService}
                  onChange={(e) => handleReceivedServiceChange(e.target.value)}
                  className={inputCls()}
                >
                  <option value="">-- Unassigned (anyone in selected Department / Process) --</option>
                  {deptOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : editRecord ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Raised By (Auditor)" />
                <input type="text" disabled value={editRecord.RaisedBy || '—'} className={disabledInputCls} />
              </div>
              <div>
                <FieldLabel label="Received By" />
                <input
                  type="text"
                  disabled
                  value={
                    editRecord.EmployeeName && editRecord.EmployeeName !== '(Unassigned)'
                      ? editRecord.EmployeeName
                      : editRecord.Department || 'Unclaimed'
                  }
                  className={disabledInputCls}
                />
              </div>
            </div>
          ) : null}

          {!editRecord && (
            <div className="mt-3">
              <FieldLabel label="CAR No. (optional — auto-generated if left blank)" />
              <input
                type="text"
                maxLength={40}
                value={customCarNo}
                disabled={lockSection1}
                onChange={(e) => setCustomCarNo(e.target.value)}
                placeholder="e.g. CAR-2026-001"
                className={inputCls(errors.CARNo)}
              />
              {errors.CARNo && <FieldErr msg={errors.CARNo} />}
              <p className="text-[11px] text-[#7A6F6F] mt-1">
                Once saved, the CAR No. cannot be changed.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div>
              <FieldLabel label="Type of Finding" required />
              <select
                value={type}
                disabled={lockSection1}
                onChange={(e) => setType(e.target.value)}
                className={inputCls(errors.Type, lockSection1)}
              >
                <option value="">-- Select --</option>
                <option value="Nonconformity (NC)">Nonconformity (NC)</option>
                <option value="Opportunity for Improvement (OFI)">Opportunity for Improvement (OFI)</option>
              </select>
              {errors.Type && <FieldErr msg={errors.Type} />}
            </div>

            <div>
              <FieldLabel label="Source of Incident / Nonconformity" required />
              <select
                value={source}
                disabled={lockSection1}
                onChange={(e) => setSource(e.target.value)}
                className={inputCls(errors.Source, lockSection1)}
              >
                <option value="">-- Select --</option>
                <option value="Internal Audit">Internal Audit</option>
                <option value="External Audit">External Audit</option>
                <option value="Customer Complaint">Customer Complaint</option>
                <option value="Unmet KPIs">Unmet KPIs</option>
                <option value="Nonconforming Output/Services">Nonconforming Output/Services</option>
                <option value="Others">Others</option>
              </select>
              {errors.Source && <FieldErr msg={errors.Source} />}
            </div>

            <div>
              <FieldLabel label="Department / Process" required />
              <select
                value={department}
                disabled={lockSection1}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className={inputCls(errors.Department, lockSection1)}
              >
                <option value="">-- Select department --</option>
                {deptOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {errors.Department && <FieldErr msg={errors.Department} />}
            </div>

            <div>
              <FieldLabel label="Date Issued" required />
              <input
                type="date"
                value={dateIssued}
                disabled={lockSection1}
                onChange={(e) => setDateIssued(e.target.value)}
                className={inputCls(errors.DateIssued, lockSection1)}
              />
              {errors.DateIssued && <FieldErr msg={errors.DateIssued} />}
            </div>

            <div>
              <FieldLabel label="ISO 9001 Clause" />
              <input
                type="text"
                value={isoClause}
                disabled={lockSection1}
                onChange={(e) => setIsoClause(e.target.value)}
                placeholder="e.g. 8.5.1"
                className={inputCls(undefined, lockSection1)}
              />
            </div>

            <div>
              <FieldLabel label="Related Company Document" />
              <input
                type="text"
                value={companyDoc}
                disabled={lockSection1}
                onChange={(e) => setCompanyDoc(e.target.value)}
                placeholder="e.g. FO-RI-05"
                className={inputCls(undefined, lockSection1)}
              />
            </div>
          </div>

          <div className="mt-3">
            <FieldLabel label="Details of Incident or Nonconformity" required={!isOFI} />
            <textarea
              rows={3}
              value={details}
              disabled={lockSection1}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe what happened..."
              className={inputCls(errors.Details, lockSection1)}
            />
            {errors.Details && <FieldErr msg={errors.Details} />}
          </div>
        </FormSection>

        {/* SECTION 2 */}
        <FormSection title="2. Correction (Immediate Action Taken)" required={!isAuditor}>
          <p className="text-xs text-[#7A6F6F] mt-0 mb-3">
            Add a row for each correction taken. {!isAuditor ? 'At least one is required.' : ''}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-[#EAD9D4] text-left text-xs text-[#7A6F6F]">
                  <th className="py-2 pr-2">Correction</th>
                  <th className="py-2 pr-2">Date Completed</th>
                  <th className="py-2 pr-2">Person In-Charge</th>
                  <th className="py-2 pr-2">Result</th>
                  <th className="py-2 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E4DF]">
                {corrections.map((row, idx) => (
                  <tr key={idx}>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={row.Correction}
                        placeholder="Immediate action taken"
                        onChange={(e) =>
                          setCorrections((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, Correction: e.target.value } : r))
                          )
                        }
                        className={inputCls()}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="date"
                        value={normalizeInputDate(row.DateCompleted)}
                        onChange={(e) =>
                          setCorrections((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, DateCompleted: e.target.value } : r))
                          )
                        }
                        className={inputCls()}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={row.PersonInCharge}
                        onChange={(e) =>
                          setCorrections((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, PersonInCharge: e.target.value } : r))
                          )
                        }
                        className={inputCls()}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={row.Result}
                        onChange={(e) =>
                          setCorrections((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, Result: e.target.value } : r))
                          )
                        }
                        className={inputCls()}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setCorrections((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove correction row"
                        className="p-2 rounded-md border border-[#EAD9D4] text-[#7A6F6F] hover:text-[#A32424] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() =>
              setCorrections((prev) => [
                ...prev,
                { Correction: '', DateCompleted: '', PersonInCharge: '', Result: '' },
              ])
            }
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#6B1A25] text-[#6B1A25] hover:bg-[#6B1A25] hover:text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Correction
          </button>
          {errors.CorrectionEntries && <FieldErr msg={errors.CorrectionEntries} />}
        </FormSection>

        {/* SECTION 3 */}
        <FormSection title="3. Root Cause Analysis">
          <FieldLabel label="5 Whys Analysis by Contributing Factors" />
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-xs border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-[#EAD9D4] text-left text-[#7A6F6F]">
                  <th className="py-2 pr-2 w-28">Factor</th>
                  <th className="py-2 pr-2">Why 1</th>
                  <th className="py-2 pr-2">Why 2</th>
                  <th className="py-2 pr-2">Why 3</th>
                  <th className="py-2 pr-2">Why 4</th>
                  <th className="py-2">Why 5</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E4DF]">
                {FACTORS.map((factor) => (
                  <tr key={factor}>
                    <td className="py-2 pr-2 font-bold text-[#4A1219]">{factor}</td>
                    {[0, 1, 2, 3, 4].map((idx) => (
                      <td key={idx} className="py-1.5 pr-1.5 last:pr-0">
                        <input
                          type="text"
                          value={whyMap[factor][idx]}
                          placeholder={`Why ${idx + 1}`}
                          onChange={(e) => {
                            const val = e.target.value;
                            setWhyMap((prev) => {
                              const arr = prev[factor].slice();
                              arr[idx] = val;
                              return { ...prev, [factor]: arr };
                            });
                          }}
                          className="w-full rounded border border-[#EAD9D4] px-2 py-1.5 text-xs focus:outline-none focus:border-[#6B1A25]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <FieldLabel label="Possible Root Cause(s)" required={!isAuditor} />
          <p className="text-xs text-[#7A6F6F] mt-0 mb-2">
            Add one entry per possible root cause. {!isAuditor ? 'At least one is required.' : ''}
          </p>
          <div className="space-y-2">
            {possibleRootCauses.map((rc, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <textarea
                  rows={2}
                  value={rc}
                  placeholder="Possible root cause..."
                  onChange={(e) =>
                    setPossibleRootCauses((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                  }
                  className={inputCls()}
                />
                <button
                  type="button"
                  onClick={() => setPossibleRootCauses((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Remove possible root cause"
                  className="p-2 rounded-md border border-[#EAD9D4] text-[#7A6F6F] hover:text-[#A32424] cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPossibleRootCauses((prev) => [...prev, ''])}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#6B1A25] text-[#6B1A25] hover:bg-[#6B1A25] hover:text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Possible Root Cause
          </button>
          {errors.PossibleRootCauseEntries && <FieldErr msg={errors.PossibleRootCauseEntries} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <FieldLabel label="Validation Method" required={!isAuditor} />
              <input
                type="text"
                value={validationMethod}
                onChange={(e) => setValidationMethod(e.target.value)}
                className={inputCls(errors.ValidationMethod)}
              />
              {errors.ValidationMethod && <FieldErr msg={errors.ValidationMethod} />}
            </div>
            <div>
              <FieldLabel label="Validation Date" required={!isAuditor} />
              <input
                type="date"
                value={validationDate}
                onChange={(e) => setValidationDate(e.target.value)}
                className={inputCls(errors.ValidationDate)}
              />
              {errors.ValidationDate && <FieldErr msg={errors.ValidationDate} />}
            </div>
          </div>

          <div className="mt-3">
            <FieldLabel label="Results of Validation" required={!isAuditor} />
            <input
              type="text"
              value={validationResult}
              onChange={(e) => setValidationResult(e.target.value)}
              className={inputCls(errors.ValidationResult)}
            />
            {errors.ValidationResult && <FieldErr msg={errors.ValidationResult} />}
          </div>
        </FormSection>

        {/* SECTION 4 */}
        <FormSection title="4. Corrective Action Plan" required={!isAuditor}>
          <div>
            <FieldLabel label="True Root Cause" required={!isAuditor} />
            <textarea
              rows={2}
              value={trueRootCause}
              onChange={(e) => setTrueRootCause(e.target.value)}
              className={inputCls(errors.TrueRootCause)}
            />
            {errors.TrueRootCause && <FieldErr msg={errors.TrueRootCause} />}
          </div>

          <p className="text-xs text-[#7A6F6F] mt-3 mb-2">
            Add a row for each corrective action. {!isAuditor ? 'At least one is required.' : ''}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-[#EAD9D4] text-left text-xs text-[#7A6F6F]">
                  <th className="py-2 pr-2">Corrective Action</th>
                  <th className="py-2 pr-2">Person In-Charge / Target Date</th>
                  <th className="py-2 pr-2">Date Implemented</th>
                  <th className="py-2 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E4DF]">
                {correctiveActions.map((row, idx) => (
                  <tr key={idx}>
                    <td className="py-2 pr-2">
                      <textarea
                        rows={2}
                        value={row.CorrectiveAction}
                        placeholder="Step-by-step corrective action"
                        onChange={(e) =>
                          setCorrectiveActions((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, CorrectiveAction: e.target.value } : r))
                          )
                        }
                        className={inputCls()}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={row.ActionOwnerTargetDate}
                        placeholder="e.g. Dean Banan / Sept 30, 2026"
                        onChange={(e) =>
                          setCorrectiveActions((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, ActionOwnerTargetDate: e.target.value } : r
                            )
                          )
                        }
                        className={inputCls()}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="date"
                        value={normalizeInputDate(row.DateImplemented)}
                        onChange={(e) =>
                          setCorrectiveActions((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, DateImplemented: e.target.value } : r))
                          )
                        }
                        className={inputCls()}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setCorrectiveActions((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove corrective action row"
                        className="p-2 rounded-md border border-[#EAD9D4] text-[#7A6F6F] hover:text-[#A32424] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() =>
              setCorrectiveActions((prev) => [
                ...prev,
                { CorrectiveAction: '', ActionOwnerTargetDate: '', DateImplemented: '' },
              ])
            }
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#6B1A25] text-[#6B1A25] hover:bg-[#6B1A25] hover:text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Corrective Action
          </button>
          {errors.CorrectiveActionEntries && <FieldErr msg={errors.CorrectiveActionEntries} />}
        </FormSection>

        {/* SECTION 5 */}
        <FormSection title="5. General Evidence / Record" required={!isAuditor}>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#EAD9D4] hover:border-[#6B1A25] rounded-xl p-5 text-center cursor-pointer transition-colors bg-[#FCF6F3]/40">
            <Upload className="h-5 w-5 text-[#6B1A25] mb-1.5" />
            <span className="text-xs font-semibold text-[#4A1219]">
              Click to attach one or more evidence files (photos, documents, scanned approvals)
            </span>
            <span className="text-[11px] text-[#7A6F6F] mt-0.5">Max 15MB per file</span>
            <input type="file" multiple className="hidden" onChange={handleFileSelect} />
          </label>

          {(existingEvidence.length > 0 || pendingFiles.length > 0) && (
            <div className="mt-3 divide-y divide-[#F0E4DF]">
              {existingEvidence.map((url, idx) => (
                <div key={url + idx} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <a
                    href={safeUrl(url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#6B1A25] font-medium hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Evidence file {idx + 1}
                  </a>
                  <button
                    type="button"
                    onClick={() => setExistingEvidence((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-xs font-semibold text-[#7A6F6F] hover:text-[#A32424] cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {pendingFiles.map((f, idx) => (
                <div key={f.name + idx} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <span>
                    {f.name} <span className="text-xs text-[#7A6F6F]">(will upload on save)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-xs font-semibold text-[#7A6F6F] hover:text-[#A32424] cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {errors.Evidence && <FieldErr msg={errors.Evidence} />}
        </FormSection>

        {/* SECTION 6 */}
        <FormSection title="6. Sign-off">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Prepared By (Process Owner)" required={!isAuditor} />
              <input
                type="text"
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                className={inputCls(errors.PreparedBy)}
              />
              {errors.PreparedBy && <FieldErr msg={errors.PreparedBy} />}
            </div>
            <div>
              <FieldLabel label="Date Prepared" required={!isAuditor} />
              <input
                type="date"
                value={preparedDate}
                onChange={(e) => setPreparedDate(e.target.value)}
                className={inputCls(errors.PreparedDate)}
              />
              {errors.PreparedDate && <FieldErr msg={errors.PreparedDate} />}
            </div>

            <div>
              <FieldLabel label="Approved By (Immediate Head)" required={!isAuditor} />
              <input
                type="text"
                value={approvedBy}
                onChange={(e) => setApprovedBy(e.target.value)}
                className={inputCls(errors.ApprovedBy)}
              />
              {errors.ApprovedBy && <FieldErr msg={errors.ApprovedBy} />}
            </div>
            <div>
              <FieldLabel label="Date Approved" required={!isAuditor} />
              <input
                type="date"
                value={approvedDate}
                onChange={(e) => setApprovedDate(e.target.value)}
                className={inputCls(errors.ApprovedDate)}
              />
              {errors.ApprovedDate && <FieldErr msg={errors.ApprovedDate} />}
            </div>

            <div>
              <FieldLabel label="Conformed By" required={!isAuditor} />
              <input
                type="text"
                value={conformedBy}
                onChange={(e) => setConformedBy(e.target.value)}
                placeholder="Conformed by"
                className={inputCls(errors.SignOffConformedBy)}
              />
              {errors.SignOffConformedBy && <FieldErr msg={errors.SignOffConformedBy} />}
            </div>
            <div>
              <FieldLabel label="Date Conformed" required={!isAuditor} />
              <input
                type="date"
                value={conformedDate}
                onChange={(e) => setConformedDate(e.target.value)}
                className={inputCls(errors.SignOffConformedDate)}
              />
              {errors.SignOffConformedDate && <FieldErr msg={errors.SignOffConformedDate} />}
            </div>
          </div>
        </FormSection>

        {/* SECTION 7: Auditor Follow-up */}
        {isAuditor && editRecord && (
          <FormSection title="7. Auditor Follow-up / Verification (Auditor Only)">
            <p className="text-xs text-[#7A6F6F] mt-0 mb-3">
              Each follow-up is kept permanently as a history — adding a new one never replaces a previous check-in.
            </p>
            {followUps.length === 0 ? (
              <div className="text-sm text-[#7A6F6F] py-2">No follow-ups recorded yet.</div>
            ) : (
              <div className="divide-y divide-[#F0E4DF] mb-4">
                {followUps
                  .slice()
                  .reverse()
                  .map((f, idx) => (
                    <div key={idx} className="py-2.5 text-sm space-y-0.5">
                      <div className="text-xs text-[#7A6F6F]">
                        {f.CreatedAt ? fmtDateTime(f.CreatedAt) : ''}
                        {f.AddedBy ? ` · ${f.AddedBy}` : ''}
                      </div>
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
            )}

            <div className="pt-4 border-t border-[#EAD9D4] space-y-3">
              <div className="text-sm font-bold text-[#4A1219]">Add Follow-up</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel label="Follow-up Date" />
                  <input
                    type="date"
                    value={nfDate}
                    onChange={(e) => setNfDate(e.target.value)}
                    className={inputCls()}
                  />
                </div>
                <div>
                  <FieldLabel label="Verified By" />
                  <input
                    type="text"
                    value={nfVerifiedBy}
                    onChange={(e) => setNfVerifiedBy(e.target.value)}
                    className={inputCls()}
                  />
                </div>
              </div>
              <div>
                <FieldLabel label="Result of Verification" />
                <textarea
                  rows={2}
                  value={nfResult}
                  onChange={(e) => setNfResult(e.target.value)}
                  className={inputCls()}
                />
              </div>
              <div>
                <FieldLabel label="Conformed By" />
                <input
                  type="text"
                  value={nfConformedBy}
                  onChange={(e) => setNfConformedBy(e.target.value)}
                  className={inputCls()}
                />
              </div>
              <button
                type="button"
                disabled={addingFollowUp}
                onClick={handleAddFollowUp}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
              >
                {addingFollowUp ? 'Adding...' : 'Add Follow-up'}
              </button>
            </div>
          </FormSection>
        )}

        {isAuditor && !editRecord && (
          <div className="bg-[#F8F4F0] border border-[#EAD9D4] rounded-lg px-4 py-3 text-xs text-[#7A6F6F]">
            Auditor Follow-up / Verification becomes available once this finding has been saved.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 text-sm font-bold rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : editRecord ? 'Save Changes' : 'Save Record'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="px-5 py-2.5 text-sm font-semibold rounded-lg border border-[#EAD9D4] text-[#4A1219] hover:bg-[#F8F4F0] cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

const disabledInputCls =
  'w-full rounded-lg border border-[#EAD9D4] bg-[#F8F4F0] px-3 py-2 text-sm text-[#7A6F6F] cursor-not-allowed';

function inputCls(error?: string, disabled?: boolean) {
  if (disabled) return disabledInputCls;
  return `w-full rounded-lg border px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#6B1A25] ${
    error ? 'border-[#A32424]' : 'border-[#EAD9D4]'
  }`;
}

function FormSection({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[#EAD9D4] rounded-lg overflow-hidden">
      <div className="bg-gradient-to-r from-[#6B1A25] to-[#4A1219] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider">
        {title}
        {required ? ' *' : ''}
      </div>
      <div className="p-4 bg-white">{children}</div>
    </div>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-[#4A1219] mb-1">
      {label}
      {required && <span className="text-[#A32424] ml-0.5">*</span>}
    </label>
  );
}

function FieldErr({ msg }: { msg: string }) {
  return <div className="text-xs text-[#A32424] mt-1">{msg}</div>;
}
