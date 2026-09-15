/* =========================================================================
   Gridwright — Undo/redo history
   Snapshot-based: every mutating action records a snapshot of the canvas
   BEFORE it runs. Ctrl+Z restores the previous snapshot; Ctrl+Shift+Z
   re-applies the next one. Any new action taken after undoing clears the
   redo stack, matching standard editor semantics.
   ========================================================================= */

import { state } from './state.js';
import { pathDataStore, createFinalPathReturning } from './paths.js';
import { drawnWalls, processLineWalls } from './walls.js';
import { setTool } from './toolbar.js';
import { markDirty as markAutosaveDirty } from './autosave.js';

const MAX_HISTORY = 10;

// Undo stack: snapshots taken BEFORE each action. Most recent at end.
const past = [];
// Redo stack: snapshots the user has undone. Most recent at end.
const future = [];

// True while we're in the middle of restoring a snapshot — used to suppress
// pushHistory calls that would otherwise re-record the restore itself.
let suspended = false;

// Deep-copy a snapshot of the current canvas geometry (paths only — walls
// are derived from paths). Also records selection by path index so undo
// can restore it after paths are re-emitted.
function snapshot() {
    const selectionIdx = [];
    pathDataStore.forEach((po, i) => {
        if (state.selection.has(po)) selectionIdx.push(i);
    });
    return {
        paths: pathDataStore.map((po) => ({
            pts: po.pts.map((p) => ({ x: p.x, y: p.y })),
            isClosed: po.isClosed,
            stroke: po.stroke,
        })),
        selectionIdx,
    };
}

// Replace the current canvas with the given snapshot.
function restore(snap) {
    suspended = true;
    // Clear old selection classes (path objects are about to be discarded).
    state.selection.forEach((po) => po.el && po.el.classList.remove('selected'));
    state.selection.clear();

    // Remove every current path from the DOM.
    for (const po of pathDataStore) po.el.remove();
    pathDataStore.length = 0;
    drawnWalls.clear();

    // Re-emit each snapshot path and register its walls.
    for (const p of snap.paths) {
        const pts = p.pts.map((pt) => ({ x: pt.x, y: pt.y }));
        createFinalPathReturning(pts, p.isClosed, p.stroke);
        for (let i = 0; i < pts.length - 1; i++)
            processLineWalls(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, true);
        if (p.isClosed)
            processLineWalls(
                pts[pts.length - 1].x,
                pts[pts.length - 1].y,
                pts[0].x,
                pts[0].y,
                true
            );
    }

    // Re-select paths by their position in pathDataStore. Safe because
    // createFinalPathReturning appends in the same order the snapshot was
    // captured.
    if (snap.selectionIdx && snap.selectionIdx.length) {
        for (const i of snap.selectionIdx) {
            const po = pathDataStore[i];
            if (po) {
                state.selection.add(po);
                po.el.classList.add('selected');
            }
        }
        // Restored selection is only useful under the Select tool — otherwise
        // the user sees a selection they can't manipulate. Switch tools if we
        // aren't already there.
        if (state.currentTool !== 'select') setTool('select');
    }

    suspended = false;

    _notifyChange();
}

// Called by mutating actions BEFORE they change canvas state. Pushes the
// current snapshot onto the undo stack (capped at MAX_HISTORY) and clears
// the redo stack (any fresh action invalidates future).
export function pushHistory() {
    if (suspended) return;
    past.push(snapshot());
    if (past.length > MAX_HISTORY) past.shift();
    future.length = 0;
    // Every mutation is a candidate for autosave. The autosave module is in
    // charge of throttling (one write per minute) and skipping empty-canvas
    // states.
    markAutosaveDirty();
    _notifyChange();
}

export function undo() {
    if (past.length === 0) return;
    // Save the current state onto the redo stack so we can come back.
    future.push(snapshot());
    if (future.length > MAX_HISTORY) future.shift();
    const snap = past.pop();
    restore(snap);
    markAutosaveDirty();
}

export function redo() {
    if (future.length === 0) return;
    // Save the current state onto the undo stack so undo can reverse this.
    past.push(snapshot());
    if (past.length > MAX_HISTORY) past.shift();
    const snap = future.pop();
    restore(snap);
    markAutosaveDirty();
}

export function canUndo() {
    return past.length > 0;
}

export function canRedo() {
    return future.length > 0;
}

// Notification hook so external code (e.g. selection UI) can refresh. The
// entry code should register a listener before the first action.
const changeListeners = new Set();
export function onHistoryChange(fn) {
    changeListeners.add(fn);
}
function _notifyChange() {
    for (const fn of changeListeners) fn();
}
// Public trigger for callers that mutate pathDataStore without going through
// pushHistory (currently: the autosave restore path on app load). Lets UI
// bits like the Export enable/disable state resync.
export function notifyCanvasChanged() {
    _notifyChange();
}
