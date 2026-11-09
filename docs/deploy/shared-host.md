# Máy chủ chung miễn phí cho nhóm ở các mạng khác nhau

Phương án này dành cho **kiểm thử nội bộ**, không phải hạ tầng production có cam kết uptime. Một máy luôn bật giữ PostgreSQL, auth-service và gateway. Các thành viên dùng cùng URL gateway qua Cloudflare Quick Tunnel; không cần đặt SMTP trên từng máy. URL Quick Tunnel thay đổi mỗi lần chạy và dừng hoạt động khi máy chủ hoặc `cloudflared` tắt.

## Chuẩn bị trên máy chủ

1. Cài Docker Desktop và Docker Compose **2.24.4 trở lên** (`docker compose version`). Cài [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) từ Cloudflare.
2. Tạo `.env` ở gốc dự án theo `.env.example`, chỉ trên máy chủ. Dùng giá trị ngẫu nhiên riêng cho `JWT_SECRET`, `INTERNAL_API_KEY`, `PURCHASE_SYNC_API_KEY`; không dùng giá trị mẫu. Đặt `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` cho tài khoản gửi OTP. Mật khẩu ứng dụng từng chia sẻ qua chat phải được thu hồi và thay bằng mật khẩu mới; **không commit `.env` lên Git**.
3. Chạy cấu hình chia sẻ từ thư mục gốc:

   ```powershell
   docker compose -f docker-compose.yml -f docker-compose.remote.yml up -d --build auth-service family-service gateway
   ```

   Docker Compose tự khởi động `auth-db` và `family-db` theo `depends_on`. Cấu hình remote gỡ tất cả cổng host của database/service; chỉ gateway nghe ở `127.0.0.1:4000`. Các tính năng khác chưa chạy sẽ báo không khả dụng. Nếu cần toàn bộ tính năng và máy đủ tài nguyên, dùng cùng lệnh nhưng bỏ `auth-service family-service gateway` ở cuối.
4. Kiểm tra `http://127.0.0.1:4000/health`, rồi chạy tunnel trong terminal riêng:

   ```powershell
   cloudflared tunnel --url http://127.0.0.1:4000
   ```

   Chia sẻ URL `https://...trycloudflare.com` vừa được in ra. Không mở port forwarding trên router và không chia sẻ trực tiếp cổng 4001/5432.

## Trên máy từng thành viên

Từng người có thể chạy giao diện Expo trên máy của mình, nhưng mọi yêu cầu API đều phải tới **cùng một URL tunnel**, không phải `localhost:4000`. Đặt trong `apps/mobile/.env.local` (file riêng, không commit):

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://<URL-tunnel-gateway>
```

Khởi động lại Expo sau khi đổi URL. Khi tunnel khởi động lại, cập nhật biến này trên từng máy. Năm bản app dùng cùng API sẽ cùng đọc/ghi một database trên máy chủ; **năm bộ Docker/database chạy độc lập không tự đồng bộ** dù cấu hình giống nhau. Nếu web frontend được phục vụ từ một origin khác `http://localhost:8081` hoặc `http://127.0.0.1:8081`, thêm origin đó vào `REMOTE_CORS_ORIGINS` trong `.env` của máy chủ, phân tách bằng dấu phẩy rồi tạo lại gateway. Không dùng `*` cho gateway mở ra Internet.

## Giới hạn và an toàn

- Quick Tunnel là đường truy cập **công khai**; bất kỳ ai biết URL đều có thể gọi API, nên chỉ dùng dữ liệu thử nghiệm và kiểm tra xác thực/rate limit trước khi chia sẻ. `--allowed-mail` sẽ chặn các API call từ app native bằng trang xác thực của Cloudflare, nên không bật tùy chọn này cho gateway API.
- Không dùng mật khẩu database mặc định của `docker-compose.yml` cho dữ liệu thật. Cấu hình hiện tại phù hợp kiểm thử nội bộ; trước khi dùng production cần mật khẩu DB riêng, sao lưu/khôi phục đã thử, giám sát, cập nhật và kiểm tra bảo mật đầy đủ.
- OTP được gửi từ `SMTP_USER` trên máy chủ tới email mà người dùng nhập. Đừng nhầm `EMAIL_FROM` (người gửi) với địa chỉ người nhận. Người dùng nên kiểm tra Spam/Junk và xác nhận địa chỉ email đã nhập đúng.
- Máy chủ cần luôn bật và có Internet. Điện, mạng, phần cứng và giới hạn Gmail/Cloudflare vẫn là phụ thuộc thực tế dù không trả phí hosting.

Xem [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) để biết giới hạn và cách hoạt động hiện hành. Khi cần URL cố định và độ tin cậy cho người dùng thật, chuyển sang hạ tầng production thay vì coi Quick Tunnel là máy chủ production.
