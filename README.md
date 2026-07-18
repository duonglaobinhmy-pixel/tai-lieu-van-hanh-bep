# Bếp Bình Mỹ · PM Handover Portal V5 — Cloudflare

Phiên bản này lưu dữ liệu dùng chung qua:

- Cloudflare Pages
- Pages Functions
- Workers KV

Khi bấm **Lưu lên Cloudflare**, dữ liệu tài khoản, biên bản bàn giao, checklist và nhật ký thay đổi sẽ được lưu vào KV. Máy khác đăng nhập bằng cùng mật khẩu sẽ thấy dữ liệu mới.

## 1. Tạo repository

Đưa toàn bộ thư mục project lên GitHub hoặc GitLab.

Không đổi cấu trúc:

```text
index.html
styles.css
app.js
functions/
  api/
    login.js
    state.js
```

## 2. Tạo Cloudflare Pages project

Trong Cloudflare Dashboard:

1. Vào **Workers & Pages**.
2. Chọn **Create application**.
3. Chọn **Pages** và kết nối repository.
4. Framework preset: `None`.
5. Build command: để trống.
6. Build output directory: `/` hoặc thư mục gốc project.

## 3. Tạo Workers KV

Trong Cloudflare Dashboard:

1. Vào **Storage & Databases** → **KV**.
2. Tạo namespace tên ví dụ: `BBM_HANDOVER_DATA`.
3. Quay lại Pages project.
4. Vào **Settings** → **Bindings**.
5. Thêm KV namespace binding:
   - Variable name: `BBM_DATA`
   - KV namespace: `BBM_HANDOVER_DATA`
6. Gắn binding cho cả Production và Preview nếu cần.

## 4. Tạo biến bí mật

Trong Pages project → **Settings** → **Variables and Secrets**, thêm:

### DOCS_PASSWORD_HASH

SHA-256 của mật khẩu đăng nhập.

Mật khẩu mặc định trong bản mẫu:

```text
BepBinhMy@2026
```

SHA-256 tương ứng:

```text
80efd563cb36dc3250ef3c173119622d89a4375bec6193d16f17bf6af4c12287
```

### AUTH_TOKEN_SECRET

Chuỗi bí mật dài, ngẫu nhiên. Ví dụ tự tạo bằng terminal:

```bash
openssl rand -hex 32
```

Không dùng ví dụ mẫu làm secret production.

## 5. Deploy

Push source lên repository. Cloudflare Pages sẽ tự deploy.

Sau deploy:

1. Mở URL Pages.
2. Nhập mật khẩu.
3. Vào **Tài khoản & liên kết**.
4. Nhập dữ liệu.
5. Bấm **Lưu lên Cloudflare**.
6. Kiểm tra trạng thái chuyển thành **Đã lưu lên Cloudflare**.
7. Mở trình duyệt hoặc máy khác để xác nhận dữ liệu còn nguyên.

## 6. Cơ chế lưu

- `GET /api/state`: tải trạng thái từ KV.
- `PUT /api/state`: lưu trạng thái vào KV.
- `POST /api/login`: xác thực mật khẩu và cấp token 8 giờ.
- Có kiểm tra version để hạn chế hai máy ghi đè lẫn nhau.
- Có tự lưu sau khoảng 2 giây khi thay đổi dữ liệu.

## 7. Backup

Trong portal chọn **Xuất JSON** để tải một bản backup.

Nên backup:

- Trước khi thay đổi lớn.
- Sau khi hoàn tất bàn giao.
- Định kỳ hằng tuần.

## Lưu ý bảo mật

KV đang lưu nội dung tài khoản theo JSON phía server. Project đã bảo vệ API bằng token, nhưng đối với mật khẩu hạ tầng quan trọng, nên ưu tiên lưu trong một password manager chuyên dụng và chỉ ghi đường dẫn tham chiếu trong portal.
