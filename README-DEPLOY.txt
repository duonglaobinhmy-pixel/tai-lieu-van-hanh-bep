BẾP BÌNH MỸ · PORTAL VẬN HÀNH 6.1
==================================

1. MÔ HÌNH BẢO MẬT ĐÃ CÓ TRONG CODE

- Đăng nhập bằng username + password, không còn một mật khẩu chung cho mọi người.
- Mật khẩu được kiểm tra bằng PBKDF2; source chỉ giữ hash của tài khoản khởi tạo.
- Phiên đăng nhập nằm trong cookie HttpOnly + Secure + SameSite=Strict.
- Ba vai trò: Admin, Operator, Viewer.
- IP Allowlist gắn theo vai trò và chặn ở Worker/API, không chỉ ẩn nút trên giao diện.
- Audit log lưu: thời gian, user, role, IP, kết quả, thiết bị, quốc gia và lý do bị chặn.
- Khóa tạm khi nhập sai quá số lần quy định.
- Security headers: CSP, HSTS, chống iframe, chống MIME sniffing.

2. DEPLOY

Mở Terminal tại thư mục project và chạy:

  npx wrangler secret put SESSION_SECRET

Nhập một chuỗi ngẫu nhiên tối thiểu 32 ký tự, sau đó chạy:

  npx wrangler deploy

Mở URL workers.dev hoặc custom domain do Cloudflare trả về.

KV đã bind bằng tên BBM_DATA trong wrangler.jsonc. Nếu deploy sang tài khoản
Cloudflare khác, phải tạo KV mới và thay đúng namespace ID.

3. ĐĂNG NHẬP KHỞI TẠO

Username: admin
Mật khẩu khởi tạo: BepBinhMy@2026

Ngay sau lần đăng nhập đầu:

1) Mở tab "Phân quyền & IP".
2) Bấm "+ Thêm IP hiện tại".
3) Thêm ít nhất một IP dự phòng là IP đầu ra VPN kỹ thuật.
4) Tạo Admin thứ hai và đặt mật khẩu riêng.
5) Lưu chính sách.
6) Bật "Chặn IP ngoài danh sách" và lưu lại.
7) Đổi mật khẩu tài khoản admin khởi tạo.

Worker không cho bật chặn nếu IP hiện tại chưa được cấp cho Admin, tránh tự
khóa người cấu hình.

4. IP NÀO ĐƯỢC PHÉP

Nên thêm:

- IP Internet tĩnh của văn phòng quản trị: quyền Admin.
- IP đầu ra VPN của đội kỹ thuật: quyền Admin.
- IP Internet tĩnh của mạng Bếp: quyền Operator.
- IP chỉ đọc cho quản lý: quyền Viewer, nếu thật sự cần.
- IP khẩn cấp: đặt ngày hết hạn ngắn và tắt sau khi xử lý.

Không thêm:

- 0.0.0.0/0 hoặc ::/0.
- IP nội bộ 192.168.x.x, 10.x.x.x, 172.16-31.x.x.
- Dải IP quá rộng.
- IP Wi-Fi công cộng.

Cloudflare nhìn thấy IP Internet công cộng qua CF-Connecting-IP. Nếu đường
truyền dùng IP động, ưu tiên VPN có IP đầu ra cố định trước khi bật cưỡng chế.

5. PHÂN QUYỀN

- Admin: toàn quyền tài liệu, link hệ thống, user, IP và audit log.
- Operator: đọc tài liệu, mở web vận hành, cập nhật checklist/nhật ký.
- Viewer: chỉ đọc; không thấy tài khoản, user, IP hoặc log.

6. LINK WEB VẬN HÀNH

Admin vào "Tài khoản & liên kết" → "Biên bản bàn giao nhanh" → nhập trường
"Link web vận hành / đăng nhập". Link này xuất hiện ở sidebar, trang tổng quan
và SOP; khi bấm sẽ mở tab mới.

7. NHẬT KÝ IP

Admin mở tab "Log truy cập IP". Log được lưu thành từng key riêng trong KV,
tự hết hạn sau 90 ngày và không ghi mật khẩu.

Khuyến nghị production:

- Bật thêm Cloudflare Access/MFA cho domain quản trị.
- Bật WAF Rate Limiting cho /api/login.
- Chỉ cho Cloudflare truy cập origin; không public cổng n8n 5678.
- SSH chỉ qua key + VPN/IP quản trị.
