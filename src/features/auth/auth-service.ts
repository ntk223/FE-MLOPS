import type { AdvisorSession } from '../../contracts/api';
import type { LearnGuardApiClient, LoginCredentials } from '../../api/client';

export class AuthService {
  constructor(private readonly api: LearnGuardApiClient) {}

  login(credentials: LoginCredentials): Promise<AdvisorSession> {
    // TODO: call API and persist session using the agreed secure storage policy.
    return this.api.login(credentials);
  }

  logout(): void {
    // TODO: clear local session and sensitive in-memory state.
    throw new Error('TODO: implement logout/session cleanup');
  }

  getCurrentSession(): AdvisorSession | null {
    // TODO: restore/validate the current advisor session.
    throw new Error('TODO: implement session lookup');
  }
}
