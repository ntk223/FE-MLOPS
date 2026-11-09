import type {
  AdvisorBrief,
  PredictionSignal,
  PredictionStatus,
  StudentPrediction,
} from '../contracts/api';
import type {
  EvaluationCheck,
  EvaluationCheckStatus,
  EvaluationDetail,
  EvaluationRunSummary,
  EvaluationScorecard,
  EvaluationSummaryCounts,
  AuditLog,
} from '../api/client';

const MODULE_CODES = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'] as const;
const PRESENTATION_CODES = ['2013J', '2014B', '2013B'] as const;

/**
 * Deterministic pseudo-random generator so the mock dataset is stable
 * across reloads (same records, same ordering).
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const rng = createRng(20261030);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const SIGNAL_POOL: Array<{ featureName: string; positive: boolean }> = [
  { featureName: 'clicks_week4', positive: false },
  { featureName: 'avg_assessment_score', positive: false },
  { featureName: 'days_since_last_login', positive: true },
  { featureName: 'submission_rate', positive: false },
  { featureName: 'forum_posts_count', positive: false },
  { featureName: 'missed_deadlines', positive: true },
  { featureName: 'total_clicks', positive: false },
  { featureName: 'clicks_week2', positive: false },
  { featureName: 'date_registration_gap', positive: true },
  { featureName: 'studied_credits', positive: false },
];

function buildSignals(count: number): PredictionSignal[] {
  const chosen = [...SIGNAL_POOL]
    .sort(() => rng() - 0.5)
    .slice(0, count)
    .map((item) => {
      const magnitude = round2(0.05 + rng() * 0.35);
      const contribution = item.positive ? magnitude : -magnitude;
      const direction: PredictionSignal['direction'] = item.positive
        ? 'increases_risk'
        : 'decreases_risk';
      return { featureName: item.featureName, contribution, direction };
    });
  return chosen.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

/** 16 ký tự hex — khớp định dạng student_key thật (DB_CONTRACT §9.1). */
function mockStudentKey(index: number): string {
  return (index + 0x7bd60ace).toString(16).padStart(16, '0').slice(-16);
}

function buildStudentPredictions(): StudentPrediction[] {
  const records: StudentPrediction[] = [];
  const statusPlan: PredictionStatus[] = [
    ...Array<PredictionStatus>(22).fill('scored'),
    ...Array<PredictionStatus>(5).fill('insufficient_data'),
    ...Array<PredictionStatus>(6).fill('manual_review'),
    ...Array<PredictionStatus>(3).fill('no_prediction'),
  ];

  statusPlan.forEach((status, index) => {
    const codeModule = MODULE_CODES[index % MODULE_CODES.length];
    const codePresentation =
      PRESENTATION_CODES[Math.floor(index / MODULE_CODES.length) % PRESENTATION_CODES.length];

    let riskScore: number | null = null;
    let predictedLabel: 0 | 1 | null = null;
    let threshold: number | null = null;
    let uncertainty: number | null = null;
    let reviewReason: StudentPrediction['reviewReason'] = null;
    let topSignals: PredictionSignal[] = [];

    if (status === 'scored') {
      riskScore = round2(0.3 + rng() * 0.68);
      predictedLabel = riskScore >= 0.6 ? 1 : 0;
      threshold = 0.6;
      uncertainty = round2(0.05 + rng() * 0.4);
      topSignals = buildSignals(3 + Math.floor(rng() * 3)); // 3–5 signals
    } else if (status === 'manual_review') {
      uncertainty = round2(0.5 + rng() * 0.45);
      riskScore = round2(0.35 + rng() * 0.5);
      threshold = 0.6;
      reviewReason = 'high_uncertainty';
      topSignals = buildSignals(3);
    } else if (status === 'insufficient_data') {
      reviewReason = 'insufficient_data';
    } else if (status === 'no_prediction') {
      reviewReason = 'no_prediction';
    }

    records.push({
      codeModule,
      codePresentation,
      studentKey: mockStudentKey(index),
      split: 'validation',
      riskScore,
      predictedLabel,
      threshold,
      uncertainty,
      status,
      reviewReason,
      modelVersion: 'logreg-v1:b791ed6e:48843ee8:1ccd9891',
      snapshotVersion: 'snapshot-v1:cutoff27:35de8103:39e10cfa',
      cutoffDay: 27,
      topSignals,
      features: {
        n_clicks_before_cutoff:
          status === 'insufficient_data' ? null : Math.round(rng() * 2500),
        click_trend_w3_w4:
          status === 'insufficient_data' ? null : Math.round((rng() - 0.5) * 600),
        n_submitted_before_cutoff:
          status === 'insufficient_data' ? null : Math.round(rng() * 9),
        avg_score_submitted:
          status === 'insufficient_data' ? null : round2(rng() * 100),
        num_of_prev_attempts: Math.floor(rng() * 3),
        studied_credits: [60, 90, 120, 240][Math.floor(rng() * 4)],
      },
      runId: 'mock-run',
      scoredAt: new Date('2026-10-30T08:34:09Z').toISOString(),
    });
  });

  return records;
}

