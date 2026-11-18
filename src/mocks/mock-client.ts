import type {
  AdvisorBrief,
  AdvisorSession,
  ApiError,
  BriefDecision,
  BriefEdits,
  ChatMessage,
  ChatSession,
  CitedEvidence,
  CreateChatSessionParams,
  FinalizeBriefParams,
  PredictionPage,
  PredictionRef,
  StudentFilters,
  StudentPrediction,
} from '../contracts/api';
import type {
  ILearnGuardApiClient,
  AuditLogListResult,
  AuditLogQuery,
  EvaluationCheck,
  EvaluationDetail,
  EvaluationRunListResult,
  EvaluationRunStatusInfo,
  EvaluationRunSummary,
  EvaluationScorecard,
  EvaluationSummaryCounts,
  EvaluationTriggerResult,
  LoginCredentials,
  QueueStats,
  StudentActivity,
} from '../api/client';
import {
  MOCK_AUDIT_LOGS,
  MOCK_BRIEFS,
  MOCK_EVALUATION_DETAILS,
  MOCK_EVALUATION_RUNS,
  MOCK_STUDENTS,
} from './data';

/**
 * RNG giả ngẫu nhiên deterministic cho mock activity — cùng 1 sinh viên
 * luôn sinh cùng 1 bộ số liệu qua các lần reload (demo ổn định).
 */
function createActivityRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Sinh data hành vi 4 tuần trước ngày cắt theo trạng thái dự đoán (§1.13):
 * - `insufficient_data` → hoạt động gần như bằng 0 (chưa đủ dữ liệu).
 * - `scored` rủi ro cao (riskScore ≥ threshold) → tuần 3–4 rơi mạnh.
 * - còn lại → hoạt động đều qua các tuần.
 */
function buildMockActivity(student: StudentPrediction, index: number): StudentActivity {
  const random = createActivityRng(index * 7919 + 104729);
  const cutoff = student.cutoffDay;
  const highRisk =
    student.status === 'scored' &&
    student.riskScore !== null &&
    student.threshold !== null &&
    student.riskScore >= student.threshold;

  let clicks: number[];
  if (student.status === 'insufficient_data') {
    clicks = [
      Math.floor(random() * 4),
      Math.floor(random() * 6),
      Math.floor(random() * 5),
      Math.floor(random() * 4),
      Math.floor(random() * 3),
    ];
  } else if (highRisk) {
    const base = 45 + Math.floor(random() * 60);
    clicks = [
      Math.floor(base * 0.45),
      base,
      Math.floor(base * (0.75 + random() * 0.3)),
      Math.floor(base * (0.1 + random() * 0.12)),
      Math.floor(base * (0.02 + random() * 0.08)),
    ];
  } else {
    const base = 70 + Math.floor(random() * 110);
    clicks = [
      Math.floor(base * 0.4),
      base,
      Math.floor(base * (0.85 + random() * 0.3)),
      Math.floor(base * (0.8 + random() * 0.3)),
      Math.floor(base * (0.7 + random() * 0.3)),
    ];
  }

  const labels = ['Trước khóa', 'Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4'];
  const spans: Array<[number, number]> = [
    [-14, -1],
    [0, 6],
    [7, 13],
    [14, 20],
    [21, cutoff],
  ];
  const weeks = clicks.map((value, weekIndex) => ({
    label: labels[weekIndex],
    fromDay: spans[weekIndex][0],
    toDay: spans[weekIndex][1],
    clicks: value,
    daysActive:
      weekIndex === 0
        ? Math.min(7, Math.ceil(value / 12))
        : Math.min(spans[weekIndex][1] - spans[weekIndex][0] + 1, Math.ceil(value / 22)),
  }));

  // 2–3 bài nộp: TMA/CMA với hạn cố định theo tuần, điểm theo trạng thái.
  const submissionCount = 2 + (index % 2);
  const types = ['TMA', 'CMA', 'TMA'];
  const weights = [10, 15, 20];
  const submissions = Array.from({ length: submissionCount }, (_, subIndex) => {
    const assessmentDay = 10 + subIndex * 7;
    const notSubmitted = student.status === 'no_prediction' && subIndex === submissionCount - 1;
    const score =
      student.status === 'insufficient_data' || notSubmitted
        ? null
        : highRisk
          ? 25 + Math.floor(random() * 40) // 25–64: thiên thấp
          : 45 + Math.floor(random() * 50); // 45–95
    const status: 'submitted' | 'not_submitted' = notSubmitted
      ? 'not_submitted'
      : 'submitted';
    return {
      assessmentType: types[subIndex % types.length],
      assessmentDay,
      submittedDay: notSubmitted ? null : assessmentDay + 2 + Math.floor(random() * 4),
      score,
      weight: weights[subIndex % weights.length],
      status,
    };
  });

  // Breakdown theo category site — tổng xấp xỉ tổng clicks các tuần.
  const totalClicks = clicks.reduce((sum, value) => sum + value, 0);
  const share = [0.32, 0.28, 0.18, 0.12];
  const categories = ['forum', 'resources', 'quiz', 'homepage'];
  const activityBreakdown = categories.map((category, catIndex) => ({
    category,
    clicks:
      catIndex < categories.length - 1
        ? Math.round(totalClicks * share[catIndex])
        : Math.max(0, totalClicks - Math.round(totalClicks * 0.78)),
  }));

  return { cutoffDay: cutoff, weeks, submissions, activityBreakdown };
}

