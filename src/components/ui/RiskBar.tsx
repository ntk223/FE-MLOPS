import type { ReactElement } from 'react';
import styles from './ui.module.css';

export interface RiskBarProps {
  /** Predicted risk score in [0, 1], or null when unavailable. */
  riskScore: number | null;
  /** Decision threshold in [0, 1] shown as a vertical marker. */
  threshold: number | null;
  /** Model uncertainty in [0, 1], displayed as a secondary label. */
  uncertainty: number | null;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
}

export function RiskBar({
  riskScore,
  threshold,
  uncertainty,
}: RiskBarProps): ReactElement {
  if (riskScore === null) {
    return (
      <div className={styles.riskBar}>
        <span className={styles.riskBarNoScore}>Không có điểm</span>
      </div>
    );
  }

  const clamped = Math.min(1, Math.max(0, riskScore));

  return (
    <div className={styles.riskBar}>
      <div
        className={styles.riskBarTrack}
        role="img"
        aria-label={`Điểm nguy cơ ${formatPercent(riskScore)}, ngưỡng ${formatPercent(threshold)}`}
      >
        <div className={styles.riskBarFill} style={{ width: `${clamped * 100}%` }} />
        {threshold !== null ? (
          <div
            className={styles.riskBarThreshold}
            style={{ left: `calc(${Math.min(1, Math.max(0, threshold)) * 100}% - 1px)` }}
          />
        ) : null}
      </div>
      <div className={styles.riskBarLabels}>
        <span>Điểm: {formatPercent(riskScore)}</span>
        <span>Ngưỡng: {formatPercent(threshold)}</span>
        <span>Không chắc: {formatPercent(uncertainty)}</span>
      </div>
    </div>
  );
}
