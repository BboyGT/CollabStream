# Letting Users Point Without Letting Them Click

If you have spent enough time in screen sharing tools, you have probably hit this tiny-but-annoying collaboration bug where everyone can see the same thing, yet only one person can really point at it, and that person is the host.

We all know the scene. One person is sharing their screen, another says, "Click the button near the top," and the host starts drifting toward the wrong button. The guest corrects them, the host overshoots, and a visual problem somehow turns into a tiny game of verbal charades.

The obvious fix sounds simple: let the guest control the screen.

That should work, right?

Well, yes, but it also changes the whole shape of the interaction. Moving from "I want to show you where I mean" to "I can now click, type, and act inside your machine" is a big jump, especially when the real need is much smaller than full remote control.

So the feature becomes less about control and more about a narrower question:

What if users could point without being able to click?

That question leads to an annotation-first model where guests can draw, highlight, box, arrow, and laser-point on top of the shared screen while the host keeps control. Actual remote control can still exist, but it should sit behind a clear permission boundary instead of being the default answer to every "look here" moment.

Let's poke at that.

## A reduced test case

The smallest version of the problem is not [WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API), [canvas rendering](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API), or pointer math; it is the interaction model.

Most screen sharing tools give people two states:

- You can watch.
- You can control.

That leaves out the middle state where a guest does not want to control anything and only wants to say, "This exact thing right here." Voice can get the job done eventually, chat is even clumsier, and remote control is often more permission than the moment deserves.

The first version of the feature should not be a control system. It should be a shared attention system.

A useful reduced test case is a shared rectangle on the page. A pointer moves over it. What should that pointer mean?

In the implementation I worked on, the answer depends on a session mode:

```js
mode: 'view' // 'view' | 'annotate' | 'laser' | 'control'
```

It looks like a boring list, but it is doing a lot of product work. When the mode is `view`, the screen is passive; when it is `annotate`, pointer input becomes drawing input; when it is `laser`, pointer input becomes temporary attention; and when it is `control`, pointer input becomes remote mouse input.

The same physical gesture can mean very different things, so the mode is the contract.

That is the setup for how a screen sharing annotation layer ought to work too, with one shared surface, a few modes, and pointer input that changes behavior based on intent.

Well, sort of.

## Setting up the split

It is tempting to model all pointer activity as potential input for the host machine. Capture the guest's mouse position, scale it to the host screen, and decide later whether it should click.

That sounds convenient until you notice it mixes two jobs that need different permissions:

- Communicating intent.
- Performing an action.

Drawing a circle around a button should be low-risk, while clicking that button should be high-trust. If both actions use the same pipeline, the permission boundary gets blurry, and the interface starts asking users to trust a feature that should have been harmless.

The cleaner approach is to split annotation events from control events. Annotation events are visual collaboration messages, while control events are remote input messages. In a WebRTC-based setup, that can even mean different [`RTCDataChannel`](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel) instances:

```js
const annotation = pc.createDataChannel('annotation', {
  ordered: true,
})

const control = pc.createDataChannel('control', {
  ordered: false,
  maxRetransmits: 0,
})
```

That is not just a performance choice; it matches the meaning of the data. Annotation history should be ordered because, if a `move` event arrives before the stroke starts, the receiver has to guess what happened. Control movement is different because an old mouse position is not valuable once the pointer has moved somewhere else, so freshness matters more than perfect delivery. That is where options like [`ordered`](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/ordered) and [`maxRetransmits`](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/maxRetransmits) start to matter.

The transport should fit the interaction, otherwise the feature starts fighting itself.

## Here's the problem

Once the annotation channel exists, the next thing that breaks is coordinates.

