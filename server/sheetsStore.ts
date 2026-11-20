import { google, sheets_v4, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import {
  ANNOUNCEMENT_COLS,
  ANNOUNCEMENT_COMMENT_COLS,
  ANNOUNCEMENT_HISTORY_COLS,
  AUDIT_SCHEDULE_COLS,
  CAR_COLS,
  COMMENT_COLS,
  COMPANY_COLS,
  DEFAULT_COMPANY_DETAILS,
  DEFAULT_DEPARTMENTS,
  DEPARTMENT_COLS,
  DIRECT_MESSAGE_COLS,
  HELPDESK_MESSAGE_COLS,
  HELPDESK_TICKET_COLS,
  LEGACY_DEPARTMENT_MAP,
  LOG_COLS,
  NOTIF_COLS,
  SETTINGS_COLS,
  SHEETS,
  USER_COLS,
  WHY_COLS,
  WHY_FACTORS,
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

interface ServiceAccountCreds {
  client_email: string;
  private_key: string;
}

export function parseServiceAccountCreds(rawJson?: string): ServiceAccountCreds | null {
  const src = rawJson || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (src) {
    try {
      const parsed = JSON.parse(src);
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
        };
      }
    } catch {
      return null;
    }
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }
  return null;
}

export class GoogleSheetsStore implements DataStore {
  public readonly mode = 'sheets' as const;
  private spreadsheetId: string;
  private sheets: sheets_v4.Sheets;
  private drive: drive_v3.Drive;
  private sheetIds: Map<string, number> = new Map();
  private cache: Map<string, { at: number; rows: string[][] }> = new Map();
  private readonly CACHE_TTL_MS = 4000;

  constructor(spreadsheetId: string, creds: ServiceAccountCreds) {
    this.spreadsheetId = spreadsheetId;
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
    this.drive = google.drive({ version: 'v3', auth });
  }

  private invalidate(tab?: string) {
    if (tab) this.cache.delete(tab);
    else this.cache.clear();
  }

