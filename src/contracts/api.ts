export type UserRole = 'advisor' | 'admin';

export type PredictionStatus =
  | 'scored'
  | 'insufficient_data'
  | 'manual_review'
  | 'no_prediction';

export interface AdvisorSession {
  accessToken: string;
  role: UserRole;
  displayName: string;
}

export interface StudentPrediction {
  predictionId: number;
  studentKey: string;
  moduleCode: string;
  presentationCode: string;
  riskScore: number | null;
  threshold: number | null;
  uncertainty: number | null;
  status: PredictionStatus;
  signals: PredictionSignal[];
}

export interface PredictionSignal {
  featureName: string;
  contribution: number;
  relation: 'higher_score' | 'lower_score';
}

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

export interface StudentFilters {
  riskState?: PredictionStatus;
  moduleCode?: string;
  presentationCode?: string;
  limit?: number;
  offset?: number;
}

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}
