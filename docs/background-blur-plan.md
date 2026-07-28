# Background blur / virtual background: plan

**Status: planning only.** Not built — this is the item I'm least comfortable improvising,
given real performance cost that can't be evaluated without a physical device to test on.

## Why a CSS blur filter doesn't work
Applying a CSS `blur()` filter to the whole `<video>` element blurs the *person* too, not just
what's behind them. That's not what "background blur" means to anyone using it, so this isn't a
shortcut — actual background blur requires knowing which pixels are a person and which aren't,
frame by frame, which means real-time image segmentation.

## The only genuine approach: ML-based segmentation, client-side

There's no standard browser API for this yet (no `navigator.mediaDevices.blurBackground()` or
similar). The practical option is a pre-trained segmentation model running in the browser:

- **MediaPipe Selfie Segmentation** (Google) or a similar TensorFlow.js body-segmentation model.
  Runs via WASM, real-time-capable on reasonable hardware.
- **Real cost, not hypothetical:** this is a new dependency in the ~1-3MB range (WASM binary +
  model weights), and real-time inference on every frame is a genuine, sustained CPU cost for
  the entire duration anyone has it enabled — not a one-time cost.

### Pipeline
1. Capture frames from the local camera track.
2. Run segmentation per frame (person mask), ideally throttled to ~15-20fps rather than the
   full capture framerate — running inference on every single frame at 30/60fps is unlikely to
   be necessary or affordable on mid-range hardware.
3. Composite: sharp person pixels + blurred (or replaced) background pixels, drawn to a canvas.
4. Turn that canvas into a new `MediaStream` via `canvas.captureStream()`.
5. **Swap the outgoing track without renegotiating every connection:** use
   `RTCRtpSender.replaceTrack()` on each existing peer connection's sender rather than tearing
   down and rebuilding connections. This is the correct, already-available WebRTC mechanism for
   "the local camera track changed, but the connection itself didn't" — no new signaling needed
   for this part, it's a drop-in swap on `useWebRTCHost.js`'s/`useWebRTC.js`'s existing senders.

### What genuinely can't be resolved without a real device
- Whether 15-20fps segmentation is smooth enough to not look janky, or too CPU-heavy on a
  mid-range laptop, is an empirical question. I have no way to benchmark this from here.
- Battery/thermal impact on laptops running this for an hour-long call — real concern, untestable
  without hardware.
- Whether it needs to auto-disable itself if the device can't keep up (dropped frames, fan
  spin-up) — and what "can't keep up" is even detected as — needs real-world tuning.

### Recommendation
Default **off**, opt-in only, with a visible warning the first time it's enabled ("this may
affect performance on some devices"). Don't ship this without testing on at least one
lower-end/older device someone actually owns — the failure mode here (a laptop fan spinning up
and the whole tab stuttering) is exactly the kind of thing that's invisible in code review and
only shows up in real use.

## Rough checklist
- [ ] Evaluate MediaPipe Selfie Segmentation vs. a TF.js alternative for bundle size and license
      fit (check exact license terms before committing to one).
- [ ] Segmentation + compositing pipeline, throttled framerate, tunable.
- [ ] `RTCRtpSender.replaceTrack()` wiring in `useWebRTCHost.js` (host's own outgoing track) and
      `useWebRTC.js` (guest's own outgoing track) — swap, not renegotiate.
- [ ] Auto-disable / degrade path if frame processing falls behind in real time.
- [ ] Default-off, explicit opt-in, visible first-use performance warning.
- [ ] Real device testing across at least low/mid/high-end hardware before considering this done
      — this line matters more than any of the others on this list.
