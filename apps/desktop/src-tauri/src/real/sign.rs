//! Ask the owner's wallet, in the system browser, to sign a message or a transaction.
//! The signature comes back to this PC. The private key never does.
//!
//! The page is served only on 127.0.0.1 and only accepts the signature POST that
//! carries the one-time header minted for this page. It does not load a remote script.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;

/// Open the system browser on a loopback page and wait for Phantom to post the signature.
/// `kind` is `message` or `transaction`. Returns the base58 signature, or base64 signed bytes
/// for a transaction.
pub fn request(kind: &str, payload: &str) -> Result<String, String> {
    if kind != "message" && kind != "transaction" {
        return Err("kind".into());
    }
    let token = fresh_token()?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let page = page(kind, payload, &token);
    let url = format!("http://127.0.0.1:{port}/");
    crate::auth::open_system_browser(&url)?;
    listener.set_nonblocking(false).ok();
    let deadline = std::time::Instant::now() + Duration::from_secs(300);
    loop {
        if std::time::Instant::now() > deadline {
            return Err("timed out waiting for the wallet".into());
        }
        listener.set_nonblocking(true).ok();
        let mut stream = match listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(50));
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };
        stream.set_read_timeout(Some(Duration::from_secs(30))).ok();
        let mut buf = vec![0u8; 64 * 1024];
        let n = stream.read(&mut buf).unwrap_or(0);
        let req = String::from_utf8_lossy(&buf[..n]);
        match accept(&req, port, &token) {
            Ok(None) => {
                let body = page.as_bytes();
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(body);
            }
            Ok(Some(posted)) => {
                let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
                return Ok(posted);
            }
            Err(reason) => {
                let _ = stream.write_all(
                    b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                );
                return Err(reason.into());
            }
        }
    }
}

fn fresh_token() -> Result<String, String> {
    let mut raw = [0u8; 16];
    getrandom::fill(&mut raw).map_err(|e| e.to_string())?;
    Ok(raw.iter().map(|b| format!("{b:02x}")).collect())
}

/// `Ok(None)` serves the page. `Ok(Some)` is the posted signature. Anything else is refused.
pub(crate) fn accept(req: &str, port: u16, token: &str) -> Result<Option<String>, &'static str> {
    let (head, body) = req.split_once("\r\n\r\n").unwrap_or((req, ""));
    let mut lines = head.split("\r\n");
    let start = lines.next().unwrap_or("");
    let mut parts = start.split(' ');
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("").split('?').next().unwrap_or("");
    let mut host = "";
    let mut origin = "";
    let mut presented = "";
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        let name = name.trim().to_ascii_lowercase();
        let value = value.trim();
        if name == "host" && host.is_empty() {
            host = value;
        } else if name == "origin" && origin.is_empty() {
            origin = value;
        } else if name == "x-centurion-sign" && presented.is_empty() {
            presented = value;
        }
    }
    let expected_host = format!("127.0.0.1:{port}");
    if !ct_eq(host.as_bytes(), expected_host.as_bytes()) {
        return Err("host");
    }
    if method == "GET" && path == "/" {
        return Ok(None);
    }
    if method != "POST" || path != "/done" {
        return Err("path");
    }
    let expected_origin = format!("http://127.0.0.1:{port}");
    if !origin.is_empty() && !ct_eq(origin.as_bytes(), expected_origin.as_bytes()) {
        return Err("origin");
    }
    if !ct_eq(presented.as_bytes(), token.as_bytes()) {
        return Err("token");
    }
    let posted = body.trim();
    if posted.is_empty() || posted.len() > 8_000 {
        return Err("empty signature");
    }
    Ok(Some(posted.to_owned()))
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    let n = a.len().max(b.len());
    let mut diff = u8::from(a.len() != b.len());
    for i in 0..n {
        diff |= a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0);
    }
    diff == 0
}

