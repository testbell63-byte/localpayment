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

console.log("✅ Telegram Bot started");

// Start Dashboard Server
const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// Simple dashboard route
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Tracker</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-950 text-white">
      <div class="max-w-6xl mx-auto p-8">
        <h1 class="text-4xl font-bold text-center mb-10 text-green-400">💰 Payment Tracker Dashboard</h1>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div class="bg-gray-900 p-8 rounded-3xl text-center">
            <p class="text-gray-400">Total Amount Received</p>
            <p class="text-4xl font-bold text-green-400 mt-3" id="total-amount">$0.00</p>
          </div>
          <div class="bg-gray-900 p-8 rounded-3xl text-center">
            <p class="text-gray-400">Total Points Loaded</p>
            <p class="text-4xl font-bold text-blue-400 mt-3" id="total-points">0</p>
          </div>
          <div class="bg-gray-900 p-8 rounded-3xl text-center">
            <p class="text-gray-400">Total Transactions</p>
            <p class="text-4xl font-bold text-purple-400 mt-3" id="transaction-count">0</p>
          </div>
        </div>

        <div class="bg-gray-900 p-8 rounded-3xl">
          <h2 class="text-2xl font-semibold mb-6">Recent Transactions</h2>
          <div id="transactions" class="text-gray-300 text-sm">
            Loading recent transactions...
          </div>
        </div>

        <div class="text-center mt-12 text-gray-500 text-xs">
          Dashboard connected to SQLite • Bot is running
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
