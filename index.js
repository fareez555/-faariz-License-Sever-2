// index.js (CommonJS)
// FAARIZ License Server — supports wildcard '*' for lifetime keys
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'CHANGE_ME_ADMIN_TOKEN';

// in-memory DB
const db = { keys: {} };
const now = () => Date.now();

// --- helpers ---
function normalizeAllowed(raw) {
  if (Array.isArray(raw)) return raw.map(s => String(s || '').trim());
  return String(raw || '').trim(); // string  |  '*'  |  ''
}

function allowedForScript(allowed, requested) {
  const req = String(requested || '').trim().toLowerCase();
  if (!req) return false; // must send scriptId in /verify

  if (Array.isArray(allowed)) {
    const norm = allowed.map(s => String(s).trim().toLowerCase());
    return norm.includes('*') || norm.includes(req);
  }
  const a = String(allowed || '').trim().toLowerCase();
  return a === '*' || a === req;
}

// --- routes ---

app.get('/', (_req, res) => {
  res.type('text').send('FAARIZ License Server is running ✅');
});

// Issue a key (admin)
app.post('/issue', (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, reason: 'admin_auth_failed' });
  }

  let { key, scriptId, days = 30, maxDevices = 1 } = req.body || {};
  key = String(key || '').trim();
  if (!key) return res.json({ ok: false, reason: 'missing_key' });

  scriptId = normalizeAllowed(scriptId || '*');
  days = Number.isFinite(+days) ? +days : 30;
  maxDevices = Number.isFinite(+maxDevices) ? +maxDevices : 1;

  const expiresAt = now() + Math.max(1, days) * 86400000;

  // keep previous activations if re-issuing same key
  db.keys[key] = {
    key,
    scriptId,   // may be '*' or 'FKBP-PRO-1.0' or ['FKBP-PRO-1.0','FKBP-PRO-2.0']
    expiresAt,
    maxDevices,
    devices: db.keys[key]?.devices || []
  };

  return res.json({ ok: true, key, scriptId, maxDevices, expiresAt });
});

// Verify a key (client)
app.post('/verify', (req, res) => {
  const { key, scriptId, fingerprint } = req.body || {};
  const rec = db.keys[String(key || '')];

  if (!rec) return res.json({ ok: false, reason: 'invalid_key' });
  if (rec.expiresAt <= now()) return res.json({ ok: false, reason: 'expired' });
  if (!scriptId) return res.json({ ok: false, reason: 'missing_script' });

  if (!allowedForScript(rec.scriptId, scriptId)) {
    return res.json({ ok: false, reason: 'wrong_script' });
  }

  if (!fingerprint) {
    return res.json({ ok: false, reason: 'missing_fingerprint' });
  }

  const list = rec.devices || (rec.devices = []);
  if (!list.includes(fingerprint)) {
    if (list.length >= rec.maxDevices) {
      return res.json({ ok: false, reason: 'device_limit' });
    }
    list.push(fingerprint);
  }

  return res.json({
    ok: true,
    leftMs: rec.expiresAt - now(),
    expiresAt: rec.expiresAt,
    devices: list
  });
});

// Revoke (admin)
app.post('/revoke', (req, res) => {
  if (req.get('x-admin-token') !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, reason: 'admin_auth_failed' });
  }
  const { key } = req.body || {};
  if (!db.keys[key]) return res.json({ ok: false, reason: 'not_found' });
  db.keys[key].expiresAt = 0;
  return res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('License server listening on', PORT));
