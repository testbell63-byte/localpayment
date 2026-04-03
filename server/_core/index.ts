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

// Root route - redirect to dashboard
app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

// Main Dashboard
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

  // Daily & Monthly calculations
  const today = new Date().toISOString().split("T")[0];
  const thisMonth = today.substring(0, 7);

  const dailyRecords = records.filter(r => r.date === today);
  const monthlyRecords = records.filter(r => r.date.startsWith(thisMonth));

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
        <h1 class="text-5xl font-bold mb-10">💰 Payment Tracker</h1>

        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div class="bg-white p-8 rounded-3xl shadow card">
            <p class="text-gray-500">Today's Total</p>
            <p class="text-5xl font-bold text-green-600">$${dailyAmount.toFixed(2)}</p>
          </div>
          <div class="bg-white p-8 rounded-3xl shadow card">
            <p class="text-gray-500">This Month's Total</p>
            <p class="text-5xl font-bold text-blue-600">$${monthlyAmount.toFixed(2)}</p>
          </div>
          <div class="bg-white p-8 rounded-3xl shadow card">
            <p class="text-gray-500">Total Transactions</p>
            <p class="text-5xl font-bold">${records.length}</p>
          </div>
        </div>

        <!-- Download Buttons -->
        <div class="flex flex-wrap gap-4 mb-12">
          <a href="/records.csv" class="px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-medium">📥 Full Records CSV</a>
          <a href="/daily.csv" class="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-medium">📥 Today's CSV</a>
          <a href="/monthly.csv" class="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-medium">📥 This Month CSV</a>
        </div>

        <!-- Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <div class="bg-white p-8 rounded-3xl shadow">
            <h3 class="font-semibold mb-4">Points Trend</h3>
            <canvas id="trendChart" height="140"></canvas>
          </div>
          <div class="bg-white p-8 rounded-3xl shadow">
            <h3 class="font-semibold mb-4">Game Distribution</h3>
            <canvas id="pieChart" height="140"></canvas>
          </div>
        </div>

        <!-- Records Table -->
        <div class="bg-white rounded-3xl shadow overflow-hidden">
          <div class="px-8 py-6 border-b font-semibold text-lg">Recent Transactions</div>
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-4 text-left">Date</th>
                <th class="px-6 py-4 text-left">Time</th>
                <th class="px-6 py-4 text-left">Day</th>
                <th class="px-6 py-4 text-left">Employee</th>
                <th class="px-6 py-4 text-left">Amount</th>
                <th class="px-6 py-4 text-left">Game</th>
                <th class="px-6 py-4 text-left">Points</th>
              </tr>
            </thead>
            <tbody>
  `;

  records.slice(0, 100).forEach(r => {
    html += `
      <tr class="border-t hover:bg-gray-50">
        <td class="px-6 py-4">${r.date}</td>
        <td class="px-6 py-4">${r.time}</td>
        <td class="px-6 py-4">${r.day}</td>
        <td class="px-6 py-4">${r.employee}</td>
        <td class="px-6 py-4 font-medium">$${r.amount}</td>
        <td class="px-6 py-4">${r.game}</td>
        <td class="px-6 py-4">${r.points}</td>
      </tr>`;
  });

  html += `</tbody></table></div></div></body></html>`;

  // Add charts script
  html = html.replace("</body>", `
    <script>
      const records = ${JSON.stringify(records.slice(0, 30))};
      new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: {
          labels: records.map(r => r.date),
          datasets: [{ label: 'Points', data: records.map(r => r.points), borderColor: '#3b82f6', tension: 0.4 }]
        },
        options: { plugins: { legend: { display: false } } }
      });

      const gameData = {};
      records.forEach(r => gameData[r.game] = (gameData[r.game] || 0) + r.points);
      new Chart(document.getElementById('pieChart'), {
        type: 'pie',
        data: {
          labels: Object.keys(gameData),
          datasets: [{ data: Object.values(gameData), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }]
        }
      });
    </script>
  </html>`);

  res.send(html);
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
  console.log(`✅ Dashboard & Bot live on port ${PORT}`);
  console.log(`🌐 Open: ${baseUrl}/dashboard`);
});
