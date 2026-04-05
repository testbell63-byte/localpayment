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
  // adminMessages: messageId -> { cashoutId, state, chatId }
  const adminMessages = new Map();
  // cashoutMessages: key -> cashoutId (for deletion tracking)
  const cashoutMessages = new Map();
  // pendingCashouts: cashoutId -> { state, adminMsgId, adminChatId, userEditMsgId, userChatId }
  // Tracks cashouts that are pending admin approval so user can still edit/cancel
  const pendingCashouts = new Map();
  // cashoutGroupMsgToCashoutId: messageId in cashout group -> cashoutId
  // Used for /delete in cashout group
  const cashoutGroupMsgToCashoutId = new Map();

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

  // ─── Helper: build the user edit/cancel keyboard ───────────────────────────
  function buildUserControlKeyboard(cashoutId: string) {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✏️ Edit Cashout", callback_data: `pending_edit_${cashoutId}` },
            { text: "🗑️ Cancel Cashout", callback_data: `pending_cancel_${cashoutId}` }
          ]
        ]
      }
    };
  }

  // ─── Helper: disable the user control message after admin acts ─────────────
  async function disableUserControlMsg(cashoutId: string) {
    const pending = pendingCashouts.get(cashoutId);
    if (!pending) return;
    try {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: pending.userChatId,
        message_id: pending.userEditMsgId
      });
      await bot.editMessageText(
        `⏹️ This cashout has been resolved by admin. No further edits are possible.\n🆔 Cashout ID: ${cashoutId}`,
        { chat_id: pending.userChatId, message_id: pending.userEditMsgId }
      );
    } catch (_) {}
    pendingCashouts.delete(cashoutId);
  }

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
    const state = userState.get(chatId);

    // ─── DENY (admin only) ────────────────────────────────────────────────────
    if (data.startsWith("cashout_deny_")) {
      const cashoutId = data.replace("cashout_deny_", "");
      const adminData = adminMessages.get(query.message?.message_id!);
      const denierId = query.from?.id;

      if (denierId !== ADMIN_ID) {
        await bot.answerCallbackQuery(query.id, { text: "❌ Only admin can deny cashouts!", show_alert: true });
        return;
      }

      if (adminData && adminData.cashoutId === cashoutId) {
        const { state: cashoutState, chatId: originalChatId } = adminData;
        const denierName = query.from?.first_name || query.from?.username || "Unknown";

        const deniedMsg = `❌ **DENIED** by ${denierName}\n\n📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${cashoutState.game}\n🎯 Points Redeemed: ${cashoutState.points}\n🎫 Playback Points: ${cashoutState.playback_points}\n💵 Tip: $${cashoutState.tip}\n💰 Final Cashout: $${cashoutState.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${cashoutState.employeeName}\n🆔 Cashout ID: ${cashoutId}\n\nThis cashout has been denied. The employee can start a new cashout with /co`;

        await bot.editMessageText(deniedMsg, {
          chat_id: originalChatId,
          message_id: query.message?.message_id!
        }).catch(() => {});

        try {
          await bot.sendMessage(REPORT_GROUP_ID, `❌ **CASHOUT DENIED**\n\n👤 Employee: ${cashoutState.employeeName}\n🎮 Game: ${cashoutState.game}\n💰 Amount: $${cashoutState.amount}\n👨‍⚖️ Denied By: ${denierName} (Admin)\n🆔 Cashout ID: ${cashoutId}`);
        } catch (err) {
          console.error(`[Report] Failed to send denial to Report Group:`, err);
        }

        adminMessages.delete(query.message?.message_id!);
        await disableUserControlMsg(cashoutId);
      }

      await bot.answerCallbackQuery(query.id, { text: "❌ Cashout Denied!", show_alert: true });
      return;
    }

    // ─── APPROVE (admin only) ─────────────────────────────────────────────────
    if (data.startsWith("cashout_approve_")) {
      const cashoutId = data.replace("cashout_approve_", "");
      const adminData = adminMessages.get(query.message?.message_id!);
      const approverId = query.from?.id;

      if (approverId !== ADMIN_ID) {
        await bot.answerCallbackQuery(query.id, { text: "❌ Only admin can approve cashouts!", show_alert: true });
        return;
      }

      if (adminData && adminData.cashoutId === cashoutId) {
        const { state: coState, chatId: originalChatId } = adminData;
        const approverName = query.from?.first_name || query.from?.username || "Unknown";

        saveCashoutRecord(coState);

        const approvedMsg = `✅ **APPROVED** by ${approverName}\n\n📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${coState.game}\n🎯 Points Redeemed: ${coState.points}\n🎫 Playback Points: ${coState.playback_points}\n💵 Tip: $${coState.tip}\n💰 Final Cashout: $${coState.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${coState.employeeName}\n🆔 Cashout ID: ${cashoutId}`;

        await bot.editMessageText(approvedMsg, {
          chat_id: originalChatId,
          message_id: query.message?.message_id!
        }).catch(() => {});

        const reportMsg = `✅ **CASHOUT APPROVED & RECORDED**\n\n📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${coState.game}\n🎯 Points Redeemed: ${coState.points}\n🎫 Playback Points: ${coState.playback_points}\n💵 Tip: $${coState.tip}\n💰 Final Cashout: $${coState.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${coState.employeeName}\n👨‍⚖️ Approved By: ${approverName} (Admin)\n🆔 Cashout ID: ${cashoutId}\n📅 Created: ${coState.createdAt}\n📅 Approved: ${getCST().isoTime}`;

        try {
          await bot.sendMessage(REPORT_GROUP_ID, reportMsg);

          if (coState.mediaType === "photo" && coState.photoFileId) {
            await bot.sendPhoto(REPORT_GROUP_ID, coState.photoFileId, {
              caption: `📸 Payment Method Screenshot\n${coState.mediaCaption}`
            });
          } else if (coState.mediaType === "text" && coState.mediaCaption) {
            await bot.sendMessage(REPORT_GROUP_ID, `📝 Payment Details:\n${coState.mediaCaption}`);
          }
        } catch (err) {
          console.error(`[Report] Failed to send to Report Group:`, err);
        }

        adminMessages.delete(query.message?.message_id!);
        await disableUserControlMsg(cashoutId);
      }

      await bot.answerCallbackQuery(query.id, { text: "✅ Cashout Approved!", show_alert: true });
      return;
    }

    // ─── PENDING EDIT (user edits after submission) ───────────────────────────
    if (data.startsWith("pending_edit_")) {
      const cashoutId = data.replace("pending_edit_", "");
      const pending = pendingCashouts.get(cashoutId);

      if (!pending) {
        await bot.answerCallbackQuery(query.id, { text: "❌ This cashout is no longer editable.", show_alert: true });
        return;
      }

      // Restore state so user can go through review screen again
      userState.set(chatId, { ...pending.state, step: "cashout_review" });
      await bot.answerCallbackQuery(query.id, { text: "Opening edit screen..." });
      showCashoutReview(chatId, pending.state, bot);
      return;
    }

    // ─── PENDING CANCEL (user cancels after submission) ───────────────────────
    if (data.startsWith("pending_cancel_")) {
      const cashoutId = data.replace("pending_cancel_", "");
      const pending = pendingCashouts.get(cashoutId);

      if (!pending) {
        await bot.answerCallbackQuery(query.id, { text: "❌ This cashout is no longer active.", show_alert: true });
        return;
      }

      const cancelerName = query.from?.first_name || query.from?.username || "Unknown";

      // Remove from CSV (in case it was saved early — it's not, but just in case)
      removeCashoutRecord(cashoutId);

      // Disable admin approval message
      try {
        await bot.editMessageText(
          `🚫 **CASHOUT CANCELLED** by ${cancelerName}\n\n📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${pending.state.game}\n🎯 Points Redeemed: ${pending.state.points}\n🎫 Playback Points: ${pending.state.playback_points}\n💵 Tip: $${pending.state.tip}\n💰 Final Cashout: $${pending.state.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${pending.state.employeeName}\n🆔 Cashout ID: ${cashoutId}\n\nThis cashout was cancelled before admin review.`,
          { chat_id: pending.adminChatId, message_id: pending.adminMsgId }
        );
      } catch (_) {}

      // Notify report group
      try {
        await bot.sendMessage(REPORT_GROUP_ID, `🚫 **CASHOUT CANCELLED**\n\n👤 Employee: ${pending.state.employeeName}\n🎮 Game: ${pending.state.game}\n💰 Amount: $${pending.state.amount}\n🙋 Cancelled By: ${cancelerName}\n🆔 Cashout ID: ${cashoutId}`);
      } catch (_) {}

      // Clean up
      adminMessages.delete(pending.adminMsgId);
      pendingCashouts.delete(cashoutId);
      userState.delete(chatId);

      // Update the user control message
      try {
        await bot.editMessageText(
          `🚫 **Cashout Cancelled**\n\nYour cashout (ID: ${cashoutId}) has been cancelled successfully.`,
          { chat_id: chatId, message_id: query.message?.message_id! }
        );
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
          chat_id: chatId,
          message_id: query.message?.message_id!
        });
      } catch (_) {}

      await bot.answerCallbackQuery(query.id, { text: "🚫 Cashout cancelled!", show_alert: true });
      return;
    }

    if (!state) return;

    if (state.type === "income") {
      if (data.startsWith("num_")) {
        const action = data.replace("num_", "");
        if (action === "back") {
          state.amountInput = (state.amountInput || "").slice(0, -1);
        } else if (action === "dot") {
          if (!state.amountInput.includes(".")) state.amountInput += ".";
        } else if (action === "done") {
          const value = parseFloat(state.amountInput || "0");
          if (isNaN(value) || value <= 0) {
            await bot.answerCallbackQuery(query.id, { text: "Please enter a valid amount", show_alert: true });
            return;
          }
          state.amount = value;
          state.step = "game";
          await bot.sendMessage(chatId, `💰 Amount: $${value}\n\nSelect Game(s):`, gameKeyboard);
        } else {
          state.amountInput = (state.amountInput || "") + action;
        }
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (data.startsWith("game_")) {
        if (data === "game_done") {
          if (state.selectedGames.length === 0) {
            await bot.answerCallbackQuery(query.id, { text: "Please select at least one game", show_alert: true });
            return;
          }
          state.step = "points";
          state.amountInput = "";
          await bot.sendMessage(chatId, `🎮 Games: ${state.selectedGames.join(", ")}\n\nEnter Points:`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "1", callback_data: "num_1" }, { text: "2", callback_data: "num_2" }, { text: "3", callback_data: "num_3" }],
                [{ text: "4", callback_data: "num_4" }, { text: "5", callback_data: "num_5" }, { text: "6", callback_data: "num_6" }],
                [{ text: "7", callback_data: "num_7" }, { text: "8", callback_data: "num_8" }, { text: "9", callback_data: "num_9" }],
                [{ text: "0", callback_data: "num_0" }, { text: ".", callback_data: "num_dot" }],
                [{ text: "⬅️ Back", callback_data: "num_back" }, { text: "✅ Done", callback_data: "num_done" }]
              ]
            }
          });
        } else if (data === "game_Other") {
          state.step = "custom_game";
          await bot.sendMessage(chatId, "Type the custom game name:");
        } else {
          const game = data.replace("game_", "");
          if (!state.selectedGames.includes(game)) {
            state.selectedGames.push(game);
          }
          await bot.sendMessage(chatId, `✅ Selected: ${state.selectedGames.join(", ")}`, gameKeyboard);
        }
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (state.step === "points" && data.startsWith("num_")) {
        const action = data.replace("num_", "");
        if (action === "back") {
          state.amountInput = (state.amountInput || "").slice(0, -1);
        } else if (action === "dot") {
          if (!state.amountInput.includes(".")) state.amountInput += ".";
        } else if (action === "done") {
          const pts = parseFloat(state.amountInput || "0");
          if (isNaN(pts) || pts < 0) {
            await bot.answerCallbackQuery(query.id, { text: "Please enter valid points", show_alert: true });
            return;
          }
          state.points = pts;

          const cst = getCST();
          const gameStr = state.selectedGames.join(", ");
          const row = `${cst.date},${cst.time},${cst.day},"${state.groupName}","${state.employeeName}",${state.amount},"${gameStr}",${pts},\n`;
          fs.appendFileSync(RECORDS_FILE, row);

          const confirmMsg = `✅ **RECORDED**\n\n📊 TRANSACTION SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📅 Date: ${cst.date} ${cst.time}\n👤 Employee: ${state.employeeName}\n🏢 Group: ${state.groupName}\n💰 Amount: $${state.amount}\n🎮 Games: ${gameStr}\n🎯 Points: ${pts}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

          await bot.sendMessage(chatId, confirmMsg);

          try {
            await bot.sendMessage(REPORT_GROUP_ID, confirmMsg);
            if (state.originalChatId === chatId && state.originalMessageId) {
              await bot.forwardMessage(REPORT_GROUP_ID, chatId, state.originalMessageId);
            }
          } catch (e) {}

          userState.delete(chatId);
        } else {
          state.amountInput = (state.amountInput || "") + action;
        }
        await bot.answerCallbackQuery(query.id);
        return;
      }
    }

    if (state.type === "cashout") {
      if (data === "cashout_picture") {
        state.step = "waiting_picture";
        await bot.sendMessage(chatId, "📸 Please send the payment method screenshot:");
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (data === "cashout_text") {
        state.step = "waiting_text";
        await bot.sendMessage(chatId, "📝 Please type the payment details:");
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (data.startsWith("cashout_num_")) {
        const action = data.replace("cashout_num_", "");
        if (action === "back") {
          state.amountInput = (state.amountInput || "").slice(0, -1);
        } else if (action === "dot") {
          if (!(state.amountInput || "").includes(".")) state.amountInput = (state.amountInput || "") + ".";
        } else if (action === "done") {
          const value = parseFloat(state.amountInput || "0");
          if (state.step === "cashout_points") {
            state.points = value;
            state.step = "cashout_playback";
            state.amountInput = "0";
            await bot.sendMessage(chatId, `✅ Points: ${value}\n\nStep 3: Enter Playback Points (0 if none):`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "1", callback_data: "cashout_num_1" }, { text: "2", callback_data: "cashout_num_2" }, { text: "3", callback_data: "cashout_num_3" }],
                  [{ text: "4", callback_data: "cashout_num_4" }, { text: "5", callback_data: "cashout_num_5" }, { text: "6", callback_data: "cashout_num_6" }],
                  [{ text: "7", callback_data: "cashout_num_7" }, { text: "8", callback_data: "cashout_num_8" }, { text: "9", callback_data: "cashout_num_9" }],
                  [{ text: "0", callback_data: "cashout_num_0" }, { text: ".", callback_data: "cashout_num_dot" }],
                  [{ text: "⬅️ Back", callback_data: "cashout_num_back" }, { text: "✅ Done", callback_data: "cashout_num_done" }]
                ]
              }
            });
          } else if (state.step === "cashout_playback") {
            state.playback_points = value.toString();
            state.step = "cashout_tip";
            state.amountInput = "0";
            await bot.sendMessage(chatId, `✅ Playback: ${value}\n\nStep 4: Enter Tip Amount (0 if none):`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "1", callback_data: "cashout_num_1" }, { text: "2", callback_data: "cashout_num_2" }, { text: "3", callback_data: "cashout_num_3" }],
                  [{ text: "4", callback_data: "cashout_num_4" }, { text: "5", callback_data: "cashout_num_5" }, { text: "6", callback_data: "cashout_num_6" }],
                  [{ text: "7", callback_data: "cashout_num_7" }, { text: "8", callback_data: "cashout_num_8" }, { text: "9", callback_data: "cashout_num_9" }],
                  [{ text: "0", callback_data: "cashout_num_0" }, { text: ".", callback_data: "cashout_num_dot" }],
                  [{ text: "⬅️ Back", callback_data: "cashout_num_back" }, { text: "✅ Done", callback_data: "cashout_num_done" }]
                ]
              }
            });
          } else if (state.step === "cashout_tip") {
            state.tip = value;
            state.step = "cashout_amount";
            state.amountInput = "";
            await bot.sendMessage(chatId, `✅ Tip: $${value}\n\nStep 5: Enter Final Cashout Amount:`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "1", callback_data: "cashout_num_1" }, { text: "2", callback_data: "cashout_num_2" }, { text: "3", callback_data: "cashout_num_3" }],
                  [{ text: "4", callback_data: "cashout_num_4" }, { text: "5", callback_data: "cashout_num_5" }, { text: "6", callback_data: "cashout_num_6" }],
                  [{ text: "7", callback_data: "cashout_num_7" }, { text: "8", callback_data: "cashout_num_8" }, { text: "9", callback_data: "cashout_num_9" }],
                  [{ text: "0", callback_data: "cashout_num_0" }, { text: ".", callback_data: "cashout_num_dot" }],
                  [{ text: "⬅️ Back", callback_data: "cashout_num_back" }, { text: "✅ Done", callback_data: "cashout_num_done" }]
                ]
              }
            });
          } else if (state.step === "cashout_amount") {
            if (isNaN(value) || value <= 0) {
              await bot.answerCallbackQuery(query.id, { text: "Please enter a valid amount", show_alert: true });
              return;
            }
            state.amount = value;
            state.step = "cashout_review";
            showCashoutReview(chatId, state, bot);
          }
        } else {
          state.amountInput = (state.amountInput || "") + action;
        }
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (data.startsWith("game_") && state.step === "cashout_game") {
        if (data === "game_done") {
          if (!state.game) {
            await bot.answerCallbackQuery(query.id, { text: "Please select a game first", show_alert: true });
            return;
          }
          state.step = "cashout_points";
          state.amountInput = "";
          await bot.sendMessage(chatId, `✅ Game: ${state.game}\n\nStep 2: Enter Points Redeemed:`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "1", callback_data: "cashout_num_1" }, { text: "2", callback_data: "cashout_num_2" }, { text: "3", callback_data: "cashout_num_3" }],
                [{ text: "4", callback_data: "cashout_num_4" }, { text: "5", callback_data: "cashout_num_5" }, { text: "6", callback_data: "cashout_num_6" }],
                [{ text: "7", callback_data: "cashout_num_7" }, { text: "8", callback_data: "cashout_num_8" }, { text: "9", callback_data: "cashout_num_9" }],
                [{ text: "0", callback_data: "cashout_num_0" }, { text: ".", callback_data: "cashout_num_dot" }],
                [{ text: "⬅️ Back", callback_data: "cashout_num_back" }, { text: "✅ Done", callback_data: "cashout_num_done" }]
              ]
            }
          });
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

      // ─── CONFIRM & SUBMIT ──────────────────────────────────────────────────
      if (data === "cashout_confirm") {
        state.step = "cashout_pending_admin";
        state.updatedAt = getCST().isoTime;

        const adminMsg = `📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Game: ${state.game}\n🎯 Points Redeemed: ${state.points}\n🎫 Playback Points: ${state.playback_points}\n💵 Tip: $${state.tip}\n💰 Final Cashout: $${state.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Employee: ${state.employeeName}\n🆔 Cashout ID: ${state.cashoutId}\n\n⏳ Waiting for admin approval...`;

        // Send admin approval message
        const adminMsgObj = await bot.sendMessage(chatId, adminMsg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ APPROVE", callback_data: `cashout_approve_${state.cashoutId}` }, { text: "❌ DENY", callback_data: `cashout_deny_${state.cashoutId}` }]
            ]
          }
        }).catch((err) => {
          console.error(`[Admin Notification] Failed to send:`, err);
          return null;
        });

        if (adminMsgObj) {
          adminMessages.set(adminMsgObj.message_id, { cashoutId: state.cashoutId, state: { ...state }, chatId });
          cashoutMessages.set(`${chatId}_summary_${adminMsgObj.message_id}`, state.cashoutId);

          // Send user a control message with Edit and Cancel buttons
          const userControlMsg = await bot.sendMessage(chatId,
            `✅ **Cashout Submitted!**\n\nYour cashout is pending admin approval.\n\n🆔 Cashout ID: ${state.cashoutId}\n💰 Amount: $${state.amount}\n🎮 Game: ${state.game}\n\nYou can still edit or cancel until admin acts:`,
            buildUserControlKeyboard(state.cashoutId)
          ).catch(() => null);

          // Store in pendingCashouts for edit/cancel
          pendingCashouts.set(state.cashoutId, {
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

      // ─── EDIT FIELDS (from review screen) ─────────────────────────────────
      if (data.startsWith("cashout_edit_")) {
        const field = data.replace("cashout_edit_", "");
        if (field === "game") {
          state.step = "cashout_game";
          await bot.sendMessage(chatId, `Current Game: ${state.game}\n\nSelect New Game:`, gameKeyboard);
        } else if (field === "points") {
          state.step = "cashout_points";
          state.amountInput = state.points.toString();
          await bot.sendMessage(chatId, `🎮 Current Points: ${state.points}\n\nEdit Points:`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "1", callback_data: "cashout_num_1" }, { text: "2", callback_data: "cashout_num_2" }, { text: "3", callback_data: "cashout_num_3" }],
                [{ text: "4", callback_data: "cashout_num_4" }, { text: "5", callback_data: "cashout_num_5" }, { text: "6", callback_data: "cashout_num_6" }],
                [{ text: "7", callback_data: "cashout_num_7" }, { text: "8", callback_data: "cashout_num_8" }, { text: "9", callback_data: "cashout_num_9" }],
                [{ text: "0", callback_data: "cashout_num_0" }, { text: ".", callback_data: "cashout_num_dot" }],
                [{ text: "⬅️ Back", callback_data: "cashout_num_back" }, { text: "✅ Done", callback_data: "cashout_num_done" }]
              ]
            }
          });
        } else if (field === "playback") {
          state.step = "cashout_playback";
          state.amountInput = state.playback_points;
          await bot.sendMessage(chatId, `🎫 Current Playback Points: ${state.playback_points}\n\nEdit Playback Points Value:`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "1", callback_data: "cashout_num_1" }, { text: "2", callback_data: "cashout_num_2" }, { text: "3", callback_data: "cashout_num_3" }],
                [{ text: "4", callback_data: "cashout_num_4" }, { text: "5", callback_data: "cashout_num_5" }, { text: "6", callback_data: "cashout_num_6" }],
                [{ text: "7", callback_data: "cashout_num_7" }, { text: "8", callback_data: "cashout_num_8" }, { text: "9", callback_data: "cashout_num_9" }],
                [{ text: "0", callback_data: "cashout_num_0" }, { text: ".", callback_data: "cashout_num_dot" }],
                [{ text: "⬅️ Back", callback_data: "cashout_num_back" }, { text: "✅ Done", callback_data: "cashout_num_done" }]
              ]
            }
          });
        } else if (field === "tip") {
          state.step = "cashout_tip";
          state.amountInput = state.tip.toString();
          await bot.sendMessage(chatId, `💵 Current Tip: $${state.tip}\n\nEdit Tip:`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "1", callback_data: "cashout_num_1" }, { text: "2", callback_data: "cashout_num_2" }, { text: "3", callback_data: "cashout_num_3" }],
                [{ text: "4", callback_data: "cashout_num_4" }, { text: "5", callback_data: "cashout_num_5" }, { text: "6", callback_data: "cashout_num_6" }],
                [{ text: "7", callback_data: "cashout_num_7" }, { text: "8", callback_data: "cashout_num_8" }, { text: "9", callback_data: "cashout_num_9" }],
                [{ text: "0", callback_data: "cashout_num_0" }, { text: ".", callback_data: "cashout_num_dot" }],
                [{ text: "⬅️ Back", callback_data: "cashout_num_back" }, { text: "✅ Done", callback_data: "cashout_num_done" }]
              ]
            }
          });
        } else if (field === "amount") {
          state.step = "cashout_amount";
          state.amountInput = state.amount.toString();
          await bot.sendMessage(chatId, `💰 Current Amount: $${state.amount}\n\nEdit Amount:`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "1", callback_data: "cashout_num_1" }, { text: "2", callback_data: "cashout_num_2" }, { text: "3", callback_data: "cashout_num_3" }],
                [{ text: "4", callback_data: "cashout_num_4" }, { text: "5", callback_data: "cashout_num_5" }, { text: "6", callback_data: "cashout_num_6" }],
                [{ text: "7", callback_data: "cashout_num_7" }, { text: "8", callback_data: "cashout_num_8" }, { text: "9", callback_data: "cashout_num_9" }],
                [{ text: "0", callback_data: "cashout_num_0" }, { text: ".", callback_data: "cashout_num_dot" }],
                [{ text: "⬅️ Back", callback_data: "cashout_num_back" }, { text: "✅ Done", callback_data: "cashout_num_done" }]
              ]
            }
          });
        }
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
        state.selectedGames.push(msg.text!.trim());
        state.step = "game";
        await bot.sendMessage(chatId, `Added "${msg.text}"\nSelected: ${state.selectedGames.join(", ")}`, gameKeyboard);
      }

      if (state.type === "cashout" && state.step === "waiting_text") {
        state.mediaCaption = msg.text;
        state.mediaType = "text";
        state.textMessageId = msg.message_id;
        state.step = "cashout_game";
        state.amountInput = "";
        cashoutMessages.set(`${chatId}_text_${msg.message_id}`, state.cashoutId);
        await bot.sendMessage(chatId, `✅ Details received: "${msg.text}"\n\nStep 1: Select Game:`, gameKeyboard);
      }

      if (state.type === "cashout" && state.step === "cashout_custom_game") {
        state.game = msg.text;
        state.step = "cashout_points";
        state.amountInput = "";
        await bot.sendMessage(chatId, `✅ Game: ${msg.text}\n\nStep 2: Enter Points Redeemed:`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "1", callback_data: "cashout_num_1" }, { text: "2", callback_data: "cashout_num_2" }, { text: "3", callback_data: "cashout_num_3" }],
              [{ text: "4", callback_data: "cashout_num_4" }, { text: "5", callback_data: "cashout_num_5" }, { text: "6", callback_data: "cashout_num_6" }],
              [{ text: "7", callback_data: "cashout_num_7" }, { text: "8", callback_data: "cashout_num_8" }, { text: "9", callback_data: "cashout_num_9" }],
              [{ text: "0", callback_data: "cashout_num_0" }, { text: ".", callback_data: "cashout_num_dot" }],
              [{ text: "⬅️ Back", callback_data: "cashout_num_back" }, { text: "✅ Done", callback_data: "cashout_num_done" }]
            ]
          }
        });
      }
    }
  });

  // ─── /delete HANDLER ────────────────────────────────────────────────────────
  bot.onText(/\/delete/, async (msg) => {
    if (!msg.reply_to_message) {
      await bot.sendMessage(msg.chat.id, "❌ Please **reply** to the message you want to delete with /delete");
      return;
    }

    const chatId = msg.chat.id;
    const repliedToMsgId = msg.reply_to_message.message_id;

    // ── CASHOUT GROUP: delete a cashout record ──────────────────────────────
    if (chatId === CASHOUT_GROUP_ID) {
      // Check if the replied-to message is a tracked cashout group confirmation
      const cashoutId = cashoutGroupMsgToCashoutId.get(repliedToMsgId);

      if (cashoutId) {
        removeCashoutRecord(cashoutId);
        cashoutGroupMsgToCashoutId.delete(repliedToMsgId);

        const deleterName = msg.from?.first_name || msg.from?.username || "Unknown";
        await bot.sendMessage(chatId, `🗑️ Cashout **${cashoutId}** has been deleted and removed from records.\nDeleted by: ${deleterName}`);

        try {
          await bot.sendMessage(REPORT_GROUP_ID, `🗑️ **CASHOUT DELETED**\n\nCashout ID: ${cashoutId}\nDeleted by: ${deleterName}`);
        } catch (e) {}
        return;
      }

      // If not tracked by cashoutGroupMsgToCashoutId, try to find by text content of the replied message
      const repliedText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
      const idMatch = repliedText.match(/CO_\d+_[a-z0-9]+/);
      if (idMatch) {
        const cashoutId = idMatch[0];
        removeCashoutRecord(cashoutId);
        const deleterName = msg.from?.first_name || msg.from?.username || "Unknown";
        await bot.sendMessage(chatId, `🗑️ Cashout **${cashoutId}** has been deleted and removed from records.\nDeleted by: ${deleterName}`);
        try {
          await bot.sendMessage(REPORT_GROUP_ID, `🗑️ **CASHOUT DELETED**\n\nCashout ID: ${cashoutId}\nDeleted by: ${deleterName}`);
        } catch (e) {}
        return;
      }

      await bot.sendMessage(chatId, "❌ Could not identify the cashout from the replied message. Make sure you reply to a cashout confirmation message.");
      return;
    }

    // ── CASH-IN GROUP: delete a cash-in record (original behaviour) ─────────
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

  bot.on("deleted_message", async (msg) => {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const state = userState.get(chatId);

    if (!state || state.type !== "cashout") return;

    const photoKey = `${chatId}_photo_${messageId}`;
    const textKey = `${chatId}_text_${messageId}`;

    const cashoutId = cashoutMessages.get(photoKey) || cashoutMessages.get(textKey) || adminMessages.get(messageId)?.cashoutId;

    if (cashoutId) {
      console.log(`[Deletion] Cashout ${cashoutId} cancelled due to message deletion`);

      removeCashoutRecord(cashoutId);

      cashoutMessages.delete(photoKey);
      cashoutMessages.delete(textKey);
      adminMessages.delete(messageId);

      userState.delete(chatId);

      try {
        await bot.sendMessage(chatId, `❌ **CASHOUT CANCELLED**\n\nCashout ID: ${cashoutId}\nReason: Supporting document was deleted.\n\nPlease start over with /co if needed.`);
      } catch (e) {}
    }
  });

  bot.onText(/\/start|\/ help/, async (msg) => {
    await bot.sendMessage(msg.chat.id, "👋 Send a screenshot to start.\n\nReply to a screenshot with `/delete` to remove it.\n\nUse `/cashout` or `/co` to start a cashout request.\n\nIn the cashout group, reply to a cashout confirmation with `/delete` to remove that cashout.");
  });

  const webhookPath = `/bot${token}`;
  bot.setWebHook(baseUrl + webhookPath)
    .then(() => console.log("✅ Webhook set successfully"))
    .catch(err => console.error("Webhook failed:", err));

  console.log("[Bot] Ready with Income & Cashout flows");
  return bot;
}

function showCashoutReview(chatId: number, state: any, bot: TelegramBot) {
  const reviewText = `📊 CASHOUT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎮 Game: ${state.game}
🎯 Points Redeemed: ${state.points}
🎫 Playback Points: ${state.playback_points}
💵 Tip: $${state.tip}
💰 Final Cashout: $${state.amount}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Employee: ${state.employeeName}
🆔 Cashout ID: ${state.cashoutId}

**All fields are editable. Click to edit or confirm:**`;

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
