const http = require('http');
const dilithiumPromise = require('dilithium-crystals-js');
const { Buffer } = require('buffer');
const crypto = require('crypto');
require('dotenv').config();

const HOST = '127.0.0.1';
const PORT = 3002;

// Initialize Crypto and Keys
let dilithium = null;
let serverKeys = null;

const toHex = (arr) => Buffer.from(arr).toString('hex');
const fromHex = (hex) => new Uint8Array(Buffer.from(hex, 'hex'));

// Deterministic Key Generation from Secret
const generateKeysFromSecret = (mod) => {
    let secret = process.env.SAFELOG_SECRET_KEY;
    if (!secret) {
        console.warn("[PQC Service] WARNING: SAFELOG_SECRET_KEY not set. Using insecure default.");
        secret = "dev_secret_key_change_me"; // Fallback for dev
    }

    // Hash secret to get 32-byte seed
    const seed = crypto.createHash('sha256').update(secret).digest();

    // Generate Deterministic Keys
    serverKeys = mod.generateKeys(2, seed);
    console.log("[PQC Service] Server Keys generated deterministically from secret.");
};

dilithiumPromise.then(mod => {
    dilithium = mod;
    generateKeysFromSecret(mod);
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
