BẾP BÌNH MỸ · PORTAL VẬN HÀNH 6.2
==================================

1. MÔ HÌNH BẢO MẬT ĐÃ CÓ TRONG CODE

- Đăng nhập bằng username + password, không còn một mật khẩu chung cho mọi người.
- Mật khẩu được kiểm tra bằng PBKDF2; source chỉ giữ hash của tài khoản khởi tạo.
- Phiên đăng nhập nằm trong cookie HttpOnly + Secure + SameSite=Strict.
- Ba vai trò: Admin, Operator, Viewer.
- Không dùng IP để chặn đăng nhập hoặc API.
- Mọi tài khoản hợp lệ được xác thực bằng username, password và phân quyền; IP chỉ được ghi audit.
- Audit log lưu: thời gian, user, role, IP, kết quả, thiết bị, quốc gia và lý do bị chặn.
- Khóa tạm khi nhập sai quá số lần quy định.
- Security headers: CSP, HSTS, chống iframe, chống MIME sniffing.

2. DEPLOY

Chạy thử local:

  npm install
  npm run dev

Không mở trực tiếp public/index.html vì bản tĩnh không chạy API đăng nhập.

Deploy production:

  npm run secret:set

Nhập một chuỗi ngẫu nhiên tối thiểu 32 ký tự, sau đó:

  npm run deploy

Mở URL workers.dev hoặc custom domain do Cloudflare trả về.

KV đã bind bằng tên BBM_DATA trong wrangler.jsonc. Nếu deploy sang tài khoản
Cloudflare khác, phải tạo KV mới và thay đúng namespace ID.

3. ĐĂNG NHẬP KHỞI TẠO

Username: admin
Mật khẩu khởi tạo: BepBinhMy@2026

Tài khoản `admin` là tài khoản quản trị toàn quyền.
Ngay sau lần đăng nhập đầu:

1) Mở tab "Phân quyền & IP".
2) Không cần thêm IP để đăng nhập.
3) Danh sách IP nếu có chỉ dùng để tham khảo và đối chiếu audit.
4) Tạo Admin thứ hai và đặt mật khẩu riêng.
5) Lưu chính sách.
6) Không bật chặn IP; chức năng này đã bị vô hiệu hóa trong code.
7) Đổi mật khẩu tài khoản admin khởi tạo.

Admin, Operator và Viewer chỉ bị giới hạn theo quyền tài khoản, không theo IP.

4. NHẬT KÝ IP

IP không cần khai báo trước và không được dùng để chặn. Cloudflare ghi nhận IP
Internet công cộng qua CF-Connecting-IP; Worker lưu IP này vào audit cùng user,
role, thời gian, thiết bị và vị trí Cloudflare để truy vết.

5. PHÂN QUYỀN

- Admin gốc: toàn quyền tài liệu, link hệ thống, user và audit log.
- Admin phụ: toàn quyền theo RBAC.
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
