# Tự host SmartKitchen trên máy cá nhân (Docker Compose + Tailscale Funnel)

SCRUM-278. Chạy toàn bộ 23 container (11 PostgreSQL, 11 service, gateway) trên một máy luôn bật và mở gateway ra Internet qua **Tailscale Funnel** (HTTPS, cổng 443) — không tốn chi phí cloud. Phù hợp demo và kiểm thử của nhóm; đây không phải hạ tầng có cam kết uptime (xem mục *Giới hạn*).

```
Internet ──HTTPS:443──▶ Tailscale Funnel (trên máy host) ──▶ 127.0.0.1:4000 gateway ──▶ các service (mạng Docker nội bộ)
```

Chỉ gateway có cổng trên host, và chỉ ở `127.0.0.1:4000`. Database và service không mở cổng nào ra ngoài.

## Điều kiện

- **Docker Desktop** (Windows/macOS) hoặc **Docker Engine 25+** với Compose v2 (`docker compose version`). Cần Engine 25+ vì healthcheck dùng `start_interval`.
- **Tailscale** đã cài và đăng nhập (`tailscale status`). Trong trang quản trị tailnet phải bật **HTTPS certificates** và cho phép **Funnel** (thuộc tính `funnel` trong access policy). Xem [Tailscale Funnel](https://tailscale.com/kb/1223/funnel).
- **Git** và một shell: Git Bash/WSL cho `scripts/self-host-start.sh`, hoặc PowerShell cho `scripts/self-host-start.ps1`.
- File **`.env`** đã điền (bước 2). Không bao giờ commit `.env`.

## Cài đặt lần đầu

1. **Clone repo**

   ```bash
   git clone https://github.com/Vincent-Nguyen2005/SmartKitchen.git
   cd SmartKitchen
   ```

2. **Tạo `.env` từ mẫu và điền secret**

   ```bash
   cp .env.example .env            # PowerShell: Copy-Item .env.example .env
   ```

   Bắt buộc với `docker-compose.prod.yml` (compose sẽ từ chối chạy nếu thiếu):

   | Biến | Ghi chú |
   |---|---|
   | `JWT_SECRET`, `INTERNAL_API_KEY`, `PURCHASE_SYNC_API_KEY`, `PARTNER_API_KEY` | Mỗi biến một giá trị ngẫu nhiên riêng: `openssl rand -hex 32`. Không dùng giá trị mẫu. |
   | `POSTGRES_PASSWORD` | Mật khẩu cho mọi container PostgreSQL. **Chỉ dùng ký tự hex** (`openssl rand -hex 24`) vì nó nằm trong `DATABASE_URL`. |
   | `PAYMENT_PUBLIC_BASE_URL` | URL Funnel công khai (bước 4), ví dụ `https://may-cua-huy.tail1234.ts.net`. |

   Tùy chọn: `SMTP_*`/`EMAIL_FROM` (gửi OTP), `ADMIN_EMAIL`/`ADMIN_PASSWORD` (tạo admin lần đầu), `REMOTE_CORS_ORIGINS` (origin web được phép gọi API), `IMAGE_REGISTRY`/`IMAGE_TAG`. Mỗi biến có chú thích trong `.env.example`.

3. **Có image cho 12 service**

   `docker-compose.prod.yml` không build, chỉ chạy image `${IMAGE_REGISTRY}/<service>:${IMAGE_TAG}` (mặc định `ghcr.io/vincent-nguyen2005/smartkitchen/<service>:latest`).

   - **Khi CI đã publish image lên GHCR:** bỏ qua bước này; script sẽ `pull`. Nếu package là private, đăng nhập một lần bằng `docker login ghcr.io` (dùng token của bạn, không lưu vào repo).
   - **Chưa có image trên registry:** build ngay trên máy từ `docker-compose.yml` rồi gắn tag cục bộ:

     ```powershell
     docker compose -p smartkitchen-build -f docker-compose.yml build
     $services = "auth-service","family-service","inventory-service","nutrition-service","meal-diary-service","recipe-service","menu-service","shopping-list-service","payment-service","notification-service","admin-service","gateway"
     foreach ($s in $services) { docker tag "smartkitchen-build-$s" "smartkitchen/${s}:local" }
     ```

     Rồi đặt trong `.env`: `IMAGE_REGISTRY=smartkitchen` và `IMAGE_TAG=local`, và chạy script với `SKIP_PULL=1` (bash) hoặc `-SkipPull` (PowerShell).

4. **Khởi động**

   ```bash
   scripts/self-host-start.sh                 # Git Bash / WSL / Linux
   ```
   ```powershell
   .\scripts\self-host-start.ps1               # PowerShell
   ```

   Script `pull` image, `up -d` toàn bộ stack (project `smartkitchen`), rồi chờ `http://127.0.0.1:4000/health` trả về OK (tối đa 5 phút). Lần đầu mỗi service còn chạy `prisma migrate deploy`, nên có thể mất 1–2 phút.

5. **Mở ra Internet bằng Tailscale Funnel** (chạy trên máy host, không nằm trong compose)

   ```bash
   tailscale funnel --bg --https=443 http://127.0.0.1:4000
   tailscale funnel status          # in ra URL https://<tên-máy>.<tailnet>.ts.net
   ```

   `--bg` giữ Funnel chạy nền và tự bật lại sau khi khởi động lại máy. Tắt: `tailscale funnel --https=443 off` (hoặc `tailscale funnel reset`). Cú pháp trên áp dụng cho Tailscale 1.52 trở lên.

   Kiểm tra từ máy khác (hoặc mạng 4G): `curl https://<tên-máy>.<tailnet>.ts.net/health`.

6. **Trỏ app vào URL công khai** — trong `apps/mobile/.env.local` (không commit):

   ```dotenv
   EXPO_PUBLIC_API_BASE_URL=https://<tên-máy>.<tailnet>.ts.net
   ```

   Nếu đổi URL, cập nhật luôn `PAYMENT_PUBLIC_BASE_URL` trong `.env` rồi chạy lại script.

## Cập nhật phiên bản mới

```bash
git pull
scripts/self-host-start.sh          # hoặc .\scripts\self-host-start.ps1
```

`git pull` lấy compose/script mới; script `pull` image mới và `up -d` chỉ tạo lại container có image hoặc cấu hình thay đổi. Dữ liệu nằm trong named volume nên được giữ nguyên. Nếu dùng image build cục bộ, lặp lại bước 3 (build + tag) trước khi chạy script với `SKIP_PULL=1` / `-SkipPull`.

## Xử lý sự cố

Mọi lệnh đều cần `-p smartkitchen -f docker-compose.prod.yml`:

| Việc cần làm | Lệnh |
|---|---|
| Xem trạng thái + health của từng container | `docker compose -p smartkitchen -f docker-compose.prod.yml ps` |
| Xem log một service | `docker compose -p smartkitchen -f docker-compose.prod.yml logs -f <service>` (ví dụ `gateway`, `auth-service`) |
| Khởi động lại một service | `docker compose -p smartkitchen -f docker-compose.prod.yml restart <service>` |
| Kiểm tra gateway | `curl http://127.0.0.1:4000/health` |
| Kiểm tra mọi service qua gateway | `curl http://127.0.0.1:4000/api/health` (503 + danh sách service `DOWN` nếu có service lỗi) |
| Dừng cả stack (giữ dữ liệu) | `docker compose -p smartkitchen -f docker-compose.prod.yml stop` |

Lỗi thường gặp:

- **`required variable ... is missing a value`** — thiếu biến bắt buộc trong `.env` (bước 2).
- **`pull access denied` / `manifest unknown`** — image chưa có trên registry hoặc chưa `docker login ghcr.io`; làm theo nhánh *build cục bộ* ở bước 3.
- **Service báo `password authentication failed`** — volume database đã được tạo trước đó với mật khẩu khác (ví dụ stack dev `docker-compose.yml` cũng dùng project `smartkitchen` và mật khẩu `postgres`). PostgreSQL chỉ đọc `POSTGRES_PASSWORD` khi khởi tạo volume lần đầu. Hoặc đặt `POSTGRES_PASSWORD` trùng mật khẩu cũ, hoặc đổi mật khẩu trong từng DB: `docker compose -p smartkitchen -f docker-compose.prod.yml exec auth-db psql -U postgres -c "ALTER USER postgres PASSWORD '<mật-khẩu-mới>'"` (lặp cho mỗi `*-db`).
- **Stack dev và prod cùng project** — `docker-compose.yml` và `docker-compose.prod.yml` dùng chung tên container/volume khi cùng `-p smartkitchen`; chỉ chạy một trong hai tại một thời điểm.
- **Funnel không truy cập được** — `tailscale funnel status` phải liệt kê `https://...:443 -> http://127.0.0.1:4000`; kiểm tra tailnet đã bật HTTPS + Funnel; `curl http://127.0.0.1:4000/health` trên host phải OK trước.
- **Web bị `CORS_ORIGIN_DENIED`** — thêm origin của web vào `REMOTE_CORS_ORIGINS` (phân tách bằng dấu phẩy) rồi chạy lại script. Không dùng `*`.

> **Không bao giờ chạy `docker compose ... down -v`**: cờ `-v` xóa toàn bộ volume database.

## Nutrition và meal-diary: biến môi trường, migration, baseline

- **Biến môi trường:** `nutrition-service` cần `MEAL_DIARY_SERVICE_URL=http://meal-diary-service:4005` (thống kê theo ngày) và `RECIPE_SERVICE_URL=http://recipe-service:4006` (gợi ý món); cả `docker-compose.yml` và `docker-compose.prod.yml` đã khai báo sẵn. `meal-diary-service` dùng database riêng `meal-diary-db` (`DATABASE_URL`).
- **Migration khi khởi động:** hai service này chạy `prisma migrate deploy` rồi mới start (giống auth, family, admin, notification, inventory, shopping-list). Migrate lỗi thì container dừng (exit khác 0) và không phục vụ request; xem log bằng `docker compose -p smartkitchen logs <service>`.
- **Database cũ chưa có lịch sử migration (lỗi `P3005: The database schema is not empty`):** xảy ra khi bảng đã được tạo trước đó (ví dụ `NutritionProfile` có sẵn) nhưng chưa có bảng `_prisma_migrations`. Kiểm tra:

  ```bash
  docker compose -p smartkitchen exec nutrition-db psql -U postgres -d nutrition_db -c "\dt"
  ```

  Nếu có `NutritionProfile` mà không có `_prisma_migrations`, đánh dấu migration đầu tiên là đã áp dụng (chỉ một lần, không đổi dữ liệu), rồi khởi động lại:

  ```bash
  docker compose -p smartkitchen run --rm --no-deps --entrypoint sh nutrition-service -c "npx --no-install prisma migrate resolve --applied 20261002000000_add_nutrition_profile"
  docker compose -p smartkitchen up -d nutrition-service
  ```

  Với stack self-host thêm `-f docker-compose.prod.yml` vào mỗi lệnh. Tương tự cho `meal-diary-service` (`meal_diary_db`, migration `20261104120000_create_meal_diary`) nếu bảng `MealDiary` đã được tạo tay. Sao lưu database trước khi chạy.

## Giới hạn và an toàn

- Funnel là đường truy cập **công khai**: ai biết URL đều gọi được API. Chỉ dùng dữ liệu thử nghiệm và đảm bảo secret trong `.env` là ngẫu nhiên.
- Uptime phụ thuộc máy host: điện, mạng, cập nhật hệ điều hành, chế độ ngủ. Tắt chế độ sleep nếu cần chạy liên tục.
- Sao lưu định kỳ, ví dụ: `docker compose -p smartkitchen -f docker-compose.prod.yml exec -T auth-db pg_dump -U postgres auth_db > auth_db.sql` (lặp cho từng DB), và thử khôi phục trước khi dựa vào bản sao lưu.
- Phương án dùng Cloudflare Quick Tunnel cho nhóm: [shared-host.md](shared-host.md).
