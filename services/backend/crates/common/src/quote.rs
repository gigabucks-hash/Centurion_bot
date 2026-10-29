//! Quote asset of a pool / bonding curve.
//!
//! Paper trading (MVP) supports only SOL-quoted pools. A curve whose quote mint is any other token is
//! skipped with [`UNSUPPORTED_QUOTE_MINT`]; prices are **never** converted between quote assets.
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Wrapped SOL mint.
pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
/// Skip / error code (errors.json) for pools quoted in anything but SOL.
pub const UNSUPPORTED_QUOTE_MINT: &str = "UNSUPPORTED_QUOTE_MINT";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum QuoteAsset {
    /// Native SOL / wSOL.
    #[default]
    Sol,
    /// Any other SPL mint (raw 32-byte pubkey).
    Other([u8; 32]),
}

impl QuoteAsset {
    /// From an on-chain pubkey field. The all-zero pubkey (unset) and the wSOL mint mean SOL.
    pub fn from_pubkey_bytes(b: [u8; 32]) -> Self {
        if b == [0u8; 32] || bs58::encode(b).into_string() == WSOL_MINT {
            QuoteAsset::Sol
        } else {
            QuoteAsset::Other(b)
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        let v = bs58::decode(s).into_vec().ok()?;
        let b: [u8; 32] = v.try_into().ok()?;
        Some(Self::from_pubkey_bytes(b))
    }
    pub fn is_sol(&self) -> bool {
        matches!(self, QuoteAsset::Sol)
    }
    /// Base58 mint; SOL is reported as the wSOL mint.
    pub fn mint(&self) -> String {
        match self {
            QuoteAsset::Sol => WSOL_MINT.to_string(),
            QuoteAsset::Other(b) => bs58::encode(b).into_string(),
        }
    }
}

impl Serialize for QuoteAsset {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.mint())
    }
}
impl<'de> Deserialize<'de> for QuoteAsset {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        QuoteAsset::parse(&s).ok_or_else(|| serde::de::Error::custom("invalid quote mint"))
    }
}

/// Whether a quote mint string (wire form) is tradeable in paper mode. `None` = unknown (legacy sources).
pub fn is_sol_quote(quote_mint: Option<&str>) -> bool {
    quote_mint.is_none_or(|m| QuoteAsset::parse(m).is_some_and(|q| q.is_sol()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_and_wsol_are_sol() {
        assert!(QuoteAsset::from_pubkey_bytes([0; 32]).is_sol());
        assert!(QuoteAsset::parse(WSOL_MINT).expect("wsol").is_sol());
        let q = QuoteAsset::parse("pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn").expect("mint");
        assert!(!q.is_sol());
        assert_eq!(q.mint(), "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn");
        assert_eq!(
            serde_json::to_string(&QuoteAsset::Sol).expect("ser"),
            format!("\"{WSOL_MINT}\"")
        );
        assert!(is_sol_quote(None));
        assert!(!is_sol_quote(Some(
            "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn"
        )));
        assert!(!is_sol_quote(Some("not-a-mint")));
    }
}
