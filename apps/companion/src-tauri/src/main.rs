// main.rs — CollabStream Companion entry point
// Spawns the relay WS server and sets up a system tray icon
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod input;
mod relay;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

#[tokio::main]
async fn main() {
    // Spawn relay server in background
    tokio::spawn(relay::start());

    tauri::Builder::default()
        .setup(|app| {
            let pause_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyP);
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |_app, shortcut, event| {
                        if shortcut == &pause_shortcut && event.state() == ShortcutState::Pressed {
                            auth::toggle_pause();
                        }
                    })
                    .build(),
            )?;
            app.global_shortcut().register(pause_shortcut)?;

            // Build tray icon + menu
            let quit = MenuItem::with_id(app, "quit", "Quit CollabStream Companion", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Status", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "Pause Input", true, None::<&str>)?;
            let resume = MenuItem::with_id(app, "resume", "Resume Input", true, None::<&str>)?;
            let mouse_only = MenuItem::with_id(app, "mouse_only", "Mouse Only", true, None::<&str>)?;
            let keyboard_only = MenuItem::with_id(app, "keyboard_only", "Keyboard Only", true, None::<&str>)?;
            let both = MenuItem::with_id(app, "both", "Mouse + Keyboard", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &pause, &resume, &mouse_only, &keyboard_only, &both, &quit])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        println!("[companion] Quitting");
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "pause" => {
                        auth::pause();
                    }
                    "resume" => {
                        auth::resume();
                    }
                    "mouse_only" => {
                        auth::set_scopes(true, false);
                    }
                    "keyboard_only" => {
                        auth::set_scopes(false, true);
                    }
                    "both" => {
                        auth::set_scopes(true, true);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        println!("[companion] Tray clicked");
                    }
                })
                .build(app)?;

            println!("[companion] CollabStream Companion started — relay on ws://localhost:7734");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running CollabStream Companion");
}
