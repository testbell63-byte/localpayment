import TelegramBot from "node-telegram-bot-api";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "payment_tracker.db");
const db = new Database(DB_PATH);

const BOT_TOKEN = "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";

export function initTelegramBot(token = BOT_TOKEN) {
  const bot = new TelegramBot(token, { polling: true });

  console.log("[Bot] Simple Step-by-Step Bot Started");

  const userState = new Map(); // chatId → state

  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";

    userState.set(chatId, {
      step: "amount",
      employeeName,
      selectedGames: []
    });

    await bot.sendMessage(chatId, 
      `📸 Screenshot received from ${employeeName}\n\n` +
      `Step 1: How much amount was received?`,
      { reply_to_message_id: msg.message_id }
    );
  });

  bot.on("text", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || "";
    const state = userState.get(chatId);

    if (!state) return;

    if (state.step === "amount") {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(chatId, "❌ Please send a valid number for amount.");
        return;
      }

      state.amount = amount;
      state.step = "game";

      await bot.sendMessage(chatId, 
        `Amount saved: $${amount}\n\n` +
        `Step 2: Select game(s)\n\n` +
        `FK, JW, GV, Orion, MW, FunStation, VS, PM, CM, UP, Monstor, Other`,
        { reply_to_message_id: msg.message_id }
      );
    } 
    else if (state.step === "game") {
      const game = text.toUpperCase();
      state.game = game;

      state.step = "points";

      await bot.sendMessage(chatId, 
        `Game selected: ${game}\n\n` +
        `Step 3: How many points were loaded?`,
        { reply_to_message_id: msg.message_id }
      );
    } 
    else if (state.step === "points") {
      const points = parseInt(text);
      if (isNaN(points) || points <= 0) {
        await bot.sendMessage(chatId, "❌ Please send a valid number for points.");
        return;
      }

      const now = new Date();
      const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

      // Save to database
      db.prepare(`
        INSERT INTO payments (date, time, day, employee, amount, game, points)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        now.toISOString().split("T")[0],
        now.toLocaleTimeString(),
        days[now.getDay()],
        state.employeeName,
        state.amount,
        state.game,
        points
      );

      await bot.sendMessage(chatId, 
        `✅ Record saved successfully!\n\n` +
        `Amount: $${state.amount}\n` +
        `Game: ${state.game}\n` +
        `Points: ${points}\n\n` +
        `Refresh your dashboard to see the update.`,
        { reply_to_message_id: msg.message_id }
      );

      userState.delete(chatId);
    }
  });

  bot.onText(/\/start|\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id, 
      "👋 Simple Payment Tracker Bot\n\n" +
      "1. Send a screenshot\n" +
      "2. Enter amount\n" +
      "3. Enter game name\n" +
      "4. Enter points\n\n" +
      "Data will appear in the dashboard."
    );
  });

  console.log("[Bot] Ready - Send a screenshot to start");
  return bot;
}
