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
    time: cstTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
    day: cstTime.toLocaleDateString("en-US", { weekday: "long" }),
    isoTime: cstTime.toISOString(),
  };
}

function generateCashoutId() {
  return `CO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ─── Build the income menu message + keyboard ───────────────────────────────
function buildIncomeMenu(state: any) {
  const amount = state.amount > 0 ? `$${state.amount}` : "─ tap to set";
  const games = state.selectedGames.length > 0 ? state.selectedGames.join(", ") : "─ tap to set";
  const pointsLine = state.selectedGames.length > 0
    ? state.selectedGames.map((g: string) => {
        const pts = state.gamePoints?.[g];
        return `  ${g}: ${pts !== undefined ? pts + " pts" : "─ tap to set"}`;
      }).join("\n")
    : "  ─ select game first";

  const text =
    `📸 *New Income Entry*\n` +
    `👤 ${state.employeeName} · ${state.groupName}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 Amount:  ${amount}\n` +
    `🎮 Game(s): ${games}\n` +
    `🎯 Points:\n${pointsLine}\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  const keyboard: any[][] = [
    [{ text: `💰 Set Amount${state.amount > 0 ? " ✅" : ""}`, callback_data: "im_edit_amount" }],
    [{ text: `🎮 Select Game(s)${state.selectedGames.length > 0 ? " ✅" : ""}`, callback_data: "im_edit_game" }],
  ];

  // one button per game to set its points
  for (const g of state.selectedGames) {
    const pts = state.gamePoints?.[g];
    keyboard.push([{ text: `🎯 Points for ${g}${pts !== undefined ? " ✅" : ""}`, callback_data: `im_edit_points_${g}` }]);
  }

  const allFilled = state.amount > 0 &&
    state.selectedGames.length > 0 &&
    state.selectedGames.every((g: string) => state.gamePoints?.[g] !== undefined);

  if (allFilled) {
    keyboard.push([{ text: "✅ Submit", callback_data: "im_submit" }]);
  }
  keyboard.push([{ text: "❌ Cancel", callback_data: "im_cancel" }]);

  return { text, keyboard };
}

// ─── Build the cashout menu message + keyboard ───────────────────────────────
function buildCashoutMenu(state: any) {
  const text =
    `💸 *Cashout Request*\n` +
    `👤 ${state.employeeName} · ${state.groupName}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎮 Game:           ${state.game || "─ tap to set"}\n` +
    `🎯 Points:         ${state.points > 0 ? state.points : "─ tap to set"}\n` +
    `🎫 Playback:       ${state.playback_points !== "" ? state.playback_points : "─ tap to set"}\n` +
    `💵 Tip:            ${state.tip !== "" ? "$" + state.tip : "─ tap to set"}\n` +
    `💰 Amount:         ${state.amount > 0 ? "$" + state.amount : "─ tap to set"}\n` +
    `📎 Payment:        ${state.mediaType ? (state.mediaType === "photo" ? "📸 Photo" : "📝 Text") : "─ tap to set"}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 ID: \`${state.cashoutId}\``;

  const keyboard: any[][] = [
    [
      { text: `🎮 Game${state.game ? " ✅" : ""}`, callback_data: "co_edit_game" },
      { text: `🎯 Points${state.points > 0 ? " ✅" : ""}`, callback_data: "co_edit_points" },
    ],
    [
      { text: `🎫 Playback${state.playback_points !== "" ? " ✅" : ""}`, callback_data: "co_edit_playback" },
      { text: `💵 Tip${state.tip !== "" ? " ✅" : ""}`, callback_data: "co_edit_tip" },
    ],
    [
      { text: `💰 Amount${state.amount > 0 ? " ✅" : ""}`, callback_data: "co_edit_amount" },
      { text: `📎 Payment${state.mediaType ? " ✅" : ""}`, callback_data: "co_edit_media" },
    ],
  ];

  const allFilled =
    state.game &&
    state.points > 0 &&
    state.playback_points !== "" &&
    state.tip !== "" &&
    state.amount > 0 &&
    state.mediaType;

  if (allFilled) {
    keyboard.push([{ text: "✅ Submit Cashout", callback_data: "co_submit" }]);
  }
  keyboard.push([{ text: "❌ Cancel", callback_data: "co_cancel" }]);

  return { text, keyboard };
}

