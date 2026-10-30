import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError } from '../contracts/api';
import { Button, TextField } from '../components/ui';
import styles from './LoginPage.module.css';

export interface LoginPageProps {
  /** Performs the login request; throws a structured ApiError on failure. */
  onSubmit: (email: string, password: string) => Promise<void>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  email?: string;
  password?: string;
}

type SubmitError = Pick<ApiError, 'code' | 'message'>;

function isApiErrorLike(value: unknown): value is SubmitError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return typeof (value as Record<string, unknown>).code === 'string';
}

const DEMO_ACCOUNTS = [
  { role: 'Cố vấn', email: 'advisor@learnguard.vn', password: 'advisor123' },
  { role: 'Quản trị', email: 'admin@learnguard.vn', password: 'admin123' },
];

export function LoginPage({ onSubmit }: LoginPageProps): ReactElement {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const useMock = import.meta.env.VITE_USE_MOCK !== 'false';

  function validate(): FormErrors {
    const errors: FormErrors = {};
    const trimmedEmail = email.trim();
    if (trimmedEmail.length === 0) {
      errors.email = 'Vui lòng nhập email.';
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = 'Email không đúng định dạng.';
    }
    if (password.length === 0) {
      errors.password = 'Vui lòng nhập mật khẩu.';
    } else if (password.length < 6) {
      errors.password = 'Mật khẩu phải có ít nhất 6 ký tự.';
    }
    return errors;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    onSubmit(email.trim(), password)
      .then(() => {
        navigate('/', { replace: true });
      })
      .catch((error: unknown) => {
        setSubmitError(
          isApiErrorLike(error) && error.code === 'INVALID_CREDENTIALS'
            ? 'Email hoặc mật khẩu không đúng.'
            : 'Không thể đăng nhập. Vui lòng thử lại.',
        );
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <span className={styles.logo} aria-hidden="true">
            LG
          </span>
          <h1 className={styles.title}>LearnGuard</h1>
          <p className={styles.tagline}>
            Hỗ trợ phát hiện sớm sinh viên có nguy cơ không hoàn thành học phần
          </p>
        </header>

        {submitError !== null ? (
          <p className={styles.formError} role="alert">
            {submitError}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.fieldStack}>
            <TextField
              id="login-email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="ten@learnguard.vn"
              value={email}
              error={fieldErrors.email}
              disabled={submitting}
              onChange={(event) => setEmail(event.target.value)}
            />
            <TextField
              id="login-password"
              label="Mật khẩu"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              error={fieldErrors.password}
              disabled={submitting}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" loading={submitting} className={styles.submitButton}>
              {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
          </div>
        </form>

        {useMock ? (
          <aside className={styles.demoBox}>
            <p className={styles.demoTitle}>Tài khoản demo (chế độ mock)</p>
            <ul className={styles.demoList}>
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email} className={styles.demoItem}>
                  <span className={styles.demoRole}>{account.role}:</span>{' '}
                  <code className={styles.demoCode}>{account.email}</code> /{' '}
                  <code className={styles.demoCode}>{account.password}</code>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
