/* =========================================================================
   Gridwright — Drawing import
   Loads a template envelope onto the canvas. Two paths land here:
     • Gallery handoff (see main.js#consumeGalleryHandoff) → template object.
     • Sidebar tile click starts placement mode (see tools/place.js), which
       is a different flow that doesn't touch this module.

   The single entry point is `importDrawingFromTemplate(template)` — it
   replaces the canvas with the template's paths, centered on the current
   viewport, and pushes history so Ctrl+Z restores the previous drawing.
   ========================================================================= */

import { state } from './state.js';
import { isValidTemplate } from './templates.js';
import { CELL_SIZE } from './svg.js';
import { pathDataStore, createFinalPathReturning } from './paths.js';
import { drawnWalls, processLineWalls } from './walls.js';
import { pushHistory, notifyCanvasChanged } from './history.js';
import { showAlert } from './modal.js';

// ---- Placement helpers ----

// Snap a value to the nearest 50-unit grid corner.
function snapToGrid(v) {
    return Math.round(v / CELL_SIZE) * CELL_SIZE;
}

// Offset every path's points by (dx, dy) and emit them as new pathObjs +
// register their walls. Same shape as the raw path emission in
// history.restore.
function emitPathsAt(paths, dx, dy) {
    for (const p of paths) {
        if (!Array.isArray(p.pts) || p.pts.length < 2) continue;
        const pts = p.pts.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
        createFinalPathReturning(pts, !!p.isClosed, p.stroke || '#222222');
        for (let i = 0; i < pts.length - 1; i++)
            processLineWalls(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, true);
        if (p.isClosed) {
            processLineWalls(
                pts[pts.length - 1].x,
                pts[pts.length - 1].y,
                pts[0].x,
                pts[0].y,
                true
            );
        }
    }
}

// Compute an (ox, oy) offset that places the template's bbox centered on
// the current viewport, snapped to the grid.
function viewportCenterOffset(template) {
    const cx = state.viewBox.x + state.viewBox.w / 2;
    const cy = state.viewBox.y + state.viewBox.h / 2;
    const ox = snapToGrid(cx - template.bbox.w / 2);
    const oy = snapToGrid(cy - template.bbox.h / 2);
    return { ox, oy };
}

// Discard every existing path, then emit the template's paths centered on
// the current viewport. Template paths are stored normalized to (0, 0), so
// without an offset they'd land in the world's top-left corner and force
// the user to pan to find them.
// History is pushed first so Ctrl+Z restores the previous drawing.
export function replaceEntire(template) {
    pushHistory();
    // Deselect first — the paths we're about to destroy might be selected.
    state.selection.forEach((po) => po.el && po.el.classList.remove('selected'));
    state.selection.clear();
    for (const po of pathDataStore) po.el.remove();
    pathDataStore.length = 0;
    drawnWalls.clear();
    const { ox, oy } = viewportCenterOffset(template);
    emitPathsAt(template.paths, ox, oy);
    notifyCanvasChanged();
}

// ---- Entry point ----
//
// Used by the gallery hand-off: the gallery page stashes a template in
// sessionStorage and redirects to app.html. main.js pulls it out and
// hands it straight here. The canvas is replaced immediately (no
// Add/Replace modal — the gallery click was already the intent).
export async function importDrawingFromTemplate(template) {
    if (!template || !isValidTemplate(template)) {
        await showAlert('Invalid drawing', 'The handed-off drawing is not usable.');
        return;
    }
    replaceEntire(template);
}
