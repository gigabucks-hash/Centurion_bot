// DEVNET-ONLY test keypairs (ed25519 via node:crypto). Stored outside the repo, mode 600.
// These stand in for Boss's Phantom (owner) and the delegated signer during the bake-off; never funded on mainnet.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { b58encode } from "./solana/base58.ts";

export const DEFAULT_STATE_DIR = "/home/box/.secrets/centurion_bakeoff_state";
export type DevKeypair = { label: string; address: string; privateKey: KeyObject };

export function pubkeyOf(pk: KeyObject): string {
  const jwk = createPublicKey(pk).export({ format: "jwk" }) as { x: string };
  return b58encode(new Uint8Array(Buffer.from(jwk.x, "base64url")));
}

export function loadOrCreateKeypair(label: string, dir: string = process.env.BAKEOFF_STATE_DIR ?? DEFAULT_STATE_DIR): DevKeypair {
  if (dir.includes("/workspace/")) throw new Error("refusing to store keys inside the workspace/repo");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `${label}.devnet.pem`);
  let privateKey: KeyObject;
  if (existsSync(file)) {
    privateKey = createPrivateKey(readFileSync(file));
  } else {
    privateKey = generateKeyPairSync("ed25519").privateKey;
    writeFileSync(file, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  return { label, address: pubkeyOf(privateKey), privateKey };
}

export function signBytes(kp: DevKeypair, msg: Uint8Array): Uint8Array {
  return new Uint8Array(sign(null, msg, kp.privateKey));
}
