# SmartKitchen — Tài liệu phân hệ Nutrition / Meal Diary

> **Jira:** SCRUM-233 — Write documentation – Nutrition/Meal Diary section (EPIC-05/06)  
> **Sprint:** 4  
> **Cập nhật:** 17/11/2026  
> **Phạm vi:** ứng dụng Expo/React Native (`apps/mobile`)  
> **Tình trạng:** Bản tài liệu chờ nhóm review. Các kiểm thử API client dùng `fetch` giả lập đã chạy; kiểm thử tích hợp Backend thật và nghiệm thu responsive trên thiết bị còn cần thực hiện.

## 1. Tổng quan

Phân hệ **Nutrition / Meal Diary** giúp người dùng tạo hồ sơ dinh dưỡng, ghi lại món ăn theo ngày, theo dõi mức năng lượng và các chất đa lượng, xem thống kê và nhận gợi ý món ăn cá nhân hóa. Giao diện dùng các thành phần chủ đề chung tại `apps/mobile/src/theme`.

| Màn hình | Mục đích | Source |
|---|---|---|
| Nutrition Profile | Tạo/cập nhật hồ sơ, xem BMR/TDEE, chọn dị ứng và tình trạng sức khỏe | `apps/mobile/src/screens/nutrition/NutritionProfileScreen.tsx` |
| Meal Diary | Xem nhật ký theo ngày, thêm bữa ăn và tổng hợp dinh dưỡng | `apps/mobile/src/screens/meal-diary/MealDiaryScreen.tsx` |
| Nutrition Stats | Xem tổng calo/protein/carbs/fat và mức độ hoàn thành mục tiêu từng ngày | `apps/mobile/src/screens/nutrition/NutritionStatsScreen.tsx` |
| Suggestions | Xem mục tiêu tham khảo mỗi bữa và danh sách món ăn gợi ý | `apps/mobile/src/screens/nutrition/SuggestionsScreen.tsx` |

### Giới hạn tài liệu

Tài liệu này được đối chiếu với mã nguồn **UI đã cung cấp**, bản `nutritionProfileApi.ts` sửa cho SCRUM-270 và bộ kiểm thử SCRUM-231. Chưa có toàn bộ source Backend/API client khác trong tài liệu đầu vào; vì thế các route ngoài Nutrition Profile/Health Preferences không được khẳng định nếu chưa kiểm tra trực tiếp source Backend.

## 2. Hướng dẫn sử dụng

### 2.1. Tạo và cập nhật hồ sơ dinh dưỡng

1. Đăng nhập và mở màn hình **Hồ sơ dinh dưỡng**.
2. Nhập **chiều cao (cm)**, **cân nặng (kg)** và **năm sinh**.
3. Chọn **giới tính** (Nam/Nữ) và **mức vận động**: ít vận động, vận động nhẹ, vừa phải, năng động hoặc rất năng động.
4. Nhấn **Lưu và tính nhu cầu calo**.
5. Khi lưu thành công, màn hình hiển thị **TDEE** (ước tính năng lượng/ngày) và **BMR** (chỉ số trao đổi chất cơ bản).
6. Nếu đã có hồ sơ, thao tác lưu sử dụng lệnh cập nhật thay vì tạo mới.

**Kiểm tra đầu vào tại màn hình:** chiều cao và cân nặng phải là số dương; năm sinh là số nguyên trong khoảng từ năm hiện tại trừ 130 đến năm hiện tại. Không có phiên đăng nhập hợp lệ thì nút lưu bị vô hiệu hóa.

### 2.2. Dị ứng và tình trạng sức khỏe

Trong cùng màn hình, người dùng có thể chọn/deselect danh mục **dị ứng** và **bệnh lý / tình trạng sức khỏe**, sau đó nhấn **Lưu hồ sơ sức khỏe**. Danh sách lựa chọn được lấy từ API. Chức năng gợi ý *dự kiến* loại món có metadata dị ứng/chống chỉ định trùng hồ sơ; không được xem là bộ lọc bảo đảm an toàn y tế.

### 2.3. Nhật ký bữa ăn

1. Mở **Nhật ký bữa ăn**; chọn ngày bằng nút mũi tên. Không chọn ngày tương lai qua nút chuyển ngày của màn hình.
2. Xem tổng calo, mục tiêu calo, thanh tiến độ và ba nhóm chất: **đạm**, **tinh bột**, **chất béo**.
3. Chọn **Thêm bữa ăn** hoặc nút **Thêm** tại từng nhóm bữa ăn.
4. Nhập tên món, calo và tùy chọn protein, carbs, fat; chọn loại bữa (`BREAKFAST`, `LUNCH`, `DINNER`, `SNACK`) và nguồn (`HOME`, `EATING_OUT`, `DELIVERY`).
5. Lưu để gửi dữ liệu qua `logMeal`; sau khi lưu, màn hình gọi lại lịch sử của ngày đang chọn.

