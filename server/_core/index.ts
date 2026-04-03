import express from "express";
import { createServer } from "http";
import { initTelegramBot } from "../telegramBot";
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

// Smart Live Dashboard
app.get("/dashboard", (req, res) => {
  let records = [];
  if (fs.existsSync(RECORDS_FILE)) {
    const data = fs.readFileSync(RECORDS_FILE, "utf8");
    const lines = data.trim().split("\n").slice(1);
    records = lines.map(line => {
      const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return {
        date: cols[0] || "",
        time: cols[1] || "",
        day: cols[2] || "",
        employee: cols[3] ? cols[3].replace(/"/g, "") : "",
        amount: parseFloat(cols[4]) || 0,
        game: cols[5] ? cols[5].replace(/"/g, "") : "",
        points: parseFloat(cols[6]) || 0
      };
    });
  }

  // Today's and This Month's totals using same logic as bot
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const thisMonthStr = todayStr.substring(0, 7);

  const dailyRecords = records.filter(r => r.date === todayStr);
  const monthlyRecords = records.filter(r => r.date.startsWith(thisMonthStr));

  const dailyAmount = dailyRecords.reduce((sum, r) => sum + r.amount, 0);
  const monthlyAmount = monthlyRecords.reduce((sum, r) => sum + r.amount, 0);

  let html = `
    <html>
    <head>
      <title>Payment Tracker Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
        body { font-family: system-ui; }
        .card { transition: transform 0.2s; }
        .card:hover { transform: translateY(-4px); }
      </style>
    </head>
    <body class="bg-gray-50 p-8">
      <div class="max-w-7xl mx-auto">
        <div class="flex justify-between items-center mb-10">
          <h1 class="text-5xl font-bold">💰 Payment Tracker</h1>
          <div class="text-sm text-green-600 font-medium" id="last-update">Live • Last updated just now</div>
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div class="bg-white p-8 rounded-3xl shadow card">
            <p class="text-gray-500">Today's Total Amount</p>
            <p class="text-5xl font-bold text-green-600" id="daily-amount">$${dailyAmount.toFixed(2)}</p>
          </div>
          <div class="bg-white p-8 rounded-3xl shadow card">
            <p class="text-gray-500">This Month's Total Amount</p>
            <p class="text-5xl font-bold text-blue-600" id="monthly-amount">$${monthlyAmount.toFixed(2)}</p>
          </div>
          <div class="bg-white p-8 rounded-3xl shadow card">
            <p class="text-gray-500">Total Transactions</p>
            <p class="text-5xl font-bold" id="total-transactions">${records.length}</p>
          </div>
        </div>

        <!-- Download Buttons -->
        <div class="flex flex-wrap gap-4 mb-12">
          <a href="/records.csv" class="px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-medium">📥 Full Records CSV</a>
          <a href="/daily.csv" class="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-medium">📥 Today's CSV</a>
          <a href="/monthly.csv" class="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-medium">📥 This Month CSV</a>
        </div>

        <!-- Recent Records -->
        <div class="bg-white rounded-3xl shadow overflow-hidden">
          <div class="px-8 py-6 border-b font-semibold text-lg">Recent Transactions</div>
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-8 py-4 text-left">Date</th>
                <th class="px-8 py-4 text-left">Time</th>
                <th class="px-8 py-4 text-left">Day</th>
                <th class="px-8 py-4 text-left">Employee</th>
                <th class="px-8 py-4 text-left">Amount</th>
                <th class="px-8 py-4 text-left">Game</th>
                <th class="px-8 py-4 text-left">Points</th>
              </tr>
            </thead>
            <tbody id="table-body">
  `;

  records.slice(0, 100).forEach(r => {
    html += `
      <tr class="border-t hover:bg-gray-50">
        <td class="px-8 py-4">${r.date}</td>
        <td class="px-8 py-4">${r.time}</td>
        <td class="px-8 py-4">${r.day}</td>
        <td class="px-8 py-4">${r.employee}</td>
        <td class="px-8 py-4 font-medium">$${r.amount}</td>
        <td class="px-8 py-4">${r.game}</td>
        <td class="px-8 py-4">${r.points}</td>
      </tr>`;
  });

  html += `</tbody></table></div></div>`;

  // Live refresh script
  html += `
    <script>
      let lastRecordCount = ${records.length};

      function refreshDashboard() {
        fetch('/dashboard-data')
          .then(res => res.json())
          .then(data => {
            if (data.count > lastRecordCount) {
              location.reload(); // New data → full refresh
            } else {
              // Update totals without reload
              document.getElementById('daily-amount').textContent = '$' + data.dailyAmount.toFixed(2);
              document.getElementById('monthly-amount').textContent = '$' + data.monthlyAmount.toFixed(2);
              document.getElementById('total-transactions').textContent = data.count;
              document.getElementById('last-update').textContent = 'Live • Just updated';
            }
          })
          .catch(() => {});
      }

      // Check every 8 seconds
      setInterval(refreshDashboard, 8000);
    </script>
  </html>`;

  res.send(html);
});

// API for live refresh
app.get("/dashboard-data", (req, res) => {
  let records = [];
  if (fs.existsSync(RECORDS_FILE)) {
    const data = fs.readFileSync(RECORDS_FILE, "utf8");
    const lines = data.trim().split("\n").slice(1);
    records = lines.map(line => {
      const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return { date: cols[0] || "" };
    });
  }

  const today = new Date().toISOString().split("T")[0];
  const thisMonth = today.substring(0, 7);

  const dailyAmount = records.filter(r => r.date === today).length > 0 ? 
    records.filter(r => r.date === today).reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0) : 0;

  const monthlyAmount = records.filter(r => r.date.startsWith(thisMonth)).length > 0 ? 
    records.filter(r => r.date.startsWith(thisMonth)).reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0) : 0;

  res.json({
    count: records.length,
    dailyAmount: dailyAmount,
    monthlyAmount: monthlyAmount
  });
});

// CSV Downloads
app.get("/records.csv", (req, res) => {
  if (fs.existsSync(RECORDS_FILE)) res.download(RECORDS_FILE, "records.csv");
  else res.send("No records yet.");
});

app.get("/daily.csv", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  let csv = "Date,Time,Day,Employee,Amount,Game,Points\n";
  if (fs.existsSync(RECORDS_FILE)) {
    const lines = fs.readFileSync(RECORDS_FILE, "utf8").split("\n");
    lines.slice(1).forEach(line => {
      if (line.startsWith(today)) csv += line + "\n";
    });
  }
  res.setHeader("Content-Disposition", `attachment; filename="daily_${today}.csv"`);
  res.send(csv);
});

app.get("/monthly.csv", (req, res) => {
  const thisMonth = new Date().toISOString().slice(0, 7);
  let csv = "Date,Time,Day,Employee,Amount,Game,Points\n";
  if (fs.existsSync(RECORDS_FILE)) {
    const lines = fs.readFileSync(RECORDS_FILE, "utf8").split("\n");
    lines.slice(1).forEach(line => {
      if (line.startsWith(thisMonth)) csv += line + "\n";
    });
  }
  res.setHeader("Content-Disposition", `attachment; filename="monthly_${thisMonth}.csv"`);
  res.send(csv);
});

// Telegram Webhook
const webhookPath = `/bot${BOT_TOKEN}`;
app.post(webhookPath, (req, res) => {
  const bot = (global as any).telegramBot;
  if (bot) bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Start Bot
const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : `http://localhost:${PORT}`;

const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

server.listen(PORT, () => {
  console.log(`✅ Dashboard live at ${baseUrl}/dashboard`);
});
