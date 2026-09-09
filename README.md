# ProCrush Backend — Kiểm tra giao dịch SePay

API nhỏ giữ `SEPAY_TOKEN` an toàn ở server, cung cấp endpoint để
`index.html` (frontend) tự động kiểm tra xem đã có giao dịch chuyển
khoản Pro Pass hay chưa — mà không lộ token ra trình duyệt.

## 1. Cài đặt

```bash
cd procrush-backend
npm install
```

## 2. Cấu hình token SePay

```bash
cp .env.example .env
```

Mở file `.env`, dán token API thật của SePay vào:

```
SEPAY_TOKEN=token_that_cua_ban
```

> Lấy token tại: my.sepay.vn → Công ty → API Tích hợp.

## 3. Chạy server

```bash
npm start
```

Mặc định chạy ở `http://localhost:3000`.

## 4. Kiểm tra thử

```
GET http://localhost:3000/api/check-sepay-transaction?code=PROCRUSH123456&amount=39000
```

Trả về:
```json
{ "paid": true }
```
hoặc
```json
{ "paid": false }
```

## 5. Kết nối với index.html

Trong file `index.html`, hàm `startAutoCheckSePay()` đang gọi tới:

```js
/api/check-sepay-transaction?code=...&amount=...
```

Nếu backend chạy ở domain/port khác với trang web (ví dụ frontend ở
`localhost:5500`, backend ở `localhost:3000`), cần sửa lại URL trong
`index.html` thành đường dẫn đầy đủ, ví dụ:

```js
const res = await fetch(
    `http://localhost:3000/api/check-sepay-transaction?code=${...}&amount=${...}`
);
```

Khi deploy thật (lên VPS/hosting), nên đặt backend chạy cùng domain
với frontend (qua reverse proxy Nginx) để giữ nguyên đường dẫn tương
đối `/api/...` như hiện tại — không cần sửa gì trong `index.html`.

## 6. Lưu ý bảo mật

- **Không bao giờ** commit file `.env` lên Git (đã có `.gitignore`).
- Khi deploy production, giới hạn `cors()` chỉ cho phép đúng domain
  frontend của bạn, thay vì mở cho tất cả (`app.use(cors())`).
- Cân nhắc thêm rate-limit cho endpoint này để tránh bị dò quét liên tục.
