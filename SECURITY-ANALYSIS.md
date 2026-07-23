# Phân tích bảo mật Portal vận hành Bếp Bình Mỹ 6.1

## 1. Điểm yếu của bản cũ

| Hạng mục | Bản cũ | Rủi ro |
| --- | --- | --- |
| Đăng nhập | Một mật khẩu chung hardcode trong `worker.js` | Ai biết mật khẩu đều có toàn quyền |
| Token | HMAC ký bằng chính mật khẩu portal | Lộ source đồng nghĩa lộ khóa ký |
| User | Không có username | Không biết chính xác ai truy cập |
| Vai trò | Không có RBAC | Bếp, Kho, Kế toán và kỹ thuật thấy cùng dữ liệu |
| IP | Chỉ ghi “IP Allowlist / VPN” trong tài liệu | Không có đoạn code nào thật sự chặn IP |
| Nhật ký | Không có login audit | Không truy ra ai vào, lúc nào và từ đâu |
| Secret | Bảng tài khoản cho phép lưu mật khẩu thật | Dễ lộ credential qua API/trình duyệt/export |
| Phiên | Bearer token trong `sessionStorage` | JavaScript phía client có thể đọc token |
| Chống dò mật khẩu | Không giới hạn | Có thể thử mật khẩu liên tục |
| Security headers | Chưa có | Thiếu CSP, HSTS, chống iframe và MIME sniffing |

## 2. Luồng bảo mật mới

```text
Client
  → Cloudflare lấy IP gốc (CF-Connecting-IP)
  → Worker kiểm rate limit
  → Worker kiểm username + PBKDF2 password hash
  → Worker kiểm IP/CIDR có cấp cho đúng role
  → Worker tạo cookie HttpOnly + Secure + SameSite=Strict
  → Mỗi API kiểm lại user, status, role và IP
  → Ghi audit event riêng vào KV
```

Việc ẩn nút trong giao diện chỉ là lớp UX. Quyết định cho phép/từ chối nằm trong
`worker.js`, vì vậy gọi API trực tiếp cũng không vượt quyền được.

## 3. Phân tầng user

| Role | Đọc tài liệu | Mở web vận hành | Sửa checklist/log thay đổi | Xem kho tài khoản | Quản lý user/IP | Xem audit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Admin gốc (`admin`) | Có | Có | Có | Có | Có | Có; bỏ qua chặn IP, vẫn ghi log |
| Admin phụ | Có | Có | Có | Có | Có | Có; chịu IP policy khi bật |
| Operator | Có | Có | Có | Không | Không | Không |
| Viewer | Có | Không | Không | Không | Không | Không |

Quyền được kiểm tra ở hai nơi:

1. `public/app.js`: ẩn/khóa giao diện không liên quan.
2. `worker.js`: bắt buộc permission ở từng endpoint.

## 4. IP chỉ dùng để ghi log

Hệ thống không dùng IP để chặn đăng nhập hoặc API. Lý do là IP động, VPN,
proxy và IPv6 có thể làm tài khoản hợp lệ bị khóa nhầm. Worker vẫn ghi IP,
thiết bị, vị trí Cloudflare và thời gian vào audit để truy vết.

### Nên cấp

| Nhãn rule | CIDR đề xuất | Role | Mục đích |
| --- | --- | --- | --- |
| Văn phòng quản trị | IP Internet tĩnh `/32` | Admin | Quản trị hằng ngày |
| VPN kỹ thuật | IP đầu ra VPN `/32` | Admin | Đường dự phòng và xử lý sự cố |
| Mạng Bếp | IP Internet tĩnh `/32` | Operator | Vận hành workflow hằng ngày |
| Quản lý | IP Internet tĩnh `/32` | Viewer | Chỉ đọc khi thật sự cần |
| Khẩn cấp | IP chính xác + `expiresAt` | Admin | Tự hết hạn sau sự cố |

### Không cấp

- `0.0.0.0/0` hoặc `::/0`.
- IP LAN như `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`.
- Dải CIDR rộng không cần thiết.
- IP Wi-Fi công cộng.
- IP động nếu không có phương án VPN dự phòng.

Cloudflare nhìn thấy IP Internet công cộng qua `CF-Connecting-IP`, không nhìn
thấy IP LAN của máy người dùng.

### Không cưỡng chế IP

Hàm kiểm tra IP luôn cho qua tài khoản đã xác thực đúng. Endpoint cập nhật
chính sách cũng ép `enforceIpAllowlist=false`, vì vậy giao diện hoặc request
API không thể vô tình bật lại chặn IP. Phân quyền Admin/Operator/Viewer vẫn
được kiểm tra phía server ở từng endpoint.

## 5. Nhật ký truy cập IP

Các sự kiện chính:

