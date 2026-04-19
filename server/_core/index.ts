import express from "express";
import { createServer } from "http";
import { initTelegramBot } from "../telegramBot.js";
import { updateSnapshot, startReportScheduler, registerReportCommands } from "../reporting.js";
import fs from "fs";
import path from "path";

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 8080;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const RECORDS_FILE = path.join(process.cwd(), "records.csv");
const CASHOUT_RECORDS_FILE = path.join(process.cwd(), "cashout_records.csv");

if (!fs.existsSync(RECORDS_FILE)) {
  fs.writeFileSync(RECORDS_FILE, "Date,Time,Day,Group,Employee,Amount,Game,Points,Notes\n");
}
if (!fs.existsSync(CASHOUT_RECORDS_FILE)) {
  fs.writeFileSync(CASHOUT_RECORDS_FILE, "id,created_at,updated_at,group,employee,amount,game,points,playback_id,tip\n");
}

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "server/public")));

function getRecords() {
  try {
    const content = fs.readFileSync(RECORDS_FILE, "utf-8");
    return content.trim().split("\n").slice(1).filter(l => l.trim()).map(line => {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return {
        date:     parts[0] || "",
        time:     parts[1] || "",
        day:      parts[2] || "",
        group:    (parts[3] || "").replace(/"/g, ""),
        employee: (parts[4] || "").replace(/"/g, ""),
        amount:   parseFloat(parts[5]) || 0,
        game:     (parts[6] || "").replace(/"/g, ""),
        points:   parseFloat(parts[7]) || 0,
        notes:    (parts[8] || "").replace(/"/g, ""),
      };
    });
  } catch (e) { return []; }
}

function getCashoutRecords() {
  try {
    const content = fs.readFileSync(CASHOUT_RECORDS_FILE, "utf-8");
    return content.trim().split("\n").slice(1).filter(l => l.trim()).map(line => {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return {
        id:          (parts[0] || "").replace(/"/g, ""),
        created_at:  (parts[1] || "").replace(/"/g, ""),
        updated_at:  (parts[2] || "").replace(/"/g, ""),
        group:       (parts[3] || "").replace(/"/g, ""),
        employee:    (parts[4] || "").replace(/"/g, ""),
        amount:      parseFloat(parts[5]) || 0,
        game:        (parts[6] || "").replace(/"/g, ""),
        points:      parseFloat(parts[7]) || 0,
        playback_id: (parts[8] || "").replace(/"/g, ""),
        tip:         parseFloat(parts[9]) || 0,
      };
    });
  } catch (e) { return []; }
}

app.get("/", (req, res) => res.redirect("/dashboard"));
app.get("/api/transactions", (req, res) => res.json({ transactions: getRecords() }));
app.get("/api/cashout-transactions", (req, res) => res.json({ cashoutTransactions: getCashoutRecords() }));

app.get("/dashboard", (req, res) => {
  try {
    const html = fs.readFileSync(path.join(process.cwd(), "server/_core/dashboard.html"), "utf-8");
    res.send(html);
  } catch (e) {
    res.status(500).send("Dashboard not found");
  }
});

const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${PORT}`;

const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

startReportScheduler(bot);
registerReportCommands(bot);

const webhookPath = `/bot${BOT_TOKEN.replace(":", "_")}`;
const webhookUrl = `${baseUrl}${webhookPath}`;

bot.deleteWebHook()
  .then(() => {
    console.log("✅ Webhook cleared");
    return bot.setWebHook(webhookUrl);
  })
  .then(() => console.log(`✅ Webhook registered: ${webhookUrl}`))
  .catch((err) => console.error("❌ Failed to set webhook:", err));

app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
