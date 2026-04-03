import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

const RECORDS_FILE = path.join(process.cwd(), "records.csv");

if (!fs.existsSync(RECORDS_FILE)) {
  fs.writeFileSync(RECORDS_FILE, "Date,Time,Day,Employee,Amount,Game,Points\n");
}

const REPORT_GROUP_ID = -1003718366443;

// Correct Central Time (handles CST/CDT automatically)
function getCST() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "long"
  });
  const parts = formatter.formatToParts(new Date());
  const date = `${parts.find(p => p.type === "year").value}-${parts.find(p => p.type === "month").value}-${parts.find(p => p.type === "day").value}`;
  const time = `${parts.find(p => p.type === "hour").value}:${parts.find(p => p.type === "minute").value} ${parts.find(p => p.type === "dayPeriod").value}`;
  const day = parts.find(p => p.type === "weekday").value;
  return { date, time, day };
}

export function initTelegramBot(token: string, baseUrl: string): TelegramBot {
  const bot = new TelegramBot(token);

  console.log("[Bot] Webhook mode active - Report group:", REPORT_GROUP_ID);

  const userState = new Map<any, any>();

  const numberKeyboard = { /* unchanged */ 
    reply_markup: {
      inline_keyboard: [
        [{ text: "1", callback_data: "num_1" }, { text: "2", callback_data: "num_2" }, { text: "3", callback_data: "num_3" }],
        [{ text: "4", callback_data: "num_4" }, { text: "5", callback_data: "num_5" }, { text: "6", callback_data: "num_6" }],
        [{ text: "7", callback_data: "num_7" }, { text: "8", callback_data: "num_8" }, { text: "9", callback_data: "num_9" }],
        [{ text: "0", callback_data: "num_0" }, { text: ".", callback_data: "num_dot" }],
        [{ text: "⬅️ Back", callback_data: "num_back" }, { text: "✅ Done", callback_data: "num_done" }]
      ]
    }
  };

  const gameKeyboard = { /* unchanged */ 
    reply_markup: {
      inline_keyboard: [
        [{ text: "FK", callback_data: "game_FK" }],
        [{ text: "JW", callback_data: "game_JW" }],
        [{ text: "GV", callback_data: "game_GV" }],
        [{ text: "Orion", callback_data: "game_Orion" }],
        [{ text: "MW", callback_data: "game_MW" }],
        [{ text: "FunStation", callback_data: "game_FunStation" }],
        [{ text: "VS", callback_data: "game_VS" }],
        [{ text: "PM", callback_data: "game_PM" }],
        [{ text: "CM", callback_data: "game_CM" }],
        [{ text: "UP", callback_data: "game_UP" }],
        [{ text: "Monstor", callback_data: "game_Monstor" }],
        [{ text: "Other", callback_data: "game_Other" }],
        [{ text: "✅ Done", callback_data: "game_done" }]
      ]
    }
  };

  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";

    userState.set(chatId, {
      step: "amount",
      amountInput: "",
      employeeName,
      selectedGames: [],
      records: [],
      originalMessageId: msg.message_id,
      originalChatId: chatId
    });

    await bot.sendMessage(chatId, `📸 Screenshot received from ${employeeName}\n\nEnter the deposited amount:`, numberKeyboard);
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);
    if (!state) return;

    // ... (numeric keypad and game selection logic remains the same as last version) ...

    if (state.step === "final_confirm" && data === "confirm_yes") {
      for (const r of state.records) {
        const row = `${r.date},${r.time},${r.day},"${r.employee}",${r.amount},"${r.game}",${r.points}\n`;
        fs.appendFileSync(RECORDS_FILE, row);
      }

      let successMsg = `✅ **Payment Record**\n\n`;
      successMsg += `**Amount Received:** $${state.amount}\n\n`;
      successMsg += `**Games & Points:**\n`;
      state.records.forEach((r: any, i: number) => {
        successMsg += `${i+1}. ${r.game}: ${r.points} points\n`;
      });
      successMsg += `\n📅 ${state.records[0].date} | ${state.records[0].day} | ${state.records[0].time}`;

      // Send to report group
      try {
        await bot.sendMessage(REPORT_GROUP_ID, successMsg);
        await bot.forwardMessage(REPORT_GROUP_ID, state.originalChatId, state.originalMessageId);
      } catch (e) {}

      // BRIGHT BLUE SUMMARY IN MAIN GROUP
      const blueSummary = `✅ **Transaction Confirmed!**\n\n` +
        `**Amount:** $${state.amount}\n\n` +
        `**Games & Points:**\n` +
        state.records.map((r: any, i: number) => `${i+1}. ${r.game}: ${r.points} points`).join("\n") +
        `\n\n📅 ${state.records[0].date} | ${state.records[0].day} | ${state.records[0].time}`;

      await bot.sendMessage(chatId, blueSummary, { parse_mode: "Markdown" });

      await bot.sendMessage(chatId, "✅ **Thank you for confirming!**");

      userState.delete(chatId);
    }

    if (state.step === "final_confirm" && data === "confirm_no") {
      await bot.sendMessage(chatId, "❌ **Cancelled.** Please post the picture again.");
      userState.delete(chatId);
    }

    await bot.answerCallbackQuery(query.id);
  });

  // ... (rest of the code - custom game, help, webhook) remains the same ...

  const webhookPath = `/bot${token}`;
  bot.setWebHook(baseUrl + webhookPath)
    .then(() => console.log("✅ Webhook set successfully"))
    .catch(err => console.error("Webhook failed:", err));

  console.log("[Bot] Ready (Webhook mode)");
  return bot;
}
