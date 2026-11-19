/*******************************************************
 * FCAT ISO AUDIT MANAGEMENT SYSTEM
 * Backend: Google Apps Script
 * Database: Google Sheets (this bound spreadsheet)
 * Evidence storage: Google Drive
 *
 * SETUP: Run setupSpreadsheet() once from the editor.
 ******************************************************* Application */

// ---------- CONFIG ----------
const APP_NAME = 'FCAT ISO Audit Management System';
const SESSION_HOURS = 6;
const EVIDENCE_FOLDER_NAME = 'FCAT ISO Audit - Evidence';

const SHEETS = {
  USERS: 'Users',
  CAR: 'CAR_Records',          // Corrective Action / NC / OFI main records
  WHY_WHY: 'CAR_WhyWhy',       // Dedicated tab for 5 Whys Root Cause Analysis
  NOTIFICATIONS: 'Notifications',
  COMPANY: 'CompanyDetails',
  SETTINGS: 'Settings',
  LOG: 'AuditLog',
  COMMENTS: 'CAR_Comments',
  ANNOUNCEMENTS: 'Announcements',
  ANNOUNCEMENT_HISTORY: 'Announcement_History',
  ANNOUNCEMENT_COMMENTS: 'Announcement_Comments',
  DEPARTMENTS: 'Departments'
};

// Canonical list of departments - the single source of truth for the
// Department dropdown everywhere in the app (user accounts, CAR routing).
// Seeded into the Departments sheet on first setup; edit that sheet directly
// to add/remove/rename departments later without a code change.
const DEFAULT_DEPARTMENTS = [
  'Basic Education','TESDA','Acads - CHED','Accounting','Admission','Alumni',
  'Disciplinary','Document Control','Enrolment','Extension','Guidance',
  'Human Resources','Inventory','IT Services','Library Services','Maintenance',
  'Marketing','Medical','Pollution Control','Procurement','Registrar','Research',
  'Safety','Scholarship','Security','Student Affairs','College of Education',
  'College of Computer Science','College of Hospitality Management',
  'College of Criminal Justice','College of Business Administration & Accountancy',
  'College of Nursing','Strategic Planning','Review and Improvement'
];
const DEPARTMENT_COLS = ['Name'];

// Column headers
const USER_COLS   = ['UserID','Name','Email','PasswordHash','Role','Department','Position','Status','CreatedAt'];
const CAR_COLS     = ['CARNo','Type','Status','EmployeeID','EmployeeName','Department','DateIssued',
  'Source','ISOClause','Details','CompanyDocument','Correction','DateCompleted','PersonInCharge','Result',
  'PossibleRootCause','ValidationMethod','ValidationDate','ValidationResult','TrueRootCause',
  'CorrectiveAction','ActionOwnerTargetDate','EvidenceLink','FormEvidenceLink','DateImplemented',
  'PreparedBy','PreparedDate','ApprovedBy','ApprovedDate',
  'FollowUpDate','ResultOfVerification','VerifiedBy','ConformedBy',
  'AdminFlag','AdminNote','CreatedAt','UpdatedAt','AdminDeadline',
  'RaisedBy','CorrectionEntries','PossibleRootCauseEntries','CorrectiveActionEntries',
  'EvidenceLinks','SignOffConformedBy','FollowUpEntries','SignOffConformedDate'];
const WHY_COLS    = ['CARNo','Factor','Why1','Why2','Why3','Why4','Why5','UpdatedAt'];
const NOTIF_COLS  = ['NotificationID','ToUserID','FromUserID','Message','RelatedCARNo','Read','CreatedAt'];
const COMPANY_COLS= ['Key','Value'];
const SETTINGS_COLS = ['Key','Value'];
const COMMENT_COLS = ['CommentID','CARNo','UserID','UserName','Role','Message','CreatedAt'];
const ANNOUNCEMENT_COLS = ['AnnouncementID','Title','Message','PostedBy','PostedByName','CreatedAt','UpdatedAt','ImageLinks'];
const ANNOUNCEMENT_HISTORY_COLS = ['HistoryID','AnnouncementID','Title','Message','ImageLinks','EditedBy','EditedByName','EditedAt'];
const ANNOUNCEMENT_COMMENT_COLS = ['CommentID','AnnouncementID','UserID','UserName','Role','Message','CreatedAt'];

// ---------- WEB APP ENTRY ----------
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'login';
  const template = HtmlService.createTemplateFromFile(pageFile(page));
  template.appName = APP_NAME;
  template.carParam = (e && e.parameter && e.parameter.car) || '';
  const out = template.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return out;
}

function pageFile(page) {
  const map = {
    'login': 'Login',
    'employee': 'Employee_Dashboard',
    'admin': 'Admin_Dashboard',
    'form': 'CAR_Form',
    'company': 'Company_Details',
    'settings': 'Settings',
    'terms': 'Terms',
    'profile': 'Profile',
    'announcements': 'Announcements',
    'users': 'Users',
    'overview': 'Overview'
  };
  return map[page] || 'Login';
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

// ---------- SPREADSHEET HELPERS ----------
function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('Missing sheet tab: ' + name + '. Run setupSpreadsheet() once from the Apps Script editor.');
  return s;
}

function setupSpreadsheet() {
  const book = ss_();
  ensureSheetWithHeaders_(book, SHEETS.USERS, USER_COLS);
  ensureSheetWithHeaders_(book, SHEETS.CAR, CAR_COLS);
  syncHeaderRow_(sheet_(SHEETS.CAR), CAR_COLS);
  ensureSheetWithHeaders_(book, SHEETS.WHY_WHY, WHY_COLS);
  ensureSheetWithHeaders_(book, SHEETS.NOTIFICATIONS, NOTIF_COLS);
  ensureSheetWithHeaders_(book, SHEETS.COMPANY, COMPANY_COLS);
  ensureSheetWithHeaders_(book, SHEETS.SETTINGS, SETTINGS_COLS);
  ensureSheetWithHeaders_(book, SHEETS.LOG, ['Timestamp','UserID','Action','Details']);
  ensureSheetWithHeaders_(book, SHEETS.COMMENTS, COMMENT_COLS);
  ensureSheetWithHeaders_(book, SHEETS.ANNOUNCEMENTS, ANNOUNCEMENT_COLS);
  ensureSheetWithHeaders_(book, SHEETS.ANNOUNCEMENT_HISTORY, ANNOUNCEMENT_HISTORY_COLS);
  ensureSheetWithHeaders_(book, SHEETS.ANNOUNCEMENT_COMMENTS, ANNOUNCEMENT_COMMENT_COLS);
  seedDepartments_(book);

  const company = sheet_(SHEETS.COMPANY);
  if (company.getLastRow() < 2) {
    setKeyValue_(company, 'CompanyName', 'Fernandez College of Arts And Technology, Inc. (FCAT)');
    setKeyValue_(company, 'Address', '3006 Baliwag City, Bulacan');
    setKeyValue_(company, 'Standard', 'ISO 9001:2015');
    setKeyValue_(company, 'LogoUrl', 'https://drive.google.com/thumbnail?id=1AjBH5OjVr9uuo3Wlb7VywM7eAkXD7zlR&sz=w1200');
    setKeyValue_(company, 'PrimaryColor', '#7A1E2B');   // maroon
    setKeyValue_(company, 'AccentGreen', '#3A7D44');    // green
    setKeyValue_(company, 'AccentGold', '#D4A017');     // golden yellow
  }

  const users = sheet_(SHEETS.USERS);
  if (users.getLastRow() < 2) {
    appendRow_(users, USER_COLS, {
      UserID: newId_('U'),
      Name: 'System Administrator',
      Email: 'admin@fcat.com.ph',
      PasswordHash: hashPassword_('FCATsince1993!'),
      Role: 'Admin',
      Department: 'QA / Management Representative',
      Position: 'Administrator',
      Status: 'Active',
      CreatedAt: nowIso_()
    });
  }

  hardenSheetFormats();
  Logger.log('Setup complete.');
}

// Forces every sheet's data cells to plain-text ('@') number format. Free-text
// fields (Details, Correction, AdminNote, etc.) are written straight from
// form input into Sheets cells - if a user's text happens to start with =, +,
// - or @, Sheets can otherwise interpret it as a formula the moment anyone
// opens the raw spreadsheet (classic "CSV/formula injection"). Text format
// makes every cell literal, with no visible side effects, and is safe to
// re-run at any time - call this again after setupSpreadsheet if you ever
// need to re-apply it (e.g. after manually clearing a sheet's formatting).
function hardenSheetFormats() {
  const book = ss_();
  const MAX_ROWS = 5000;
  Object.keys(SHEETS).forEach(key => {
    const s = book.getSheetByName(SHEETS[key]);
    if (!s) return;
    const lastCol = Math.max(s.getLastColumn(), 1);
    s.getRange(2, 1, MAX_ROWS, lastCol).setNumberFormat('@');
  });
  Logger.log('Sheet formats hardened (all cells forced to plain text).');
}

