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

// Root redirects to dashboard
app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

// Simple Dashboard
app.get("/dashboard", (req, res) => {
  let records: any[] = [];

  if (fs.existsSync(RECORDS_FILE)) {
    const content = fs.readFileSync(RECORDS_FILE, "utf-8");
    const lines = content.trim().split("\n").slice(1); // skip header

    records = lines.map((line) => {
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

  const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
  const totalTransactions = records.length;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Tracker</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 p-6">
  <div class="max-w-6xl mx-auto">
    <h1 class="text-4xl font-bold text-gray-800 mb-8">💰 Payment Tracker Dashboard</h1>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      <div class="bg-white p-6 rounded-2xl shadow">
        <p class="text-gray-500">Total Amount Received</p>
        <p class="text-4xl font-bold text-green-600">$${totalAmount.toFixed(2)}</p>
      </div>
      <div class="bg-white p-6 rounded-2xl shadow">
        <p class="text-gray-500">Total Transactions</p>
        <p class="text-4xl font-bold">${totalTransactions}</p>
      </div>
      <div class="bg-white p-6 rounded-2xl shadow">
        <p class="text-gray-500">Records in CSV</p>
        <p class="text-4xl font-bold">${records.length}</p>
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow overflow-hidden">
      <div class="px-6 py-4 bg-gray-50 border-b font-medium">Recent Transactions</div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="bg-gray-50">
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
            ${records.slice(0, 100).map(r => `
              <tr class="border-t hover:bg-gray-50">
                <td class="px-6 py-3">${r.date}</td>
                <td class="px-6 py-3">${r.time}</td>
                <td class="px-6 py-3">${r.day}</td>
                <td class="px-6 py-3">${r.employee}</td>
                <td class="px-6 py-3">$${r.amount}</td>
                <td class="px-6 py-3">${r.game}</td>
                <td class="px-6 py-3">${r.points}</td>
              </tr>
            `).join("")}
            ${records.length === 0 ? `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No records yet. Send a screenshot in Telegram.</td></tr>` : ""}
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-8 flex gap-4">
      <a href="/records.csv" class="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700">📥 Download All Records (CSV)</a>
      <a href="/daily.csv" class="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700">📥 Download Today's Records</a>
      <a href="/monthly.csv" class="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700">📥 Download This Month</a>
    </div>
  </div>
</body>
</html>`;

  res.send(html);
});

// CSV download routes
app.get("/records.csv", (req, res) => {
  if (fs.existsSync(RECORDS_FILE)) {
    res.download(RECORDS_FILE, "payment_records.csv");
  } else {
    res.send("No records yet.");
  }
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

// Start everything
const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : `http://localhost:${PORT}`;

const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Dashboard: ${baseUrl}/dashboard`);
});
