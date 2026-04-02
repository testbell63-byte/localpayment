import TelegramBot from "node-telegram-bot-api";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "payment_tracker.db");
const db = new Database(DB_PATH);

export function initTelegramBot(token) {
  const bot = new TelegramBot(token, { polling: true });

  console.log("[Bot] Minimal Bot Started");

  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const employee = msg.from?.first_name || "Unknown";

    await bot.sendMessage(chatId, 
      `📸 Screenshot received from ${employee}\n\n` +
      `Step 1: How much amount was received? (e.g. 125.50)`
    );
  });

  bot.on("text", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // Simple save for testing
    const now = new Date();
    db.prepare(`
      INSERT INTO payments (date, time, day, employee, amount, game, points)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      now.toISOString().split("T")[0],
      now.toLocaleTimeString(),
      "Monday", 
      "Test User",
      parseFloat(text) || 100,
      "FK",
      120
    );

    await bot.sendMessage(chatId, `✅ Saved test record!\nRefresh dashboard to see it.`);
  });

  bot.onText(/\/start|\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, "Send a screenshot to start.");
  });

  return bot;
}
