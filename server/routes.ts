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
import { generateCarPdfBuffer } from './pdfExport.js';
import {
  hashPassword,
  isValidEvidenceUrl,
  isValidHttpsOrUploadUrl,
  newId,
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
import type { CarRecord, SessionUser } from './types.js';

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

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'Admin') {
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

async function notifyDepartment(fromUserId: string, department: string, message: string, carNo: string) {
  if (!department) return;
  const store = getStore();
  const users = await store.listUsers();
  const targets = users.filter(
    (u) => u.Role === 'Employee' && u.Status === 'Active' && userHasDepartment(u.Department, department)
  );
  for (const u of targets) {
    await store.createNotification({
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
    category === 'announcements'
      ? process.env.GOOGLE_DRIVE_ANNOUNCEMENT_FOLDER_ID
      : process.env.GOOGLE_DRIVE_EVIDENCE_FOLDER_ID;
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
        role: user.Role === 'Admin' ? 'Admin' : 'Employee',
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

  router.post('/auth/logout', (_req, res) => {
    res.json({ ok: true });
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
          role: fresh.Role,
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
  router.get('/users', requireAdmin, async (_req, res) => {
    try {
      const users = await getStore().listUsers();
      res.json(
        users.map((u) => ({
          userId: u.UserID,
          name: u.Name,
          email: u.Email,
          role: u.Role,
          department: u.Department,
          position: u.Position,
          status: u.Status,
        }))
      );
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load users.' });
    }
  });

  router.post('/users', requireAdmin, async (req: AuthedRequest, res) => {
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
      const store = getStore();
      const existing = await store.findUserByEmail(email);
      if (existing) {
        res.json({ ok: false, error: 'A user with that email already exists.' });
        return;
      }
      const userId = newId('U');
      const role = data.role === 'Admin' ? 'Admin' : 'Employee';
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
      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'CREATE_USER', Details: email });
      res.json({
        ok: true,
        user: { userId, name, email, role, department: departmentStr, position, status: 'Active' },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to create user.' });
    }
  });

  router.put('/users/:userId', requireAdmin, async (req: AuthedRequest, res) => {
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
      const role = data.role === 'Admin' ? 'Admin' : 'Employee';
      if (userId === req.user!.userId && existing.Role === 'Admin' && role !== 'Admin') {
        res.json({ ok: false, error: 'You cannot remove Auditor Account access from your own account.' });
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

  router.post('/users/:userId/lock', requireAdmin, async (req: AuthedRequest, res) => {
    try {
      const { userId } = req.params;
      const lock = Boolean(req.body?.lock);
      if (lock && userId === req.user!.userId) {
        res.json({ ok: false, error: 'You cannot lock your own account.' });
        return;
      }
      const store = getStore();
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

  router.get('/process-owners', requireAdmin, async (_req, res) => {
    try {
      const users = await getStore().listUsers();
      res.json(
        users
          .filter((u) => u.Role === 'Employee' && u.Status === 'Active')
          .map((u) => ({ userId: u.UserID, name: u.Name, department: u.Department }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load process owners.' });
    }
  });

  // ---- DEPARTMENTS ----
  router.get('/departments', requireAuth, async (_req, res) => {
    try {
      const depts = await getStore().listDepartments();
      res.json(depts);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load departments.' });
    }
  });

  router.post('/departments', requireAdmin, async (req: AuthedRequest, res) => {
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

  router.delete('/departments/:name', requireAdmin, async (req: AuthedRequest, res) => {
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
      if (req.user!.role === 'Admin') {
        res.json(all);
        return;
      }
      const freshUser = await store.findUserById(req.user!.userId);
      const userDept = freshUser ? freshUser.Department : req.user!.department;
      res.json(all.filter((r) => userHasDepartment(userDept, r.Department)));
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
      if (req.user!.role !== 'Admin') {
        const freshUser = await store.findUserById(req.user!.userId);
        const userDept = freshUser ? freshUser.Department : req.user!.department;
        if (!userHasDepartment(userDept, rec.Department)) {
          res.status(403).json({ ok: false, error: 'NOT_AUTHORIZED' });
          return;
        }
      }
      res.json(rec);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load record.' });
    }
  });

  router.post('/cars', requireAdmin, async (req: AuthedRequest, res) => {
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

      const assignee = await resolveAssignee(payload.EmployeeID);
      delete payload.EmployeeID;
      delete payload.EmployeeName;
      if (!assignee.ok) {
        res.json({ ok: false, error: assignee.error });
        return;
      }

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
        await store.createNotification({
          NotificationID: newId('N'),
          ToUserID: record.EmployeeID,
          FromUserID: req.user!.userId,
          Message: raiseMessage,
          RelatedCARNo: carNo,
          Read: false,
          CreatedAt: nowIso(),
        });
      } else {
        await notifyDepartment(req.user!.userId, record.Department, raiseMessage, carNo);
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
      const isAdmin = req.user!.role === 'Admin';
      if (!isAdmin) {
        const freshUser = await store.findUserById(req.user!.userId);
        const userDept = freshUser ? freshUser.Department : req.user!.department;
        if (!userHasDepartment(userDept, rec.Department)) {
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
      sanitizeCarPayload(payload);

      if (!isAdmin) {
        for (const f of AUDITOR_ONLY_FIELDS) delete payload[f];
      }

      delete payload.EmployeeName;
      let reassignedTo: { EmployeeID?: string; EmployeeName?: string } | null = null;
      if (isAdmin && payload.EmployeeID !== undefined) {
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
      if (!isAdmin && (!rec.EmployeeID || rec.EmployeeID === '')) {
        updates.EmployeeID = req.user!.userId;
        updates.EmployeeName = req.user!.name;
      }

      await store.updateCAR(carNo, updates, whyFactors);

      if (reassignedTo?.EmployeeID) {
        await store.createNotification({
          NotificationID: newId('N'),
          ToUserID: reassignedTo.EmployeeID,
          FromUserID: req.user!.userId,
          Message: `You have been assigned to record ${carNo}.`,
          RelatedCARNo: carNo,
          Read: false,
          CreatedAt: nowIso(),
        });
      }

      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'UPDATE_CAR', Details: carNo });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to update CAR.' });
    }
  });

  router.post('/cars/:carNo/flag', requireAdmin, async (req: AuthedRequest, res) => {
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
        await store.createNotification({
          NotificationID: newId('N'),
          ToUserID: rec.EmployeeID,
          FromUserID: req.user!.userId,
          Message: msg,
          RelatedCARNo: carNo,
          Read: false,
          CreatedAt: nowIso(),
        });
      } else {
        await notifyDepartment(req.user!.userId, rec.Department, msg, carNo);
      }
      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'FLAG_CAR', Details: carNo });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to flag record.' });
    }
  });

  router.post('/cars/:carNo/close', requireAdmin, async (req: AuthedRequest, res) => {
    try {
      const { carNo } = req.params;
      const store = getStore();
      const ok = await store.updateCAR(carNo, { Status: 'Closed', UpdatedAt: nowIso() });
      if (ok) {
        await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'CLOSE_CAR', Details: carNo });
      }
      res.json({ ok });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to close record.' });
    }
  });

  router.post('/cars/:carNo/reopen', requireAdmin, async (req: AuthedRequest, res) => {
    try {
      const { carNo } = req.params;
      const store = getStore();
      const ok = await store.updateCAR(carNo, { Status: 'Open', UpdatedAt: nowIso() });
      if (!ok) {
        res.json({ ok: false, error: 'Record not found.' });
        return;
      }
      await store.appendLog({ Timestamp: nowIso(), UserID: req.user!.userId, Action: 'REOPEN_CAR', Details: carNo });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to reopen record.' });
    }
  });

  router.post('/cars/:carNo/deadline', requireAdmin, async (req: AuthedRequest, res) => {
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
          await store.createNotification({
            NotificationID: newId('N'),
            ToUserID: rec.EmployeeID,
            FromUserID: req.user!.userId,
            Message: msg,
            RelatedCARNo: carNo,
            Read: false,
            CreatedAt: nowIso(),
          });
        } else {
          await notifyDepartment(req.user!.userId, rec.Department, msg, carNo);
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

  router.post('/cars/:carNo/followups', requireAdmin, async (req: AuthedRequest, res) => {
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
      if (req.user!.role !== 'Admin') {
        const freshUser = await store.findUserById(req.user!.userId);
        const userDept = freshUser ? freshUser.Department : req.user!.department;
        if (!userHasDepartment(userDept, rec.Department)) {
          res.status(403).json({ ok: false, error: 'NOT_AUTHORIZED' });
          return;
        }
      }
      res.json(await store.listCarComments(req.params.carNo));
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load comments.' });
    }
  });

  router.post('/cars/:carNo/comments', requireAdmin, async (req: AuthedRequest, res) => {
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
        await store.createNotification({
          NotificationID: newId('N'),
          ToUserID: rec.EmployeeID,
          FromUserID: req.user!.userId,
          Message: notifyMsg,
          RelatedCARNo: carNo,
          Read: false,
          CreatedAt: nowIso(),
        });
      } else {
        await notifyDepartment(req.user!.userId, rec.Department, notifyMsg, carNo);
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
      if (req.user!.role !== 'Admin') {
        const freshUser = await store.findUserById(req.user!.userId);
        const userDept = freshUser ? freshUser.Department : req.user!.department;
        if (!userHasDepartment(userDept, rec.Department)) {
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
        req.user!.role === 'Admin'
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

  router.put('/company', requireAdmin, async (req: AuthedRequest, res) => {
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
      const ownKey = `NotifyOnFlag_${req.user!.userId}`;
      if (req.user!.role === 'Admin') {
        for (const [k, v] of Object.entries(raw)) updates[k] = String(v ?? '');
      } else if (raw[ownKey] !== undefined) {
        updates[ownKey] = String(raw[ownKey]);
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

  router.post('/uploads/announcement-image', requireAdmin, upload.single('file'), async (req: AuthedRequest, res) => {
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

  router.post('/uploads/template', requireAdmin, upload.single('file'), async (req: AuthedRequest, res) => {
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

  router.post('/announcements', requireAdmin, async (req: AuthedRequest, res) => {
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
      res.json({ ok: true, announcement: item });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to post announcement.' });
    }
  });

  router.put('/announcements/:id', requireAdmin, async (req: AuthedRequest, res) => {
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

  router.delete('/announcements/:id', requireAdmin, async (req: AuthedRequest, res) => {
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
        req.user!.role === 'Admin'
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

  // ---- ADMIN STORAGE & EXISTING GOOGLE SHEETS SYNC ----
  router.get('/admin/storage-status', requireAdmin, (_req, res) => {
    res.json(getStorageStatus());
  });

  router.post('/admin/sheets-test', requireAdmin, async (req, res) => {
    const spreadsheetId = String(req.body?.spreadsheetId || process.env.GOOGLE_SPREADSHEET_ID || '');
    const serviceAccountJson = req.body?.serviceAccountJson ? String(req.body.serviceAccountJson) : undefined;
    res.json(await testGoogleSheetConnection(spreadsheetId, serviceAccountJson));
  });

  router.post('/admin/sheets-sync', requireAdmin, async (req: AuthedRequest, res) => {
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

  router.get('/admin/audit-logs', requireAdmin, async (_req, res) => {
    try {
      res.json(await getStore().listLogs(100));
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load logs.' });
    }
  });

  return router;
}
