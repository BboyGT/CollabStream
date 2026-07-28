# CodePen Examples for "Letting Users Point Without Letting Them Click"

These are written as three separate CodePen demos. For each one, paste the HTML, CSS, and JS into the matching CodePen panels.

## CodePen 1: Mode Switching Overlay

Insert this CodePen immediately after this exact statement in the article:

> Drawing a circle around a button should be low-risk, while clicking that button should be high-trust. If both actions use the same pipeline, the permission boundary gets blurry, and the interface starts asking users to trust a feature that should have been harmless.

It should appear before this next statement:

> The cleaner approach is to split annotation events from control events.

### HTML

```html
<main class="demo-shell">
  <section class="screen" id="screen">
    <div class="fake-app">
      <div class="topbar"></div>
      <div class="sidebar"></div>
      <div class="panel primary"></div>
      <button class="target">Deploy</button>
      <div class="panel secondary"></div>
    </div>
    <canvas id="ink"></canvas>
    <canvas id="laser"></canvas>
    <div class="control-dot" id="controlDot"></div>
  </section>

  <nav class="toolbar" aria-label="Interaction mode">
    <button data-mode="view" class="active">View</button>
    <button data-mode="annotate">Annotate</button>
    <button data-mode="laser">Laser</button>
    <button data-mode="control">Control</button>
  </nav>

  <p class="status" id="status">View mode: pointer input passes through.</p>
</main>
```

### CSS

```css
* {
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  display: grid;
  place-items: center;
  margin: 0;
  background: #0f172a;
  color: #e2e8f0;
  font: 16px/1.5 system-ui, sans-serif;
}

.demo-shell {
  width: min(860px, calc(100vw - 32px));
}

.screen {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid #334155;
  border-radius: 14px;
  background: #111827;
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.35);
}

.fake-app {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 150px 1fr 180px;
  grid-template-rows: 56px 1fr 80px;
  gap: 18px;
  padding: 20px;
}

.topbar,
.sidebar,
.panel,
.target {
  border-radius: 10px;
  background: #1e293b;
}

.topbar {
  grid-column: 1 / -1;
}

.sidebar {
  grid-row: 2 / 4;
}

.primary {
  grid-column: 2 / 3;
  background: linear-gradient(135deg, #1e293b, #334155);
}

.secondary {
  grid-column: 3 / 4;
  grid-row: 2 / 4;
}

.target {
  justify-self: start;
  align-self: start;
  padding: 14px 22px;
  border: 0;
  background: #38bdf8;
  color: #082f49;
  font-weight: 700;
}

canvas,
.control-dot {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.control-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fb7185;
  border: 2px solid white;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
}

.toolbar {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.toolbar button {
  border: 1px solid #334155;
  border-radius: 999px;
  padding: 8px 14px;
  background: #111827;
  color: #cbd5e1;
  cursor: pointer;
}

.toolbar button.active {
  background: #38bdf8;
  border-color: #38bdf8;
  color: #082f49;
}

.status {
  min-height: 1.5em;
  color: #94a3b8;
}
```

### JS

