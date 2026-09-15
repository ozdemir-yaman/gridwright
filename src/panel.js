/* =========================================================================
   Gridwright — Gallery sidebar (right-side slide-in)
   Lists drawings the user has saved to their local gallery
   (see src/user-gallery.js and gallery-my.html). Clicking a tile enters
   ghost placement mode so the drawing can be dropped anywhere on the
   canvas — same UX as the old template picker.

   The sidebar is opened programmatically from the top toolbar's Import
   menu item (see src/top-toolbar.js). There is no dedicated left-toolbar
   button anymore.
   ========================================================================= */

import {
    loadUserGallery,
    removeFromUserGallery,
    saveUserGallery,
    mergeIntoUserGallery,
} from './user-gallery.js';
import { isValidTemplate, nextUniqueName } from './templates.js';
import { showPrompt, showConfirm, showAlert } from './modal.js';
import { beginPlaceMode } from './tools/place.js';

let templatePanel, panelCloseBtn, tabGrid, importBtn, importInput, searchInput;

let panelOpen = false;
// Current search filter — lowercased substring. Empty string means "show all".
let searchQuery = '';
// Single reusable popover for the tile context menu — rebuilt on each open.
let contextMenuEl = null;

export function initPanel() {
    templatePanel = document.getElementById('template-panel');
    panelCloseBtn = document.getElementById('panel-close');
    tabGrid = document.getElementById('tab-gallery');
    importBtn = document.getElementById('btn-import-json');
    importInput = document.getElementById('template-import-input');
    searchInput = document.getElementById('template-search');

    if (!templatePanel) return;

    panelCloseBtn.addEventListener('click', closePanel);

    importBtn.addEventListener('click', () => {
        importInput.value = '';
        importInput.click();
    });
    importInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const result = await importJsonIntoGallery(file);
            searchQuery = '';
            if (searchInput) searchInput.value = '';
            renderGallery();
            await showAlert(
                'Import complete',
                `Added ${result.added} drawing${result.added === 1 ? '' : 's'} to your gallery.`
            );
        } catch (err) {
            await showAlert('Import failed', err.message || 'Unknown error.');
        }
    });

    // Live filter as the user types. Case-insensitive substring match on name.
    searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value.trim().toLowerCase();
        renderGallery();
    });
}

export function openPanel() {
    if (!templatePanel) return;
    panelOpen = true;
    templatePanel.classList.add('open');
    templatePanel.setAttribute('aria-hidden', 'false');
    renderGallery();
}

export function closePanel() {
    if (!templatePanel) return;
    panelOpen = false;
    templatePanel.classList.remove('open');
    templatePanel.setAttribute('aria-hidden', 'true');
}

export function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel();
}

// ---- Tile rendering ----

function renderTile(tpl) {
    const tile = document.createElement('div');
    tile.className = 'template-tile';
    tile.title = tpl.name;

    const svgNS = 'http://www.w3.org/2000/svg';
    const pad = 4;
    const svgEl = document.createElementNS(svgNS, 'svg');
    svgEl.setAttribute(
        'viewBox',
        `${-pad} ${-pad} ${tpl.bbox.w + pad * 2} ${tpl.bbox.h + pad * 2}`
    );
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
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
        svgEl.appendChild(path);
    }
    tile.appendChild(svgEl);

    const name = document.createElement('div');
    name.className = 'template-tile-name';
    name.textContent = tpl.name;
    tile.appendChild(name);

    const menu = document.createElement('button');
    menu.className = 'template-tile-menu';
    menu.textContent = '⋯';
    menu.addEventListener('click', (e) => {
        e.stopPropagation();
        openTileContextMenu(menu, tpl);
    });
    tile.appendChild(menu);

    // Click-to-place: same UX as the old template picker. Drops the user
    // into ghost placement mode so they can position and click to drop.
    tile.addEventListener('click', () => beginPlaceMode(tpl));
    return tile;
}

