import TelegramBot from "node-telegram-bot-api";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "payment_tracker.db");
const db = new Database(DB_PATH, { verbose: console.log });

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    time TEXT,
    day TEXT,
    employee TEXT,
    amount REAL,
    game TEXT,
    points INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS daily_summary (
    date TEXT PRIMARY KEY,
    day TEXT,
    total_amount REAL DEFAULT 0,
    fk_points INTEGER DEFAULT 0,
    jw_points INTEGER DEFAULT 0,
    gv_points INTEGER DEFAULT 0,
    orion_points INTEGER DEFAULT 0,
    mw_points INTEGER DEFAULT 0,
    funstation_points INTEGER DEFAULT 0,
    vs_points INTEGER DEFAULT 0,
    pm_points INTEGER DEFAULT 0,
    cm_points INTEGER DEFAULT 0,
    up_points INTEGER DEFAULT 0,
    monstor_points INTEGER DEFAULT 0,
    other_points INTEGER DEFAULT 0,
    grand_total INTEGER DEFAULT 0,
    transaction_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS monthly_summary (
    month TEXT PRIMARY KEY,
    total_amount REAL DEFAULT 0,
    fk_points INTEGER DEFAULT 0,
    jw_points INTEGER DEFAULT 0,
    gv_points INTEGER DEFAULT 0,
    orion_points INTEGER DEFAULT 0,
    mw_points INTEGER DEFAULT 0,
    funstation_points INTEGER DEFAULT 0,
    vs_points INTEGER DEFAULT 0,
    pm_points INTEGER DEFAULT 0,
    cm_points INTEGER DEFAULT 0,
    up_points INTEGER DEFAULT 0,
    monstor_points INTEGER DEFAULT 0,
    other_points INTEGER DEFAULT 0,
    grand_total INTEGER DEFAULT 0,
    transaction_count INTEGER DEFAULT 0
  );
`);

export function initTelegramBot(token: string = "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE"): TelegramBot {
  const bot = new TelegramBot(token, { polling: true });
  console.log("[Bot] SQLite Detailed Summary Bot Started");

  const userState = new Map<any, any>();

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
        [{ text: "FK", callback_data: "game_FK" }], [{ text: "JW", callback_data: "game_JW" }],
        [{ text: "GV", callback_data: "game_GV" }], [{ text: "Orion", callback_data: "game_Orion" }],
        [{ text: "MW", callback_data: "game_MW" }], [{ text: "FunStation", callback_data: "game_FunStation" }],
        [{ text: "VS", callback_data: "game_VS" }], [{ text: "PM", callback_data: "game_PM" }],
        [{ text: "CM", callback_data: "game_CM" }], [{ text: "UP", callback_data: "game_UP" }],
        [{ text: "Monstor", callback_data: "game_Monstor" }], [{ text: "Other", callback_data: "game_Other" }],
        [{ text: "✅ Done", callback_data: "game_done" }]
      ]
    }
  };

  // Save payment
  function savePayment(record: any) {
    db.prepare(`
      INSERT INTO payments (date, time, day, employee, amount, game, points)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(record.date, record.time, record.day, record.employee, record.amount, record.game, record.points);
  }

  // Update Daily Summary
  function updateDailySummary(date: string, day: string, amount: number, gamePoints: Record<string, number>) {
    const games = ["FK","JW","GV","Orion","MW","FunStation","VS","PM","CM","UP","Monstor","Other"];
    const params = [
      date, day, amount,
      gamePoints.FK || 0, gamePoints.JW || 0, gamePoints.GV || 0, gamePoints.Orion || 0,
      gamePoints.MW || 0, gamePoints.FunStation || 0, gamePoints.VS || 0, gamePoints.PM || 0,
      gamePoints.CM || 0, gamePoints.UP || 0, gamePoints.Monstor || 0, gamePoints.Other || 0,
      Object.values(gamePoints).reduce((a, b) => a + b, 0), 1
    ];

    db.prepare(`
      INSERT INTO daily_summary (date, day, total_amount, fk_points, jw_points, gv_points, orion_points, mw_points,
        funstation_points, vs_points, pm_points, cm_points, up_points, monstor_points, other_points, grand_total, transaction_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        total_amount = total_amount + excluded.total_amount,
        fk_points = fk_points + excluded.fk_points,
        jw_points = jw_points + excluded.jw_points,
        gv_points = gv_points + excluded.gv_points,
        orion_points = orion_points + excluded.orion_points,
        mw_points = mw_points + excluded.mw_points,
        funstation_points = funstation_points + excluded.funstation_points,
        vs_points = vs_points + excluded.vs_points,
        pm_points = pm_points + excluded.pm_points,
        cm_points = cm_points + excluded.cm_points,
        up_points = up_points + excluded.up_points,
        monstor_points = monstor_points + excluded.monstor_points,
        other_points = other_points + excluded.other_points,
        grand_total = grand_total + excluded.grand_total,
        transaction_count = transaction_count + 1
    `).run(...params);
  }

  // Update Monthly Summary
  function updateMonthlySummary(month: string, amount: number, gamePoints: Record<string, number>) {
    const games = ["FK","JW","GV","Orion","MW","FunStation","VS","PM","CM","UP","Monstor","Other"];
    const params = [
      month, amount,
      gamePoints.FK || 0, gamePoints.JW || 0, gamePoints.GV || 0, gamePoints.Orion || 0,
      gamePoints.MW || 0, gamePoints.FunStation || 0, gamePoints.VS || 0, gamePoints.PM || 0,
      gamePoints.CM || 0, gamePoints.UP || 0, gamePoints.Monstor || 0, gamePoints.Other || 0,
      Object.values(gamePoints).reduce((a, b) => a + b, 0), 1
    ];

    db.prepare(`
      INSERT INTO monthly_summary (month, total_amount, fk_points, jw_points, gv_points, orion_points, mw_points,
        funstation_points, vs_points, pm_points, cm_points, up_points, monstor_points, other_points, grand_total, transaction_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(month) DO UPDATE SET
        total_amount = total_amount + excluded.total_amount,
        fk_points = fk_points + excluded.fk_points,
        jw_points = jw_points + excluded.jw_points,
        gv_points = gv_points + excluded.gv_points,
        orion_points = orion_points + excluded.orion_points,
        mw_points = mw_points + excluded.mw_points,
        funstation_points = funstation_points + excluded.funstation_points,
        vs_points = vs_points + excluded.vs_points,
        pm_points = pm_points + excluded.pm_points,
        cm_points = cm_points + excluded.cm_points,
        up_points = up_points + excluded.up_points,
        monstor_points = monstor_points + excluded.monstor_points,
        other_points = other_points + excluded.other_points,
        grand_total = grand_total + excluded.grand_total,
        transaction_count = transaction_count + 1
    `).run(...params);
  }

  // PHOTO HANDLER
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const employeeName = msg.from?.first_name || msg.from?.username || "Unknown";

    userState.set(chatId, {
      step: "amount",
      amountInput: "",
      employeeName,
      selectedGames: [],
      records: []
    });

    await bot.sendMessage(chatId, `Enter the Deposited Amount:`, numberKeyboard);
  });

  // CALLBACK HANDLER
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id!;
    const data = query.data!;
    const state = userState.get(chatId);
    if (!state) return;

    if (data.startsWith("num_")) {
      const action = data.replace("num_", "");
      if (!state.amountInput) state.amountInput = "";

      if (action === "back") {
        state.amountInput = state.amountInput.slice(0, -1);
      } else if (action === "dot") {
        if (!state.amountInput.includes(".")) state.amountInput += ".";
      } else if (action === "done") {
        const value = parseFloat(state.amountInput);
        if (isNaN(value) || value <= 0) {
          await bot.sendMessage(chatId, "❌ Invalid number. Try again.");
          return;
        }

        if (state.step === "amount") {
          state.amount = value;
          state.step = "game";
          await bot.sendMessage(chatId, `Amount saved: $${value}\n\nStep 2: Select games`, gameKeyboard);
        } else if (state.step === "per_game_points") {
          const currentGame = state.selectedGames[state.currentGameIndex];
          const now = new Date();
          const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

          state.records.push({
            date: now.toISOString().split("T")[0],
            time: now.toLocaleTimeString(),
            day: days[now.getDay()],
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

            let summaryText = `📋 **SUMMARY**\n\n**Amount Received:** $${state.amount}\n\n**Points per game:**\n`;
            let total = 0;
            state.records.forEach((r: any, i: number) => {
              summaryText += `${i+1}. ${r.game}: **${r.points}** points\n`;
              total += r.points;
            });
            summaryText += `\n**Total Points:** **${total}**\n\nIs everything correct?`;

            await bot.sendMessage(chatId, summaryText, {
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: [[
                { text: "✅ Yes", callback_data: "confirm_yes" },
                { text: "❌ No", callback_data: "confirm_no" }
              ]] }
            });
          }
        }
        return;
      } else {
        state.amountInput += action;
      }

      await bot.editMessageText(`Enter the Deposited Amount:\n\n👉 ${state.amountInput || "0"}`,
        { chat_id: chatId, message_id: query.message!.message_id, reply_markup: numberKeyboard.reply_markup });
      await bot.answerCallbackQuery(query.id);
      return;
    }

    // Game selection
    if (state.step === "game") {
      if (data === "game_done") {
        if (state.selectedGames.length === 0) {
          await bot.sendMessage(chatId, "Please select at least one game.");
          return;
        }
        state.step = "per_game_points";
        state.currentGameIndex = 0;
        state.amountInput = "";
        await bot.sendMessage(chatId, `Enter points for ${state.selectedGames[0]}:`, numberKeyboard);
      } else if (data === "game_Other") {
        state.step = "custom_game";
        await bot.sendMessage(chatId, "Type custom game name:");
      } else {
        const game = data.replace("game_", "");
        if (!state.selectedGames.includes(game)) state.selectedGames.push(game);
        await bot.sendMessage(chatId,
          `Selected: ${state.selectedGames.join(", ")}\n\nYou can select more or press Done.`,
          gameKeyboard
        );
      }
    }

    // Final confirmation
    if (state.step === "final_confirm") {
      if (data === "confirm_yes") {
        let totalAmount = state.amount;
        const gamePoints: Record<string, number> = {};

        for (const r of state.records) {
          savePayment(r);
          gamePoints[r.game] = (gamePoints[r.game] || 0) + r.points;
        }

        const now = new Date();
        const dateStr = now.toISOString().split("T")[0];
        const monthStr = dateStr.substring(0, 7);
        const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][now.getDay()];

        await updateDailySummary(dateStr, dayName, totalAmount, gamePoints);
        await updateMonthlySummary(monthStr, totalAmount, gamePoints);

        let successMsg = `✅ **Payment Recorded Successfully!**\n\n**Amount Received:** $${totalAmount}\n\n**Games & Points:**\n`;
        let totalPoints = 0;
        state.records.forEach((r: any, i: number) => {
          successMsg += `${i + 1}. ${r.game}: **${r.points}** points\n`;
          totalPoints += r.points;
        });
        successMsg += `\n**Total Points:** **${totalPoints}**\n📅 ${dateStr} (${dayName})\n⏰ ${now.toLocaleTimeString()}`;

        await bot.sendMessage(chatId, successMsg, { parse_mode: "Markdown" });
        userState.delete(chatId);
      } else if (data === "confirm_no") {
        userState.delete(chatId);
        await bot.sendMessage(chatId, "❌ Discarded. Send screenshot again.");
      }
    }

    await bot.answerCallbackQuery(query.id);
  });

  bot.onText(/\/start|\/help/, async (msg) => {
    await bot.sendMessage(msg.chat.id,
      "👋 Payment Bot\n\n1. Send screenshot\n2. Enter amount\n3. Select games\n4. Enter points for each game"
    );
  });

  console.log("[Bot] Ready - SQLite Database + Detailed Per-Game Summaries");
  return bot;
}
