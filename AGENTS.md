# AGENTS.md

Deep architecture, conventions, and workflow notes for contributors
(humans and AI coding assistants alike). If you're planning a change
larger than a one-line fix, read this first.

## Snapshot

- **Stack**: vanilla JavaScript + Vite. No framework, no bundler magic
  beyond Vite's module resolution and its multi-page HTML entrypoints.
- **Rendering**: SVG (not Canvas). Every drawn path is a `<path>` in
  the DOM.
- **State**: plain module-scoped objects in `src/state.js`. No reactive
  library. Explicit imperative update calls after each mutation.
- **Persistence**: `localStorage` for autosave and user gallery,
  `sessionStorage` for the gallery-to-app handoff.
- **Build**: Vite multi-page. Each root-level `.html` file is an
  entrypoint (`index`, `app`, `galleryDev`, `galleryMy`).

## Entry points

| File               | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `index.html`       | Landing page. Three cards → app + two galleries.          |
| `app.html`         | The drawing app itself. Loads `src/main.js`.              |
| `gallery-dev.html` | Developer's gallery — bundled `/drawings/*.json`.         |
| `gallery-my.html`  | My Gallery — user drawings from localStorage.             |

The app is the interesting one. The others are thin.

## Coordinate systems

Three coordinate spaces are in play. Get these right and everything
else falls into place.

- **World SVG units** — the SVG's own viewBox. `WORLD_W = 16000`,
  `WORLD_H = 9000` (320×180 cells × 50 units/cell). `CELL_SIZE = 50`.
  All stored path points, walls, and template bboxes are in these units.
- **Screen pixels** — mouse events arrive here. `getSvgPoint(clientX, clientY)`
  in `src/svg.js` converts them to world units. `svgToScreen(x, y)` goes
  the other way (used by the floating selection action bar).
- **Grid corners** — points that lie on the 50-unit grid. `Math.round(v / 50) * 50`
  snaps a world unit to a corner. Every stored point must be on a corner.

Every stroke lies on one of 8 axes radiating from a corner:
horizontal (0°), vertical (90°), and ±45° diagonals. The draw tool
picks the axis closest to the initial mouse motion and constrains the
stroke to it. See `trackFromAnchor()` in `src/tools/draw.js`.

## Module map

### Core state and rendering

- **`src/state.js`** — the single mutable state object. `viewBox`,
  `currentTool`, `selection` (a `Set` of pathObjs), `isDrawing`,
  `pivotPreview`, `placeMode`, clipboard, etc.
- **`src/svg.js`** — SVG DOM references, camera (`initViewBox`,
  `updateViewBox`, `clampViewBox`), coordinate conversion. Guarded so
  it can be imported on pages without a canvas — the top-level DOM
  writes only run when `#canvas` exists.
- **`src/paths.js`** — the `pathDataStore` array. Each entry is a
  `pathObj`: `{ el, pts, isClosed, stroke, ... }`. Central helpers:
  `createFinalPathReturning`, `commitNewPath`, `deduplicateSubset`,
  `mergeAllTouchingPaths`, `simplifyCollinear`.
- **`src/walls.js`** — a Set of "unit walls" (50-unit segments)
  keyed by their two grid corners. Used by the erase tool to figure out
  which existing segments to remove, and by the draw commit to reject
  overlapping strokes.

### History, persistence

- **`src/history.js`** — `pushHistory()` snapshot before every
  mutation. Ring buffer of 10. `undo/redo` restore the snapshot and
  rebuild the DOM. `onHistoryChange(cb)` fires after every push/undo/redo
  — used by the top toolbar to enable/disable menu items.
- **`src/autosave.js`** — 60 s interval writer keyed to
  `gridwright.autosave.v1`. Flushes on `pagehide` and
  `visibilitychange`. Restore prompt lives in `main.js`.

### Tools

Each tool owns its `Down/Move/Up` handlers, wired in `main.js`:

- **`src/tools/pan.js`** — pan with the pan tool or middle-mouse.
  Also owns wheel-zoom.
- **`src/tools/draw.js`** — grid-snap draw. Owns the pivot flow
  (Shift while drawing to pivot). See "Coordinate systems" for the
  8-axis snapping.
- **`src/tools/erase.js`** — segment-level erase. Uses the wall
  registry.
- **`src/tools/select.js`** — marquee selection, transforms
  (rotate/flip), copy/paste, delete. Selection-end merges touching
  paths via `mergeAllTouchingPaths()`.
- **`src/tools/place.js`** — ghost placement mode for gallery
  drawings picked from the sidebar. Follows the cursor, click to drop.

### UI orchestration

