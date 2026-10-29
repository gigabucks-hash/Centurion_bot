//! Wire units. **No floats cross the API boundary.**
//!
//! * SOL amounts → [`Lamports`], serialized as a decimal *string* of an integer
//!   (`"250000000"` = 0.25 SOL) so JS clients never lose precision past 2^53.
//! * Token amounts → [`RawAmount`], integer base units as a string.
//! * Prices / ratios / percentages → [`Dec`], a validated decimal string
//!   (`"0.000000123"`, `"-12.5"`). Engines compute in f64 internally and convert at
//!   the edge with a fixed number of significant digits.
use serde::{Deserialize, Serialize};
use std::fmt;

use crate::LAMPORTS_PER_SOL;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum UnitError {
    #[error("not an unsigned integer string: {0}")]
    BadInteger(String),
    #[error("not a decimal string: {0}")]
    BadDecimal(String),
    #[error("value not finite or out of range")]
    OutOfRange,
}

/// Integer lamports, serialized as a string.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[serde(try_from = "String", into = "String")]
pub struct Lamports(pub u64);

impl Lamports {
    /// Round-half-even-free conversion: rounds to nearest lamport, rejects negatives/NaN.
    pub fn from_sol_f64(sol: f64) -> Result<Self, UnitError> {
        if !sol.is_finite() || sol < 0.0 || sol > (u64::MAX / LAMPORTS_PER_SOL) as f64 {
            return Err(UnitError::OutOfRange);
        }
        Ok(Self((sol * LAMPORTS_PER_SOL as f64).round() as u64))
    }
    pub fn as_sol_f64(self) -> f64 {
        self.0 as f64 / LAMPORTS_PER_SOL as f64
    }
}
impl TryFrom<String> for Lamports {
    type Error = UnitError;
    fn try_from(s: String) -> Result<Self, UnitError> {
        if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
            return Err(UnitError::BadInteger(s));
        }
        s.parse::<u64>()
            .map(Lamports)
            .map_err(|_| UnitError::BadInteger(s))
    }
}
impl From<Lamports> for String {
    fn from(l: Lamports) -> String {
        l.0.to_string()
    }
}

/// Signed lamports (PnL), serialized as a string, e.g. `"-12500000"`.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[serde(try_from = "String", into = "String")]
pub struct SignedLamports(pub i64);

impl SignedLamports {
    pub fn from_sol_f64(sol: f64) -> Result<Self, UnitError> {
        if !sol.is_finite() || sol.abs() > (i64::MAX / LAMPORTS_PER_SOL as i64) as f64 {
            return Err(UnitError::OutOfRange);
        }
        Ok(Self((sol * LAMPORTS_PER_SOL as f64).round() as i64))
    }
}
impl TryFrom<String> for SignedLamports {
    type Error = UnitError;
    fn try_from(s: String) -> Result<Self, UnitError> {
        s.parse::<i64>()
            .map(SignedLamports)
            .map_err(|_| UnitError::BadInteger(s))
    }
}
impl From<SignedLamports> for String {
    fn from(l: SignedLamports) -> String {
        l.0.to_string()
    }
}

/// Raw token amount in base units (`amount * 10^decimals`), serialized as a string.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
#[serde(try_from = "String", into = "String")]
pub struct RawAmount(pub u128);

impl RawAmount {
    pub fn from_ui_f64(ui: f64, decimals: u8) -> Result<Self, UnitError> {
        let v = ui * 10f64.powi(i32::from(decimals));
        if !v.is_finite() || v < 0.0 || v > u128::MAX as f64 {
            return Err(UnitError::OutOfRange);
        }
        Ok(Self(v.round() as u128))
    }
}
impl TryFrom<String> for RawAmount {
    type Error = UnitError;
    fn try_from(s: String) -> Result<Self, UnitError> {
        if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
            return Err(UnitError::BadInteger(s));
        }
        s.parse::<u128>()
            .map(RawAmount)
            .map_err(|_| UnitError::BadInteger(s))
    }
}
impl From<RawAmount> for String {
    fn from(a: RawAmount) -> String {
        a.0.to_string()
    }
}

/// Decimal string for prices, percentages and ratios. Never exponent notation.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Dec(String);

