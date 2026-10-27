import type { AdvisorBrief } from '../../contracts/api';
import type { LearnGuardApiClient } from '../../api/client';

export class BriefService {
  constructor(private readonly api: LearnGuardApiClient) {}

  generate(predictionId: number): Promise<AdvisorBrief> {
    // TODO: request draft and preserve generated/fallback/unavailable statuses.
    return this.api.generateBrief(predictionId);
  }

  accept(briefId: number): Promise<AdvisorBrief> {
    // TODO: record explicit advisor approval.
    return this.api.saveBriefDecision(briefId, 'accept');
  }

  reject(briefId: number, feedback: string): Promise<AdvisorBrief> {
    // TODO: require and record advisor feedback for rejection.
    return this.api.saveBriefDecision(briefId, 'reject', feedback);
  }
}
