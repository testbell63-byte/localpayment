import "dotenv/config";
import { initTelegramBot } from "../telegramBot";

// Your Telegram Bot Token (already included as fallback in telegramBot.ts)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";

console.log("🚀 Starting Payment Tracker Bot...");

try {
  const bot = initTelegramBot(BOT_TOKEN);
  console.log("✅ Bot is running successfully with SQLite database!");
  console.log("📁 Database file: payment_tracker.db");
  console.log("📊 Daily & Monthly summaries are being tracked automatically.");
} catch (error) {
  console.error("❌ Failed to start the bot:", error);
  process.exit(1);
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down bot...");
  process.exit(0);
});
