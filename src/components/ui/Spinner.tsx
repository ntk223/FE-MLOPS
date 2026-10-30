import type { ReactElement } from 'react';
import styles from './ui.module.css';

export interface SpinnerProps {
  /** Accessible label announced to screen readers. Defaults to "Đang tải…". */
  label?: string;
  small?: boolean;
}

export function Spinner({ label = 'Đang tải…', small = false }: SpinnerProps): ReactElement {
  return (
    <span
      className={`${styles.spinner} ${small ? styles.spinnerSmall : ''}`}
      role="status"
      aria-label={label}
    />
  );
}
