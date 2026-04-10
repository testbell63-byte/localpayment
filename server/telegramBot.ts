import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const RECORDS_FILE = path.join(process.cwd(), "records.csv");
const CASHOUT_RECORDS_FILE = path.join(process.cwd(), "cashout_records.csv");
const REPORT_GROUP_ID = parseInt(process.env.REPORT_GROUP_ID || "-1003718366443");
const CASHOUT_GROUP_ID = parseInt(process.env.CASHOUT_GROUP_ID || "-1005194723686");
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "920244681");

if (isNaN(REPORT_GROUP_ID) || isNaN(CASHOUT_GROUP_ID) || isNaN(ADMIN_ID)) {
  console.error("❌ Invalid group IDs or admin ID in environment");
  process.exit(1);
}

// Ensure CSV files exist
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
  return `CO_${crypto.randomUUID()}`;
}

interface UserState {
  type: 'income' | 'cashout';
  step: string;
  amountInput: string;
  employeeName: string;
  groupName: string;
  selectedGames?: string[];
  records?: any[];
  originalMessageId?: number;
  originalChatId?: number;
  amount?: number;
  game?: string;
  points?: number;
  playback_points?: string;
  tip?: number;
  cashoutId?: string;
  createdAt?: string;
  updatedAt?: string;
  mediaType?: string | null;
  mediaCaption?: string;
  photoFileId?: string;
  photoMessageId?: number;
  textMessageId?: number;
  timeout?: NodeJS.Timeout;
  currentGameIndex?: number;
}

const userState = new Map<number, UserState>();
const adminMessages = new Map<number, { cashoutId: string; state: UserState; chatId: number }>();
const pendingCashouts = new Map<string, { state: UserState; adminMsgId: number; adminChatId: number; userEditMsgId?: number; userChatId: number }>();

function setStateWithTimeout(chatId: number, state: UserState) {
  if (userState.has(chatId)) {
    const old = userState.get(chatId);
    if (old?.timeout) clearTimeout(old.timeout);
  }
  const timeout = setTimeout(() => {
    userState.delete(chatId);
    console.log(`State for chat ${chatId} cleaned up after inactivity`);
  }, 60 * 60 * 1000);
  state.timeout = timeout;
  userState.set(chatId, state);
}

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

