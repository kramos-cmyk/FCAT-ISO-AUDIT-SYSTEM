export type UserRole = 'Admin' | 'Auditor' | 'Employee' | 'Auditor+Employee' | 'Admin+Employee';

export interface SessionUser {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  position: string;
}

export interface ManagedUser extends SessionUser {
  status: 'Active' | 'Locked';
}

export interface ProcessOwnerOption {
  userId: string;
  name: string;
  department: string;
}

export interface CorrectionEntry {
  Correction: string;
  DateCompleted: string;
  PersonInCharge: string;
  Result: string;
}

export interface CorrectiveActionEntry {
  CorrectiveAction: string;
  ActionOwnerTargetDate: string;
  DateImplemented: string;
}

export interface FollowUpEntry {
  FollowUpDate: string;
  ResultOfVerification: string;
  VerifiedBy: string;
  ConformedBy?: string;
  AddedBy?: string;
  CreatedAt?: string;
}

export interface CarRecord {
  CARNo: string;
  Type: string;
  Status: string;
  EmployeeID: string;
  EmployeeName: string;
  Department: string;
  DateIssued: string;
  Source: string;
  ISOClause: string;
  Details: string;
  CompanyDocument: string;
  Correction: string;
  DateCompleted: string;
  PersonInCharge: string;
  Result: string;
  PossibleRootCause: string;
  ValidationMethod: string;
  ValidationDate: string;
  ValidationResult: string;
  TrueRootCause: string;
  CorrectiveAction: string;
  ActionOwnerTargetDate: string;
  EvidenceLink: string;
  FormEvidenceLink: string;
  DateImplemented: string;
  PreparedBy: string;
  PreparedDate: string;
  ApprovedBy: string;
  ApprovedDate: string;
  FollowUpDate: string;
  ResultOfVerification: string;
  VerifiedBy: string;
  ConformedBy: string;
  AdminFlag: string;
  AdminNote: string;
  CreatedAt: string;
  UpdatedAt: string;
  AdminDeadline: string;
  RaisedBy: string;
  CorrectionEntries: string;
  PossibleRootCauseEntries: string;
  CorrectiveActionEntries: string;
  EvidenceLinks: string;
  SignOffConformedBy: string;
  FollowUpEntries: string;
  SignOffConformedDate: string;
  RootCauseFactors?: string;
}

export interface CarComment {
  CommentID: string;
  CARNo: string;
  UserID: string;
  UserName: string;
  Role: string;
  Message: string;
  CreatedAt: string;
}

export type CarActivityType =
  | 'created'
  | 'status'
  | 'flag'
  | 'deadline'
  | 'evidence'
  | 'comment'
  | 'followup'
  | 'owner_update'
  | 'auditor_update'
  | 'assignment';

export interface CarActivityEntry {
  ActivityID: string;
  CARNo: string;
  UserID: string;
  UserName: string;
  Role: string;
  ActivityType: CarActivityType;
  Summary: string;
  Details: string;
  CreatedAt: string;
}

export interface NotificationItem {
  NotificationID: string;
  ToUserID: string;
  FromUserID: string;
  Message: string;
  RelatedCARNo: string;
  Read: boolean;
  CreatedAt: string;
}

export interface AnnouncementItem {
  AnnouncementID: string;
  Title: string;
  Message: string;
  PostedBy: string;
  PostedByName: string;
  CreatedAt: string;
  UpdatedAt: string;
  ImageLinks: string[];
}

export interface AnnouncementHistoryItem {
  HistoryID: string;
  AnnouncementID: string;
  Title: string;
  Message: string;
  ImageLinks: string[];
  EditedBy: string;
  EditedByName: string;
  EditedAt: string;
}

export interface AnnouncementComment {
  CommentID: string;
  AnnouncementID: string;
  UserID: string;
  UserName: string;
  Role: string;
  Message: string;
  CreatedAt: string;
}

export interface StorageStatus {
  mode: 'sqlite' | 'sheets';
  spreadsheetIdConfigured: boolean;
  serviceAccountConfigured: boolean;
  spreadsheetId: string;
  serviceAccountEmail: string;
  sheetsInitError: string | null;
}

export interface AuditLogItem {
  Timestamp: string;
  UserID: string;
  Action: string;
  Details: string;
  UserName?: string;
  UserEmail?: string;
  UserRole?: string;
}

export type HelpDeskTicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';
export type HelpDeskTicketPriority = 'Normal' | 'Urgent';

export interface HelpDeskTicket {
  TicketID: string;
  Subject: string;
  Category: string;
  Priority: HelpDeskTicketPriority;
  RelatedCARNo: string;
  Status: HelpDeskTicketStatus;
  CreatedBy: string;
  CreatedByName: string;
  CreatedByRole: string;
  CreatedByDepartment: string;
  AssignedTo: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface HelpDeskMessage {
  MessageID: string;
  TicketID: string;
  SenderID: string;
  SenderName: string;
  SenderRole: string;
  Message: string;
  CreatedAt: string;
}

export interface DirectMessage {
  MessageID: string;
  FromUserID: string;
  FromUserName: string;
  FromUserRole: string;
  ToUserID: string;
  Message: string;
  Read: boolean;
  CreatedAt: string;
}

export interface DmThreadSummary {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  position: string;
  lastMessage: string;
  lastAt: string;
  lastFromMe: boolean;
  lastRead?: boolean;
  unreadCount: number;
}

export type AuditScheduleType =
  | 'Internal ISO Audit'
  | 'Department Audit'
  | 'Follow-Up Verification'
  | 'Surveillance Audit'
  | 'Management Review';
export type AuditScheduleStatus = 'Scheduled' | 'Completed' | 'Cancelled';

export interface AuditSchedule {
  ScheduleID: string;
  Title: string;
  AuditType: AuditScheduleType;
  AuditDate: string;
  TimeWindow: string;
  Department: string;
  LeadAuditor: string;
  Status: AuditScheduleStatus;
  Notes: string;
  CreatedBy: string;
  CreatedAt: string;
  UpdatedAt: string;
}
