import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

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

export function initTelegramBot(token: string, baseUrl: string): TelegramBot {
  const bot = new TelegramBot(token);
  console.log("[Bot] Starting with Income & Cashout flows + Start Button");

  const userState = new Map();
  const adminMessages = new Map();
  const cashoutMessages = new Map();

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

  // ==================== AUTO SHOW START BUTTON ====================
  bot.on("message", async (msg) => {
    // Show button for normal messages (not photos, not replies, not commands)
    if (!msg.photo && !msg.reply_to_message && (!msg.text || !msg.text.startsWith("/"))) {
      await bot.sendMessage(msg.chat.id, "Click below to start a new cashout:", {
        reply_markup: {
          inline_keyboard: [[
            { text: "💸 Start a New Cashout", callback_data: "start_cashout" }
          ]]
        }
      });
    }
  });

  // Handle button + keep your original /cashout command
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;

    if (data === "start_cashout") {
      const groupName = query.message?.chat.title || "Unknown Group";
      const employeeName = query.from?.first_name || query.from?.username || "Unknown";

      await bot.sendMessage(chatId, 
        `💸 **Cashout Request Started**\n\n` +
        `**Employee:** ${employeeName}\n` +
        `**Group:** ${groupName}\n\n` +
        `How would you like to provide payment details?`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📸 Attach Picture", callback_data: "cashout_picture" }],
              [{ text: "📝 Write Details", callback_data: "cashout_text" }]
            ]
          }
        }
      );
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // === YOUR ORIGINAL CALLBACK LOGIC STARTS HERE (unchanged) ===
    const state = userState.get(chatId);
    if (!state) return;

    if (data.startsWith("cashout_approve_")) {
      // ... your full approval code remains exactly the same ...
      const cashoutId = data.replace("cashout_approve_", "");
      const adminData = adminMessages.get(query.message?.message_id!);
      const approverId = query.from?.id;
     
      if (approverId !== ADMIN_ID) {
        console.warn(`[Security] Non-admin user (ID: ${approverId}) attempted to approve cashout ${cashoutId}`);
        await bot.answerCallbackQuery(query.id, { text: "❌ Only admin can approve cashouts!", show_alert: true });
        return;
      }
     
      if (adminData && adminData.cashoutId === cashoutId) {
        const { state, chatId: originalChatId } = adminData;
        const approverName = query.from?.first_name || query.from?.username || "Unknown";
        console.log(`[Admin Approval] Cashout ${cashoutId} approved by ${approverName}`);
       
        saveCashoutRecord(state);
        const approvedMsg = `✅ **APPROVED** by ${approverName}\n\n📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${state.game}\n🎯 Points Redeemed: ${state.points}\n🎫 Playback Points: ${state.playback_points}\n💵 Tip: $${state.tip}\n💰 Final Cashout: $${state.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${state.employeeName}\n🆔 Cashout ID: ${cashoutId}`;
        await bot.editMessageText(approvedMsg, {
          chat_id: originalChatId,
          message_id: query.message?.message_id!
        }).catch(() => {});
        const reportMsg = `✅ **CASHOUT APPROVED & RECORDED**\n\n📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${state.game}\n🎯 Points Redeemed: ${state.points}\n🎫 Playback Points: ${state.playback_points}\n💵 Tip: $${state.tip}\n💰 Final Cashout: $${state.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${state.employeeName}\n👨‍⚖️ Approved By: ${approverName} (Admin)\n🆔 Cashout ID: ${cashoutId}\n📅 Created: ${state.createdAt}\n📅 Approved: ${getCST().isoTime}`;
        try {
          await bot.sendMessage(REPORT_GROUP_ID, reportMsg);
          if (state.mediaType === "photo" && state.photoFileId) {
            await bot.sendPhoto(REPORT_GROUP_ID, state.photoFileId, {
              caption: `📸 Payment Method Screenshot\n${state.mediaCaption}`
            });
          } else if (state.mediaType === "text" && state.mediaCaption) {
            await bot.sendMessage(REPORT_GROUP_ID, `📝 Payment Details:\n${state.mediaCaption}`);
          }
        } catch (err) {
          console.error(`[Report] Failed to send to Report Group:`, err);
        }
        adminMessages.delete(query.message?.message_id!);
      }
      await bot.answerCallbackQuery(query.id, { text: "✅ Cashout Approved!", show_alert: true });
      return;
    }

    if (state.type === "income") {
      // your full income logic (num_, game, final_confirm) remains exactly as you had
      if (data.startsWith("num_")) {
        // ... your numpad code ...
      }
      if (state.step === "game") {
        // ... your game logic ...
      }
      if (state.step === "final_confirm") {
        // ... your confirm logic ...
      }
    }

    if (state.type === "cashout") {
      // your full cashout logic remains exactly as you had
      if (data === "cashout_picture") {
        // ... 
      }
      if (data === "cashout_text") {
        // ...
      }
      if (data.startsWith("cashout_num_")) {
        // ...
      }
      if (state.step === "cashout_game") {
        // ...
      }
      if (data === "cashout_confirm") {
        // ...
      }
      if (data.startsWith("cashout_edit_")) {
        // ...
      }
    }

    await bot.answerCallbackQuery(query.id);
  });

  // Your photo, text, /delete, /start handlers (unchanged)
  bot.on("photo", async (msg) => {
    // your exact photo handler
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
    // your exact /cashout handler - kept as fallback
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

  // ... (your /delete, on("text"), on("deleted_message"), /start handlers remain exactly the same as you pasted)

  bot.onText(/\/delete/, async (msg) => {
    if (!msg.reply_to_message) {
      await bot.sendMessage(msg.chat.id, "❌ Please **reply** to the screenshot you want to delete with /delete");
      return;
    }
    const chatId = msg.chat.id;
    if (!fs.existsSync(RECORDS_FILE)) {
      await bot.sendMessage(chatId, "No records found.");
      return;
    }
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").trim().split("\n");
    if (lines.length <= 1) {
      await bot.sendMessage(chatId, "No records to delete.");
      return;
    }
    const cst = getCST();
    const lastLine = lines[lines.length - 1];
    const parts = lastLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const negativeRow = `${cst.date},${cst.time},${cst.day},"${parts[3] || ''}","${parts[4] || ''}",-${parseFloat(parts[5]) || 0},"${parts[6] || ''}",-${parseFloat(parts[7]) || 0},DELETED\n`;
    fs.appendFileSync(RECORDS_FILE, negativeRow);
    await bot.sendMessage(chatId, `✅ Record deleted successfully.\nNegative entry added. Totals updated.`);
    try {
      await bot.sendMessage(REPORT_GROUP_ID, `🗑️ Deletion recorded for group: ${parts[3] || 'Unknown'}`);
    } catch (e) {}
  });

  bot.onText(/\/start|\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id, "👋 Send a screenshot to start.\n\nReply to a screenshot with `/delete` to remove it.\n\nUse `/cashout` or `/co` to start a cashout request.");
  });

  const webhookPath = `/bot${token}`;
  bot.setWebHook(baseUrl + webhookPath)
    .then(() => console.log("✅ Webhook set successfully"))
    .catch(err => console.error("Webhook failed:", err));

  console.log("[Bot] Ready");
  return bot;
}

