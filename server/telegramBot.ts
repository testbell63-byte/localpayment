import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

const RECORDS_FILE = path.join(process.cwd(), "records.csv");
const REPORT_GROUP_ID = -1003718366443;

if (!fs.existsSync(RECORDS_FILE)) {
  fs.writeFileSync(RECORDS_FILE, "Date,Time,Day,Group,Employee,Amount,Game,Points,Notes\n");
}

function getCST() {
  const now = new Date();
  const cstTime = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return {
    date: cstTime.toISOString().split("T")[0],
    time: cstTime.toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit', hour12: true }),
    day: cstTime.toLocaleDateString("en-US", { weekday: "long" })
  };
}

export function initTelegramBot(token: string, baseUrl: string): TelegramBot {
  const bot = new TelegramBot(token);

  console.log("[Bot] Starting with fixed /delete");

  const userState = new Map();

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

  const gameKeyboard = {
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
    const groupName = msg.chat.title || "Unknown Group";
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";

    userState.set(chatId, {
      step: "amount",
      amountInput: "",
      employeeName,
      groupName,
      selectedGames: [],
      records: [],
      originalMessageId: msg.message_id,
      originalChatId: chatId
    });

    await bot.sendMessage(chatId, `📸 Screenshot received from ${employeeName} (${groupName})\n\nEnter the deposited amount:`, numberKeyboard);
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);
    if (!state) return;

    if (data.startsWith("num_")) {
      const action = data.replace("num_", "");
      if (action === "back") {
        state.amountInput = (state.amountInput || "").slice(0, -1);
      } else if (action === "dot") {
        if (!state.amountInput.includes(".")) state.amountInput += ".";
      } else if (action === "done") {
        const value = parseFloat(state.amountInput || "0");
        if (isNaN(value) || value <= 0) {
          await bot.sendMessage(chatId, "❌ Please enter a valid number.");
          return;
        }
        if (state.step === "amount") {
          state.amount = value;
          state.step = "game";
          await bot.sendMessage(chatId, `✅ Amount saved: $${value}\n\nStep 2: Select games:`, gameKeyboard);
        } else if (state.step === "per_game_points") {
          const currentGame = state.selectedGames[state.currentGameIndex];
          const cst = getCST();
          state.records.push({
            date: cst.date,
            time: cst.time,
            day: cst.day,
            employee: state.employeeName,
            amount: state.amount,
            game: currentGame,
            points: value
          });
          state.currentGameIndex++;
          if (state.currentGameIndex < state.selectedGames.length) {
            state.amountInput = "";
            await bot.sendMessage(chatId, `Enter points for ${state.selectedGames[state.currentGameIndex]}:`, numberKeyboard);
          } else {
            state.step = "final_confirm";
            let summaryText = `📋 **SUMMARY**\n\n**Amount Received:** $${state.amount}\n\n**Games & Points:**\n`;
            state.records.forEach((r: any, i: number) => {
              summaryText += `${i+1}. ${r.game}: ${r.points} points\n`;
            });
            summaryText += `\n📅 ${state.records[0].date} | ${state.records[0].day} | ${state.records[0].time}`;
            await bot.sendMessage(chatId, summaryText, {
              reply_markup: {
                inline_keyboard: [[
                  { text: "✅ Yes - Save", callback_data: "confirm_yes" },
                  { text: "❌ No", callback_data: "confirm_no" }
                ]]
              }
            });
          }
          return;
        }
      } else {
        state.amountInput = (state.amountInput || "") + action;
      }
      const displayText = `💰 Enter Amount:\n\n👉 ${state.amountInput || "0"}`;
      await bot.editMessageText(displayText, {
        chat_id: chatId,
        message_id: query.message!.message_id,
        reply_markup: numberKeyboard.reply_markup
      }).catch(() => {});
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (state.step === "game") {
      if (data === "game_done") {
        if (state.selectedGames.length === 0) {
          await bot.sendMessage(chatId, "Please select at least one game.");
          return;
        }
        state.step = "per_game_points";
        state.currentGameIndex = 0;
        state.amountInput = "";
        await bot.sendMessage(chatId, `Enter points for ${state.selectedGames[0]}:`, numberKeyboard);
      } else if (data === "game_Other") {
        state.step = "custom_game";
        await bot.sendMessage(chatId, "Type the custom game name:");
      } else {
        const game = data.replace("game_", "");
        if (!state.selectedGames.includes(game)) state.selectedGames.push(game);
        await bot.sendMessage(chatId, `Selected: ${state.selectedGames.join(", ")}\n\nYou can select more or press Done.`, gameKeyboard);
      }
    }

    if (state.step === "final_confirm" && data === "confirm_yes") {
      for (const r of state.records) {
        const row = `${r.date},${r.time},${r.day},"${state.groupName}","${r.employee}",${r.amount},"${r.game}",${r.points},\n`;
        fs.appendFileSync(RECORDS_FILE, row);
      }

      let successMsg = `✅ **Payment Record**\n\n`;
      successMsg += `**Group:** ${state.groupName}\n`;
      successMsg += `**Amount Received:** $${state.amount}\n\n`;
      successMsg += `**Games & Points:**\n`;
      state.records.forEach((r: any, i: number) => {
        successMsg += `${i+1}. ${r.game}: ${r.points} points\n`;
      });
      successMsg += `\n📅 ${state.records[0].date} | ${state.records[0].day} | ${state.records[0].time}`;

      try {
        await bot.sendMessage(REPORT_GROUP_ID, successMsg);
        await bot.forwardMessage(REPORT_GROUP_ID, state.originalChatId, state.originalMessageId);
      } catch (e) {}

      const blueSummary = `✅ **Transaction Confirmed!**\n\n` +
        `**Group:** ${state.groupName}\n` +
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

  // ================== FIXED /delete Command ==================
  bot.onText(/\/delete/, async (msg) => {
    if (!msg.reply_to_message) {
      await bot.sendMessage(msg.chat.id, "❌ Please **reply** to the screenshot you want to delete with /delete");
      return;
    }

    const chatId = msg.chat.id;
    const cst = getCST();

    // Read the most recent record
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").trim().split("\n");
    if (lines.length <= 1) {
      await bot.sendMessage(chatId, "No records to delete.");
      return;
    }

    const lastLine = lines[lines.length - 1];
    const parts = lastLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

    const originalAmount = Math.abs(parseFloat(parts[5]) || 0);   // Make sure it's positive
    const originalGame = parts[6] ? parts[6].replace(/"/g, "") : "Unknown";
    const originalEmployee = parts[4] ? parts[4].replace(/"/g, "") : "Unknown";
    const originalGroup = parts[3] ? parts[3].replace(/"/g, "") : "Unknown";

    // Add negative amount only (points = 0)
    const negativeRow = `${cst.date},${cst.time},${cst.day},"${originalGroup}","${originalEmployee}",-${originalAmount},"${originalGame}",0,"DELETED - Original Amount Refunded"\n`;

    fs.appendFileSync(RECORDS_FILE, negativeRow);

    // Send confirmation in main group
    await bot.sendMessage(chatId, `✅ Deletion recorded.\nAmount of $${originalAmount} has been deducted.\nPoints were not refunded (already spent).`);

    // Send to report group with original screenshot attached
    try {
      await bot.forwardMessage(REPORT_GROUP_ID, chatId, msg.reply_to_message.message_id);
      await bot.sendMessage(REPORT_GROUP_ID, 
        `🗑️ **Deletion Recorded**\n\n` +
        `**Group:** ${originalGroup}\n` +
        `**Employee:** ${originalEmployee}\n` +
        `**Amount Deducted:** -$${originalAmount}\n` +
        `**Note:** Original Amount Refunded (Points not refunded)`, 
        { parse_mode: "Markdown" }
      );
    } catch (e) {
      console.error("Failed to send deletion to report group:", e);
    }
  });

  bot.on("text", async (msg) => {
    const chatId = msg.chat.id;
    const state = userState.get(chatId);
    if (state && state.step === "custom_game") {
      state.selectedGames.push(msg.text!.trim());
      state.step = "game";
      await bot.sendMessage(chatId, `Added "${msg.text}"\nSelected: ${state.selectedGames.join(", ")}`, gameKeyboard);
    }
  });

  bot.onText(/\/start|\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id, "👋 Send a screenshot to start.\n\nReply to a screenshot with `/delete` to remove it.");
  });

  const webhookPath = `/bot${token}`;
  bot.setWebHook(baseUrl + webhookPath)
    .then(() => console.log("✅ Webhook set successfully"))
    .catch(err => console.error("Webhook failed:", err));

  console.log("[Bot] Ready with fixed /delete");
  return bot;
}
