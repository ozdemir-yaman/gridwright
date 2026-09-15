/* =========================================================================
   Gridwright — Entry point
   Wires up all modules once the DOM is ready.
   ========================================================================= */

import { svg, initViewBox, strokePreview, erasePreview } from './svg.js';
import { initializeExistingPaths } from './paths.js';
import { initModal, showConfirm } from './modal.js';
import { initToolbar, setTool } from './toolbar.js';
import { initPanel } from './panel.js';
import { initKeyboard } from './keyboard.js';
import { initSelectionUI, updateSelectionUI } from './tools/select.js';
import { initPlacePointerHandlers } from './tools/place.js';
import { onHistoryChange, notifyCanvasChanged } from './history.js';
import { initWheelZoom, panMouseDown, panMouseMove, panMouseUp } from './tools/pan.js';
import { drawMouseDown, drawMouseMove, drawMouseUp } from './tools/draw.js';
import { eraseMouseDown, eraseMouseMove, eraseMouseUp } from './tools/erase.js';
import { selectMouseDown, selectMouseMove, selectMouseUp } from './tools/select.js';
import { initTopToolbar } from './top-toolbar.js';
import {
    loadAutosave,
    clearAutosave,
    restoreAutosave,
    startAutosave,
    buildThumbnail,
} from './autosave.js';
import { importDrawingFromTemplate } from './import.js';

// Key shared with src/gallery-dev.js — must stay in sync.
const GALLERY_HANDOFF_KEY = 'gridwright.galleryImport.v1';

// --- Bubble-phase pointer routing on the SVG ---
// Order matters: pan first (middle-button OR pan tool), then per-tool.
svg.addEventListener('mousedown', (e) => {
    if (panMouseDown(e)) return;
    if (eraseMouseDown(e)) return;
    if (drawMouseDown(e)) return;
    if (selectMouseDown(e)) return;
});

svg.addEventListener('mousemove', (e) => {
    if (panMouseMove(e)) return;
    // drawMouseMove handles both live drawing AND hover preview
    if (drawMouseMove(e)) return;
    if (eraseMouseMove(e)) return;
    if (selectMouseMove(e)) return;
});

const endInteraction = (e) => {
    panMouseUp();
    drawMouseUp(e);
    eraseMouseUp();
    selectMouseUp(e);
};

svg.addEventListener('mouseup', endInteraction);
svg.addEventListener('mouseleave', (e) => {
    endInteraction(e);
    strokePreview.style.display = 'none';
    erasePreview.style.display = 'none';
});

// --- Init in dependency order ---
initViewBox();
initSelectionUI();
initModal();
initToolbar();
initPanel();
initKeyboard();
initPlacePointerHandlers();
initWheelZoom();
initTopToolbar();
initializeExistingPaths();

// After every undo/redo, refresh the selection UI so the bbox and floating
// action bar reflect the (now empty) selection.
onHistoryChange(() => updateSelectionUI());

setTool('pan');

// --- Boot: gallery handoff has priority over autosave restore ---
// If the user just clicked "Import" on a gallery card, they explicitly
// chose to load that drawing — asking about their previous autosaved
// work in the same session makes no sense. So we check for a handoff
// first; if present, discard any autosave and load the drawing directly.
// Only when there's no handoff do we run the usual restore prompt.
(async () => {
    if (hasGalleryHandoff()) {
        // The gallery drawing is about to become the canvas contents —
        // wipe the stale autosave so a refresh after that doesn't
        // resurrect the pre-gallery drawing.
        clearAutosave();
        await consumeGalleryHandoff();
        startAutosave();
        return;
    }

    const payload = loadAutosave();
    if (!payload) {
        startAutosave();
        return;
    }
    // Build a compact info line + SVG thumbnail as the modal body.
    const container = document.createElement('div');
    container.className = 'autosave-preview';
    const meta = document.createElement('div');
    meta.className = 'autosave-preview-meta';
    const count = payload.paths.length;
    const when = new Date(payload.savedAt);
    meta.textContent = `${count} path${count === 1 ? '' : 's'} · saved ${formatRelative(when)}`;
    container.appendChild(meta);
    const thumb = buildThumbnail(payload, 320, 180);
    thumb.classList.add('autosave-preview-thumb');
    container.appendChild(thumb);

    const restore = await showConfirm(
        'Continue where you left off?',
        'We found unsaved work from a previous session.',
        {
            content: container,
            confirmLabel: 'Restore',
            cancelLabel: 'Discard',
        }
    );
    if (restore) {
        restoreAutosave(payload);
        // Notify UI (e.g. Export button enable/disable) that paths appeared
        // outside the normal pushHistory flow.
        notifyCanvasChanged();
    } else {
        clearAutosave();
    }
    startAutosave();
})();

// --- Gallery hand-off ---
// If the user clicked "Import" on a gallery card, the drawing was stashed
// under GALLERY_HANDOFF_KEY before the redirect. Pull it out here and hand
// it to importDrawingFromTemplate, which replaces the canvas directly
// (no Add/Replace modal — the gallery click was already the intent).
// The key is cleared unconditionally so a refresh doesn't re-import.
function hasGalleryHandoff() {
    try {
        return !!sessionStorage.getItem(GALLERY_HANDOFF_KEY);
    } catch (_e) {
        return false;
    }
}

async function consumeGalleryHandoff() {
    let raw;
    try {
        raw = sessionStorage.getItem(GALLERY_HANDOFF_KEY);
    } catch (_e) {
        return;
    }
    if (!raw) return;
    try {
        sessionStorage.removeItem(GALLERY_HANDOFF_KEY);
    } catch (_e) {
        // Non-fatal — proceed with the import anyway.
    }
    let template;
    try {
        template = JSON.parse(raw);
    } catch (_e) {
        return;
    }
    await importDrawingFromTemplate(template);
}

function formatRelative(date) {
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}
