/* =========================================================================
   Gridwright — Restart canvas
   Wipes the drawing, clears the selection, empties the wall registry, and
   pushes a history snapshot so Ctrl+Z brings the drawing back. Autosave
   is also cleared so a refresh doesn't restore the just-discarded work.
   ========================================================================= */

import { state } from './state.js';
import { pathDataStore } from './paths.js';
import { drawnWalls } from './walls.js';
import { pushHistory, notifyCanvasChanged } from './history.js';
import { clearAutosave } from './autosave.js';

// Wipe every drawn path and reset dependent structures. Safe to call when
// the canvas is already empty (no-op in that case, aside from clearing
// autosave which is a cheap localStorage delete).
export function restartCanvas() {
    // Push history BEFORE mutation so Ctrl+Z can restore the pre-restart
    // drawing. If the canvas is empty we still push — a redundant snapshot
    // is cheap and it keeps the semantics simple.
    pushHistory();

    // Deselect first — paths we're about to remove may currently be
    // selected, and lingering references would leak through selection UI.
    state.selection.forEach((po) => po.el && po.el.classList.remove('selected'));
    state.selection.clear();

    // Remove every path's SVG element and drop the store.
    for (const po of pathDataStore) po.el.remove();
    pathDataStore.length = 0;

    // Wall registry lives alongside the path store — reset it too.
    drawnWalls.clear();

    // Discard any autosaved snapshot so a refresh doesn't prompt to
    // restore the drawing the user just chose to abandon.
    clearAutosave();

    // Notify UI (Export enable/disable, selection bar, etc.) that the
    // canvas contents changed outside the normal draw/erase paths.
    notifyCanvasChanged();
}
