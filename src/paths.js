/* =========================================================================
   Gridwright — Path store: pathObj creation, merging, and commit helper.
   ========================================================================= */

import { eq } from './state.js';
import { shapeLayer } from './svg.js';
import { drawnWalls, formatWall, processLineWalls } from './walls.js';

// Every drawn path is tracked here as { el, pts, isClosed, stroke }.
export const pathDataStore = [];

// Rebuild the DOM path's `d` attribute from its points.
export function rebuildPathD(po) {
    let d = `M ${po.pts[0].x} ${po.pts[0].y}`;
    for (let i = 1; i < po.pts.length; i++) d += ` L ${po.pts[i].x} ${po.pts[i].y}`;
    if (po.isClosed) d += ' Z';
    po.el.setAttribute('d', d);
}

// Break a segment [p1, p2] into unit sub-segments (50px axis-aligned or 25px
// half-diagonals). Returns an array of { a, b, key } where a/b are the unit
// endpoints and key is the drawnWalls key for that unit.
export function drawUnitSegments(p1, p2) {
    const x1 = Math.round(p1.x),
        y1 = Math.round(p1.y),
        x2 = Math.round(p2.x),
        y2 = Math.round(p2.y);
    if (x1 === x2 && y1 === y2) return [];
    const dx = x2 - x1,
        dy = y2 - y1;
    const out = [];
    if (dx === 0) {
        const dir = dy > 0 ? 50 : -50;
        for (let y = y1; y !== y2; y += dir) {
            const a = { x: x1, y },
                b = { x: x1, y: y + dir };
            out.push({ a, b, key: formatWall(a.x, a.y, b.x, b.y) });
        }
    } else if (dy === 0) {
        const dir = dx > 0 ? 50 : -50;
        for (let x = x1; x !== x2; x += dir) {
            const a = { x, y: y1 },
                b = { x: x + dir, y: y1 };
            out.push({ a, b, key: formatWall(a.x, a.y, b.x, b.y) });
        }
    } else {
        // Diagonal: 25px half-diagonal steps.
        const stepX = dx > 0 ? 25 : -25;
        const stepY = dy > 0 ? 25 : -25;
        let x = x1,
            y = y1;
        while (x !== x2 || y !== y2) {
            const a = { x, y },
                b = { x: x + stepX, y: y + stepY };
            out.push({ a, b, key: formatWall(a.x, a.y, b.x, b.y) });
            x += stepX;
            y += stepY;
        }
    }
    return out;
}

// Given a sequence of pts (open or closed), expand into a flat array of
// unit-segments in draw order.
function expandToUnitSegments(pts, isClosed) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
        for (const u of drawUnitSegments(pts[i], pts[i + 1])) out.push(u);
    }
    if (isClosed) {
        for (const u of drawUnitSegments(pts[pts.length - 1], pts[0])) out.push(u);
    }
    return out;
}

// Remove intermediate points that are collinear with their neighbors so the
// resulting path only has vertices at direction changes and its endpoints.
// This is critical for downstream tools (e.g. erase) that assume segment
// endpoints sit at 50px grid corners rather than at half-diagonal midpoints.
export function simplifyCollinear(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
        const prev = out[out.length - 1];
        const cur = pts[i];
        const next = pts[i + 1];
        const dx1 = cur.x - prev.x,
            dy1 = cur.y - prev.y;
        const dx2 = next.x - cur.x,
            dy2 = next.y - cur.y;
        // Cross-product = 0 means the three points are collinear. Also require
        // that the direction sign matches so we don't collapse a doubled-back
        // point into a corner.
        const cross = dx1 * dy2 - dy1 * dx2;
        const sameDir = dx1 * dx2 + dy1 * dy2 > 0;
        if (cross === 0 && sameDir) continue; // drop cur — it's on the same track
        out.push(cur);
    }
    out.push(pts[pts.length - 1]);
    return out;
}

// Create a <path> element in shapeLayer, register it in pathDataStore.
// Returns the new pathObj.
export function createFinalPathReturning(pts, isClosed, stroke) {
    if (pts.length < 2) return null;
    const finalPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
    if (isClosed) {
        d += ' Z';
        finalPath.classList.add('polygon');
    }
    finalPath.setAttribute('d', d);
    finalPath.setAttribute('stroke', stroke);
    finalPath.setAttribute('stroke-width', '4');
    finalPath.setAttribute('stroke-linecap', 'round');
    finalPath.setAttribute('stroke-linejoin', 'round');
    finalPath.setAttribute('fill', isClosed ? 'transparent' : 'none');
    shapeLayer.appendChild(finalPath);
    const po = { el: finalPath, pts: pts, isClosed: isClosed, stroke: stroke };
    pathDataStore.push(po);
    return po;
}

