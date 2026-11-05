import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  AdvisorBrief,
  ApiError,
  BriefStatus,
  StudentPrediction,
} from '../contracts/api';
import { apiClient } from '../api';
import { AdvisorService } from '../features/advisor/advisor-service';
import {
  Button,
  Card,
  ErrorState,
  RiskBar,
  Spinner,
  StatusBadge,
} from '../components/ui';
import { FEATURE_LABELS, featureLabel, signalLabel } from '../features/advisor/feature-labels';
import styles from './StudentDetailPage.module.css';

const advisorService = new AdvisorService(apiClient);

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function formatDateTime(iso: string | null): string {
  if (iso === null) {
    return '—';
  }
  return new Date(iso).toLocaleString('vi-VN');
}

/** Định dạng giá trị thống kê theo ý nghĩa từng chỉ số. */
function formatStatValue(name: string, value: number): string {
  if (name === 'avg_score_submitted') {
    return value.toFixed(1);
  }
  if (name === 'click_trend_w3_w4') {
    return value > 0 ? `+${Math.round(value)}` : Math.round(value).toString();
  }
  return Math.round(value).toLocaleString('vi-VN');
}

/**
 * Tách business feature khỏi tên cột pipeline của model: prefix nhóm nằm
 * trước `__` đầu tiên (vd. `clicks__n_clicks_before_cutoff` →
 * `n_clicks_before_cutoff`). Feature không có prefix (mock/legacy) giữ nguyên.
 */
function businessFeatureName(featureName: string): string {
  const separatorIndex = featureName.indexOf('__');
  return separatorIndex === -1
    ? featureName
    : featureName.slice(separatorIndex + 2);
}

/**
 * Cột "Giá trị của sinh viên" trong bảng tín hiệu — tra giá trị gốc từ
 * prediction.features theo business feature (bỏ prefix `prefix__`).
 * Feature one-hot/nominal không có trong stats gốc → '—'; null → chú thích
 * "Không có dữ liệu"; số → format giống hệt phần thống kê học tập.
 */
function SignalObservedValue({
  featureName,
  features,
}: {
  featureName: string;
  features: Record<string, number | null>;
}): ReactElement {
  const name = businessFeatureName(featureName);
  const value = features[name];
  if (value === undefined) {
    return <span className={styles.muted}>—</span>;
  }
  if (value === null) {
    return <span className={styles.muted}>Không có dữ liệu</span>;
  }
  return <>{formatStatValue(name, value)}</>;
}

const STATUS_EXPLANATION: Record<StudentPrediction['status'], string> = {
  scored:
    'Sinh viên có đủ dữ liệu để mô hình chấm điểm nguy cơ tại thời điểm cắt (cutoff day).',
  insufficient_data:
    'Chưa đủ dữ liệu điểm/bài tập tại thời điểm cắt nên mô hình không gán nhãn được. Dự đoán sẽ cập nhật khi có thêm dữ liệu.',
  manual_review:
    'Mô hình không chắc chắn về dự đoán (uncertainty cao) — cần cố vấn xem xét thủ công trước khi kết luận.',
  no_prediction:
    'Mô hình không sinh được dự đoán cho sinh viên này trong đợt chạy gần nhất.',
};

/** Bản nháp chỉnh sửa brief (PUT /briefs/{id}, docs/API_CONTRACT.md §1.10). */
interface BriefEditDraft {
  summary: string;
  reasons: Array<{ text: string; evidenceFeatures: string[] }>;
  supportSuggestions: string[];
  limitations: string[];
}

/**
 * Nhãn trạng thái brief (docs/API_CONTRACT.md §1.7). 'fallback_review'/
 * 'unavailable' nghĩa là LLM không khả dụng — nội dung chỉ mang tính tham
 * khảo, cố vấn cần tự đánh giá; không được hiển thị như brief do LLM sinh.
 */
const BRIEF_STATUS_LABEL: Record<BriefStatus, string> = {
  generated: 'Brief đã tạo (LLM)',
  fallback_review: 'Brief dự phòng — LLM không khả dụng',
  unavailable: 'Brief không khả dụng — LLM không phản hồi',
  accepted: 'Đã chấp nhận (demo)',
  rejected: 'Đã từ chối (demo)',
};

/** Chỉ true ở mock mode — dùng để hiện/ẩn ghi chú "Chế độ demo". */
const IS_MOCK_MODE = import.meta.env.VITE_USE_MOCK !== 'false';

