import KyberPkg from 'crystals-kyber';
import { randomBytes } from 'crypto';

const { KeyGen768, Encrypt768, Decrypt768 } = KyberPkg;

console.log("Generating Keys (Loop)...");
try {
    for (let i = 0; i < 10; i++) {
        console.time(`KeyGen ${i}`);
        const [pk, sk] = KeyGen768();
        console.timeEnd(`KeyGen ${i}`);
    }
    console.log("KeyGen loop finished.");


    // Full PKE Test
    console.log("Testing Full Encryption/Decryption Cycle...");
    const [pk, sk] = KeyGen768();

    // 1. Generate Seed
    const seed = new Uint8Array(32);
    // Fill with random
    const rnd1 = randomBytes(32);
    for (let i = 0; i < 32; i++) seed[i] = rnd1[i];

    console.log("Original Seed:", Buffer.from(seed).toString('hex'));

    // 2. Encrypt Seed (PKE)
    const coins = new Uint8Array(32);
    const rnd2 = randomBytes(32);
    for (let i = 0; i < 32; i++) coins[i] = rnd2[i];

    const ctComponents = Encrypt768(pk, seed, coins);

    // Check if ctComponents structure matches expected KEM or PKE
    console.log("ctComponents type:", typeof ctComponents);
    console.log("Is array?", Array.isArray(ctComponents));
    if (Array.isArray(ctComponents)) {
        console.log("Length:", ctComponents.length);
        ctComponents.forEach((c, i) => {
            console.log(`Component ${i} length:`, c.length);
            // Check if one of them matches seed
            if (c.length === 32) {
                const isSeed = Buffer.from(c).equals(Buffer.from(seed));
                console.log(`Component ${i} equals passed seed?`, isSeed);
            }
        });
    }
    // KEM Flow Test
    console.log("Testing KEM Flow...");

    // Encrypt (ignoring seed/coins for message, but using them for randomness if lib supports?)
    // Actually Encrypt768 probably generates its own. 
    // ctComponents = [ct, ss]

    const kemResult = Encrypt768(pk); // No args? Or maybe just pk. output [ct, ss]
    const ct = kemResult[0];
    const ss_enc = kemResult[1];

    console.log("Ciphertext length:", ct.length);
    console.log("Shared Secret (from Encrypt):", Buffer.from(ss_enc).toString('hex'));

    // Decrypt
    // Decrypt768(ct, sk) -> ss
    // ct should be Uint8Array
    const ss_dec = Decrypt768(ct, sk);
    console.log("Shared Secret (from Decrypt):", Buffer.from(ss_dec).toString('hex'));

    const match = Buffer.from(ss_enc).equals(Buffer.from(ss_dec));
    console.log("KEM Shared Secrets Match?", match);
    if (match) {
        console.log("SUCCESS: KEM works.");
    } else {
        console.error("FAIL: KEM mismatch.");
    }

    // Dilithium Test
    console.log("Testing Dilithium Signing...");
    const DilithiumPkg = await import('dilithium-crystals-js');
    const dilithium = await DilithiumPkg.default;

    // Generate Keys (kind 2)
    const { publicKey: pkD, privateKey: skD } = dilithium.generateKeys(2);
    console.log("Dilithium Keys generated.");

    const msg = "Hello World";
    const msgBytes = Buffer.from(msg);

    // Sign: (message, privateKey, kind)
    const sigResult = dilithium.sign(msgBytes, skD, 2);
    // sigResult = { result, signature, signatureLength }
    const sig = sigResult.signature; // Uint8Array
    console.log("Signature generated. Length:", sig.length);

    // Verify: (signature, message, publicKey, kind)
    const verifyResult = dilithium.verify(sig, msgBytes, pkD, 2);
    // verifyResult = { result, ... }
    const isValid = verifyResult.result === 0; // 0 == Success

    console.log("Signature Valid?", isValid, "Result Code:", verifyResult.result);

    if (isValid) {
        console.log("SUCCESS: Signing works.");
    } else {
        console.error("FAIL: Signature invalid.");
    }

} catch (e) {
    console.error("CRASHED:", e);
    console.error(e.stack);
}