// When new columns are appended to a schema (CAR_COLS, etc.) for a sheet
// that already has data, ensureSheetWithHeaders_ won't touch the header row
// again (it only writes headers once, on creation). Reads/writes still work
// correctly either way since they're keyed by array position, not by the
// literal header text - but this keeps row 1 honest for anyone opening the
// raw spreadsheet, by appending just the missing header names in place.
function syncHeaderRow_(sheet, cols) {
  const lastCol = sheet.getLastColumn();
  const current = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (current.length < cols.length) {
    const missing = cols.slice(current.length);
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold');
  }
}

function ensureSheetWithHeaders_(book, name, headers) {
  let s = book.getSheetByName(name);
  if (!s) s = book.insertSheet(name);
  if (s.getLastRow() === 0) {
    s.appendRow(headers);
    s.setFrozenRows(1);
    s.getRange(1,1,1,headers.length).setFontWeight('bold');
  }
  return s;
}

// Seeds the Departments sheet with the default list only if it's still
// empty (just the header row) - safe to call every time setupSpreadsheet()
// runs, and never overwrites departments an Auditor has since added/edited
// directly in the sheet.
function seedDepartments_(book) {
  const s = ensureSheetWithHeaders_(book, SHEETS.DEPARTMENTS, DEPARTMENT_COLS);
  if (s.getLastRow() <= 1) {
    DEFAULT_DEPARTMENTS.forEach(name => s.appendRow([name]));
  }
}

function setKeyValue_(sheet, key, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) { sheet.getRange(i+1, 2).setValue(value); return; }
  }
  sheet.appendRow([key, value]);
}

function getKeyValueMap_(sheet) {
  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) map[data[i][0]] = data[i][1];
  return map;
}

function sheetToObjects_(sheet, cols) {
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row.every(c => c === '')) continue;
    const obj = { _row: i + 1 };
    cols.forEach((c, idx) => obj[c] = normalizeCellValue_(row[idx]));
    out.push(obj);
  }
  return out;
}

function normalizeCellValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    const h = value.getHours(), m = value.getMinutes(), s = value.getSeconds();
    if (h === 0 && m === 0 && s === 0) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return value.toISOString();
  }
  return value;
}

function appendRow_(sheet, cols, obj) {
  const row = cols.map(c => (obj[c] !== undefined ? obj[c] : ''));
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function updateRowByField_(sheet, cols, keyField, keyValue, updates) {
  const data = sheet.getDataRange().getValues();
  const keyIdx = cols.indexOf(keyField);
  for (let i = 1; i < data.length; i++) {
    if (data[i][keyIdx] === keyValue) {
      // Apply all changed fields to a copy of the existing row in memory, then
      // write the whole row back with a single setValues() call. The previous
      // version called sheet.getRange(...).setValue() once PER changed field -
      // for a CAR update that can touch 20+ columns, that's 20+ sequential
      // round trips to the Sheets API instead of one.
      const row = data[i].slice();
      Object.keys(updates).forEach(field => {
        const idx = cols.indexOf(field);
        if (idx > -1) row[idx] = updates[field];
      });
      sheet.getRange(i + 1, 1, 1, cols.length).setValues([row]);
      return true;
    }
  }
  return false;
}

function newId_(prefix) {
  return prefix + '-' + Utilities.getUuid().split('-')[0].toUpperCase();
}

function nowIso_() {
  return new Date().toISOString();
}

function logAction_(userId, action, details) {
  try {
    sheet_(SHEETS.LOG).appendRow([nowIso_(), userId, action, details || '']);
  } catch (e) { /* non-fatal */ }
}

// ---------- 5 WHYS SHEET HANDLERS ----------
function saveWhyWhyRecords_(carNo, rawFactors) {
  if (!carNo) return;
  let data = {};
  if (typeof rawFactors === 'string') {
    try { data = JSON.parse(rawFactors); } catch(e) { data = {}; }
  } else if (rawFactors && typeof rawFactors === 'object') {
    data = rawFactors;
  }

  const sheet = sheet_(SHEETS.WHY_WHY);
  const rows = sheet.getDataRange().getValues();
  
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === carNo) {
      sheet.deleteRow(i + 1);
    }
  }

  const factors = ['Man', 'Method', 'Machine', 'Material', 'Environment'];
  const now = nowIso_();
  
  factors.forEach(f => {
    const whys = Array.isArray(data[f]) ? data[f] : ['', '', '', '', ''];
    sheet.appendRow([
      carNo,
      f,
      whys[0] || '',
      whys[1] || '',
      whys[2] || '',
      whys[3] || '',
      whys[4] || '',
      now
    ]);
  });
}

function getWhyWhyRecord_(carNo) {
  const sheet = sheet_(SHEETS.WHY_WHY);
  const data = sheet.getDataRange().getValues();
  const result = {
    'Man': ['', '', '', '', ''],
    'Method': ['', '', '', '', ''],
    'Machine': ['', '', '', '', ''],
    'Material': ['', '', '', '', ''],
    'Environment': ['', '', '', '', '']
  };

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === carNo) {
      const factor = data[i][1];
      if (result[factor]) {
        result[factor] = [
          data[i][2] || '',
          data[i][3] || '',
          data[i][4] || '',
          data[i][5] || '',
          data[i][6] || ''
        ];
      }
    }
  }
  return result;
}

// ---------- AUTH ----------
function hashPassword_(pw) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw, Utilities.Charset.UTF_8);
  return digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function login(email, password) {
  email = String(email || '').trim().toLowerCase();
  const users = sheetToObjects_(sheet_(SHEETS.USERS), USER_COLS);
  const user = users.find(u => String(u.Email).trim().toLowerCase() === email);
  if (!user) return { ok: false, error: 'No account found with that email.' };
  if (user.Status === 'Locked') return { ok: false, error: 'This account has been locked. Contact your administrator.' };
  if (user.PasswordHash !== hashPassword_(password)) return { ok: false, error: 'Incorrect password.' };

  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put('session_' + token, JSON.stringify({
    userId: user.UserID, name: user.Name, email: user.Email, role: user.Role,
    department: user.Department, position: user.Position
  }), SESSION_HOURS * 3600);

  logAction_(user.UserID, 'LOGIN', '');
  return {
    ok: true, token,
    user: { userId: user.UserID, name: user.Name, email: user.Email, role: user.Role,
             department: user.Department, position: user.Position }
  };
}

function logout(token) {
  CacheService.getScriptCache().remove('session_' + token);
  return { ok: true };
}

function validateSession_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('session_' + token);
  return raw ? JSON.parse(raw) : null;
}

function requireAuth_(token) {
  const user = validateSession_(token);
  if (!user) throw new Error('SESSION_EXPIRED');
  return user;
}

function requireAdmin_(token) {
  const user = requireAuth_(token);
  if (user.role !== 'Admin') throw new Error('NOT_AUTHORIZED');
  return user;
}

function getMyProfile(token) {
  return requireAuth_(token);
}

function createUser(token, data) {
  const admin = requireAdmin_(token);
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim();
  const departments = Array.isArray(data.departments) ? data.departments.map(d => String(d).trim()).filter(Boolean) : [];
  if (!name || !email || !data.password || departments.length === 0) {
    return { ok: false, error: 'Name, email, password and at least one department are required.' };
  }
  const users = sheet_(SHEETS.USERS);
  const existing = sheetToObjects_(users, USER_COLS);
  if (existing.some(u => String(u.Email).toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: 'A user with that email already exists.' };
  }
  const userId = newId_('U');
  const role = data.role === 'Admin' ? 'Admin' : 'Employee';
  const departmentStr = departments.join(', ');
  appendRow_(users, USER_COLS, {
    UserID: userId,
    Name: name,
    Email: email,
    PasswordHash: hashPassword_(data.password),
    Role: role,
    Department: departmentStr,
    Position: String(data.position || '').trim(),
    Status: 'Active',
    CreatedAt: nowIso_()
  });
  logAction_(admin.userId, 'CREATE_USER', email);
  return { ok: true, user: { userId: userId, name: name, email: email, role: role,
             department: departmentStr, position: String(data.position || '').trim(), status: 'Active' } };
}

