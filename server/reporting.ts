import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

const RECORDS_FILE = path.join(process.cwd(), "records.csv");
const CASHOUT_RECORDS_FILE = path.join(process.cwd(), "cashout_records.csv");
const REPORT_GROUP_ID = -1003718366443;

// ─── Persistent state (survives across calls, resets on redeploy) ─────────────
// snapshotMsgId: the one master pinned message id
let snapshotMsgId: number | null = null;

// ─── CSV helpers ──────────────────────────────────────────────────────────────
function parseCsv(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").slice(1).filter(l => l.trim());
    return lines.map(line => {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return parts.map(p => p.replace(/^"|"$/g, "").trim());
    });
  } catch { return []; }
}

function getCashInRecords() {
  return parseCsv(RECORDS_FILE).map(p => ({
    date: p[0] || "",
    time: p[1] || "",
    group: p[3] || "",
    employee: p[4] || "",
    amount: parseFloat(p[5]) || 0,
    game: p[6] || "",
    points: parseFloat(p[7]) || 0,
    notes: p[8] || "",
  })).filter(r => r.amount > 0); // exclude the $0 multi-game rows for amount totals
}

function getCashInRecordsAll() {
  // includes $0 rows so we can count points correctly
  return parseCsv(RECORDS_FILE).map(p => ({
    date: p[0] || "",
    time: p[1] || "",
    group: p[3] || "",
    employee: p[4] || "",
    amount: parseFloat(p[5]) || 0,
    game: p[6] || "",
    points: parseFloat(p[7]) || 0,
    notes: p[8] || "",
  }));
}

function getCashoutRecords() {
  return parseCsv(CASHOUT_RECORDS_FILE).map(p => ({
    id: p[0] || "",
    created_at: p[1] || "",
    group: p[3] || "",
    employee: p[4] || "",
    amount: parseFloat(p[5]) || 0,
    game: p[6] || "",
    points: parseFloat(p[7]) || 0,
    playback: parseFloat(p[8]) || 0,
    tip: parseFloat(p[9]) || 0,
  }));
}

// ─── CST time helpers ─────────────────────────────────────────────────────────
function nowCST() {
  const now = new Date();
  const cst = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return {
    date: cst.toISOString().split("T")[0],
    time: cst.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
    month: cst.toISOString().substring(0, 7), // "YYYY-MM"
    day: cst.getDate(),
    hour: cst.getHours(),
    minute: cst.getMinutes(),
    full: cst,
  };
}

function formatDate(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split("-");
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
      .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return dateStr; }
}

// ─── Table formatter (monospace) ──────────────────────────────────────────────
function tableRow(game: string, amount: string, pts: string) {
  const g = game.padEnd(16).substring(0, 16);
  const a = amount.padStart(8);
  const p = pts.padStart(10);
  return `${g}${a}${p}`;
}

function tableHeader() {
  return `${"Game".padEnd(16)}${"Amount".padStart(8)}${"Points".padStart(10)}`;
}

function tableDivider() {
  return "─".repeat(34);
}

