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

// Express app
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, "../public")));

// API to get payments
app.get("/api/payments", (req, res) => {
  try {
    const payments = db.prepare("SELECT * FROM payments ORDER BY created_at DESC").all();
    res.json(payments);
  } catch (err) {
    res.json([]); // return empty array if table doesn't exist yet
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Dashboard running on port ${PORT}`);
});
