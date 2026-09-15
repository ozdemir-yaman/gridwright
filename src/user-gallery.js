/* =========================================================================
   Gridwright — User Gallery storage
   Persists user-saved drawings to localStorage. This is a separate
   collection from the template library (see src/templates.js) — the
   template library holds small reusable shapes for placement, while the
   gallery holds full drawings the user has published.

   Storage layout:
     key   = "gridwright.userGallery.v1"
     value = JSON.stringify(Array<Template>)
   where each Template matches the existing Gridwright envelope:
     { id, name, createdAt, bbox: {w, h}, paths: [...] }

   Backup file (export/import): `{ version: 1, templates: Array<Template> }`
   — identical to what the app's single-drawing export produces, so a
   backup can round-trip through both the gallery bulk import and the
   per-drawing app Import flow.
   ========================================================================= */

import { isValidTemplate } from './templates.js';

export const GALLERY_STORAGE_KEY = 'gridwright.userGallery.v1';
export const GALLERY_FILE_VERSION = 1;

// ---- Read / write ----

// Load all saved gallery entries. Returns an empty array on any read /
// parse failure — the gallery is a nice-to-have, not a source of truth.
// Invalid entries are silently filtered out.
export function loadUserGallery() {
    try {
        const raw = localStorage.getItem(GALLERY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isValidTemplate);
    } catch (e) {
        console.warn('Gridwright: failed to load user gallery', e);
        return [];
    }
}

// Persist the whole gallery array. Returns true on success, false on
// storage error (quota exceeded, disabled localStorage, etc.). Callers
// should surface the failure to the user.
export function saveUserGallery(arr) {
    try {
        const serialized = JSON.stringify(arr);
        // Warn early if the payload is getting close to typical
        // per-origin quotas (~5 MB in most browsers).
        if (serialized.length > 4 * 1024 * 1024) {
            console.warn('Gridwright: user gallery exceeds 4 MB');
        }
        localStorage.setItem(GALLERY_STORAGE_KEY, serialized);
        return true;
    } catch (e) {
        console.warn('Gridwright: failed to save user gallery', e);
        return false;
    }
}

// ---- Mutations ----

// Append a new drawing to the gallery. Returns the persisted entry (with
// a fresh id and createdAt), or null on storage failure.
export function addToUserGallery(template) {
    if (!isValidTemplate(template)) return null;
    const gallery = loadUserGallery();
    const entry = {
        id: template.id || makeGalleryId(),
        name: template.name,
        createdAt: template.createdAt || Date.now(),
        bbox: { w: template.bbox.w, h: template.bbox.h },
        paths: template.paths.map((p) => ({
            pts: p.pts.map((pt) => ({ x: pt.x, y: pt.y })),
            isClosed: !!p.isClosed,
            stroke: p.stroke || '#222222',
        })),
    };
    gallery.push(entry);
    const ok = saveUserGallery(gallery);
    return ok ? entry : null;
}

export function removeFromUserGallery(id) {
    const gallery = loadUserGallery();
    const next = gallery.filter((t) => t.id !== id);
    if (next.length === gallery.length) return false;
    return saveUserGallery(next);
}

export function replaceUserGallery(arr) {
    const clean = Array.isArray(arr) ? arr.filter(isValidTemplate) : [];
    return saveUserGallery(clean);
}

// Merge an incoming array of templates into the current gallery. Existing
// entries (matched by id) are kept; new ids are appended. Returns the
// number of entries added.
export function mergeIntoUserGallery(incoming) {
    const clean = Array.isArray(incoming) ? incoming.filter(isValidTemplate) : [];
    if (clean.length === 0) return 0;
    const gallery = loadUserGallery();
    const seen = new Set(gallery.map((t) => t.id));
    let added = 0;
    for (const t of clean) {
        // Give a fresh id to anything missing one (defensive).
        const id = t.id || makeGalleryId();
        if (seen.has(id)) continue;
        gallery.push({
            id,
            name: t.name,
            createdAt: t.createdAt || Date.now(),
            bbox: { w: t.bbox.w, h: t.bbox.h },
            paths: t.paths.map((p) => ({
                pts: p.pts.map((pt) => ({ x: pt.x, y: pt.y })),
                isClosed: !!p.isClosed,
                stroke: p.stroke || '#222222',
            })),
        });
        seen.add(id);
        added++;
    }
    saveUserGallery(gallery);
    return added;
}

// ---- IDs ----

// Distinct prefix from the template library's ids so debugging is easier.
export function makeGalleryId() {
    return 'gal_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ---- Backup file helpers ----

// Build the object that gets serialized to a backup .json file.
export function buildBackupPayload(gallery) {
    return {
        version: GALLERY_FILE_VERSION,
        templates: gallery,
    };
}

// Parse a backup file's text; returns the array of valid templates it
// contains, or throws with a user-friendly message.
export function parseBackupText(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        throw new Error('Not valid JSON.', { cause: e });
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Backup root must be an object.');
    }
    if (!Array.isArray(parsed.templates)) {
        throw new Error('Backup is missing a `templates` array.');
    }
    const valid = parsed.templates.filter(isValidTemplate);
    if (valid.length === 0) {
        throw new Error('No valid drawings found in this backup.');
    }
    return valid;
}
