// input.rs — translates incoming JSON input events into real OS input via enigo
use enigo::{
    Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings,
};
use serde::Deserialize;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use crate::auth;

static ENIGO: Lazy<Mutex<Enigo>> = Lazy::new(|| {
    Mutex::new(Enigo::new(&Settings::default()).expect("Failed to init enigo"))
});

#[derive(Deserialize, Debug)]
pub struct InputEvent {
    pub event: String,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub button: Option<u8>,
    pub dx: Option<i32>,
    pub dy: Option<i32>,
    pub key: Option<String>,
    pub code: Option<String>,
}

pub fn dispatch(evt: InputEvent) {
    let mut enigo = match ENIGO.lock() {
        Ok(e) => e,
        Err(_) => return,
    };

    match evt.event.as_str() {
        "mousemove" => {
            if !auth::allow_mouse() { return; }
            if let (Some(x), Some(y)) = (evt.x, evt.y) {
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
            }
        }

        "mousedown" => {
            if !auth::allow_mouse() { return; }
            if let (Some(x), Some(y)) = (evt.x, evt.y) {
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
            }
            let btn = map_button(evt.button.unwrap_or(0));
            let _ = enigo.button(btn, Direction::Press);
        }

        "mouseup" => {
            if !auth::allow_mouse() { return; }
            let btn = map_button(evt.button.unwrap_or(0));
            let _ = enigo.button(btn, Direction::Release);
        }

        "scroll" => {
            if !auth::allow_mouse() { return; }
            if let Some(dy) = evt.dy {
                let clicks = (dy / 60).max(-5).min(5);
                if clicks != 0 {
                    let _ = enigo.scroll(clicks, enigo::Axis::Vertical);
                }
            }
            if let Some(dx) = evt.dx {
                let clicks = (dx / 60).max(-5).min(5);
                if clicks != 0 {
                    let _ = enigo.scroll(clicks, enigo::Axis::Horizontal);
                }
            }
        }

        "keydown" => {
            if !auth::allow_keyboard() { return; }
            if let Some(key_str) = &evt.key {
                if let Some(key) = map_key(key_str) {
                    let _ = enigo.key(key, Direction::Press);
                }
            }
        }

        "keyup" => {
            if !auth::allow_keyboard() { return; }
            if let Some(key_str) = &evt.key {
                if let Some(key) = map_key(key_str) {
                    let _ = enigo.key(key, Direction::Release);
                }
            }
        }

        other => {
            println!("[input] Unknown event: {}", other);
        }
    }
}

fn map_button(b: u8) -> Button {
    match b {
        0 => Button::Left,
        1 => Button::Middle,
        2 => Button::Right,
        _ => Button::Left,
    }
}

fn map_key(key: &str) -> Option<Key> {
    match key {
        "Enter" => Some(Key::Return),
        "Escape" => Some(Key::Escape),
        "Backspace" => Some(Key::Backspace),
        "Delete" => Some(Key::Delete),
        "Tab" => Some(Key::Tab),
        "ArrowLeft" => Some(Key::LeftArrow),
        "ArrowRight" => Some(Key::RightArrow),
        "ArrowUp" => Some(Key::UpArrow),
        "ArrowDown" => Some(Key::DownArrow),
        "Home" => Some(Key::Home),
        "End" => Some(Key::End),
        "PageUp" => Some(Key::PageUp),
        "PageDown" => Some(Key::PageDown),
        "Control" => Some(Key::Control),
        "Alt" => Some(Key::Alt),
        "Shift" => Some(Key::Shift),
        "Meta" | "Command" => Some(Key::Meta),
        "CapsLock" => Some(Key::CapsLock),
        "F1" => Some(Key::F1),
        "F2" => Some(Key::F2),
        "F3" => Some(Key::F3),
        "F4" => Some(Key::F4),
        "F5" => Some(Key::F5),
        "F6" => Some(Key::F6),
        "F7" => Some(Key::F7),
        "F8" => Some(Key::F8),
        "F9" => Some(Key::F9),
        "F10" => Some(Key::F10),
        "F11" => Some(Key::F11),
        "F12" => Some(Key::F12),
        k if k.chars().count() == 1 => {
            let c = k.chars().next().unwrap();
            Some(Key::Unicode(c))
        }
        _ => None,
    }
}