// Merge a fresh points array into the existing pathDataStore, absorbing any
// same-color adjacent open paths whose endpoints touch either end of newPts.
// Returns { pts, isClosed } describing the merged sequence.
export function mergePathIntoStore(newPts, stroke) {
    let mergedSomething = true;
    while (mergedSomething) {
        mergedSomething = false;
        for (let i = 0; i < pathDataStore.length; i++) {
            const existing = pathDataStore[i],
                exPts = existing.pts;
            if (existing.stroke !== stroke) continue;
            if (existing.isClosed) continue;

            if (eq(newPts[0], exPts[exPts.length - 1])) newPts = exPts.concat(newPts.slice(1));
            else if (eq(newPts[newPts.length - 1], exPts[0]))
                newPts = newPts.concat(exPts.slice(1));
            else if (eq(newPts[0], exPts[0]))
                newPts = exPts.slice().reverse().concat(newPts.slice(1));
            else if (eq(newPts[newPts.length - 1], exPts[exPts.length - 1]))
                newPts = newPts.concat(exPts.slice().reverse().slice(1));
            else continue;

            for (let j = 0; j < exPts.length - 1; j++)
                processLineWalls(exPts[j].x, exPts[j].y, exPts[j + 1].x, exPts[j + 1].y, false);
            existing.el.remove();
            pathDataStore.splice(i, 1);
            mergedSomething = true;
            break;
        }
    }

    let isClosed = false;
    if (newPts.length >= 4 && eq(newPts[0], newPts[newPts.length - 1])) {
        isClosed = true;
        newPts.pop();
    }
    return { pts: newPts, isClosed: isClosed };
}

// Scan the whole canvas and merge every pair of same-color open paths whose
// endpoints touch. Repeats until no further merges are possible. Called when
// the user commits their edits (e.g. by clearing the selection) so that
// paths dragged/pasted next to each other end up as a single continuous
// stroke. Merging while a selection is still active would fight the user's
// in-progress manipulation.
export function mergeAllTouchingPaths() {
    let mergedSomething = true;
    while (mergedSomething) {
        mergedSomething = false;
        outer: for (let i = 0; i < pathDataStore.length; i++) {
            const a = pathDataStore[i];
            if (a.isClosed) continue;
            for (let j = i + 1; j < pathDataStore.length; j++) {
                const b = pathDataStore[j];
                if (b.isClosed) continue;
                if (a.stroke !== b.stroke) continue;

                const aPts = a.pts;
                const bPts = b.pts;
                let combined;
                if (eq(aPts[aPts.length - 1], bPts[0])) {
                    combined = aPts.concat(bPts.slice(1));
                } else if (eq(bPts[bPts.length - 1], aPts[0])) {
                    combined = bPts.concat(aPts.slice(1));
                } else if (eq(aPts[0], bPts[0])) {
                    combined = aPts.slice().reverse().concat(bPts.slice(1));
                } else if (eq(aPts[aPts.length - 1], bPts[bPts.length - 1])) {
                    combined = aPts.concat(bPts.slice().reverse().slice(1));
                } else {
                    continue;
                }

                // Detect closure: if the ends of the combined polyline coincide,
                // fold into a closed path and drop the duplicate tail vertex.
                let isClosed = false;
                if (combined.length >= 4 && eq(combined[0], combined[combined.length - 1])) {
                    isClosed = true;
                    combined.pop();
                }

                // Retire both source paths — no wall changes since the union
                // covers exactly the same walls the two components did.
                a.el.remove();
                b.el.remove();
                pathDataStore.splice(j, 1);
                pathDataStore.splice(i, 1);

                // Simplify collinear midpoints introduced by the join, then
                // emit the merged path as a fresh DOM node.
                const cleaned = simplifyCollinear(combined);
                createFinalPathReturning(cleaned, isClosed, a.stroke);

                mergedSomething = true;
                break outer;
            }
        }
    }
}

// Commit a fresh path (from duplicate / paste / place / transform-recreate).
// Emits the path AS-IS — no merging with adjacent same-color paths and no
// segment-level dedup. The user's in-progress edits stay visually intact
// during selection. Merging + dedup are user-driven actions triggered from
// the selection action bar (or on selection end for merge).
//
// Returns an array of created pathObjs (0 or 1 — the array shape is kept
// for symmetry with the dedup-time path splitter which can produce many).
export function commitNewPath(pts, isClosed, stroke) {
    if (!pts || pts.length < 2) return [];
    const workPts = pts.slice();
    const workClosed = isClosed;
    // Register walls for each segment. Set semantics mean overlap is harmless
    // at the wall-registry level; the SVG stroke may visually stack but that's
    // resolved later by merge/dedup.
    for (let i = 0; i < workPts.length - 1; i++)
        processLineWalls(
            workPts[i].x,
            workPts[i].y,
            workPts[i + 1].x,
            workPts[i + 1].y,
            true
        );
    if (workClosed)
        processLineWalls(
            workPts[workPts.length - 1].x,
            workPts[workPts.length - 1].y,
            workPts[0].x,
            workPts[0].y,
            true
        );
    const po = createFinalPathReturning(workPts, workClosed, stroke);
    return po ? [po] : [];
}

