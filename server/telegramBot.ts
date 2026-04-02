import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

const RECORDS_FILE = path.join(process.cwd(), "records.csv");

if (!fs.existsSync(RECORDS_FILE)) {
  fs.writeFileSync(RECORDS_FILE, "Date,Time,Day,Employee,Amount,Game,Points\n");
}

export function initTelegramBot(token: string): TelegramBot {
  const bot = new TelegramBot(token, { polling: true });

  console.log("[Bot] Improved Version Started");

  const userState = new Map<any, any>();

  // ---------------- KEYBOARD ----------------
  const amountKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "1", callback_data: "amt_1" },
          { text: "2", callback_data: "amt_2" },
          { text: "3", callback_data: "amt_3" }
        ],
        [
          { text: "4", callback_data: "amt_4" },
          { text: "5", callback_data: "amt_5" },
          { text: "6", callback_data: "amt_6" }
        ],
        [
          { text: "7", callback_data: "amt_7" },
          { text: "8", callback_data: "amt_8" },
          { text: "9", callback_data: "amt_9" }
        ],
        [
          { text: "⬅️", callback_data: "amt_back" },
          { text: "0", callback_data: "amt_0" },
          { text: "🧹", callback_data: "amt_clear" }
        ],
        [
          { text: "✅ Done", callback_data: "amt_done" }
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
        [
          { text: "✅ Done", callback_data: "game_done" },
          { text: "🔄 Reset", callback_data: "reset" }
        ]
      ]
    }
  };

  // ---------------- PHOTO HANDLER ----------------
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const employeeName =
      msg.from?.first_name || msg.from?.username || "Unknown";

    userState.set(chatId, {
      step: "amount",
      amountInput: "",
      employeeName,
      selectedGames: [],
      records: []
    });

    await bot.sendMessage(
      chatId,
      `📸 Screenshot received from ${employeeName}\n\n💰 Step 1: Enter amount using keypad:`,
      amountKeyboard
    );
  });

  // ---------------- TEXT HANDLER ----------------
  bot.on("text", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || "";
    const state = userState.get(chatId);

    if (!state) return;

    if (state.step === "amount") {
      await bot.sendMessage(chatId, "👉 Please use the keypad below 👇", amountKeyboard);
      return;
    }

    // custom game
    if (state.step === "custom_game") {
      state.selectedGames.push(text);
      state.step = "game";

      await bot.sendMessage(
        chatId,
        `✅ Added "${text}"\n\nSelected: ${state.selectedGames.join(", ")}`,
        gameKeyboard
      );
    }

    // per game points
    else if (state.step === "per_game_points") {
      const points = parseFloat(text);
      if (isNaN(points)) {
        await bot.sendMessage(chatId, "❌ Enter valid points.");
        return;
      }

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
        points
      });

      state.currentGameIndex++;

      if (state.currentGameIndex < state.selectedGames.length) {
        await bot.sendMessage(
          chatId,
          `Next: ${state.selectedGames[state.currentGameIndex]}\nEnter points:`
        );
      } else {
        state.step = "final_confirm";

        // Build detailed summary with transaction number
        let summaryText = `📋 **SUMMARY**\n\n`;
        summaryText += `Amount Received: $${state.amount}\n`;
        summaryText += `Games: ${state.selectedGames.join(", ")}\n\n`;
        summaryText += `**Points per game:**\n`;

        let totalPoints = 0;
        state.records.forEach((r: any, index: number) => {
          summaryText += `${index + 1}. ${r.game}: ${r.points} points\n`;
          totalPoints += r.points;
        });

        summaryText += `\n**Total Points:** ${totalPoints}\n`;
        summaryText += `Date: ${state.records[0].date}\n`;
        summaryText += `Day : ${state.records[0].day}\n`;
        summaryText += `Time: ${state.records[0].time}\n\n`;
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
  });

  // ---------------- CALLBACK HANDLER ----------------
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);

    if (!state) return;

    // ---------------- AMOUNT KEYPAD ----------------
    if (data.startsWith("amt_")) {
      if (state.step !== "amount") return;

      const action = data.replace("amt_", "");

      if (!state.amountInput) state.amountInput = "";

      if (action === "back") {
        state.amountInput = state.amountInput.slice(0, -1);
      } else if (action === "clear") {
        state.amountInput = "";
      } else if (action === "done") {
        const amount = parseFloat(state.amountInput);

        if (!amount || isNaN(amount)) {
          await bot.sendMessage(chatId, "❌ Invalid amount. Try again.");
          return;
        }

        state.amount = amount;
        state.step = "game";

        await bot.sendMessage(
          chatId,
          `💰 Amount saved: $${amount}\n\nStep 2: Select games:`,
          gameKeyboard
        );

        await bot.answerCallbackQuery(query.id);
        return;
      } else {
        state.amountInput += action;
      }

      await bot.editMessageText(
        `💰 Enter Amount:\n\n👉 ${state.amountInput || "0"}`,
        {
          chat_id: chatId,
          message_id: query.message!.message_id,
          reply_markup: amountKeyboard.reply_markup
        }
      );

      await bot.answerCallbackQuery(query.id);
      return;
    }

    // ---------------- GAME LOGIC ----------------
    if (state.step === "game") {
      if (data === "game_done") {
        state.step = "per_game_points";
        state.currentGameIndex = 0;

        await bot.sendMessage(
          chatId,
          `🎮 First game: ${state.selectedGames[0]}\nEnter points:`
        );
      } else if (data === "game_Other") {
        state.step = "custom_game";
        await bot.sendMessage(chatId, "Type custom game name:");
      } else if (data === "reset") {
        userState.delete(chatId);
        await bot.sendMessage(chatId, "🔄 Reset done. Send screenshot again.");
      } else {
        const game = data.replace("game_", "");

        if (!state.selectedGames.includes(game)) {
          state.selectedGames.push(game);
        }

        await bot.sendMessage(
          chatId,
          `Selected: ${state.selectedGames.join(", ")}`,
          gameKeyboard
        );
      }
    }

    // ---------------- FINAL CONFIRMATION ----------------
    if (state.step === "final_confirm") {
      if (data === "confirm_yes") {
        for (const r of state.records) {
          const row =
            `${r.date},${r.time},${r.day},"${r.employee}",${r.amount},"${r.game}",${r.points}\n`;

          fs.appendFileSync(RECORDS_FILE, row);
        }

        await bot.sendMessage(chatId, "✅ Saved successfully!");
        userState.delete(chatId);
      } else if (data === "confirm_no") {
        userState.delete(chatId);
        await bot.sendMessage(chatId, "❌ Discarded. Send screenshot again.");
      }
    }

    await bot.answerCallbackQuery(query.id);
  });

  // ---------------- HELP ----------------
  bot.onText(/\/start|\/help/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "👋 Payment Bot\n\n1. Send screenshot\n2. Enter amount via keypad\n3. Select games\n4. Enter points\n5. Confirm"
    );
  });

  console.log("[Bot] Ready");
  return bot;
}
