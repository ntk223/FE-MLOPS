import type {
  AdvisorBrief,
  BriefDecision,
  PredictionRef,
} from '../../contracts/api';
import type { ILearnGuardApiClient } from '../../api/client';

/**
 * Advisor-facing brief workflow over the M8 briefs API
 * (docs/API_CONTRACT.md §1.7). Regenerate versioning (version + 1) và
 * fallback statuses ('fallback_review'/'unavailable') do backend sở hữu.
 */
export class BriefService {
  constructor(private readonly api: ILearnGuardApiClient) {}

  /** Tạo/regenerate brief cho 1 dự đoán (PK composite). */
  generate(ref: PredictionRef): Promise<AdvisorBrief> {
    return this.api.generateBrief(ref);
  }

  /** Ghi nhận cố vấn chấp nhận brief (POST /briefs/{brief_id}/decision). */
  accept(briefId: number): Promise<BriefDecision> {
    return this.api.saveBriefDecision(briefId, 'accepted');
  }

  /** Ghi nhận cố vấn từ chối brief (POST /briefs/{brief_id}/decision). */
  reject(briefId: number): Promise<BriefDecision> {
    return this.api.saveBriefDecision(briefId, 'rejected');
  }
}
