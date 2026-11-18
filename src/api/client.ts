import type {
  AdvisorBrief,
  AdvisorSession,
  BriefDecision,
  BriefEdits,
  BriefStatus,
  ChatMessage,
  ChatMessageRole,
  ChatSession,
  ChatSessionStatus,
  CitedEvidence,
  CreateChatSessionParams,
  FinalizeBriefParams,
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
  /**
   * Raw observed giữ nguyên shape gốc khi parse được (object) — dùng cho
   * render chuyên biệt (vd. bảng điểm judge_quality). undefined nếu observed
   * là string/scalar thuần.
   */
  observedRaw?: Record<string, unknown>;
  details: string;
}

/* ------------------------------------------------------------------ */
/* Bảng điểm judge (check 'judge_quality', subject 'llm')              */
/* ------------------------------------------------------------------ */

/** 1 dòng brief trong observedRaw.per_brief của check judge_quality. */
export interface EvaluationJudgeRow {
  /** Nhãn brief (brief_id / student_key / …) — fallback "<brief N>". */
  brief: string;
  grounded: number | null;
  useful: number | null;
  noFabrication: number | null;
  clarity: number | null;
  overall: number | null;
  /** Ghi chú / issues của judge (nếu có). */
  notes: string;
}

function judgeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function judgeBriefLabel(record: Record<string, unknown>, index: number): string {
  for (const key of ['brief', 'brief_id', 'student_key', 'name']) {
    if (typeof record[key] === 'string' && record[key] !== '') {
      return record[key] as string;
    }
    if (typeof record[key] === 'number' && Number.isFinite(record[key])) {
      return String(record[key]);
    }
  }
  return `<brief ${index + 1}>`;
}

function judgeNotes(record: Record<string, unknown>): string {
  for (const key of ['issues', 'notes', 'note', 'ghi_chu']) {
    if (typeof record[key] === 'string' && record[key] !== '') {
      return record[key];
    }
  }
  return '';
}

/**
 * Parse observedRaw.per_brief thành các dòng bảng điểm judge — payload hỏng
 * (không phải array / entry thiếu dữ liệu) → rỗng, không crash UI.
 */
