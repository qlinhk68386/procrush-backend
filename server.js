// ============================================================
//  ProCrush Backend — API kiểm tra giao dịch chuyển khoản SePay
// ============================================================
// Mục đích: giữ SEPAY_TOKEN an toàn ở phía server (KHÔNG bao giờ
// đưa token này vào code frontend/HTML/JS chạy trên trình duyệt).
// Frontend (index.html) chỉ gọi tới API nội bộ này, server mới là
// nơi thực sự gọi sang SePay bằng token bí mật.
//
// Cách chạy:
//   1) npm install
//   2) Tạo file .env (copy từ .env.example) và điền SEPAY_TOKEN thật
//   3) npm start
// ============================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const SEPAY_TOKEN = process.env.SEPAY_TOKEN;

if (!SEPAY_TOKEN) {
    console.error("❌ Thiếu SEPAY_TOKEN trong file .env — server không thể kiểm tra giao dịch.");
    process.exit(1);
}

app.use(cors()); // Khi lên production, nên giới hạn origin cụ thể thay vì cho phép tất cả
app.use(express.json());

// Cache đơn giản trong bộ nhớ để tránh gọi SePay quá dày mỗi khi có
// nhiều người cùng mở modal thanh toán (SePay có thể giới hạn tần suất gọi).
let transactionsCache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 3000; // 3 giây

async function fetchRecentTransactions() {
    const now = Date.now();
    if (transactionsCache.data && now - transactionsCache.fetchedAt < CACHE_TTL_MS) {
        return transactionsCache.data;
    }

    const response = await fetch("https://my.sepay.vn/userapi/transactions/list?limit=20", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${SEPAY_TOKEN}`,
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

/**
 * GET /api/check-sepay-transaction?code=PROCRUSH123456&amount=39000
 *
 * Trả về: { paid: true }  nếu tìm thấy giao dịch tiền vào (in) khớp:
 *   - Nội dung chuyển khoản CÓ CHỨA mã đơn hàng (code)
 *   - Số tiền giao dịch >= amount yêu cầu
 * Ngược lại trả về: { paid: false }
 */
app.get("/api/check-sepay-transaction", async (req, res) => {
    try {
        const { code, amount } = req.query;

        if (!code || !amount) {
            return res.status(400).json({ error: "Thiếu tham số 'code' hoặc 'amount'." });
        }

        const requiredAmount = parseInt(amount, 10);
        if (Number.isNaN(requiredAmount)) {
            return res.status(400).json({ error: "'amount' không hợp lệ." });
        }

        const data = await fetchRecentTransactions();
        const transactions = data?.transactions || [];

        const matched = transactions.some((tx) => {
            const content = (tx.transaction_content || tx.content || "").toUpperCase();
            const amountIn = parseInt(tx.amount_in || tx.amountIn || "0", 10);
            return content.includes(String(code).toUpperCase()) && amountIn >= requiredAmount;
        });

        return res.json({ paid: matched });
    } catch (err) {
        console.error("Lỗi khi kiểm tra giao dịch SePay:", err.message);
        return res.status(500).json({ error: "Không thể kiểm tra giao dịch lúc này, thử lại sau." });
    }
});

app.get("/", (req, res) => {
    res.send("ProCrush Backend đang chạy. Dùng GET /api/check-sepay-transaction?code=...&amount=...");
});

app.listen(PORT, () => {
    console.log(`✅ ProCrush Backend đang chạy tại http://localhost:${PORT}`);
});
