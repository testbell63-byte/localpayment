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
        <!-- HISTORY EXPLORER SECTION -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Daily History -->
          <div class="bg-white p-6 rounded-3xl shadow">
            <h3 class="text-2xl font-semibold mb-4">📅 Daily Deposits</h3>
            <div class="space-y-3 max-h-96 overflow-y-auto border-2 border-gray-200 rounded-2xl p-4" id="dailyHistory">
              <div class="text-center text-gray-500">Loading...</div>
            </div>
          </div>

          <!-- Monthly History -->
          <div class="bg-white p-6 rounded-3xl shadow">
            <h3 class="text-2xl font-semibold mb-4">📊 Monthly Deposits</h3>
            <div class="space-y-3 max-h-96 overflow-y-auto border-2 border-gray-200 rounded-2xl p-4" id="monthlyHistory">
              <div class="text-center text-gray-500">Loading...</div>
            </div>
          </div>
        </div>

        <!-- Today Summary Card -->
        <div class="bg-gradient-to-r from-blue-500 to-blue-600 p-8 rounded-3xl shadow text-white">
          <h2 class="text-2xl font-semibold mb-6">📈 Today's Summary (${today})</h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p class="text-blue-100 text-sm">Total Deposit</p>
              <p class="text-4xl font-bold" id="todayAmount">$${todayAmount.toFixed(2)}</p>
            </div>
            <div>
              <p class="text-blue-100 text-sm">Total Points</p>
              <p class="text-4xl font-bold" id="todayPoints">${todayPoints}</p>
            </div>
            <div>
              <p class="text-blue-100 text-sm">Transactions</p>
              <p class="text-4xl font-bold" id="todayTransactions">${todayTransactions}</p>
            </div>
            <div>
              <p class="text-blue-100 text-sm">Avg per Txn</p>
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
        renderHistoryExplorer();
      } catch (e) {
        console.error("Failed to load transactions", e);
      }
    }

    // Render Daily and Monthly History Explorer
    function renderHistoryExplorer() {
      // Get all unique dates and group by total deposit
      const dailyTotals = {};
      allTransactions.forEach(t => {
        if (!dailyTotals[t.date]) {
          dailyTotals[t.date] = { amount: 0, points: 0, count: 0 };
        }
        dailyTotals[t.date].amount += t.amount;
        dailyTotals[t.date].points += t.points;
        dailyTotals[t.date].count++;
      });

      // Sort dates descending (newest first)
      const sortedDates = Object.keys(dailyTotals).sort().reverse();

      // Render Daily History
      const dailyContainer = document.getElementById('dailyHistory');
      if (sortedDates.length === 0) {
        dailyContainer.innerHTML = '<div class="text-center text-gray-500">No data available</div>';
      } else {
        dailyContainer.innerHTML = sortedDates.map(date => {
          const data = dailyTotals[date];
          const isToday = date === new Date().toISOString().split("T")[0];
          const bgColor = isToday ? 'bg-blue-50 border-l-4 border-blue-500' : 'bg-gray-50';
          return \`
            <div class="p-4 rounded-lg \${bgColor} border">
              <div class="flex justify-between items-center">
                <div>
                  <p class="font-semibold text-lg">\${date}</p>
                  <p class="text-sm text-gray-600">\${data.count} transactions</p>
                </div>
                <div class="text-right">
                  <p class="text-2xl font-bold text-green-600">$\${data.amount.toFixed(2)}</p>
                  <p class="text-sm text-gray-600">\${data.points} pts</p>
                </div>
              </div>
            </div>
          \`;
        }).join('');
      }

      // Get all unique months and group by total deposit
      const monthlyTotals = {};
      allTransactions.forEach(t => {
        const month = t.date.slice(0, 7); // YYYY-MM
        if (!monthlyTotals[month]) {
          monthlyTotals[month] = { amount: 0, points: 0, count: 0 };
        }
        monthlyTotals[month].amount += t.amount;
        monthlyTotals[month].points += t.points;
        monthlyTotals[month].count++;
      });

      // Sort months descending (newest first)
      const sortedMonths = Object.keys(monthlyTotals).sort().reverse();

      // Render Monthly History
      const monthlyContainer = document.getElementById('monthlyHistory');
      if (sortedMonths.length === 0) {
        monthlyContainer.innerHTML = '<div class="text-center text-gray-500">No data available</div>';
      } else {
        monthlyContainer.innerHTML = sortedMonths.map(month => {
          const data = monthlyTotals[month];
          const currentMonth = new Date().toISOString().slice(0, 7);
          const isCurrentMonth = month === currentMonth;
          const bgColor = isCurrentMonth ? 'bg-purple-50 border-l-4 border-purple-500' : 'bg-gray-50';
          const monthName = new Date(month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' });
          return \`
            <div class="p-4 rounded-lg \${bgColor} border">
              <div class="flex justify-between items-center">
                <div>
                  <p class="font-semibold text-lg">\${monthName}</p>
                  <p class="text-sm text-gray-600">\${data.count} transactions</p>
                </div>
                <div class="text-right">
                  <p class="text-2xl font-bold text-purple-600">$\${data.amount.toFixed(2)}</p>
                  <p class="text-sm text-gray-600">\${data.points} pts</p>
                </div>
              </div>
            </div>
          \`;
        }).join('');
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
          renderHistoryExplorer();
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

// CSV Routes
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
