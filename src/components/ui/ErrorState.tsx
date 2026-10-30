import type { ReactElement } from 'react';
import styles from './ui.module.css';

export interface ErrorStateProps {
  code: string;
  message: string;
  requestId?: string;
}

export function ErrorState({
  code,
  message,
  requestId,
}: ErrorStateProps): ReactElement {
  return (
    <div className={`${styles.placeholder} ${styles.placeholderError}`} role="alert">
      <span className={styles.placeholderTitle}>Đã xảy ra lỗi</span>
      <span className={styles.placeholderText}>{message}</span>
      <span className={styles.requestId}>
        Mã lỗi: {code}
        {requestId ? ` · Mã yêu cầu: ${requestId}` : ''}
      </span>
    </div>
  );
}
