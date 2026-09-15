/* =========================================================================
   Gridwright — Draw tool
   Grid-snapped line drawing along horizontal, vertical, or 45° tracks.

   Shift-to-pivot: while dragging, pressing Shift commits the current stroke
   at its current endpoints and starts a new stroke anchored at the endpoint
   closest to the cursor. The user can then move in a new direction without
   releasing the mouse. Chainable — press Shift again to pivot again.
   ========================================================================= */

import { state } from '../state.js';
import { shapeLayer, strokePreview, getSvgPoint } from '../svg.js';
import { drawnWalls, processLineWalls } from '../walls.js';
import {
    createFinalPathReturning,
    mergePathIntoStore,
    drawUnitSegments,
    simplifyCollinear,
} from '../paths.js';
import { pushHistory } from '../history.js';

// Nearest of 6 candidate tracks (H, V, and two 45° diagonals) inside the
// current cell to the given SVG-coord point.
export function getClosestTrack(pt) {
    const cellX = Math.floor(pt.x / 50) * 50,
        cellY = Math.floor(pt.y / 50) * 50;
    const lx = pt.x - cellX,
        ly = pt.y - cellY;

    const segments = [
        {
            type: 'horizontal',
            dist: ly,
            n1: { x: cellX, y: cellY },
            n2: { x: cellX + 50, y: cellY },
            trackY: cellY,
        },
        {
            type: 'horizontal',
            dist: 50 - ly,
            n1: { x: cellX, y: cellY + 50 },
            n2: { x: cellX + 50, y: cellY + 50 },
            trackY: cellY + 50,
        },
        {
            type: 'vertical',
            dist: lx,
            n1: { x: cellX, y: cellY },
            n2: { x: cellX, y: cellY + 50 },
            trackX: cellX,
        },
        {
            type: 'vertical',
            dist: 50 - lx,
            n1: { x: cellX + 50, y: cellY },
            n2: { x: cellX + 50, y: cellY + 50 },
            trackX: cellX + 50,
        },
        {
            type: 'diag1',
            dist: Math.abs(lx - ly) / Math.SQRT2,
            n1: { x: cellX, y: cellY },
            n2: { x: cellX + 50, y: cellY + 50 },
            trackC: cellY - cellX,
        },
        {
            type: 'diag2',
            dist: Math.abs(lx + ly - 50) / Math.SQRT2,
            n1: { x: cellX + 50, y: cellY },
            n2: { x: cellX, y: cellY + 50 },
            trackC: cellX + cellY + 50,
        },
    ];
    return segments.reduce((prev, curr) => (prev.dist < curr.dist ? prev : curr));
}

// --- Helpers ---

// Compute the two endpoints (p1, p2) of the current in-progress stroke from
// state.activeTrack and state.minExt/maxExt.
function currentStrokeEndpoints() {
    const at = state.activeTrack;
    if (!at) return null;
    if (at.type === 'horizontal') {
        return [
            { x: state.minExt, y: at.trackY },
            { x: state.maxExt, y: at.trackY },
        ];
    } else if (at.type === 'vertical') {
        return [
            { x: at.trackX, y: state.minExt },
            { x: at.trackX, y: state.maxExt },
        ];
    } else if (at.type === 'diag1') {
        return [
            { x: state.minExt, y: state.minExt + at.trackC },
            { x: state.maxExt, y: state.maxExt + at.trackC },
        ];
    } else if (at.type === 'diag2') {
        return [
            { x: state.minExt, y: -state.minExt + at.trackC },
            { x: state.maxExt, y: -state.maxExt + at.trackC },
        ];
    }
    return null;
}

// Given endpoints [p1, p2] and a cursor point, return the endpoint nearest
// the cursor — this is the endpoint the user is currently extending toward
// and therefore the natural anchor for a pivot.
function nearEndpoint(endpoints, cursorPt) {
    if (!endpoints) return null;
    const [p1, p2] = endpoints;
    const d1 = Math.hypot(cursorPt.x - p1.x, cursorPt.y - p1.y);
    const d2 = Math.hypot(cursorPt.x - p2.x, cursorPt.y - p2.y);
    return d1 < d2 ? p1 : p2;
}

