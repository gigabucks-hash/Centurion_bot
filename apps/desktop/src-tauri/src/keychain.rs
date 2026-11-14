//! OS keychain wrapper (Windows Credential Manager, Linux Secret Service).
//! macOS Keychain is not a supported target.
//! Stores ONLY the backend session/refresh token. Wallet private keys never exist on the
//! desktop: signing happens server-side (custody/MPC) per the blueprint security model.
//! Compiled only with `--features keychain` in the prototype.

#[cfg(feature = "keychain")]
#[allow(dead_code)] // wired up in Week 2 (backend auth)
mod imp {
    const SERVICE: &str = "com.centuriontrade.app"; // = bundle identifier (rebrand 2026-10-29)

    pub fn set_token(account: &str, token: &str) -> Result<(), String> {
        keyring::Entry::new(SERVICE, account)
            .and_then(|e| e.set_password(token))
            .map_err(|e| e.to_string())
    }

    pub fn get_token(account: &str) -> Result<Option<String>, String> {
        match keyring::Entry::new(SERVICE, account).and_then(|e| e.get_password()) {
            Ok(t) => Ok(Some(t)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn delete_token(account: &str) -> Result<(), String> {
        match keyring::Entry::new(SERVICE, account).and_then(|e| e.delete_credential()) {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(feature = "keychain")]
#[allow(unused_imports)]
pub use imp::*;
