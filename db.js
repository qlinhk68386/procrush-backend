// ============================================================
//  db.js — Khởi tạo database SQLite (file, không cần cài server DB)
// ============================================================
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "procrush.db"));
db.pragma("journal_mode = WAL");

// Bảng người dùng
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_pro        INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Bảng đơn hàng thanh toán Pro Pass
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    code        TEXT NOT NULL UNIQUE,
    amount      INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'paid'
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at     TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

module.exports = db;
