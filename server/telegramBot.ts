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

  // ================== MERGED PHOTO HANDLER ==================
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const groupName = msg.chat.title || "Unknown Group";
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";
    const state = userState.get(chatId);

    if (state && state.type === "cashout" && state.step === "waiting_picture") {
      state.mediaCaption = msg.caption || "Payment method screenshot";
      state.step = "cashout_amount";
      state.amountInput = "";
      await bot.sendMessage(chatId, `📸 Picture received!\n\nStep 1: Enter Cashout Amount:`, {
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

  // ================== CASHOUT FLOW (Command Handler) ==================
  bot.onText(/\/cashout/, async (msg) => {
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
      playback_id: "0",
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

  // ================== CALLBACK QUERY HANDLER ==================
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);

    if (!state) return;

    // ================== INCOME FLOW CALLBACKS ==================
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
            await bot.sendMessage(chatId, "❌ Please enter a valid number.");
            await bot.answerCallbackQuery(query.id);
            return;
          }
          if (state.step === "amount") {
            state.amount = value;
            state.step = "game";
            await bot.sendMessage(chatId, `✅ Amount saved: $${value}\n\nStep 2: Select games:`, gameKeyboard);
          } else if (state.step === "per_game_points") {
            const currentGame = state.selectedGames[state.currentGameIndex];
            const cst = getCST();
            state.records.push({
              date: cst.date,
              time: cst.time,
              day: cst.day,
              employee: state.employeeName,
              amount: state.amount,
              game: currentGame,
              points: value
            });
            state.currentGameIndex++;
            if (state.currentGameIndex < state.selectedGames.length) {
              state.amountInput = "";
              await bot.sendMessage(chatId, `Enter points for ${state.selectedGames[state.currentGameIndex]}:`, numberKeyboard);
            } else {
              state.step = "final_confirm";
              let summaryText = `📋 **SUMMARY**\n\n**Amount Received:** $${state.amount}\n\n**Games & Points:**\n`;
              state.records.forEach((r: any, i: number) => {
                summaryText += `${i+1}. ${r.game}: ${r.points} points\n`;
              });
              summaryText += `\n📅 ${state.records[0].date} | ${state.records[0].day} | ${state.records[0].time}`;
              await bot.sendMessage(chatId, summaryText, {
                reply_markup: {
                  inline_keyboard: [[
                    { text: "✅ Yes - Save", callback_data: "confirm_yes" },
                    { text: "❌ No", callback_data: "confirm_no" }
                  ]]
                }
              });
            }
            await bot.answerCallbackQuery(query.id);
            return;
          }
        } else {
          state.amountInput = (state.amountInput || "") + action;
        }
        const displayText = `💰 Enter Amount:\n\n👉 ${state.amountInput || "0"}`;
        await bot.editMessageText(displayText, {
          chat_id: chatId,
          message_id: query.message!.message_id,
          reply_markup: numberKeyboard.reply_markup
        }).catch(() => {});
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (state.step === "game") {
        if (data === "game_done") {
          if (state.selectedGames.length === 0) {
            await bot.sendMessage(chatId, "Please select at least one game.");
            await bot.answerCallbackQuery(query.id);
            return;
          }
          state.step = "per_game_points";
          state.currentGameIndex = 0;
          state.amountInput = "";
          await bot.sendMessage(chatId, `Enter points for ${state.selectedGames[0]}:`, numberKeyboard);
        } else if (data === "game_Other") {
          state.step = "custom_game";
          await bot.sendMessage(chatId, "Type the custom game name:");
        } else {
          const game = data.replace("game_", "");
          if (!state.selectedGames.includes(game)) state.selectedGames.push(game);
          await bot.sendMessage(chatId, `Selected: ${state.selectedGames.join(", ")}\n\nYou can select more or press Done.`, gameKeyboard);
        }
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (state.step === "final_confirm" && data === "confirm_yes") {
        for (const r of state.records) {
          const row = `${r.date},${r.time},${r.day},"${state.groupName}","${r.employee}",${r.amount},"${r.game}",${r.points},\n`;
          fs.appendFileSync(RECORDS_FILE, row);
        }

        let successMsg = `✅ **Payment Record**\n\n`;
        successMsg += `**Group:** ${state.groupName}\n`;
        successMsg += `**Amount Received:** $${state.amount}\n\n`;
        successMsg += `**Games & Points:**\n`;
        state.records.forEach((r: any, i: number) => {
          successMsg += `${i+1}. ${r.game}: ${r.points} points\n`;
        });
        successMsg += `\n📅 ${state.records[0].date} | ${state.records[0].day} | ${state.records[0].time}`;

        try {
          await bot.sendMessage(REPORT_GROUP_ID, successMsg);
          await bot.forwardMessage(REPORT_GROUP_ID, state.originalChatId, state.originalMessageId);
        } catch (e) {}

        const blueSummary = `✅ **Transaction Confirmed!**\n\n` +
          `**Group:** ${state.groupName}\n` +
          `**Amount:** $${state.amount}\n\n` +
          `**Games & Points:**\n` +
          state.records.map((r: any, i: number) => `${i+1}. ${r.game}: ${r.points} points`).join("\n") +
          `\n\n📅 ${state.records[0].date} | ${state.records[0].day} | ${state.records[0].time}`;

        await bot.sendMessage(chatId, blueSummary, { parse_mode: "Markdown" });
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

    // ================== CASHOUT FLOW CALLBACKS ==================
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
          if (isNaN(value)) {
            await bot.sendMessage(chatId, "❌ Please enter a valid number.");
            await bot.answerCallbackQuery(query.id);
            return;
          }

          if (state.step === "cashout_amount") {
            if (value <= 0) {
              await bot.sendMessage(chatId, "❌ Amount must be greater than 0.");
              await bot.answerCallbackQuery(query.id);
              return;
            }
            state.amount = value;
            state.step = "cashout_game";
            state.amountInput = "";
            await bot.sendMessage(chatId, `✅ Amount: $${value}\n\nStep 2: Select Game:`, gameKeyboard);
          } else if (state.step === "cashout_points") {
            state.points = value;
            state.step = "cashout_playback";
            state.amountInput = "";
            await bot.sendMessage(chatId, `✅ Points: ${value}\n\nStep 4: Enter Playback Value (Optional, can be 0):`, {
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
            state.playback_id = state.amountInput || "0";
            state.step = "cashout_tip";
            state.amountInput = "";
            await bot.sendMessage(chatId, `✅ Playback Value: ${state.playback_id}\n\nStep 5: Enter Tip (Optional, can be 0):`, {
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
            state.tip = parseFloat(state.amountInput || "0");
            state.step = "cashout_review";
            await showCashoutReview(chatId, state, bot);
          }
          await bot.answerCallbackQuery(query.id);
          return;
        } else {
          state.amountInput = (state.amountInput || "") + action;
        }

        let displayText = "";
        if (state.step === "cashout_amount") {
          displayText = `💰 Enter Cashout Amount:\n\n👉 ${state.amountInput || "0"}`;
        } else if (state.step === "cashout_points") {
          displayText = `🎮 Enter Points:\n\n👉 ${state.amountInput || "0"}`;
        } else if (state.step === "cashout_playback") {
          displayText = `🎫 Enter Playback Value:\n\n👉 ${state.amountInput || "0"}`;
        } else if (state.step === "cashout_tip") {
          displayText = `💵 Enter Tip:\n\n👉 ${state.amountInput || "0"}`;
        }

        await bot.editMessageText(displayText, {
          chat_id: chatId,
          message_id: query.message!.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: "1", callback_data: "cashout_num_1" }, { text: "2", callback_data: "cashout_num_2" }, { text: "3", callback_data: "cashout_num_3" }],
              [{ text: "4", callback_data: "cashout_num_4" }, { text: "5", callback_data: "cashout_num_5" }, { text: "6", callback_data: "cashout_num_6" }],
              [{ text: "7", callback_data: "cashout_num_7" }, { text: "8", callback_data: "cashout_num_8" }, { text: "9", callback_data: "cashout_num_9" }],
              [{ text: "0", callback_data: "cashout_num_0" }, { text: ".", callback_data: "cashout_num_dot" }],
              [{ text: "⬅️ Back", callback_data: "cashout_num_back" }, { text: "✅ Done", callback_data: "cashout_num_done" }]
            ]
          }
        }).catch(() => {});
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (state.step === "cashout_game") {
        if (data === "game_done") {
          if (!state.game) {
            await bot.sendMessage(chatId, "❌ Please select a game.");
            await bot.answerCallbackQuery(query.id);
            return;
          }
          state.step = "cashout_points";
          state.amountInput = "";
          await bot.sendMessage(chatId, `✅ Game: ${state.game}\n\nStep 3: Enter Points Redeemed:`, {
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

      if (data === "cashout_confirm") {
        state.step = "cashout_pending_admin";
        state.updatedAt = getCST().isoTime;
        saveCashoutRecord(state);
        await bot.sendMessage(chatId, `✅ **Cashout Submitted!**\n\nYour cashout request has been submitted for admin approval.`);
        await sendAdminConfirmation(chatId, state, bot);
        userState.delete(chatId);
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (data.startsWith("cashout_edit_")) {
        const field = data.replace("cashout_edit_", "");
        if (field === "amount") {
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
        } else if (field === "game") {
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
          state.amountInput = state.playback_id;
          await bot.sendMessage(chatId, `🎫 Current Playback Value: ${state.playback_id}\n\nEdit Playback Value:`, {
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
        }
        await bot.answerCallbackQuery(query.id);
        return;
      }

      await bot.answerCallbackQuery(query.id);
    }
  });

  // ================== TEXT HANDLER ==================
  bot.on("text", async (msg) => {
    const chatId = msg.chat.id;
    const state = userState.get(chatId);
    if (!state) return;

    if (state.type === "income" && state.step === "custom_game") {
      state.selectedGames.push(msg.text!.trim());
      state.step = "game";
      await bot.sendMessage(chatId, `Added "${msg.text}"\nSelected: ${state.selectedGames.join(", ")}`, gameKeyboard);
    }

    if (state.type === "cashout" && state.step === "waiting_text") {
      state.mediaCaption = msg.text;
      state.step = "cashout_amount";
      state.amountInput = "";
      await bot.sendMessage(chatId, `✅ Details received: "${msg.text}"\n\nStep 1: Enter Cashout Amount:`, {
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

    if (state.type === "cashout" && state.step === "cashout_custom_game") {
      state.game = msg.text;
      state.step = "cashout_points";
      state.amountInput = "";
      await bot.sendMessage(chatId, `✅ Game: ${msg.text}\n\nStep 3: Enter Points Redeemed:`, {
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
  });

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
    await bot.sendMessage(msg.chat.id, "👋 Send a screenshot to start.\n\nReply to a screenshot with `/delete` to remove it.\n\nUse `/cashout` to start a cashout request.");
  });

  const webhookPath = `/bot${token}`;
  bot.setWebHook(baseUrl + webhookPath)
    .then(() => console.log("✅ Webhook set successfully"))
    .catch(err => console.error("Webhook failed:", err));

  console.log("[Bot] Ready with Income & Cashout flows");
  return bot;
}

function showCashoutReview(chatId: number, state: any, bot: TelegramBot) {
  const reviewText = `📋 **CASHOUT REVIEW**

💰 Amount: $${state.amount}
🎮 Game: ${state.game}
🎯 Points Redeemed: ${state.points}
🎫 Playback Value: ${state.playback_id}
💵 Tip: $${state.tip}

Employee: ${state.employeeName}
Group: ${state.groupName}

**All fields are editable. Click to edit or confirm:**`;

  bot.sendMessage(chatId, reviewText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✏️ Edit Amount", callback_data: "cashout_edit_amount" }],
        [{ text: "✏️ Edit Game", callback_data: "cashout_edit_game" }],
        [{ text: "✏️ Edit Points", callback_data: "cashout_edit_points" }],
        [{ text: "✏️ Edit Playback", callback_data: "cashout_edit_playback" }],
        [{ text: "✏️ Edit Tip", callback_data: "cashout_edit_tip" }],
        [{ text: "✅ Confirm & Submit", callback_data: "cashout_confirm" }]
      ]
    }
  }).catch(() => {});
}

function saveCashoutRecord(state: any) {
  const row = `"${state.cashoutId}","${state.createdAt}","${state.updatedAt}","${state.groupName}","${state.employeeName}",${state.amount},"${state.game}",${state.points},"${state.playback_id}",${state.tip}\n`;
  fs.appendFileSync(CASHOUT_RECORDS_FILE, row);
}

function sendAdminConfirmation(chatId: number, state: any, bot: TelegramBot) {
  const adminMsg = `🚨 **NEW CASHOUT REQUEST**

💰 Amount: $${state.amount}
🎮 Game: ${state.game}
🎯 Points: ${state.points}
🎫 Playback Value: ${state.playback_id}
💵 Tip: $${state.tip}

Employee: ${state.employeeName}
Group: ${state.groupName}
Cashout ID: ${state.cashoutId}

**Is this cashout complete?**`;

  bot.sendMessage(ADMIN_ID, adminMsg, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Approve", callback_data: "admin_approve" }],
        [{ text: "❌ Reject", callback_data: "admin_reject" }]
      ]
    }
  }).catch(() => {});
}
