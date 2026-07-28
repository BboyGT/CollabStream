# Companion (Desktop)

## Scope controls
- Pause/Resume input from the tray menu.
- Toggle mouse-only or keyboard-only input from the tray menu.
- Global hotkey: `CmdOrCtrl+Shift+P` toggles pause.

## Security: allowed origins
The companion runs a local WebSocket relay on `ws://127.0.0.1:7734` that the web app's
host tab connects to in order to arm and forward remote-control input. That relay only
accepts connections whose `Origin` header is on an allowlist — by default just the local
dev server (`http://localhost:5173` / `http://127.0.0.1:5173`).

**If you deploy the web app anywhere else** (a LAN IP, an ngrok tunnel, a production
domain), set `COLLABSTREAM_ALLOWED_ORIGINS` in the companion's environment to a
comma-separated list of the exact origin(s) the web app is served from, e.g.:
```
COLLABSTREAM_ALLOWED_ORIGINS=https://collabstream.example.com,http://192.168.1.42:5173
```
Without this, the web app's remote-control feature will silently fail to connect to the
companion from any origin other than the local dev server — this is intentional, not a bug.

Note this Origin check stops a malicious webpage from hijacking the relay (browsers can't
forge their own Origin header), but it does not by itself stop a different local process
on the same machine from doing so, since only a browser is bound by Origin-header honesty.

## Auto-update & signing
- Update endpoints are configured in `src-tauri/tauri.conf.json` under `updater`.
- Provide signing certificates per platform before release builds.
