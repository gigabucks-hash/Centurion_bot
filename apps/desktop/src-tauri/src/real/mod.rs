//! Real mode on this PC. The app asks the owner's wallet to sign. It does not
//! hold, export, or upload a private key, and it does not send SOL anywhere
//! except back to that wallet (a swap or a capped tip aside).

pub(crate) mod b58;
pub(crate) mod b64;
mod limits;
pub mod sign;
pub(crate) mod tx;

pub use limits::{
    enable_message, limits_message, rpc_url_ok, BuyCheck, Knobs, LimitError, RealBook,
};
pub use tx::{vet, TxRefuse};

/// Public Jupiter swap endpoint. No API key. The owner's RPC is separate and user-supplied.
pub const JUPITER_QUOTE: &str = "https://lite-api.jup.ag/swap/v1/quote";
pub const JUPITER_SWAP: &str = "https://lite-api.jup.ag/swap/v1/swap";

pub fn quote_url(input_mint: &str, output_mint: &str, amount: u64, slippage_bps: u32) -> String {
    format!(
        "{JUPITER_QUOTE}?inputMint={input_mint}&outputMint={output_mint}&amount={amount}&slippageBps={slippage_bps}&restrictIntermediateTokens=true"
    )
}

/// Pull the unsigned transaction out of a Jupiter swap response. Empty means the response is unusable.
pub fn swap_tx_b64(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    let s = v.get("swapTransaction")?.as_str()?.trim();
    if s.is_empty() {
        None
    } else {
        Some(s.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jupiter_quote_stays_on_the_public_endpoint() {
        let u = quote_url(
            "So11111111111111111111111111111111111111112",
            "Mint",
            50_000_000,
            300,
        );
        assert!(u.starts_with("https://lite-api.jup.ag/swap/v1/quote?"));
        assert!(u.contains("amount=50000000"));
        assert!(u.contains("slippageBps=300"));
        assert_eq!(
            swap_tx_b64(r#"{"swapTransaction":"AQID"}"#).as_deref(),
            Some("AQID")
        );
        assert!(swap_tx_b64("{}").is_none());
    }
}
