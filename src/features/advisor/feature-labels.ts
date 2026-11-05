/**
 * Nhãn tiếng Việt cho các chỉ số của sinh viên — dùng cho cả "Thống kê
 * học tập" (features) và bảng "Tín hiệu đóng góp" (top signals).
 *
 * Chỉ feature có nhãn mới được hiển thị cho giảng viên; key lạ sẽ rơi về
 * chính key gốc (an toàn khi model mới bổ sung feature).
 */

/** features_json → nhãn hiển thị (giữ thứ tự hiển thị mong muốn). */
export const FEATURE_LABELS: Readonly<Record<string, string>> = {
  n_clicks_before_cutoff: 'Tổng lượt tương tác trên hệ thống (VLE)',
  click_trend_w3_w4: 'Biến động tương tác (tuần 3–4 so với tuần 1–2)',
  n_submitted_before_cutoff: 'Số bài đã nộp',
  avg_score_submitted: 'Điểm trung bình các bài đã nộp (0–100)',
  num_of_prev_attempts: 'Số lần đã học môn này trước đây',
  studied_credits: 'Số tín chỉ đang đăng ký',
};

/** Tên feature trong top_signals → nhãn ngắn gọn cho bảng tín hiệu. */
export const SIGNAL_LABELS: Readonly<Record<string, string>> = {
  n_clicks_before_cutoff: 'Lượt tương tác (VLE)',
  click_trend_w3_w4: 'Biến động tương tác tuần 3–4',
  n_submitted_before_cutoff: 'Số bài đã nộp',
  avg_score_submitted: 'Điểm TB bài đã nộp',
  missingindicator_avg_score_submitted: 'Thiếu điểm bài tập',
  num_of_prev_attempts: 'Số lần học lại',
  studied_credits: 'Số tín chỉ đăng ký',
  highest_education: 'Trình độ học vấn',
  imd_band: 'Vùng deprivation (imd_band)',
  age_band: 'Nhóm tuổi',
  gender: 'Giới tính',
  region: 'Khu vực',
  disability: 'Khuyết tật',
};

export function featureLabel(name: string): string {
  return FEATURE_LABELS[name] ?? name;
}

export function signalLabel(name: string): string {
  return SIGNAL_LABELS[name] ?? name;
}
