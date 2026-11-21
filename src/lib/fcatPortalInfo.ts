export const OFFICIAL_WEBSITE_URL = 'https://fcat.com.ph/';

export interface VersionRelease {
  version: string;
  date: string;
  title: string;
  tag?: string;
  highlights: string[];
}

export const APP_VERSION_HISTORY: VersionRelease[] = [
  {
    version: 'V1.4',
    date: 'Current Release',
    tag: 'Latest',
    title: 'Role Governance, Pre-Login Portal & Per-CAR Activity Log',
    highlights: [
      'Enforced scoped CAR visibility: System Administrators access all CARs and User Management, while Auditors view and manage findings they raised and their own department/process CARs.',
      'Added Dual-Role account support (Auditor & Process Owner, System Admin & Process Owner) with a form mode switcher, and updated the submissions table to display Raised By.',
      'Launched the full-screen FCAT campus pre-login portal with pop-up modals for Programs & Enrollment, Scholarship, About FCAT, and public Version History, plus a direct link to fcat.com.ph.',
      'Implemented the per-CAR Activity Log timeline so auditors and process owners can track status changes, comments, evidence updates, flags, deadlines, follow-ups, and section edits.',
    ],
  },
  {
    version: 'V1.3',
    date: 'Privacy & Workspace Update',
    title: 'DPO Privacy Controls, Appearance Settings & Department Icons',
    highlights: [
      'Locked auto-email notification controls exclusively to System Administrators, added Announcements to the Notification Bell, and kept private direct messages strictly in-app for DPO privacy compliance.',
      'Added personal workspace settings for theme (FCAT Classic, Crisp Light, Dark Mode), text size, and table row spacing.',
      'Added unique department and service icons across user profiles and sidebar navigation.',
    ],
  },
  {
    version: 'V1.2',
    date: 'Operations Expansion',
    title: 'Audit Calendar, Help Desk & Real-Time Updates',
    highlights: [
      'Added the ISO Audit Schedule & Calendar for tracking upcoming internal, department, surveillance, and follow-up audits.',
      'Launched Help Desk ticketing with CAR cross-referencing, direct messaging, and real-time in-app notifications.',
    ],
  },
  {
    version: 'V1.1',
    date: 'Platform Migration',
    title: 'Full-Stack Web Platform & Bidirectional Storage Architecture',
    highlights: [
      'Migrated from Google Apps Script to a dedicated Node.js + Express + React/TypeScript web application.',
      'Added persistent SQLite database storage alongside live integration and bidirectional sync with Google Sheets.',
      'Added direct server-side FO-RI-05 PDF export, interactive notification read states, Data Privacy confirmation gate, and strict per-user authorization.',
    ],
  },
  {
    version: 'V1.0',
    date: 'Access Control Update',
    title: 'Departments & Access',
    highlights: [
      'Added a centrally managed Department list to remove free-text data-entry errors.',
      'Process Owners can now belong to more than one department.',
      'Auditors can filter records and view KPIs by department.',
      'CAR No. can now optionally be set manually by the Auditor when raising a finding, instead of always being auto-generated.',
    ],
  },
  {
    version: 'V0.9',
    date: 'Maintenance Update',
    title: 'Data Integrity Fixes',
    highlights: [
      'Fixed a spreadsheet schema issue where newly added columns could misalign data on records created before the change.',
      'Fixed dates displaying as raw, unformatted timestamps in several places.',
      'Fixed broken images on Announcement posts.',
    ],
  },
  {
    version: 'V0.8',
    date: 'Layout Update',
    title: 'Navigation & Structure',
    highlights: [
      'User Management split out into its own dedicated page.',
      'Overview KPIs and the per-department breakdown split out into their own page, separate from the submissions list.',
    ],
  },
  {
    version: 'V0.7',
    date: 'Collaboration Update',
    title: 'Collaboration Features',
    highlights: [
      'Added comments on CAR records and Auditor-set deadlines, with automatic notifications to the responsible department.',
      'Announcements can now include images, can be edited, and keep a full edit history.',
      'Added comments on Announcements, open to all users, with moderated deletion.',
    ],
  },
  {
    version: 'V0.6',
    date: 'Workflow Update',
    title: 'Workflow Overhaul: Auditors & Process Owners',
    highlights: [
      'Roles renamed to Auditor Account and Process Owner throughout the system.',
      'Findings are now raised by an Auditor and routed to a Department, rather than being self-submitted by one employee.',
      'Any Process Owner in the target department can claim and work an unclaimed finding.',
      'Required fields now depend on who is completing the form: Finding Details for Auditors, Correction through Sign-off for Process Owners.',
    ],
  },
  {
    version: 'V0.5',
    date: 'Design Update',
    title: 'Dashboards & Visual Redesign',
    highlights: [
      'Added ISO Clause and Company Document columns to record tables.',
      'Introduced KPI summary cards, a page footer, and an Announcements feature.',
      'Full visual redesign: refined color palette, typography, spacing, and component styling throughout.',
    ],
  },
  {
    version: 'V0.4',
    date: 'Security Update',
    title: 'Data Integrity & Security Hardening',
    highlights: [
      'Fixed the Edit button opening a blank form instead of the selected record.',
      'Added validation against invalid or unsafe evidence links, and against spreadsheet formula injection in free-text fields.',
      'Closed-record edit locking is now enforced on the server, not just hidden in the interface.',
      'Added the missing Auditor Follow-up / Verification fields to the form.',
    ],
  },
  {
    version: 'V0.3',
    date: 'Optimization Update',
    title: 'Performance',
    highlights: [
      'Record updates now save in a single operation instead of one per changed field.',
      'Cached company branding and PDF export logo lookups to speed up page loads.',
    ],
  },
  {
    version: 'V0.2',
    date: 'Patch Update',
    title: 'Stability & Bug Fixes',
    highlights: [
      'Fixed validation incorrectly requiring "Details" on Opportunities for Improvement.',
      'Fixed the Save button getting stuck on "Saving..." after a record actually saved successfully.',
      'Fixed garbled raw-JSON display of Contributing Factors in the Root Cause Analysis view.',
      'Fixed unreliable page redirects after saving a record or logging in.',
    ],
  },
  {
    version: 'V0.1',
    date: 'Initial Release',
    title: 'Initial Release',
    highlights: [
      'Core system for recording, tracking, and closing CAR / NC / OFI findings, with Employee and Admin roles.',
    ],
  },
];