/**
 * Mock implementation of the ILearnGuardApiClient contract.
 * Simulates realistic latency (300–700ms) and mirrors docs/API_CONTRACT.md
 * so the UI can be developed contract-first. Chỉ còn auth (M6) là mock-only;
 * briefs đã có real API (M8) nhưng mock giữ nguyên cho chế độ demo.
 */
export class MockApiClient implements ILearnGuardApiClient {
  private students: StudentPrediction[];

  private briefs: AdvisorBrief[];

  private nextBriefId: number;

  /** Danh sách run đánh giá — mutable để mô phỏng run mới sau trigger. */
  private evaluationRuns: EvaluationRunSummary[];

  /** Chi tiết run — mutable, run mô phỏng được thêm vào đây. */
  private evaluationDetails: Record<string, EvaluationDetail>;

  /** Trạng thái lần chạy đánh giá thủ công gần nhất (FROZEN CONTRACT §2). */
  private runStatus: EvaluationRunStatusInfo;

  /** Timer mô phỏng 6s chạy đánh giá — dọn dẹp nếu trigger lại. */
  private runTimer: ReturnType<typeof setInterval> | null = null;

  /** Quản lý phiên chat và tin nhắn của Cố vấn (Advisor Copilot). */
  private chatSessions: ChatSession[] = [];
  private chatMessages: ChatMessage[] = [];
  private nextSessionId: number = 501;
  private nextMessageId: number = 1001;

  constructor() {
    this.students = [...MOCK_STUDENTS];
    this.briefs = [...MOCK_BRIEFS];
    this.nextBriefId = 6001;
    this.evaluationRuns = [...MOCK_EVALUATION_RUNS];
    this.evaluationDetails = { ...MOCK_EVALUATION_DETAILS };
    this.runStatus = {
      status: 'idle',
      runId: null,
      startedAt: null,
      finishedAt: null,
      summary: null,
      error: null,
    };
    this.chatSessions = [];
    this.chatMessages = [];
  }

