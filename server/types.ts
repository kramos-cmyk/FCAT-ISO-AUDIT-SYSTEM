export type UserRole = 'Admin' | 'Employee';
export type UserStatus = 'Active' | 'Locked';

export interface SessionUser {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  position: string;
}

export interface UserRecord {
  UserID: string;
  Name: string;
  Email: string;
  PasswordHash: string;
  Role: UserRole;
  Department: string;
  Position: string;
  Status: UserStatus;
  CreatedAt: string;
}

export type WhyWhyFactors = Record<'Man' | 'Method' | 'Machine' | 'Material' | 'Environment', string[]>;

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

export interface NotificationRecord {
  NotificationID: string;
  ToUserID: string;
  FromUserID: string;
  Message: string;
  RelatedCARNo: string;
  Read: boolean | string;
  CreatedAt: string;
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

export interface AnnouncementRecord {
  AnnouncementID: string;
  Title: string;
  Message: string;
  PostedBy: string;
  PostedByName: string;
  CreatedAt: string;
  UpdatedAt: string;
  ImageLinks: string[];
}

export interface AnnouncementHistoryRecord {
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

export interface AuditLogEntry {
  Timestamp: string;
  UserID: string;
  Action: string;
  Details: string;
}

export interface DataStore {
  readonly mode: 'sqlite' | 'sheets';
  init(): Promise<void>;

  // Users
  listUsers(): Promise<UserRecord[]>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(userId: string): Promise<UserRecord | null>;
  createUser(user: UserRecord): Promise<void>;
  updateUser(userId: string, updates: Partial<UserRecord>): Promise<boolean>;

  // Departments
  listDepartments(): Promise<string[]>;
  addDepartment(name: string): Promise<void>;
  removeDepartment(name: string): Promise<boolean>;

  // CARs
  listCARs(): Promise<CarRecord[]>;
  getCAR(carNo: string): Promise<CarRecord | null>;
  createCAR(record: CarRecord, whyFactors: WhyWhyFactors): Promise<void>;
  updateCAR(carNo: string, updates: Partial<CarRecord>, whyFactors?: WhyWhyFactors): Promise<boolean>;
  getWhyWhy(carNo: string): Promise<WhyWhyFactors>;

  // Comments
  listCarComments(carNo: string): Promise<CarComment[]>;
  addCarComment(comment: CarComment): Promise<void>;

  // Notifications
  listNotificationsForUser(userId: string): Promise<NotificationRecord[]>;
  createNotification(notif: NotificationRecord): Promise<void>;
  markNotificationRead(notificationId: string, userId: string, isAdmin: boolean): Promise<boolean>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Company & Settings
  getCompanyDetails(): Promise<Record<string, string>>;
  updateCompanyDetails(updates: Record<string, string>): Promise<void>;
  getSettings(): Promise<Record<string, string>>;
  updateSettings(updates: Record<string, string>): Promise<void>;

  // Announcements
  listAnnouncements(): Promise<AnnouncementRecord[]>;
  getAnnouncement(announcementId: string): Promise<AnnouncementRecord | null>;
  createAnnouncement(item: AnnouncementRecord): Promise<void>;
  updateAnnouncement(announcementId: string, updates: { Title: string; Message: string; ImageLinks: string[]; UpdatedAt: string }, historySnapshot: AnnouncementHistoryRecord): Promise<boolean>;
  deleteAnnouncement(announcementId: string): Promise<boolean>;
  getAnnouncementHistory(announcementId: string): Promise<AnnouncementHistoryRecord[]>;
  listAnnouncementComments(announcementId: string): Promise<AnnouncementComment[]>;
  addAnnouncementComment(comment: AnnouncementComment): Promise<void>;
  deleteAnnouncementComment(commentId: string, requesterId: string, isAdmin: boolean): Promise<'ok' | 'not_found' | 'forbidden'>;

  // Audit log
  appendLog(entry: AuditLogEntry): Promise<void>;
  listLogs(limit?: number): Promise<AuditLogEntry[]>;
}
