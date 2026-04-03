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

// Dashboard with Filters + Group Breakdown
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
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-50">
  <div class="flex min-h-screen">
    <!-- Sidebar Filters -->
    <div class="w-72 bg-white border-r p-6 overflow-y-auto">
      <h2 class="font-semibold text-lg mb-6">Filters</h2>
      
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-2">Date Range</label>
          <input type="date" id="fromDate" class="w-full border rounded-lg px-3 py-2 text-sm">
          <input type="date" id="toDate" class="w-full border rounded-lg px-3 py-2 text-sm mt-2">
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Employee</label>
          <select id="employeeFilter" class="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">All Employees</option>
            ${[...new Set(allRecords.map(r => r.employee))].sort().map(emp => 
              `<option value="${emp}">${emp}</option>`
            ).join('')}
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Platform</label>
          <select id="gameFilter" class="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">All Platforms</option>
            ${[...new Set(allRecords.map(r => r.game))].sort().map(game => 
              `<option value="${game}">${game}</option>`
            ).join('')}
          </select>
        </div>

        <button onclick="applyFilters()" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl">Apply Filters</button>
        <button onclick="resetFilters()" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 rounded-xl">Reset Filters</button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 p-8">
      <h1 class="text-4xl font-bold mb-8">💰 Payment Tracker</h1>

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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          ${Object.keys(groupBreakdown).map(group => {
            const g = groupBreakdown[group];
            return `<div class="border rounded-2xl p-6">
              <p class="font-semibold">${group}</p>
              <p class="text-3xl font-bold text-green-600 mt-1">$${g.amount.toFixed(2)}</p>
              <p class="text-sm text-gray-500">${g.points} points • ${g.count} txns</p>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        <div class="bg-white p-6 rounded-3xl shadow">
          <h3 class="font-semibold mb-4">Daily Trend</h3>
          <canvas id="trendChart" height="140"></canvas>
        </div>
        <div class="bg-white p-6 rounded-3xl shadow">
          <h3 class="font-semibold mb-4">Platform Distribution</h3>
          <canvas id="pieChart" height="140"></canvas>
        </div>
      </div>

      <!-- Transactions Table -->
      <div class="bg-white rounded-3xl shadow overflow-hidden">
        <div class="px-8 py-5 border-b font-semibold">Recent Transactions</div>
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
            <tbody id="table-body">
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
              ${allRecords.length === 0 ? `<tr><td colspan="7" class="px-8 py-16 text-center text-gray-500">No records yet</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    let allRecords = ${JSON.stringify(allRecords)};

    function applyFilters() {
      const from = document.getElementById('fromDate').value;
      const to = document.getElementById('toDate').value;
      const employee = document.getElementById('employeeFilter').value;
      const game = document.getElementById('gameFilter').value;

      let filtered = allRecords;
      if (from) filtered = filtered.filter(r => r.date >= from);
      if (to) filtered = filtered.filter(r => r.date <= to);
      if (employee) filtered = filtered.filter(r => r.employee === employee);
      if (game) filtered = filtered.filter(r => r.game === game);

      renderTable(filtered);
    }

    function resetFilters() {
      document.getElementById('fromDate').value = '';
      document.getElementById('toDate').value = '';
      document.getElementById('employeeFilter').value = '';
      document.getElementById('gameFilter').value = '';
      renderTable(allRecords);
    }

    function renderTable(records) {
      let html = '';
      records.forEach(r => {
        html += `<tr class="border-t hover:bg-gray-50">
          <td class="px-8 py-4">${r.date}</td>
          <td class="px-8 py-4">${r.time}</td>
          <td class="px-8 py-4 font-medium">${r.group}</td>
          <td class="px-8 py-4">${r.employee}</td>
          <td class="px-8 py-4 font-medium">$${r.amount}</td>
          <td class="px-8 py-4">${r.game}</td>
          <td class="px-8 py-4">${r.points}</td>
        </tr>`;
      });
      document.getElementById('table-body').innerHTML = html || '<tr><td colspan="7" class="px-8 py-16 text-center text-gray-500">No matching records</td></tr>';
    }

    window.onload = () => renderTable(allRecords);

    // Auto refresh
    setInterval(() => location.reload(), 15000);
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
