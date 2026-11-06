# LearnGuard — API Contract Frontend ↔ Backend

> **Phiên bản:** 1.1 (2026-11-06)
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
| `top_signals` | `topSignals` | **backend trả array đã parse** → `Signal[]` (client nhận thêm JSON string cho phòng thủ) |
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

## 1.7 `POST /briefs/generate` — tạo/regenerate brief tư vấn (M8) ✅

JSON body (PK composite của ml_predictions):

```json
{ "code_module": "DDD", "code_presentation": "2014B", "student_key": "abc…" }
```

Response 200 — `BriefOut`:

```json
{
  "brief_id": 1,
  "code_module": "DDD",
  "code_presentation": "2014B",
  "student_key": "abc…",
  "version": 1,
  "status": "generated",
  "summary": "…",
  "reasons": [{ "text": "…", "evidence_features": ["feature_name"] }],
  "support_suggestions": ["…"],
  "limitations": ["…"],
  "model_name": "gemini/gemini-3.1-flash-lite",
  "latency_ms": 1234,
  "created_at": "2026-11-06T…"
}
```

- `status` ∈ `generated` \| `fallback_review` \| `unavailable` — **backend KHÔNG bao giờ trả 500 vì lỗi LLM**: LLM lỗi → 200 với `fallback_review` (brief dự phòng theo mẫu) hoặc `unavailable` (không có nội dung).
- Regenerate cùng 1 dự đoán → backend tự `version + 1`.
- Lỗi: 404 `{"detail": "prediction_not_found"}` (không có dự đoán), 503 DB.

## 1.8 `GET /briefs/{brief_id}` ✅

Cùng shape `BriefOut` như §1.7. 404 nếu không tồn tại.

## 1.9 `POST /briefs/{brief_id}/decision` — ghi nhận quyết định cố vấn ✅

Body: `{"decision": "accepted"}` hoặc `{"decision": "rejected"}` (400 nếu giá trị khác).

Response 200:

```json
{ "brief_id": 1, "decision": "accepted", "decided_at": "2026-11-06T…" }
```

Mapping snake_case ↔ camelCase (brief):

| Backend | Frontend | Ghi chú |
|---|---|---|
| `brief_id` | `briefId` | number |
| `code_module` / `code_presentation` / `student_key` | `codeModule` / `codePresentation` / `studentKey` | PK composite của dự đoán liên quan |
| `version` | `version` | tăng mỗi lần regenerate |
| `status` | `status` | 3 giá trị §1.7 (+ `accepted`/`rejected` chỉ ở mock demo) |
| `reasons[].evidence_features` | `reasons[].evidenceFeatures` | string[] |
| `support_suggestions` / `limitations` | `supportSuggestions` / `limitations` | string[] |
| `model_name` | `modelName` | tuỳ chọn |
| `latency_ms` | `latencyMs` | tuỳ chọn |
| `created_at` | `createdAt` | ISO-8601 |
| `edited_at` (§1.10) | `editedAt` | ISO-8601 \| null — thời điểm sửa nội dung lần cuối |
| `decided_at` (decision) | `decidedAt` (`BriefDecision`) | ISO-8601 |

Frontend parse phòng thủ giống §1.5: reasons/suggestions/limitations hỏng shape → rỗng, không crash. `fallback_review`/`unavailable` hiển thị nhãn riêng "Brief dự phòng — LLM không khả dụng", không giả vờ là brief do LLM sinh.

## 1.10 `PUT /briefs/{brief_id}` — chỉnh sửa nội dung brief (M8) ✅

JSON body — **tất cả trường optional nhưng phải có ít nhất 1 trường**:

```json
{
  "summary": "…",
  "reasons": [{ "text": "…", "evidence_features": ["feature_name"] }],
  "support_suggestions": ["…"],
  "limitations": ["…"]
}
```

Response 200 — cùng shape `BriefOut` như §1.7, kèm thêm trường `edited_at`:

| Backend | Frontend | Ghi chú |
|---|---|---|
| `edited_at` | `editedAt` | ISO-8601 \| null — `null` nếu brief chưa từng được sửa |

Ý nghĩa:

- Edit **KHÔNG đổi** `version` (version chỉ tăng khi regenerate LLM), **KHÔNG đổi** `status`/decision.
- Regenerate (LLM mới) reset `edited_at` về `null`.
- `GET /briefs/{brief_id}` cũng trả `edited_at`.

Lỗi: 400 body sai/rỗng (`{"detail": …}`), 404 brief không tồn tại. Frontend parse `edited_at` phòng thủ như các trường khác (thiếu → `null`, không crash).

## 1.11 `GET /evaluations` + `GET /evaluations/{run_id}` — scorecard đánh giá tự động (3 gates: data / ml / llm) ✅

Trang frontend "Đánh giá tự động" (`/evaluations`) đọc 2 endpoint này. Backend trả **snake_case**, frontend map sang camelCase như §1.5.

### `GET /evaluations?limit=20` → 200

