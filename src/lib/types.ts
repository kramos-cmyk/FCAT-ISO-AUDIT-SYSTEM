export type UserRole = 'Admin' | 'Auditor' | 'Employee';

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
