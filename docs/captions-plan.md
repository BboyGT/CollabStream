# Live captions / transcription: plan

**Status: planning only.** Not built — the "free" path still involves real product decisions
(privacy disclosure, browser support tradeoffs) that shouldn't be picked silently.

## The low-risk path: client-side Web Speech API, text broadcast over the existing data channel

The good news: this doesn't need a new server dependency, a paid vendor, or any change to the
"media never touches the server" architecture. Each person's own browser transcribes their own
microphone locally using the browser's built-in `SpeechRecognition` API, and only the resulting
**text** — not audio — gets sent to others, over the exact same data channel chat/floor mode
already use.

### Mechanism
1. New hook, `useCaptions.js`: wraps `window.SpeechRecognition || window.webkitSpeechRecognition`.
   `recognition.continuous = true`, `interimResults = true`. `onresult` fires with interim
   (still-being-spoken) and final transcript segments.
2. On each final segment, broadcast `{ type: 'caption', text, from: role }` via the same
   `sendData`/`hostRTC.broadcast` functions already used for chat — no new transport.
3. Receiving side (`handleDataMessage` in both `HostRoom.jsx` and `GuestRoom.jsx`): a
   `type === 'caption'` case updates a small rolling caption display — last line or two of text
   per active speaker, auto-fading after a few seconds of silence from that speaker.
4. Feature flag: add `captions` to `apps/web/src/lib/flags.js`, matching the existing
   `chat`/`snapshot`/`laser`/`control` pattern (`VITE_FEATURE_CAPTIONS`).

### Two things that need an explicit decision before building, not a default guess

**1. Browser support is genuinely inconsistent.** `SpeechRecognition` works well in Chrome/Edge
(Chromium), is unsupported in Firefox, and has partial/inconsistent behavior in Safari. This has
to be presented as "best effort, Chrome/Edge recommended" in the UI — not silently fail
elsewhere. Decide: hide the captions toggle entirely on unsupported browsers, or show it with a
visible "may not work in this browser" note? Either is defensible; pick one on purpose.

**2. Privacy: Chrome's implementation is not fully on-device.** This is the one that actually
matters and shouldn't be assumed away. In most current Chrome versions, `SpeechRecognition`
audio is sent to Google's servers for processing — it is *not* local-only the way the rest of
CollabStream's media is (everything else here is peer-to-peer, this specifically would not be).
Anyone enabling captions needs a clear, honest disclosure of this before turning it on — a
one-line note next to the captions toggle, not buried in a privacy policy. This is the main
reason this plan doc exists rather than the feature just being built: that disclosure is a
product decision, not an implementation detail, and it shouldn't be my call to make silently on
your behalf.

### The other path, not recommended for a first version
A paid transcription API (Deepgram, AssemblyAI, Whisper via OpenAI, etc.) would give better
quality and broader language support, but requires streaming audio to a server for the first
time in this app's architecture, plus an ongoing per-minute cost and a new vendor relationship.
That's a real business decision (which vendor, what it costs, who's paying for it) that's out of
scope for a plan document to just pick — flagging it exists as the "if you outgrow the free
path" option, not proposing to build it now.

## Rough checklist (client-side Web Speech API path only)
- [ ] `useCaptions.js` hook: start/stop, interim vs. final results, error handling for
      unsupported browsers (`SpeechRecognition` undefined) and for permission denial.
- [ ] Wire into `HostRoom.jsx`/`GuestRoom.jsx`: broadcast final segments as `{type:'caption',...}`.
- [ ] Receiving-side rolling caption display, per speaker, auto-fade.
- [ ] `flags.js`: `captions` flag.
- [ ] Visible browser-support messaging (decide: hide toggle vs. show with a caveat).
- [ ] Visible, honest privacy disclosure next to the captions toggle before it can be enabled —
      this is the one item on this list that isn't optional if the feature ships at all.