function updateUser(token, userId, data) {
  const admin = requireAdmin_(token);
  const users = sheet_(SHEETS.USERS);
  const all = sheetToObjects_(users, USER_COLS);
  const existing = all.find(u => u.UserID === userId);
  if (!existing) return { ok: false, error: 'User not found.' };

  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim();
  const departments = Array.isArray(data.departments) ? data.departments.map(d => String(d).trim()).filter(Boolean) : [];
  if (!name || !email || departments.length === 0) {
    return { ok: false, error: 'Name, email and at least one department are required.' };
  }
  const emailLower = email.toLowerCase();
  if (all.some(u => u.UserID !== userId && String(u.Email).toLowerCase() === emailLower)) {
    return { ok: false, error: 'Another user already has that email.' };
  }

  // An Auditor demoting their own account away from Admin would immediately
  // lose access to User Management this session - same class of self-lockout
  // risk as the lock button, so it's blocked the same way.
  let role = data.role === 'Admin' ? 'Admin' : 'Employee';
  if (userId === admin.userId && existing.Role === 'Admin' && role !== 'Admin') {
    return { ok: false, error: 'You cannot remove Auditor Account access from your own account.' };
  }

  const departmentStr = departments.join(', ');
  updateRowByField_(users, USER_COLS, 'UserID', userId, {
    Name: name,
    Email: email,
    Role: role,
    Department: departmentStr,
    Position: String(data.position || '').trim()
  });
  logAction_(admin.userId, 'UPDATE_USER', userId);
  return { ok: true, user: { userId: userId, name: name, email: email, role: role,
             department: departmentStr, position: String(data.position || '').trim(), status: existing.Status } };
}

function listUsers(token) {
  requireAdmin_(token);
  return sheetToObjects_(sheet_(SHEETS.USERS), USER_COLS)
    .map(u => ({ userId: u.UserID, name: u.Name, email: u.Email, role: u.Role,
                 department: u.Department, position: u.Position, status: u.Status }));
}

function setUserLock(token, userId, lock) {
  const admin = requireAdmin_(token);
  if (lock && userId === admin.userId) {
    return { ok: false, error: 'You cannot lock your own account.' };
  }
  const ok = updateRowByField_(sheet_(SHEETS.USERS), USER_COLS, 'UserID', userId, { Status: lock ? 'Locked' : 'Active' });
  logAction_(admin.userId, lock ? 'LOCK_USER' : 'UNLOCK_USER', userId);
  return { ok };
}

function changeMyPassword(token, oldPassword, newPassword) {
  const user = requireAuth_(token);
  const users = sheetToObjects_(sheet_(SHEETS.USERS), USER_COLS);
  const record = users.find(u => u.UserID === user.userId);
  if (!record || record.PasswordHash !== hashPassword_(oldPassword)) {
    return { ok: false, error: 'Current password is incorrect.' };
  }
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters.' };
  }
  updateRowByField_(sheet_(SHEETS.USERS), USER_COLS, 'UserID', user.userId, { PasswordHash: hashPassword_(newPassword) });
  logAction_(user.userId, 'CHANGE_PASSWORD', '');
  return { ok: true };
}

// ---------- EVIDENCE UPLOAD (Google Drive) ----------
function getEvidenceFolder_() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('EVIDENCE_FOLDER_ID');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (e) { /* fall through */ }
  }
  const it = DriveApp.getFoldersByName(EVIDENCE_FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(EVIDENCE_FOLDER_NAME);
  props.setProperty('EVIDENCE_FOLDER_ID', folder.getId());
  return folder;
}

function uploadEvidence(token, carNo, base64Data, filename, mimeType) {
  const user = requireAuth_(token);
  if (!base64Data || !filename) return { ok: false, error: 'No file provided.' };
  const MAX_BYTES = 15 * 1024 * 1024;
  const bytes = Utilities.base64Decode(base64Data);
  if (bytes.length > MAX_BYTES) return { ok: false, error: 'File is too large (max 15MB).' };

  const folder = getEvidenceFolder_();
  let sub = folder;
  const subIt = folder.getFoldersByName(user.department || 'General');
  sub = subIt.hasNext() ? subIt.next() : folder.createFolder(user.department || 'General');

  const blob = Utilities.newBlob(bytes, mimeType, (carNo || 'EVIDENCE') + '_' + filename);
  const file = sub.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  logAction_(user.userId, 'UPLOAD_EVIDENCE', file.getUrl());
  return { ok: true, url: file.getUrl(), name: file.getName() };
}

// ---------- REFERENCE TEMPLATE HANDLERS ----------
function getFormTemplateUrl(token) {
  requireAuth_(token);
  const settings = getKeyValueMap_(sheet_(SHEETS.SETTINGS));
  return { url: settings.FO_RI_05_TEMPLATE_URL || '' };
}

function uploadFormTemplate(token, base64Data, filename, mimeType) {
  const admin = requireAdmin_(token);
  if (!base64Data || !filename) return { ok: false, error: 'No file provided.' };

  const folder = getEvidenceFolder_();
  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, mimeType, 'FO-RI-05_Master_Template_' + filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const sheet = sheet_(SHEETS.SETTINGS);
  setKeyValue_(sheet, 'FO_RI_05_TEMPLATE_URL', file.getUrl());
  logAction_(admin.userId, 'UPLOAD_FORM_TEMPLATE', file.getUrl());

  return { ok: true, url: file.getUrl() };
}

// Evidence links should only ever be Drive URLs we generated ourselves via
// uploadEvidence(), but the payload that reaches here is just client-supplied
// JSON - a direct/crafted call could set these to anything. Validate before
// persisting so nothing else (e.g. a javascript: URI) ever ends up stored.
function isValidDriveUrl_(url) {
  return typeof url === 'string' && /^https:\/\/drive\.google\.com\//.test(url.trim());
}

function sanitizeCarPayload_(payload) {
  if (payload.EvidenceLink !== undefined && !isValidDriveUrl_(payload.EvidenceLink)) {
    delete payload.EvidenceLink;
  }
  if (payload.FormEvidenceLink !== undefined && !isValidDriveUrl_(payload.FormEvidenceLink)) {
    delete payload.FormEvidenceLink;
  }
  if (payload.EvidenceLinks !== undefined) {
    const links = parseJsonArray_(payload.EvidenceLinks).filter(u => isValidDriveUrl_(u));
    payload.EvidenceLinks = JSON.stringify(links);
  }
  return payload;
}

// ---------- CAR / NC / OFI RECORDS ----------
// Section 1 (Finding Details) is always required - set once by the Auditor
// when raising a finding, and immutable afterward.
const REQUIRED_FIELDS = ['Type','Department','DateIssued','Source'];

// Sections 2-7 (Correction, Root Cause, Corrective Action, Evidence, Sign-off,
// Form Evidence) are the Process Owner's responsibility - required once they
// save, but not required when the Auditor first raises the finding, since
// none of it exists yet at that point. Section 8 (Auditor follow-up) is
// never required - it's the Auditor's optional check-in after the fact.
const PROCESS_OWNER_REQUIRED_FIELDS = ['ValidationMethod','ValidationDate','ValidationResult','TrueRootCause',
  'PreparedBy','PreparedDate','ApprovedBy','ApprovedDate','SignOffConformedBy','SignOffConformedDate'];

// These hold a JSON array of repeatable entries (e.g. multiple corrections
// over time) - required means "at least one entry", not "non-empty string".
const PROCESS_OWNER_REQUIRED_ENTRY_FIELDS = ['CorrectionEntries','PossibleRootCauseEntries','CorrectiveActionEntries'];

