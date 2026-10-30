import { LearnGuardApiClient } from './client';
import type { ILearnGuardApiClient } from './client';
import { MockApiClient } from '../mocks/mock-client';

/**
 * Choose the API implementation:
 * - Mock when VITE_USE_MOCK is not explicitly 'false' (default)…
 * - …or when no backend URL is configured.
 * - Otherwise, talk to the real backend at VITE_BACKEND_API_URL.
 */
export function createApiClient(): ILearnGuardApiClient {
  const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
  const backendUrl = import.meta.env.VITE_BACKEND_API_URL;

  if (useMock || !backendUrl) {
    return new MockApiClient();
  }
  return new LearnGuardApiClient(backendUrl);
}

/** Shared application-wide API client. */
export const apiClient: ILearnGuardApiClient = createApiClient();
