# LearnGuard Frontend

Git repository riêng cho M9 advisor dashboard, viết bằng React + TypeScript. Repo sở hữu UI, route composition, auth/session flow và typed API client; backend sở hữu authorization và business rules.

Frontend gọi backend REST API đã version hóa; không truy cập PostgreSQL, model registry, raw OULAD hay LLM API trực tiếp. Hợp đồng API frontend ↔ backend định nghĩa tại [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — predictions chạy real API, auth/briefs đang mock chờ backend M6/M8.

Xem `TODO.md` để biết thứ tự triển khai.