**Quy tắc đầu vào:** tên món không được rỗng; calo là số không âm; các chất đa lượng nếu nhập phải là số không âm. Mỗi thao tác thêm món từ giao diện hiện gửi một mục `items` với `quantity: 1` và `unit: "serving"`.

Khi không lấy được mục tiêu calo cá nhân, giao diện Meal Diary sử dụng **2000 kcal** làm mục tiêu tạm tính; đây là giá trị fallback trong giao diện, không phải chỉ định sức khỏe cá nhân.

### 2.4. Thống kê dinh dưỡng

Màn hình **Thống kê dinh dưỡng** cho phép thay đổi ngày, tải lại bằng thao tác refresh, và hiển thị:

- Tổng calo đã nạp, mục tiêu calo, tỷ lệ hoàn thành.
- Tổng protein, carbs và fat so với từng mục tiêu tương ứng.
- Thông báo yêu cầu tạo hồ sơ khi API thống kê trả về `404`.

### 2.5. Gợi ý món ăn

Màn hình **Gợi ý món ăn** hiển thị mục tiêu tham khảo mỗi bữa (calo và các macro), số lượng món được gợi ý, tên món, mô tả nếu có, nguyên liệu, chỉ số dinh dưỡng và điểm phù hợp dinh dưỡng. Có trạng thái danh sách trống và nút thử lại khi lỗi tải dữ liệu.

**Lưu ý:** Gợi ý dinh dưỡng mang tính tham khảo và **không thay thế tư vấn y tế**.

## 3. Cấu trúc kỹ thuật

```text
apps/mobile/
├── src/
│   ├── theme/                           # Token màu sắc, spacing, radius, typography, icon
│   └── screens/
│       ├── meal-diary/
│       │   ├── MealDiaryScreen.tsx
│       │   └── mealDiaryApi.ts           # API client được màn hình import
│       └── nutrition/
│           ├── NutritionProfileScreen.tsx
│           ├── nutritionProfileApi.ts
│           ├── NutritionStatsScreen.tsx
│           ├── nutritionStatsApi.ts
│           ├── SuggestionsScreen.tsx
│           └── suggestionsApi.ts
└── tests/
    └── scrum231/
        ├── registerTs.cjs
        ├── nutritionProfileApi.test.cjs
        ├── nutritionStatsApi.test.cjs
        ├── suggestionsApi.test.cjs
        └── mealDiaryApi.test.cjs
```

- **Công nghệ UI:** React, React Native, Expo và TypeScript.
- **Thiết kế:** các screen sử dụng `SafeAreaView`, `ScrollView`, `StyleSheet` cùng theme của SmartKitchen.
- **Kết nối Backend:** lớp API client dùng `fetch`. `EXPO_PUBLIC_API_BASE_URL` được ưu tiên hơn URL fallback tại các API client đã kiểm tra.
- **Người dùng/phiên đăng nhập:** hồ sơ dinh dưỡng dùng bearer token, kèm `X-User-Id`. Meal Diary/Stats/Suggestions nhận `userId` qua prop của màn hình.

## 4. API và luồng dữ liệu

### 4.1. Nutrition Profile — SCRUM-270

Các phương thức của `createNutritionProfileApi(fallbackBaseUrl, accessToken, userId?)`:

| Hành động | HTTP | Đường dẫn | Payload |
|---|---|---|---|
| Đọc hồ sơ | GET | `/api/nutrition-profile` | Không có |
| Tạo hồ sơ | POST | `/api/nutrition-profile` | `NutritionProfileInput` |
| Cập nhật hồ sơ | PUT | `/api/nutrition-profile` | `NutritionProfileInput` |

**Header gửi theo API client hiện tại:**

```http
Content-Type: application/json
Authorization: Bearer <access-token>
X-User-Id: <uuid-cua-nguoi-dung-dang-dang-nhap>
ngrok-skip-browser-warning: true
```

`X-User-Id` được lấy từ tham số `userId` truyền rõ ràng nếu hợp lệ, hoặc thử đọc các claim `userId`, `user_id`, `sub`, `id` trong JWT. Việc giải mã JWT tại client **không xác minh chữ ký**; Backend phải tự kiểm tra quyền truy cập và không được tin header do client tự gửi.

**Cấu trúc dữ liệu đầu vào:**

```typescript
{
  height: number;           // cm
  weight: number;           // kg
  gender: "MALE" | "FEMALE";
  activityLevel: "SEDENTARY" | "LIGHTLY_ACTIVE" |
                 "MODERATELY_ACTIVE" | "ACTIVE" | "VERY_ACTIVE";
  birthYear: number;        // hoặc age: number, không dùng đồng thời
}
```