export function parseJudgeRows(raw: unknown): EvaluationJudgeRow[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const rows: EvaluationJudgeRow[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    rows.push({
      brief: judgeBriefLabel(record, index),
      grounded: judgeNumber(record['grounded']),
      useful: judgeNumber(record['useful']),
      noFabrication: judgeNumber(record['no_fabrication']),
      clarity: judgeNumber(record['clarity']),
      overall: judgeNumber(record['overall']),
      notes: judgeNotes(record),
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Run đánh giá thủ công (POST /evaluations/run + GET /evaluations/run-status) */
/* ------------------------------------------------------------------ */

/** Trạng thái của lần chạy đánh giá thủ công gần nhất. */
export type EvaluationRunStatus = 'idle' | 'running' | 'done' | 'error';

/** Body GET /evaluations/run-status (FROZEN CONTRACT §2). */
export interface EvaluationRunStatusInfo {
  status: EvaluationRunStatus;
  runId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** Tổng hợp CombinedSummary — null khi chưa xong. */
  summary: EvaluationSummaryCounts | null;
  /** Text lỗi khi status = 'error'. */
  error: string | null;
}

/** Body POST /evaluations/run → 202 {"run_id": "...", "status": "started"}. */
export interface EvaluationTriggerResult {
  runId: string;
  status: string;
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

/* ------------------------------------------------------------------ */
/* Nhật ký hệ thống — GET /audit-logs (§1.12)                          */
/* ------------------------------------------------------------------ */

/** Một dòng nhật ký hệ thống (audit_logs) — đã map sang camelCase. */
export interface AuditLog {
  logId: string;
  /** ISO-8601 — thời điểm ghi log. */
  at: string;
  /** null → hệ thống tự động (hiển thị "Hệ thống"). */
  userId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  /** vd. brief_generate, decision_accept, evaluation_run, login_success… */
  action: string;
  /** vd. briefs, evaluations, predictions, auth… */
  entity: string;
  entityId: string | null;
  /** Payload bổ sung (object tùy hành động) — null nếu không có. */
  payload: Record<string, unknown> | null;
}

/** Kết quả GET /audit-logs. */
export interface AuditLogListResult {
  logs: AuditLog[];
  /** Tổng số log khớp bộ lọc (không giới hạn bởi limit). */
  total: number;
  limit: number;
  /** Danh sách action duy nhất — dùng cho bộ lọc "Hành động". */
  actions: string[];
  /** Danh sách entity duy nhất — dùng cho bộ lọc "Đối tượng". */
  entities: string[];
}

/** Tham số query GET /audit-logs (§1.12). */
export interface AuditLogQuery {
  limit?: number;
  action?: string;
  entity?: string;
}

/* ------------------------------------------------------------------ */
/* Hành vi 4 tuần trước ngày cắt — GET /predictions/.../activity (§1.13) */
/* ------------------------------------------------------------------ */

/** 1 bucket tuần trong chart hoạt động (đã map camelCase). */
export interface ActivityWeek {
  /** vd. "Trước khóa", "Tuần 1"… "Tuần 4". */
  label: string;
  /** Ngày bắt đầu bucket (âm = trước khi khóa bắt đầu). */
  fromDay: number;
  /** Ngày kết thúc bucket. */
  toDay: number;
  /** Tổng lượt click trong bucket. */
  clicks: number;
  /** Số ngày có hoạt động (≥ 1 click). */
  daysActive: number;
}

/** Trạng thái nộp bài của 1 bài assessed. */
export type ActivitySubmissionStatus = 'submitted' | 'not_submitted';

/** 1 bài nộp trong timeline (đã map camelCase). */
export interface ActivitySubmission {
  /** vd. "TMA", "CMA", "Exam". */
  assessmentType: string;
  /** Hạn nộp theo ngày khóa — null nếu backend không gửi. */
  assessmentDay: number | null;
  /** Ngày nộp thực tế — null khi chưa nộp / không có dữ liệu. */
  submittedDay: number | null;
  /** Điểm — null khi chưa chấm / chưa nộp. */
  score: number | null;
  /** Trọng số % — null nếu không có. */
  weight: number | null;
  status: ActivitySubmissionStatus;
}

/** 1 nhóm click theo category site (forum, resources, …). */
export interface ActivityCategory {
  category: string;
  clicks: number;
}

/** Body GET /predictions/{m}/{p}/{s}/activity (§1.13) — đã map camelCase. */
export interface StudentActivity {
  cutoffDay: number;
  weeks: ActivityWeek[];
  submissions: ActivitySubmission[];
  activityBreakdown: ActivityCategory[];
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
  /**
   * POST /evaluations/run (FROZEN CONTRACT §1) — kích hoạt đánh giá thủ công.
   * 202 {run_id, status:"started"}; lỗi: 409 evaluation_already_running,
   * 503 ml_runner_not_configured, 503 evaluations_dir_not_configured.
   */
  triggerEvaluationRun(): Promise<EvaluationTriggerResult>;
  /**
   * GET /evaluations/run-status (FROZEN CONTRACT §2) — trạng thái lần chạy
   * gần nhất; UI poll mỗi 2.5s khi running.
   */
  getEvaluationRunStatus(): Promise<EvaluationRunStatusInfo>;
  /**
   * GET /audit-logs?limit=&action=&entity= (§1.12) — nhật ký hệ thống,
   * mới nhất trước. Lỗi: 503 database_not_configured.
   */
  listAuditLogs(params?: AuditLogQuery): Promise<AuditLogListResult>;
  /**
   * GET /predictions/{module}/{presentation}/{studentKey}/activity (§1.13) —
   * hành vi 4 tuần trước ngày cắt: clicks theo tuần + timeline bài nộp.
   * Lỗi: 404 student_not_found, 503 oulad_data_not_configured.
   */
  getStudentActivity(ref: PredictionRef): Promise<StudentActivity>;
  /**
   * Advisor Copilot Chatbot Endpoints (/briefs/chat/...)
   */
  getQuickPrompts(): Promise<string[]>;
  createOrResumeChatSession(params: CreateChatSessionParams): Promise<ChatSession>;
  getChatSession(sessionId: number): Promise<ChatSession>;
  listChatMessages(
    sessionId: number,
    limit?: number,
    offset?: number,
  ): Promise<ChatMessage[]>;
  sendChatMessage(sessionId: number, content: string): Promise<ChatMessage>;
  finalizeChatToBrief(
    sessionId: number,
    params?: FinalizeBriefParams,
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

/** PredictionStatsOut của backend (GET /predictions/stats). */
interface RawQueueStats {
  flagged_total: number;
  scored: number;
  insufficient_data: number;
  manual_review: number;
  no_prediction: number;
  above_threshold: number;
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

interface RawChatSession {
  session_id: number;
  student_key: string;
  code_module: string;
  code_presentation: string;
  user_id: number;
  title: string;
  status: string;
  brief_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  quick_prompts?: string[];
}

function toChatSession(raw: RawChatSession): ChatSession {
  const status: ChatSessionStatus =
    raw.status === 'finalized' || raw.status === 'archived'
      ? raw.status
      : 'active';
  return {
    sessionId: raw.session_id,
    studentKey: raw.student_key,
    codeModule: raw.code_module,
    codePresentation: raw.code_presentation,
    userId: raw.user_id,
    title: raw.title,
    status,
    briefId: raw.brief_id ?? null,
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
    quickPrompts: Array.isArray(raw.quick_prompts) ? raw.quick_prompts : [],
  };
}

interface RawChatMessage {
  message_id: number;
  session_id: number;
  role: string;
  content: string;
  cited_evidence?: Array<Record<string, unknown>>;
  tokens_used?: number;
  created_at: string | null;
}

function toChatMessage(raw: RawChatMessage): ChatMessage {
  const role: ChatMessageRole = raw.role === 'advisor' ? 'advisor' : 'assistant';
  const citedEvidence: CitedEvidence[] = Array.isArray(raw.cited_evidence)
    ? raw.cited_evidence.map((entry) => ({
        featureName:
          typeof entry['feature_name'] === 'string'
            ? entry['feature_name']
            : (typeof entry['feature'] === 'string' ? entry['feature'] : ''),
        observedValue: entry['observed_value'] ?? entry['value'],
        contribution:
          typeof entry['contribution'] === 'number'
            ? entry['contribution']
            : undefined,
        direction:
          typeof entry['direction'] === 'string'
            ? entry['direction']
            : undefined,
        description:
          typeof entry['description'] === 'string'
            ? entry['description']
            : undefined,
        ...entry,
      }))
    : [];
  return {
    messageId: raw.message_id,
    sessionId: raw.session_id,
    role,
    content: raw.content ?? '',
    citedEvidence,
    tokensUsed: typeof raw.tokens_used === 'number' ? raw.tokens_used : 0,
    createdAt: raw.created_at ?? null,
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

/** Body POST /evaluations/run → 202 (FROZEN CONTRACT §1). */
interface RawEvaluationTrigger {
  run_id?: unknown;
  status?: unknown;
}

/** Body GET /evaluations/run-status (FROZEN CONTRACT §2). */
interface RawEvaluationRunStatus {
  status?: unknown;
  run_id?: unknown;
  started_at?: unknown;
  finished_at?: unknown;
  summary?: unknown;
  error?: unknown;
}

/** Một dòng GET /audit-logs — snake_case từ backend (§1.12). */
interface RawAuditLog {
  log_id?: unknown;
  at?: unknown;
  user_id?: unknown;
  actor_email?: unknown;
  actor_name?: unknown;
  action?: unknown;
  entity?: unknown;
  entity_id?: unknown;
  payload?: unknown;
}

/** Body GET /audit-logs — snake_case từ backend (§1.12). */
interface RawAuditLogList {
  logs?: unknown;
  total?: unknown;
  limit?: unknown;
  actions?: unknown;
  entities?: unknown;
}

/** payload: object trực tiếp; JSON string hợp lệ → parse; khác → null. */
function toAuditPayload(raw: unknown): Record<string, unknown> | null {
  let candidate = raw;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return null;
    }
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    !Array.isArray(candidate)
  ) {
    return candidate as Record<string, unknown>;
  }
  return null;
}

/** Map 1 dòng audit log defensively — trường lạ/null về giá trị an toàn. */
function toAuditLog(raw: RawAuditLog): AuditLog {
  const nullableString = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;
  const stringOrNumber = (value: unknown): string | null => {
    if (typeof value === 'string' && value !== '') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  };
  return {
    logId: nullableString(raw.log_id) ?? `log-${Date.now()}`,
    at: nullableString(raw.at) ?? '',
    userId: nullableString(raw.user_id),
    actorEmail: nullableString(raw.actor_email),
    actorName: nullableString(raw.actor_name),
    action: nullableString(raw.action) ?? 'unknown',
    entity: nullableString(raw.entity) ?? 'unknown',
    entityId: stringOrNumber(raw.entity_id),
    payload: toAuditPayload(raw.payload),
  };
}

/** Map body GET /audit-logs defensively — mảng hỏng → rỗng, không crash UI. */
function toAuditLogList(
  raw: RawAuditLogList,
  fallbackLimit: number,
): AuditLogListResult {
  const logs = Array.isArray(raw.logs)
    ? raw.logs.map((entry) =>
        toAuditLog(
          (typeof entry === 'object' && entry !== null
            ? entry
            : {}) as RawAuditLog,
        ),
      )
    : [];
  const stringList = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  return {
    logs,
    total:
      typeof raw.total === 'number' && Number.isFinite(raw.total)
        ? raw.total
        : logs.length,
    limit:
      typeof raw.limit === 'number' && Number.isFinite(raw.limit)
        ? raw.limit
        : fallbackLimit,
    actions: stringList(raw.actions),
    entities: stringList(raw.entities),
  };
}

/* ---- Hành vi 4 tuần trước ngày cắt (§1.13) — snake_case từ backend ---- */

/** Body GET /predictions/{m}/{p}/{s}/activity — snake_case từ backend. */
interface RawStudentActivity {
  cutoff_day?: unknown;
  weeks?: unknown;
  submissions?: unknown;
  activity_breakdown?: unknown;
}

const ACTIVITY_SUBMISSION_STATUSES: readonly ActivitySubmissionStatus[] = [
  'submitted',
  'not_submitted',
];

/** Đọc số nguyên defensively — thiếu/lạ/thập phân lạ → fallback. */
function activityInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : fallback;
}

/** Đọc số nullable defensively — thiếu/lạ → null. */
function activityNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Map 1 bucket tuần defensively — trường thiếu về giá trị an toàn. */
function toActivityWeek(raw: unknown, index: number): ActivityWeek {
  const record =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    label:
      typeof record['label'] === 'string' && record['label'] !== ''
        ? record['label']
        : `Tuần ${index}`,
    fromDay: activityInt(record['from_day'], 0),
    toDay: activityInt(record['to_day'], 0),
    clicks: Math.max(0, activityInt(record['clicks'], 0)),
    daysActive: Math.max(0, activityInt(record['days_active'], 0)),
  };
}

/** Map 1 bài nộp defensively — status lạ → 'not_submitted', score null. */
function toActivitySubmission(raw: unknown): ActivitySubmission {
  const record =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const status = ACTIVITY_SUBMISSION_STATUSES.includes(
    record['status'] as ActivitySubmissionStatus,
  )
    ? (record['status'] as ActivitySubmissionStatus)
    : 'not_submitted';
  return {
    assessmentType:
      typeof record['assessment_type'] === 'string' &&
      record['assessment_type'] !== ''
        ? record['assessment_type']
        : 'N/A',
    assessmentDay: activityNullableNumber(record['assessment_day']),
    submittedDay: activityNullableNumber(record['submitted_day']),
    score: activityNullableNumber(record['score']),
    weight: activityNullableNumber(record['weight']),
    status,
  };
}

/** Map 1 dòng activity_breakdown defensively — category lạ vẫn giữ nguyên. */
function toActivityCategory(raw: unknown): ActivityCategory {
  const record =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    category:
      typeof record['category'] === 'string' && record['category'] !== ''
        ? record['category']
        : 'other',
    clicks: Math.max(0, activityInt(record['clicks'], 0)),
  };
}

/** Map body GET …/activity defensively — payload hỏng không crash UI. */
function toStudentActivity(raw: RawStudentActivity): StudentActivity {
  const weeks = Array.isArray(raw.weeks)
    ? raw.weeks.map((entry, index) => toActivityWeek(entry, index))
    : [];
  const submissions = Array.isArray(raw.submissions)
    ? raw.submissions.map((entry) => toActivitySubmission(entry))
    : [];
  const breakdown = Array.isArray(raw.activity_breakdown)
    ? raw.activity_breakdown.map((entry) => toActivityCategory(entry))
    : [];
  return {
    cutoffDay: activityInt(raw.cutoff_day, 27),
    weeks,
    submissions,
    activityBreakdown: breakdown,
  };
}

const RUN_STATUSES: readonly EvaluationRunStatus[] = [
  'idle',
  'running',
  'done',
  'error',
];

/** Map run-status defensively — trường lạ/null về giá trị an toàn. */
function toRunStatusInfo(raw: RawEvaluationRunStatus): EvaluationRunStatusInfo {
  const status = RUN_STATUSES.includes(raw.status as EvaluationRunStatus)
    ? (raw.status as EvaluationRunStatus)
    : 'idle';
  const nullableString = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;
  return {
    status,
    runId: nullableString(raw.run_id),
    startedAt: nullableString(raw.started_at),
    finishedAt: nullableString(raw.finished_at),
    summary:
      typeof raw.summary === 'object' && raw.summary !== null
        ? toSummaryCounts(raw.summary)
        : null,
    error: nullableString(raw.error),
  };
}

/**
 * Giữ raw observed khi parse được object — observed từ backend có thể là
 * object trực tiếp hoặc JSON string. Scalar/mảng → undefined.
 */
function toObservedRaw(
  raw: unknown,
): Record<string, unknown> | undefined {
  let candidate = raw;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return undefined;
    }
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    !Array.isArray(candidate)
  ) {
    return candidate as Record<string, unknown>;
  }
  return undefined;
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
  const observedRaw = toObservedRaw(raw.observed);
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
    ...(observedRaw !== undefined ? { observedRaw } : {}),
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

  async getQueueStats(filters: StudentFilters): Promise<QueueStats> {
    // GET /predictions/stats — thống kê hàng đợi (M6). Các đếm theo status
    // cố tình không respecting filter `status` (backend giữ nguyên 4 số để
    // render đủ card); chỉ code_module/code_presentation được truyền xuống.
    const params = new URLSearchParams();
    if (filters.codeModule !== undefined && filters.codeModule !== '') {
      params.set('code_module', filters.codeModule);
    }
    if (
      filters.codePresentation !== undefined &&
      filters.codePresentation !== ''
    ) {
      params.set('code_presentation', filters.codePresentation);
    }
    const qs = params.toString();
    const raw = await this.request<RawQueueStats>(
      `/predictions/stats${qs !== '' ? `?${qs}` : ''}`,
    );
    return {
      flaggedTotal: raw.flagged_total,
      scored: raw.scored,
      insufficientData: raw.insufficient_data,
      manualReview: raw.manual_review,
      noPrediction: raw.no_prediction,
      aboveThreshold: raw.above_threshold,
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

  async triggerEvaluationRun(): Promise<EvaluationTriggerResult> {
    // POST /evaluations/run (FROZEN CONTRACT §1) — 202 {run_id, status}.
    // Lỗi 409/503 được bọc thành HTTP_409/HTTP_503 qua toApiError.
    const raw = await this.request<RawEvaluationTrigger>('/evaluations/run', {
      method: 'POST',
    });
    return {
      runId: typeof raw.run_id === 'string' ? raw.run_id : '',
      status: typeof raw.status === 'string' ? raw.status : 'started',
    };
  }

  async getEvaluationRunStatus(): Promise<EvaluationRunStatusInfo> {
    // GET /evaluations/run-status (FROZEN CONTRACT §2).
    const raw = await this.request<RawEvaluationRunStatus>(
      '/evaluations/run-status',
    );
    return toRunStatusInfo(raw);
  }

  async listAuditLogs(params?: AuditLogQuery): Promise<AuditLogListResult> {
    // GET /audit-logs?limit=&action=&entity= (§1.12) — backend trả snake_case.
    // Lỗi 503 database_not_configured → HTTP_503 qua toApiError.
    const requestParams = new URLSearchParams();
    if (params?.limit !== undefined) {
      requestParams.set('limit', String(params.limit));
    }
    if (params?.action !== undefined && params.action !== '') {
      requestParams.set('action', params.action);
    }
    if (params?.entity !== undefined && params.entity !== '') {
      requestParams.set('entity', params.entity);
    }
    const query = requestParams.toString();
    const raw = await this.request<RawAuditLogList>(
      query !== '' ? `/audit-logs?${query}` : '/audit-logs',
    );
    return toAuditLogList(raw, params?.limit ?? 50);
  }

  async getStudentActivity(ref: PredictionRef): Promise<StudentActivity> {
    // GET /predictions/{m}/{p}/{s}/activity (§1.13) — hành vi 4 tuần trước
    // ngày cắt. Lỗi: 404 student_not_found, 503 oulad_data_not_configured
    // → HTTP_404/HTTP_503 qua toApiError.
    const path =
      `/predictions/${encodeURIComponent(ref.codeModule)}` +
      `/${encodeURIComponent(ref.codePresentation)}` +
      `/${encodeURIComponent(ref.studentKey)}/activity`;
    const raw = await this.request<RawStudentActivity>(path);
    return toStudentActivity(raw);
  }

  async getQuickPrompts(): Promise<string[]> {
    const raw = await this.request<string[]>('/briefs/chat/quick-prompts');
    return Array.isArray(raw) ? raw : [];
  }

  async createOrResumeChatSession(
    params: CreateChatSessionParams,
  ): Promise<ChatSession> {
    const raw = await this.request<RawChatSession>('/briefs/chat/sessions', {
      method: 'POST',
      body: {
        code_module: params.codeModule,
        code_presentation: params.codePresentation,
        student_key: params.studentKey,
        title: params.title,
      },
    });
    return toChatSession(raw);
  }

  async getChatSession(sessionId: number): Promise<ChatSession> {
    const raw = await this.request<RawChatSession>(
      `/briefs/chat/sessions/${encodeURIComponent(String(sessionId))}`,
    );
    return toChatSession(raw);
  }

  async listChatMessages(
    sessionId: number,
    limit: number = 50,
    offset: number = 0,
  ): Promise<ChatMessage[]> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const raw = await this.request<RawChatMessage[]>(
      `/briefs/chat/sessions/${encodeURIComponent(String(sessionId))}/messages?${params}`,
    );
    return Array.isArray(raw) ? raw.map(toChatMessage) : [];
  }

  async sendChatMessage(
    sessionId: number,
    content: string,
  ): Promise<ChatMessage> {
    const raw = await this.request<RawChatMessage>(
      `/briefs/chat/sessions/${encodeURIComponent(String(sessionId))}/messages`,
      {
        method: 'POST',
        body: { content },
      },
    );
    return toChatMessage(raw);
  }

  async finalizeChatToBrief(
    sessionId: number,
    params?: FinalizeBriefParams,
  ): Promise<AdvisorBrief> {
    const raw = await this.request<RawBrief>(
      `/briefs/chat/sessions/${encodeURIComponent(String(sessionId))}/finalize-brief`,
      {
        method: 'POST',
        body: params?.advisorNotes ? { advisor_notes: params.advisorNotes } : {},
      },
    );
    return toBrief(raw);
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
