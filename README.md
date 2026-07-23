# Bếp Bình Mỹ · Portal vận hành

Project Cloudflare Worker hoàn chỉnh gồm giao diện tài liệu, API đăng nhập,
phân quyền Admin/Operator/Viewer, KV lưu trạng thái và audit log IP.

## Chạy thử trên máy

Yêu cầu Node.js 20 trở lên:

```bash
npm install
npm run dev
```

Mở địa chỉ Wrangler hiển thị trong Terminal. Không mở trực tiếp
`public/index.html`, vì file tĩnh không có API `/api/login`.

Tài khoản khởi tạo:

- Username: `admin`
- Password: `BepBinhMy@2026`

Admin mặc định và khóa ký phiên dự phòng đã nằm trong `worker.js`, nên chạy
local hoặc deploy không cần tạo biến môi trường.

## Kiểm thử

```bash
npm test
npm run check
```

## Deploy Cloudflare

Đăng nhập Cloudflare:

```bash
npx wrangler login
```

Deploy:

```bash
npm run deploy
```

Mở URL `workers.dev` do Wrangler trả về. Chỉ URL này hoặc custom domain mới
chạy được API đăng nhập.

## Bảo mật đang áp dụng

- PBKDF2 cho mật khẩu.
- Cookie `HttpOnly`, `Secure`, `SameSite=Strict`.
- Phiên ký HMAC bằng khóa có sẵn trong Worker; có thể ghi đè bằng
  `SESSION_SECRET` nếu sau này muốn tăng bảo mật.
- RBAC được kiểm tra ở từng API.
- IP không dùng để chặn; chỉ ghi audit để tránh khóa nhầm do IP động/VPN/IPv6.
- Rate limit đăng nhập, CSP, HSTS và các security header.

Xem thêm `README-DEPLOY.txt` và `SECURITY-ANALYSIS.md`.

> Lưu ý: mật khẩu Admin hard-code phù hợp repository riêng tư. Không để
> repository công khai vì người xem source sẽ thấy mật khẩu.
