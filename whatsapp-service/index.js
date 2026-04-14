const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let currentQR = null;
let isConnected = false;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['Axiom', 'Chrome', '20.0.04'],
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('QR Code generated');
            currentQR = await qrcode.toDataURL(qr);
        }

        if (connection === 'close') {
            isConnected = false;
            currentQR = null;
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            } else {
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
            }
        } else if (connection === 'open') {
            console.log('WhatsApp connected!');
            isConnected = true;
            currentQR = null;
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

app.get('/status', (req, res) => {
    res.json({ connected: isConnected, hasQR: !!currentQR });
});

app.get('/qr', (req, res) => {
    res.json({ qr: currentQR });
});

app.post('/connect', (req, res) => {
    if (!isConnected && !currentQR) {
        connectToWhatsApp();
    }
    res.json({ success: true });
});

app.post('/disconnect', (req, res) => {
    if (sock) {
        sock.logout();
    }
    res.json({ success: true });
});

app.post('/send', async (req, res) => {
    if (!isConnected) return res.status(400).json({ error: 'Not connected' });
    const { phone, message } = req.body;
    try {
        let cleanPhone = phone.replace(/\D/g, '');
        if(!cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;
        const jid = cleanPhone + '@s.whatsapp.net';
        await sock.sendMessage(jid, { text: message });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3001, () => {
    console.log('WhatsApp service running on port 3001');
});