// Safely parses a JSON array field - never throws, always returns an array.
function parseJsonArray_(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function validateCarPayload_(payload, requireProcessOwnerFields) {
  const missing = REQUIRED_FIELDS.filter(f => !payload[f] || String(payload[f]).trim() === '');
  // Details is only required for Nonconformities - Opportunities for Improvement don't need it.
  const isOFI = payload.Type === 'Opportunity for Improvement (OFI)';
  if (!isOFI && (!payload.Details || String(payload.Details).trim() === '')) {
    missing.push('Details');
  }
  if (requireProcessOwnerFields) {
    PROCESS_OWNER_REQUIRED_FIELDS.forEach(f => {
      if (!payload[f] || String(payload[f]).trim() === '') missing.push(f);
    });
    PROCESS_OWNER_REQUIRED_ENTRY_FIELDS.forEach(f => {
      if (parseJsonArray_(payload[f]).length === 0) missing.push(f);
    });
    const hasGeneralEvidence = parseJsonArray_(payload.EvidenceLinks).length > 0
      || (payload.EvidenceLink && String(payload.EvidenceLink).trim() !== '');
    if (!hasGeneralEvidence && (!payload.FormEvidenceLink || String(payload.FormEvidenceLink).trim() === '')) {
      missing.push('Evidence (attach general or form evidence)');
    }
  }
  return missing;
}

function submitCAR(token, payload) {
  const user = requireAdmin_(token); // Only Auditors can raise a new finding.
  sanitizeCarPayload_(payload);
  const missing = validateCarPayload_(payload, false);
  if (missing.length > 0) {
    return { ok: false, error: 'Cannot save: missing required field(s): ' + missing.join(', ') };
  }
  const sheet = sheet_(SHEETS.CAR);

  // The Auditor may supply their own CAR No. (e.g. to follow an internal
  // numbering convention) - validated for a safe character set and checked
  // for uniqueness, since it's the key every comment, notification, evidence
  // link, and history entry hangs off of. Left blank, one is generated.
  const customCarNo = String(payload.CARNo || '').trim();
  delete payload.CARNo;
  let carNo;
  if (customCarNo) {
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(customCarNo)) {
      return { ok: false, error: 'CAR No. can only contain letters, numbers, periods, hyphens, and underscores (max 40 characters).' };
    }
    const exists = sheetToObjects_(sheet, CAR_COLS).some(r => r.CARNo === customCarNo);
    if (exists) {
      return { ok: false, error: 'CAR No. "' + customCarNo + '" is already in use. Please choose a different number.' };
    }
    carNo = customCarNo;
  } else {
    carNo = newId_('CAR');
  }

  const whyFactors = payload.RootCauseFactors || '';
  delete payload.RootCauseFactors;

  const assignee = resolveAssignee_(payload.EmployeeID);
  delete payload.EmployeeID;
  delete payload.EmployeeName; // never trust a client-supplied display name
  if (assignee.ok === false) {
    return { ok: false, error: assignee.error };
  }

  const record = Object.assign({}, payload, {
    CARNo: carNo,
    Status: 'Open',
    EmployeeID: assignee.EmployeeID,
    EmployeeName: assignee.EmployeeName,
    RaisedBy: user.name,
    AdminFlag: '',
    AdminNote: '',
    CreatedAt: nowIso_(),
    UpdatedAt: nowIso_()
  });
  appendRow_(sheet, CAR_COLS, record);

  saveWhyWhyRecords_(carNo, whyFactors);

  const raiseMessage = 'A new ' + (record.Type || 'finding') + ' (' + carNo + ') has been raised for your department: ' + (record.Details || '').slice(0, 120);
  if (record.EmployeeID) {
    createNotification_(user.userId, record.EmployeeID, raiseMessage, carNo);
  } else {
    notifyDepartment_(user.userId, record.Department, raiseMessage, carNo);
  }

  logAction_(user.userId, 'SUBMIT_CAR', carNo);
  return { ok: true, carNo };
}

// Finding-Details fields are set once by the Auditor when a record is raised -
// Process Owners can act on the record (correction, root cause, corrective
// action, sign-off) but must never be able to change what was found or which
// department it was routed to. Enforced server-side, not just by disabling
// the fields in the form, since the client can't be trusted to self-police.
const AUDITOR_ONLY_FIELDS = ['Type', 'Source', 'DateIssued', 'ISOClause', 'Details', 'CompanyDocument', 'Department', 'RaisedBy'];

function updateCAR(token, carNo, payload) {
  const user = requireAuth_(token);
  const sheet = sheet_(SHEETS.CAR);
  const all = sheetToObjects_(sheet, CAR_COLS);
  const rec = all.find(r => r.CARNo === carNo);
  if (!rec) return { ok: false, error: 'Record not found.' };

  const isAdmin = user.role === 'Admin';
  // A finding is routed to a whole department - any active Process Owner in
  // that department may act on it, not just whoever first opened it.
  if (!isAdmin && !userHasDepartment_(user.department, rec.Department)) {
    return { ok: false, error: 'Not authorized to edit this record.' };
  }
  // The "closed records are locked" rule was previously only enforced by
  // hiding the Edit button client-side - enforce it here too, since the
  // client can't be trusted to gate write access on its own. Admins can
  // still edit closed records; Process Owners can only edit if it's still
  // Open or an Auditor has flagged it for attention (meant to allow a fix).
  if (!isAdmin && rec.Status === 'Closed' && rec.AdminFlag !== 'Needs Attention') {
    return { ok: false, error: 'This record is closed and can no longer be edited.' };
  }

  const whyFactors = payload.RootCauseFactors;
  delete payload.RootCauseFactors;
  delete payload.CARNo; // never rename an existing record - everything else references it by this value
  sanitizeCarPayload_(payload);
  if (!isAdmin) {
    AUDITOR_ONLY_FIELDS.forEach(f => delete payload[f]);
  }

  // Received By: only an Auditor may reassign it, and only to a real active
  // Process Owner - the display name is always re-derived server-side, never
  // trusted from the client.
  delete payload.EmployeeName;
  let reassignedTo = null;
  if (isAdmin && payload.EmployeeID !== undefined) {
    const assignee = resolveAssignee_(payload.EmployeeID);
    if (assignee.ok === false) return { ok: false, error: assignee.error };
    payload.EmployeeID = assignee.EmployeeID;
    payload.EmployeeName = assignee.EmployeeName;
    if (assignee.EmployeeID && assignee.EmployeeID !== rec.EmployeeID) reassignedTo = assignee;
  } else {
    delete payload.EmployeeID;
  }

  const merged = Object.assign({}, rec, payload);
  const missing = validateCarPayload_(merged, !isAdmin);
  if (missing.length > 0) {
    return { ok: false, error: 'Cannot save: missing required field(s): ' + missing.join(', ') };
  }
  const updates = Object.assign({}, payload);
  updates.UpdatedAt = nowIso_();
  if (!isAdmin && rec.AdminFlag === 'Needs Attention') {
    updates.AdminFlag = '';
    updates.AdminNote = '';
  }
  // First Process Owner to act on an unassigned department finding claims it.
  if (!isAdmin && (!rec.EmployeeID || rec.EmployeeID === '')) {
    updates.EmployeeID = user.userId;
    updates.EmployeeName = user.name;
  }
  updateRowByField_(sheet, CAR_COLS, 'CARNo', carNo, updates);

  if (whyFactors !== undefined) {
    saveWhyWhyRecords_(carNo, whyFactors);
  }
  if (reassignedTo) {
    createNotification_(user.userId, reassignedTo.EmployeeID,
      'You have been assigned to record ' + carNo + '.', carNo);
  }

  logAction_(user.userId, 'UPDATE_CAR', carNo);
  return { ok: true };
}

function getCAR(token, carNo) {
  const user = requireAuth_(token);
  const rec = sheetToObjects_(sheet_(SHEETS.CAR), CAR_COLS).find(r => r.CARNo === carNo);
  if (!rec) return null;
  if (user.role !== 'Admin' && !userHasDepartment_(user.department, rec.Department)) {
    throw new Error('NOT_AUTHORIZED');
  }

  rec.RootCauseFactors = JSON.stringify(getWhyWhyRecord_(carNo));
  return rec;
}

function getMyCARs(token) {
  const user = requireAuth_(token);
  if (user.role === 'Admin') return sheetToObjects_(sheet_(SHEETS.CAR), CAR_COLS);
  return sheetToObjects_(sheet_(SHEETS.CAR), CAR_COLS).filter(r => userHasDepartment_(user.department, r.Department));
}

function getEmployeeCARs(token) {
  const user = requireAuth_(token);
  const sheet = sheet_(SHEETS.CAR);
  const rows = sheetToObjects_(sheet, CAR_COLS);

  if (user.role === 'Admin') {
    return rows;
  }

  return rows.filter(r => 
    String(r.EmployeeID) === String(user.userId) ||
    String(r.PreparedBy || '').toLowerCase() === String(user.name || '').toLowerCase()
  );
}

function getAllCARs(token) {
  requireAdmin_(token);
  return sheetToObjects_(sheet_(SHEETS.CAR), CAR_COLS);
}

function flagRecord(token, carNo, note) {
  const admin = requireAdmin_(token);
  const sheet = sheet_(SHEETS.CAR);
  const ok = updateRowByField_(sheet, CAR_COLS, 'CARNo', carNo, { AdminFlag: 'Needs Attention', AdminNote: note, UpdatedAt: nowIso_() });
  if (!ok) return { ok: false, error: 'Record not found.' };

  const rec = sheetToObjects_(sheet, CAR_COLS).find(r => r.CARNo === carNo);
  const message = 'Your record ' + carNo + ' needs attention: ' + note;
  if (rec.EmployeeID) {
    createNotification_(admin.userId, rec.EmployeeID, message, carNo);
  } else {
    notifyDepartment_(admin.userId, rec.Department, message, carNo);
  }
  return { ok: true };
}

function closeRecord(token, carNo) {
  const admin = requireAdmin_(token);
  const ok = updateRowByField_(sheet_(SHEETS.CAR), CAR_COLS, 'CARNo', carNo, { Status: 'Closed', UpdatedAt: nowIso_() });
  logAction_(admin.userId, 'CLOSE_CAR', carNo);
  return { ok };
}

