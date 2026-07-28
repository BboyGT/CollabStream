// relay.rs — local WebSocket server on ws://localhost:7734
// The web app connects here to forward guest input events to the OS
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::Value;
use std::net::SocketAddr;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::accept_hdr_async;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::Message;

use crate::auth;
use crate::input::{dispatch, InputEvent};

const ADDR: &str = "127.0.0.1:7734";

#[derive(Deserialize, Debug)]
struct RelayMessage {
    #[serde(rename = "type")]
    kind: String,
    token: Option<String>,
    event: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
    button: Option<u8>,
    dx: Option<i32>,
    dy: Option<i32>,
    key: Option<String>,
    code: Option<String>,
    mouse: Option<bool>,
    keyboard: Option<bool>,
}

// SECURITY (see AUDIT.md): origins allowed to open a WebSocket connection to
// this local relay, read once per handshake from COLLABSTREAM_ALLOWED_ORIGINS
// (comma-separated). Without this check, ANY webpage open in ANY browser on
// this machine could connect to ws://127.0.0.1:7734 and arm + drive OS-level
// mouse/keyboard input — the relay previously had no access control beyond a
// token that the connecting client itself supplies and therefore fully
// controls. Origin headers are set by the browser and cannot be forged by
// page JavaScript, so checking Origin specifically closes the "malicious
// webpage" attack vector, which is the most realistic one here.
//
// This does NOT protect against a different local process (not a browser)
// deliberately forging an Origin header — a raw TCP client can set any
// Origin it wants. Fully closing that would need a paired shared secret
// (e.g. a pairing code shown once in the companion UI and entered into the
// web app), which is tracked as follow-up work and not implemented here.
// Defaults cover the local dev server only; deployments served from another
// origin (LAN IP, ngrok, production domain) MUST set this env var or the
// web app's browser tab will be refused a connection to the companion.
fn allowed_origins() -> Vec<String> {
    match std::env::var("COLLABSTREAM_ALLOWED_ORIGINS") {
        Ok(val) if !val.trim().is_empty() => val
            .split(',')
            .map(|s| s.trim().trim_end_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        _ => vec![
            "http://localhost:5173".to_string(),
            "http://127.0.0.1:5173".to_string(),
        ],
    }
}

fn reject(status: StatusCode, message: &str) -> ErrorResponse {
    Response::builder()
        .status(status)
        .body(Some(message.to_string()))
        .unwrap()
}

/// Handshake callback: rejects the connection unless the Origin header is on
/// the allowlist. See the security note on `allowed_origins` above.
fn check_origin(req: &Request, response: Response) -> Result<Response, ErrorResponse> {
    let origin = req
        .headers()
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim_end_matches('/').to_string());

    let allowed = allowed_origins();

    match origin {
        Some(ref o) if allowed.iter().any(|a| a == o) => Ok(response),
        Some(o) => {
            eprintln!("[relay] Rejected connection — origin '{}' not in allowlist {:?}", o, allowed);
            Err(reject(StatusCode::FORBIDDEN, "origin not allowed"))
        }
        None => {
            eprintln!("[relay] Rejected connection — no Origin header present");
            Err(reject(StatusCode::FORBIDDEN, "origin header required"))
        }
    }
}

pub async fn start() {
    let listener = TcpListener::bind(ADDR)
        .await
        .expect("Failed to bind relay WS on :7734");

    println!("[relay] Listening on ws://{}", ADDR);
    println!("[relay] Allowed origins: {:?}", allowed_origins());

    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                tokio::spawn(handle_connection(stream, addr));
            }
            Err(e) => {
                eprintln!("[relay] Accept error: {}", e);
            }
        }
    }
}

