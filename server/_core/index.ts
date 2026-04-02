import { initTelegramBot } from "../telegramBot.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";
const db = new Database(path.join(process.cwd(), "payment_tracker.db"));

console.log("🚀 Starting Payment Tracker Bot + Dashboard...");

initTelegramBot(BOT_TOKEN);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/payments", (req, res) => {
  try {
    const payments = db.prepare("SELECT * FROM payments ORDER BY created_at DESC LIMIT 100").all();
    res.json(payments);
  } catch (e) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Tracker</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-900 text-white p-8">
      <h1 class="text-4xl font-bold text-center mb-8">💰 Payment Tracker Dashboard</h1>
      
      <div class="max-w-4xl mx-auto">
        <button onclick="loadData()" 
                class="mb-6 px-6 py-3 bg-green-600 rounded-xl hover:bg-green-700">
          Refresh Data
        </button>

        <div id="data" class="bg-gray-800 p-6 rounded-2xl">
          Loading payments...
        </div>
      </div>

      <script>
        async function loadData() {
          const res = await fetch('/api/payments');
          const payments = await res.json();
          
          let html = '<table class="w-full"><tr><th>Date</th><th>Employee</th><th>Amount</th><th>Game</th><th>Points</th></tr>';
          payments.forEach(p => {
            html += `<tr><td>${p.date}</td><td>${p.employee}</td><td>$${p.amount}</td><td>${p.game}</td><td>${p.points}</td></tr>`;
          });
          html += '</table>';
          document.getElementById('data').innerHTML = html;
        }
        loadData();
      </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`✅ Dashboard running on port ${PORT}`);
});