function reopenRecord(token, carNo) {
  const admin = requireAdmin_(token);
  const ok = updateRowByField_(sheet_(SHEETS.CAR), CAR_COLS, 'CARNo', carNo, { Status: 'Open', UpdatedAt: nowIso_() });
  if (!ok) return { ok: false, error: 'Record not found.' };
  logAction_(admin.userId, 'REOPEN_CAR', carNo);
  return { ok: true };
}

function setDeadline(token, carNo, deadline) {
  const admin = requireAdmin_(token);
  const sheet = sheet_(SHEETS.CAR);
  const ok = updateRowByField_(sheet, CAR_COLS, 'CARNo', carNo, { AdminDeadline: deadline || '', UpdatedAt: nowIso_() });
  if (!ok) return { ok: false, error: 'Record not found.' };

  const rec = sheetToObjects_(sheet, CAR_COLS).find(r => r.CARNo === carNo);
  if (deadline) {
    const message = 'A deadline of ' + deadline + ' has been set for your record ' + carNo + '.';
    if (rec.EmployeeID) {
      createNotification_(admin.userId, rec.EmployeeID, message, carNo);
    } else {
      notifyDepartment_(admin.userId, rec.Department, message, carNo);
    }
  }
  logAction_(admin.userId, 'SET_DEADLINE', carNo + ' -> ' + deadline);
  return { ok: true };
}

// ---------- AUDITOR FOLLOW-UP HISTORY (Section 8) ----------
// Each follow-up is retained permanently - this appends to whatever history
// already exists on the record rather than overwriting it, so re-verifying
// a record multiple times over its life builds a real audit trail instead
// of losing the previous check-in every time a new one is added.
function addFollowUp(token, carNo, entry) {
  const admin = requireAdmin_(token);
  const sheet = sheet_(SHEETS.CAR);
  const rec = sheetToObjects_(sheet, CAR_COLS).find(r => r.CARNo === carNo);
  if (!rec) return { ok: false, error: 'Record not found.' };

  const followUpDate = String((entry && entry.FollowUpDate) || '').trim();
  const resultOfVerification = String((entry && entry.ResultOfVerification) || '').trim();
  const verifiedBy = String((entry && entry.VerifiedBy) || '').trim();
  const conformedBy = String((entry && entry.ConformedBy) || '').trim();
  if (!followUpDate || !resultOfVerification || !verifiedBy) {
    return { ok: false, error: 'Follow-up date, result of verification, and verified by are required.' };
  }

  const entries = parseJsonArray_(rec.FollowUpEntries);
  const newEntry = {
    FollowUpDate: followUpDate,
    ResultOfVerification: resultOfVerification,
    VerifiedBy: verifiedBy,
    ConformedBy: conformedBy,
    AddedBy: admin.name,
    CreatedAt: nowIso_()
  };
  entries.push(newEntry);
  updateRowByField_(sheet, CAR_COLS, 'CARNo', carNo, { FollowUpEntries: JSON.stringify(entries), UpdatedAt: nowIso_() });
  logAction_(admin.userId, 'ADD_FOLLOWUP', carNo);
  return { ok: true, entries: entries };
}
function addComment(token, carNo, message) {
  const admin = requireAdmin_(token);
  const msg = String(message || '').trim();
  if (!msg) return { ok: false, error: 'Comment cannot be empty.' };

  const carSheet = sheet_(SHEETS.CAR);
  const rec = sheetToObjects_(carSheet, CAR_COLS).find(r => r.CARNo === carNo);
  if (!rec) return { ok: false, error: 'Record not found.' };

  const comment = {
    CommentID: newId_('CM'),
    CARNo: carNo,
    UserID: admin.userId,
    UserName: admin.name,
    Role: admin.role,
    Message: msg,
    CreatedAt: nowIso_()
  };
  appendRow_(sheet_(SHEETS.COMMENTS), COMMENT_COLS, comment);
  const notifyMsg = 'New comment on your record ' + carNo + ': ' + msg;
  if (rec.EmployeeID) {
    createNotification_(admin.userId, rec.EmployeeID, notifyMsg, carNo);
  } else {
    notifyDepartment_(admin.userId, rec.Department, notifyMsg, carNo);
  }
  logAction_(admin.userId, 'ADD_COMMENT', carNo);
  return { ok: true, comment: comment };
}

function getComments(token, carNo) {
  const user = requireAuth_(token);
  const carSheet = sheet_(SHEETS.CAR);
  const rec = sheetToObjects_(carSheet, CAR_COLS).find(r => r.CARNo === carNo);
  if (!rec) return [];
  if (user.role !== 'Admin' && !userHasDepartment_(user.department, rec.Department)) {
    throw new Error('NOT_AUTHORIZED');
  }
  return sheetToObjects_(sheet_(SHEETS.COMMENTS), COMMENT_COLS)
    .filter(c => c.CARNo === carNo)
    .sort((a, b) => new Date(a.CreatedAt) - new Date(b.CreatedAt));
}

// ---------- EXPORT (filled FO-RI-05 Corrective Action Report PDF) ----------
function getExportsFolder_() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('EXPORTS_FOLDER_ID');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (e) { /* fall through */ }
  }
  const name = 'FCAT ISO Audit - Exported Reports';
  const it = DriveApp.getFoldersByName(name);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty('EXPORTS_FOLDER_ID', folder.getId());
  return folder;
}

function exportCarDocument(token, carNo) {
  const user = requireAuth_(token);
  const rec = getCAR(token, carNo);
  if (!rec) return { ok: false, error: 'Record not found.' };

  const company = getKeyValueMap_(sheet_(SHEETS.COMPANY));
  const pdfBlob = buildCarPdf_(rec, company);

  const folder = getExportsFolder_();
  const fileName = rec.CARNo + ' - FO-RI-05 Corrective Action Report.pdf';
  const file = folder.createFile(pdfBlob).setName(fileName);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  logAction_(user.userId, 'EXPORT_CAR', carNo);
  return { ok: true, url: file.getUrl(), name: fileName };
}

const FO_RI_05_META = {
  docCode: 'FO-RI-05',
  revNo: '00',
  processGroup: 'Review & Improvement',
  effectivityDate: '05/19/2025',
  totalPages: 3
};

// Same image used as the official CAR header on the form and the dashboard's
// record view, so the exported PDF matches both exactly rather than building
// its own letterhead from scratch.
const CAR_HEADER_IMAGE_URL = 'https://drive.google.com/thumbnail?id=18WDJ733w71STOwp88zv4bI6YYpYvY-00&sz=w1200';

// Generic cached-image fetch (same caching pattern already used for the
// company logo) - reusable for any Drive-hosted image embedded in a PDF.
function fetchCachedImage_(url) {
  if (!url) return null;
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'img_' + Utilities.base64Encode(url).slice(0, 200);
    const cached = cache.get(cacheKey);
    if (cached) return Utilities.newBlob(Utilities.base64Decode(cached), 'image/png');
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      const blob = resp.getBlob();
      try { cache.put(cacheKey, Utilities.base64Encode(blob.getBytes()), 3600); } catch (e2) { /* too large for cache, skip */ }
      return blob;
    }
  } catch (e) { /* non-fatal */ }
  return null;
}

// A repeatable-entries field (JSON array) falls back to a legacy single-value
// object for records created before that field existed.
function parseEntriesWithLegacy_(raw, legacy) {
  let entries = parseJsonArray_(raw);
  if (entries.length === 0 && legacy && Object.keys(legacy).some(k => legacy[k])) {
    entries = [legacy];
  }
  return entries;
}
function parseListWithLegacy_(raw, legacyString) {
  let entries = parseJsonArray_(raw);
  if (entries.length === 0 && legacyString) entries = [legacyString];
  return entries;
}

