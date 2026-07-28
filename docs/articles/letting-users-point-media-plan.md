# Media Plan: Letting Users Point Without Letting Them Click

Recommended supporting media:

- Diagrams: 3
- Images/screenshots: 2
- Video: 1 short MP4 or GIF
- CodePen demos: 3

## 1. Diagram: The Collaboration Mode Ladder

Place after the paragraph ending:

> The same physical gesture can mean very different things. The mode is the contract.

Purpose:

Show the four interaction levels as a ladder:

1. View: watch and talk.
2. Annotate: draw persistent marks.
3. Laser: point temporarily.
4. Control: click/type after approval.

Notes:

Use a simple vertical or horizontal flow diagram. The visual point is that control is an escalation, not the default.

## 2. CodePen: Mode Switching Overlay

Place immediately after the "Setting up the split" section.

Purpose:

Interactive mini-demo with a fake screen-share rectangle and mode buttons: View, Annotate, Laser, Control.

Behavior:

- View mode ignores pointer input.
- Annotate mode draws simple strokes.
- Laser mode shows a temporary dot.
- Control mode changes the cursor and logs fake mouse coordinates without actually clicking.

This helps readers feel the difference between "pointing" and "acting."

## 3. Diagram: Annotation vs Control Data Channels

Place after the WebRTC data channel code block.

Purpose:

Show two parallel channels:

- Annotation channel: ordered, persistent-ish events, strokes, undo, clear, laser.
- Control channel: low-latency input, mousemove, mousedown, keydown, scroll.

Notes:

The diagram should highlight why ordered delivery is useful for drawing history and why freshness matters for control movement.

## 4. CodePen: Normalized Coordinates Playground

Place after the `normalize()` code block.

Purpose:

Let readers resize a fake canvas and see normalized coordinates stay stable.

Behavior:

- Display raw pixel coordinates.
- Display normalized coordinates.
- Include a button to resize the canvas.
- Keep a marker in the same logical position after resize.

This is the most CSS-Tricks-friendly demo because it turns an abstract implementation detail into something readers can poke.

## 5. Diagram: Canvas Layer Stack

Place after the canvas JSX code block in "The canvas has to sit there quietly."

Purpose:

Show the render stack from bottom to top:

1. Shared screen video.
2. Persistent annotation canvas.
3. Temporary pointer/laser canvas.
4. Toolbar and permission UI.

Notes:

Also label which layers receive pointer events in View, Annotate, Laser, and Control modes.

## 6. CodePen: Two-Canvas Laser vs Annotation Demo

Place after the `drawLaserPoint()` code block.

Purpose:

Demonstrate why laser activity should not be stored as a normal stroke.

Behavior:

- Draw permanent pen marks on one canvas.
- Show a fading laser dot on another canvas.
- Include a Clear Annotations button that does not need to know anything about the laser dot.

This supports the article's "different lifecycles, different surfaces" point.

## 7. Image/Screenshot: Annotation Toolbar

Place near the end of "The solution: draw strokes as data" or before "The canvas has to sit there quietly."

Purpose:

Show an implementation toolbar with Draw, Laser, color, size, undo, and clear controls.

Generated asset:

`docs/articles/assets/annotation-toolbar.png`

Notes:

Use a clean screenshot with a shared screen or whiteboard visible behind it. Avoid showing sensitive session data.

## 8. Image/Screenshot: Control Permission State

Place in "Now we can talk about clicking" after the grant-message code block.

Purpose:

Show the host-side permission UI:

- Guest requests control.
- Approve/Deny state.
- Active "Guest has control - Press Esc to take back" warning.

Notes:

If one screenshot gets crowded, use a two-panel image: before approval and during control.

Generated asset:

`docs/articles/assets/control-permission-state.png`

## 9. Video: Full Interaction Demo

Place near the top, after:

> What if users could point without being able to click?

Purpose:

Show the whole concept in 15-25 seconds.

Suggested sequence:

1. Host shares a screen.
2. Guest uses laser to point at an element.
3. Guest draws an arrow or box.
4. Host clicks the target themselves.
5. Guest requests control.
6. Host approves.
7. Control warning appears.
8. Host presses Escape or clicks "Take Back Control."

Notes:

Keep it silent or lightly captioned. The point is the permission ladder: point first, click only after approval.
