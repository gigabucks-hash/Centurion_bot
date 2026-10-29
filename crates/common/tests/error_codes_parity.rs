//! The Rust enum must match packages/contracts/errors.json exactly (CI guard against drift).
use common::ErrorCode;

#[test]
fn rust_enum_matches_contracts_json() {
    let raw = include_str!("../../../packages/contracts/errors.json");
    let v: serde_json::Value = serde_json::from_str(raw).unwrap();
    let codes = v["codes"].as_array().unwrap();
    assert_eq!(codes.len(), ErrorCode::ALL.len(), "regenerate with node packages/contracts/scripts/gen-errors.mjs");
    for (json, rust) in codes.iter().zip(ErrorCode::ALL) {
        assert_eq!(json["code"].as_str().unwrap(), rust.as_str());
        assert_eq!(json["http"].as_u64().unwrap() as u16, rust.http_status());
        assert_eq!(json["retryable"].as_bool().unwrap(), rust.retryable());
        let ser = serde_json::to_value(rust).unwrap();
        assert_eq!(ser, json["code"]);
    }
}
