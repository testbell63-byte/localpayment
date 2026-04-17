import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

const RECORDS_FILE = path.join(process.cwd(), "records.csv");
const CASHOUT_RECORDS_FILE = path.join(process.cwd(), "cashout_records.csv");
const REPORT_GROUP_ID = -1003718366443;
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

// ─── Income menu ──────────────────────────────────────────────────────────────
function buildIncomeMenu(state: any) {
  const gameLines = state.selectedGames.length > 0
    ? state.selectedGames.map((g: string) => {
        const amt = state.gameAmounts?.[g] !== undefined ? `$${state.gameAmounts[g]}` : "─";
        const pts = state.gamePoints?.[g] !== undefined ? `${state.gamePoints[g]} pts` : "─";
        return `  ${g}: ${amt} · ${pts}`;
      }).join("\n")
    : "  ─ select games first";

  const text =
    `📸 *New Income Entry*\n` +
    `👤 ${state.employeeName} · ${state.groupName}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎮 Game(s): ${state.selectedGames.length > 0 ? state.selectedGames.join(", ") : "─ tap to set"}\n` +
    `💰 Per-game Amount & Points:\n${gameLines}\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

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
    state.selectedGames.every((g: string) =>
      state.gameAmounts?.[g] !== undefined && state.gamePoints?.[g] !== undefined
    );
  if (allFilled) keyboard.push([{ text: "✅ Submit", callback_data: "im_submit" }]);
  keyboard.push([{ text: "❌ Cancel", callback_data: "im_cancel" }]);
  return { text, keyboard };
}

// ─── Cashout review screen ────────────────────────────────────────────────────
function buildCashoutReview(state: any) {
  const text =
    `💸 *Cashout Review*\n` +
    `👤 ${state.employeeName} · ${state.groupName}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎮 Game:     ${state.game}\n` +
    `🎯 Points:   ${state.points}\n` +
    `🎫 Playback: ${state.playback_points > 0 ? state.playback_points : "None"}\n` +
    `💵 Tip:      ${state.tip > 0 ? "$" + state.tip : "None"}\n` +
    `💰 Amount:   $${state.amount}\n` +
    `📎 Payment:  ${state.mediaType === "photo" ? "📸 Photo ✅" : state.mediaType === "text" ? "📝 Text ✅" : "─"}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 \`${state.cashoutId}\`\n\nEverything look good?`;

  const keyboard: any[][] = [
    [
      { text: "✅ Submit for Approval", callback_data: "co_submit" },
      { text: "✏️ Edit", callback_data: "co_review_edit" },
    ],
    [{ text: "❌ Cancel", callback_data: "co_cancel" }],
  ];
  return { text, keyboard };
}

