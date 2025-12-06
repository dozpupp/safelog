const dilithiumPromise = require('dilithium-crystals-js');
const { Buffer } = require('buffer');

// Helper to handle input
const readStdin = () => {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.on('data', chunk => data += chunk);
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
};

const fromHex = (hex) => new Uint8Array(Buffer.from(hex, 'hex'));

(async () => {
    try {
        const inputData = await readStdin();
        if (!inputData) {
            console.log(JSON.stringify({ valid: false, error: "No input data" }));
            return;
        }

        const { message, signature, publicKey } = JSON.parse(inputData);

        if (!message || !signature || !publicKey) {
            console.log(JSON.stringify({ valid: false, error: "Missing fields" }));
            return;
        }

        const mod = await dilithiumPromise;

        // Prepare buffers
        const msgBytes = new TextEncoder().encode(message);
        const sigBytes = fromHex(signature);
        const pkBytes = fromHex(publicKey);

        // verify(signature, message, publicKey, kind)
        // kind = 2 for Dilithium2 (Standard)
        const resultObj = mod.verify(sigBytes, msgBytes, pkBytes, 2);

        // result === 0 means success in this library
        const isValid = resultObj && resultObj.result === 0;

        console.log(JSON.stringify({ valid: isValid }));

    } catch (e) {
        console.log(JSON.stringify({ valid: false, error: e.message }));
    }
})();
