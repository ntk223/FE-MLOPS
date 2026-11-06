import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { ApiError } from '../contracts/api';
import type {
  EvaluationCheck,
  EvaluationCheckStatus,
  EvaluationDetail,
  EvaluationRunSummary,
  EvaluationScorecard,
} from '../api/client';
import { apiClient } from '../api';
import { Button, EmptyState, ErrorState, Spinner } from '../components/ui';
import styles from './EvaluationsPage.module.css';

const LIST_LIMIT = 20;

/** Bộ lọc subject (gate) — tabs trong view chi tiết. */
type SubjectFilter = 'all' | 'data' | 'ml' | 'llm';

const SUBJECT_FILTERS: Array<{ value: SubjectFilter; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'data', label: 'Data' },
  { value: 'ml', label: 'ML' },
  { value: 'llm', label: 'LLM' },
];

/** Nhãn tiếng Việt + mô tả ngắn của từng subject (gate). */
const SUBJECT_META: Record<string, { title: string; hint: string }> = {
  data: { title: 'Data', hint: 'Chất lượng dữ liệu đầu vào' },
  ml: { title: 'ML', hint: 'Chất lượng mô hình dự đoán' },
  llm: { title: 'LLM', hint: 'Chất lượng sinh brief tư vấn' },
};

function subjectMeta(subject: string): { title: string; hint: string } {
  return SUBJECT_META[subject] ?? { title: subject, hint: 'Gate khác' };
}

const STATUS_LABEL: Record<EvaluationCheckStatus, string> = {
  pass: 'PASS',
  warn: 'WARN',
  fail: 'FAIL',
  skipped: 'SKIPPED',
};

const STATUS_CLASS: Record<EvaluationCheckStatus, string> = {
  pass: styles.statusPass,
  warn: styles.statusWarn,
  fail: styles.statusFail,
  skipped: styles.statusSkipped,
};

