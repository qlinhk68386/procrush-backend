# ProCrush Backend — Tài khoản (Database) + Tự động kích hoạt Pro

Backend này khắc phục 3 lỗi chính của phiên bản cũ:

| Lỗi cũ | Nguyên nhân | Cách khắc phục |
|---|---|---|
| Máy này đăng ký, máy khác không đăng nhập được | Tài khoản lưu trong `localStorage` của từng trình duyệt | Lưu vào **database SQLite trên server** |
| Chuyển khoản rồi không lên Pro / lúc được lúc không | Mã đơn sinh ngẫu nhiên ở trình duyệt, mất khi tải lại trang; trạng thái Pro chỉ nằm ở máy đó | Đơn hàng **lưu trong DB**, trạng thái Pro gắn với tài khoản |
| Token SePay lộ trong code HTML | Gọi thẳng SePay từ trình duyệt | Token chỉ nằm ở **server** (biến môi trường) |

---

## 1. Cài đặt

```bash
cd procrush-backend
npm install
```

## 2. Cấu hình

```bash
cp .env.example .env
```

Mở `.env` và điền:

```
SEPAY_TOKEN=token_that_lay_tai_my.sepay.vn
JWT_SECRET=mot_chuoi_bi_mat_that_dai_va_ngau_nhien
PRO_PASS_AMOUNT=39000
PORT=3000
```

> Lấy token: my.sepay.vn → Công ty → API Tích hợp.
> `JWT_SECRET` anh tự đặt, càng dài càng ngẫu nhiên càng tốt.

## 3. Chạy

```bash
npm start
```

Lần chạy đầu tiên sẽ tự tạo file `procrush.db` (database) — không cần cài MySQL hay gì thêm.

---

## 4. Danh sách API

| Method | Đường dẫn | Chức năng |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký (trả về token + thông tin user) |
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/forgot-password` | Đặt lại mật khẩu |
| GET | `/api/auth/me` | Lấy thông tin user hiện tại (gồm `isPro`) |
| POST | `/api/payment/create-order` | Tạo/lấy đơn hàng đang chờ thanh toán |
| GET | `/api/payment/status?code=...` | Kiểm tra đã thanh toán chưa, tự kích hoạt Pro |

Các API có dấu 🔒 (`/me`, `/payment/*`) cần header:
```
Authorization: Bearer <token>
```

---

## 5. Cấu trúc database

**Bảng `users`**: `id`, `full_name`, `email` (unique), `password_hash` (bcrypt), `is_pro`, `created_at`

**Bảng `orders`**: `id`, `user_id`, `code` (mã chuyển khoản), `amount`, `status` (`pending`/`paid`), `created_at`, `paid_at`

---

## 6. Luồng thanh toán tự động

1. Người dùng **đăng nhập** → bấm "Kích hoạt Pro".
2. Frontend gọi `/api/payment/create-order` → server tạo mã đơn (VD `PROCRUSH483920`) **lưu vào DB**, gắn với tài khoản đó.
3. QR hiện ra với đúng số tiền + nội dung là mã đơn.
4. Cứ 4 giây frontend hỏi `/api/payment/status?code=...`.
5. Server gọi SePay, so khớp **nội dung chuyển khoản chứa mã đơn** + **số tiền ≥ 39.000đ**.
6. Khớp → server ghi `orders.status = 'paid'` và `users.is_pro = 1`, trả về `{ paid: true }`.
7. Frontend hiện thông báo và mở khóa Pro ngay.

Vì trạng thái Pro nằm trong DB nên: tải lại trang vẫn Pro, đăng nhập máy khác vẫn Pro, đóng modal giữa chừng rồi mở lại vẫn dùng **cùng mã đơn cũ** (không lệch tiền).

---

## 7. Kết nối với `index.html`

Trong `index.html`, dòng đầu phần `<script>` có:

```js
const API_BASE = "https://procrush-backend.onrender.com";
```

- Test ở máy local: đổi thành `"http://localhost:3000"`.
- Deploy thật: đổi thành domain backend của anh.

---

## 8. Lưu ý khi deploy

- **Không commit `.env`** lên Git (đã có `.gitignore`).
- Nếu deploy lên Render/Railway gói free, server sẽ "ngủ" khi không có ai truy cập, lần gọi đầu mất ~30-50 giây để thức dậy. Đây chính là lý do trước đây "lúc lên Pro được lúc không". Cách xử lý: dùng gói trả phí, hoặc dùng dịch vụ ping định kỳ (UptimeRobot) để giữ server luôn thức.
- Với Render, **phải gắn Persistent Disk** cho file `procrush.db`, nếu không mỗi lần deploy lại sẽ mất sạch database. Nếu không muốn dùng disk, cân nhắc chuyển sang Postgres (Render có gói free).
- Production nên sửa `app.use(cors())` thành chỉ cho phép đúng domain frontend:
  ```js
  app.use(cors({ origin: "https://domain-cua-ban.com" }));
  ```
