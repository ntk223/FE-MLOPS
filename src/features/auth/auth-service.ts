import type { AdvisorSession } from '../../contracts/api';
import type { ILearnGuardApiClient, LoginCredentials } from '../../api/client';
import { clearSession, readSession, saveSession } from '../../utils/session';

/**
 * Authentication service: delegates login to the API client and persists
 * the resulting advisor session via the shared session utilities.
 */
export class AuthService {
  constructor(private readonly api: ILearnGuardApiClient) {}

  login(credentials: LoginCredentials): Promise<AdvisorSession> {
    return this.api.login(credentials).then((session) => {
      saveSession(session);
      return session;
    });
  }

  logout(): void {
    clearSession();
  }

  getCurrentSession(): AdvisorSession | null {
    return readSession();
  }
}
