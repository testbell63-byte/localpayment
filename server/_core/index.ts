import express from "express";
import { createServer } from "http";
import { initTelegramBot } from "../telegramBot";

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 8080;
const BOT_TOKEN = process.env.BOT_TOKEN || "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";

app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.send("✅ Payment Tracker Bot is running");
});

// Webhook route
const webhookPath = `/bot${BOT_TOKEN}`;
app.post(webhookPath, (req, res) => {
  const bot = (global as any).telegramBot;
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

// Start bot with webhook
const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : `http://localhost:${PORT}`;

const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

console.log(`🚀 Server running on port ${PORT}`);
console.log(`🌐 Webhook URL: ${baseUrl}${webhookPath}`);

server.listen(PORT, () => {
  console.log(`✅ Bot + Dashboard is live on port ${PORT}`);
});
