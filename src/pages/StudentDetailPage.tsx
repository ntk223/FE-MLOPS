import type { ReactElement } from 'react';
import type { AdvisorBrief, StudentPrediction } from '../contracts/api';

export interface StudentDetailPageProps {
  prediction: StudentPrediction;
  brief?: AdvisorBrief;
}

export function StudentDetailPage(
  _props: StudentDetailPageProps,
): ReactElement | null {
  // TODO: show signals, uncertainty, data status, and advisor-only brief workflow.
  return null;
}
