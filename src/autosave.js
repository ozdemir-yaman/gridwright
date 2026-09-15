/* =========================================================================
   Gridwright — Autosave
   Serializes the current canvas geometry to localStorage every minute so a
   user who closes the tab (crash, accidental close, etc.) can be offered
   their work back on next load.

   Persisted shape (STORAGE_KEY):
   {
     version: 1,
     savedAt: number,        // ms epoch
     paths: [
       { pts: [{x, y}, ...], isClosed: boolean, stroke: string },
       ...
     ]
   }
   ========================================================================= */

import { pathDataStore, createFinalPathReturning } from './paths.js';
import { drawnWalls, processLineWalls } from './walls.js';

const STORAGE_KEY = 'gridwright.autosave.v1';
const FORMAT_VERSION = 1;
const SAVE_INTERVAL_MS = 60_000; // one minute

// Set by mutating code paths to signal that a save is needed on the next
// interval tick. Prevents unnecessary writes when nothing has changed.
let dirty = false;
let intervalId = null;

// Mark the canvas as needing a save on the next interval tick. Called from
// history.pushHistory (which fires before every mutation) so we don't have
// to instrument each individual mutating code path.
export function markDirty() {
    dirty = true;
}

// Serialize the current canvas geometry. Returns null if there's nothing
// worth saving.
function snapshot() {
    if (pathDataStore.length === 0) return null;
    return {
        version: FORMAT_VERSION,
        savedAt: Date.now(),
        paths: pathDataStore.map((po) => ({
            pts: po.pts.map((p) => ({ x: p.x, y: p.y })),
            isClosed: po.isClosed,
            stroke: po.stroke,
        })),
    };
}

// Called from the interval. Writes only when dirty AND non-empty. Deletes
// any prior autosave when the canvas has become empty (skip-empty policy).
// Do the actual write. Returns true when a save occurred, false when the
// canvas was empty (existing autosave gets cleared) or storage failed.
function writeSnapshot() {
    if (pathDataStore.length === 0) {
        clearAutosave();
        return false;
    }
    const snap = snapshot();
    if (!snap) return false;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
        return true;
    } catch (_e) {
        // Storage might be full or disabled (private mode etc.). Silently
        // give up — a lost autosave is preferable to a broken app.
        return false;
    }
}

// Interval callback: only writes when a mutation has happened since the
// last tick.
function tick() {
    if (!dirty) return;
    dirty = false;
    writeSnapshot();
}

// Start the periodic saver. Idempotent — a second call is a no-op.
export function startAutosave() {
    if (intervalId !== null) return;
    intervalId = window.setInterval(tick, SAVE_INTERVAL_MS);
    // Also flush on tab hide/close so a fast quit doesn't lose the last
    // minute of work.
    window.addEventListener('pagehide', tick);
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') tick();
    });
}

// Read any existing autosave. Returns the parsed payload or null when there
// is none, when the JSON is malformed, or when the version doesn't match.
export function loadAutosave() {
    let raw;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch (_e) {
        return null;
    }
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            parsed.version !== FORMAT_VERSION ||
            !Array.isArray(parsed.paths)
        ) {
            return null;
        }
        return parsed;
    } catch (_e) {
        return null;
    }
}

// Remove any autosave from storage.
export function clearAutosave() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (_e) {
        // ignore
    }
}

// Repopulate the canvas from an autosave payload. Rebuilds pathDataStore
// entries, DOM paths, and the wall registry. Callers should ensure the
// canvas is empty first (fresh load).
export function restoreAutosave(payload) {
    if (!payload || !Array.isArray(payload.paths)) return;
    for (const p of payload.paths) {
        if (!Array.isArray(p.pts) || p.pts.length < 2) continue;
        const pts = p.pts.map((pt) => ({ x: pt.x, y: pt.y }));
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
    // The initial autosave save-loop should not immediately overwrite what
    // we just restored; keep the flag clean until a new mutation dirties it.
    dirty = false;
    // Silence unused-import lint for drawnWalls — we don't touch it directly
    // because processLineWalls manages it, but tools linting sometimes flags
    // the import. Reading .size is a no-op guard.
    void drawnWalls.size;
}

// Build a small SVG thumbnail of the given autosave payload. Used inside
// the restore-prompt modal. Returns an <svg> element.
export function buildThumbnail(payload, maxW = 320, maxH = 180) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');

    if (!payload || !Array.isArray(payload.paths) || payload.paths.length === 0) {
        svg.setAttribute('viewBox', `0 0 ${maxW} ${maxH}`);
        svg.setAttribute('width', maxW);
        svg.setAttribute('height', maxH);
        return svg;
    }

    // Compute bounding box of all paths.
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const p of payload.paths) {
        for (const pt of p.pts) {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
        }
    }
    const pad = 20;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`);
    svg.setAttribute('width', maxW);
    svg.setAttribute('height', maxH);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    for (const p of payload.paths) {
        if (!p.pts || p.pts.length < 2) continue;
        let d = `M ${p.pts[0].x} ${p.pts[0].y}`;
        for (let i = 1; i < p.pts.length; i++) d += ` L ${p.pts[i].x} ${p.pts[i].y}`;
        if (p.isClosed) d += ' Z';
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', p.stroke || '#222');
        path.setAttribute('stroke-width', '4');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('fill', p.isClosed ? 'transparent' : 'none');
        svg.appendChild(path);
    }
    return svg;
}
