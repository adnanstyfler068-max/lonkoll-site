import { storageError } from "./errors.js";
export async function sha256Hex(text) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw storageError("storage-unavailable", "SHA-256 is unavailable in this browser context.");
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [
        ...new Uint8Array(digest)
    ].map((byte)=>byte.toString(16).padStart(2, "0")).join("");
}


//# sourceURL=storage/fingerprint.ts