// ─── Number pad keyboard ─────────────────────────────────────────────────────
function numpad(prefix: string) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "1", callback_data: `${prefix}_1` }, { text: "2", callback_data: `${prefix}_2` }, { text: "3", callback_data: `${prefix}_3` }],
        [{ text: "4", callback_data: `${prefix}_4` }, { text: "5", callback_data: `${prefix}_5` }, { text: "6", callback_data: `${prefix}_6` }],
        [{ text: "7", callback_data: `${prefix}_7` }, { text: "8", callback_data: `${prefix}_8` }, { text: "9", callback_data: `${prefix}_9` }],
        [{ text: "0", callback_data: `${prefix}_0` }, { text: ".", callback_data: `${prefix}_dot` }],
        [{ text: "⬅️ Back", callback_data: `${prefix}_back` }, { text: "✅ Done", callback_data: `${prefix}_done` }],
      ],
    },
  };
}

const gameKeyboard = (prefix: string) => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: "FK", callback_data: `${prefix}_FK` }, { text: "JW", callback_data: `${prefix}_JW` }, { text: "GV", callback_data: `${prefix}_GV` }],
      [{ text: "Orion", callback_data: `${prefix}_Orion` }, { text: "MW", callback_data: `${prefix}_MW` }, { text: "VS", callback_data: `${prefix}_VS` }],
      [{ text: "FunStation", callback_data: `${prefix}_FunStation` }, { text: "PM", callback_data: `${prefix}_PM` }, { text: "CM", callback_data: `${prefix}_CM` }],
      [{ text: "UP", callback_data: `${prefix}_UP` }, { text: "Monstor", callback_data: `${prefix}_Monstor` }, { text: "Other", callback_data: `${prefix}_Other` }],
      [{ text: "✅ Done", callback_data: `${prefix}_done` }],
    ],
  },
});