export function initTelegramBot(token: string, baseUrl: string): TelegramBot {
  const bot = new TelegramBot(token);
  console.log("[Bot] Starting with Income & Cashout flows");

  async function showCashoutReview(chatId: number, state: UserState) {
    const reviewText = `📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${state.game}\n🎯 Points Redeemed: ${state.points}\n🎫 Playback Points: ${state.playback_points}\n💵 Tip: $${state.tip}\n💰 Final Cashout: $${state.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${state.employeeName}\n🆔 Cashout ID: ${state.cashoutId}\n\n**All fields are editable. Click to edit or confirm:**`;
    await bot.sendMessage(chatId, reviewText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✏️ Edit Game", callback_data: "cashout_edit_game" }, { text: "✏️ Edit Points", callback_data: "cashout_edit_points" }],
          [{ text: "✏️ Edit Playback", callback_data: "cashout_edit_playback" }, { text: "✏️ Edit Tip", callback_data: "cashout_edit_tip" }],
          [{ text: "✏️ Edit Amount", callback_data: "cashout_edit_amount" }],
          [{ text: "✅ Confirm & Submit", callback_data: "cashout_confirm" }]
        ]
      }
    }).catch(err => console.error("Review message error:", err));
  }

  function saveCashoutRecord(state: UserState) {
    try {
      const row = `"${state.cashoutId}","${state.createdAt}","${state.updatedAt}","${state.groupName}","${state.employeeName}",${state.amount},"${state.game}",${state.points},"${state.playback_points}",${state.tip}\n`;
      fs.appendFileSync(CASHOUT_RECORDS_FILE, row);
      console.log(`Cashout saved: ${state.cashoutId}`);
    } catch (err) {
      console.error("Failed to write cashout record:", err);
    }
  }

  function removeCashoutRecord(cashoutId: string) {
    try {
      const content = fs.readFileSync(CASHOUT_RECORDS_FILE, "utf-8");
      const lines = content.split("\n");
      const filtered = lines.filter(line => !line.includes(cashoutId));
      fs.writeFileSync(CASHOUT_RECORDS_FILE, filtered.join("\n"));
      console.log(`Deleted cashout: ${cashoutId}`);
    } catch (err) {
      console.error("Failed to delete cashout record:", err);
    }
  }

  // Photo handler for income flow
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
      await bot.sendMessage(chatId, `📸 Picture received!\n\nStep 1: Select Game:`, gameKeyboard);
      return;
    }

    const newState: UserState = {
      type: "income",
      step: "amount",
      amountInput: "",
      employeeName,
      groupName,
      selectedGames: [],
      records: [],
      originalMessageId: msg.message_id,
      originalChatId: chatId
    };
    setStateWithTimeout(chatId, newState);
    await bot.sendMessage(chatId, `📸 Screenshot received from ${employeeName} (${groupName})\n\nEnter the deposited amount:`, numberKeyboard);
  });

  bot.onText(/\/(cashout|co)/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type === "private") {
      await bot.sendMessage(chatId, "❌ Please use this command in a group.");
      return;
    }
    const groupName = msg.chat.title || "Unknown Group";
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";
    const cashoutId = generateCashoutId();
    const now = getCST();

    const newState: UserState = {
      type: "cashout",
      step: "media_choice",
      cashoutId,
      employeeName,
      groupName,
      createdAt: now.isoTime,
      updatedAt: now.isoTime,
      amount: 0,
      game: "",
      points: 0,
      playback_points: "0",
      tip: 0,
      mediaType: null,
      mediaCaption: "",
      amountInput: ""
    };
    setStateWithTimeout(chatId, newState);
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
    const state = userState.get(chatId);
    const msg = query.message!;

    // Admin approve/deny
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

    // User edit/cancel
    if (data.startsWith("user_edit_")) {
      const cashoutId = data.replace("user_edit_", "");
      const pending = pendingCashouts.get(cashoutId);
      if (!pending) { await bot.answerCallbackQuery(query.id, { text: "No longer editable", show_alert: true }); return; }
      setStateWithTimeout(chatId, { ...pending.state, step: "cashout_review" });
      await showCashoutReview(chatId, pending.state);
      await bot.answerCallbackQuery(query.id);
      return;
    }
    if (data.startsWith("user_cancel_")) {
      const cashoutId = data.replace("user_cancel_", "");
      const pending = pendingCashouts.get(cashoutId);
      if (!pending) { await bot.answerCallbackQuery(query.id, { text: "No longer active", show_alert: true }); return; }
      await bot.editMessageText(`🚫 CANCELLED by user\n🆔 ID: ${cashoutId}`, { chat_id: pending.adminChatId, message_id: pending.adminMsgId }).catch(() => {});
      adminMessages.delete(pending.adminMsgId);
      pendingCashouts.delete(cashoutId);
      userState.delete(chatId);
      await bot.editMessageText(`🚫 Cancelled successfully.`, { chat_id: chatId, message_id: msg.message_id });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    if (!state) return;

    // Income flow callbacks
    if (state.type === "income") {
      if (data.startsWith("num_")) {
        const action = data.replace("num_", "");
        if (action === "back") {
          state.amountInput = (state.amountInput || "").slice(0, -1);
        } else if (action === "dot") {
          if (!state.amountInput.includes(".")) state.amountInput += ".";
        } else if (action === "done") {
          const value = parseFloat(state.amountInput || "0");
          if (isNaN(value) || value <= 0) { await bot.answerCallbackQuery(query.id); return; }
          if (state.step === "amount") {
            state.amount = value;
            state.step = "game";
            await bot.sendMessage(chatId, `✅ Amount saved: $${value}\n\nStep 2: Select games:`, gameKeyboard);
          } else if (state.step === "per_game_points") {
            const currentGame = state.selectedGames![state.currentGameIndex!];
            const cst = getCST();
            state.records!.push({
              date: cst.date, time: cst.time, day: cst.day,
              employee: state.employeeName, amount: state.amount, game: currentGame, points: value
            });
            state.currentGameIndex!++;
            if (state.currentGameIndex! < state.selectedGames!.length) {
              state.amountInput = "";
              await bot.sendMessage(chatId, `Enter points for ${state.selectedGames![state.currentGameIndex!]}:`, numberKeyboard);
            } else {
              state.step = "final_confirm";
              let summaryText = `📋 **SUMMARY**\n\n**Amount Received:** $${state.amount}\n\n**Games & Points:**\n`;
              state.records!.forEach((r: any, i: number) => { summaryText += `${i+1}. ${r.game}: ${r.points} points\n`; });
              summaryText += `\n📅 ${state.records![0].date} | ${state.records![0].day} | ${state.records![0].time}`;
              await bot.sendMessage(chatId, summaryText, { reply_markup: { inline_keyboard: [[{ text: "✅ Yes - Save", callback_data: "confirm_yes" }, { text: "❌ No", callback_data: "confirm_no" }]] } });
            }
          }
        } else {
          state.amountInput = (state.amountInput || "") + action;
        }
        const displayText = `💰 Enter Amount:\n\n👉 ${state.amountInput || "0"}`;
        await bot.editMessageText(displayText, { chat_id: chatId, message_id: msg.message_id, reply_markup: numberKeyboard.reply_markup }).catch(() => {});
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (state.step === "game") {
        if (data === "game_done") {
          if (!state.selectedGames!.length) { await bot.sendMessage(chatId, "Please select at least one game."); await bot.answerCallbackQuery(query.id); return; }
          state.step = "per_game_points";
          state.currentGameIndex = 0;
          state.amountInput = "";
          await bot.sendMessage(chatId, `Enter points for ${state.selectedGames![0]}:`, numberKeyboard);
        } else if (data === "game_Other") {
          state.step = "custom_game";
          await bot.sendMessage(chatId, "Type the custom game name:");
        } else {
          const game = data.replace("game_", "");
          if (!state.selectedGames!.includes(game)) state.selectedGames!.push(game);
          await bot.sendMessage(chatId, `Selected: ${state.selectedGames!.join(", ")}\n\nYou can select more or press Done.`, gameKeyboard);
        }
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (state.step === "final_confirm" && data === "confirm_yes") {
        for (const r of state.records!) {
          const row = `${r.date},${r.time},${r.day},"${state.groupName}","${r.employee}",${r.amount},"${r.game}",${r.points},\n`;
          fs.appendFileSync(RECORDS_FILE, row);
        }
        let successMsg = `✅ **Payment Record**\n\n**Group:** ${state.groupName}\n**Amount Received:** $${state.amount}\n\n**Games & Points:**\n`;
        state.records!.forEach((r: any, i: number) => { successMsg += `${i+1}. ${r.game}: ${r.points} points\n`; });
        successMsg += `\n📅 ${state.records![0].date} | ${state.records![0].day} | ${state.records![0].time}`;
        await bot.sendMessage(REPORT_GROUP_ID, successMsg).catch(() => {});
        await bot.forwardMessage(REPORT_GROUP_ID, state.originalChatId!, state.originalMessageId!).catch(() => {});
        await bot.sendMessage(chatId, successMsg);
        await bot.sendMessage(chatId, "✅ **Thank you for confirming!**");
        userState.delete(chatId);
      }
      if (state.step === "final_confirm" && data === "confirm_no") {
        await bot.sendMessage(chatId, "❌ **Cancelled.** Please post the picture again.");
        userState.delete(chatId);
      }
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // Cashout flow callbacks
    if (state.type === "cashout") {
      if (data === "cashout_picture") {
        state.step = "waiting_picture";
        state.mediaType = "picture";
        await bot.sendMessage(chatId, "📸 Please send a picture of your payment method:");
        await bot.answerCallbackQuery(query.id);
        return;
      }
      if (data === "cashout_text") {
        state.step = "waiting_text";
        state.mediaType = "text";
        await bot.sendMessage(chatId, "📝 Please write the details of your cashout:");
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (data.startsWith("cashout_num_")) {
        const action = data.replace("cashout_num_", "");
        if (action === "back") {
          state.amountInput = (state.amountInput || "").slice(0, -1);
        } else if (action === "dot") {
          if (!state.amountInput.includes(".")) state.amountInput += ".";
        } else if (action === "done") {
          const value = parseFloat(state.amountInput || "0");
          if (isNaN(value)) { await bot.sendMessage(chatId, "❌ Please enter a valid number."); await bot.answerCallbackQuery(query.id); return; }
          if (state.step === "cashout_points") {
            if (!Number.isInteger(value)) { await bot.sendMessage(chatId, "❌ Points must be a whole number."); await bot.answerCallbackQuery(query.id); return; }
            state.points = value;
            state.step = "cashout_playback";
            state.amountInput = "";
            await bot.sendMessage(chatId, `✅ Points: ${value}\n\nStep 3: Enter Playback Value:`, cashoutNumberKeyboard);
          } else if (state.step === "cashout_playback") {
            state.playback_points = state.amountInput || "0";
            state.step = "cashout_tip";
            state.amountInput = "";
            await bot.sendMessage(chatId, `✅ Playback: ${state.playback_points}\n\nStep 4: Enter Tip:`, cashoutNumberKeyboard);
          } else if (state.step === "cashout_tip") {
            state.tip = parseFloat(state.amountInput || "0");
            state.step = "cashout_amount";
            state.amountInput = "";
            await bot.sendMessage(chatId, `✅ Tip: $${state.tip}\n\nStep 5: Enter Cashout Amount:`, cashoutNumberKeyboard);
          } else if (state.step === "cashout_amount") {
            if (value <= 0) { await bot.sendMessage(chatId, "❌ Amount must be greater than zero."); await bot.answerCallbackQuery(query.id); return; }
            state.amount = value;
            state.step = "cashout_review";
            await showCashoutReview(chatId, state);
          }
        } else {
          state.amountInput = (state.amountInput || "") + action;
        }
        let displayText = "";
        if (state.step === "cashout_points") displayText = `🎮 Enter Points:\n\n👉 ${state.amountInput || "0"}`;
        else if (state.step === "cashout_playback") displayText = `🎫 Enter Playback Points:\n\n👉 ${state.amountInput || "0"}`;
        else if (state.step === "cashout_tip") displayText = `💵 Enter Tip:\n\n👉 ${state.amountInput || "0"}`;
        else if (state.step === "cashout_amount") displayText = `💰 Enter Cashout Amount:\n\n👉 ${state.amountInput || "0"}`;
        await bot.editMessageText(displayText, { chat_id: chatId, message_id: msg.message_id, reply_markup: cashoutNumberKeyboard.reply_markup }).catch(() => {});
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (state.step === "cashout_game") {
        if (data === "game_done") {
          if (!state.game) { await bot.sendMessage(chatId, "❌ Please select a game."); await bot.answerCallbackQuery(query.id); return; }
          state.step = "cashout_points";
          state.amountInput = "";
          await bot.sendMessage(chatId, `✅ Game: ${state.game}\n\nStep 2: Enter Points Redeemed:`, cashoutNumberKeyboard);
        } else if (data === "game_Other") {
          state.step = "cashout_custom_game";
          await bot.sendMessage(chatId, "Type the custom game name:");
        } else {
          const game = data.replace("game_", "");
          state.game = game;
          await bot.sendMessage(chatId, `✅ Selected: ${game}`, gameKeyboard);
        }
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (data.startsWith("cashout_edit_")) {
        const field = data.replace("cashout_edit_", "");
        if (field === "game") {
          state.step = "cashout_game";
          await bot.sendMessage(chatId, `Current Game: ${state.game}\n\nSelect New Game:`, gameKeyboard);
        } else if (field === "points") {
          state.step = "cashout_points";
          state.amountInput = state.points!.toString();
          await bot.sendMessage(chatId, `🎮 Current Points: ${state.points}\n\nEdit Points:`, cashoutNumberKeyboard);
        } else if (field === "playback") {
          state.step = "cashout_playback";
          state.amountInput = state.playback_points!;
          await bot.sendMessage(chatId, `🎫 Current Playback: ${state.playback_points}\n\nEdit Playback:`, cashoutNumberKeyboard);
        } else if (field === "tip") {
          state.step = "cashout_tip";
          state.amountInput = state.tip!.toString();
          await bot.sendMessage(chatId, `💵 Current Tip: $${state.tip}\n\nEdit Tip:`, cashoutNumberKeyboard);
        } else if (field === "amount") {
          state.step = "cashout_amount";
          state.amountInput = state.amount!.toString();
          await bot.sendMessage(chatId, `💰 Current Amount: $${state.amount}\n\nEdit Amount:`, cashoutNumberKeyboard);
        }
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (data === "cashout_confirm") {
        state.step = "cashout_pending_admin";
        state.updatedAt = getCST().isoTime;
        const adminMsgText = `📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${state.game}\n🎯 Points Redeemed: ${state.points}\n🎫 Playback Points: ${state.playback_points}\n💵 Tip: $${state.tip}\n💰 Final Cashout: $${state.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${state.employeeName}\n🆔 Cashout ID: ${state.cashoutId}\n\n⏳ Waiting for admin approval...`;
        const adminMsgObj = await bot.sendMessage(chatId, adminMsgText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ APPROVE", callback_data: `cashout_approve_${state.cashoutId}` }, { text: "❌ DENY", callback_data: `cashout_deny_${state.cashoutId}` }]
            ]
          }
        });
        if (adminMsgObj) {
          adminMessages.set(adminMsgObj.message_id, { cashoutId: state.cashoutId!, state: { ...state }, chatId });
          const userControlMsg = await bot.sendMessage(chatId, `✅ **Submitted!**\n🆔 ID: ${state.cashoutId}\n\nYou can edit or cancel until admin acts:`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "✏️ Edit", callback_data: `user_edit_${state.cashoutId}` }, { text: "🗑️ Cancel", callback_data: `user_cancel_${state.cashoutId}` }]
              ]
            }
          });
          pendingCashouts.set(state.cashoutId!, {
            state: { ...state },
            adminMsgId: adminMsgObj.message_id,
            adminChatId: chatId,
            userEditMsgId: userControlMsg?.message_id,
            userChatId: chatId
          });
        }
        userState.delete(chatId);
        await bot.answerCallbackQuery(query.id);
        return;
      }
      await bot.answerCallbackQuery(query.id);
    }
  });

  bot.on("text", async (msg) => {
    const chatId = msg.chat.id;
    const state = userState.get(chatId);
    if (state) {
      if (state.type === "income" && state.step === "custom_game") {
        const customGame = msg.text!.trim();
        state.selectedGames!.push(customGame);
        state.step = "game";
        await bot.sendMessage(chatId, `Added "${customGame}"\nSelected: ${state.selectedGames!.join(", ")}`, gameKeyboard);
        return;
      }
      if (state.type === "cashout" && state.step === "waiting_text") {
        state.mediaCaption = msg.text!;
        state.mediaType = "text";
        state.textMessageId = msg.message_id;
        state.step = "cashout_game";
        state.amountInput = "";
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
    if (msg.from?.id !== ADMIN_ID) {
      await bot.sendMessage(msg.chat.id, "❌ Only admin can delete records.");
      return;
    }
    if (!msg.reply_to_message) {
      await bot.sendMessage(msg.chat.id, "❌ Please **reply** to the message you want to delete with /delete");
      return;
    }
    const chatId = msg.chat.id;
    if (chatId === CASHOUT_GROUP_ID) {
      const text = msg.reply_to_message.text || msg.reply_to_message.caption || "";
      const match = text.match(/CO_[a-f0-9-]+/);
      if (match) {
        removeCashoutRecord(match[0]);
        await bot.sendMessage(chatId, `🗑️ Deleted cashout: ${match[0]}`);
      } else {
        await bot.sendMessage(chatId, "❌ Could not identify cashout ID.");
      }
      return;
    }
    // For income records: soft delete by appending negative entry
    if (!fs.existsSync(RECORDS_FILE)) return;
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").trim().split("\n");
    if (lines.length <= 1) return;
    const lastLine = lines[lines.length - 1];
    const parts = lastLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const cst = getCST();
    const row = `${cst.date},${cst.time},${cst.day},"${parts[3] || ''}","${parts[4] || ''}",-${parseFloat(parts[5]) || 0},"${parts[6] || ''}",-${parseFloat(parts[7]) || 0},DELETED\n`;
    fs.appendFileSync(RECORDS_FILE, row);
    await bot.sendMessage(chatId, `✅ Record deleted successfully.`);
  });

  const webhookPath = `/bot${token}`;
  bot.setWebHook(baseUrl + webhookPath).then(() => console.log("✅ Webhook set")).catch(err => console.error("Webhook failed:", err));
  return bot;
}
