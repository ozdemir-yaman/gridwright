/* =========================================================================
   Gridwright — Wall registry
   Tracks which cell-edge and half-diagonal walls are occupied. Used only to
   prevent overlapping strokes from stacking (which would otherwise widen).
   ========================================================================= */

// Set<wallKey> — one entry per occupied edge or half-diagonal.
export const drawnWalls = new Set();

export function formatWall(x1, y1, x2, y2) {
    if (x1 > x2 || (x1 === x2 && y1 > y2))
        return `${Math.round(x2)},${Math.round(y2)}|${Math.round(x1)},${Math.round(y1)}`;
    return `${Math.round(x1)},${Math.round(y1)}|${Math.round(x2)},${Math.round(y2)}`;
}

export function processLineWalls(x1, y1, x2, y2, isAdding) {
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    x2 = Math.round(x2);
    y2 = Math.round(y2);
    if (x1 === x2 && y1 === y2) return;

    const dx = x2 - x1;
    const dy = y2 - y1;

    const applyWall = (a1, b1, a2, b2) => {
        const w = formatWall(a1, b1, a2, b2);
        if (isAdding) drawnWalls.add(w);
        else drawnWalls.delete(w);
    };

    if (dx === 0) {
        const minY = Math.min(y1, y2),
            maxY = Math.max(y1, y2);
        for (let y = minY; y < maxY; y += 50) applyWall(x1, y, x1, y + 50);
    } else if (dy === 0) {
        const minX = Math.min(x1, x2),
            maxX = Math.max(x1, x2);
        for (let x = minX; x < maxX; x += 50) applyWall(x, y1, x + 50, y1);
    } else {
        const minX = Math.min(x1, x2),
            maxX = Math.max(x1, x2);
        const yStart = x1 === minX ? y1 : y2,
            slope = dy / dx;
        for (let x = minX; x < maxX; x += 25) {
            const currentY = yStart + (x - minX) * slope;
            applyWall(x, currentY, x + 25, currentY + 25 * slope);
        }
    }
}

// Compute the wall keys a segment would occupy, without mutating drawnWalls.
export function segmentWallKeys(x1, y1, x2, y2) {
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    x2 = Math.round(x2);
    y2 = Math.round(y2);
    if (x1 === x2 && y1 === y2) return [];
    const dx = x2 - x1,
        dy = y2 - y1;
    const keys = [];
    if (dx === 0) {
        const minY = Math.min(y1, y2),
            maxY = Math.max(y1, y2);
        for (let y = minY; y < maxY; y += 50) keys.push(formatWall(x1, y, x1, y + 50));
    } else if (dy === 0) {
        const minX = Math.min(x1, x2),
            maxX = Math.max(x1, x2);
        for (let x = minX; x < maxX; x += 50) keys.push(formatWall(x, y1, x + 50, y1));
    } else {
        const minX = Math.min(x1, x2),
            maxX = Math.max(x1, x2);
        const yStart = x1 === minX ? y1 : y2,
            slope = dy / dx;
        for (let x = minX; x < maxX; x += 25) {
            const currentY = yStart + (x - minX) * slope;
            keys.push(formatWall(x, currentY, x + 25, currentY + 25 * slope));
        }
    }
    return keys;
}

// Would this path (given by pts + isClosed) overlap ANY already-occupied wall?
// Returns true if every one of its segments' walls are already occupied
// (i.e., the whole path is a duplicate on top of existing shapes).
export function pathHasFullOverlap(pts, isClosed) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
    if (isClosed) segs.push([pts[pts.length - 1], pts[0]]);
    if (segs.length === 0) return false;
    for (const [a, b] of segs) {
        const keys = segmentWallKeys(a.x, a.y, b.x, b.y);
        if (keys.length === 0) return false; // zero-length segment
        for (const k of keys) if (!drawnWalls.has(k)) return false;
    }
    return true;
}

// Returns true if ANY wall of the path already exists in drawnWalls.
// Stricter than pathHasFullOverlap — used by the draw tool to prevent
// stroke stacking, so drawing on top of any existing line is a no-op.
export function pathHasAnyOverlap(pts, isClosed) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
    if (isClosed) segs.push([pts[pts.length - 1], pts[0]]);
    for (const [a, b] of segs) {
        const keys = segmentWallKeys(a.x, a.y, b.x, b.y);
        for (const k of keys) if (drawnWalls.has(k)) return true;
    }
    return false;
}
