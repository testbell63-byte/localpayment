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

  // Amount Keyboard
  const amountKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "1", callback_data: "amt_1" }, { text: "2", callback_data: "amt_2" }, { text: "3", callback_data: "amt_3" }],
        [{ text: "4", callback_data: "amt_4" }, { text: "5", callback_data: "amt_5" }, { text: "6", callback_data: "amt_6" }],
        [{ text: "7", callback_data: "amt_7" }, { text: "8", callback_data: "amt_8" }, { text: "9", callback_data: "amt_9" }],
        [{ text: "⬅️ Back", callback_data: "amt_back" }, { text: "0", callback_data: "amt_0" }, { text: "🧹 Clear", callback_data: "amt_clear" }],
        [{ text: "✅ Done", callback_data: "amt_done" }]
      ]
    }
  };

  // Game Keyboard
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
      records: []
    });

    await bot.sendMessage(chatId, 
      `📸 Screenshot received from ${employeeName}\n\n` +
      `Step 1: Enter the deposited amount using the keypad below:`,
      amountKeyboard
    );
  });

  // CALLBACK HANDLER (Keypad + Game)
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
