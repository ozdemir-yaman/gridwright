/* =========================================================================
   Gridwright — Top-right toolbar
   A single dropdown menu (Home stays as a separate link) covering all
   drawing-level actions: Download / Import / Save to Gallery / Restart.
   ========================================================================= */

import { openExportDialog } from './export-modal.js';
import { pathDataStore } from './paths.js';
import { onHistoryChange } from './history.js';
import { createActionMenu } from './action-menu.js';
import { restartCanvas } from './restart.js';
import { saveDrawingToGallery } from './gallery-save.js';
import { openPanel } from './panel.js';

// ---- Small inline SVG icons for menu items ---------------------------------
// Kept minimal (single-color, 20×20) so they inherit `currentColor` and
// tint correctly for both normal and danger items.

const iconDownload = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M5 1.5C2.79086 1.5 1 3.29086 1 5.5V15.5C1 17.7091 2.79086 19.5 5 19.5H19C21.2091 19.5 23 17.7091 23 15.5V5.5C23 3.29086 21.2091 1.5 19 1.5H5ZM3 5.5C3 4.39543 3.89543 3.5 5 3.5H19C20.1046 3.5 21 4.39543 21 5.5V15.5C21 16.6046 20.1046 17.5 19 17.5H5C3.89543 17.5 3 16.6046 3 15.5V5.5Z" fill="#1D1D1B"/>
    <path d="M2 20.5C1.44772 20.5 1 20.9477 1 21.5C1 22.0523 1.44772 22.5 2 22.5H22C22.5523 22.5 23 22.0523 23 21.5C23 20.9477 22.5523 20.5 22 20.5H2Z" fill="#1D1D1B"/>
</svg>`;

const iconImport = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16.7071 13.7071L12.7071 17.7071C12.3166 18.0976 11.6834 18.0976 11.2929 17.7071L7.29289 13.7071C6.90237 13.3166 6.90237 12.6834 7.29289 12.2929C7.68342 11.9024 8.31658 11.9024 8.70711 12.2929L11 14.5858V3C11 2.44771 11.4477 2 12 2C12.5523 2 13 2.44771 13 3V14.5858L15.2929 12.2929C15.6834 11.9024 16.3166 11.9024 16.7071 12.2929C17.0976 12.6834 17.0976 13.3166 16.7071 13.7071Z" fill="currentColor"/>
    <path d="M4 17.5C4 16.9477 3.55228 16.5 3 16.5C2.44772 16.5 2 16.9477 2 17.5V19C2 21.2091 3.79086 23 6 23H18C20.2091 23 22 21.2091 22 19V17.5C22 16.9477 21.5523 16.5 21 16.5C20.4477 16.5 20 16.9477 20 17.5V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V17.5Z" fill="currentColor"/>
</svg>`;