- `LOGIN_SUCCEEDED`
- `LOGIN_FAILED`
- `LOGIN_BLOCKED_IP`
- `LOGIN_RATE_LIMITED`
- `LOGOUT`
- `STATE_UPDATED`
- `SECURITY_POLICY_UPDATED`

Mỗi log lưu:

- Thời gian ISO.
- Event và kết quả `allowed/denied`.
- Username và role.
- IP, quốc gia, thành phố, Cloudflare colo.
- User-Agent thiết bị.
- Lý do và chi tiết an toàn.

Không ghi mật khẩu, cookie hoặc password hash.

Mỗi event dùng một KV key riêng và tự hết hạn sau 90 ngày. Cách này tránh dồn
mọi lần đăng nhập vào cùng một key KV.

## 6. API và permission

| Endpoint | Method | Permission |
| --- | --- | --- |
| `/api/login` | POST | Public, nhưng chịu rate limit + IP policy |
| `/api/logout` | POST | User đã đăng nhập |
| `/api/session` | GET | `document:read` |
| `/api/state` | GET | `state:read` |
| `/api/state` | PUT | `state:write` |
| `/api/security` | GET/PUT | `security:manage` |
| `/api/audit` | GET | `audit:read` |

Operator gửi trường `accounts` vào API cũng bị server bỏ qua. Viewer gọi `PUT`
`/api/state` bị trả `403`.

## 7. Xử lý credential trong tài liệu

Cột “Mật khẩu / Secret” đã đổi thành “Vị trí lưu Secret”.

Nên ghi:

- `Cloudflare Secret: SESSION_SECRET`
- `Password Manager: Bếp Bình Mỹ / n8n`
- `SSH Key Vault: VPS Production`

Không nên nhập mật khẩu thật. Với dữ liệu cũ, server chỉ trả chuỗi mask
`••••••••` ra trình duyệt; giá trị cũ không được gửi xuống client.

## 8. Cấu hình link web vận hành

Admin nhập `operationPortalUrl` tại:

`Tài khoản & liên kết → Biên bản bàn giao nhanh`

Link được đồng bộ ra ba vị trí:

1. Tab “Mở web vận hành” trên sidebar.
2. Nút ở trang tổng quan.
3. Nút trong SOP vận hành.

Link chỉ nhận HTTPS hoặc cùng origin, luôn mở tab mới với
`rel="noopener noreferrer"`.

## 9. Thứ tự go-live

1. Đặt `SESSION_SECRET` tối thiểu 32 ký tự bằng Wrangler Secret.
2. Deploy Worker.
3. Đăng nhập `admin`.
4. Thêm IP hiện tại `/32`.
5. Thêm IP đầu ra VPN Admin dự phòng.
6. Tạo Admin thứ hai.
7. Tạo Operator/Viewer cần thiết với mật khẩu riêng.
8. Đăng xuất và thử từ từng mạng.
9. Bật IP enforcement.
10. Xác nhận log có cả sự kiện thành công và bị chặn.
11. Đổi mật khẩu Admin khởi tạo.

## 10. Lớp bảo mật production nên giữ thêm

- Cloudflare Access/MFA trước portal và domain n8n quản trị.
- WAF Rate Limiting cho `/api/login`.
- Chỉ Cloudflare được đi tới origin HTTPS.
- Không public cổng n8n `5678`.
- SSH bằng key, qua VPN hoặc IP quản trị.
- IP policy quan trọng nên đồng bộ thêm ở Cloudflare Access/WAF; Workers KV có
  tính nhất quán cuối cùng nên thay đổi ở một điểm hiện diện khác có thể cần một
  khoảng ngắn để cập nhật.

Tài liệu tham chiếu chính thức:

- Cloudflare HTTP headers: <https://developers.cloudflare.com/fundamentals/reference/http-headers/>
- Cloudflare Workers Web Crypto: <https://developers.cloudflare.com/workers/runtime-apis/web-crypto/>
- Workers KV limits: <https://developers.cloudflare.com/kv/platform/limits/>

## 11. Vị trí code đã thay đổi

| File | Nội dung |
| --- | --- |
| `worker.js` | Auth, RBAC, IP/CIDR, cookie, rate limit, audit, security headers |
| `public/index.html` | Login username, link vận hành, tab user/IP và audit |
| `public/app.js` | Session cookie, role UI, quản trị user/IP, render log |
| `public/styles.css` | Giao diện responsive cho policy/audit |
| `README-DEPLOY.txt` | Hướng dẫn deploy và kích hoạt an toàn |
| `public/docs/CLOUDFLARE-DEPLOYMENT.md` | Checklist go-live |
| `tests/worker.test.mjs` | Kiểm thử 8 tình huống bảo mật |
