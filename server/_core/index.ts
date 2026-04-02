import { initTelegramBot } from "../telegramBot.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";

console.log("🚀 Starting Payment Tracker Bot + Dashboard...");

// Start Telegram Bot
const bot = initTelegramBot(BOT_TOKEN);

// Start Web Dashboard
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "../public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

app.get("/", (req, res) => {
  res.render("dashboard");
});

app.listen(PORT, () => {
  console.log(`✅ Dashboard is live at: http://localhost:${PORT}`);
  console.log(`🌐 On Railway it will be available on your public URL`);
});
