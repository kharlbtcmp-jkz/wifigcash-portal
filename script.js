// ---------------------------------------------------------------------------
// Plans shown to the customer. Keep these labels/prices in sync with the
// PLANS object in the backend's server.js -- the backend is what actually
// enforces the price, this is just for display.
// ---------------------------------------------------------------------------
const DISPLAY_PLANS = [
  { id: 'plan_1h', name: '1 Hour', duration: 'Good for browsing & chats', price: '₱15' },
  { id: 'plan_3h', name: '3 Hours', duration: 'Good for streaming', price: '₱30' },
  { id: 'plan_day', name: 'All Day', duration: 'Unlimited use for 24 hours', price: '₱50' },
];

// ---------------------------------------------------------------------------
// Capture the parameters Omada's controller attaches to the redirect it
// sends the customer's device to. These identify exactly which device/AP/
// gateway to authorize once payment succeeds.
// ---------------------------------------------------------------------------
function getOmadaParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    clientMac: params.get('clientMac'),
    apMac: params.get('apMac'),
    gatewayMac: params.get('gatewayMac'),
    ssidName: params.get('ssidName'),
    radioId: params.get('radioId'),
    vid: params.get('vid'),
    site: params.get('site'),
    redirectUrl: params.get('redirectUrl'),
    token: params.get('token'), // present on some controller versions; forwarded as-is if so
  };
}

// Persist Omada params across the redirect to GCash and back, since the
// customer's browser leaves this page entirely during payment.
function saveOmadaParams(p) {
  sessionStorage.setItem('omadaParams', JSON.stringify(p));
}
function loadSavedOmadaParams() {
  const raw = sessionStorage.getItem('omadaParams');
  return raw ? JSON.parse(raw) : null;
}

// ---------------------------------------------------------------------------
// UI state helpers
// ---------------------------------------------------------------------------
function showState(state) {
  ['waiting', 'connecting', 'connected', 'error'].forEach((s) => {
    document.getElementById(`status-${s}`).style.display = s === state ? 'block' : 'none';
  });
}

function renderPlans() {
  const list = document.getElementById('plan-list');
  list.innerHTML = '';
  DISPLAY_PLANS.forEach((plan) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'plan-option';
    btn.innerHTML = `
      <span>
        <span class="plan-name">${plan.name}</span>
        <span class="plan-duration">${plan.duration}</span>
      </span>
      <span class="plan-price">${plan.price}</span>
    `;
    btn.addEventListener('click', () => startPayment(plan.id));
    list.appendChild(btn);
  });

  const ratesBody = document.getElementById('rates-table-body');
  ratesBody.innerHTML = DISPLAY_PLANS.map(
    (p) => `<tr><td>${p.name}</td><td>${p.price}</td></tr>`
  ).join('');
}

async function startPayment(planId) {
  const omadaParams = getOmadaParams();
  saveOmadaParams(omadaParams);

  showState('connecting');
  document.getElementById('status-connecting').querySelector('.status-text').textContent =
    'Redirecting to GCash…';

  try {
    const res = await fetch(`${window.BACKEND_URL}/api/create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, omadaParams }),
    });
    const data = await res.json();
    if (!data.checkoutUrl) throw new Error('No checkout URL returned.');
    window.location.href = data.checkoutUrl;
  } catch (err) {
    console.error(err);
    showState('error');
  }
}

async function pollPaymentStatus(referenceId) {
  showState('connecting');
  const savedParams = loadSavedOmadaParams();

  const poll = async () => {
    try {
      const res = await fetch(`${window.BACKEND_URL}/api/payment-status/${referenceId}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();

      if (data.status === 'paid') {
        showState('connected');
        const continueLink = document.getElementById('continue-link');
        continueLink.href = (savedParams && savedParams.redirectUrl) || 'https://www.google.com';
        return;
      }
      setTimeout(poll, 2500);
    } catch (err) {
      console.error(err);
      showState('error');
    }
  };
  poll();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function updateClock() {
  const now = new Date();
  const hours = now.getHours();
  const mins = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clock').textContent =
    ((hours % 12) || 12) + ':' + mins + (hours >= 12 ? ' PM' : ' AM');

  let greeting = 'Good evening.';
  if (hours < 12) greeting = 'Good morning.';
  else if (hours < 18) greeting = 'Good afternoon.';
  document.getElementById('greeting').textContent = greeting;
}
updateClock();
setInterval(updateClock, 30000);

renderPlans();

const referenceIdFromReturn = new URLSearchParams(window.location.search).get('referenceId');
if (referenceIdFromReturn) {
  pollPaymentStatus(referenceIdFromReturn);
} else {
  showState('waiting');
}

document.getElementById('retry-btn').addEventListener('click', () => showState('waiting'));

// Modal handling
const ratesModal = document.getElementById('rates-modal');
document.getElementById('open-rates').addEventListener('click', () => ratesModal.classList.add('open'));
document.querySelectorAll('[data-close]').forEach((el) => {
  el.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (modal) modal.classList.remove('open');
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') ratesModal.classList.remove('open');
});
