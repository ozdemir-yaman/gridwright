/* =========================================================================
   Gridwright — Export
   Bounding-box calculation, SVG serialization, PNG rasterization, and JSON
   packaging for the full drawing. The Export modal (see main.js) uses these
   primitives to build a live preview and produce downloadable files.

   Coordinate note: all math here works in raw SVG units. Padding is applied
   in grid cells (multiplied by CELL_SIZE internally).
   ========================================================================= */

import { pathDataStore } from './paths.js';
import { CELL_SIZE } from './svg.js';
import { makeId } from './templates.js';

// Maximum PNG side length. Guards against runaway memory when the user
// combines a large drawing with a big size multiplier.
export const MAX_PNG_SIDE = 8000;

// ---- Bounding box ----

// Bounding box of all drawn paths, in SVG units. Returns null when the
// canvas is empty. Coordinates are raw (unpadded); the caller adds padding.
export function computeDrawingBBox() {
    if (pathDataStore.length === 0) return null;
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const po of pathDataStore) {
        for (const pt of po.pts) {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
        }
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Apply padding (in grid cells) to a bbox and return the padded viewBox.
export function paddedViewBox(bbox, paddingCells) {
    const pad = Math.max(0, Math.floor(paddingCells)) * CELL_SIZE;
    return {
        x: bbox.x - pad,
        y: bbox.y - pad,
        w: bbox.w + pad * 2,
        h: bbox.h + pad * 2,
    };
}

// ---- SVG serialization ----

// Build a standalone `<svg>` element containing all drawn paths and,
// optionally, a grid pattern behind them. Used both for the preview and
// as the source for SVG download / PNG rasterization.
//
// `opts` = { viewBox: {x,y,w,h}, includeGrid: boolean, widthPx, heightPx }
// widthPx/heightPx are only set when the caller wants concrete size
// attributes (e.g. baking into a downloaded SVG or feeding an <img>).
export function buildSvgElement(opts) {
    return buildSvgElementFromPaths(pathDataStore, opts);
}

// Lower-level builder used by both the live-canvas exporter (above) and by
// callers that hold their own path list (e.g. gallery exports of a template
// that isn't loaded into the canvas). `paths` is an array of objects with
// `pts`, `isClosed`, and `stroke` — matches both `pathDataStore` entries
// and the template envelope shape.
export function buildSvgElementFromPaths(paths, opts) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('xmlns', svgNS);
    const { viewBox } = opts;
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (typeof opts.widthPx === 'number') svg.setAttribute('width', opts.widthPx);
    if (typeof opts.heightPx === 'number') svg.setAttribute('height', opts.heightPx);

    // Solid white background — inside the SVG so it survives both raster
    // export (canvas draws it) and vector export (opens correctly in any
    // viewer). Placed first so paths render on top.
    const background = document.createElementNS(svgNS, 'rect');
    background.setAttribute('x', viewBox.x);
    background.setAttribute('y', viewBox.y);
    background.setAttribute('width', viewBox.w);
    background.setAttribute('height', viewBox.h);
    background.setAttribute('fill', '#ffffff');
    svg.appendChild(background);

    // Optional grid pattern. Rendered as a repeating cell rect + diagonals to
    // match the live canvas visuals. Colors mirror the tokens used at
    // runtime (--color-grid-major / --color-grid-minor).
    if (opts.includeGrid) {
        const defs = document.createElementNS(svgNS, 'defs');
        const pattern = document.createElementNS(svgNS, 'pattern');
        const patternId = 'export-grid-pattern';
        pattern.setAttribute('id', patternId);
        pattern.setAttribute('width', CELL_SIZE);
        pattern.setAttribute('height', CELL_SIZE);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');

        const cell = document.createElementNS(svgNS, 'rect');
        cell.setAttribute('width', CELL_SIZE);
        cell.setAttribute('height', CELL_SIZE);
        cell.setAttribute('fill', 'none');
        cell.setAttribute('stroke', '#cccccc');
        cell.setAttribute('stroke-width', '1');
        pattern.appendChild(cell);

        const diag = document.createElementNS(svgNS, 'path');
        diag.setAttribute('d', `M 0 0 L ${CELL_SIZE} ${CELL_SIZE} M ${CELL_SIZE} 0 L 0 ${CELL_SIZE}`);
        diag.setAttribute('stroke', '#dddddd');
        diag.setAttribute('stroke-width', '1');
        diag.setAttribute('fill', 'none');
        pattern.appendChild(diag);

        defs.appendChild(pattern);
        svg.appendChild(defs);

        const bg = document.createElementNS(svgNS, 'rect');
        bg.setAttribute('x', viewBox.x);
        bg.setAttribute('y', viewBox.y);
        bg.setAttribute('width', viewBox.w);
        bg.setAttribute('height', viewBox.h);
        bg.setAttribute('fill', `url(#${patternId})`);
        svg.appendChild(bg);
    }

    // Emit each path with the same stroke styling the live canvas uses.
    for (const po of paths) {
        if (!po.pts || po.pts.length < 2) continue;
        let d = `M ${po.pts[0].x} ${po.pts[0].y}`;
        for (let i = 1; i < po.pts.length; i++) d += ` L ${po.pts[i].x} ${po.pts[i].y}`;
        if (po.isClosed) d += ' Z';
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', po.stroke || '#222');
        path.setAttribute('stroke-width', '4');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('fill', po.isClosed ? 'transparent' : 'none');
        svg.appendChild(path);
    }

    return svg;
}

