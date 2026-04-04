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

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "server/public")));

// Helper: Parse CSV records
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

// Root → Dashboard
app.get("/", (req, res) => res.redirect("/dashboard"));

// API: Get all transactions
app.get("/api/transactions", (req, res) => {
  const allRecords = getRecords();
  res.json({ transactions: allRecords });
});

// API: Get summary data
app.get("/api/summary", (req, res) => {
  const allRecords = getRecords();
  const today = new Date().toISOString().split("T")[0];
  const todayRecords = allRecords.filter(r => r.date === today);
  
  const totalAmount = allRecords.reduce((sum, r) => sum + r.amount, 0);
  const totalPoints = allRecords.reduce((sum, r) => sum + r.points, 0);
  const todayAmount = todayRecords.reduce((sum, r) => sum + r.amount, 0);
  const todayPoints = todayRecords.reduce((sum, r) => sum + r.points, 0);

  // Group breakdown
  const groupBreakdown: any = {};
  allRecords.forEach(r => {
    if (!groupBreakdown[r.group]) groupBreakdown[r.group] = { amount: 0, points: 0, count: 0 };
    groupBreakdown[r.group].amount += r.amount;
    groupBreakdown[r.group].points += r.points;
    groupBreakdown[r.group].count++;
  });

  // Platform (game) breakdown
  const platformBreakdown: any = {};
  allRecords.forEach(r => {
    if (!platformBreakdown[r.game]) platformBreakdown[r.game] = { amount: 0, points: 0, count: 0 };
    platformBreakdown[r.game].amount += r.amount;
    platformBreakdown[r.game].points += r.points;
    platformBreakdown[r.game].count++;
  });

  res.json({
    totalAmount,
    totalPoints,
    todayAmount,
    todayPoints,
    transactionCount: allRecords.length,
    todayTransactions: todayRecords.length,
    groupBreakdown,
    platformBreakdown,
  });
});

