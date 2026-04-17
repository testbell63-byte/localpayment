import express from "express";
import { createServer } from "http";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 8080;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";
const RECORDS_FILE = path.join(process.cwd(), "records.csv");
const CASHOUT_RECORDS_FILE = path.join(process.cwd(), "cashout_records.csv");
const REPORT_GROUP_ID = -1003718366443;
const CASHOUT_GROUP_ID = -1005194723686;
const ADMIN_ID = 920244681;

if (!fs.existsSync(RECORDS_FILE)) {
  fs.writeFileSync(RECORDS_FILE, "Date,Time,Day,Group,Employee,Amount,Game,Points,Notes\n");
}
if (!fs.existsSync(CASHOUT_RECORDS_FILE)) {
  fs.writeFileSync(CASHOUT_RECORDS_FILE, "id,created_at,updated_at,group,employee,amount,game,points,playback_id,tip\n");
}

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "server/public")));

function getRecords() {
  try {
    const content = fs.readFileSync(RECORDS_FILE, "utf-8");
    return content.trim().split("\n").slice(1).map(line => {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return {
        date: parts[0] || "",
        time: parts[1] || "",
        day: parts[2] || "",
        group: (parts[3] || "").replace(/"/g, ""),
        employee: (parts[4] || "").replace(/"/g, ""),
        amount: parseFloat(parts[5]) || 0,
        game: (parts[6] || "").replace(/"/g, ""),
        points: parseFloat(parts[7]) || 0
      };
    });
  } catch (e) { return []; }
}

function getCashoutRecords() {
  try {
    const content = fs.readFileSync(CASHOUT_RECORDS_FILE, "utf-8");
    return content.trim().split("\n").slice(1).map(line => {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return {
        id: (parts[0] || "").replace(/"/g, ""),
        created_at: (parts[1] || "").replace(/"/g, ""),
        updated_at: (parts[2] || "").replace(/"/g, ""),
        group: (parts[3] || "").replace(/"/g, ""),
        employee: (parts[4] || "").replace(/"/g, ""),
        amount: parseFloat(parts[5]) || 0,
        game: (parts[6] || "").replace(/"/g, ""),
        points: parseFloat(parts[7]) || 0,
        playback_id: (parts[8] || "").replace(/"/g, ""),
        tip: parseFloat(parts[9]) || 0
      };
    });
  } catch (e) { return []; }
}

app.get("/", (req, res) => res.redirect("/dashboard"));
app.get("/api/transactions", (req, res) => res.json({ transactions: getRecords() }));
app.get("/api/cashout-transactions", (req, res) => res.json({ cashoutTransactions: getCashoutRecords() }));

app.get("/dashboard", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const html = fs.readFileSync(path.join(process.cwd(), "server/_core/dashboard.html"), "utf-8").replace("{{TODAY}}", today);
  res.send(html);
});

// ---------------------- BOT CODE (inlined) ----------------------
function getCST() {
  const now = new Date();
  const cstTime = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return {
    date: cstTime.toISOString().split("T")[0],
    time: cstTime.toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit', hour12: true }),
    day: cstTime.toLocaleDateString("en-US", { weekday: "long" }),
    isoTime: cstTime.toISOString()
  };
}

function generateCashoutId() {
  return `CO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function initTelegramBot(token: string, baseUrl: string): TelegramBot {
  const bot = new TelegramBot(token);
  console.log("[Bot] Starting with Income & Cashout flows");

  const userState = new Map();
  const adminMessages = new Map();
  const cashoutMessages = new Map();
  const pendingCashouts = new Map();

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

  const cashoutNumberKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "1", callback_data: "cashout_num_1" }, { text: "2", callback_data: "cashout_num_2" }, { text: "3", callback_data: "cashout_num_3" }],
        [{ text: "4", callback_data: "cashout_num_4" }, { text: "5", callback_data: "cashout_num_5" }, { text: "6", callback_data: "cashout_num_6" }],
        [{ text: "7", callback_data: "cashout_num_7" }, { text: "8", callback_data: "cashout_num_8" }, { text: "9", callback_data: "cashout_num_9" }],
        [{ text: "0", callback_data: "cashout_num_0" }, { text: ".", callback_data: "cashout_num_dot" }],
        [{ text: "⬅️ Back", callback_data: "cashout_num_back" }, { text: "✅ Done", callback_data: "cashout_num_done" }]
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
    const state = userState.get(chatId);

    if (state && state.type === "cashout" && state.step === "waiting_picture") {
      state.mediaCaption = msg.caption || "Payment method screenshot";
      state.mediaType = "photo";
      state.photoFileId = msg.photo?.[msg.photo.length - 1]?.file_id;
      state.photoMessageId = msg.message_id;
      state.step = "cashout_game";
      state.amountInput = "";
      cashoutMessages.set(`${chatId}_photo_${msg.message_id}`, state.cashoutId);
      await bot.sendMessage(chatId, `📸 Picture received!\n\nStep 1: Select Game:`, gameKeyboard);
      return;
    }

    userState.set(chatId, {
      type: "income",
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

  bot.onText(/\/(cashout|co)/, async (msg) => {
    const chatId = msg.chat.id;
    const groupName = msg.chat.title || "Unknown Group";
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";
    const cashoutId = generateCashoutId();

    userState.set(chatId, {
      type: "cashout",
      step: "media_choice",
      cashoutId,
      employeeName,
      groupName,
      createdAt: getCST().isoTime,
      updatedAt: getCST().isoTime,
      amount: 0,
      game: "",
      points: 0,
      playback_points: "0",
      tip: 0,
      mediaType: null,
      mediaCaption: "",
      amountInput: ""
    });

    await bot.sendMessage(chatId, `💸 **Cashout Request Started**\n\nEmployee: ${employeeName}\nGroup: ${groupName}\n\nHow would you like to provide payment details?`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📸 Attach Picture", callback_data: "cashout_picture" }],
          [{ text: "📝 Write Details", callback_data: "cashout_text" }]
        ]
      }
    });
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const msg = query.message!;
    const state = userState.get(chatId);

    console.log(`[Callback] chat=${chatId}, data=${data}, stateExists=${!!state}`);

    if (!state) {
      console.log(`⚠️ No state for chat ${chatId}, ignoring callback ${data}`);
      await bot.answerCallbackQuery(query.id, {
        text: "Session expired. Please send a new photo to start over.",
        show_alert: true
      });
      await bot.editMessageReplyMarkup({ reply_markup: undefined }, {
        chat_id: chatId,
        message_id: msg.message_id
      }).catch(() => {});
      return;
    }

    try {
      // -------- Cashout admin approve/deny (unchanged, keep from your original) --------
      if (data.startsWith("cashout_deny_")) {
        // ... (keep your existing code)
        await bot.answerCallbackQuery(query.id, { text: "❌ Cashout Denied!" });
        return;
      }
      if (data.startsWith("cashout_approve_")) {
        // ... (keep your existing code)
        await bot.answerCallbackQuery(query.id, { text: "✅ Cashout Approved!" });
        return;
      }
      if (data.startsWith("user_edit_")) {
        // ... (keep your existing code)
        await bot.answerCallbackQuery(query.id);
        return;
      }
      if (data.startsWith("user_cancel_")) {
        // ... (keep your existing code)
        await bot.answerCallbackQuery(query.id);
        return;
      }

      // -------- Income flow (simplified for test) --------
      if (state.type === "income") {
        if (data.startsWith("num_")) {
          const action = data.replace("num_", "");
          if (action === "back") {
            state.amountInput = (state.amountInput || "").slice(0, -1);
          } else if (action === "dot") {
            if (!state.amountInput.includes(".")) state.amountInput += ".";
          } else if (action === "done") {
            const value = parseFloat(state.amountInput || "0");
            console.log(`[DEBUG] num_done, value=${value}, step=${state.step}`);
            if (isNaN(value) || value <= 0) {
              await bot.answerCallbackQuery(query.id);
              return;
            }
            if (state.step === "amount") {
              state.amount = value;
              state.step = "game";
              await bot.sendMessage(chatId, `✅ Amount saved: $${value}\n\nStep 2: Select games:`, gameKeyboard);
            } else if (state.step === "per_game_points") {
              // ... points logic
            }
          } else {
            // number or dot
            state.amountInput = (state.amountInput || "") + action;
          }
          const displayText = `💰 Enter Amount:\n\n👉 ${state.amountInput || "0"}`;
          await bot.editMessageText(displayText, { chat_id: chatId, message_id: msg.message_id, reply_markup: numberKeyboard.reply_markup }).catch(() => {});
          await bot.answerCallbackQuery(query.id);
          return;
        }

        if (state.step === "game") {
          // ... game selection logic
          await bot.answerCallbackQuery(query.id);
          return;
        }

        if (state.step === "final_confirm" && data === "confirm_yes") {
          // ... save logic
          await bot.answerCallbackQuery(query.id);
          return;
        }
        if (state.step === "final_confirm" && data === "confirm_no") {
          await bot.sendMessage(chatId, "❌ **Cancelled.** Please post the picture again.");
          userState.delete(chatId);
          await bot.answerCallbackQuery(query.id);
          return;
        }
      }

      // -------- Cashout flow (similar) --------
      if (state.type === "cashout") {
        // ... keep your existing cashout flow
      }
    } catch (err) {
      console.error("Error in callback handler:", err);
      await bot.answerCallbackQuery(query.id, { text: "An error occurred. Please try again.", show_alert: true });
    }
  });

  bot.on("text", async (msg) => {
    const chatId = msg.chat.id;
    const state = userState.get(chatId);
    if (state) {
      if (state.type === "income" && state.step === "custom_game") {
        const customGame = msg.text!.trim();
        state.selectedGames.push(customGame);
        state.step = "game";
        await bot.sendMessage(chatId, `Added "${customGame}"\nSelected: ${state.selectedGames.join(", ")}`, gameKeyboard);
        return;
      }
      if (state.type === "cashout" && state.step === "waiting_text") {
        state.mediaCaption = msg.text!;
        state.mediaType = "text";
        state.textMessageId = msg.message_id;
        state.step = "cashout_game";
        state.amountInput = "";
        cashoutMessages.set(`${chatId}_text_${msg.message_id}`, state.cashoutId);
        await bot.sendMessage(chatId, `✅ Details received: "${msg.text}"\n\nStep 1: Select Game:`, gameKeyboard);
        return;
      }
      if (state.type === "cashout" && state.step === "cashout_custom_game") {
        state.game = msg.text!.trim();
        state.step = "cashout_points";
        state.amountInput = "";
        await bot.sendMessage(chatId, `✅ Game: ${msg.text}\n\nStep 2: Enter Points Redeemed:`, cashoutNumberKeyboard);
        return;
      }
    }
  });

  bot.onText(/\/delete/, async (msg) => {
    // ... keep your delete logic
  });

  bot.on("deleted_message", async (msg) => {
    // ... keep your delete logic
  });

  // Helper functions
  function showCashoutReview(chatId: number, state: any, bot: TelegramBot) {
    // ... keep your review logic
  }

  function saveCashoutRecord(state: any) {
    const row = `"${state.cashoutId}","${state.createdAt}","${state.updatedAt}","${state.groupName}","${state.employeeName}",${state.amount},"${state.game}",${state.points},"${state.playback_points}",${state.tip}\n`;
    fs.appendFileSync(CASHOUT_RECORDS_FILE, row);
  }

  function removeCashoutRecord(cashoutId: string) {
    try {
      const content = fs.readFileSync(CASHOUT_RECORDS_FILE, "utf-8");
      const lines = content.split("\n");
      const filtered = lines.filter(line => !line.includes(cashoutId));
      fs.writeFileSync(CASHOUT_RECORDS_FILE, filtered.join("\n"));
    } catch (err) {}
  }

  return bot;
}
// ----------------------------------------------------------------

const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`;
const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
