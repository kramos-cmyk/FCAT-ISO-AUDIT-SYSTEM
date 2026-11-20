import type { CarRecord, CorrectionEntry, CorrectiveActionEntry, FollowUpEntry } from './types';

export function roleLabel(role: string): string {
  if (role === 'Admin') return 'System Administrator';
  if (role === 'Admin+Employee') return 'System Admin & Process Owner';
  if (role === 'Auditor+Employee') return 'Auditor & Process Owner';
  if (role === 'Auditor') return 'Auditor Account';
  return 'Process Owner';
}

export function isAuditorRole(role: string | undefined): boolean {
  return role === 'Admin' || role === 'Admin+Employee' || role === 'Auditor' || role === 'Auditor+Employee';
}

export function isSystemAdminRole(role: string | undefined): boolean {
  return role === 'Admin' || role === 'Admin+Employee';
}

export function isProcessOwnerRole(role: string | undefined): boolean {
  return role === 'Employee' || role === 'Auditor+Employee' || role === 'Admin+Employee';
}

export function isCarRaisedByUser(
  rec: Pick<CarRecord, 'RaisedBy'> | null | undefined,
  user: { userId?: string; name?: string; email?: string } | null | undefined
): boolean {
  if (!rec || !user) return false;
  const raised = String(rec.RaisedBy || '').trim().toLowerCase();
  if (!raised) return false;
  if (user.name && raised === user.name.trim().toLowerCase()) return true;
  if (user.email && raised === user.email.trim().toLowerCase()) return true;
  if (user.userId && raised === user.userId.trim().toLowerCase()) return true;
  return false;
}

export function safeUrl(url: string | undefined | null): string {
  const s = String(url || '').trim();
  if (!s) return '';
  if (s === '/fcat-logo.png') return s;
  if (/^\/uploads\/[A-Za-z0-9._\-\/]+$/.test(s)) return s;
  if (/^https:\/\//i.test(s)) return s;
  return '';
}

export function driveImageSrc(url: string | undefined | null): string {
  const safe = safeUrl(url);
  if (!safe) return '';
  if (safe.startsWith('/uploads/') || safe === '/fcat-logo.png') return safe;
  const m = safe.match(/\/file\/d\/([^/]+)/) || safe.match(/[?&]id=([^&]+)/);
  return m && m[1] ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000` : safe;
}

export function parseLocalDateOnly(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const match = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeInputDate(raw: string | undefined | null): string {
  if (!raw) return '';
  const str = String(raw).trim();
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = parseLocalDateOnly(iso);
  if (!d) return String(iso);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return String(iso).replace('T', ' ').replace(/\.\d+Z?$/, '');
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isRecordOverdue(deadline: string | undefined | null, status: string): boolean {
  if (status === 'Closed' || !deadline) return false;
  const d = parseLocalDateOnly(deadline);
  if (!d) return false;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d.getTime() < todayStart.getTime();
}

export function parseJsonArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function evidenceLinksOf(rec: Partial<CarRecord>): string[] {
  let links = parseJsonArray<string>(rec.EvidenceLinks);
  if (links.length === 0 && rec.EvidenceLink) {
    links = [rec.EvidenceLink];
  }
  return Array.from(new Set(links)).filter((u) => Boolean(safeUrl(u)));
}

export function correctionsOf(rec: Partial<CarRecord>): CorrectionEntry[] {
  let entries = parseJsonArray<CorrectionEntry>(rec.CorrectionEntries);
  if (entries.length === 0 && (rec.Correction || rec.DateCompleted || rec.PersonInCharge || rec.Result)) {
    entries = [
      {
        Correction: rec.Correction || '',
        DateCompleted: rec.DateCompleted || '',
        PersonInCharge: rec.PersonInCharge || '',
        Result: rec.Result || '',
      },
    ];
  }
  return entries;
}

export function possibleRootCausesOf(rec: Partial<CarRecord>): string[] {
  let entries = parseJsonArray<string>(rec.PossibleRootCauseEntries);
  if (entries.length === 0 && rec.PossibleRootCause) {
    entries = [rec.PossibleRootCause];
  }
  return entries;
}

export function correctiveActionsOf(rec: Partial<CarRecord>): CorrectiveActionEntry[] {
  let entries = parseJsonArray<CorrectiveActionEntry>(rec.CorrectiveActionEntries);
  if (
    entries.length === 0 &&
    (rec.CorrectiveAction || rec.ActionOwnerTargetDate || rec.DateImplemented)
  ) {
    entries = [
      {
        CorrectiveAction: rec.CorrectiveAction || '',
        ActionOwnerTargetDate: rec.ActionOwnerTargetDate || '',
        DateImplemented: rec.DateImplemented || '',
      },
    ];
  }
  return entries;
}

export function followUpsOf(rec: Partial<CarRecord>): FollowUpEntry[] {
  let entries = parseJsonArray<FollowUpEntry>(rec.FollowUpEntries);
  if (entries.length === 0 && rec.FollowUpDate) {
    entries = [
      {
        FollowUpDate: rec.FollowUpDate,
        ResultOfVerification: rec.ResultOfVerification || '',
        VerifiedBy: rec.VerifiedBy || '',
        ConformedBy: rec.ConformedBy || '',
      },
    ];
  }
  return entries;
}
