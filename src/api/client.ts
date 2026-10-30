import type {
  AdvisorBrief,
  AdvisorSession,
  PredictionPage,
  PredictionRef,
  PredictionSignal,
  PredictionStatus,
  ReviewReason,
  StudentFilters,
  StudentPrediction,
} from '../contracts/api';

export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Contract shared by the real client and the mock client
 * (docs/API_CONTRACT.md v1.0). Auth and briefs exist only on the mock until
 * the backend ships M6 auth and M8 brief endpoints.
 */
export interface ILearnGuardApiClient {
  login(credentials: LoginCredentials): Promise<AdvisorSession>;
  listPredictions(filters: StudentFilters): Promise<PredictionPage>;
  getPrediction(ref: PredictionRef): Promise<StudentPrediction>;
  listPredictionsForStudent(studentKey: string): Promise<PredictionPage>;
  generateBrief(predictionId: number): Promise<AdvisorBrief>;
  saveBriefDecision(
    briefId: number,
    action: 'accept' | 'reject',
    feedback?: string,
  ): Promise<AdvisorBrief>;
}

const REQUEST_TIMEOUT_MS = 15_000;

export class BackendNotImplementedError extends Error {
  readonly feature: string;

  constructor(feature: string) {
    super(
      `Backend chưa hỗ trợ tính năng "${feature}". ` +
        'Xem docs/API_CONTRACT.md §2 — tính năng này đang chạy mock.',
    );
    this.feature = feature;
    this.name = 'BackendNotImplementedError';
  }
}

interface RawPrediction {
  code_module: string;
  code_presentation: string;
  student_key: string;
  split: string;
  risk_score: number | null;
  predicted_label: number | null;
  threshold: number | null;
  uncertainty: number | null;
  status: string;
  review_reason: string | null;
  model_version: string;
  snapshot_version: string;
  cutoff_day: number;
  top_signals_json: string | null;
  run_id: string;
  scored_at: string | null;
}

interface RawPage {
  items: RawPrediction[];
  total: number;
  limit: number;
  offset: number;
}

const STATUSES: readonly PredictionStatus[] = [
  'scored',
  'insufficient_data',
  'manual_review',
  'no_prediction',
];

const REVIEW_REASONS: readonly ReviewReason[] = [
  'insufficient_data',
  'high_uncertainty',
  'no_prediction',
];

/** Parse top_signals_json defensively — a malformed payload never crashes UI. */
function parseTopSignals(raw: string | null): PredictionSignal[] {
  if (!raw) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const signals: PredictionSignal[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const featureName = record['feature_name'];
    const contribution = record['contribution'];
    const direction = record['direction'];
    if (typeof featureName !== 'string') {
      continue;
    }
    if (typeof contribution !== 'number' || !Number.isFinite(contribution)) {
      continue;
    }
    if (direction !== 'increases_risk' && direction !== 'decreases_risk') {
      continue;
    }
    signals.push({ featureName, contribution, direction });
  }
  return signals;
}

function toPrediction(raw: RawPrediction): StudentPrediction {
  const status = STATUSES.includes(raw.status as PredictionStatus)
    ? (raw.status as PredictionStatus)
    : 'no_prediction';
  const reviewReason =
    raw.review_reason !== null &&
    REVIEW_REASONS.includes(raw.review_reason as ReviewReason)
      ? (raw.review_reason as ReviewReason)
      : null;
  return {
    codeModule: raw.code_module,
    codePresentation: raw.code_presentation,
    studentKey: raw.student_key,
    split: raw.split,
    riskScore: raw.risk_score,
    predictedLabel:
      raw.predicted_label === 0 || raw.predicted_label === 1
        ? raw.predicted_label
        : null,
    threshold: raw.threshold,
    uncertainty: raw.uncertainty,
    status,
    reviewReason,
    modelVersion: raw.model_version,
    snapshotVersion: raw.snapshot_version,
    cutoffDay: raw.cutoff_day,
    topSignals: parseTopSignals(raw.top_signals_json),
    runId: raw.run_id,
    scoredAt: raw.scored_at,
  };
}

export class LearnGuardApiClient implements ILearnGuardApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
  ) {}

  async login(_credentials: LoginCredentials): Promise<AdvisorSession> {
    // Backend M6 auth chưa triển khai — docs/API_CONTRACT.md §2.
    throw new BackendNotImplementedError('auth/login');
  }

  async listPredictions(filters: StudentFilters): Promise<PredictionPage> {
    const params = new URLSearchParams();
    if (filters.status !== undefined) {
      params.set('status', filters.status);
    }
    if (filters.codeModule !== undefined && filters.codeModule !== '') {
      params.set('code_module', filters.codeModule);
    }
    if (
      filters.codePresentation !== undefined &&
      filters.codePresentation !== ''
    ) {
      params.set('code_presentation', filters.codePresentation);
    }
    if (filters.studentKey !== undefined && filters.studentKey !== '') {
      params.set('student_key', filters.studentKey);
    }
    if (filters.orderBy !== undefined) {
      params.set('order_by', filters.orderBy);
    }
    if (filters.limit !== undefined) {
      params.set('limit', String(filters.limit));
    }
    if (filters.offset !== undefined) {
      params.set('offset', String(filters.offset));
    }
    const page = await this.request<RawPage>(`/predictions?${params}`);
    return {
      items: page.items.map(toPrediction),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }

  async listPredictionsForStudent(studentKey: string): Promise<PredictionPage> {
    const page = await this.request<RawPage>(
      `/predictions/by-student/${encodeURIComponent(studentKey)}`,
    );
    return {
      items: page.items.map(toPrediction),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }

  async getPrediction(ref: PredictionRef): Promise<StudentPrediction> {
    const path =
      `/predictions/${encodeURIComponent(ref.codeModule)}` +
      `/${encodeURIComponent(ref.codePresentation)}` +
      `/${encodeURIComponent(ref.studentKey)}`;
    const raw = await this.request<RawPrediction>(path);
    return toPrediction(raw);
  }

  async generateBrief(_predictionId: number): Promise<AdvisorBrief> {
    // Backend M8 briefs chưa triển khai — docs/API_CONTRACT.md §2.
    throw new BackendNotImplementedError('briefs/generate');
  }

  async saveBriefDecision(
    _briefId: number,
    _action: 'accept' | 'reject',
    _feedback?: string,
  ): Promise<AdvisorBrief> {
    throw new BackendNotImplementedError('briefs/decision');
  }

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch (cause) {
      // AbortError bọc cả timeout; network fail cũng vào đây.
      throw this.toApiError(0, cause);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw this.toApiError(response.status, await this.readDetail(response));
    }
    return (await response.json()) as T;
  }

  private async readDetail(response: Response): Promise<string> {
    try {
      const body: unknown = await response.json();
      if (
        typeof body === 'object' &&
        body !== null &&
        typeof (body as Record<string, unknown>)['detail'] === 'string'
      ) {
        return (body as Record<string, unknown>)['detail'] as string;
      }
      return JSON.stringify(body);
    } catch {
      return response.statusText;
    }
  }

  private toApiError(status: number, cause: unknown): ApiErrorLike {
    if (status === 0) {
      return {
        code: 'NETWORK_ERROR',
        message:
          'Không kết nối được backend. Kiểm tra VITE_BACKEND_API_URL và thử lại.',
        requestId: undefined,
      };
    }
    const detail = typeof cause === 'string' ? cause : 'Yêu cầu thất bại.';
    return { code: `HTTP_${status}`, message: detail };
  }
}

interface ApiErrorLike {
  code: string;
  message: string;
  requestId?: string;
}
