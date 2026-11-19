import type {
  AnnouncementComment,
  AnnouncementHistoryItem,
  AnnouncementItem,
  AuditLogItem,
  CarComment,
  CarRecord,
  ManagedUser,
  NotificationItem,
  ProcessOwnerOption,
  SessionUser,
  StorageStatus,
} from './types';

const TOKEN_KEY = 'fcat_token';
const USER_KEY = 'fcat_user';
const COMPANY_CACHE_KEY = 'fcat_company_cache';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: SessionUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has('Content-Type') && init.method && init.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401) {
    clearSession();
    if (onUnauthorized) onUnauthorized();
    throw new Error('Your session has expired. Please log in again.');
  }
  if (res.status === 403) {
    throw new Error('You are not authorized to perform this action.');
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.error) msg = errBody.error;
    } catch {
      // ignore non-json error body
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ ok: boolean; token?: string; user?: SessionUser; error?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ ok: boolean; user: SessionUser }>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ ok: boolean; error?: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),

  // Users
  listUsers: () => request<ManagedUser[]>('/users'),
  createUser: (data: {
    name: string;
    email: string;
    password: string;
    departments: string[];
    position: string;
    role: string;
  }) =>
    request<{ ok: boolean; user?: ManagedUser; error?: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateUser: (
    userId: string,
    data: {
      name: string;
      email: string;
      departments: string[];
      position: string;
      role: string;
      password?: string;
    }
  ) =>
    request<{ ok: boolean; user?: ManagedUser; error?: string }>(`/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  setUserLock: (userId: string, lock: boolean) =>
    request<{ ok: boolean; error?: string }>(`/users/${encodeURIComponent(userId)}/lock`, {
      method: 'POST',
      body: JSON.stringify({ lock }),
    }),
  getProcessOwners: () => request<ProcessOwnerOption[]>('/process-owners'),

  // Departments
  getDepartments: () => request<string[]>('/departments'),
  addDepartment: (name: string) =>
    request<{ ok: boolean; departments?: string[]; error?: string }>('/departments', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  removeDepartment: (name: string) =>
    request<{ ok: boolean; departments?: string[]; error?: string }>(
      `/departments/${encodeURIComponent(name)}`,
      { method: 'DELETE' }
    ),

  // CARs
  listCARs: () => request<CarRecord[]>('/cars'),
  getCAR: (carNo: string) => request<CarRecord | null>(`/cars/${encodeURIComponent(carNo)}`),
  submitCAR: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; carNo?: string; error?: string }>('/cars', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCAR: (carNo: string, payload: Record<string, unknown>) =>
    request<{ ok: boolean; error?: string }>(`/cars/${encodeURIComponent(carNo)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  flagCAR: (carNo: string, note: string) =>
    request<{ ok: boolean; error?: string }>(`/cars/${encodeURIComponent(carNo)}/flag`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  closeCAR: (carNo: string) =>
    request<{ ok: boolean; error?: string }>(`/cars/${encodeURIComponent(carNo)}/close`, {
      method: 'POST',
    }),
  reopenCAR: (carNo: string) =>
    request<{ ok: boolean; error?: string }>(`/cars/${encodeURIComponent(carNo)}/reopen`, {
      method: 'POST',
    }),
  setDeadline: (carNo: string, deadline: string) =>
    request<{ ok: boolean; error?: string }>(`/cars/${encodeURIComponent(carNo)}/deadline`, {
      method: 'POST',
      body: JSON.stringify({ deadline }),
    }),
  addFollowUp: (
    carNo: string,
    entry: { FollowUpDate: string; ResultOfVerification: string; VerifiedBy: string; ConformedBy: string }
  ) =>
    request<{ ok: boolean; entries?: unknown[]; error?: string }>(
      `/cars/${encodeURIComponent(carNo)}/followups`,
      {
        method: 'POST',
        body: JSON.stringify(entry),
      }
    ),
  getCarComments: (carNo: string) =>
    request<CarComment[]>(`/cars/${encodeURIComponent(carNo)}/comments`),
  addCarComment: (carNo: string, message: string) =>
    request<{ ok: boolean; comment?: CarComment; error?: string }>(
      `/cars/${encodeURIComponent(carNo)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ message }),
      }
    ),

  exportCarPdf: async (carNo: string) => {
    const token = getToken();
    const res = await fetch(`/api/cars/${encodeURIComponent(carNo)}/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) {
      clearSession();
      if (onUnauthorized) onUnauthorized();
      throw new Error('Session expired.');
    }
    if (!res.ok) throw new Error('Could not export PDF.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${carNo} - FO-RI-05 Corrective Action Report.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  },

  // Notifications
  getNotifications: () => request<NotificationItem[]>('/notifications'),
  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request<{ ok: boolean }>('/notifications/read-all', { method: 'POST' }),

  // Company & Settings
  getCompanyDetails: async (useCache = true): Promise<Record<string, string>> => {
    if (useCache) {
      try {
        const cached = JSON.parse(localStorage.getItem(COMPANY_CACHE_KEY) || 'null');
        if (cached && cached.at && Date.now() - cached.at < 5 * 60 * 1000 && cached.data) {
          return cached.data;
        }
      } catch {
        // ignore
      }
    }
    const data = await request<Record<string, string>>('/company');
    try {
      localStorage.setItem(COMPANY_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
    } catch {
      // ignore
    }
    return data;
  },
  updateCompanyDetails: async (updates: Record<string, string>) => {
    const res = await request<{ ok: boolean; error?: string }>('/company', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    localStorage.removeItem(COMPANY_CACHE_KEY);
    return res;
  },
  getSettings: () => request<Record<string, string>>('/settings'),
  updateSettings: (updates: Record<string, string>) =>
    request<{ ok: boolean; error?: string }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  // Uploads
  uploadEvidence: (carNo: string, file: File) => {
    const fd = new FormData();
    fd.append('carNo', carNo);
    fd.append('file', file);
    return request<{ ok: boolean; url?: string; name?: string; error?: string }>('/uploads/evidence', {
      method: 'POST',
      body: fd,
    });
  },
  uploadAnnouncementImage: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ ok: boolean; url?: string; name?: string; error?: string }>(
      '/uploads/announcement-image',
      { method: 'POST', body: fd }
    );
  },
  uploadFormTemplate: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ ok: boolean; url?: string; error?: string }>('/uploads/template', {
      method: 'POST',
      body: fd,
    });
  },

  // Announcements
  listAnnouncements: () => request<AnnouncementItem[]>('/announcements'),
  createAnnouncement: (title: string, message: string, imageLinks: string[]) =>
    request<{ ok: boolean; announcement?: AnnouncementItem; error?: string }>('/announcements', {
      method: 'POST',
      body: JSON.stringify({ title, message, imageLinks }),
    }),
  updateAnnouncement: (id: string, title: string, message: string, imageLinks: string[]) =>
    request<{ ok: boolean; announcement?: AnnouncementItem; error?: string }>(
      `/announcements/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ title, message, imageLinks }),
      }
    ),
  deleteAnnouncement: (id: string) =>
    request<{ ok: boolean; error?: string }>(`/announcements/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  getAnnouncementHistory: (id: string) =>
    request<AnnouncementHistoryItem[]>(`/announcements/${encodeURIComponent(id)}/history`),
  getAnnouncementComments: (id: string) =>
    request<AnnouncementComment[]>(`/announcements/${encodeURIComponent(id)}/comments`),
  addAnnouncementComment: (id: string, message: string) =>
    request<{ ok: boolean; comment?: AnnouncementComment; error?: string }>(
      `/announcements/${encodeURIComponent(id)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ message }),
      }
    ),
  deleteAnnouncementComment: (commentId: string) =>
    request<{ ok: boolean; error?: string }>(
      `/announcements/comments/${encodeURIComponent(commentId)}`,
      { method: 'DELETE' }
    ),

  // Admin Storage & Google Sheets Sync
  getStorageStatus: () => request<StorageStatus>('/admin/storage-status'),
  testSheetsConnection: (spreadsheetId: string, serviceAccountJson?: string) =>
    request<{ ok: boolean; title?: string; tabs?: string[]; error?: string }>('/admin/sheets-test', {
      method: 'POST',
      body: JSON.stringify({ spreadsheetId, serviceAccountJson }),
    }),
  syncSheets: (
    direction: 'pull-from-sheets' | 'push-to-sheets',
    spreadsheetId?: string,
    serviceAccountJson?: string
  ) =>
    request<{ ok: boolean; summary?: Record<string, number>; error?: string }>('/admin/sheets-sync', {
      method: 'POST',
      body: JSON.stringify({ direction, spreadsheetId, serviceAccountJson }),
    }),
  getAuditLogs: () => request<AuditLogItem[]>('/admin/audit-logs'),
};