export const CHED_BACHELOR_PROGRAMS = [
  'Bachelor of Science in Criminology',
  'Bachelor of Science in Nursing',
  'Bachelor of Secondary Education major in Science',
  'Bachelor of Elementary Education',
  'Bachelor of Science in Computer Engineering',
  'Bachelor of Science in Computer Science',
  'Bachelor of Science in Hospitality Management',
  'Bachelor of Science in Accountancy',
  'Bachelor of Science in Business Administration major in Financial Management',
];

export const COLLEGE_NEW_REQUIREMENTS = [
  'Original Grade 12 Report Card (F138 / SF9)',
  'Original Certificate of Good Moral',
  'Photocopy of PSA Birth Certificate',
  '7 pcs. 1×1 ID picture (in formal attire, white background)',
  'Original Student Permanent Record (F137 / SF9)',
];

export const COLLEGE_TRANSFEREE_REQUIREMENTS = [
  'Original Certificate of Grades, Transcript of Records or any official proof of academic record (For course evaluation)',
  'Original Certificate of Transfer Credentials (to be filled-in by FCAT Registrar)',
  'Original Certificate of Good Moral',
  'Photocopy of PSA Birth Certificate',
  '7 pcs. 1×1 ID picture (in formal attire, white background)',
];

export const TESDA_DIPLOMA_PROGRAMS = [
  'Three-year Diploma Program in Hotel and Restaurant Operation Technology (leading to Bachelor of Science in Hospitality Management)',
  'Three-year Diploma Program in Security Services Technology (leading to Bachelor of Science in Criminology)',
];

export const TESDA_SHORT_PROGRAMS = [
  'Agricultural Crops Production NC II',
  'Agricultural Crops Production NC III',
  'Bartending NC II',
  'Bookkeeping NC III',
  'Bread and Pastry Production NC II',
  'Caregiving NC II',
  'Cookery NC II',
  'Early Childhood Care & Development Services NC III',
  'Farmer Field School (FFS)',
  'Food & Beverage Services NC II',
  'Front Office Services NC II',
  'Gas Metal Arc Welding (GMAW) NC II',
  'Gas Tungsten Arc Welding (GTAW) NC II',
  'Health Care Services NC II',
  'Housekeeping NC II',
  'Japanese Language A1',
  'Japanese Language A2',
  'Shielded Metal Arc Welding (SMAW) NC I',
  'Shielded Metal Arc Welding (SMAW) NC II',
];

export const TESDA_ASSESSMENT_CENTER = [
  'Automotive Servicing NC I',
  'Automotive Servicing (Engine Repair) NC II',
  'Bookkeeping NC III',
  'Bread and Pastry Production NC II',
  'Caregiving NC II',
  'Cookery NC II',
  'Driving NC II',
  'Emergency Medical Services NC II',
  'Food and Beverage Services NC III',
  'Security Services NC I',
  'Security Services NC II',
];

