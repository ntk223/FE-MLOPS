# LearnGuard Frontend — Wave 0 + S1 + S2 Design

Ngày: 2026-10-30 · Phạm vi: Wave 0 (nền tảng UI + mock layer), S1 (Đăng nhập), S2 (Danh sách ưu tiên)

## Bối cảnh

- Backend (M6–M8) chưa có endpoint thật → UI phát triển **contract-first trên mock data** theo `src/contracts/api.ts`.
- Nguồn yêu cầu UI: `../project/docs/system-design.md` §3.9 (S1–S5) và §3.9-bis (quy ước uncertainty).
- Phạm vi lần này: Wave 0 + S1 + S2. S3/S4/S5 ở các wave sau.

## Tech choices

- React 18 + TypeScript strict + Vite (giữ nguyên, không nâng cấp).
- Routing: `react-router-dom` (BrowserRouter, guard route cho advisor/admin).
- Styling: CSS thuần + CSS custom properties (design tokens), không thêm CSS framework. CSS Modules cho component có scope.
- Ngôn ngữ UI: tiếng Việt. `lang="vi"` đã đặt trong index.html.

## Wave 0 — Nền tảng

- `src/styles/tokens.css`: design tokens (màu semantic cho 4 PredictionStatus, spacing, typography, radius, shadow). WCAG AA contrast.
- `src/components/ui/`: Button, TextField, Select, Badge/StatusBadge, Card, DataTable, RiskBar, EmptyState, ErrorState, Spinner.
- `src/components/layout/AppShell.tsx`: sidebar nav + topbar (tên user, vai trò, logout).
- `src/mocks/`: dữ liệu mẫu OULAD-style (~36 sinh viên, module AAA–EEE, presentation 2013J/2014B/2013B, đủ 4 status, tín hiệu SHAP-style) + `MockApiClient` cùng interface `LearnGuardApiClient`, độ trễ giả 300–700ms. `createApiClient()` chọn mock theo `VITE_USE_MOCK` (mặc định mock khi thiếu backend URL).
- `src/App.tsx`: router `/login`, `/` (dashboard), `/students/:id` (placeholder), auth guard.

## S1 — Đăng nhập (FR-09)

- Form email + password, validate client-side, lỗi sai thông tin hiển thị rõ, loading state.
- `AuthService`: login/logout/getCurrentSession qua sessionStorage (token giữ trong memory + sessionStorage; sẽ đồng bộ policy an toàn với backend sau).
- Mock credentials: `advisor@learnguard.vn` / `advisor123` (hiển thị gợi ý demo khi mock mode).

## S2 — Danh sách ưu tiên (FR-04)

- Bảng SV gắn cờ, sort theo priority = score × uncertainty (giảm dần).
- Cột: sinh viên, học phần/kỳ, RiskBar (score vs threshold — **không được ẩn threshold**), uncertainty, status badge, hành động xem hồ sơ.
- Bộ lọc: module code, presentation code, risk state; phân trang limit/offset.
- Quy ước 3.9-bis: nhãn "Điểm gợi ý ưu tiên" (không gọi là "kết luận"); tín hiệu là "tương quan, không nhân quả"; thiếu dữ liệu → nhãn lý do rõ ràng, không score mặc định.
- Loading skeleton, empty state, error state với requestId.

## Ràng buộc

- Không sửa `contracts/api.ts` (chờ OpenAPI backend); mock phải khớp interface hiện có.
- Route/UI chỉ cho advisor/admin, không có student view.
- Không commit; xác minh bằng `npm run build` (tsc --noEmit + vite build).
