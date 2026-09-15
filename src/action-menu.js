/* =========================================================================
   Gridwright — Reusable dropdown action menu
   Renders a button-triggered dropdown with rich items (title + description,
   optional icon, danger variant, optional confirmation). Designed to be
   consumed by any page in the app — the drawing app, the gallery pages,
   and future surfaces (settings, about) can all reuse this component.

   Usage:
       const menu = createActionMenu({
           trigger: document.getElementById('btn-menu'),
           items: [
               { label: 'Download', description: 'Save to your device', onClick: ... },
               { label: 'Restart', description: 'Start over',
                 danger: true, confirm: { title: 'Restart?', message: '...' },
                 onClick: ... },
           ],
           align: 'right', // or 'left' — which edge aligns with the trigger
       });

   The instance exposes { open, close, toggle, destroy, setItems }. The menu
   handles outside-click dismissal, Escape, and up/down arrow keyboard
   navigation. Items resolve their confirm dialog through modal.showConfirm.
   ========================================================================= */

import { showConfirm } from './modal.js';

// Track open menus so we can enforce single-open at a time and clean up
// document-level listeners once no menus remain.
const openMenus = new Set();
let documentListenersAttached = false;

function ensureDocumentListeners() {
    if (documentListenersAttached) return;
    documentListenersAttached = true;
    // Any click outside every open menu closes them all.
    document.addEventListener('click', (e) => {
        for (const m of Array.from(openMenus)) {
            if (m.contains(e.target)) continue;
            m.__actionMenu.close();
        }
    });
    // Escape closes the top-most open menu.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        // Take the last-opened menu.
        const last = Array.from(openMenus).pop();
        if (last) {
            e.stopPropagation();
            last.__actionMenu.close();
        }
    });
    // Reposition on scroll/resize so the menu stays glued to its trigger.
    window.addEventListener('scroll', () => openMenus.forEach((m) => m.__actionMenu.reposition()), true);
    window.addEventListener('resize', () => openMenus.forEach((m) => m.__actionMenu.reposition()));
}

// ---- Public factory ----

export function createActionMenu({ trigger, items = [], align = 'right' } = {}) {
    if (!trigger) throw new Error('createActionMenu: `trigger` is required.');
    ensureDocumentListeners();

    // Build the dropdown surface once and re-render items on demand.
    const surface = document.createElement('div');
    surface.className = 'action-menu';
    surface.setAttribute('role', 'menu');
    surface.hidden = true;

    let currentItems = items.slice();

    function render() {
        surface.innerHTML = '';
        for (const it of currentItems) {
            surface.appendChild(buildItemElement(it, api));
        }
    }

    function positionSurface() {
        // Anchor immediately below the trigger. Attach to <body> so the
        // menu escapes any overflow-hidden parent (e.g. the top toolbar).
        const rect = trigger.getBoundingClientRect();
        surface.style.position = 'fixed';
        surface.style.top = `${Math.round(rect.bottom + 6)}px`;
        if (align === 'left') {
            surface.style.left = `${Math.round(rect.left)}px`;
            surface.style.right = 'auto';
        } else {
            surface.style.right = `${Math.round(window.innerWidth - rect.right)}px`;
            surface.style.left = 'auto';
        }
    }

    const api = {
        open() {
            if (!surface.hidden) return;
            // Close any other menus first — only one can be open at a time.
            for (const m of Array.from(openMenus)) {
                if (m !== surface) m.__actionMenu.close();
            }
            render();
            document.body.appendChild(surface);
            surface.hidden = false;
            positionSurface();
            openMenus.add(surface);
            trigger.setAttribute('aria-expanded', 'true');
            // Focus the first focusable item so keyboard users can nav.
            const first = surface.querySelector('.action-menu-item:not([disabled])');
            if (first) first.focus();
        },
        close() {
            if (surface.hidden) return;
            surface.hidden = true;
            if (surface.parentNode) surface.parentNode.removeChild(surface);
            openMenus.delete(surface);
            trigger.setAttribute('aria-expanded', 'false');
        },
        toggle() {
            if (surface.hidden) api.open();
            else api.close();
        },
        reposition() {
            if (!surface.hidden) positionSurface();
        },
        setItems(next) {
            currentItems = next.slice();
            if (!surface.hidden) render();
        },
        destroy() {
            api.close();
            trigger.removeEventListener('click', onTriggerClick);
            trigger.removeEventListener('keydown', onTriggerKey);
        },
    };

    // Wire the trigger.
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');

    function onTriggerClick(e) {
        e.stopPropagation();
        api.toggle();
    }
    function onTriggerKey(e) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            api.open();
        }
    }
    trigger.addEventListener('click', onTriggerClick);
    trigger.addEventListener('keydown', onTriggerKey);

    // Cache back-pointer so document-level handlers can reach the api.
    surface.__actionMenu = api;

    return api;
}

// ---- Item rendering ----

// Build the DOM for a single item. Handles the two-line layout (bold label
// + smaller description), optional icon, danger variant, disabled state,
// and per-item click semantics (including optional confirm dialog).
function buildItemElement(item, menuApi) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'action-menu-item';
    el.setAttribute('role', 'menuitem');
    if (item.danger) el.classList.add('action-menu-item-danger');
    if (item.disabled) {
        el.disabled = true;
        el.setAttribute('aria-disabled', 'true');
    }

    if (item.icon) {
        const iconWrap = document.createElement('span');
        iconWrap.className = 'action-menu-icon';
        iconWrap.setAttribute('aria-hidden', 'true');
        // `icon` may be a string (HTML) or a Node.
        if (typeof item.icon === 'string') iconWrap.innerHTML = item.icon;
        else if (item.icon instanceof Node) iconWrap.appendChild(item.icon);
        el.appendChild(iconWrap);
    }

    const textWrap = document.createElement('span');
    textWrap.className = 'action-menu-text';

    const label = document.createElement('span');
    label.className = 'action-menu-label';
    label.textContent = item.label || '';
    textWrap.appendChild(label);

    if (item.description) {
        const desc = document.createElement('span');
        desc.className = 'action-menu-desc';
        desc.textContent = item.description;
        textWrap.appendChild(desc);
    }
    el.appendChild(textWrap);

    // Keyboard nav within the menu.
    el.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusSibling(el, 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusSibling(el, -1);
        }
    });

    // Click handler with optional confirmation. The menu closes before the
    // confirm dialog appears so the dropdown doesn't obscure the modal.
    el.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (item.disabled) return;
        menuApi.close();
        if (item.confirm) {
            const opts = {
                confirmLabel: item.confirm.confirmLabel || 'Confirm',
                cancelLabel: item.confirm.cancelLabel || 'Cancel',
            };
            const ok = await showConfirm(
                item.confirm.title || 'Are you sure?',
                item.confirm.message || '',
                opts
            );
            if (!ok) return;
        }
        try {
            await item.onClick?.();
        } catch (err) {
            console.error('action-menu: item onClick failed', err);
        }
    });

    return el;
}

function focusSibling(el, dir) {
    const items = Array.from(el.parentNode.querySelectorAll('.action-menu-item:not([disabled])'));
    const idx = items.indexOf(el);
    if (idx === -1) return;
    const next = items[(idx + dir + items.length) % items.length];
    if (next) next.focus();
}
