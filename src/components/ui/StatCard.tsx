import type { ReactElement } from 'react';
import styles from './ui.module.css';

/** Semantic accent for the 3px top border, aligned with status colors. */
export type StatCardAccent =
  | 'primary'
  | 'scored'
  | 'insufficient'
  | 'manual'
  | 'noPrediction';

export interface StatCardProps {
  /** Short label above the value (Vietnamese). */
  label: string;
  /** Main numeric value — rendered with tabular numerals. */
  value: string | number;
  /** Optional muted sub-note under the value. */
  note?: string;
  /** Semantic color of the top accent border. Defaults to 'primary'. */
  accent?: StatCardAccent;
}

const accentClass: Record<StatCardAccent, string> = {
  primary: styles.statCardPrimary,
  scored: styles.statCardScored,
  insufficient: styles.statCardInsufficient,
  manual: styles.statCardManual,
  noPrediction: styles.statCardNoPrediction,
};

export function StatCard({
  label,
  value,
  note,
  accent = 'primary',
}: StatCardProps): ReactElement {
  return (
    <div className={`${styles.statCard} ${accentClass[accent]}`}>
      <span className={styles.statCardLabel}>{label}</span>
      <span className={styles.statCardValue}>{value}</span>
      {note ? <span className={styles.statCardNote}>{note}</span> : null}
    </div>
  );
}
