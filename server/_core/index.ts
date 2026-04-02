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
const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  res.send(`
    <h1 style="text-align:center; margin-top:100px; font-family:sans-serif;">
      Payment Tracker Dashboard<br><br>
      <small style="color:gray;">Loading... Check back in 30 seconds</small>
    </h1>
  `);
});

app.listen(PORT, () => {
  console.log(`🌐 Dashboard is listening on port ${PORT}`);
  console.log(`🔗 Public URL should be available on Railway`);
});
