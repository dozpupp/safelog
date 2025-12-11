const http = require('http');
const dilithiumPromise = require('dilithium-crystals-js');
const { Buffer } = require('buffer');

const HOST = '127.0.0.1';
const PORT = 3002;

// Initialize Crypto once
let dilithium = null;
dilithiumPromise.then(mod => {
    dilithium = mod;
    console.log(`[PQC Service] Ready on http://${HOST}:${PORT}`);
});

const fromHex = (hex) => new Uint8Array(Buffer.from(hex, 'hex'));

const server = http.createServer(async (req, res) => {
    // CORS (Internal only, but good practice if needed)
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST' || req.url !== '/verify') {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not Found" }));
        return;
    }

    if (!dilithium) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: "Service initializing" }));
        return;
    }

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

            // Prepare buffers
            const msgBytes = new TextEncoder().encode(message);
            const sigBytes = fromHex(signature);
            const pkBytes = fromHex(publicKey);

            // verify(signature, message, publicKey, kind)
            // kind = 2 for Dilithium2
            const resultObj = dilithium.verify(sigBytes, msgBytes, pkBytes, 2);

            // Result 0 is success
            const isValid = resultObj && resultObj.result === 0;

            res.writeHead(200);
            res.end(JSON.stringify({ valid: isValid }));

        } catch (e) {
            console.error("Verification Error:", e.message);
            res.writeHead(400);
            res.end(JSON.stringify({ valid: false, error: e.message }));
        }
    });
});

server.listen(PORT, HOST);
