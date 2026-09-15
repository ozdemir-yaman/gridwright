/* =========================================================================
   Gridwright — Global keyboard shortcuts.
   ========================================================================= */

import { state } from './state.js';
import { setTool } from './toolbar.js';
import {
    clearSelection,
    copySelectionToClipboard,
    pasteClipboardAt,
    deleteSelection,
    rotateSelectionCW,
    rotateSelectionCCW,
    flipSelectionH,
    flipSelectionV,
} from './tools/select.js';
import { cancelPlaceMode } from './tools/place.js';
import { pivotDraw, finalizePivot } from './tools/draw.js';
import { undo, redo } from './history.js';
import { modalState } from './modal.js';

export function initKeyboard() {
    // Tool-switch shortcuts.
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName.toLowerCase() === 'input') return;
        if (e.key === '1') setTool('pan');
        if (e.key === '2') setTool('draw');
        if (e.key === '3') setTool('erase');
        if (e.key === '4') setTool('select');
    });

    // Undo / redo — global, works with any tool.
    // Ctrl+Z (or Cmd+Z on Mac) undoes; Ctrl+Shift+Z redoes.
    window.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (e.key.toLowerCase() !== 'z') return;
        const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea') return;
        if (modalState.open) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
    });

    // Alt-hold: reveal keyboard shortcut hints on every button that declares
    // a data-shortcut attribute. The badges are pure CSS (::after) — we just
    // toggle a body class here. preventDefault is used to keep the browser
    // from stealing focus for its menu bar on Windows.
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Alt') return;
        if (e.repeat) return;
        if (modalState.open) return;
        e.preventDefault();
        document.body.classList.add('show-shortcuts');
    });
    window.addEventListener('keyup', (e) => {
        if (e.key !== 'Alt') return;
        document.body.classList.remove('show-shortcuts');
    });
    // Safety net: if the window loses focus (e.g. the Alt press opened
    // another app), the keyup may never arrive. Clear on blur.
    window.addEventListener('blur', () => {
        document.body.classList.remove('show-shortcuts');
    });

    // Draw-tool pivot: Shift while dragging commits the current stroke and
    // enters a "pivot preview" mode showing the rotating direction hint at
    // the anchor. Releasing Shift locks in the direction and continues the
    // stroke.
    window.addEventListener('keydown', (e) => {
        if (state.currentTool !== 'draw') return;
        if (!state.isDrawing) return;
        if (e.key !== 'Shift') return;
        if (e.repeat) return; // ignore auto-repeat
        const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea') return;
        pivotDraw();
    });
    window.addEventListener('keyup', (e) => {
        if (state.currentTool !== 'draw') return;
        if (e.key !== 'Shift') return;
        if (!state.pivotPreview.active) return;
        finalizePivot();
    });

    // Select-tool clipboard + escape.
    window.addEventListener('keydown', (e) => {
        if (state.currentTool !== 'select') return;
        const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea') return;
        if (modalState.open) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            copySelectionToClipboard();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            pasteClipboardAt(state.lastCursorSvg.x, state.lastCursorSvg.y);
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
            e.preventDefault();
            copySelectionToClipboard();
            deleteSelection();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelection();
        } else if (e.key === 'Escape') {
            if (state.placeMode.active) cancelPlaceMode();
            else clearSelection();
        } else if (
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            state.selection.size > 0
        ) {
            // Transform shortcuts — only fire when a selection is active so
            // stray key presses (like typing R somewhere) are ignored.
            const k = e.key.toLowerCase();
            if (k === 'r') {
                e.preventDefault();
                if (e.shiftKey) rotateSelectionCCW();
                else rotateSelectionCW();
            } else if (k === 'f') {
                e.preventDefault();
                if (e.shiftKey) flipSelectionV();
                else flipSelectionH();
            }
        }
    });
}
