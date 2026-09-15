/* =========================================================================
   Gridwright — My Gallery page
   Lists drawings the user has saved from the app (see saveDrawingToGallery
   in src/gallery-save.js) as cards. Each card supports:
     • Import → hand the drawing over to the app for editing.
     • Export → per-drawing SVG / PNG / JSON download.
     • Delete → remove from the local gallery (with confirm).
   The top-of-page banner offers whole-gallery backup and restore.

   Storage lives in localStorage under `gridwright.userGallery.v1`
   (see src/user-gallery.js). This module is a thin UI layer over it.
   ========================================================================= */

import { isValidTemplate } from './templates.js';
import {
    loadUserGallery,
    saveUserGallery,
    removeFromUserGallery,
    mergeIntoUserGallery,
    replaceUserGallery,
    buildBackupPayload,
    parseBackupText,
} from './user-gallery.js';
import { createActionMenu } from './action-menu.js';
import { openGalleryModal, galleryAlert, galleryPrompt } from './gallery-modal.js';
import { initModal } from './modal.js';
import { openExportDialog } from './export-modal.js';

// Shared with src/main.js — must match. Handoff key used when the user
// clicks Import on a card: we stash the template and redirect to app.html.
const GALLERY_HANDOFF_KEY = 'gridwright.galleryImport.v1';

// ---- Utilities ----

function prettify(str) {
    return str
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function collectDrawings() {
    const raw = loadUserGallery();
    const items = raw
        .filter(isValidTemplate)
        .map((template) => ({
            template: { ...template, name: prettify(template.name) || 'Untitled drawing' },
        }));
    // Newest first — the user's most recent save is what they'll want to
    // find first when they come back.
    items.sort((a, b) => (b.template.createdAt || 0) - (a.template.createdAt || 0));
    return items;
}

// ---- Thumbnail rendering (same shape as gallery-dev's) ----

const svgNS = 'http://www.w3.org/2000/svg';

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

// ---- Card actions ----

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

async function handleRename(template, onDone) {
    const newName = await galleryPrompt({
        title: 'Rename drawing',
        message: 'New name:',
        defaultValue: template.name,
        confirmLabel: 'Save',
    });
    if (newName === null || !newName) return;
    // Persist name change. Uniqueness isn't enforced here — the user is
    // explicitly typing, and multiple items with the same name are fine
    // for a personal archive (they still have distinct ids).
    const gallery = loadUserGallery();
    const idx = gallery.findIndex((t) => t.id === template.id);
    if (idx !== -1) {
        gallery[idx].name = newName;
        saveUserGallery(gallery);
        onDone();
    }
}

async function handleDelete(template, onDone) {
    const choice = await openGalleryModal({
        title: 'Delete drawing',
        body: `Delete "${template.name}"? This cannot be undone.`,
        buttons: [{ id: 'delete', label: 'Delete', variant: 'danger' }],
    });
    if (choice !== 'delete') return;
    removeFromUserGallery(template.id);
    onDone();
}

// ---- Card rendering ----

function renderCard(item, onChange) {
    const { template } = item;
    const card = document.createElement('article');
    card.className = 'gallery-card';

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

    // Wire the action menu.
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
                onClick: () => handleRename(template, onChange),
            },
            {
                label: 'Delete',
                danger: true,
                onClick: () => handleDelete(template, onChange),
            },
        ],
    });

    const body = document.createElement('div');
    body.className = 'gallery-body';

    const title = document.createElement('h3');
    title.className = 'gallery-title';
    title.textContent = template.name;
    body.appendChild(title);

    // Just the "saved N ago" line — path count removed per spec.
    const meta = document.createElement('p');
    meta.className = 'gallery-meta';
    meta.textContent = `Saved ${formatRelative(template.createdAt)}`;
    body.appendChild(meta);

    card.appendChild(body);
    return card;
}

