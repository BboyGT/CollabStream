# Diagram Prompts for "Letting Users Point Without Letting Them Click"

Use these prompts with your preferred diagram/image generation tool. The intended style is editorial technical illustration: clean, high-contrast, readable labels, no product marketing, no mascots, no stock-photo feel.

## Diagram 1: The Collaboration Mode Ladder

Article placement:

Insert the image immediately after this exact statement in the article:

> The same physical gesture can mean very different things, so the mode is the contract.

It should appear before this next statement:

> That is the setup for how a screen sharing annotation layer ought to work too, with one shared surface, a few modes, and pointer input that changes behavior based on intent.

Prompt:

```text
Create a clean editorial technical diagram titled "The Permission Ladder for Shared Screens".

Canvas: 1600x1000, light background (#f8fafc), subtle grid texture, dark slate text.

Show a horizontal four-step ladder from left to right. Each step is a rounded rectangle with a small icon and short label:

1. View
   Subtitle: "Watch and talk"
   Icon: eye or screen.
   Color accent: slate blue.

2. Annotate
   Subtitle: "Draw persistent marks"
   Icon: pencil drawing a line.
   Color accent: cyan.

3. Laser
   Subtitle: "Point temporarily"
   Icon: glowing dot with ring.
   Color accent: amber.

4. Control
   Subtitle: "Click after approval"
   Icon: cursor with lock/check.
   Color accent: red-orange.

Above the ladder, add a thin arrow labeled "More agency, more permission".

Under the ladder, add a note: "Most collaboration lives before full control."

Make "Control" visually distinct as an escalation: slightly taller card, small lock badge, but do not make it look like the recommended/default choice.

Use simple vector shapes, no screenshots, no logos, no brand names. Ensure all labels are large and readable.
```

Alt text:

```text
A four-step ladder showing View, Annotate, Laser, and Control as increasing levels of permission in a shared screen session.
```

## Diagram 2: Annotation vs Control Data Channels

Article placement:

Insert the image immediately after this exact code block in the article:

```js
const annotation = pc.createDataChannel('annotation', {
  ordered: true,
})

const control = pc.createDataChannel('control', {
  ordered: false,
  maxRetransmits: 0,
})
```

It should appear before this next statement:

> That is not just a performance choice; it matches the meaning of the data.

Prompt:

```text
Create a technical flow diagram titled "Two Pointer Streams, Two Meanings".

Canvas: 1600x1000, dark background (#0f172a), high-contrast labels.

Layout:

Left side: a card labeled "Guest pointer input" with a cursor icon.

From that card, split into two horizontal lanes:

Top lane:
Label: "Annotation channel"
Sub-label: "Ordered messages"
Show message chips flowing left to right:
"stroke:start" -> "stroke:move" -> "stroke:end" -> "undo" -> "clear"
Use cyan accent lines.
Destination card on right: "Shared visual layer".

Bottom lane:
Label: "Control channel"
Sub-label: "Fresh input matters more than replay"
Show message chips:
"mousemove" -> "mousedown" -> "scroll" -> "keydown"
Use orange accent lines and dashed arrows to suggest low-latency movement.
Destination card on right: "Host input bridge" with a lock icon.

Between the lanes, add a small warning callout:
"Pointing is communication. Clicking is permissioned action."

Use simple vector UI elements. No product logos. Keep all text crisp and readable.
```

Alt text:

```text
A split-flow diagram showing annotation events traveling over an ordered channel and control input traveling over a separate low-latency channel.
```

## Diagram 3: Canvas Layer Stack

Article placement:

Insert the image immediately after this exact code block in the article:

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

It should appear before this next statement:

> That [`pointer-events`](https://developer.mozilla.org/en-US/docs/Web/CSS/pointer-events) line is easy to underestimate because, in view mode, the canvas should not steal input, while in annotation mode it should, and in control mode it should capture input and send it through the control pipeline.

Prompt:

```text
Create an exploded-layer technical diagram titled "The Annotation Layer Stack".

Canvas: 1600x1000, light background (#f8fafc), isometric stacked cards, clean editorial style.

Show four semi-transparent layers stacked from bottom to top:

Layer 1: "Shared screen video"
Visual: a browser/app window with neutral placeholder UI.
Color: slate.

Layer 2: "Persistent annotation canvas"
Visual: simple arrow, rectangle, and freehand line.
Color: cyan.

Layer 3: "Temporary pointer canvas"
Visual: amber laser dot with fading ring.
Color: amber.

Layer 4: "Toolbar and permission UI"
Visual: small mode buttons: View, Draw, Laser, Control.
Color: white card with dark text.

Add small side labels:
"View mode: pointer-events: none"
"Annotate/Laser/Control: pointer-events: all"
"Canvas stores pixels; app state stores strokes"

Make the stack visually clear, with each layer offset slightly upward and to the right. No brand names, no logos.
```

Alt text:

```text
An exploded stack showing a screen video layer, persistent annotation canvas, temporary pointer canvas, and toolbar controls.
```
