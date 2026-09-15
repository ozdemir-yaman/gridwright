/* =========================================================================
   Gridwright — Select tool
   Marquee selection, click/shift-click, drag-move, transforms (rotate/flip/
   duplicate/delete), clipboard, selection UI (bbox + action bar).
   ========================================================================= */

import { state } from '../state.js';
import { svg, shapeLayer, svgToScreen, getSvgPoint } from '../svg.js';
import { processLineWalls } from '../walls.js';
import { pathDataStore, commitNewPath, deduplicateSubset, mergeAllTouchingPaths } from '../paths.js';
import { setTool } from '../toolbar.js';
import { pushHistory } from '../history.js';

// --- Overlay elements (bbox + marquee + template ghost) ---
const selectOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
selectOverlay.id = 'select-overlay';
svg.appendChild(selectOverlay);

const bboxRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
bboxRect.classList.add('selection-bbox');
bboxRect.style.display = 'none';
selectOverlay.appendChild(bboxRect);

export const marqueeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
marqueeRect.classList.add('marquee-rect');
marqueeRect.style.display = 'none';
selectOverlay.appendChild(marqueeRect);

export const templateGhostGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
templateGhostGroup.id = 'template-ghost';
templateGhostGroup.classList.add('template-ghost');
templateGhostGroup.style.display = 'none';
svg.appendChild(templateGhostGroup);

let selectionActionsEl = null;
export function initSelectionUI() {
    selectionActionsEl = document.getElementById('selection-actions');
}

export function getSelectionActionsEl() {
    return selectionActionsEl;
}

export function findPathObjForElement(el) {
    return pathDataStore.find((p) => p.el === el) || null;
}