- **`src/main.js`** — boots everything. Sets up SVG event routing,
  initializes all subsystems in dependency order, runs the boot
  sequence (gallery handoff → autosave restore prompt → autosave
  ticker).
- **`src/toolbar.js`** — left toolbar (Pan/Draw/Erase/Select) and
  the floating selection action bar.
- **`src/top-toolbar.js`** — top-right hamburger menu (Download,
  Import, Save to Gallery, Restart) via the reusable
  `src/action-menu.js` component.
- **`src/keyboard.js`** — global keyboard shortcuts. Tool switches,
  undo/redo, Alt-hold shortcut badges, per-tool bindings.
- **`src/panel.js`** — the gallery sidebar (right-side slide-in).
  Reads user gallery, renders tiles, click starts `beginPlaceMode`.

### Modals

- **`src/modal.js`** — the app modal system. Requires the
  `<div id="app-modal">` DOM shipped in `app.html` and (now) both
  gallery pages. `showAlert`, `showConfirm`, `showPrompt`,
  `openCustomModal`. Call `initModal()` at boot.
- **`src/gallery-modal.js`** — a self-contained lightweight modal
  used by gallery-only flows (rename, delete confirm, banner import
  choice, backup restore alert). Doesn't depend on `#app-modal`.

### Import / export

- **`src/export.js`** — the low-level SVG/PNG/JSON serializers.
  Two flavors: live-canvas (`exportAsSvg`, reads `pathDataStore`) and
  template (`exportTemplateAsSvg`, takes a template object). Shared
  builders like `buildSvgElementFromPaths`.
- **`src/export-modal.js`** — the export dialog. Accepts an optional
  template argument; without one it operates on the live canvas.
  Shared by the app's Download menu and both gallery pages'
  per-card Download.
- **`src/import.js`** — `importDrawingFromTemplate(template)`
  replaces the canvas immediately. Used by the gallery handoff.

### Galleries

- **`src/user-gallery.js`** — CRUD over
  `localStorage['gridwright.userGallery.v1']`. Load/save/add/remove/merge/replace,
  plus backup-file parse/build.
- **`src/gallery-save.js`** — the "Save to Gallery" menu action.
  Prompts for a name, serializes canvas as a template, appends to
  the user gallery.
- **`src/gallery-my.js`** — My Gallery page controller. Card
  rendering, per-card actions, backup import/export banner.
- **`src/gallery-dev.js`** — Developer's Gallery controller.
  Drawings discovered at build time via
  `import.meta.glob('/drawings/*.json', { eager: true })`.

### Reusable UI primitives

- **`src/action-menu.js`** — hover-open dropdown menu component.
  API: `createActionMenu({ trigger, items, align })`. Each item can
  have `label`, `description`, `icon`, `danger`, `disabled`, `confirm`,
  `onClick`. Handles outside-click, Escape, arrow-key nav, ARIA.
- **`src/templates.js`** — three utility helpers: `makeId`,
  `nextUniqueName`, `isValidTemplate`. Nothing more — the old template
  library was retired.
- **`src/restart.js`** — the canvas-wipe function used by the
  Restart menu item.

## Data shapes

### Template envelope

Every serialized drawing looks like this:

```
{
    id: 'gal_...',
    name: 'My drawing',
    createdAt: 1734567890123,
    bbox: { w: 400, h: 300 },
    paths: [
        {
            pts: [{x: 0, y: 0}, {x: 50, y: 0}, ...],
            isClosed: false,
            stroke: '#222222',
        },
        ...
    ],
}
```

Coordinates in `paths` are normalized so the bbox's top-left is at
(0, 0). `isValidTemplate(t)` enforces this shape.

### Backup file

```
{ version: 1, templates: [ template, template, ... ] }
```

Same shape whether it's a single-drawing export or a whole-gallery
backup. This means an exported drawing can be imported back into
either an individual canvas or a gallery.

## Design conventions

### CSS

- **Tokens** in `tokens.css` (colors, spacing, shadows, timing).
  Import via CSS custom properties, e.g., `var(--space-3)`.
- **App styles** in `style.css` (drawing surface, toolbars, panel).
- **Landing/gallery styles** in `landing.css`.
- **Shared modal styles** in `app-modal.css` (loaded by app + both
  gallery pages).
- **Shared dropdown styles** in `action-menu.css` (same).
- Use `#6366f1` / `#4f46e5` / `#4338ca` for primary CTAs. The app's
  `--color-accent` (raw blue `#0066ff`) is reserved for semantic
  drawing-tool affordances (stroke preview, draw-tool active state).

### JavaScript

