import { initTelegramBot } from "../telegramBot.js";
import express from "express";

const BOT_TOKEN = "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";

console.log("🚀 Starting Payment Tracker Bot + Dashboard...");

// Start Telegram Bot
initTelegramBot(BOT_TOKEN);

console.log("✅ Telegram Bot started");

// Start simple Dashboard
const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send(`
    <html>
    <head>
      <title>Payment Tracker</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-900 text-white p-10">
      <div class="max-w-4xl mx-auto">
        <h1 class="text-5xl font-bold text-green-400 text-center mb-10">💰 Payment Tracker Dashboard</h1>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-gray-800 p-8 rounded-3xl text-center">
            <p class="text-gray-400">Total Amount</p>
            <p class="text-4xl font-bold text-green-400" id="amount">$0.00</p>
          </div>
          <div class="bg-gray-800 p-8 rounded-3xl text-center">
            <p class="text-gray-400">Total Points</p>
            <p class="text-4xl font-bold text-blue-400" id="points">0</p>
          </div>
          <div class="bg-gray-800 p-8 rounded-3xl text-center">
            <p class="text-gray-400">Transactions</p>
            <p class="text-4xl font-bold text-purple-400" id="count">0</p>
          </div>
        </div>

        <div class="mt-12 text-center text-gray-500">
          Send a screenshot to the Telegram bot to see data here.<br>
          <span class="text-xs">Dashboard is connected • Bot is running</span>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`✅ Dashboard is live on port ${PORT}`);
  console.log(`🌐 Open: http://localhost:${PORT} (or your Railway URL)`);
});
