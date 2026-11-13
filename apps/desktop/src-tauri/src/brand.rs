//! Visible brand (Boss decision 2026-10-29: "Centurion Trade"). The name comes from @centurion/i18n
//! `app.name` (0.4.7) at compile time, so UX owns the string; internal crate/package names stay `centurion`.
use std::sync::OnceLock;

/// `app.name` in the UI locale's catalog (en and id are identical for the brand).
pub fn app_name() -> &'static str {
    static NAME: OnceLock<String> = OnceLock::new();
    NAME.get_or_init(|| {
        let en: serde_json::Value =
            serde_json::from_str(include_str!("../../../../packages/i18n/en.json"))
                .unwrap_or_default();
        en["app"]["name"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 64)
            .unwrap_or("Centurion Trade")
            .to_owned()
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn brand_comes_from_i18n_app_name() {
        assert_eq!(super::app_name(), "Centurion Trade");
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["productName"], "Centurion Trade");
        assert_eq!(conf["identifier"], "com.centuriontrade.app");
        assert_eq!(conf["bundle"]["publisher"], "Centurion Trade");
        for key in [
            "shortDescription",
            "longDescription",
            "copyright",
            "publisher",
        ] {
            let text = conf["bundle"][key].as_str().unwrap_or("");
            assert!(!text.contains("Tauri") && !text.contains("tauri"), "{key}");
        }
        for w in conf["app"]["windows"].as_array().unwrap() {
            assert_eq!(w["title"], "Centurion Trade");
        }
    }
}
