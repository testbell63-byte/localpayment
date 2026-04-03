import express from "express";
import { createServer } from "http";
import { initTelegramBot } from "../telegramBot.js";
import fs from "fs";
import path from "path";

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 8080;
const BOT_TOKEN = process.env.BOT_TOKEN || "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";
const RECORDS_FILE = path.join(process.cwd(), "records.csv");

app.use(express.json());

// Root → Dashboard
app.get("/", (req, res) => res.redirect("/dashboard"));

// Dashboard
app.get("/dashboard", (req, res) => {
  let allRecords: any[] = [];

  if (fs.existsSync(RECORDS_FILE)) {
    const content = fs.readFileSync(RECORDS_FILE, "utf-8");
    const lines = content.trim().split("\n").slice(1);
    allRecords = lines.map((line) => {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return {
        date: parts[0] || "",
        time: parts[1] || "",
        day: parts[2] || "",
        group: (parts[3] || "").replace(/"/g, ""),
        employee: (parts[4] || "").replace(/"/g, ""),
        amount: parseFloat(parts[5]) || 0,
        game: (parts[6] || "").replace(/"/g, ""),
        points: parseFloat(parts[7]) || 0,
      };
    });
  }

  // Sort by newest first (date + time)
  allRecords.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.time.localeCompare(a.time);
  });

  // Today Summary
  const today = new Date().toISOString().split("T")[0];
  const todayRecords = allRecords.filter(r => r.date === today);
  const todayAmount = todayRecords.reduce((sum, r) => sum + r.amount, 0);
  const todayPoints = todayRecords.reduce((sum, r) => sum + r.points, 0);
  const todayTransactions = todayRecords.length;

  // Group Breakdown
  const groupBreakdown: any = {};
  allRecords.forEach(r => {
    if (!groupBreakdown[r.group]) groupBreakdown[r.group] = { amount: 0, points: 0, count: 0 };
    groupBreakdown[r.group].amount += r.amount;
    groupBreakdown[r.group].points += r.points;
    groupBreakdown[r.group].count++;
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Tracker</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 p-6">
  <div class="max-w-6xl mx-auto">
    <h1 class="text-4xl font-bold text-gray-800 mb-8">💰 Payment Tracker</h1>

    <!-- Today Summary -->
    <div class="bg-white p-8 rounded-3xl shadow mb-10">
      <h2 class="text-2xl font-semibold mb-6">📅 Today (${today})</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <p class="text-gray-500">Total Amount</p>
          <p class="text-4xl font-bold text-green-600">$${todayAmount.toFixed(2)}</p>
        </div>
        <div>
          <p class="text-gray-500">Total Points</p>
          <p class="text-4xl font-bold text-blue-600">${todayPoints}</p>
        </div>
        <div>
          <p class="text-gray-500">Transactions</p>
          <p class="text-4xl font-bold">${todayTransactions}</p>
        </div>
        <div>
          <p class="text-gray-500">Avg Amount</p>
          <p class="text-4xl font-bold">$${(todayTransactions ? (todayAmount / todayTransactions).toFixed(2) : '0.00')}</p>
        </div>
      </div>
    </div>

    <!-- Group Breakdown -->
    <div class="bg-white p-6 rounded-3xl shadow mb-10">
      <h3 class="font-semibold mb-4">Summary by Group</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${Object.keys(groupBreakdown).map(group => {
          const g = groupBreakdown[group];
          return `<div class="border rounded-2xl p-5">
            <p class="font-semibold">${group}</p>
            <p class="text-3xl font-bold text-green-600">$${g.amount.toFixed(2)}</p>
            <p class="text-sm text-gray-500">${g.points} pts • ${g.count} txns</p>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Recent Transactions (Newest First) -->
    <div class="bg-white rounded-3xl shadow overflow-hidden">
      <div class="px-8 py-5 border-b font-semibold flex justify-between">
        <span>Recent Transactions</span>
        <div class="flex gap-4 text-sm">
          <a href="/records.csv" class="text-blue-600 hover:underline">All CSV</a>
          <a href="/daily.csv" class="text-blue-600 hover:underline">Today CSV</a>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-8 py-4 text-left">Date</th>
              <th class="px-8 py-4 text-left">Time</th>
              <th class="px-8 py-4 text-left">Group</th>
              <th class="px-8 py-4 text-left">Employee</th>
              <th class="px-8 py-4 text-left">Amount</th>
              <th class="px-8 py-4 text-left">Game</th>
              <th class="px-8 py-4 text-left">Points</th>
            </tr>
          </thead>
          <tbody>
            ${allRecords.slice(0, 100).map(r => `
              <tr class="border-t hover:bg-gray-50">
                <td class="px-8 py-4">${r.date}</td>
                <td class="px-8 py-4">${r.time}</td>
                <td class="px-8 py-4 font-medium">${r.group}</td>
                <td class="px-8 py-4">${r.employee}</td>
                <td class="px-8 py-4 font-medium">$${r.amount}</td>
                <td class="px-8 py-4">${r.game}</td>
                <td class="px-8 py-4">${r.points}</td>
              </tr>
            `).join('')}
            ${allRecords.length === 0 ? `<tr><td colspan="7" class="px-8 py-16 text-center text-gray-500">No records yet. Send screenshots in Telegram.</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    // Auto refresh when new data is detected
    let lastRecordCount = ${allRecords.length};
    setInterval(() => {
      fetch(window.location.href)
        .then(r => r.text())
        .then(html => {
          const match = html.match(/Transactions<\/p>\s*<p class="text-4xl font-bold">(\d+)<\/p>/);
          if (match) {
            const currentCount = parseInt(match[1]);
            if (currentCount > lastRecordCount) {
              location.reload();
            }
          }
        });
    }, 10000); // Check every 10 seconds
  </script>
</body>
</html>`;

  res.send(html);
});

// CSV Routes - Newest first
app.get("/records.csv", (req, res) => {
  if (fs.existsSync(RECORDS_FILE)) res.download(RECORDS_FILE, "payment_records.csv");
  else res.send("No records yet.");
});

app.get("/daily.csv", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  let csv = "Date,Time,Day,Group,Employee,Amount,Game,Points\n";
  if (fs.existsSync(RECORDS_FILE)) {
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").split("\n");
    lines.slice(1).forEach(line => { if (line.startsWith(today)) csv += line + "\n"; });
  }
  res.setHeader("Content-Disposition", `attachment; filename=daily_${today}.csv`);
  res.send(csv);
});

app.get("/monthly.csv", (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  let csv = "Date,Time,Day,Group,Employee,Amount,Game,Points\n";
  if (fs.existsSync(RECORDS_FILE)) {
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").split("\n");
    lines.slice(1).forEach(line => { if (line.startsWith(month)) csv += line + "\n"; });
  }
  res.setHeader("Content-Disposition", `attachment; filename=monthly_${month}.csv`);
  res.send(csv);
});

// Telegram Webhook
const webhookPath = `/bot${BOT_TOKEN}`;
app.post(webhookPath, (req, res) => {
  const bot = (global as any).telegramBot;
  if (bot) bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Start
const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`;

const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Dashboard → ${baseUrl}/dashboard`);
});
