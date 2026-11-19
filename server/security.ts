import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { SESSION_HOURS, WHY_FACTORS } from './constants.js';
import type { SessionUser, UserRole, WhyWhyFactors } from './types.js';

export function normalizeUserRole(raw: unknown): UserRole {
  const val = String(raw || '').trim();
  if (val === 'Admin' || val === 'System Administrator') return 'Admin';
  if (val === 'Auditor' || val === 'Auditor Account') return 'Auditor';
  return 'Employee';
}

export function isSystemAdmin(role: unknown): boolean {
  return normalizeUserRole(role) === 'Admin';
}

export function isAuditorOrAdmin(role: unknown): boolean {
  const r = normalizeUserRole(role);
  return r === 'Admin' || r === 'Auditor';
}

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecret(): string {
  return process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16
    ? process.env.JWT_SECRET.trim()
    : EPHEMERAL_FALLBACK_SECRET;
}

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function hashPasswordLegacySha256(pw: string): string {
  return crypto.createHash('sha256').update(pw, 'utf8').digest('hex');
}

export function verifyPassword(pw: string, storedHash: string): { valid: boolean; isLegacy: boolean } {
  if (!storedHash || !pw) return { valid: false, isLegacy: false };
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return { valid: false, isLegacy: false };
    const [, salt, hex] = parts;
    const derived = crypto.scryptSync(pw, salt, 64);
    const storedBuf = Buffer.from(hex, 'hex');
    if (derived.length !== storedBuf.length) return { valid: false, isLegacy: false };
    return { valid: crypto.timingSafeEqual(derived, storedBuf), isLegacy: false };
  }
  // Backward compatibility with Code.gs SHA-256 hex password hashes
  if (/^[0-9a-f]{64}$/i.test(storedHash)) {
    const candidate = Buffer.from(hashPasswordLegacySha256(pw), 'hex');
    const target = Buffer.from(storedHash.toLowerCase(), 'hex');
    if (candidate.length !== target.length) return { valid: false, isLegacy: true };
    return { valid: crypto.timingSafeEqual(candidate, target), isLegacy: true };
  }
  return { valid: false, isLegacy: false };
}

export function signSessionToken(user: SessionUser): string {
  return jwt.sign(
    {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      position: user.position,
    },
    getJwtSecret(),
    { expiresIn: `${SESSION_HOURS}h` }
  );
}

export function verifySessionToken(token: string): SessionUser | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as SessionUser;
    if (!decoded || !decoded.userId) return null;
    return {
      userId: decoded.userId,
      name: decoded.name,
      email: decoded.email,
      role: decoded.role,
      department: decoded.department,
      position: decoded.position,
    };
  } catch {
    return null;
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().split('-')[0].toUpperCase()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseJsonArray<T = unknown>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseWhyFactors(raw: unknown): WhyWhyFactors {
  const empty: WhyWhyFactors = {
    Man: ['', '', '', '', ''],
    Method: ['', '', '', '', ''],
    Machine: ['', '', '', '', ''],
    Material: ['', '', '', '', ''],
    Environment: ['', '', '', '', ''],
  };
  let obj: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) || {};
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }
  for (const factor of WHY_FACTORS) {
    const arr = obj[factor];
    if (Array.isArray(arr)) {
      empty[factor] = [0, 1, 2, 3, 4].map((i) => String(arr[i] ?? ''));
    }
  }
  return empty;
}

export function parseDepartments(deptString: string): string[] {
  return String(deptString || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

export function userHasDepartment(userDeptString: string, targetDept: string): boolean {
  if (!targetDept) return false;
  return parseDepartments(userDeptString).includes(targetDept.trim());
}

export function isValidEvidenceUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^\/uploads\/[A-Za-z0-9._\-\/]+$/.test(trimmed)) return true;
  if (/^https:\/\/drive\.google\.com\//.test(trimmed)) return true;
  if (/^https:\/\/docs\.google\.com\//.test(trimmed)) return true;
  return false;
}

export function isValidHttpsOrUploadUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed === '/fcat-logo.png') return true;
  if (/^\/uploads\/[A-Za-z0-9._\-\/]+$/.test(trimmed)) return true;
  return /^https:\/\//i.test(trimmed);
}

export function sanitizeCarPayload(payload: Record<string, unknown>): void {
  if (payload.EvidenceLink !== undefined && !isValidEvidenceUrl(payload.EvidenceLink)) {
    delete payload.EvidenceLink;
  }
  if (payload.FormEvidenceLink !== undefined && !isValidEvidenceUrl(payload.FormEvidenceLink)) {
    delete payload.FormEvidenceLink;
  }
  if (payload.EvidenceLinks !== undefined) {
    const links = parseJsonArray<string>(payload.EvidenceLinks).filter((u) => isValidEvidenceUrl(u));
    payload.EvidenceLinks = JSON.stringify(links);
  }
}
