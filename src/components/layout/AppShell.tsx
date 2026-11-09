import type { ReactElement, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { UserRole } from '../../contracts/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: ReactNode;
  /** Display name shown in the sidebar footer. */
  displayName: string;
  role: UserRole;
  onLogout: () => void;
}

const roleLabel: Record<UserRole, string> = {
  advisor: 'Cố vấn',
  admin: 'Quản trị',
};

/** Màu badge phân biệt vai: Cố vấn indigo-soft · Quản trị success-soft. */
const roleBadgeColor: Record<UserRole, 'primary' | 'success'> = {
  advisor: 'primary',
  admin: 'success',
};

/** Một link nav — chỉ hiển thị cho đúng vai. */
interface NavEntry {
  to: string;
  label: string;
  end: boolean;
  /** undefined = hiển thị cho mọi vai. */
  roles?: UserRole[];
}

const NAV_ENTRIES: NavEntry[] = [
  {
    to: '/overview',
    label: 'Tổng quan',
    end: false,
    roles: ['admin', 'advisor'],
  },
  { to: '/', label: 'Hàng đợi', end: true, roles: ['admin', 'advisor'] },
  { to: '/evaluations', label: 'Đánh giá tự động', end: false, roles: ['admin'] },
  { to: '/audit', label: 'Nhật ký hệ thống', end: false, roles: ['admin'] },
];

export function AppShell({
  children,
  displayName,
  role,
  onLogout,
}: AppShellProps): ReactElement {
  const visibleLinks = NAV_ENTRIES.filter(
    (entry) => entry.roles === undefined || entry.roles.includes(role),
  );

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <NavLink to="/" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true" />
          Learn<span className={styles.logoAccent}>Guard</span>
        </NavLink>

        <nav className={styles.nav} aria-label="Điều hướng chính">
          {visibleLinks.map((entry) => (
            <NavLink
              key={entry.to}
              to={entry.to}
              end={entry.end}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
            >
              {entry.label}
            </NavLink>
          ))}
          {role === 'advisor' ? (
            <>
              <span className={styles.navItemDisabled} aria-disabled="true">
                Hồ sơ sinh viên
              </span>
              <span className={styles.navItemDisabled} aria-disabled="true">
                Trạng thái hệ thống
              </span>
            </>
          ) : null}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{displayName}</span>
            <Badge color={roleBadgeColor[role]}>{roleLabel[role]}</Badge>
          </div>
          <Button variant="secondary" onClick={onLogout}>
            Đăng xuất
          </Button>
        </div>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
