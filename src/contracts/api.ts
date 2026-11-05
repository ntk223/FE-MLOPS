/**
 * API contract — aligned with the real backend (docs/API_CONTRACT.md v1.1).
 *
 * Source of truth: backend OpenAPI (GET /docs) at VITE_BACKEND_API_URL.
 * Field naming: backend returns snake_case; this layer maps to camelCase.
 */

export type UserRole = 'advisor' | 'admin';

/** 4 giá trị khớp PredictionStatus phía pipeline (ml-data scoring.py). */
export type PredictionStatus =
  | 'scored'
  | 'insufficient_data'
  | 'manual_review'
  | 'no_prediction';

export type ReviewReason =
  | 'insufficient_data'
  | 'high_uncertainty'
  | 'no_prediction';

export type PredictionOrderBy = 'risk_score' | 'uncertainty' | 'scored_at';

export interface AdvisorSession {
  accessToken: string;
  role: UserRole;
  displayName: string;
}

/** Một signal trong top_signals (max 5, parsed từ top_signals_json). */
export interface PredictionSignal {
  featureName: string;
  contribution: number;
  direction: 'increases_risk' | 'decreases_risk';
}

/**
 * Một dòng ml_predictions (luôn là dự đoán mới nhất — upsert semantics).
 * Định danh = PK composite (codeModule, codePresentation, studentKey);
 * KHÔNG có predictionId trong API thật.
 */
export interface StudentPrediction {
  codeModule: string;
  codePresentation: string;
  studentKey: string;
  split: string;
  riskScore: number | null;
  predictedLabel: 0 | 1 | null;
  threshold: number | null;
  uncertainty: number | null;
  status: PredictionStatus;
  reviewReason: ReviewReason | null;
  modelVersion: string;
  snapshotVersion: string;
  cutoffDay: number;
  topSignals: PredictionSignal[];
  /** Thống kê hành vi/học thuật gốc của SV tại cutoff (features_json). */
  features: Record<string, number | null>;
  runId: string;
  scoredAt: string | null;
}

export interface PredictionPage {
  items: StudentPrediction[];
  total: number;
  limit: number;
  offset: number;
}

export interface StudentFilters {
  status?: PredictionStatus;
  codeModule?: string;
  codePresentation?: string;
  studentKey?: string;
  orderBy?: PredictionOrderBy;
  limit?: number;
  offset?: number;
}

/** Định danh dự đoán — PK composite của ml_predictions. */
export interface PredictionRef {
  codeModule: string;
  codePresentation: string;
  studentKey: string;
}

/**
 * Trạng thái brief trả về từ backend (BriefOut, M8):
 * - `generated`: LLM sinh brief thành công.
 * - `fallback_review`: LLM lỗi → backend trả brief dự phòng (template) cho
 *   cố vấn tự xem xét — backend KHÔNG bao giờ trả 500 vì lỗi LLM.
 * - `unavailable`: LLM không cấu hình/không phản hồi — không có nội dung brief.
 * `accepted`/`rejected` chỉ tồn tại ở mock client (demo workflow); backend
 * theo dõi quyết định riêng qua `POST /briefs/{id}/decision` (BriefDecision).
 */
export type BriefStatus =
  | 'generated'
  | 'fallback_review'
  | 'unavailable'
  | 'accepted'
  | 'rejected';

/**
 * Brief tư vấn — khớp BriefOut của backend (docs/API_CONTRACT.md §1.7).
 * Định danh dự đoán liên quan = PK composite (không có predictionId numeric
 * trong API thật).
 */
export interface AdvisorBrief {
  briefId: number;
  codeModule: string;
  codePresentation: string;
  studentKey: string;
  /** Backend tự tăng mỗi lần regenerate cùng 1 dự đoán. */
  version: number;
  status: BriefStatus;
  summary: string;
  reasons: Array<{ text: string; evidenceFeatures: string[] }>;
  supportSuggestions: string[];
  limitations: string[];
  /** Tên model LLM đã dùng (ví dụ "gemini/gemini-3.1-flash-lite"). */
  modelName?: string | null;
  latencyMs?: number | null;
  createdAt?: string | null;
  /**
   * Thời điểm cố vấn sửa nội dung brief lần cuối (PUT /briefs/{id}, §1.10).
   * null/undefined nếu chưa từng sửa; regenerate (LLM mới) reset về null.
   */
  editedAt?: string | null;
}

/**
 * Body của PUT /briefs/{brief_id} (docs/API_CONTRACT.md §1.10).
 * Tất cả trường optional nhưng phải có ít nhất 1 trường; edit KHÔNG đổi
 * version/status/decision — chỉ chỉnh nội dung do cố vấn soạn lại.
 */
export interface BriefEdits {
  summary?: string;
  reasons?: Array<{ text: string; evidenceFeatures: string[] }>;
  supportSuggestions?: string[];
  limitations?: string[];
}

/** Kết quả ghi nhận quyết định của cố vấn (POST /briefs/{id}/decision). */
export interface BriefDecision {
  briefId: number;
  decision: 'accepted' | 'rejected';
  decidedAt: string;
}

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}