export function initTelegramBot(token: string, baseUrl: string): TelegramBot {
  const bot = new TelegramBot(token);
  console.log("[Bot] Starting with Income & Cashout flows");

  // state maps
  const userState = new Map<number, any>();       // chatId → state
  const menuMsgId = new Map<number, number>();     // chatId → menu message id
  const inputMsgId = new Map<number, number>();    // chatId → active numpad/prompt message id
  const adminMessages = new Map<number, any>();    // adminMsgId → data
  const pendingCashouts = new Map<string, any>();  // cashoutId → data

  // ── helpers ──────────────────────────────────────────────────────────────

  async function refreshIncomeMenu(chatId: number) {
    const state = userState.get(chatId);
    if (!state) return;
    const { text, keyboard } = buildIncomeMenu(state);
    const mid = menuMsgId.get(chatId);
    if (mid) {
      await bot.editMessageText(text, {
        chat_id: chatId, message_id: mid,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      }).catch(() => {});
    }
  }

  async function refreshCashoutMenu(chatId: number) {
    const state = userState.get(chatId);
    if (!state) return;
    const { text, keyboard } = buildCashoutMenu(state);
    const mid = menuMsgId.get(chatId);
    if (mid) {
      await bot.editMessageText(text, {
        chat_id: chatId, message_id: mid,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      }).catch(() => {});
    }
  }

  async function deleteInputMsg(chatId: number) {
    const mid = inputMsgId.get(chatId);
    if (mid) { await bot.deleteMessage(chatId, mid).catch(() => {}); inputMsgId.delete(chatId); }
  }

  // ── photo handler (income) ────────────────────────────────────────────────
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const state = userState.get(chatId);

    // cashout: photo as payment proof
    if (state?.type === "cashout" && state.step === "waiting_media") {
      state.mediaType = "photo";
      state.mediaCaption = msg.caption || "Payment screenshot";
      state.photoFileId = msg.photo?.[msg.photo.length - 1]?.file_id;
      state.step = "menu";
      userState.set(chatId, state);
      await deleteInputMsg(chatId);
      await refreshCashoutMenu(chatId);
      return;
    }

    // new income entry
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";
    const groupName = msg.chat.title || "Unknown Group";
    const newState = {
      type: "income",
      step: "menu",
      amount: 0,
      amountInput: "",
      selectedGames: [] as string[],
      gamePoints: {} as Record<string, number>,
      currentEditGame: null as string | null,
      employeeName,
      groupName,
      originalMessageId: msg.message_id,
      originalChatId: chatId,
    };
    userState.set(chatId, newState);

    const { text, keyboard } = buildIncomeMenu(newState);
    const sentMsg = await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
    menuMsgId.set(chatId, sentMsg.message_id);
  });

  // ── /cashout command ──────────────────────────────────────────────────────
  bot.onText(/\/(cashout|co)/, async (msg) => {
    const chatId = msg.chat.id;
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";
    const groupName = msg.chat.title || "Unknown Group";
    const cashoutId = generateCashoutId();

    const newState = {
      type: "cashout",
      step: "menu",
      cashoutId,
      employeeName,
      groupName,
      createdAt: getCST().isoTime,
      updatedAt: getCST().isoTime,
      amount: 0,
      amountInput: "",
      game: "",
      points: 0,
      playback_points: "",
      tip: "",
      mediaType: null as string | null,
      mediaCaption: "",
      photoFileId: null as string | null,
    };
    userState.set(chatId, newState);

    const { text, keyboard } = buildCashoutMenu(newState);
    const sentMsg = await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
    menuMsgId.set(chatId, sentMsg.message_id);
  });

  // ── text handler ──────────────────────────────────────────────────────────
  bot.on("text", async (msg) => {
    if (msg.text?.startsWith("/")) return;
    const chatId = msg.chat.id;
    const state = userState.get(chatId);
    if (!state) return;

    // income: custom game name
    if (state.type === "income" && state.step === "custom_game") {
      const name = msg.text!.trim();
      if (!state.selectedGames.includes(name)) state.selectedGames.push(name);
      state.step = "menu";
      await deleteInputMsg(chatId);
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      await refreshIncomeMenu(chatId);
      return;
    }

    // cashout: text payment details
    if (state.type === "cashout" && state.step === "waiting_media") {
      state.mediaType = "text";
      state.mediaCaption = msg.text!.trim();
      state.step = "menu";
      await deleteInputMsg(chatId);
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      await refreshCashoutMenu(chatId);
      return;
    }

    // cashout: custom game name
    if (state.type === "cashout" && state.step === "custom_game") {
      state.game = msg.text!.trim();
      state.step = "menu";
      await deleteInputMsg(chatId);
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      await refreshCashoutMenu(chatId);
      return;
    }
  });

  // ── callback_query handler ────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);

    await bot.answerCallbackQuery(query.id).catch(() => {});

    // ── Admin approve/deny ──────────────────────────────────────────────────
    if (data.startsWith("cashout_approve_") || data.startsWith("cashout_deny_")) {
      const isApprove = data.startsWith("cashout_approve_");
      const cashoutId = data.replace(isApprove ? "cashout_approve_" : "cashout_deny_", "");
      const adminData = adminMessages.get(query.message?.message_id!);
      if (query.from?.id !== ADMIN_ID) {
        await bot.answerCallbackQuery(query.id, { text: "❌ Only admin can do this!", show_alert: true });
        return;
      }
      if (adminData?.cashoutId === cashoutId) {
        const { state: coState, chatId: origChatId } = adminData;
        const actorName = query.from?.first_name || "Admin";
        const label = isApprove ? "✅ APPROVED" : "❌ DENIED";
        if (isApprove) saveCashoutRecord(coState);

        const summary =
          `${label} by ${actorName}\n\n` +
          `📊 CASHOUT SUMMARY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎮 Game: ${coState.game}\n🎯 Points: ${coState.points}\n` +
          `🎫 Playback: ${coState.playback_points}\n💵 Tip: $${coState.tip}\n` +
          `💰 Amount: $${coState.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 Employee: ${coState.employeeName}\n🆔 ID: ${cashoutId}`;

        await bot.editMessageText(summary, { chat_id: origChatId, message_id: query.message?.message_id! }).catch(() => {});

        try {
          await bot.sendMessage(REPORT_GROUP_ID, `${label}\n👤 ${coState.employeeName} · 💰 $${coState.amount} · 🆔 ${cashoutId}`);
          if (isApprove && coState.mediaType === "photo" && coState.photoFileId) {
            await bot.sendPhoto(REPORT_GROUP_ID, coState.photoFileId, { caption: `📸 Payment\n${coState.mediaCaption}` });
          } else if (isApprove && coState.mediaType === "text") {
            await bot.sendMessage(REPORT_GROUP_ID, `📝 Payment Details:\n${coState.mediaCaption}`);
          }
        } catch (_) {}

        adminMessages.delete(query.message?.message_id!);
        const pending = pendingCashouts.get(cashoutId);
        if (pending) {
          const userMsg = isApprove ? `✅ Cashout ${cashoutId} approved.` : `❌ Cashout ${cashoutId} denied.`;
          await bot.editMessageText(userMsg, { chat_id: pending.userChatId, message_id: pending.userEditMsgId }).catch(() => {});
          pendingCashouts.delete(cashoutId);
        }
      }
      return;
    }

    // ── User edit/cancel pending cashout ────────────────────────────────────
    if (data.startsWith("user_edit_")) {
      const cashoutId = data.replace("user_edit_", "");
      const pending = pendingCashouts.get(cashoutId);
      if (!pending) { await bot.answerCallbackQuery(query.id, { text: "No longer editable", show_alert: true }); return; }
      userState.set(chatId, { ...pending.state, step: "menu" });
      const { text, keyboard } = buildCashoutMenu(pending.state);
      const sentMsg = await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
      menuMsgId.set(chatId, sentMsg.message_id);
      return;
    }

    if (data.startsWith("user_cancel_")) {
      const cashoutId = data.replace("user_cancel_", "");
      const pending = pendingCashouts.get(cashoutId);
      if (!pending) { await bot.answerCallbackQuery(query.id, { text: "No longer active", show_alert: true }); return; }
      await bot.editMessageText(`🚫 Cancelled by user · 🆔 ${cashoutId}`, { chat_id: pending.adminChatId, message_id: pending.adminMsgId }).catch(() => {});
      adminMessages.delete(pending.adminMsgId);
      pendingCashouts.delete(cashoutId);
      userState.delete(chatId);
      await bot.editMessageText("🚫 Cancelled.", { chat_id: chatId, message_id: query.message?.message_id! }).catch(() => {});
      return;
    }

    if (!state) return;

    // ════════════════════════════════════════════════════════════════════════
    // INCOME FLOW
    // ════════════════════════════════════════════════════════════════════════
    if (state.type === "income") {

      // open amount numpad
      if (data === "im_edit_amount") {
        state.amountInput = state.amount > 0 ? state.amount.toString() : "";
        state.step = "amount";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `💰 Enter Amount:\n\n👉 ${state.amountInput || "0"}`, numpad("im_num"));
        inputMsgId.set(chatId, m.message_id);
        return;
      }

      // open game selector
      if (data === "im_edit_game") {
        state.step = "game";
        await deleteInputMsg(chatId);
        const selected = state.selectedGames.length > 0 ? `Selected: ${state.selectedGames.join(", ")}\n\n` : "";
        const m = await bot.sendMessage(chatId, `${selected}🎮 Select game(s), then tap Done:`, gameKeyboard("im_game"));
        inputMsgId.set(chatId, m.message_id);
        return;
      }

      // open points numpad for a specific game
      if (data.startsWith("im_edit_points_")) {
        const game = data.replace("im_edit_points_", "");
        state.currentEditGame = game;
        state.amountInput = state.gamePoints?.[game]?.toString() || "";
        state.step = "points";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `🎯 Points for ${game}:\n\n👉 ${state.amountInput || "0"}`, numpad("im_num"));
        inputMsgId.set(chatId, m.message_id);
        return;
      }

      // numpad input
      if (data.startsWith("im_num_")) {
        const action = data.replace("im_num_", "");
        if (action === "back") state.amountInput = (state.amountInput || "").slice(0, -1);
        else if (action === "dot") { if (!state.amountInput.includes(".")) state.amountInput += "."; }
        else if (action === "done") {
          const value = parseFloat(state.amountInput || "0");
          if (state.step === "amount") {
            if (!isNaN(value) && value > 0) { state.amount = value; state.step = "menu"; }
          } else if (state.step === "points" && state.currentEditGame) {
            if (!isNaN(value)) { state.gamePoints[state.currentEditGame] = value; state.currentEditGame = null; state.step = "menu"; }
          }
          await deleteInputMsg(chatId);
          await refreshIncomeMenu(chatId);
          return;
        } else { state.amountInput = (state.amountInput || "") + action; }

        // update numpad display
        const mid = inputMsgId.get(chatId);
        const label = state.step === "points" ? `🎯 Points for ${state.currentEditGame}` : "💰 Enter Amount";
        if (mid) {
          await bot.editMessageText(`${label}:\n\n👉 ${state.amountInput || "0"}`, {
            chat_id: chatId, message_id: mid, reply_markup: numpad("im_num").reply_markup,
          }).catch(() => {});
        }
        return;
      }

      // game selection
      if (data.startsWith("im_game_")) {
        const action = data.replace("im_game_", "");
        if (action === "done") {
          state.step = "menu";
          await deleteInputMsg(chatId);
          await refreshIncomeMenu(chatId);
        } else if (action === "Other") {
          state.step = "custom_game";
          await deleteInputMsg(chatId);
          const m = await bot.sendMessage(chatId, "✏️ Type the custom game name:");
          inputMsgId.set(chatId, m.message_id);
        } else {
          if (!state.selectedGames.includes(action)) state.selectedGames.push(action);
          const mid = inputMsgId.get(chatId);
          if (mid) {
            await bot.editMessageText(
              `Selected: ${state.selectedGames.join(", ")}\n\n🎮 Select more or tap Done:`,
              { chat_id: chatId, message_id: mid, reply_markup: gameKeyboard("im_game").reply_markup }
            ).catch(() => {});
          }
        }
        return;
      }

      // submit
      if (data === "im_submit") {
        const cst = getCST();
        for (const game of state.selectedGames) {
          const points = state.gamePoints[game] || 0;
          const row = `${cst.date},${cst.time},${cst.day},"${state.groupName}","${state.employeeName}",${state.amount},"${game}",${points},\n`;
          fs.appendFileSync(RECORDS_FILE, row);
        }
        let summary = `✅ *Payment Recorded*\n\n👤 ${state.employeeName} · ${state.groupName}\n💰 Amount: $${state.amount}\n\n*Games & Points:*\n`;
        state.selectedGames.forEach((g: string, i: number) => { summary += `${i + 1}. ${g}: ${state.gamePoints[g] || 0} pts\n`; });
        summary += `\n📅 ${cst.date} · ${cst.day} · ${cst.time}`;

        try {
          await bot.sendMessage(REPORT_GROUP_ID, summary, { parse_mode: "Markdown" });
          await bot.forwardMessage(REPORT_GROUP_ID, state.originalChatId, state.originalMessageId);
        } catch (_) {}

        // update the menu message to show success
        const mid = menuMsgId.get(chatId);
        if (mid) await bot.editMessageText(summary, { chat_id: chatId, message_id: mid, parse_mode: "Markdown" }).catch(() => {});
        userState.delete(chatId);
        menuMsgId.delete(chatId);
        return;
      }

      // cancel
      if (data === "im_cancel") {
        const mid = menuMsgId.get(chatId);
        if (mid) await bot.editMessageText("❌ Cancelled.", { chat_id: chatId, message_id: mid }).catch(() => {});
        userState.delete(chatId);
        menuMsgId.delete(chatId);
        await deleteInputMsg(chatId);
        return;
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // CASHOUT FLOW
    // ════════════════════════════════════════════════════════════════════════
    if (state.type === "cashout") {

      // open game selector
      if (data === "co_edit_game") {
        state.step = "game";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `🎮 Select game:`, gameKeyboard("co_game"));
        inputMsgId.set(chatId, m.message_id);
        return;
      }

      // game selection
      if (data.startsWith("co_game_")) {
        const action = data.replace("co_game_", "");
        if (action === "done") {
          state.step = "menu";
          await deleteInputMsg(chatId);
          await refreshCashoutMenu(chatId);
        } else if (action === "Other") {
          state.step = "custom_game";
          await deleteInputMsg(chatId);
          const m = await bot.sendMessage(chatId, "✏️ Type the custom game name:");
          inputMsgId.set(chatId, m.message_id);
        } else {
          state.game = action;
          state.step = "menu";
          await deleteInputMsg(chatId);
          await refreshCashoutMenu(chatId);
        }
        return;
      }

      // open numpad for a field
      const numpadFields: Record<string, { field: string; label: string }> = {
        co_edit_points:   { field: "points",         label: "🎯 Points Redeemed" },
        co_edit_playback: { field: "playback_points", label: "🎫 Playback Points" },
        co_edit_tip:      { field: "tip",             label: "💵 Tip" },
        co_edit_amount:   { field: "amount",           label: "💰 Cashout Amount" },
      };

      if (numpadFields[data]) {
        const { field, label } = numpadFields[data];
        state.step = field;
        state.amountInput = state[field]?.toString() || "";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `${label}:\n\n👉 ${state.amountInput || "0"}`, numpad("co_num"));
        inputMsgId.set(chatId, m.message_id);
        return;
      }

      // numpad input
      if (data.startsWith("co_num_")) {
        const action = data.replace("co_num_", "");
        if (action === "back") state.amountInput = (state.amountInput || "").slice(0, -1);
        else if (action === "dot") { if (!state.amountInput.includes(".")) state.amountInput += "."; }
        else if (action === "done") {
          const value = parseFloat(state.amountInput || "0");
          if (state.step === "points")         state.points = isNaN(value) ? 0 : value;
          else if (state.step === "playback_points") state.playback_points = state.amountInput || "0";
          else if (state.step === "tip")        state.tip = state.amountInput || "0";
          else if (state.step === "amount")     state.amount = isNaN(value) ? 0 : value;
          state.step = "menu";
          await deleteInputMsg(chatId);
          await refreshCashoutMenu(chatId);
          return;
        } else { state.amountInput = (state.amountInput || "") + action; }

        // labels for numpad display
        const labelMap: Record<string, string> = {
          points: "🎯 Points Redeemed",
          playback_points: "🎫 Playback Points",
          tip: "💵 Tip",
          amount: "💰 Cashout Amount",
        };
        const mid = inputMsgId.get(chatId);
        if (mid) {
          await bot.editMessageText(`${labelMap[state.step] || "Enter value"}:\n\n👉 ${state.amountInput || "0"}`, {
            chat_id: chatId, message_id: mid, reply_markup: numpad("co_num").reply_markup,
          }).catch(() => {});
        }
        return;
      }

      // payment method
      if (data === "co_edit_media") {
        state.step = "waiting_media";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, "📎 Send a photo, or type your payment details as text:");
        inputMsgId.set(chatId, m.message_id);
        return;
      }

      // submit cashout
      if (data === "co_submit") {
        state.updatedAt = getCST().isoTime;
        state.step = "pending_admin";

        const adminMsg =
          `📊 CASHOUT REQUEST\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎮 Game: ${state.game}\n🎯 Points: ${state.points}\n` +
          `🎫 Playback: ${state.playback_points}\n💵 Tip: $${state.tip}\n` +
          `💰 Amount: $${state.amount}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 ${state.employeeName} · ${state.groupName}\n🆔 ${state.cashoutId}`;

        const adminMsgObj = await bot.sendMessage(chatId, adminMsg, {
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ APPROVE", callback_data: `cashout_approve_${state.cashoutId}` },
              { text: "❌ DENY",    callback_data: `cashout_deny_${state.cashoutId}` },
            ]],
          },
        });

        if (adminMsgObj) {
          adminMessages.set(adminMsgObj.message_id, { cashoutId: state.cashoutId, state: { ...state }, chatId });
          const userControlMsg = await bot.sendMessage(chatId, `✅ Submitted · 🆔 ${state.cashoutId}\n\nEdit or cancel until admin acts:`, {
            reply_markup: {
              inline_keyboard: [[
                { text: "✏️ Edit", callback_data: `user_edit_${state.cashoutId}` },
                { text: "🗑️ Cancel", callback_data: `user_cancel_${state.cashoutId}` },
              ]],
            },
          });
          pendingCashouts.set(state.cashoutId, {
            state: { ...state },
            adminMsgId: adminMsgObj.message_id,
            adminChatId: chatId,
            userEditMsgId: userControlMsg?.message_id,
            userChatId: chatId,
          });
        }

        // update menu message to show submitted state
        const mid = menuMsgId.get(chatId);
        if (mid) await bot.editMessageText(`⏳ Cashout submitted · 🆔 ${state.cashoutId}\nWaiting for admin approval...`, { chat_id: chatId, message_id: mid }).catch(() => {});
        userState.delete(chatId);
        menuMsgId.delete(chatId);
        return;
      }

      // cancel
      if (data === "co_cancel") {
        const mid = menuMsgId.get(chatId);
        if (mid) await bot.editMessageText("❌ Cashout cancelled.", { chat_id: chatId, message_id: mid }).catch(() => {});
        userState.delete(chatId);
        menuMsgId.delete(chatId);
        await deleteInputMsg(chatId);
        return;
      }
    }
  });

  // ── /delete command ───────────────────────────────────────────────────────
  bot.onText(/\/delete/, async (msg) => {
    if (!msg.reply_to_message) {
      await bot.sendMessage(msg.chat.id, "❌ Reply to a message with /delete to remove it.");
      return;
    }
    const chatId = msg.chat.id;
    if (chatId === CASHOUT_GROUP_ID) {
      const text = msg.reply_to_message.text || msg.reply_to_message.caption || "";
      const match = text.match(/CO_\d+_[a-z0-9]+/);
      if (match) { removeCashoutRecord(match[0]); await bot.sendMessage(chatId, `🗑️ Deleted cashout: ${match[0]}`); }
      else await bot.sendMessage(chatId, "❌ Could not identify cashout ID.");
      return;
    }
    if (!fs.existsSync(RECORDS_FILE)) return;
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").trim().split("\n");
    if (lines.length <= 1) return;
    const lastLine = lines[lines.length - 1];
    const parts = lastLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const cst = getCST();
    const row = `${cst.date},${cst.time},${cst.day},"${parts[3] || ""}","${parts[4] || ""}",-${parseFloat(parts[5]) || 0},"${parts[6] || ""}",-${parseFloat(parts[7]) || 0},DELETED\n`;
    fs.appendFileSync(RECORDS_FILE, row);
    await bot.sendMessage(chatId, "✅ Record deleted.");
  });

  return bot;
}

function saveCashoutRecord(state: any) {
  const row = `"${state.cashoutId}","${state.createdAt}","${state.updatedAt}","${state.groupName}","${state.employeeName}",${state.amount},"${state.game}",${state.points},"${state.playback_points}",${state.tip}\n`;
  fs.appendFileSync(CASHOUT_RECORDS_FILE, row);
}

function removeCashoutRecord(cashoutId: string) {
  try {
    const content = fs.readFileSync(CASHOUT_RECORDS_FILE, "utf-8");
    const filtered = content.split("\n").filter(l => !l.includes(cashoutId));
    fs.writeFileSync(CASHOUT_RECORDS_FILE, filtered.join("\n"));
  } catch (_) {}
}
