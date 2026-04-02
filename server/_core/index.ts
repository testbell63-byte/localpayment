import { initTelegramBot } from "../telegramBot.js";

const BOT_TOKEN = "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";

console.log("🚀 Starting Payment Tracker Bot...");

try {
  const bot = initTelegramBot(BOT_TOKEN);
  console.log("✅ Bot started successfully with SQLite!");
} catch (error) {
  console.error("❌ Failed to start bot:", error);
}