async fn handle_connection(stream: TcpStream, addr: SocketAddr) {
    println!("[relay] Connection from {}", addr);

    let ws = match accept_hdr_async(stream, check_origin).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("[relay] WS handshake rejected for {}: {}", addr, e);
            return;
        }
    };

    let (mut write, mut read) = ws.split();

    let _ = write
        .send(Message::Text(r#"{"type":"connected"}"#.to_string()))
        .await;

    while let Some(msg) = read.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(_) => break,
        };

        let text = match msg {
            Message::Text(t) => t,
            Message::Ping(p) => {
                let _ = write.send(Message::Pong(p)).await;
                continue;
            }
            Message::Close(_) => break,
            _ => continue,
        };

        let parsed: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let kind = match parsed.get("type").and_then(|v| v.as_str()) {
            Some(k) => k.to_string(),
            None => continue,
        };

        match kind.as_str() {
            "arm" => {
                let token = match parsed.get("token").and_then(|v| v.as_str()) {
                    Some(t) => t,
                    None => {
                        // Missing token field entirely — reject
                        let _ = write
                            .send(Message::Text(r#"{"type":"error","message":"arm requires a token"}"#.to_string()))
                            .await;
                        continue;
                    }
                };

                // SECURITY: reject empty or whitespace-only tokens.
                // An empty token would allow any {"type":"input","token":""} to pass validation.
                let token = token.trim();
                if token.is_empty() {
                    eprintln!("[relay] arm rejected — empty token is not allowed");
                    let _ = write
                        .send(Message::Text(r#"{"type":"error","message":"empty token rejected"}"#.to_string()))
                        .await;
                    continue;
                }

                auth::arm(token.to_string());
                let _ = write
                    .send(Message::Text(r#"{"type":"armed"}"#.to_string()))
                    .await;
            }

            "disarm" => {
                auth::disarm();
                let _ = write
                    .send(Message::Text(r#"{"type":"disarmed"}"#.to_string()))
                    .await;
            }

            "pause" => {
                auth::pause();
                let _ = write
                    .send(Message::Text(r#"{"type":"paused"}"#.to_string()))
                    .await;
            }

            "resume" => {
                auth::resume();
                let _ = write
                    .send(Message::Text(r#"{"type":"resumed"}"#.to_string()))
                    .await;
            }

            "config" => {
                let mouse = parsed.get("mouse").and_then(|v| v.as_bool()).unwrap_or(true);
                let keyboard = parsed.get("keyboard").and_then(|v| v.as_bool()).unwrap_or(true);
                auth::set_scopes(mouse, keyboard);
                let _ = write
                    .send(Message::Text(r#"{"type":"config-ok"}"#.to_string()))
                    .await;
            }

            // "status" — companion frontend polls this to render live state
            "status" => {
                let (armed, paused, mouse, keyboard) = auth::get_status();
                let payload = format!(
                    r#"{{"type":"status","armed":{},"paused":{},"mouse":{},"keyboard":{}}}"#,
                    armed, paused, mouse, keyboard
                );
                let _ = write.send(Message::Text(payload)).await;
            }

            "input" => {
                let token = match parsed.get("token").and_then(|v| v.as_str()) {
                    Some(t) => t,
                    None => {
                        eprintln!("[relay] input rejected — missing token field");
                        continue;
                    }
                };

                // SECURITY: validate token on EVERY input event; also reject empty token
                // so a malformed {"type":"input","token":""} cannot bypass a blank-armed relay.
                let token = token.trim();
                if token.is_empty() || !auth::validate(token) || auth::is_paused() {
                    eprintln!("[relay] Input rejected — invalid/empty token or relay paused");
                    continue;
                }

                let evt: InputEvent = match serde_json::from_value(parsed) {
                    Ok(e) => e,
                    Err(e) => {
                        eprintln!("[relay] Bad input event: {}", e);
                        continue;
                    }
                };

                tokio::task::spawn_blocking(move || dispatch(evt));
            }

            other => {
                println!("[relay] Unknown message type: {}", other);
            }
        }
    }

    println!("[relay] Connection closed: {}", addr);
}