// Commit whatever stroke is currently in progress. The stroke is split at
// unit-segment granularity: any unit whose wall is already occupied is
// skipped, allowing new strokes to naturally cross or touch existing lines
// without stacking on top of them. Surviving runs are emitted as separate
// sub-paths (or merged via mergePathIntoStore when their endpoints touch
// same-color open paths).
//
// Returns the primary newly created pathObj (first surviving run) or null.
function commitCurrentStroke() {
    const endpoints = currentStrokeEndpoints();
    if (!endpoints) return null;
    if (state.currentPath) state.currentPath.remove();

    // If the stroke has zero extent (min == max), nothing to commit.
    if (state.minExt === state.maxExt) return null;

    const [p1, p2] = endpoints;

    // Break the stroke into unit segments and filter out those already
    // covered by drawnWalls. Consecutive survivors form runs.
    const units = drawUnitSegments(p1, p2);
    if (units.length === 0) return null;

    const runs = [];
    let cur = null;
    for (const u of units) {
        if (drawnWalls.has(u.key)) {
            cur = null;
            continue;
        }
        if (!cur) {
            cur = [u.a, u.b];
            runs.push(cur);
        } else {
            cur.push(u.b);
        }
    }
    if (runs.length === 0) return null;

    // A mutation is definitely happening now.
    pushHistory();

    let first = null;
    for (const seq of runs) {
        if (seq.length < 2) continue;
        // Collapse the run to just its direction-change vertices. Runs from
        // the draw tool are always contiguous along a single track, so this
        // reduces to endpoints — but calling simplifyCollinear keeps the
        // logic consistent with dedup and defensive against future changes.
        let pts = simplifyCollinear(seq);
        // Merge each run into any endpoint-touching same-color open path
        // (mirrors the classic single-stroke commit behavior).
        const merged = mergePathIntoStore(pts, state.currentStrokeColor);
        pts = merged.pts;
        const isClosed = merged.isClosed;

        for (let i = 0; i < pts.length - 1; i++)
            processLineWalls(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, true);
        if (isClosed)
            processLineWalls(
                pts[pts.length - 1].x,
                pts[pts.length - 1].y,
                pts[0].x,
                pts[0].y,
                true
            );
        const po = createFinalPathReturning(pts, isClosed, state.currentStrokeColor);
        if (po && !first) first = po;
    }
    return first;
}

