# Checklist triển khai Cloudflare

- [ ] KV namespace đã tạo và binding đúng tên `BBM_DATA`.
- [ ] Đã đặt `SESSION_SECRET` bằng Wrangler Secret, không commit giá trị thật.
- [ ] Đã deploy Worker và assets.
- [ ] Đăng nhập được bằng user `admin`.
- [ ] Đã thêm IP hiện tại `/32`.
- [ ] Đã thêm IP dự phòng/VPN quản trị.
- [ ] Đã tạo Admin thứ hai.
- [ ] Đã tạo các tài khoản Operator/Viewer cần thiết.
- [ ] Đã kiểm thử Operator không thấy tài khoản, IP và audit log.
- [ ] Đã kiểm thử Viewer chỉ đọc.
- [ ] Đã bật IP enforcement sau khi kiểm tra danh sách.
- [ ] Đã thử đăng nhập từ IP ngoài danh sách và thấy bị chặn.
- [ ] Audit log có đủ sự kiện thành công, thất bại và IP bị chặn.
- [ ] Đã nhập link web vận hành và thử mở ở tab mới.
- [ ] Đã cấu hình custom domain, HTTPS và Cloudflare Access/MFA.
- [ ] Đã bật WAF Rate Limiting cho `/api/login`.
- [ ] Origin không public cổng n8n `5678`.

## Thứ tự kích hoạt IP Allowlist

1. Giữ chế độ audit-only trong lần cấu hình đầu.
2. Thêm IP Internet tĩnh của văn phòng Admin.
3. Thêm IP đầu ra VPN kỹ thuật làm đường dự phòng.
4. Thêm IP mạng Bếp cho role Operator.
5. Lưu, đăng xuất, đăng nhập thử từ từng mạng.
6. Bật cưỡng chế và xác nhận IP hiện tại vẫn được phép.

Không dùng `0.0.0.0/0`, `::/0` hoặc IP LAN như `192.168.x.x`.