export const TESDA_DIPLOMA_REQUIREMENTS = [
  'Form 138 (original)',
  'Form 137 (original)',
  'PSA/NSO Birth Certificate (photocopy)',
  'Barangay Indigency (original)',
  'Barangay Clearance (original)',
  'Certificate of Good Moral Character (original)',
  'Valid ID (photocopy)',
  '1×1 Photo – 4 pieces',
  'Passport-size Photo (formal, white background) – 6 pieces',
  'Mailing Envelope with Stamp – 6 pieces',
];

export const TESDA_SHORT_REQUIREMENTS = [
  'SF 10-SHS Original Permanent Record (Form 137) or transcript of records (3 copies)',
  '2 pcs 2×2 ID picture and 4 pcs 1×1 ID picture',
  'Marriage contract, if married female (3 copies)',
  'Long brown envelope – 1 pc.',
];

export const SHS_CURRICULUM_TRACKS = ['General Academic Electives', 'Technical Professional'];

export const SHS_REQUIREMENTS = [
  'Original Form-137 (for Transferee)',
  'Original Form-138',
  'Original PSA Birth Certificate',
  'Original Good Moral',
  'NCAE Results (if available)',
  'ESC Certificate (for Private School)',
];

export const JHS_NEW_REQUIREMENTS = [
  'SF9-Elem Elementary Card (formerly Form 138)',
  '6 pcs. Latest (1×1) colored picture, white background',
  'Certification of Good Moral Character',
  'Photocopy of NSO/PSA Birth Certificate',
  '6 pcs. Mailing envelope, self-addressed and stamped',
];

export const JHS_TRANSFEREE_REQUIREMENTS = [
  'SF10-Elem (formerly Form 137) Original Permanent Record',
  'Latest (1×1) colored picture, white background',
  'Certification of Good Moral Character',
  'Photocopy of NSO/PSA Birth Certificate',
  '6 pcs. Mailing envelope, self-addressed and stamped',
];

export const ELEMENTARY_REQUIREMENTS = [
  'SF9-Elem Pre-Elementary Card (formerly Form 138)',
  '6 pcs. Latest (1×1) colored picture, white background',
  'Photocopy of NSO/PSA Birth Certificate',
  '6 pcs. Mailing envelope, self-addressed and stamped',
];

export const PRE_ELEMENTARY_REQUIREMENTS = [
  '6 pcs. Latest (1×1) colored picture, white background',
  'Photocopy of NSO/PSA Birth Certificate',
];

export interface ScholarshipProgram {
  title: string;
  badge: string;
  summary?: string;
  points: string[];
}

export const INSTITUTIONAL_SCHOLARSHIPS: ScholarshipProgram[] = [
  {
    title: 'Academic Scholars',
    badge: 'Full Scholarship',
    points: [
      'Senior High School graduates with Honors, High and Highest Honors are eligible for Academic Scholarship.',
      'Graduates with GWA of at least 85% with no grade lower than 85% in all subjects.',
      'Parents should pay miscellaneous fee, scholarship fee and organizational fees.',
      'Membership to BULNET (Bulacan North East Traders, a cooperative whose aim is to assist the financially challenged in the Bulacan area) is a must for the parent and guardian of the scholar.',
      'Scholars under this program are obliged to pay for the balance of his/her tuition fees in case of transfer to other schools since this is a privilege extended by the school as a matter of service to the community.',
      'An academic scholarship agreement is to be signed by the students and parents.',
      'Must maintain a GWA as required.',
    ],
  },
  {
    title: 'Student Assistant (SA)',
    badge: 'Full Scholarship',
    summary: 'Student Assistants are required to render assistance to the school as part of their scholarship. No entry grade requirement.',
    points: [
      'Parents should pay miscellaneous fee, scholarship fee and organizational fees.',
      'Must assist the school for required number of hours.',
      'SAs will be placed in the charge of the different departments of the school.',
      'Must maintain a GWA as required.',
    ],
  },
  {
    title: 'Financial Grantee',
    badge: 'Half Scholarship (50%)',
    summary: 'Financial Grantees are entitled to 50% free tuition.',
    points: [
      'Parents should pay miscellaneous fees plus the remaining 50% of tuition and full organizational fees.',
      'GWA of applicant must be 85 and above with no lower grade than 80.',
      'Membership to BULNET (Bulacan North East Traders is a cooperative whose aim is to assist the financially challenged in the Bulacan area) is a must for the parent and guardian of the scholar.',
      'Scholars under this program are obliged to pay for the balance of his/her tuition fees in case of transfer to other schools since this is a privilege extended by the school as a matter of service to the community.',
      'Barangay Scholars / Local Government Scholars are usually classified under this category.',
      'A Financial Study Grant Agreement is to be signed by the students and the parents.',
      'Must maintain a GWA as required.',
      'Must be recommended by Accredited Business Firms, NGOs, LGU officials and others.',
    ],
  },
  {
    title: 'Partial Scholarship',
    badge: '25% Discount',
    summary: 'Partial Grantees are entitled to 25% discount on tuition fees.',
    points: [
      'Parents should pay miscellaneous fees plus the remaining 75% of tuition fee and organizational fees.',
      'Students whose general weighted average is 80 and above.',
      'Membership to BULNET (Bulacan North East Traders is a cooperative whose aim is to assist the financially challenged in the Bulacan area) is a must for the parent and guardian of the scholar.',
      'Scholars under this program are obliged to pay for the balance of his/her tuition fees in case of transfer to other schools since this is a privilege extended by the school as a matter of service to the community.',
      'A Partial Study Grant Agreement is to be signed by the students and parents.',
      'Must maintain a GWA as required.',
    ],
  },
];

