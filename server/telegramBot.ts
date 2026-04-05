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
  console.log("[Bot] Starting with Income & Cashout flows");

  const userState = new Map();
  const adminMessages = new Map();
  const pendingCashouts = new Map();

  const numberKeyboard = (prefix: string) => ({
    reply_markup: {
      inline_keyboard: [
        [{ text: "1", callback_data: `${prefix}_1` }, { text: "2", callback_data: `${prefix}_2` }, { text: "3", callback_data: `${prefix}_3` }],
        [{ text: "4", callback_data: `${prefix}_4` }, { text: "5", callback_data: `${prefix}_5` }, { text: "6", callback_data: `${prefix}_6` }],
        [{ text: "7", callback_data: `${prefix}_7` }, { text: "8", callback_data: `${prefix}_8` }, { text: "9", callback_data: `${prefix}_9` }],
        [{ text: "0", callback_data: `${prefix}_0` }, { text: ".", callback_data: `${prefix}_dot` }],
        [{ text: "⬅️ Back", callback_data: `${prefix}_back` }, { text: "✅ Done", callback_data: `${prefix}_done` }]
      ]
    }
  });

  const gameKeyboard = (prefix: string) => ({
    reply_markup: {
      inline_keyboard: [
        [{ text: "FK", callback_data: `${prefix}_FK` }],
        [{ text: "JW", callback_data: `${prefix}_JW` }],
        [{ text: "GV", callback_data: `${prefix}_GV` }],
        [{ text: "Orion", callback_data: `${prefix}_Orion` }],
        [{ text: "MW", callback_data: `${prefix}_MW` }],
        [{ text: "FunStation", callback_data: `${prefix}_FunStation` }],
        [{ text: "VS", callback_data: `${prefix}_VS` }],
        [{ text: "PM", callback_data: `${prefix}_PM` }],
        [{ text: "CM", callback_data: `${prefix}_CM` }],
        [{ text: "UP", callback_data: `${prefix}_UP` }],
        [{ text: "Monstor", callback_data: `${prefix}_Monstor` }],
        [{ text: "Other", callback_data: `${prefix}_Other` }]
      ]
    }
  });

  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const state = userState.get(chatId);

    if (state && state.type === "cashout" && state.step === "waiting_picture") {
      state.mediaCaption = msg.caption || "Payment method screenshot";
      state.mediaType = "photo";
      state.photoFileId = msg.photo?.[msg.photo.length - 1]?.file_id;
      state.step = "cashout_game";
      await bot.sendMessage(chatId, `📸 Picture received!\n\nStep 1: Select Game:`, gameKeyboard("co_game"));
      return;
    }

    const groupName = msg.chat.title || "Unknown Group";
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";
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

    await bot.sendMessage(chatId, `📸 Screenshot received from ${employeeName} (${groupName})\n\nEnter the deposited amount:`, numberKeyboard("inc_num"));
  });

  bot.onText(/\/(cashout|co)/, async (msg) => {
    const chatId = msg.chat.id;
    const groupName = msg.chat.title || "Unknown Group";
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";

    userState.set(chatId, {
      type: "cashout",
      step: "media_choice",
      cashoutId: generateCashoutId(),
      employeeName,
      groupName,
      createdAt: getCST().isoTime,
      updatedAt: getCST().isoTime,
      amount: 0,
      game: "",
      points: 0,
      playback_points: "0",
      tip: 0,
      amountInput: ""
    });

    await bot.sendMessage(chatId, `💸 **Cashout Request Started**\n\nEmployee: ${employeeName}\nGroup: ${groupName}\n\nHow would you like to provide payment details?`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📸 Attach Picture", callback_data: "co_choice_picture" }],
          [{ text: "📝 Write Details", callback_data: "co_choice_text" }]
        ]
      }
    });
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);

    // ─── CASHOUT CHOICE ───────────────────────────────────────────────────────
    if (data === "co_choice_picture") {
      if (state) { state.step = "waiting_picture"; await bot.sendMessage(chatId, "📸 Please send the payment method screenshot:"); }
      await bot.answerCallbackQuery(query.id); return;
    }
    if (data === "co_choice_text") {
      if (state) { state.step = "waiting_text"; await bot.sendMessage(chatId, "📝 Please type the payment details:"); }
      await bot.answerCallbackQuery(query.id); return;
    }

    // ─── INCOME FLOW ──────────────────────────────────────────────────────────
    if (data.startsWith("inc_num_")) {
      if (!state || state.type !== "income") return;
      const action = data.replace("inc_num_", "");
      if (action === "back") state.amountInput = state.amountInput.slice(0, -1);
      else if (action === "dot") { if (!state.amountInput.includes(".")) state.amountInput += "."; }
      else if (action === "done") {
        const val = parseFloat(state.amountInput || "0");
        if (state.step === "amount") {
          state.amount = val; state.step = "game";
          const kb = gameKeyboard("inc_game");
          kb.reply_markup.inline_keyboard.push([{ text: "✅ Done", callback_data: "inc_game_done" }]);
          await bot.sendMessage(chatId, `💰 Amount: $${val}\n\nSelect Game(s):`, kb);
        } else if (state.step === "points") {
          state.points = val;
          const cst = getCST(); const gameStr = state.selectedGames.join(", ");
          const row = `${cst.date},${cst.time},${cst.day},"${state.groupName}","${state.employeeName}",${state.amount},"${gameStr}",${val},\n`;
          fs.appendFileSync(RECORDS_FILE, row);
          const confirmMsg = `✅ **RECORDED**\n\n📊 TRANSACTION SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📅 Date: ${cst.date} ${cst.time}\n👤 Employee: ${state.employeeName}\n🏢 Group: ${state.groupName}\n💰 Amount: $${state.amount}\n🎮 Games: ${gameStr}\n🎯 Points: ${val}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
          await bot.sendMessage(chatId, confirmMsg);
          try { await bot.sendMessage(REPORT_GROUP_ID, confirmMsg); if (state.originalChatId === chatId && state.originalMessageId) { await bot.forwardMessage(REPORT_GROUP_ID, chatId, state.originalMessageId); } } catch (_) {}
          userState.delete(chatId);
        }
      } else state.amountInput += action;
      await bot.answerCallbackQuery(query.id); return;
    }

    if (data.startsWith("inc_game_")) {
      if (!state || state.type !== "income") return;
      const game = data.replace("inc_game_", "");
      if (game === "done") {
        if (state.selectedGames.length === 0) { await bot.answerCallbackQuery(query.id, { text: "Select at least one game", show_alert: true }); return; }
        state.step = "points"; state.amountInput = "";
        await bot.sendMessage(chatId, `🎮 Games: ${state.selectedGames.join(", ")}\n\nEnter Points:`, numberKeyboard("inc_num"));
      } else if (game === "Other") {
        state.step = "inc_custom_game"; await bot.sendMessage(chatId, "Type custom game name:");
      } else {
        if (!state.selectedGames.includes(game)) state.selectedGames.push(game);
        await bot.answerCallbackQuery(query.id, { text: `Added ${game}` });
      }
      return;
    }

    // ─── CASHOUT FLOW ─────────────────────────────────────────────────────────
    if (data.startsWith("co_game_")) {
      if (!state || state.type !== "cashout") return;
      const game = data.replace("co_game_", "");
      if (game === "Other") {
        state.step = "co_custom_game"; await bot.sendMessage(chatId, "Type custom game name:");
      } else {
        state.game = game; state.step = "cashout_points"; state.amountInput = "";
        await bot.sendMessage(chatId, `✅ Game: ${game}\n\nStep 2: Enter Points Redeemed:`, numberKeyboard("co_num"));
      }
      await bot.answerCallbackQuery(query.id); return;
    }

    if (data.startsWith("co_num_")) {
      if (!state || state.type !== "cashout") return;
      const action = data.replace("co_num_", "");
      if (action === "back") state.amountInput = state.amountInput.slice(0, -1);
      else if (action === "dot") { if (!state.amountInput.includes(".")) state.amountInput += "."; }
      else if (action === "done") {
        const val = parseFloat(state.amountInput || "0");
        if (state.step === "cashout_points") {
          state.points = val; state.step = "cashout_playback"; state.amountInput = "0";
          await bot.sendMessage(chatId, `✅ Points: ${val}\n\nStep 3: Enter Playback Points:`, numberKeyboard("co_num"));
        } else if (state.step === "cashout_playback") {
          state.playback_points = val.toString(); state.step = "cashout_tip"; state.amountInput = "0";
          await bot.sendMessage(chatId, `✅ Playback: ${val}\n\nStep 4: Enter Tip Amount:`, numberKeyboard("co_num"));
        } else if (state.step === "cashout_tip") {
          state.tip = val; state.step = "cashout_amount"; state.amountInput = "";
          await bot.sendMessage(chatId, `✅ Tip: $${val}\n\nStep 5: Enter Final Cashout Amount:`, numberKeyboard("co_num"));
        } else if (state.step === "cashout_amount") {
          state.amount = val; state.step = "cashout_review";
          showCashoutReview(chatId, state, bot);
        }
      } else state.amountInput += action;
      await bot.answerCallbackQuery(query.id); return;
    }

    if (data.startsWith("co_edit_")) {
      if (!state || state.type !== "cashout") return;
      const field = data.replace("co_edit_", "");
      if (field === "game") { state.step = "cashout_game"; await bot.sendMessage(chatId, "Select New Game:", gameKeyboard("co_game")); }
      else if (field === "points") { state.step = "cashout_points"; state.amountInput = ""; await bot.sendMessage(chatId, "Edit Points:", numberKeyboard("co_num")); }
      else if (field === "playback") { state.step = "cashout_playback"; state.amountInput = ""; await bot.sendMessage(chatId, "Edit Playback:", numberKeyboard("co_num")); }
      else if (field === "tip") { state.step = "cashout_tip"; state.amountInput = ""; await bot.sendMessage(chatId, "Edit Tip:", numberKeyboard("co_num")); }
      else if (field === "amount") { state.step = "cashout_amount"; state.amountInput = ""; await bot.sendMessage(chatId, "Edit Amount:", numberKeyboard("co_num")); }
      await bot.answerCallbackQuery(query.id); return;
    }

    if (data === "co_confirm") {
      if (!state || state.type !== "cashout") return;
      state.step = "pending_admin";
      const adminMsg = `📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${state.game}\n🎯 Points: ${state.points}\n🎫 Playback: ${state.playback_points}\n💵 Tip: $${state.tip}\n💰 Final: $${state.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${state.employeeName}\n🆔 ID: ${state.cashoutId}\n\n⏳ Waiting for admin approval...`;
      const adminMsgObj = await bot.sendMessage(chatId, adminMsg, {
        reply_markup: {
          inline_keyboard: [[{ text: "✅ APPROVE", callback_data: `admin_approve_${state.cashoutId}` }, { text: "❌ DENY", callback_data: `admin_deny_${state.cashoutId}` }]]
        }
      });
      if (adminMsgObj) {
        adminMessages.set(adminMsgObj.message_id, { cashoutId: state.cashoutId, state: { ...state }, chatId });
        const userControlMsg = await bot.sendMessage(chatId, `✅ **Submitted!**\n🆔 ID: ${state.cashoutId}\n\nYou can edit or cancel until admin acts:`, {
          reply_markup: { inline_keyboard: [[{ text: "✏️ Edit", callback_data: `user_edit_${state.cashoutId}` }, { text: "🗑️ Cancel", callback_data: `user_cancel_${state.cashoutId}` }]] }
        });
        pendingCashouts.set(state.cashoutId, { state: { ...state }, adminMsgId: adminMsgObj.message_id, adminChatId: chatId, userEditMsgId: userControlMsg?.message_id, userChatId: chatId });
      }
      userState.delete(chatId); await bot.answerCallbackQuery(query.id); return;
    }

    // ─── ADMIN APPROVAL/DENY ──────────────────────────────────────────────────
    if (data.startsWith("admin_approve_") || data.startsWith("admin_deny_")) {
      const isApprove = data.startsWith("admin_approve_");
      const cashoutId = data.replace(isApprove ? "admin_approve_" : "admin_deny_", "");
      const adminData = adminMessages.get(query.message?.message_id!);
      if (query.from?.id !== ADMIN_ID) { await bot.answerCallbackQuery(query.id, { text: "❌ Admin only!", show_alert: true }); return; }
      if (adminData && adminData.cashoutId === cashoutId) {
        const { state: coState, chatId: originalChatId } = adminData;
        const adminName = query.from?.first_name || "Admin";
        if (isApprove) saveCashoutRecord(coState);
        const status = isApprove ? "✅ APPROVED" : "❌ DENIED";
        await bot.editMessageText(`${status} by ${adminName}\n\n🆔 ID: ${cashoutId}\n💰 Amount: $${coState.amount}`, { chat_id: originalChatId, message_id: query.message?.message_id! });
        try { await bot.sendMessage(REPORT_GROUP_ID, `${status}\n👤 Employee: ${coState.employeeName}\n💰 Amount: $${coState.amount}\n🆔 ID: ${cashoutId}`); } catch (_) {}
        adminMessages.delete(query.message?.message_id!);
        const pending = pendingCashouts.get(cashoutId);
        if (pending) {
          try { await bot.editMessageText(`⏹️ Resolved by admin.\n🆔 ID: ${cashoutId}`, { chat_id: pending.userChatId, message_id: pending.userEditMsgId }); } catch (_) {}
          pendingCashouts.delete(cashoutId);
        }
      }
      await bot.answerCallbackQuery(query.id); return;
    }

    // ─── USER PENDING EDIT/CANCEL ─────────────────────────────────────────────
    if (data.startsWith("user_edit_")) {
      const cashoutId = data.replace("user_edit_", "");
      const pending = pendingCashouts.get(cashoutId);
      if (!pending) { await bot.answerCallbackQuery(query.id, { text: "No longer editable", show_alert: true }); return; }
      userState.set(chatId, { ...pending.state, step: "cashout_review" });
      showCashoutReview(chatId, pending.state, bot);
      await bot.answerCallbackQuery(query.id); return;
    }
    if (data.startsWith("user_cancel_")) {
      const cashoutId = data.replace("user_cancel_", "");
      const pending = pendingCashouts.get(cashoutId);
      if (!pending) { await bot.answerCallbackQuery(query.id, { text: "No longer active", show_alert: true }); return; }
      removeCashoutRecord(cashoutId);
      try { await bot.editMessageText(`🚫 CANCELLED by user\n🆔 ID: ${cashoutId}`, { chat_id: pending.adminChatId, message_id: pending.adminMsgId }); } catch (_) {}
      adminMessages.delete(pending.adminMsgId); pendingCashouts.delete(cashoutId); userState.delete(chatId);
      await bot.editMessageText(`🚫 Cancelled successfully.`, { chat_id: chatId, message_id: query.message?.message_id! });
      await bot.answerCallbackQuery(query.id); return;
    }
  });

  bot.on("text", async (msg) => {
    if (msg.text?.startsWith("/")) return;
    const chatId = msg.chat.id; const state = userState.get(chatId);
    if (!state) return;

    if (state.type === "income" && state.step === "inc_custom_game") {
      state.selectedGames.push(msg.text!.trim()); state.step = "game";
      const kb = gameKeyboard("inc_game"); kb.reply_markup.inline_keyboard.push([{ text: "✅ Done", callback_data: "inc_game_done" }]);
      await bot.sendMessage(chatId, `Added "${msg.text}"`, kb);
    } else if (state.type === "cashout") {
      if (state.step === "waiting_text") {
        state.mediaCaption = msg.text; state.mediaType = "text"; state.step = "cashout_game";
        await bot.sendMessage(chatId, `✅ Details received.\n\nStep 1: Select Game:`, gameKeyboard("co_game"));
      } else if (state.step === "co_custom_game") {
        state.game = msg.text; state.step = "cashout_points"; state.amountInput = "";
        await bot.sendMessage(chatId, `✅ Game: ${msg.text}\n\nStep 2: Enter Points:`, numberKeyboard("co_num"));
      }
    }
  });

  bot.onText(/\/delete/, async (msg) => {
    if (!msg.reply_to_message) { await bot.sendMessage(msg.chat.id, "❌ Reply to a message with /delete"); return; }
    const chatId = msg.chat.id;
    if (chatId === CASHOUT_GROUP_ID) {
      const text = msg.reply_to_message.text || msg.reply_to_message.caption || "";
      const match = text.match(/CO_\d+_[a-z0-9]+/);
      if (match) {
        removeCashoutRecord(match[0]);
        await bot.sendMessage(chatId, `🗑️ Deleted: ${match[0]}`);
      } else await bot.sendMessage(chatId, "❌ Could not identify cashout ID.");
      return;
    }
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").trim().split("\n");
    if (lines.length <= 1) return;
    const lastLine = lines[lines.length - 1];
    const parts = lastLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const cst = getCST();
    const row = `${cst.date},${cst.time},${cst.day},"${parts[3]}","${parts[4]}",-${parseFloat(parts[5])},"${parts[6]}",-${parseFloat(parts[7])},DELETED\n`;
    fs.appendFileSync(RECORDS_FILE, row);
    await bot.sendMessage(chatId, `✅ Record deleted.`);
  });

  const webhookPath = `/bot${token}`;
  bot.setWebHook(baseUrl + webhookPath).then(() => console.log("✅ Webhook set")).catch(err => console.error("Webhook failed:", err));
  return bot;
}

function showCashoutReview(chatId: number, state: any, bot: TelegramBot) {
  const text = `📊 REVIEW\n🎮 Game: ${state.game}\n🎯 Points: ${state.points}\n🎫 Playback: ${state.playback_points}\n💵 Tip: $${state.tip}\n💰 Final: $${state.amount}\n🆔 ID: ${state.cashoutId}`;
  bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✏️ Game", callback_data: "co_edit_game" }, { text: "✏️ Points", callback_data: "co_edit_points" }],
        [{ text: "✏️ Playback", callback_data: "co_edit_playback" }, { text: "✏️ Tip", callback_data: "co_edit_tip" }],
        [{ text: "✏️ Amount", callback_data: "co_edit_amount" }],
        [{ text: "✅ Confirm & Submit", callback_data: "co_confirm" }]
      ]
    }
  });
}

function saveCashoutRecord(state: any) {
  const row = `"${state.cashoutId}","${state.createdAt}","${state.updatedAt}","${state.groupName}","${state.employeeName}",${state.amount},"${state.game}",${state.points},"${state.playback_points}",${state.tip}\n`;
  fs.appendFileSync(CASHOUT_RECORDS_FILE, row);
}

function removeCashoutRecord(id: string) {
  try {
    const content = fs.readFileSync(CASHOUT_RECORDS_FILE, "utf-8");
    const lines = content.split("\n");
    const filtered = lines.filter(line => !line.includes(id));
    fs.writeFileSync(CASHOUT_RECORDS_FILE, filtered.join("\n"));
  } catch (_) {}
}
