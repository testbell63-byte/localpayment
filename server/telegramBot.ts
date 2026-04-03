import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

const RECORDS_FILE = path.join(process.cwd(), "records.csv");
const REPORT_GROUP_ID = -1003718366443;   // ← Your single report group

if (!fs.existsSync(RECORDS_FILE)) {
  fs.writeFileSync(RECORDS_FILE, "Date,Time,Day,Group,Employee,Amount,Game,Points\n");
}

export function initTelegramBot(token: string): TelegramBot {
  const bot = new TelegramBot(token, { polling: true });

  console.log("[Bot] Universal Multi-Group Mode Started");

  const userState = new Map();

  // Photo received from any group
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const groupName = msg.chat.title || "Unknown Group";
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";

    userState.set(chatId, {
      step: "amount",
      employeeName,
      groupName,
      originalMessageId: msg.message_id,
      amountInput: ""
    });

    await bot.sendMessage(chatId,
      `📸 Screenshot received from ${employeeName} (${groupName})\n\nEnter the deposited amount:`,
      { reply_to_message_id: msg.message_id }
    );
  });

  // Callback Query Handler (numpad + games + confirmation)
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);
    if (!state) return;

    // Numpad logic
    if (data.startsWith("num_")) {
      const action = data.replace("num_", "");
      if (action === "back") {
        state.amountInput = (state.amountInput || "").slice(0, -1);
      } else if (action === "dot") {
        if (!state.amountInput.includes(".")) state.amountInput += ".";
      } else {
        state.amountInput = (state.amountInput || "") + action;
      }

      const displayText = `💰 Enter Amount:\n\n${state.amountInput || "0"}`;
      await bot.editMessageText(displayText, {
        chat_id: chatId,
        message_id: query.message!.message_id,
        reply_markup: numberKeyboard.reply_markup
      }).catch(() => {});

      await bot.answerCallbackQuery(query.id);
      return;
    }

    // Game selection and final logic (kept from your current code)
    // ... (your existing game and confirmation logic)

    if (state.step === "final_confirm" && data === "confirm_yes") {
      const now = new Date();
      const cstTime = new Date(now.getTime() - 5 * 60 * 60 * 1000);

      let summaryText = `✅ **Payment Record**\n\n**Group:** ${state.groupName}\n**Employee:** ${state.employeeName}\n**Amount:** $${state.amount}\n\n**Games & Points:**\n`;

      for (const r of state.records || []) {
        const row = `${cstTime.toISOString().split('T')[0]},${cstTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })},${cstTime.toLocaleString('en-US', { weekday: 'long' })},"${state.groupName}","${state.employeeName}",${state.amount},"${r.game}",${r.points}\n`;
        fs.appendFileSync(RECORDS_FILE, row);
        summaryText += `${r.game}: ${r.points} points\n`;
      }

      // Send to SINGLE report group
      try {
        await bot.forwardMessage(REPORT_GROUP_ID, chatId, state.originalMessageId);
        await bot.sendMessage(REPORT_GROUP_ID, summaryText, { parse_mode: "Markdown" });
      } catch (e) {
        console.error("Report send failed:", e);
      }

      await bot.sendMessage(chatId, "✅ Record saved and sent to report group.");
      userState.delete(chatId);
    }

    await bot.answerCallbackQuery(query.id);
  });

  bot.onText(/\/start|\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id, "👋 Send a screenshot to start the process.");
  });

  console.log("[Bot] Ready - Universal mode with single report group");
  return bot;
}

// Number Keyboard (from your current code)
const numberKeyboard = {
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
