import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import {
  AUDITOR_ONLY_FIELDS,
  PROCESS_OWNER_REQUIRED_ENTRY_FIELDS,
  PROCESS_OWNER_REQUIRED_FIELDS,
  REQUIRED_FIELDS,
} from './constants.js';
import {
  getEmailSummary,
  isEmailConfigured,
  sendAnnouncementEmail,
  sendConversationDigestEmail,
  sendNotificationEmail,
  type DigestMessageItem,
} from './mailer.js';
import { generateCarPdfBuffer } from './pdfExport.js';
import { emitToUsers } from './realtime.js';
import {
  hashPassword,
  isAuditorOrAdmin,
  isSystemAdmin,
  isValidEvidenceUrl,
  isValidHttpsOrUploadUrl,
  newId,
  normalizeUserRole,
  nowIso,
  parseJsonArray,
  parseWhyFactors,
  sanitizeCarPayload,
  signSessionToken,
  userHasDepartment,
  verifyPassword,
  verifySessionToken,
} from './security.js';
import {
  getSheetsInstance,
  getStorageStatus,
  getStore,
  syncDataBetweenStores,
  testGoogleSheetConnection,
} from './storeManager.js';
import type {
  AuditSchedule,
  AuditScheduleStatus,
  AuditScheduleType,
  CarRecord,
  DirectMessage,
  HelpDeskMessage,
  HelpDeskTicket,
  HelpDeskTicketPriority,
  HelpDeskTicketStatus,
  NotificationRecord,
  SessionUser,
} from './types.js';

interface AuthedRequest extends Request {
  user?: SessionUser;
}

function getUploadDir(): string {
  const dir = path.resolve(process.env.UPLOAD_DIR || './data/uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : String(req.query.token || '').trim();
  if (!token) {
    res.status(401).json({ ok: false, error: 'SESSION_EXPIRED' });
    return;
  }
  const decoded = verifySessionToken(token);
  if (!decoded) {
    res.status(401).json({ ok: false, error: 'SESSION_EXPIRED' });
    return;
  }
  req.user = decoded;
  next();
}

function requireSystemAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!isSystemAdmin(req.user?.role)) {
      res.status(403).json({ ok: false, error: 'NOT_AUTHORIZED' });
      return;
    }
    next();
  });
}

function requireAuditor(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!isAuditorOrAdmin(req.user?.role)) {
      res.status(403).json({ ok: false, error: 'NOT_AUTHORIZED' });
      return;
    }
    next();
  });
}

function validateCarPayload(payload: Record<string, unknown>, requireProcessOwnerFields: boolean): string[] {
  const missing = REQUIRED_FIELDS.filter((f) => !payload[f] || String(payload[f]).trim() === '');
  const isOFI = payload.Type === 'Opportunity for Improvement (OFI)';
  if (!isOFI && (!payload.Details || String(payload.Details).trim() === '')) {
    missing.push('Details');
  }
  if (requireProcessOwnerFields) {
    for (const f of PROCESS_OWNER_REQUIRED_FIELDS) {
      if (!payload[f] || String(payload[f]).trim() === '') missing.push(f);
    }
    for (const f of PROCESS_OWNER_REQUIRED_ENTRY_FIELDS) {
      if (parseJsonArray(payload[f]).length === 0) missing.push(f);
    }
    const hasGeneralEvidence =
      parseJsonArray(payload.EvidenceLinks).length > 0 ||
      (payload.EvidenceLink && String(payload.EvidenceLink).trim() !== '');
    if (!hasGeneralEvidence && (!payload.FormEvidenceLink || String(payload.FormEvidenceLink).trim() === '')) {
      missing.push('Evidence (attach general or form evidence)');
    }
  }
  return missing;
}

async function resolveAssignee(employeeId: unknown): Promise<{
  ok: boolean;
  EmployeeID?: string;
  EmployeeName?: string;
  error?: string;
}> {
  const id = String(employeeId || '').trim();
  if (!id) return { ok: true, EmployeeID: '', EmployeeName: '(Unassigned)' };
  const user = await getStore().findUserById(id);
  if (!user || user.Role !== 'Employee' || user.Status !== 'Active') {
    return { ok: false, error: 'Selected recipient is not a valid active Process Owner.' };
  }
  return { ok: true, EmployeeID: user.UserID, EmployeeName: user.Name };
}

function userCanAccessCar(userId: string, userDept: string, rec: CarRecord): boolean {
  if (userHasDepartment(userDept, rec.Department)) return true;
  if (
    rec.EmployeeName &&
    rec.EmployeeName !== '(Unassigned)' &&
    userHasDepartment(userDept, rec.EmployeeName)
  ) {
    return true;
  }
  if (rec.EmployeeID && rec.EmployeeID === userId) return true;
  return false;
}

async function dispatchNotificationEmail(notif: NotificationRecord): Promise<void> {
  if (!isEmailConfigured()) return;
  if (String(notif.RelatedCARNo || '').trim().startsWith('DM:')) return;
  try {
    const store = getStore();
    const recipient = await store.findUserById(notif.ToUserID);
    if (!recipient || recipient.Status !== 'Active' || !recipient.Email) return;

    const settings = await store.getSettings();
    if (settings[`NotifyEmail_${recipient.UserID}`] === 'false') return;
    if (
      notif.Message.toLowerCase().includes('needs attention') &&
      settings[`NotifyOnFlag_${recipient.UserID}`] === 'false'
    ) {
      return;
    }

    const [sender, company] = await Promise.all([
      notif.FromUserID ? store.findUserById(notif.FromUserID).catch(() => null) : Promise.resolve(null),
      store.getCompanyDetails().catch(() => ({}) as Record<string, string>),
    ]);

    const res = await sendNotificationEmail({
      toEmail: recipient.Email,
      toName: recipient.Name,
      fromName: sender?.Name || '',
      companyName: company.CompanyName || '',
      notif,
    });
    if (!res.ok && !res.skipped) {
      console.error(`[Mailer] Failed to send email to ${recipient.Email}:`, res.error);
    }
  } catch (err) {
    console.error('[Mailer] Auto-email error:', err instanceof Error ? err.message : err);
  }
}

async function dispatchAnnouncementEmails(announcement: {
  AnnouncementID: string;
  Title: string;
  Message: string;
  ImageLinks: string[];
  PostedByName: string;
}): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const store = getStore();
    const [users, settings, company] = await Promise.all([
      store.listUsers(),
      store.getSettings(),
      store.getCompanyDetails().catch(() => ({}) as Record<string, string>),
    ]);

    const seenEmails = new Set<string>();
    const targets = users.filter((u) => {
      if (u.Status !== 'Active') return false;
      const email = String(u.Email || '').trim();
      if (!email || !email.includes('@')) return false;
      if (settings[`NotifyEmail_${u.UserID}`] === 'false') return false;
      const key = email.toLowerCase();
      if (seenEmails.has(key)) return false;
      seenEmails.add(key);
      return true;
    });

    for (const recipient of targets) {
      const res = await sendAnnouncementEmail({
        toEmail: recipient.Email,
        toName: recipient.Name,
        postedByName: announcement.PostedByName,
        companyName: company.CompanyName || '',
        title: announcement.Title,
        message: announcement.Message,
        imageCount: announcement.ImageLinks.length,
      });
      if (!res.ok && !res.skipped) {
        console.error(`[Mailer] Failed to email announcement to ${recipient.Email}:`, res.error);
      }
    }
  } catch (err) {
    console.error('[Mailer] Announcement email dispatch error:', err instanceof Error ? err.message : err);
  }
}

interface PendingMessageBatch {
  recipientId: string;
  conversationKey: string;
  conversationTitle: string;
  category: string;
  reference?: string;
  actionPath: string;
  isDmFromUserId?: string;
  firstQueuedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  messages: DigestMessageItem[];
}

const pendingMessageEmailBatches = new Map<string, PendingMessageBatch>();

function getBatchQuietMs(): number {
  const sec = Number(process.env.EMAIL_MESSAGE_BATCH_SECONDS || 3600);
  const clamped = Number.isFinite(sec) && sec >= 5 ? Math.min(sec, 86400) : 3600;
  return clamped * 1000;
}

const BATCH_MAX_WAIT_MS = 60 * 60 * 1000;

function clearPendingConversationEmail(recipientId: string, conversationKey: string): void {
  const mapKey = `${recipientId}|${conversationKey}`;
  const batch = pendingMessageEmailBatches.get(mapKey);
  if (!batch) return;
  if (batch.timer) clearTimeout(batch.timer);
  pendingMessageEmailBatches.delete(mapKey);
}

async function flushConversationEmailBatch(mapKey: string): Promise<void> {
  const batch = pendingMessageEmailBatches.get(mapKey);
  if (!batch) return;
  if (batch.timer) clearTimeout(batch.timer);
  pendingMessageEmailBatches.delete(mapKey);

  if (!isEmailConfigured() || batch.messages.length === 0) return;

  try {
    const store = getStore();
    const recipient = await store.findUserById(batch.recipientId);
    if (!recipient || recipient.Status !== 'Active' || !recipient.Email) return;

    const settings = await store.getSettings();
    if (settings[`NotifyEmail_${recipient.UserID}`] === 'false') return;

    let messagesToSend = batch.messages;

    // For Direct Messages, skip any message already read live in the conversation
    if (batch.isDmFromUserId) {
      const dmList = await store.listDirectMessagesForUser(recipient.UserID);
      const unreadIds = new Set(
        dmList
          .filter((m) => m.FromUserID === batch.isDmFromUserId && m.ToUserID === recipient.UserID && !m.Read)
          .map((m) => m.MessageID)
      );
      messagesToSend = messagesToSend.filter((m) => !m.messageId || unreadIds.has(m.messageId));
      if (messagesToSend.length === 0) return;
    }

    const company = await store.getCompanyDetails().catch(() => ({}) as Record<string, string>);
    const res = await sendConversationDigestEmail({
      toEmail: recipient.Email,
      toName: recipient.Name,
      companyName: company.CompanyName || '',
      conversationTitle: batch.conversationTitle,
      category: batch.category,
      reference: batch.reference,
      actionPath: batch.actionPath,
      messages: messagesToSend,
    });
    if (!res.ok && !res.skipped) {
      console.error(`[Mailer] Failed to send conversation digest to ${recipient.Email}:`, res.error);
    }
  } catch (err) {
    console.error('[Mailer] Conversation digest error:', err instanceof Error ? err.message : err);
  }
}

