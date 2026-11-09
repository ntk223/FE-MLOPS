import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  ApiError,
  PredictionPage,
  PredictionStatus,
  StudentFilters,
  StudentPrediction,
} from '../contracts/api';
import { apiClient } from '../api';
import { AdvisorService } from '../features/advisor/advisor-service';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  RiskBar,
  Select,
  StatusBadge,
} from '../components/ui';
import type { DataTableColumn, SelectOption } from '../components/ui';
import styles from './AdvisorDashboardPage.module.css';

export interface AdvisorDashboardPageProps {
  /**
   * Legacy prop kept for App.tsx compatibility. The page loads its own data
   * through AdvisorService; this prop is intentionally not rendered.
   */
  predictions?: StudentPrediction[];
  /** Legacy prop kept for App.tsx compatibility; invoked when a row is opened. */
  onSelect?: (ref: StudentPrediction) => void;
}

const PAGE_SIZE = 15;

const advisorService = new AdvisorService(apiClient);

interface QueueFilters {
  moduleCode: string;
  presentationCode: string;
  riskState: string;
}

const DEFAULT_FILTERS: QueueFilters = {
  moduleCode: '',
  presentationCode: '',
  riskState: '',
};

const MODULE_OPTIONS: SelectOption[] = [
  { value: '', label: 'Tất cả' },
  { value: 'AAA', label: 'AAA' },
  { value: 'BBB', label: 'BBB' },
  { value: 'CCC', label: 'CCC' },
  { value: 'DDD', label: 'DDD' },
  { value: 'EEE', label: 'EEE' },
];

const PRESENTATION_OPTIONS: SelectOption[] = [
  { value: '', label: 'Tất cả' },
  { value: '2013J', label: '2013J' },
  { value: '2014B', label: '2014B' },
  { value: '2013B', label: '2013B' },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: 'Tất cả' },
  { value: 'scored', label: 'Có điểm nguy cơ' },
  { value: 'insufficient_data', label: 'Thiếu dữ liệu' },
  { value: 'manual_review', label: 'Cần xem xét thủ công' },
  { value: 'no_prediction', label: 'Không có dự đoán' },
];

/**
 * §3.9-bis: non-scored statuses must show an explicit reason label instead of
 * a bar or a default score.
 */
const NO_SCORE_REASONS: Record<Exclude<PredictionStatus, 'scored'>, string> = {
  insufficient_data: 'Thiếu dữ liệu để chấm điểm',
  manual_review: 'Chờ xem xét thủ công',
  no_prediction: 'Không có dự đoán',
};

function isPredictionStatus(value: string): value is PredictionStatus {
  return (
    value === 'scored' ||
    value === 'insufficient_data' ||
    value === 'manual_review' ||
    value === 'no_prediction'
  );
}

function buildApiFilters(filters: QueueFilters): StudentFilters {
  const apiFilters: StudentFilters = {};
  if (filters.moduleCode !== '') {
    apiFilters.codeModule = filters.moduleCode;
  }
  if (filters.presentationCode !== '') {
    apiFilters.codePresentation = filters.presentationCode;
  }
  if (isPredictionStatus(filters.riskState)) {
    apiFilters.status = filters.riskState;
  }
  return apiFilters;
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
    message: 'Không thể tải danh sách ưu tiên. Vui lòng thử lại.',
  };
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
}

/** Stable unique key of a prediction row (same as DataTable getRowKey). */
function rowKey(row: StudentPrediction): string {
  return `${row.codeModule}-${row.codePresentation}-${row.studentKey}`;
}