// ─── Cashout edit menu ────────────────────────────────────────────────────────
function buildCashoutEditMenu(state: any) {
  const text =
    `✏️ *Edit Cashout*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎮 Game:     ${state.game || "─"}\n` +
    `🎯 Points:   ${state.points > 0 ? state.points : "─"}\n` +
    `🎫 Playback: ${state.playback_points > 0 ? state.playback_points : "None"}\n` +
    `💵 Tip:      ${state.tip > 0 ? "$" + state.tip : "None"}\n` +
    `💰 Amount:   ${state.amount > 0 ? "$" + state.amount : "─"}\n` +
    `📎 Payment:  ${state.mediaType === "photo" ? "📸 Photo ✅" : state.mediaType === "text" ? "📝 Text ✅" : "─"}\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  const keyboard: any[][] = [
    [
      { text: `🎮 Game ✏️`, callback_data: "co_edit_game" },
      { text: `🎯 Points ✏️`, callback_data: "co_edit_points" },
    ],
    [
      { text: `🎫 Playback ✏️`, callback_data: "co_edit_playback" },
      { text: `💵 Tip ✏️`, callback_data: "co_edit_tip" },
    ],
    [
      { text: `💰 Amount ✏️`, callback_data: "co_edit_amount" },
      { text: `📎 Payment ✏️`, callback_data: "co_edit_media" },
    ],
    [{ text: "← Back to Review", callback_data: "co_back_review" }],
  ];
  return { text, keyboard };
}

// ─── Numpad ───────────────────────────────────────────────────────────────────
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

  const userState = new Map<number, any>();
  const menuMsgId = new Map<number, number>();
  const inputMsgId = new Map<number, number>();
  // adminMsgId → { cashoutId, state, userChatId }
  const adminMessages = new Map<number, any>();
  // cashoutId → { state, adminMsgId, adminChatId, userEditMsgId, userChatId }
  const pendingCashouts = new Map<string, any>();

  // ── helpers ───────────────────────────────────────────────────────────────

  async function deleteInputMsg(chatId: number) {
    const mid = inputMsgId.get(chatId);
    if (mid) { await bot.deleteMessage(chatId, mid).catch(() => {}); inputMsgId.delete(chatId); }
  }

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

  async function showCashoutReview(chatId: number) {
    const state = userState.get(chatId);
    if (!state) return;
    state.step = "review";
    const { text, keyboard } = buildCashoutReview(state);
    const mid = menuMsgId.get(chatId);
    if (mid) {
      await bot.editMessageText(text, {
        chat_id: chatId, message_id: mid,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      }).catch(() => {});
    } else {
      const m = await bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      });
      menuMsgId.set(chatId, m.message_id);
    }
  }

  async function showCashoutEditMenu(chatId: number) {
    const state = userState.get(chatId);
    if (!state) return;
    state.step = "edit_menu";
    const { text, keyboard } = buildCashoutEditMenu(state);
    const mid = menuMsgId.get(chatId);
    if (mid) {
      await bot.editMessageText(text, {
        chat_id: chatId, message_id: mid,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      }).catch(() => {});
    }
  }

  async function sendMainMenu(chatId: number) {
    await bot.sendMessage(chatId, `👋 *Payment Tracker*\n\nWhat would you like to do?`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "💵 Cash In", callback_data: "main_cashin" }],
          [{ text: "💸 Cash Out", callback_data: "main_cashout" }],
        ],
      },
    });
  }

  async function startCashIn(chatId: number, employeeName: string, groupName: string, originalMessageId?: number) {
    const newState = {
      type: "income", step: "menu",
      selectedGames: [] as string[],
      gameAmounts: {} as Record<string, number>,
      gamePoints: {} as Record<string, number>,
      currentEditGame: null as string | null,
      currentEditField: null as string | null,
      amountInput: "",
      employeeName, groupName,
      originalMessageId: originalMessageId || null,
      originalChatId: chatId,
    };
    userState.set(chatId, newState);
    const { text, keyboard } = buildIncomeMenu(newState);
    const m = await bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
    menuMsgId.set(chatId, m.message_id);
  }

  async function startCashout(chatId: number, employeeName: string, groupName: string) {
    const cashoutId = generateCashoutId();
    const newState = {
      type: "cashout", step: "game",
      cashoutId, employeeName, groupName,
      originChatId: chatId,           // ← remember which group this started in
      createdAt: getCST().isoTime, updatedAt: getCST().isoTime,
      game: "", points: 0, playback_points: 0, tip: 0, amount: 0,
      amountInput: "",
      mediaType: null as string | null,
      mediaCaption: "", photoFileId: null as string | null,
    };
    userState.set(chatId, newState);
    const m = await bot.sendMessage(chatId,
      `💸 *New Cashout*\n👤 ${employeeName} · ${groupName}\n\n*Step 1:* Select game:`, {
        parse_mode: "Markdown",
        ...gameKeyboard("co_game"),
      });
    menuMsgId.set(chatId, m.message_id);
  }

  // ── /start ────────────────────────────────────────────────────────────────
  bot.onText(/\/start/, async (msg) => { await sendMainMenu(msg.chat.id); });

  bot.on("new_chat_members", async (msg) => {
    const chatId = msg.chat.id;
    const botInfo = await bot.getMe();
    if ((msg.new_chat_members || []).some((m: any) => m.id === botInfo.id)) {
      await bot.sendMessage(chatId, `👋 *Payment Tracker ready!*\nSend /start anytime.`, { parse_mode: "Markdown" });
    }
  });

  // ── SINGLE photo handler ──────────────────────────────────────────────────
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const state = userState.get(chatId);

    // Cashout: waiting for payment photo (main flow or edit)
    if (state?.type === "cashout" && (state.step === "media" || state.step === "media_edit")) {
      state.mediaType = "photo";
      state.mediaCaption = msg.caption || "Payment screenshot";
      state.photoFileId = msg.photo?.[msg.photo.length - 1]?.file_id;
      await deleteInputMsg(chatId);
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      await showCashoutReview(chatId);
      return;
    }

    // New income entry triggered by photo
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";
    const groupName = msg.chat.title || "Unknown Group";
    await startCashIn(chatId, employeeName, groupName, msg.message_id);
  });

  // ── /cashout ──────────────────────────────────────────────────────────────
  bot.onText(/\/(cashout|co)/, async (msg) => {
    await startCashout(
      msg.chat.id,
      msg.from?.first_name || msg.from?.username || "Unknown",
      msg.chat.title || "Unknown Group"
    );
  });

  // ── SINGLE text handler ───────────────────────────────────────────────────
  bot.on("text", async (msg) => {
    if (msg.text?.startsWith("/")) return;
    const chatId = msg.chat.id;
    const state = userState.get(chatId);
    if (!state) return;

    // Income: custom game name
    if (state.type === "income" && state.step === "custom_game") {
      const name = msg.text!.trim();
      if (!state.selectedGames.includes(name)) state.selectedGames.push(name);
      state.step = "menu";
      await deleteInputMsg(chatId);
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      await refreshIncomeMenu(chatId);
      return;
    }

    // Cashout: text payment details (main flow or edit)
    if (state.type === "cashout" && (state.step === "media" || state.step === "media_edit")) {
      state.mediaType = "text";
      state.mediaCaption = msg.text!.trim();
      await deleteInputMsg(chatId);
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      await showCashoutReview(chatId);
      return;
    }

    // Cashout: custom game name
    if (state.type === "cashout" && state.step === "custom_game") {
      state.game = msg.text!.trim();
      state.step = "points";
      state.amountInput = "";
      await deleteInputMsg(chatId);
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      const mid = menuMsgId.get(chatId);
      if (mid) {
        await bot.editMessageText(
          `💸 *Cashout · ${state.employeeName}*\n🎮 ${state.game}\n\n*Step 2: Points Redeemed*\n\n👉 0`,
          { chat_id: chatId, message_id: mid, parse_mode: "Markdown", reply_markup: numpad("co_num").reply_markup }
        ).catch(() => {});
      }
      return;
    }
  });

  // ── callback_query ────────────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);

    await bot.answerCallbackQuery(query.id).catch(() => {});

    // ── Main menu ─────────────────────────────────────────────────────────
    if (data === "main_cashin") {
      const name = query.from?.first_name || query.from?.username || "Unknown";
      const group = query.message?.chat.title || "Unknown Group";
      await bot.deleteMessage(chatId, query.message!.message_id).catch(() => {});
      await startCashIn(chatId, name, group);
      return;
    }
    if (data === "main_cashout") {
      const name = query.from?.first_name || query.from?.username || "Unknown";
      const group = query.message?.chat.title || "Unknown Group";
      await bot.deleteMessage(chatId, query.message!.message_id).catch(() => {});
      await startCashout(chatId, name, group);
      return;
    }

    // ── Admin APPROVE / DENY ──────────────────────────────────────────────
    // Note: approval message is in the same group where cashout was initiated
    if (data.startsWith("cashout_approve_") || data.startsWith("cashout_deny_")) {
      const isApprove = data.startsWith("cashout_approve_");
      const cashoutId = data.replace(isApprove ? "cashout_approve_" : "cashout_deny_", "");
      const adminData = adminMessages.get(query.message?.message_id!);

      if (query.from?.id !== ADMIN_ID) {
        await bot.answerCallbackQuery(query.id, { text: "❌ Only the owner can approve cashouts!", show_alert: true });
        return;
      }

      if (adminData?.cashoutId === cashoutId) {
        const { state: coState, userChatId } = adminData;
        const actorName = query.from?.first_name || "Owner";
        const label = isApprove ? "✅ APPROVED" : "❌ DENIED";

        if (isApprove) {
          // Save to CSV only on approval
          saveCashoutRecord(coState);

          // Report to REPORT group (same as cash-in)
          const cst = getCST();
          const reportMsg =
            `✅ *Cashout Approved* · 👤 ${coState.employeeName} · ${coState.groupName}\n` +
            `🎮 ${coState.game} · 🎯 ${coState.points} pts` +
            `${coState.playback_points > 0 ? ` · 🎫 ${coState.playback_points} pb` : ""}` +
            `${coState.tip > 0 ? ` · 💵 $${coState.tip} tip` : ""} · 💰 $${coState.amount}\n` +
            `📅 ${cst.date} · ${cst.time} · 🆔 ${cashoutId}`;
          try {
            await bot.sendMessage(REPORT_GROUP_ID, reportMsg, { parse_mode: "Markdown" });
            if (coState.mediaType === "photo" && coState.photoFileId) {
              await bot.sendPhoto(REPORT_GROUP_ID, coState.photoFileId, {
                caption: `📸 Payment · ${coState.employeeName} · $${coState.amount}`,
              });
            } else if (coState.mediaType === "text" && coState.mediaCaption) {
              await bot.sendMessage(REPORT_GROUP_ID, `📝 Payment: ${coState.mediaCaption}`);
            }
          } catch (_) {}
        }

        // Update the approval message in the group
        const summary =
          `${label} by ${actorName}\n` +
          `🎮 ${coState.game} · 🎯 ${coState.points} pts` +
          `${coState.playback_points > 0 ? ` · 🎫 ${coState.playback_points} pb` : ""}` +
          `${coState.tip > 0 ? ` · 💵 $${coState.tip}` : ""} · 💰 $${coState.amount}\n` +
          `👤 ${coState.employeeName} · 🆔 ${cashoutId}`;
        await bot.editMessageText(summary, {
          chat_id: chatId, message_id: query.message?.message_id!,
        }).catch(() => {});

        // Notify employee via their edit/cancel message
        const pending = pendingCashouts.get(cashoutId);
        if (pending) {
          const userMsg = isApprove
            ? `✅ Your cashout was *approved* · 🆔 ${cashoutId}`
            : `❌ Your cashout was *denied* · 🆔 ${cashoutId}`;
          await bot.editMessageText(userMsg, {
            chat_id: pending.userChatId,
            message_id: pending.userEditMsgId,
            parse_mode: "Markdown",
          }).catch(() => {});
          pendingCashouts.delete(cashoutId);
        }
        adminMessages.delete(query.message?.message_id!);
      }
      return;
    }

    // ── User edit/cancel pending cashout ──────────────────────────────────
    if (data.startsWith("user_edit_")) {
      const cashoutId = data.replace("user_edit_", "");
      const pending = pendingCashouts.get(cashoutId);
      if (!pending) { await bot.answerCallbackQuery(query.id, { text: "No longer editable", show_alert: true }); return; }
      userState.set(chatId, { ...pending.state, step: "review" });
      menuMsgId.delete(chatId);
      await showCashoutReview(chatId);
      return;
    }

    if (data.startsWith("user_cancel_")) {
      const cashoutId = data.replace("user_cancel_", "");
      const pending = pendingCashouts.get(cashoutId);
      if (!pending) { await bot.answerCallbackQuery(query.id, { text: "No longer active", show_alert: true }); return; }
      await bot.editMessageText(`🚫 Cancelled by employee · 🆔 ${cashoutId}`, {
        chat_id: pending.adminChatId, message_id: pending.adminMsgId,
      }).catch(() => {});
      adminMessages.delete(pending.adminMsgId);
      pendingCashouts.delete(cashoutId);
      userState.delete(chatId);
      await bot.editMessageText("🚫 Cashout cancelled.", {
        chat_id: chatId, message_id: query.message?.message_id!,
      }).catch(() => {});
      return;
    }

    if (!state) return;

    // ══════════════════════════════════════════════════════════════════════
    // INCOME FLOW
    // ══════════════════════════════════════════════════════════════════════
    if (state.type === "income") {

      if (data === "im_edit_game") {
        state.step = "game";
        await deleteInputMsg(chatId);
        const sel = state.selectedGames.length > 0 ? `Selected: ${state.selectedGames.join(", ")}\n\n` : "";
        const m = await bot.sendMessage(chatId, `${sel}🎮 Select game(s), then tap Done:`, gameKeyboard("im_game"));
        inputMsgId.set(chatId, m.message_id);
        return;
      }

      if (data.startsWith("im_edit_amount_")) {
        const game = data.replace("im_edit_amount_", "");
        state.currentEditGame = game; state.currentEditField = "amount";
        state.amountInput = state.gameAmounts?.[game]?.toString() || "";
        state.step = "editing";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `💰 Amount for *${game}*:\n\n👉 ${state.amountInput || "0"}`, {
          parse_mode: "Markdown", ...numpad("im_num"),
        });
        inputMsgId.set(chatId, m.message_id);
        return;
      }

      if (data.startsWith("im_edit_points_")) {
        const game = data.replace("im_edit_points_", "");
        state.currentEditGame = game; state.currentEditField = "points";
        state.amountInput = state.gamePoints?.[game]?.toString() || "";
        state.step = "editing";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `🎯 Points for *${game}*:\n\n👉 ${state.amountInput || "0"}`, {
          parse_mode: "Markdown", ...numpad("im_num"),
        });
        inputMsgId.set(chatId, m.message_id);
        return;
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
          await deleteInputMsg(chatId);
          await refreshIncomeMenu(chatId);
          return;
        } else { state.amountInput = (state.amountInput || "") + action; }
        const mid = inputMsgId.get(chatId);
        const label = state.currentEditField === "points" ? `🎯 Points for *${state.currentEditGame}*` : `💰 Amount for *${state.currentEditGame}*`;
        if (mid) {
          await bot.editMessageText(`${label}:\n\n👉 ${state.amountInput || "0"}`, {
            chat_id: chatId, message_id: mid, parse_mode: "Markdown",
            reply_markup: numpad("im_num").reply_markup,
          }).catch(() => {});
        }
        return;
      }

      if (data.startsWith("im_game_")) {
        const action = data.replace("im_game_", "");
        if (action === "done") {
          state.step = "menu"; await deleteInputMsg(chatId); await refreshIncomeMenu(chatId);
        } else if (action === "Other") {
          state.step = "custom_game"; await deleteInputMsg(chatId);
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

      if (data === "im_submit") {
        const cst = getCST();
        for (const game of state.selectedGames) {
          const amt = state.gameAmounts[game] || 0;
          const pts = state.gamePoints[game] || 0;
          fs.appendFileSync(RECORDS_FILE,
            `${cst.date},${cst.time},${cst.day},"${state.groupName}","${state.employeeName}",${amt},"${game}",${pts},\n`
          );
        }
        const totalAmt = state.selectedGames.reduce((s: number, g: string) => s + (state.gameAmounts[g] || 0), 0);
        const gamesSummary = state.selectedGames.map((g: string) =>
          `${g}: $${state.gameAmounts[g] || 0} · ${state.gamePoints[g] || 0}pts`
        ).join(" | ");
        try {
          await bot.sendMessage(REPORT_GROUP_ID,
            `✅ Cash-In · 👤 ${state.employeeName} · 💰 $${totalAmt} · 📅 ${cst.date} ${cst.time}\n🎮 ${gamesSummary}`
          );
          if (state.originalMessageId && state.originalChatId) {
            await bot.forwardMessage(REPORT_GROUP_ID, state.originalChatId, state.originalMessageId);
          }
        } catch (_) {}
        const fullSummary =
          `✅ *Payment Recorded*\n👤 ${state.employeeName} · ${state.groupName}\n\n` +
          state.selectedGames.map((g: string) => `🎮 ${g}: $${state.gameAmounts[g] || 0} · ${state.gamePoints[g] || 0} pts`).join("\n") +
          `\n\n📅 ${cst.date} · ${cst.day} · ${cst.time}`;
        const mid = menuMsgId.get(chatId);
        if (mid) await bot.editMessageText(fullSummary, { chat_id: chatId, message_id: mid, parse_mode: "Markdown" }).catch(() => {});
        userState.delete(chatId); menuMsgId.delete(chatId);
        return;
      }

      if (data === "im_cancel") {
        const mid = menuMsgId.get(chatId);
        if (mid) await bot.editMessageText("❌ Cancelled.", { chat_id: chatId, message_id: mid }).catch(() => {});
        userState.delete(chatId); menuMsgId.delete(chatId); await deleteInputMsg(chatId);
        return;
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // CASHOUT FLOW
    // ══════════════════════════════════════════════════════════════════════
    if (state.type === "cashout") {

      // ── Step 1: Game selection ──────────────────────────────────────────
      if (data.startsWith("co_game_") && !data.startsWith("co_game_edit_")) {
        const action = data.replace("co_game_", "");
        if (action === "Other") {
          state.step = "custom_game";
          await deleteInputMsg(chatId);
          const m = await bot.sendMessage(chatId, "✏️ Type the custom game name:");
          inputMsgId.set(chatId, m.message_id);
        } else if (action !== "done") {
          state.game = action;
          state.step = "points";
          state.amountInput = "";
          const mid = menuMsgId.get(chatId);
          if (mid) {
            await bot.editMessageText(
              `💸 *Cashout · ${state.employeeName}*\n🎮 Game: ${state.game}\n\n*Step 2: Points Redeemed*\n\n👉 0`,
              { chat_id: chatId, message_id: mid, parse_mode: "Markdown", reply_markup: numpad("co_num").reply_markup }
            ).catch(() => {});
          }
        }
        return;
      }

      // ── Playback yes/no ─────────────────────────────────────────────────
      if (data === "co_playback_yes") {
        state.step = "playback_amount"; state.amountInput = "";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `🎫 *Playback Points Amount:*\n\n👉 0`, {
          parse_mode: "Markdown", ...numpad("co_num"),
        });
        inputMsgId.set(chatId, m.message_id);
        return;
      }
      if (data === "co_playback_no") {
        state.playback_points = 0; state.step = "tip_ask";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `💵 *Step 4: Tip?*`, {
          reply_markup: { inline_keyboard: [
            [{ text: "💵 Yes, enter tip", callback_data: "co_tip_yes" }],
            [{ text: "➡️ No tip, skip", callback_data: "co_tip_no" }],
          ]},
        });
        inputMsgId.set(chatId, m.message_id);
        return;
      }

      // ── Tip yes/no ──────────────────────────────────────────────────────
      if (data === "co_tip_yes") {
        state.step = "tip_amount"; state.amountInput = "";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `💵 *Tip Amount ($):*\n\n👉 0`, {
          parse_mode: "Markdown", ...numpad("co_num"),
        });
        inputMsgId.set(chatId, m.message_id);
        return;
      }
      if (data === "co_tip_no") {
        state.tip = 0; state.step = "amount"; state.amountInput = "";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `💰 *Step 5: Cashout Amount ($):*\n\n👉 0`, {
          parse_mode: "Markdown", ...numpad("co_num"),
        });
        inputMsgId.set(chatId, m.message_id);
        return;
      }

      // ── Numpad for all cashout steps ────────────────────────────────────
      if (data.startsWith("co_num_")) {
        const action = data.replace("co_num_", "");

        if (action === "back") {
          state.amountInput = (state.amountInput || "").slice(0, -1);
        } else if (action === "dot") {
          if (!state.amountInput.includes(".")) state.amountInput += ".";
        } else if (action === "done") {
          const value = parseFloat(state.amountInput || "0");

          // ── Main flow steps ──
          if (state.step === "points") {
            state.points = isNaN(value) ? 0 : value;
            state.step = "playback_ask";
            await deleteInputMsg(chatId);
            // Update progress in menu message
            const mid = menuMsgId.get(chatId);
            if (mid) {
              await bot.editMessageText(
                `💸 *Cashout · ${state.employeeName}*\n🎮 ${state.game} · 🎯 ${state.points} pts`,
                { chat_id: chatId, message_id: mid, parse_mode: "Markdown" }
              ).catch(() => {});
            }
            const m = await bot.sendMessage(chatId, `🎫 *Step 3: Playback Points?*`, {
              reply_markup: { inline_keyboard: [
                [{ text: "🎫 Yes, enter playback", callback_data: "co_playback_yes" }],
                [{ text: "➡️ No playback, skip", callback_data: "co_playback_no" }],
              ]},
            });
            inputMsgId.set(chatId, m.message_id);
            return;
          }

          if (state.step === "playback_amount") {
            state.playback_points = isNaN(value) ? 0 : value;
            state.step = "tip_ask";
            await deleteInputMsg(chatId);
            const m = await bot.sendMessage(chatId, `💵 *Step 4: Tip?*`, {
              reply_markup: { inline_keyboard: [
                [{ text: "💵 Yes, enter tip", callback_data: "co_tip_yes" }],
                [{ text: "➡️ No tip, skip", callback_data: "co_tip_no" }],
              ]},
            });
            inputMsgId.set(chatId, m.message_id);
            return;
          }

          if (state.step === "tip_amount") {
            state.tip = isNaN(value) ? 0 : value;
            state.step = "amount"; state.amountInput = "";
            await deleteInputMsg(chatId);
            const m = await bot.sendMessage(chatId, `💰 *Step 5: Cashout Amount ($):*\n\n👉 0`, {
              parse_mode: "Markdown", ...numpad("co_num"),
            });
            inputMsgId.set(chatId, m.message_id);
            return;
          }

          if (state.step === "amount") {
            state.amount = isNaN(value) ? 0 : value;
            state.step = "media";
            await deleteInputMsg(chatId);
            const m = await bot.sendMessage(chatId,
              `📎 *Step 6: Payment Details*\n\nSend a *photo* of the payment, or type the details as text:`,
              { parse_mode: "Markdown" }
            );
            inputMsgId.set(chatId, m.message_id);
            return;
          }

          // ── Edit mode steps ──
          if (state.step === "edit_points")   { state.points = isNaN(value) ? 0 : value;   await deleteInputMsg(chatId); await showCashoutReview(chatId); return; }
          if (state.step === "edit_playback") { state.playback_points = isNaN(value) ? 0 : value; await deleteInputMsg(chatId); await showCashoutReview(chatId); return; }
          if (state.step === "edit_tip")      { state.tip = isNaN(value) ? 0 : value;      await deleteInputMsg(chatId); await showCashoutReview(chatId); return; }
          if (state.step === "edit_amount")   { state.amount = isNaN(value) ? 0 : value;   await deleteInputMsg(chatId); await showCashoutReview(chatId); return; }

          return;
        } else {
          state.amountInput = (state.amountInput || "") + action;
        }

        // Update display — input message for step messages, menu message for "points" step
        const labelMap: Record<string, string> = {
          points: "🎯 *Points Redeemed*",
          playback_amount: "🎫 *Playback Points*",
          tip_amount: "💵 *Tip ($)*",
          amount: "💰 *Cashout Amount ($)*",
          edit_points: "🎯 *Points Redeemed*",
          edit_playback: "🎫 *Playback Points*",
          edit_tip: "💵 *Tip ($)*",
          edit_amount: "💰 *Cashout Amount ($)*",
        };
        const label = labelMap[state.step] || "Enter value";
        const displayText = `${label}:\n\n👉 ${state.amountInput || "0"}`;

        const imid = inputMsgId.get(chatId);
        if (imid) {
          await bot.editMessageText(displayText, {
            chat_id: chatId, message_id: imid,
            parse_mode: "Markdown",
            reply_markup: numpad("co_num").reply_markup,
          }).catch(() => {});
        } else {
          // "points" step uses the menu message
          const mmid = menuMsgId.get(chatId);
          if (mmid) {
            await bot.editMessageText(
              `💸 *Cashout · ${state.employeeName}*\n🎮 ${state.game}\n\n${label}:\n\n👉 ${state.amountInput || "0"}`,
              { chat_id: chatId, message_id: mmid, parse_mode: "Markdown", reply_markup: numpad("co_num").reply_markup }
            ).catch(() => {});
          }
        }
        return;
      }

      // ── Review / Edit menu buttons ──────────────────────────────────────
      if (data === "co_review_edit")  { await showCashoutEditMenu(chatId); return; }
      if (data === "co_back_review")  { await showCashoutReview(chatId); return; }

      if (data === "co_edit_game") {
        state.step = "game_edit";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `🎮 Select new game:`, gameKeyboard("co_game_edit"));
        inputMsgId.set(chatId, m.message_id);
        return;
      }
      if (data.startsWith("co_game_edit_")) {
        const action = data.replace("co_game_edit_", "");
        if (action === "Other") {
          state.step = "custom_game"; await deleteInputMsg(chatId);
          const m = await bot.sendMessage(chatId, "✏️ Type game name:"); inputMsgId.set(chatId, m.message_id);
        } else if (action !== "done") {
          state.game = action; await deleteInputMsg(chatId); await showCashoutReview(chatId);
        }
        return;
      }
      if (data === "co_edit_points") {
        state.step = "edit_points"; state.amountInput = state.points.toString();
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `🎯 Points Redeemed:\n\n👉 ${state.amountInput}`, numpad("co_num"));
        inputMsgId.set(chatId, m.message_id); return;
      }
      if (data === "co_edit_playback") {
        state.step = "edit_playback"; state.amountInput = state.playback_points.toString();
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `🎫 Playback Points (0 = none):\n\n👉 ${state.amountInput}`, numpad("co_num"));
        inputMsgId.set(chatId, m.message_id); return;
      }
      if (data === "co_edit_tip") {
        state.step = "edit_tip"; state.amountInput = state.tip.toString();
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `💵 Tip (0 = none):\n\n👉 ${state.amountInput}`, numpad("co_num"));
        inputMsgId.set(chatId, m.message_id); return;
      }
      if (data === "co_edit_amount") {
        state.step = "edit_amount"; state.amountInput = state.amount.toString();
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, `💰 Cashout Amount:\n\n👉 ${state.amountInput}`, numpad("co_num"));
        inputMsgId.set(chatId, m.message_id); return;
      }
      if (data === "co_edit_media") {
        state.step = "media_edit";
        await deleteInputMsg(chatId);
        const m = await bot.sendMessage(chatId, "📎 Send a *photo* or type payment details as text:", { parse_mode: "Markdown" });
        inputMsgId.set(chatId, m.message_id); return;
      }

      // ── Submit for owner approval ────────────────────────────────────────
      if (data === "co_submit") {
        state.updatedAt = getCST().isoTime;
        const cst = getCST();
        // originChatId = the group where cashout was started = where approval msg goes
        const originChatId: number = state.originChatId || chatId;

        const adminSummary =
          `📊 *Cashout — Approval Needed*\n` +
          `👤 ${state.employeeName} · ${state.groupName} · 📅 ${cst.date} ${cst.time}\n` +
          `🎮 ${state.game} · 🎯 ${state.points} pts` +
          `${state.playback_points > 0 ? ` · 🎫 ${state.playback_points} pb` : ""}` +
          `${state.tip > 0 ? ` · 💵 $${state.tip} tip` : ""} · 💰 $${state.amount}\n` +
          `🆔 \`${state.cashoutId}\``;

        // Send approval request to the SAME group the cashout was started in
        const adminMsgObj = await bot.sendMessage(originChatId, adminSummary, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ APPROVE", callback_data: `cashout_approve_${state.cashoutId}` },
              { text: "❌ DENY",    callback_data: `cashout_deny_${state.cashoutId}` },
            ]],
          },
        }).catch((e: any) => { console.error("Failed to send approval msg:", e); return null; });

        // Show payment proof in same group
        if (state.mediaType === "photo" && state.photoFileId) {
          await bot.sendPhoto(originChatId, state.photoFileId, {
            caption: `📸 Payment proof · ${state.employeeName} · $${state.amount} · 🆔 ${state.cashoutId}`,
          }).catch(() => {});
        } else if (state.mediaType === "text" && state.mediaCaption) {
          await bot.sendMessage(originChatId,
            `📝 Payment details · ${state.employeeName}\n${state.mediaCaption}`
          ).catch(() => {});
        }

        if (adminMsgObj) {
          adminMessages.set(adminMsgObj.message_id, {
            cashoutId: state.cashoutId,
            state: { ...state },
            userChatId: chatId,
          });
        }

        // Send edit/cancel controls
        const userControlMsg = await bot.sendMessage(chatId,
          `✅ *Submitted for approval*\n🆔 ${state.cashoutId}\n\nYou can edit or cancel until the owner acts:`, {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[
                { text: "✏️ Edit", callback_data: `user_edit_${state.cashoutId}` },
                { text: "🗑️ Cancel", callback_data: `user_cancel_${state.cashoutId}` },
              ]],
            },
          }
        ).catch(() => null);

        pendingCashouts.set(state.cashoutId, {
          state: { ...state },
          adminMsgId: adminMsgObj?.message_id,
          adminChatId: originChatId,
          userEditMsgId: userControlMsg?.message_id,
          userChatId: chatId,
        });

        // Update review message
        const mid = menuMsgId.get(chatId);
        if (mid) {
          await bot.editMessageText(
            `⏳ *Pending Approval*\n🆔 ${state.cashoutId}\nWaiting for owner to approve...`,
            { chat_id: chatId, message_id: mid, parse_mode: "Markdown" }
          ).catch(() => {});
        }

        userState.delete(chatId);
        menuMsgId.delete(chatId);
        return;
      }

      if (data === "co_cancel") {
        const mid = menuMsgId.get(chatId);
        if (mid) await bot.editMessageText("❌ Cashout cancelled.", { chat_id: chatId, message_id: mid }).catch(() => {});
        userState.delete(chatId); menuMsgId.delete(chatId); await deleteInputMsg(chatId);
        return;
      }
    }
  });

  // ── /delete ───────────────────────────────────────────────────────────────
  bot.onText(/\/delete/, async (msg) => {
    if (!msg.reply_to_message) { await bot.sendMessage(msg.chat.id, "❌ Reply to a message with /delete."); return; }
    const chatId = msg.chat.id;
    const text = msg.reply_to_message.text || msg.reply_to_message.caption || "";
    const match = text.match(/CO_\d+_[a-z0-9]+/);
    if (match) {
      removeCashoutRecord(match[0]);
      await bot.sendMessage(chatId, `🗑️ Deleted cashout: ${match[0]}`);
      return;
    }
    if (!fs.existsSync(RECORDS_FILE)) return;
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").trim().split("\n");
    if (lines.length <= 1) return;
    const last = lines[lines.length - 1];
    const parts = last.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const cst = getCST();
    fs.appendFileSync(RECORDS_FILE,
      `${cst.date},${cst.time},${cst.day},"${parts[3] || ""}","${parts[4] || ""}",-${parseFloat(parts[5]) || 0},"${parts[6] || ""}",-${parseFloat(parts[7]) || 0},DELETED\n`
    );
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
    fs.writeFileSync(CASHOUT_RECORDS_FILE, content.split("\n").filter(l => !l.includes(cashoutId)).join("\n"));
  } catch (_) {}
}
