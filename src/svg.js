/* =========================================================================
   Gridwright — SVG DOM references, camera (viewBox), and coordinate helpers.
   ========================================================================= */

import { state } from './state.js';

// Fixed play area, measured in grid cells (50 SVG units per cell). The
// viewBox can't grow beyond these dimensions and pan is clamped to stay
// inside. The visible boundary rect is styled to make this obvious.
export const CELL_SIZE = 50;
export const WORLD_CELLS_W = 320;
export const WORLD_CELLS_H = 180;
export const WORLD_W = WORLD_CELLS_W * CELL_SIZE; // 16000
export const WORLD_H = WORLD_CELLS_H * CELL_SIZE; //  9000

export const svg = document.getElementById('canvas');
export const shapeLayer = document.getElementById('shape-layer');

// --- Preview layers (created up front, inserted before shapeLayer) ---
export const strokePreview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
strokePreview.setAttribute('fill', 'none');
strokePreview.setAttribute('stroke', '#0066ff');
strokePreview.setAttribute('stroke-width', '6');
strokePreview.setAttribute('stroke-linecap', 'round');
strokePreview.setAttribute('opacity', '0.3');
strokePreview.style.display = 'none';

export const erasePreview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
erasePreview.setAttribute('fill', 'none');
erasePreview.setAttribute('stroke', '#ff4444');
erasePreview.setAttribute('stroke-width', '8');
erasePreview.setAttribute('stroke-linecap', 'round');
erasePreview.style.display = 'none';
erasePreview.style.pointerEvents = 'none';

// Only attach the preview layers on pages that actually host the canvas.
// This module is also imported (indirectly, via export.js) by the gallery
// pages, which have no canvas — attempting to insertBefore into null there
// would throw at load time.
if (svg && shapeLayer) {
    svg.insertBefore(strokePreview, shapeLayer);
    svg.insertBefore(erasePreview, shapeLayer);
}

// --- Camera ---
// Initial view: 1:1 scale (each cell renders at CELL_SIZE physical pixels),
// centered in the world so panning is available in every direction. The
// clamp guarantees the viewBox never exceeds world bounds — on very small
// viewports the initial zoom may end up capped, which is fine.
export function initViewBox() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    state.viewBox = {
        x: Math.round((WORLD_W - w) / 2),
        y: Math.round((WORLD_H - h) / 2),
        w,
        h,
    };
    clampViewBox();
    updateViewBox();
}

// Clamp the viewBox to fit inside [0..WORLD_W] x [0..WORLD_H]. Both zoom
// (viewBox size) and pan (viewBox position) are constrained here. Aspect
// ratio is preserved: if either dimension would exceed the world, both
// scale down by the same factor.
function clampViewBox() {
    const v = state.viewBox;
    // Zoom clamp — pick the tighter of the two dimensional limits so the
    // aspect ratio survives.
    let s = 1;
    if (v.w > WORLD_W) s = Math.min(s, WORLD_W / v.w);
    if (v.h > WORLD_H) s = Math.min(s, WORLD_H / v.h);
    if (s < 1) {
        v.w *= s;
        v.h *= s;
    }
    // Pan clamp — keep the visible rect inside the world.
    v.x = Math.max(0, Math.min(v.x, WORLD_W - v.w));
    v.y = Math.max(0, Math.min(v.y, WORLD_H - v.h));
}

export function updateViewBox() {
    clampViewBox();
    const v = state.viewBox;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
}

export function getSvgPoint(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const v = state.viewBox;
    return {
        x: v.x + ((clientX - rect.left) / rect.width) * v.w,
        y: v.y + ((clientY - rect.top) / rect.height) * v.h,
    };
}

export function svgToScreen(x, y) {
    const rect = svg.getBoundingClientRect();
    const v = state.viewBox;
    return {
        x: rect.left + ((x - v.x) / v.w) * rect.width,
        y: rect.top + ((y - v.y) / v.h) * rect.height,
    };
}