function queueConversationEmail(params: {
  recipientId: string;
  conversationKey: string;
  conversationTitle: string;
  category: string;
  reference?: string;
  actionPath: string;
  isDmFromUserId?: string;
  item: DigestMessageItem;
}): void {
  if (!isEmailConfigured()) return;
  if (params.conversationKey.startsWith('DM:') || params.isDmFromUserId) return;
  const mapKey = `${params.recipientId}|${params.conversationKey}`;
  const now = Date.now();
  const quietMs = getBatchQuietMs();

  let batch = pendingMessageEmailBatches.get(mapKey);
  if (!batch) {
    batch = {
      recipientId: params.recipientId,
      conversationKey: params.conversationKey,
      conversationTitle: params.conversationTitle,
      category: params.category,
      reference: params.reference,
      actionPath: params.actionPath,
      isDmFromUserId: params.isDmFromUserId,
      firstQueuedAt: now,
      timer: null,
      messages: [],
    };
    pendingMessageEmailBatches.set(mapKey, batch);
  }

  batch.messages.push(params.item);
  if (batch.timer) clearTimeout(batch.timer);

  const elapsed = now - batch.firstQueuedAt;
  const remainingMax = Math.max(0, BATCH_MAX_WAIT_MS - elapsed);
  const delay = Math.min(quietMs, remainingMax);

  batch.timer = setTimeout(() => {
    void flushConversationEmailBatch(mapKey);
  }, delay);
}

async function createAndPushNotification(
  notif: NotificationRecord,
  options?: { skipImmediateEmail?: boolean }
) {
  await getStore().createNotification(notif);
  emitToUsers([notif.ToUserID], { type: 'notification:new', payload: notif });
  if (!options?.skipImmediateEmail) {
    void dispatchNotificationEmail(notif);
  }
}

async function notifyDepartment(
  fromUserId: string,
  departmentOrList: string | string[],
  message: string,
  carNo: string
) {
  const depts = (Array.isArray(departmentOrList) ? departmentOrList : [departmentOrList])
    .map((d) => String(d || '').trim())
    .filter((d) => Boolean(d) && d !== '(Unassigned)');
  if (depts.length === 0) return;
  const store = getStore();
  const users = await store.listUsers();
  const targets = users.filter(
    (u) =>
      u.Role === 'Employee' &&
      u.Status === 'Active' &&
      depts.some((dept) => userHasDepartment(u.Department, dept))
  );
  for (const u of targets) {
    await createAndPushNotification({
      NotificationID: newId('N'),
      ToUserID: u.UserID,
      FromUserID: fromUserId,
      Message: message,
      RelatedCARNo: carNo,
      Read: false,
      CreatedAt: nowIso(),
    });
  }
}

async function notifyCarTarget(
  fromUserId: string,
  rec: Pick<CarRecord, 'EmployeeID' | 'Department' | 'EmployeeName'>,
  message: string,
  carNo: string
) {
  if (rec.EmployeeID && rec.EmployeeID !== fromUserId) {
    await createAndPushNotification({
      NotificationID: newId('N'),
      ToUserID: rec.EmployeeID,
      FromUserID: fromUserId,
      Message: message,
      RelatedCARNo: carNo,
      Read: false,
      CreatedAt: nowIso(),
    });
  } else if (!rec.EmployeeID) {
    await notifyDepartment(fromUserId, [rec.Department, rec.EmployeeName], message, carNo);
  }
}

async function notifyAuditors(fromUserId: string, message: string, relatedRef: string) {
  const store = getStore();
  const users = await store.listUsers();
  const auditors = users.filter(
    (u) =>
      u.Status === 'Active' &&
      u.UserID !== fromUserId &&
      isAuditorOrAdmin(normalizeUserRole(u.Role))
  );
  for (const u of auditors) {
    await createAndPushNotification({
      NotificationID: newId('N'),
      ToUserID: u.UserID,
      FromUserID: fromUserId,
      Message: message,
      RelatedCARNo: relatedRef,
      Read: false,
      CreatedAt: nowIso(),
    });
  }
}

async function notifyAuditSchedule(fromUserId: string, schedule: AuditSchedule, actionLabel: string) {
  const store = getStore();
  const users = await store.listUsers();
  const targetDept = String(schedule.Department || '').trim();
  const isAllServices = !targetDept || targetDept === 'All Services';

  const targets = users.filter((u) => {
    if (u.Status !== 'Active' || u.UserID === fromUserId) return false;
    if (isAllServices) return true;
    const isStaff = isAuditorOrAdmin(normalizeUserRole(u.Role));
    return isStaff || userHasDepartment(u.Department, targetDept);
  });

  const timeInfo = schedule.TimeWindow ? ` (${schedule.TimeWindow})` : '';
  const leadInfo = schedule.LeadAuditor ? ` · Lead Auditor: ${schedule.LeadAuditor}` : '';
  const statusInfo = schedule.Status && schedule.Status !== 'Scheduled' ? ` · Status: ${schedule.Status}` : '';
  const message = `Audit Schedule ${actionLabel}: "${schedule.Title}" (${schedule.AuditType}) on ${schedule.AuditDate}${timeInfo} for ${schedule.Department}${leadInfo}${statusInfo}.`;

  for (const u of targets) {
    await createAndPushNotification({
      NotificationID: newId('N'),
      ToUserID: u.UserID,
      FromUserID: fromUserId,
      Message: message,
      RelatedCARNo: `AUDIT:${schedule.ScheduleID}`,
      Read: false,
      CreatedAt: nowIso(),
    });
  }
}

