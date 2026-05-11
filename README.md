# CollabStream

Collaborative video call with annotations and full OS-level remote control. No accounts. Share a link, explain anything.

---

## How it works

- **Host** starts a tokenized session, shares the link, shares their screen
- **Guest** joins via link — no account needed
- Guest annotates over the shared screen (draws arrows, circles, highlights)
- Host can **hand control** to the guest — guest then drives the host's machine entirely, opening apps, folders, TradingView, anything

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind |
| Signaling | Node.js + Express + ws |
| P2P | Raw WebRTC (RTCPeerConnection) |
| OS control | Tauri 2 + enigo (Rust) |
| Package manager | pnpm workspaces |

---

## Prerequisites

- Node.js 18+
- pnpm (`npm i -g pnpm`)
- Rust + Cargo (for companion app): [rustup.rs](https://rustup.rs)

---

## Quick start (web only)

```bash
# Install dependencies
pnpm install

# Run signaling server + web app in parallel
pnpm dev
```

- Web app: http://localhost:5173
- Signaling server: http://localhost:3001

---

## With companion app (OS-level control)

```bash
# Build and run the companion
cd apps/companion
pnpm tauri dev
```

The companion appears in your system tray. When running, CollabStream's "Hand Control" button becomes active. The companion listens on `ws://localhost:7734` and relays authenticated input events to the OS.

---

## Environment variables

### Web (`apps/web/.env`)

```
VITE_SIGNAL_URL=wss://your-deployed-server.railway.app
VITE_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
VITE_TURN_URLS=turn:turn.cloudflare.com:3478,turns:turn.cloudflare.com:5349
VITE_TURN_USERNAME=YOUR_TURN_USERNAME
VITE_TURN_CREDENTIAL=YOUR_TURN_CREDENTIAL
VITE_SENTRY_DSN=YOUR_SENTRY_DSN
VITE_FEATURE_CHAT=true
VITE_FEATURE_SNAPSHOT=true
VITE_FEATURE_LASER=true
VITE_FEATURE_CONTROL=true
```

Leave unset to default to `ws://localhost:3001/ws` for local dev.

---

## Deployment

### Signaling server → Railway

```bash
cd apps/server
railway init
railway up
```

Railway auto-detects Node.js and provides WSS support.

### Web app → Vercel

```bash
cd apps/web
vercel
```

Set `VITE_SIGNAL_URL` in Vercel's environment variables to your Railway URL.

### Companion → GitHub Releases

```bash
cd apps/companion
pnpm tauri build
```

Upload the generated `.exe` / `.dmg` / `.deb` from `apps/companion/src-tauri/target/release/bundle/` to GitHub Releases. The CompanionStatus component in the web app links directly to the release page.

---

## TURN server (for restricted networks)

Without TURN, some corporate and mobile networks will fail. Set TURN env vars in `apps/web/.env`:

```
VITE_TURN_URLS=turn:turn.cloudflare.com:3478,turns:turn.cloudflare.com:5349
VITE_TURN_USERNAME=YOUR_TURN_USERNAME
VITE_TURN_CREDENTIAL=YOUR_TURN_CREDENTIAL
```

---

## Security & Session Controls

- Sessions use short-lived tokens for join and signaling.
- Host can lock/unlock a session to block new joins.
- Audit log is available to host (download as JSON).

---

## Architecture

```
Guest browser ──── WebRTC P2P ──── Host browser
     │                  │               │
     │          Signaling server         │
     │        (WS offer/answer/ICE)      │
     │                                   │
  Annotates ──── data channel ──── Receives annotations
  Controls  ──── data channel ──── Forwards to companion
                                         │
                                  localhost:7734
                                         │
                              Companion (Tauri + Rust)
                                         │
                                  enigo → OS input
```

### Two data channels

| Channel | Config | Purpose |
|---|---|---|
| `annotation` | reliable + ordered | Draw events — nothing can drop or reorder |
| `control` | unreliable + unordered | Mouse move events — stale moves cause lag |

### Permission model

```
view → annotate → [host grants] → control → [esc or take back] → view
```

Control auto-revokes if: host presses Esc, host clicks "Take Back", host loses window focus, companion disconnects, or P2P drops.

### Security

Control mode uses a per-session `crypto.randomUUID()` token:
1. Generated in the host browser on grant
2. Sent to companion via localhost WS to arm it
3. Sent to guest via the encrypted P2P data channel
4. Attached to every input event relayed from host → companion
5. Companion validates the token on every single input event

A process on the host machine cannot inject input events without the token, which only travels over the encrypted peer connection.

---

## Mobile (planned)

Same signaling server and WebRTC stack. React Native via Expo. Screen share via `react-native-webrtc`. OS control not available on mobile (sandboxed) — the control mode UI is simply hidden. Annotation works identically with touch events.

---

## Project structure

```
collab-stream/
├── apps/
│   ├── web/          # React frontend
│   ├── server/       # Node.js signaling server
│   └── companion/    # Tauri desktop companion
└── package.json      # pnpm workspace root
```
