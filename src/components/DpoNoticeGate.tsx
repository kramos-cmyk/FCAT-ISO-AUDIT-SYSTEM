import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, LogOut, ShieldAlert } from 'lucide-react';
import { FCATLogo } from './BrandCrest';
import type { SessionUser } from '../lib/types';

const DPO_TIMEOUT_SECONDS = 120;

export function DpoNoticeGate({
  user,
  company,
  onConfirm,
  onDeclineOrTimeout,
}: {
  user: SessionUser;
  company: Record<string, string>;
  onConfirm: () => Promise<void> | void;
  onDeclineOrTimeout: (reason: string) => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(DPO_TIMEOUT_SECONDS);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (secondsLeft === 0 && !submitting) {
      onDeclineOrTimeout(
        'Your account was automatically logged out because the Privacy, Security, and Accountability Notice was not confirmed in time.'
      );
    }
  }, [secondsLeft, submitting, onDeclineOrTimeout]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, '0');
  const companyName =
    company.CompanyName || 'Fernandez College of Arts And Technology, Inc. (FCAT)';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-[#6B1A25] via-[#4A1219] to-[#33090F]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dpo-notice-title"
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-[#EAD9D4]"
      >
        <div className="h-1.5 bg-gradient-to-r from-[#C9A227] via-[#6B1A25] to-[#4A1219]" />

        <div className="p-6 sm:p-8">
          {/* School Logo & Institutional Header */}
          <div className="flex flex-col items-center text-center border-b border-[#EFE3DF] pb-5 mb-5">
            <FCATLogo logoUrl={company.LogoUrl} size="lg" alt="FCAT Official Seal" />
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#7A6F6F] mt-3">
              {companyName} · Data Protection Office
            </div>
            <h1
              id="dpo-notice-title"
              className="text-xl sm:text-2xl font-bold text-[#4A1219] mt-1 m-0"
            >
              Privacy, Security, and Accountability Notice
            </h1>
            <p className="text-xs text-[#7A6F6F] mt-1.5 m-0">
              Signed in as <strong className="text-[#2B2323]">{user.name}</strong> ({user.email})
            </p>
          </div>

          {/* Verbatim DPO Notice Text */}
<div className="mx-auto w-full max-w-3xl space-y-4 text-sm text-[#2B2323] leading-7 text-justify bg-[#FBF7F4] border border-[#EAD9D4] rounded-xl p-5 sm:p-7 max-h-[48vh] overflow-y-auto">

  <p className="m-0">
    By accessing and using this system, you acknowledge that the information you provide,
    upload, modify, or maintain within this platform may be processed and retained for
    legitimate institutional purposes, including ISO compliance, audit management, records
    management, reporting, security, and accountability.
  </p>

  <p className="m-0">
    System activities may be logged, including login attempts, access to records, data
    submissions, modifications, uploads, and other relevant transactions, subject to
    applicable institutional policies and data privacy regulations.
  </p>

  <p className="m-0">
    Personal information collected through this system shall be processed in accordance
    with applicable data privacy laws, institutional policies, and authorized retention and
    security procedures.
  </p>

  <p className="m-0">
    Users are responsible for ensuring that the information they enter is accurate,
    appropriate, and authorized for submission. Unauthorized access, disclosure,
    alteration, misuse, or extraction of information is strictly prohibited.
  </p>

  <p className="m-0">
    If you have questions, concerns, or requests regarding the processing of personal data,
    you may contact the institution&apos;s designated Data Protection Officer (DPO) through
    the official channels.
  </p>

</div>

          {/* Auto-logout Warning Banner */}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-[#FBF0D6]/70 border border-[#E7CF86] px-3.5 py-2.5 text-xs text-[#5E4700]">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-[#9A7400]" />
              <span>
                Confirmation is required to continue. Accounts that do not confirm will be
                automatically logged out.
              </span>
            </div>
            <span className="inline-flex items-center gap-1 font-mono-tabular font-bold shrink-0 text-[#4A1219]">
              <Clock className="h-3.5 w-3.5" />
              {mins}:{secs}
            </span>
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                onDeclineOrTimeout(
                  'You were logged out because you did not confirm the Privacy, Security, and Accountability Notice.'
                )
              }
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-[#DFD0CC] bg-white hover:bg-[#F8F4F0] text-[#574D4D] text-sm font-semibold cursor-pointer disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              Decline &amp; Log Out
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirm}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#6B1A25] hover:bg-[#4A1219] text-white text-sm font-semibold shadow-sm cursor-pointer disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4 text-[#C9A227]" />
              {submitting ? 'Confirming...' : 'I Confirm & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
