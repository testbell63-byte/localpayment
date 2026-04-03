import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

const RECORDS_FILE = path.join(process.cwd(), "records.csv");
const REPORT_GROUP_ID = -1003718366443;

if (!fs.existsSync(RECORDS_FILE)) {
  fs.writeFileSync(RECORDS_FILE, "Date,Time,Day,Group,Employee,Amount,Game,Points\n");
}

export function initTelegramBot(token: string): TelegramBot {
  const bot = new TelegramBot(token, { polling: true });

  console.log("[Bot] Minimal Test Version Started - Single Report Group");

  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const groupName = msg.chat.title || "Unknown Group";
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";

    console.log(`[Bot] Photo received from group: ${groupName} (${chatId})`);

    try {
      await bot.sendMessage(chatId, 
        `✅ Screenshot received from ${employeeName} (${groupName})\n\n` +
        `Step 1: How much amount was received?`, 
        { reply_to_message_id: msg.message_id }
      );
      console.log("[Bot] Reply sent successfully");
    } catch (err) {
      console.error("[Bot] Error sending reply:", err);
    }
  });

  bot.on("text", async (msg) => {
    console.log(`[Bot] Text received: ${msg.text}`);
  });

  bot.on("callback_query", async (query) => {
    console.log(`[Bot] Callback received: ${query.data}`);
    await bot.answerCallbackQuery(query.id);
  });

  bot.onText(/\/start|\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id, "👋 Bot is working. Send a screenshot to test.");
  });

  console.log("[Bot] Ready - Testing photo handler");
  return bot;
}