```js
const screen = document.querySelector("#screen");
const ink = document.querySelector("#ink");
const laser = document.querySelector("#laser");
const controlDot = document.querySelector("#controlDot");
const status = document.querySelector("#status");
const buttons = document.querySelectorAll("[data-mode]");

const inkCtx = ink.getContext("2d");
const laserCtx = laser.getContext("2d");
let mode = "view";
let drawing = false;

function syncCanvas(canvas) {
  const rect = screen.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

function syncAll() {
  syncCanvas(ink);
  syncCanvas(laser);
}

function point(event) {
  const rect = screen.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function setMode(next) {
  mode = next;
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  controlDot.style.opacity = mode === "control" ? 1 : 0;
  status.textContent = {
    view: "View mode: pointer input passes through.",
    annotate: "Annotate mode: pointer input draws on the overlay.",
    laser: "Laser mode: pointer input becomes temporary attention.",
    control: "Control mode: pointer movement becomes remote input."
  }[mode];
}

buttons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

screen.addEventListener("pointerdown", (event) => {
  if (mode !== "annotate") return;
  drawing = true;
  const p = point(event);
  inkCtx.beginPath();
  inkCtx.moveTo(p.x, p.y);
});

screen.addEventListener("pointermove", (event) => {
  const p = point(event);

  if (mode === "annotate" && drawing) {
    inkCtx.lineWidth = 5;
    inkCtx.lineCap = "round";
    inkCtx.strokeStyle = "#facc15";
    inkCtx.lineTo(p.x, p.y);
    inkCtx.stroke();
  }

  if (mode === "laser") {
    laserCtx.clearRect(0, 0, laser.width, laser.height);
    laserCtx.beginPath();
    laserCtx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    laserCtx.fillStyle = "#f97316";
    laserCtx.fill();
  }

  if (mode === "control") {
    controlDot.style.left = `${p.x}px`;
    controlDot.style.top = `${p.y}px`;
    status.textContent = `Control mode: sending fake mousemove (${Math.round(p.x)}, ${Math.round(p.y)}).`;
  }
});

screen.addEventListener("pointerup", () => {
  drawing = false;
});

screen.addEventListener("pointerleave", () => {
  drawing = false;
  laserCtx.clearRect(0, 0, laser.width, laser.height);
});

new ResizeObserver(syncAll).observe(screen);
syncAll();
```

## CodePen 2: Normalized Coordinates Playground

Insert this CodePen immediately after this exact code block in the article:

```js
function normalize(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect()

  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  }
}
```

It should appear before this next statement:

> Now a point at `{ x: 0.5, y: 0.5 }` means the center of the annotation surface, whether the canvas is 900 pixels wide for one participant and 1440 pixels wide for another.

### HTML

```html
<main class="wrap">
  <section class="stage" id="stage">
    <canvas id="canvas"></canvas>
    <div class="marker" id="marker"></div>
  </section>

  <div class="controls">
    <button id="resize">Resize surface</button>
    <button id="reset">Reset marker</button>
  </div>

  <pre id="readout"></pre>
</main>
```

### CSS

```css
body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  background: #111827;
  color: #e5e7eb;
  font: 15px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.wrap {
  width: min(900px, calc(100vw - 32px));
}

.stage {
  position: relative;
  width: 70%;
  height: 360px;
  border: 1px solid #334155;
  border-radius: 12px;
  background:
    linear-gradient(#1f2937 1px, transparent 1px),
    linear-gradient(90deg, #1f2937 1px, transparent 1px),
    #0f172a;
  background-size: 36px 36px;
  transition: width 250ms ease;
}

.stage.wide {
  width: 100%;
}

canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.marker {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #38bdf8;
  border: 3px solid white;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.controls {
  display: flex;
  gap: 8px;
  margin: 14px 0;
}

button {
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px 12px;
  background: #1f2937;
  color: #e5e7eb;
  cursor: pointer;
}

pre {
  min-height: 96px;
  padding: 14px;
  border-radius: 10px;
  background: #020617;
  color: #93c5fd;
}
```

### JS

```js
const stage = document.querySelector("#stage");
const canvas = document.querySelector("#canvas");
const marker = document.querySelector("#marker");
const readout = document.querySelector("#readout");
const resize = document.querySelector("#resize");
const reset = document.querySelector("#reset");

let normalized = { x: 0.5, y: 0.5 };

function normalize(event) {
  const rect = stage.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height
  };
}

function syncCanvas() {
  const rect = stage.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  render();
}

function render() {
  const rect = stage.getBoundingClientRect();
  const pixel = {
    x: Math.round(normalized.x * rect.width),
    y: Math.round(normalized.y * rect.height)
  };

  marker.style.left = `${pixel.x}px`;
  marker.style.top = `${pixel.y}px`;

  readout.textContent = JSON.stringify({
    normalized,
    renderedPixels: pixel,
    surfaceSize: {
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }
  }, null, 2);
}

stage.addEventListener("pointerdown", (event) => {
  normalized = normalize(event);
  render();
});

resize.addEventListener("click", () => {
  stage.classList.toggle("wide");
});

reset.addEventListener("click", () => {
  normalized = { x: 0.5, y: 0.5 };
  render();
});

new ResizeObserver(syncCanvas).observe(stage);
syncCanvas();
```

