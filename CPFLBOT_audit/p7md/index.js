const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// State
let sock;
let currentPairingCode = null;
let targetPhoneNumber = null;
let isPairingMode = false;

// Ensure auth folder exists
if (!fs.existsSync('auth_info_baileys')) {
    fs.mkdirSync('auth_info_baileys');
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // Using pairing code
        auth: state,
        browser: Browsers.ubuntu("Chrome"),
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false
    });

    if (isPairingMode && targetPhoneNumber && !sock.authState.creds.registered) {
        console.log(`Waiting 3s before requesting pairing code for ${targetPhoneNumber}...`);
        setTimeout(async () => {
            try {
                // Ensure phone number format is correct (digits only)
                if(!sock.authState.creds.registered) {
                    const code = await sock.requestPairingCode(targetPhoneNumber);
                    currentPairingCode = code?.match(/.{1,4}/g)?.join("-") || code;
                    console.log(`Pairing code generated: ${currentPairingCode}`);
                }
            } catch (err) {
                console.error('Error generating pairing code:', err);
                currentPairingCode = 'ERROR_GEN';
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Opened connection');
            // User requested 10s check
            setTimeout(() => {
                console.log('System check: 10 seconds stable post-connection.');
            }, 10000);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Routes
// 1. Serve Login Page (acting as /botzincpfl)
app.get('/botzincpfl', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 2. Dashboard
app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 3. API: Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Hardcoded creds as requested
    if (username === 'admin' && password === 'p7zinn') {
        res.json({ success: true, redirect: '/dashboard.html' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// 4. API: Start Pairing
app.post('/api/pairing', (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });
    
    // Clean phone number (remove +, spaces, dashes)
    targetPhoneNumber = phone.replace(/[^0-9]/g, '');
    isPairingMode = true;
    currentPairingCode = 'Generating...';
    
    // Restart logic to trigger pairing flow
    console.log(`Restarting socket for pairing: ${targetPhoneNumber}`);
    
    // If socket exists, end it to restart with new phone number context
    if (sock) {
        sock.end(undefined); 
    } else {
        connectToWhatsApp();
    }
    
    res.json({ success: true, message: 'Pairing started' });
});

// 5. API: Check Code
app.get('/api/code', (req, res) => {
    res.json({ code: currentPairingCode });
});

// 6. API: PDF Placeholder
app.get('/api/pdfs', (req, res) => {
    res.json([
        { id: 1, name: 'Audit_Report_2023.pdf', date: '2023-10-01' },
        { id: 2, name: 'CPFL_Bill_Example.pdf', date: '2023-10-05' }
    ]);
});


// Initial start
connectToWhatsApp();

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access at /botzincpfl`);
});
