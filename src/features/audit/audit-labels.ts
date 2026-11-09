/**
 * Nhãn tiếng Việt + nhóm màu badge theo action của nhật ký hệ thống (§1.12).
 * Dùng chung cho trang /audit và khối "Hoạt động gần đây" ở /overview —
 * đừng copy mapping này sang nơi khác.
 *
 * - brief/decision → indigo · evaluation → success · login_success → warn ·
 *   login_failed → đỏ · còn lại (prediction_list, …) → neutral.
 * - Action lạ từ backend → giữ string gốc, badge neutral.
 */

export const ACTION_LABEL: Readonly<Record<string, string>> = {
  brief_generate: 'Tạo brief',
  brief_edit: 'Chỉnh sửa brief',
  decision_accept: 'Chấp nhận khuyến nghị',
  decision_reject: 'Từ chối khuyến nghị',
  evaluation_run: 'Chạy đánh giá',
  evaluation_read: 'Xem đánh giá',
  login_success: 'Đăng nhập',
  login_failed: 'Đăng nhập thất bại',
  prediction_list: 'Xem hàng đợi',
};

export type ActionTone = 'indigo' | 'success' | 'warn' | 'danger' | 'neutral';

export const ACTION_TONE: Readonly<Record<string, ActionTone>> = {
  brief_generate: 'indigo',
  brief_edit: 'indigo',
  decision_accept: 'indigo',
  decision_reject: 'indigo',
  evaluation_run: 'success',
  evaluation_read: 'success',
  login_success: 'warn',
  login_failed: 'danger',
  prediction_list: 'neutral',
};

/** Nhãn tiếng Việt của action — action lạ → giữ string gốc. */
export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

/** Nhóm màu badge — action lạ → 'neutral'. */
export function actionTone(action: string): ActionTone {
  return ACTION_TONE[action] ?? 'neutral';
}
