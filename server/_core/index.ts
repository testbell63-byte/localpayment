import express from "express";
import { createServer } from "http";
import { initTelegramBot } from "./telegramBot.js";
import fs from "fs";
import path from "path";
import rateLimit from "express-rate-limit";
import csv from "csv-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 8080;
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_KEY = process.env.API_KEY;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN environment variable not set");
  process.exit(1);
}
if (!API_KEY) {
  console.error("❌ API_KEY environment variable not set");
  process.exit(1);
}

const RECORDS_FILE = path.join(process.cwd(), "records.csv");
const CASHOUT_RECORDS_FILE = path.join(process.cwd(), "cashout_records.csv");

// Ensure CSV files exist with headers
if (!fs.existsSync(RECORDS_FILE)) {
  fs.writeFileSync(RECORDS_FILE, "Date,Time,Day,Group,Employee,Amount,Game,Points,Notes\n");
}
if (!fs.existsSync(CASHOUT_RECORDS_FILE)) {
  fs.writeFileSync(CASHOUT_RECORDS_FILE, "id,created_at,updated_at,group,employee,amount,game,points,playback_id,tip\n");
}

// Helper to parse CSV safely
function readCSV<T>(filePath: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

// Get Cash-In records
async function getRecords() {
  try {
    const records = await readCSV<any>(RECORDS_FILE);
    return records.map(r => ({
      date: r.Date || "",
      time: r.Time || "",
      day: r.Day || "",
      group: r.Group?.replace(/"/g, "") || "",
      employee: r.Employee?.replace(/"/g, "") || "",
      amount: parseFloat(r.Amount) || 0,
      game: r.Game?.replace(/"/g, "") || "",
      points: parseFloat(r.Points) || 0,
    }));
  } catch (err) {
    console.error("Error reading records.csv:", err);
    return [];
  }
}

// Get Cashout records
async function getCashoutRecords() {
  try {
    const records = await readCSV<any>(CASHOUT_RECORDS_FILE);
    return records.map(r => ({
      id: r.id || "",
      created_at: r.created_at || "",
      updated_at: r.updated_at || "",
      group: r.group || "",
      employee: r.employee || "",
      amount: parseFloat(r.amount) || 0,
      game: r.game || "",
      points: parseFloat(r.points) || 0,
      playback_id: r.playback_id || "",
      tip: parseFloat(r.tip) || 0,
    }));
  } catch (err) {
    console.error("Error reading cashout_records.csv:", err);
    return [];
  }
}

// Middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "server/public")));

// API Key authentication for /api routes
const apiKeyAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});

app.use("/api/", apiLimiter);
app.use("/api/", apiKeyAuth);

// API endpoints
app.get("/api/transactions", async (req, res) => {
  const transactions = await getRecords();
  res.json({ transactions });
});
app.get("/api/cashout-transactions", async (req, res) => {
  const cashoutTransactions = await getCashoutRecords();
  res.json({ cashoutTransactions });
});

// Dashboard route
app.get("/dashboard", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const html = fs.readFileSync(path.join(process.cwd(), "server/_core/dashboard.html"), "utf-8").replace("{{TODAY}}", today);
  res.send(html);
});
app.get("/", (req, res) => res.redirect("/dashboard"));

// Telegram webhook
const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${PORT}`;
const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
