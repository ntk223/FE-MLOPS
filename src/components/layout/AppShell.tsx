import type { ReactElement, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { UserRole } from '../../contracts/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import styles from '../ui/ui.module.css';

export interface AppShellProps {
  children: ReactNode;
  /** Display name shown in the topbar. */
  displayName: string;
  role: UserRole;
  onLogout: () => void;
}

const roleLabel: Record<UserRole, string> = {
  advisor: 'Cố vấn học tập',
  admin: 'Quản trị viên',
};

export function AppShell({
  children,
  displayName,
  role,
  onLogout,
}: AppShellProps): ReactElement {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <NavLink to="/" className={styles.logo}>
          Learn<span className={styles.logoAccent}>Guard</span>
        </NavLink>
        <nav className={styles.nav} aria-label="Điều hướng chính">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            Danh sách ưu tiên
          </NavLink>
          <span className={styles.navItemDisabled} aria-disabled="true">
            Hồ sơ sinh viên
          </span>
          <span className={styles.navItemDisabled} aria-disabled="true">
            Trạng thái hệ thống
          </span>
        </nav>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{displayName}</span>
            <Badge color="primary">{roleLabel[role]}</Badge>
          </div>
          <Button variant="secondary" onClick={onLogout}>
            Đăng xuất
          </Button>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
