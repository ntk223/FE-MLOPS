# LearnGuard — API Contract Frontend ↔ Backend

> **Phiên bản:** 1.0 (2026-10-30)
> **Nguồn chân lý:** backend OpenAPI tự sinh tại `GET /docs` (FastAPI) + `backend/docs/DB_CONTRACT.md` v1.0 rev2.
> **Nguyên tắc:** frontend chỉ gọi REST API; không đụng DB, model registry, LLM.

---

## 1. Endpoint hiện có của backend (đã chạy thật với DB demo 6.510 dòng)

### 1.1 `GET /health` → ops

```json
{
  "status": "ok",
  "app": "LearnGuard Backend",
  "version": "0.1.0",
  "dependencies": { "database": "reachable", "llm": "not_configured" }
}
```

`database` ∈ `reachable` | `unreachable` | `not_configured`.

### 1.2 `GET /predictions` — danh sách ưu tiên advisor

Query params:

| Param | Kiểu | Ghi chú |
|---|---|---|
| `status` | `scored` \| `insufficient_data` \| `manual_review` \| `no_prediction` | tuỳ chọn |
| `code_module` | str ≤ 8 | tuỳ chọn |
| `code_presentation` | str ≤ 8 | tuỳ chọn |
| `order_by` | `risk_score` (mặc định) \| `uncertainty` \| `scored_at` | `order` được chấp nhận như alias |
| `limit` | 1–500, mặc định 50 | |
| `offset` | ≥ 0 | |

Response — **có `total` thật** (không cần heuristic "15+"):

```json
{
  "items": [ { …PredictionOut } ],
  "total": 5314,
  "limit": 50,
  "offset": 0
}
```

Sắp xếp: `ORDER BY {order_by} DESC NULLS LAST` — dòng thiếu score không chèn đầu.

### 1.3 `GET /predictions/{code_module}/{code_presentation}/{student_key}`

PK composite — 404 nếu không tồn tại. Đây là chi tiết 1 dự đoán.

### 1.4 `GET /predictions/by-student/{student_key}`

Toàn bộ dự đoán của 1 sinh viên (có thể nhiều học phần), sort `scored_at` DESC.

### 1.5 Shape `PredictionOut` (mapping snake_case ↔ camelCase)

| Backend | Frontend | Kiểu / Ghi chú |
|---|---|---|
| `code_module` | `codeModule` | string |
| `code_presentation` | `codePresentation` | string |
| `student_key` | `studentKey` | string 16 hex — **pseudonymous, không phải tên/mã SV thật** |
| `split` | `split` | `train` \| `validation` \| `holdout` |
| `risk_score` | `riskScore` | number \| null |
| `predicted_label` | `predictedLabel` | 0 \| 1 \| null |
| `threshold` | `threshold` | number \| null |
| `uncertainty` | `uncertainty` | number \| null |
| `status` | `status` | 4 giá trị như trên |
| `review_reason` | `reviewReason` | `insufficient_data` \| `high_uncertainty` \| `no_prediction` \| null |
| `model_version` | `modelVersion` | string |
| `snapshot_version` | `snapshotVersion` | string |
| `cutoff_day` | `cutoffDay` | number |
| `top_signals_json` | `topSignals` | **backend trả JSON string; frontend parse** → `Signal[]` |
| `run_id` | `runId` | string |
| `scored_at` | `scoredAt` | ISO-8601 string \| null |

`Signal = { featureName: string; contribution: number; direction: 'increases_risk' | 'decreases_risk' }` — parse phòng thủ: JSON hỏng/unknown → `[]`, không crash.

### 1.6 Error contract

Backend trả lỗi mặc định FastAPI: `{ "detail": <string> }` với HTTP status chuẩn (400 tham số sai, 404 không tìm thấy, 422 validation, 503 chưa cấu hình DB). Frontend chuẩn hóa về:

```ts
interface ApiError { code: string; message: string; requestId?: string }
// code: HTTP_<status> | NETWORK_ERROR | UNKNOWN_ERROR
```

---

## 2. Tính năng backend CHƯA có — frontend chạy MOCK, không đụng API thật

| Tính năng | Backend | Quy ước frontend đến khi backend sẵn sàng |
|---|---|---|
| **Auth** (POST /auth/login, JWT, RBAC) | ❌ TODO M6 | `LearnGuardApiClient.login()` ném `BACKEND_NOT_IMPLEMENTED`; UI dùng mock login (`VITE_USE_MOCK`), session client-side. **Không gửi credential thật đi đâu cả.** |
| **Briefs** (generate/read/edit/decide, M8) | ❌ TODO M8 | `generateBrief`/`saveBriefDecision` trên real client ném `BACKEND_NOT_IMPLEMENTED`; trang chi tiết hiển thị brief từ mock kèm nhãn "Chế độ demo". |
| **Admin import/batches** | ❌ | Không có UI. |

Khi backend bổ sung endpoint, cập nhật mục này + `contracts/api.ts` theo đúng trình tự: backend merge → OpenAPI review → frontend sync. Frontend không tự chế endpoint.

---

## 3. Mapping tính năng frontend TODO.md ↔ trạng thái

| Tính năng (TODO.md) | Trạng thái sau bản này |
|---|---|
| API client: base URL, typed error, timeout | ✅ real client (timeout 15s, AbortController) |
| Login/session expiry/logout | 🟡 mock — chờ backend M6 |
| Priority queue, filters, pagination | ✅ real API (sort mặc định `risk_score` DESC do backend) |
| Student profile: disclaimer, signal attribution, uncertainty | ✅ real API |
| Brief generate/read/edit/accept/reject | 🟡 mock — chờ backend M8 |
| States: insufficient-data, manual-review, API error | ✅ đủ 4 status + error states |
| Route advisor-only | ✅ client-side guard (backend auth chờ M6) |
| Component tests, a11y, container | ⬜ TODO tiếp theo |
