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
    <h1 class="text-4xl font-bold text-gray-800 mb-8">💰 Payment Tracker Dashboard</h1>
    <!-- Date Selector -->
    <div class="bg-white p-6 rounded-2xl shadow mb-8">
      <label class="block text-sm font-medium text-gray-600 mb-2">View Totals for a Specific Day</label>
      <div class="flex gap-4 items-end flex-wrap">
        <input type="date" id="selectedDate" class="border border-gray-300 rounded-lg px-4 py-2">
        <button onclick="showDayTotals()" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Show Day</button>
        <button onclick="resetToAll()" class="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">All Time</button>
      </div>
      <div id="daySummary" class="mt-6"></div>
    </div>
    <!-- Overall Summary -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      <div class="bg-white p-6 rounded-2xl shadow">
        <p class="text-gray-500">Total Amount (All)</p>
        <p class="text-4xl font-bold text-green-600">$${totalAmount.toFixed(2)}</p>
      </div>
      <div class="bg-white p-6 rounded-2xl shadow">
        <p class="text-gray-500">Total Transactions</p>
        <p class="text-4xl font-bold">${totalTransactions}</p>
      </div>
      <div class="bg-white p-6 rounded-2xl shadow">
        <p class="text-gray-500">Records</p>
        <p class="text-4xl font-bold">${allRecords.length}</p>
      </div>
    </div>
    <!-- Recent Transactions -->
    <div class="bg-white rounded-2xl shadow overflow-hidden">
      <div class="px-6 py-4 bg-gray-50 border-b font-semibold">Recent Transactions (Latest 50)</div>
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
          <tbody>
            ${allRecords.slice(0, 50).map(r => `
              <tr class="border-t">
                <td class="px-6 py-3">${r.date}</td>
                <td class="px-6 py-3">${r.time}</td>
                <td class="px-6 py-3">${r.day}</td>
                <td class="px-6 py-3">${r.employee}</td>
                <td class="px-6 py-3">$${r.amount}</td>
                <td class="px-6 py-3">${r.game}</td>
                <td class="px-6 py-3">${r.points}</td>
              </tr>
            `).join('')}
            ${allRecords.length === 0 ? `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No records yet</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>
    <div class="mt-8 flex gap-4 flex-wrap">
      <a href="/records.csv" class="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700">Download All Records CSV</a>
      <a href="/daily.csv" class="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700">Download Today CSV</a>
      <a href="/monthly.csv" class="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700">Download This Month CSV</a>
    </div>
  </div>
  <script>
    let allRecords = ${JSON.stringify(allRecords)};
    function showDayTotals() {
      const date = document.getElementById('selectedDate').value;
      if (!date) return alert("Please select a date");
      const dayRecords = allRecords.filter(r => r.date === date);
      if (dayRecords.length === 0) {
        document.getElementById('daySummary').innerHTML = '<p class="text-red-600">No records for this date.</p>';
        return;
      }
      const total = dayRecords.reduce((sum, r) => sum + r.amount, 0);
      let gameHTML = '';
      const games = {};
      dayRecords.forEach(r => {
        if (!games[r.game]) games[r.game] = {amt:0, pts:0, cnt:0};
        games[r.game].amt += r.amount;
        games[r.game].pts += r.points;
        games[r.game].cnt++;
      });
      Object.keys(games).forEach(g => {
        const gm = games[g];
        gameHTML += \`<div class="flex justify-between py-1"><span>\${g}</span><span>\${gm.amt.toFixed(2)} • \${gm.pts} pts (\${gm.cnt})</span></div>\`;
      });
      document.getElementById('daySummary').innerHTML = \`
        <div class="bg-green-50 p-6 rounded-2xl mt-4">
          <p class="font-semibold mb-2">📅 \${date} Summary</p>
          <p class="text-3xl font-bold text-green-600">Total: $\${total.toFixed(2)}</p>
          <div class="mt-4 text-sm">\${gameHTML}</div>
        </div>
      \`;
    }
    function resetToAll() {
      document.getElementById('selectedDate').value = '';
      document.getElementById('daySummary').innerHTML = '';
    }
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
    lines.slice(1).forEach(line => { if (line.startsWith(today)) csv += line + "\n"; });
  }
  res.setHeader("Content-Disposition", `attachment; filename=daily_${today}.csv`);
  res.send(csv);
});
app.get("/monthly.csv", (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  let csv = "Date,Time,Day,Employee,Amount,Game,Points\n";
  if (fs.existsSync(RECORDS_FILE)) {
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").split("\n");
    lines.slice(1).forEach(line => { if (line.startsWith(month)) csv += line + "\n"; });
  }
  res.setHeader("Content-Disposition", `attachment; filename=monthly_${month}.csv`);
  res.send(csv);
});
// Webhook
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