**Phản hồi mà client kỳ vọng:** `profile` (gồm id, userId, height, weight, gender, activityLevel, timestamps, age/birthYear nếu có), `bmr` và `tdee`.

**Xử lý lỗi:** client ném `NutritionApiError` khi HTTP không thành công, có `status` và `responseData`; thông báo lấy từ trường `error` hoặc `message` nếu có. Màn hình hiểu `404` khi GET là chưa có hồ sơ để tạo mới; lỗi khác hiển thị thông báo không tải được dữ liệu.

**Lưu ý tích hợp:** đây là hợp đồng theo client đã sửa; cần kiểm tra với route, middleware và schema của Backend trên branch `main` trước khi nghiệm thu tích hợp. Token phải chứa UUID hợp lệ hoặc `App.tsx`/session phải truyền đúng `userId`.

### 4.2. Health Preferences

`createHealthPreferencesApi()` **vẫn sử dụng prefix `/api/nutrition`**, không đổi thành `/api/nutrition-profile`:

| Phương thức | Đường dẫn | Ý nghĩa |
|---|---|---|
| GET | `/api/nutrition/allergies` | Danh mục dị ứng |
| GET | `/api/nutrition/health-conditions` | Danh mục tình trạng sức khỏe |
| GET | `/api/nutrition/user/profile/health` | Lựa chọn đã lưu |
| POST | `/api/nutrition/user/profile/health` | Lưu `{ allergyIds, conditionIds }` |

### 4.3. Meal Diary, Nutrition Stats và Suggestions

| API client | Hàm được UI gọi | Chức năng |
|---|---|---|
| `createMealDiaryApi(apiBaseUrl, userId)` | `getHistory(date)`, `getCalorieGoal()`, `logMeal(payload)` | Lấy lịch sử theo ngày, lấy mục tiêu calo, ghi bữa ăn |
| `createNutritionStatsApi(apiBaseUrl, userId)` | `getDailyStats(date)` | Thống kê theo ngày |
| `createSuggestionsApi(apiBaseUrl, userId)` | `get()` | Mục tiêu mỗi bữa và danh sách gợi ý |

**Chưa ghi đường dẫn HTTP cụ thể cho các client này:** cần đối chiếu code `mealDiaryApi.ts`, `nutritionStatsApi.ts`, `suggestionsApi.ts` và gateway/backend trong repo để tránh đưa endpoint phỏng đoán vào tài liệu chính thức.

## 5. Responsive UI — SCRUM-232

Bốn màn hình đã được cập nhật để dùng bố cục thích ứng bằng `useWindowDimensions()` và style theo kích thước. Những thay đổi trong bản source đã cung cấp bao gồm:

- Nội dung có giới hạn chiều rộng tối đa trên desktop, giữ trọng tâm và không kéo card quá dài.
- Trên màn hình hẹp: giảm padding, xếp dọc các trường nhập và những hàng thông tin dễ bị tràn.
- Meal Diary: bố cục macro/ngày/bữa ăn và modal thêm món thích ứng với màn hình nhỏ hoặc desktop.
- Suggestions: danh sách card có thể hiển thị **hai cột trên desktop rộng**.
- Giữ nguyên theme chung, trạng thái loading/empty/error và các nút tác vụ.

**Checklist kiểm thử thủ công đề xuất:**

- [ ] Kiểm tra chiều rộng viewport 320, 375, 430, 768 và 1280 px.
- [ ] Không tràn ngang, không mất nút, không cắt nội dung quan trọng.
- [ ] Form Nutrition Profile nhập số và lưu bình thường; bàn phím trên mobile không che nút lưu.
- [ ] Modal thêm bữa ăn mở/đóng/lưu được, nội dung cuộn được khi bàn phím hiện.
- [ ] Cả bốn màn hình có trạng thái loading, trống, lỗi và có dữ liệu phù hợp.
- [ ] Text có thể xuống dòng, mục tiêu và progress bar vẫn dễ đọc.

Chạy Expo Web thành công **không thay thế** kiểm tra responsive trực tiếp trên các viewport.

## 6. Cài đặt và chạy local

Chạy ở thư mục gốc repository:

```powershell
pnpm install
```

