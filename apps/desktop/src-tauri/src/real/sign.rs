//! Ask the owner's wallet, in the system browser, to sign a message or a transaction.
//! The signature comes back to this PC. The private key never does.

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
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let page = page(kind, payload);
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
        if req.starts_with("GET ") {
            let body = page.as_bytes();
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(body);
            continue;
        }
        if let Some(i) = req.find("\r\n\r\n") {
            let posted = req[i + 4..].trim().to_owned();
            if posted.is_empty() || posted.len() > 8_000 {
                let _ = stream.write_all(
                    b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                );
                return Err("empty signature".into());
            }
            let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
            return Ok(posted);
        }
    }
}

fn page(kind: &str, payload: &str) -> String {
    let payload = serde_json::to_string(payload).unwrap_or_else(|_| "\"\"".into());
    let kind = serde_json::to_string(kind).unwrap_or_else(|_| "\"message\"".into());
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>Centurion Trade</title></head>
<body style="font-family:sans-serif;background:#0A0B10;color:#E8EAF2;padding:24px">
<h1>Centurion Trade</h1>
<p>Your wallet signs this. The key stays in the wallet.</p>
<pre id="m" style="white-space:pre-wrap"></pre>
<p id="s">Waiting for the wallet…</p>
<script type="module">
const kind = {kind};
const payload = {payload};
document.getElementById('m').textContent = kind === 'message' ? payload : 'Transaction';
const provider = window.solana || window.phantom?.solana;
if (!provider) {{ document.getElementById('s').textContent = 'Open this page in a browser where Phantom is installed.'; }}
else {{
  try {{
    await provider.connect();
    let out;
    if (kind === 'message') {{
      const signed = await provider.signMessage(new TextEncoder().encode(payload));
      out = [...signed.signature].map(b => b.toString(16).padStart(2, '0')).join('');
    }} else {{
      const {{ VersionedTransaction }} = await import('https://esm.sh/@solana/web3.js@1.95.8');
      const raw = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(raw);
      const signed = await provider.signTransaction(tx);
      const ser = signed.serialize();
      let bin = ''; for (const b of ser) bin += String.fromCharCode(b);
      out = btoa(bin);
    }}
    await fetch('/done', {{ method: 'POST', body: out }});
    document.getElementById('s').textContent = 'Signed. You can close this tab and return to Centurion Trade.';
  }} catch (e) {{
    document.getElementById('s').textContent = 'The wallet did not sign. ' + (e && e.message ? e.message : '');
  }}
}}
</script></body></html>"#
    )
}
