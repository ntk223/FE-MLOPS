import type { ReactElement, ReactNode } from 'react';
import styles from './ui.module.css';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  title,
  description,
  action,
}: EmptyStateProps): ReactElement {
  return (
    <div className={styles.placeholder}>
      <span className={styles.placeholderTitle}>{title}</span>
      {description ? <span className={styles.placeholderText}>{description}</span> : null}
      {action}
    </div>
  );
}