The browser gives us `clientX` and `clientY`, but those are coordinates in the local viewport, which means they do not translate cleanly to another participant who may have a different window size, video layout, device pixel ratio, or fit mode. The browser can tell us where the local annotation surface is with [`getBoundingClientRect()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect), which is the useful bit for normalization.

We might assume raw pixels are enough because a pointer position is a pointer position, right?

Nope.

The fix is to send normalized coordinates instead:

```js
function normalize(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect()

  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  }
}
```

Now a point at `{ x: 0.5, y: 0.5 }` means the center of the annotation surface, whether the canvas is 900 pixels wide for one participant and 1440 pixels wide for another.

That tiny abstraction pays rent all over the place:

- The host and guest can have different layouts.
- The annotation canvas can resize.
- Whiteboard mode can reuse the same drawing model.
- Strokes can be stored as data instead of pixels.

That last part is the big one because canvas should be the output, not the source of truth.

## The solution: draw strokes as data

When a participant starts drawing, the app creates a stroke object:

```js
const stroke = {
  by: role,
  tool,
  color: colorRef.current,
  size: sizeRef.current,
  points: [{ x, y }],
}
```

For freehand tools, the app appends points as the pointer moves; for shapes like arrows and rectangles, it keeps a preview until pointer up, which keeps the interaction responsive without adding every intermediate frame to shared history.

The local flow is simple:

1. Pointer down creates a stroke.
2. Pointer move adds normalized points.
3. The local canvas re-renders immediately.
4. A small message goes to the other participant.
5. Pointer up commits the stroke.

The remote side does the same thing in reverse by receiving the message, updating the stroke list, and re-rendering.

There is no magic synchronization layer here, which is kind of the point. Real-time drawing is much easier to debug when the data model is plain JSON and the rendering pass is predictable.

```js
function renderAll() {
  const canvas = canvasRef.current
  const ctx = canvas.getContext('2d')

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  strokesRef.current.forEach((stroke) => drawStroke(ctx, stroke))
  if (previewRef.current) drawStroke(ctx, previewRef.current)
}
```

Every render starts from a clean canvas and redraws the current stroke list, so undo becomes "remove a stroke, then render again," while resize becomes "update the canvas buffer, then render again."

That is a much nicer problem than trying to surgically remove pixels from a canvas you treated as permanent state. Phew.

## The canvas has to sit there quietly

The visual layer is not complicated. The shared screen is a video element, and the annotation surface is a canvas absolutely positioned on top of it.

The important bit is when the canvas is allowed to receive pointer events:

```jsx
<canvas
  ref={ref}
  onPointerDown={onPointerDown}
  onPointerMove={onPointerMove}
  onPointerUp={onPointerUp}
  onPointerLeave={onPointerUp}
  onWheel={onWheel}
  style={{
    cursor,
    pointerEvents:
      isAnnotating || isControlling || isLaser ? 'all' : 'none',
  }}
  className="absolute inset-0 w-full h-full"
