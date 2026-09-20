// ---------------------------------------------------------------------------
// Capture the parameters Omada's controller attaches to the redirect --
// identifies exactly which device/AP/gateway to authorize.
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
    token: params.get('token'),
  };
}

function saveOmadaParams(p) {
  sessionStorage.setItem('omadaParams', JSON.stringify(p));
}
function loadSavedOmadaParams() {
  const raw = sessionStorage.getItem('omadaParams');
  return raw ? JSON.parse(raw) : null;
}

// ---------------------------------------------------------------------------
// Greeting
// ---------------------------------------------------------------------------
function updateGreeting() {
  const now = new Date();
  const hours = now.getHours();
  const mins = String(now.getMinutes()).padStart(2, '0');
  const time = ((hours % 12) || 12) + ':' + mins + (hours >= 12 ? 'PM' : 'AM');
  const day = now.toLocaleDateString('en-US', { weekday: 'long' });

  let greeting = 'Good evening!';
  if (hours < 12) greeting = 'Good morning!';
  else if (hours < 18) greeting = 'Good afternoon!';

  document.getElementById('greeting').textContent =
    `${greeting}   Today is ${day} ${time}`;
}
updateGreeting();
setInterval(updateGreeting, 30000);

// ---------------------------------------------------------------------------
// Voucher redemption
// ---------------------------------------------------------------------------
function setVoucherState(state) {
  ['idle', 'connecting', 'connected'].forEach((s) => {
    document.getElementById(`voucher-${s}`).style.display = s === state ? 'block' : 'none';
  });
}

document.getElementById('connect-btn').addEventListener('click', async () => {
  const codeInput = document.getElementById('voucher-code');
  const errorEl = document.getElementById('voucher-error');
  const code = codeInput.value.trim();
  errorEl.textContent = '';

  if (!code) {
    errorEl.textContent = 'Please enter your voucher code.';
    return;
  }

  const omadaParams = getOmadaParams();
  saveOmadaParams(omadaParams);
  setVoucherState('connecting');

  try {
    const res = await fetch(`${window.BACKEND_URL}/api/redeem-voucher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, omadaParams }),
    });
    const data = await res.json();

    if (!res.ok) {
      setVoucherState('idle');
      errorEl.textContent = data.error || 'Could not redeem voucher.';
      return;
    }

    setVoucherState('connected');
    document.getElementById('voucher-continue-link').href =
      omadaParams.redirectUrl || 'https://www.facebook.com/johnkharl.zerna.9';
  } catch (err) {
    console.error(err);
    setVoucherState('idle');
    errorEl.textContent = 'Something went wrong. Please try again.';
  }
});

// ---------------------------------------------------------------------------
// GCash payment (dropdown of plans -> Proceed -> PayMongo checkout)
// ---------------------------------------------------------------------------
function setPayState(state) {
  ['idle', 'connecting', 'connected'].forEach((s) => {
    document.getElementById(`pay-${s}`).style.display = s === state ? 'block' : 'none';
  });
}

async function loadPlansIntoDropdown() {
  const select = document.getElementById('plan-select');
  try {
    const res = await fetch(`${window.BACKEND_URL}/api/rates`);
    const rates = await res.json();
    select.innerHTML = rates
      .map((r) => `<option value="${r.planId}">${r.label} — ₱${(r.amountCentavos / 100).toFixed(0)}</option>`)
      .join('');
  } catch (err) {
    console.error('Could not load rates:', err);
    select.innerHTML = '<option value="">Unable to load plans</option>';
  }
}
loadPlansIntoDropdown();

document.getElementById('proceed-btn').addEventListener('click', async () => {
  const select = document.getElementById('plan-select');
  const errorEl = document.getElementById('pay-error');
  const planId = select.value;
  errorEl.textContent = '';

  if (!planId) {
    errorEl.textContent = 'Please select a plan.';
    return;
  }

  const omadaParams = getOmadaParams();
  saveOmadaParams(omadaParams);
  setPayState('connecting');
  document.getElementById('pay-status-text').textContent = 'Redirecting to GCash…';

  try {
    const res = await fetch(`${window.BACKEND_URL}/api/create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, omadaParams }),
    });
    const data = await res.json();
    if (!data.checkoutUrl) throw new Error(data.error || 'No checkout URL returned.');
    window.location.href = data.checkoutUrl;
  } catch (err) {
    console.error(err);
    setPayState('idle');
    errorEl.textContent = 'Could not start payment. Please try again.';
  }
});

async function pollPaymentStatus(referenceId) {
  setPayState('connecting');
  document.getElementById('pay-status-text').textContent = 'Confirming your payment…';
  const savedParams = loadSavedOmadaParams();

  const poll = async () => {
    try {
      const res = await fetch(`${window.BACKEND_URL}/api/payment-status/${referenceId}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();

      if (data.status === 'paid') {
        setPayState('connected');
        document.getElementById('pay-continue-link').href =
          (savedParams && savedParams.redirectUrl) || 'https://www.google.com';
        return;
      }
      setTimeout(poll, 2500);
    } catch (err) {
      console.error(err);
      document.getElementById('pay-error').textContent =
        'Something went wrong confirming your payment.';
      setPayState('idle');
    }
  };
  poll();
}

// ---------------------------------------------------------------------------
// Init: if we've just returned from a GCash redirect, resume polling
// ---------------------------------------------------------------------------
const referenceIdFromReturn = new URLSearchParams(window.location.search).get('referenceId');
if (referenceIdFromReturn) {
  pollPaymentStatus(referenceIdFromReturn);
}