  async login(credentials: LoginCredentials): Promise<AdvisorSession> {
    await this.delay();

    const accounts: Array<LoginCredentials & AdvisorSession> = [
      {
        email: 'advisor@learnguard.vn',
        password: 'advisor123',
        accessToken: 'mock-token-advisor',
        role: 'advisor',
        displayName: 'Nguyễn Văn Cố Vấn',
      },
      {
        email: 'admin@learnguard.vn',
        password: 'admin123',
        accessToken: 'mock-token-admin',
        role: 'admin',
        displayName: 'Trần Quản Trị',
      },
    ];

    const matched = accounts.find(
      (account) =>
        account.email === credentials.email.trim().toLowerCase() &&
        account.password === credentials.password,
    );

    if (!matched) {
      throw this.error('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
    }

    return {
      accessToken: matched.accessToken,
      role: matched.role,
      displayName: matched.displayName,
    };
  }

  async listPredictions(filters: StudentFilters): Promise<PredictionPage> {
    await this.delay();

    const filtered = this.applyFilters(filters);

    // Priority: scored trước, riskScore DESC (khớp backend ORDER BY
    // risk_score DESC NULLS LAST).
    const sorted = [...filtered].sort((a, b) => {
      const aScored = a.status === 'scored' ? 0 : 1;
      const bScored = b.status === 'scored' ? 0 : 1;
      if (aScored !== bScored) {
        return aScored - bScored;
      }
      return (b.riskScore ?? -1) - (a.riskScore ?? -1);
    });

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;
    return {
      items: sorted.slice(offset, offset + limit),
      total: sorted.length,
      limit,
      offset,
    };
  }

  /** Aggregated summary-strip counts over the dataset after filters. */
  async getQueueStats(filters: StudentFilters): Promise<QueueStats> {
    await this.delay();

    const filtered = this.applyFilters(filters);
    const scoredItems = filtered.filter((student) => student.status === 'scored');

    const aboveThreshold = scoredItems.filter(
      (student) =>
        student.riskScore !== null &&
        student.threshold !== null &&
        student.riskScore >= student.threshold,
    ).length;

    return {
      flaggedTotal: filtered.length,
      scored: scoredItems.length,
      insufficientData: filtered.filter(
        (student) => student.status === 'insufficient_data',
      ).length,
      manualReview: filtered.filter(
        (student) => student.status === 'manual_review',
      ).length,
      noPrediction: filtered.filter(
        (student) => student.status === 'no_prediction',
      ).length,
      aboveThreshold,
    };
  }

  async listPredictionsForStudent(studentKey: string): Promise<PredictionPage> {
    await this.delay();
    const items = this.students.filter(
      (student) => student.studentKey === studentKey,
    );
    return { items, total: items.length, limit: 50, offset: 0 };
  }

  async getPrediction(ref: PredictionRef): Promise<StudentPrediction> {
    await this.delay();

    const found = this.students.find(
      (student) =>
        student.codeModule === ref.codeModule &&
        student.codePresentation === ref.codePresentation &&
        student.studentKey === ref.studentKey,
    );
    if (!found) {
      throw this.error('PREDICTION_NOT_FOUND', 'Không tìm thấy dự đoán.');
    }
    return found;
  }

  /**
   * GET /predictions/{m}/{p}/{s}/activity (§1.13) — mock sinh data hành vi
   * deterministic theo trạng thái dự đoán của sinh viên (xem
   * buildMockActivity). Không tìm thấy sinh viên → 404 student_not_found.
   */
  async getStudentActivity(ref: PredictionRef): Promise<StudentActivity> {
    await this.delay();
    const index = this.students.findIndex(
      (student) =>
        student.codeModule === ref.codeModule &&
        student.codePresentation === ref.codePresentation &&
        student.studentKey === ref.studentKey,
    );
    if (index === -1) {
      throw this.error(
        'HTTP_404',
        `Không tìm thấy sinh viên "${ref.studentKey}" (student_not_found).`,
      );
    }
    return buildMockActivity(this.students[index], index);
  }

  /**
   * Hành vi tham chiếu giữ nguyên cho demo: regenerate cùng 1 dự đoán
   * (so khớp PK composite) → version + 1, status 'generated'.
   */
  async generateBrief(ref: PredictionRef): Promise<AdvisorBrief> {
    await this.delay();

    const student = this.students.find(
      (candidate) =>
        candidate.codeModule === ref.codeModule &&
        candidate.codePresentation === ref.codePresentation &&
        candidate.studentKey === ref.studentKey,
    );
    if (!student) {
      throw this.error('PREDICTION_NOT_FOUND', 'Không tìm thấy dự đoán.');
    }

    const existing = this.briefs.find(
      (brief) =>
        brief.codeModule === ref.codeModule &&
        brief.codePresentation === ref.codePresentation &&
        brief.studentKey === ref.studentKey &&
        brief.status !== 'rejected',
    );
    const version = existing ? existing.version + 1 : 1;
    const briefId = existing ? existing.briefId : this.nextBriefId++;
    const editedAt: string | null = null;

    const brief: AdvisorBrief = {
      briefId,
      codeModule: ref.codeModule,
      codePresentation: ref.codePresentation,
      studentKey: ref.studentKey,
      version,
      status: 'generated',
      summary:
        'Bản tóm tắt gợi ý dựa trên các tín hiệu tương quan gần nhất của sinh viên trong học phần. (Chế độ demo — backend M8 chưa triển khai.)',
      reasons: student.topSignals.slice(0, 3).map((signal) => ({
        text:
          signal.direction === 'increases_risk'
            ? `Chỉ số ${signal.featureName} ở mức làm tăng điểm nguy cơ (đóng góp ${signal.contribution.toFixed(2)}).`
            : `Chỉ số ${signal.featureName} ở mức làm giảm điểm nguy cơ (đóng góp ${signal.contribution.toFixed(2)}).`,
        evidenceFeatures: [signal.featureName],
      })),
      supportSuggestions: [
        'Liên hệ sinh viên để trao đổi về tiến độ học tập hiện tại.',
        'Đề xuất nguồn hỗ trợ học tập phù hợp của học phần.',
      ],
      limitations: [
        'Đây là điểm gợi ý ưu tiên, không phải kết luận về kết quả học tập.',
        'Các tín hiệu chỉ thể hiện tương quan, không phải quan hệ nhân quả.',
        'Nội dung đang tạo bởi mock client — backend M8 chưa có endpoint.',
      ],
      editedAt,
    };

    this.briefs = [
      ...this.briefs.filter((item) => item.briefId !== brief.briefId),
      brief,
    ];
    return brief;
  }

  /**
   * PUT /briefs/{brief_id} (§1.10) — hành vi demo: chỉ sửa nội dung,
   * KHÔNG đổi version/status/decision, set editedAt = now.
   */
  async editBrief(briefId: number, edits: BriefEdits): Promise<AdvisorBrief> {
    await this.delay();

    const index = this.briefs.findIndex((brief) => brief.briefId === briefId);
    if (index === -1) {
      throw this.error('BRIEF_NOT_FOUND', 'Không tìm thấy bản tóm tắt tư vấn.');
    }

    const current = this.briefs[index];
    const updated: AdvisorBrief = {
      ...current,
      summary: edits.summary ?? current.summary,
      reasons:
        edits.reasons !== undefined
          ? edits.reasons.map((reason) => ({
              text: reason.text,
              evidenceFeatures: [...reason.evidenceFeatures],
            }))
          : current.reasons,
      supportSuggestions:
        edits.supportSuggestions !== undefined
          ? [...edits.supportSuggestions]
          : current.supportSuggestions,
      limitations:
        edits.limitations !== undefined
          ? [...edits.limitations]
          : current.limitations,
      editedAt: new Date().toISOString(),
    };

    this.briefs = [
      ...this.briefs.slice(0, index),
      updated,
      ...this.briefs.slice(index + 1),
    ];
    return updated;
  }

  async saveBriefDecision(
    briefId: number,
    decision: 'accepted' | 'rejected',
  ): Promise<BriefDecision> {
    await this.delay();

    const index = this.briefs.findIndex((brief) => brief.briefId === briefId);
    if (index === -1) {
      throw this.error('BRIEF_NOT_FOUND', 'Không tìm thấy bản tóm tắt tư vấn.');
    }

    const updated: AdvisorBrief = {
      ...this.briefs[index],
      status: decision === 'accepted' ? 'accepted' : 'rejected',
    };

    this.briefs = [
      ...this.briefs.slice(0, index),
      updated,
      ...this.briefs.slice(index + 1),
    ];
    return {
      briefId,
      decision,
      decidedAt: new Date().toISOString(),
    };
  }

  /**
   * GET /evaluations (§1.11) — runs demo cứng + run mô phỏng từ trigger,
   * mới nhất trước.
   */
  async listEvaluations(limit?: number): Promise<EvaluationRunListResult> {
    await this.delay();
    const capped = limit !== undefined && limit >= 0 ? limit : 20;
    return {
      runs: this.evaluationRuns.slice(0, capped),
      total: this.evaluationRuns.length,
      limit: capped,
    };
  }

  /** GET /evaluations/{run_id} (§1.11) — 404 nếu run không tồn tại. */
  async getEvaluation(runId: string): Promise<EvaluationDetail> {
    await this.delay();
    const detail = this.evaluationDetails[runId];
    if (detail === undefined) {
      throw this.error(
        'HTTP_404',
        `Không tìm thấy lần đánh giá "${runId}" (evaluation_not_found).`,
      );
    }
    return detail;
  }

  /**
   * POST /evaluations/run (FROZEN CONTRACT §1) — mô phỏng: đang running →
   * 409; ngược lại đặt trạng thái running trong 6 giây rồi done với summary
   * demo (run + scorecard mới được thêm vào list/detail mock).
   */
  async triggerEvaluationRun(): Promise<EvaluationTriggerResult> {
    await this.delay();
    if (this.runStatus.status === 'running') {
      throw this.error(
        'HTTP_409',
        'Một lần đánh giá đang chạy (evaluation_already_running).',
      );
    }
    const runId = `eval-ui-${Date.now()}`;
    const startedAt = new Date().toISOString();
    this.runStatus = {
      status: 'running',
      runId,
      startedAt,
      finishedAt: null,
      summary: null,
      error: null,
    };
    this.simulateRun(runId);
    return { runId, status: 'started' };
  }

  /** GET /evaluations/run-status — đọc state nội bộ của run mô phỏng. */
  async getEvaluationRunStatus(): Promise<EvaluationRunStatusInfo> {
    await this.delay();
    return this.runStatus;
  }

  /**
   * GET /audit-logs (§1.12) — mock ~14 bản ghi demo, filter theo action/entity,
   * mới nhất trước. actor null → UI hiển thị "Hệ thống".
   */
  async listAuditLogs(params?: AuditLogQuery): Promise<AuditLogListResult> {
    await this.delay();

    const action = params?.action;
    const entity = params?.entity;
    const filtered = MOCK_AUDIT_LOGS.filter((log) => {
      if (action !== undefined && action !== '' && log.action !== action) {
        return false;
      }
      if (entity !== undefined && entity !== '' && log.entity !== entity) {
        return false;
      }
      return true;
    });

    // Mới nhất trước (at là ISO-8601 cùng múi giờ → so chuỗi là đủ).
    const sorted = [...filtered].sort((a, b) => b.at.localeCompare(a.at));
    const limit = params?.limit !== undefined && params.limit >= 0 ? params.limit : 50;
    const actions = [...new Set(MOCK_AUDIT_LOGS.map((log) => log.action))].sort();
    const entities = [...new Set(MOCK_AUDIT_LOGS.map((log) => log.entity))].sort();

    return {
      logs: sorted.slice(0, limit),
      total: sorted.length,
      limit,
      actions,
      entities,
    };
  }

  /** Mô phỏng tiến trình chạy 6 giây (kiểm tra mỗi giây) rồi done. */
  private simulateRun(runId: string): void {
    const startedAtMs = Date.now();
    const RUN_DURATION_MS = 6_000;
    if (this.runTimer !== null) {
      clearInterval(this.runTimer);
    }
    this.runTimer = setInterval(() => {
      if (Date.now() - startedAtMs < RUN_DURATION_MS) {
        return;
      }
      if (this.runTimer !== null) {
        clearInterval(this.runTimer);
        this.runTimer = null;
      }
      this.completeRun(runId);
    }, 1_000);
  }

  /** Kết thúc run mô phỏng: tạo scorecard demo + thêm vào list/detail. */
  private completeRun(runId: string): void {
    const finishedAt = new Date().toISOString();
    const summary: EvaluationSummaryCounts = {
      total: 12,
      pass: 10,
      warn: 2,
      fail: 0,
      skipped: 0,
    };

    const dataChecks: EvaluationCheck[] = [
      {
        id: 'data_row_count',
        name: 'Số dòng dữ liệu đầu vào',
        status: 'pass',
        threshold: '≥ 1.000 dòng',
        observed: '6.530 dòng',
        details: 'Snapshot OULAD tại cutoff day 27.',
      },
      {
        id: 'data_missing_values',
        name: 'Tỷ lệ giá trị thiếu',
        status: 'warn',
        threshold: '≤ 5%',
        observed: '5.4%',
        details: 'Vượt ngưỡng nhẹ ở cột avg_score_submitted.',
      },
    ];

    const mlChecks: EvaluationCheck[] = [
      {
        id: 'ml_auc_validation',
        name: 'AUC tập validation',
        status: 'pass',
        threshold: '≥ 0.75',
        observed: '0.85',
        details: 'Khả năng phân biệt rủi ro/không rủi ro đạt yêu cầu.',
      },
      {
        id: 'ml_brier',
        name: 'Brier score',
        status: 'pass',
        threshold: '≤ 0.15',
        observed: '0.10',
        details: 'Độ chính xác xác suất trong ngưỡng.',
      },
      {
        id: 'ml_feature_drift',
        name: 'Drift đặc trưng (PSI)',
        status: 'pass',
        threshold: '< 0.2',
        observed: 'PSI lớn nhất: 0.08 (clicks_week4)',
        details: 'Không có drift đáng kể.',
      },
    ];

    const llmChecks: EvaluationCheck[] = [
      {
        id: 'llm_configured',
        name: 'LLM đã cấu hình',
        status: 'pass',
        threshold: 'api_key tồn tại',
        observed: 'gemini/gemini-3.1-flash-lite',
        details: 'Endpoint sinh brief hoạt động.',
      },
      {
        id: 'llm_latency_p95',
        name: 'Độ trễ p95 sinh brief',
        status: 'warn',
        threshold: '≤ 5.000 ms',
        observed: '5.420 ms',
        details: 'Vượt ngưỡng nhẹ — có thể do rate limit nhà cung cấp.',
      },
      {
        id: 'judge_quality',
        name: 'Chấm điểm chất lượng brief bằng LLM judge',
        status: 'pass',
        threshold: 'overall ≥ 3.0',
        observed: 'Điểm TB 3.92 · 3 brief',
        details: 'LLM judge chấm từng brief theo 4 tiêu chí (1–5).',
        observedRaw: {
          judge_model: 'gemini/gemini-3.1-flash-lite',
          per_brief: [
            {
              brief: '5001',
              grounded: 4.5,
              useful: 4.0,
              no_fabrication: 5.0,
              clarity: 4.0,
              overall: 4.38,
              issues: '',
            },
            {
              brief: '5002',
              grounded: 4.0,
              useful: 3.5,
              no_fabrication: 4.5,
              clarity: 3.5,
              overall: 3.88,
              issues: 'Đề xuất hỗ trợ hơi chung chung.',
            },
            {
              brief: '6001',
              grounded: 3.0,
              useful: 2.5,
              no_fabrication: 4.0,
              clarity: 3.0,
              overall: 2.8,
              issues: 'Grounded thấp — nên bổ sung dẫn chứng dữ liệu.',
            },
          ],
        },
      },
    ];

    const scorecard = (
      subject: string,
      checks: EvaluationCheck[],
    ): EvaluationScorecard => ({
      schemaVersion: 'learnguard.eval.v1',
      runId,
      subject,
      createdAt: finishedAt,
      inputs: 'mock-run · snapshot-v1:cutoff27',
      checks,
      summary: {
        total: checks.length,
        pass: checks.filter((check) => check.status === 'pass').length,
        warn: checks.filter((check) => check.status === 'warn').length,
        fail: checks.filter((check) => check.status === 'fail').length,
        skipped: checks.filter((check) => check.status === 'skipped').length,
      },
    });

    this.evaluationDetails = {
      ...this.evaluationDetails,
      [runId]: {
        runId,
        createdAt: finishedAt,
        reports: [
          scorecard('data', dataChecks),
          scorecard('ml', mlChecks),
          scorecard('llm', llmChecks),
        ],
      },
    };
    this.evaluationRuns = [
      {
        runId,
        createdAt: finishedAt,
        subjects: ['data', 'ml', 'llm'],
        combinedSummary: summary,
        overallStatus: 'warn',
        reportsAvailable: [
          'eval_data.json',
          'eval_ml.json',
          'eval_llm.json',
        ],
      },
      ...this.evaluationRuns,
    ];
    this.runStatus = {
      status: 'done',
      runId,
      startedAt: this.runStatus.startedAt,
      finishedAt,
      summary,
      error: null,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Advisor Copilot Chatbot Mock Implementation                        */
  /* ------------------------------------------------------------------ */

  async getQuickPrompts(): Promise<string[]> {
    await this.delay();
    return [
      'Tại sao sinh viên này có nguy cơ rớt môn cao?',
      'Sinh viên này sụt giảm tương tác từ tuần mấy?',
      'Có bài tập nào bị nộp trễ hoặc điểm thấp không?',
      'Gợi ý kịch bản trao đổi và kế hoạch can thiệp cho sinh viên',
      'Soạn email mẫu gửi sinh viên nhắc nhở học tập',
    ];
  }

  async createOrResumeChatSession(
    params: CreateChatSessionParams,
  ): Promise<ChatSession> {
    await this.delay();

    const student = this.students.find(
      (candidate) =>
        candidate.codeModule === params.codeModule &&
        candidate.codePresentation === params.codePresentation &&
        candidate.studentKey === params.studentKey,
    );
    if (!student) {
      throw this.error('PREDICTION_NOT_FOUND', 'Không tìm thấy dự đoán sinh viên.');
    }

    // Check for an existing active session
    let session = this.chatSessions.find(
      (s) =>
        s.codeModule === params.codeModule &&
        s.codePresentation === params.codePresentation &&
        s.studentKey === params.studentKey &&
        s.status === 'active',
    );

    if (!session) {
      const now = new Date().toISOString();
      const quickPrompts = [
        'Tại sao sinh viên này có nguy cơ rớt môn cao?',
        'Sinh viên này sụt giảm tương tác từ tuần mấy?',
        'Có bài tập nào bị nộp trễ hoặc điểm thấp không?',
        'Gợi ý kịch bản trao đổi và kế hoạch can thiệp cho sinh viên',
      ];
      session = {
        sessionId: this.nextSessionId++,
        studentKey: params.studentKey,
        codeModule: params.codeModule,
        codePresentation: params.codePresentation,
        userId: 1,
        title:
          params.title ||
          `Tư vấn SV ${params.studentKey} (${params.codeModule}-${params.codePresentation})`,
        status: 'active',
        briefId: null,
        createdAt: now,
        updatedAt: now,
        quickPrompts,
      };
      this.chatSessions.push(session);

      // Seed an initial greeting from the assistant
      this.chatMessages.push({
        messageId: this.nextMessageId++,
        sessionId: session.sessionId,
        role: 'assistant',
        content: `Xin chào Cố vấn! Tôi là Trợ lý Cố vấn Học thuật LearnGuard. Tôi đã tổng hợp dữ liệu dự đoán nguy cơ và chỉ số tương tác VLE của sinh viên ${params.studentKey}. Bạn có thể đặt câu hỏi hoặc chọn các câu hỏi gợi ý bên dưới để cùng phân tích.`,
        citedEvidence: [],
        tokensUsed: 42,
        createdAt: now,
      });
    }

    return session;
  }

  async getChatSession(sessionId: number): Promise<ChatSession> {
    await this.delay();
    const session = this.chatSessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      throw this.error('CHAT_SESSION_NOT_FOUND', 'Không tìm thấy phiên chat.');
    }
    return session;
  }

  async listChatMessages(
    sessionId: number,
    limit: number = 50,
    offset: number = 0,
  ): Promise<ChatMessage[]> {
    await this.delay();
    const messages = this.chatMessages.filter((m) => m.sessionId === sessionId);
    return messages.slice(offset, offset + limit);
  }

  async sendChatMessage(
    sessionId: number,
    content: string,
  ): Promise<ChatMessage> {
    await this.delay();

    const session = this.chatSessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      throw this.error('CHAT_SESSION_NOT_FOUND', 'Không tìm thấy phiên chat.');
    }
    if (session.status !== 'active') {
      throw this.error(
        'CHAT_SESSION_NOT_ACTIVE',
        `Phiên chat này đã kết thúc (${session.status}).`,
      );
    }

    const student = this.students.find(
      (s) =>
        s.codeModule === session.codeModule &&
        s.codePresentation === session.codePresentation &&
        s.studentKey === session.studentKey,
    );

    const now = new Date().toISOString();

    // 1. Lưu tin nhắn của Cố vấn
    const advisorMsg: ChatMessage = {
      messageId: this.nextMessageId++,
      sessionId,
      role: 'advisor',
      content,
      citedEvidence: [],
      tokensUsed: 0,
      createdAt: now,
    };
    this.chatMessages.push(advisorMsg);

    // 2. Trả lời từ Trợ lý theo ngữ cảnh
    const normalized = content.toLowerCase();
    let replyText = '';
    const citedEvidence: CitedEvidence[] = [];

    if (
      normalized.includes('nguy cơ') ||
      normalized.includes('tại sao') ||
      normalized.includes('rủi ro') ||
      normalized.includes('nguyên nhân')
    ) {
      const riskScoreStr =
        student?.riskScore !== null && student?.riskScore !== undefined
          ? `${Math.round(student.riskScore * 100)}%`
          : 'chưa có';
      const thresholdStr =
        student?.threshold !== null && student?.threshold !== undefined
          ? `${Math.round(student.threshold * 100)}%`
          : '50%';

      replyText = `Sinh viên ${session.studentKey} có điểm nguy cơ dự đoán là ${riskScoreStr} (ngưỡng cảnh báo: ${thresholdStr}). Các yếu tố chính tác động đến dự đoán bao gồm:\n\n`;

      if (student && student.topSignals.length > 0) {
        student.topSignals.slice(0, 3).forEach((sig) => {
          const dirText =
            sig.direction === 'increases_risk'
              ? 'làm tăng đáng kể nguy cơ'
              : 'giảm nguy cơ';
          replyText += `- **${sig.featureName}**: Đóng góp ${sig.contribution.toFixed(2)} (${dirText}).\n`;
          citedEvidence.push({
            featureName: sig.featureName,
            contribution: sig.contribution,
            direction: sig.direction,
            observedValue: student.features[sig.featureName] ?? undefined,
          });
        });
      } else {
        replyText += '- Số lượt tương tác trên hệ thống học tập VLE giảm dần trước mốc cutoff 27 ngày.\n- Tần suất nộp bài tập chưa đồng đều.';
      }
    } else if (
      normalized.includes('sụt giảm') ||
      normalized.includes('tương tác') ||
      normalized.includes('tuần') ||
      normalized.includes('click') ||
      normalized.includes('vle')
    ) {
      replyText = `Phân tích dữ liệu VLE cho sinh viên ${session.studentKey} cho thấy:\n\n` +
        `- **Giai đoạn trước khóa & tuần 1–2**: Sinh viên duy trì hoạt động tương đối tốt (truy cập tài liệu và diễn đàn).\n` +
        `- **Tuần 3 trở đi**: Bắt đầu xuất hiện xu hướng sụt giảm rõ rệt. Lượt truy cập tài liệu môn học giảm hơn 65% so với tuần 2.\n` +
        `- **Tuần 4**: Tương tác gần như ngưng trệ, sinh viên hầu như không đăng nhập hệ thống VLE trước ngày cắt (cutoff_day 27).\n\n` +
        `Điều này chỉ ra sinh viên có thể đang gặp rào cản về tiếp thu kiến thức tuần 3 hoặc phát sinh khó khăn cá nhân/kỹ thuật.`;
      citedEvidence.push({
        featureName: 'click_trend_w3_w4',
        observedValue: -28,
        description: 'Độ dốc sụt giảm tương tác từ tuần 3 sang tuần 4',
      });
      citedEvidence.push({
        featureName: 'n_clicks_w4',
        observedValue: 3,
        description: 'Tổng lượt click trong tuần thứ 4',
      });
    } else if (
      normalized.includes('bài tập') ||
      normalized.includes('điểm') ||
      normalized.includes('nộp') ||
      normalized.includes('trễ') ||
      normalized.includes('assessment')
    ) {
      replyText = `Về tình hình bài tập và đánh giá của sinh viên ${session.studentKey}:\n\n` +
        `- Đã có bài đánh giá đầu kỳ (TMA 01): Sinh viên nộp trễ so với thời hạn quy định, điểm số đạt mức trung bình thấp (khoảng 45/100).\n` +
        `- Chưa hoàn thành quiz kiểm tra kiến thức tuần 3.\n` +
        `- **Khuyến nghị**: Cần nhắc nhở sinh viên về bài tập đánh giá tiếp theo (trọng số 20%), vì trượt bài tập này sẽ làm tăng nguy cơ không đủ điều kiện dự thi cuối kỳ.`;
      citedEvidence.push({
        featureName: 'avg_score_submitted',
        observedValue: 45.0,
        description: 'Điểm trung bình các bài đã nộp',
      });
      citedEvidence.push({
        featureName: 'n_late_submissions',
        observedValue: 1,
        description: 'Số bài nộp muộn',
      });
    } else if (
      normalized.includes('kịch bản') ||
      normalized.includes('can thiệp') ||
      normalized.includes('email') ||
      normalized.includes('kế hoạch') ||
      normalized.includes('soạn')
    ) {
      replyText = `Dưới đây là kịch bản trao đổi và kế hoạch can thiệp đề xuất cho Cố vấn:\n\n` +
        `**1. Mục tiêu trao đổi:**\n` +
        `- Tìm hiểu lý do sinh viên sụt giảm tương tác từ tuần 3.\n` +
        `- Động viên tinh thần và cung cấp hướng dẫn bù đắp bài tập đã trễ.\n\n` +
        `**2. Mẫu tin nhắn / Email gửi sinh viên:**\n` +
        `> *"Chào em, thầy/cô nhận thấy trong 2 tuần gần đây em có vẻ ít đăng nhập hệ thống học phần ${session.codeModule}. Học kỳ đang bước vào giai đoạn quan trọng với các bài đánh giá sắp tới. Nếu em đang gặp khó khăn về tài liệu, phương pháp học hay vấn đề cá nhân, hãy phản hồi lại email này để thầy/cô và trợ giảng hỗ trợ em kịp thời nhé!"*\n\n` +
        `**3. Đề xuất hành động tiếp theo:**\n` +
        `- Hẹn gặp tư vấn trực tuyến 15 phút nếu sinh viên phản hồi.\n` +
        `- Chuyển tài liệu tóm tắt kiến thức tuần 3-4 cho sinh viên.`;
    } else {
      replyText = `Cảm ơn câu hỏi của bạn. Dựa trên hồ sơ học tập của sinh viên ${session.studentKey} trong học phần ${session.codeModule}-${session.codePresentation}, sinh viên đang thuộc nhóm cần theo dõi sát sao. Bạn có thể hỏi sâu hơn về lịch sử tương tác VLE, các bài tập nộp trễ, hoặc yêu cầu soạn thảo kế hoạch can thiệp cụ thể. Khi hoàn tất, bạn có thể bấm **"Chốt & Tạo Brief chính thức"** để lưu kết quả.`;
    }

    const tokensUsed = 180 + Math.floor(Math.random() * 80);

    const assistantMsg: ChatMessage = {
      messageId: this.nextMessageId++,
      sessionId,
      role: 'assistant',
      content: replyText,
      citedEvidence,
      tokensUsed,
      createdAt: new Date().toISOString(),
    };
    this.chatMessages.push(assistantMsg);

    session.updatedAt = new Date().toISOString();
    return assistantMsg;
  }

  async finalizeChatToBrief(
    sessionId: number,
    params?: FinalizeBriefParams,
  ): Promise<AdvisorBrief> {
    await this.delay();

    const session = this.chatSessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      throw this.error('CHAT_SESSION_NOT_FOUND', 'Không tìm thấy phiên chat.');
    }

    const student = this.students.find(
      (s) =>
        s.codeModule === session.codeModule &&
        s.codePresentation === session.codePresentation &&
        s.studentKey === session.studentKey,
    );

    const existing = this.briefs.find(
      (brief) =>
        brief.codeModule === session.codeModule &&
        brief.codePresentation === session.codePresentation &&
        brief.studentKey === session.studentKey,
    );
    const version = existing ? existing.version + 1 : 1;
    const briefId = existing ? existing.briefId : this.nextBriefId++;

    const limitations = [
      'Bản tóm tắt được tổng hợp từ cuộc trao đổi tương tác với Trợ lý AI và đã qua rà soát của Cố vấn.',
      'Các tín hiệu thể hiện mối tương quan hành vi tại thời điểm cutoff 27 ngày.',
    ];
    if (params?.advisorNotes) {
      limitations.push(`Ghi chú của cố vấn: ${params.advisorNotes}`);
    }

    const finalizedBrief: AdvisorBrief = {
      briefId,
      codeModule: session.codeModule,
      codePresentation: session.codePresentation,
      studentKey: session.studentKey,
      version,
      status: 'generated',
      summary: `Bản tóm tắt can thiệp chính thức được chốt từ phiên hỏi đáp cố vấn (Phiên #${session.sessionId}). Sinh viên có nguy cơ rớt môn cần can thiệp sớm do tương tác VLE sụt giảm nhanh và có bài tập nộp trễ.`,
      reasons: [
        {
          text: 'Tương tác hệ thống sụt giảm rõ rệt từ tuần 3 sang tuần 4 trước ngày cắt.',
          evidenceFeatures: ['click_trend_w3_w4', 'n_clicks_w4'],
        },
        {
          text: 'Điểm số đánh giá ban đầu đạt thấp và phát sinh tình trạng nộp bài trễ hạn.',
          evidenceFeatures: ['avg_score_submitted', 'n_late_submissions'],
        },
      ],
      supportSuggestions: [
        'Cố vấn gửi tin nhắn liên hệ trực tiếp để làm rõ rào cản học tập của sinh viên.',
        'Cung cấp tài liệu ôn tập bù đắp kiến thức trọng tâm tuần 3-4.',
        'Nhắc nhở hạn nộp bài kiểm tra tiếp theo có trọng số 20%.',
      ],
      limitations,
      modelName: 'advisor-copilot-gemini-flash',
      latencyMs: 840,
      createdAt: new Date().toISOString(),
      editedAt: null,
    };

    // Update session
    session.status = 'finalized';
    session.briefId = briefId;
    session.updatedAt = new Date().toISOString();

    // Store in briefs list
    this.briefs = [
      ...this.briefs.filter((b) => b.briefId !== briefId),
      finalizedBrief,
    ];

    return finalizedBrief;
  }

  /** Filter the mock dataset exactly like the backend list endpoint. */
  private applyFilters(filters: StudentFilters): StudentPrediction[] {
    return this.students.filter((student) => {
      if (filters.status && student.status !== filters.status) {
        return false;
      }
      if (filters.codeModule && student.codeModule !== filters.codeModule) {
        return false;
      }
      if (
        filters.codePresentation &&
        student.codePresentation !== filters.codePresentation
      ) {
        return false;
      }
      if (filters.studentKey && student.studentKey !== filters.studentKey) {
        return false;
      }
      return true;
    });
  }

  private delay(): Promise<void> {
    const latency = 300 + Math.floor(Math.random() * 400); // 300–700ms
    return new Promise((resolve) => setTimeout(resolve, latency));
  }

  private error(code: string, message: string): ApiError {
    return { code, message, requestId: `mock-${Date.now()}` };
  }
}
