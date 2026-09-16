const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jwt-simple');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'procrush_secret_key_2026';
const SEPAY_TOKEN = process.env.SEPAY_TOKEN;

// 1. Khởi tạo Database SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error("Lỗi mở DB:", err.message);
    else console.log("✅ Đã kết nối CSDDL SQLite.");
});

// Tạo bảng users và orders
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT,
        email TEXT UNIQUE,
        password TEXT,
        isPro INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        email TEXT,
        amount INTEGER,
        status TEXT DEFAULT 'PENDING',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Middleware xác thực Token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Thất bại xác thực tài khoản" });

    try {
        const decoded = jwt.decode(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(403).json({ error: "Token không hợp lệ" });
    }
}

// 2. API Đăng Ký Tài Khoản
app.post('/api/auth/register', (req, res) => {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) return res.status(400).json({ error: "Vui lòng điền đủ thông tin" });

    const hashedPassword = bcrypt.hashSync(password, 10);
    const sql = `INSERT INTO users (fullName, email, password) VALUES (?, ?, ?)`;
    
    db.run(sql, [fullName, email, hashedPassword], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: "Email này đã có tài khoản!" });
            return res.status(500).json({ error: err.message });
        }
        const token = jwt.encode({ id: this.lastID, email }, JWT_SECRET);
        res.json({ token, user: { fullName, email, isPro: false } });
    });
});

// 3. API Đăng Nhập
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const sql = `SELECT * FROM users WHERE email = ?`;

    db.get(sql, [email], (err, user) => {
        if (err || !user) return res.status(400).json({ error: "Email này chưa có tài khoản!" });

        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ error: "Mật khẩu không chính xác" });
        }

        const token = jwt.encode({ id: user.id, email: user.email }, JWT_SECRET);
        res.json({
            token,
            user: {
                fullName: user.fullName,
                email: user.email,
                isPro: user.isPro === 1
            }
        });
    });
});

// 4. API Quên mật khẩu
app.post('/api/auth/forgot-password', (req, res) => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ error: "Thiếu thông tin" });

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.run(`UPDATE users SET password = ? WHERE email = ?`, [hashedPassword, email], function(err) {
        if (err || this.changes === 0) return res.status(400).json({ error: "Email không tồn tại trên hệ thống" });
        res.json({ message: "Cập nhật mật khẩu thành công" });
    });
});

// 5. API Lấy thông tin User hiện tại
app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get(`SELECT fullName, email, isPro FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: "Không tìm thấy người dùng" });
        res.json({ user: { ...user, isPro: user.isPro === 1 } });
    });
});

// 6. API Tạo đơn hàng thanh toán
app.post('/api/payment/create-order', authenticateToken, (req, res) => {
    db.get(`SELECT isPro FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (user && user.isPro === 1) return res.json({ alreadyPro: true });

        const code = "PROCRUSH" + Math.floor(100000 + Math.random() * 900000);
        const amount = parseInt(process.env.PRO_PASS_AMOUNT) || 39000;
        const email = req.user.email;

        db.run(`INSERT INTO orders (code, email, amount) VALUES (?, ?, ?)`, [code, email, amount], function(err) {
            if (err) return res.status(500).json({ error: "Không thể khởi tạo mã đơn hàng" });
            res.json({ code, amount });
        });
    });
});

// 7. API Kiểm tra trạng thái thanh toán từ SePay
app.get('/api/payment/status', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const { code } = req.query;

    if (!code) return res.status(400).json({ paid: false });

    db.get(`SELECT * FROM orders WHERE code = ?`, [code], async (err, order) => {
        if (order && order.status === 'COMPLETED') {
            return res.json({ paid: true });
        }

        try {
            const response = await axios.get(`https://my.sepay.vn/userapi/transactions/list`, {
                headers: { 'Authorization': `Bearer ${SEPAY_TOKEN}` },
                params: { limit: 20 }
            });

            const transactions = response.data.transactions || [];
            const isMatch = transactions.some(t => {
                const content = (t.transaction_content || "").replace(/\s+/g, '').toUpperCase();
                const inAmount = parseFloat(t.amount_in || 0);
                return content.includes(code.toUpperCase()) && inAmount >= 39000;
            });

            if (isMatch) {
                db.run(`UPDATE orders SET status = 'COMPLETED' WHERE code = ?`, [code]);
                if (order && order.email) {
                    db.run(`UPDATE users SET isPro = 1 WHERE email = ?`, [order.email]);
                }
                return res.json({ paid: true });
            }

            return res.json({ paid: false });
        } catch (error) {
            return res.json({ paid: false });
        }
    });
});

app.listen(PORT, () => console.log(`✅ Server ProCrush Backend đang chạy tại cổng ${PORT}`));
