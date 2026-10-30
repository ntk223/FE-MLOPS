import type { ButtonHTMLAttributes, ReactElement } from 'react';
import styles from './ui.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: styles.buttonPrimary,
  secondary: styles.buttonSecondary,
  danger: styles.buttonDanger,
  ghost: styles.buttonGhost,
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={`${styles.button} ${variantClass[variant]}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading ? <SpinnerLight /> : null}
      {children}
    </button>
  );
}

function SpinnerLight(): ReactElement {
  return <span className={`${styles.spinner} ${styles.spinnerSmall} ${styles.spinnerLight}`} aria-hidden="true" />;
}
