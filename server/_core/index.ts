import { initTelegramBot } from "../telegramBot.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";

console.log("🚀 Starting Payment Tracker Bot + Dashboard...");

// Start Telegram Bot
initTelegramBot(BOT_TOKEN);

// Start Express Dashboard
const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// Main dashboard route
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Tracker Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-950 text-white min-h-screen">
      <div class="max-w-6xl mx-auto p-8">
        <h1 class="text-5xl font-bold text-center mb-12 text-green-400">💰 Payment Tracker Dashboard</h1>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div class="bg-gray-900 p-8 rounded-3xl text-center">
            <p class="text-gray-400 text-sm">Total Amount</p>
            <p class="text-4xl font-bold text-green-400 mt-2" id="total-amount">$0</p>
          </div>
          <div class="bg-gray-900 p-8 rounded-3xl text-center">
            <p class="text-gray-400 text-sm">Total Points</p>
            <p class="text-4xl font-bold text-blue-400 mt-2" id="total-points">0</p>
          </div>
          <div class="bg-gray-900 p-8 rounded-3xl text-center">
            <p class="text-gray-400 text-sm">Transactions</p>
            <p class="text-4xl font-bold text-purple-400 mt-2" id="transaction-count">0</p>
          </div>
        </div>

        <div class="bg-gray-900 p-8 rounded-3xl">
          <h2 class="text-2xl font-semibold mb-6">Recent Transactions</h2>
          <div id="recent" class="text-gray-300">Loading transactions...</div>
        </div>

        <div class="text-center mt-12 text-gray-500 text-sm">
          Dashboard is connected to SQLite database<br>
          Telegram bot is also running
        </div>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`✅ Dashboard is live on port ${PORT}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
});
