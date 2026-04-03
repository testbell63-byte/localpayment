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
app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

// Simple Working Dashboard
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

  let html = `
    <html>
    <head>
      <title>Payment Tracker</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-50 p-8">
      <div class="max-w-6xl mx-auto">
        <h1 class="text-4xl font-bold mb-8">💰 Payment Tracker Dashboard</h1>

        <div class="flex gap-4 mb-8">
          <a href="/records.csv" class="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700">📥 Download Full CSV</a>
          <a href="/daily.csv" class="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700">📥 Today's CSV</a>
          <a href="/monthly.csv" class="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700">📥 This Month CSV</a>
        </div>

        <h2 class="text-2xl font-semibold mb-4">Recent Records</h2>
        <div class="bg-white rounded-2xl shadow overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-100">
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

  if (records.length === 0) {
    html += `<tr><td colspan="7" class="px-6 py-12 text-center text-gray-500">No records yet. Send screenshots in Telegram to see data here.</td></tr>`;
  }

  html += `</tbody></table></div></div></body></html>`;
  res.send(html);
});

// CSV Downloads
app.get("/records.csv", (req, res) => {
  if (fs.existsSync(RECORDS_FILE)) {
    res.download(RECORDS_FILE, "records.csv");
  } else {
    res.send("No records.csv yet.");
  }
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
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Dashboard: ${baseUrl}/dashboard`);
});
