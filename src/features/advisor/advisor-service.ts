import type { StudentFilters, StudentPrediction } from '../../contracts/api';
import type { ILearnGuardApiClient } from '../../api/client';

export class AdvisorService {
  constructor(private readonly api: ILearnGuardApiClient) {}

  getPriorityQueue(filters: StudentFilters): Promise<StudentPrediction[]> {
    // TODO: request advisor queue and apply documented priority ordering.
    return this.api.listStudents(filters);
  }

  getStudentProfile(predictionId: number): Promise<StudentPrediction> {
    // TODO: load prediction detail and map insufficient/uncertain states.
    return this.api.getStudent(predictionId);
  }
}
