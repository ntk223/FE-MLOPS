import type {
  PredictionRef,
  StudentFilters,
  StudentPrediction,
} from '../../contracts/api';
import type { ILearnGuardApiClient } from '../../api/client';

/**
 * Advisor-facing reads over the read-only ml_predictions API
 * (docs/API_CONTRACT.md §1). Sorting/pagination semantics are owned by the
 * backend; this service is a thin, typed boundary.
 */
export class AdvisorService {
  constructor(private readonly api: ILearnGuardApiClient) {}

  getPriorityQueue(filters: StudentFilters) {
    return this.api.listPredictions(filters);
  }

  getStudentProfile(ref: PredictionRef): Promise<StudentPrediction> {
    return this.api.getPrediction(ref);
  }

  getStudentHistory(studentKey: string) {
    return this.api.listPredictionsForStudent(studentKey);
  }
}