function buildCarPdf_(rec, company) {
  const tempDoc = DocumentApp.create('TEMP_EXPORT_' + rec.CARNo + '_' + Utilities.getUuid());
  const tempId = tempDoc.getId();
  try {
    const body = tempDoc.getBody();
    body.setMarginTop(30).setMarginBottom(30).setMarginLeft(40).setMarginRight(40);

    const headerImage = fetchCachedImage_(CAR_HEADER_IMAGE_URL);
    const usableWidth = 612 - 80; // Letter width minus left/right margins, in points

    // PAGE 1 - the official header image, exactly as shown on the form and record view.
    if (headerImage) {
      const img = body.appendImage(headerImage);
      const ratio = img.getHeight() / img.getWidth();
      img.setWidth(usableWidth);
      img.setHeight(Math.round(usableWidth * ratio));
    } else {
      // Official image unreachable (network hiccup) - fall back to a built header
      // using the company's own configured logo, so export never just fails.
      carHeaderFallback_(body, company, FO_RI_05_META, 1);
    }
    body.appendParagraph('').setSpacingAfter(6);

    const status = rec.AdminFlag === 'Needs Attention' ? 'Needs Attention' : rec.Status;
    const statusLine = body.appendParagraph('CAR No.: ' + rec.CARNo + '     Status: ' + status);
    statusLine.editAsText().setBold(true).setFontSize(11).setForegroundColor('#4A1219');
    statusLine.setSpacingAfter(10);

    carBanner_(body, '1. Finding Details');
    carKV_(body, [['Raised By (Auditor)', rec.RaisedBy], ['Received By', rec.EmployeeName && rec.EmployeeName !== '(Unassigned)' ? rec.EmployeeName : 'Unclaimed']]);
    carCheckboxGroup_(body, 'Type of Finding', ['Nonconformity (NC)', 'Opportunity for Improvement (OFI)'], rec.Type);
    carCheckboxGroup_(body, 'Source of Incident or Nonconformity',
      ['Internal Audit', 'External Audit', 'Customer Complaint', 'Unmet KPIs', 'Nonconforming Output/Services', 'Others'],
      rec.Source);
    carKV_(body, [['Department / Process', rec.Department], ['Date Issued', rec.DateIssued]]);
    carKV_(body, [['ISO 9001 Clause', rec.ISOClause], ['Related Company Document', rec.CompanyDocument]]);
    carKV_(body, [['Details of Incident or Nonconformity', rec.Details]]);

    carBanner_(body, '2. Correction (Immediate Action Taken)');
    carEntryTable_(body,
      ['Correction', 'Date Completed', 'Person In-Charge', 'Result'],
      parseEntriesWithLegacy_(rec.CorrectionEntries, { Correction: rec.Correction, DateCompleted: rec.DateCompleted, PersonInCharge: rec.PersonInCharge, Result: rec.Result }),
      ['Correction', 'DateCompleted', 'PersonInCharge', 'Result']);

    // PAGE 2
    body.appendPageBreak();
    carContinuationHeader_(body, 2, FO_RI_05_META);

    carBanner_(body, '3. Root Cause Analysis');
    carSubheading_(body, 'Contributing Factors (5 Whys)');
    carWhyGrid_(body, rec.RootCauseFactors);
    carSubheading_(body, 'Possible Root Cause(s)');
    carBulletList_(body, parseListWithLegacy_(rec.PossibleRootCauseEntries, rec.PossibleRootCause));
    carKV_(body, [['Validation Method', rec.ValidationMethod], ['Validation Date', rec.ValidationDate]]);
    carKV_(body, [['Results of Validation', rec.ValidationResult]]);

    carBanner_(body, '4. Corrective Action Plan');
    carKV_(body, [['True Root Cause', rec.TrueRootCause]]);
    carEntryTable_(body,
      ['Corrective Action', 'Person In-Charge / Target Date', 'Date Implemented'],
      parseEntriesWithLegacy_(rec.CorrectiveActionEntries, { CorrectiveAction: rec.CorrectiveAction, ActionOwnerTargetDate: rec.ActionOwnerTargetDate, DateImplemented: rec.DateImplemented }),
      ['CorrectiveAction', 'ActionOwnerTargetDate', 'DateImplemented']);

    // PAGE 3
    body.appendPageBreak();
    carContinuationHeader_(body, 3, FO_RI_05_META);

    carBanner_(body, '5. General Evidence / Record');
    const evLinks = Array.from(new Set(
      parseJsonArray_(rec.EvidenceLinks).concat(rec.EvidenceLink ? [rec.EvidenceLink] : [])
    )).filter(u => isValidDriveUrl_(u));
    if (evLinks.length === 0) {
      carKV_(body, [['Evidence', 'None attached']]);
    } else {
      evLinks.forEach((url, i) => {
        const p = body.appendParagraph('Evidence file ' + (i + 1) + ': ' + url);
        p.editAsText().setFontSize(9).setLinkUrl(url);
        p.setSpacingAfter(3);
      });
      body.appendParagraph('').setSpacingAfter(6);
    }

    carBanner_(body, '6. Sign-off');
    carSignoff_(body, [
      ['Prepared by', '(Process Owner)', rec.PreparedBy, rec.PreparedDate],
      ['Approved by', '(Immediate Head)', rec.ApprovedBy, rec.ApprovedDate],
      ['Conformed by', '(Process Owner)', rec.SignOffConformedBy, rec.SignOffConformedDate]
    ]);

    carBanner_(body, '7. Auditor Follow-up / Verification History');
    let followUps = parseJsonArray_(rec.FollowUpEntries);
    if (followUps.length === 0 && rec.FollowUpDate) {
      followUps = [{ FollowUpDate: rec.FollowUpDate, ResultOfVerification: rec.ResultOfVerification, VerifiedBy: rec.VerifiedBy, ConformedBy: rec.ConformedBy }];
    }
    if (followUps.length === 0) {
      carKV_(body, [['Follow-up', 'None recorded yet.']]);
    } else {
      followUps.forEach((f, i) => {
        carKV_(body, [['Follow-up Date', f.FollowUpDate], ['Verified By', f.VerifiedBy]]);
        carKV_(body, [['Result of Verification', f.ResultOfVerification]]);
        if (f.ConformedBy) carKV_(body, [['Conformed By', f.ConformedBy]]);
        if (i < followUps.length - 1) body.appendHorizontalRule();
      });
    }

    if (rec.AdminFlag === 'Needs Attention' && rec.AdminNote) {
      carBanner_(body, 'Flagged by an Auditor');
      carKV_(body, [['Note', rec.AdminNote]]);
    }

    const footer = body.appendParagraph('Generated ' + nowIso_() + ' from ' + APP_NAME + ' \u2014 record ' + rec.CARNo);
    footer.editAsText().setFontSize(7).setForegroundColor('#AAAAAA').setItalic(true);
    footer.setSpacingBefore(10);

    tempDoc.saveAndClose();
    return DriveApp.getFileById(tempId).getAs('application/pdf').setName(rec.CARNo + '.pdf');
  } finally {
    try { DriveApp.getFileById(tempId).setTrashed(true); } catch (e) { /* non-fatal cleanup */ }
  }
}

// Lightweight text-only header for pages 2+ - the full official image is only
// shown once on page 1 (it has "Page 1 of 3" baked into the graphic itself,
// so repeating it verbatim on later pages would show the wrong page number).
function carContinuationHeader_(body, pageNum, meta) {
  const title = body.appendParagraph('CORRECTIVE ACTION REPORT');
  title.editAsText().setBold(true).setFontSize(11).setForegroundColor('#4A1219');
  title.setSpacingAfter(1);
  const metaLine = body.appendParagraph(
    'Document Code: ' + meta.docCode + '   |   Rev. No.: ' + meta.revNo +
    '   |   Page No.: Page ' + pageNum + ' of ' + meta.totalPages);
  metaLine.editAsText().setFontSize(9).setForegroundColor('#7A6F6F');
  metaLine.setSpacingAfter(10);
}

// Only used if the official header image can't be fetched (network hiccup) -
// builds a reasonable letterhead from the company's own configured logo so
// export never just fails outright.
function carHeaderFallback_(body, company, meta, pageNum) {
  const logoBlob = fetchCachedImage_(company.LogoUrl);
  const table = body.appendTable();
  const row = table.appendTableRow();
  const leftCell = row.appendTableCell('');
  const rightCell = row.appendTableCell('');
  leftCell.setWidth(64);

  if (logoBlob) {
    try {
      const img = leftCell.appendImage(logoBlob);
      img.setWidth(46);
      img.setHeight(46);
    } catch (e) {
      leftCell.editAsText().setText(company.CompanyName || '').setFontSize(8).setBold(true);
    }
  } else {
    leftCell.editAsText().setText(company.CompanyName || '').setFontSize(8).setBold(true);
  }

  rightCell.editAsText().setText('CORRECTIVE ACTION REPORT').setBold(true).setFontSize(13);
  const metaLine = rightCell.appendParagraph(
    'Document Code: ' + meta.docCode + '   |   Rev. No.: ' + meta.revNo +
    '   |   Page No.: Page ' + pageNum + ' of ' + meta.totalPages);
  metaLine.editAsText().setFontSize(9);
  const subLine = rightCell.appendParagraph(
    'Process Group/Department: ' + meta.processGroup + '   |   Effectivity Date: ' + meta.effectivityDate);
  subLine.editAsText().setFontSize(9).setForegroundColor('#7A6F6F');

  table.setBorderWidth(1);
  body.appendParagraph('').setSpacingAfter(2);
}

function carBanner_(body, text) {
  const table = body.appendTable([[text]]);
  table.setBorderWidth(0.75);
  const cell = table.getCell(0, 0);
  cell.setBackgroundColor('#6B1A25');
  cell.editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(10.5);
  body.appendParagraph('').setSpacingAfter(4);
}

