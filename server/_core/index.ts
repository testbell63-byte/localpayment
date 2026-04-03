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

// Health
app.get("/", (req, res) => res.redirect("/dashboard"));

// ====================== DASHBOARD ======================
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

  // Calculate summaries
  const today = new Date().toISOString().split("T")[0];
  const thisMonth = today.substring(0, 7);

  const dailyRecords = records.filter(r => r.date === today);
  const monthlyRecords = records.filter(r => r.date.startsWith(thisMonth));

  const dailyTotalAmount = dailyRecords.reduce((sum, r) => sum + r.amount, 0);
  const monthlyTotalAmount = monthlyRecords.reduce((sum, r) => sum + r.amount, 0);

  const dailyPointsByGame = {};
  dailyRecords.forEach(r => {
    dailyPointsByGame[r.game] = (dailyPointsByGame[r.game] || 0) + r.points;
  });

  const monthlyPointsByGame = {};
  monthlyRecords.forEach(r => {
    monthlyPointsByGame[r.game] = (monthlyPointsByGame[r.game] || 0) + r.points;
  });

  let html = `
    <html>
    <head>
      <title>Payment Tracker Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        body { font-family: system-ui; }
        table { border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f8fafc; }
      </style>
    </head>
    <body class="bg-gray-50 p-8">
      <div class="max-w-7xl mx-auto">
        <h1 class="text-4xl font-bold mb-8">💰 Payment Tracker</h1>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div class="bg-white p-6 rounded-2xl shadow">
            <p class="text-gray-500">Today Total Amount</p>
            <p class="text-4xl font-bold text-green-600">$${dailyTotalAmount.toFixed(2)}</p>
          </div>
          <div class="bg-white p-6 rounded-2xl shadow">
            <p class="text-gray-500">This Month Total Amount</p>
            <p class="text-4xl font-bold text-blue-600">$${monthlyTotalAmount.toFixed(2)}</p>
          </div>
          <div class="bg-white p-6 rounded-2xl shadow">
            <p class="text-gray-500">Total Transactions</p>
            <p class="text-4xl font-bold">${records.length}</p>
          </div>
        </div>

        <div class="flex gap-4 mb-8">
          <a href="/records.csv" class="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700">📥 Download Full CSV</a>
          <a href="/daily.csv" class="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700">📥 Today CSV</a>
          <a href="/monthly.csv" class="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700">📥 This Month CSV</a>
        </div>

        <h2 class="text-2xl font-semibold mb-4">Recent Records</h2>
        <div class="bg-white rounded-2xl shadow overflow-hidden">
          <table class="w-full">
            <thead>
              <tr>
                <th>Date</th><th>Time</th><th>Day</th><th>Employee</th><th>Amount</th><th>Game</th><th>Points</th>
              </tr>
            </thead>
            <tbody>
  `;

  records.slice(0, 100).forEach(r => {
    html += `<tr>
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${r.day}</td>
      <td>${r.employee}</td>
      <td>$${r.amount}</td>
      <td>${r.game}</td>
      <td>${r.points}</td>
    </tr>`;
  });

  html += `</tbody></table></div></div></body></html>`;
  res.send(html);
});

// CSV Downloads
app.get("/records.csv", (req, res) => {
  if (fs.existsSync(RECORDS_FILE)) res.download(RECORDS_FILE);
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

// Webhook for Telegram Bot
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
  console.log(`✅ Dashboard & Bot running on port ${PORT}`);
  console.log(`🌐 Dashboard: ${baseUrl}/dashboard`);
});