- **ES modules** everywhere. No commonJS.
- **No frameworks**, no reactive layer. When state mutates, the code
  that mutated it is responsible for calling the appropriate update
  function (`updateSelectionUI`, `notifyCanvasChanged`, etc.).
- **JSDoc-lite** — block comments describing purpose above every
  exported function. See existing files for tone.
- **Guard imports for cross-page reuse**. Modules that touch app-only
  DOM (`#canvas`, `#app-modal`) should either guard their top-level
  DOM writes or expose an explicit `init*()` function that the caller
  runs when the DOM is present.
- **ESLint** (`eslint.config.js`) is the source of truth for style.
  Unused vars must be prefixed `_` if intentional.

### File naming

- kebab-case for files (`gallery-my.js`, `top-toolbar.js`).
- camelCase for exports.
- `handle*` for user-action handlers.
- `render*` for DOM builders.

## Common workflows

### Add a new tool

1. Create `src/tools/<name>.js` exporting `<name>MouseDown/Move/Up`
   handlers that return `true` if they consumed the event.
2. Import and route them in `src/main.js`'s bubble-phase listeners.
3. Add a button in `app.html` (`#btn-<name>`) with the tool icon.
4. Wire the button in `src/toolbar.js` (`setTool`).
5. Add a keyboard shortcut in `src/keyboard.js`.
6. If the tool has a preview overlay, create it in `src/svg.js` and
   toggle its display from `setTool()`.

### Add a menu action to the top toolbar

Edit `buildItems()` in `src/top-toolbar.js`. Append an object with
`label`, `description`, `icon` (inline SVG string using `currentColor`),
optional `disabled`, optional `confirm: { title, message, ... }`, and
`onClick`. The list rebuilds on every `onHistoryChange`, so any
`disabled` state you compute from `pathDataStore.length` refreshes
automatically.

### Add a new HTML page

1. Create `<name>.html` at the repo root.
2. Add it to the `input` map in `vite.config.js`.
3. Create the corresponding `src/<name>.js` and `<script type="module">` it in.
4. Rebuild — Vite emits `dist/<name>.html` and its own JS chunk.

### Add drawings to the developer's gallery

Drop a Gridwright JSON envelope into `/drawings/`. The glob in
`src/gallery-dev.js` picks it up on the next dev-server HMR tick or
production build. No manifest, no wiring.

## Testing / verification

The project has no automated tests today. The workflow is:

1. `npm run lint` — must pass.
2. `npm run build` — must succeed.
3. Manual smoke test through the app: draw a few strokes, save to
   gallery, reload, restore autosave, download SVG/PNG/JSON, import
   from gallery.

CI runs the lint + build steps automatically on every push.

## Known constraints & gotchas

- **The app's modal system** (`src/modal.js`) needs `#app-modal` in
  the DOM before `initModal()` runs. Both gallery pages ship that DOM
  so they can reuse the export dialog. Any new page that wants to use
  `showAlert/showConfirm/showPrompt/openCustomModal` must include the
  same markup.
- **The gallery handoff** uses `sessionStorage['gridwright.galleryImport.v1']`.
  It's cleared unconditionally by the app boot code, so a page refresh
  after clicking "Edit on canvas" won't re-import.
- **PNG export is capped** at `MAX_PNG_SIDE = 8000` px per side.
  Larger requests are scaled down uniformly.
- **`import.meta.glob` is a compile-time construct**. Adding files to
  `/drawings/` at runtime is invisible; the dev server auto-reloads on
  file changes, but a deployed build has the drawings baked in.
- **`:has()` CSS** is used for a few conditional styles
  (`.gallery-card:has(.gallery-body) .gallery-thumb`, etc.). Requires
  reasonably modern browsers (Safari 15.4+, Chrome 105+, Firefox 121+).

## When you're stuck

- **Rendering not updating after a state change?** Look for a missing
  `updateSelectionUI()`, `notifyCanvasChanged()`, or manual DOM sync.
- **Undo skips your change?** You forgot to call `pushHistory()`
  before the mutation.
- **New export breaks?** Make sure both live-canvas and template
  code paths in `src/export-modal.js` still cover your case.
- **Coordinate drift after a transform?** Every stored point must be
  on a 50-unit grid corner. Round via `Math.round(v / 50) * 50`.
- **Something works in the app but not on a gallery page?** The
  gallery page probably hasn't loaded the CSS or DOM the shared
  primitive needs. Check `app-modal.css`, `action-menu.css`, and the
  `<div id="app-modal">` block.

## License

Contributions are licensed under [MIT](LICENSE), same as the project.
By opening a PR you agree to release your work under those terms.
