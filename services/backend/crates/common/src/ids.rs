use serde::{Deserialize, Serialize};
use std::fmt;

/// Base58 SPL mint address: must decode to exactly 32 bytes (no curve check).
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Mint(String);

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
#[error("invalid mint address: {0}")]
pub struct InvalidMint(pub String);

impl Mint {
    pub fn parse(s: &str) -> Result<Self, InvalidMint> {
        let ok =
            (32..=44).contains(&s.len()) && bs58::decode(s).into_vec().is_ok_and(|b| b.len() == 32);
        if ok {
            Ok(Self(s.to_owned()))
        } else {
            Err(InvalidMint(s.chars().take(60).collect()))
        }
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
impl TryFrom<String> for Mint {
    type Error = InvalidMint;
    fn try_from(s: String) -> Result<Self, Self::Error> {
        Mint::parse(&s)
    }
}
impl From<Mint> for String {
    fn from(m: Mint) -> String {
        m.0
    }
}
impl fmt::Display for Mint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// Coin key: one coin within one strategy ("pick"). Opaque, URL-safe.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CoinKey(pub String);

impl CoinKey {
    /// Deterministic key from strategy id + mint, so re-ingesting is idempotent.
    pub fn derive(strategy_id: &str, mint: &Mint) -> Self {
        // FNV-1a 64-bit, base36. Not cryptographic; only needs to be stable + short.
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        for b in strategy_id
            .bytes()
            .chain([b'|'])
            .chain(mint.as_str().bytes())
        {
            h ^= u64::from(b);
            h = h.wrapping_mul(0x0100_0000_01b3);
        }
        Self(to_base36(h))
    }
}

fn to_base36(mut n: u64) -> String {
    const D: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut out = Vec::new();
    loop {
        out.push(D[(n % 36) as usize]);
        n /= 36;
        if n == 0 {
            break;
        }
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_default()
}

impl fmt::Display for CoinKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// `<ck>.<n>` — the n-th (0-based) position opened for a pick.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PositionKey(pub String);

impl PositionKey {
    pub fn new(ck: &CoinKey, n: u32) -> Self {
        Self(format!("{ck}.{n}"))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn mint_must_decode_to_32_bytes() {
        assert!(Mint::parse("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").is_ok());
        assert!(Mint::parse("So11111111111111111111111111111111111111112").is_ok());
        // 44 valid base58 chars but 33 bytes: not a Solana pubkey
        assert!(Mint::parse("MASi45ub7Qe4ZE36UT5G6cU4ud8Fhhe4deS4F3cw9KTA").is_err());
        assert!(Mint::parse("0OIl").is_err());
    }

    use super::*;

    const M: &str = "So11111111111111111111111111111111111111112";

    #[test]
    fn mint_validation() {
        assert!(Mint::parse(M).is_ok());
        assert!(Mint::parse("short").is_err());
        assert!(Mint::parse(&M.replace('1', "0")).is_err()); // '0' not base58
    }

    #[test]
    fn coin_key_is_deterministic_and_distinct() {
        let m = Mint::parse(M).expect("mint");
        assert_eq!(CoinKey::derive("s1", &m), CoinKey::derive("s1", &m));
        assert_ne!(CoinKey::derive("s1", &m), CoinKey::derive("s2", &m));
    }

    #[test]
    fn ids_format() {
        let ck = CoinKey("abc".into());
        assert_eq!(PositionKey::new(&ck, 2).0, "abc.2");
    }
}
