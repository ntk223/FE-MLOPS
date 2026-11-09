import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError, StudentPrediction } from '../contracts/api';
import type {
  AuditLog,
  AuditLogListResult,
  EvaluationRunListResult,
  EvaluationRunSummary,
  QueueStats,
} from '../api/client';
import { apiClient } from '../api';
import { actionLabel, actionTone } from '../features/audit/audit-labels';
import { Badge, Button, ErrorState, StatCard } from '../components/ui';
import styles from './OverviewPage.module.css';

/** Học phần theo dõi rủi ro — module lỗi/không có sinh viên flagged → bỏ qua. */
const MODULE_CODES: readonly string[] = [
  'AAA',
  'BBB',
  'CCC',
  'DDD',
  'EEE',
  'FFF',
  'GGG',
];

const ACTIVITY_LIMIT = 6;

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
    message: 'Không thể tải tổng quan hệ thống. Vui lòng thử lại.',
  };
}

/* ------------------------------------------------------------------ */
/* Định dạng thời gian vi-VN                                           */
/* ------------------------------------------------------------------ */

const UPDATED_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** "Cập nhật lúc HH:mm:ss" sau mỗi lần fetch thành công. */
function nowTimeString(): string {
  return UPDATED_FORMATTER.format(new Date());
}

const EVAL_DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatEvalDateTime(iso: string): string {
  if (iso === '') {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return EVAL_DATE_FORMATTER.format(date);
}

const SHORT_TIME_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
});

/** Giờ ngắn "HH:mm" cho dòng hoạt động gần đây. */
function formatShortTime(iso: string): string {
  const date = new Date(iso);
  if (iso === '' || Number.isNaN(date.getTime())) {
    return '—';
  }
  return SHORT_TIME_FORMATTER.format(date);
}

/* ------------------------------------------------------------------ */
/* Bar chart "Rủi ro theo học phần"                                    */
/* ------------------------------------------------------------------ */

/** 1 hàng bar chart — % aboveThreshold trên flaggedTotal của 1 học phần. */
interface ModuleRiskRow {
  codeModule: string;
  flaggedTotal: number;
  aboveThreshold: number;
  percent: number;
}

/** Chuyển kết quả getQueueStats({codeModule}) → hàng chart; 0 flagged → bỏ. */
function toRiskRow(
  codeModule: string,
  stats: QueueStats,
): ModuleRiskRow | null {
  if (stats.flaggedTotal <= 0) {
    return null;
  }
  return {
    codeModule,
    flaggedTotal: stats.flaggedTotal,
    aboveThreshold: stats.aboveThreshold,
    percent: Math.round((stats.aboveThreshold / stats.flaggedTotal) * 100),
  };
}

/**
 * Hàng bar: mã học phần + track ngang + fill gradient indigo + "42/48".
 * Fill có transition width 300ms (animate 0 → % sau khi có dữ liệu).
 */
