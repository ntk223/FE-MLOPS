import type { ReactElement } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { apiClient } from './api';
import { AppShell } from './components/layout/AppShell';
import { AdvisorDashboardPage } from './pages/AdvisorDashboardPage';
import { LoginPage } from './pages/LoginPage';
import { StudentDetailPage } from './pages/StudentDetailPage';
import { AuthService } from './features/auth/auth-service';
import { clearSession, readSession } from './utils/session';

const authService = new AuthService(apiClient);

/** Redirects to /login when no valid session is stored. */
function RequireAuth({ children }: { children: ReactElement }): ReactElement {
  const session = readSession();
  const location = useLocation();
  if (session === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/** Wraps guarded pages in the advisor shell with logout handling. */
function AuthedShell({ children }: { children: ReactElement }): ReactElement {
  const session = readSession();
  if (session === null) {
    return <Navigate to="/login" replace />;
  }
  return (
    <AppShell
      displayName={session.displayName}
      role={session.role}
      onLogout={() => {
        clearSession();
        window.location.assign('/login');
      }}
    >
      {children}
    </AppShell>
  );
}

export function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginPage
              onSubmit={(email, password) => {
                const login = authService.login({ email, password });
                return login.then(() => undefined);
              }}
            />
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AuthedShell>
                <AdvisorDashboardPage />
              </AuthedShell>
            </RequireAuth>
          }
        />
        <Route
          path="/predictions/:codeModule/:codePresentation/:studentKey"
          element={
            <RequireAuth>
              <AuthedShell>
                <StudentDetailPage />
              </AuthedShell>
            </RequireAuth>
          }
        />
        {/* Legacy route — redirect to the canonical predictions list. */}
        <Route path="/students/:id" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