export const MOCK_STUDENTS: StudentPrediction[] = buildStudentPredictions();

/** PK composite của mock student — API thật không có predictionId numeric. */
function briefRef(student: StudentPrediction) {
  return {
    codeModule: student.codeModule,
    codePresentation: student.codePresentation,
    studentKey: student.studentKey,
  };
}

export const MOCK_BRIEFS: AdvisorBrief[] = [
  {
    ...briefRef(MOCK_STUDENTS[1]),
    briefId: 5001,
    version: 1,
    status: 'generated',
    summary:
      'Sinh viên có dấu hiệu suy giảm hoạt động học tập trong 4 tuần gần nhất, điểm nguy cơ vượt ngưỡng 0.6.',
    reasons: [
      {
        text: 'Số lượt truy cập tuần 4 giảm mạnh so với mặt bằng lớp.',
        evidenceFeatures: ['clicks_week4', 'total_clicks'],
      },
      {
        text: 'Điểm trung bình các bài đánh giá thấp hơn ngưỡng đạt.',
        evidenceFeatures: ['avg_assessment_score'],
      },
    ],
    supportSuggestions: [
      'Gửi email nhắc nhở và mời sinh viên trao đổi về tiến độ học tập.',
      'Đề xuất tham gia nhóm học phụ đạo của học phần.',
    ],
    limitations: [
      'Đây là điểm gợi ý ưu tiên, không phải kết luận về kết quả học tập.',
      'Các tín hiệu chỉ thể hiện tương quan, không phải quan hệ nhân quả.',
    ],
  },
  {
    ...briefRef(MOCK_STUDENTS[4]),
    briefId: 5002,
    version: 1,
    status: 'accepted',
    summary:
      'Sinh viên có tỷ lệ nộp bài thấp và thời gian kể từ lần đăng nhập cuối dài bất thường.',
    reasons: [
      {
        text: 'Số kỳ nộp bài bị trượt tăng liên tiếp trong 3 tuần.',
        evidenceFeatures: ['missed_deadlines', 'submission_rate'],
      },
      {
        text: 'Khoảng cách từ lần đăng nhập cuối lớn hơn 10 ngày.',
        evidenceFeatures: ['days_since_last_login'],
      },
    ],
    supportSuggestions: [
      'Liên hệ trực tiếp qua điện thoại để xác nhận tình trạng của sinh viên.',
      'Cân nhắc gia hạn thời gian nộp bài nếu có lý do chính đáng.',
    ],
    limitations: [
      'Dữ liệu hoạt động trực tuyến có thể không phản ánh hết nỗ lực ngoài nền tảng.',
      'Cần xác minh thông tin với sinh viên trước khi đưa ra quyết định hỗ trợ.',
    ],
  },
  {
    ...briefRef(MOCK_STUDENTS[7]),
    briefId: 5003,
    version: 2,
    status: 'rejected',
    summary:
      'Đề xuất hỗ trợ ban đầu không phù hợp vì sinh viên đã có kế hoạch học bù được phê duyệt.',
    reasons: [
      {
        text: 'Điểm bài đánh giá giữa kỳ cải thiện so với kỳ trước.',
        evidenceFeatures: ['avg_assessment_score'],
      },
      {
        text: 'Mức độ tham gia diễn đàn ở mức trung bình nhưng ổn định.',
        evidenceFeatures: ['forum_posts_count'],
      },
    ],
    supportSuggestions: [
      'Theo dõi thêm 2 tuần trước khi can thiệp sâu hơn.',
      'Ghi nhận kế hoạch học bù hiện có của sinh viên.',
    ],
    limitations: [
      'Mô hình chưa tính đến các yếu tố đời sống ngoài nền tảng học tập.',
      'Điểm số chỉ mang tính tham khảo, không thay thế đánh giá của cố vấn.',
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Mock evaluations (§1.11) — 2 runs demo cho trang "Đánh giá tự động": */
/* run 1 pass trọn vẹn (3 gates), run 2 có warn + fail. Nội dung tiếng  */
/* Việt, khớp shape camelCase sau khi map defensive ở api/client.ts.    */
/* ------------------------------------------------------------------ */

function mockSummary(
  pass: number,
  warn: number,
  fail: number,
  skipped: number,
): EvaluationSummaryCounts {
  return { total: pass + warn + fail + skipped, pass, warn, fail, skipped };
}

function mockCheck(
  id: string,
  name: string,
  status: EvaluationCheckStatus,
  threshold: string | null,
  observed: string,
  details: string,
  observedRaw?: Record<string, unknown>,
): EvaluationCheck {
  return {
    id,
    name,
    status,
    threshold,
    observed,
    ...(observedRaw !== undefined ? { observedRaw } : {}),
    details,
  };
}

function mockScorecard(
  subject: string,
  runId: string,
  createdAt: string,
  inputs: string,
  checks: EvaluationCheck[],
  summary: EvaluationSummaryCounts,
): EvaluationScorecard {
  return {
    schemaVersion: 'learnguard.eval.v1',
    runId,
    subject,
    createdAt,
    inputs,
    checks,
    summary,
  };
}

const RUN_PASS_ID = 'eval-report-20261106-0930';
const RUN_PASS_AT = '2026-11-06T09:30:00+07:00';
const RUN_FAIL_ID = 'eval-report-20261105-1400';
const RUN_FAIL_AT = '2026-11-05T14:00:00+07:00';

export const MOCK_EVALUATION_RUNS: EvaluationRunSummary[] = [
  {
    runId: RUN_PASS_ID,
    createdAt: RUN_PASS_AT,
    subjects: ['data', 'ml', 'llm'],
    combinedSummary: mockSummary(11, 0, 0, 0),
    overallStatus: 'pass',
    reportsAvailable: ['eval_data.json', 'eval_ml.json', 'eval_llm.json'],
  },
  {
    runId: RUN_FAIL_ID,
    createdAt: RUN_FAIL_AT,
    subjects: ['data', 'ml', 'llm'],
    combinedSummary: mockSummary(5, 3, 2, 0),
    overallStatus: 'fail',
    reportsAvailable: ['eval_data.json', 'eval_ml.json', 'eval_llm.json'],
  },
];

export const MOCK_EVALUATION_DETAILS: Record<string, EvaluationDetail> = {
  [RUN_PASS_ID]: {
    runId: RUN_PASS_ID,
    createdAt: RUN_PASS_AT,
    reports: [
      mockScorecard(
        'data',
        RUN_PASS_ID,
        RUN_PASS_AT,
        'snapshot-v1:cutoff27 · 6.510 dòng · 12 cột đặc trưng',
        [
          mockCheck(
            'data_row_count',
            'Số dòng dữ liệu đầu vào',
            'pass',
            '≥ 1.000 dòng',
            '6.510 dòng',
            'Tổng số dòng sau khi nạp snapshot OULAD tại cutoff day 27 — vượt ngưỡng tối thiểu.',
          ),
          mockCheck(
            'data_missing_values',
            'Tỷ lệ giá trị thiếu',
            'pass',
            '≤ 5%',
            '1.8%',
            'Chủ yếu thiếu ở cột avg_score_submitted với sinh viên chưa nộp bài nào.',
          ),
          mockCheck(
            'data_duplicates',
            'Dòng trùng lặp',
            'pass',
            '= 0 dòng',
            '0 dòng',
            'Kiểm tra theo PK composite (code_module, code_presentation, student_key).',
          ),
          mockCheck(
            'data_label_balance',
            'Cân bằng nhãn mục tiêu',
            'pass',
            '≥ 10% mỗi lớp',
            'Lớp 1 (rủi ro): 32.4% · Lớp 0: 67.6%',
            'Tỷ lệ hai lớp đủ lớn để huấn luyện và đánh giá đáng tin cậy.',
          ),
        ],
        mockSummary(4, 0, 0, 0),
      ),
      mockScorecard(
        'ml',
        RUN_PASS_ID,
        RUN_PASS_AT,
        'logreg-v1:b791ed6e · split validation · 1.302 dòng',
        [
          mockCheck(
            'ml_auc_validation',
            'AUC tập validation',
            'pass',
            '≥ 0.75',
            '0.86',
            'AUC trên tập validation — khả năng phân biệt sinh viên rủi ro/không rủi ro.',
          ),
          mockCheck(
            'ml_brier',
            'Brier score',
            'pass',
            '≤ 0.15',
            '0.09',
            'Độ chính xác xác suất: càng nhỏ càng tốt.',
          ),
          mockCheck(
            'ml_calibration',
            'Lệch hiệu chỉnh xác suất (ECE)',
            'pass',
            '≤ 0.05',
            '0.03',
            'Xác suất dự đoán khớp tốt với tần suất thực tế theo 10 bins.',
          ),
          mockCheck(
            'ml_feature_drift',
            'Drift đặc trưng (PSI)',
            'pass',
            '< 0.2',
            'PSI lớn nhất: 0.07 (clicks_week4)',
            'Không có đặc trưng nào dịch chuyển phân bố đáng kể so với lúc huấn luyện.',
          ),
        ],
        mockSummary(4, 0, 0, 0),
      ),
      mockScorecard(
        'llm',
        RUN_PASS_ID,
        RUN_PASS_AT,
        'gemini/gemini-3.1-flash-lite · 40 brief trong 24 giờ qua',
        [
          mockCheck(
            'llm_configured',
            'LLM đã cấu hình',
            'pass',
            'api_key tồn tại',
            'gemini/gemini-3.1-flash-lite',
            'Endpoint sinh brief hoạt động; fallback_review chiếm 0/40 brief.',
          ),
          mockCheck(
            'llm_latency_p95',
            'Độ trễ p95 sinh brief',
            'pass',
            '≤ 5.000 ms',
            '1.240 ms',
            '95% brief được sinh trong vòng 1.240 ms.',
          ),
          mockCheck(
            'judge_quality',
            'Chấm điểm chất lượng brief bằng LLM judge',
            'pass',
            'overall ≥ 3.0',
            'Điểm TB 4.02 · 3 brief',
            'LLM judge chấm từng brief theo 4 tiêu chí (1–5).',
            {
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
                  issues: 'Đề xuất hỗ trợ hơi chung chung, nên dẫn chứng dữ liệu cụ thể.',
                },
                {
                  brief: '6001',
                  grounded: 3.0,
                  useful: 2.5,
                  no_fabrication: 4.0,
                  clarity: 3.0,
                  overall: 2.8,
                  issues: 'Phát hiện 1 câu có nguy cơ bịa đặt (no-fabrication 4.0 nhưng grounded thấp).',
                },
              ],
            },
          ),
        ],
        mockSummary(3, 0, 0, 0),
      ),
    ],
  },
  [RUN_FAIL_ID]: {
    runId: RUN_FAIL_ID,
    createdAt: RUN_FAIL_AT,
    reports: [
      mockScorecard(
        'data',
        RUN_FAIL_ID,
        RUN_FAIL_AT,
        'snapshot-v1:cutoff27 · 6.480 dòng · 12 cột đặc trưng',
        [
          mockCheck(
            'data_row_count',
            'Số dòng dữ liệu đầu vào',
            'pass',
            '≥ 1.000 dòng',
            '6.480 dòng',
            'Tổng số dòng sau khi nạp snapshot OULAD tại cutoff day 27.',
          ),
          mockCheck(
            'data_missing_values',
            'Tỷ lệ giá trị thiếu',
            'warn',
            '≤ 5%',
            '7.3%',
            'Cột avg_score_submitted thiếu 7.3% — vượt ngưỡng, nên cẩn trọng khi diễn giải điểm nguy cơ.',
          ),
          mockCheck(
            'data_duplicates',
            'Dòng trùng lặp',
            'pass',
            '= 0 dòng',
            '0 dòng',
            'Kiểm tra theo PK composite (code_module, code_presentation, student_key).',
          ),
          mockCheck(
            'data_label_balance',
            'Cân bằng nhãn mục tiêu',
            'pass',
            '≥ 10% mỗi lớp',
            'Lớp 1 (rủi ro): 31.1% · Lớp 0: 68.9%',
            'Tỷ lệ hai lớp đủ lớn để huấn luyện và đánh giá đáng tin cậy.',
          ),
        ],
        mockSummary(3, 1, 0, 0),
      ),
      mockScorecard(
        'ml',
        RUN_FAIL_ID,
        RUN_FAIL_AT,
        'logreg-v1:b791ed6e · split validation · 1.297 dòng',
        [
          mockCheck(
            'ml_auc_validation',
            'AUC tập validation',
            'fail',
            '≥ 0.75',
            '0.68',
            'AUC giảm 0.18 so với run trước — mô hình chưa đạt chất lượng tối thiểu, KHÔNG dùng điểm này để ưu tiên.',
          ),
          mockCheck(
            'ml_brier',
            'Brier score',
            'warn',
            '≤ 0.15',
            '0.17',
            'Xác suất dự đoán lệch hơn mức cho phép — cân nhắc hiệu chỉnh lại.',
          ),
          mockCheck(
            'ml_calibration',
            'Lệch hiệu chỉnh xác suất (ECE)',
            'pass',
            '≤ 0.05',
            '0.04',
            'Hiệu chỉnh xác suất vẫn trong ngưỡng chấp nhận được.',
          ),
          mockCheck(
            'ml_feature_drift',
            'Drift đặc trưng (PSI)',
            'fail',
            '< 0.2',
            'PSI lớn nhất: 0.31 (clicks_week4)',
            'Phân bố lượt truy cập tuần 4 dịch chuyển mạnh so với lúc huấn luyện — nguyên nhân khả dĩ nhất của suy giảm AUC.',
          ),
        ],
        mockSummary(1, 1, 2, 0),
      ),
      mockScorecard(
        'llm',
        RUN_FAIL_ID,
        RUN_FAIL_AT,
        'gemini/gemini-3.1-flash-lite · 35 brief trong 24 giờ qua',
        [
          mockCheck(
            'llm_configured',
            'LLM đã cấu hình',
            'pass',
            'api_key tồn tại',
            'gemini/gemini-3.1-flash-lite',
            'Endpoint sinh brief hoạt động; fallback_review chiếm 1/35 brief.',
          ),
          mockCheck(
            'llm_latency_p95',
            'Độ trễ p95 sinh brief',
            'warn',
            '≤ 5.000 ms',
            '6.380 ms',
            'Độ trễ p95 vượt ngưỡng — có thể do rate limit của nhà cung cấp LLM.',
          ),
        ],
        mockSummary(1, 1, 0, 0),
      ),
    ],
  },
};

/* ------------------------------------------------------------------ */
/* MOCK_AUDIT_LOGS — nhật ký hệ thống cho trang /audit (§1.12)         */
/* ~14 bản ghi demo đa dạng: 2 actor + 1 bản ghi hệ thống (actor null), */
/* thời gian gần đây, payload ngắn gọn tiếng Việt.                     */
/* ------------------------------------------------------------------ */

const ACTOR_ADVISOR = {
  userId: 'u-advisor-01',
  actorEmail: 'advisor@learnguard.vn',
  actorName: 'Nguyễn Văn Cố Vấn',
};

const ACTOR_ADMIN = {
  userId: 'u-admin-01',
  actorEmail: 'admin@learnguard.vn',
  actorName: 'Trần Quản Trị',
};

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    logId: 'log-0001',
    at: '2026-11-06T09:42:10+07:00',
    ...ACTOR_ADVISOR,
    action: 'prediction_list',
    entity: 'predictions',
    entityId: null,
    payload: { limit: 20, status: 'scored', ghi_chu: 'Xem hàng đợi ưu tiên buổi sáng' },
  },
  {
    logId: 'log-0002',
    at: '2026-11-06T09:38:44+07:00',
    ...ACTOR_ADVISOR,
    action: 'brief_generate',
    entity: 'briefs',
    entityId: '5001',
    payload: {
      code_module: 'AAA',
      code_presentation: '2013J',
      student_key: '7bd60ace00000001',
      model: 'gemini/gemini-3.1-flash-lite',
    },
  },
  {
    logId: 'log-0003',
    at: '2026-11-06T09:36:02+07:00',
    ...ACTOR_ADVISOR,
    action: 'brief_edit',
    entity: 'briefs',
    entityId: '5001',
    payload: { truong_sua: ['summary', 'supportSuggestions'], do_dai_truoc: 512, do_dai_sau: 468 },
  },
  {
    logId: 'log-0004',
    at: '2026-11-06T09:31:27+07:00',
    ...ACTOR_ADVISOR,
    action: 'decision_accept',
    entity: 'briefs',
    entityId: '5001',
    payload: { quyet_dinh: 'accepted', ghi_chu: 'Đã đồng bộ đề xuất hỗ trợ với sinh viên' },
  },
  {
    logId: 'log-0005',
    at: '2026-11-06T09:12:55+07:00',
    ...ACTOR_ADVISOR,
    action: 'brief_generate',
    entity: 'briefs',
    entityId: '5002',
    payload: { code_module: 'BBB', code_presentation: '2014B', student_key: '7bd60ace00000002' },
  },
  {
    logId: 'log-0006',
    at: '2026-11-06T09:10:18+07:00',
    ...ACTOR_ADVISOR,
    action: 'decision_reject',
    entity: 'briefs',
    entityId: '5002',
    payload: { quyet_dinh: 'rejected', ly_do: 'Brief thiếu dẫn chứng dữ liệu tuần 4' },
  },
  {
    logId: 'log-0007',
    at: '2026-11-06T08:58:31+07:00',
    userId: null,
    actorEmail: null,
    actorName: null,
    action: 'evaluation_run',
    entity: 'evaluations',
    entityId: 'eval-report-20261106-0930',
    payload: { kichhoat: 'pipeline_scheduler', gates: ['data', 'ml', 'llm'], ket_qua: 'pass' },
  },
  {
    logId: 'log-0008',
    at: '2026-11-06T08:45:03+07:00',
    ...ACTOR_ADMIN,
    action: 'evaluation_run',
    entity: 'evaluations',
    entityId: 'eval-ui-1762403103',
    payload: { kichhoat: 'manual', nguon: 'Trang Đánh giá tự động', gates: ['data', 'ml', 'llm'] },
  },
  {
    logId: 'log-0009',
    at: '2026-11-06T08:44:12+07:00',
    ...ACTOR_ADMIN,
    action: 'login_success',
    entity: 'auth',
    entityId: null,
    payload: { phuong_thuc: 'password', dia_chi_ip: '10.0.12.44' },
  },
  {
    logId: 'log-0010',
    at: '2026-11-06T08:43:40+07:00',
    ...ACTOR_ADMIN,
    action: 'login_failed',
    entity: 'auth',
    entityId: null,
    payload: { ly_do: 'Sai mật khẩu', so_lan_thu: 1 },
  },
  {
    logId: 'log-0011',
    at: '2026-11-06T08:46:20+07:00',
    ...ACTOR_ADMIN,
    action: 'evaluation_read',
    entity: 'evaluations',
    entityId: 'eval-report-20261106-0930',
    payload: { gates: ['data', 'ml', 'llm'], tai_file: false },
  },
  {
    logId: 'log-0012',
    at: '2026-11-05T16:20:09+07:00',
    ...ACTOR_ADVISOR,
    action: 'login_success',
    entity: 'auth',
    entityId: null,
    payload: { phuong_thuc: 'password', dia_chi_ip: '10.0.12.31' },
  },
  {
    logId: 'log-0013',
    at: '2026-11-05T15:47:52+07:00',
    ...ACTOR_ADVISOR,
    action: 'prediction_list',
    entity: 'predictions',
    entityId: null,
    payload: { limit: 20, status: 'manual_review', ghi_chu: 'Lọc nhóm cần xem xét thủ công' },
  },
  {
    logId: 'log-0014',
    at: '2026-11-05T14:02:11+07:00',
    ...ACTOR_ADMIN,
    action: 'login_failed',
    entity: 'auth',
    entityId: null,
    payload: { ly_do: 'Tài khoản chưa được kích hoạt', so_lan_thu: 2 },
  },
];
