/* =========================================================================
   Gridwright — Shared mutable state
   Central place for cross-module state. Modules import { state } and mutate
   fields directly; no getters/setters to keep the code readable.
   ========================================================================= */

export const state = {
    // Tool state
    currentTool: 'pan', // 'pan' | 'draw' | 'erase' | 'select' | 'none'
    currentStrokeColor: '#222222',

    // Camera / viewBox
    viewBox: { x: 0, y: 0, w: 0, h: 0 },

    // Drawing-in-progress state
    isPanning: false,
    isDrawing: false,
    isErasing: false,
    hasDragged: false,
    startPoint: { x: 0, y: 0 },
    clickScreenPos: { x: 0, y: 0 },
    currentPath: null,
    activeTrack: null,
    minExt: 0,
    maxExt: 0,

    // Selection state
    selection: new Set(),
    clipboard: null,
    lastCursorSvg: { x: 0, y: 0 },
    selMode: null, // 'marquee' | 'drag' | null
    marqueeStartSvg: null,
    dragAnchorSvg: null,
    dragTotalDelta: { dx: 0, dy: 0 },
    dragOriginalPts: null,

    // Place mode
    placeMode: { active: false, template: null },

    // Draw pivot preview (Shift held after committing a stroke — wait for
    // Shift release to lock in the new direction).
    pivotPreview: { active: false, anchor: null },
};

// Common tiny helpers.
export const eq = (a, b) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
