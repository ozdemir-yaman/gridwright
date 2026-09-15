/* =========================================================================
   Gridwright — Template placement mode
   ========================================================================= */

import { state } from '../state.js';
import { svg, getSvgPoint } from '../svg.js';
import { commitNewPath } from '../paths.js';
import { templateGhostGroup, updateSelectionUI } from './select.js';
import { setTool } from '../toolbar.js';
import { pushHistory } from '../history.js';

export function beginPlaceMode(tpl) {
    state.placeMode.active = true;
    state.placeMode.template = tpl;
    if (state.currentTool !== 'select') setTool('select');
    templateGhostGroup.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';
    for (const p of tpl.paths) {
        let d = `M ${p.pts[0].x} ${p.pts[0].y}`;
        for (let i = 1; i < p.pts.length; i++) d += ` L ${p.pts[i].x} ${p.pts[i].y}`;
        if (p.isClosed) d += ' Z';
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', p.stroke || '#222');
        path.setAttribute('stroke-width', '4');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('fill', p.isClosed ? 'transparent' : 'none');
        templateGhostGroup.appendChild(path);
    }
    templateGhostGroup.style.display = 'block';
    svg.style.cursor = 'crosshair';
}

export function cancelPlaceMode() {
    state.placeMode.active = false;
    state.placeMode.template = null;
    templateGhostGroup.style.display = 'none';
    templateGhostGroup.innerHTML = '';
    if (state.currentTool === 'select') svg.style.cursor = 'default';
}

function updateGhostPosition(cursorSvg) {
    if (!state.placeMode.active || !state.placeMode.template) return;
    const tpl = state.placeMode.template;
    const ox = Math.round((cursorSvg.x - tpl.bbox.w / 2) / 50) * 50;
    const oy = Math.round((cursorSvg.y - tpl.bbox.h / 2) / 50) * 50;
    templateGhostGroup.setAttribute('transform', `translate(${ox} ${oy})`);
}

function placeTemplateAt(cursorSvg) {
    if (!state.placeMode.active || !state.placeMode.template) return;
    pushHistory();
    const tpl = state.placeMode.template;
    const ox = Math.round((cursorSvg.x - tpl.bbox.w / 2) / 50) * 50;
    const oy = Math.round((cursorSvg.y - tpl.bbox.h / 2) / 50) * 50;

    const newSelection = new Set();
    tpl.paths.forEach((entry) => {
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

    cancelPlaceMode();
}

export function initPlacePointerHandlers() {
    svg.addEventListener('mousemove', (e) => {
        if (!state.placeMode.active) return;
        updateGhostPosition(getSvgPoint(e.clientX, e.clientY));
    });
    svg.addEventListener(
        'mousedown',
        (e) => {
            if (!state.placeMode.active) return;
            if (e.button === 0) {
                placeTemplateAt(getSvgPoint(e.clientX, e.clientY));
                e.stopPropagation();
            } else if (e.button === 2) {
                cancelPlaceMode();
            }
        },
        true
    );
    svg.addEventListener('contextmenu', (e) => {
        if (state.placeMode.active) {
            e.preventDefault();
            cancelPlaceMode();
        }
    });
}
