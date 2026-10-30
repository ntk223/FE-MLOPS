import type { InputHTMLAttributes, ReactElement } from 'react';
import styles from './ui.module.css';

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  error?: string;
}

export function TextField({
  id,
  label,
  error,
  required,
  ...rest
}: TextFieldProps): ReactElement {
  const errorId = `${id}-error`;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? (
          <span className={styles.requiredMark} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <input
        id={id}
        className={`${styles.input} ${error ? styles.inputInvalid : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        required={required}
        {...rest}
      />
      {error ? (
        <span className={styles.errorText} id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
