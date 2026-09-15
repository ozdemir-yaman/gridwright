/* =========================================================================
   Gridwright — Developer's Gallery page
   Lists a fixed set of bundled example drawings as cards. Each card
   supports:
     • Edit on canvas → hands the template to the app via sessionStorage
                        and redirects to app.html.
     • Download → opens the same export modal as the app.
     • Rename / Delete → not supported; drawings are read-only.

   The drawings are stored in `src/dev-drawings-data.json` and imported
   directly at build time (Vite handles JSON imports natively). This is
   deliberately simple: no `import.meta.glob`, no dynamic directory
   walking, no filename-collision surprises across build hosts. To add
   or update a drawing, edit the JSON file directly.
   ========================================================================= */

import { isValidTemplate } from './templates.js';
import { createActionMenu } from './action-menu.js';
import { galleryAlert } from './gallery-modal.js';
import { initModal } from './modal.js';
import { openExportDialog } from './export-modal.js';
import devDrawings from './dev-drawings-data.json';

// Key used to hand a template over to app.html. See src/main.js for the
// receiver side.
export const GALLERY_HANDOFF_KEY = 'gridwright.galleryImport.v1';

// ---- Template collection ----

// Filter to valid templates only (defensive — the bundled JSON is
// authored, but a validation pass guards against typos and lets the
// same code handle unexpectedly bad data gracefully).
function collectDrawings() {
    if (!devDrawings || !Array.isArray(devDrawings.templates)) return [];
    const items = [];
    devDrawings.templates.forEach((template, idx) => {
        if (!isValidTemplate(template)) return;
        // Auto-generate a display name from the index if the stored name is
        // the default "Untitled drawing" placeholder. Same rule the old
        // filename-based approach used.
        const displayName = /^untitled/i.test(template.name || '')
            ? `Example ${idx + 1}`
            : template.name;
        items.push({ template: { ...template, name: displayName } });
    });
    return items;
}

// ---- Thumbnail rendering ----

const svgNS = 'http://www.w3.org/2000/svg';

// Build a small SVG preview of a template. Same shape as the import-modal
// thumbnail in src/import.js, but styled for the card layout.
function buildThumbnail(template) {
    const svg = document.createElementNS(svgNS, 'svg');
    const w = Math.max(1, template.bbox.w);
    const h = Math.max(1, template.bbox.h);
    const pad = Math.max(w, h) * 0.06 + 4;
    svg.setAttribute('viewBox', `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.classList.add('gallery-thumb-svg');
    for (const p of template.paths) {
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
        svg.appendChild(path);
    }
    return svg;
}

// ---- Action handlers ----

// Edit-on-canvas: stash the template in sessionStorage and jump to the
// app. The app boot code detects the handoff and loads the drawing (no
// Add/Replace modal — replace is the intent).
function handleEditOnCanvas(template) {
    try {
        sessionStorage.setItem(GALLERY_HANDOFF_KEY, JSON.stringify(template));
    } catch (e) {
        console.warn('Gridwright: failed to stash gallery template', e);
        galleryAlert('Storage error', 'Could not hand the drawing to the app.');
        return;
    }
    window.location.href = 'app.html';
}

// Note: Rename and Delete are intentionally absent from the developer's
// gallery — those drawings are bundled into the app at build time and
// can't be modified from the client. Renaming or deleting them here
// would have no effect (state is regenerated on every page load).
async function handleUnsupported(action) {
    await galleryAlert(
        `${action} not available`,
        `Drawings in the developer's gallery are read-only. Use "Edit on canvas" to load one, then Save to Gallery to make your own copy you can ${action.toLowerCase()}.`
    );
}

// ---- Card rendering ----

function renderCard(item) {
    const { template } = item;
    const card = document.createElement('article');
    card.className = 'gallery-card';

    // Thumbnail area
    const thumbBox = document.createElement('div');
    thumbBox.className = 'gallery-thumb';
    thumbBox.appendChild(buildThumbnail(template));
    card.appendChild(thumbBox);

    // 3-dot menu button, top-right, revealed on card hover / focus.
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'gallery-card-menu-btn';
    menuBtn.setAttribute('aria-label', 'Drawing actions');
    menuBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="5"  r="2" fill="currentColor"/>
            <circle cx="12" cy="12" r="2" fill="currentColor"/>
            <circle cx="12" cy="19" r="2" fill="currentColor"/>
        </svg>
    `;
    card.appendChild(menuBtn);

    createActionMenu({
        trigger: menuBtn,
        align: 'right',
        items: [
            {
                label: 'Edit on canvas',
                onClick: () => handleEditOnCanvas(template),
            },
            {
                label: 'Download',
                onClick: () => openExportDialog(template),
            },
            {
                label: 'Rename',
                onClick: () => handleUnsupported('Rename'),
            },
            {
                label: 'Delete',
                danger: true,
                onClick: () => handleUnsupported('Delete'),
            },
        ],
    });

    // Developer's gallery cards are thumbnail-only — no title, no meta.
    // The 3-dot menu carries all the actions.
    return card;
}

// ---- Boot ----

function init() {
    // Initialize the app modal system (uses the DOM at #app-modal in this
    // page's HTML). Required before openExportDialog / galleryAlert flows
    // that route through it can run.
    initModal();

    const grid = document.querySelector('[data-gallery-grid]');
    if (!grid) return;

    const items = collectDrawings();
    if (items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'coming-soon';
        empty.textContent = 'No drawings available.';
        grid.appendChild(empty);
        return;
    }

    for (const item of items) grid.appendChild(renderCard(item));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
