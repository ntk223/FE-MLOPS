/**
 * API contract — aligned with the real backend (docs/API_CONTRACT.md v1.0).
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
 * Brief workflow — hiện CHỈ có ở mock client (backend M8 chưa triển khai,
 * xem docs/API_CONTRACT.md §2).
 */
export interface AdvisorBrief {
  briefId: number;
  predictionId: number;
  version: number;
  status: string;
  summary: string;
  reasons: Array<{ text: string; evidenceFeatures: string[] }>;
  supportSuggestions: string[];
  limitations: string[];
}

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}
