import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  CAR_COLS,
  DEFAULT_COMPANY_DETAILS,
  DEFAULT_DEPARTMENTS,
  LEGACY_DEPARTMENT_MAP,
  WHY_FACTORS,
  canonicalDepartment,
} from './constants.js';
import { hashPassword, newId, nowIso, parseJsonArray } from './security.js';
import type {
  AnnouncementComment,
  AnnouncementHistoryRecord,
  AnnouncementRecord,
  AuditLogEntry,
  AuditSchedule,
  CarComment,
  CarRecord,
  DataStore,
  DirectMessage,
  HelpDeskMessage,
  HelpDeskTicket,
  NotificationRecord,
  UserRecord,
  WhyWhyFactors,
} from './types.js';

export class SqliteStore implements DataStore {
  public readonly mode = 'sqlite' as const;
  private db: Database.Database;

  constructor(dbPath?: string) {
    const target = path.resolve(dbPath || process.env.DB_PATH || './data/fcat_audit.db');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    this.db = new Database(target);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        UserID TEXT PRIMARY KEY,
        Name TEXT NOT NULL,
        Email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        PasswordHash TEXT NOT NULL,
        Role TEXT NOT NULL DEFAULT 'Employee',
        Department TEXT NOT NULL DEFAULT '',
        Position TEXT NOT NULL DEFAULT '',
        Status TEXT NOT NULL DEFAULT 'Active',
        CreatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS departments (
        Name TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS car_records (
        CARNo TEXT PRIMARY KEY,
        Type TEXT DEFAULT '',
        Status TEXT DEFAULT 'Open',
        EmployeeID TEXT DEFAULT '',
        EmployeeName TEXT DEFAULT '',
        Department TEXT DEFAULT '',
        DateIssued TEXT DEFAULT '',
        Source TEXT DEFAULT '',
        ISOClause TEXT DEFAULT '',
        Details TEXT DEFAULT '',
        CompanyDocument TEXT DEFAULT '',
        Correction TEXT DEFAULT '',
        DateCompleted TEXT DEFAULT '',
        PersonInCharge TEXT DEFAULT '',
        Result TEXT DEFAULT '',
        PossibleRootCause TEXT DEFAULT '',
        ValidationMethod TEXT DEFAULT '',
        ValidationDate TEXT DEFAULT '',
        ValidationResult TEXT DEFAULT '',
        TrueRootCause TEXT DEFAULT '',
        CorrectiveAction TEXT DEFAULT '',
        ActionOwnerTargetDate TEXT DEFAULT '',
        EvidenceLink TEXT DEFAULT '',
        FormEvidenceLink TEXT DEFAULT '',
        DateImplemented TEXT DEFAULT '',
        PreparedBy TEXT DEFAULT '',
        PreparedDate TEXT DEFAULT '',
        ApprovedBy TEXT DEFAULT '',
        ApprovedDate TEXT DEFAULT '',
        FollowUpDate TEXT DEFAULT '',
        ResultOfVerification TEXT DEFAULT '',
        VerifiedBy TEXT DEFAULT '',
        ConformedBy TEXT DEFAULT '',
        AdminFlag TEXT DEFAULT '',
        AdminNote TEXT DEFAULT '',
        CreatedAt TEXT DEFAULT '',
        UpdatedAt TEXT DEFAULT '',
        AdminDeadline TEXT DEFAULT '',
        RaisedBy TEXT DEFAULT '',
        CorrectionEntries TEXT DEFAULT '',
        PossibleRootCauseEntries TEXT DEFAULT '',
        CorrectiveActionEntries TEXT DEFAULT '',
        EvidenceLinks TEXT DEFAULT '',
        SignOffConformedBy TEXT DEFAULT '',
        FollowUpEntries TEXT DEFAULT '',
        SignOffConformedDate TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS car_whywhy (
        CARNo TEXT NOT NULL,
        Factor TEXT NOT NULL,
        Why1 TEXT DEFAULT '',
        Why2 TEXT DEFAULT '',
        Why3 TEXT DEFAULT '',
        Why4 TEXT DEFAULT '',
        Why5 TEXT DEFAULT '',
        UpdatedAt TEXT DEFAULT '',
        PRIMARY KEY (CARNo, Factor)
      );

      CREATE TABLE IF NOT EXISTS notifications (
        NotificationID TEXT PRIMARY KEY,
        ToUserID TEXT NOT NULL,
        FromUserID TEXT NOT NULL,
        Message TEXT NOT NULL,
        RelatedCARNo TEXT DEFAULT '',
        Read INTEGER NOT NULL DEFAULT 0,
        CreatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(ToUserID, CreatedAt);

      CREATE TABLE IF NOT EXISTS company_details (
        Key TEXT PRIMARY KEY,
        Value TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS settings (
        Key TEXT PRIMARY KEY,
        Value TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        Timestamp TEXT NOT NULL,
        UserID TEXT NOT NULL,
        Action TEXT NOT NULL,
        Details TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS car_comments (
        CommentID TEXT PRIMARY KEY,
        CARNo TEXT NOT NULL,
        UserID TEXT NOT NULL,
        UserName TEXT NOT NULL,
        Role TEXT NOT NULL,
        Message TEXT NOT NULL,
        CreatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_car_comments_car ON car_comments(CARNo, CreatedAt);

      CREATE TABLE IF NOT EXISTS announcements (
        AnnouncementID TEXT PRIMARY KEY,
        Title TEXT NOT NULL,
        Message TEXT NOT NULL,
        PostedBy TEXT NOT NULL,
        PostedByName TEXT NOT NULL,
        CreatedAt TEXT NOT NULL,
        UpdatedAt TEXT NOT NULL,
        ImageLinks TEXT DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS announcement_history (
        HistoryID TEXT PRIMARY KEY,
        AnnouncementID TEXT NOT NULL,
        Title TEXT NOT NULL,
        Message TEXT NOT NULL,
        ImageLinks TEXT DEFAULT '[]',
        EditedBy TEXT NOT NULL,
        EditedByName TEXT NOT NULL,
        EditedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS announcement_comments (
        CommentID TEXT PRIMARY KEY,
        AnnouncementID TEXT NOT NULL,
        UserID TEXT NOT NULL,
        UserName TEXT NOT NULL,
        Role TEXT NOT NULL,
        Message TEXT NOT NULL,
        CreatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS helpdesk_tickets (
        TicketID TEXT PRIMARY KEY,
        Subject TEXT NOT NULL,
        Category TEXT NOT NULL DEFAULT 'General Concern',
        Priority TEXT NOT NULL DEFAULT 'Normal',
        RelatedCARNo TEXT DEFAULT '',
        Status TEXT NOT NULL DEFAULT 'Open',
        CreatedBy TEXT NOT NULL,
        CreatedByName TEXT NOT NULL,
        CreatedByRole TEXT NOT NULL,
        CreatedByDepartment TEXT DEFAULT '',
        AssignedTo TEXT DEFAULT '',
        CreatedAt TEXT NOT NULL,
        UpdatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS helpdesk_messages (
        MessageID TEXT PRIMARY KEY,
        TicketID TEXT NOT NULL,
        SenderID TEXT NOT NULL,
        SenderName TEXT NOT NULL,
        SenderRole TEXT NOT NULL,
        Message TEXT NOT NULL,
        CreatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_helpdesk_msg_ticket ON helpdesk_messages(TicketID, CreatedAt);

      CREATE TABLE IF NOT EXISTS direct_messages (
        MessageID TEXT PRIMARY KEY,
        FromUserID TEXT NOT NULL,
        FromUserName TEXT NOT NULL,
        FromUserRole TEXT NOT NULL,
        ToUserID TEXT NOT NULL,
        Message TEXT NOT NULL,
        Read INTEGER NOT NULL DEFAULT 0,
        CreatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(FromUserID, ToUserID, CreatedAt);

      CREATE TABLE IF NOT EXISTS audit_schedules (
        ScheduleID TEXT PRIMARY KEY,
        Title TEXT NOT NULL,
        AuditType TEXT NOT NULL DEFAULT 'Internal ISO Audit',
        AuditDate TEXT NOT NULL,
        TimeWindow TEXT DEFAULT '',
        Department TEXT DEFAULT '',
        LeadAuditor TEXT DEFAULT '',
        Status TEXT NOT NULL DEFAULT 'Scheduled',
        Notes TEXT DEFAULT '',
        CreatedBy TEXT NOT NULL,
        CreatedAt TEXT NOT NULL,
        UpdatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_sched_date ON audit_schedules(AuditDate);
    `);

    // Seed and migrate official service/department list
    const existingDepts = (this.db.prepare('SELECT Name FROM departments').all() as Array<{ Name: string }>).map(
      (r) => r.Name
    );
    const hasLegacyDept = existingDepts.some((d) => Boolean(LEGACY_DEPARTMENT_MAP[d.trim().toLowerCase()]));
    const missingDefaultDept = DEFAULT_DEPARTMENTS.some((d) => !existingDepts.includes(d));
    if (existingDepts.length === 0 || hasLegacyDept || missingDefaultDept) {
      const deleteDept = this.db.prepare('DELETE FROM departments WHERE Name = ?');
      const insertDept = this.db.prepare('INSERT OR IGNORE INTO departments (Name) VALUES (?)');
      const tx = this.db.transaction(() => {
        for (const d of existingDepts) {
          if (LEGACY_DEPARTMENT_MAP[d.trim().toLowerCase()] && !DEFAULT_DEPARTMENTS.includes(d)) {
            deleteDept.run(d);
          }
        }
        for (const name of DEFAULT_DEPARTMENTS) {
          insertDept.run(name);
        }
      });
      tx();
    }

    // Migrate legacy user service names to canonical names
    const allUsers = this.db.prepare('SELECT UserID, Department FROM users').all() as Array<{
      UserID: string;
      Department: string;
    }>;
    const updateUserDept = this.db.prepare('UPDATE users SET Department = ? WHERE UserID = ?');
    for (const u of allUsers) {
      const parts = String(u.Department || '')
        .split(',')
        .map((p) => canonicalDepartment(p))
        .filter(Boolean);
      const normalized = Array.from(new Set(parts)).join(', ');
      if (normalized && normalized !== u.Department) {
        updateUserDept.run(normalized, u.UserID);
      }
    }

    // Seed company details if empty, and migrate legacy Drive logo placeholder to official local seal
    const companyCount = (this.db.prepare('SELECT COUNT(*) as c FROM company_details').get() as { c: number }).c;
    if (companyCount === 0) {
      const insertKv = this.db.prepare('INSERT OR REPLACE INTO company_details (Key, Value) VALUES (?, ?)');
      const tx = this.db.transaction((entries: [string, string][]) => {
        for (const [k, v] of entries) insertKv.run(k, v);
      });
      tx(Object.entries(DEFAULT_COMPANY_DETAILS));
    } else {
      this.db
        .prepare("UPDATE company_details SET Value = '/fcat-logo.png' WHERE Key = 'LogoUrl' AND Value LIKE '%1AjBH5OjVr9uuo3Wlb7VywM7eAkXD7zlR%'")
        .run();
    }

    // Seed 3 starter accounts (System Administrator, Auditor Account, Process Owner) on initial setup
    const userCount = (this.db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
    const onlyDefaultAdmin =
      userCount === 1 &&
      Boolean(
        this.db.prepare("SELECT 1 FROM users WHERE LOWER(Email) = 'admin@fcat.com.ph'").get()
      );
    if (userCount === 0 || onlyDefaultAdmin) {
      const insertUser = this.db.prepare(
        `INSERT INTO users (UserID, Name, Email, PasswordHash, Role, Department, Position, Status, CreatedAt)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM users WHERE LOWER(Email) = LOWER(?))`
      );
      const starters: Array<[string, string, string, string, string]> = [
        [
          'System Administrator',
          'admin@fcat.com.ph',
          'Admin',
          'QA / Management Representative',
          'System Administrator',
        ],
        [
          'ISO Auditor Account',
          'auditor@fcat.com.ph',
          'Auditor',
          'Review and Improvement',
          'Lead Auditor',
        ],
        [
          'Process Owner Account',
          'processowner@fcat.com.ph',
          'Employee',
          'IT Services',
          'Department Head',
        ],
      ];
      for (const [name, email, role, dept, pos] of starters) {
        insertUser.run(
          newId('U'),
          name,
          email,
          hashPassword('FCATsince1993!'),
          role,
          dept,
          pos,
          'Active',
          nowIso(),
          email
        );
      }
    }
  }

  // ---- Users ----
  async listUsers(): Promise<UserRecord[]> {
    return this.db.prepare('SELECT * FROM users ORDER BY Name ASC').all() as UserRecord[];
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE LOWER(Email) = LOWER(?)').get(email.trim()) as
      | UserRecord
      | undefined;
    return row || null;
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE UserID = ?').get(userId) as UserRecord | undefined;
    return row || null;
  }

  async createUser(user: UserRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO users (UserID, Name, Email, PasswordHash, Role, Department, Position, Status, CreatedAt)
         VALUES (@UserID, @Name, @Email, @PasswordHash, @Role, @Department, @Position, @Status, @CreatedAt)`
      )
      .run(user);
  }

  async updateUser(userId: string, updates: Partial<UserRecord>): Promise<boolean> {
    const allowed = ['Name', 'Email', 'PasswordHash', 'Role', 'Department', 'Position', 'Status'] as const;
    const keys = allowed.filter((k) => updates[k] !== undefined);
    if (keys.length === 0) return false;
    const setSql = keys.map((k) => `${k} = @${k}`).join(', ');
    const params: Record<string, unknown> = { UserID: userId };
    for (const k of keys) params[k] = updates[k];
    const info = this.db.prepare(`UPDATE users SET ${setSql} WHERE UserID = @UserID`).run(params);
    return info.changes > 0;
  }

  // ---- Departments ----
  async listDepartments(): Promise<string[]> {
    const rows = this.db.prepare('SELECT Name FROM departments ORDER BY Name ASC').all() as { Name: string }[];
    return rows.map((r) => r.Name);
  }

  async addDepartment(name: string): Promise<void> {
    this.db.prepare('INSERT OR IGNORE INTO departments (Name) VALUES (?)').run(name.trim());
  }

  async removeDepartment(name: string): Promise<boolean> {
    const info = this.db.prepare('DELETE FROM departments WHERE Name = ?').run(name.trim());
    return info.changes > 0;
  }

  // ---- CARs ----
  async listCARs(): Promise<CarRecord[]> {
    return this.db.prepare('SELECT * FROM car_records ORDER BY CreatedAt DESC').all() as CarRecord[];
  }

  async getCAR(carNo: string): Promise<CarRecord | null> {
    const row = this.db.prepare('SELECT * FROM car_records WHERE CARNo = ?').get(carNo) as CarRecord | undefined;
    if (!row) return null;
    const whys = await this.getWhyWhy(carNo);
    row.RootCauseFactors = JSON.stringify(whys);
    return row;
  }

  async createCAR(record: CarRecord, whyFactors: WhyWhyFactors): Promise<void> {
    const placeholders = CAR_COLS.map((c) => `@${c}`).join(', ');
    const colsSql = CAR_COLS.join(', ');
    const fullParams: Record<string, string> = {};
    for (const c of CAR_COLS) {
      fullParams[c] = String((record as unknown as Record<string, unknown>)[c] ?? '');
    }
    const insertCar = this.db.prepare(`INSERT INTO car_records (${colsSql}) VALUES (${placeholders})`);
    const insertWhy = this.db.prepare(
      `INSERT OR REPLACE INTO car_whywhy (CARNo, Factor, Why1, Why2, Why3, Why4, Why5, UpdatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = this.db.transaction(() => {
      insertCar.run(fullParams);
      const now = nowIso();
      for (const factor of WHY_FACTORS) {
        const arr = whyFactors[factor] || ['', '', '', '', ''];
        insertWhy.run(record.CARNo, factor, arr[0] || '', arr[1] || '', arr[2] || '', arr[3] || '', arr[4] || '', now);
      }
    });
    tx();
  }

  async updateCAR(carNo: string, updates: Partial<CarRecord>, whyFactors?: WhyWhyFactors): Promise<boolean> {
    const validCols = CAR_COLS.filter((c) => c !== 'CARNo' && (updates as Record<string, unknown>)[c] !== undefined);
    const tx = this.db.transaction(() => {
      if (validCols.length > 0) {
        const setSql = validCols.map((c) => `${c} = @${c}`).join(', ');
        const params: Record<string, string> = { CARNo: carNo };
        for (const c of validCols) {
          params[c] = String((updates as unknown as Record<string, unknown>)[c] ?? '');
        }
        const info = this.db.prepare(`UPDATE car_records SET ${setSql} WHERE CARNo = @CARNo`).run(params);
        if (info.changes === 0) return false;
      } else {
        const exists = this.db.prepare('SELECT 1 FROM car_records WHERE CARNo = ?').get(carNo);
        if (!exists) return false;
      }

      if (whyFactors) {
        const insertWhy = this.db.prepare(
          `INSERT OR REPLACE INTO car_whywhy (CARNo, Factor, Why1, Why2, Why3, Why4, Why5, UpdatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const now = nowIso();
        for (const factor of WHY_FACTORS) {
          const arr = whyFactors[factor] || ['', '', '', '', ''];
          insertWhy.run(carNo, factor, arr[0] || '', arr[1] || '', arr[2] || '', arr[3] || '', arr[4] || '', now);
        }
      }
      return true;
    });
    return tx();
  }

  async getWhyWhy(carNo: string): Promise<WhyWhyFactors> {
    const rows = this.db
      .prepare('SELECT Factor, Why1, Why2, Why3, Why4, Why5 FROM car_whywhy WHERE CARNo = ?')
      .all(carNo) as Array<{
      Factor: string;
      Why1: string;
      Why2: string;
      Why3: string;
      Why4: string;
      Why5: string;
    }>;
    const result: WhyWhyFactors = {
      Man: ['', '', '', '', ''],
      Method: ['', '', '', '', ''],
      Machine: ['', '', '', '', ''],
      Material: ['', '', '', '', ''],
      Environment: ['', '', '', '', ''],
    };
    for (const r of rows) {
      if (r.Factor in result) {
        result[r.Factor as keyof WhyWhyFactors] = [
          r.Why1 || '',
          r.Why2 || '',
          r.Why3 || '',
          r.Why4 || '',
          r.Why5 || '',
        ];
      }
    }
    return result;
  }

  // ---- Comments ----
  async listCarComments(carNo: string): Promise<CarComment[]> {
    return this.db
      .prepare('SELECT * FROM car_comments WHERE CARNo = ? ORDER BY CreatedAt ASC')
      .all(carNo) as CarComment[];
  }

  async addCarComment(comment: CarComment): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO car_comments (CommentID, CARNo, UserID, UserName, Role, Message, CreatedAt)
         VALUES (@CommentID, @CARNo, @UserID, @UserName, @Role, @Message, @CreatedAt)`
      )
      .run(comment);
  }

  // ---- Notifications ----
  async listNotificationsForUser(userId: string): Promise<NotificationRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM notifications WHERE ToUserID = ? ORDER BY CreatedAt DESC')
      .all(userId) as Array<Omit<NotificationRecord, 'Read'> & { Read: number }>;
    return rows.map((r) => ({ ...r, Read: Boolean(r.Read) }));
  }

  async createNotification(notif: NotificationRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO notifications (NotificationID, ToUserID, FromUserID, Message, RelatedCARNo, Read, CreatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        notif.NotificationID,
        notif.ToUserID,
        notif.FromUserID,
        notif.Message,
        notif.RelatedCARNo,
        notif.Read ? 1 : 0,
        notif.CreatedAt
      );
  }

  async markNotificationRead(notificationId: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const info = isAdmin
      ? this.db.prepare('UPDATE notifications SET Read = 1 WHERE NotificationID = ?').run(notificationId)
      : this.db
          .prepare('UPDATE notifications SET Read = 1 WHERE NotificationID = ? AND ToUserID = ?')
          .run(notificationId, userId);
    return info.changes > 0;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    this.db.prepare('UPDATE notifications SET Read = 1 WHERE ToUserID = ?').run(userId);
  }

  // ---- Company & Settings ----
  async getCompanyDetails(): Promise<Record<string, string>> {
    const rows = this.db.prepare('SELECT Key, Value FROM company_details').all() as { Key: string; Value: string }[];
    const map: Record<string, string> = {};
    for (const r of rows) map[r.Key] = r.Value;
    return map;
  }

  async updateCompanyDetails(updates: Record<string, string>): Promise<void> {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO company_details (Key, Value) VALUES (?, ?)');
    const tx = this.db.transaction(() => {
      for (const [k, v] of Object.entries(updates)) {
        stmt.run(k, String(v ?? ''));
      }
    });
    tx();
  }

  async getSettings(): Promise<Record<string, string>> {
    const rows = this.db.prepare('SELECT Key, Value FROM settings').all() as { Key: string; Value: string }[];
    const map: Record<string, string> = {};
    for (const r of rows) map[r.Key] = r.Value;
    return map;
  }

  async updateSettings(updates: Record<string, string>): Promise<void> {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (Key, Value) VALUES (?, ?)');
    const tx = this.db.transaction(() => {
      for (const [k, v] of Object.entries(updates)) {
        stmt.run(k, String(v ?? ''));
      }
    });
    tx();
  }

  // ---- Announcements ----
  async listAnnouncements(): Promise<AnnouncementRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM announcements ORDER BY CreatedAt DESC')
      .all() as Array<Omit<AnnouncementRecord, 'ImageLinks'> & { ImageLinks: string }>;
    return rows.map((r) => ({ ...r, ImageLinks: parseJsonArray<string>(r.ImageLinks) }));
  }

  async getAnnouncement(announcementId: string): Promise<AnnouncementRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM announcements WHERE AnnouncementID = ?')
      .get(announcementId) as (Omit<AnnouncementRecord, 'ImageLinks'> & { ImageLinks: string }) | undefined;
    if (!row) return null;
    return { ...row, ImageLinks: parseJsonArray<string>(row.ImageLinks) };
  }

  async createAnnouncement(item: AnnouncementRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO announcements (AnnouncementID, Title, Message, PostedBy, PostedByName, CreatedAt, UpdatedAt, ImageLinks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        item.AnnouncementID,
        item.Title,
        item.Message,
        item.PostedBy,
        item.PostedByName,
        item.CreatedAt,
        item.UpdatedAt,
        JSON.stringify(item.ImageLinks || [])
      );
  }

  async updateAnnouncement(
    announcementId: string,
    updates: { Title: string; Message: string; ImageLinks: string[]; UpdatedAt: string },
    historySnapshot: AnnouncementHistoryRecord
  ): Promise<boolean> {
    const tx = this.db.transaction(() => {
      const info = this.db
        .prepare(
          `UPDATE announcements SET Title = ?, Message = ?, ImageLinks = ?, UpdatedAt = ? WHERE AnnouncementID = ?`
        )
        .run(
          updates.Title,
          updates.Message,
          JSON.stringify(updates.ImageLinks || []),
          updates.UpdatedAt,
          announcementId
        );
      if (info.changes === 0) return false;
      this.db
        .prepare(
          `INSERT INTO announcement_history (HistoryID, AnnouncementID, Title, Message, ImageLinks, EditedBy, EditedByName, EditedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          historySnapshot.HistoryID,
          historySnapshot.AnnouncementID,
          historySnapshot.Title,
          historySnapshot.Message,
          JSON.stringify(historySnapshot.ImageLinks || []),
          historySnapshot.EditedBy,
          historySnapshot.EditedByName,
          historySnapshot.EditedAt
        );
      return true;
    });
    return tx();
  }

  async deleteAnnouncement(announcementId: string): Promise<boolean> {
    const tx = this.db.transaction(() => {
      const info = this.db.prepare('DELETE FROM announcements WHERE AnnouncementID = ?').run(announcementId);
      if (info.changes === 0) return false;
      this.db.prepare('DELETE FROM announcement_history WHERE AnnouncementID = ?').run(announcementId);
      this.db.prepare('DELETE FROM announcement_comments WHERE AnnouncementID = ?').run(announcementId);
      return true;
    });
    return tx();
  }

  async getAnnouncementHistory(announcementId: string): Promise<AnnouncementHistoryRecord[]> {
    const rows = this.db
      .prepare('SELECT * FROM announcement_history WHERE AnnouncementID = ? ORDER BY EditedAt DESC')
      .all(announcementId) as Array<Omit<AnnouncementHistoryRecord, 'ImageLinks'> & { ImageLinks: string }>;
    return rows.map((r) => ({ ...r, ImageLinks: parseJsonArray<string>(r.ImageLinks) }));
  }

  async listAnnouncementComments(announcementId: string): Promise<AnnouncementComment[]> {
    return this.db
      .prepare('SELECT * FROM announcement_comments WHERE AnnouncementID = ? ORDER BY CreatedAt ASC')
      .all(announcementId) as AnnouncementComment[];
  }

  async addAnnouncementComment(comment: AnnouncementComment): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO announcement_comments (CommentID, AnnouncementID, UserID, UserName, Role, Message, CreatedAt)
         VALUES (@CommentID, @AnnouncementID, @UserID, @UserName, @Role, @Message, @CreatedAt)`
      )
      .run(comment);
  }

  async deleteAnnouncementComment(
    commentId: string,
    requesterId: string,
    isAdmin: boolean
  ): Promise<'ok' | 'not_found' | 'forbidden'> {
    const existing = this.db
      .prepare('SELECT UserID FROM announcement_comments WHERE CommentID = ?')
      .get(commentId) as { UserID: string } | undefined;
    if (!existing) return 'not_found';
    if (!isAdmin && existing.UserID !== requesterId) return 'forbidden';
    this.db.prepare('DELETE FROM announcement_comments WHERE CommentID = ?').run(commentId);
    return 'ok';
  }

  // ---- Help Desk & Direct Messages ----
  async listHelpDeskTickets(): Promise<HelpDeskTicket[]> {
    return this.db
      .prepare('SELECT * FROM helpdesk_tickets ORDER BY UpdatedAt DESC, CreatedAt DESC')
      .all() as HelpDeskTicket[];
  }

  async getHelpDeskTicket(ticketId: string): Promise<HelpDeskTicket | null> {
    return (
      (this.db.prepare('SELECT * FROM helpdesk_tickets WHERE TicketID = ?').get(ticketId) as
        | HelpDeskTicket
        | undefined) || null
    );
  }

  async createHelpDeskTicket(ticket: HelpDeskTicket, initialMessage: HelpDeskMessage): Promise<void> {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO helpdesk_tickets (
            TicketID, Subject, Category, Priority, RelatedCARNo, Status,
            CreatedBy, CreatedByName, CreatedByRole, CreatedByDepartment, AssignedTo, CreatedAt, UpdatedAt
          ) VALUES (
            @TicketID, @Subject, @Category, @Priority, @RelatedCARNo, @Status,
            @CreatedBy, @CreatedByName, @CreatedByRole, @CreatedByDepartment, @AssignedTo, @CreatedAt, @UpdatedAt
          )`
        )
        .run(ticket);
      this.db
        .prepare(
          `INSERT INTO helpdesk_messages (MessageID, TicketID, SenderID, SenderName, SenderRole, Message, CreatedAt)
           VALUES (@MessageID, @TicketID, @SenderID, @SenderName, @SenderRole, @Message, @CreatedAt)`
        )
        .run(initialMessage);
    });
    tx();
  }

  async updateHelpDeskTicket(ticketId: string, updates: Partial<HelpDeskTicket>): Promise<boolean> {
    const allowed = ['Subject', 'Category', 'Priority', 'RelatedCARNo', 'Status', 'AssignedTo', 'UpdatedAt'] as const;
    const entries = Object.entries(updates).filter(([k]) => (allowed as readonly string[]).includes(k));
    if (entries.length === 0) return false;
    const setSql = entries.map(([k]) => `${k} = ?`).join(', ');
    const vals = entries.map(([, v]) => (v === undefined ? '' : String(v)));
    const info = this.db.prepare(`UPDATE helpdesk_tickets SET ${setSql} WHERE TicketID = ?`).run(...vals, ticketId);
    return info.changes > 0;
  }

  async listHelpDeskMessages(ticketId: string): Promise<HelpDeskMessage[]> {
    return this.db
      .prepare('SELECT * FROM helpdesk_messages WHERE TicketID = ? ORDER BY CreatedAt ASC')
      .all(ticketId) as HelpDeskMessage[];
  }

  async addHelpDeskMessage(message: HelpDeskMessage): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO helpdesk_messages (MessageID, TicketID, SenderID, SenderName, SenderRole, Message, CreatedAt)
         VALUES (@MessageID, @TicketID, @SenderID, @SenderName, @SenderRole, @Message, @CreatedAt)`
      )
      .run(message);
  }

  async listDirectMessagesForUser(userId: string): Promise<DirectMessage[]> {
    const rows = this.db
      .prepare('SELECT * FROM direct_messages WHERE FromUserID = ? OR ToUserID = ? ORDER BY CreatedAt ASC')
      .all(userId, userId) as Array<Omit<DirectMessage, 'Read'> & { Read: number }>;
    return rows.map((r) => ({ ...r, Read: r.Read === 1 }));
  }

  async createDirectMessage(message: DirectMessage): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO direct_messages (MessageID, FromUserID, FromUserName, FromUserRole, ToUserID, Message, Read, CreatedAt)
         VALUES (@MessageID, @FromUserID, @FromUserName, @FromUserRole, @ToUserID, @Message, @Read, @CreatedAt)`
      )
      .run({ ...message, Read: message.Read ? 1 : 0 });
  }

  async markDirectMessagesRead(fromUserId: string, toUserId: string): Promise<void> {
    this.db
      .prepare('UPDATE direct_messages SET Read = 1 WHERE FromUserID = ? AND ToUserID = ? AND Read = 0')
      .run(fromUserId, toUserId);
  }

  // ---- Audit Schedules ----
  async listAuditSchedules(): Promise<AuditSchedule[]> {
    return this.db
      .prepare('SELECT * FROM audit_schedules ORDER BY AuditDate ASC, TimeWindow ASC, CreatedAt ASC')
      .all() as AuditSchedule[];
  }

  async getAuditSchedule(scheduleId: string): Promise<AuditSchedule | null> {
    return (
      (this.db.prepare('SELECT * FROM audit_schedules WHERE ScheduleID = ?').get(scheduleId) as
        | AuditSchedule
        | undefined) || null
    );
  }

  async createAuditSchedule(item: AuditSchedule): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO audit_schedules (
          ScheduleID, Title, AuditType, AuditDate, TimeWindow, Department,
          LeadAuditor, Status, Notes, CreatedBy, CreatedAt, UpdatedAt
        ) VALUES (
          @ScheduleID, @Title, @AuditType, @AuditDate, @TimeWindow, @Department,
          @LeadAuditor, @Status, @Notes, @CreatedBy, @CreatedAt, @UpdatedAt
        )`
      )
      .run(item);
  }

  async updateAuditSchedule(scheduleId: string, updates: Partial<AuditSchedule>): Promise<boolean> {
    const allowed = [
      'Title',
      'AuditType',
      'AuditDate',
      'TimeWindow',
      'Department',
      'LeadAuditor',
      'Status',
      'Notes',
      'UpdatedAt',
    ] as const;
    const entries = Object.entries(updates).filter(([k]) => (allowed as readonly string[]).includes(k));
    if (entries.length === 0) return false;
    const setSql = entries.map(([k]) => `${k} = ?`).join(', ');
    const vals = entries.map(([, v]) => (v === undefined ? '' : String(v)));
    const info = this.db.prepare(`UPDATE audit_schedules SET ${setSql} WHERE ScheduleID = ?`).run(...vals, scheduleId);
    return info.changes > 0;
  }

  async deleteAuditSchedule(scheduleId: string): Promise<boolean> {
    const info = this.db.prepare('DELETE FROM audit_schedules WHERE ScheduleID = ?').run(scheduleId);
    return info.changes > 0;
  }

  // ---- Audit Log ----
  async appendLog(entry: AuditLogEntry): Promise<void> {
    this.db
      .prepare('INSERT INTO audit_log (Timestamp, UserID, Action, Details) VALUES (?, ?, ?, ?)')
      .run(entry.Timestamp, entry.UserID, entry.Action, entry.Details || '');
  }

  async listLogs(limit = 100): Promise<AuditLogEntry[]> {
    return this.db
      .prepare('SELECT Timestamp, UserID, Action, Details FROM audit_log ORDER BY id DESC LIMIT ?')
      .all(limit) as AuditLogEntry[];
  }
}
