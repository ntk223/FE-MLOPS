import { LearnGuardApiClient } from './client';
import type { ILearnGuardApiClient } from './client';
import { MockApiClient } from '../mocks/mock-client';

/**
 * API implementation chooser (docs/API_CONTRACT.md §1–§2):
 *
 * - Mock mode (VITE_USE_MOCK !== 'false', hoặc không có backend URL):
 *   toàn bộ qua MockApiClient.
 * - Real mode (VITE_USE_MOCK === 'false' + VITE_BACKEND_API_URL):
 *   predictions, briefs (M8) và evaluations (§1.11) chạy real API; **auth vẫn
 *   qua mock** vì backend chưa triển khai M6 — hybrid routing giữ UI dùng
 *   được mà không gửi credential thật đến endpoint nào.
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
    // Real API — ml_predictions (read-only) + briefs (M8) + evaluations (§1.11).
    listPredictions: (filters) => real.listPredictions(filters),
    getPrediction: (ref) => real.getPrediction(ref),
    listPredictionsForStudent: (studentKey) =>
      real.listPredictionsForStudent(studentKey),
    generateBrief: (ref) => real.generateBrief(ref),
    editBrief: (briefId, edits) => real.editBrief(briefId, edits),
    saveBriefDecision: (briefId, decision) =>
      real.saveBriefDecision(briefId, decision),
    listEvaluations: (limit) => real.listEvaluations(limit),
    getEvaluation: (runId) => real.getEvaluation(runId),
    // FROZEN CONTRACT §1–§2 — chạy đánh giá thủ công + poll trạng thái.
    triggerEvaluationRun: () => real.triggerEvaluationRun(),
    getEvaluationRunStatus: () => real.getEvaluationRunStatus(),
    // GET /audit-logs (§1.12).
    listAuditLogs: (params) => real.listAuditLogs(params),
    // GET /predictions/stats — thống kê hàng đợi cho trang Tổng quan.
    getQueueStats: (filters) => real.getQueueStats(filters),
    // GET /predictions/{m}/{p}/{s}/activity (§1.13) — backend đang code song song.
    getStudentActivity: (ref) => real.getStudentActivity(ref),
    // Advisor Copilot Chatbot Endpoints (/briefs/chat/...)
    getQuickPrompts: () =>
      real.getQuickPrompts().catch((err) => {
        console.warn('[API Client] real.getQuickPrompts failed, falling back to mock:', err);
        return mock.getQuickPrompts();
      }),
    createOrResumeChatSession: (params) =>
      real
        .createOrResumeChatSession(params)
        .catch((err) => {
          console.warn('[API Client] real.createOrResumeChatSession failed, falling back to mock:', err);
          return mock.createOrResumeChatSession(params);
        }),
    getChatSession: (id) =>
      real.getChatSession(id).catch((err) => {
        console.warn('[API Client] real.getChatSession failed, falling back to mock:', err);
        return mock.getChatSession(id);
      }),
    listChatMessages: (id, l, o) =>
      real.listChatMessages(id, l, o).catch((err) => {
        console.warn('[API Client] real.listChatMessages failed, falling back to mock:', err);
        return mock.listChatMessages(id, l, o);
      }),
    sendChatMessage: (id, c) =>
      real.sendChatMessage(id, c).catch((err) => {
        console.warn('[API Client] real.sendChatMessage failed, falling back to mock:', err);
        return mock.sendChatMessage(id, c);
      }),
    finalizeChatToBrief: (id, p) =>
      real.finalizeChatToBrief(id, p).catch((err) => {
        console.warn('[API Client] real.finalizeChatToBrief failed, falling back to mock:', err);
        return mock.finalizeChatToBrief(id, p);
      }),

    // Mock — chờ backend M6 (auth).
    login: (credentials) => mock.login(credentials),
  };
  return hybrid;
}

/** Shared application-wide API client. */
export const apiClient: ILearnGuardApiClient = createApiClient();
