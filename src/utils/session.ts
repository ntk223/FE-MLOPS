import type { AdvisorSession } from '../contracts/api';

const SESSION_KEY = 'learnguard_session';

function isAdvisorSession(value: unknown): value is AdvisorSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.accessToken === 'string' &&
    (record.role === 'advisor' || record.role === 'admin') &&
    typeof record.displayName === 'string'
  );
}

export function readSession(): AdvisorSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isAdvisorSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: AdvisorSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
