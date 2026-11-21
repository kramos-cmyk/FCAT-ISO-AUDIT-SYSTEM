import React from 'react';
import { APP_VERSION_HISTORY } from '../lib/fcatPortalInfo';

export function TermsPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[#4A1219] m-0">Terms of Use</h1>
          <p className="text-xs text-[#7A6F6F] mt-1">Effective as of the date this system is deployed.</p>
        </div>

        <section>
          <h2 className="text-base font-bold text-[#4A1219] m-0">1. Purpose</h2>
          <p className="text-sm text-[#2B2323] mt-1 leading-relaxed">
            This system is provided for the internal recording, tracking, and closure of ISO 9001:2015
            audit findings, nonconformities (NC), and opportunities for improvement (OFI) for FCAT. It is
            not intended for use outside of authorized company activities.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-[#4A1219] m-0">2. Accounts and Access</h2>
          <p className="text-sm text-[#2B2323] mt-1 leading-relaxed">
            Each user is responsible for the confidentiality of their login credentials. Accounts may be
            locked by an Auditor Account for policy violations, inactivity, or at the request of Management.
            Do not share your password with anyone.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-[#4A1219] m-0">3. Data Submitted</h2>
          <p className="text-sm text-[#2B2323] mt-1 leading-relaxed">
            All records, evidence files, and attachments submitted through this system become part of the
            company&apos;s Quality Management System documentation and may be reviewed by auditors, department
            heads, and Management.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-[#4A1219] m-0">4. Accuracy of Information</h2>
          <p className="text-sm text-[#2B2323] mt-1 leading-relaxed">
            Users must submit accurate and complete information. Records with missing required fields or
            missing evidence cannot be saved by design; attempting to submit falsified evidence is a
            violation of company policy.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-[#4A1219] m-0">5. Acceptable Use</h2>
          <p className="text-sm text-[#2B2323] mt-1 leading-relaxed">
            Do not use this system to upload content unrelated to audit and compliance activities.
            Auditor Accounts may audit system logs.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-[#4A1219] m-0">6. Changes</h2>
          <p className="text-sm text-[#2B2323] mt-1 leading-relaxed">
            These terms may be updated from time to time by the Quality Assurance / Management
            Representative office.
          </p>
        </section>
      </div>

      <div className="bg-white border border-[#EAD9D4] rounded-xl p-5 sm:p-6 shadow-sm">
        <h2 className="text-xl font-bold text-[#4A1219] m-0">Patch Notes / Application Version History</h2>
        <p className="text-xs text-[#7A6F6F] mt-1 mb-5">
          A running record of updates made to this system from V0.1 through the latest release.
        </p>

        <div className="divide-y divide-[#EAD9D4]">
          {APP_VERSION_HISTORY.map((r) => (
            <div key={r.version} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono-tabular text-xs font-bold text-white bg-[#6B1A25] px-2 py-0.5 rounded">
                    {r.version}
                  </span>
                  <strong className="text-sm text-[#4A1219]">{r.title}</strong>
                  {r.tag && (
                    <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-[#E9F4EC] text-[#255A2D] border border-[#C5E0CB]">
                      {r.tag}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-[#7A6F6F]">{r.date}</span>
              </div>
              <ul className="list-disc pl-5 text-sm text-[#2B2323] space-y-1">
                {r.highlights.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
