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

/**
 * Score distance (absolute) below the threshold that counts as
 * "approaching" — the fill turns amber in this band, red at/over the
 * threshold, teal when far below. Matches the redesign mockup
 * (47% vs ngưỡng 60% = amber).
 */
const APPROACH_BAND = 0.15;

type FillTone = 'teal' | 'amber' | 'red';

const fillToneClass: Record<FillTone, string> = {
  teal: styles.riskBarFillTeal,
  amber: styles.riskBarFillAmber,
  red: styles.riskBarFillRed,
};

/** Teal far below → amber approaching → red at/over the threshold. */
function resolveFillTone(score: number, threshold: number | null): FillTone {
  if (threshold === null) {
    return score >= 0.6 ? 'red' : 'teal';
  }
  if (score >= threshold) {
    return 'red';
  }
  return score >= threshold - APPROACH_BAND ? 'amber' : 'teal';
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
  const tone = resolveFillTone(clamped, threshold);

  return (
    <div className={styles.riskBar}>
      <div
        className={styles.riskBarTrack}
        role="img"
        aria-label={`Điểm nguy cơ ${formatPercent(riskScore)}, ngưỡng ${formatPercent(threshold)}`}
      >
        <div
          className={`${styles.riskBarFill} ${fillToneClass[tone]}`}
          style={{ width: `${clamped * 100}%` }}
        />
        {threshold !== null ? (
          <div
            className={styles.riskBarThreshold}
            style={{ left: `calc(${Math.min(1, Math.max(0, threshold)) * 100}% - 1px)` }}
          >
            <span className={styles.riskBarThresholdLabel}>
              Ngưỡng {formatPercent(threshold)}
            </span>
          </div>
        ) : null}
      </div>
      <div className={styles.riskBarLabels}>
        <span className={styles.riskBarScore}>Điểm {formatPercent(riskScore)}</span>
        <span>Ngưỡng {formatPercent(threshold)}</span>
        {uncertainty !== null ? (
          <span className={styles.riskBarUncertainty}>
            Không chắc {formatPercent(uncertainty)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
