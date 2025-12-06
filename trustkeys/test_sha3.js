
import { SHA3, SHAKE } from 'sha3';
import { Buffer } from 'buffer';

console.log("Testing SHAKE128...");
try {
    const xof = new SHAKE(128);
    xof.update(Buffer.from("hello"));

    // Test streaming
    const buf1 = Buffer.alloc(10);
    xof.digest({ buffer: buf1 });
    console.log("Chunk 1:", buf1.toString('hex'));

    const buf2 = Buffer.alloc(10);
    xof.digest({ buffer: buf2 });
    console.log("Chunk 2:", buf2.toString('hex'));

    if (buf1.equals(buf2)) {
        console.log("FAIL: Output repeated (reset?)");
    } else {
        console.log("SUCCESS: Output differs (streaming)");
    }
} catch (e) {
    console.error("Error:", e);
}
