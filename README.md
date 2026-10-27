# LearnGuard Frontend

Git repository riêng cho M9 advisor dashboard, viết bằng React + TypeScript. Repo sở hữu UI, route composition, auth/session flow và typed API client; backend sở hữu authorization và business rules.

Frontend gọi backend REST API đã version hóa; không truy cập PostgreSQL, model registry, raw OULAD hay LLM API trực tiếp. Các page hiện chỉ là TODO scaffold và trả `null`.

Xem `TODO.md` để biết thứ tự triển khai. API types/methods hiện là contract đề xuất, cần đồng bộ với backend OpenAPI trước khi implement request.