  private async refreshMetadata(): Promise<void> {
    const meta = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'properties.title,sheets(properties(sheetId,title))',
    });
    this.sheetIds.clear();
    for (const s of meta.data.sheets || []) {
      if (s.properties?.title && s.properties.sheetId !== undefined && s.properties.sheetId !== null) {
        this.sheetIds.set(s.properties.title, s.properties.sheetId);
      }
    }
  }

  async testConnection(): Promise<{ title: string; tabs: string[] }> {
    const meta = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'properties.title,sheets(properties(sheetId,title))',
    });
    return {
      title: meta.data.properties?.title || 'Connected Google Sheet',
      tabs: (meta.data.sheets || []).map((s) => s.properties?.title || '').filter(Boolean),
    };
  }

  private async ensureTab(tab: string, headers: string[]): Promise<void> {
    if (!this.sheetIds.has(tab)) {
      const resp = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tab } } }],
        },
      });
      const newIdNum = resp.data.replies?.[0]?.addSheet?.properties?.sheetId;
      if (typeof newIdNum === 'number') this.sheetIds.set(tab, newIdNum);
    }

    const rows = await this.getRowsRaw(tab, true);
    if (rows.length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${tab}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
      this.invalidate(tab);
    } else if (rows[0].length < headers.length) {
      const missing = headers.slice(rows[0].length);
      const startCol = colToLetter(rows[0].length + 1);
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${tab}'!${startCol}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [missing] },
      });
      this.invalidate(tab);
    }
  }

  async init(): Promise<void> {
    await this.refreshMetadata();
    await this.ensureTab(SHEETS.USERS, USER_COLS);
    await this.ensureTab(SHEETS.CAR, CAR_COLS);
    await this.ensureTab(SHEETS.WHY_WHY, WHY_COLS);
    await this.ensureTab(SHEETS.NOTIFICATIONS, NOTIF_COLS);
    await this.ensureTab(SHEETS.COMPANY, COMPANY_COLS);
    await this.ensureTab(SHEETS.SETTINGS, SETTINGS_COLS);
    await this.ensureTab(SHEETS.LOG, LOG_COLS);
    await this.ensureTab(SHEETS.COMMENTS, COMMENT_COLS);
    await this.ensureTab(SHEETS.ANNOUNCEMENTS, ANNOUNCEMENT_COLS);
    await this.ensureTab(SHEETS.ANNOUNCEMENT_HISTORY, ANNOUNCEMENT_HISTORY_COLS);
    await this.ensureTab(SHEETS.ANNOUNCEMENT_COMMENTS, ANNOUNCEMENT_COMMENT_COLS);
    await this.ensureTab(SHEETS.DEPARTMENTS, DEPARTMENT_COLS);
    await this.ensureTab(SHEETS.HELPDESK_TICKETS, HELPDESK_TICKET_COLS);
    await this.ensureTab(SHEETS.HELPDESK_MESSAGES, HELPDESK_MESSAGE_COLS);
    await this.ensureTab(SHEETS.DIRECT_MESSAGES, DIRECT_MESSAGE_COLS);
    await this.ensureTab(SHEETS.AUDIT_SCHEDULES, AUDIT_SCHEDULE_COLS);

    const deptRows = await this.getRowsRaw(SHEETS.DEPARTMENTS, true);
    const existingDepts = deptRows.slice(1).map((r) => String(r[0] || '').trim()).filter(Boolean);
    const hasLegacyDept = existingDepts.some((d) => Boolean(LEGACY_DEPARTMENT_MAP[d.toLowerCase()]));
    const missingDefaultDept = DEFAULT_DEPARTMENTS.some((d) => !existingDepts.includes(d));
    if (deptRows.length <= 1 || hasLegacyDept || missingDefaultDept) {
      const customDepts = existingDepts.filter(
        (d) => !LEGACY_DEPARTMENT_MAP[d.toLowerCase()] && !DEFAULT_DEPARTMENTS.includes(d)
      );
      const nextDepts = Array.from(new Set([...DEFAULT_DEPARTMENTS, ...customDepts]));
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `'${SHEETS.DEPARTMENTS}'!A:Z`,
      });
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${SHEETS.DEPARTMENTS}'!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [DEPARTMENT_COLS, ...nextDepts.map((d) => [d])],
        },
      });
      this.invalidate(SHEETS.DEPARTMENTS);
    }

    const companyRows = await this.getRowsRaw(SHEETS.COMPANY);
    if (companyRows.length <= 1) {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `'${SHEETS.COMPANY}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: Object.entries(DEFAULT_COMPANY_DETAILS) },
      });
      this.invalidate(SHEETS.COMPANY);
    }

    const userRows = await this.getRowsRaw(SHEETS.USERS);
    if (userRows.length <= 1) {
      await this.appendRow(SHEETS.USERS, USER_COLS, {
        UserID: newId('U'),
        Name: 'System Administrator',
        Email: 'admin@fcat.com.ph',
        PasswordHash: hashPassword('FCATsince1993!'),
        Role: 'Admin',
        Department: 'QA / Management Representative',
        Position: 'Administrator',
        Status: 'Active',
        CreatedAt: nowIso(),
      });
    }
  }

  private async getRowsRaw(tab: string, skipCache = false): Promise<string[][]> {
    if (!skipCache) {
      const hit = this.cache.get(tab);
      if (hit && Date.now() - hit.at < this.CACHE_TTL_MS) {
        return hit.rows;
      }
    }
    const resp = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${tab}'!A:ZZ`,
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const rows = (resp.data.values || []).map((r) => r.map((c) => String(c ?? '')));
    this.cache.set(tab, { at: Date.now(), rows });
    return rows;
  }

  private async getObjects<T>(tab: string, cols: string[]): Promise<Array<T & { _row: number }>> {
    const rows = await this.getRowsRaw(tab);
    const out: Array<T & { _row: number }> = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.every((c) => c === '')) continue;
      const obj: Record<string, unknown> = { _row: i + 1 };
      cols.forEach((c, idx) => {
        obj[c] = row[idx] ?? '';
      });
      out.push(obj as T & { _row: number });
    }
    return out;
  }

  private async appendRow(tab: string, cols: string[], obj: Record<string, unknown>): Promise<void> {
    const row = cols.map((c) => String(obj[c] ?? ''));
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${tab}'!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    this.invalidate(tab);
  }

  private async updateRowByField(
    tab: string,
    cols: string[],
    keyField: string,
    keyValue: string,
    updates: Record<string, unknown>
  ): Promise<boolean> {
    const rows = await this.getRowsRaw(tab, true);
    const keyIdx = cols.indexOf(keyField);
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][keyIdx] ?? '') === keyValue) {
        const merged = cols.map((c, idx) =>
          updates[c] !== undefined ? String(updates[c] ?? '') : String(rows[i][idx] ?? '')
        );
        const endCol = colToLetter(cols.length);
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `'${tab}'!A${i + 1}:${endCol}${i + 1}`,
          valueInputOption: 'RAW',
          requestBody: { values: [merged] },
        });
        this.invalidate(tab);
        return true;
      }
    }
    return false;
  }

  private async deleteRowsWhere(tab: string, cols: string[], field: string, value: string): Promise<number> {
    const sheetId = this.sheetIds.get(tab);
    if (sheetId === undefined) return 0;
    const rows = await this.getRowsRaw(tab, true);
    const idx = cols.indexOf(field);
    const matchingIndices: number[] = [];
    for (let i = rows.length - 1; i >= 1; i--) {
      if ((rows[i][idx] ?? '') === value) matchingIndices.push(i);
    }
    if (matchingIndices.length === 0) return 0;
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: matchingIndices.map((rowIdx) => ({
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIdx,
              endIndex: rowIdx + 1,
            },
          },
        })),
      },
    });
    this.invalidate(tab);
    return matchingIndices.length;
  }

  // Optional Google Drive file upload if Service Account has access to Drive folder
  async uploadFileToDrive(
    folderId: string,
    filename: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<{ url: string; thumbnailUrl: string } | null> {
    try {
      const resp = await this.drive.files.create({
        requestBody: {
          name: filename,
          parents: folderId ? [folderId] : undefined,
        },
        media: {
          mimeType,
          body: Readable.from(buffer),
        },
        supportsAllDrives: true,
        fields: 'id, webViewLink',
      });
      const fileId = resp.data.id;
      if (!fileId) return null;
      try {
        await this.drive.permissions.create({
          fileId,
          supportsAllDrives: true,
          requestBody: { role: 'reader', type: 'anyone' },
        });
      } catch (permErr) {
        console.warn('[Drive] File uploaded, but could not set anyone-reader permission:', permErr instanceof Error ? permErr.message : permErr);
      }
      return {
        url: resp.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
        thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
      };
    } catch (err) {
      console.error('[Drive] Upload failed, falling back to local disk:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  // ---- Users ----
  async listUsers(): Promise<UserRecord[]> {
    const rows = await this.getObjects<UserRecord>(SHEETS.USERS, USER_COLS);
    return rows.map(({ _row, ...u }) => u);
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const users = await this.listUsers();
    const target = email.trim().toLowerCase();
    return users.find((u) => u.Email.trim().toLowerCase() === target) || null;
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    const users = await this.listUsers();
    return users.find((u) => u.UserID === userId) || null;
  }

  async createUser(user: UserRecord): Promise<void> {
    await this.appendRow(SHEETS.USERS, USER_COLS, user as unknown as Record<string, unknown>);
  }

  async updateUser(userId: string, updates: Partial<UserRecord>): Promise<boolean> {
    return this.updateRowByField(
      SHEETS.USERS,
      USER_COLS,
      'UserID',
      userId,
      updates as unknown as Record<string, unknown>
    );
  }

  // ---- Departments ----
  async listDepartments(): Promise<string[]> {
    const rows = await this.getObjects<{ Name: string }>(SHEETS.DEPARTMENTS, DEPARTMENT_COLS);
    return Array.from(new Set(rows.map((r) => r.Name.trim()).filter(Boolean))).sort();
  }

  async addDepartment(name: string): Promise<void> {
    const existing = await this.listDepartments();
    if (!existing.includes(name.trim())) {
      await this.appendRow(SHEETS.DEPARTMENTS, DEPARTMENT_COLS, { Name: name.trim() });
    }
  }

  async removeDepartment(name: string): Promise<boolean> {
    const removed = await this.deleteRowsWhere(SHEETS.DEPARTMENTS, DEPARTMENT_COLS, 'Name', name.trim());
    return removed > 0;
  }

  // ---- CARs ----
  async listCARs(): Promise<CarRecord[]> {
    const rows = await this.getObjects<CarRecord>(SHEETS.CAR, CAR_COLS);
    return rows.map(({ _row, ...r }) => r);
  }

  async getCAR(carNo: string): Promise<CarRecord | null> {
    const all = await this.listCARs();
    const rec = all.find((r) => r.CARNo === carNo);
    if (!rec) return null;
    const whys = await this.getWhyWhy(carNo);
    return { ...rec, RootCauseFactors: JSON.stringify(whys) };
  }

  async createCAR(record: CarRecord, whyFactors: WhyWhyFactors): Promise<void> {
    await this.appendRow(SHEETS.CAR, CAR_COLS, record as unknown as Record<string, unknown>);
    await this.saveWhyWhy(record.CARNo, whyFactors);
  }

  async updateCAR(carNo: string, updates: Partial<CarRecord>, whyFactors?: WhyWhyFactors): Promise<boolean> {
    const ok = await this.updateRowByField(
      SHEETS.CAR,
      CAR_COLS,
      'CARNo',
      carNo,
      updates as unknown as Record<string, unknown>
    );
    if (!ok) return false;
    if (whyFactors) await this.saveWhyWhy(carNo, whyFactors);
    return true;
  }

  private async saveWhyWhy(carNo: string, data: WhyWhyFactors): Promise<void> {
    await this.deleteRowsWhere(SHEETS.WHY_WHY, WHY_COLS, 'CARNo', carNo);
    const now = nowIso();
    const rows = WHY_FACTORS.map((factor) => {
      const arr = data[factor] || ['', '', '', '', ''];
      return [carNo, factor, arr[0] || '', arr[1] || '', arr[2] || '', arr[3] || '', arr[4] || '', now];
    });
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${SHEETS.WHY_WHY}'!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
    this.invalidate(SHEETS.WHY_WHY);
  }

  async getWhyWhy(carNo: string): Promise<WhyWhyFactors> {
    const rows = await this.getRowsRaw(SHEETS.WHY_WHY);
    const result: WhyWhyFactors = {
      Man: ['', '', '', '', ''],
      Method: ['', '', '', '', ''],
      Machine: ['', '', '', '', ''],
      Material: ['', '', '', '', ''],
      Environment: ['', '', '', '', ''],
    };
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === carNo) {
        const factor = rows[i][1] as keyof WhyWhyFactors;
        if (factor in result) {
          result[factor] = [
            rows[i][2] || '',
            rows[i][3] || '',
            rows[i][4] || '',
            rows[i][5] || '',
            rows[i][6] || '',
          ];
        }
      }
    }
    return result;
  }

  // ---- Comments ----
  async listCarComments(carNo: string): Promise<CarComment[]> {
    const rows = await this.getObjects<CarComment>(SHEETS.COMMENTS, COMMENT_COLS);
    return rows
      .filter((c) => c.CARNo === carNo)
      .map(({ _row, ...c }) => c)
      .sort((a, b) => new Date(a.CreatedAt).getTime() - new Date(b.CreatedAt).getTime());
  }

  async addCarComment(comment: CarComment): Promise<void> {
    await this.appendRow(SHEETS.COMMENTS, COMMENT_COLS, comment as unknown as Record<string, unknown>);
  }

  // ---- Notifications ----
  async listNotificationsForUser(userId: string): Promise<NotificationRecord[]> {
    const rows = await this.getObjects<NotificationRecord>(SHEETS.NOTIFICATIONS, NOTIF_COLS);
    return rows
      .filter((n) => n.ToUserID === userId)
      .map(({ _row, ...n }) => ({
        ...n,
        Read: n.Read === true || String(n.Read).toUpperCase() === 'TRUE' || String(n.Read) === '1',
      }))
      .sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime());
  }

  async createNotification(notif: NotificationRecord): Promise<void> {
    await this.appendRow(SHEETS.NOTIFICATIONS, NOTIF_COLS, {
      ...notif,
      Read: notif.Read ? 'TRUE' : 'FALSE',
    });
  }

  async markNotificationRead(notificationId: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const rows = await this.getObjects<NotificationRecord>(SHEETS.NOTIFICATIONS, NOTIF_COLS);
    const target = rows.find((n) => n.NotificationID === notificationId);
    if (!target) return false;
    if (!isAdmin && target.ToUserID !== userId) return false;
    return this.updateRowByField(SHEETS.NOTIFICATIONS, NOTIF_COLS, 'NotificationID', notificationId, {
      Read: 'TRUE',
    });
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    const rows = await this.getObjects<NotificationRecord>(SHEETS.NOTIFICATIONS, NOTIF_COLS);
    const unread = rows.filter(
      (n) => n.ToUserID === userId && !(n.Read === true || String(n.Read).toUpperCase() === 'TRUE')
    );
    for (const n of unread) {
      await this.updateRowByField(SHEETS.NOTIFICATIONS, NOTIF_COLS, 'NotificationID', n.NotificationID, {
        Read: 'TRUE',
      });
    }
  }

  // ---- Company & Settings ----
  private async getKeyValueMap(tab: string): Promise<Record<string, string>> {
    const rows = await this.getRowsRaw(tab);
    const map: Record<string, string> = {};
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) map[rows[i][0]] = rows[i][1] ?? '';
    }
    return map;
  }

  private async setKeyValues(tab: string, updates: Record<string, string>): Promise<void> {
    const rows = await this.getRowsRaw(tab, true);
    for (const [k, v] of Object.entries(updates)) {
      let updated = false;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === k) {
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `'${tab}'!B${i + 1}`,
            valueInputOption: 'RAW',
            requestBody: { values: [[String(v ?? '')]] },
          });
          updated = true;
          break;
        }
      }
      if (!updated) {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `'${tab}'!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [[k, String(v ?? '')]] },
        });
      }
    }
    this.invalidate(tab);
  }

  async getCompanyDetails(): Promise<Record<string, string>> {
    return this.getKeyValueMap(SHEETS.COMPANY);
  }

  async updateCompanyDetails(updates: Record<string, string>): Promise<void> {
    await this.setKeyValues(SHEETS.COMPANY, updates);
  }

  async getSettings(): Promise<Record<string, string>> {
    return this.getKeyValueMap(SHEETS.SETTINGS);
  }

  async updateSettings(updates: Record<string, string>): Promise<void> {
    await this.setKeyValues(SHEETS.SETTINGS, updates);
  }

  // ---- Announcements ----
  async listAnnouncements(): Promise<AnnouncementRecord[]> {
    const rows = await this.getObjects<Omit<AnnouncementRecord, 'ImageLinks'> & { ImageLinks: string }>(
      SHEETS.ANNOUNCEMENTS,
      ANNOUNCEMENT_COLS
    );
    return rows
      .map(({ _row, ...a }) => ({
        ...a,
        ImageLinks: parseJsonArray<string>(a.ImageLinks),
      }))
      .sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime());
  }

  async getAnnouncement(announcementId: string): Promise<AnnouncementRecord | null> {
    const all = await this.listAnnouncements();
    return all.find((a) => a.AnnouncementID === announcementId) || null;
  }

  async createAnnouncement(item: AnnouncementRecord): Promise<void> {
    await this.appendRow(SHEETS.ANNOUNCEMENTS, ANNOUNCEMENT_COLS, {
      ...item,
      ImageLinks: JSON.stringify(item.ImageLinks || []),
    });
  }

  async updateAnnouncement(
    announcementId: string,
    updates: { Title: string; Message: string; ImageLinks: string[]; UpdatedAt: string },
    historySnapshot: AnnouncementHistoryRecord
  ): Promise<boolean> {
    const ok = await this.updateRowByField(
      SHEETS.ANNOUNCEMENTS,
      ANNOUNCEMENT_COLS,
      'AnnouncementID',
      announcementId,
      {
        Title: updates.Title,
        Message: updates.Message,
        ImageLinks: JSON.stringify(updates.ImageLinks || []),
        UpdatedAt: updates.UpdatedAt,
      }
    );
    if (!ok) return false;
    await this.appendRow(SHEETS.ANNOUNCEMENT_HISTORY, ANNOUNCEMENT_HISTORY_COLS, {
      ...historySnapshot,
      ImageLinks: JSON.stringify(historySnapshot.ImageLinks || []),
    });
    return true;
  }

  async deleteAnnouncement(announcementId: string): Promise<boolean> {
    const removed = await this.deleteRowsWhere(
      SHEETS.ANNOUNCEMENTS,
      ANNOUNCEMENT_COLS,
      'AnnouncementID',
      announcementId
    );
    if (removed === 0) return false;
    await this.deleteRowsWhere(
      SHEETS.ANNOUNCEMENT_HISTORY,
      ANNOUNCEMENT_HISTORY_COLS,
      'AnnouncementID',
      announcementId
    );
    await this.deleteRowsWhere(
      SHEETS.ANNOUNCEMENT_COMMENTS,
      ANNOUNCEMENT_COMMENT_COLS,
      'AnnouncementID',
      announcementId
    );
    return true;
  }

  async getAnnouncementHistory(announcementId: string): Promise<AnnouncementHistoryRecord[]> {
    const rows = await this.getObjects<Omit<AnnouncementHistoryRecord, 'ImageLinks'> & { ImageLinks: string }>(
      SHEETS.ANNOUNCEMENT_HISTORY,
      ANNOUNCEMENT_HISTORY_COLS
    );
    return rows
      .filter((h) => h.AnnouncementID === announcementId)
      .map(({ _row, ...h }) => ({ ...h, ImageLinks: parseJsonArray<string>(h.ImageLinks) }))
      .sort((a, b) => new Date(b.EditedAt).getTime() - new Date(a.EditedAt).getTime());
  }

  async listAnnouncementComments(announcementId: string): Promise<AnnouncementComment[]> {
    const rows = await this.getObjects<AnnouncementComment>(
      SHEETS.ANNOUNCEMENT_COMMENTS,
      ANNOUNCEMENT_COMMENT_COLS
    );
    return rows
      .filter((c) => c.AnnouncementID === announcementId)
      .map(({ _row, ...c }) => c)
      .sort((a, b) => new Date(a.CreatedAt).getTime() - new Date(b.CreatedAt).getTime());
  }

  async addAnnouncementComment(comment: AnnouncementComment): Promise<void> {
    await this.appendRow(
      SHEETS.ANNOUNCEMENT_COMMENTS,
      ANNOUNCEMENT_COMMENT_COLS,
      comment as unknown as Record<string, unknown>
    );
  }

  async deleteAnnouncementComment(
    commentId: string,
    requesterId: string,
    isAdmin: boolean
  ): Promise<'ok' | 'not_found' | 'forbidden'> {
    const rows = await this.getObjects<AnnouncementComment>(
      SHEETS.ANNOUNCEMENT_COMMENTS,
      ANNOUNCEMENT_COMMENT_COLS
    );
    const target = rows.find((c) => c.CommentID === commentId);
    if (!target) return 'not_found';
    if (!isAdmin && target.UserID !== requesterId) return 'forbidden';
    await this.deleteRowsWhere(SHEETS.ANNOUNCEMENT_COMMENTS, ANNOUNCEMENT_COMMENT_COLS, 'CommentID', commentId);
    return 'ok';
  }

  // ---- Help Desk & Direct Messages ----
  async listHelpDeskTickets(): Promise<HelpDeskTicket[]> {
    const rows = await this.getObjects<HelpDeskTicket>(SHEETS.HELPDESK_TICKETS, HELPDESK_TICKET_COLS);
    return rows
      .map(({ _row, ...t }) => t)
      .sort((a, b) => new Date(b.UpdatedAt || b.CreatedAt).getTime() - new Date(a.UpdatedAt || a.CreatedAt).getTime());
  }

  async getHelpDeskTicket(ticketId: string): Promise<HelpDeskTicket | null> {
    const rows = await this.getObjects<HelpDeskTicket>(SHEETS.HELPDESK_TICKETS, HELPDESK_TICKET_COLS);
    const match = rows.find((t) => t.TicketID === ticketId);
    if (!match) return null;
    const { _row, ...ticket } = match;
    return ticket;
  }

  async createHelpDeskTicket(ticket: HelpDeskTicket, initialMessage: HelpDeskMessage): Promise<void> {
    await this.appendRow(SHEETS.HELPDESK_TICKETS, HELPDESK_TICKET_COLS, ticket as unknown as Record<string, unknown>);
    await this.appendRow(SHEETS.HELPDESK_MESSAGES, HELPDESK_MESSAGE_COLS, initialMessage as unknown as Record<string, unknown>);
  }

  async updateHelpDeskTicket(ticketId: string, updates: Partial<HelpDeskTicket>): Promise<boolean> {
    return this.updateRowByField(
      SHEETS.HELPDESK_TICKETS,
      HELPDESK_TICKET_COLS,
      'TicketID',
      ticketId,
      updates as Record<string, unknown>
    );
  }

  async listHelpDeskMessages(ticketId: string): Promise<HelpDeskMessage[]> {
    const rows = await this.getObjects<HelpDeskMessage>(SHEETS.HELPDESK_MESSAGES, HELPDESK_MESSAGE_COLS);
    return rows
      .filter((m) => m.TicketID === ticketId)
      .map(({ _row, ...m }) => m)
      .sort((a, b) => new Date(a.CreatedAt).getTime() - new Date(b.CreatedAt).getTime());
  }

  async addHelpDeskMessage(message: HelpDeskMessage): Promise<void> {
    await this.appendRow(SHEETS.HELPDESK_MESSAGES, HELPDESK_MESSAGE_COLS, message as unknown as Record<string, unknown>);
  }

  async listDirectMessagesForUser(userId: string): Promise<DirectMessage[]> {
    const rows = await this.getObjects<DirectMessage>(SHEETS.DIRECT_MESSAGES, DIRECT_MESSAGE_COLS);
    return rows
      .filter((m) => m.FromUserID === userId || m.ToUserID === userId)
      .map(({ _row, ...m }) => ({
        ...m,
        Read: m.Read === true || String(m.Read).toUpperCase() === 'TRUE' || String(m.Read) === '1',
      }))
      .sort((a, b) => new Date(a.CreatedAt).getTime() - new Date(b.CreatedAt).getTime());
  }

  async createDirectMessage(message: DirectMessage): Promise<void> {
    await this.appendRow(SHEETS.DIRECT_MESSAGES, DIRECT_MESSAGE_COLS, {
      ...message,
      Read: message.Read ? 'TRUE' : 'FALSE',
    });
  }

  async markDirectMessagesRead(fromUserId: string, toUserId: string): Promise<void> {
    const rows = await this.getObjects<DirectMessage>(SHEETS.DIRECT_MESSAGES, DIRECT_MESSAGE_COLS);
    const unread = rows.filter(
      (m) =>
        m.FromUserID === fromUserId &&
        m.ToUserID === toUserId &&
        !(m.Read === true || String(m.Read).toUpperCase() === 'TRUE' || String(m.Read) === '1')
    );
    for (const m of unread) {
      await this.updateRowByField(SHEETS.DIRECT_MESSAGES, DIRECT_MESSAGE_COLS, 'MessageID', m.MessageID, {
        Read: 'TRUE',
      });
    }
  }

  // ---- Audit Schedules ----
  async listAuditSchedules(): Promise<AuditSchedule[]> {
    const rows = await this.getObjects<AuditSchedule>(SHEETS.AUDIT_SCHEDULES, AUDIT_SCHEDULE_COLS);
    return rows
      .map(({ _row, ...s }) => s)
      .sort((a, b) => (a.AuditDate || '').localeCompare(b.AuditDate || '') || (a.TimeWindow || '').localeCompare(b.TimeWindow || ''));
  }

  async getAuditSchedule(scheduleId: string): Promise<AuditSchedule | null> {
    const rows = await this.getObjects<AuditSchedule>(SHEETS.AUDIT_SCHEDULES, AUDIT_SCHEDULE_COLS);
    const match = rows.find((s) => s.ScheduleID === scheduleId);
    if (!match) return null;
    const { _row, ...sched } = match;
    return sched;
  }

  async createAuditSchedule(item: AuditSchedule): Promise<void> {
    await this.appendRow(SHEETS.AUDIT_SCHEDULES, AUDIT_SCHEDULE_COLS, item as unknown as Record<string, unknown>);
  }

  async updateAuditSchedule(scheduleId: string, updates: Partial<AuditSchedule>): Promise<boolean> {
    return this.updateRowByField(
      SHEETS.AUDIT_SCHEDULES,
      AUDIT_SCHEDULE_COLS,
      'ScheduleID',
      scheduleId,
      updates as Record<string, unknown>
    );
  }

  async deleteAuditSchedule(scheduleId: string): Promise<boolean> {
    return (await this.deleteRowsWhere(SHEETS.AUDIT_SCHEDULES, AUDIT_SCHEDULE_COLS, 'ScheduleID', scheduleId)) > 0;
  }

  // ---- Audit Log ----
  async appendLog(entry: AuditLogEntry): Promise<void> {
    await this.appendRow(SHEETS.LOG, LOG_COLS, entry as unknown as Record<string, unknown>);
  }

  async listLogs(limit = 100): Promise<AuditLogEntry[]> {
    const rows = await this.getObjects<AuditLogEntry>(SHEETS.LOG, LOG_COLS);
    return rows
      .map(({ _row, ...l }) => l)
      .reverse()
      .slice(0, limit);
  }
}

function colToLetter(colNum: number): string {
  let temp = colNum;
  let letter = '';
  while (temp > 0) {
    const rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter || 'A';
}