// Dashboard
app.get("/dashboard", (req, res) => {
  const allRecords = getRecords();

  // Sort by newest first (date + time)
  allRecords.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.time.localeCompare(a.time);
  });

  // Today Summary
  const today = new Date().toISOString().split("T")[0];
  const todayRecords = allRecords.filter(r => r.date === today);
  const todayAmount = todayRecords.reduce((sum, r) => sum + r.amount, 0);
  const todayPoints = todayRecords.reduce((sum, r) => sum + r.points, 0);
  const todayTransactions = todayRecords.length;

  // Monthly Summary
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyRecords = allRecords.filter(r => r.date.slice(0, 7) === currentMonth);
  const monthlyAmount = monthlyRecords.reduce((sum, r) => sum + r.amount, 0);
  const monthlyPoints = monthlyRecords.reduce((sum, r) => sum + r.points, 0);
  const monthlyTransactions = monthlyRecords.length;

  // Previous Month Summary
  const prevMonthDate = new Date();
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevMonth = prevMonthDate.toISOString().slice(0, 7);
  const prevMonthRecords = allRecords.filter(r => r.date.slice(0, 7) === prevMonth);
  const prevMonthAmount = prevMonthRecords.reduce((sum, r) => sum + r.amount, 0);
  const prevMonthPoints = prevMonthRecords.reduce((sum, r) => sum + r.points, 0);
  const prevMonthTransactions = prevMonthRecords.length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Tracker</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-50 p-6">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-4xl font-bold text-gray-800 mb-8">💰 Payment Tracker</h1>

    <!-- Main Grid: Sidebar + Content -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- Sidebar: Filters -->
      <div class="lg:col-span-1">
        <div class="bg-white p-6 rounded-3xl shadow sticky top-6">
          <h2 class="text-xl font-semibold mb-6">⚙️ Filters</h2>
          
          <!-- Date Range -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <input type="date" id="filterStartDate" class="w-full px-3 py-2 border rounded-lg mb-2">
            <input type="date" id="filterEndDate" class="w-full px-3 py-2 border rounded-lg">
          </div>

          <!-- Apply Filters Button -->
          <button id="applyFilters" class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium mb-3">
            Apply Filters
          </button>
          <button id="resetFilters" class="w-full bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400 font-medium">
            Reset
          </button>
        </div>
      </div>

      <!-- Main Content -->
      <div class="lg:col-span-3 space-y-6">
        <!-- Quick Summary: Daily & Monthly -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Daily Summary Card -->
          <div class="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-3xl shadow text-white">
            <h3 class="text-lg font-semibold mb-4">📅 Daily Summary</h3>
            <div class="space-y-3">
              <div>
                <p class="text-blue-100 text-sm">Total Amount</p>
                <p class="text-3xl font-bold">$${todayAmount.toFixed(2)}</p>
              </div>
              <div>
                <p class="text-blue-100 text-sm">Total Points</p>
                <p class="text-2xl font-bold">${todayPoints}</p>
              </div>
              <div>
                <p class="text-blue-100 text-sm">Transactions</p>
                <p class="text-2xl font-bold">${todayTransactions}</p>
              </div>
            </div>
          </div>

          <!-- Monthly Summary Card -->
          <div class="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-3xl shadow text-white">
            <h3 class="text-lg font-semibold mb-4">📊 Monthly Summary</h3>
            <div class="space-y-3">
              <div>
                <p class="text-green-100 text-sm">Total Amount</p>
                <p class="text-3xl font-bold">$${monthlyAmount.toFixed(2)}</p>
              </div>
              <div>
                <p class="text-green-100 text-sm">Total Points</p>
                <p class="text-2xl font-bold">${monthlyPoints}</p>
              </div>
              <div>
                <p class="text-green-100 text-sm">Transactions</p>
                <p class="text-2xl font-bold">${monthlyTransactions}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Daily Points Breakdown by Platform -->
        <div class="bg-white p-6 rounded-3xl shadow">
          <h3 class="text-xl font-semibold mb-6">📍 Today's Points Breakdown by Platform</h3>
          <div id="dailyPointsBreakdown" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div class="text-center text-gray-500">Loading...</div>
          </div>
        </div>

        <!-- Current Month vs Previous Month Comparison -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Current Month -->
          <div class="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-3xl shadow text-white">
            <h3 class="text-lg font-semibold mb-4">📈 Current Month (${currentMonth})</h3>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-purple-100">Total Amount</span>
                <span class="text-2xl font-bold">$${monthlyAmount.toFixed(2)}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-purple-100">Total Points</span>
                <span class="text-2xl font-bold">${monthlyPoints}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-purple-100">Transactions</span>
                <span class="text-2xl font-bold">${monthlyTransactions}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-purple-100">Avg per Transaction</span>
                <span class="text-2xl font-bold">$${(monthlyTransactions ? (monthlyAmount / monthlyTransactions).toFixed(2) : '0.00')}</span>
              </div>
            </div>
          </div>

          <!-- Previous Month -->
          <div class="bg-gradient-to-br from-orange-500 to-orange-600 p-6 rounded-3xl shadow text-white">
            <h3 class="text-lg font-semibold mb-4">📉 Previous Month (${prevMonth})</h3>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-orange-100">Total Amount</span>
                <span class="text-2xl font-bold">$${prevMonthAmount.toFixed(2)}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-orange-100">Total Points</span>
                <span class="text-2xl font-bold">${prevMonthPoints}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-orange-100">Transactions</span>
                <span class="text-2xl font-bold">${prevMonthTransactions}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-orange-100">Avg per Transaction</span>
                <span class="text-2xl font-bold">$${(prevMonthTransactions ? (prevMonthAmount / prevMonthTransactions).toFixed(2) : '0.00')}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Today Details -->
        <div class="bg-white p-8 rounded-3xl shadow">
          <h2 class="text-2xl font-semibold mb-6">📈 Today Details (${today})</h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p class="text-gray-500">Total Amount</p>
              <p class="text-4xl font-bold text-green-600" id="todayAmount">$${todayAmount.toFixed(2)}</p>
            </div>
            <div>
              <p class="text-gray-500">Total Points</p>
              <p class="text-4xl font-bold text-blue-600" id="todayPoints">${todayPoints}</p>
            </div>
            <div>
              <p class="text-gray-500">Transactions</p>
              <p class="text-4xl font-bold" id="todayTransactions">${todayTransactions}</p>
            </div>
            <div>
              <p class="text-gray-500">Avg Amount</p>
              <p class="text-4xl font-bold" id="todayAvg">$${(todayTransactions ? (todayAmount / todayTransactions).toFixed(2) : '0.00')}</p>
            </div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Daily Trend Chart -->
          <div class="bg-white p-6 rounded-3xl shadow">
            <h3 class="text-xl font-semibold mb-4">📈 Daily Trend (Money)</h3>
            <canvas id="trendChart" height="80"></canvas>
          </div>

          <!-- Platform Distribution Chart -->
          <div class="bg-white p-6 rounded-3xl shadow">
            <h3 class="text-xl font-semibold mb-4">📊 Platform Distribution</h3>
            <canvas id="platformChart" height="80"></canvas>
          </div>
        </div>

        <!-- Transactions Table -->
        <div class="bg-white rounded-3xl shadow overflow-hidden">
          <div class="px-8 py-5 border-b font-semibold flex justify-between items-center">
            <span>Recent Transactions (Newest First)</span>
            <div class="flex gap-4 text-sm">
              <a href="/records.csv" class="text-blue-600 hover:underline">All CSV</a>
              <a href="/daily.csv" class="text-blue-600 hover:underline">Today CSV</a>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-8 py-4 text-left">Date</th>
                  <th class="px-8 py-4 text-left">Time</th>
                  <th class="px-8 py-4 text-left">Group</th>
                  <th class="px-8 py-4 text-left">Employee</th>
                  <th class="px-8 py-4 text-left">Amount</th>
                  <th class="px-8 py-4 text-left">Platform</th>
                  <th class="px-8 py-4 text-left">Points</th>
                </tr>
              </thead>
              <tbody id="transactionsTable">
                <tr><td colspan="7" class="px-8 py-16 text-center text-gray-500">Loading...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let allTransactions = [];
    let filteredTransactions = [];
    let trendChart, platformChart;

    // Fetch transactions
    async function loadTransactions() {
      try {
        const res = await fetch('/api/transactions');
        const data = await res.json();
        allTransactions = data.transactions || [];
        applyFilters();
        renderCharts();
        renderDailyPointsBreakdown();
      } catch (e) {
        console.error("Failed to load transactions", e);
      }
    }

    // Apply filters
    function applyFilters() {
      const startDate = document.getElementById('filterStartDate').value;
      const endDate = document.getElementById('filterEndDate').value;

      filteredTransactions = allTransactions.filter(t => {
        if (startDate && t.date < startDate) return false;
        if (endDate && t.date > endDate) return false;
        return true;
      });

      // Sort by newest first
      filteredTransactions.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.time.localeCompare(a.time);
      });

      renderTable();
      renderCharts();
      renderDailyPointsBreakdown();
    }

    // Render daily points breakdown by platform
    function renderDailyPointsBreakdown() {
      const today = new Date().toISOString().split("T")[0];
      const todayRecords = allTransactions.filter(r => r.date === today);

      // Group by platform
      const platformBreakdown = {};
      todayRecords.forEach(t => {
        if (!platformBreakdown[t.game]) {
          platformBreakdown[t.game] = { points: 0, amount: 0, count: 0 };
        }
        platformBreakdown[t.game].points += t.points;
        platformBreakdown[t.game].amount += t.amount;
        platformBreakdown[t.game].count++;
      });

      const container = document.getElementById('dailyPointsBreakdown');
      
      if (Object.keys(platformBreakdown).length === 0) {
        container.innerHTML = '<div class="col-span-full text-center text-gray-500">No transactions today</div>';
        return;
      }

      const colors = ['bg-blue-100 text-blue-800', 'bg-green-100 text-green-800', 'bg-purple-100 text-purple-800', 
                      'bg-pink-100 text-pink-800', 'bg-yellow-100 text-yellow-800', 'bg-red-100 text-red-800',
                      'bg-indigo-100 text-indigo-800', 'bg-cyan-100 text-cyan-800'];

      let colorIndex = 0;
      container.innerHTML = Object.keys(platformBreakdown).map(platform => {
        const data = platformBreakdown[platform];
        const colorClass = colors[colorIndex % colors.length];
        colorIndex++;
        return \`
          <div class="p-4 rounded-2xl \${colorClass} border-2 border-current">
            <p class="font-semibold text-lg">\${platform}</p>
            <p class="text-sm opacity-80">Points: <span class="font-bold">\${data.points}</span></p>
            <p class="text-sm opacity-80">Amount: <span class="font-bold">$\${data.amount.toFixed(2)}</span></p>
            <p class="text-sm opacity-80">Transactions: <span class="font-bold">\${data.count}</span></p>
          </div>
        \`;
      }).join('');
    }

    // Render transactions table
    function renderTable() {
      const tbody = document.getElementById('transactionsTable');
      if (filteredTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-8 py-16 text-center text-gray-500">No transactions found</td></tr>';
        return;
      }

      tbody.innerHTML = filteredTransactions.slice(0, 100).map(t => \`
        <tr class="border-t hover:bg-gray-50">
          <td class="px-8 py-4">\${t.date}</td>
          <td class="px-8 py-4">\${t.time}</td>
          <td class="px-8 py-4 font-medium">\${t.group}</td>
          <td class="px-8 py-4">\${t.employee}</td>
          <td class="px-8 py-4 font-medium">$\${t.amount.toFixed(2)}</td>
          <td class="px-8 py-4">\${t.game}</td>
          <td class="px-8 py-4">\${t.points}</td>
        </tr>
      \`).join('');
    }

    // Render charts
    function renderCharts() {
      renderTrendChart();
      renderPlatformChart();
    }

    // Daily trend chart (money over time)
    function renderTrendChart() {
      if (trendChart) trendChart.destroy();

      // Group by date and sum amounts
      const dailyData = {};
      filteredTransactions.forEach(t => {
        if (!dailyData[t.date]) dailyData[t.date] = 0;
        dailyData[t.date] += t.amount;
      });

      const dates = Object.keys(dailyData).sort();
      const amounts = dates.map(d => dailyData[d]);

      trendChart = new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{
            label: 'Daily Amount ($)',
            data: amounts,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointBackgroundColor: '#10b981'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: true } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }

    // Platform distribution chart (pie)
    function renderPlatformChart() {
      if (platformChart) platformChart.destroy();

      // Group by platform and sum amounts
      const platformData = {};
      filteredTransactions.forEach(t => {
        if (!platformData[t.game]) platformData[t.game] = 0;
        platformData[t.game] += t.amount;
      });

      const platforms = Object.keys(platformData);
      const amounts = platforms.map(p => platformData[p]);

      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

      platformChart = new Chart(document.getElementById('platformChart'), {
        type: 'doughnut',
        data: {
          labels: platforms,
          datasets: [{
            data: amounts,
            backgroundColor: colors.slice(0, platforms.length)
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }

    // Event listeners
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('resetFilters').addEventListener('click', () => {
      document.getElementById('filterStartDate').value = '';
      document.getElementById('filterEndDate').value = '';
      applyFilters();
    });

    // Real-time updates: Check for new data every 5 seconds
    setInterval(async () => {
      try {
        const res = await fetch('/api/transactions');
        const data = await res.json();
        const newTransactions = data.transactions || [];
        
        if (newTransactions.length > allTransactions.length) {
          allTransactions = newTransactions;
          applyFilters();
          renderDailyPointsBreakdown();
        }
      } catch (e) {
        console.error("Failed to check for updates", e);
      }
    }, 5000);

    // Load on page load
    loadTransactions();
  </script>
</body>
</html>`;

  res.send(html);
});

// CSV Routes - Newest first
app.get("/records.csv", (req, res) => {
  if (fs.existsSync(RECORDS_FILE)) res.download(RECORDS_FILE, "payment_records.csv");
  else res.send("No records yet.");
});

app.get("/daily.csv", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  let csv = "Date,Time,Day,Group,Employee,Amount,Game,Points\n";
  if (fs.existsSync(RECORDS_FILE)) {
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").split("\n");
    lines.slice(1).forEach(line => { if (line.startsWith(today)) csv += line + "\n"; });
  }
  res.setHeader("Content-Disposition", `attachment; filename=daily_${today}.csv`);
  res.send(csv);
});

app.get("/monthly.csv", (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  let csv = "Date,Time,Day,Group,Employee,Amount,Game,Points\n";
  if (fs.existsSync(RECORDS_FILE)) {
    const lines = fs.readFileSync(RECORDS_FILE, "utf-8").split("\n");
    lines.slice(1).forEach(line => { if (line.startsWith(month)) csv += line + "\n"; });
  }
  res.setHeader("Content-Disposition", `attachment; filename=monthly_${month}.csv`);
  res.send(csv);
});

// Telegram Webhook
const webhookPath = `/bot${BOT_TOKEN}`;
app.post(webhookPath, (req, res) => {
  const bot = (global as any).telegramBot;
  if (bot) bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Start
const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`;

const bot = initTelegramBot(BOT_TOKEN, baseUrl);
(global as any).telegramBot = bot;

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Dashboard → ${baseUrl}/dashboard`);
});