// Serialize an SVG DOM node to a UTF-8 string with an XML declaration and
// the required xmlns declaration so it opens correctly in any tool.
export function svgToString(svgEl) {
    const clone = svgEl.cloneNode(true);
    if (!clone.getAttribute('xmlns')) {
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    const serialized = new XMLSerializer().serializeToString(clone);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + serialized;
}

// ---- File download helper ----

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

// Turn a name into a filesystem-safe slug (mirrors templates.slugify).
export function slugify(name) {
    const cleaned = String(name || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned || 'drawing';
}

// ---- Exporters ----

// Download the drawing as an SVG file. Size inputs are ignored (SVG is
// scalable); width/height attributes are omitted so consumers can render
// at any size.
export function exportAsSvg({ viewBox, includeGrid, name }) {
    const svg = buildSvgElement({ viewBox, includeGrid });
    const text = svgToString(svg);
    const blob = new Blob([text], { type: 'image/svg+xml' });
    download(blob, `${slugify(name)}.svg`);
}

// Rasterize the SVG at the requested pixel dimensions and download as PNG.
// Uses an in-memory Image + canvas; no server round-trip.
export async function exportAsPng({ viewBox, includeGrid, widthPx, heightPx, name }) {
    // Clamp dimensions to the safety cap.
    const w = Math.min(MAX_PNG_SIDE, Math.max(1, Math.round(widthPx)));
    const h = Math.min(MAX_PNG_SIDE, Math.max(1, Math.round(heightPx)));

    // Build an SVG with explicit width/height so the browser knows what
    // resolution to rasterize at.
    const svg = buildSvgElement({ viewBox, includeGrid, widthPx: w, heightPx: h });
    const svgText = svgToString(svg);
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
        const img = await loadImage(svgUrl);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // Paint a white base first. The SVG itself has a white background
        // rect, so this is belt-and-suspenders — it also protects against
        // 1-pixel edge artifacts some browsers introduce when rasterizing
        // an SVG that's the exact size of its viewBox.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const pngBlob = await canvasToBlob(canvas);
        download(pngBlob, `${slugify(name)}.png`);
    } finally {
        URL.revokeObjectURL(svgUrl);
    }
}

// Download the drawing as a template-shaped JSON file, so it can be
// re-imported via the Templates panel later.
export function exportAsJson({ name }) {
    // Normalize path coordinates to start at (0, 0) so the template's bbox
    // matches template convention.
    const bbox = computeDrawingBBox();
    if (!bbox) return;
    const paths = pathDataStore.map((po) => ({
        pts: po.pts.map((p) => ({ x: p.x - bbox.x, y: p.y - bbox.y })),
        isClosed: po.isClosed,
        stroke: po.stroke,
    }));
    const template = {
        id: makeId(),
        name: name || 'Untitled drawing',
        createdAt: Date.now(),
        bbox: { w: bbox.w, h: bbox.h },
        paths,
    };
    const payload = { version: 1, templates: [template] };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    download(blob, `${slugify(name)}.gridwright.json`);
}

// ---- Internals ----

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load SVG image.'));
        img.src = url;
    });
}

