use serde::{Deserialize, Serialize};
use std::fmt;

/// A value that came from an untrusted source (token metadata, social text, ...).
///
/// It deliberately does **not** implement `Deref` or `Display` of the raw value, so it
/// cannot be accidentally interpolated into a prompt, log template or SQL string.
/// Use [`Untrusted::sanitized`] for display or [`Untrusted::expose`] when you must.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(transparent)]
pub struct Untrusted<T>(T);

impl<T> Untrusted<T> {
    pub fn new(v: T) -> Self {
        Self(v)
    }
    /// Explicit, greppable escape hatch.
    pub fn expose(&self) -> &T {
        &self.0
    }
}

impl Untrusted<String> {
    /// Printable, length-capped version: control chars stripped, max 64 chars.
    pub fn sanitized(&self) -> String {
        self.0
            .chars()
            .filter(|c| !c.is_control())
            .take(64)
            .collect()
    }
}

impl<T> fmt::Debug for Untrusted<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Untrusted(..)")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_control_chars_and_caps_length() {
        let u = Untrusted::new(format!("evil\n\u{7}name{}", "x".repeat(200)));
        let s = u.sanitized();
        assert!(!s.contains('\n'));
        assert_eq!(s.chars().count(), 64);
        assert_eq!(format!("{u:?}"), "Untrusted(..)");
    }
}
