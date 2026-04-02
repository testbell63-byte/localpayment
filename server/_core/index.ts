import { initTelegramBot } from "../telegramBot.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";

console.log("🚀 Starting Payment Tracker Bot...");

try {
  const bot = initTelegramBot(BOT_TOKEN);
  console.log("✅ Telegram Bot started successfully");
} catch (error) {
  console.error("❌ Bot failed to start:", error);
}

// Simple Dashboard
const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send(`
    <h1 style="text-align:center; margin-top:100px; font-family:sans-serif; color:#10b981;">
      💰 Payment Tracker Dashboard<br><br>
      <small style="color:#666">Send a screenshot to the Telegram bot to see data here</small>
    </h1>
  `);
});

app.listen(PORT, () => {
  console.log(`✅ Dashboard running on port ${PORT}`);
});
