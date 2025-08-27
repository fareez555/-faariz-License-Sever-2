// index.js
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// SECRET: Render → Environment → add ADMIN_TOKEN
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me';
// Optional: comma separated origins, or * for all
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

app.use(cors({ origin: ALLOW_ORIGIN === '*' ? true : ALLOW_ORIGIN.split(','), credentials: false }));
app.use(express.json());

// in-memory store (demo). Use DB for production.
const store = new Map(); // key -> { scriptId, expiresAt, maxDevices, devices:Set }

// simple health
app.get('/', (_, res) => res.send('FAARIZ License Server is running ✅'));
app.get('/health', (_, res) => res.json({ ok: true }));

function adminOnly(req, res, next) {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, reason: 'unauthorized' });
  }
  next();
}

// ISSUE a license
app.post('/issue', adminOnly, (req, res) => {
  const { key, scriptId, days = 30, maxDevices = 1 } = req.body || {};
  if (!key || !scriptId) return res.status(400).json({ ok: false, reason: 'missing_fields' });
  const expiresAt = Date.now() + Number(days) * 24 * 60 * 60 * 1000;
  store.set(key, { scriptId, expiresAt, maxDevices: Number(maxDevices), devices: new Set() });
  res.json({ ok: true, key, scriptId, expiresAt, maxDevices: Number(maxDevices) });
});

// VERIFY a license
app.post('/verify', (req, res) => {
  const { key, scriptId, fingerprint = 'default' } = req.body || {};
  const lic = store.get(key);
  if (!lic) return res.json({ ok: false, reason: 'invalid_key' });
  if (lic.scriptId !== scriptId) return res.json({ ok: false, reason: 'wrong_script' });
  if (Date.now() > lic.expiresAt) return res.json({ ok: false, reason: 'expired' });
  if (!lic.devices.has(fingerprint) && lic.devices.size >= lic.maxDevices) {
    return res.json({ ok: false, reason: 'device_limit' });
  }
  lic.devices.add(fingerprint);
  res.json({ ok: true, expiresAt: lic.expiresAt, leftMs: lic.expiresAt - Date.now(), devices: [...lic.devices] });
});

// REVOKE a license
app.post('/revoke', adminOnly, (req, res) => {
  const { key } = req.body || {};
  store.delete(key);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`License server listening on ${PORT}`));
