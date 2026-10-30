import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AdvisorBrief, ApiError, StudentPrediction } from '../contracts/api';
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
      const generated = await apiClient.generateBrief(0);
      setBrief(generated);
    } catch (cause) {
      setBriefError(
        cause instanceof Error ? cause.message : 'Không tạo được bản tóm tắt.',
      );
    } finally {
      setBriefBusy(false);
    }
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
            <dt>Ngưỡng quyết định</dt>
            <dd>{prediction.threshold ?? '—'}</dd>
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
        </dl>
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
              Các tín hiệu đóng góp vào điểm nguy cơ
            </caption>
            <thead>
              <tr>
                <th scope="col">Chỉ số</th>
                <th scope="col">Mức đóng góp</th>
                <th scope="col">Chiều tác động</th>
              </tr>
            </thead>
            <tbody>
              {prediction.topSignals.map((signal) => (
                <tr key={signal.featureName}>
                  <td>
                    <code>{signal.featureName}</code>
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
          ⚠️ Tín hiệu thể hiện tương quan thống kê, không phải quan hệ nhân quả.
          Điểm nguy cơ là đầu vào tham khảo cho cố vấn — mọi quyết định hỗ trợ
          cần xác minh trực tiếp với sinh viên.
        </p>
      </Card>

      <Card>
        <h2 className={styles.sectionTitle}>Bản tóm tắt tư vấn (brief)</h2>
        <p className={styles.demoNote}>
          Chế độ demo — backend M8 chưa có endpoint brief; nội dung dưới đây do
          mock client sinh (docs/API_CONTRACT.md §2).
        </p>
        {brief === null ? (
          <div className={styles.briefActions}>
            <Button
              onClick={() => {
                void handleGenerateBrief();
              }}
              disabled={briefBusy}
            >
              {briefBusy ? 'Đang tạo…' : 'Tạo bản tóm tắt (demo)'}
            </Button>
            {briefError !== null && (
              <p className={styles.briefError} role="alert">
                {briefError}
              </p>
            )}
          </div>
        ) : (
          <div className={styles.briefBody}>
            <p>
              <strong>Brief #{brief.briefId} · version {brief.version} · {brief.status}</strong>
            </p>
            <p>{brief.summary}</p>
            <ul>
              {brief.reasons.map((reason) => (
                <li key={reason.evidenceFeatures.join('|')}>{reason.text}</li>
              ))}
            </ul>
            <h3>Đề xuất hỗ trợ</h3>
            <ul>
              {brief.supportSuggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
            <h3>Hạn chế</h3>
            <ul>
              {brief.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
