import { LearnGuardApiClient } from './client';
import type { ILearnGuardApiClient } from './client';
import { MockApiClient } from '../mocks/mock-client';

/**
 * API implementation chooser (docs/API_CONTRACT.md §1–§2):
 *
 * - Mock mode (VITE_USE_MOCK !== 'false', hoặc không có backend URL):
 *   toàn bộ qua MockApiClient.
 * - Real mode (VITE_USE_MOCK === 'false' + VITE_BACKEND_API_URL):
 *   predictions chạy real API; **auth và briefs vẫn qua mock** vì backend
 *   chưa triển khai M6 auth / M8 briefs — hybrid routing giữ UI dùng được
 *   mà không gửi credential thật đến endpoint nào.
 */
export function createApiClient(): ILearnGuardApiClient {
  const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
  const backendUrl = import.meta.env.VITE_BACKEND_API_URL;

  if (useMock || !backendUrl) {
    return new MockApiClient();
  }

  const real = new LearnGuardApiClient(backendUrl);
  const mock = new MockApiClient();

  const hybrid: ILearnGuardApiClient = {
    // Real API — ml_predictions (read-only).
    listPredictions: (filters) => real.listPredictions(filters),
    getPrediction: (ref) => real.getPrediction(ref),
    listPredictionsForStudent: (studentKey) =>
      real.listPredictionsForStudent(studentKey),

    // Mock — chờ backend M6 (auth) và M8 (briefs).
    login: (credentials) => mock.login(credentials),
    generateBrief: (predictionId) => mock.generateBrief(predictionId),
    saveBriefDecision: (briefId, action, feedback) =>
      mock.saveBriefDecision(briefId, action, feedback),
  };
  return hybrid;
}

/** Shared application-wide API client. */
export const apiClient: ILearnGuardApiClient = createApiClient();
