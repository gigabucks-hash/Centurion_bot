#!/usr/bin/env python3
"""READ-ONLY capture of pump.fun bonding-curve and SPL mint accounts (getAccountInfo, base64) for decoder tests.

HELIUS_API_KEY is read from the env and never printed or written. No signing, no transactions.
Usage: python3 scripts/capture_curve_accounts.py <label>=<pubkey> [...]
Writes fixtures/mainnet/curve_<label>.<YYYY-MM-DD>.json (labels starting with mint_ keep their name) (the raw JSON-RPC response, including context.slot).
"""
import datetime, json, os, sys, urllib.request

KEY = os.environ.get("HELIUS_API_KEY", "")
RPC = "https://mainnet.helius-rpc.com/?api-key=" + KEY
OUT = os.path.join(os.path.dirname(__file__), "..", "fixtures", "mainnet")
DATE = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")


def main():
    if not KEY:
        sys.exit("HELIUS_API_KEY not set")
    for arg in sys.argv[1:]:
        label, pubkey = arg.split("=", 1)
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "getAccountInfo",
                           "params": [pubkey, {"encoding": "base64", "commitment": "confirmed"}]}).encode()
        req = urllib.request.Request(RPC, data=body, headers={"content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                raw = r.read().decode()
        except Exception as e:
            sys.exit("getAccountInfo failed: " + str(e).replace(KEY, "***"))
        slot = json.loads(raw)["result"]["context"]["slot"]
        name = label if label.startswith("mint_") else f"curve_{label}"
        with open(os.path.join(OUT, f"{name}.{DATE}.json"), "w") as f:
            f.write(raw.strip() + "\n")
        print(f"{name}: {pubkey} slot={slot}")


if __name__ == "__main__":
    main()
