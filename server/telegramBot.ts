import TelegramBot from "node-telegram-bot-api";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "payment_tracker.db");
const db = new Database(DB_PATH);

const BOT_TOKEN = "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";

export function initTelegramBot(token = BOT_TOKEN) {
  const bot = new TelegramBot(token, { polling: true });

  console.log("[Bot] Telegram Bot Started - Ready to receive screenshots");

  // Simple photo handler for testing
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";

    const now = new Date();
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

    // Save a test record
    db.prepare(`
      INSERT INTO payments (date, time, day, employee, amount, game, points)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      now.toISOString().split("T")[0],
      now.toLocaleTimeString(),
      days[now.getDay()],
      employeeName,
      100.00,           // test amount
      "FK",             // test game
      120               // test points
    );

    await bot.sendMessage(chatId, 
      `✅ Screenshot received from ${employeeName}\n\n` +
      `Test record saved!\n` +
      `Amount: $100\nGame: FK\nPoints: 120\n\n` +
      `Refresh the dashboard to see it.`
    );
  });

  bot.onText(/\/start|\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id, 
      "👋 Payment Tracker Bot\n\nSend any screenshot to test.\n\nData will appear in the dashboard."
    );
  });

  console.log("[Bot] Ready - Send a screenshot to test saving");
  return bot;
}
