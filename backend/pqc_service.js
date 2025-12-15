const http = require('http');
const dilithiumPromise = require('dilithium-crystals-js');
const { Buffer } = require('buffer');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 3002;
const KEY_FILE = path.join(__dirname, 'server_keys.json');

// Initialize Crypto and Keys
let dilithium = null;
let serverKeys = null;

const toHex = (arr) => Buffer.from(arr).toString('hex');
const fromHex = (hex) => new Uint8Array(Buffer.from(hex, 'hex'));

const saveKeys = (keys) => {
    fs.writeFileSync(KEY_FILE, JSON.stringify({
        publicKey: toHex(keys.publicKey),
        privateKey: toHex(keys.privateKey)
    }, null, 2));
    console.log("[PQC Service] New Server Keys generated and saved.");
};

const loadOrGenerateKeys = (mod) => {
    if (fs.existsSync(KEY_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
            serverKeys = {
                publicKey: fromHex(data.publicKey),
                privateKey: fromHex(data.privateKey)
            };
            console.log("[PQC Service] Server Keys loaded.");
        } catch (e) {
            console.error("[PQC Service] Error loading keys, regenerating...", e);
        }
    }

    if (!serverKeys) {
        // Generate new keys (Dilithium2)
        const seed = new Uint8Array(32);
        const rand = require('crypto').randomBytes(32);
        seed.set(rand);

        serverKeys = mod.generateKeys(2, seed);
        saveKeys(serverKeys);
    }
};

dilithiumPromise.then(mod => {
    dilithium = mod;
    loadOrGenerateKeys(mod);
    console.log(`[PQC Service] Ready on http://${HOST}:${PORT}`);
});

const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (!dilithium || !serverKeys) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: "Service initializing" }));
        return;
    }

    if (req.method === 'GET' && req.url === '/server-public-key') {
        res.writeHead(200);
        res.end(JSON.stringify({ publicKey: toHex(serverKeys.publicKey) }));
        return;
    }

    if (req.method === 'POST' && req.url === '/sign') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { message } = JSON.parse(body);
                if (!message) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: "Message required" }));
                    return;
                }

                const msgBytes = new TextEncoder().encode(message);
                // sign(msg, sk, kind=2)
                const sigResult = dilithium.sign(msgBytes, serverKeys.privateKey, 2);

                if (!sigResult || !sigResult.signature) {
                    throw new Error("Signing failed");
                }

                res.writeHead(200);
                res.end(JSON.stringify({
                    signature: toHex(sigResult.signature)
                }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/verify') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { message, signature, publicKey } = JSON.parse(body);

                if (!message || !signature || !publicKey) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ valid: false, error: "Missing fields" }));
                    return;
                }

                const msgBytes = new TextEncoder().encode(message);
                const sigBytes = fromHex(signature);
                const pkBytes = fromHex(publicKey);

                // verify(sig, msg, pk, kind=2)
                const resultObj = dilithium.verify(sigBytes, msgBytes, pkBytes, 2);
                const isValid = resultObj && resultObj.result === 0;

                res.writeHead(200);
                res.end(JSON.stringify({ valid: isValid }));

            } catch (e) {
                console.error("Verification Error:", e.message);
                res.writeHead(400);
                res.end(JSON.stringify({ valid: false, error: e.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, HOST);