/>
```

That [`pointer-events`](https://developer.mozilla.org/en-US/docs/Web/CSS/pointer-events) line is easy to underestimate because, in view mode, the canvas should not steal input, while in annotation mode it should, and in control mode it should capture input and send it through the control pipeline.

One layer, different meanings. A small line, but a big switch.

The canvas buffer also needs to track its displayed size, which is exactly the kind of job [`ResizeObserver`](https://developer.mozilla.org/en-US/docs/Web/API/Resize_Observer_API) is good at:

```js
useEffect(() => {
  const canvas = ref.current
  if (!canvas) return

  const ro = new ResizeObserver(() => {
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
  })

  ro.observe(canvas)
  return () => ro.disconnect()
}, [ref])
```

CSS can resize the canvas element without resizing the drawing buffer, and if those drift apart, strokes get blurry or misaligned. Since strokes are normalized, resizing the buffer is safe; the next render puts everything back where it belongs.

## The laser pointer should not be a stroke

The laser pointer is where it is easy to accidentally overbuild because it feels like "just another annotation tool."

But a laser point is not history, and it is not really a drawing. It is a momentary "look here," so it should disappear almost as quickly as it appears.

One way to keep that mental model clean is to render laser activity on a separate pointer canvas and clear it quickly. This uses the same [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) model as the persistent annotation layer, but stores the result differently:

```js
function drawLaserPoint(x, y) {
  const canvas = pointerRef.current
  const ctx = canvas.getContext('2d')
  const px = x * canvas.width
  const py = y * canvas.height

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.beginPath()
  ctx.arc(px, py, 6, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(245, 158, 11, 0.9)'
  ctx.fill()

  setTimeout(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, 120)
}
```

Permanent annotations and temporary pointer activity have different lifecycles, so giving them different surfaces keeps clearing, undo, and fading behavior much easier to reason about.

## Now we can talk about clicking

Remote control still matters because sometimes the fastest way to help is to actually drive, but now it is an escalation instead of the default.

Some ideas are tempting but unclear:

- Let every guest send click-like events and block them later.
- Treat annotation and control as the same pointer stream.
- Hide the permission state in session logic and hope the UI explains itself.

All of those make the boundary mashed up. The better answer is explicit permissionw hich is a guest can request control, the host can approve or deny it, and the host can grant it directly only when the right conditions are true:

- A guest is connected.
- The desktop companion is connected.
- Control is enabled.
- The host is on a supported desktop environment.

The companion requirement is intentional because browser JavaScript should not be able to control the host operating system by itself. OS-level input belongs behind a separate app and a separate trust decision.

When the host approves control, the guest receives a grant message:

```js
hostRTC.sendToPeer(peerId, 'control', {
  type: 'control',
  action: 'grant',
  token,
})
```

The guest does not enter control mode until that grant arrives:

```js
if (msg.type === 'control' && msg.action === 'grant') {
  setControlToken(msg.token)
  setControlGranted(true)
  setMode('control')
  annotation.clearCanvasLocal()
}
```

Clearing the annotation layer when control starts is a small UX decision with a big effect because, if someone is about to click through the shared screen, old marks should not obscure the target.

After that, pointer movement is scaled from the video element to the host screen:

```js
function scaleCoords(clientX, clientY) {
  const rect = video.getBoundingClientRect()

  return {
    x: Math.round(((clientX - rect.left) / rect.width) * meta.screenWidth),
    y: Math.round(((clientY - rect.top) / rect.height) * meta.screenHeight),
  }
}
```

Those events only reach the companion if the peer is the one currently allowed to control and the token is valid.

The host can take control back at any time, Escape revokes it too, and the UI says the important part out loud:

"Guest has control - Press Esc to take back"

That is not helper text. It is part of the permission model.

## The edge cases are where the feature becomes real

The happy path is easy, while the real work is all the "what if" cases.

What if the host stops screen sharing? Old annotations may no longer point at anything meaningful, so the session should broadcast screen-started and screen-stopped events.

What if the participant is on a touch device? Annotation still makes sense, but remote control may not, so host-side control support can be disabled on touch and small-screen contexts:

```js
const hasTouch =
  'ontouchstart' in window || navigator.maxTouchPoints > 0

setControlSupported(
  !hasTouch && !window.matchMedia('(max-width: 768px)').matches
)
```

What if someone disconnects mid-stroke? Freehand drawing is already stored point by point, so a missing `end` event is not catastrophic, while arrows and rectangles can wait until pointer up before committing the final shape.

What if multiple people draw at once? Undo should not remove someone else's work, so it helps to scope undo to the participant who requested it:

```js
const idx = [...strokesRef.current]
  .reverse()
  .findIndex((stroke) => stroke.by === role)
```

Clear is different because it wipes the shared annotation layer, so it is a stronger action. In a larger team product, it might deserve a confirmation or permission rule; in a small live session, it can be acceptable as long as the action is easy to understand.

## To recap...

The big lesson is that "can click" and "can communicate" are not the same requirement.

Remote control feels like the complete version of collaboration, but most collaboration is not about taking over; it is about getting two people to look at the same thing with the same intent.

The technical pieces follow from that:

- Keep view, annotation, laser, and control as separate modes.
- Send normalized coordinates, not pixels.
- Treat strokes as data and canvas as output.
- Use different channels for annotation history and live control input.
- Make permission state visible in the UI.

That last one matters more than it sounds because a secure control system can still feel unsafe if the interface is vague and not clear. Labels like "Hand Control," "Take Back Control," and "Press Esc to take back" are not decoration; they help users understand who can do what right now.

Letting users point without letting them click sounds like a tiny distinction, but in practice, it changes the feel of the whole session.

It turns screen sharing from "watch what I do" into "show me what you mean."

## Further reading

- [Using WebRTC data channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels) for sending structured messages between peers.
- [RTCDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel), including delivery options such as `ordered` and `maxRetransmits`.
- [Using Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Using_Pointer_Events), especially for drawing interactions that work with mouse, pen, and touch input.
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) for the 2D drawing layer used by annotations.
- [Resize Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Resize_Observer_API) for keeping the drawing buffer aligned with its rendered size.
- [CSS `pointer-events`](https://developer.mozilla.org/en-US/docs/Web/CSS/pointer-events) for making an overlay listen only when a mode needs it.
- [CollabStream on GitHub](https://github.com/BboyGT/CollabStream) if you want to compare these patterns with a working screen-sharing project.
