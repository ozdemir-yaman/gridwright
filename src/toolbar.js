/* =========================================================================
   Gridwright — Toolbar / tool switching orchestration.
   ========================================================================= */

import { state } from './state.js';
import { svg, strokePreview, erasePreview } from './svg.js';
import {
    clearSelection,
    updateSelectionUI,
    rotateSelectionCW,
    rotateSelectionCCW,
    flipSelectionH,
    flipSelectionV,
    deleteSelection,
    deduplicateSelectionAction,
} from './tools/select.js';
import { cancelPlaceMode } from './tools/place.js';
import { cancelPivotPreview } from './tools/draw.js';

let strokePicker, drawIndicator;
let btnPan, btnDraw, btnErase, btnSelect;

export function initToolbar() {
    strokePicker = document.getElementById('stroke-color-picker');
    drawIndicator = document.getElementById('draw-color-indicator');
    btnPan = document.getElementById('btn-pan');
    btnDraw = document.getElementById('btn-draw');
    btnErase = document.getElementById('btn-erase');
    btnSelect = document.getElementById('btn-select');

    strokePicker.addEventListener('input', (e) => {
        state.currentStrokeColor = e.target.value;
        drawIndicator.style.backgroundColor = state.currentStrokeColor;
    });

    btnPan.addEventListener('click', () => setTool('pan'));
    btnDraw.addEventListener('click', () => setTool('draw'));
    btnErase.addEventListener('click', () => setTool('erase'));
    btnSelect.addEventListener('click', () => setTool('select'));

    // Selection action bar wiring
    const selectionActionsEl = document.getElementById('selection-actions');
    selectionActionsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'rotate-cw') rotateSelectionCW();
        else if (action === 'rotate-ccw') rotateSelectionCCW();
        else if (action === 'flip-h') flipSelectionH();
        else if (action === 'flip-v') flipSelectionV();
        else if (action === 'dedupe') deduplicateSelectionAction();
        else if (action === 'delete') deleteSelection();
    });
}

export function setTool(tool) {
    if (state.currentTool === tool) {
        if (tool === 'draw') strokePicker.click();
        return;
    }

    state.currentTool = tool;
    btnPan.classList.toggle('active', tool === 'pan');
    btnDraw.classList.toggle('active', tool === 'draw');
    btnErase.classList.toggle('active', tool === 'erase');
    btnSelect.classList.toggle('active', tool === 'select');

    let cursor = 'default';
    if (tool === 'pan') cursor = 'grab';
    else if (tool === 'draw' || tool === 'erase') cursor = 'crosshair';
    svg.style.cursor = cursor;

    strokePreview.style.display = 'none';
    erasePreview.style.display = 'none';

    if (tool !== 'select') clearSelection();
    if (tool !== 'select' && state.placeMode.active) cancelPlaceMode();
    if (tool !== 'draw' && state.pivotPreview.active) cancelPivotPreview();

    updateSelectionUI();
}