export function renderGallery() {
    if (!tabGrid) return;
    tabGrid.innerHTML = '';
    const gallery = loadUserGallery();
    if (gallery.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'template-empty';
        empty.textContent =
            'No drawings in your gallery yet. Save one from the menu, or use Import JSON to load from a file.';
        tabGrid.appendChild(empty);
        return;
    }

    // Newest first — consistent with the standalone My Gallery page.
    const sorted = gallery.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const filtered = searchQuery
        ? sorted.filter((t) => t.name.toLowerCase().includes(searchQuery))
        : sorted;

    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'template-empty';
        empty.textContent = `No drawings match "${searchQuery}".`;
        tabGrid.appendChild(empty);
        return;
    }
    filtered.forEach((t) => tabGrid.appendChild(renderTile(t)));
}

// ---- Tile context menu (Rename / Delete) ----
// Uses the native Popover API for top-layer rendering + light-dismiss.

function openTileContextMenu(triggerEl, tpl) {
    if (contextMenuEl) contextMenuEl.remove();

    const menu = document.createElement('div');
    menu.className = 'tile-context-menu';
    menu.setAttribute('popover', 'auto');
    menu.setAttribute('role', 'menu');

    const rename = document.createElement('button');
    rename.textContent = 'Rename';
    rename.setAttribute('role', 'menuitem');
    rename.addEventListener('click', async () => {
        menu.hidePopover();
        const newName = await showPrompt('Rename drawing', 'New name:', tpl.name);
        if (newName === null) return;
        const trimmed = String(newName).trim();
        if (!trimmed) return;
        const gallery = loadUserGallery();
        const others = gallery.filter((t) => t.id !== tpl.id).map((t) => t.name);
        const finalName = nextUniqueName(trimmed, others);
        const idx = gallery.findIndex((t) => t.id === tpl.id);
        if (idx !== -1) {
            gallery[idx].name = finalName;
            saveUserGallery(gallery);
            renderGallery();
        }
    });
    menu.appendChild(rename);

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'danger';
    del.setAttribute('role', 'menuitem');
    del.addEventListener('click', async () => {
        menu.hidePopover();
        const ok = await showConfirm('Delete drawing', `Delete "${tpl.name}"?`);
        if (!ok) return;
        removeFromUserGallery(tpl.id);
        renderGallery();
    });
    menu.appendChild(del);

    menu.addEventListener('toggle', (e) => {
        if (e.newState === 'closed') {
            menu.remove();
            if (contextMenuEl === menu) contextMenuEl = null;
        }
    });

    document.body.appendChild(menu);
    contextMenuEl = menu;
    menu.showPopover();
    positionPopoverNear(menu, triggerEl);
}

// Position a popover next to `trigger` while keeping it inside the viewport.
function positionPopoverNear(popover, trigger) {
    const margin = 6;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = popover.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = triggerRect.right - menuRect.width;
    if (left < margin) left = triggerRect.left;
    left = Math.max(margin, Math.min(left, vw - menuRect.width - margin));

    let top = triggerRect.bottom + 4;
    if (top + menuRect.height > vh - margin) {
        const above = triggerRect.top - menuRect.height - 4;
        top = above >= margin ? above : Math.max(margin, vh - menuRect.height - margin);
    }

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
}

// ---- Import JSON into the user gallery ----
//
// Accepts the standard Gridwright envelope: { version, templates: [...] }.
// Also accepts a bare array of templates for tolerance. Merges into the
// existing gallery, skipping ids that already exist. Returns { added }.
function importJsonIntoGallery(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.onload = () => {
            let parsed;
            try {
                parsed = JSON.parse(reader.result);
            } catch (_e) {
                reject(new Error('Not valid JSON.'));
                return;
            }
            let incoming;
            if (Array.isArray(parsed)) {
                incoming = parsed;
            } else if (parsed && Array.isArray(parsed.templates)) {
                incoming = parsed.templates;
            } else {
                reject(new Error('File does not contain a templates array.'));
                return;
            }
            const valid = incoming.filter(isValidTemplate);
            if (valid.length === 0) {
                reject(new Error('No valid drawings found in this file.'));
                return;
            }
            const added = mergeIntoUserGallery(valid);
            resolve({ added });
        };
        reader.readAsText(file);
    });
}
