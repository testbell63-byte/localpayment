import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

const RECORDS_FILE = path.join(process.cwd(), "records.csv");

if (!fs.existsSync(RECORDS_FILE)) {
  fs.writeFileSync(RECORDS_FILE, "Date,Time,Day,Employee,Amount,Game,Points\n");
}

// === NEW REPORT GROUP ID (updated as per your message) ===
const REPORT_GROUP_ID = -1003782105748;

export function initTelegramBot(token: string): TelegramBot {
  const bot = new TelegramBot(token, { polling: true });

  console.log("[Bot] Improved Version Started - Report Group:", REPORT_GROUP_ID);

  const userState = new Map<any, any>();

  const numberKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "1", callback_data: "num_1" },
          { text: "2", callback_data: "num_2" },
          { text: "3", callback_data: "num_3" }
        ],
        [
          { text: "4", callback_data: "num_4" },
          { text: "5", callback_data: "num_5" },
          { text: "6", callback_data: "num_6" }
        ],
        [
          { text: "7", callback_data: "num_7" },
          { text: "8", callback_data: "num_8" },
          { text: "9", callback_data: "num_9" }
        ],
        [
          { text: "0", callback_data: "num_0" },
          { text: ".", callback_data: "num_dot" }
        ],
        [
          { text: "⬅️ Back", callback_data: "num_back" },
          { text: "✅ Done", callback_data: "num_done" }
        ]
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

  // PHOTO HANDLER
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";

    userState.set(chatId, {
      step: "amount",
      amountInput: "",
      employeeName,
      selectedGames: [],
      records: [],
      originalMessageId: msg.message_id,   // Important for attaching screenshot
      originalChatId: chatId
    });

    await bot.sendMessage(chatId,
      `📸 Screenshot received from ${employeeName}\n\n` +
      `Step 1: Enter the deposited amount using keypad:`,
      numberKeyboard
    );
  });

  // CALLBACK HANDLER
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);
    if (!state) return;

    // Numerical Keypad Logic (Amount + Points)
    if (data.startsWith("num_")) {
      const action = data.replace("num_", "");

      if (!state.amountInput) state.amountInput = "";

      if (action === "back") {
        state.amountInput = state.amountInput.slice(0, -1);
      } else if (action === "dot") {
        if (!state.amountInput.includes(".")) state.amountInput += ".";
      } else if (action === "done") {
        const value = parseFloat(state.amountInput);
        if (isNaN(value) || value <= 0) {
          await bot.sendMessage(chatId, "❌ Please enter a valid number.");
          return;
        }

        if (state.step === "amount") {
          state.amount = value;
          state.step = "game";
          await bot.sendMessage(chatId,
            `✅ Amount saved: $${value}\n\nStep 2: Select games:`,
            gameKeyboard
          );
        } else if (state.step === "per_game_points") {
          const currentGame = state.selectedGames[state.currentGameIndex];
          const now = new Date();
          const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

          state.records.push({
            date: now.toISOString().split("T")[0],
            time: now.toLocaleTimeString(),
            day: days[now.getDay()],
            employee: state.employeeName,
            amount: state.amount,
            game: currentGame,
            points: value
          });

          state.currentGameIndex++;

          if (state.currentGameIndex < state.selectedGames.length) {
            state.amountInput = "";
            await bot.sendMessage(chatId,
              `Enter points for ${state.selectedGames[state.currentGameIndex]}:`,
              numberKeyboard
            );
          } else {
            state.step = "final_confirm";

            let summaryText = `📋 **SUMMARY**\n\n`;
            summaryText += `**Amount Received:** $${state.amount}\n\n`;
            summaryText += `**Games & Points:**\n`;
            let totalPoints = 0;
            state.records.forEach((r: any, i: number) => {
              summaryText += `${i + 1}. ${r.game}: ${r.points} points\n`;
              totalPoints += r.points;
            });

            summaryText += `\nDate: ${state.records[0].date} | Day: ${state.records[0].day} | Time: ${state.records[0].time}\n\n`;
            summaryText += `Is everything correct?`;

            await bot.sendMessage(chatId, summaryText, {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Yes", callback_data: "confirm_yes" },
                    { text: "❌ No", callback_data: "confirm_no" }
                  ]
                ]
              }
            });
          }
        }
        return;
      } else {
        state.amountInput += action;
      }

      await bot.editMessageText(
        `💰 Enter Amount:\n\n👉 ${state.amountInput || "0"}`,
        {
          chat_id: chatId,
          message_id: query.message!.message_id,
          reply_markup: numberKeyboard.reply_markup
        }
      );

      await bot.answerCallbackQuery(query.id);
      return;
    }

    // Game Selection
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
        await bot.sendMessage(chatId, "Type custom game name:");
      } else {
        const game = data.replace("game_", "");
        if (!state.selectedGames.includes(game)) {
          state.selectedGames.push(game);
        }
        await bot.sendMessage(chatId,
          `Selected: ${state.selectedGames.join(", ")}\n\nYou can select more or press Done.`,
          gameKeyboard
        );
      }
    }

    // FINAL CONFIRMATION → Send to NEW REPORT GROUP with screenshot attached
    if (state.step === "final_confirm" && data === "confirm_yes") {
      for (const r of state.records) {
        const row = `${r.date},${r.time},${r.day},"${r.employee}",${r.amount},"${r.game}",${r.points}\n`;
        fs.appendFileSync(RECORDS_FILE, row);
      }

      let successMsg = `✅ **Saved Successfully!**\n\n`;
      successMsg += `**Amount Received:** $${state.amount}\n\n`;
      successMsg += `**Games & Points:**\n`;
      state.records.forEach((r: any, i: number) => {
        successMsg += `${i + 1}. ${r.game}: ${r.points} points\n`;
      });
      successMsg += `\nDate: ${state.records[0].date} | ${state.records[0].day} | ${state.records[0].time}`;

      // Send full summary + attached original screenshot to the NEW REPORT GROUP
      await bot.sendMessage(REPORT_GROUP_ID, successMsg, {
        reply_to_message_id: state.originalMessageId   // This attaches the screenshot
      });

      // Short confirmation in the main group
      await bot.sendMessage(chatId, "✅ Record saved and forwarded to report group.");

      userState.delete(chatId);
    }

    if (state.step === "final_confirm" && data === "confirm_no") {
      userState.delete(chatId);
      await bot.sendMessage(chatId, "❌ Discarded. Send screenshot again.");
    }

    await bot.answerCallbackQuery(query.id);
  });

  // Custom game name handler
  bot.on("text", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || "";
    const state = userState.get(chatId);

    if (state && state.step === "custom_game") {
      state.selectedGames.push(text);
      state.step = "game";
      await bot.sendMessage(chatId,
        `Added "${text}"\nSelected: ${state.selectedGames.join(", ")}`,
        gameKeyboard
      );
    }
  });

  // Help command
  bot.onText(/\/start|\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id,
      "👋 Payment Bot\n\n" +
      "1. Send screenshot\n" +
      "2. Enter amount with keypad\n" +
      "3. Select games\n" +
      "4. Enter points using keypad"
    );
  });

  console.log("[Bot] Ready - Reports will go to group:", REPORT_GROUP_ID);
  return bot;
}
