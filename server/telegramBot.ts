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
  const hours = cstTime.getUTCHours();
  const minutes = cstTime.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return {
    date: cstTime.toISOString().split("T")[0],
    time: `${displayHour}:${minutes} ${ampm}`,
    day: cstTime.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    isoTime: cstTime.toISOString(),
  };
}

function generateCashoutId() {
  return `CO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function buildIncomeMenu(state: any) {
  const lines: string[] = [];
  lines.push(`📸 *New Income Entry*`);
  lines.push(`👤 ${state.employeeName} · ${state.groupName}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  if (state.selectedGames.length === 0) {
    lines.push(`🎮 Games: ─ tap to select`);
  } else {
    for (const g of state.selectedGames) {
      const amt = state.gameAmounts?.[g];
      const pts = state.gamePoints?.[g];
      lines.push(`🎮 ${g}: ${amt !== undefined ? "$" + amt : "─ set amount"} · ${pts !== undefined ? pts + " pts" : "─ set points"}`);
    }
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  const keyboard: any[][] = [
    [{ text: `🎮 Select Game(s)${state.selectedGames.length > 0 ? " ✅" : ""}`, callback_data: "im_edit_game" }],
  ];
  for (const g of state.selectedGames) {
    const hasAmt = state.gameAmounts?.[g] !== undefined;
    const hasPts = state.gamePoints?.[g] !== undefined;
    keyboard.push([
      { text: `💰 ${g} Amount${hasAmt ? " ✅" : ""}`, callback_data: `im_edit_amount_${g}` },
      { text: `🎯 ${g} Points${hasPts ? " ✅" : ""}`, callback_data: `im_edit_points_${g}` },
    ]);
  }
  const allFilled =
    state.selectedGames.length > 0 &&
    state.selectedGames.every((g: string) => state.gameAmounts?.[g] !== undefined && state.gamePoints?.[g] !== undefined);
  if (allFilled) keyboard.push([{ text: "✅ Submit", callback_data: "im_submit" }]);
  keyboard.push([{ text: "❌ Cancel", callback_data: "im_cancel" }]);
  return { text: lines.join("\n"), keyboard };
}

function buildCashoutMenu(state: any) {
  const text =
    `💸 *Cashout Request*\n` +
    `👤 ${state.employeeName} · ${state.groupName}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎮 Game:      ${state.game || "─ tap to set"}\n` +
    `🎯 Points:    ${state.points !== "" ? state.points : "─ tap to set"}\n` +
    `🎫 Playback:  ${state.playback_points !== "" ? state.playback_points : "─ tap to set"}\n` +
    `💵 Tip:       ${state.tip !== "" ? "$" + state.tip : "─ tap to set"}\n` +
    `💰 Amount:    ${state.amount !== "" ? "$" + state.amount : "─ tap to set"}\n` +
    `📎 Payment:   ${state.mediaType ? (state.mediaType === "photo" ? "📸 Photo" : "📝 Text") : "─ tap to set"}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 \`${state.cashoutId}\``;

  const keyboard: any[][] = [
    [
      { text: `🎮 Game${state.game ? " ✅" : ""}`, callback_data: "co_edit_game" },
      { text: `🎯 Points${state.points !== "" ? " ✅" : ""}`, callback_data: "co_edit_points" },
    ],
    [
      { text: `🎫 Playback${state.playback_points !== "" ? " ✅" : ""}`, callback_data: "co_edit_playback" },
      { text: `💵 Tip${state.tip !== "" ? " ✅" : ""}`, callback_data: "co_edit_tip" },
    ],
    [
      { text: `💰 Amount${state.amount !== "" ? " ✅" : ""}`, callback_data: "co_edit_amount" },
      { text: `📎 Payment${state.mediaType ? " ✅" : ""}`, callback_data: "co_edit_media" },
    ],
  ];
  const allFilled = state.game && state.points !== "" && state.playback_points !== "" && state.tip !== "" && state.amount !== "" && state.mediaType;
  if (allFilled) keyboard.push([{ text: "✅ Submit Cashout", callback_data: "co_submit" }]);
  keyboard.push([{ text: "❌ Cancel", callback_data: "co_cancel" }]);
  return { text, keyboard };
}

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

function gameKeyboard(prefix: string) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "FK", callback_data: `${prefix}_FK` }, { text: "JW", callback_data: `${prefix}_JW` }, { text: "GV", callback_data: `${prefix}_GV` }],
        [{ text: "Orion", callback_data: `${prefix}_Orion` }, { text: "MW", callback_data: `${prefix}_MW` }, { text: "VS", callback_data: `${prefix}_VS` }],
        [{ text: "FunStation", callback_data: `${prefix}_FunStation` }, { text: "PM", callback_data: `${prefix}_PM` }, { text: "CM", callback_data: `${prefix}_CM` }],
        [{ text: "UP", callback_data: `${prefix}_UP` }, { text: "Monstor", callback_data: `${prefix}_Monstor` }, { text: "Other", callback_data: `${prefix}_Other` }],
        [{ text: "✅ Done selecting", callback_data: `${prefix}_done` }],
      ],
    },
  };
}

