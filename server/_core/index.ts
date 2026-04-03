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

// Dashboard with Date Selector
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
        employee: (parts[3] || "").replace(/"/g, ""),
        amount: parseFloat(parts[4]) || 0,
        game: (parts[5] || "").replace(/"/g, ""),
        points: parseFloat(parts[6]) || 0,
      };
    });
  }

  const totalAmount = allRecords.reduce((sum, r) => sum + r.amount, 0);
  const totalTransactions = allRecords.length;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Tracker Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    table { border-collapse: collapse; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  </style>
</head>
<body class="bg-gray-50 p-6">
  <div class="max-w-6xl mx-auto">
    <h1 class="text-4xl font-bold text-gray-800 mb-8">💰 Payment Tracker Dashboard</h1>

    <!-- Date Selector -->
    <div class="bg-white p-6 rounded-2xl shadow mb-8">
      <label class="block text-sm font-medium text-gray-600 mb-2">View Totals for Specific Day</label>
      <div class="flex gap-4 items-end">
        <input type="date" id="selectedDate" 
               class="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500">
        <button onclick="showDayTotals()" 
                class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Show Day Totals
        </button>
        <button onclick="resetToAll()" 
                class="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
          Show All Time
        </button>
      </div>
      <div id="daySummary" class="mt-6 hidden"></div>
    </div>

    <!-- Overall Summary -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      <div class="bg-white p-6 rounded-2xl shadow">
        <p class="text-gray-500 text-sm">Total Amount (All Time)</p>
        <p class="text-4xl font-bold text-green-600">$${totalAmount.toFixed(2)}</p>
      </div>
      <div class="bg-white p-6 rounded-2xl shadow">
        <p class="text-gray-500 text-sm">Total Transactions</p>
        <p class="text-4xl font-bold">${totalTransactions}</p>
      </div>
      <div class="bg-white p-6 rounded-2xl shadow">
        <p class="text-gray-500 text-sm">Records</p>
        <p class="text-4xl font-bold">${allRecords.length}</p>
      </div>
    </div>

    <!-- Recent Transactions -->
    <div class="bg-white rounded-2xl shadow overflow-hidden">
      <div class="px-6 py-4 bg-gray-50 border-b font-semibold flex justify-between">
        <span>Recent Transactions</span>
        <a href="/records.csv" class="text-blue-600 hover:underline text-sm">↓ Download Full CSV</a>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left">Date</th>
              <th class="px-6 py-3 text-left">Time</th>
              <th class="px-6 py-3 text-left">Day</th>
              <th class="px-6 py-3 text-left">Employee</th>
              <th class="px-6 py-3 text-left">Amount</th>
              <th class="px-6 py-3 text-left">Game</th>
              <th class="px-6 py-3 text-left">Points</th>
            </tr>
          </thead>
          <tbody id="recent-table">
            ${allRecords.slice(0, 50).map(r => `
              <tr class="border-t hover:bg-gray-50">
                <td class="px-6 py-3">${r.date}</td>
                <td class="px-6 py-3">${r.time}</td>
                <td class="px-6 py-3">${r.day}</td>
                <td class="px-6 py-3">${r.employee}</td>
                <td class="px-6 py-3 font-medium">$${r.amount}</td>
                <td class="px-6 py-3">${r.game}</td>
                <td class="px-6 py-3">${r.points}</td>
              </tr>
            `).join('')}
            ${allRecords.length === 0 ? `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No records yet. Send screenshots in Telegram.</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-8 text-center text-sm text-gray-500">
      Daily & Monthly CSVs: <a href="/daily.csv" class="text-blue-600 hover:underline">Today</a> | 
      <a href="/monthly.csv" class="text-blue-600 hover:underline">This Month</a>
    </div>
  </div>

  <script>
    let allRecords = ${JSON.stringify(allRecords)};

    function showDayTotals() {
      const dateInput = document.getElementById('selectedDate').value;
      if (!dateInput) return alert("Please select a date");

      const dayRecords = allRecords.filter(r => r.date === dateInput);
      if (dayRecords.length === 0) {
        document.getElementById('daySummary').innerHTML = `<p class="text-red-600">No records found for ${dateInput}</p>`;
        document.getElementById('daySummary').classList.remove('hidden');
        return;
      }

      const totalAmount = dayRecords.reduce((sum, r) => sum + r.amount, 0);

      // Game breakdown
      const gameMap = {};
      dayRecords.forEach(r => {
        if (!gameMap[r.game]) gameMap[r.game] = { amount: 0, points: 0, count: 0 };
        gameMap[r.game].amount += r.amount;
        gameMap[r.game].points += r.points;
        gameMap[r.game].count++;
      });

      let gameHTML = '';
      Object.keys(gameMap).forEach(game => {
        const g = gameMap[game];
        gameHTML += `<div class="flex justify-between py-1">
          <span>${game}</span>
          <span class="font-medium">$${g.amount.toFixed(2)} • ${g.points} pts (${g.count} txns)</span>
        </div>`;
      });

      document.getElementById('daySummary').innerHTML = `
        <div class="bg-green-50 border border-green-200 p-6 rounded-2xl">
          <p class="text-green-700 font-semibold mb-3">📅 ${dateInput} Summary</p>
          <p class="text-3xl font-bold text-green-600">Total Amount: $${totalAmount.toFixed(2)}</p>
          <div class="mt-4 space-y-2 text-sm">${gameHTML}</div>
        </div>
      `;
      document.getElementById('daySummary').classList.remove('hidden');
    }

    function resetToAll() {
      document.getElementById('selectedDate').value = '';
      document.getElementById('daySummary').classList.add('hidden');
    }

    // Auto-refresh every 30 seconds (only if new data)
    let lastCount = ${totalTransactions};
    setInterval(() => {
      fetch('/dashboard')
        .then(r => r.text())
        .then(html => {
          const newCountMatch = html.match(/Total Transactions<\/p>\s*<p class="text-4xl font-bold">(\d+)<\/p>/);
          if (newCountMatch) {
            const newCount = parseInt(newCountMatch[1]);
            if (newCount > lastCount) {
              location.reload();
            }
          }
        });
    }, 30000);
  </script>
</body>
</html>`;

  res.send(html);
});

// CSV Routes
app.get("/records.csv", (req, res) => {
  if (fs.existsSync(RECORDS_FILE)) res.download(RECORDS_FILE, "payment_records.csv");
  else res.send("No records yet.");
});

app.get("/daily.csv", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  let csv = "Date,Time,Day,Employee,Amount,Game,Points\n";
  if (fs.existsSync(RECORDS_FILE)) {
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").split("\n");
    lines.slice(1).forEach(line => {
      if (line.startsWith(today)) csv += line + "\n";
    });
  }
  res.setHeader("Content-Disposition", `attachment; filename=daily_${today}.csv`);
  res.send(csv);
});

app.get("/monthly.csv", (req, res) => {
  const thisMonth = new Date().toISOString().slice(0, 7);
  let csv = "Date,Time,Day,Employee,Amount,Game,Points\n";
  if (fs.existsSync(RECORDS_FILE)) {
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").split("\n");
    lines.slice(1).forEach(line => {
      if (line.startsWith(thisMonth)) csv += line + "\n";
    });
  }
  res.setHeader("Content-Disposition", `attachment; filename=monthly_${thisMonth}.csv`);
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
const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : `http://localhost:${PORT}`;

const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Dashboard: ${baseUrl}/dashboard`);
});