function formatRelative(ts) {
    if (!ts) return 'recently';
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? '' : 's'} ago`;
}

// ---- Bulk export / import (backup buttons in the banner) ----

function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function handleExportGallery() {
    const gallery = loadUserGallery();
    if (gallery.length === 0) {
        await galleryAlert(
            'Nothing to export',
            'Your gallery is empty. Save some drawings from the app first, then come back to download a backup.'
        );
        return;
    }
    const payload = buildBackupPayload(gallery);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const stamp = new Date().toISOString().slice(0, 10);
    download(blob, `gridwright-gallery-${stamp}.json`);
}

async function handleImportGallery(file, onChange) {
    if (!file) return;
    let text;
    try {
        text = await file.text();
    } catch (_e) {
        await galleryAlert('Could not read file', 'The selected file could not be read.');
        return;
    }
    let incoming;
    try {
        incoming = parseBackupText(text);
    } catch (err) {
        await galleryAlert('Invalid backup', err.message || 'That file is not a valid Gridwright backup.');
        return;
    }

    // Show the merge/replace/cancel choice as a single styled modal.
    // Body copy explains each option so users don't need to hover buttons
    // to know what happens.
    const currentCount = loadUserGallery().length;
    const body = document.createElement('div');
    const intro = document.createElement('p');
    intro.innerHTML =
        `Found <strong>${incoming.length}</strong> drawing${incoming.length === 1 ? '' : 's'} ` +
        `in this backup. Your gallery currently has <strong>${currentCount}</strong>.`;
    body.appendChild(intro);

    const mergeInfo = document.createElement('p');
    mergeInfo.innerHTML =
        '<strong>Merge</strong> keeps your existing drawings and adds any new ones from the backup.';
    body.appendChild(mergeInfo);

    const replaceInfo = document.createElement('p');
    replaceInfo.innerHTML =
        '<strong>Replace</strong> deletes your current gallery and installs the backup in its place. This cannot be undone.';
    body.appendChild(replaceInfo);

    const choice = await openGalleryModal({
        title: 'Import backup',
        body,
        buttons: [
            { id: 'replace', label: 'Replace', variant: 'danger' },
            { id: 'merge', label: 'Merge', variant: 'primary' },
        ],
    });

    if (choice === 'merge') {
        const added = mergeIntoUserGallery(incoming);
        onChange();
        await galleryAlert(
            'Import complete',
            `Added ${added} new drawing${added === 1 ? '' : 's'} to your gallery.`
        );
        return;
    }

    if (choice === 'replace') {
        replaceUserGallery(incoming);
        onChange();
        await galleryAlert(
            'Gallery replaced',
            `Your gallery now contains ${incoming.length} drawing${incoming.length === 1 ? '' : 's'} from the backup.`
        );
        return;
    }

    // Cancel or dismiss — nothing to do.
}

// ---- Boot ----

function init() {
    // Initialize the app modal system (uses the DOM at #app-modal in this
    // page's HTML). Required before openExportDialog / showAlert etc. can
    // run.
    initModal();

    const grid = document.querySelector('[data-gallery-grid]');
    if (!grid) return;

    // Backup banner wiring.
    const exportBtn = document.querySelector('[data-export-gallery]');
    const importBtn = document.querySelector('[data-import-gallery]');
    const importInput = document.querySelector('[data-import-input]');

    if (exportBtn) exportBtn.addEventListener('click', handleExportGallery);
    if (importBtn && importInput) {
        importBtn.addEventListener('click', () => {
            importInput.value = '';
            importInput.click();
        });
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            await handleImportGallery(file, rerender);
        });
    }

    // Card grid renderer — pulled out so mutations (delete, import backup)
    // can trigger a re-render cheaply.
    function rerender() {
        grid.innerHTML = '';
        const items = collectDrawings();
        if (items.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'coming-soon';
            empty.textContent =
                'No drawings saved yet. Open the app, draw something, then choose Save to Gallery from the menu.';
            grid.appendChild(empty);
            return;
        }
        for (const item of items) grid.appendChild(renderCard(item, rerender));
    }

    rerender();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