fn page(kind: &str, payload: &str, token: &str) -> String {
    let payload = serde_json::to_string(payload).unwrap_or_else(|_| "\"\"".into());
    let kind = serde_json::to_string(kind).unwrap_or_else(|_| "\"message\"".into());
    let token = serde_json::to_string(token).unwrap_or_else(|_| "\"\"".into());
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>Centurion Trade</title></head>
<body style="font-family:sans-serif;background:#0A0B10;color:#E8EAF2;padding:24px">
<h1>Centurion Trade</h1>
<p>Your wallet signs this. The key stays in the wallet.</p>
<pre id="m" style="white-space:pre-wrap"></pre>
<p id="s">Waiting for the wallet…</p>
<script>
const kind = {kind};
const payload = {payload};
const token = {token};
document.getElementById('m').textContent = kind === 'message' ? payload : 'Transaction';
function shortvec(bytes, o) {{
  let n = 0, shift = 0;
  for (;;) {{
    const b = bytes[o.i++];
    n |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return n;
    shift += 7;
    if (shift > 28) throw new Error('tx');
  }}
}}
class VersionedTransaction {{
  constructor(message, signatures) {{ this.message = message; this.signatures = signatures; }}
  static deserialize(bytes) {{
    const o = {{ i: 0 }};
    const n = shortvec(bytes, o);
    const signatures = [];
    for (let i = 0; i < n; i++) {{ signatures.push(bytes.slice(o.i, o.i + 64)); o.i += 64; }}
    return new VersionedTransaction(bytes.slice(o.i), signatures);
  }}
  serialize() {{
    let x = this.signatures.length;
    const head = [];
    for (;;) {{
      let b = x & 0x7f; x >>= 7; if (x) b |= 0x80; head.push(b); if (!x) break;
    }}
    const out = new Uint8Array(head.length + this.signatures.length * 64 + this.message.length);
    out.set(head, 0);
    let p = head.length;
    for (const sig of this.signatures) {{ out.set(sig, p); p += 64; }}
    out.set(this.message, p);
    return out;
  }}
}}
const provider = window.solana || window.phantom?.solana;
if (!provider) {{ document.getElementById('s').textContent = 'Open this page in a browser where Phantom is installed.'; }}
else {{
  (async () => {{
    try {{
      await provider.connect();
      let out;
      if (kind === 'message') {{
        const signed = await provider.signMessage(new TextEncoder().encode(payload));
        out = [...signed.signature].map(b => b.toString(16).padStart(2, '0')).join('');
      }} else {{
        const raw = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
        const tx = VersionedTransaction.deserialize(raw);
        const signed = await provider.signTransaction(tx);
        const ser = signed.serialize();
        let bin = ''; for (const b of ser) bin += String.fromCharCode(b);
        out = btoa(bin);
      }}
      await fetch('/done', {{ method: 'POST', headers: {{ 'x-centurion-sign': token }}, body: out }});
      document.getElementById('s').textContent = 'Signed. You can close this tab and return to Centurion Trade.';
    }} catch (e) {{
      document.getElementById('s').textContent = 'The wallet did not sign. ' + (e && e.message ? e.message : '');
    }}
  }})();
}}
</script></body></html>"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn post(_port: u16, host: &str, origin: &str, token: &str, body: &str) -> String {
        format!("POST /done HTTP/1.1\r\nHost: {host}\r\nOrigin: {origin}\r\nx-centurion-sign: {token}\r\nContent-Length: {}\r\n\r\n{body}", body.len())
    }

    #[test]
    fn the_page_is_local_and_a_cross_site_post_is_refused() {
        let token = "ab".repeat(16);
        let get = "GET / HTTP/1.1\r\nHost: 127.0.0.1:9\r\n\r\n";
        assert!(accept(get, 9, &token).unwrap().is_none());
        let ok = post(9, "127.0.0.1:9", "http://127.0.0.1:9", &token, "sig");
        assert_eq!(accept(&ok, 9, &token).unwrap().as_deref(), Some("sig"));
        let rebound = post(9, "evil.example:9", "http://evil.example:9", &token, "sig");
        assert_eq!(accept(&rebound, 9, &token), Err("host"));
        let csrf = post(9, "127.0.0.1:9", "https://evil.example", &token, "sig");
        assert_eq!(accept(&csrf, 9, &token), Err("origin"));
        let stolen = post(9, "127.0.0.1:9", "http://127.0.0.1:9", "00", "sig");
        assert_eq!(accept(&stolen, 9, &token), Err("token"));
        let page = page("transaction", "AQID", &token);
        assert!(!page.contains("esm.sh"));
        assert!(page.contains("x-centurion-sign"));
    }
}
