import type { ReactElement, SelectHTMLAttributes } from 'react';
import styles from './ui.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'> {
  id: string;
  label: string;
  options: SelectOption[];
}

export function Select({
  id,
  label,
  options,
  ...rest
}: SelectProps): ReactElement {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <select id={id} className={styles.select} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