// Given an anchor grid node and a cursor point, pick the track passing
// through that anchor whose direction is closest to (cursor - anchor).
// Returns a track shape identical to getClosestTrack (type, n1, n2, trackX/Y/C).
function trackFromAnchor(anchor, cursorPt) {
    const dx = cursorPt.x - anchor.x;
    const dy = cursorPt.y - anchor.y;
    // If cursor is essentially at anchor, we can't infer direction yet;
    // pick the horizontal track to the right as a stable default.
    if (Math.hypot(dx, dy) < 1) {
        return {
            type: 'horizontal',
            n1: { x: anchor.x, y: anchor.y },
            n2: { x: anchor.x + 50, y: anchor.y },
            trackY: anchor.y,
        };
    }
    // Normalize direction and find which of the 8 unit vectors it's closest
    // to (aligned with the 8 tracks radiating from anchor).
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;

    const S = Math.SQRT1_2; // 1/sqrt(2)
    const candidates = [
        // Horizontal east / west
        {
            ux: 1,
            uy: 0,
            build: () => ({
                type: 'horizontal',
                n1: { x: anchor.x, y: anchor.y },
                n2: { x: anchor.x + 50, y: anchor.y },
                trackY: anchor.y,
            }),
        },
        {
            ux: -1,
            uy: 0,
            build: () => ({
                type: 'horizontal',
                n1: { x: anchor.x - 50, y: anchor.y },
                n2: { x: anchor.x, y: anchor.y },
                trackY: anchor.y,
            }),
        },
        // Vertical south / north
        {
            ux: 0,
            uy: 1,
            build: () => ({
                type: 'vertical',
                n1: { x: anchor.x, y: anchor.y },
                n2: { x: anchor.x, y: anchor.y + 50 },
                trackX: anchor.x,
            }),
        },
        {
            ux: 0,
            uy: -1,
            build: () => ({
                type: 'vertical',
                n1: { x: anchor.x, y: anchor.y - 50 },
                n2: { x: anchor.x, y: anchor.y },
                trackX: anchor.x,
            }),
        },
        // Diagonal SE / NW  (y = x + c, slope +1) — diag1
        {
            ux: S,
            uy: S,
            build: () => ({
                type: 'diag1',
                n1: { x: anchor.x, y: anchor.y },
                n2: { x: anchor.x + 50, y: anchor.y + 50 },
                trackC: anchor.y - anchor.x,
            }),
        },
        {
            ux: -S,
            uy: -S,
            build: () => ({
                type: 'diag1',
                n1: { x: anchor.x - 50, y: anchor.y - 50 },
                n2: { x: anchor.x, y: anchor.y },
                trackC: anchor.y - anchor.x,
            }),
        },
        // Diagonal NE / SW  (y = -x + c, slope -1) — diag2
        {
            ux: S,
            uy: -S,
            build: () => ({
                type: 'diag2',
                n1: { x: anchor.x, y: anchor.y },
                n2: { x: anchor.x + 50, y: anchor.y - 50 },
                trackC: anchor.x + anchor.y,
            }),
        },
        {
            ux: -S,
            uy: S,
            build: () => ({
                type: 'diag2',
                n1: { x: anchor.x - 50, y: anchor.y + 50 },
                n2: { x: anchor.x, y: anchor.y },
                trackC: anchor.x + anchor.y,
            }),
        },
    ];

    let best = null;
    let bestDot = -Infinity;
    for (const c of candidates) {
        const dot = ux * c.ux + uy * c.uy;
        if (dot > bestDot) {
            bestDot = dot;
            best = c;
        }
    }
    return best.build();
}

// Start a new in-progress stroke anchored at `anchor`, initial direction
// picked to point toward `cursorPt`.
function startStrokeAtAnchor(anchor, cursorPt) {
    const track = trackFromAnchor(anchor, cursorPt);
    state.activeTrack = track;

    // Determine the "current node" (the other end of the initial 1-cell edge).
    // Anchor is always one of n1/n2. Find which and set minExt/maxExt.
    const other = eqPt(anchor, track.n1) ? track.n2 : track.n1;
    if (track.type === 'vertical') {
        state.minExt = Math.min(anchor.y, other.y);
        state.maxExt = Math.max(anchor.y, other.y);
    } else {
        state.minExt = Math.min(anchor.x, other.x);
        state.maxExt = Math.max(anchor.x, other.x);
    }

    const currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    currentPath.setAttribute('d', `M ${anchor.x} ${anchor.y} L ${other.x} ${other.y}`);
    currentPath.setAttribute('fill', 'none');
    currentPath.setAttribute('stroke', state.currentStrokeColor);
    currentPath.setAttribute('stroke-width', '4');
    currentPath.setAttribute('stroke-linecap', 'round');
    currentPath.setAttribute('stroke-linejoin', 'round');
    shapeLayer.appendChild(currentPath);
    state.currentPath = currentPath;
}

