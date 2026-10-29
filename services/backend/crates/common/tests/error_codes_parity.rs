//! The Rust enum must match packages/contracts/errors.json exactly (CI guard against drift).
use common::ErrorCode;

#[test]
fn rust_enum_matches_contracts_json() {
    let raw = include_str!("../../../../../packages/contracts/errors.json");
    let v: serde_json::Value = serde_json::from_str(raw).expect("parity");
    let codes = v["codes"].as_array().expect("parity");
    assert_eq!(
        codes.len(),
        ErrorCode::ALL.len(),
        "regenerate with node packages/contracts/scripts/gen-errors.mjs"
    );
    for (json, rust) in codes.iter().zip(ErrorCode::ALL) {
        assert_eq!(json["code"].as_str().expect("parity"), rust.as_str());
        assert_eq!(
            json["http"].as_u64().expect("parity") as u16,
            rust.http_status()
        );
        assert_eq!(
            json["retryable"].as_bool().expect("parity"),
            rust.retryable()
        );
        let ser = serde_json::to_value(rust).expect("parity");
        assert_eq!(ser, json["code"]);
    }
}
