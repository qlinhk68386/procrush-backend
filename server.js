// ============================================================
//  ProCrush Backend — API tài khoản (database thật) + thanh toán
//  tự động qua SePay
// ============================================================
// - Tài khoản lưu trong SQLite (file procrush.db) => đăng ký ở máy
//   nào, đăng nhập ở máy khác vẫn thấy, vì dữ liệu nằm trên server
//   chứ không phải localStorage của từng trình duyệt.
// - Mật khẩu được băm bằng bcrypt, KHÔNG lưu dạng chữ thường.
// - SEPAY_TOKEN chỉ nằm ở server (biến môi trường), không lộ ra
//   frontend.
// ============================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const SEPAY_TOKEN = process.env.SEPAY_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET;
const PRO_PASS_AMOUNT = parseInt(process.env.PRO_PASS_AMOUNT || "39000", 10);

if (!SEPAY_TOKEN) {
    console.error("❌ Thiếu SEPAY_TOKEN trong file .env");
    process.exit(1);
}
if (!JWT_SECRET) {
    console.error("❌ Thiếu JWT_SECRET trong file .env (dùng để ký token đăng nhập)");
    process.exit(1);
}

app.use(cors()); // Production: nên giới hạn origin đúng domain frontend của bạn
app.use(express.json());

// ------------------------------------------------------------
// Middleware xác thực người dùng qua JWT (Authorization: Bearer <token>)
// ------------------------------------------------------------
function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Chưa đăng nhập." });

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.userId;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    }
}

function publicUser(row) {
    return {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        isPro: !!row.is_pro
    };
}

// ============================================================
//  AUTH: Đăng ký / Đăng nhập / Quên mật khẩu / Thông tin hiện tại
// ============================================================

app.post("/api/auth/register", async (req, res) => {
    try {
        const { fullName, email, password } = req.body || {};

        if (!fullName || !email || !password) {
            return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin đăng ký." });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: "Email không đúng định dạng." });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: "Mật khẩu phải có ít nhất 6 ký tự." });
        }

        const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
        if (existing) {
            return res.status(409).json({ error: "Email này đã có tài khoản. Vui lòng đăng nhập." });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const info = db
            .prepare("INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)")
            .run(fullName.trim(), email.toLowerCase(), passwordHash);

        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });

        res.json({ token, user: publicUser(user) });
    } catch (err) {
        console.error("Lỗi đăng ký:", err);
        res.status(500).json({ error: "Lỗi máy chủ, vui lòng thử lại." });
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: "Vui lòng nhập đầy đủ Email và Mật khẩu." });
        }

        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
        if (!user) {
            return res.status(404).json({ error: "Email này chưa có tài khoản." });
        }

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            return res.status(401).json({ error: "Mật khẩu không chính xác." });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
        res.json({ token, user: publicUser(user) });
    } catch (err) {
        console.error("Lỗi đăng nhập:", err);
        res.status(500).json({ error: "Lỗi máy chủ, vui lòng thử lại." });
    }
});

app.post("/api/auth/forgot-password", async (req, res) => {
    try {
        const { email, newPassword } = req.body || {};
        if (!email || !newPassword) {
            return res.status(400).json({ error: "Vui lòng điền đầy đủ Email và Mật khẩu mới." });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: "Mật khẩu mới phải có ít nhất 6 ký tự." });
        }

        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
        if (!user) {
            return res.status(404).json({ error: "Email này chưa được đăng ký trong hệ thống." });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);

        res.json({ message: "Khôi phục mật khẩu thành công." });
    } catch (err) {
        console.error("Lỗi quên mật khẩu:", err);
        res.status(500).json({ error: "Lỗi máy chủ, vui lòng thử lại." });
    }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);
    if (!user) return res.status(404).json({ error: "Không tìm thấy người dùng." });
    res.json({ user: publicUser(user) });
});

// ============================================================
//  THANH TOÁN: Tạo đơn hàng + tự động kiểm tra & kích hoạt Pro
// ============================================================

function generateOrderCode() {
    return "PROCRUSH" + Math.floor(100000 + Math.random() * 900000);
}

