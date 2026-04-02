import { initTelegramBot } from "../telegramBot.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";
const db = new Database(path.join(process.cwd(), "payment_tracker.db"));

console.log("🚀 Starting Payment Tracker Bot + Dashboard...");

initTelegramBot(BOT_TOKEN);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, "../public")));

// API endpoint for dashboard
app.get("/api/payments", (req, res) => {
  try {
    const payments = db.prepare("SELECT * FROM payments ORDER BY created_at DESC").all();
    res.json(payments);
  } catch (error) {
    res.json([]); // return empty if no data
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../views/dashboard.ejs"));
});

app.listen(PORT, () => {
  console.log(`✅ Dashboard is live on port ${PORT}`);
  console.log(`🌐 Your dashboard URL: http://localhost:${PORT}`);
});