const iconGallery = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M3 7C3 5.89543 3.89543 5 5 5H16C16.5523 5 17 4.55228 17 4C17 3.44772 16.5523 3 16 3H5C2.79086 3 1 4.79086 1 7V18C1 20.2091 2.79086 22 5 22H19C21.2091 22 23 20.2091 23 18V10C23 9.44772 22.5523 9 22 9C21.4477 9 21 9.44772 21 10V14.6492L17.3438 10.079C15.6526 7.96503 12.3939 8.10644 10.8922 10.359L9.75253 12.0684C8.39009 11.3206 6.67121 11.7382 5.80752 13.0457L3 17.2956V7ZM15.7821 11.3284L21 17.8508V18C21 19.1046 20.1046 20 19 20H8.73703C7.93834 20 7.46195 19.1099 7.90498 18.4453L12.5563 11.4684C13.3071 10.3421 14.9365 10.2714 15.7821 11.3284ZM6.24088 17.3359C5.67321 18.1874 5.60871 19.1624 5.9078 20H5.5C4.94771 20 4.5 19.5523 4.5 19V18.9539C4.5 18.7579 4.55759 18.5662 4.66562 18.4027L7.47627 14.148C7.73105 13.7624 8.20908 13.609 8.63044 13.7516L6.24088 17.3359Z" fill="#1D1D1B"/>
    <path d="M5.18301 8.79827C5.66409 8.95863 6.04159 9.33614 6.20195 9.81722C6.36516 10.3068 7.0577 10.3068 7.2209 9.81722C7.38126 9.33614 7.75876 8.95863 8.23985 8.79827C8.72946 8.63507 8.72946 7.94253 8.23985 7.77933C7.75876 7.61897 7.38126 7.24146 7.2209 6.76038C7.0577 6.27077 6.36516 6.27077 6.20195 6.76038C6.04159 7.24146 5.66409 7.61897 5.18301 7.77933C4.69339 7.94253 4.69339 8.63507 5.18301 8.79827Z" fill="#1D1D1B"/>
    <path d="M21 4C21 3.44772 20.5523 3 20 3C19.4477 3 19 3.44772 19 4V5H18C17.4477 5 17 5.44772 17 6C17 6.55228 17.4477 7 18 7H19V8C19 8.55228 19.4477 9 20 9C20.5523 9 21 8.55228 21 8V7H22C22.5523 7 23 6.55228 23 6C23 5.44772 22.5523 5 22 5H21V4Z" fill="#1D1D1B"/>
</svg>`;

const iconRestart = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.59941 4C6.59941 3.44772 6.1517 3 5.59941 3C5.04713 3 4.59941 3.44772 4.59941 4V7.2C4.59941 7.75229 5.04713 8.2 5.59941 8.2H8.8C9.35228 8.2 9.8 7.75229 9.8 7.2C9.8 6.64772 9.35228 6.2 8.8 6.2H8.07925C9.19815 5.44203 10.5474 5 12 5C15.866 5 19 8.13401 19 12C19 15.866 15.866 19 12 19C8.13401 19 5 15.866 5 12C5 11.4477 4.55228 11 4 11C3.44772 11 3 11.4477 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C9.97342 3 8.10327 3.67032 6.59941 4.79997V4Z" fill="currentColor"/>
</svg>
`;

// ---- Init ---------------------------------------------------------------

export function initTopToolbar() {
    const btnMenu = document.getElementById('btn-menu');
    if (!btnMenu) return;

    // Build the menu. Item availability (Download, Save to Gallery,
    // Restart) depends on whether the canvas has anything on it, so we
    // rebuild the item list any time history changes.
    const menu = createActionMenu({
        trigger: btnMenu,
        items: buildItems(),
        align: 'right',
    });

    const refresh = () => menu.setItems(buildItems());
    onHistoryChange(refresh);
    // Initial state — computed once at boot; onHistoryChange fires on
    // every subsequent canvas mutation.
    refresh();
}

// Build the item descriptors. Pulled out so we can regenerate the list
// when the canvas becomes empty/non-empty and item disabled states shift.
function buildItems() {
    const canvasEmpty = pathDataStore.length === 0;

    return [
        {
            label: 'Download',
            description: 'Save to your device',
            icon: iconDownload,
            disabled: canvasEmpty,
            onClick: () => openExportDialog(),
        },
        {
            label: 'Import',
            description: 'Pick a drawing from your gallery',
            icon: iconImport,
            onClick: () => openPanel(),
        },
        {
            label: 'Save to Gallery',
            description: 'Save this drawing to My Gallery',
            icon: iconGallery,
            disabled: canvasEmpty,
            onClick: () => saveDrawingToGallery(),
        },
        {
            label: 'Restart',
            description: 'Start over with a fresh canvas',
            icon: iconRestart,
            danger: true,
            disabled: canvasEmpty,
            confirm: {
                title: 'Restart canvas?',
                message:
                    'This will erase every path on the canvas and clear the autosave. Ctrl+Z will bring the drawing back until you close the tab.',
                confirmLabel: 'Restart',
                cancelLabel: 'Cancel',
            },
            onClick: () => restartCanvas(),
        },
    ];
}
