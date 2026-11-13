import { createPublicKey, verify } from "node:crypto";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 (Bitcoin alphabet). Returns null when the text is not base58 or is too long. */
export function b58decode(input: string): Uint8Array | null {
  if (!input || input.length > 128) return null;
  const bytes: number[] = [];
  for (const c of input) {
    const value = B58.indexOf(c);
    if (value < 0) return null;
    let carry = value;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < input.length && input[i] === "1"; i += 1) bytes.push(0);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) out[out.length - 1 - i] = bytes[i];
  return out;
}

/** Verify a Phantom `signMessage` signature. The public key is the wallet address. No private key is read. */
export function verifySolanaMessage(address: string, message: string, signature: string): boolean {
  try {
    const pub = b58decode(address);
    const sig = b58decode(signature);
    if (!pub || pub.length !== 32 || !sig || sig.length !== 64) return false;
    const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pub)]);
    const key = createPublicKey({ key: spki, format: "der", type: "spki" });
    return verify(null, Buffer.from(message, "utf8"), key, Buffer.from(sig));
  } catch {
    return false;
  }
}