function carSubheading_(body, text) {
  const p = body.appendParagraph(text);
  p.editAsText().setBold(true).setFontSize(10).setForegroundColor('#4A1219');
  p.setSpacingBefore(4).setSpacingAfter(2);
}

function carKV_(body, pairs) {
  const p = body.appendParagraph('');
  pairs.forEach((pair, i) => {
    if (i > 0) p.appendText('        ');
    p.appendText(pair[0] + ':  ').setBold(true);
    const v = pair[1];
    p.appendText(v === undefined || v === null || String(v).trim() === '' ? '\u2014' : String(v));
  });
  p.setSpacingAfter(6);
  return p;
}

function carCheckboxGroup_(body, title, options, selectedValue) {
  const heading = body.appendParagraph(title);
  heading.editAsText().setBold(true).setFontSize(10.5);
  heading.setSpacingBefore(6).setSpacingAfter(2);
  options.forEach(opt => {
    const checked = String(selectedValue || '').trim() === opt;
    const line = body.appendParagraph((checked ? '\u2611  ' : '\u2610  ') + opt);
    line.setSpacingAfter(1);
    if (checked) line.editAsText().setBold(true);
  });
  body.appendParagraph('').setSpacingAfter(4);
}

function carTable_(body, headers, rows) {
  const data = [headers].concat(rows.map(r => r.map(v =>
    (v === undefined || v === null || String(v).trim() === '') ? '\u2014' : String(v))));
  const table = body.appendTable(data);
  table.setBorderWidth(1);
  const headerRow = table.getRow(0);
  for (let c = 0; c < headerRow.getNumCells(); c++) {
    const cell = headerRow.getCell(c);
    cell.setBackgroundColor('#F6E9EB');
    cell.editAsText().setBold(true).setFontSize(9);
  }
  for (let r = 1; r < table.getNumRows(); r++) {
    const row = table.getRow(r);
    for (let c = 0; c < row.getNumCells(); c++) {
      row.getCell(c).editAsText().setFontSize(9);
    }
  }
  body.appendParagraph('').setSpacingAfter(6);
  return table;
}

// Renders a repeatable-entries field (e.g. multiple Corrections) as a table
// with one row per entry, instead of the single fixed row the old single-
// value fields used to produce.
function carEntryTable_(body, headers, entries, keys) {
  if (!entries || entries.length === 0) {
    carKV_(body, [['Status', 'None recorded.']]);
    return;
  }
  const rows = entries.map(e => keys.map(k => e[k] || ''));
  carTable_(body, headers, rows);
}

function carBulletList_(body, items) {
  if (!items || items.length === 0) {
    const p = body.appendParagraph('\u2014 None recorded.');
    p.editAsText().setFontSize(9).setForegroundColor('#7A6F6F');
    p.setSpacingAfter(6);
    return;
  }
  items.forEach(text => {
    const li = body.appendListItem(text);
    li.setGlyphType(DocumentApp.GlyphType.BULLET);
    li.editAsText().setFontSize(9.5);
  });
  body.appendParagraph('').setSpacingAfter(6);
}

function carWhyGrid_(body, rawFactors) {
  const factors = ['Man', 'Method', 'Machine', 'Material', 'Environment'];
  const headers = ['Factors', 'Why 1?', 'Why 2?', 'Why 3?', 'Why 4?', 'Why 5?'];
  
  let parsedData = {};
  if (rawFactors) {
    try {
      parsedData = typeof rawFactors === 'string' ? JSON.parse(rawFactors) : rawFactors;
    } catch(e) {
      parsedData = {};
    }
  }

  const rows = factors.map(f => {
    const whys = Array.isArray(parsedData[f]) ? parsedData[f] : ['', '', '', '', ''];
    return [f].concat(whys.map(w => w || ''));
  });

  const table = carTable_(body, headers, rows);
  for (let r = 1; r < table.getNumRows(); r++) {
    table.getRow(r).getCell(0).editAsText().setBold(true);
  }
}

function carSignoff_(body, entries) {
  const headers = entries.map(e => e[0] + ' ' + e[1]);
  const nameRow = entries.map(e => e[2]);
  const dateRow = entries.map(e => 'Date: ' + (e[3] && String(e[3]).trim() !== '' ? e[3] : '\u2014'));
  carTable_(body, headers, [nameRow, dateRow]);
}

// ---------- NOTIFICATIONS ----------
function createNotification_(fromUserId, toUserId, message, relatedCarNo) {
  appendRow_(sheet_(SHEETS.NOTIFICATIONS), NOTIF_COLS, {
    NotificationID: newId_('N'),
    ToUserID: toUserId,
    FromUserID: fromUserId,
    Message: message,
    RelatedCARNo: relatedCarNo || '',
    Read: false,
    CreatedAt: nowIso_()
  });
}

// Notifies every active Process Owner in a department (a finding is routed to
// the whole department, not one specific person, until someone picks it up).
// A user's Department field can hold multiple departments as a comma-
// separated string (e.g. "IT Services, Registrar") - these two helpers are
// the single place that parsing/matching logic lives, so every authorization
// and routing check stays consistent.
function parseDepartments_(deptString) {
  return String(deptString || '').split(',').map(d => d.trim()).filter(Boolean);
}
function userHasDepartment_(userDeptString, targetDept) {
  if (!targetDept) return false;
  return parseDepartments_(userDeptString).indexOf(targetDept) > -1;
}

function notifyDepartment_(fromUserId, department, message, carNo) {
  if (!department) return;
  const users = sheetToObjects_(sheet_(SHEETS.USERS), USER_COLS)
    .filter(u => u.Role === 'Employee' && u.Status === 'Active' && userHasDepartment_(u.Department, department));
  users.forEach(u => createNotification_(fromUserId, u.UserID, message, carNo));
}

function getDepartmentList(token) {
  requireAuth_(token);
  const depts = sheetToObjects_(sheet_(SHEETS.DEPARTMENTS), DEPARTMENT_COLS)
    .map(d => String(d.Name || '').trim())
    .filter(d => d !== '');
  return Array.from(new Set(depts)).sort();
}