/** Badge trạng thái tổng/check — PASS xanh / WARN vàng / FAIL đỏ / SKIPPED xám. */
function EvalStatusBadge({
  status,
}: {
  status: EvaluationCheckStatus;
}): ReactElement {
  return (
    <span className={`${styles.statusBadge} ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
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
    message: 'Không thể tải kết quả đánh giá. Vui lòng thử lại.',
  };
}

const DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** ISO-8601 → "06/11/2026, 09:30" (vi-VN); timestamp hỏng → chuỗi gốc. */
function formatDateTime(iso: string): string {
  if (iso === '') {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return DATE_FORMATTER.format(date);
}

/** Dòng đếm tóm tắt — chỉ hiển thị các nhóm khác 0. */
function summaryChipList(counts: EvaluationScorecard['summary']): Array<{
  key: string;
  label: string;
  value: number;
  className: string;
}> {
  const chips = [
    { key: 'total', label: 'Tổng', value: counts.total, className: styles.chipTotal },
    { key: 'pass', label: 'Pass', value: counts.pass, className: styles.chipPass },
    { key: 'warn', label: 'Warn', value: counts.warn, className: styles.chipWarn },
    { key: 'fail', label: 'Fail', value: counts.fail, className: styles.chipFail },
    { key: 'skipped', label: 'Skipped', value: counts.skipped, className: styles.chipSkipped },
  ];
  return chips.filter(
    (chip) => chip.key === 'total' || chip.value > 0,
  );
}

/** Dòng đếm gọn trong bảng danh sách: "10 pass · 1 warn · 2 fail". */
function compactCounts(counts: EvaluationRunSummary['combinedSummary']): ReactElement {
  const entries = [
    { key: 'pass', value: counts.pass, className: styles.countPass },
    { key: 'warn', value: counts.warn, className: styles.countWarn },
    { key: 'fail', value: counts.fail, className: styles.countFail },
    { key: 'skipped', value: counts.skipped, className: styles.countSkipped },
  ].filter((entry) => entry.value > 0);
  if (entries.length === 0) {
    return <span className={styles.mutedText}>Không có check nào</span>;
  }
  return (
    <span className={styles.countsCell}>
      {entries.map((entry) => (
        <span key={entry.key} className={entry.className}>
          {entry.value} {entry.key}
        </span>
      ))}
    </span>
  );
}

/** Quan sát được: ngắn → text; dài → <details> mở rộng được. */
function ObservedCell({ observed }: { observed: string }): ReactElement {
  if (observed === '—') {
    return <span className={styles.mutedText}>—</span>;
  }
  if (observed.length <= 48) {
    return <span className={styles.observedPreview}>{observed}</span>;
  }
  return (
    <details className={styles.observedDetails}>
      <summary>{observed.slice(0, 48)}…</summary>
      <pre className={styles.observedFull}>{observed}</pre>
    </details>
  );
}

function CheckRow({ check }: { check: EvaluationCheck }): ReactElement {
  return (
    <tr>
      <td>
        <EvalStatusBadge status={check.status} />
      </td>
      <td>
        <span className={styles.checkName}>{check.name}</span>
        <span className={styles.checkId}>{check.id}</span>
      </td>
      <td>
        <ObservedCell observed={check.observed} />
      </td>
      <td>
        {check.threshold !== null ? (
          <span className={styles.thresholdText}>ngưỡng {check.threshold}</span>
        ) : (
          <span className={styles.mutedText}>—</span>
        )}
      </td>
      <td>
        {check.details !== '' ? (
          <span className={styles.checkDetails}>{check.details}</span>
        ) : (
          <span className={styles.mutedText}>—</span>
        )}
      </td>
    </tr>
  );
}

function SubjectSection({
  scorecard,
}: {
  scorecard: EvaluationScorecard;
}): ReactElement {
  const meta = subjectMeta(scorecard.subject);
  return (
    <section
      className={styles.subjectSection}
      aria-label={`Scorecard gate ${meta.title}`}
    >
      <div className={styles.subjectHeader}>
        <h3 className={styles.subjectTitle}>
          Gate {meta.title}
          <span className={styles.subjectTitleHint}>{meta.hint}</span>
        </h3>
        <div className={styles.summaryChips}>
          {summaryChipList(scorecard.summary).map((chip) => (
            <span key={chip.key} className={`${styles.summaryChip} ${chip.className}`}>
              {chip.value} {chip.label}
            </span>
          ))}
        </div>
      </div>
      {scorecard.inputs !== '—' && scorecard.inputs !== '' ? (
        <p className={styles.inputsLine}>Đầu vào: {scorecard.inputs}</p>
      ) : null}
      <div className={styles.card}>
        {scorecard.checks.length === 0 ? (
          <div className={styles.emptyWrap}>
            <EmptyState title="Gate này không có check nào." />
          </div>
        ) : (
          <table className={styles.checksTable}>
            <caption className="srOnly">
              {`Danh sách check của gate ${meta.title}`}
            </caption>
            <thead>
              <tr>
                <th scope="col">Trạng thái</th>
                <th scope="col">Kiểm tra</th>
                <th scope="col">Quan sát được</th>
                <th scope="col">Ngưỡng</th>
                <th scope="col">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.checks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export function EvaluationsPage(): ReactElement {
  const [runs, setRuns] = useState<EvaluationRunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<ApiError | null>(null);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EvaluationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<ApiError | null>(null);

  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>('all');
  const [reloadToken, setReloadToken] = useState(0);

  // Danh sách các run — refetch khi bấm "Làm mới" (reloadToken).
  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    apiClient
      .listEvaluations(LIST_LIMIT)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setRuns(result.runs);
        setTotal(result.total);
        setListLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setListError(toApiError(cause));
        setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // Chi tiết 1 run — fetch mỗi khi chọn run (hoặc bấm "Làm mới").
  useEffect(() => {
    if (selectedRunId === null) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    apiClient
      .getEvaluation(selectedRunId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setDetail(next);
        setDetailLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setDetailError(toApiError(cause));
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRunId, reloadToken]);

  function openRun(runId: string): void {
    setSelectedRunId(runId);
    setSubjectFilter('all');
  }

  function closeRun(): void {
    setSelectedRunId(null);
    setDetail(null);
    setDetailError(null);
  }

  const visibleReports =
    detail?.reports.filter(
      (scorecard) =>
        subjectFilter === 'all' || scorecard.subject === subjectFilter,
    ) ?? [];

  return (
    <div className={styles.page}>
      {selectedRunId === null ? (
        <>
          <header className={styles.header}>
            <div className={styles.headerRow}>
              <div>
                <h1 className={styles.title}>Đánh giá tự động</h1>
                <p className={styles.subtitle}>
                  Scorecard 3 gates (data / ml / llm) — kết quả đánh giá tự động
                  sau mỗi lần chạy pipeline.
                </p>
              </div>
              <div className={styles.refreshButton}>
                <Button
                  variant="secondary"
                  loading={listLoading}
                  onClick={() => setReloadToken((token) => token + 1)}
                >
                  Làm mới
                </Button>
              </div>
            </div>
          </header>

          <div className={styles.card} aria-busy={listLoading}>
            {listLoading ? (
              <div className={styles.loadingBox}>
                <Spinner label="Đang tải danh sách đánh giá…" />
              </div>
            ) : listError !== null ? (
              <div className={styles.errorBox}>
                <ErrorState
                  code={listError.code}
                  message={listError.message}
                  requestId={listError.requestId}
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
            ) : runs.length === 0 ? (
              <div className={styles.emptyWrap}>
                <EmptyState
                  title="Chưa có lần đánh giá nào"
                  description="Chạy 'learnguard evaluate all' để tạo scorecard đầu tiên."
                />
              </div>
            ) : (
              <table className={styles.checksTable}>
                <caption className="srOnly">
                  Danh sách các lần chạy đánh giá tự động
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Mã lần chạy</th>
                    <th scope="col">Thời gian</th>
                    <th scope="col">Trạng thái tổng</th>
                    <th scope="col">Kết quả</th>
                    <th scope="col">Gates</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.runId}>
                      <td>
                        <button
                          type="button"
                          className={styles.runLink}
                          onClick={() => openRun(run.runId)}
                        >
                          {run.runId !== '' ? run.runId : '(không có mã)'}
                        </button>
                      </td>
                      <td>
                        <span className={styles.mutedText}>
                          {formatDateTime(run.createdAt)}
                        </span>
                      </td>
                      <td>
                        <EvalStatusBadge status={run.overallStatus} />
                      </td>
                      <td>{compactCounts(run.combinedSummary)}</td>
                      <td>
                        <span className={styles.mutedText}>
                          {run.subjects.length > 0
                            ? run.subjects.join(' · ')
                            : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!listLoading && listError === null && runs.length > 0 ? (
            <p className={styles.mutedText}>
              Hiển thị {runs.length} trên {total} lần đánh giá gần nhất.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <header className={styles.header}>
            <div className={styles.headerRow}>
              <div>
                <div className={styles.backRow}>
                  <Button variant="ghost" onClick={closeRun}>
                    ← Danh sách đánh giá
                  </Button>
                </div>
                <h1 className={styles.title}>Chi tiết đánh giá</h1>
                <p className={styles.runMeta}>
                  <span className={styles.runMetaStrong}>{selectedRunId}</span>
                  {detail !== null && detail.createdAt !== '' ? (
                    <span>· {formatDateTime(detail.createdAt)}</span>
                  ) : null}
                  {detail === null ? (
                    <span>· Đang tải…</span>
                  ) : (
                    <EvalStatusBadge
                      status={
                        detail.reports.every(
                          (scorecard) => scorecard.summary.fail === 0,
                        )
                          ? detail.reports.every(
                              (scorecard) => scorecard.summary.warn === 0,
                            )
                            ? 'pass'
                            : 'warn'
                          : 'fail'
                      }
                    />
                  )}
                </p>
              </div>
              <div className={styles.refreshButton}>
                <Button
                  variant="secondary"
                  loading={detailLoading}
                  onClick={() => setReloadToken((token) => token + 1)}
                >
                  Làm mới
                </Button>
              </div>
            </div>
          </header>

          <div className={styles.tabs} role="group" aria-label="Lọc theo gate">
            {SUBJECT_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`${styles.tab} ${
                  subjectFilter === filter.value ? styles.tabActive : ''
                }`}
                aria-pressed={subjectFilter === filter.value}
                onClick={() => setSubjectFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className={styles.card} aria-busy={detailLoading}>
            {detailLoading ? (
              <div className={styles.loadingBox}>
                <Spinner label="Đang tải scorecard…" />
              </div>
            ) : detailError !== null ? (
              <div className={styles.errorBox}>
                <ErrorState
                  code={detailError.code}
                  message={detailError.message}
                  requestId={detailError.requestId}
                />
                <div className={styles.errorActions}>
                  <Button
                    variant="secondary"
                    onClick={() => setReloadToken((token) => token + 1)}
                  >
                    Thử lại
                  </Button>
                  <Button variant="ghost" onClick={closeRun}>
                    ← Về danh sách
                  </Button>
                </div>
              </div>
            ) : visibleReports.length === 0 ? (
              <div className={styles.emptyWrap}>
                <EmptyState
                  title={
                    detail !== null && detail.reports.length > 0
                      ? 'Không có scorecard nào cho gate đã chọn.'
                      : 'Run này không có scorecard nào.'
                  }
                />
              </div>
            ) : (
              visibleReports.map((scorecard) => (
                <SubjectSection
                  key={scorecard.subject}
                  scorecard={scorecard}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