Tạo hoặc chỉnh file `apps/mobile/.env.local` (không commit):

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://<backend-url-do-nhom-cung-cap>
```

Chạy UI:

```powershell
pnpm --filter mobile web --clear
```

Kiểm tra kiểu dữ liệu:

```powershell
pnpm --filter mobile exec tsc --noEmit
```

**Backend chung:** việc frontend mở được tại `localhost:8081` không bảo đảm API hoạt động. Trước khi kiểm thử tích hợp, truy cập `<backend-url>/health` và kiểm tra phản hồi hợp lệ. Nếu ngrok báo `ERR_NGROK_8012`, agent đang không kết nối được upstream; người chạy Backend cần kiểm tra gateway/service. Không nhập thông tin đăng nhập thật vào dịch vụ chưa được xác minh.

## 7. Unit tests — SCRUM-231

Bộ test tầng **API client** dùng Node.js `node:test`, `assert` và mock `fetch`; không cần database, Docker hoặc Backend thật.

Từ thư mục gốc repository, chạy:

```powershell
pnpm --filter mobile exec node --test tests/scrum231/nutritionProfileApi.test.cjs tests/scrum231/nutritionStatsApi.test.cjs tests/scrum231/suggestionsApi.test.cjs tests/scrum231/mealDiaryApi.test.cjs
```

| Bộ test | Số ca | Nội dung kiểm thử |
|---|---:|---|
| Nutrition Profile | 11 | Route, GET/POST/PUT, header, UUID/JWT, JSON body, 404, response rỗng, env URL, giữ nguyên route Health Preferences |
| Meal Diary | 4 | Methods của client, lịch sử theo ngày, ghi món, lỗi HTTP |
| Nutrition Stats | 2 | Lấy thống kê theo ngày và lỗi HTTP |
| Suggestions | 2 | Nhận danh sách gợi ý/mục tiêu, lỗi HTTP |
| **Tổng** | **19** | **19 PASS, 0 FAIL** (đầu ra Terminal do thành viên báo cáo ngày 17/11/2026) |

Lệnh `pnpm --filter mobile exec tsc --noEmit` cũng được báo cáo chạy thành công, không xuất lỗi trên Terminal cùng ngày.

**Giới hạn:** mock `fetch` chứng minh API client xử lý request/response theo bộ test, **không** xác nhận gateway, xác thực thực tế, lưu database, UI render hoặc kết quả dinh dưỡng đúng với yêu cầu nghiệp vụ.

## 8. Các lỗi thường gặp

| Triệu chứng | Cách kiểm tra / xử lý |
|---|---|
| `Failed to fetch`, không đăng nhập được | Kiểm tra `EXPO_PUBLIC_API_BASE_URL`, `/health`, gateway, ngrok, Network tab |
| `ERR_NGROK_8012` | Ngrok agent không tới được cổng Backend upstream; báo người quản lý Backend |
| Hồ sơ trả `401/403` | Kiểm tra bearer token, phiên đăng nhập và quyền truy cập |
| Lưu hồ sơ lỗi User ID | Kiểm tra `X-User-Id` phải là UUID của người đăng nhập; không dùng UUID cố định/test cho tài khoản khác |
| GET hồ sơ `404` | Có thể chưa tạo hồ sơ; màn hình cho phép tạo mới |
| Stats / Suggestions `404` | Màn hình hướng người dùng tạo Nutrition Profile |
| Unit test fail sau khi sửa API | Đối chiếu các API client đang thực thi với bộ test, không sửa code sản phẩm chỉ để qua test nếu Backend có hợp đồng khác |
| UI tràn hoặc modal khó thao tác | Kiểm tra viewport nhỏ, bàn phím, kích thước chữ, các trường hợp không có dữ liệu |

## 9. Tiêu chí nghiệm thu *đề xuất* cho SCRUM-233

> Jira hiện chưa có Description hoặc Acceptance Criteria, nên danh sách dưới đây là **đề xuất để nhóm xác nhận**, không phải tiêu chí đã được phê duyệt.

- [x] Có tài liệu mô tả chức năng của bốn màn hình Nutrition/Meal Diary.
- [x] Có hướng dẫn sử dụng, cấu trúc mã nguồn, API client và quy tắc đầu vào.
- [x] Có hướng dẫn chạy, unit test, responsive và khắc phục lỗi.
- [x] Phân biệt kiểm thử mock và kiểm thử Backend thật.
- [ ] Nhóm đối chiếu endpoint/backend contract và xác nhận nội dung.
- [ ] Đính kèm/commit tài liệu lên đúng nhánh và tạo Pull Request.
- [ ] Review và chấp thuận trước khi chuyển Jira sang **Done**.

## 10. Liên quan các issue Sprint 4

- **SCRUM-270:** khắc phục đường dẫn `/api/nutrition-profile` và header `X-User-Id`; đã sửa source và có unit tests, chưa xác minh ghi database trên Backend thật.
- **SCRUM-231:** 19 bài unit test API client được báo cáo PASS.
- **SCRUM-232:** đã sửa mã nguồn responsive; còn cần đánh giá trực quan trên các kích thước và trạng thái thực tế.
- **SCRUM-233:** tài liệu phân hệ này; cần nhóm review và đưa vào repository.

---

*Tài liệu không chứa tài khoản, mật khẩu, bearer token hoặc thông tin riêng tư. Khi cập nhật sau review, ưu tiên đối chiếu với mã nguồn tại commit/PR đã merge vào `main`.*
