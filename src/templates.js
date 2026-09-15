/* =========================================================================
   Gridwright — Template data helpers
   Shared building blocks for the standard Gridwright template envelope:
     { id, name, createdAt, bbox: {w, h}, paths: [{pts, isClosed, stroke}] }
   Coordinates are normalized so bbox top-left is (0, 0).

   The full "user templates" localStorage feature that used to live here
   has been retired in favor of the user gallery (see src/user-gallery.js).
   This module keeps only the pure helpers that other modules still need.
   ========================================================================= */

// ---- Utility: unique id ----
export function makeId() {
    return 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ---- Utility: unique-name suffixing ----
// Given a base name and a set of already-used names, returns either the base
// name (if unused) or the base with " (2)", " (3)", ... appended.
export function nextUniqueName(baseName, existingNames) {
    const set = new Set(existingNames);
    if (!set.has(baseName)) return baseName;
    let n = 2;
    while (set.has(baseName + ' (' + n + ')')) n++;
    return baseName + ' (' + n + ')';
}

// ---- Validation ----
// Structural check for the template envelope. Used by every module that
// accepts external template data (gallery imports, backup restores,
// per-file drawing imports).
export function isValidTemplate(t) {
    if (!t || typeof t !== 'object') return false;
    if (typeof t.name !== 'string' || !Array.isArray(t.paths)) return false;
    if (!t.bbox || typeof t.bbox.w !== 'number' || typeof t.bbox.h !== 'number') return false;
    for (const p of t.paths) {
        if (!Array.isArray(p.pts) || p.pts.length < 2) return false;
        if (typeof p.isClosed !== 'boolean') return false;
        if (typeof p.stroke !== 'string') return false;
        for (const pt of p.pts) {
            if (typeof pt.x !== 'number' || typeof pt.y !== 'number') return false;
        }
    }
    return true;
}
