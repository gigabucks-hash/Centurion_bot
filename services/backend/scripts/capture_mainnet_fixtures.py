#!/usr/bin/env python3
"""READ-ONLY capture of mainnet fixtures for the Helius stream parser.

* WebSocket `logsSubscribe` on the pump.fun program; keeps the first raw frame per event type
  (CreateEvent, TradeEvent, CompleteEvent) exactly as received.
* JSON-RPC `getTransaction` for the captured create signature (enrichment fixture).

No keys are printed or written: HELIUS_API_KEY is read from the environment and the URL is never logged.
No signing, no transactions sent. Usage: HELIUS_API_KEY=... python3 scripts/capture_mainnet_fixtures.py [max_seconds]
"""
import asyncio, base64, datetime, hashlib, json, os, sys, time, urllib.request

PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
OUT = os.path.join(os.path.dirname(__file__), "..", "fixtures", "mainnet")
KEY = os.environ.get("HELIUS_API_KEY", "")
WS = "wss://mainnet.helius-rpc.com/?api-key=" + KEY
RPC = "https://mainnet.helius-rpc.com/?api-key=" + KEY
DATE = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
DISC = {hashlib.sha256(f"event:{n}".encode()).digest()[:8]: n for n in ("CreateEvent", "TradeEvent", "CompleteEvent")}
NAME = {"CreateEvent": "logs_create", "TradeEvent": "logs_trade", "CompleteEvent": "logs_complete"}


def kinds(frame):
    try:
        v = json.loads(frame)["params"]["result"]["value"]
    except Exception:
        return set(), None
    if v.get("err") is not None:
        return set(), None
    out = set()
    for l in v.get("logs") or []:
        if l.startswith("Program data: "):
            try:
                b = base64.b64decode(l[14:].strip())
            except Exception:
                continue
            if b[:8] in DISC:
                out.add(DISC[b[:8]])
    return out, v.get("signature")


def scrub(s):
    return str(s).replace(KEY, "***") if KEY else str(s)


async def capture(max_s):
    import websockets
    got, meta = {}, {}
    t0 = time.time()
    async with websockets.connect(WS, max_size=2**22, ping_interval=30) as ws:
        await ws.send(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "logsSubscribe",
                                  "params": [{"mentions": [PUMP]}, {"commitment": "confirmed"}]}))
        n = 0
        while len(got) < 3 and time.time() - t0 < max_s:
            try:
                frame = await asyncio.wait_for(ws.recv(), timeout=30)
            except asyncio.TimeoutError:
                continue
            n += 1
            ks, sig = kinds(frame)
            # prefer a frame with a single event type for create / trade, but accept create+trade (dev buy)
            for k in sorted(ks):
                if k in got:
                    continue
                if k == "TradeEvent" and "CreateEvent" in ks:
                    continue
                got[k] = frame
                slot = json.loads(frame)["params"]["result"]["context"]["slot"]
                meta[k] = {"signature": sig, "slot": slot, "events": sorted(ks)}
                print(f"captured {k} slot={slot} sig={sig} after {n} frames", flush=True)
    return got, meta


def rpc(body):
    req = urllib.request.Request(RPC, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode()


def main():
    if not KEY:
        sys.exit("HELIUS_API_KEY not set")
    max_s = int(sys.argv[1]) if len(sys.argv) > 1 else 900
    try:
        got, meta = asyncio.run(capture(max_s))
    except Exception as e:
        sys.exit("capture failed: " + scrub(e))
    os.makedirs(OUT, exist_ok=True)
    for k, frame in got.items():
        with open(os.path.join(OUT, f"{NAME[k]}.{DATE}.json"), "w") as f:
            f.write(frame.strip() + "\n")
    if "CreateEvent" in got:
        sig = meta["CreateEvent"]["signature"]
        for attempt in range(10):
            body = rpc({"jsonrpc": "2.0", "id": 1, "method": "getTransaction",
                        "params": [sig, {"encoding": "json", "commitment": "confirmed", "maxSupportedTransactionVersion": 0}]})
            if json.loads(body).get("result"):
                break
            time.sleep(2)
        with open(os.path.join(OUT, f"get_transaction_create.{DATE}.json"), "w") as f:
            f.write(body.strip() + "\n")
        meta["getTransaction"] = {"signature": sig, "slot": json.loads(body).get("result", {}).get("slot")}
    meta["_captured_at_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    meta["_source"] = "Helius standard mainnet WebSocket logsSubscribe (confirmed) + Helius RPC getTransaction"
    with open(os.path.join(OUT, f"capture_meta.{DATE}.json"), "w") as f:
        json.dump(meta, f, indent=2)
    missing = sorted(set(NAME) - set(got))
    print("missing:", missing or "none")


if __name__ == "__main__":
    main()
