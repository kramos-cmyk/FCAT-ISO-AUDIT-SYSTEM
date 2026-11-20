export type ThemeMode = 'classic' | 'light' | 'dark';
export type TextSizeMode = 'compact' | 'standard' | 'large';
export type DensityMode = 'comfortable' | 'compact';

export interface UserPreferences {
  theme: ThemeMode;
  textSize: TextSizeMode;
  density: DensityMode;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'classic',
  textSize: 'standard',
  density: 'comfortable',
};

const STORAGE_PREFIX = 'fcat_user_prefs_';

export function loadUserPreferences(userId?: string): UserPreferences {
  if (!userId) return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'classic',
      textSize: parsed.textSize === 'compact' || parsed.textSize === 'large' ? parsed.textSize : 'standard',
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveUserPreferences(userId: string, prefs: UserPreferences): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(prefs));
  } catch {
    // ignore storage quota errors
  }
  applyUserPreferences(prefs);
}

export function applyUserPreferences(prefs: UserPreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', prefs.theme);
  root.setAttribute('data-text-size', prefs.textSize);
  root.setAttribute('data-density', prefs.density);
}

export function resetAppliedPreferences(): void {
  applyUserPreferences(DEFAULT_PREFERENCES);
}
