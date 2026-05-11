// auth.rs — holds the armed token for the current session
use once_cell::sync::Mutex;

static ARMED_TOKEN: Mutex<Option<String>> = Mutex::const_new(None);
static PAUSED: Mutex<bool> = Mutex::const_new(false);
static ALLOW_MOUSE: Mutex<bool> = Mutex::const_new(true);
static ALLOW_KEYBOARD: Mutex<bool> = Mutex::const_new(true);

/// Arm with a new session token. Companion will only process input after this.
pub fn arm(token: String) {
    let mut t = ARMED_TOKEN.lock().unwrap();
    *t = Some(token);
    println!("[auth] Armed with token");
}

/// Disarm — stop accepting input events.
pub fn disarm() {
    let mut t = ARMED_TOKEN.lock().unwrap();
    *t = None;
    println!("[auth] Disarmed");
}

/// Returns true if the provided token matches the armed token.
pub fn validate(token: &str) -> bool {
    let t = ARMED_TOKEN.lock().unwrap();
    t.as_deref() == Some(token)
}

pub fn pause() {
    let mut p = PAUSED.lock().unwrap();
    *p = true;
    println!("[auth] Paused input");
}

pub fn resume() {
    let mut p = PAUSED.lock().unwrap();
    *p = false;
    println!("[auth] Resumed input");
}

pub fn is_paused() -> bool {
    *PAUSED.lock().unwrap()
}

pub fn set_scopes(mouse: bool, keyboard: bool) {
    *ALLOW_MOUSE.lock().unwrap() = mouse;
    *ALLOW_KEYBOARD.lock().unwrap() = keyboard;
    println!("[auth] Scopes updated mouse={} keyboard={}", mouse, keyboard);
}

pub fn allow_mouse() -> bool {
    *ALLOW_MOUSE.lock().unwrap()
}

pub fn allow_keyboard() -> bool {
    *ALLOW_KEYBOARD.lock().unwrap()
}

pub fn toggle_pause() {
    let mut p = PAUSED.lock().unwrap();
    *p = !*p;
    println!("[auth] Pause toggled to {}", *p);
}

/// Returns (armed, paused, allow_mouse, allow_keyboard) for status queries.
pub fn get_status() -> (bool, bool, bool, bool) {
    let armed = ARMED_TOKEN.lock().unwrap().is_some();
    let paused = *PAUSED.lock().unwrap();
    let mouse = *ALLOW_MOUSE.lock().unwrap();
    let keyboard = *ALLOW_KEYBOARD.lock().unwrap();
    (armed, paused, mouse, keyboard)
}
