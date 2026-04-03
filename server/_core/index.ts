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

// Health check + redirect
app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

// Simple but useful Dashboard
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
      <title>Payment Tracker Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>body { font-family: system-ui; }</style>
    </head>
    <body class="bg-gray-50 p-8">
      <div class="max-w-6xl mx-auto">
        <h1 class="text-4xl font-bold mb-8 flex items-center gap-3">
          💰 Payment Tracker
        </h1>

        <div class="flex gap-4 mb-8">
          <a href="/records.csv" 
             class="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium">
            📥 Download Full Records CSV
          </a>
        </div>

        <h2 class="text-2xl font-semibold mb-4">Recent Transactions</h2>
        <div class="bg-white rounded-2xl shadow overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-100">
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
  `;

  records.slice(0, 100).forEach(r => {
    html += `
      <tr class="border-t hover:bg-gray-50">
        <td class="px-6 py-3">${r.date}</td>
        <td class="px-6 py-3">${r.time}</td>
        <td class="px-6 py-3">${r.day}</td>
        <td class="px-6 py-3">${r.employee}</td>
        <td class="px-6 py-3 font-medium">$${r.amount}</td>
        <td class="px-6 py-3">${r.game}</td>
        <td class="px-6 py-3">${r.points}</td>
      </tr>`;
  });

  if (records.length === 0) {
    html += `<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">No records yet. Send some screenshots in Telegram.</td></tr>`;
  }

  html += `</tbody></table></div></div></body></html>`;
  res.send(html);
});

// Direct CSV download
app.get("/records.csv", (req, res) => {
  if (fs.existsSync(RECORDS_FILE)) {
    res.download(RECORDS_FILE, "records.csv");
  } else {
    res.send("No records.csv file yet.");
  }
});

// Telegram Webhook
const webhookPath = `/bot${BOT_TOKEN}`;
app.post(webhookPath, (req, res) => {
  const bot = (global as any).telegramBot;
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

// Start everything
const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : `http://localhost:${PORT}`;

const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

console.log(`🚀 Server running on port ${PORT}`);
console.log(`🌐 Dashboard: ${baseUrl}/dashboard`);
console.log(`📥 CSV Download: ${baseUrl}/records.csv`);

server.listen(PORT, () => {
  console.log(`✅ Bot + Dashboard is live`);
});
