# Frontend TODO

- [x] Chốt OpenAPI contract/version với backend (`docs/API_CONTRACT.md` v1.0).
- [x] Implement API client: base URL, typed error, timeout (auth header chờ backend M6).
- [ ] Implement advisor login/session expiry/logout — 🟡 đang mock, chờ backend M6 auth.
- [x] Implement priority queue, module/presentation filters, pagination (real API).
- [x] Implement student profile với disclaimer, signal attribution và uncertainty (real API).
- [ ] Implement brief generate/read/edit/accept/reject flow — 🟡 đang mock, chờ backend M8.
- [x] Hiển thị insufficient-data, manual-review, fallback và API error states (đủ 4 status).
- [x] Đảm bảo route/UI chỉ dành cho advisor/admin; không có student view (client-side guard).
- [ ] Thêm accessibility, responsive layout và component tests.
- [ ] Thêm container build/deploy config sau khi UI/API contract ổn định.
