import type {
  AdvisorBrief,
  AdvisorSession,
  BriefDecision,
  BriefEdits,
  BriefStatus,
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
 * Aggregated counts for the advisor dashboard summary strip.
 * All counts are computed over the mock/backend dataset AFTER applying
 * the given filters (not paginated).
 */
export interface QueueStats {
  /** Total flagged students after filters. */
  flaggedTotal: number;
  /** Items with status = scored. */
  scored: number;
  /** Items with status = insufficient_data. */
  insufficientData: number;
  /** Items with status = manual_review. */
  manualReview: number;
  /** Items with status = no_prediction. */
  noPrediction: number;
  /** Scored items whose riskScore >= threshold. */
  aboveThreshold: number;
}

/**
 * Trạng thái của 1 check trong scorecard đánh giá tự động (§1.11).
 * Status lạ từ backend → 'skipped' (hiển thị xám, không crash).
 */
export type EvaluationCheckStatus = 'pass' | 'warn' | 'fail' | 'skipped';

/** Bộ đếm tổng hợp của 1 scorecard / 1 run đánh giá. */
export interface EvaluationSummaryCounts {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  skipped: number;
}

/** Một dòng trong GET /evaluations — tóm tắt 1 lần chạy đánh giá (§1.11). */
export interface EvaluationRunSummary {
  runId: string;
  createdAt: string;
  /** Các subject (gate) đã đánh giá: 'data' | 'ml' | 'llm' | … */
  subjects: string[];
  combinedSummary: EvaluationSummaryCounts;
  overallStatus: EvaluationCheckStatus;
  /** Tên file report có sẵn (eval_data.json, eval_ml.json, …). */
  reportsAvailable: string[];
}

/** Kết quả GET /evaluations. */
export interface EvaluationRunListResult {
  runs: EvaluationRunSummary[];
  total: number;
  limit: number;
}

/** Một check trong bảng scorecard — observed/threshold đã format thành chuỗi. */
export interface EvaluationCheck {
  id: string;
  name: string;
  status: EvaluationCheckStatus;
  /** Ngưỡng đã format; null nếu check không có ngưỡng. */
  threshold: string | null;
  /** Giá trị quan sát được, đã format gọn (object → "key: value · …"). */
  observed: string;
  details: string;
}

/** Scorecard của 1 subject (data/ml/llm) trong GET /evaluations/{run_id}. */
export interface EvaluationScorecard {
  schemaVersion: string;
  runId: string;
  subject: string;
  createdAt: string;
  inputs: string;
  checks: EvaluationCheck[];
  summary: EvaluationSummaryCounts;
}

/** Chi tiết 1 lần đánh giá — 1 scorecard cho mỗi subject đã chạy. */
export interface EvaluationDetail {
  runId: string;
  createdAt: string;
  /** Scorecard theo subject, đã sort theo thứ tự data → ml → llm → còn lại. */
  reports: EvaluationScorecard[];
}

/**
 * Contract shared by the real client and the mock client
 * (docs/API_CONTRACT.md v1.1). Auth vẫn chỉ có ở mock cho đến khi backend
 * ships M6; briefs đã chạy real API (M8).
 */
export interface ILearnGuardApiClient {
  login(credentials: LoginCredentials): Promise<AdvisorSession>;
  listPredictions(filters: StudentFilters): Promise<PredictionPage>;
  getQueueStats(filters: StudentFilters): Promise<QueueStats>;
  getPrediction(ref: PredictionRef): Promise<StudentPrediction>;
  listPredictionsForStudent(studentKey: string): Promise<PredictionPage>;
  /** Định danh dự đoán = PK composite (không có predictionId numeric). */
  generateBrief(ref: PredictionRef): Promise<AdvisorBrief>;
  /**
   * PUT /briefs/{brief_id} — chỉnh sửa nội dung brief (§1.10). Không đổi
   * version (chỉ regenerate mới tăng), không đổi status/decision.
   */
  editBrief(briefId: number, edits: BriefEdits): Promise<AdvisorBrief>;
  saveBriefDecision(
    briefId: number,
    decision: 'accepted' | 'rejected',
  ): Promise<BriefDecision>;
  /**
   * GET /evaluations?limit=… (§1.11) — danh sách lần chạy đánh giá tự động
   * (3 gates: data / ml / llm), mới nhất trước.
   */
  listEvaluations(limit?: number): Promise<EvaluationRunListResult>;
  /**
   * GET /evaluations/{run_id} (§1.11) — scorecard chi tiết của 1 lần chạy.
   * Lỗi: 404 evaluation_not_found, 503 evaluations_dir_not_configured.
   */
  getEvaluation(runId: string): Promise<EvaluationDetail>;
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
  /** Backend trả array đã parse (API_CONTRACT v1.1 §1.5). Nhận cả string cho phòng thủ. */
  top_signals?: unknown;
  /** Backend đã parse features_json thành object trước khi trả. */
  features?: Record<string, number | null> | null;
  run_id: string;
  scored_at: string | null;
}

interface RawPage {
  items: RawPrediction[];
  total: number;
  limit: number;
  offset: number;
}

/** BriefOut của backend (POST /briefs/generate, GET /briefs/{brief_id}). */
interface RawBrief {
  brief_id: number;
  code_module: string;
  code_presentation: string;
  student_key: string;
  version: number;
  status: string;
  summary: string;
  reasons: Array<{ text?: unknown; evidence_features?: unknown }> | null;
  support_suggestions: unknown;
  limitations: unknown;
  model_name?: string | null;
  latency_ms?: number | null;
  created_at?: string | null;
  /** PUT/GET briefs trả edited_at (§1.10); generate có thể không gửi — optional. */
  edited_at?: string | null;
}

/** Body PUT /briefs/{brief_id} — snake_case (docs/API_CONTRACT.md §1.10). */
interface RawBriefEdits {
  summary?: string;
  reasons?: Array<{ text: string; evidence_features: string[] }>;
  support_suggestions?: string[];
  limitations?: string[];
}

/** Kết quả POST /briefs/{brief_id}/decision. */
interface RawBriefDecision {
  brief_id: number;
  decision: string;
  decided_at: string;
}

const BRIEF_BACKEND_STATUSES: readonly BriefStatus[] = [
  'generated',
  'fallback_review',
  'unavailable',
];

/** Lọc defensively reasons — entry thiếu text/evidence không làm crash UI. */
function sanitizeBriefReasons(
  raw: RawBrief['reasons'],
): Array<{ text: string; evidenceFeatures: string[] }> {
  if (!Array.isArray(raw)) {
    return [];
  }
  const reasons: Array<{ text: string; evidenceFeatures: string[] }> = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record['text'] !== 'string') {
      continue;
    }
    const evidence = Array.isArray(record['evidence_features'])
      ? record['evidence_features'].filter(
          (name): name is string => typeof name === 'string',
        )
      : [];
    reasons.push({ text: record['text'], evidenceFeatures: evidence });
  }
  return reasons;
}

