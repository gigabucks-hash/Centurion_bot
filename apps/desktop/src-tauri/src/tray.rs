//! System tray: tooltip = i18n `app.name`; menu Open / Stop… / Quit. "Stop…" only requests the confirmed
//! Stop (`stop::request`), it never pauses directly.
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Runtime};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Buka / Open", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Stop trading…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Keluar / Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &stop, &PredefinedMenuItem::separator(app)?, &quit])?;
    let mut b = TrayIconBuilder::with_id("main").tooltip(crate::brand::app_name()).menu(&menu).show_menu_on_left_click(true);
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    b.on_menu_event(|app, ev| match ev.id().as_ref() {
        "open" => crate::windows::focus_main(app),
        "stop" => crate::stop::request(app, crate::stop::StopSource::Tray),
        "quit" => app.exit(0),
        _ => {}
    })
    .build(app)?;
    Ok(())
}
