import "dotenv/config";
import { initTelegramBot } from "../telegramBot.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";

console.log("🚀 Starting Payment Tracker Bot...");

try {
  const bot = initTelegramBot(BOT_TOKEN);
  console.log("✅ Bot is running successfully with SQLite database!");
  console.log("📁 Database: payment_tracker.db");
  console.log("📊 Daily & Monthly summaries are active.");
} catch (error) {
  console.error("❌ Failed to start bot:", error);
  process.exit(1);
}
