import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { ApiError } from '../contracts/api';
import type { AuditLogListResult, AuditLog } from '../api/client';
import { apiClient } from '../api';
import { actionLabel, actionTone } from '../features/audit/audit-labels';
import { Button, EmptyState, ErrorState, Select } from '../components/ui';
import styles from './AuditPage.module.css';

const LIST_LIMIT = 50;

function ActionBadge({ action }: { action: string }): ReactElement {
  const tone = actionTone(action);
  return (
    <span className={`${styles.actionBadge} ${styles[`tone${tone.charAt(0).toUpperCase()}${tone.slice(1)}`]}`}>
      {actionLabel(action)}
    </span>
  );
}

function toApiError(error: unknown): ApiError {
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.code === 'string' && typeof record.message === 'string') {
      return {
        code: record.code,
        message: record.message,
        requestId:
          typeof record.requestId === 'string' ? record.requestId : undefined,
      };
    }
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: 'Không thể tải nhật ký hệ thống. Vui lòng thử lại.',
  };
}

/** Thời gian vi-VN đầy đủ: "Thứ Sáu, 6 tháng 11, 2026 09:42:10". */
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'full',
  timeStyle: 'medium',
});

function formatFullDateTime(iso: string): string {
  if (iso === '') {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return FULL_DATE_FORMATTER.format(date);
}

const TIME_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** "Cập nhật lúc HH:mm:ss" sau mỗi lần fetch thành công. */
function nowTimeString(): string {
  return TIME_FORMATTER.format(new Date());
}

/** Skeleton shimmer — 6 hàng nhấp nháy nhẹ khi tải danh sách log. */
function SkeletonRows({ rows = 6 }: { rows?: number }): ReactElement {
  return (
    <div className={styles.skeleton} role="status" aria-label="Đang tải nhật ký…">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={styles.skeletonRow}
          style={{ width: `${100 - (index % 4) * 6}%` }}
        />
      ))}
    </div>
  );
}

/** Chi tiết payload — <details> JSON pretty, monospace; null → "—". */
function PayloadCell({ log }: { log: AuditLog }): ReactElement {
  if (log.payload === null || Object.keys(log.payload).length === 0) {
    return <span className={styles.mutedText}>—</span>;
  }
  const pretty = JSON.stringify(log.payload, null, 2);
  return (
    <details className={styles.payloadDetails}>
      <summary>Xem chi tiết</summary>
      <pre className={styles.payloadPre}>{pretty}</pre>
    </details>
  );
}

function LogRow({ log }: { log: AuditLog }): ReactElement {
  const isSystem = log.actorName === null && log.actorEmail === null;
  return (
    <tr>
      <td>
        <span className={styles.atText}>{formatFullDateTime(log.at)}</span>
      </td>
      <td>
        {isSystem ? (
          <span className={styles.systemActor}>Hệ thống</span>
        ) : (
          <span className={styles.actorWrap}>
            <span className={styles.actorName}>{log.actorName}</span>
            <span className={styles.actorEmail}>{log.actorEmail}</span>
          </span>
        )}
      </td>
      <td>
        <ActionBadge action={log.action} />
      </td>
      <td>
        <span className={styles.entityWrap}>
          <code className={styles.entityName}>{log.entity}</code>
          {log.entityId !== null ? (
            <span className={styles.entityId}>#{log.entityId}</span>
          ) : null}
        </span>
      </td>
      <td>
        <PayloadCell log={log} />
      </td>
    </tr>
  );
}

export function AuditPage(): ReactElement {
  const [result, setResult] = useState<AuditLogListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  /** Bộ lọc: 'all' → không gửi param tương ứng lên API. */
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  /** Tăng mỗi lần bấm "Làm mới" → refetch. */
  const [reloadToken, setReloadToken] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient
      .listAuditLogs({
        limit: LIST_LIMIT,
        ...(actionFilter !== 'all' ? { action: actionFilter } : {}),
        ...(entityFilter !== 'all' ? { entity: entityFilter } : {}),
      })
      .then((next) => {
        if (cancelled) {
          return;
        }
        setResult(next);
        setUpdatedAt(nowTimeString());
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(toApiError(cause));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [actionFilter, entityFilter, reloadToken]);

  const logs = result?.logs ?? [];
  const actions = result?.actions ?? [];
  const entities = result?.entities ?? [];
  /** 503 database_not_configured (backend đang code song song). */
  const isDbNotConfigured = error?.code === 'HTTP_503';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Nhật ký hệ thống</h1>
            <p className={styles.subtitle}>
              Ghi nhận toàn bộ hoạt động trên nền tảng — brief, quyết định cố
              vấn, đánh giá tự động và đăng nhập.
            </p>
            {updatedAt !== null ? (
              <p className={styles.updatedAt}>Cập nhật lúc {updatedAt}</p>
            ) : null}
          </div>
          <div className={styles.refreshButton}>
            <Button
              variant="secondary"
              loading={loading}
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Làm mới
            </Button>
          </div>
        </div>
      </header>

      <div className={styles.filterBar} aria-label="Bộ lọc nhật ký">
        <Select
          id="audit-action-filter"
          label="Hành động"
          value={actionFilter}
          onChange={(event) => setActionFilter(event.target.value)}
          options={[
            { value: 'all', label: 'Tất cả' },
            ...actions.map((action) => ({
              value: action,
              label: actionLabel(action),
            })),
          ]}
        />
        <Select
          id="audit-entity-filter"
          label="Đối tượng"
          value={entityFilter}
          onChange={(event) => setEntityFilter(event.target.value)}
          options={[
            { value: 'all', label: 'Tất cả' },
            ...entities.map((entity) => ({ value: entity, label: entity })),
          ]}
        />
        {!loading && error === null ? (
          <span className={styles.countText}>
            {logs.length}/{result?.total ?? 0} bản ghi
          </span>
        ) : null}
      </div>

      <div className={styles.card} aria-busy={loading}>
        {loading ? (
          <SkeletonRows rows={6} />
        ) : error !== null ? (
          <div className={styles.errorBox}>
            <ErrorState
              code={error.code}
              message={
                isDbNotConfigured
                  ? 'Nhật ký hệ thống chưa sẵn sàng — backend chưa cấu hình database (database_not_configured).'
                  : error.message
              }
              requestId={error.requestId}
            />
            <div className={styles.errorActions}>
              <Button
                variant="secondary"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                Thử lại
              </Button>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className={styles.emptyWrap}>
            <EmptyState
              title="Chưa có nhật ký nào"
              description="Không có bản ghi nào khớp bộ lọc hiện tại. Thử chọn 'Tất cả' ở bộ lọc Hành động / Đối tượng."
            />
          </div>
        ) : (
          <table className={styles.logsTable}>
            <caption className="srOnly">Danh sách nhật ký hệ thống</caption>
            <thead>
              <tr>
                <th scope="col">Thời gian</th>
                <th scope="col">Người thực hiện</th>
                <th scope="col">Hành động</th>
                <th scope="col">Đối tượng</th>
                <th scope="col">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <LogRow key={log.logId} log={log} />
              ))}
            </tbody>
          </table>
        )}
      </div>
      {!loading && error === null && logs.length > 0 ? (
        <p className={styles.mutedText}>
          Hiển thị {logs.length} bản ghi gần nhất (tối đa {result?.limit ?? LIST_LIMIT}).
        </p>
      ) : null}
    </div>
  );
}
