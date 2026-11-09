import type { ReactElement } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { apiClient } from './api';
import { AppShell } from './components/layout/AppShell';
import { Button, EmptyState } from './components/ui';
import { AdvisorDashboardPage } from './pages/AdvisorDashboardPage';
import { AuditPage } from './pages/AuditPage';
import { EvaluationsPage } from './pages/EvaluationsPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { StudentDetailPage } from './pages/StudentDetailPage';
import { AuthService } from './features/auth/auth-service';
import type { UserRole } from './contracts/api';
import { clearSession, readSession } from './utils/session';

const authService = new AuthService(apiClient);

/** Trang chủ mặc định theo vai — dùng cho nút "Về trang chủ" và redirect. */
function roleHome(role: UserRole): string {
  return role === 'admin' ? '/overview' : '/';
}

/** Redirects to /login when no valid session is stored. */
function RequireAuth({ children }: { children: ReactElement }): ReactElement {
  const session = readSession();
  const location = useLocation();
  if (session === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/**
 * Trang "Không có quyền truy cập" — hiển thị khi vai không được phép vào
 * route (vd. Cố vấn mở trực tiếp /evaluations hoặc /audit).
 */
function ForbiddenPage({ role }: { role: UserRole }): ReactElement {
  return (
    <EmptyState
      title="Không có quyền truy cập"
      description="Trang này dành cho Quản trị hệ thống"
      action={
        <Link to={roleHome(role)}>
          <Button variant="secondary">Về trang chủ</Button>
        </Link>
      }
    />
  );
}

/**
 * Route guard theo vai: vai không nằm trong `allow` → trang thông báo
 * thay vì render nội dung (đỡ bắt redirect vòng khi gõ URL trực tiếp).
 */
function RequireRole({
  allow,
  children,
}: {
  allow: UserRole[];
  children: ReactElement;
}): ReactElement {
  const session = readSession();
  if (session === null) {
    return <Navigate to="/login" replace />;
  }
  if (!allow.includes(session.role)) {
    return <ForbiddenPage role={session.role} />;
  }
  return children;
}

/** Wraps guarded pages in the shell with logout handling. */
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

/**
 * Trang chủ `/`: hàng đợi — cả Cố vấn lẫn Quản trị đều xem được
 * (Quản trị cần thấy thống kê sinh viên để theo dõi tổng thể).
 */
function RoleHome(): ReactElement {
  return <AdvisorDashboardPage />;
}

/**
 * Route /overview: cả 2 vai đều xem được; link sang hệ thống (/evaluations,
 * /audit) chỉ hiển thị cho Quản trị.
 */
function OverviewRoute(): ReactElement {
  const session = readSession();
  return (
    <RequireAuth>
      <AuthedShell>
        <RequireRole allow={['admin', 'advisor']}>
          <OverviewPage
            variant={session?.role === 'admin' ? 'admin' : 'advisor'}
          />
        </RequireRole>
      </AuthedShell>
    </RequireAuth>
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
                <RoleHome />
              </AuthedShell>
            </RequireAuth>
          }
        />
        <Route
          path="/overview"
          element={<OverviewRoute />}
        />
        <Route
          path="/evaluations"
          element={
            <RequireAuth>
              <AuthedShell>
                <RequireRole allow={['admin']}>
                  <EvaluationsPage />
                </RequireRole>
              </AuthedShell>
            </RequireAuth>
          }
        />
        <Route
          path="/audit"
          element={
            <RequireAuth>
              <AuthedShell>
                <RequireRole allow={['admin']}>
                  <AuditPage />
                </RequireRole>
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
