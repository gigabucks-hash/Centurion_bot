//! Coin logos (COIN_LOGO Rev 6.0 / contracts 1.1.6, not yet committed by Backend).
//!
//! Only our backend's image proxy is ever loaded: `GET {backend}/v1/img/coin/{mint}?s=…&v={logo_hash}`.
//! Rust accepts a wire `logo_url` only if its origin is exactly the configured backend and its path is the
//! proxy path for **the same mint**; it forwards just the validated `logo_hash` (`v`) to the webview, which
//! builds the URL itself from `{logo_origin, mint, size, hash}`. CSP `img-src` allows only that origin.
//! `logo_hash = None` → identicon without any request.

/// Mock transport: logos come from bundled files (`/mock-logo/{hash}.webp`, same origin as the app).
pub const MOCK_ORIGIN: &str = "https://logo.mock.invalid";

/// `v` / `logo_hash`: an opaque content hash (base64url/hex alphabet), 8–128 chars.
pub fn valid_hash(h: &str) -> bool {
    (8..=128).contains(&h.len()) && h.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn valid_mint(m: &str) -> bool {
    (32..=44).contains(&m.len()) && m.bytes().all(|b| b.is_ascii_alphanumeric() && !b"0OIl".contains(&b))
}

/// `logo_url` → `logo_hash` iff it is `{origin}/v1/img/coin/{mint}?s=<digits>&v=<hash>[&fmt=webp|png]` exactly.
pub fn hash_from_url(url: &str, origin: &str, mint: &str) -> Option<String> {
    if !valid_mint(mint) || url.len() > 512 {
        return None;
    }
    let rest = url.strip_prefix(origin)?.strip_prefix("/v1/img/coin/")?;
    let (m, query) = rest.split_once('?')?;
    if m != mint || query.contains('#') {
        return None;
    }
    let (mut s, mut v, mut fmt) = (None, None, None);
    for kv in query.split('&') {
        let (k, val) = kv.split_once('=')?;
        let slot = match k {
            "s" => &mut s,
            "v" => &mut v,
            "fmt" => &mut fmt,
            _ => return None,
        };
        if slot.replace(val).is_some() {
            return None;
        }
    }
    let s_ok = s.is_some_and(|s: &str| !s.is_empty() && s.len() <= 3 && s.bytes().all(|b| b.is_ascii_digit()));
    let fmt_ok = matches!(fmt, None | Some("webp" | "png"));
    let v = v.filter(|v| valid_hash(v))?;
    (s_ok && fmt_ok).then(|| v.to_owned())
}

/// Does the (serialized) Tauri CSP list `origin` as an `img-src` source? Accepts the directive as a
/// string or as an array of sources; exact token match only.
pub fn csp_allows_img(csp: &serde_json::Value, origin: &str) -> bool {
    let d = &csp["img-src"];
    let tokens: Vec<String> = match d {
        serde_json::Value::String(s) => s.split_whitespace().map(str::to_owned).collect(),
        serde_json::Value::Array(a) => a.iter().filter_map(|x| x.as_str()).flat_map(|s| s.split_whitespace().map(str::to_owned).collect::<Vec<_>>()).collect(),
        _ => vec![],
    };
    tokens.iter().any(|t| t == origin)
}

/// Mock data: ~70 % of mints get one of the bundled logos, ~10 % a hash with no file (→ 404 → identicon),
/// the rest none (→ identicon without a request). Deterministic per mint.
pub fn mock_logo_url(mint: &str) -> Option<String> {
    let h = mint.bytes().fold(0x811c_9dc5u32, |h, b| (h ^ b as u32).wrapping_mul(0x0100_0193));
    let hash = match h % 10 {
        0..=6 => format!("mocklogo{}", h % 5),
        7 => "mocklogo-missing".to_string(),
        _ => return None,
    };
    Some(format!("{MOCK_ORIGIN}/v1/img/coin/{mint}?s=96&v={hash}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    const O: &str = "http://127.0.0.1:8787";
    const M: &str = "tUS1YuHKJDnzQddko3sTDKq1F7v58ZPsvkwRHBTGN844";

    #[test]
    fn only_our_proxy_for_the_same_mint_is_accepted() {
        assert_eq!(hash_from_url(&format!("{O}/v1/img/coin/{M}?s=96&v=abcDEF12_-"), O, M).as_deref(), Some("abcDEF12_-"));
        assert_eq!(hash_from_url(&format!("{O}/v1/img/coin/{M}?s=96&fmt=png&v=abcDEF12"), O, M).as_deref(), Some("abcDEF12"));
        for bad in [
            format!("https://evil.example/v1/img/coin/{M}?s=96&v=abcDEF12"), // other origin
            format!("{O}.evil.example/v1/img/coin/{M}?s=96&v=abcDEF12"),     // origin prefix trick
            format!("{O}@evil.example/v1/img/coin/{M}?s=96&v=abcDEF12"),
            format!("{O}/v1/img/coin/So11111111111111111111111111111111111111112?s=96&v=abcDEF12"), // other mint
            format!("{O}/v1/img/coin/{M}/x?s=96&v=abcDEF12"),
            format!("{O}/v1/img/coin/{M}?s=96"),                       // no v
            format!("{O}/v1/img/coin/{M}?s=96&v=short"),               // bad hash
            format!("{O}/v1/img/coin/{M}?s=96&v=abcDEF12&u=https://x"), // extra param
            format!("{O}/v1/img/coin/{M}?s=96&v=abcDEF12&v=abcDEF13"),
            format!("{O}/v1/img/coin/{M}?s=96&v=abc%2F../../x"),
            format!("{O}/v1/img/coin/{M}?s=96&fmt=svg&v=abcDEF12"),
            format!("ipfs://{M}"),
        ] {
            assert_eq!(hash_from_url(&bad, O, M), None, "{bad}");
        }
    }

    #[test]
    fn csp_check_is_exact() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let csp = &conf["app"]["security"]["csp"];
        assert_eq!(csp["img-src"], "'self' data:", "static CSP: no remote image origin");
        assert!(!csp_allows_img(csp, O));
        let with = serde_json::json!({"img-src": format!("'self' data: {O}")});
        assert!(csp_allows_img(&with, O));
        assert!(!csp_allows_img(&with, "http://127.0.0.1:87"));
        assert!(csp_allows_img(&serde_json::json!({"img-src": ["'self'", O]}), O));
    }

    #[test]
    fn mock_urls_validate_against_the_mock_origin() {
        let (mut with, mut rng) = (0, crate::util::Rng::seeded());
        for _ in 0..200 {
            let mint = crate::util::fake_mint(&mut rng);
            if let Some(u) = mock_logo_url(&mint) {
                assert!(hash_from_url(&u, MOCK_ORIGIN, &mint).is_some(), "{u}");
                with += 1;
            }
        }
        assert!(with > 0);
    }
}