/**
 * List editor cho supportSuggestions/limitations ở chế độ edit brief:
 * mỗi dòng 1 input, có nút xoá dòng và nút thêm dòng.
 */
function StringListEditor({
  label,
  items,
  busy,
  onChange,
}: {
  label: string;
  items: string[];
  busy: boolean;
  onChange(items: string[]): void;
}): ReactElement {
  return (
    <div className={styles.editField}>
      <span className={styles.editLabel}>{label}</span>
      {items.map((item, index) => (
        <div key={index} className={styles.listRow}>
          <input
            className={styles.textInput}
            value={item}
            disabled={busy}
            aria-label={`${label} #${index + 1}`}
            onChange={(event) => {
              const next = [...items];
              next[index] = event.target.value;
              onChange(next);
            }}
          />
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              onChange(items.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            Xoá
          </Button>
        </div>
      ))}
      <div className={styles.addRow}>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => onChange([...items, ''])}
        >
          + Thêm dòng
        </Button>
      </div>
    </div>
  );
}

export function StudentDetailPage(): ReactElement {
  const params = useParams<{
    codeModule: string;
    codePresentation: string;
    studentKey: string;
  }>();
  const navigate = useNavigate();

  const [prediction, setPrediction] = useState<StudentPrediction | null>(null);
  const [brief, setBrief] = useState<AdvisorBrief | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [editingBrief, setEditingBrief] = useState(false);
  const [editDraft, setEditDraft] = useState<BriefEditDraft | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editValidation, setEditValidation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (
      params.codeModule === undefined ||
      params.codePresentation === undefined ||
      params.studentKey === undefined
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    advisorService
      .getStudentProfile({
        codeModule: decodeURIComponent(params.codeModule),
        codePresentation: decodeURIComponent(params.codePresentation),
        studentKey: decodeURIComponent(params.studentKey),
      })
      .then((record) => {
        if (!cancelled) {
          setPrediction(record);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError({
          code:
            typeof cause === 'object' &&
            cause !== null &&
            typeof (cause as Record<string, unknown>).code === 'string'
              ? ((cause as Record<string, unknown>).code as string)
              : 'UNKNOWN_ERROR',
          message:
            typeof cause === 'object' &&
            cause !== null &&
            typeof (cause as Record<string, unknown>).message === 'string'
              ? ((cause as Record<string, unknown>).message as string)
              : 'Không thể tải hồ sơ dự đoán.',
        });
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.codeModule, params.codePresentation, params.studentKey]);

  async function handleGenerateBrief(): Promise<void> {
    if (prediction === null) {
      return;
    }
    setBriefBusy(true);
    setBriefError(null);
    try {
      const generated = await apiClient.generateBrief({
        codeModule: prediction.codeModule,
        codePresentation: prediction.codePresentation,
        studentKey: prediction.studentKey,
      });
      setBrief(generated);
    } catch (cause) {
      setBriefError(
        cause instanceof Error ? cause.message : 'Không tạo được bản tóm tắt.',
      );
    } finally {
      setBriefBusy(false);
    }
  }

  /** Vào chế độ edit inline — khởi tạo bản nháp từ brief hiện tại. */
  function handleStartEditBrief(): void {
    if (brief === null) {
      return;
    }
    setEditDraft({
      summary: brief.summary,
      reasons: brief.reasons.map((reason) => ({
        text: reason.text,
        evidenceFeatures: [...reason.evidenceFeatures],
      })),
      // Danh sách rỗng → seed 1 dòng trống để cố vấn có thể thêm nội dung.
      supportSuggestions:
        brief.supportSuggestions.length > 0 ? [...brief.supportSuggestions] : [''],
      limitations: brief.limitations.length > 0 ? [...brief.limitations] : [''],
    });
    setEditError(null);
    setEditValidation(null);
    setEditingBrief(true);
  }

  /** Huỷ edit — quay lại view mode, KHÔNG gọi API. */
  function handleCancelEditBrief(): void {
    setEditingBrief(false);
    setEditDraft(null);
    setEditError(null);
    setEditValidation(null);
  }

  /** Validation client-side — KHÔNG gọi API khi vi phạm. */
  function validateEditDraft(draft: BriefEditDraft): string | null {
    if (draft.summary.trim() === '') {
      return 'Tóm tắt không được để trống.';
    }
    const emptyReasonIndex = draft.reasons.findIndex(
      (reason) => reason.text.trim() === '',
    );
    if (emptyReasonIndex !== -1) {
      return `Lý do #${emptyReasonIndex + 1} đang để trống nội dung.`;
    }
    return null;
  }

  async function handleSaveBriefEdit(): Promise<void> {
    if (brief === null || editDraft === null) {
      return;
    }
    const validation = validateEditDraft(editDraft);
    if (validation !== null) {
      setEditValidation(validation);
      return;
    }
    setEditValidation(null);
    setEditBusy(true);
    setEditError(null);
    try {
      const updated = await apiClient.editBrief(brief.briefId, {
        summary: editDraft.summary.trim(),
        reasons: editDraft.reasons.map((reason) => ({
          text: reason.text.trim(),
          evidenceFeatures: reason.evidenceFeatures,
        })),
        supportSuggestions: editDraft.supportSuggestions
          .map((item) => item.trim())
          .filter((item) => item !== ''),
        limitations: editDraft.limitations
          .map((item) => item.trim())
          .filter((item) => item !== ''),
      });
      setBrief(updated);
      setEditingBrief(false);
      setEditDraft(null);
    } catch (cause) {
      setEditError(
        cause instanceof Error ? cause.message : 'Không lưu được chỉnh sửa.',
      );
    } finally {
      setEditBusy(false);
    }
  }

  function updateEditDraft(patch: Partial<BriefEditDraft>): void {
    setEditDraft((previous) => (previous === null ? previous : { ...previous, ...patch }));
  }

  if (loading) {
    return (
      <div className={styles.center}>
        <Spinner label="Đang tải hồ sơ dự đoán…" />
      </div>
    );
  }
  if (error !== null) {
    return (
      <div className={styles.center}>
        <ErrorState code={error.code} message={error.message} />
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Quay lại danh sách
        </Button>
      </div>
    );
  }
  if (prediction === null) {
    return (
      <div className={styles.center}>
        <p>Không tìm thấy dự đoán.</p>
        <Link to="/">Quay lại danh sách</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/">Danh sách ưu tiên</Link>
        <span aria-hidden="true"> / </span>
        <span>
          {prediction.codeModule} · {prediction.codePresentation}
        </span>
      </nav>

      <header className={styles.header}>
        <h1 className={styles.title}>
          Hồ sơ dự đoán — {prediction.codeModule} ·{' '}
          {prediction.codePresentation}
        </h1>
        <p className={styles.studentKey}>
          Mã giả danh (student key):{' '}
          <code>{prediction.studentKey}</code>
        </p>
      </header>

      <Card>
        <div className={styles.statusRow}>
          {prediction.reviewReason !== null ? (
            <StatusBadge status={prediction.status} reason={prediction.reviewReason} />
          ) : (
            <StatusBadge status={prediction.status} />
          )}
          <p className={styles.statusExplanation}>
            {STATUS_EXPLANATION[prediction.status]}
          </p>
        </div>
        <dl className={styles.metaGrid}>
          <div>
            <dt>Điểm nguy cơ</dt>
            <dd>
              <RiskBar
                riskScore={prediction.riskScore}
                threshold={prediction.threshold}
                uncertainty={prediction.uncertainty}
              />
            </dd>
          </div>
          <div>
            <dt>Độ không chắc chắn</dt>
            <dd>{formatPercent(prediction.uncertainty)}</dd>
          </div>
          <div>
            <dt>Nhãn dự đoán</dt>
            <dd>
              {prediction.predictedLabel === null
                ? '— (chưa gán nhãn)'
                : prediction.predictedLabel === 1
                  ? 'Nguy cơ (1)'
                  : 'Bình thường (0)'}
            </dd>
          </div>
          <div>
            <dt>Thời điểm chấm</dt>
            <dd>{formatDateTime(prediction.scoredAt)}</dd>
          </div>
        </dl>
        <details className={styles.techDetails}>
          <summary>Thông tin kỹ thuật (dành cho kiểm tra/audit)</summary>
          <dl className={styles.metaGrid}>
            <div>
              <dt>Ngưỡng quyết định</dt>
              <dd>{prediction.threshold ?? '—'}</dd>
            </div>
            <div>
              <dt>Cutoff day</dt>
              <dd>{prediction.cutoffDay}</dd>
            </div>
            <div>
              <dt>Phiên bản model</dt>
              <dd>
                <code>{prediction.modelVersion}</code>
              </dd>
            </div>
            <div>
              <dt>Phiên bản dữ liệu</dt>
              <dd>
                <code>{prediction.snapshotVersion}</code>
              </dd>
            </div>
            <div>
              <dt>Batch (run id)</dt>
              <dd>
                <code>{prediction.runId}</code>
              </dd>
            </div>
          </dl>
        </details>
      </Card>

      <Card>
        <h2 className={styles.sectionTitle}>
          Thống kê học tập (tại thời điểm cắt — day {prediction.cutoffDay})
        </h2>
        {Object.keys(prediction.features).length === 0 ? (
          <p className={styles.muted}>
            Chưa có thống kê học tập cho sinh viên này.
          </p>
        ) : (
          <dl className={styles.metaGrid}>
            {Object.entries(FEATURE_LABELS).map(([name, label]) => {
              const value = prediction.features[name];
              return (
                <div key={name}>
                  <dt>{label}</dt>
                  <dd>
                    {value === null ? (
                      '—'
                    ) : (
                      formatStatValue(name, value)
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
        <p className={styles.disclaimer}>
          Số liệu được tổng hợp từ hoạt động học tập trên hệ thống tính đến
          thời điểm cắt (cutoff day {prediction.cutoffDay}) — trước khi kết thúc kỳ học.
        </p>
      </Card>

      <Card>
        <h2 className={styles.sectionTitle}>Tín hiệu đóng góp chính</h2>
        {prediction.topSignals.length === 0 ? (
          <p className={styles.muted}>
            Không có tín hiệu nào cho dự đoán này.
          </p>
        ) : (
          <table className={styles.signalTable}>
            <caption className={styles.visuallyHidden}>
              Các tín hiệu đóng góp vào điểm nguy cơ (SHAP) cùng giá trị quan
              sát được của sinh viên
            </caption>
            <thead>
              <tr>
                <th scope="col">Chỉ số</th>
                <th scope="col">Giá trị của sinh viên</th>
                <th scope="col">Mức đóng góp (SHAP)</th>
                <th scope="col">Chiều tác động</th>
              </tr>
            </thead>
            <tbody>
              {prediction.topSignals.map((signal) => (
                <tr key={signal.featureName}>
                  <td>
                    {signalLabel(businessFeatureName(signal.featureName))}
                    <span className={styles.signalRawName}>
                      <code>{signal.featureName}</code>
                    </span>
                  </td>
                  <td>
                    <SignalObservedValue
                      featureName={signal.featureName}
                      features={prediction.features}
                    />
                  </td>
                  <td>{signal.contribution.toFixed(3)}</td>
                  <td>
                    {signal.direction === 'increases_risk'
                      ? 'Tăng nguy cơ'
                      : 'Giảm nguy cơ'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className={styles.disclaimer}>
          Mức đóng góp tính bằng Linear SHAP trên nền dữ liệu huấn luyện
          (train-background). ⚠️ Tín hiệu thể hiện tương quan thống kê, không
          phải quan hệ nhân quả. Điểm nguy cơ là đầu vào tham khảo cho cố vấn —
          mọi quyết định hỗ trợ cần xác minh trực tiếp với sinh viên.
        </p>
      </Card>

      <Card>
        <h2 className={styles.sectionTitle}>Bản tóm tắt tư vấn (brief)</h2>
        {IS_MOCK_MODE && (
          <p className={styles.demoNote}>
            Chế độ demo — nội dung brief dưới đây do mock client sinh
            (docs/API_CONTRACT.md §2).
          </p>
        )}
        {brief === null ? (
          <div className={styles.briefActions}>
            <Button
              onClick={() => {
                void handleGenerateBrief();
              }}
              disabled={briefBusy}
            >
              {briefBusy ? 'Đang tạo…' : 'Tạo bản tóm tắt'}
            </Button>
            {briefError !== null && (
              <p className={styles.briefError} role="alert">
                {briefError}
              </p>
            )}
          </div>
        ) : editingBrief && editDraft !== null ? (
          <form
            className={styles.editForm}
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveBriefEdit();
            }}
          >
            <div className={styles.editField}>
              <label className={styles.editLabel} htmlFor="brief-edit-summary">
                Tóm tắt
              </label>
              <textarea
                id="brief-edit-summary"
                className={styles.textArea}
                rows={4}
                value={editDraft.summary}
                disabled={editBusy}
                onChange={(event) =>
                  updateEditDraft({ summary: event.target.value })
                }
              />
            </div>
            <div className={styles.editField}>
              <span className={styles.editLabel}>Lý do</span>
              {editDraft.reasons.map((reason, index) => (
                <div key={index} className={styles.reasonEditRow}>
                  <input
                    className={styles.textInput}
                    value={reason.text}
                    disabled={editBusy}
                    placeholder={`Nội dung lý do #${index + 1}`}
                    aria-label={`Nội dung lý do #${index + 1}`}
                    onChange={(event) => {
                      const next = editDraft.reasons.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, text: event.target.value }
                          : entry,
                      );
                      updateEditDraft({ reasons: next });
                    }}
                  />
                  {reason.evidenceFeatures.length > 0 && (
                    <div className={styles.chipList}>
                      {reason.evidenceFeatures.map((feature) => (
                        <span key={feature} className={styles.chip}>
                          <code>{feature}</code>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <p className={styles.editHint}>
                Các chỉ số evidence (ô vuông nhỏ) giữ nguyên từ LLM — không
                chỉnh sửa được ở chế độ này.
              </p>
            </div>
            <StringListEditor
              label="Đề xuất hỗ trợ"
              items={editDraft.supportSuggestions}
              busy={editBusy}
              onChange={(items) => updateEditDraft({ supportSuggestions: items })}
            />
            <StringListEditor
              label="Hạn chế"
              items={editDraft.limitations}
              busy={editBusy}
              onChange={(items) => updateEditDraft({ limitations: items })}
            />
            {editValidation !== null && (
              <p className={styles.validationError} role="alert">
                {editValidation}
              </p>
            )}
            {editError !== null && (
              <p className={styles.briefError} role="alert">
                {editError}
              </p>
            )}
            <div className={styles.editActions}>
              <Button type="submit" disabled={editBusy} loading={editBusy}>
                {editBusy ? 'Đang lưu…' : 'Lưu chỉnh sửa'}
              </Button>
              <Button
                variant="secondary"
                disabled={editBusy}
                onClick={handleCancelEditBrief}
              >
                Huỷ
              </Button>
            </div>
          </form>
        ) : (
          <div className={styles.briefBody}>
            <p>
              <strong>
                Brief #{brief.briefId} · version {brief.version} ·{' '}
                {BRIEF_STATUS_LABEL[brief.status]}
              </strong>
              {brief.createdAt !== null && brief.createdAt !== undefined && (
                <span> · {formatDateTime(brief.createdAt)}</span>
              )}
            </p>
            {brief.editedAt !== null && brief.editedAt !== undefined && (
              <p className={styles.editedBadge}>
                Đã chỉnh sửa bởi cố vấn · {formatDateTime(brief.editedAt)}
              </p>
            )}
            {(brief.status === 'fallback_review' ||
              brief.status === 'unavailable') && (
              <p className={styles.briefError} role="alert">
                {brief.status === 'fallback_review'
                  ? 'Brief dự phòng — LLM không khả dụng. Nội dung dưới đây do hệ thống sinh theo mẫu, KHÔNG phải phân tích của mô hình ngôn ngữ; hãy kiểm chứng trực tiếp với sinh viên.'
                  : 'Brief không khả dụng — LLM không phản hồi. Không có nội dung tóm tắt; hãy tự đánh giá dựa trên tín hiệu đóng góp ở trên.'}
              </p>
            )}
            <p>{brief.summary}</p>
            {brief.reasons.length > 0 && (
              <>
                <h3>Lý do</h3>
                <ul>
                  {brief.reasons.map((reason) => (
                    <li key={reason.evidenceFeatures.join('|')}>{reason.text}</li>
                  ))}
                </ul>
              </>
            )}
            {brief.supportSuggestions.length > 0 && (
              <>
                <h3>Đề xuất hỗ trợ</h3>
                <ul>
                  {brief.supportSuggestions.map((suggestion) => (
                    <li key={suggestion}>{suggestion}</li>
                  ))}
                </ul>
              </>
            )}
            {brief.limitations.length > 0 && (
              <>
                <h3>Hạn chế</h3>
                <ul>
                  {brief.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </>
            )}
            <div className={styles.briefActions}>
              <Button
                variant="secondary"
                onClick={handleStartEditBrief}
                disabled={briefBusy}
              >
                Chỉnh sửa
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void handleGenerateBrief();
                }}
                disabled={briefBusy}
              >
                {briefBusy ? 'Đang tạo lại…' : 'Tạo lại brief (version + 1)'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
