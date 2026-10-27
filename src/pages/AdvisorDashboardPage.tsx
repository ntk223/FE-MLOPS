import type { ReactElement | null } from 'react';
import type { StudentPrediction } from '../contracts/api';

export interface AdvisorDashboardPageProps {
  predictions: StudentPrediction[];
  onSelect: (predictionId: number) => void;
}

export function AdvisorDashboardPage(
  _props: AdvisorDashboardPageProps,
): ReactElement | null {
  // TODO: priority queue, module filters, status labels, and required disclaimer.
  return null;
}
