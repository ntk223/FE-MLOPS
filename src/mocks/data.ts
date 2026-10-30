import type {
  AdvisorBrief,
  PredictionSignal,
  PredictionStatus,
  StudentPrediction,
} from '../contracts/api';

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
      runId: 'mock-run',
      scoredAt: new Date('2026-10-30T08:34:09Z').toISOString(),
    });
  });

  return records;
}

export const MOCK_STUDENTS: StudentPrediction[] = buildStudentPredictions();

export const MOCK_BRIEFS: AdvisorBrief[] = [
  {
    briefId: 5001,
    predictionId: 1001,
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
    briefId: 5002,
    predictionId: 1004,
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
    briefId: 5003,
    predictionId: 1007,
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
