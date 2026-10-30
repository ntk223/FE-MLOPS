import type { ReactElement } from 'react';
import type { PredictionStatus } from '../../contracts/api';
import styles from './ui.module.css';

export type BadgeColor =
  | 'neutral'
  | 'primary'
  | 'scored'
  | 'insufficient'
  | 'manual'
  | 'noPrediction';

export interface BadgeProps {
  color?: BadgeColor;
  children: string;
}

const colorClass: Record<BadgeColor, string> = {
  neutral: styles.badgeNeutral,
  primary: styles.badgePrimary,
  scored: styles.badgeScored,
  insufficient: styles.badgeInsufficient,
  manual: styles.badgeManual,
  noPrediction: styles.badgeNoPrediction,
};

export function Badge({ color = 'neutral', children }: BadgeProps): ReactElement {
  return <span className={`${styles.badge} ${colorClass[color]}`}>{children}</span>;
}

/** Vietnamese labels for the 4 PredictionStatus values. */
const statusLabel: Record<PredictionStatus, string> = {
  scored: 'Có điểm nguy cơ',
  insufficient_data: 'Thiếu dữ liệu',
  manual_review: 'Cần xem xét thủ công',
  no_prediction: 'Không có dự đoán',
};

const statusColor: Record<PredictionStatus, BadgeColor> = {
  scored: 'scored',
  insufficient_data: 'insufficient',
  manual_review: 'manual',
  no_prediction: 'noPrediction',
};

export interface StatusBadgeProps {
  status: PredictionStatus;
  /** Optional review_reason tooltip (backend: insufficient_data | high_uncertainty | no_prediction). */
  reason?: string | null;
}

const reasonSuffix: Record<string, string> = {
  insufficient_data: '· thiếu dữ liệu',
  high_uncertainty: '· không chắc chắn',
  no_prediction: '· không có dự đoán',
};

export function StatusBadge({ status, reason }: StatusBadgeProps): ReactElement {
  const label =
    reason !== null && reason !== undefined && reasonSuffix[reason] !== undefined
      ? `${statusLabel[status]} ${reasonSuffix[reason]}`
      : statusLabel[status];
  return <Badge color={statusColor[status]}>{label}</Badge>;
}
