/* =========================================================================
   Gridwright — Save current canvas to the user's local gallery
   Serializes the live canvas into the standard template envelope shape
   and appends it to the localStorage-backed user gallery. The gallery
   is viewable at gallery-my.html.
   ========================================================================= */

import { pathDataStore } from './paths.js';
import { computeDrawingBBox } from './export.js';
import { showAlert, showPrompt } from './modal.js';
import { addToUserGallery, loadUserGallery, makeGalleryId } from './user-gallery.js';
import { nextUniqueName } from './templates.js';

// Serialize the current canvas as a Gridwright template (paths normalized
// so bbox top-left is (0, 0)). Returns null on an empty canvas.
function serializeCanvasAsTemplate(name) {
    const bbox = computeDrawingBBox();
    if (!bbox) return null;
    const paths = pathDataStore.map((po) => ({
        pts: po.pts.map((p) => ({ x: p.x - bbox.x, y: p.y - bbox.y })),
        isClosed: po.isClosed,
        stroke: po.stroke,
    }));
    return {
        id: makeGalleryId(),
        name,
        createdAt: Date.now(),
        bbox: { w: bbox.w, h: bbox.h },
        paths,
    };
}

// Prompt for a name, then persist. Handles empty-canvas, cancellation,
// duplicate names, and storage failures with friendly messages.
export async function saveDrawingToGallery() {
    if (pathDataStore.length === 0) {
        await showAlert(
            'Nothing to save',
            'Draw something first, then try Save to Gallery again.'
        );
        return;
    }

    // Suggest a fresh unique name so successive saves don't collide.
    const gallery = loadUserGallery();
    const existingNames = gallery.map((t) => t.name);
    const suggested = nextUniqueName('Untitled drawing', existingNames);

    const rawName = await showPrompt(
        'Save to Gallery',
        'Give this drawing a name to save it to your local gallery.',
        suggested
    );
    // showPrompt resolves with null on cancel; empty string means the
    // user cleared the field — treat both as abort.
    if (rawName === null) return;
    const name = rawName.trim();
    if (!name) return;

    // Ensure uniqueness by suffixing "(2)", "(3)", ... if a collision
    // exists. This mirrors the template-library naming policy.
    const finalName = nextUniqueName(name, existingNames);

    const template = serializeCanvasAsTemplate(finalName);
    if (!template) {
        // Race: canvas emptied between the prompt and here. Bail cleanly.
        await showAlert('Nothing to save', 'The canvas is empty.');
        return;
    }

    const persisted = addToUserGallery(template);
    if (!persisted) {
        await showAlert(
            'Save failed',
            'Your browser refused to save this drawing (storage may be full or disabled). Try exporting the gallery to a file to free space.'
        );
        return;
    }

    await showAlert(
        'Saved',
        `"${finalName}" has been saved to your gallery. Open My Gallery from the home page to see all your saved drawings.`
    );
}
