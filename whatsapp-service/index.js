/**
 * Axiom — WhatsApp Service (Baileys)
 *
 * Serviço persistente rodando no servidor (NÃO no Vercel).
 * Recebe chamadas do backend FastAPI via HTTP interno + token compartilhado.
 *
 * Responsabilidades:
 *  - Manter sessão Baileys persistida em ./auth_info_baileys
 *  - Reconexão automática em caso de queda
 *  - Endpoints: /status /qr /connect /disconnect /send /health
 *  - Middleware de autenticação por header X-Internal-Token
 *
 * Sobe com:
 *    node index.js
 *    ou via PM2:
 *    pm2 start ecosystem.config.js
 */

require('dotenv').config();

// Baileys é ESM; carregamos via dynamic import no boot.
let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion;
async function loadBaileys() {
  const mod = await import('@whiskeysockets/baileys');
  makeWASocket = mod.default || mod.makeWASocket;
  useMultiFileAuthState = mod.useMultiFileAuthState;
  DisconnectReason = mod.DisconnectReason;
  fetchLatestBaileysVersion = mod.fetchLatestBaileysVersion;
}
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3001', 10);
const BIND = process.env.BIND || '127.0.0.1';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || '';
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'auth_info_baileys');

const log = (...args) => console.log(new Date().toISOString(), '[wa]', ...args);

const app = express();

// CORS só habilita para uso interno com origem explícita (em geral o
// próprio backend faz proxy, então não precisa liberar tudo).
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.use(express.json({ limit: '2mb' }));

// Auth middleware: exige X-Internal-Token se configurado.
app.use((req, res, next) => {
  if (req.path === '/health') return next(); // sempre livre
  if (!INTERNAL_TOKEN) return next(); // desativado se var vazia (dev)
  const t = req.headers['x-internal-token'] || req.query.token;
  if (t !== INTERNAL_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

let sock = null;
let currentQR = null;
let isConnected = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
let lastError = null;

function resetSessionFiles() {
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    log('auth_info_baileys removed');
  } catch (e) {
    log('failed to remove auth dir', e.message);
  }
}

async function connectToWhatsApp() {
  try {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

    sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      browser: ['Axiom', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        log('QR received');
        currentQR = await qrcode.toDataURL(qr);
      }
      if (connection === 'open') {
        log('connected');
        isConnected = true;
        currentQR = null;
        reconnectAttempts = 0;
        lastError = null;
      }
      if (connection === 'close') {
        isConnected = false;
        currentQR = null;
        const code =
          lastDisconnect?.error?.output?.statusCode ||
          lastDisconnect?.error?.output?.payload?.statusCode;
        const reason = lastDisconnect?.error?.message || 'unknown';
        lastError = reason;
        log('connection closed:', code, reason);

        if (code === DisconnectReason.loggedOut) {
          log('logged out; clearing session');
          resetSessionFiles();
          return; // não reconecta
        }
        // backoff exponencial até 60s
        const delay = Math.min(60000, 2000 * Math.pow(2, reconnectAttempts));
        reconnectAttempts += 1;
        log(`reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectToWhatsApp, delay);
      }
    });

    sock.ev.on('creds.update', saveCreds);
  } catch (e) {
    log('connectToWhatsApp error', e);
    lastError = e.message;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectToWhatsApp, 5000);
  }
}

// ---------------- Endpoints ----------------

app.get('/health', (req, res) => {
  res.json({
    service: 'whatsapp-service',
    uptime: process.uptime(),
    connected: isConnected,
    hasQR: !!currentQR,
    reconnectAttempts,
  });
});

app.get('/status', (req, res) => {
  res.json({
    connected: isConnected,
    hasQR: !!currentQR,
    reconnectAttempts,
    lastError,
  });
});

app.get('/qr', (req, res) => {
  res.json({ qr: currentQR });
});

app.post('/connect', (req, res) => {
  if (!sock || (!isConnected && !currentQR)) {
    connectToWhatsApp();
  }
  res.json({ success: true, connected: isConnected, hasQR: !!currentQR });
});

app.post('/disconnect', async (req, res) => {
  try {
    if (sock) {
      try { await sock.logout(); } catch (_) {}
      try { sock.end(); } catch (_) {}
    }
    resetSessionFiles();
    sock = null;
    isConnected = false;
    currentQR = null;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function normalizeBrPhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits.startsWith('55')) digits = '55' + digits;
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

app.post('/send', async (req, res) => {
  if (!isConnected || !sock) {
    return res.status(409).json({ error: 'Not connected to WhatsApp' });
  }
  const { phone, message } = req.body || {};
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message required' });
  }
  const normalized = normalizeBrPhone(phone);
  if (!normalized) {
    return res.status(400).json({ error: 'invalid phone' });
  }
  try {
    const jid = normalized + '@s.whatsapp.net';
    // Verifica se o número existe no WhatsApp
    let exists = true;
    try {
      const [info] = await sock.onWhatsApp(jid);
      exists = !!(info && info.exists);
    } catch (_) { /* fallback: tenta mesmo assim */ }
    if (!exists) {
      return res.status(422).json({ error: 'number not on WhatsApp', phone: normalized });
    }
    const result = await sock.sendMessage(jid, { text: String(message) });
    return res.json({
      success: true,
      phone: normalized,
      messageId: result?.key?.id || null,
    });
  } catch (err) {
    log('send error', err);
    return res.status(500).json({ error: err.message });
  }
});

(async () => {
  await loadBaileys();
  app.listen(PORT, BIND, () => {
    log(`service listening on ${BIND}:${PORT} (token ${INTERNAL_TOKEN ? 'enabled' : 'DISABLED - dev mode'})`);
  });
  // Boot automático (não bloqueia o listen)
  connectToWhatsApp().catch((e) => log('boot connect error', e));
})();

// Shutdown gracioso
process.on('SIGINT', () => { log('SIGINT'); process.exit(0); });
process.on('SIGTERM', () => { log('SIGTERM'); process.exit(0); });
process.on('uncaughtException', (e) => { log('uncaughtException', e); });
process.on('unhandledRejection', (e) => { log('unhandledRejection', e); });