// Deduplicate walls across the entire canvas. Walks pathDataStore in order
// (oldest first) so established paths keep their coverage; newer paths that
// re-cover the same walls are trimmed (or removed entirely if fully covered).
export function deduplicateAllPaths() {
    dedupePaths(pathDataStore.slice(), null);
}

// Deduplicate a subset of paths against the rest of the canvas. Non-subset
// paths are treated as immutable "background" — their walls are protected.
// Subset paths are then walked in order and trimmed against the already-
// claimed walls. This is the manual "Deduplicate Selection" operation.
// Returns the array of surviving pathObjs that used to be in `subset`.
export function deduplicateSubset(subset) {
    const subsetSet = new Set(subset);
    const background = pathDataStore.filter((p) => !subsetSet.has(p));
    const foreground = pathDataStore.filter((p) => subsetSet.has(p));
    return dedupePaths(foreground, background);
}

// Core dedup routine. `foreground` paths are candidates for trimming;
// `background` paths (if provided) have their walls pre-claimed and are
// never modified. If `background` is null, ALL paths are candidates and the
// canvas is rebuilt from scratch.
//
// Returns the surviving pathObjs derived from `foreground`.
function dedupePaths(foreground, background) {
    // Rebuild the wall registry from scratch.
    drawnWalls.clear();

    if (background) {
        // Reclaim background walls without touching their DOM. These walls
        // are now permanent for the duration of this dedup pass.
        for (const po of background) {
            for (let i = 0; i < po.pts.length - 1; i++)
                processLineWalls(
                    po.pts[i].x,
                    po.pts[i].y,
                    po.pts[i + 1].x,
                    po.pts[i + 1].y,
                    true
                );
            if (po.isClosed)
                processLineWalls(
                    po.pts[po.pts.length - 1].x,
                    po.pts[po.pts.length - 1].y,
                    po.pts[0].x,
                    po.pts[0].y,
                    true
                );
        }
        // Take foreground out of the store; the rest of this routine will
        // re-emit its survivors.
        pathDataStore.length = 0;
        for (const po of background) pathDataStore.push(po);
    } else {
        pathDataStore.length = 0;
    }

    const survivors = [];
    for (const po of foreground) {
        let units = expandToUnitSegments(po.pts, po.isClosed);
        if (units.length === 0) {
            po.el.remove();
            continue;
        }

        // For closed inputs, rotate the units array so any drop naturally
        // falls at the beginning. This stitches together runs that would
        // otherwise be split across the loop's arbitrary seam.
        if (po.isClosed) {
            const firstDrop = units.findIndex((u) => drawnWalls.has(u.key));
            if (firstDrop > 0) {
                units = units.slice(firstDrop).concat(units.slice(0, firstDrop));
            }
        }

        const runs = [];
        let cur = null;
        let droppedAny = false;
        for (const u of units) {
            if (drawnWalls.has(u.key)) {
                droppedAny = true;
                cur = null;
                continue;
            }
            drawnWalls.add(u.key);
            if (!cur) {
                cur = [u.a, u.b];
                runs.push(cur);
            } else {
                cur.push(u.b);
            }
        }

        // Everything intact → reuse existing DOM node.
        if (!droppedAny && runs.length === 1) {
            pathDataStore.push(po);
            survivors.push(po);
            continue;
        }

        // Partial (or zero) survival → retire old DOM, emit each run.
        po.el.remove();
        for (const seq of runs) {
            if (seq.length < 2) continue;
            const simplified = simplifyCollinear(seq);
            const created = createFinalPathReturning(simplified, false, po.stroke);
            if (created) survivors.push(created);
        }
    }
    return survivors;
}

// Rescue any existing <path> elements (baked into HTML) into pathDataStore.
export function initializeExistingPaths() {
    const paths = shapeLayer.querySelectorAll('path');
    paths.forEach((p) => {
        const d = p.getAttribute('d');
        if (!d) return;
        const coords = d.match(/-?\d+(\.\d+)?/g);
        if (coords && coords.length >= 4) {
            const pts = [];
            for (let i = 0; i < coords.length; i += 2)
                pts.push({ x: parseFloat(coords[i]), y: parseFloat(coords[i + 1]) });

            let isClosed = false;
            if (d.includes('Z') || d.includes('z')) {
                isClosed = true;
                if (
                    pts.length >= 2 &&
                    pts[0].x === pts[pts.length - 1].x &&
                    pts[0].y === pts[pts.length - 1].y
                )
                    pts.pop();
            }

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

            const stroke = p.getAttribute('stroke') || '#222222';
            pathDataStore.push({ el: p, pts: pts, isClosed: isClosed, stroke: stroke });
        }
    });
}