// Tạo (hoặc tái sử dụng) đơn hàng đang chờ thanh toán cho user hiện tại
app.post("/api/payment/create-order", requireAuth, (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);
    if (!user) return res.status(404).json({ error: "Không tìm thấy người dùng." });

    if (user.is_pro) {
        return res.json({ alreadyPro: true });
    }

    // Nếu đã có đơn "pending" trong vòng 1 giờ gần nhất -> dùng lại, tránh
    // sinh ra hàng loạt mã đơn rác mỗi lần người dùng mở/đóng modal.
    let order = db
        .prepare(
            `SELECT * FROM orders
             WHERE user_id = ? AND status = 'pending'
               AND datetime(created_at) > datetime('now', '-1 hour')
             ORDER BY id DESC LIMIT 1`
        )
        .get(user.id);

    if (!order) {
        const code = generateOrderCode();
        const info = db
            .prepare("INSERT INTO orders (user_id, code, amount) VALUES (?, ?, ?)")
            .run(user.id, code, PRO_PASS_AMOUNT);
        order = db.prepare("SELECT * FROM orders WHERE id = ?").get(info.lastInsertRowid);
    }

    res.json({ code: order.code, amount: order.amount });
});

// Cache giao dịch SePay trong bộ nhớ để tránh gọi API quá dày khi nhiều
// người cùng chờ thanh toán một lúc.
let transactionsCache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 3000;

async function fetchRecentTransactions() {
    const now = Date.now();
    if (transactionsCache.data && now - transactionsCache.fetchedAt < CACHE_TTL_MS) {
        return transactionsCache.data;
    }

    const response = await fetch("https://my.sepay.vn/userapi/transactions/list?limit=20", {
        method: "GET",
        headers: {
            Authorization: `Bearer ${SEPAY_TOKEN}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        throw new Error(`SePay trả về lỗi HTTP ${response.status}`);
    }

    const json = await response.json();
    transactionsCache = { data: json, fetchedAt: now };
    return json;
}

// So khớp linh hoạt: bỏ khoảng trắng/ký tự đặc biệt, không phân biệt hoa
// thường, và chấp nhận số tiền >= số tiền yêu cầu (phòng khi người chuyển
// dư ra hoặc ngân hàng cộng thêm phí).
function normalize(str) {
    return (str || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

app.get("/api/payment/status", requireAuth, async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) return res.status(400).json({ error: "Thiếu tham số 'code'." });

        const order = db
            .prepare("SELECT * FROM orders WHERE code = ? AND user_id = ?")
            .get(code, req.userId);

        if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });

        // Đã ghi nhận thanh toán từ trước (kể cả lần quét trước) -> trả về ngay,
        // không cần gọi lại SePay. Việc này giúp trạng thái Pro luôn nhất quán
        // dù người dùng tải lại trang hay đổi thiết bị.
        if (order.status === "paid") {
            return res.json({ paid: true, isPro: true });
        }

        const data = await fetchRecentTransactions();
        const transactions = data?.transactions || [];
        const targetCode = normalize(order.code);

        const matched = transactions.some((tx) => {
            const content = normalize(tx.transaction_content || tx.content || "");
            const amountIn = parseInt(tx.amount_in || tx.amountIn || "0", 10);
            return content.includes(targetCode) && amountIn >= order.amount;
        });

        if (matched) {
            const tx = db.transaction(() => {
                db.prepare("UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(order.id);
                db.prepare("UPDATE users SET is_pro = 1 WHERE id = ?").run(order.user_id);
            });
            tx();
            return res.json({ paid: true, isPro: true });
        }

        res.json({ paid: false, isPro: false });
    } catch (err) {
        console.error("Lỗi kiểm tra thanh toán:", err.message);
        // Không để lỗi tạm thời (SePay chậm/mất kết nối) làm hỏng trải nghiệm —
        // trả về paid:false, frontend sẽ tự thử lại ở lượt quét kế tiếp.
        res.status(200).json({ paid: false, isPro: false, warning: "Không thể kiểm tra ngay lúc này, sẽ thử lại." });
    }
});

app.get("/", (req, res) => {
    res.send("ProCrush Backend (có database) đang chạy.");
});

app.listen(PORT, () => {
    console.log(`✅ ProCrush Backend đang chạy tại http://localhost:${PORT}`);
});
