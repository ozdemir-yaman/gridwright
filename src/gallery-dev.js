/* =========================================================================
   Gridwright — Developer's Gallery page
   Lists every JSON file in /drawings/ as a card. Each card supports:
     • Import → hands the template to the app via sessionStorage and
                redirects to app.html, where the same import-preview modal
                (Add to current / Replace) fires on boot.
     • Export → menu with SVG / PNG / JSON options, using the same code
                paths as the in-app Export modal.

   File discovery is compile-time via Vite's `import.meta.glob`. Adding a
   new .json file into /drawings/ makes it appear in the gallery on the
   next dev-server reload (HMR triggers) or the next production build.
   ========================================================================= */

import { isValidTemplate } from './templates.js';
import { createActionMenu } from './action-menu.js';
import { galleryAlert } from './gallery-modal.js';
import { initModal } from './modal.js';
import { openExportDialog } from './export-modal.js';

// Key used to hand a template over to app.html. See src/main.js for the
// receiver side.
export const GALLERY_HANDOFF_KEY = 'gridwright.galleryImport.v1';

// ---- File discovery ----

// Vite resolves this glob at build time. `eager: true` means the JSON is
// bundled directly (no async fetch needed). We import the raw JSON — Vite
// parses it into a JavaScript object automatically.
const modules = import.meta.glob('/drawings/*.json', {
    eager: true,
    import: 'default',
});

// Turn the glob's { path: object } map into an ordered list of usable
// templates. Skips files that don't contain a valid template.
function collectDrawings() {
    const items = [];
    for (const [path, mod] of Object.entries(modules)) {
        if (!mod || typeof mod !== 'object') continue;
        if (!Array.isArray(mod.templates) || mod.templates.length === 0) continue;
        const template = mod.templates.find((t) => isValidTemplate(t));
        if (!template) continue;
        // Derive a friendly display name from the filename if the
        // template's own name is generic ("Untitled drawing" is the
        // default the export flow produces).
        const filename = path.split('/').pop() || 'drawing.json';
        const displayName = deriveDisplayName(template.name, filename);
        items.push({ template: { ...template, name: displayName }, filename, path });
    }
    // Sort alphabetically by display name for a stable, predictable UI.
    items.sort((a, b) => a.template.name.localeCompare(b.template.name));
    return items;
}

function deriveDisplayName(templateName, filename) {
    const base = filename.replace(/\.json$/i, '').replace(/\.gridwright$/i, '');
    // If the template name is the default placeholder, prefer the filename.
    if (!templateName || /^untitled/i.test(templateName)) {
        return prettify(base);
    }
    return templateName;
}

function prettify(str) {
    return str
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
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
// gallery — those drawings live in the /drawings/ folder on disk and are
// bundled at build time. Renaming or deleting them here would have no
// effect (state is regenerated on every page load).
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
        empty.textContent = 'No drawings found in /drawings/.';
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