/** Lọc defensively mảng string (support_suggestions / limitations). */
function sanitizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string');
}

function toBrief(raw: RawBrief): AdvisorBrief {
  const status = BRIEF_BACKEND_STATUSES.includes(raw.status as BriefStatus)
    ? (raw.status as BriefStatus)
    : 'unavailable';
  return {
    briefId: raw.brief_id,
    codeModule: raw.code_module,
    codePresentation: raw.code_presentation,
    studentKey: raw.student_key,
    version: raw.version,
    status,
    summary: raw.summary,
    reasons: sanitizeBriefReasons(raw.reasons),
    supportSuggestions: sanitizeStringList(raw.support_suggestions),
    limitations: sanitizeStringList(raw.limitations),
    modelName: raw.model_name ?? null,
    latencyMs: raw.latency_ms ?? null,
    createdAt: raw.created_at ?? null,
    editedAt: raw.edited_at ?? null,
  };
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

/** Lọc defensively object features từ backend — chỉ giữ number/null. */
function sanitizeFeatures(
  raw: Record<string, number | null> | null | undefined,
): Record<string, number | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const features: Record<string, number | null> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (value === null) {
      features[name] = null;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      features[name] = value;
    }
  }
  return features;
}

/** Parse top_signals_json defensively — a malformed payload never crashes UI. */
function parseTopSignals(raw: unknown): PredictionSignal[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    // Tương thích hợp cũ: một số phiên bản backend trả JSON string.
    if (!raw) {
      return [];
    }
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
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

/** Body GET /evaluations (§1.11) — snake_case từ backend. */
interface RawEvaluationList {
  runs?: unknown;
  total?: unknown;
  limit?: unknown;
}

/** Một dòng trong GET /evaluations — snake_case từ backend. */
interface RawEvaluationRunSummary {
  run_id?: unknown;
  created_at?: unknown;
  subjects?: unknown;
  combined_summary?: unknown;
  overall_status?: unknown;
  reports_available?: unknown;
}

/** Một check trong scorecard — snake_case từ backend (§1.11). */
interface RawEvaluationCheck {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  threshold?: unknown;
  observed?: unknown;
  details?: unknown;
}

/** Scorecard của 1 subject — snake_case từ backend (§1.11). */
interface RawEvaluationScorecard {
  schema_version?: unknown;
  run_id?: unknown;
  subject?: unknown;
  created_at?: unknown;
  inputs?: unknown;
  checks?: unknown;
  summary?: unknown;
}

/** Body GET /evaluations/{run_id} — snake_case từ backend. */
interface RawEvaluationDetail {
  run_id?: unknown;
  created_at?: unknown;
  reports?: unknown;
}

const CHECK_STATUSES: readonly EvaluationCheckStatus[] = [
  'pass',
  'warn',
  'fail',
  'skipped',
];

/** Thứ tự hiển thị ưu tiên cho các subject (gate). */
const SUBJECT_ORDER: readonly string[] = ['data', 'ml', 'llm'];

function subjectRank(subject: string): number {
  const index = SUBJECT_ORDER.indexOf(subject);
  return index === -1 ? SUBJECT_ORDER.length : index;
}

/**
 * Format 1 giá trị observed/threshold/inputs bất kỳ thành chuỗi gọn:
 * object → "key: value · key: value", array → nối bằng ", ",
 * scalar → String(value), null/undefined → "—". Payload hỏng không crash UI.
 */
export function formatEvaluationValue(raw: unknown): string {
  if (raw === null || raw === undefined) {
    return '—';
  }
  if (typeof raw === 'string') {
    return raw;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => formatEvaluationValue(item)).join(', ');
  }
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${formatEvaluationValue(value)}`)
      .join(' · ');
  }
  return String(raw);
}

/** Đọc bộ đếm summary defensively — thiếu/hỏng trường nào về 0. */
function toSummaryCounts(raw: unknown): EvaluationSummaryCounts {
  const record =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const count = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return {
    total: count(record['total']),
    pass: count(record['pass']),
    warn: count(record['warn']),
    fail: count(record['fail']),
    skipped: count(record['skipped']),
  };
}

/** Map 1 check defensively — status lạ → 'skipped', thiếu id/name → fallback. */
function toEvaluationCheck(raw: RawEvaluationCheck, index: number): EvaluationCheck {
  const status = CHECK_STATUSES.includes(raw.status as EvaluationCheckStatus)
    ? (raw.status as EvaluationCheckStatus)
    : 'skipped';
  const id =
    typeof raw.id === 'string' && raw.id !== '' ? raw.id : `check-${index + 1}`;
  return {
    id,
    name:
      typeof raw.name === 'string' && raw.name !== ''
        ? raw.name
        : 'Kiểm tra không tên',
    status,
    threshold:
      raw.threshold === null || raw.threshold === undefined
        ? null
        : formatEvaluationValue(raw.threshold),
    observed: formatEvaluationValue(raw.observed),
    details: typeof raw.details === 'string' ? raw.details : '',
  };
}

/** Map 1 scorecard defensively — subject thiếu → dùng key của reports. */
function toEvaluationScorecard(
  raw: RawEvaluationScorecard,
  fallbackSubject: string,
): EvaluationScorecard {
  const checks = Array.isArray(raw.checks)
    ? raw.checks.map((entry, index) =>
        toEvaluationCheck(
          (typeof entry === 'object' && entry !== null
            ? entry
            : {}) as RawEvaluationCheck,
          index,
        ),
      )
    : [];
  return {
    schemaVersion:
      typeof raw.schema_version === 'string' ? raw.schema_version : '',
    runId: typeof raw.run_id === 'string' ? raw.run_id : '',
    subject:
      typeof raw.subject === 'string' && raw.subject !== ''
        ? raw.subject
        : fallbackSubject,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : '',
    inputs: formatEvaluationValue(raw.inputs),
    checks,
    summary: toSummaryCounts(raw.summary),
  };
}

/** Map 1 dòng danh sách evaluations defensively. */
function toEvaluationRunSummary(
  raw: RawEvaluationRunSummary,
): EvaluationRunSummary {
  const subjects = Array.isArray(raw.subjects)
    ? raw.subjects.filter((item): item is string => typeof item === 'string')
    : [];
  const reportsAvailable = Array.isArray(raw.reports_available)
    ? raw.reports_available.filter(
        (item): item is string => typeof item === 'string',
      )
    : [];
  return {
    runId: typeof raw.run_id === 'string' ? raw.run_id : '',
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : '',
    subjects: [...subjects].sort(
      (a, b) => subjectRank(a) - subjectRank(b) || a.localeCompare(b),
    ),
    combinedSummary: toSummaryCounts(raw.combined_summary),
    overallStatus: CHECK_STATUSES.includes(
      raw.overall_status as EvaluationCheckStatus,
    )
      ? (raw.overall_status as EvaluationCheckStatus)
      : 'skipped',
    reportsAvailable,
  };
}

/** Map chi tiết 1 run: reports object → mảng scorecard sort theo subject. */
function toEvaluationDetail(raw: RawEvaluationDetail): EvaluationDetail {
  let reports: EvaluationScorecard[] = [];
  if (
    typeof raw.reports === 'object' &&
    raw.reports !== null &&
    !Array.isArray(raw.reports)
  ) {
    reports = Object.entries(raw.reports as Record<string, unknown>).map(
      ([subject, value]) =>
        toEvaluationScorecard(
          (typeof value === 'object' && value !== null
            ? value
            : {}) as RawEvaluationScorecard,
          subject,
        ),
    );
  } else if (Array.isArray(raw.reports)) {
    reports = raw.reports.map((value, index) =>
      toEvaluationScorecard(
        (typeof value === 'object' && value !== null
          ? value
          : {}) as RawEvaluationScorecard,
        `subject-${index + 1}`,
      ),
    );
  }
  reports.sort((a, b) => subjectRank(a.subject) - subjectRank(b.subject));
  return {
    runId: typeof raw.run_id === 'string' ? raw.run_id : '',
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : '',
    reports,
  };
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
    topSignals: parseTopSignals(raw.top_signals),
    features: sanitizeFeatures(raw.features),
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

  async getQueueStats(_filters: StudentFilters): Promise<QueueStats> {
    // TODO(backend): GET /predictions/stats chưa triển khai — mock-stage only.
    throw new BackendNotImplementedError('predictions/stats');
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

  async generateBrief(ref: PredictionRef): Promise<AdvisorBrief> {
    // POST /briefs/generate — backend M8. LLM lỗi backend vẫn trả 200 với
    // status 'fallback_review'/'unavailable' (docs/API_CONTRACT.md §1.7).
    const raw = await this.request<RawBrief>('/briefs/generate', {
      method: 'POST',
      body: {
        code_module: ref.codeModule,
        code_presentation: ref.codePresentation,
        student_key: ref.studentKey,
      },
    });
    return toBrief(raw);
  }

  async editBrief(briefId: number, edits: BriefEdits): Promise<AdvisorBrief> {
    // PUT /briefs/{brief_id} — body snake_case, ít nhất 1 trường (§1.10).
    // Chỉ gửi các trường cố vấn thực sự chỉnh (evidence_features giữ nguyên).
    const body: RawBriefEdits = {};
    if (edits.summary !== undefined) {
      body.summary = edits.summary;
    }
    if (edits.reasons !== undefined) {
      body.reasons = edits.reasons.map((reason) => ({
        text: reason.text,
        evidence_features: [...reason.evidenceFeatures],
      }));
    }
    if (edits.supportSuggestions !== undefined) {
      body.support_suggestions = [...edits.supportSuggestions];
    }
    if (edits.limitations !== undefined) {
      body.limitations = [...edits.limitations];
    }
    const raw = await this.request<RawBrief>(
      `/briefs/${encodeURIComponent(String(briefId))}`,
      { method: 'PUT', body },
    );
    return toBrief(raw);
  }

  async saveBriefDecision(
    briefId: number,
    decision: 'accepted' | 'rejected',
  ): Promise<BriefDecision> {
    // POST /briefs/{brief_id}/decision — body {"decision": "accepted"|"rejected"}.
    const raw = await this.request<RawBriefDecision>(
      `/briefs/${encodeURIComponent(String(briefId))}/decision`,
      {
        method: 'POST',
        body: { decision },
      },
    );
    return {
      briefId: raw.brief_id,
      decision: raw.decision === 'rejected' ? 'rejected' : 'accepted',
      decidedAt: raw.decided_at,
    };
  }

  async listEvaluations(limit?: number): Promise<EvaluationRunListResult> {
    // GET /evaluations?limit=… (§1.11) — backend trả snake_case.
    const params = new URLSearchParams();
    if (limit !== undefined) {
      params.set('limit', String(limit));
    }
    const query = params.toString();
    const raw = await this.request<RawEvaluationList>(
      query !== '' ? `/evaluations?${query}` : '/evaluations',
    );
    const runs = Array.isArray(raw.runs)
      ? raw.runs.map((entry) =>
          toEvaluationRunSummary(
            (typeof entry === 'object' && entry !== null
              ? entry
              : {}) as RawEvaluationRunSummary,
          ),
        )
      : [];
    return {
      runs,
      total:
        typeof raw.total === 'number' && Number.isFinite(raw.total)
          ? raw.total
          : runs.length,
      limit:
        typeof raw.limit === 'number' && Number.isFinite(raw.limit)
          ? raw.limit
          : (limit ?? 20),
    };
  }

  async getEvaluation(runId: string): Promise<EvaluationDetail> {
    // GET /evaluations/{run_id} (§1.11) — 404 evaluation_not_found,
    // 503 evaluations_dir_not_configured → HTTP_404/HTTP_503 qua toApiError.
    const raw = await this.request<RawEvaluationDetail>(
      `/evaluations/${encodeURIComponent(runId)}`,
    );
    return toEvaluationDetail(raw);
  }

  private async request<T>(
    path: string,
    init?: { method?: 'POST' | 'PUT'; body?: unknown },
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: init?.method ?? 'GET',
        signal: controller.signal,
        headers:
          init?.body !== undefined
            ? { Accept: 'application/json', 'Content-Type': 'application/json' }
            : { Accept: 'application/json' },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
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
