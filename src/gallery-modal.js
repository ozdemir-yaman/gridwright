/* =========================================================================
   Gridwright — Gallery-page modal primitive
   Self-contained modal for the standalone gallery HTML pages (which don't
   include the app's modal DOM). Provides:

     openGalleryModal({ title, body, buttons }) -> Promise<string|null>
       Returns the id of the clicked button, or null for backdrop/Escape
       dismissal. `buttons[].variant` is one of 'primary'|'secondary'|'danger'.

     galleryAlert(title, message) -> Promise
       Single-OK convenience for informational dialogs.

     galleryPrompt({ title, message, defaultValue, confirmLabel }) -> Promise<string|null>
       Text-input prompt; resolves to the trimmed value or null on dismiss.

   Consumes .gallery-modal-* styles from landing.css.
   ========================================================================= */

// Track any currently-open modal so a subsequent opener can close it first
// (only one at a time).
let currentBackdrop = null;

export function openGalleryModal({ title, body, buttons }) {
    // Close a previously-open modal before opening the new one — prevents
    // stacked overlays if a caller opens two in rapid succession.
    if (currentBackdrop) currentBackdrop.remove();

    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'gallery-modal-backdrop';
        currentBackdrop = backdrop;

        const card = document.createElement('div');
        card.className = 'gallery-modal-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-labelledby', 'gallery-modal-title');

        const header = document.createElement('header');
        header.className = 'gallery-modal-header';
        const titleEl = document.createElement('h3');
        titleEl.className = 'gallery-modal-title';
        titleEl.id = 'gallery-modal-title';
        titleEl.textContent = title || '';
        header.appendChild(titleEl);
        card.appendChild(header);

        const bodyEl = document.createElement('div');
        bodyEl.className = 'gallery-modal-body';
        if (typeof body === 'string') {
            const p = document.createElement('p');
            p.textContent = body;
            bodyEl.appendChild(p);
        } else if (body instanceof Node) {
            bodyEl.appendChild(body);
        }
        card.appendChild(bodyEl);

        const footer = document.createElement('div');
        footer.className = 'gallery-modal-footer';

        let firstBtnEl = null;
        (buttons || []).forEach((b) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'gallery-btn';
            if (b.variant === 'primary') btn.classList.add('gallery-btn-primary');
            else if (b.variant === 'danger') btn.classList.add('gallery-btn-danger');
            else btn.classList.add('gallery-btn-secondary');
            btn.textContent = b.label;
            btn.addEventListener('click', () => close(b.id));
            footer.appendChild(btn);
            if (!firstBtnEl) firstBtnEl = btn;
        });

        card.appendChild(footer);
        backdrop.appendChild(card);
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) close(null);
        });

        function onKey(e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close(null);
            }
        }
        document.addEventListener('keydown', onKey);

        function close(value) {
            document.removeEventListener('keydown', onKey);
            backdrop.remove();
            if (currentBackdrop === backdrop) currentBackdrop = null;
            resolve(value);
        }

        // Focus the primary/first button so keyboard users can Enter to
        // confirm the recommended action.
        setTimeout(() => {
            const primary = footer.querySelector('.gallery-btn-primary');
            (primary || firstBtnEl)?.focus();
        }, 0);
    });
}

// Convenience: single-OK acknowledgement dialog.
export function galleryAlert(title, message) {
    return openGalleryModal({
        title,
        body: message,
        buttons: [{ id: 'ok', label: 'OK', variant: 'primary' }],
    });
}

// Convenience: text-input prompt. Resolves to the trimmed value on Save,
// null on Cancel / dismiss.
export function galleryPrompt({ title, message, defaultValue = '', confirmLabel = 'Save' }) {
    const body = document.createElement('div');
    if (message) {
        const p = document.createElement('p');
        p.textContent = message;
        body.appendChild(p);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'gallery-modal-input';
    input.value = defaultValue;
    body.appendChild(input);

    // Auto-focus + select after the modal mounts.
    setTimeout(() => {
        input.focus();
        input.select();
        // Wire Enter -> click the Save button (which is the primary CTA
        // openGalleryModal placed in the footer).
        const primary = document.querySelector('.gallery-modal-footer .gallery-btn-primary');
        if (primary) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    primary.click();
                }
            });
        }
    }, 20);

    return openGalleryModal({
        title,
        body,
        buttons: [
            { id: 'cancel', label: 'Cancel', variant: 'secondary' },
            { id: 'save', label: confirmLabel, variant: 'primary' },
        ],
    }).then((result) => {
        if (result !== 'save') return null;
        return input.value.trim();
    });
}