```json
{
  "runs": [
    {
      "run_id": "eval-report-20261106",
      "created_at": "2026-11-06T09:30:00+07:00",
      "subjects": ["data", "ml"],
      "combined_summary": { "total": 13, "pass": 12, "warn": 1, "fail": 0, "skipped": 0 },
      "overall_status": "pass",
      "reports_available": ["eval_data.json", "eval_ml.json"]
    }
  ],
  "total": 9,
  "limit": 20
}
```

- `overall_status` ∈ `pass` | `warn` | `fail` | `skipped` — badge PASS xanh / WARN vàng / FAIL đỏ / SKIPPED xám.
- `subjects` = các gate đã chạy trong lần đánh giá (`data` / `ml` / `llm`).

### `GET /evaluations/{run_id}` → 200

```json
{
  "run_id": "eval-report-20261106",
  "created_at": "2026-11-06T09:30:00+07:00",
  "reports": {
    "data": { …Scorecard },
    "ml":   { …Scorecard }
  }
}
```

Shape `Scorecard` (mỗi subject 1 scorecard):

```json
{
  "schema_version": "learnguard.eval.v1",
  "run_id": "eval-report-20261106",
  "subject": "data",
  "created_at": "2026-11-06T09:30:00+07:00",
  "inputs": "snapshot-v1:cutoff27 · 6.510 dòng",
  "checks": [
    {
      "id": "data_missing_values",
      "name": "Tỷ lệ giá trị thiếu",
      "status": "pass",
      "threshold": "<= 5%",
      "observed": "1.8%",
      "details": "Mô tả tiếng Việt cho cố vấn…"
    }
  ],
  "summary": { "total": 13, "pass": 12, "warn": 1, "fail": 0, "skipped": 0 }
}
```

- `checks[].status` ∈ `pass` | `warn` | `fail` | `skipped` — **status lạ → frontend treat như `skipped`** (badge xám), không crash.
- `threshold` / `observed` có thể là scalar hoặc object — frontend format gọn thành chuỗi (`object` → `key: value · key: value`); `observed` dài hiển thị dạng expandable (`<details>`).
- Lỗi: 404 `evaluation_not_found`, 503 `evaluations_dir_not_configured` (→ `HTTP_404` / `HTTP_503` chuẩn §1.6).

Mapping snake_case ↔ camelCase (evaluations):

| Backend | Frontend | Ghi chú |
|---|---|---|
| `runs[].run_id` | `runId` | string |
| `runs[].created_at` | `createdAt` | ISO-8601, hiển thị vi-VN |
| `runs[].subjects` | `subjects` | string[] |
| `runs[].combined_summary` | `combinedSummary` | `{ total, pass, warn, fail, skipped }` |
| `runs[].overall_status` | `overallStatus` | 4 giá trị như trên |
| `runs[].reports_available` | `reportsAvailable` | string[] tên file report |
| `reports` | `reports: EvaluationScorecard[]` | object → mảng, sort data → ml → llm |
| `checks[].id` / `name` / `status` / `threshold` / `observed` / `details` | cùng tên | `threshold`/`observed`/`inputs` được format thành chuỗi |

---

## 2. Tính năng backend CHƯA có — frontend chạy MOCK, không đụng API thật

| Tính năng | Backend | Quy ước frontend đến khi backend sẵn sàng |
|---|---|---|
| **Auth** (POST /auth/login, JWT, RBAC) | ❌ TODO M6 | `LearnGuardApiClient.login()` ném `BACKEND_NOT_IMPLEMENTED`; UI dùng mock login (`VITE_USE_MOCK`), session client-side. **Không gửi credential thật đi đâu cả.** |
| **Briefs** (generate/read/decide, M8) | ✅ Đã có (§1.7–§1.9) | Real mode: `generateBrief`/`saveBriefDecision` gọi thẳng `/briefs/*`; `fallback_review`/`unavailable` hiển thị nhãn "Brief dự phòng — LLM không khả dụng". Mock mode (demo) giữ mock briefs. |
| **Brief edit** (PUT /briefs/{brief_id}, §1.10) | ✅ Đã có (§1.10) | Real mode: `editBrief` gọi thẳng `PUT /briefs/{id}` (edit không đổi version/status; `edited_at` reset về null khi regenerate). Mock mode giữ hành vi demo tương ứng. |
| **Evaluations** (scorecard 3 gates, §1.11) | ✅ Đã có (§1.11) | Real mode: `listEvaluations`/`getEvaluation` gọi thẳng `/evaluations*`. Mock mode: 2 runs demo cứng (1 pass trọn, 1 có warn + fail) với nội dung tiếng Việt. |
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
| Brief generate/read/edit/accept/reject | ✅ real API M8 (generate + decide + GET read + edit `PUT /briefs/{id}` §1.10) |
| Evaluations dashboard (scorecard data/ml/llm) | ✅ trang `/evaluations` — real API §1.11 + mock demo 2 runs |
| States: insufficient-data, manual-review, API error | ✅ đủ 4 status + error states |
| Route advisor-only | ✅ client-side guard (backend auth chờ M6) |
| Component tests, a11y, container | ⬜ TODO tiếp theo |
