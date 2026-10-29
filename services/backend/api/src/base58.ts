// Bitcoin-alphabet base58 (Solana addresses and signatures). No dependency.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MAP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function b58decode(s: string): Buffer | null {
  if (s.length === 0 || s.length > 128) return null;
  const bytes: number[] = []; // little-endian
  for (const ch of s) {
    const v = MAP.get(ch);
    if (v === undefined) return null;
    let carry = v;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let zeros = 0;
  while (zeros < s.length && s[zeros] === "1") zeros++;
  return Buffer.from([...new Array<number>(zeros).fill(0), ...bytes.reverse()]);
}

export function b58encode(buf: Uint8Array): string {
  const digits: number[] = []; // little-endian base58
  for (const byte of buf) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! * 256;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let zeros = 0;
  while (zeros < buf.length && buf[zeros] === 0) zeros++;
  return "1".repeat(zeros) + digits.reverse().map((d) => ALPHABET[d]).join("");
}
