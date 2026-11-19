export const APP_NAME = 'FCAT ISO Audit Management System';
export const SESSION_HOURS = 6;

export const SHEETS = {
  USERS: 'Users',
  CAR: 'CAR_Records',
  WHY_WHY: 'CAR_WhyWhy',
  NOTIFICATIONS: 'Notifications',
  COMPANY: 'CompanyDetails',
  SETTINGS: 'Settings',
  LOG: 'AuditLog',
  COMMENTS: 'CAR_Comments',
  ANNOUNCEMENTS: 'Announcements',
  ANNOUNCEMENT_HISTORY: 'Announcement_History',
  ANNOUNCEMENT_COMMENTS: 'Announcement_Comments',
  DEPARTMENTS: 'Departments',
  HELPDESK_TICKETS: 'HelpDesk_Tickets',
  HELPDESK_MESSAGES: 'HelpDesk_Messages',
  DIRECT_MESSAGES: 'Direct_Messages',
} as const;

export const DEFAULT_DEPARTMENTS: string[] = [
  'Basic Education', 'TESDA', 'Acads - CHED', 'Accounting', 'Admission', 'Alumni',
  'Disciplinary', 'Document Control', 'Enrolment', 'Extension', 'Guidance',
  'Human Resources', 'Inventory', 'IT Services', 'Library Services', 'Maintenance',
  'Marketing', 'Medical', 'Pollution Control', 'Procurement', 'Registrar', 'Research',
  'Safety', 'Scholarship', 'Security', 'Student Affairs', 'College of Education',
  'College of Computer Science', 'College of Hospitality Management',
  'College of Criminal Justice', 'College of Business Administration & Accountancy',
  'College of Nursing', 'Strategic Planning', 'Review and Improvement',
];

export const DEPARTMENT_COLS = ['Name'];
export const USER_COLS = ['UserID', 'Name', 'Email', 'PasswordHash', 'Role', 'Department', 'Position', 'Status', 'CreatedAt'];
export const CAR_COLS = [
  'CARNo', 'Type', 'Status', 'EmployeeID', 'EmployeeName', 'Department', 'DateIssued',
  'Source', 'ISOClause', 'Details', 'CompanyDocument', 'Correction', 'DateCompleted', 'PersonInCharge', 'Result',
  'PossibleRootCause', 'ValidationMethod', 'ValidationDate', 'ValidationResult', 'TrueRootCause',
  'CorrectiveAction', 'ActionOwnerTargetDate', 'EvidenceLink', 'FormEvidenceLink', 'DateImplemented',
  'PreparedBy', 'PreparedDate', 'ApprovedBy', 'ApprovedDate',
  'FollowUpDate', 'ResultOfVerification', 'VerifiedBy', 'ConformedBy',
  'AdminFlag', 'AdminNote', 'CreatedAt', 'UpdatedAt', 'AdminDeadline',
  'RaisedBy', 'CorrectionEntries', 'PossibleRootCauseEntries', 'CorrectiveActionEntries',
  'EvidenceLinks', 'SignOffConformedBy', 'FollowUpEntries', 'SignOffConformedDate',
];
export const WHY_COLS = ['CARNo', 'Factor', 'Why1', 'Why2', 'Why3', 'Why4', 'Why5', 'UpdatedAt'];
export const NOTIF_COLS = ['NotificationID', 'ToUserID', 'FromUserID', 'Message', 'RelatedCARNo', 'Read', 'CreatedAt'];
export const COMPANY_COLS = ['Key', 'Value'];
export const SETTINGS_COLS = ['Key', 'Value'];
export const LOG_COLS = ['Timestamp', 'UserID', 'Action', 'Details'];
export const COMMENT_COLS = ['CommentID', 'CARNo', 'UserID', 'UserName', 'Role', 'Message', 'CreatedAt'];
export const ANNOUNCEMENT_COLS = ['AnnouncementID', 'Title', 'Message', 'PostedBy', 'PostedByName', 'CreatedAt', 'UpdatedAt', 'ImageLinks'];
export const ANNOUNCEMENT_HISTORY_COLS = ['HistoryID', 'AnnouncementID', 'Title', 'Message', 'ImageLinks', 'EditedBy', 'EditedByName', 'EditedAt'];
export const ANNOUNCEMENT_COMMENT_COLS = ['CommentID', 'AnnouncementID', 'UserID', 'UserName', 'Role', 'Message', 'CreatedAt'];
export const HELPDESK_TICKET_COLS = [
  'TicketID', 'Subject', 'Category', 'Priority', 'RelatedCARNo', 'Status',
  'CreatedBy', 'CreatedByName', 'CreatedByRole', 'CreatedByDepartment',
  'AssignedTo', 'CreatedAt', 'UpdatedAt',
];
export const HELPDESK_MESSAGE_COLS = [
  'MessageID', 'TicketID', 'SenderID', 'SenderName', 'SenderRole', 'Message', 'CreatedAt',
];
export const DIRECT_MESSAGE_COLS = [
  'MessageID', 'FromUserID', 'FromUserName', 'FromUserRole', 'ToUserID', 'Message', 'Read', 'CreatedAt',
];

export const REQUIRED_FIELDS = ['Type', 'Department', 'DateIssued', 'Source'];

export const PROCESS_OWNER_REQUIRED_FIELDS = [
  'ValidationMethod', 'ValidationDate', 'ValidationResult', 'TrueRootCause',
  'PreparedBy', 'PreparedDate', 'ApprovedBy', 'ApprovedDate',
  'SignOffConformedBy', 'SignOffConformedDate',
];

export const PROCESS_OWNER_REQUIRED_ENTRY_FIELDS = [
  'CorrectionEntries', 'PossibleRootCauseEntries', 'CorrectiveActionEntries',
];

export const AUDITOR_ONLY_FIELDS = [
  'Type', 'Source', 'DateIssued', 'ISOClause', 'Details', 'CompanyDocument', 'Department', 'RaisedBy',
];

export const WHY_FACTORS = ['Man', 'Method', 'Machine', 'Material', 'Environment'] as const;

export const FO_RI_05_META = {
  docCode: 'FO-RI-05',
  revNo: '00',
  processGroup: 'Review & Improvement',
  effectivityDate: '05/19/2025',
  totalPages: 3,
};

export const DEFAULT_COMPANY_DETAILS: Record<string, string> = {
  CompanyName: 'Fernandez College of Arts And Technology, Inc. (FCAT)',
  Address: '3006 Baliwag City, Bulacan',
  Standard: 'ISO 9001:2015',
  LogoUrl: '/fcat-logo.png',
  PrimaryColor: '#7A1E2B',
  AccentGreen: '#3A7D44',
  AccentGold: '#D4A017',
};