function RiskBarRow({ row }: { row: ModuleRiskRow }): ReactElement {
  return (
    <div className={styles.barRow}>
      <span className={styles.barModule}>{row.codeModule}</span>
      <div
        className={styles.barTrack}
        role="img"
        aria-label={`${row.codeModule}: ${row.aboveThreshold}/${row.flaggedTotal} sinh viên vượt ngưỡng (${row.percent}%)`}
      >
        <div
          className={styles.barFill}
          style={{ width: `${row.percent}%` }}
        />
      </div>
      <span className={styles.barCount}>
        {row.aboveThreshold}/{row.flaggedTotal}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card "Đánh giá gần nhất"                                            */
/* ------------------------------------------------------------------ */

/** Badge overall_status của run: pass xanh · warn vàng · fail đỏ. */
function overallBadge(status: EvaluationRunSummary['overallStatus']): ReactElement {
  const map: Record<
    string,
    { color: 'success' | 'scored' | 'noPrediction' | 'neutral'; label: string }
  > = {
    pass: { color: 'success', label: 'PASS' },
    warn: { color: 'scored', label: 'WARN' },
    fail: { color: 'noPrediction', label: 'FAIL' },
    skipped: { color: 'neutral', label: 'SKIPPED' },
  };
  const meta = map[status] ?? map.skipped;
  return <Badge color={meta.color}>{meta.label}</Badge>;
}

function LatestEvaluationCard({
  run,
  showLink,
}: {
  run: EvaluationRunSummary | null;
  /** Link "Xem chi tiết →" chỉ hiển thị cho Quản trị (trang /evaluations). */
  showLink: boolean;
}): ReactElement {
  if (run === null) {
    return (
      <p className={styles.cardEmpty}>Chưa có lần đánh giá nào</p>
    );
  }
  const summary = run.combinedSummary;
  return (
    <div className={styles.evalBody}>
      <div className={styles.evalHead}>
        <code className={styles.evalRunId}>{run.runId}</code>
        {overallBadge(run.overallStatus)}
      </div>
      <p className={styles.evalTime}>{formatEvalDateTime(run.createdAt)}</p>
      <p className={styles.evalChips}>
        <span className={styles.chipPass}>{summary.pass} pass</span>
        <span className={styles.chipWarn}>{summary.warn} warn</span>
        <span className={styles.chipFail}>{summary.fail} fail</span>
      </p>
      {showLink ? (
        <Link to="/evaluations" className={styles.cardLink}>
          Xem chi tiết →
        </Link>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card "Hoạt động gần đây"                                            */
/* ------------------------------------------------------------------ */

function ActivityRow({ log }: { log: AuditLog }): ReactElement {
  const tone = actionTone(log.action);
  return (
    <li className={styles.activityRow}>
      <span className={styles.activityTime}>{formatShortTime(log.at)}</span>
      <span
        className={`${styles.activityBadge} ${
          styles[`tone${tone.charAt(0).toUpperCase()}${tone.slice(1)}`]
        }`}
      >
        {actionLabel(log.action)}
      </span>
      <span className={styles.activityEntity}>
        <code>{log.entity}</code>
        {log.entityId !== null ? `#${log.entityId}` : ''}
      </span>
      <span className={styles.activityActor}>
        {log.actorName ?? 'Hệ thống'}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton shimmer — pattern AuditPage                                */
/* ------------------------------------------------------------------ */

function OverviewSkeleton(): ReactElement {
  return (
    <div role="status" aria-label="Đang tải tổng quan…">
      <div className={styles.statGrid}>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={styles.statSkeleton} />
        ))}
      </div>
      <div className={styles.grid}>
        <div className={styles.card}>
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className={styles.skeletonRow}
              style={{ width: `${100 - (index % 3) * 12}%` }}
            />
          ))}
        </div>
        <div className={styles.card}>
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className={styles.skeletonRow}
              style={{ width: `${100 - (index % 4) * 10}%` }}
            />
          ))}
        </div>
      </div>
      <div className={styles.card}>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className={styles.skeletonRow}
            style={{ width: `${100 - (index % 4) * 8}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trang /overview                                                     */
/* ------------------------------------------------------------------ */

export type OverviewVariant = 'admin' | 'advisor';

export function OverviewPage({
  variant = 'admin',
}: {
  /** admin = toàn cảnh hệ thống; advisor = góc nhìn công việc cố vấn. */
  variant?: OverviewVariant;
}): ReactElement {
  const isAdmin = variant === 'admin';
  const systemLinks = isAdmin;
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [moduleRows, setModuleRows] = useState<ModuleRiskRow[]>([]);
  const [latestRun, setLatestRun] = useState<EvaluationRunSummary | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLogListResult | null>(null);
  const [topRisk, setTopRisk] = useState<StudentPrediction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  /** Tăng mỗi lần bấm "Làm mới" / "Thử lại" → refetch. */
  const [reloadToken, setReloadToken] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  /** Bar chart animate 0 → % sau khi có dữ liệu (transition width 300ms). */
  const [barsAnimated, setBarsAnimated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBarsAnimated(false);

    // Load song song — thống kê chính là bắt buộc (lỗi → error state),
    // phần còn lại lỗi → degrade về empty, không chặn trang.
    // admin: đánh giá gần nhất + audit feed; advisor: top-5 rủi ro cao.
    const modulePromise = Promise.allSettled(
      MODULE_CODES.map((codeModule) =>
        apiClient.getQueueStats({ codeModule }),
      ),
    );

    const rolePromises: readonly [
      Promise<EvaluationRunListResult | null>,
      Promise<AuditLogListResult | null>,
      Promise<StudentPrediction[] | null>,
    ] = isAdmin
      ? [
          apiClient.listEvaluations(1).catch(() => null),
          apiClient.listAuditLogs({ limit: ACTIVITY_LIMIT }).catch(() => null),
          Promise.resolve(null),
        ]
      : [
          Promise.resolve(null),
          Promise.resolve(null),
          apiClient
            .listPredictions({ orderBy: 'risk_score', limit: 5 })
            .then((page) => page.items)
            .catch(() => null),
        ];

    Promise.all([
      apiClient.getQueueStats({}),
      modulePromise,
      rolePromises[0],
      rolePromises[1],
      rolePromises[2],
    ])
      .then(([mainStats, moduleSettled, evalResult, logResult, riskItems]) => {
        if (cancelled) {
          return;
        }
        const rows = moduleSettled
          .map((settled, index) =>
            settled.status === 'fulfilled'
              ? toRiskRow(MODULE_CODES[index], settled.value)
              : null,
          )
          .filter((row): row is ModuleRiskRow => row !== null)
          // % giảm dần; bằng nhau → nhiều flagged hơn đứng trước.
          .sort(
            (a, b) =>
              b.percent - a.percent || b.flaggedTotal - a.flaggedTotal,
          );
        setStats(mainStats);
        setModuleRows(rows);
        setLatestRun(evalResult?.runs[0] ?? null);
        setRecentLogs(logResult);
        setTopRisk(riskItems);
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
  }, [reloadToken]);

  // Sau khi render bars với width 0 → flip sang % thật để transition chạy.
  useEffect(() => {
    if (loading || moduleRows.length === 0) {
      return;
    }
    const raf = requestAnimationFrame(() => setBarsAnimated(true));
    return () => cancelAnimationFrame(raf);
  }, [loading, moduleRows]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>
              {isAdmin ? 'Tổng quan hệ thống' : 'Tổng quan công việc'}
            </h1>
            <p className={styles.subtitle}>
              {isAdmin
                ? 'Toàn cảnh rủi ro sinh viên, lần đánh giá tự động gần nhất và hoạt động trên nền tảng.'
                : 'Khối lượng công việc cố vấn: sinh viên rủi ro cần chú ý và tiến độ theo từng học phần.'}
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

      {loading ? (
        <OverviewSkeleton />
      ) : error !== null ? (
        <div className={styles.card} aria-busy="false">
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
        </div>
      ) : (
        <>
          {/* Hàng 1 — 4 StatCard từ getQueueStats() — nhãn theo vai */}
          <div className={styles.statGrid}>
            <StatCard
              label={isAdmin ? 'Sinh viên đang theo dõi' : 'Sinh viên cần xử lý'}
              value={stats?.flaggedTotal ?? 0}
              note="kỳ 2014B — model logreg-v2"
              accent="primary"
            />
            <StatCard
              label="Rủi ro cao (vượt ngưỡng 60%)"
              value={stats?.aboveThreshold ?? 0}
              accent="noPrediction"
            />
            <StatCard
              label={isAdmin ? 'Cần xem xét thủ công' : 'Chờ xem xét thủ công'}
              value={stats?.manualReview ?? 0}
              accent="manual"
            />
            <StatCard
              label={
                isAdmin ? 'Thiếu dữ liệu' : 'Thiếu dữ liệu — cần liên hệ'
              }
              value={stats?.insufficientData ?? 0}
              accent="insufficient"
            />
          </div>

          {/* Hàng 2 — bar chart rủi ro theo học phần + đánh giá gần nhất */}
          <div className={styles.grid}>
            <section className={styles.card} aria-label="Rủi ro theo học phần">
              <h2 className={styles.cardTitle}>Rủi ro theo học phần</h2>
              <p className={styles.cardHint}>
                Tỷ lệ sinh viên vượt ngưỡng rủi ro 60% trên tổng số đang theo
                dõi.
              </p>
              {moduleRows.length === 0 ? (
                <p className={styles.cardEmpty}>
                  Chưa có dữ liệu rủi ro cho học phần nào
                </p>
              ) : (
                <div className={styles.barList}>
                  {moduleRows.map((row) => (
                    <RiskBarRow
                      key={row.codeModule}
                      row={barsAnimated ? row : { ...row, percent: 0 }}
                    />
                  ))}
                </div>
              )}
            </section>

            {isAdmin ? (
              <section
                className={styles.card}
                aria-label="Đánh giá gần nhất"
              >
                <h2 className={styles.cardTitle}>Đánh giá gần nhất</h2>
                <LatestEvaluationCard run={latestRun} showLink={systemLinks} />
              </section>
            ) : (
              <section
                className={styles.card}
                aria-label="Ưu tiên chú ý ngay"
              >
                <h2 className={styles.cardTitle}>Ưu tiên chú ý ngay</h2>
                <p className={styles.cardHint}>
                  5 sinh viên rủi ro cao nhất có đủ dữ liệu hành vi để giải
                  thích.
                </p>
                {topRisk === null || topRisk.length === 0 ? (
                  <p className={styles.cardEmpty}>Chưa có dữ liệu ưu tiên</p>
                ) : (
                  <ol className={styles.riskList}>
                    {topRisk.map((student, index) => (
                      <li
                        key={`${student.codeModule}-${student.studentKey}`}
                        className={styles.riskRow}
                      >
                        <span className={styles.riskRank}>{index + 1}</span>
                        <code className={styles.riskKey}>
                          {student.studentKey.slice(0, 10)}…
                        </code>
                        <span className={styles.riskModule}>
                          {student.codeModule} · {student.codePresentation}
                        </span>
                        <span className={styles.riskScore}>
                          {student.riskScore !== null
                            ? `${Math.round(student.riskScore * 100)}%`
                            : '—'}
                        </span>
                        <Link
                          to={
                            `/predictions/${encodeURIComponent(student.codeModule)}` +
                            `/${encodeURIComponent(student.codePresentation)}` +
                            `/${encodeURIComponent(student.studentKey)}`
                          }
                          className={styles.cardLink}
                        >
                          Xem hồ sơ →
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          </div>

          {/* Hàng 3 — hoạt động gần đây (chỉ Quản trị) */}
          {isAdmin ? (
          <section
            className={styles.card}
            aria-label="Hoạt động gần đây"
          >
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Hoạt động gần đây</h2>
              {systemLinks ? (
                <Link to="/audit" className={styles.cardLink}>
                  Xem tất cả →
                </Link>
              ) : null}
            </div>
            {recentLogs === null || recentLogs.logs.length === 0 ? (
              <p className={styles.cardEmpty}>Chưa có hoạt động nào</p>
            ) : (
              <ul className={styles.activityList}>
                {recentLogs.logs.map((log) => (
                  <ActivityRow key={log.logId} log={log} />
                ))}
              </ul>
            )}
          </section>
          ) : null}
        </>
      )}
    </div>
  );
}