// For the Auditor's "Received By" dropdown when raising or reassigning a finding.
function getProcessOwners(token) {
  requireAdmin_(token);
  return sheetToObjects_(sheet_(SHEETS.USERS), USER_COLS)
    .filter(u => u.Role === 'Employee' && u.Status === 'Active')
    .map(u => ({ userId: u.UserID, name: u.Name, department: u.Department }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Resolves an Auditor-selected recipient from payload.EmployeeID into a safe
// {EmployeeID, EmployeeName} pair. Never trusts a client-supplied name - the
// display name is always looked up fresh from the Users sheet, so a crafted
// payload can't attach an arbitrary name to a real (or fake) ID. An empty
// selection resolves to the normal "unassigned, anyone in department" state.
function resolveAssignee_(employeeId) {
  const id = String(employeeId || '').trim();
  if (!id) return { EmployeeID: '', EmployeeName: '(Unassigned)' };
  const user = sheetToObjects_(sheet_(SHEETS.USERS), USER_COLS)
    .find(u => u.UserID === id && u.Role === 'Employee' && u.Status === 'Active');
  if (!user) return { ok: false, error: 'Selected recipient is not a valid active Process Owner.' };
  return { EmployeeID: user.UserID, EmployeeName: user.Name };
}

function getMyNotifications(token) {
  const user = requireAuth_(token);
  return sheetToObjects_(sheet_(SHEETS.NOTIFICATIONS), NOTIF_COLS)
    .filter(n => n.ToUserID === user.userId)
    .sort((a,b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
}

function markNotificationRead(token, notificationId) {
  requireAuth_(token);
  updateRowByField_(sheet_(SHEETS.NOTIFICATIONS), NOTIF_COLS, 'NotificationID', notificationId, { Read: true });
  return { ok: true };
}

// ---------- COMPANY DETAILS ----------
function getCompanyDetails(token) {
  requireAuth_(token);
  return getKeyValueMap_(sheet_(SHEETS.COMPANY));
}

function updateCompanyDetails(token, updates) {
  const admin = requireAdmin_(token);
  const sheet = sheet_(SHEETS.COMPANY);
  Object.keys(updates).forEach(k => setKeyValue_(sheet, k, updates[k]));
  logAction_(admin.userId, 'UPDATE_COMPANY', JSON.stringify(updates));
  return { ok: true };
}

// ---------- SETTINGS ----------
function getSettings(token) {
  requireAuth_(token);
  return getKeyValueMap_(sheet_(SHEETS.SETTINGS));
}

function updateSettings(token, updates) {
  const user = requireAuth_(token);
  const sheet = sheet_(SHEETS.SETTINGS);
  Object.keys(updates).forEach(k => setKeyValue_(sheet, k, updates[k]));
  logAction_(user.userId, 'UPDATE_SETTINGS', JSON.stringify(updates));
  return { ok: true };
}

// ---------- ANNOUNCEMENTS ----------
function getAnnouncementImagesFolder_() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('ANNOUNCEMENT_IMAGES_FOLDER_ID');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (e) { /* fall through */ }
  }
  const name = 'FCAT ISO Audit - Announcement Images';
  const it = DriveApp.getFoldersByName(name);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty('ANNOUNCEMENT_IMAGES_FOLDER_ID', folder.getId());
  return folder;
}

function uploadAnnouncementImage(token, base64Data, filename, mimeType) {
  const admin = requireAdmin_(token);
  if (!base64Data || !filename) return { ok: false, error: 'No file provided.' };
  const MAX_BYTES = 8 * 1024 * 1024;
  const bytes = Utilities.base64Decode(base64Data);
  if (bytes.length > MAX_BYTES) return { ok: false, error: 'Image is too large (max 8MB).' };

  const folder = getAnnouncementImagesFolder_();
  const blob = Utilities.newBlob(bytes, mimeType, filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // file.getUrl() returns Drive's viewer PAGE (an HTML document), which cannot
  // be used as an <img> src - browsers just show a broken image icon. Use the
  // thumbnail endpoint instead, which serves the actual image bytes directly.
  const url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
  logAction_(admin.userId, 'UPLOAD_ANNOUNCEMENT_IMAGE', url);
  return { ok: true, url: url, name: file.getName() };
}

function parseImageLinks_(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(u => isValidDriveUrl_(u)) : [];
  } catch (e) {
    return [];
  }
}

function listAnnouncements(token) {
  requireAuth_(token);
  return sheetToObjects_(sheet_(SHEETS.ANNOUNCEMENTS), ANNOUNCEMENT_COLS)
    .map(a => Object.assign({}, a, { ImageLinks: parseImageLinks_(a.ImageLinks) }))
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
}

function createAnnouncement(token, title, message, imageLinks) {
  const admin = requireAdmin_(token);
  const t = String(title || '').trim();
  const m = String(message || '').trim();
  if (!t || !m) return { ok: false, error: 'Title and message are required.' };
  const links = (Array.isArray(imageLinks) ? imageLinks : []).filter(u => isValidDriveUrl_(u));

  const now = nowIso_();
  const announcement = {
    AnnouncementID: newId_('AN'),
    Title: t,
    Message: m,
    ImageLinks: JSON.stringify(links),
    PostedBy: admin.userId,
    PostedByName: admin.name,
    CreatedAt: now,
    UpdatedAt: now
  };
  appendRow_(sheet_(SHEETS.ANNOUNCEMENTS), ANNOUNCEMENT_COLS, announcement);
  logAction_(admin.userId, 'CREATE_ANNOUNCEMENT', t);
  return { ok: true, announcement: Object.assign({}, announcement, { ImageLinks: links }) };
}

function updateAnnouncement(token, announcementId, title, message, imageLinks) {
  const admin = requireAdmin_(token);
  const t = String(title || '').trim();
  const m = String(message || '').trim();
  if (!t || !m) return { ok: false, error: 'Title and message are required.' };
  const links = (Array.isArray(imageLinks) ? imageLinks : []).filter(u => isValidDriveUrl_(u));

  const sheet = sheet_(SHEETS.ANNOUNCEMENTS);
  const existing = sheetToObjects_(sheet, ANNOUNCEMENT_COLS).find(a => a.AnnouncementID === announcementId);
  if (!existing) return { ok: false, error: 'Announcement not found.' };

  // Snapshot the version being replaced so it shows up in edit history.
  appendRow_(sheet_(SHEETS.ANNOUNCEMENT_HISTORY), ANNOUNCEMENT_HISTORY_COLS, {
    HistoryID: newId_('AH'),
    AnnouncementID: announcementId,
    Title: existing.Title,
    Message: existing.Message,
    ImageLinks: existing.ImageLinks,
    EditedBy: admin.userId,
    EditedByName: admin.name,
    EditedAt: nowIso_()
  });

  const updatedAt = nowIso_();
  updateRowByField_(sheet, ANNOUNCEMENT_COLS, 'AnnouncementID', announcementId, {
    Title: t, Message: m, ImageLinks: JSON.stringify(links), UpdatedAt: updatedAt
  });
  logAction_(admin.userId, 'UPDATE_ANNOUNCEMENT', announcementId);
  return { ok: true, announcement: { AnnouncementID: announcementId, Title: t, Message: m, ImageLinks: links,
    PostedBy: existing.PostedBy, PostedByName: existing.PostedByName, CreatedAt: existing.CreatedAt, UpdatedAt: updatedAt } };
}

function getAnnouncementHistory(token, announcementId) {
  requireAuth_(token);
  return sheetToObjects_(sheet_(SHEETS.ANNOUNCEMENT_HISTORY), ANNOUNCEMENT_HISTORY_COLS)
    .filter(h => h.AnnouncementID === announcementId)
    .map(h => Object.assign({}, h, { ImageLinks: parseImageLinks_(h.ImageLinks) }))
    .sort((a, b) => new Date(b.EditedAt) - new Date(a.EditedAt));
}

function deleteAnnouncement(token, announcementId) {
  const admin = requireAdmin_(token);
  const sheet = sheet_(SHEETS.ANNOUNCEMENTS);
  const data = sheet.getDataRange().getValues();
  const idIdx = ANNOUNCEMENT_COLS.indexOf('AnnouncementID');
  let removed = false;
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][idIdx] === announcementId) { sheet.deleteRow(i + 1); removed = true; break; }
  }
  if (!removed) return { ok: false, error: 'Announcement not found.' };

  // Clean up related history and comments so nothing orphaned is left behind.
  deleteRowsWhere_(sheet_(SHEETS.ANNOUNCEMENT_HISTORY), ANNOUNCEMENT_HISTORY_COLS, 'AnnouncementID', announcementId);
  deleteRowsWhere_(sheet_(SHEETS.ANNOUNCEMENT_COMMENTS), ANNOUNCEMENT_COMMENT_COLS, 'AnnouncementID', announcementId);

  logAction_(admin.userId, 'DELETE_ANNOUNCEMENT', announcementId);
  return { ok: true };
}

function deleteRowsWhere_(sheet, cols, field, value) {
  const data = sheet.getDataRange().getValues();
  const idx = cols.indexOf(field);
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][idx] === value) sheet.deleteRow(i + 1);
  }
}

// ---------- ANNOUNCEMENT COMMENTS ----------
function addAnnouncementComment(token, announcementId, message) {
  const user = requireAuth_(token);
  const msg = String(message || '').trim();
  if (!msg) return { ok: false, error: 'Comment cannot be empty.' };

  const exists = sheetToObjects_(sheet_(SHEETS.ANNOUNCEMENTS), ANNOUNCEMENT_COLS).some(a => a.AnnouncementID === announcementId);
  if (!exists) return { ok: false, error: 'Announcement not found.' };

  const comment = {
    CommentID: newId_('AC'),
    AnnouncementID: announcementId,
    UserID: user.userId,
    UserName: user.name,
    Role: user.role,
    Message: msg,
    CreatedAt: nowIso_()
  };
  appendRow_(sheet_(SHEETS.ANNOUNCEMENT_COMMENTS), ANNOUNCEMENT_COMMENT_COLS, comment);
  logAction_(user.userId, 'ADD_ANNOUNCEMENT_COMMENT', announcementId);
  return { ok: true, comment: comment };
}

function getAnnouncementComments(token, announcementId) {
  requireAuth_(token);
  return sheetToObjects_(sheet_(SHEETS.ANNOUNCEMENT_COMMENTS), ANNOUNCEMENT_COMMENT_COLS)
    .filter(c => c.AnnouncementID === announcementId)
    .sort((a, b) => new Date(a.CreatedAt) - new Date(b.CreatedAt));
}

// Admins can delete any comment (moderation); anyone can delete their own.
function deleteAnnouncementComment(token, commentId) {
  const user = requireAuth_(token);
  const sheet = sheet_(SHEETS.ANNOUNCEMENT_COMMENTS);
  const data = sheet.getDataRange().getValues();
  const idIdx = ANNOUNCEMENT_COMMENT_COLS.indexOf('CommentID');
  const userIdx = ANNOUNCEMENT_COMMENT_COLS.indexOf('UserID');
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIdx] === commentId) {
      if (user.role !== 'Admin' && data[i][userIdx] !== user.userId) {
        throw new Error('NOT_AUTHORIZED');
      }
      sheet.deleteRow(i + 1);
      logAction_(user.userId, 'DELETE_ANNOUNCEMENT_COMMENT', commentId);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Comment not found.' };
}

function authorizeDrive() {
  DriveApp.getRootFolder();
}