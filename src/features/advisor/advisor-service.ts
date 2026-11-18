import type {
  PredictionRef,
  StudentFilters,
  StudentPrediction,
} from '../../contracts/api';
import type { ILearnGuardApiClient, QueueStats } from '../../api/client';

/**
 * Advisor-facing reads over the read-only ml_predictions API
 * (docs/API_CONTRACT.md §1). Sorting/pagination semantics are owned by the
 * backend; this service is a thin, typed boundary.
 */
export class AdvisorService {
  private readonly inFlightQueue = new Map<string, Promise<any>>();

  constructor(private readonly api: ILearnGuardApiClient) {}

  getPriorityQueue(filters: StudentFilters) {
    const key = JSON.stringify(filters);
    const inFlight = this.inFlightQueue.get(key);
    if (inFlight) {
      return inFlight;
    }
    const promise = this.api.listPredictions(filters).finally(() => {
      this.inFlightQueue.delete(key);
    });
    this.inFlightQueue.set(key, promise);
    return promise;
  }

  /** Aggregated counts for the dashboard summary strip (mock-stage endpoint). */
  getQueueStats(filters: StudentFilters): Promise<QueueStats> {
    return this.api.getQueueStats(filters);
  }

  getStudentProfile(ref: PredictionRef): Promise<StudentPrediction> {
    return this.api.getPrediction(ref);
  }

  getStudentHistory(studentKey: string) {
    return this.api.listPredictionsForStudent(studentKey);
  }
}
