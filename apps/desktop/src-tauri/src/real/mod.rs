//! Real mode on this PC. The app asks the owner's wallet to sign. It does not
//! hold, export, or upload a private key, and it does not send SOL anywhere
//! except back to that wallet (a swap or a capped tip aside).

pub(crate) mod b58;
pub(crate) mod b64;
pub(crate) mod chain;
mod limits;
pub mod sign;
pub(crate) mod tx;

pub use limits::{rpc_url_ok, BuyCheck, Knobs, LimitError, RealBook};
pub use tx::{
    expanded_keys, lookup_table_keys, message_bytes, network_fee, vet, ResolvedIx, TxRefuse,
};

/// Public Jupiter swap endpoint. No API key. The owner's RPC is separate and user-supplied.
pub const JUPITER_QUOTE: &str = "https://lite-api.jup.ag/swap/v1/quote";
pub const JUPITER_SWAP: &str = "https://lite-api.jup.ag/swap/v1/swap";
pub const WSOL: &str = "So11111111111111111111111111111111111111112";

pub fn mint_ok(mint: &str) -> bool {
    let n = mint.len();
    (32..=44).contains(&n) && mint.bytes().all(|b| matches!(b, b'1'..=b'9' | b'A'..=b'H' | b'J'..=b'N' | b'P'..=b'Z' | b'a'..=b'k' | b'm'..=b'z'))
}

pub fn quote_url(
    input_mint: &str,
    output_mint: &str,
    amount: u64,
    slippage_bps: u32,
) -> Result<String, ()> {
    if !mint_ok(input_mint) || !mint_ok(output_mint) || slippage_bps > 10_000 || amount == 0 {
        return Err(());
    }
    Ok(format!(
        "{JUPITER_QUOTE}?inputMint={input_mint}&outputMint={output_mint}&amount={amount}&slippageBps={slippage_bps}&restrictIntermediateTokens=true"
    ))
}

/// The quote must be the swap we asked for: same mints, same size, min-out within the slippage.
pub fn quote_matches(
    quote: &serde_json::Value,
    input_mint: &str,
    output_mint: &str,
    amount: u64,
    slippage_bps: u32,
) -> bool {
    let get = |k: &str| quote.get(k).and_then(|v| v.as_str()).unwrap_or("");
    if get("inputMint") != input_mint || get("outputMint") != output_mint {
        return false;
    }
    let in_amount = get("inAmount").parse::<u64>().unwrap_or(0);
    let out_amount = get("outAmount").parse::<u64>().unwrap_or(0);
    let min_out = get("otherAmountThreshold").parse::<u64>().unwrap_or(0);
    if in_amount != amount || out_amount == 0 || min_out > out_amount {
        return false;
    }
    let quoted_slip = quote
        .get("slippageBps")
        .and_then(|v| v.as_u64())
        .unwrap_or(u64::MAX);
    if quoted_slip != u64::from(slippage_bps) {
        return false;
    }
    let floor = out_amount.saturating_mul(10_000 - u64::from(slippage_bps)) / 10_000;
    if min_out < floor {
        return false;
    }
    if let Some(fee) = quote.get("platformFee") {
        if !fee.is_null() {
            let bps = fee.get("feeBps").and_then(|v| v.as_u64()).unwrap_or(1);
            let amt = fee
                .get("amount")
                .and_then(|v| v.as_str())
                .unwrap_or("1")
                .parse::<u64>()
                .unwrap_or(1);
            if bps > 0 || amt > 0 {
                return false;
            }
        }
    }
    let Some(plan) = quote.get("routePlan").and_then(|v| v.as_array()) else {
        return false;
    };
    if plan.is_empty() || plan.len() > 16 {
        return false;
    }
    let mut first_in = String::new();
    let mut last_out = String::new();
    for (i, step) in plan.iter().enumerate() {
        let info = step.get("swapInfo").unwrap_or(step);
        let inn = info.get("inputMint").and_then(|v| v.as_str()).unwrap_or("");
        let out = info
            .get("outputMint")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !mint_ok(inn) || !mint_ok(out) {
            return false;
        }
        if i == 0 {
            first_in = inn.to_owned();
        }
        last_out = out.to_owned();
    }
    first_in == input_mint && last_out == output_mint
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
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            50_000_000,
            300,
        )
        .unwrap();
        assert!(u.starts_with("https://lite-api.jup.ag/swap/v1/quote?"));
        assert!(u.contains("amount=50000000"));
        assert!(u.contains("slippageBps=300"));
        assert!(quote_url("So111&slippageBps=10000", "Mint", 1, 50).is_err());
        let ok = serde_json::json!({
            "inputMint": WSOL,
            "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "inAmount": "50",
            "outAmount": "1000",
            "otherAmountThreshold": "970",
            "slippageBps": 300,
            "platformFee": null,
            "routePlan": [{"swapInfo": {"inputMint": WSOL, "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}}]
        });
        assert!(quote_matches(
            &ok,
            WSOL,
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            50,
            300
        ));
        let low = serde_json::json!({
            "inputMint": WSOL,
            "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "inAmount": "50",
            "outAmount": "1000",
            "otherAmountThreshold": "1",
            "slippageBps": 300,
            "routePlan": [{"swapInfo": {"inputMint": WSOL, "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}}]
        });
        assert!(!quote_matches(
            &low,
            WSOL,
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            50,
            300
        ));
        assert_eq!(
            swap_tx_b64(r#"{"swapTransaction":"AQID"}"#).as_deref(),
            Some("AQID")
        );
        assert!(swap_tx_b64("{}").is_none());
    }
}
