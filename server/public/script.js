// script.js - Dashboard Logic

let allPayments = [];
let currentFilter = 'all';
let trendChart, pieChart;

// Fetch data from backend
async function loadData() {
  try {
    const res = await fetch('/api/data');
    const data = await res.json();
    allPayments = data.payments || [];
    renderDashboard();
  } catch (e) {
    console.error("Failed to load data", e);
    document.getElementById('recent-table').innerHTML = 
      `<p class="p-8 text-center text-red-500">Failed to load data. Please try again later.</p>`;
  }
}

// Render everything
function renderDashboard() {
  const filtered = filterPayments(allPayments, currentFilter);
  
  // Update Summary Cards
  const totalAmount = filtered.reduce((sum, p) => sum + p.amount, 0);
  const totalPoints = filtered.reduce((sum, p) => sum + p.points, 0);
  const transactionCount = filtered.length;
  const avgAmount = transactionCount ? (totalAmount / transactionCount).toFixed(2) : 0;

  document.getElementById('total-amount').textContent = '$' + totalAmount.toFixed(2);
  document.getElementById('total-points').textContent = totalPoints;
  document.getElementById('transaction-count').textContent = transactionCount;
  document.getElementById('avg-amount').textContent = '$' + avgAmount;

  // Update Last Updated
  document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();

  // Render Recent Table
  renderTable(filtered);

  // Render Charts
  renderCharts(filtered);
}

// Filter payments
function filterPayments(payments, filter) {
  const now = new Date();
  return payments.filter(p => {
    const paymentDate = new Date(p.date);
    if (filter === 'daily') {
      return paymentDate.toDateString() === now.toDateString();
    }
    if (filter === 'weekly') {
      const diffTime = Math.abs(now - paymentDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    }
    if (filter === 'monthly') {
      return paymentDate.getMonth() === now.getMonth() && 
             paymentDate.getFullYear() === now.getFullYear();
    }
    return true; // all
  });
}

// Render table
function renderTable(payments) {
  let html = `
    <table class="min-w-full">
      <thead>
        <tr>
          <th>Date</th>
          <th>Time</th>
          <th>Employee</th>
          <th>Amount</th>
          <th>Game</th>
          <th>Points</th>
        </tr>
      </thead>
      <tbody>
  `;

  payments.slice(0, 50).forEach(p => {
    html += `
      <tr>
        <td>${p.date}</td>
        <td>${p.time}</td>
        <td>${p.employee}</td>
        <td class="font-medium">$${p.amount}</td>
        <td>${p.game}</td>
        <td class="font-medium">${p.points}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  document.getElementById('recent-table').innerHTML = html;
}

// Render Charts
function renderCharts(payments) {
  // Destroy old charts
  if (trendChart) trendChart.destroy();
  if (pieChart) pieChart.destroy();

  // Trend Chart (Points over time)
  const dates = payments.map(p => p.date).reverse();
  const points = payments.map(p => p.points).reverse();

  trendChart = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'Points Loaded',
        data: points,
        borderColor: '#3b82f6',
        tension: 0.4
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // Pie Chart - Game Distribution
  const gameTotals = {};
  payments.forEach(p => {
    gameTotals[p.game] = (gameTotals[p.game] || 0) + p.points;
  });

  pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'pie',
    data: {
      labels: Object.keys(gameTotals),
      datasets: [{
        data: Object.values(gameTotals),
        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
      }]
    }
  });
}

// Filter buttons
function filterData(type) {
  currentFilter = type;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  event.currentTarget.classList.add('active');
  renderDashboard();
}

// Download CSV
function downloadCSV(type) {
  let filename = '';
  let csvContent = '';

  if (type === 'records') {
    filename = 'all_payments.csv';
    csvContent = 'Date,Time,Day,Employee,Amount,Game,Points\n';
    allPayments.forEach(p => {
      csvContent += `${p.date},${p.time},${p.day},"${p.employee}",${p.amount},"${p.game}",${p.points}\n`;
    });
  } else if (type === 'daily') {
    filename = 'daily_summary.csv';
    csvContent = 'Date,Day,TotalAmount,FK_Points,JW_Points,GV_Points,Orion_Points,MW_Points,FunStation_Points,VS_Points,PM_Points,CM_Points,UP_Points,Monstor_Points,Other_Points,Grand_Total,TransactionCount\n';
    // You can enhance this later with real aggregated data from backend
    csvContent += 'Sample data - connect backend for real values';
  } else if (type === 'monthly') {
    filename = 'monthly_summary.csv';
    csvContent = 'Month,TotalAmount,FK_Points,... (same as daily)';
  }

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

// Load data when page loads
window.onload = loadData;
