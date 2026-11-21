import { GoogleSheetsStore, parseServiceAccountCreds } from './sheetsStore.js';
import { SqliteStore } from './sqliteStore.js';
import type { DataStore } from './types.js';

let activeStore: DataStore | null = null;
let sqliteInstance: SqliteStore | null = null;
let sheetsInstance: GoogleSheetsStore | null = null;
let initError: string | null = null;

export async function initializeDataStore(): Promise<DataStore> {
  sqliteInstance = new SqliteStore();
  await sqliteInstance.init();

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();
  const creds = parseServiceAccountCreds();

  if (spreadsheetId && creds) {
    try {
      const sheets = new GoogleSheetsStore(spreadsheetId, creds);
      await sheets.init();
      sheetsInstance = sheets;
      activeStore = sheets;
      initError = null;
      console.log(`[Storage] Connected to Google Sheets (${spreadsheetId})`);
      return activeStore;
    } catch (err) {
      initError = err instanceof Error ? err.message : String(err);
      console.error('[Storage] Failed to connect to Google Sheets, falling back to SQLite:', initError);
    }
  }

  activeStore = sqliteInstance;
  console.log('[Storage] Using SQLite database');
  return activeStore;
}

export function getStore(): DataStore {
  if (!activeStore) {
    throw new Error('DataStore not initialized yet.');
  }
  return activeStore;
}

export function getStorageStatus() {
  return {
    mode: activeStore?.mode || 'sqlite',
    spreadsheetIdConfigured: Boolean(process.env.GOOGLE_SPREADSHEET_ID?.trim()),
    serviceAccountConfigured: Boolean(parseServiceAccountCreds()),
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID?.trim() || '',
    serviceAccountEmail: parseServiceAccountCreds()?.client_email || '',
    sheetsInitError: initError,
  };
}

export function getSheetsInstance(): GoogleSheetsStore | null {
  return sheetsInstance;
}

export function getSqliteInstance(): SqliteStore | null {
  return sqliteInstance;
}

export async function testGoogleSheetConnection(
  spreadsheetId: string,
  serviceAccountJson?: string
): Promise<{ ok: boolean; title?: string; tabs?: string[]; error?: string }> {
  const creds = parseServiceAccountCreds(serviceAccountJson);
  if (!creds) {
    return { ok: false, error: 'Missing or invalid Service Account JSON credentials.' };
  }
  if (!spreadsheetId.trim()) {
    return { ok: false, error: 'Spreadsheet ID is required.' };
  }
  try {
    const store = new GoogleSheetsStore(spreadsheetId.trim(), creds);
    const info = await store.testConnection();
    return { ok: true, title: info.title, tabs: info.tabs };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function syncDataBetweenStores(
  direction: 'pull-from-sheets' | 'push-to-sheets',
  spreadsheetIdInput?: string,
  serviceAccountJsonInput?: string
): Promise<{ ok: boolean; summary?: Record<string, number>; error?: string }> {
  if (!sqliteInstance) return { ok: false, error: 'SQLite store is not initialized.' };

  const spreadsheetId = (spreadsheetIdInput || process.env.GOOGLE_SPREADSHEET_ID || '').trim();
  const creds = parseServiceAccountCreds(serviceAccountJsonInput);
  if (!spreadsheetId || !creds) {
    return {
      ok: false,
      error: 'Spreadsheet ID and Service Account JSON are required to sync with Google Sheets.',
    };
  }

  const sheets = new GoogleSheetsStore(spreadsheetId, creds);
  await sheets.init();

  const source: DataStore = direction === 'pull-from-sheets' ? sheets : sqliteInstance;
  const target: DataStore = direction === 'pull-from-sheets' ? sqliteInstance : sheets;

  const summary = {
    departments: 0,
    users: 0,
    cars: 0,
    comments: 0,
    announcements: 0,
    notifications: 0,
  };

  // Departments
  const depts = await source.listDepartments();
  for (const d of depts) {
    await target.addDepartment(d);
    summary.departments++;
  }

  // Users
  const srcUsers = await source.listUsers();
  const tgtUsers = await target.listUsers();
  const tgtUserIds = new Set(tgtUsers.map((u) => u.UserID));
  for (const u of srcUsers) {
    if (tgtUserIds.has(u.UserID)) {
      await target.updateUser(u.UserID, u);
    } else {
      await target.createUser(u);
    }
    summary.users++;
  }

  // Company & Settings
  const company = await source.getCompanyDetails();
  if (Object.keys(company).length > 0) await target.updateCompanyDetails(company);
  const settings = await source.getSettings();
  if (Object.keys(settings).length > 0) await target.updateSettings(settings);

  // CARs + WhyWhy + Comments
  const srcCars = await source.listCARs();
  const tgtCars = await target.listCARs();
  const tgtCarNos = new Set(tgtCars.map((c) => c.CARNo));
  for (const c of srcCars) {
    const whys = await source.getWhyWhy(c.CARNo);
    if (tgtCarNos.has(c.CARNo)) {
      await target.updateCAR(c.CARNo, c, whys);
    } else {
      await target.createCAR(c, whys);
    }
    summary.cars++;

    const srcComments = await source.listCarComments(c.CARNo);
    const tgtComments = await target.listCarComments(c.CARNo);
    const tgtCommentIds = new Set(tgtComments.map((cm) => cm.CommentID));
    for (const cm of srcComments) {
      if (!tgtCommentIds.has(cm.CommentID)) {
        await target.addCarComment(cm);
        summary.comments++;
      }
    }

    const srcActivities = await source.listCarActivities(c.CARNo);
    const tgtActivities = await target.listCarActivities(c.CARNo);
    const tgtActivityIds = new Set(tgtActivities.map((a) => a.ActivityID));
    for (const act of srcActivities) {
      if (!tgtActivityIds.has(act.ActivityID)) {
        await target.addCarActivity(act);
      }
    }
  }

  // Announcements
  const srcAnn = await source.listAnnouncements();
  const tgtAnn = await target.listAnnouncements();
  const tgtAnnIds = new Set(tgtAnn.map((a) => a.AnnouncementID));
  for (const a of srcAnn) {
    if (!tgtAnnIds.has(a.AnnouncementID)) {
      await target.createAnnouncement(a);
    }
    summary.announcements++;
  }

  return { ok: true, summary };
}
