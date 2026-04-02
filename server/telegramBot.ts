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

  const userState = new Map();

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
          { text: "⬅️ Back", callback_data: "amt_back" },
          { text: "0", callback_data: "amt_0" },
          { text: "🧹 Clear", callback_data: "amt_clear" }
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
      selectedGames: []
    });

    await bot.sendMessage(chatId, 
      `📸 Screenshot received from ${employeeName}\n\n` +
      `Step 1: Enter the deposited amount using the keypad:`,
      amountKeyboard
    );
  });

  // CALLBACK HANDLER
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);
    if (!state) return;

    // Amount Keypad
    if (data.startsWith("amt_")) {
      const action = data.replace("amt_", "");

      if (!state.amountInput) state.amountInput = "";

      if (action === "back") {
        state.amountInput = state.amountInput.slice(0, -1);
      } else if (action === "clear") {
        state.amountInput = "";
      } else if (action === "done") {
        const amount = parseFloat(state.amountInput);
        if (isNaN(amount) || amount <= 0) {
          await bot.sendMessage(chatId, "❌ Please enter a valid amount.");
          return;
        }

        state.amount = amount;
        state.step = "game";

        await bot.sendMessage(chatId, 
          `✅ Amount saved: $${amount}\n\n` +
          `Step 2: Select one or more games:`,
          gameKeyboard
        );
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

    // Game Selection
    if (state.step === "game") {
      if (data === "game_done") {
        if (state.selectedGames.length === 0) {
          await bot.sendMessage(chatId, "Please select at least one game.");
          return;
        }
        state.step = "per_game_points";
        state.currentGameIndex = 0;
        await bot.sendMessage(chatId, `Enter points for ${state.selectedGames[0]}:`);
      } else if (data === "game_Other") {
        state.step = "custom_game";
        await bot.sendMessage(chatId, "Type the custom game name:");
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

    await bot.answerCallbackQuery(query.id);
  });

  // Text handler for custom game and points
  bot.on("text", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || "";
    const state = userState.get(chatId);

    if (!state) return;

    if (state.step === "custom_game") {
      state.selectedGames.push(text);
      state.step = "game";
      await bot.sendMessage(chatId,
        `Added "${text}"\nSelected: ${state.selectedGames.join(", ")}`,
        gameKeyboard
      );
    } 
    else if (state.step === "per_game_points") {
      const points = parseFloat(text);
      if (isNaN(points) || points <= 0) {
        await bot.sendMessage(chatId, "❌ Please enter valid points.");
        return;
      }

      const currentGame = state.selectedGames[state.currentGameIndex];
      const now = new Date();
      const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

      const row = `${now.toISOString().split("T")[0]},${now.toLocaleTimeString()},${days[now.getDay()]},"${state.employeeName}",${state.amount},"${currentGame}",${points}\n`;
      fs.appendFileSync(RECORDS_FILE, row);

      state.currentGameIndex++;

      if (state.currentGameIndex < state.selectedGames.length) {
        await bot.sendMessage(chatId, `Next game: ${state.selectedGames[state.currentGameIndex]}\nEnter points:`);
      } else {
        await bot.sendMessage(chatId, 
          `✅ All records saved!\n\nAmount: $${state.amount}\nGames: ${state.selectedGames.join(", ")}`
        );
        userState.delete(chatId);
      }
    }
  });

  bot.onText(/\/start|\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id,
      "👋 Payment Bot\n\n" +
      "1. Send screenshot\n" +
      "2. Enter amount with keypad\n" +
      "3. Select games\n" +
      "4. Enter points for each game"
    );
  });

  console.log("[Bot] Ready");
  return bot;
}
