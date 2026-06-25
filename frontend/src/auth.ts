export type ThemePreference = 'system' | 'light' | 'dark';
export type DifficultyMode = 'easy' | 'hard';
export type SavedSolution = {
  equation: string;
  timestamp: string;
  seconds: number;
  value: string;
  mode?: string;
  targetValue?: string;
  solvedOnOtherDay?: boolean;
  usedHint?: boolean;
  difficulty?: 'easy' | 'hard';
};
export type StoredSolutions = Record<string, SavedSolution[]>;

export type AuthUser = {
  id: number;
  email: string;
  emailVerified: boolean;
};

export type PreferencesPayload = {
  themePreference: ThemePreference;
  difficultyMode: DifficultyMode;
};

type AuthResponse = {
  user: AuthUser | null;
};

type SolutionsResponse = {
  solutions: StoredSolutions;
};

async function requestJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload as T;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await requestJSON<AuthResponse>('/api/auth/me');
  return response.user;
}

export async function signup(
  email: string,
  password: string,
  preferences: PreferencesPayload,
): Promise<AuthUser> {
  const response = await requestJSON<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, ...preferences }),
  });
  if (!response.user) throw new Error('Account was not created');
  return response.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await requestJSON<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!response.user) throw new Error('Account was not loaded');
  return response.user;
}

export async function logout(): Promise<void> {
  await requestJSON('/api/auth/logout', { method: 'POST' });
}

export async function verifyCode(email: string, code: string): Promise<AuthUser> {
  const response = await requestJSON<AuthResponse>('/api/auth/verify-code', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  if (!response.user) throw new Error('Account was not verified');
  return response.user;
}

export async function resendVerification(email: string): Promise<void> {
  await requestJSON('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function fetchAccountPreferences(): Promise<PreferencesPayload> {
  return requestJSON<PreferencesPayload>('/api/me/preferences');
}

export async function saveAccountPreferences(preferences: PreferencesPayload): Promise<void> {
  await requestJSON('/api/me/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  });
}

export async function fetchAccountSolutions(): Promise<StoredSolutions> {
  const response = await requestJSON<SolutionsResponse>('/api/me/solutions');
  return response.solutions;
}

export async function importAccountSolutions(solutions: StoredSolutions): Promise<number> {
  const response = await requestJSON<{ imported: number }>('/api/me/solutions/import', {
    method: 'POST',
    body: JSON.stringify({ solutions }),
  });
  return response.imported;
}

export function countStoredSolutions(solutions: StoredSolutions): number {
  return Object.values(solutions).reduce((total, entries: SavedSolution[]) => total + entries.length, 0);
}
