import type { ReactElement } from 'react';

export interface LoginPageProps {
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function LoginPage(_props: LoginPageProps): ReactElement | null {
  // TODO: implement advisor/admin login form and error states.
  return null;
}
