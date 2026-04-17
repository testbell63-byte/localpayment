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
      // Cashout admin actions
      if (data.startsWith("cashout_deny_")) {
        const cashoutId = data.replace("cashout_deny_", "");
        const adminData = adminMessages.get(msg.message_id);
        if (query.from?.id !== ADMIN_ID) {
          await bot.answerCallbackQuery(query.id, { text: "❌ Only admin can deny cashouts!", show_alert: true });
          return;
        }
        if (adminData && adminData.cashoutId === cashoutId) {
          const { state: cashoutState, chatId: originalChatId } = adminData;
          const denierName = query.from?.first_name || query.from?.username || "Unknown";
          const deniedMsg = `❌ **DENIED** by ${denierName}\n\n📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${cashoutState.game}\n🎯 Points Redeemed: ${cashoutState.points}\n🎫 Playback Points: ${cashoutState.playback_points}\n💵 Tip: $${cashoutState.tip}\n💰 Final Cashout: $${cashoutState.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${cashoutState.employeeName}\n🆔 Cashout ID: ${cashoutId}\n\nThis cashout has been denied.`;
          await bot.editMessageText(deniedMsg, { chat_id: originalChatId, message_id: msg.message_id }).catch(() => {});
          await bot.sendMessage(REPORT_GROUP_ID, `❌ **CASHOUT DENIED**\n\n👤 Employee: ${cashoutState.employeeName}\n🎮 Game: ${cashoutState.game}\n💰 Amount: $${cashoutState.amount}\n👨‍⚖️ Denied By: ${denierName} (Admin)\n🆔 Cashout ID: ${cashoutId}`).catch(() => {});
          adminMessages.delete(msg.message_id);
          const pending = pendingCashouts.get(cashoutId);
          if (pending) {
            await bot.editMessageText(`❌ Your cashout request (ID: ${cashoutId}) was denied by admin.`, { chat_id: pending.userChatId, message_id: pending.userEditMsgId! }).catch(() => {});
            pendingCashouts.delete(cashoutId);
          }
        }
        await bot.answerCallbackQuery(query.id, { text: "❌ Cashout Denied!" });
        return;
      }

      if (data.startsWith("cashout_approve_")) {
        const cashoutId = data.replace("cashout_approve_", "");
        const adminData = adminMessages.get(msg.message_id);
        if (query.from?.id !== ADMIN_ID) {
          await bot.answerCallbackQuery(query.id, { text: "❌ Only admin can approve cashouts!", show_alert: true });
          return;
        }
        if (adminData && adminData.cashoutId === cashoutId) {
          const { state: coState, chatId: originalChatId } = adminData;
          const approverName = query.from?.first_name || query.from?.username || "Unknown";
          saveCashoutRecord(coState);
          const approvedMsg = `✅ **APPROVED** by ${approverName}\n\n📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${coState.game}\n🎯 Points Redeemed: ${coState.points}\n🎫 Playback Points: ${coState.playback_points}\n💵 Tip: $${coState.tip}\n💰 Final Cashout: $${coState.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${coState.employeeName}\n🆔 Cashout ID: ${cashoutId}`;
          await bot.editMessageText(approvedMsg, { chat_id: originalChatId, message_id: msg.message_id }).catch(() => {});
          await bot.sendMessage(REPORT_GROUP_ID, `✅ **CASHOUT APPROVED**\n👤 Employee: ${coState.employeeName}\n💰 Amount: $${coState.amount}\n🆔 ID: ${cashoutId}`).catch(() => {});
          if (coState.mediaType === "photo" && coState.photoFileId) {
            await bot.sendPhoto(REPORT_GROUP_ID, coState.photoFileId, { caption: `📸 Payment Screenshot\n${coState.mediaCaption}` }).catch(() => {});
          } else if (coState.mediaType === "text" && coState.mediaCaption) {
            await bot.sendMessage(REPORT_GROUP_ID, `📝 Payment Details:\n${coState.mediaCaption}`).catch(() => {});
          }
          adminMessages.delete(msg.message_id);
          const pending = pendingCashouts.get(cashoutId);
          if (pending) {
            await bot.editMessageText(`✅ Your cashout request (ID: ${cashoutId}) was approved by admin.`, { chat_id: pending.userChatId, message_id: pending.userEditMsgId! }).catch(() => {});
            pendingCashouts.delete(cashoutId);
          }
        }
        await bot.answerCallbackQuery(query.id, { text: "✅ Cashout Approved!" });
        return;
      }

      // User edit/cancel for cashout
      if (data.startsWith("user_edit_")) {
        const cashoutId = data.replace("user_edit_", "");
        const pending = pendingCashouts.get(cashoutId);
        if (!pending) {
          await bot.answerCallbackQuery(query.id, { text: "No longer editable", show_alert: true });
          return;
        }
        userState.set(chatId, { ...pending.state, step: "cashout_review" });
        showCashoutReview(chatId, pending.state, bot);
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (data.startsWith("user_cancel_")) {
        const cashoutId = data.replace("user_cancel_", "");
        const pending = pendingCashouts.get(cashoutId);
        if (!pending) {
          await bot.answerCallbackQuery(query.id, { text: "No longer active", show_alert: true });
          return;
        }
        await bot.editMessageText(`🚫 CANCELLED by user\n🆔 ID: ${cashoutId}`, { chat_id: pending.adminChatId, message_id: pending.adminMsgId }).catch(() => {});
        adminMessages.delete(pending.adminMsgId);
        pendingCashouts.delete(cashoutId);
        userState.delete(chatId);
        await bot.editMessageText(`🚫 Cancelled successfully.`, { chat_id: chatId, message_id: msg.message_id });
        await bot.answerCallbackQuery(query.id);
        return;
      }

      // Income flow
      if (state.type === "income") {
        // ... (keep the entire income flow from your working telegramBot.ts)
        // To keep this message within length, I'll assume you have the full income flow.
        // If you need the complete code, let me know and I'll post it separately.
      }

      // Cashout flow
      if (state.type === "cashout") {
        // ... (keep the cashout flow)
      }
    } catch (err) {
      console.error("Error in callback handler:", err);
      await bot.answerCallbackQuery(query.id, { text: "An error occurred. Please try again.", show_alert: true });
    }
  });

  bot.on("text", async (msg) => {
    // ... (keep text handler)
  });

  bot.onText(/\/delete/, async (msg) => {
    // ... (keep delete handler)
  });

  bot.on("deleted_message", async (msg) => {
    // ... (keep delete handler)
  });

  // Helper functions
  function showCashoutReview(chatId: number, state: any, bot: TelegramBot) {
    // ... (same as before)
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
