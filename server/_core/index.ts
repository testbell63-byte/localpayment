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

// Start Web Dashboard
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Tracker</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 p-8">
      <div class="max-w-4xl mx-auto bg-white rounded-2xl shadow p-10">
        <h1 class="text-4xl font-bold text-center mb-8">💰 Payment Tracker Dashboard</h1>
        <p class="text-center text-gray-600 text-lg">Your dashboard is being set up.</p>
        <p class="text-center text-sm text-gray-500 mt-4">Check back in a moment after full deployment.</p>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🌐 Dashboard running on port ${PORT}`);
  console.log(`🔗 Public URL will be available on Railway`);
});
