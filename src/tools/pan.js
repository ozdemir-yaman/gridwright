/* =========================================================================
   Gridwright — Pan tool
   Middle-button drag OR left-button drag when currentTool === 'pan'.
   Also handles the mouse-wheel zoom that pans/zooms the viewBox.
   ========================================================================= */

import { state } from '../state.js';
import { svg, getSvgPoint, updateViewBox, strokePreview, erasePreview } from '../svg.js';
import { updateSelectionUI } from './select.js';

export function panMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && state.currentTool === 'pan')) {
        state.isPanning = true;
        state.startPoint = { x: e.clientX, y: e.clientY };
        if (state.currentTool === 'pan') svg.style.cursor = 'grabbing';
        return true;
    }
    return false;
}

export function panMouseMove(e) {
    if (!state.isPanning) return false;
    const scale = state.viewBox.w / window.innerWidth;
    state.viewBox.x += (state.startPoint.x - e.clientX) * scale;
    state.viewBox.y += (state.startPoint.y - e.clientY) * scale;
    state.startPoint = { x: e.clientX, y: e.clientY };
    updateViewBox();
    strokePreview.style.display = 'none';
    erasePreview.style.display = 'none';
    updateSelectionUI();
    return true;
}

export function panMouseUp() {
    if (!state.isPanning) return;
    state.isPanning = false;
    if (state.currentTool === 'pan') svg.style.cursor = 'grab';
}

export function initWheelZoom() {
    svg.addEventListener(
        'wheel',
        (e) => {
            e.preventDefault();
            const scaleChange = e.deltaY > 0 ? 1.1 : 1 / 1.1;
            const pt = getSvgPoint(e.clientX, e.clientY);
            state.viewBox.w *= scaleChange;
            state.viewBox.h *= scaleChange;
            const rect = svg.getBoundingClientRect();
            state.viewBox.x = pt.x - ((e.clientX - rect.left) / rect.width) * state.viewBox.w;
            state.viewBox.y = pt.y - ((e.clientY - rect.top) / rect.height) * state.viewBox.h;
            updateViewBox();
            updateSelectionUI();
        },
        { passive: false }
    );

    window.addEventListener('resize', () => {
        state.viewBox.w = state.viewBox.h * (window.innerWidth / window.innerHeight);
        updateViewBox();
    });
}
