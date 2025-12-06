import KyberPkg from 'crystals-kyber';
import DilithiumPkg from 'dilithium-crystals-js';

console.log("KyberPkg exports:", KyberPkg);
console.log("DilithiumPkg exports:", DilithiumPkg);
// const { Kyber768 } = KyberPkg;
// const { DilithiumLevel3 } = DilithiumPkg;

async function test() {
    console.log("Testing Kyber...");
    try {
        const { KeyGen768, Encrypt768, Decrypt768 } = KyberPkg;
        const [pk, sk] = KeyGen768();
        console.log("Kyber keys generated.");

        // Test Encryption
        // Message must likely be bytes (32 bytes usually for KEM, but for PKE?)
        // If it's PKE, it might accept longer messages but Kyber PKE usually has fixed size or limited size.
        // Kyber PKE plain text is 32 bytes (256 bits).
        const msg = new Uint8Array(32).fill(1);
        const ct = Encrypt768(pk, msg, new Uint8Array(32).fill(0)); // verify args: pk, msg, coins?
        // Wait, Encrypt768 signature usually: pk, msg, coins.

        console.log("Kyber Encrypt result:", ct);

        const decrypted = Decrypt768(ct, sk);
        console.log("Kyber Decrypt result matches:", decrypted.every((v, i) => v === msg[i]));

    } catch (e) {
        console.error("Kyber failed:", e);
    }

    console.log("Testing Dilithium...");
    try {
        const dilithium = await DilithiumPkg;
        const { publicKey, privateKey } = dilithium.generateKeys(2);
        console.log("Dilithium keys generated.");

        const validMsg = new Uint8Array([1, 2, 3]);
        const sig = dilithium.sign(privateKey, validMsg);
        console.log("Dilithium Sign result:", !!sig);

        const valid = dilithium.verify(publicKey, validMsg, sig);
        console.log("Dilithium Verify result:", valid);
    } catch (e) {
        console.error("Dilithium failed:", e);
    }
}

test();