export function initTelegramBot(token: string, baseUrl: string): TelegramBot {
  const bot = new TelegramBot(token);
  console.log("[Bot] Starting with Income & Cashout flows");

  const userState = new Map<number, any>();
  const menuMsgId = new Map<number, number>();
  const inputMsgId = new Map<number, number>();
  const adminMessages = new Map<number, any>();
  const pendingCashouts = new Map<string, any>();

  async function refreshIncomeMenu(chatId: number) {
    const state = userState.get(chatId);
    if (!state) return;
    const { text, keyboard } = buildIncomeMenu(state);
    const mid = menuMsgId.get(chatId);
    if (mid) {
      await bot.editMessageText(text, { chat_id: chatId, message_id: mid, parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } }).catch(() => {});
    }
  }

  async function refreshCashoutMenu(chatId: number) {
    const state = userState.get(chatId);
    if (!state) return;
    const { text, keyboard } = buildCashoutMenu(state);
    const mid = menuMsgId.get(chatId);
    if (mid) {
      await bot.editMessageText(text, { chat_id: chatId, message_id: mid, parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } }).catch(() => {});
    }
  }

  async function deleteInputMsg(chatId: number) {
    const mid = inputMsgId.get(chatId);
    if (mid) { await bot.deleteMessage(chatId, mid).catch(() => {}); inputMsgId.delete(chatId); }
  }

  async function startIncomeFlow(chatId: number, msg: any) {
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";
    const groupName = msg.chat?.title || "Unknown Group";
    const newState = {
      type: "income", step: "menu",
      selectedGames: [] as string[],
      gameAmounts: {} as Record<string, number>,
      gamePoints: {} as Record<string, number>,
      currentEditGame: null as string | null,
      currentEditField: null as string | null,
      amountInput: "",
      employeeName, groupName,
      originalMessageId: msg.message_id,
      originalChatId: chatId,
    };
    userState.set(chatId, newState);
    const { text, keyboard } = buildIncomeMenu(newState);
    const sentMsg = await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
    menuMsgId.set(chatId, sentMsg.message_id);
  }

  async function startCashoutFlow(chatId: number, msg: any) {
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";
    const groupName = msg.chat?.title || "Unknown Group";
    const cashoutId = generateCashoutId();
    const newState = {
      type: "cashout", step: "menu", cashoutId, employeeName, groupName,
      createdAt: getCST().isoTime, updatedAt: getCST().isoTime,
      amount: "", amountInput: "", game: "", points: "", playback_points: "", tip: "",
      mediaType: null as string | null, mediaCaption: "", photoFileId: null as string | null,
    };
    userState.set(chatId, newState);
    const { text, keyboard } = buildCashoutMenu(newState);
    const sentMsg = await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
    menuMsgId.set(chatId, sentMsg.message_id);
  }

  // /start — show Cash In / Cash Out choice
  bot.onText(/\/start/, async (msg) => {
    await bot.sendMessage(msg.chat.id, `👋 *What would you like to do?*`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "💵 Cash In", callback_data: "start_cashin" }],
          [{ text: "💸 Cash Out", callback_data: "start_cashout" }],
        ],
      },
    });
  });

  // Show menu when bot is added to a group
  bot.on("new_chat_members", async (msg) => {
    const newMembers: any[] = (msg as any).new_chat_members || [];
    const addedBot = newMembers.find((m: any) => m.is_bot);
    if (!addedBot) return;
    await bot.sendMessage(msg.chat.id,
      `👋 *Hello ${msg.chat.title}!*\n\nTap a button to get started:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💵 Cash In", callback_data: "start_cashin" }],
            [{ text: "💸 Cash Out", callback_data: "start_cashout" }],
          ],
        },
      }
    );
  });

  // Photo → start income flow
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const state = userState.get(chatId);
    if (state?.type === "cashout" && state.step === "waiting_media") {
      state.mediaType = "photo";
      state.mediaCaption = msg.caption || "Payment screenshot";
      state.photoFileId = msg.photo?.[msg.photo.length - 1]?.file_id;
      state.step = "menu";
      await deleteInputMsg(chatId);
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      await refreshCashoutMenu(chatId);
      return;
    }
    await startIncomeFlow(chatId, msg);
  });

  // /cashout command
  bot.onText(/\/(cashout|co)/, async (msg) => {
    await startCashoutFlow(msg.chat.id, msg);
  });

  // Text messages
  bot.on("text", async (msg) => {
    if (msg.text?.startsWith("/")) return;
    const chatId = msg.chat.id;
    const state = userState.get(chatId);
    if (!state) return;
    if (state.type === "income" && state.step === "custom_game") {
      const name = msg.text!.trim();
      if (!state.selectedGames.includes(name)) state.selectedGames.push(name);
      state.step = "menu";
      await deleteInputMsg(chatId);
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      await refreshIncomeMenu(chatId);
      return;
    }
    if (state.type === "cashout" && state.step === "waiting_media") {
      state.mediaType = "text";
      state.mediaCaption = msg.text!.trim();
      state.step = "menu";
      await deleteInputMsg(chatId);
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      await refreshCashoutMenu(chatId);
      return;
    }
    if (state.type === "cashout" && state.step === "custom_game") {
      state.game = msg.text!.trim();
      state.step = "menu";
      await deleteInputMsg(chatId);
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      await refreshCashoutMenu(chatId);
      return;
    }
  });

  // All callback queries
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);
    await bot.answerCallbackQuery(query.id).catch(() => {});

    // ── Start menu ──────────────────────────────────────────────────────────
    if (data === "start_cashin") {
      await bot.sendMessage(chatId, "📸 Send a photo/screenshot to start a Cash In entry.");
      return;
    }
    if (data === "start_cashout") {
      await startCashoutFlow(chatId, { from: query.from, chat: query.message!.chat, message_id: query.message!.message_id });
      return;
    }

    // ── Admin approve / deny ────────────────────────────────────────────────
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
          `${label} by ${actorName}\n\n📊 CASHOUT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎮 ${coState.game} · 🎯 ${coState.points} pts · 🎫 ${coState.playback_points} · 💵 $${coState.tip} tip\n` +
          `💰 $${coState.amount} · 👤 ${coState.employeeName}\n🆔 ${cashoutId}`;
        await bot.editMessageText(summary, { chat_id: origChatId, message_id: query.message?.message_id! }).catch(() => {});
        // compact report line
        try {
          await bot.sendMessage(REPORT_GROUP_ID,
            `${label} · 👤 ${coState.employeeName} · 🎮 ${coState.game} · 💰 $${coState.amount} · 🆔 ${cashoutId}`
          );
          if (isApprove && coState.mediaType === "photo" && coState.photoFileId) {
            await bot.sendPhoto(REPORT_GROUP_ID, coState.photoFileId, { caption: `📸 ${coState.employeeName} · $${coState.amount}` });
          } else if (isApprove && coState.mediaType === "text" && coState.mediaCaption) {
            await bot.sendMessage(REPORT_GROUP_ID, `📝 ${coState.employeeName}: ${coState.mediaCaption}`);
          }
        } catch (_) {}
        adminMessages.delete(query.message?.message_id!);
        const pending = pendingCashouts.get(cashoutId);
        if (pending) {
          await bot.editMessageText(
            isApprove ? `✅ Cashout $${coState.amount} approved.` : `❌ Cashout $${coState.amount} denied.`,
            { chat_id: pending.userChatId, message_id: pending.userEditMsgId }
          ).catch(() => {});
          pendingCashouts.delete(cashoutId);
        }
      }
      return;
    }

    // ── User edit / cancel ──────────────────────────────────────────────────
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
      await bot.editMessageText(`🚫 Cancelled · 🆔 ${cashoutId}`, { chat_id: pending.adminChatId, message_id: pending.adminMsgId }).catch(() => {});
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
      if (data === "im_edit_game") {
        state.step = "game";
        await deleteInputMsg(chatId);
        const selected = state.selectedGames.length > 0 ? `Selected: ${state.selectedGames.join(", ")}\n\n` : "";
        const m = await bot.sendMessage(chatId, `${selected}🎮 Select game(s), then tap Done:`, gameKeyboard("im_game"));
        inputMsgId.set(chatId, m.message_id);
        return;
      }

      if (data.startsWith("im_game_")) {
        const action = data.replace("im_game_", "");
        if (action === "done") {
          state.step = "menu"; await deleteInputMsg(chatId); await refreshIncomeMenu(chatId);
        } else if (action === "Other") {
          state.step = "custom_game"; await deleteInputMsg(chatId);
          const m = await bot.sendMessage(chatId, "✏️ Type the custom game name:"); inputMsgId.set(chatId, m.message_id);
        } else {
          if (!state.selectedGames.includes(action)) state.selectedGames.push(action);
          const mid = inputMsgId.get(chatId);
          if (mid) await bot.editMessageText(`Selected: ${state.selectedGames.join(", ")}\n\n🎮 Select more or tap Done:`, { chat_id: chatId, message_id: mid, reply_markup: gameKeyboard("im_game").reply_markup }).catch(() => {});
        }
        return;
      }

      if (data.startsWith("im_edit_amount_")) {
        const game = data.replace("im_edit_amount_", "");
        state.currentEditGame = game; state.currentEditField = "amount";
        state.amountInput = state.gameAmounts?.[game]?.toString() || "";
        state.step = "edit_amount"; await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `💰 Amount for *${game}*:\n\n👉 ${state.amountInput || "0"}`, { ...numpad("im_num"), parse_mode: "Markdown" });
        inputMsgId.set(chatId, m.message_id); return;
      }

      if (data.startsWith("im_edit_points_")) {
        const game = data.replace("im_edit_points_", "");
        state.currentEditGame = game; state.currentEditField = "points";
        state.amountInput = state.gamePoints?.[game]?.toString() || "";
        state.step = "edit_points"; await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `🎯 Points for *${game}*:\n\n👉 ${state.amountInput || "0"}`, { ...numpad("im_num"), parse_mode: "Markdown" });
        inputMsgId.set(chatId, m.message_id); return;
      }

      if (data.startsWith("im_num_")) {
        const action = data.replace("im_num_", "");
        if (action === "back") state.amountInput = (state.amountInput || "").slice(0, -1);
        else if (action === "dot") { if (!state.amountInput.includes(".")) state.amountInput += "."; }
        else if (action === "done") {
          const value = parseFloat(state.amountInput || "0");
          if (!isNaN(value) && state.currentEditGame) {
            if (state.currentEditField === "amount") state.gameAmounts[state.currentEditGame] = value;
            else if (state.currentEditField === "points") state.gamePoints[state.currentEditGame] = value;
          }
          state.currentEditGame = null; state.currentEditField = null; state.step = "menu";
          await deleteInputMsg(chatId); await refreshIncomeMenu(chatId); return;
        } else { state.amountInput = (state.amountInput || "") + action; }
        const label = state.currentEditField === "amount" ? `💰 Amount for *${state.currentEditGame}*` : `🎯 Points for *${state.currentEditGame}*`;
        const mid = inputMsgId.get(chatId);
        if (mid) await bot.editMessageText(`${label}:\n\n👉 ${state.amountInput || "0"}`, { chat_id: chatId, message_id: mid, parse_mode: "Markdown", reply_markup: numpad("im_num").reply_markup }).catch(() => {});
        return;
      }

      if (data === "im_submit") {
        const cst = getCST();
        for (const game of state.selectedGames) {
          const amount = state.gameAmounts[game] || 0;
          const points = state.gamePoints[game] || 0;
          fs.appendFileSync(RECORDS_FILE, `${cst.date},${cst.time},${cst.day},"${state.groupName}","${state.employeeName}",${amount},"${game}",${points},\n`);
        }
        let summary = `✅ *Payment Recorded*\n\n👤 ${state.employeeName} · ${state.groupName}\n\n*Games:*\n`;
        state.selectedGames.forEach((g: string, i: number) => { summary += `${i + 1}. ${g}: $${state.gameAmounts[g] || 0} · ${state.gamePoints[g] || 0} pts\n`; });
        summary += `\n📅 ${cst.date} · ${cst.day} · ${cst.time}`;
        try {
          const reportLine = state.selectedGames.map((g: string) => `💵 ${state.employeeName} · ${state.groupName} · ${g} · $${state.gameAmounts[g] || 0} · ${state.gamePoints[g] || 0} pts`).join("\n");
          await bot.sendMessage(REPORT_GROUP_ID, reportLine);
          if (state.originalChatId && state.originalMessageId) {
            await bot.forwardMessage(REPORT_GROUP_ID, state.originalChatId, state.originalMessageId);
          }
        } catch (_) {}
        const mid = menuMsgId.get(chatId);
        if (mid) await bot.editMessageText(summary, { chat_id: chatId, message_id: mid, parse_mode: "Markdown" }).catch(() => {});
        userState.delete(chatId); menuMsgId.delete(chatId); return;
      }

      if (data === "im_cancel") {
        const mid = menuMsgId.get(chatId);
        if (mid) await bot.editMessageText("❌ Cancelled.", { chat_id: chatId, message_id: mid }).catch(() => {});
        userState.delete(chatId); menuMsgId.delete(chatId); await deleteInputMsg(chatId); return;
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // CASHOUT FLOW
    // ════════════════════════════════════════════════════════════════════════
    if (state.type === "cashout") {
      if (data === "co_edit_game") {
        state.step = "game"; await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `🎮 Select game:`, gameKeyboard("co_game"));
        inputMsgId.set(chatId, m.message_id); return;
      }

      if (data.startsWith("co_game_")) {
        const action = data.replace("co_game_", "");
        if (action === "done") { state.step = "menu"; await deleteInputMsg(chatId); await refreshCashoutMenu(chatId); }
        else if (action === "Other") { state.step = "custom_game"; await deleteInputMsg(chatId); const m = await bot.sendMessage(chatId, "✏️ Type the custom game name:"); inputMsgId.set(chatId, m.message_id); }
        else { state.game = action; state.step = "menu"; await deleteInputMsg(chatId); await refreshCashoutMenu(chatId); }
        return;
      }

      const coFields: Record<string, { field: string; label: string }> = {
        co_edit_points:   { field: "points",         label: "🎯 Points Redeemed" },
        co_edit_playback: { field: "playback_points", label: "🎫 Playback Points" },
        co_edit_tip:      { field: "tip",             label: "💵 Tip" },
        co_edit_amount:   { field: "amount",           label: "💰 Cashout Amount" },
      };
      if (coFields[data]) {
        const { field, label } = coFields[data];
        state.step = field; state.amountInput = state[field]?.toString() || "";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `${label}:\n\n👉 ${state.amountInput || "0"}`, numpad("co_num"));
        inputMsgId.set(chatId, m.message_id); return;
      }

      if (data.startsWith("co_num_")) {
        const action = data.replace("co_num_", "");
        if (action === "back") state.amountInput = (state.amountInput || "").slice(0, -1);
        else if (action === "dot") { if (!state.amountInput.includes(".")) state.amountInput += "."; }
        else if (action === "done") {
          if (state.step === "points") state.points = state.amountInput || "0";
          else if (state.step === "playback_points") state.playback_points = state.amountInput || "0";
          else if (state.step === "tip") state.tip = state.amountInput || "0";
          else if (state.step === "amount") state.amount = state.amountInput || "0";
          state.step = "menu"; await deleteInputMsg(chatId); await refreshCashoutMenu(chatId); return;
        } else { state.amountInput = (state.amountInput || "") + action; }
        const lm: Record<string, string> = { points: "🎯 Points Redeemed", playback_points: "🎫 Playback Points", tip: "💵 Tip", amount: "💰 Cashout Amount" };
        const mid = inputMsgId.get(chatId);
        if (mid) await bot.editMessageText(`${lm[state.step] || "Enter value"}:\n\n👉 ${state.amountInput || "0"}`, { chat_id: chatId, message_id: mid, reply_markup: numpad("co_num").reply_markup }).catch(() => {});
        return;
      }

      if (data === "co_edit_media") {
        state.step = "waiting_media"; await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, "📎 Send a *photo* of payment, or type payment details as text:", { parse_mode: "Markdown" });
        inputMsgId.set(chatId, m.message_id); return;
      }

      if (data === "co_submit") {
        state.updatedAt = getCST().isoTime;
        const adminSummary =
          `📊 *CASHOUT REQUEST*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎮 ${state.game} · 🎯 ${state.points} pts · 🎫 ${state.playback_points} pb\n` +
          `💵 $${state.tip} tip · 💰 $${state.amount}\n` +
          `👤 ${state.employeeName} · ${state.groupName}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🆔 \`${state.cashoutId}\``;

        // Send media to CASHOUT GROUP first so admin sees it before approving
        try {
          if (state.mediaType === "photo" && state.photoFileId) {
            await bot.sendPhoto(CASHOUT_GROUP_ID, state.photoFileId, {
              caption: `📎 ${state.employeeName} · $${state.amount} · 🆔 ${state.cashoutId}`,
            });
          } else if (state.mediaType === "text" && state.mediaCaption) {
            await bot.sendMessage(CASHOUT_GROUP_ID, `📝 ${state.employeeName} · $${state.amount}\n${state.mediaCaption}\n🆔 ${state.cashoutId}`);
          }
        } catch (_) {}

        // Send approve/deny card to cashout group
        const adminMsgObj = await bot.sendMessage(CASHOUT_GROUP_ID, adminSummary, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "✅ APPROVE", callback_data: `cashout_approve_${state.cashoutId}` }, { text: "❌ DENY", callback_data: `cashout_deny_${state.cashoutId}` }]] },
        }).catch(() => null);

        // Send media to employee group too
        try {
          if (state.mediaType === "photo" && state.photoFileId) {
            await bot.sendPhoto(chatId, state.photoFileId, { caption: `📸 Payment submitted · 🆔 ${state.cashoutId}` });
          } else if (state.mediaType === "text" && state.mediaCaption) {
            await bot.sendMessage(chatId, `📝 Payment submitted:\n${state.mediaCaption}`);
          }
        } catch (_) {}

        if (adminMsgObj) {
          adminMessages.set(adminMsgObj.message_id, { cashoutId: state.cashoutId, state: { ...state }, chatId });
          const userControlMsg = await bot.sendMessage(chatId, `⏳ Submitted · 🆔 ${state.cashoutId}\n\nEdit or cancel while waiting:`, {
            reply_markup: { inline_keyboard: [[{ text: "✏️ Edit", callback_data: `user_edit_${state.cashoutId}` }, { text: "🗑️ Cancel", callback_data: `user_cancel_${state.cashoutId}` }]] },
          });
          pendingCashouts.set(state.cashoutId, {
            state: { ...state }, adminMsgId: adminMsgObj.message_id, adminChatId: CASHOUT_GROUP_ID,
            userEditMsgId: userControlMsg?.message_id, userChatId: chatId,
          });
        }

        const mid = menuMsgId.get(chatId);
        if (mid) await bot.editMessageText(`⏳ Cashout submitted · 🆔 ${state.cashoutId}`, { chat_id: chatId, message_id: mid }).catch(() => {});
        userState.delete(chatId); menuMsgId.delete(chatId); return;
      }

      if (data === "co_cancel") {
        const mid = menuMsgId.get(chatId);
        if (mid) await bot.editMessageText("❌ Cashout cancelled.", { chat_id: chatId, message_id: mid }).catch(() => {});
        userState.delete(chatId); menuMsgId.delete(chatId); await deleteInputMsg(chatId); return;
      }
    }
  });

  // /delete command
  bot.onText(/\/delete/, async (msg) => {
    if (!msg.reply_to_message) { await bot.sendMessage(msg.chat.id, "❌ Reply to a message with /delete to remove it."); return; }
    const chatId = msg.chat.id;
    if (chatId === CASHOUT_GROUP_ID) {
      const text = msg.reply_to_message.text || msg.reply_to_message.caption || "";
      const match = text.match(/CO_\d+_[a-z0-9]+/);
      if (match) { removeCashoutRecord(match[0]); await bot.sendMessage(chatId, `🗑️ Deleted: ${match[0]}`); }
      else await bot.sendMessage(chatId, "❌ Could not identify cashout ID.");
      return;
    }
    if (!fs.existsSync(RECORDS_FILE)) return;
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").trim().split("\n");
    if (lines.length <= 1) return;
    const parts = lines[lines.length - 1].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const cst = getCST();
    fs.appendFileSync(RECORDS_FILE, `${cst.date},${cst.time},${cst.day},"${parts[3] || ""}","${parts[4] || ""}",-${parseFloat(parts[5]) || 0},"${parts[6] || ""}",-${parseFloat(parts[7]) || 0},DELETED\n`);
    await bot.sendMessage(chatId, "✅ Record deleted.");
  });

  return bot;
}

function saveCashoutRecord(state: any) {
  fs.appendFileSync(CASHOUT_RECORDS_FILE, `"${state.cashoutId}","${state.createdAt}","${state.updatedAt}","${state.groupName}","${state.employeeName}",${state.amount},"${state.game}",${state.points},"${state.playback_points}",${state.tip}\n`);
}

function removeCashoutRecord(cashoutId: string) {
  try {
    const content = fs.readFileSync(CASHOUT_RECORDS_FILE, "utf-8");
    fs.writeFileSync(CASHOUT_RECORDS_FILE, content.split("\n").filter(l => !l.includes(cashoutId)).join("\n"));
  } catch (_) {}
}
