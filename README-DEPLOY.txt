BẢN DEPLOY 1 LỆNH - MẬT KHẨU ĐÃ GẮN TRONG worker.js

Mật khẩu đăng nhập: BepBinhMy@2026

Cách deploy:
1. Mở Terminal tại đúng thư mục project này.
2. Chạy: npx wrangler deploy
3. Mở đường dẫn workers.dev do Wrangler trả về.

Không cần tạo PORTAL_PASSWORD trong Cloudflare nữa.
KV đã bind bằng tên BBM_DATA và namespace ID có sẵn trong wrangler.jsonc.

Lưu ý bảo mật: mật khẩu nằm trực tiếp trong source code theo yêu cầu.
Muốn đổi mật khẩu, sửa dòng PORTAL_PASSWORD trong worker.js rồi deploy lại.