export function computeSelectionBBox() {
    const sel = state.selection;
    if (sel.size === 0) return null;
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    sel.forEach((po) => {
        for (const pt of po.pts) {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
        }
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function updateSelectionUI() {
    if (!selectionActionsEl) return;
    const bb = computeSelectionBBox();
    if (!bb || state.selection.size === 0) {
        bboxRect.style.display = 'none';
        selectionActionsEl.style.display = 'none';
        return;
    }
    bboxRect.setAttribute('x', bb.x - 4);
    bboxRect.setAttribute('y', bb.y - 4);
    bboxRect.setAttribute('width', bb.w + 8);
    bboxRect.setAttribute('height', bb.h + 8);
    bboxRect.style.display = 'block';

    const topCenter = svgToScreen(bb.x + bb.w / 2, bb.y - 4);
    selectionActionsEl.style.left = topCenter.x + 'px';
    selectionActionsEl.style.top = topCenter.y + 'px';
    selectionActionsEl.style.display = 'flex';
}

export function clearSelection() {
    const hadSelection = state.selection.size > 0;
    state.selection.forEach((po) => po.el.classList.remove('selected'));
    state.selection.clear();
    // Merge same-color paths whose endpoints touch — deferred from every
    // per-drop commit so drag/rotate/paste doesn't rope in adjacent paths
    // mid-edit. Runs only if something was actually selected, so click-in-
    // empty-space is still cheap.
    if (hadSelection) mergeAllTouchingPaths();
    updateSelectionUI();
}

export function addToSelection(pathObj) {
    state.selection.add(pathObj);
    pathObj.el.classList.add('selected');
    updateSelectionUI();
}

export function toggleInSelection(pathObj) {
    if (state.selection.has(pathObj)) {
        state.selection.delete(pathObj);
        pathObj.el.classList.remove('selected');
    } else {
        state.selection.add(pathObj);
        pathObj.el.classList.add('selected');
    }
    updateSelectionUI();
}

export function replaceSelection(pathObj) {
    state.selection.forEach((po) => po.el.classList.remove('selected'));
    state.selection.clear();
    if (pathObj) {
        state.selection.add(pathObj);
        pathObj.el.classList.add('selected');
    }
    updateSelectionUI();
}

// --- Marquee & drag-move state helpers ---

function updateGroupTranslateForDrag(dx, dy) {
    state.selection.forEach((po) => {
        po.el.setAttribute('transform', `translate(${dx} ${dy})`);
    });
    const bb = computeSelectionBBox();
    if (bb) {
        bboxRect.setAttribute('x', bb.x - 4 + dx);
        bboxRect.setAttribute('y', bb.y - 4 + dy);
        const topCenter = svgToScreen(bb.x + bb.w / 2 + dx, bb.y - 4 + dy);
        selectionActionsEl.style.left = topCenter.x + 'px';
        selectionActionsEl.style.top = topCenter.y + 'px';
    }
}

function commitDragMove(dx, dy) {
    if (dx === 0 && dy === 0) {
        state.selection.forEach((po) => po.el.removeAttribute('transform'));
        updateSelectionUI();
        return;
    }
    pushHistory();
    const snapshots = [];
    state.selection.forEach((po) => {
        snapshots.push({
            pts: po.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            isClosed: po.isClosed,
            stroke: po.stroke,
            oldPts: po.pts,
            oldEl: po.el,
        });
    });
    // Remove old walls & DOM
    snapshots.forEach((s) => {
        for (let i = 0; i < s.oldPts.length - 1; i++)
            processLineWalls(
                s.oldPts[i].x,
                s.oldPts[i].y,
                s.oldPts[i + 1].x,
                s.oldPts[i + 1].y,
                false
            );
        if (s.isClosed)
            processLineWalls(
                s.oldPts[s.oldPts.length - 1].x,
                s.oldPts[s.oldPts.length - 1].y,
                s.oldPts[0].x,
                s.oldPts[0].y,
                false
            );
        s.oldEl.remove();
    });
    const oldSet = new Set(Array.from(state.selection));
    for (let i = pathDataStore.length - 1; i >= 0; i--) {
        if (oldSet.has(pathDataStore[i])) pathDataStore.splice(i, 1);
    }
    const newSelection = new Set();
    snapshots.forEach((s) => {
        const created = commitNewPath(s.pts, s.isClosed, s.stroke);
        created.forEach((po) => newSelection.add(po));
    });
    state.selection.forEach((po) => po.el && po.el.classList.remove('selected'));
    state.selection.clear();
    newSelection.forEach((po) => {
        state.selection.add(po);
        po.el.classList.add('selected');
    });
    updateSelectionUI();
}

// --- Transforms ---

function snappedSelectionCenter() {
    const bb = computeSelectionBBox();
    if (!bb) return null;
    return {
        cx: Math.round((bb.x + bb.w / 2) / 50) * 50,
        cy: Math.round((bb.y + bb.h / 2) / 50) * 50,
    };
}

function applyTransformToSelection(fn) {
    if (state.selection.size === 0) return;
    const center = snappedSelectionCenter();
    if (!center) return;
    pushHistory();
    const snapshots = [];
    state.selection.forEach((po) => {
        snapshots.push({
            pts: po.pts.map((p) => fn(p, center)),
            isClosed: po.isClosed,
            stroke: po.stroke,
            oldPts: po.pts,
            oldEl: po.el,
            oldRef: po,
        });
    });
    snapshots.forEach((s) => {
        for (let i = 0; i < s.oldPts.length - 1; i++)
            processLineWalls(
                s.oldPts[i].x,
                s.oldPts[i].y,
                s.oldPts[i + 1].x,
                s.oldPts[i + 1].y,
                false
            );
        if (s.isClosed)
            processLineWalls(
                s.oldPts[s.oldPts.length - 1].x,
                s.oldPts[s.oldPts.length - 1].y,
                s.oldPts[0].x,
                s.oldPts[0].y,
                false
            );
        s.oldEl.remove();
    });
    const oldSet = new Set(snapshots.map((s) => s.oldRef));
    for (let i = pathDataStore.length - 1; i >= 0; i--) {
        if (oldSet.has(pathDataStore[i])) pathDataStore.splice(i, 1);
    }
    const newSelection = new Set();
    snapshots.forEach((s) => {
        const created = commitNewPath(s.pts, s.isClosed, s.stroke);
        created.forEach((po) => newSelection.add(po));
    });
    state.selection.forEach((po) => po.el && po.el.classList.remove('selected'));
    state.selection.clear();
    newSelection.forEach((po) => {
        state.selection.add(po);
        po.el.classList.add('selected');
    });
    updateSelectionUI();
}

export const rotateCW = (pt, c) => ({ x: c.cx + (c.cy - pt.y), y: c.cy + (pt.x - c.cx) });
export const rotateCCW = (pt, c) => ({ x: c.cx - (c.cy - pt.y), y: c.cy - (pt.x - c.cx) });
// Horizontal flip: mirror x across the center's vertical axis (swap left/right).
export const flipH = (pt, c) => ({ x: 2 * c.cx - pt.x, y: pt.y });
// Vertical flip: mirror y across the center's horizontal axis (swap top/bottom).
export const flipV = (pt, c) => ({ x: pt.x, y: 2 * c.cy - pt.y });

export function rotateSelectionCW() {
    applyTransformToSelection(rotateCW);
}
export function rotateSelectionCCW() {
    applyTransformToSelection(rotateCCW);
}
export function flipSelectionH() {
    applyTransformToSelection(flipH);
}
export function flipSelectionV() {
    applyTransformToSelection(flipV);
}

export function deleteSelection() {
    if (state.selection.size === 0) return;
    pushHistory();
    state.selection.forEach((po) => {
        for (let i = 0; i < po.pts.length - 1; i++)
            processLineWalls(po.pts[i].x, po.pts[i].y, po.pts[i + 1].x, po.pts[i + 1].y, false);
        if (po.isClosed)
            processLineWalls(
                po.pts[po.pts.length - 1].x,
                po.pts[po.pts.length - 1].y,
                po.pts[0].x,
                po.pts[0].y,
                false
            );
        po.el.remove();
        const idx = pathDataStore.indexOf(po);
        if (idx !== -1) pathDataStore.splice(idx, 1);
    });
    state.selection.clear();
    updateSelectionUI();
}

// Manual dedup — trimmed segments overlapping walls contributed by paths
// OUTSIDE the selection are considered legitimate crossings and are left
// intact. Only overlap WITHIN the selection (later-selected paths overlapping
// earlier ones) is cleaned up. The resulting survivors replace the current
// selection so the user can continue working with them.
export function deduplicateSelectionAction() {
    if (state.selection.size === 0) return;
    pushHistory();
    const subset = Array.from(state.selection);
    const survivors = deduplicateSubset(subset);
    state.selection.forEach((po) => po.el && po.el.classList.remove('selected'));
    state.selection.clear();
    survivors.forEach((po) => {
        state.selection.add(po);
        po.el.classList.add('selected');
    });
    updateSelectionUI();
}

// --- Clipboard ---
export function copySelectionToClipboard() {
    if (state.selection.size === 0) return;
    const bb = computeSelectionBBox();
    if (!bb) return;
    const paths = [];
    state.selection.forEach((po) => {
        paths.push({
            pts: po.pts.map((p) => ({ x: p.x - bb.x, y: p.y - bb.y })),
            isClosed: po.isClosed,
            stroke: po.stroke,
        });
    });
    state.clipboard = { paths, w: bb.w, h: bb.h };
}

export function pasteClipboardAt(originX, originY) {
    if (!state.clipboard) return;
    pushHistory();
    const ox = Math.round(originX / 50) * 50;
    const oy = Math.round(originY / 50) * 50;
    const newSelection = new Set();
    state.clipboard.paths.forEach((entry) => {
        const pts = entry.pts.map((p) => ({ x: p.x + ox, y: p.y + oy }));
        const created = commitNewPath(pts, entry.isClosed, entry.stroke);
        created.forEach((po) => newSelection.add(po));
    });
    state.selection.forEach((po) => po.el.classList.remove('selected'));
    state.selection.clear();
    newSelection.forEach((po) => {
        state.selection.add(po);
        po.el.classList.add('selected');
    });
    updateSelectionUI();
}

// --- Pointer handlers (bubble phase on svg) ---

export function selectMouseDown(e) {
    if (state.currentTool !== 'select' || e.button !== 0) return false;
    if (state.placeMode.active) return false;
    const pt = getSvgPoint(e.clientX, e.clientY);
    const clickedPathObj =
        e.target.parentNode === shapeLayer ? findPathObjForElement(e.target) : null;

    // Check if the click landed inside the current selection's bbox — used to
    // enable dragging by clicking anywhere inside a selected shape's interior
    // (not just on its stroke). Applies whenever there IS a selection and no
    // shift-modifier (which is reserved for shrinking/expanding the set).
    const bb = state.selection.size > 0 ? computeSelectionBBox() : null;
    const insideSelectionBBox =
        bb !== null &&
        pt.x >= bb.x &&
        pt.x <= bb.x + bb.w &&
        pt.y >= bb.y &&
        pt.y <= bb.y + bb.h;

    if (clickedPathObj) {
        if (e.shiftKey) {
            toggleInSelection(clickedPathObj);
        } else if (!state.selection.has(clickedPathObj)) {
            replaceSelection(clickedPathObj);
        }
        if (state.selection.has(clickedPathObj)) {
            state.selMode = 'drag';
            state.dragAnchorSvg = pt;
            state.dragTotalDelta = { dx: 0, dy: 0 };
            state.dragOriginalPts = new Map();
            state.selection.forEach((po) =>
                state.dragOriginalPts.set(po, po.pts.map((p) => ({ ...p })))
            );
            svg.style.cursor = 'grabbing';
        }
    } else if (insideSelectionBBox && !e.shiftKey) {
        // Empty click but inside a selection's bbox → begin dragging the
        // whole selection rather than clearing it.
        state.selMode = 'drag';
        state.dragAnchorSvg = pt;
        state.dragTotalDelta = { dx: 0, dy: 0 };
        state.dragOriginalPts = new Map();
        state.selection.forEach((po) =>
            state.dragOriginalPts.set(po, po.pts.map((p) => ({ ...p })))
        );
        svg.style.cursor = 'grabbing';
    } else {
        // Click on empty background.
        if (!e.shiftKey && state.selection.size > 0) {
            clearSelection();
            setTool('none');
            return true;
        }
        state.selMode = 'marquee';
        state.marqueeStartSvg = pt;
        marqueeRect.setAttribute('x', pt.x);
        marqueeRect.setAttribute('y', pt.y);
        marqueeRect.setAttribute('width', 0);
        marqueeRect.setAttribute('height', 0);
        marqueeRect.style.display = 'block';
    }
    return true;
}

export function selectMouseMove(e) {
    if (state.currentTool !== 'select') return false;
    state.lastCursorSvg = getSvgPoint(e.clientX, e.clientY);
    if (state.selMode === 'marquee' && state.marqueeStartSvg) {
        const cur = state.lastCursorSvg;
        const x = Math.min(state.marqueeStartSvg.x, cur.x);
        const y = Math.min(state.marqueeStartSvg.y, cur.y);
        const w = Math.abs(cur.x - state.marqueeStartSvg.x);
        const h = Math.abs(cur.y - state.marqueeStartSvg.y);
        marqueeRect.setAttribute('x', x);
        marqueeRect.setAttribute('y', y);
        marqueeRect.setAttribute('width', w);
        marqueeRect.setAttribute('height', h);
    } else if (state.selMode === 'drag' && state.dragAnchorSvg) {
        const rawDx = state.lastCursorSvg.x - state.dragAnchorSvg.x;
        const rawDy = state.lastCursorSvg.y - state.dragAnchorSvg.y;
        const dx = Math.round(rawDx / 50) * 50;
        const dy = Math.round(rawDy / 50) * 50;
        state.dragTotalDelta = { dx, dy };
        updateGroupTranslateForDrag(dx, dy);
    } else {
        // Hover: show the grab cursor while over the selection bbox interior
        // so it's obvious the region is draggable.
        const bb = state.selection.size > 0 ? computeSelectionBBox() : null;
        const inside =
            bb !== null &&
            state.lastCursorSvg.x >= bb.x &&
            state.lastCursorSvg.x <= bb.x + bb.w &&
            state.lastCursorSvg.y >= bb.y &&
            state.lastCursorSvg.y <= bb.y + bb.h;
        svg.style.cursor = inside ? 'grab' : 'default';
    }
    return true;
}

export function selectMouseUp(e) {
    if (state.currentTool !== 'select') return;
    if (state.selMode === 'marquee' && state.marqueeStartSvg) {
        const cur = getSvgPoint(e.clientX, e.clientY);
        const x1 = Math.min(state.marqueeStartSvg.x, cur.x);
        const y1 = Math.min(state.marqueeStartSvg.y, cur.y);
        const x2 = Math.max(state.marqueeStartSvg.x, cur.x);
        const y2 = Math.max(state.marqueeStartSvg.y, cur.y);
        if (x2 - x1 > 2 || y2 - y1 > 2) {
            for (const po of pathDataStore) {
                const anyIn = po.pts.some(
                    (p) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2
                );
                if (anyIn && !state.selection.has(po)) {
                    state.selection.add(po);
                    po.el.classList.add('selected');
                }
            }
        }
        marqueeRect.style.display = 'none';
        state.marqueeStartSvg = null;
        state.selMode = null;
        updateSelectionUI();
    } else if (state.selMode === 'drag' && state.dragAnchorSvg) {
        commitDragMove(state.dragTotalDelta.dx, state.dragTotalDelta.dy);
        state.dragAnchorSvg = null;
        state.dragOriginalPts = null;
        state.selMode = null;
        svg.style.cursor = 'default';
    }
}
