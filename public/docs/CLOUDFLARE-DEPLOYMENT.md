# Checklist triển khai Cloudflare

- [ ] KV namespace đã tạo và binding đúng tên `BBM_DATA`.
- [ ] Đã đặt `SESSION_SECRET` bằng Wrangler Secret, không commit giá trị thật.
- [ ] Đã deploy Worker và assets.
- [ ] Đăng nhập được bằng user `admin`.
- [ ] Đã xác nhận IP chỉ được ghi audit, không dùng để chặn.
- [ ] Đã tạo Admin thứ hai.
- [ ] Đã tạo các tài khoản Operator/Viewer cần thiết.
- [ ] Đã kiểm thử Operator không thấy tài khoản, IP và audit log.
- [ ] Đã kiểm thử Viewer chỉ đọc.
- [ ] Đã thử đăng nhập tài khoản hợp lệ từ mạng khác và vẫn vào được.
- [ ] Audit log có đủ sự kiện đăng nhập thành công và thất bại kèm IP.
- [ ] Đã nhập link web vận hành và thử mở ở tab mới.
- [ ] Đã cấu hình custom domain, HTTPS và Cloudflare Access/MFA.
- [ ] Đã bật WAF Rate Limiting cho `/api/login`.
- [ ] Origin không public cổng n8n `5678`.

## Chính sách IP

Không kích hoạt IP Allowlist. IP chỉ dùng cho audit log; quyền truy cập được
quyết định bằng username, password, trạng thái tài khoản và RBAC phía server.