function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob failed.'));
        }, 'image/png');
    });
}

// ---- Template exporters ----
//
// The exporters above (`exportAs*`) read from `pathDataStore` — the live
// canvas. The gallery pages need to export a template that isn't loaded
// into the canvas, so these variants take an explicit template object.
//
// Templates already have a normalized bbox (`bbox.w`, `bbox.h`) and paths
// stored relative to (0, 0), which makes the viewBox derivation trivial.

function templateViewBox(template, paddingCells = 0) {
    const pad = Math.max(0, Math.floor(paddingCells)) * CELL_SIZE;
    return {
        x: -pad,
        y: -pad,
        w: (template.bbox && template.bbox.w) || 1,
        h: (template.bbox && template.bbox.h) || 1,
    };
}

export function exportTemplateAsSvg(template, { includeGrid = false, paddingCells = 2 } = {}) {
    const viewBox = templateViewBox(template, paddingCells);
    const svg = buildSvgElementFromPaths(template.paths || [], { viewBox, includeGrid });
    const text = svgToString(svg);
    const blob = new Blob([text], { type: 'image/svg+xml' });
    download(blob, `${slugify(template.name)}.svg`);
}

export async function exportTemplateAsPng(
    template,
    { includeGrid = false, paddingCells = 2, widthPx, heightPx } = {}
) {
    const viewBox = templateViewBox(template, paddingCells);
    // Sensible defaults when caller doesn't pass explicit pixel sizes:
    // 2 px per SVG unit (== 2 px per grid cell corner segment), clamped.
    const defaultScale = 2;
    let w = Math.round(widthPx || viewBox.w * defaultScale);
    let h = Math.round(heightPx || viewBox.h * defaultScale);
    if (w > MAX_PNG_SIDE || h > MAX_PNG_SIDE) {
        const s = Math.min(MAX_PNG_SIDE / w, MAX_PNG_SIDE / h);
        w = Math.max(1, Math.round(w * s));
        h = Math.max(1, Math.round(h * s));
    }
    w = Math.max(1, w);
    h = Math.max(1, h);

    const svg = buildSvgElementFromPaths(template.paths || [], {
        viewBox,
        includeGrid,
        widthPx: w,
        heightPx: h,
    });
    const svgText = svgToString(svg);
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
        const img = await loadImage(svgUrl);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const pngBlob = await canvasToBlob(canvas);
        download(pngBlob, `${slugify(template.name)}.png`);
    } finally {
        URL.revokeObjectURL(svgUrl);
    }
}

// JSON export re-emits the template inside a version-1 envelope, matching
// the file shape the app import reads.
export function exportTemplateAsJson(template) {
    const payload = {
        version: 1,
        templates: [
            {
                id: template.id || makeId(),
                name: template.name || 'Untitled drawing',
                createdAt: template.createdAt || Date.now(),
                bbox: { w: template.bbox.w, h: template.bbox.h },
                paths: template.paths.map((p) => ({
                    pts: p.pts.map((pt) => ({ x: pt.x, y: pt.y })),
                    isClosed: !!p.isClosed,
                    stroke: p.stroke || '#222222',
                })),
            },
        ],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    download(blob, `${slugify(template.name)}.gridwright.json`);
}
