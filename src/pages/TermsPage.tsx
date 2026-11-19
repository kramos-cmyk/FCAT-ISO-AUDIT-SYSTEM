import React from 'react';

const RELEASES = [
  {
    version: '2.0',
    title: 'Full-Stack Web Platform & Render / Google Sheets Architecture',
    items: [
      'Migrated from Google Apps Script to a dedicated Node.js + Express + React/TypeScript web application ready for GitHub and Render hosting.',
      'Added persistent SQLite database storage alongside direct live integration and bidirectional sync with your existing Google Sheet.',
      'Replaced Google Docs temporary file PDF generation with direct server-side FO-RI-05 PDF export.',
      'Fixed timezone off-by-one overdue date checks, added interactive notification read states, optional password resets for admins, and strict per-user settings authorization.',
    ],
  },
  {
    version: '1.9',
    title: 'Departments & Access',
    items: [
      'Added a centrally managed Department list to remove free-text data-entry errors.',
      'Process Owners can now belong to more than one department.',
      'Auditors can filter records and view KPIs by department.',
      'CAR No. can now optionally be set manually by the Auditor when raising a finding, instead of always being auto-generated.',
    ],
  },
  {
    version: '1.8',
    title: 'Data Integrity Fixes',
    items: [
      'Fixed a spreadsheet schema issue where newly added columns could misalign data on records created before the change.',
      'Fixed dates displaying as raw, unformatted timestamps in several places.',
      'Fixed broken images on Announcement posts.',
    ],
  },
  {
    version: '1.7',
    title: 'Navigation & Structure',
    items: [
      'User Management split out into its own dedicated page.',
      'Overview KPIs and the per-department breakdown split out into their own page, separate from the submissions list.',
    ],
  },
  {
    version: '1.6',
    title: 'Collaboration Features',
    items: [
      'Added comments on CAR records (posted by Auditors, visible to the assigned department).',
      'Added Auditor-set deadlines, with automatic notifications to the responsible department.',
      'Announcements can now include images, can be edited, and keep a full edit history.',
      'Added comments on Announcements, open to all users, with moderated deletion.',
    ],
  },
  {
    version: '1.5',
    title: 'Workflow Overhaul: Auditors & Process Owners',
    items: [
      'Roles renamed to Auditor Account and Process Owner throughout the system.',
      'Findings are now raised by an Auditor and routed to a Department, rather than being self-submitted by one employee.',
      'Any Process Owner in the target department can claim and work an unclaimed finding.',
      'Required fields now depend on who is completing the form: Finding Details for Auditors, Correction through Sign-off for Process Owners.',
    ],
  },
  {
    version: '1.4',
    title: 'Dashboards & Visual Redesign',
    items: [
      'Added ISO Clause and Company Document columns to record tables.',
      'Introduced KPI summary cards, a page footer, and an Announcements feature.',
      'Full visual redesign: refined color palette, typography, spacing, and component styling throughout.',
    ],
  },
  {
    version: '1.3',
    title: 'Data Integrity & Security Hardening',
    items: [
      'Fixed the Edit button opening a blank form instead of the selected record.',
      'Added validation against invalid or unsafe evidence links, and against spreadsheet formula injection in free-text fields.',
      'Closed-record edit locking is now enforced on the server, not just hidden in the interface.',
      'Added the missing Auditor Follow-up / Verification fields to the form.',
    ],
  },
  {
    version: '1.2',
    title: 'Performance',
    items: [
      'Record updates now save in a single operation instead of one per changed field.',
      'Cached company branding and PDF export logo lookups to speed up page loads.',
    ],
  },
  {
    version: '1.1',
    title: 'Stability & Bug Fixes',
    items: [
      'Fixed validation incorrectly requiring "Details" on Opportunities for Improvement.',
      'Fixed the Save button getting stuck on "Saving..." after a record actually saved successfully.',
      'Fixed garbled raw-JSON display of Contributing Factors in the Root Cause Analysis view.',
      'Fixed unreliable page redirects after saving a record or logging in.',
    ],
  },
  {
    version: '1.0',
    title: 'Initial Release',
    items: [
      'Core system for recording, tracking, and closing CAR / NC / OFI findings, with Employee and Admin roles.',
    ],
  },
];

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
        <h2 className="text-xl font-bold text-[#4A1219] m-0">Patch Notes / Version History</h2>
        <p className="text-xs text-[#7A6F6F] mt-1 mb-5">
          A running record of updates made to this system since its initial release.
        </p>

        <div className="divide-y divide-[#EAD9D4]">
          {RELEASES.map((r) => (
            <div key={r.version} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="font-mono-tabular text-xs font-bold text-[#4A1219] bg-[#F3E8DE] px-2 py-0.5 rounded">
                  v{r.version}
                </span>
                <strong className="text-sm text-[#4A1219]">{r.title}</strong>
              </div>
              <ul className="list-disc pl-5 text-sm text-[#2B2323] space-y-1">
                {r.items.map((item, idx) => (
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
