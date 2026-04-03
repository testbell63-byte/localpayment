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

// Dashboard
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

  // Daily & Monthly calculations
  const today = new Date().toISOString().split("T")[0];
  const thisMonth = today.substring(0, 7);

  const daily = records.filter(r => r.date === today);
  const monthly = records.filter(r => r.date.startsWith(thisMonth));

  const dailyAmount = daily.reduce((sum, r) => sum + r.amount, 0);
  const monthlyAmount = monthly.reduce((sum, r) => sum + r.amount, 0);

  let html = `... (full modern dashboard with Tailwind, charts, totals, table, download buttons) ...`;

  res.send(html);
});

// CSV downloads
app.get("/records.csv", (req, res) => fs.existsSync(RECORDS_FILE) ? res.download(RECORDS_FILE) : res.send("No records yet"));

app.get("/daily.csv", (req, res) => { /* daily csv logic */ });
app.get("/monthly.csv", (req, res) => { /* monthly csv logic */ });

// Webhook
const webhookPath = `/bot${BOT_TOKEN}`;
app.post(webhookPath, (req, res) => {
  const bot = (global as any).telegramBot;
  if (bot) bot.processUpdate(req.body);
  res.sendStatus(200);
});

const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`;

const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

server.listen(PORT, () => console.log(`✅ Dashboard live at ${baseUrl}/dashboard`));
