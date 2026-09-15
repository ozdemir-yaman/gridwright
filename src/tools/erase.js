/* =========================================================================
   Gridwright — Erase tool
   Erases one unit fragment (one cell of line) at a time. Supports drag:
   holding the mouse down and moving the cursor erases every fragment the
   cursor passes over. Wherever the cursor is, we look for the nearest
   segment of any existing path and delete just the one 50-cell fragment
   under the cursor, splitting the parent path around it if necessary.
   ========================================================================= */

import { state, eq } from '../state.js';
import { erasePreview, getSvgPoint } from '../svg.js';
import { processLineWalls } from '../walls.js';
import { pathDataStore, createFinalPathReturning } from '../paths.js';
import { pushHistory } from '../history.js';

export function distToSegment(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 == 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

// Nearest segment of any existing path to `pt`. Returns { po, i, isClosing,
// p1, p2 } or null if no segment is within tolerance.
export function findClosestSegment(pt) {
    let minD = 15;
    let closest = null;
    for (const pathObj of pathDataStore) {
        const pts = pathObj.pts;
        for (let i = 0; i < pts.length - 1; i++) {
            const d = distToSegment(pt, pts[i], pts[i + 1]);
            if (d < minD) {
                minD = d;
                closest = { po: pathObj, i, isClosing: false, p1: pts[i], p2: pts[i + 1] };
            }
        }
        if (pathObj.isClosed) {
            const d = distToSegment(pt, pts[pts.length - 1], pts[0]);
            if (d < minD) {
                minD = d;
                closest = {
                    po: pathObj,
                    i: pts.length - 1,
                    isClosing: true,
                    p1: pts[pts.length - 1],
                    p2: pts[0],
                };
            }
        }
    }
    return closest;
}

// Given a segment [p1, p2] and a cursor point, return the endpoints of the
// single 50px unit fragment (one cell's worth) under the cursor. Works for
// horizontal, vertical, and 45° diagonal segments whose endpoints are on
// cell corners.
function unitFragmentUnderCursor(p1, p2, pt) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const n = Math.max(Math.abs(dx), Math.abs(dy)) / 50;
    if (n <= 0) return null;
    const lenSq = dx * dx + dy * dy;
    let t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    let k = Math.floor(t * n);
    if (k >= n) k = n - 1;
    const fA = { x: p1.x + (k / n) * dx, y: p1.y + (k / n) * dy };
    const fB = { x: p1.x + ((k + 1) / n) * dx, y: p1.y + ((k + 1) / n) * dy };
    return { fA, fB, k, n };
}

// Delete the unit fragment under `pt` from the parent path identified by
// `closest`. Splits the parent into up to two remainder paths and updates
// walls/DOM/store. Idempotent — no-op if the fragment isn't found.
function eraseFragmentAt(closest, pt) {
    const parent = closest.po;
    if (!parent) return;
    const pts = parent.pts;
    const stroke = parent.stroke;
    const frag = unitFragmentUnderCursor(closest.p1, closest.p2, pt);
    if (!frag) return;
    const { fA, fB, k, n } = frag;

    // Remove the fragment's walls.
    processLineWalls(fA.x, fA.y, fB.x, fB.y, false);

    // Detach the parent from DOM + store.
    parent.el.remove();
    const parentIdx = pathDataStore.indexOf(parent);
    if (parentIdx !== -1) pathDataStore.splice(parentIdx, 1);

    // Build remainder pieces (skipping the removed fragment).
    const emitRemainder = (rp) => {
        if (!rp || rp.length < 2) return;
        createFinalPathReturning(rp, false, stroke);
    };

    if (!parent.isClosed) {
        const leftBase = pts.slice(0, closest.i + 1);
        const rightBase = pts.slice(closest.i + 1);
        const leftEnd = leftBase[leftBase.length - 1];
        const rightStart = rightBase[0];
        const leftPts = leftBase.slice();
        if (!eq(leftEnd, fA)) leftPts.push(fA);
        const rightPts = rightBase.slice();
        if (!eq(rightStart, fB)) rightPts.unshift(fB);
        emitRemainder(leftPts);
        emitRemainder(rightPts);
    } else {
        // Closed path becomes an open remainder walking around the loop.
        const baseSeq = closest.isClosing
            ? pts.slice()
            : pts.slice(closest.i + 1).concat(pts.slice(0, closest.i + 1));
        const startV = baseSeq[0];
        const endV = baseSeq[baseSeq.length - 1];
        if (k > 0 && !eq(endV, fA)) baseSeq.push(fA);
        if (k + 1 < n && !eq(startV, fB)) baseSeq.unshift(fB);
        emitRemainder(baseSeq);
    }
}

// Update the red preview to show the unit fragment currently under the
// cursor (mirrors the hover feedback on the draw tool).
function updateErasePreview(cursorSvg) {
    const closest = findClosestSegment(cursorSvg);
    if (!closest) {
        erasePreview.style.display = 'none';
        return;
    }
    const frag = unitFragmentUnderCursor(closest.p1, closest.p2, cursorSvg);
    if (!frag) {
        erasePreview.style.display = 'none';
        return;
    }
    erasePreview.setAttribute('d', `M ${frag.fA.x} ${frag.fA.y} L ${frag.fB.x} ${frag.fB.y}`);
    erasePreview.style.display = 'block';
}

// --- Public mouse handlers ---

// True after we've recorded a snapshot for the CURRENT drag session. Reset
// on mouseup so the next drag starts fresh.
let historyRecordedThisDrag = false;

// Wrap eraseAt: if a fragment WOULD be erased and we haven't yet recorded
// history for this drag, push history first.
function eraseAtWithHistory(pt) {
    const closest = findClosestSegment(pt);
    if (!closest) return;
    if (!historyRecordedThisDrag) {
        pushHistory();
        historyRecordedThisDrag = true;
    }
    eraseFragmentAt(closest, pt);
}

export function eraseMouseDown(e) {
    if (e.button !== 0 || state.currentTool !== 'erase') return false;
    const pt = getSvgPoint(e.clientX, e.clientY);
    state.isErasing = true;
    historyRecordedThisDrag = false;
    eraseAtWithHistory(pt);
    updateErasePreview(pt);
    return true;
}

export function eraseMouseMove(e) {
    if (state.currentTool !== 'erase') return false;
    const pt = getSvgPoint(e.clientX, e.clientY);
    if (state.isErasing) {
        eraseAtWithHistory(pt);
    }
    updateErasePreview(pt);
    return true;
}

export function eraseMouseUp() {
    if (!state.isErasing) return;
    state.isErasing = false;
    historyRecordedThisDrag = false;
}
