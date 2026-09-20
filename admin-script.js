const API = window.BACKEND_URL;
let token = sessionStorage.getItem('adminToken') || null;

function centavosToPeso(c) {
  return '₱' + (c / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  try {
    const res = await fetch(`${API}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed.');
    token = data.token;
    sessionStorage.setItem('adminToken', token);
    showDashboard();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('adminToken');
  token = null;
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('login-wrap').style.display = 'flex';
});

async function authedFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (res.status === 401) {
    sessionStorage.removeItem('adminToken');
    token = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('login-wrap').style.display = 'flex';
    throw new Error('Session expired.');
  }
  return res;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
document.querySelectorAll('.tab').forEach((tabBtn) => {
  tabBtn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tabBtn.classList.add('active');
    document.getElementById(`tab-${tabBtn.dataset.tab}`).classList.add('active');
  });
});

// ---------------------------------------------------------------------------
// Sales tab
// ---------------------------------------------------------------------------
async function loadSales() {
  const res = await authedFetch('/api/admin/transactions');
  const data = await res.json();

  document.getElementById('total-collected').textContent = centavosToPeso(data.totalPaidCentavos);

  const body = document.getElementById('sales-body');
  body.innerHTML = data.transactions
    .map((t) => {
      const date = new Date(t.createdAt).toLocaleString('en-PH', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const statusClass = t.status === 'paid' ? 'status-paid' : 'status-pending';
      return `
        <tr>
          <td>${date}</td>
          <td>${t.label || t.planId}</td>
          <td>${centavosToPeso(t.amountCentavos)}</td>
          <td><span class="status-pill ${statusClass}">${t.status}</span></td>
          <td>${t.clientMac || '—'}</td>
        </tr>
      `;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Rates tab
// ---------------------------------------------------------------------------
async function loadRates() {
  const res = await authedFetch('/api/admin/rates');
  const rates = await res.json();

  const body = document.getElementById('rates-body');
  body.innerHTML = rates
    .map(
      (r) => `
      <tr data-plan-id="${r.planId}">
        <td><input type="text" class="f-label" value="${r.label}" /></td>
        <td><input type="number" class="f-price" value="${(r.amountCentavos / 100).toFixed(2)}" step="0.01" /></td>
        <td><input type="number" class="f-hours" value="${(r.durationMs / 3600000).toFixed(2)}" step="0.25" /></td>
        <td><input type="number" class="f-order" value="${r.sortOrder}" style="width:60px" /></td>
        <td>
          <button type="button" class="btn btn-ghost save-rate-btn" style="padding:6px 10px;font-size:0.8rem;">Save</button>
          <button type="button" class="btn btn-ghost delete-rate-btn" style="padding:6px 10px;font-size:0.8rem;color:#C0392B;">Delete</button>
        </td>
      </tr>
    `
    )
    .join('');

  body.querySelectorAll('.save-rate-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const planId = row.dataset.planId;
      const label = row.querySelector('.f-label').value;
      const amountCentavos = Math.round(parseFloat(row.querySelector('.f-price').value) * 100);
      const durationMs = Math.round(parseFloat(row.querySelector('.f-hours').value) * 3600000);
      const sortOrder = parseInt(row.querySelector('.f-order').value, 10) || 0;

      await authedFetch('/api/admin/rates', {
        method: 'POST',
        body: JSON.stringify({ planId, label, amountCentavos, durationMs, sortOrder }),
      });
      loadRates();
    });
  });

  body.querySelectorAll('.delete-rate-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('tr');
      const planId = row.dataset.planId;
      if (!confirm(`Delete plan "${planId}"?`)) return;
      await authedFetch(`/api/admin/rates/${planId}`, { method: 'DELETE' });
      loadRates();
    });
  });
}

document.getElementById('add-rate-btn').addEventListener('click', () => {
  const body = document.getElementById('rates-body');
  const newId = 'plan_' + Date.now();
  const row = document.createElement('tr');
  row.dataset.planId = newId;
  row.innerHTML = `
    <td><input type="text" class="f-label" value="New Plan" /></td>
    <td><input type="number" class="f-price" value="10" step="0.01" /></td>
    <td><input type="number" class="f-hours" value="1" step="0.25" /></td>
    <td><input type="number" class="f-order" value="99" style="width:60px" /></td>
    <td><button type="button" class="btn btn-ghost save-rate-btn" style="padding:6px 10px;font-size:0.8rem;">Save</button></td>
  `;
  body.appendChild(row);
  row.querySelector('.save-rate-btn').addEventListener('click', async () => {
    const label = row.querySelector('.f-label').value;
    const amountCentavos = Math.round(parseFloat(row.querySelector('.f-price').value) * 100);
    const durationMs = Math.round(parseFloat(row.querySelector('.f-hours').value) * 3600000);
    const sortOrder = parseInt(row.querySelector('.f-order').value, 10) || 0;
    await authedFetch('/api/admin/rates', {
      method: 'POST',
      body: JSON.stringify({ planId: newId, label, amountCentavos, durationMs, sortOrder }),
    });
    loadRates();
  });
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function showDashboard() {
  document.getElementById('login-wrap').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  loadSales();
  loadRates();
  loadVoucherPlanOptions();
  loadVouchers();
}

if (token) {
  showDashboard();
}

// ---------------------------------------------------------------------------
// Vouchers tab
// ---------------------------------------------------------------------------
async function loadVoucherPlanOptions() {
  const res = await authedFetch('/api/admin/rates');
  const rates = await res.json();
  const select = document.getElementById('voucher-plan-select');
  select.innerHTML = rates.map((r) => `<option value="${r.planId}">${r.label}</option>`).join('');
}

async function loadVouchers() {
  const res = await authedFetch('/api/admin/vouchers');
  const vouchers = await res.json();

  const body = document.getElementById('vouchers-body');
  body.innerHTML = vouchers
    .map((v) => {
      const created = new Date(v.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
      const statusClass = v.used ? 'status-used' : 'status-pending';
      const statusLabel = v.used ? 'Used' : 'Unused';
      const usedInfo = v.used ? `${new Date(v.usedAt).toLocaleDateString('en-PH')} · ${v.usedByMac || ''}` : '—';
      return `
        <tr>
          <td style="font-family: 'Courier New', monospace;">${v.code}</td>
          <td>${v.label || v.planId}</td>
          <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
          <td>${created}</td>
          <td>${usedInfo}</td>
          <td><button type="button" class="btn btn-ghost delete-voucher-btn" data-code="${v.code}" style="padding:4px 10px;font-size:0.78rem;color:#C0392B;">Delete</button></td>
        </tr>
      `;
    })
    .join('');

  body.querySelectorAll('.delete-voucher-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete voucher ${btn.dataset.code}?`)) return;
      await authedFetch(`/api/admin/vouchers/${btn.dataset.code}`, { method: 'DELETE' });
      loadVouchers();
    });
  });
}

document.getElementById('generate-vouchers-btn').addEventListener('click', async () => {
  const planId = document.getElementById('voucher-plan-select').value;
  const count = document.getElementById('voucher-count').value;

  const res = await authedFetch('/api/admin/vouchers/generate', {
    method: 'POST',
    body: JSON.stringify({ planId, count }),
  });
  const data = await res.json();

  if (data.codes) {
    document.getElementById('generated-result').style.display = 'block';
    document.getElementById('generated-codes').value = data.codes.join('\n');
  }
  loadVouchers();
});
