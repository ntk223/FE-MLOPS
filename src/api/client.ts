import type {
  AdvisorBrief,
  AdvisorSession,
  StudentFilters,
  StudentPrediction,
} from '../contracts/api';

export interface LoginCredentials {
  email: string;
  password: string;
}

/** Contract shared by the real client and the mock client. */
export interface ILearnGuardApiClient {
  login(credentials: LoginCredentials): Promise<AdvisorSession>;
  listStudents(filters: StudentFilters): Promise<StudentPrediction[]>;
  getStudent(predictionId: number): Promise<StudentPrediction>;
  generateBrief(predictionId: number): Promise<AdvisorBrief>;
  saveBriefDecision(
    briefId: number,
    action: 'accept' | 'reject',
    feedback?: string,
  ): Promise<AdvisorBrief>;
}

export class LearnGuardApiClient implements ILearnGuardApiClient {
  constructor(private readonly baseUrl: string) {}

  login(_credentials: LoginCredentials): Promise<AdvisorSession> {
    // TODO: POST /auth/login; map backend response into AdvisorSession.
    throw new Error('TODO: implement backend login request');
  }

  listStudents(_filters: StudentFilters): Promise<StudentPrediction[]> {
    // TODO: GET /students with filter, ordering, and pagination parameters.
    throw new Error('TODO: implement advisor student list request');
  }

  getStudent(_predictionId: number): Promise<StudentPrediction> {
    // TODO: GET /students/{id}; never expose this API to student users.
    throw new Error('TODO: implement advisor student detail request');
  }

  generateBrief(_predictionId: number): Promise<AdvisorBrief> {
    // TODO: POST /briefs/generate and surface explicit fallback states.
    throw new Error('TODO: implement brief generation request');
  }

  saveBriefDecision(
    _briefId: number,
    _action: 'accept' | 'reject',
    _feedback?: string,
  ): Promise<AdvisorBrief> {
    // TODO: POST /briefs/{id}/decision; record advisor feedback.
    throw new Error('TODO: implement advisor decision request');
  }
}
