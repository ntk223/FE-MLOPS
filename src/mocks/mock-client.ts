import type {
  AdvisorBrief,
  AdvisorSession,
  ApiError,
  StudentFilters,
  StudentPrediction,
} from '../contracts/api';
import type { ILearnGuardApiClient, LoginCredentials } from '../api/client';
import { MOCK_BRIEFS, MOCK_STUDENTS } from './data';

/**
 * Mock implementation of the LearnGuardApiClient contract.
 * Simulates realistic latency (300–700ms) and mirrors the API contract in
 * src/contracts/api.ts so the UI can be developed contract-first.
 */
export class MockApiClient implements ILearnGuardApiClient {
  private students: StudentPrediction[];

  private briefs: AdvisorBrief[];

  private nextBriefId: number;

  private nextBriefVersion: number;

  constructor() {
    this.students = [...MOCK_STUDENTS];
    this.briefs = [...MOCK_BRIEFS];
    this.nextBriefId = 6001;
    this.nextBriefVersion = 1;
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

  async listStudents(filters: StudentFilters): Promise<StudentPrediction[]> {
    await this.delay();

    const filtered = this.students.filter((student) => {
      if (filters.riskState && student.status !== filters.riskState) {
        return false;
      }
      if (filters.moduleCode && student.moduleCode !== filters.moduleCode) {
        return false;
      }
      if (
        filters.presentationCode &&
        student.presentationCode !== filters.presentationCode
      ) {
        return false;
      }
      return true;
    });

    // Priority = riskScore × uncertainty (giam dần). Các trạng thái khác 'scored'
    // được sắp xếp sau nhóm có điểm (quy ước §3.9-bis).
    const priority = (student: StudentPrediction): number => {
      if (student.riskScore === null || student.uncertainty === null) {
        return -1;
      }
      return student.riskScore * student.uncertainty;
    };

    const sorted = [...filtered].sort((a, b) => {
      const aScored = a.status === 'scored' ? 0 : 1;
      const bScored = b.status === 'scored' ? 0 : 1;
      if (aScored !== bScored) {
        return aScored - bScored;
      }
      return priority(b) - priority(a);
    });

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;
    return sorted.slice(offset, offset + limit);
  }

  async getStudent(predictionId: number): Promise<StudentPrediction> {
    await this.delay();

    const found = this.students.find(
      (student) => student.predictionId === predictionId,
    );
    if (!found) {
      throw this.error('STUDENT_NOT_FOUND', 'Không tìm thấy hồ sơ sinh viên.');
    }
    return found;
  }

  async generateBrief(predictionId: number): Promise<AdvisorBrief> {
    await this.delay();

    const student = this.students.find((item) => item.predictionId === predictionId);
    if (!student) {
      throw this.error('STUDENT_NOT_FOUND', 'Không tìm thấy hồ sơ sinh viên.');
    }

    const existing = this.briefs.find(
      (brief) => brief.predictionId === predictionId && brief.status !== 'rejected',
    );
    const version = existing ? existing.version + 1 : this.nextBriefVersion;
    const briefId = existing ? existing.briefId : this.nextBriefId++;

    const brief: AdvisorBrief = {
      briefId,
      predictionId,
      version,
      status: 'generated',
      summary:
        'Bản tóm tắt gợi ý dựa trên các tín hiệu tương quan gần nhất của sinh viên trong học phần.',
      reasons: student.signals.slice(0, 3).map((signal) => ({
        text:
          signal.relation === 'higher_score'
            ? `Chỉ số ${signal.featureName} ở mức làm tăng điểm nguy cơ (đóng góp ${signal.contribution.toFixed(2)}).`
            : `Chỉ số ${signal.featureName} ở mức thấp so với mặt bằng lớp (đóng góp ${signal.contribution.toFixed(2)}).`,
        evidenceFeatures: [signal.featureName],
      })),
      supportSuggestions: [
        'Liên hệ sinh viên để trao đổi về tiến độ học tập hiện tại.',
        'Đề xuất nguồn hỗ trợ học tập phù hợp của học phần.',
      ],
      limitations: [
        'Đây là điểm gợi ý ưu tiên, không phải kết luận về kết quả học tập.',
        'Các tín hiệu chỉ thể hiện tương quan, không phải quan hệ nhân quả.',
      ],
    };

    this.briefs = [
      ...this.briefs.filter((item) => item.briefId !== brief.briefId),
      brief,
    ];
    return brief;
  }

  async saveBriefDecision(
    briefId: number,
    action: 'accept' | 'reject',
    feedback?: string,
  ): Promise<AdvisorBrief> {
    await this.delay();

    const index = this.briefs.findIndex((brief) => brief.briefId === briefId);
    if (index === -1) {
      throw this.error('BRIEF_NOT_FOUND', 'Không tìm thấy bản tóm tắt tư vấn.');
    }

    const updated: AdvisorBrief = {
      ...this.briefs[index],
      status: action === 'accept' ? 'accepted' : 'rejected',
    };
    if (feedback !== undefined) {
      updated.limitations = [...updated.limitations, `Phản hồi cố vấn: ${feedback}`];
    }

    this.briefs = [
      ...this.briefs.slice(0, index),
      updated,
      ...this.briefs.slice(index + 1),
    ];
    return updated;
  }

  private delay(): Promise<void> {
    const latency = 300 + Math.floor(Math.random() * 400); // 300–700ms
    return new Promise((resolve) => setTimeout(resolve, latency));
  }

  private error(code: string, message: string): ApiError {
    return { code, message, requestId: `mock-${Date.now()}` };
  }
}