export const ESC_DISQUALIFICATIONS = [
  'Are retained in a grade level (fail 3 or more subjects or fail to take summer for a failed subject)',
  'Transfer to a non-ESC participating school or public school',
  'Are suspended due to disciplinary measures',
  'Drop out',
];

export const ESC_PROCEDURE = [
  'Every year the list of new ESC grantees is prepared by the school committee taking into account the intention and rules and regulations of the ESC.',
  'The new grantees fill up their ESC contract and submit the requirements as prescribed.',
  'The school management facilitates the submission of all ESC grantees (old and new) through the online portal and submits all documents as needed to the regional PEAC office.',
  'The school informs the ESC grantees through official channels regarding the status of their scholarship. The scholarship amount is reflected in their official statements of account.',
  'The grantees and the school officers make themselves available for any monitoring or validation of the status of the ESC grantees.',
];

export const SHSVP_DISQUALIFICATIONS = [
  'Transfer to a public SHS provider',
  'Are excluded or expelled from the school',
  'Drop out',
];

export const SHSVP_PROCEDURE = [
  'Every year the list of new SHS Voucher recipients is prepared by the school committee taking into account the intention and rules and regulations of the SHS Voucher program.',
  'The school management facilitates the submission of all SHS voucher recipients (old and new) through the online portal and submits all documents as needed to the regional PEAC office.',
  'The school informs the SHS voucher recipients through official channels regarding the status of their scholarship. The scholarship amount is reflected in their official statements of account.',
  'The recipients and the school officers make themselves available for any monitoring or validation of the status of the SHS Voucher recipients.',
];

export const QUALITY_POLICY_POINTS = [
  'produce graduates who meet local and global quality standards;',
  'adhere to legal and other applicable requirements in our operations;',
  'engage the entire organization in continuous improvement of systems and processes;',
  'align our operations with our institutional mission and vision as well as national and international development goals.',
];

export const INSTITUTIONAL_OUTCOMES = [
  {
    title: 'Interpersonally Adept',
    desc: 'Demonstrate effective interpersonal skills both in leadership roles and in teamwork.',
  },
  {
    title: 'Civic-minded Contributors',
    desc: 'Socially responsible citizens cognizant of current issues as they contribute to national development.',
  },
  {
    title: 'Adaptable',
    desc: 'Capable of applying knowledge and skills in a diverse and competitive work environment.',
  },
  {
    title: 'Globally Competent Professionals',
    desc: 'Professionally competent and updated in their specialized field amidst a changing global environment.',
  },
  {
    title: 'Strategic Thinkers',
    desc: 'Can actively engage in critical thinking, analyze various situations, and solve problems effectively.',
  },
  {
    title: 'Disciplined and Hard Workers',
    desc: 'Disciplined and committed to hard work and maintaining high standards of productivity.',
  },
  {
    title: 'Skilled Leaders',
    desc: 'Can demonstrate and apply effective leadership skills.',
  },
  {
    title: 'Life-long Learners',
    desc: 'Dedicated to continual self-improvement and life-long learning.',
  },
  {
    title: 'Technologically Proficient',
    desc: 'Possess a high level of proficiency in using information and communication technology.',
  },
  {
    title: 'Effective Communicators',
    desc: 'Can synthesize information from diverse sources and communicate effectively in both written and spoken English.',
  },
];

export const CORE_VALUES = [
  'Professionalism',
  'Active Nationalism',
  'Global Excellence',
  'Environmentally Conscious',
  'Spirituality',
];