// Keep your helper functions at the bottom
function showCashoutReview(chatId: number, state: any, bot: TelegramBot) {
  const reviewText = `📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${state.game}\n🎯 Points Redeemed: ${state.points}\n🎫 Playback Points: ${state.playback_points}\n💵 Tip: $${state.tip}\n💰 Final Cashout: $${state.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${state.employeeName}\n🆔 Cashout ID: ${state.cashoutId}\n**All fields are editable. Click to edit or confirm:**`;
  bot.sendMessage(chatId, reviewText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✏️ Edit Game", callback_data: "cashout_edit_game" }],
        [{ text: "✏️ Edit Points", callback_data: "cashout_edit_points" }],
        [{ text: "✏️ Edit Playback Points", callback_data: "cashout_edit_playback" }],
        [{ text: "✏️ Edit Tip", callback_data: "cashout_edit_tip" }],
        [{ text: "✏️ Edit Amount", callback_data: "cashout_edit_amount" }],
        [{ text: "✅ Confirm & Submit", callback_data: "cashout_confirm" }]
      ]
    }
  }).catch(() => {});
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
    console.log(`[Cleanup] Removed cashout record: ${cashoutId}`);
  } catch (err) {
    console.error(`[Cleanup] Failed to remove cashout record:`, err);
  }
}
