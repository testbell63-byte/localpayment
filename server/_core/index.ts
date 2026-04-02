import { initTelegramBot } from "../telegramBot.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";
const DB_PATH = path.join(process.cwd(), "payment_tracker.db");
const db = new Database(DB_PATH);

console.log("🚀 Starting Payment Tracker Bot + Dashboard...");

// Start Telegram Bot
initTelegramBot(BOT_TOKEN);

// Start Express Dashboard
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, "../public")));

// API Routes
app.get("/api/data", (req, res) => {
  try {
    const payments = db.prepare("SELECT * FROM payments ORDER BY created_at DESC").all();
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Dashboard listening on port ${PORT}`);
  console.log(`🌐 Public URL: http://localhost:${PORT}`);
});
