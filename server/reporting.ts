import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

const RECORDS_FILE = path.join(process.cwd(), "records.csv");
const CASHOUT_RECORDS_FILE = path.join(process.cwd(), "cashout_records.csv");
const REPORT_GROUP_ID = -1003718366443;
const STATE_FILE = path.join(process.cwd(), "bot_state.json");

// ─── Persistent state — survives restarts via JSON file ───────────────────────
function loadState(): { snapshotMsgId: number | null } {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch { return { snapshotMsgId: null }; }
}

function saveState(state: { snapshotMsgId: number | null }) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (e) { console.error("Failed to save state:", e); }
}

let snapshotMsgId: number | null = loadState().snapshotMsgId;
console.log(`[Reporting] Loaded snapshotMsgId: ${snapshotMsgId}`);

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
  })).filter(r => r.amount !== 0); // exclude $0 multi-game rows but keep negative deletion rows
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

// ─── CST/CDT time helpers (America/Chicago, DST-aware) ───────────────────────
function nowCST() {
  const now = new Date();
  const tz = "America/Chicago";
  const date = now.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const time = now.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });
  const month = date.substring(0, 7);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "numeric", day: "numeric", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || "0");
  return {
    date,
    time,
    month,
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    full: now,
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

// ─── Build snapshot text (per-group) ─────────────────────────────────────────
function buildSnapshot(dateStr: string, updatedTime: string): string {
  const ciAll = getCashInRecordsAll();
  const ci    = getCashInRecords();
  const co    = getCashoutRecords();
  const monthStr = dateStr.substring(0, 7);

  // All unique groups
  const allGroups = Array.from(new Set([
    ...ciAll.map(r => r.group),
    ...co.map(r => r.group),
  ])).filter(Boolean).sort();

  let lines: string[] = [];
  lines.push(`📊 *Daily Snapshot — ${formatDate(dateStr)}*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  for (const group of allGroups) {
    // ── Net today for this group ──
    const todayCi = ci.filter(r => r.date === dateStr && r.group === group).reduce((s, r) => s + r.amount, 0);
    const todayCo = co.filter(r => r.created_at.startsWith(dateStr) && r.group === group).reduce((s, r) => s + r.amount, 0);
    const todayNet = todayCi - todayCo;

    // ── Net month for this group ──
    const monthCi = ci.filter(r => r.date.startsWith(monthStr) && r.group === group).reduce((s, r) => s + r.amount, 0);
    const monthCo = co.filter(r => r.created_at.startsWith(monthStr) && r.group === group).reduce((s, r) => s + r.amount, 0);
    const monthNet = monthCi - monthCo;

    lines.push(`📍 *${group}*`);
    lines.push(`💵 Net Today:  ${todayNet >= 0 ? "+" : ""}$${todayNet.toLocaleString()}   _(CI $${todayCi.toLocaleString()} · CO $${todayCo.toLocaleString()})_`);
    lines.push(`📅 Net Month:  ${monthNet >= 0 ? "+" : ""}$${monthNet.toLocaleString()}   _(CI $${monthCi.toLocaleString()} · CO $${monthCo.toLocaleString()})_`);

    // ── Net points per game for this group (spent - redeemed) ──
    const ptsSpent: Record<string, number> = {};
    ciAll.filter(r => r.group === group).forEach(r => {
      ptsSpent[r.game] = (ptsSpent[r.game] || 0) + r.points;
    });

    const ptsRedeemed: Record<string, number> = {};
    co.filter(r => r.group === group).forEach(r => {
      const net = r.points - r.playback;
      ptsRedeemed[r.game] = (ptsRedeemed[r.game] || 0) + net;
    });

    const allGames = Array.from(new Set([
      ...Object.keys(ptsSpent),
      ...Object.keys(ptsRedeemed),
    ])).filter(Boolean);

    const gameNetPts: Record<string, number> = {};
    for (const game of allGames) {
      gameNetPts[game] = (ptsSpent[game] || 0) - (ptsRedeemed[game] || 0);
    }

    const sortedGames = Object.entries(gameNetPts).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

    if (sortedGames.length > 0) {
      lines.push(`\`\`\``);
      lines.push(`${"Game".padEnd(16)}${"Net Pts".padStart(10)}`);
      lines.push(`─`.repeat(26));
      for (const [game, net] of sortedGames) {
        lines.push(`${game.padEnd(16)}${((net >= 0 ? "+" : "") + net.toLocaleString()).padStart(10)}`);
      }
      lines.push(`\`\`\``);
    } else {
      lines.push(`_No points data yet_`);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  if (allGroups.length === 0) {
    lines.push(`_No data yet today_`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  lines.push(`🕐 ${updatedTime}`);
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

  const sendFresh = async () => {
    try {
      const msg = await bot.sendMessage(REPORT_GROUP_ID, text, { parse_mode: "Markdown" });
      snapshotMsgId = msg.message_id;
      saveState({ snapshotMsgId });
      await bot.pinChatMessage(REPORT_GROUP_ID, snapshotMsgId, { disable_notification: true })
        .catch(e => console.warn("⚠️ Could not pin snapshot (bot may not be admin):", e.message));
      console.log("✅ Snapshot sent, id:", snapshotMsgId);
    } catch (e) {
      console.error("❌ Failed to send snapshot:", e);
    }
  };

  if (snapshotMsgId) {
    try {
      await bot.editMessageText(text, {
        chat_id: REPORT_GROUP_ID,
        message_id: snapshotMsgId,
        parse_mode: "Markdown",
      });
      console.log("✅ Snapshot updated");
    } catch (e: any) {
      console.warn("Snapshot edit failed, creating fresh:", e.message);
      snapshotMsgId = null;
      await sendFresh();
    }
  } else {
    await sendFresh();
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
    saveState({ snapshotMsgId: null });
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
      // Report is for YESTERDAY — subtract one day from today's Chicago date
      const [y, m, d] = date.split("-").map(Number);
      const yesterday = new Date(y, m - 1, d - 1);
      const yesterdayStr = yesterday.toLocaleDateString("en-CA"); // YYYY-MM-DD
      await sendEndOfDayReport(bot, yesterdayStr);

      // Monthly report: if it's the 1st of the month at midnight
      if (day === 1 && month !== lastMonthlyMonth) {
        lastMonthlyMonth = month;
        // Report for previous month
        const [y, mo] = date.split("-").map(Number);
        const prevMonth = new Date(y, mo - 2, 1);
        const prevMonthStr = prevMonth.toLocaleDateString("en-CA").substring(0, 7);
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

// ─── Notify report group of a deletion & refresh snapshot ────────────────────
export async function notifyDelete(bot: TelegramBot, type: "cashin" | "cashout", detail: string) {
  const { date, time } = nowCST();
  const label = type === "cashin" ? "💵 Cash-In" : "💸 Cashout";
  try {
    await bot.sendMessage(
      REPORT_GROUP_ID,
      `🗑️ *Record Deleted*\n${label} · ${detail}\n📅 ${date} · ${time}`,
      { parse_mode: "Markdown" }
    );
  } catch (_) {}
  await updateSnapshot(bot).catch(() => {});
}