export function AdvisorDashboardPage({
  onSelect,
}: AdvisorDashboardPageProps): ReactElement {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_FILTERS);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<StudentPrediction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  /** "Cập nhật lúc HH:mm:ss" — set sau mỗi lần fetch hàng đợi thành công. */
  const [queueUpdatedAt, setQueueUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    advisorService
      .getPriorityQueue({
        ...buildApiFilters(filters),
        orderBy: 'risk_score',
        limit: PAGE_SIZE,
        offset,
      })
      .then((page: PredictionPage) => {
        if (cancelled) {
          return;
        }
        setRows(page.items);
        setTotal(page.total);
        setHasMore(offset + page.items.length < page.total);
        setQueueUpdatedAt(
          new Intl.DateTimeFormat('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }).format(new Date()),
        );
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
  }, [filters, offset, reloadToken]);

  function handleFilterChange(patch: Partial<QueueFilters>): void {
    setFilters((previous) => ({ ...previous, ...patch }));
    setOffset(0);
  }

  function openProfile(row: StudentPrediction): void {
    onSelect?.(row);
    navigate(
      `/predictions/${encodeURIComponent(row.codeModule)}` +
        `/${encodeURIComponent(row.codePresentation)}` +
        `/${encodeURIComponent(row.studentKey)}`,
    );
  }

  // Rank chips (1/2/3) apply to the top-3 priority-bearing rows of the
  // current sorted result — page 1 only (offset 0).
  const rankByKey = new Map<string, number>();
  if (offset === 0) {
    let rank = 0;
    for (const row of rows.slice(0, 3)) {
      if (row.riskScore !== null && row.uncertainty !== null) {
        rank += 1;
        rankByKey.set(rowKey(row), rank);
      }
    }
  }

  const columns: Array<DataTableColumn<StudentPrediction>> = [
    {
      key: 'student',
      header: 'Sinh viên',
      render: (row) => (
        <button
          type="button"
          className={styles.studentLink}
          onClick={() => openProfile(row)}
        >
          {row.studentKey}
        </button>
      ),
    },
    {
      key: 'module',
      header: 'Học phần / Kỳ',
      render: (row) => `${row.codeModule} · ${row.codePresentation}`,
    },
    {
      key: 'risk',
      header: 'Điểm nguy cơ',
      render: (row) => {
        if (row.status === 'scored') {
          return (
            <RiskBar
              riskScore={row.riskScore}
              threshold={row.threshold}
              uncertainty={row.uncertainty}
            />
          );
        }
        return (
          <span
            className={
              row.status === 'insufficient_data'
                ? styles.noScoreReason
                : `${styles.noScoreReason} ${styles.noScoreReasonWarn}`
            }
          >
            {NO_SCORE_REASONS[row.status]}
          </span>
        );
      },
    },
    {
      key: 'uncertainty',
      header: 'Độ không chắc chắn',
      render: (row) =>
        row.status === 'scored' && row.uncertainty !== null ? (
          <span className={styles.numText}>{formatPercent(row.uncertainty)}</span>
        ) : (
          <span className={styles.nullValue}>—</span>
        ),
    },
    {
      key: 'priority',
      header: 'Mức ưu tiên',
      render: (row) => {
        if (row.riskScore === null || row.uncertainty === null) {
          return <span className={styles.nullValue}>—</span>;
        }
        const rank = rankByKey.get(rowKey(row));
        const priority = row.riskScore * row.uncertainty;
        return (
          <span className={styles.priorityCell}>
            {rank !== undefined ? (
              <span className={styles.rankChip}>{rank}</span>
            ) : null}
            <span className={styles.priorityValue}>{priority.toFixed(2)}</span>
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (row) =>
        row.reviewReason !== null ? (
          <StatusBadge status={row.status} reason={row.reviewReason} />
        ) : (
          <StatusBadge status={row.status} />
        ),
    },
    {
      key: 'actions',
      header: 'Hành động',
      render: (row) => (
        <Button
          variant="secondary"
          onClick={() => openProfile(row)}
        >
          Xem hồ sơ
        </Button>
      ),
    },
  ];

  const rangeStart = rows.length > 0 ? offset + 1 : 0;
  const rangeEnd = offset + rows.length;
  // Backend trả total thật — phân trang chính xác, không cần heuristic.
  const totalLabel = `${total}`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Danh sách ưu tiên</h1>
        <p className={styles.subtitle}>
          Điểm gợi ý ưu tiên — đầu vào để xem xét, không phải kết luận.
        </p>
      </header>

      <section className={styles.filterBar} aria-label="Bộ lọc danh sách">
        <Select
          id="filter-module"
          label="Học phần"
          options={MODULE_OPTIONS}
          value={filters.moduleCode}
          onChange={(event) =>
            handleFilterChange({ moduleCode: event.target.value })
          }
        />
        <Select
          id="filter-presentation"
          label="Kỳ học"
          options={PRESENTATION_OPTIONS}
          value={filters.presentationCode}
          onChange={(event) =>
            handleFilterChange({ presentationCode: event.target.value })
          }
        />
        <Select
          id="filter-status"
          label="Trạng thái"
          options={STATUS_OPTIONS}
          value={filters.riskState}
          onChange={(event) =>
            handleFilterChange({ riskState: event.target.value })
          }
        />
      </section>

      <div className={styles.tableRegion} aria-busy={loading}>
        <div className={styles.tableCard}>
          {loading ? (
            <div className={styles.skeleton} role="status" aria-label="Đang tải danh sách ưu tiên…">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className={styles.skeletonRow}
                  style={{ width: `${100 - index * 7}%` }}
                />
              ))}
            </div>
          ) : error !== null ? (
            <div className={styles.errorBox}>
              <ErrorState
                code={error.code}
                message={error.message}
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
          ) : rows.length === 0 ? (
            <EmptyState title="Không có sinh viên nào khớp bộ lọc." />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={rows}
                getRowKey={rowKey}
                caption="Danh sách sinh viên ưu tiên theo điểm gợi ý"
              />
              <div className={styles.tableFooter}>
                <span className={styles.rangeText}>
                  Hiển thị <strong>{rangeStart}–{rangeEnd}</strong> trên{' '}
                  <strong>{totalLabel}</strong> sinh viên
                </span>
                <div className={styles.paginationActions}>
                  <Button
                    variant="secondary"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    ← Trước
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!hasMore}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    Sau →
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
        <p className={styles.updatedAt}>
          {queueUpdatedAt !== null ? `Cập nhật lúc ${queueUpdatedAt} · ` : ''}
          Tín hiệu được sắp theo mức đóng góp và thể hiện tương quan, không
          phải quan hệ nhân quả.
        </p>
      </div>
    </div>
  );
}
