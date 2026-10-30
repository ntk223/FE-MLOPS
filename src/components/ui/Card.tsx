import type { ReactElement, ReactNode } from 'react';
import styles from './ui.module.css';

export interface CardProps {
  children: ReactNode;
}

export function Card({ children }: CardProps): ReactElement {
  return <section className={styles.card}>{children}</section>;
}
