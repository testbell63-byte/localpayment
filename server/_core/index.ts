import express from "express";
import { createServer } from "http";
import { initTelegramBot } from "../telegramBot.js";
import fs from "fs";
import path from "path";

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 8080;
const BOT_TOKEN = process.env.BOT_TOKEN || "8661823502:AAE6-JE7keWdI4eRHKHcMtu09f2eFA4N-dE";
const RECORDS_FILE = path.join(process.cwd(), "records.csv");
const CASHOUT_RECORDS_FILE = path.join(process.cwd(), "cashout_records.csv");

// Ensure files exist with headers
if (!fs.existsSync(RECORDS_FILE)) {
  fs.writeFileSync(RECORDS_FILE, "Date,Time,Day,Group,Employee,Amount,Game,Points,Notes\n");
}
if (!fs.existsSync(CASHOUT_RECORDS_FILE)) {
  fs.writeFileSync(CASHOUT_RECORDS_FILE, "id,created_at,updated_at,group,employee,amount,game,points,playback_id,tip\n");
}

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "server/public")));

// Helper: Parse CSV records (Income)
function getRecords() {
  let allRecords: any[] = [];
  if (fs.existsSync(RECORDS_FILE)) {
    const content = fs.readFileSync(RECORDS_FILE, "utf-8");
    const lines = content.trim().split("\n").slice(1);
    allRecords = lines.map((line) => {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return {
        date: parts[0] || "",
        time: parts[1] || "",
        day: parts[2] || "",
        group: (parts[3] || "").replace(/"/g, ""),
        employee: (parts[4] || "").replace(/"/g, ""),
        amount: parseFloat(parts[5]) || 0,
        game: (parts[6] || "").replace(/"/g, ""),
        points: parseFloat(parts[7]) || 0,
      };
    });
  }
  return allRecords;
}

// Helper: Parse CSV cashout records
function getCashoutRecords() {
  let allCashoutRecords: any[] = [];
  if (fs.existsSync(CASHOUT_RECORDS_FILE)) {
    const content = fs.readFileSync(CASHOUT_RECORDS_FILE, "utf-8");
    const lines = content.trim().split("\n").slice(1);
    allCashoutRecords = lines.map((line) => {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      return {
        id: (parts[0] || "").replace(/"/g, ""),
        created_at: (parts[1] || "").replace(/"/g, ""),
        updated_at: (parts[2] || "").replace(/"/g, ""),
        group: (parts[3] || "").replace(/"/g, ""),
        employee: (parts[4] || "").replace(/"/g, ""),
        amount: parseFloat(parts[5]) || 0,
        game: (parts[6] || "").replace(/"/g, ""),
        points: parseFloat(parts[7]) || 0,
        playback_id: (parts[8] || "").replace(/"/g, ""),
        tip: parseFloat(parts[9]) || 0,
      };
    });
  }
  return allCashoutRecords;
}

// Root → Dashboard
app.get("/", (req, res) => res.redirect("/dashboard"));

// API: Get all income transactions
app.get("/api/transactions", (req, res) => {
  const allRecords = getRecords();
  res.json({ transactions: allRecords });
});

// API: Get all cashout transactions
app.get("/api/cashout-transactions", (req, res) => {
  const allCashoutRecords = getCashoutRecords();
  res.json({ cashoutTransactions: allCashoutRecords });
});

// Dashboard
app.get("/dashboard", (req, res) => {
  const allRecords = getRecords();
  const today = new Date().toISOString().split("T")[0];
  const todayRecords = allRecords.filter(r => r.date === today);
  const todayAmount = todayRecords.reduce((sum, r) => sum + r.amount, 0);
  const todayPoints = todayRecords.reduce((sum, r) => sum + r.points, 0);
  const todayTransactions = todayRecords.length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Tracker</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    .custom-scroll::-webkit-scrollbar { width: 6px; }
    .custom-scroll::-webkit-scrollbar-track { background: #f1f1f1; }
    .custom-scroll::-webkit-scrollbar-thumb { background: #888; border-radius: 10px; }
    .custom-scroll::-webkit-scrollbar-thumb:hover { background: #555; }
  </style>
</head>
<body class="bg-gray-50 p-6">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-4xl font-bold text-gray-800 mb-8">💰 Payment Tracker</h1>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- Sidebar -->
      <div class="lg:col-span-1">
        <div class="bg-white p-6 rounded-3xl shadow sticky top-6">
          <h2 class="text-xl font-semibold mb-6">⚙️ Filters</h2>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <input type="date" id="filterStartDate" class="w-full px-3 py-2 border rounded-lg mb-2">
            <input type="date" id="filterEndDate" class="w-full px-3 py-2 border rounded-lg">
          </div>
          <button id="applyFilters" class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium mb-3">Apply Filters</button>
          <button id="resetFilters" class="w-full bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400 font-medium">Reset</button>
        </div>
      </div>

      <!-- Content -->
      <div class="lg:col-span-3 space-y-6">
        <!-- History Explorer -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white p-6 rounded-3xl shadow">
            <h3 class="text-2xl font-semibold mb-4">📅 Daily Deposits</h3>
            <div class="space-y-3 max-h-96 overflow-y-auto custom-scroll border-2 border-gray-200 rounded-2xl p-4" id="dailyHistory">Loading...</div>
          </div>
          <div class="bg-white p-6 rounded-3xl shadow">
            <h3 class="text-2xl font-semibold mb-4">📊 Monthly Deposits</h3>
            <div class="space-y-3 max-h-96 overflow-y-auto custom-scroll border-2 border-gray-200 rounded-2xl p-4" id="monthlyHistory">Loading...</div>
          </div>
        </div>

        <!-- Today Summary -->
        <div class="bg-gradient-to-r from-blue-500 to-blue-600 p-8 rounded-3xl shadow text-white">
          <h2 class="text-2xl font-semibold mb-6">📈 Today's Summary (<span id="todayDisplay">${today}</span>)</h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div><p class="text-blue-100 text-sm">Total Deposit</p><p class="text-4xl font-bold" id="todayAmount">$${todayAmount.toFixed(2)}</p></div>
            <div><p class="text-blue-100 text-sm">Total Points</p><p class="text-4xl font-bold" id="todayPoints">${todayPoints}</p></div>
            <div><p class="text-blue-100 text-sm">Transactions</p><p class="text-4xl font-bold" id="todayTransactions">${todayTransactions}</p></div>
            <div><p class="text-blue-100 text-sm">Avg per Txn</p><p class="text-4xl font-bold" id="todayAvg">$${(todayTransactions ? (todayAmount / todayTransactions).toFixed(2) : "0.00")}</p></div>
          </div>
        </div>

        <!-- Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white p-6 rounded-3xl shadow"><h3 class="text-xl font-semibold mb-4">📈 Daily Trend</h3><canvas id="trendChart" height="150"></canvas></div>
          <div class="bg-white p-6 rounded-3xl shadow"><h3 class="text-xl font-semibold mb-4">📊 Platform Distribution</h3><canvas id="platformChart" height="150"></canvas></div>
        </div>

        <!-- Tables -->
        <div class="bg-white rounded-3xl shadow overflow-hidden">
          <div class="px-8 py-5 border-b font-semibold">Recent Transactions (Newest First)</div>
          <div class="overflow-x-auto"><table class="w-full"><thead class="bg-gray-50"><tr><th class="px-8 py-4 text-left">Date</th><th class="px-8 py-4 text-left">Amount</th><th class="px-8 py-4 text-left">Platform</th><th class="px-8 py-4 text-left">Points</th></tr></thead><tbody id="transactionsTable"></tbody></table></div>
        </div>

        <div class="bg-white rounded-3xl shadow overflow-hidden">
          <div class="px-8 py-5 border-b font-semibold">Recent Cashouts (Newest First)</div>
          <div class="overflow-x-auto"><table class="w-full"><thead class="bg-gray-50"><tr><th class="px-8 py-4 text-left">Date</th><th class="px-8 py-4 text-left">Amount</th><th class="px-8 py-4 text-left">Game</th><th class="px-8 py-4 text-left">Points</th><th class="px-8 py-4 text-left">Playback ID</th><th class="px-8 py-4 text-left">Tip</th></tr></thead><tbody id="cashoutTransactionsTable"></tbody></table></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let allTransactions = [];
    let allCashoutTransactions = [];
    let trendChart, platformChart;

    async function loadAllData() {
      try {
        const [tRes, cRes] = await Promise.all([
          fetch("/api/transactions"),
          fetch("/api/cashout-transactions")
        ]);
        allTransactions = (await tRes.json()).transactions || [];
        allCashoutTransactions = (await cRes.json()).cashoutTransactions || [];
        updateUI();
      } catch (e) { console.error("Error loading data:", e); }
    }

    function updateUI() {
      const today = new Date().toISOString().split("T")[0];
      const todayRecords = allTransactions.filter(r => r.date === today);
      const tAmount = todayRecords.reduce((s, r) => s + r.amount, 0);
      
      document.getElementById("todayAmount").textContent = "$" + tAmount.toFixed(2);
      document.getElementById("todayPoints").textContent = todayRecords.reduce((s, r) => s + r.points, 0);
      document.getElementById("todayTransactions").textContent = todayRecords.length;

      // Render Daily History
      const dailyTotals = {};
      allTransactions.forEach(t => { dailyTotals[t.date] = (dailyTotals[t.date] || 0) + t.amount; });
      const sortedDates = Object.keys(dailyTotals).sort().reverse();
      document.getElementById("dailyHistory").innerHTML = sortedDates.length ? sortedDates.map(d => \`
        <div class="p-4 rounded-lg bg-gray-50 border flex justify-between items-center">
          <span class="font-medium text-gray-700">\${d}</span>
          <span class="font-bold text-green-600">$\${dailyTotals[d].toFixed(2)}</span>
        </div>
      \`).join("") : '<div class="text-center text-gray-500">No data available</div>';

      // Render Monthly History
      const monthlyTotals = {};
      allTransactions.forEach(t => { 
        const m = t.date.slice(0, 7); 
        monthlyTotals[m] = (monthlyTotals[m] || 0) + t.amount; 
      });
      const sortedMonths = Object.keys(monthlyTotals).sort().reverse();
      document.getElementById("monthlyHistory").innerHTML = sortedMonths.length ? sortedMonths.map(m => \`
        <div class="p-4 rounded-lg bg-gray-50 border flex justify-between items-center">
          <span class="font-medium text-gray-700">\${m}</span>
          <span class="font-bold text-purple-600">$\${monthlyTotals[m].toFixed(2)}</span>
        </div>
      \`).join("") : '<div class="text-center text-gray-500">No data available</div>';

      // Income Table
      document.getElementById("transactionsTable").innerHTML = allTransactions.slice(0, 50).map(t => \`
        <tr class="border-t hover:bg-gray-50">
          <td class="px-8 py-4">\${t.date}</td>
          <td class="px-8 py-4 font-medium">$\${t.amount.toFixed(2)}</td>
          <td class="px-8 py-4">\${t.game}</td>
          <td class="px-8 py-4">\${t.points}</td>
        </tr>
      \`).join("");

      // Cashout Table
      document.getElementById("cashoutTransactionsTable").innerHTML = allCashoutTransactions.length ? allCashoutTransactions.slice(0, 50).map(t => \`
        <tr class="border-t hover:bg-gray-50">
          <td class="px-8 py-4">\${t.created_at.split("T")[0]}</td>
          <td class="px-8 py-4 font-medium text-red-600">$\${t.amount.toFixed(2)}</td>
          <td class="px-8 py-4">\${t.game}</td>
          <td class="px-8 py-4">\${t.points}</td>
          <td class="px-8 py-4 text-sm text-gray-500">\${t.playback_id}</td>
          <td class="px-8 py-4">$\${t.tip.toFixed(2)}</td>
        </tr>
      \`).join("") : '<tr><td colspan="6" class="px-8 py-16 text-center text-gray-500">No cashouts found</td></tr>';

      renderCharts();
    }

    function renderCharts() {
      if (trendChart) trendChart.destroy();
      const dailyData = {};
      allTransactions.forEach(t => { dailyData[t.date] = (dailyData[t.date] || 0) + t.amount; });
      const dates = Object.keys(dailyData).sort();
      const ctxTrend = document.getElementById("trendChart");
      if (ctxTrend) {
        trendChart = new Chart(ctxTrend, {
          type: "line",
          data: { 
            labels: dates, 
            datasets: [{ 
              label: "Amount ($)", 
              data: dates.map(d => dailyData[d]), 
              borderColor: "#10b981", 
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              fill: true,
              tension: 0.4
            }] 
          },
          options: { responsive: true, scales: { y: { beginAtZero: true } } }
        });
      }

      if (platformChart) platformChart.destroy();
      const pData = {};
      allTransactions.forEach(t => { pData[t.game] = (pData[t.game] || 0) + t.amount; });
      const ctxPlatform = document.getElementById("platformChart");
      if (ctxPlatform) {
        platformChart = new Chart(ctxPlatform, {
          type: "doughnut",
          data: { 
            labels: Object.keys(pData), 
            datasets: [{ 
              data: Object.values(pData), 
              backgroundColor: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"] 
            }] 
          },
          options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
      }
    }

    // Filters logic
    document.getElementById("applyFilters").addEventListener("click", () => {
      const start = document.getElementById("filterStartDate").value;
      const end = document.getElementById("filterEndDate").value;
      // Note: For simplicity, filtering allTransactions and re-updating UI
      const originalTransactions = [...allTransactions];
      if (start || end) {
        allTransactions = allTransactions.filter(t => {
          if (start && t.date < start) return false;
          if (end && t.date > end) return false;
          return true;
        });
        updateUI();
        allTransactions = originalTransactions; // Reset for next poll
      }
    });

    document.getElementById("resetFilters").addEventListener("click", () => {
      document.getElementById("filterStartDate").value = "";
      document.getElementById("filterEndDate").value = "";
      loadAllData();
    });

    setInterval(loadAllData, 5000);
    loadAllData();
  </script>
</body>
</html>`;
  res.send(html);
});

const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`;
const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