// ─── Build snapshot text ──────────────────────────────────────────────────────
function buildSnapshot(dateStr: string, updatedTime: string): string {
  const ciAll = getCashInRecordsAll().filter(r => r.date === dateStr);
  const ci = getCashInRecords().filter(r => r.date === dateStr);
  const co = getCashoutRecords().filter(r => r.created_at.startsWith(dateStr));

  // All unique groups from both
  const allGroups = Array.from(new Set([
    ...ciAll.map(r => r.group),
    ...co.map(r => r.group),
  ])).filter(Boolean).sort();

  const totalCiAmt = ci.reduce((s, r) => s + r.amount, 0);
  const totalCoAmt = co.reduce((s, r) => s + r.amount, 0);
  const totalNet = totalCiAmt - totalCoAmt;

  // Count unique "sessions" for cash-in (rows with amount > 0)
  const totalCiTx = ci.length;
  const totalCoTx = co.length;

  let lines: string[] = [];
  lines.push(`📊 *Daily Snapshot — ${formatDate(dateStr)}*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  for (const group of allGroups) {
    const groupCi = ci.filter(r => r.group === group);
    const groupCiAll = ciAll.filter(r => r.group === group);
    const groupCo = co.filter(r => r.group === group);

    const gCiAmt = groupCi.reduce((s, r) => s + r.amount, 0);
    const gCoAmt = groupCo.reduce((s, r) => s + r.amount, 0);
    const gNet = gCiAmt - gCoAmt;
    const gCiTx = groupCi.length;
    const gCoTx = groupCo.length;

    lines.push(`📍 *${group}*`);
    lines.push(
      `💵 Cash-In:  $${gCiAmt.toLocaleString()} (${gCiTx} tx)   ` +
      `💸 Cashout: $${gCoAmt.toLocaleString()} (${gCoTx} tx)`
    );
    lines.push(`📈 Net: $${gNet.toLocaleString()}`);

    // Game breakdown for this group (cash-in, all rows for points)
    const gameMap: Record<string, { amount: number; points: number }> = {};
    for (const r of groupCiAll) {
      if (!gameMap[r.game]) gameMap[r.game] = { amount: 0, points: 0 };
      gameMap[r.game].amount += r.amount;
      gameMap[r.game].points += r.points;
    }

    const games = Object.entries(gameMap).sort((a, b) => b[1].amount - a[1].amount);
    if (games.length > 0) {
      lines.push(`\`\`\``);
      lines.push(tableHeader());
      lines.push(tableDivider());
      for (const [game, data] of games) {
        lines.push(tableRow(game, `$${data.amount.toLocaleString()}`, data.points.toLocaleString()));
      }
      lines.push(`\`\`\``);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  if (allGroups.length > 1) {
    lines.push(`📈 *TOTAL*`);
    lines.push(
      `💵 $${totalCiAmt.toLocaleString()} in (${totalCiTx} tx)   ` +
      `💸 $${totalCoAmt.toLocaleString()} out (${totalCoTx} tx)`
    );
    lines.push(`📈 Net Holding: *$${totalNet.toLocaleString()}*`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  lines.push(`🕐 Last updated: ${updatedTime}`);

  return lines.join("\n");
}

// ─── Build end of day report ──────────────────────────────────────────────────
function buildEndOfDayReport(dateStr: string): string {
  const ci = getCashInRecords().filter(r => r.date === dateStr);
  const ciAll = getCashInRecordsAll().filter(r => r.date === dateStr);
  const co = getCashoutRecords().filter(r => r.created_at.startsWith(dateStr));

  const allGroups = Array.from(new Set([
    ...ciAll.map(r => r.group),
    ...co.map(r => r.group),
  ])).filter(Boolean).sort();

  const totalCiAmt = ci.reduce((s, r) => s + r.amount, 0);
  const totalCoAmt = co.reduce((s, r) => s + r.amount, 0);

  let lines: string[] = [];
  lines.push(`🌙 *End of Day Report — ${formatDate(dateStr)}*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`💵 Total Cash-In:  $${totalCiAmt.toLocaleString()} (${ci.length} tx)`);
  lines.push(`💸 Total Cashout:  $${totalCoAmt.toLocaleString()} (${co.length} tx)`);
  lines.push(`📈 Net Holding:    *$${(totalCiAmt - totalCoAmt).toLocaleString()}*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  for (const group of allGroups) {
    const groupCi = ci.filter(r => r.group === group);
    const groupCiAll = ciAll.filter(r => r.group === group);
    const groupCo = co.filter(r => r.group === group);
    const gCiAmt = groupCi.reduce((s, r) => s + r.amount, 0);
    const gCoAmt = groupCo.reduce((s, r) => s + r.amount, 0);

    lines.push(`📍 *${group}*`);
    lines.push(`💵 $${gCiAmt.toLocaleString()} in (${groupCi.length} tx) · 💸 $${gCoAmt.toLocaleString()} out (${groupCo.length} tx) · 📈 $${(gCiAmt - gCoAmt).toLocaleString()} net`);

    const gameMap: Record<string, { amount: number; points: number }> = {};
    for (const r of groupCiAll) {
      if (!gameMap[r.game]) gameMap[r.game] = { amount: 0, points: 0 };
      gameMap[r.game].amount += r.amount;
      gameMap[r.game].points += r.points;
    }
    const games = Object.entries(gameMap).sort((a, b) => b[1].amount - a[1].amount);
    if (games.length > 0) {
      lines.push(`\`\`\``);
      lines.push(tableHeader());
      lines.push(tableDivider());
      for (const [game, data] of games) {
        lines.push(tableRow(game, `$${data.amount.toLocaleString()}`, data.points.toLocaleString()));
      }
      lines.push(`\`\`\``);
    }
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`_Report generated at midnight CST_`);
  return lines.join("\n");
}

// ─── Build monthly report ─────────────────────────────────────────────────────
function buildMonthlyReport(monthStr: string): string {
  // monthStr = "YYYY-MM"
  const ci = getCashInRecords().filter(r => r.date.startsWith(monthStr));
  const ciAll = getCashInRecordsAll().filter(r => r.date.startsWith(monthStr));
  const co = getCashoutRecords().filter(r => r.created_at.startsWith(monthStr));

  const [y, m] = monthStr.split("-");
  const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  const allGroups = Array.from(new Set([
    ...ciAll.map(r => r.group),
    ...co.map(r => r.group),
  ])).filter(Boolean).sort();

  const totalCiAmt = ci.reduce((s, r) => s + r.amount, 0);
  const totalCoAmt = co.reduce((s, r) => s + r.amount, 0);

  // Best and worst days
  const dailyNet: Record<string, number> = {};
  ci.forEach(r => { dailyNet[r.date] = (dailyNet[r.date] || 0) + r.amount; });
  co.forEach(r => { const d = r.created_at.substring(0, 10); dailyNet[d] = (dailyNet[d] || 0) - r.amount; });
  const days = Object.entries(dailyNet).sort((a, b) => b[1] - a[1]);
  const bestDay = days[0];
  const worstDay = days[days.length - 1];

  let lines: string[] = [];
  lines.push(`📅 *Monthly Report — ${monthName}*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`💵 Total Cash-In:  $${totalCiAmt.toLocaleString()} (${ci.length} tx)`);
  lines.push(`💸 Total Cashout:  $${totalCoAmt.toLocaleString()} (${co.length} tx)`);
  lines.push(`📈 Net:            *$${(totalCiAmt - totalCoAmt).toLocaleString()}*`);
  if (bestDay)  lines.push(`🏆 Best Day:  ${formatDate(bestDay[0])} — $${bestDay[1].toLocaleString()} net`);
  if (worstDay && worstDay[0] !== bestDay?.[0]) lines.push(`📉 Worst Day: ${formatDate(worstDay[0])} — $${worstDay[1].toLocaleString()} net`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  for (const group of allGroups) {
    const groupCi = ci.filter(r => r.group === group);
    const groupCiAll = ciAll.filter(r => r.group === group);
    const groupCo = co.filter(r => r.group === group);
    const gCiAmt = groupCi.reduce((s, r) => s + r.amount, 0);
    const gCoAmt = groupCo.reduce((s, r) => s + r.amount, 0);

    lines.push(`📍 *${group}*`);
    lines.push(`💵 $${gCiAmt.toLocaleString()} in · 💸 $${gCoAmt.toLocaleString()} out · 📈 $${(gCiAmt - gCoAmt).toLocaleString()} net`);

    const gameMap: Record<string, { amount: number; points: number }> = {};
    for (const r of groupCiAll) {
      if (!gameMap[r.game]) gameMap[r.game] = { amount: 0, points: 0 };
      gameMap[r.game].amount += r.amount;
      gameMap[r.game].points += r.points;
    }
    const games = Object.entries(gameMap).sort((a, b) => b[1].amount - a[1].amount);
    if (games.length > 0) {
      lines.push(`\`\`\``);
      lines.push(tableHeader());
      lines.push(tableDivider());
      for (const [game, data] of games) {
        lines.push(tableRow(game, `$${data.amount.toLocaleString()}`, data.points.toLocaleString()));
      }
      lines.push(`\`\`\``);
    }
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`_Report generated on the 1st of the month_`);
  return lines.join("\n");
}

// ─── Main: update snapshot ────────────────────────────────────────────────────
export async function updateSnapshot(bot: TelegramBot) {
  const { date, time } = nowCST();
  const text = buildSnapshot(date, time);

  try {
    if (snapshotMsgId) {
      // Try to edit existing pinned message
      await bot.editMessageText(text, {
        chat_id: REPORT_GROUP_ID,
        message_id: snapshotMsgId,
        parse_mode: "Markdown",
      });
    } else {
      // Create new snapshot message and pin it
      const msg = await bot.sendMessage(REPORT_GROUP_ID, text, { parse_mode: "Markdown" });
      snapshotMsgId = msg.message_id;
      await bot.pinChatMessage(REPORT_GROUP_ID, snapshotMsgId, { disable_notification: true }).catch(() => {});
    }
  } catch (e: any) {
    // Message too old (>48h) or missing — create a fresh one
    console.log("Snapshot message stale, creating new one...");
    try {
      const msg = await bot.sendMessage(REPORT_GROUP_ID, text, { parse_mode: "Markdown" });
      snapshotMsgId = msg.message_id;
      await bot.pinChatMessage(REPORT_GROUP_ID, snapshotMsgId, { disable_notification: true }).catch(() => {});
    } catch (e2) {
      console.error("Failed to create snapshot:", e2);
    }
  }
}

// ─── Send end of day report ───────────────────────────────────────────────────
async function sendEndOfDayReport(bot: TelegramBot, dateStr: string) {
  const text = buildEndOfDayReport(dateStr);
  try {
    await bot.sendMessage(REPORT_GROUP_ID, text, { parse_mode: "Markdown" });
    console.log(`✅ End of day report sent for ${dateStr}`);
    // Reset snapshot so a fresh one is created for the new day
    snapshotMsgId = null;
  } catch (e) {
    console.error("Failed to send end of day report:", e);
  }
}

// ─── Send monthly report ──────────────────────────────────────────────────────
async function sendMonthlyReport(bot: TelegramBot, monthStr: string) {
  const text = buildMonthlyReport(monthStr);
  try {
    await bot.sendMessage(REPORT_GROUP_ID, text, { parse_mode: "Markdown" });
    console.log(`✅ Monthly report sent for ${monthStr}`);
  } catch (e) {
    console.error("Failed to send monthly report:", e);
  }
}

// ─── Scheduler: runs every minute, checks if it's time ───────────────────────
export function startReportScheduler(bot: TelegramBot) {
  let lastEndOfDayDate = "";
  let lastMonthlyMonth = "";

  setInterval(async () => {
    const { date, hour, minute, month, full } = nowCST();

    // End of day: midnight CST (hour=0, minute=0)
    if (hour === 0 && minute === 0 && date !== lastEndOfDayDate) {
      lastEndOfDayDate = date;
      // Report is for YESTERDAY
      const yesterday = new Date(full.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      await sendEndOfDayReport(bot, yesterdayStr);

      // Monthly report: if it's the 1st of the month at midnight
      if (full.getDate() === 1 && month !== lastMonthlyMonth) {
        lastMonthlyMonth = month;
        // Report for previous month
        const prevMonth = new Date(full.getFullYear(), full.getMonth() - 1, 1);
        const prevMonthStr = prevMonth.toISOString().substring(0, 7);
        await sendMonthlyReport(bot, prevMonthStr);
      }
    }
  }, 60 * 1000); // check every minute

  console.log("✅ Report scheduler started");
}

// ─── Manual commands: /today and /month ──────────────────────────────────────
export function registerReportCommands(bot: TelegramBot) {
  bot.onText(/\/today/, async (msg) => {
    if (msg.chat.id !== REPORT_GROUP_ID) return;
    const { date, time } = nowCST();
    const text = buildSnapshot(date, time);
    await bot.sendMessage(REPORT_GROUP_ID, text, { parse_mode: "Markdown" }).catch(console.error);
  });

  bot.onText(/\/month/, async (msg) => {
    if (msg.chat.id !== REPORT_GROUP_ID) return;
    const { month } = nowCST();
    const text = buildMonthlyReport(month);
    await bot.sendMessage(REPORT_GROUP_ID, text, { parse_mode: "Markdown" }).catch(console.error);
  });

  console.log("✅ Report commands registered (/today, /month)");
}
