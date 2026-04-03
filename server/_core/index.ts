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

// Root → Dashboard
app.get("/", (req, res) => res.redirect("/dashboard"));

// Simple Dashboard with Date Range Filter
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

  let html = `
    <html>
    <head>
      <title>Payment Tracker</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-50 p-8">
      <div class="max-w-6xl mx-auto">
        <h1 class="text-4xl font-bold mb-8">💰 Payment Tracker Dashboard</h1>

        <!-- Date Range Filter -->
        <div class="bg-white p-6 rounded-2xl shadow mb-10">
          <div class="flex gap-6 items-end">
            <div>
              <label class="block text-sm text-gray-500 mb-1">From Date</label>
              <input type="date" id="fromDate" class="border border-gray-300 rounded-lg px-4 py-2">
            </div>
            <div>
              <label class="block text-sm text-gray-500 mb-1">To Date</label>
              <input type="date" id="toDate" class="border border-gray-300 rounded-lg px-4 py-2">
            </div>
            <button onclick="applyFilter()" class="px-6 py-2 bg-blue-600 text-white rounded-lg">Apply Filter</button>
            <button onclick="clearFilter()" class="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg">Clear</button>
          </div>
        </div>

        <!-- Summary -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10" id="summary-cards">
          <!-- Filled by JS -->
        </div>

        <!-- Table -->
        <div class="bg-white rounded-2xl shadow overflow-hidden">
          <div class="px-6 py-4 border-b font-semibold">Transactions</div>
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left">Date</th>
                <th class="px-6 py-3 text-left">Time</th>
                <th class="px-6 py-3 text-left">Day</th>
                <th class="px-6 py-3 text-left">Employee</th>
                <th class="px-6 py-3 text-left">Amount</th>
                <th class="px-6 py-3 text-left">Game</th>
                <th class="px-6 py-3 text-left">Points</th>
              </tr>
            </thead>
            <tbody id="table-body"></tbody>
          </table>
        </div>
      </div>

      <script>
        let allRecords = ${JSON.stringify(records)};

        function renderTable(filtered) {
          let html = '';
          filtered.forEach(r => {
            html += `<tr class="border-t">
              <td class="px-6 py-3">${r.date}</td>
              <td class="px-6 py-3">${r.time}</td>
              <td class="px-6 py-3">${r.day}</td>
              <td class="px-6 py-3">${r.employee}</td>
              <td class="px-6 py-3">$${r.amount}</td>
              <td class="px-6 py-3">${r.game}</td>
              <td class="px-6 py-3">${r.points}</td>
            </tr>`;
          });
          document.getElementById('table-body').innerHTML = html || '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">No records found</td></tr>';
        }

        function applyFilter() {
          const from = document.getElementById('fromDate').value;
          const to = document.getElementById('toDate').value;

          let filtered = allRecords;
          if (from) filtered = filtered.filter(r => r.date >= from);
          if (to) filtered = filtered.filter(r => r.date <= to);

          renderTable(filtered);

          const total = filtered.reduce((sum, r) => sum + r.amount, 0);
          document.getElementById('summary-cards').innerHTML = `
            <div class="bg-white p-6 rounded-2xl shadow">
              <p class="text-gray-500">Filtered Total</p>
              <p class="text-4xl font-bold text-green-600">$${total.toFixed(2)}</p>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow">
              <p class="text-gray-500">Records Shown</p>
              <p class="text-4xl font-bold">${filtered.length}</p>
            </div>
          `;
        }

        function clearFilter() {
          document.getElementById('fromDate').value = '';
          document.getElementById('toDate').value = '';
          renderTable(allRecords);

          const total = allRecords.reduce((sum, r) => sum + r.amount, 0);
          document.getElementById('summary-cards').innerHTML = `
            <div class="bg-white p-6 rounded-2xl shadow">
              <p class="text-gray-500">Total Amount</p>
              <p class="text-4xl font-bold text-green-600">$${total.toFixed(2)}</p>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow">
              <p class="text-gray-500">Total Records</p>
              <p class="text-4xl font-bold">${allRecords.length}</p>
            </div>
          `;
        }

        // Initial load
        window.onload = () => {
          renderTable(allRecords);
          const total = allRecords.reduce((sum, r) => sum + r.amount, 0);
          document.getElementById('summary-cards').innerHTML = `
            <div class="bg-white p-6 rounded-2xl shadow">
              <p class="text-gray-500">Total Amount</p>
              <p class="text-4xl font-bold text-green-600">$${total.toFixed(2)}</p>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow">
              <p class="text-gray-500">Total Records</p>
              <p class="text-4xl font-bold">${allRecords.length}</p>
            </div>
          `;
        };
      </script>
    </body>
    </html>`;

  res.send(html);
});

// CSV Downloads
app.get("/records.csv", (req, res) => {
  if (fs.existsSync(RECORDS_FILE)) res.download(RECORDS_FILE, "records.csv");
  else res.send("No records yet.");
});

app.get("/daily.csv", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  let csv = "Date,Time,Day,Employee,Amount,Game,Points\n";
  if (fs.existsSync(RECORDS_FILE)) {
    const lines = fs.readFileSync(RECORDS_FILE, "utf8").split("\n");
    lines.slice(1).forEach(line => {
      if (line.startsWith(today)) csv += line + "\n";
    });
  }
  res.setHeader("Content-Disposition", `attachment; filename="daily_${today}.csv"`);
  res.send(csv);
});

app.get("/monthly.csv", (req, res) => {
  const thisMonth = new Date().toISOString().slice(0, 7);
  let csv = "Date,Time,Day,Employee,Amount,Game,Points\n";
  if (fs.existsSync(RECORDS_FILE)) {
    const lines = fs.readFileSync(RECORDS_FILE, "utf8").split("\n");
    lines.slice(1).forEach(line => {
      if (line.startsWith(thisMonth)) csv += line + "\n";
    });
  }
  res.setHeader("Content-Disposition", `attachment; filename="monthly_${thisMonth}.csv"`);
  res.send(csv);
});

// Telegram Webhook
const webhookPath = `/bot${BOT_TOKEN}`;
app.post(webhookPath, (req, res) => {
  const bot = (global as any).telegramBot;
  if (bot) bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Start Bot
const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : `http://localhost:${PORT}`;

const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

server.listen(PORT, () => {
  console.log(`✅ Dashboard live at ${baseUrl}/dashboard`);
});