## CodePen 3: Two-Canvas Laser vs Annotation

Insert this CodePen immediately after this exact code block in the article:

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

It should appear before this next statement:

> Permanent annotations and temporary pointer activity have different lifecycles, so giving them different surfaces keeps clearing, undo, and fading behavior much easier to reason about.

### HTML

```html
<main class="demo">
  <section class="board" id="board">
    <canvas id="annotations"></canvas>
    <canvas id="pointer"></canvas>
  </section>

  <div class="toolbar">
    <button data-tool="pen" class="active">Pen</button>
    <button data-tool="laser">Laser</button>
    <button id="clear">Clear annotations</button>
  </div>

  <p id="hint">Pen draws persistent marks. Laser uses a separate canvas and fades out.</p>
</main>
```

### CSS

```css
body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  background: #0f172a;
  color: #cbd5e1;
  font: 16px/1.5 system-ui, sans-serif;
}

.demo {
  width: min(820px, calc(100vw - 32px));
}

.board {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid #334155;
  border-radius: 14px;
  background:
    radial-gradient(circle at 25% 30%, #334155 0 12%, transparent 13%),
    linear-gradient(135deg, #111827, #1e293b);
}

.board::before {
  content: "Shared screen placeholder";
  position: absolute;
  left: 24px;
  top: 20px;
  color: #94a3b8;
  font-size: 14px;
}

canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.toolbar {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

button {
  border: 1px solid #334155;
  border-radius: 999px;
  padding: 8px 14px;
  background: #111827;
  color: #cbd5e1;
  cursor: pointer;
}

button.active {
  background: #facc15;
  border-color: #facc15;
  color: #422006;
}

#hint {
  color: #94a3b8;
}
```

### JS

```js
const board = document.querySelector("#board");
const annotations = document.querySelector("#annotations");
const pointer = document.querySelector("#pointer");
const annotationCtx = annotations.getContext("2d");
const pointerCtx = pointer.getContext("2d");
const clear = document.querySelector("#clear");
const toolButtons = document.querySelectorAll("[data-tool]");

let tool = "pen";
let drawing = false;
let fadeTimer;

function sync(canvas) {
  const rect = board.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

function syncAll() {
  sync(annotations);
  sync(pointer);
}

function point(event) {
  const rect = board.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function drawLaser(p) {
  clearTimeout(fadeTimer);
  pointerCtx.clearRect(0, 0, pointer.width, pointer.height);
  pointerCtx.beginPath();
  pointerCtx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  pointerCtx.fillStyle = "rgba(249, 115, 22, 0.95)";
  pointerCtx.fill();
  pointerCtx.beginPath();
  pointerCtx.arc(p.x, p.y, 18, 0, Math.PI * 2);
  pointerCtx.strokeStyle = "rgba(249, 115, 22, 0.45)";
  pointerCtx.lineWidth = 3;
  pointerCtx.stroke();

  fadeTimer = setTimeout(() => {
    pointerCtx.clearRect(0, 0, pointer.width, pointer.height);
  }, 140);
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tool = button.dataset.tool;
    toolButtons.forEach((b) => b.classList.toggle("active", b === button));
  });
});

board.addEventListener("pointerdown", (event) => {
  const p = point(event);
  if (tool === "laser") {
    drawLaser(p);
    return;
  }

  drawing = true;
  annotationCtx.beginPath();
  annotationCtx.moveTo(p.x, p.y);
});

board.addEventListener("pointermove", (event) => {
  const p = point(event);

  if (tool === "laser") {
    drawLaser(p);
    return;
  }

  if (!drawing) return;
  annotationCtx.lineWidth = 5;
  annotationCtx.lineCap = "round";
  annotationCtx.strokeStyle = "#38bdf8";
  annotationCtx.lineTo(p.x, p.y);
  annotationCtx.stroke();
});

board.addEventListener("pointerup", () => {
  drawing = false;
});

board.addEventListener("pointerleave", () => {
  drawing = false;
});

clear.addEventListener("click", () => {
  annotationCtx.clearRect(0, 0, annotations.width, annotations.height);
});

new ResizeObserver(syncAll).observe(board);
syncAll();
```
