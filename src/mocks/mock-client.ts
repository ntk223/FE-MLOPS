import type {
  AdvisorBrief,
  AdvisorSession,
  ApiError,
  BriefDecision,
  BriefEdits,
  PredictionPage,
  PredictionRef,
  StudentFilters,
  StudentPrediction,
} from '../contracts/api';
import type {
  ILearnGuardApiClient,
  LoginCredentials,
  QueueStats,
} from '../api/client';
import { MOCK_BRIEFS, MOCK_STUDENTS } from './data';

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

  constructor() {
    this.students = [...MOCK_STUDENTS];
    this.briefs = [...MOCK_BRIEFS];
    this.nextBriefId = 6001;
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