function eqPt(a, b) {
    return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

// --- Public mouse handlers ---

export function drawMouseDown(e) {
    if (e.button !== 0 || state.currentTool !== 'draw') return false;

    state.isDrawing = true;
    state.hasDragged = false;
    state.clickScreenPos = { x: e.clientX, y: e.clientY };

    const pt = getSvgPoint(e.clientX, e.clientY);
    state.lastCursorSvg = pt;
    state.activeTrack = getClosestTrack(pt);
    const at = state.activeTrack;

    let anchorNode, currentNode;
    if (
        Math.hypot(pt.x - at.n1.x, pt.y - at.n1.y) < Math.hypot(pt.x - at.n2.x, pt.y - at.n2.y)
    ) {
        anchorNode = at.n1;
        currentNode = at.n2;
    } else {
        anchorNode = at.n2;
        currentNode = at.n1;
    }

    if (at.type === 'vertical') {
        state.minExt = Math.min(anchorNode.y, currentNode.y);
        state.maxExt = Math.max(anchorNode.y, currentNode.y);
    } else {
        state.minExt = Math.min(anchorNode.x, currentNode.x);
        state.maxExt = Math.max(anchorNode.x, currentNode.x);
    }

    const currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    currentPath.setAttribute('d', `M ${anchorNode.x} ${anchorNode.y} L ${currentNode.x} ${currentNode.y}`);
    currentPath.setAttribute('fill', 'none');
    currentPath.setAttribute('stroke', state.currentStrokeColor);
    currentPath.setAttribute('stroke-width', '4');
    currentPath.setAttribute('stroke-linecap', 'round');
    currentPath.setAttribute('stroke-linejoin', 'round');
    shapeLayer.appendChild(currentPath);
    state.currentPath = currentPath;
    strokePreview.style.display = 'none';
    return true;
}

export function drawMouseMove(e) {
    const cursorSvg = getSvgPoint(e.clientX, e.clientY);
    // Always keep lastCursorSvg current so pivotDraw() has a valid cursor.
    state.lastCursorSvg = cursorSvg;

    // Pivot preview: user pressed Shift mid-drag; the current in-progress
    // stroke is committed and we're waiting for Shift release. Show the
    // rotating direction preview at the anchor.
    if (state.pivotPreview.active) {
        updatePivotPreview(cursorSvg);
        return true;
    }

    if (!(state.isDrawing && state.currentPath)) {
        // Hover preview when idle in draw mode.
        if (state.currentTool === 'draw') {
            const hoverTrack = getClosestTrack(cursorSvg);
            strokePreview.setAttribute(
                'd',
                `M ${hoverTrack.n1.x} ${hoverTrack.n1.y} L ${hoverTrack.n2.x} ${hoverTrack.n2.y}`
            );
            strokePreview.style.display = 'block';
        }
        return false;
    }

    if (
        !state.hasDragged &&
        Math.hypot(e.clientX - state.clickScreenPos.x, e.clientY - state.clickScreenPos.y) > 10
    )
        state.hasDragged = true;

    if (!state.hasDragged) return true;

    const pt = cursorSvg;
    const at = state.activeTrack;
    let snapX, snapY;

    if (at.type === 'horizontal') {
        snapX = Math.round(pt.x / 50) * 50;
        state.minExt = Math.min(state.minExt, snapX);
        state.maxExt = Math.max(state.maxExt, snapX);
        state.currentPath.setAttribute(
            'd',
            `M ${state.minExt} ${at.trackY} L ${state.maxExt} ${at.trackY}`
        );
    } else if (at.type === 'vertical') {
        snapY = Math.round(pt.y / 50) * 50;
        state.minExt = Math.min(state.minExt, snapY);
        state.maxExt = Math.max(state.maxExt, snapY);
        state.currentPath.setAttribute(
            'd',
            `M ${at.trackX} ${state.minExt} L ${at.trackX} ${state.maxExt}`
        );
    } else if (at.type === 'diag1') {
        snapX = Math.round(((pt.x + pt.y - at.trackC) / 2) / 50) * 50;
        state.minExt = Math.min(state.minExt, snapX);
        state.maxExt = Math.max(state.maxExt, snapX);
        state.currentPath.setAttribute(
            'd',
            `M ${state.minExt} ${state.minExt + at.trackC} L ${state.maxExt} ${state.maxExt + at.trackC}`
        );
    } else if (at.type === 'diag2') {
        snapX = Math.round(((pt.x - pt.y + at.trackC) / 2) / 50) * 50;
        state.minExt = Math.min(state.minExt, snapX);
        state.maxExt = Math.max(state.maxExt, snapX);
        state.currentPath.setAttribute(
            'd',
            `M ${state.minExt} ${-state.minExt + at.trackC} L ${state.maxExt} ${-state.maxExt + at.trackC}`
        );
    }
    return true;
}

export function drawMouseUp(e) {
    // If the user released the mouse while still in pivot preview mode
    // (Shift held, no in-progress stroke), cancel the preview and finish.
    if (state.pivotPreview.active) {
        cancelPivotPreview();
        state.isDrawing = false;
        state.currentPath = null;
        state.activeTrack = null;
        return;
    }

    if (!state.isDrawing) return;

    if (state.minExt === state.maxExt) {
        if (state.currentPath) state.currentPath.remove();
    } else {
        commitCurrentStroke();
    }

    state.isDrawing = false;
    state.currentPath = null;
    state.activeTrack = null;

    if (e && e.type === 'mouseup' && state.currentTool === 'draw') {
        const hoverTrack = getClosestTrack(getSvgPoint(e.clientX, e.clientY));
        strokePreview.setAttribute(
            'd',
            `M ${hoverTrack.n1.x} ${hoverTrack.n1.y} L ${hoverTrack.n2.x} ${hoverTrack.n2.y}`
        );
        strokePreview.style.display = 'block';
    }
}

// --- Pivot on Shift ---

// Called from keyboard.js when the user presses Shift while drawing.
// Commits the current stroke and enters "pivot preview" mode: the hover
// preview reappears anchored at the endpoint nearest the cursor and rotates
// with the mouse. The next stroke is only started when Shift is released.
export function pivotDraw() {
    if (!(state.isDrawing && state.currentPath && state.activeTrack)) return;

    const endpoints = currentStrokeEndpoints();
    const cursor = state.lastCursorSvg || endpoints[1];
    const anchor = nearEndpoint(endpoints, cursor);

    // Commit the current stroke.
    commitCurrentStroke();

    // Enter pivot preview mode. No new in-progress stroke yet — we wait for
    // Shift release to lock in the direction.
    state.currentPath = null;
    state.activeTrack = null;
    state.pivotPreview.active = true;
    state.pivotPreview.anchor = anchor;

    // Show the direction preview at the anchor, aimed at the current cursor.
    updatePivotPreview(cursor);
}

// Update the light-blue direction preview to point from the pivot anchor
// toward the given cursor point. Called from drawMouseMove while in pivot
// preview mode.
function updatePivotPreview(cursorSvg) {
    if (!state.pivotPreview.active || !state.pivotPreview.anchor) return;
    const anchor = state.pivotPreview.anchor;
    const track = trackFromAnchor(anchor, cursorSvg);
    strokePreview.setAttribute(
        'd',
        `M ${track.n1.x} ${track.n1.y} L ${track.n2.x} ${track.n2.y}`
    );
    strokePreview.style.display = 'block';
}

// Called from keyboard.js on Shift keyup. Exits pivot preview mode and
// starts a real in-progress stroke in the currently-previewed direction so
// the user can continue drawing seamlessly.
export function finalizePivot() {
    if (!state.pivotPreview.active) return;
    const anchor = state.pivotPreview.anchor;
    const cursor = state.lastCursorSvg || anchor;
    state.pivotPreview.active = false;
    state.pivotPreview.anchor = null;
    strokePreview.style.display = 'none';
    if (!state.isDrawing) return; // mouse was released while Shift held

    // Start the new in-progress stroke in the direction currently under the
    // cursor. The user was already dragging, so extend immediately on the
    // next mousemove.
    startStrokeAtAnchor(anchor, cursor);
    state.hasDragged = true;
}

// If the user releases the mouse while still holding Shift (pivot preview
// active), abort the preview without committing anything new.
export function cancelPivotPreview() {
    if (!state.pivotPreview.active) return;
    state.pivotPreview.active = false;
    state.pivotPreview.anchor = null;
    strokePreview.style.display = 'none';
}