impl Dec {
    /// Format with `sig` significant digits (max 17), trimming trailing zeros.
    pub fn from_f64(x: f64, sig: u32) -> Result<Self, UnitError> {
        if !x.is_finite() {
            return Err(UnitError::OutOfRange);
        }
        if x == 0.0 {
            return Ok(Dec("0".into()));
        }
        let sig = sig.clamp(1, 17) as i32;
        let mag = x.abs().log10().floor() as i32;
        let decimals = (sig - 1 - mag).clamp(0, 30) as usize;
        let mut s = format!("{x:.decimals$}");
        if s.contains('.') {
            while s.ends_with('0') {
                s.pop();
            }
            if s.ends_with('.') {
                s.pop();
            }
        }
        if s == "-0" {
            s = "0".into();
        }
        Ok(Dec(s))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    pub fn to_f64(&self) -> f64 {
        self.0.parse().unwrap_or(f64::NAN)
    }
}
impl TryFrom<String> for Dec {
    type Error = UnitError;
    fn try_from(s: String) -> Result<Self, UnitError> {
        let body = s.strip_prefix('-').unwrap_or(&s);
        let mut parts = body.splitn(2, '.');
        let int = parts.next().unwrap_or("");
        let frac = parts.next();
        let ok = !int.is_empty()
            && int.bytes().all(|b| b.is_ascii_digit())
            && frac.is_none_or(|f| !f.is_empty() && f.bytes().all(|b| b.is_ascii_digit()));
        if ok {
            Ok(Dec(s))
        } else {
            Err(UnitError::BadDecimal(s))
        }
    }
}
impl From<Dec> for String {
    fn from(d: Dec) -> String {
        d.0
    }
}
impl fmt::Display for Dec {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lamports_serialize_as_strings() {
        let l = Lamports::from_sol_f64(0.25).expect("lamports");
        assert_eq!(l, Lamports(250_000_000));
        assert_eq!(serde_json::to_string(&l).expect("ser"), "\"250000000\"");
        let back: Lamports = serde_json::from_str("\"250000000\"").expect("de");
        assert_eq!(back, l);
        assert!(
            serde_json::from_str::<Lamports>("250000000").is_err(),
            "bare numbers rejected"
        );
        assert!(serde_json::from_str::<Lamports>("\"-1\"").is_err());
        assert!(Lamports::from_sol_f64(-1.0).is_err());
        let p = SignedLamports::from_sol_f64(-0.0125).expect("pnl");
        assert_eq!(serde_json::to_string(&p).expect("ser"), "\"-12500000\"");
    }

    #[test]
    fn big_values_survive() {
        let raw: RawAmount =
            serde_json::from_str("\"340282366920938463463374607431768211455\"").expect("u128");
        assert_eq!(raw.0, u128::MAX);
        assert_eq!(
            RawAmount::from_ui_f64(1.5, 6).expect("raw"),
            RawAmount(1_500_000)
        );
    }

    #[test]
    fn decimal_strings() {
        assert_eq!(
            Dec::from_f64(0.000_000_123_456_789, 6).expect("d").as_str(),
            "0.000000123457"
        );
        assert_eq!(Dec::from_f64(1234.5, 8).expect("d").as_str(), "1234.5");
        assert_eq!(Dec::from_f64(-12.0, 6).expect("d").as_str(), "-12");
        assert_eq!(Dec::from_f64(0.0, 6).expect("d").as_str(), "0");
        assert!(Dec::from_f64(f64::NAN, 6).is_err());
        assert!(serde_json::from_str::<Dec>("\"1e-9\"").is_err());
        assert!(serde_json::from_str::<Dec>("\"1.\"").is_err());
        assert!(serde_json::from_str::<Dec>("\"-0.5\"").is_ok());
    }
}

/// `#[serde(with = "common::units::f64_dec")]`: engines compute in f64 internally, but the value
/// crosses the wire as a decimal string (12 significant digits). Accepts strings only on input.
pub mod f64_dec {
    use super::Dec;
    use serde::{de, Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(x: &f64, s: S) -> Result<S::Ok, S::Error> {
        let d = Dec::from_f64(*x, 12).map_err(serde::ser::Error::custom)?;
        s.serialize_str(d.as_str())
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
        let s = String::deserialize(d)?;
        Dec::try_from(s).map(|v| v.to_f64()).map_err(de::Error::custom)
    }
}

/// Optional variant of [`f64_dec`]; `None` stays JSON `null`.
pub mod opt_f64_dec {
    use super::Dec;
    use serde::{de, Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(x: &Option<f64>, s: S) -> Result<S::Ok, S::Error> {
        match x {
            Some(v) => {
                let d = Dec::from_f64(*v, 12).map_err(serde::ser::Error::custom)?;
                s.serialize_some(d.as_str())
            }
            None => s.serialize_none(),
        }
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<f64>, D::Error> {
        Option::<String>::deserialize(d)?
            .map(|s| Dec::try_from(s).map(|v| v.to_f64()).map_err(de::Error::custom))
            .transpose()
    }
}

/// Test helper: assert a JSON value contains no floating point numbers.
pub fn assert_no_floats(v: &serde_json::Value) {
    match v {
        serde_json::Value::Number(n) => assert!(!n.is_f64(), "float on the wire: {n}"),
        serde_json::Value::Array(a) => a.iter().for_each(assert_no_floats),
        serde_json::Value::Object(o) => o.values().for_each(assert_no_floats),
        _ => {}
    }
}