async function saveUploadedFile(
  category: 'evidence' | 'announcements' | 'templates',
  prefix: string,
  file: Express.Multer.File
): Promise<{ url: string; name: string }> {
  const safeName = file.originalname.replace(/[^A-Za-z0-9._-]/g, '_');
  const finalName = `${prefix}_${Date.now()}_${safeName}`;

  // If connected to Google Sheets + Drive folder ID is configured, try Google Drive first
  const sheets = getSheetsInstance();
  const driveFolderId =
    (category === 'announcements'
      ? process.env.GOOGLE_DRIVE_ANNOUNCEMENT_FOLDER_ID
      : process.env.GOOGLE_DRIVE_EVIDENCE_FOLDER_ID) ||
    process.env.GOOGLE_DRIVE_MAIN_FOLDER_ID ||
    process.env.GOOGLE_DRIVE_EVIDENCE_FOLDER_ID;
  if (sheets && driveFolderId) {
    const driveRes = await sheets.uploadFileToDrive(driveFolderId, finalName, file.mimetype, file.buffer);
    if (driveRes) {
      return {
        url: category === 'announcements' ? driveRes.thumbnailUrl : driveRes.url,
        name: finalName,
      };
    }
  }

  const targetDir = path.join(getUploadDir(), category);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, finalName), file.buffer);
  return {
    url: `/uploads/${category}/${finalName}`,
    name: file.originalname,
  };
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  // Health check for Render
  router.get('/health', (_req, res) => {
    const status = getStorageStatus();
    res.json({ ok: true, mode: status.mode, timestamp: nowIso() });
  });

  // ---- AUTH ----
  router.post('/auth/login', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const store = getStore();
      const user = await store.findUserByEmail(email);
      if (!user) {
        res.json({ ok: false, error: 'No account found with that email.' });
        return;
      }
      if (user.Status === 'Locked') {
        res.json({ ok: false, error: 'This account has been locked. Contact your administrator.' });
        return;
      }
      const pwCheck = verifyPassword(password, user.PasswordHash);
      if (!pwCheck.valid) {
        res.json({ ok: false, error: 'Incorrect password.' });
        return;
      }

      // If in SQLite mode and user had a legacy SHA-256 hash, seamlessly upgrade to scrypt
      if (pwCheck.isLegacy && store.mode === 'sqlite') {
        await store.updateUser(user.UserID, { PasswordHash: hashPassword(password) });
      }

      const sessionUser: SessionUser = {
        userId: user.UserID,
        name: user.Name,
        email: user.Email,
        role: normalizeUserRole(user.Role),
        department: user.Department,
        position: user.Position,
      };
      const token = signSessionToken(sessionUser);
      await store.appendLog({ Timestamp: nowIso(), UserID: user.UserID, Action: 'LOGIN', Details: '' });
      res.json({ ok: true, token, user: sessionUser });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Login failed.' });
    }
  });

  router.post('/auth/logout', async (req, res) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      const decoded = token ? verifySessionToken(token) : null;
      if (decoded?.userId) {
        await getStore().appendLog({
          Timestamp: nowIso(),
          UserID: decoded.userId,
          Action: 'LOGOUT',
          Details: '',
        });
      }
    } catch {
      // ignore logout log failure
    }
    res.json({ ok: true });
  });

  router.post('/auth/dpo-confirm', requireAuth, async (req: AuthedRequest, res) => {
    try {
      await getStore().appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'DPO_CONFIRMED',
        Details: 'Privacy, Security, and Accountability Notice acknowledged',
      });
      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
    }
  });

  router.get('/auth/me', requireAuth, async (req: AuthedRequest, res) => {
    try {
      // Refresh user info from store so department/role updates take effect immediately
      const fresh = await getStore().findUserById(req.user!.userId);
      if (!fresh || fresh.Status === 'Locked') {
        res.status(401).json({ ok: false, error: 'SESSION_EXPIRED' });
        return;
      }
      res.json({
        ok: true,
        user: {
          userId: fresh.UserID,
          name: fresh.Name,
          email: fresh.Email,
          role: normalizeUserRole(fresh.Role),
          department: fresh.Department,
          position: fresh.Position,
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load profile.' });
    }
  });

  router.post('/auth/change-password', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const oldPassword = String(req.body?.oldPassword || '');
      const newPassword = String(req.body?.newPassword || '');
      const store = getStore();
      const record = await store.findUserById(req.user!.userId);
      if (!record || !verifyPassword(oldPassword, record.PasswordHash).valid) {
        res.json({ ok: false, error: 'Current password is incorrect.' });
        return;
      }
      if (!newPassword || newPassword.length < 8) {
        res.json({ ok: false, error: 'New password must be at least 8 characters.' });
        return;
      }
      await store.updateUser(record.UserID, { PasswordHash: hashPassword(newPassword) });
      await store.appendLog({ Timestamp: nowIso(), UserID: record.UserID, Action: 'CHANGE_PASSWORD', Details: '' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to update password.' });
    }
  });

  // ---- USERS ----
  router.get('/users', requireAuditor, async (_req, res) => {
    try {
      const users = await getStore().listUsers();
      res.json(
        users.map((u) => ({
          userId: u.UserID,
          name: u.Name,
          email: u.Email,
          role: normalizeUserRole(u.Role),
          department: u.Department,
          position: u.Position,
          status: u.Status,
        }))
      );
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load users.' });
    }
  });

  router.post('/users', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const data = req.body || {};
      const name = String(data.name || '').trim();
      const email = String(data.email || '').trim();
      const password = String(data.password || '');
      const departments = Array.isArray(data.departments)
        ? data.departments.map((d: unknown) => String(d).trim()).filter(Boolean)
        : [];
      if (!name || !email || !password || departments.length === 0) {
        res.json({ ok: false, error: 'Name, email, password and at least one department are required.' });
        return;
      }
      if (password.length < 8) {
        res.json({ ok: false, error: 'Password must be at least 8 characters.' });
        return;
      }
      const role = normalizeUserRole(data.role);
      if (role === 'Admin' && !isSystemAdmin(req.user!.role)) {
        res.status(403).json({ ok: false, error: 'Only a System Administrator can create System Administrator accounts.' });
        return;
      }
      const store = getStore();
      const existing = await store.findUserByEmail(email);
      if (existing) {
        res.json({ ok: false, error: 'A user with that email already exists.' });
        return;
      }
      const userId = newId('U');
      const departmentStr = departments.join(', ');
      const position = String(data.position || '').trim();
      await store.createUser({
        UserID: userId,
        Name: name,
        Email: email,
        PasswordHash: hashPassword(password),
        Role: role,
        Department: departmentStr,
        Position: position,
        Status: 'Active',
        CreatedAt: nowIso(),
      });
      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'CREATE_USER', Details: `${email} (${role})` });
      res.json({
        ok: true,
        user: { userId, name, email, role, department: departmentStr, position, status: 'Active' },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to create user.' });
    }
  });

  router.put('/users/:userId', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const { userId } = req.params;
      const data = req.body || {};
      const store = getStore();
      const all = await store.listUsers();
      const existing = all.find((u) => u.UserID === userId);
      if (!existing) {
        res.json({ ok: false, error: 'User not found.' });
        return;
      }
      const existingRole = normalizeUserRole(existing.Role);
      const role = normalizeUserRole(data.role);
      if (!isSystemAdmin(req.user!.role) && (existingRole === 'Admin' || role === 'Admin')) {
        res.status(403).json({ ok: false, error: 'Only a System Administrator can modify System Administrator accounts.' });
        return;
      }
      const name = String(data.name || '').trim();
      const email = String(data.email || '').trim();
      const departments = Array.isArray(data.departments)
        ? data.departments.map((d: unknown) => String(d).trim()).filter(Boolean)
        : [];
      if (!name || !email || departments.length === 0) {
        res.json({ ok: false, error: 'Name, email and at least one department are required.' });
        return;
      }
      if (all.some((u) => u.UserID !== userId && u.Email.toLowerCase() === email.toLowerCase())) {
        res.json({ ok: false, error: 'Another user already has that email.' });
        return;
      }
      if (userId === req.user!.userId && existingRole !== role) {
        res.json({ ok: false, error: 'You cannot change your own role.' });
        return;
      }
      const updates: Record<string, string> = {
        Name: name,
        Email: email,
        Role: role,
        Department: departments.join(', '),
        Position: String(data.position || '').trim(),
      };
      if (data.password && String(data.password).trim() !== '') {
        if (String(data.password).length < 8) {
          res.json({ ok: false, error: 'New password must be at least 8 characters.' });
          return;
        }
        updates.PasswordHash = hashPassword(String(data.password));
      }
      await store.updateUser(userId, updates);
      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'UPDATE_USER', Details: userId });
      res.json({
        ok: true,
        user: {
          userId,
          name,
          email,
          role,
          department: updates.Department,
          position: updates.Position,
          status: existing.Status,
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to update user.' });
    }
  });

  router.post('/users/:userId/lock', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const { userId } = req.params;
      const lock = Boolean(req.body?.lock);
      if (lock && userId === req.user!.userId) {
        res.json({ ok: false, error: 'You cannot lock your own account.' });
        return;
      }
      const store = getStore();
      const target = await store.findUserById(userId);
      if (target && normalizeUserRole(target.Role) === 'Admin' && !isSystemAdmin(req.user!.role)) {
        res.status(403).json({ ok: false, error: 'Only a System Administrator can lock or unlock System Administrator accounts.' });
        return;
      }
      const ok = await store.updateUser(userId, { Status: lock ? 'Locked' : 'Active' });
      await store.appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: lock ? 'LOCK_USER' : 'UNLOCK_USER',
        Details: userId,
      });
      res.json({ ok });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to update lock status.' });
    }
  });

  router.get('/process-owners', requireAuditor, async (_req, res) => {
    try {
      const users = await getStore().listUsers();
      res.json(
        users
          .filter((u) => normalizeUserRole(u.Role) === 'Employee' && u.Status === 'Active')
          .map((u) => ({ userId: u.UserID, name: u.Name, department: u.Department }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load process owners.' });
    }
  });

  // ---- DEPARTMENTS (System Administrator only for mutations on Company Details) ----
  router.get('/departments', requireAuth, async (_req, res) => {
    try {
      const depts = await getStore().listDepartments();
      res.json(depts);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load departments.' });
    }
  });

  router.post('/departments', requireSystemAdmin, async (req: AuthedRequest, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      if (!name) {
        res.json({ ok: false, error: 'Department name is required.' });
        return;
      }
      const store = getStore();
      await store.addDepartment(name);
      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'ADD_DEPARTMENT', Details: name });
      res.json({ ok: true, departments: await store.listDepartments() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to add department.' });
    }
  });

  router.delete('/departments/:name', requireSystemAdmin, async (req: AuthedRequest, res) => {
    try {
      const name = decodeURIComponent(req.params.name || '').trim();
      const store = getStore();
      const ok = await store.removeDepartment(name);
      if (ok) {
        await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'REMOVE_DEPARTMENT', Details: name });
      }
      res.json({ ok, departments: await store.listDepartments() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to remove department.' });
    }
  });

  // ---- CAR RECORDS ----
  router.get('/cars', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const all = await store.listCARs();
      if (isAuditorOrAdmin(req.user!.role)) {
        res.json(all);
        return;
      }
      const freshUser = await store.findUserById(req.user!.userId);
      const userDept = freshUser ? freshUser.Department : req.user!.department;
      res.json(all.filter((r) => userCanAccessCar(req.user!.userId, userDept, r)));
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load records.' });
    }
  });

  router.get('/cars/:carNo', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const rec = await store.getCAR(req.params.carNo);
      if (!rec) {
        res.json(null);
        return;
      }
      if (!isAuditorOrAdmin(req.user!.role)) {
        const freshUser = await store.findUserById(req.user!.userId);
        const userDept = freshUser ? freshUser.Department : req.user!.department;
        if (!userCanAccessCar(req.user!.userId, userDept, rec)) {
          res.status(403).json({ ok: false, error: 'NOT_AUTHORIZED' });
          return;
        }
      }
      res.json(rec);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load record.' });
    }
  });

  router.post('/cars', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const payload: Record<string, unknown> = { ...(req.body || {}) };
      sanitizeCarPayload(payload);
      const missing = validateCarPayload(payload, false);
      if (missing.length > 0) {
        res.json({ ok: false, error: 'Cannot save: missing required field(s): ' + missing.join(', ') });
        return;
      }
      const store = getStore();
      const customCarNo = String(payload.CARNo || '').trim();
      delete payload.CARNo;
      let carNo: string;
      if (customCarNo) {
        if (!/^[A-Za-z0-9._-]{1,40}$/.test(customCarNo)) {
          res.json({
            ok: false,
            error: 'CAR No. can only contain letters, numbers, periods, hyphens, and underscores (max 40 characters).',
          });
          return;
        }
        const existing = await store.getCAR(customCarNo);
        if (existing) {
          res.json({ ok: false, error: `CAR No. "${customCarNo}" is already in use. Please choose a different number.` });
          return;
        }
        carNo = customCarNo;
      } else {
        carNo = newId('CAR');
      }

      const whyFactors = parseWhyFactors(payload.RootCauseFactors);
      delete payload.RootCauseFactors;

      const receivedService = String(payload.ReceivedService || '').trim();
      delete payload.ReceivedService;

      let assignee: { ok: boolean; EmployeeID?: string; EmployeeName?: string; error?: string };
      if (receivedService) {
        assignee = { ok: true, EmployeeID: '', EmployeeName: receivedService };
      } else {
        assignee = await resolveAssignee(payload.EmployeeID);
        if (!assignee.ok) {
          res.json({ ok: false, error: assignee.error });
          return;
        }
      }
      delete payload.EmployeeID;
      delete payload.EmployeeName;

      const now = nowIso();
      const record: CarRecord = {
        CARNo: carNo,
        Type: String(payload.Type || ''),
        Status: 'Open',
        EmployeeID: assignee.EmployeeID || '',
        EmployeeName: assignee.EmployeeName || '(Unassigned)',
        Department: String(payload.Department || ''),
        DateIssued: String(payload.DateIssued || ''),
        Source: String(payload.Source || ''),
        ISOClause: String(payload.ISOClause || ''),
        Details: String(payload.Details || ''),
        CompanyDocument: String(payload.CompanyDocument || ''),
        Correction: String(payload.Correction || ''),
        DateCompleted: String(payload.DateCompleted || ''),
        PersonInCharge: String(payload.PersonInCharge || ''),
        Result: String(payload.Result || ''),
        PossibleRootCause: String(payload.PossibleRootCause || ''),
        ValidationMethod: String(payload.ValidationMethod || ''),
        ValidationDate: String(payload.ValidationDate || ''),
        ValidationResult: String(payload.ValidationResult || ''),
        TrueRootCause: String(payload.TrueRootCause || ''),
        CorrectiveAction: String(payload.CorrectiveAction || ''),
        ActionOwnerTargetDate: String(payload.ActionOwnerTargetDate || ''),
        EvidenceLink: String(payload.EvidenceLink || ''),
        FormEvidenceLink: String(payload.FormEvidenceLink || ''),
        DateImplemented: String(payload.DateImplemented || ''),
        PreparedBy: String(payload.PreparedBy || ''),
        PreparedDate: String(payload.PreparedDate || ''),
        ApprovedBy: String(payload.ApprovedBy || ''),
        ApprovedDate: String(payload.ApprovedDate || ''),
        FollowUpDate: String(payload.FollowUpDate || ''),
        ResultOfVerification: String(payload.ResultOfVerification || ''),
        VerifiedBy: String(payload.VerifiedBy || ''),
        ConformedBy: String(payload.ConformedBy || ''),
        AdminFlag: '',
        AdminNote: '',
        CreatedAt: now,
        UpdatedAt: now,
        AdminDeadline: String(payload.AdminDeadline || ''),
        RaisedBy: req.user!.name,
        CorrectionEntries: String(payload.CorrectionEntries || ''),
        PossibleRootCauseEntries: String(payload.PossibleRootCauseEntries || ''),
        CorrectiveActionEntries: String(payload.CorrectiveActionEntries || ''),
        EvidenceLinks: String(payload.EvidenceLinks || '[]'),
        SignOffConformedBy: String(payload.SignOffConformedBy || ''),
        FollowUpEntries: String(payload.FollowUpEntries || ''),
        SignOffConformedDate: String(payload.SignOffConformedDate || ''),
      };

      await store.createCAR(record, whyFactors);

      const raiseMessage = `A new ${record.Type || 'finding'} (${carNo}) has been raised for your department: ${(record.Details || '').slice(0, 120)}`;
      if (record.EmployeeID) {
        await createAndPushNotification({
          NotificationID: newId('N'),
          ToUserID: record.EmployeeID,
          FromUserID: req.user!.userId,
          Message: raiseMessage,
          RelatedCARNo: carNo,
          Read: false,
          CreatedAt: nowIso(),
        });
      } else {
        await notifyDepartment(
          req.user!.userId,
          [record.Department, record.EmployeeName],
          raiseMessage,
          carNo
        );
      }

      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'SUBMIT_CAR', Details: carNo });
      res.json({ ok: true, carNo });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to create CAR.' });
    }
  });

  router.put('/cars/:carNo', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const { carNo } = req.params;
      const store = getStore();
      const rec = await store.getCAR(carNo);
      if (!rec) {
        res.json({ ok: false, error: 'Record not found.' });
        return;
      }
      const isAdmin = isAuditorOrAdmin(req.user!.role);
      if (!isAdmin) {
        const freshUser = await store.findUserById(req.user!.userId);
        const userDept = freshUser ? freshUser.Department : req.user!.department;
        if (!userCanAccessCar(req.user!.userId, userDept, rec)) {
          res.status(403).json({ ok: false, error: 'Not authorized to edit this record.' });
          return;
        }
        if (rec.Status === 'Closed' && rec.AdminFlag !== 'Needs Attention') {
          res.json({ ok: false, error: 'This record is closed and can no longer be edited.' });
          return;
        }
      }

      const payload: Record<string, unknown> = { ...(req.body || {}) };
      const hasWhyFactors = payload.RootCauseFactors !== undefined;
      const whyFactors = hasWhyFactors ? parseWhyFactors(payload.RootCauseFactors) : undefined;
      delete payload.RootCauseFactors;
      delete payload.CARNo;
      const receivedServiceInput =
        payload.ReceivedService !== undefined ? String(payload.ReceivedService || '').trim() : undefined;
      delete payload.ReceivedService;
      sanitizeCarPayload(payload);

      if (!isAdmin) {
        for (const f of AUDITOR_ONLY_FIELDS) delete payload[f];
      }

      delete payload.EmployeeName;
      let reassignedTo: { EmployeeID?: string; EmployeeName?: string } | null = null;
      let reassignedService: string | null = null;
      if (isAdmin && receivedServiceInput !== undefined) {
        payload.EmployeeID = '';
        payload.EmployeeName = receivedServiceInput || '(Unassigned)';
        if (receivedServiceInput && receivedServiceInput !== rec.EmployeeName) {
          reassignedService = receivedServiceInput;
        }
      } else if (isAdmin && payload.EmployeeID !== undefined) {
        const assignee = await resolveAssignee(payload.EmployeeID);
        if (!assignee.ok) {
          res.json({ ok: false, error: assignee.error });
          return;
        }
        payload.EmployeeID = assignee.EmployeeID;
        payload.EmployeeName = assignee.EmployeeName;
        if (assignee.EmployeeID && assignee.EmployeeID !== rec.EmployeeID) {
          reassignedTo = assignee;
        }
      } else {
        delete payload.EmployeeID;
      }

      const merged = { ...rec, ...payload };
      const missing = validateCarPayload(merged, !isAdmin);
      if (missing.length > 0) {
        res.json({ ok: false, error: 'Cannot save: missing required field(s): ' + missing.join(', ') });
        return;
      }

      const updates: Partial<CarRecord> = { ...(payload as Partial<CarRecord>), UpdatedAt: nowIso() };
      if (!isAdmin && rec.AdminFlag === 'Needs Attention') {
        updates.AdminFlag = '';
        updates.AdminNote = '';
      }
      if (!isAdmin && (!rec.EmployeeID || rec.EmployeeID === '') && (!rec.EmployeeName || rec.EmployeeName === '(Unassigned)')) {
        updates.EmployeeID = req.user!.userId;
        updates.EmployeeName = req.user!.name;
      }

      await store.updateCAR(carNo, updates, whyFactors);

      if (reassignedService) {
        await notifyDepartment(
          req.user!.userId,
          reassignedService,
          `CAR record ${carNo} has been assigned to your service (${reassignedService}).`,
          carNo
        );
      } else if (reassignedTo?.EmployeeID) {
        await createAndPushNotification({
          NotificationID: newId('N'),
          ToUserID: reassignedTo.EmployeeID,
          FromUserID: req.user!.userId,
          Message: `You have been assigned to record ${carNo}.`,
          RelatedCARNo: carNo,
          Read: false,
          CreatedAt: nowIso(),
        });
      } else if (isAdmin) {
        await notifyCarTarget(
          req.user!.userId,
          rec,
          `CAR record ${carNo} was updated by ${req.user!.name}.`,
          carNo
        );
      } else {
        await notifyAuditors(
          req.user!.userId,
          `${req.user!.name} (${rec.Department || 'Process Owner'}) submitted/updated CAR ${carNo}.`,
          carNo
        );
      }

      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'UPDATE_CAR', Details: carNo });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to update CAR.' });
    }
  });

  router.post('/cars/:carNo/flag', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const { carNo } = req.params;
      const note = String(req.body?.note || '').trim();
      if (!note) {
        res.json({ ok: false, error: 'Message is required.' });
        return;
      }
      const store = getStore();
      const rec = await store.getCAR(carNo);
      if (!rec) {
        res.json({ ok: false, error: 'Record not found.' });
        return;
      }
      await store.updateCAR(carNo, { AdminFlag: 'Needs Attention', AdminNote: note, UpdatedAt: nowIso() });
      const msg = `Your record ${carNo} needs attention: ${note}`;
      if (rec.EmployeeID) {
        await createAndPushNotification({
          NotificationID: newId('N'),
          ToUserID: rec.EmployeeID,
          FromUserID: req.user!.userId,
          Message: msg,
          RelatedCARNo: carNo,
          Read: false,
          CreatedAt: nowIso(),
        });
      } else {
        await notifyDepartment(req.user!.userId, [rec.Department, rec.EmployeeName], msg, carNo);
      }
      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'FLAG_CAR', Details: carNo });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to flag record.' });
    }
  });

  router.post('/cars/:carNo/close', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const { carNo } = req.params;
      const store = getStore();
      const rec = await store.getCAR(carNo);
      const ok = await store.updateCAR(carNo, { Status: 'Closed', UpdatedAt: nowIso() });
      if (ok) {
        if (rec) {
          await notifyCarTarget(
            req.user!.userId,
            rec,
            `CAR record ${carNo} has been closed by ${req.user!.name}.`,
            carNo
          );
        }
        await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'CLOSE_CAR', Details: carNo });
      }
      res.json({ ok });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to close record.' });
    }
  });

  router.post('/cars/:carNo/reopen', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const { carNo } = req.params;
      const store = getStore();
      const rec = await store.getCAR(carNo);
      const ok = await store.updateCAR(carNo, { Status: 'Open', UpdatedAt: nowIso() });
      if (!ok) {
        res.json({ ok: false, error: 'Record not found.' });
        return;
      }
      if (rec) {
        await notifyCarTarget(
          req.user!.userId,
          rec,
          `CAR record ${carNo} has been reopened by ${req.user!.name}.`,
          carNo
        );
      }
      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'REOPEN_CAR', Details: carNo });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to reopen record.' });
    }
  });

  router.post('/cars/:carNo/deadline', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const { carNo } = req.params;
      const deadline = String(req.body?.deadline || '').trim();
      const store = getStore();
      const rec = await store.getCAR(carNo);
      if (!rec) {
        res.json({ ok: false, error: 'Record not found.' });
        return;
      }
      await store.updateCAR(carNo, { AdminDeadline: deadline, UpdatedAt: nowIso() });
      if (deadline) {
        const msg = `A deadline of ${deadline} has been set for your record ${carNo}.`;
        if (rec.EmployeeID) {
          await createAndPushNotification({
            NotificationID: newId('N'),
            ToUserID: rec.EmployeeID,
            FromUserID: req.user!.userId,
            Message: msg,
            RelatedCARNo: carNo,
            Read: false,
            CreatedAt: nowIso(),
          });
        } else {
          await notifyDepartment(req.user!.userId, [rec.Department, rec.EmployeeName], msg, carNo);
        }
      }
      await store.appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'SET_DEADLINE',
        Details: `${carNo} -> ${deadline}`,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to set deadline.' });
    }
  });

  router.post('/cars/:carNo/followups', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const { carNo } = req.params;
      const store = getStore();
      const rec = await store.getCAR(carNo);
      if (!rec) {
        res.json({ ok: false, error: 'Record not found.' });
        return;
      }
      const entry = req.body || {};
      const FollowUpDate = String(entry.FollowUpDate || '').trim();
      const ResultOfVerification = String(entry.ResultOfVerification || '').trim();
      const VerifiedBy = String(entry.VerifiedBy || '').trim();
      const ConformedBy = String(entry.ConformedBy || '').trim();
      if (!FollowUpDate || !ResultOfVerification || !VerifiedBy) {
        res.json({ ok: false, error: 'Follow-up date, result of verification, and verified by are required.' });
        return;
      }
      const entries = parseJsonArray<Record<string, string>>(rec.FollowUpEntries);
      entries.push({
        FollowUpDate,
        ResultOfVerification,
        VerifiedBy,
        ConformedBy,
        AddedBy: req.user!.name,
        CreatedAt: nowIso(),
      });
      await store.updateCAR(carNo, { FollowUpEntries: JSON.stringify(entries), UpdatedAt: nowIso() });
      await notifyCarTarget(
        req.user!.userId,
        rec,
        `Follow-up verification (${FollowUpDate}: ${ResultOfVerification}) added to CAR ${carNo} by ${req.user!.name}.`,
        carNo
      );
      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'ADD_FOLLOWUP', Details: carNo });
      res.json({ ok: true, entries });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to add follow-up.' });
    }
  });

  // ---- CAR COMMENTS ----
  router.get('/cars/:carNo/comments', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const rec = await store.getCAR(req.params.carNo);
      if (!rec) {
        res.json([]);
        return;
      }
      if (!isAuditorOrAdmin(req.user!.role)) {
        const freshUser = await store.findUserById(req.user!.userId);
        const userDept = freshUser ? freshUser.Department : req.user!.department;
        if (!userCanAccessCar(req.user!.userId, userDept, rec)) {
          res.status(403).json({ ok: false, error: 'NOT_AUTHORIZED' });
          return;
        }
      }
      res.json(await store.listCarComments(req.params.carNo));
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load comments.' });
    }
  });

  router.post('/cars/:carNo/comments', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const { carNo } = req.params;
      const msg = String(req.body?.message || '').trim();
      if (!msg) {
        res.json({ ok: false, error: 'Comment cannot be empty.' });
        return;
      }
      const store = getStore();
      const rec = await store.getCAR(carNo);
      if (!rec) {
        res.json({ ok: false, error: 'Record not found.' });
        return;
      }
      const comment = {
        CommentID: newId('CM'),
        CARNo: carNo,
        UserID: req.user!.userId,
        UserName: req.user!.name,
        Role: req.user!.role,
        Message: msg,
        CreatedAt: nowIso(),
      };
      await store.addCarComment(comment);
      const notifyMsg = `New comment on your record ${carNo}: ${msg}`;
      if (rec.EmployeeID) {
        await createAndPushNotification({
          NotificationID: newId('N'),
          ToUserID: rec.EmployeeID,
          FromUserID: req.user!.userId,
          Message: notifyMsg,
          RelatedCARNo: carNo,
          Read: false,
          CreatedAt: nowIso(),
        });
      } else {
        await notifyDepartment(req.user!.userId, [rec.Department, rec.EmployeeName], notifyMsg, carNo);
      }
      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'ADD_COMMENT', Details: carNo });
      res.json({ ok: true, comment });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to post comment.' });
    }
  });

  // ---- CAR PDF EXPORT ----
  router.get('/cars/:carNo/export', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const rec = await store.getCAR(req.params.carNo);
      if (!rec) {
        res.status(404).json({ ok: false, error: 'Record not found.' });
        return;
      }
      if (!isAuditorOrAdmin(req.user!.role)) {
        const freshUser = await store.findUserById(req.user!.userId);
        const userDept = freshUser ? freshUser.Department : req.user!.department;
        if (!userCanAccessCar(req.user!.userId, userDept, rec)) {
          res.status(403).json({ ok: false, error: 'NOT_AUTHORIZED' });
          return;
        }
      }
      const company = await store.getCompanyDetails();
      const pdfBuffer = await generateCarPdfBuffer(rec, company);
      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'EXPORT_CAR', Details: rec.CARNo });
      const fileName = `${rec.CARNo} - FO-RI-05 Corrective Action Report.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'PDF export failed.' });
    }
  });

  // ---- NOTIFICATIONS ----
  router.get('/notifications', requireAuth, async (req: AuthedRequest, res) => {
    try {
      res.json(await getStore().listNotificationsForUser(req.user!.userId));
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load notifications.' });
    }
  });

  router.post('/notifications/read-all', requireAuth, async (req: AuthedRequest, res) => {
    try {
      await getStore().markAllNotificationsRead(req.user!.userId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to mark notifications.' });
    }
  });

  router.post('/notifications/:id/read', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const ok = await getStore().markNotificationRead(
        req.params.id,
        req.user!.userId,
        isAuditorOrAdmin(req.user!.role)
      );
      res.json({ ok });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to update notification.' });
    }
  });

  // ---- COMPANY & SETTINGS ----
  router.get('/company', requireAuth, async (_req, res) => {
    try {
      res.json(await getStore().getCompanyDetails());
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load company details.' });
    }
  });

  router.put('/company', requireSystemAdmin, async (req: AuthedRequest, res) => {
    try {
      const updates: Record<string, string> = {};
      const allowed = ['CompanyName', 'Address', 'Standard', 'LogoUrl', 'PrimaryColor', 'AccentGreen', 'AccentGold'];
      for (const key of allowed) {
        if (req.body?.[key] !== undefined) {
          updates[key] = String(req.body[key]);
        }
      }
      if (updates.LogoUrl && !isValidHttpsOrUploadUrl(updates.LogoUrl)) {
        res.json({ ok: false, error: 'Logo URL must be a valid https:// link.' });
        return;
      }
      const store = getStore();
      await store.updateCompanyDetails(updates);
      await store.appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'UPDATE_COMPANY',
        Details: JSON.stringify(updates),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to update company details.' });
    }
  });

  router.get('/settings', requireAuth, async (_req, res) => {
    try {
      res.json(await getStore().getSettings());
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load settings.' });
    }
  });

  router.put('/settings', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const raw = (req.body || {}) as Record<string, unknown>;
      const updates: Record<string, string> = {};
      const ownFlagKey = `NotifyOnFlag_${req.user!.userId}`;
      const ownEmailKey = `NotifyEmail_${req.user!.userId}`;
      if (req.user!.role === 'Admin') {
        for (const [k, v] of Object.entries(raw)) updates[k] = String(v ?? '');
      } else {
        if (raw[ownFlagKey] !== undefined) updates[ownFlagKey] = String(raw[ownFlagKey]);
        if (raw[ownEmailKey] !== undefined) updates[ownEmailKey] = String(raw[ownEmailKey]);
      }
      const store = getStore();
      await store.updateSettings(updates);
      await store.appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'UPDATE_SETTINGS',
        Details: JSON.stringify(updates),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to save settings.' });
    }
  });

  router.get('/settings/email-status', requireAuth, async (_req, res) => {
    res.json({ ok: true, ...getEmailSummary() });
  });

  router.post('/settings/test-email', requireAuth, async (req: AuthedRequest, res) => {
    try {
      if (!isEmailConfigured()) {
        res.json({
          ok: false,
          error:
            'Automatic email is not configured on the server yet. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS environment variables on your host.',
        });
        return;
      }
      const store = getStore();
      const user = await store.findUserById(req.user!.userId);
      const company = await store.getCompanyDetails().catch(() => ({}) as Record<string, string>);
      const toEmail = user?.Email || req.user!.email;
      const toName = user?.Name || req.user!.name;

      const result = await sendNotificationEmail({
        toEmail,
        toName,
        fromName: 'FCAT ISO Audit System',
        companyName: company.CompanyName || '',
        notif: {
          NotificationID: newId('TEST'),
          ToUserID: req.user!.userId,
          FromUserID: req.user!.userId,
          Message: 'This is a test notification email confirming that automatic email alerts are working.',
          RelatedCARNo: '',
          Read: false,
          CreatedAt: nowIso(),
        },
      });
      if (!result.ok) {
        res.json({ ok: false, error: result.error || 'Could not send test email.' });
        return;
      }
      res.json({ ok: true, toEmail });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to send test email.' });
    }
  });

  // ---- FILE UPLOADS ----
  router.post('/uploads/evidence', requireAuth, upload.single('file'), async (req: AuthedRequest, res) => {
    try {
      if (!req.file) {
        res.json({ ok: false, error: 'No file provided.' });
        return;
      }
      const carNo = String(req.body?.carNo || 'EVIDENCE').replace(/[^A-Za-z0-9._-]/g, '_');
      const saved = await saveUploadedFile('evidence', carNo, req.file);
      await getStore().appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'UPLOAD_EVIDENCE',
        Details: saved.url,
      });
      res.json({ ok: true, url: saved.url, name: saved.name });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Upload failed.' });
    }
  });

  router.post('/uploads/announcement-image', requireAuditor, upload.single('file'), async (req: AuthedRequest, res) => {
    try {
      if (!req.file) {
        res.json({ ok: false, error: 'No file provided.' });
        return;
      }
      if (req.file.size > 8 * 1024 * 1024) {
        res.json({ ok: false, error: 'Image is too large (max 8MB).' });
        return;
      }
      const saved = await saveUploadedFile('announcements', 'AN', req.file);
      await getStore().appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'UPLOAD_ANNOUNCEMENT_IMAGE',
        Details: saved.url,
      });
      res.json({ ok: true, url: saved.url, name: saved.name });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Image upload failed.' });
    }
  });

  router.post('/uploads/template', requireSystemAdmin, upload.single('file'), async (req: AuthedRequest, res) => {
    try {
      if (!req.file) {
        res.json({ ok: false, error: 'No file provided.' });
        return;
      }
      const saved = await saveUploadedFile('templates', 'FO-RI-05_Master', req.file);
      const store = getStore();
      await store.updateSettings({ FO_RI_05_TEMPLATE_URL: saved.url });
      await store.appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'UPLOAD_FORM_TEMPLATE',
        Details: saved.url,
      });
      res.json({ ok: true, url: saved.url });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Template upload failed.' });
    }
  });

  // ---- ANNOUNCEMENTS ----
  router.get('/announcements', requireAuth, async (_req, res) => {
    try {
      res.json(await getStore().listAnnouncements());
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load announcements.' });
    }
  });

  router.post('/announcements', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const title = String(req.body?.title || '').trim();
      const message = String(req.body?.message || '').trim();
      if (!title || !message) {
        res.json({ ok: false, error: 'Title and message are required.' });
        return;
      }
      const imageLinks = (Array.isArray(req.body?.imageLinks) ? req.body.imageLinks : []).filter((u: unknown) =>
        isValidEvidenceUrl(u)
      );
      const now = nowIso();
      const item = {
        AnnouncementID: newId('AN'),
        Title: title,
        Message: message,
        ImageLinks: imageLinks,
        PostedBy: req.user!.userId,
        PostedByName: req.user!.name,
        CreatedAt: now,
        UpdatedAt: now,
      };
      const store = getStore();
      await store.createAnnouncement(item);
      await store.appendLog({ Timestamp: now, UserID: req.user!.userId, Action: 'CREATE_ANNOUNCEMENT', Details: title });
      void dispatchAnnouncementEmails(item);
      res.json({ ok: true, announcement: item });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to post announcement.' });
    }
  });

  router.put('/announcements/:id', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const title = String(req.body?.title || '').trim();
      const message = String(req.body?.message || '').trim();
      if (!title || !message) {
        res.json({ ok: false, error: 'Title and message are required.' });
        return;
      }
      const imageLinks = (Array.isArray(req.body?.imageLinks) ? req.body.imageLinks : []).filter((u: unknown) =>
        isValidEvidenceUrl(u)
      );
      const store = getStore();
      const existing = await store.getAnnouncement(id);
      if (!existing) {
        res.json({ ok: false, error: 'Announcement not found.' });
        return;
      }
      const now = nowIso();
      await store.updateAnnouncement(
        id,
        { Title: title, Message: message, ImageLinks: imageLinks, UpdatedAt: now },
        {
          HistoryID: newId('AH'),
          AnnouncementID: id,
          Title: existing.Title,
          Message: existing.Message,
          ImageLinks: existing.ImageLinks,
          EditedBy: req.user!.userId,
          EditedByName: req.user!.name,
          EditedAt: now,
        }
      );
      await store.appendLog({ Timestamp: now, UserID: req.user!.userId, Action: 'UPDATE_ANNOUNCEMENT', Details: id });
      res.json({
        ok: true,
        announcement: {
          ...existing,
          Title: title,
          Message: message,
          ImageLinks: imageLinks,
          UpdatedAt: now,
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to update announcement.' });
    }
  });

  router.delete('/announcements/:id', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const ok = await store.deleteAnnouncement(req.params.id);
      if (!ok) {
        res.json({ ok: false, error: 'Announcement not found.' });
        return;
      }
      await store.appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'DELETE_ANNOUNCEMENT',
        Details: req.params.id,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to delete announcement.' });
    }
  });

  router.get('/announcements/:id/history', requireAuth, async (req, res) => {
    try {
      res.json(await getStore().getAnnouncementHistory(req.params.id));
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load edit history.' });
    }
  });

  router.get('/announcements/:id/comments', requireAuth, async (req, res) => {
    try {
      res.json(await getStore().listAnnouncementComments(req.params.id));
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load comments.' });
    }
  });

  router.post('/announcements/:id/comments', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const msg = String(req.body?.message || '').trim();
      if (!msg) {
        res.json({ ok: false, error: 'Comment cannot be empty.' });
        return;
      }
      const store = getStore();
      const ann = await store.getAnnouncement(req.params.id);
      if (!ann) {
        res.json({ ok: false, error: 'Announcement not found.' });
        return;
      }
      const comment = {
        CommentID: newId('AC'),
        AnnouncementID: req.params.id,
        UserID: req.user!.userId,
        UserName: req.user!.name,
        Role: req.user!.role,
        Message: msg,
        CreatedAt: nowIso(),
      };
      await store.addAnnouncementComment(comment);
      await store.appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'ADD_ANNOUNCEMENT_COMMENT',
        Details: req.params.id,
      });
      res.json({ ok: true, comment });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to post comment.' });
    }
  });

  router.delete('/announcements/comments/:commentId', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const result = await store.deleteAnnouncementComment(
        req.params.commentId,
        req.user!.userId,
        isAuditorOrAdmin(req.user!.role)
      );
      if (result === 'forbidden') {
        res.status(403).json({ ok: false, error: 'NOT_AUTHORIZED' });
        return;
      }
      if (result === 'not_found') {
        res.json({ ok: false, error: 'Comment not found.' });
        return;
      }
      await store.appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'DELETE_ANNOUNCEMENT_COMMENT',
        Details: req.params.commentId,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to delete comment.' });
    }
  });

  // ---- SYSTEM ADMIN STORAGE & EXISTING GOOGLE SHEETS SYNC (Company Details only) ----
  router.get('/admin/storage-status', requireSystemAdmin, (_req, res) => {
    res.json(getStorageStatus());
  });

  router.post('/admin/sheets-test', requireSystemAdmin, async (req, res) => {
    const spreadsheetId = String(req.body?.spreadsheetId || process.env.GOOGLE_SPREADSHEET_ID || '');
    const serviceAccountJson = req.body?.serviceAccountJson ? String(req.body.serviceAccountJson) : undefined;
    res.json(await testGoogleSheetConnection(spreadsheetId, serviceAccountJson));
  });

  router.post('/admin/sheets-sync', requireSystemAdmin, async (req: AuthedRequest, res) => {
    try {
      const direction = req.body?.direction === 'push-to-sheets' ? 'push-to-sheets' : 'pull-from-sheets';
      const spreadsheetId = req.body?.spreadsheetId ? String(req.body.spreadsheetId) : undefined;
      const serviceAccountJson = req.body?.serviceAccountJson ? String(req.body.serviceAccountJson) : undefined;
      const result = await syncDataBetweenStores(direction, spreadsheetId, serviceAccountJson);
      if (result.ok) {
        await getStore().appendLog({
          Timestamp: nowIso(),
          UserID: req.user!.userId,
          Action: `SHEETS_SYNC_${direction.toUpperCase()}`,
          Details: JSON.stringify(result.summary),
        });
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Sync failed.' });
    }
  });

  router.get('/admin/audit-logs', requireAuditor, async (req, res) => {
    try {
      const rawLimit = Number(req.query.limit || 200);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 10), 500) : 200;
      const store = getStore();
      const [logs, users] = await Promise.all([store.listLogs(limit), store.listUsers()]);
      const userMap = new Map(users.map((u) => [u.UserID, u]));
      const enriched = logs.map((log) => {
        const actor = userMap.get(log.UserID);
        return {
          ...log,
          UserName: actor?.Name || '',
          UserEmail: actor?.Email || '',
          UserRole: actor ? normalizeUserRole(actor.Role) : '',
        };
      });
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load logs.' });
    }
  });

  // ---- HELP DESK & DIRECT MESSAGES ----
  router.get('/helpdesk/contacts', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const users = await getStore().listUsers();
      const contacts = users
        .filter((u) => u.Status === 'Active' && u.UserID !== req.user!.userId)
        .map((u) => ({
          userId: u.UserID,
          name: u.Name,
          email: u.Email,
          role: normalizeUserRole(u.Role),
          department: u.Department,
          position: u.Position,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json(contacts);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load contacts.' });
    }
  });

  router.get('/helpdesk/tickets', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const all = await getStore().listHelpDeskTickets();
      const filtered = isAuditorOrAdmin(req.user!.role)
        ? all
        : all.filter((t) => t.CreatedBy === req.user!.userId);
      res.json(filtered);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load concerns.' });
    }
  });

  router.post('/helpdesk/tickets', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const subject = String(req.body?.subject || '').trim().slice(0, 180);
      const category = String(req.body?.category || 'General Concern').trim().slice(0, 80) || 'General Concern';
      const priority: HelpDeskTicketPriority = req.body?.priority === 'Urgent' ? 'Urgent' : 'Normal';
      const relatedCarNo = String(req.body?.relatedCarNo || '').trim().slice(0, 60);
      const messageText = String(req.body?.message || '').trim().slice(0, 4000);
      if (!subject || !messageText) {
        res.json({ ok: false, error: 'Subject and concern description are required.' });
        return;
      }
      const store = getStore();
      const now = nowIso();
      const ticketId = `HD-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const ticket: HelpDeskTicket = {
        TicketID: ticketId,
        Subject: subject,
        Category: category,
        Priority: priority,
        RelatedCARNo: relatedCarNo,
        Status: 'Open',
        CreatedBy: req.user!.userId,
        CreatedByName: req.user!.name,
        CreatedByRole: req.user!.role,
        CreatedByDepartment: req.user!.department || '',
        AssignedTo: '',
        CreatedAt: now,
        UpdatedAt: now,
      };
      const initialMsg: HelpDeskMessage = {
        MessageID: newId('HM'),
        TicketID: ticketId,
        SenderID: req.user!.userId,
        SenderName: req.user!.name,
        SenderRole: req.user!.role,
        Message: messageText,
        CreatedAt: now,
      };
      await store.createHelpDeskTicket(ticket, initialMsg);
      await store.appendLog({
        Timestamp: now,
        UserID: req.user!.userId,
        Action: 'CREATE_HELPDESK_TICKET',
        Details: `${ticketId}: ${subject}`,
      });

      const users = await store.listUsers();
      const staffIds = users
        .filter((u) => u.Status === 'Active' && isAuditorOrAdmin(normalizeUserRole(u.Role)) && u.UserID !== req.user!.userId)
        .map((u) => u.UserID);

      emitToUsers([req.user!.userId, ...staffIds], { type: 'helpdesk:ticket_created', payload: ticket });

      for (const uid of staffIds) {
        await createAndPushNotification({
          NotificationID: newId('N'),
          ToUserID: uid,
          FromUserID: req.user!.userId,
          Message: `New Help Desk ${priority === 'Urgent' ? '[Urgent] ' : ''}concern (${ticketId}) from ${req.user!.name}: ${subject}`,
          RelatedCARNo: `HELP:${ticketId}`,
          Read: false,
          CreatedAt: now,
        });
      }

      res.json({ ok: true, ticket, initialMessage: initialMsg });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to submit concern.' });
    }
  });

  router.get('/helpdesk/tickets/:ticketId/messages', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const ticket = await store.getHelpDeskTicket(req.params.ticketId);
      if (!ticket) {
        res.status(404).json({ ok: false, error: 'Concern ticket not found.' });
        return;
      }
      if (!isAuditorOrAdmin(req.user!.role) && ticket.CreatedBy !== req.user!.userId) {
        res.status(403).json({ ok: false, error: 'NOT_AUTHORIZED' });
        return;
      }
      res.json(await store.listHelpDeskMessages(ticket.TicketID));
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load messages.' });
    }
  });

  router.post('/helpdesk/tickets/:ticketId/messages', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const text = String(req.body?.message || '').trim().slice(0, 4000);
      if (!text) {
        res.json({ ok: false, error: 'Message cannot be empty.' });
        return;
      }
      const store = getStore();
      const ticket = await store.getHelpDeskTicket(req.params.ticketId);
      if (!ticket) {
        res.status(404).json({ ok: false, error: 'Concern ticket not found.' });
        return;
      }
      if (!isAuditorOrAdmin(req.user!.role) && ticket.CreatedBy !== req.user!.userId) {
        res.status(403).json({ ok: false, error: 'NOT_AUTHORIZED' });
        return;
      }
      const now = nowIso();
      const msg: HelpDeskMessage = {
        MessageID: newId('HM'),
        TicketID: ticket.TicketID,
        SenderID: req.user!.userId,
        SenderName: req.user!.name,
        SenderRole: req.user!.role,
        Message: text,
        CreatedAt: now,
      };
      await store.addHelpDeskMessage(msg);
      const nextStatus: HelpDeskTicketStatus =
        isAuditorOrAdmin(req.user!.role) && ticket.Status === 'Open' ? 'In Progress' : ticket.Status;
      await store.updateHelpDeskTicket(ticket.TicketID, { Status: nextStatus, UpdatedAt: now });

      const updatedTicket: HelpDeskTicket = { ...ticket, Status: nextStatus, UpdatedAt: now };

      const users = await store.listUsers();
      const staffIds = users
        .filter((u) => u.Status === 'Active' && isAuditorOrAdmin(normalizeUserRole(u.Role)))
        .map((u) => u.UserID);
      const recipients = Array.from(new Set([ticket.CreatedBy, ...staffIds])).filter((id) => id !== req.user!.userId);

      emitToUsers([req.user!.userId, ...recipients], { type: 'helpdesk:message', payload: msg });
      emitToUsers([req.user!.userId, ...recipients], { type: 'helpdesk:ticket_updated', payload: updatedTicket });

      clearPendingConversationEmail(req.user!.userId, `HELP:${ticket.TicketID}`);

      if (ticket.CreatedBy !== req.user!.userId) {
        await createAndPushNotification(
          {
            NotificationID: newId('N'),
            ToUserID: ticket.CreatedBy,
            FromUserID: req.user!.userId,
            Message: `${req.user!.name} replied to your Help Desk concern (${ticket.TicketID}): ${text.slice(0, 90)}`,
            RelatedCARNo: `HELP:${ticket.TicketID}`,
            Read: false,
            CreatedAt: now,
          },
          { skipImmediateEmail: true }
        );
        queueConversationEmail({
          recipientId: ticket.CreatedBy,
          conversationKey: `HELP:${ticket.TicketID}`,
          conversationTitle: ticket.Subject,
          category: 'Help Desk Concern',
          reference: ticket.TicketID,
          actionPath: '/?page=helpdesk',
          item: {
            messageId: msg.MessageID,
            senderId: req.user!.userId,
            senderName: req.user!.name,
            text,
            createdAt: now,
          },
        });
      } else {
        for (const uid of staffIds) {
          if (uid === req.user!.userId) continue;
          await createAndPushNotification(
            {
              NotificationID: newId('N'),
              ToUserID: uid,
              FromUserID: req.user!.userId,
              Message: `New reply from ${req.user!.name} on Help Desk ${ticket.TicketID}: ${text.slice(0, 90)}`,
              RelatedCARNo: `HELP:${ticket.TicketID}`,
              Read: false,
              CreatedAt: now,
            },
            { skipImmediateEmail: true }
          );
          queueConversationEmail({
            recipientId: uid,
            conversationKey: `HELP:${ticket.TicketID}`,
            conversationTitle: ticket.Subject,
            category: 'Help Desk Concern',
            reference: ticket.TicketID,
            actionPath: '/?page=helpdesk',
            item: {
              messageId: msg.MessageID,
              senderId: req.user!.userId,
              senderName: req.user!.name,
              text,
              createdAt: now,
            },
          });
        }
      }

      res.json({ ok: true, message: msg, ticket: updatedTicket });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to send reply.' });
    }
  });

  router.patch('/helpdesk/tickets/:ticketId/status', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const allowed: HelpDeskTicketStatus[] = ['Open', 'In Progress', 'Resolved', 'Closed'];
      const status = String(req.body?.status || '') as HelpDeskTicketStatus;
      if (!allowed.includes(status)) {
        res.json({ ok: false, error: 'Invalid ticket status.' });
        return;
      }
      const store = getStore();
      const ticket = await store.getHelpDeskTicket(req.params.ticketId);
      if (!ticket) {
        res.status(404).json({ ok: false, error: 'Concern ticket not found.' });
        return;
      }
      const now = nowIso();
      await store.updateHelpDeskTicket(ticket.TicketID, { Status: status, UpdatedAt: now });
      const updatedTicket: HelpDeskTicket = { ...ticket, Status: status, UpdatedAt: now };

      await store.appendLog({
        Timestamp: now,
        UserID: req.user!.userId,
        Action: 'HELPDESK_STATUS',
        Details: `${ticket.TicketID} -> ${status}`,
      });

      const users = await store.listUsers();
      const staffIds = users
        .filter((u) => u.Status === 'Active' && isAuditorOrAdmin(normalizeUserRole(u.Role)))
        .map((u) => u.UserID);
      emitToUsers(Array.from(new Set([ticket.CreatedBy, ...staffIds])), {
        type: 'helpdesk:ticket_updated',
        payload: updatedTicket,
      });

      if (ticket.CreatedBy !== req.user!.userId) {
        await createAndPushNotification({
          NotificationID: newId('N'),
          ToUserID: ticket.CreatedBy,
          FromUserID: req.user!.userId,
          Message: `Your Help Desk concern (${ticket.TicketID}) was marked as ${status}.`,
          RelatedCARNo: `HELP:${ticket.TicketID}`,
          Read: false,
          CreatedAt: now,
        });
      }

      res.json({ ok: true, ticket: updatedTicket });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to update ticket.' });
    }
  });

  router.get('/helpdesk/dm/threads', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const me = req.user!.userId;
      const [users, allDms] = await Promise.all([store.listUsers(), store.listDirectMessagesForUser(me)]);
      const contacts = users.filter((u) => u.Status === 'Active' && u.UserID !== me);

      const summaries = contacts.map((u) => {
        const convo = allDms.filter(
          (m) => (m.FromUserID === me && m.ToUserID === u.UserID) || (m.FromUserID === u.UserID && m.ToUserID === me)
        );
        const last = convo[convo.length - 1];
        const unreadCount = convo.filter((m) => m.FromUserID === u.UserID && m.ToUserID === me && !m.Read).length;
        return {
          userId: u.UserID,
          name: u.Name,
          email: u.Email,
          role: normalizeUserRole(u.Role),
          department: u.Department,
          position: u.Position,
          lastMessage: last ? last.Message : '',
          lastAt: last ? last.CreatedAt : '',
          lastFromMe: last ? last.FromUserID === me : false,
          lastRead: last ? Boolean(last.Read) : false,
          unreadCount,
        };
      });

      summaries.sort((a, b) => {
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
        if (a.lastAt && b.lastAt) return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
        if (a.lastAt) return -1;
        if (b.lastAt) return 1;
        return a.name.localeCompare(b.name);
      });

      res.json(summaries);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load chat threads.' });
    }
  });

  router.get('/helpdesk/dm/:otherUserId', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const me = req.user!.userId;
      const other = req.params.otherUserId;
      const all = await store.listDirectMessagesForUser(me);
      const hasUnreadFromOther = all.some(
        (m) => m.FromUserID === other && m.ToUserID === me && !m.Read
      );
      if (hasUnreadFromOther) {
        await store.markDirectMessagesRead(other, me);
      }
      const thread = all
        .filter(
          (m) => (m.FromUserID === me && m.ToUserID === other) || (m.FromUserID === other && m.ToUserID === me)
        )
        .map((m) => (m.FromUserID === other && m.ToUserID === me ? { ...m, Read: true } : m));
      if (hasUnreadFromOther) {
        emitToUsers([me, other], { type: 'dm:read', payload: { readerId: me, otherUserId: other } });
      }
      res.json(thread);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load messages.' });
    }
  });

  router.post('/helpdesk/dm/:otherUserId/read', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const me = req.user!.userId;
      const other = req.params.otherUserId;
      await store.markDirectMessagesRead(other, me);
      emitToUsers([me, other], { type: 'dm:read', payload: { readerId: me, otherUserId: other } });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to mark messages as read.' });
    }
  });

  router.post('/helpdesk/dm/:otherUserId', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const text = String(req.body?.message || '').trim().slice(0, 4000);
      if (!text) {
        res.json({ ok: false, error: 'Message cannot be empty.' });
        return;
      }
      const store = getStore();
      const me = req.user!;
      const otherId = req.params.otherUserId;
      if (otherId === me.userId) {
        res.json({ ok: false, error: 'You cannot send a direct message to yourself.' });
        return;
      }
      const recipient = await store.findUserById(otherId);
      if (!recipient || recipient.Status !== 'Active') {
        res.status(404).json({ ok: false, error: 'Recipient user not found or inactive.' });
        return;
      }

      const now = nowIso();
      const msg: DirectMessage = {
        MessageID: newId('DM'),
        FromUserID: me.userId,
        FromUserName: me.name,
        FromUserRole: me.role,
        ToUserID: otherId,
        Message: text,
        Read: false,
        CreatedAt: now,
      };
      await store.createDirectMessage(msg);
      emitToUsers([me.userId, otherId], { type: 'dm:new', payload: msg });

      // DPO & Security: Direct Messages send in-app notifications only — never external email.
      await createAndPushNotification(
        {
          NotificationID: newId('N'),
          ToUserID: otherId,
          FromUserID: me.userId,
          Message: `New direct message from ${me.name}`,
          RelatedCARNo: `DM:${me.userId}`,
          Read: false,
          CreatedAt: now,
        },
        { skipImmediateEmail: true }
      );

      res.json({ ok: true, message: msg });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to send message.' });
    }
  });

  // ---- AUDIT SCHEDULES (Calendar) ----
  const ALLOWED_AUDIT_TYPES: AuditScheduleType[] = [
    'Internal ISO Audit',
    'Department Audit',
    'Follow-Up Verification',
    'Surveillance Audit',
    'Management Review',
  ];
  const ALLOWED_AUDIT_STATUSES: AuditScheduleStatus[] = ['Scheduled', 'Completed', 'Cancelled'];

  router.get('/audit-schedules', requireAuditor, async (_req, res) => {
    try {
      res.json(await getStore().listAuditSchedules());
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load audit schedules.' });
    }
  });

  router.post('/audit-schedules', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const title = String(req.body?.Title || '').trim().slice(0, 160);
      const auditDate = String(req.body?.AuditDate || '').trim();
      const rawType = String(req.body?.AuditType || 'Internal ISO Audit').trim() as AuditScheduleType;
      const auditType: AuditScheduleType = ALLOWED_AUDIT_TYPES.includes(rawType) ? rawType : 'Internal ISO Audit';
      const timeWindow = String(req.body?.TimeWindow || '').trim().slice(0, 80);
      const department = String(req.body?.Department || '').trim().slice(0, 160);
      const leadAuditor = String(req.body?.LeadAuditor || req.user!.name || '').trim().slice(0, 120);
      const notes = String(req.body?.Notes || '').trim().slice(0, 1500);

      if (!title) {
        res.json({ ok: false, error: 'Audit title is required.' });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(auditDate)) {
        res.json({ ok: false, error: 'Please select a valid date (YYYY-MM-DD).' });
        return;
      }

      const now = nowIso();
      const item: AuditSchedule = {
        ScheduleID: newId('AUD'),
        Title: title,
        AuditType: auditType,
        AuditDate: auditDate,
        TimeWindow: timeWindow,
        Department: department || 'All Services',
        LeadAuditor: leadAuditor,
        Status: 'Scheduled',
        Notes: notes,
        CreatedBy: req.user!.userId,
        CreatedAt: now,
        UpdatedAt: now,
      };
      const store = getStore();
      await store.createAuditSchedule(item);
      await notifyAuditSchedule(req.user!.userId, item, 'Created');
      await store.appendLog({
        Timestamp: now,
        UserID: req.user!.userId,
        Action: 'SCHEDULE_AUDIT',
        Details: `${item.ScheduleID}: ${item.Title} (${item.AuditDate})`,
      });
      res.json({ ok: true, schedule: item });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to create audit schedule.' });
    }
  });

  router.put('/audit-schedules/:id', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const existing = await store.getAuditSchedule(req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, error: 'Audit schedule not found.' });
        return;
      }
      const updates: Partial<AuditSchedule> = { UpdatedAt: nowIso() };
      if (req.body?.Title !== undefined) {
        const t = String(req.body.Title).trim().slice(0, 160);
        if (!t) {
          res.json({ ok: false, error: 'Audit title cannot be empty.' });
          return;
        }
        updates.Title = t;
      }
      if (req.body?.AuditDate !== undefined) {
        const d = String(req.body.AuditDate).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          res.json({ ok: false, error: 'Please select a valid date (YYYY-MM-DD).' });
          return;
        }
        updates.AuditDate = d;
      }
      if (req.body?.AuditType !== undefined) {
        const rawType = String(req.body.AuditType).trim() as AuditScheduleType;
        if (ALLOWED_AUDIT_TYPES.includes(rawType)) updates.AuditType = rawType;
      }
      if (req.body?.TimeWindow !== undefined) {
        updates.TimeWindow = String(req.body.TimeWindow).trim().slice(0, 80);
      }
      if (req.body?.Department !== undefined) {
        updates.Department = String(req.body.Department).trim().slice(0, 160) || 'All Services';
      }
      if (req.body?.LeadAuditor !== undefined) {
        updates.LeadAuditor = String(req.body.LeadAuditor).trim().slice(0, 120);
      }
      if (req.body?.Status !== undefined) {
        const rawStatus = String(req.body.Status).trim() as AuditScheduleStatus;
        if (ALLOWED_AUDIT_STATUSES.includes(rawStatus)) updates.Status = rawStatus;
      }
      if (req.body?.Notes !== undefined) {
        updates.Notes = String(req.body.Notes).trim().slice(0, 1500);
      }

      await store.updateAuditSchedule(existing.ScheduleID, updates);
      const updated = { ...existing, ...updates };
      await notifyAuditSchedule(
        req.user!.userId,
        updated,
        updated.Status === 'Cancelled' ? 'Cancelled' : 'Updated'
      );
      await store.appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'UPDATE_AUDIT_SCHEDULE',
        Details: `${updated.ScheduleID}: ${updated.Title} (${updated.Status})`,
      });
      res.json({ ok: true, schedule: updated });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to update audit schedule.' });
    }
  });

  router.delete('/audit-schedules/:id', requireAuditor, async (req: AuthedRequest, res) => {
    try {
      const store = getStore();
      const existing = await store.getAuditSchedule(req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, error: 'Audit schedule not found.' });
        return;
      }
      await store.deleteAuditSchedule(existing.ScheduleID);
      await notifyAuditSchedule(req.user!.userId, { ...existing, Status: 'Cancelled' }, 'Cancelled / Removed');
      await store.appendLog({
        Timestamp: nowIso(),
        UserID: req.user!.userId,
        Action: 'DELETE_AUDIT_SCHEDULE',
        Details: `${existing.ScheduleID}: ${existing.Title} (${existing.AuditDate})`,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to delete audit schedule.' });
    }
  });

  return router;
}
