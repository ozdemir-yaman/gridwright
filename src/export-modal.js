/* =========================================================================
   Gridwright — Export dialog
   Full-drawing preview + options (grid toggle, padding, format, size).
   Uses primitives from export.js for the actual file emission.

   Called from two places:
     • In-app "Download" menu — no argument. Reads from the live canvas
       (pathDataStore) via computeDrawingBBox() and buildSvgElement().
     • Gallery pages, per-card "Download" action — passed a template.
       Uses the template's paths + bbox instead of live-canvas state.
   ========================================================================= */

import { openCustomModal, showPrompt, showAlert } from './modal.js';
import {
    computeDrawingBBox,
    paddedViewBox,
    buildSvgElement,
    buildSvgElementFromPaths,
    exportAsSvg,
    exportAsPng,
    exportAsJson,
    exportTemplateAsSvg,
    exportTemplateAsPng,
    exportTemplateAsJson,
    MAX_PNG_SIDE,
} from './export.js';

const DEFAULT_PADDING_CELLS = 1;

export async function openExportDialog(template) {
    // Two modes:
    //   • "live"     — no template arg. Reads pathDataStore. Live-canvas bbox.
    //   • "template" — template arg. Uses template.paths + template.bbox.
    const isTemplate = !!template;
    const bbox = isTemplate
        ? { x: 0, y: 0, w: template.bbox.w, h: template.bbox.h }
        : computeDrawingBBox();

    if (!bbox) {
        await showAlert('Nothing to export', 'Draw something first.');
        return;
    }

    // Local UI state — mutated in place by the controls below.
    const uiState = {
        showGrid: true,
        paddingCells: DEFAULT_PADDING_CELLS,
        format: 'svg', // 'svg' | 'png' | 'json'
        pngWidth: 0, // populated after we know the viewBox
        pngHeight: 0,
    };
    const initialVB = paddedViewBox(bbox, uiState.paddingCells);
    uiState.pngWidth = Math.round(initialVB.w);
    uiState.pngHeight = Math.round(initialVB.h);

    // --- Build DOM ---
    const root = document.createElement('div');
    root.className = 'export-dialog';

    // Left column: live SVG preview.
    const previewCol = document.createElement('div');
    previewCol.className = 'export-preview';
    root.appendChild(previewCol);

    // Right column: form controls.
    const form = document.createElement('div');
    form.className = 'export-form';
    root.appendChild(form);

    // Grid checkbox.
    const gridRow = makeCheckboxRow({
        id: 'export-grid-toggle',
        label: 'Show grid',
        checked: uiState.showGrid,
        onChange: (checked) => {
            uiState.showGrid = checked;
            renderPreview();
        },
    });
    form.appendChild(gridRow);

    // Padding (grid cells).
    const paddingRow = makeNumberRow({
        id: 'export-padding',
        label: 'Padding (cells)',
        value: uiState.paddingCells,
        min: 0,
        max: 50,
        step: 1,
        onChange: (value) => {
            uiState.paddingCells = Math.max(0, Math.floor(value || 0));
            // When padding changes, PNG dimensions follow if the user hasn't
            // manually resized. We treat PNG size as "linked to viewBox" by
            // default: recompute width/height to match natural size.
            const vb = paddedViewBox(bbox, uiState.paddingCells);
            uiState.pngWidth = Math.round(vb.w);
            uiState.pngHeight = Math.round(vb.h);
            widthInput.value = uiState.pngWidth;
            heightInput.value = uiState.pngHeight;
            renderPreview();
        },
    });
    form.appendChild(paddingRow);

    // Format dropdown.
    const formatRow = document.createElement('div');
    formatRow.className = 'export-row';
    const formatLabel = document.createElement('label');
    formatLabel.className = 'export-label';
    formatLabel.textContent = 'Export as';
    formatLabel.setAttribute('for', 'export-format');
    formatRow.appendChild(formatLabel);
    const formatSelect = document.createElement('select');
    formatSelect.id = 'export-format';
    formatSelect.className = 'export-input';
    for (const [val, text] of [
        ['svg', 'SVG'],
        ['png', 'PNG'],
        ['json', 'JSON'],
    ]) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = text;
        formatSelect.appendChild(opt);
    }
    formatSelect.value = uiState.format;
    formatSelect.addEventListener('change', () => {
        uiState.format = formatSelect.value;
        sizeGroup.hidden = uiState.format !== 'png';
    });
    formatRow.appendChild(formatSelect);
    form.appendChild(formatRow);

    // Size group (visible only for PNG). Two linked number inputs that
    // preserve the current viewBox aspect ratio.
    const sizeGroup = document.createElement('div');
    sizeGroup.className = 'export-size-group';
    sizeGroup.hidden = uiState.format !== 'png';

    const sizeLabel = document.createElement('div');
    sizeLabel.className = 'export-label';
    sizeLabel.textContent = 'Export size (px)';
    sizeGroup.appendChild(sizeLabel);

    const sizeInputsWrap = document.createElement('div');
    sizeInputsWrap.className = 'export-size-inputs';

    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.className = 'export-input';
    widthInput.min = 1;
    widthInput.max = MAX_PNG_SIDE;
    widthInput.step = 1;
    widthInput.value = uiState.pngWidth;
    widthInput.setAttribute('aria-label', 'Export width in pixels');

    const times = document.createElement('span');
    times.className = 'export-size-x';
    times.textContent = '\u00d7'; // ×

    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.className = 'export-input';
    heightInput.min = 1;
    heightInput.max = MAX_PNG_SIDE;
    heightInput.step = 1;
    heightInput.value = uiState.pngHeight;
    heightInput.setAttribute('aria-label', 'Export height in pixels');

    // Aspect ratio is derived from the current viewBox. Recalculated on
    // every padding change so the ratio always reflects what will be
    // rendered.
    function aspectRatio() {
        const vb = paddedViewBox(bbox, uiState.paddingCells);
        return vb.w / vb.h;
    }
    // Debounced input handlers: when one dimension changes, the other is
    // rewritten to preserve aspect. Clamp to MAX_PNG_SIDE afterwards.
    widthInput.addEventListener('input', () => {
        const w = parseInt(widthInput.value, 10);
        if (!Number.isFinite(w) || w <= 0) return;
        const clampedW = Math.min(MAX_PNG_SIDE, w);
        uiState.pngWidth = clampedW;
        uiState.pngHeight = Math.max(1, Math.min(MAX_PNG_SIDE, Math.round(clampedW / aspectRatio())));
        heightInput.value = uiState.pngHeight;
        if (clampedW !== w) widthInput.value = clampedW;
    });
    heightInput.addEventListener('input', () => {
        const h = parseInt(heightInput.value, 10);
        if (!Number.isFinite(h) || h <= 0) return;
        const clampedH = Math.min(MAX_PNG_SIDE, h);
        uiState.pngHeight = clampedH;
        uiState.pngWidth = Math.max(1, Math.min(MAX_PNG_SIDE, Math.round(clampedH * aspectRatio())));
        widthInput.value = uiState.pngWidth;
        if (clampedH !== h) heightInput.value = clampedH;
    });

    sizeInputsWrap.appendChild(widthInput);
    sizeInputsWrap.appendChild(times);
    sizeInputsWrap.appendChild(heightInput);
    sizeGroup.appendChild(sizeInputsWrap);

    const aspectHint = document.createElement('div');
    aspectHint.className = 'export-hint';
    aspectHint.textContent = 'Aspect ratio is locked to the drawing.';
    sizeGroup.appendChild(aspectHint);
    form.appendChild(sizeGroup);

    // Footer buttons (custom — the built-in modal footer is hidden by
    // openCustomModal).
    const footer = document.createElement('div');
    footer.className = 'export-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'modal-btn modal-btn-secondary';
    cancelBtn.textContent = 'Cancel';
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'modal-btn modal-btn-primary';
    exportBtn.textContent = 'Export';
    footer.appendChild(cancelBtn);
    footer.appendChild(exportBtn);
    form.appendChild(footer);

    // Preview rendering: swap the SVG whenever grid/padding change.
    function renderPreview() {
        const vb = paddedViewBox(bbox, uiState.paddingCells);
        const svg = isTemplate
            ? buildSvgElementFromPaths(template.paths, {
                  viewBox: vb,
                  includeGrid: uiState.showGrid,
              })
            : buildSvgElement({ viewBox: vb, includeGrid: uiState.showGrid });
        svg.classList.add('export-preview-svg');
        previewCol.innerHTML = '';
        previewCol.appendChild(svg);
    }
    renderPreview();

    // Open the modal and wait for the user's action.
    const modal = openCustomModal({
        title: 'Export drawing',
        content: root,
        size: 'wide',
    });

    cancelBtn.addEventListener('click', () => modal.close(null));
    exportBtn.addEventListener('click', async () => {
        const vb = paddedViewBox(bbox, uiState.paddingCells);

        // Template mode: the template already carries a name and a normalized
        // bbox. Use the exportTemplateAs* helpers so the emitted files match
        // what the standalone gallery-page download used to produce.
        if (isTemplate) {
            const paddingCells = uiState.paddingCells;
            const includeGrid = uiState.showGrid;
            try {
                if (uiState.format === 'json') {
                    exportTemplateAsJson(template);
                } else if (uiState.format === 'svg') {
                    exportTemplateAsSvg(template, { includeGrid, paddingCells });
                } else if (uiState.format === 'png') {
                    await exportTemplateAsPng(template, {
                        includeGrid,
                        paddingCells,
                        widthPx: uiState.pngWidth,
                        heightPx: uiState.pngHeight,
                    });
                }
            } catch (err) {
                await showAlert('Export failed', err.message || 'Unknown error.');
            }
            modal.close({ done: true });
            return;
        }

        // Live-canvas mode: JSON needs a template name; prompt for it before
        // closing.
        if (uiState.format === 'json') {
            // Temporarily close the export modal so the prompt can take
            // the modal slot. Then re-open? Simpler: prompt runs on top
            // of the current modal — but the shared modal chrome doesn't
            // support stacking. Close first, then prompt.
            modal.close({ deferred: true }); // signal we handled the export ourselves
            const name = await showPrompt(
                'Export as JSON',
                'Name this drawing:',
                'Untitled drawing'
            );
            if (name === null) return;
            const trimmed = String(name).trim() || 'Untitled drawing';
            exportAsJson({ name: trimmed });
            return;
        }
        const name = 'drawing';
        if (uiState.format === 'svg') {
            exportAsSvg({ viewBox: vb, includeGrid: uiState.showGrid, name });
        } else if (uiState.format === 'png') {
            try {
                await exportAsPng({
                    viewBox: vb,
                    includeGrid: uiState.showGrid,
                    widthPx: uiState.pngWidth,
                    heightPx: uiState.pngHeight,
                    name,
                });
            } catch (err) {
                await showAlert('Export failed', err.message || 'Unknown error.');
            }
        }
        modal.close({ done: true });
    });

    await modal.promise;
}

// ---- Small DOM helpers ----

function makeCheckboxRow({ id, label, checked, onChange }) {
    const row = document.createElement('label');
    row.className = 'export-row export-row-inline';
    row.setAttribute('for', id);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = !!checked;
    input.addEventListener('change', () => onChange(input.checked));
    row.appendChild(input);
    const span = document.createElement('span');
    span.className = 'export-label';
    span.textContent = label;
    row.appendChild(span);
    return row;
}

function makeNumberRow({ id, label, value, min, max, step, onChange }) {
    const row = document.createElement('div');
    row.className = 'export-row';
    const lab = document.createElement('label');
    lab.className = 'export-label';
    lab.setAttribute('for', id);
    lab.textContent = label;
    row.appendChild(lab);
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.className = 'export-input';
    input.value = value;
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    if (step !== undefined) input.step = step;
    input.addEventListener('input', () => onChange(parseInt(input.value, 10)));
    row.appendChild(input);
    return row;
}
