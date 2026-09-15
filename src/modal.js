/* =========================================================================
   Gridwright — Modal dialog helpers
   showAlert / showConfirm / showPrompt return Promises.
   ========================================================================= */

let modalEl,
    modalTitleEl,
    modalMessageEl,
    modalContentEl,
    modalInputEl,
    modalCancelBtn,
    modalConfirmBtn;
export const modalState = { open: false, resolve: null };

export function initModal() {
    modalEl = document.getElementById('app-modal');
    modalTitleEl = document.getElementById('modal-title');
    modalMessageEl = document.getElementById('modal-message');
    modalContentEl = document.getElementById('modal-content');
    modalInputEl = document.getElementById('modal-input');
    modalCancelBtn = document.getElementById('modal-cancel');
    modalConfirmBtn = document.getElementById('modal-confirm');

    modalConfirmBtn.addEventListener('click', () => {
        const showInput = !modalInputEl.hidden;
        closeModal(showInput ? modalInputEl.value : true);
    });
    modalCancelBtn.addEventListener('click', () => closeModal(null));
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeModal(null);
    });
    modalInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            closeModal(modalInputEl.value);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeModal(null);
        }
    });
    window.addEventListener('keydown', (e) => {
        if (!modalState.open) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal(null);
        }
    });
}

function openModal({
    title,
    message,
    content,
    showInput,
    defaultValue,
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    showCancel = true,
}) {
    modalTitleEl.textContent = title || '';
    modalMessageEl.textContent = message || '';
    modalMessageEl.style.display = message ? 'block' : 'none';
    // Custom body content: caller-supplied DOM node. Cleared and repopulated
    // each open so previous modals don't leak stale nodes.
    modalContentEl.innerHTML = '';
    if (content instanceof Node) {
        modalContentEl.appendChild(content);
        modalContentEl.hidden = false;
    } else {
        modalContentEl.hidden = true;
    }
    if (showInput) {
        modalInputEl.hidden = false;
        modalInputEl.value = defaultValue || '';
        setTimeout(() => {
            modalInputEl.focus();
            modalInputEl.select();
        }, 0);
    } else {
        modalInputEl.hidden = true;
    }
    modalConfirmBtn.textContent = confirmLabel;
    modalCancelBtn.textContent = cancelLabel;
    modalCancelBtn.style.display = showCancel ? 'inline-block' : 'none';
    modalEl.hidden = false;
    modalState.open = true;
    return new Promise((resolve) => {
        modalState.resolve = resolve;
    });
}

function closeModal(result) {
    modalEl.hidden = true;
    modalState.open = false;
    // Free the caller-supplied content so it can be garbage-collected.
    if (modalContentEl) modalContentEl.innerHTML = '';
    const r = modalState.resolve;
    modalState.resolve = null;
    if (r) r(result);
}

export function showPrompt(title, message, defaultValue = '') {
    return openModal({ title, message, showInput: true, defaultValue, confirmLabel: 'Save' });
}
export function showConfirm(title, message, opts = {}) {
    return openModal({
        title,
        message,
        content: opts.content,
        showInput: false,
        confirmLabel: opts.confirmLabel || 'OK',
        cancelLabel: opts.cancelLabel || 'Cancel',
    });
}
export function showAlert(title, message) {
    return openModal({
        title,
        message,
        showInput: false,
        confirmLabel: 'OK',
        showCancel: false,
    });
}

// Open a custom modal that hides the built-in footer (Cancel/OK) so the
// caller can render its own actions inside `content`. Returns a `close`
// function the caller can invoke when it's done. Closing programmatically
// resolves the modal promise with the value passed to `close`.
//
// `size = 'wide'` makes the modal card wider — used by the export dialog
// which needs room for a preview + controls side-by-side.
export function openCustomModal({ title, content, size }) {
    let promiseResolve;
    const promise = new Promise((res) => {
        promiseResolve = res;
    });

    modalTitleEl.textContent = title || '';
    modalMessageEl.style.display = 'none';
    modalContentEl.innerHTML = '';
    if (content instanceof Node) modalContentEl.appendChild(content);
    modalContentEl.hidden = !content;
    modalInputEl.hidden = true;

    // Hide the entire built-in footer — the caller renders its own action
    // row inside `content`. Just hiding the buttons leaves the footer
    // element itself visible, and its grey background (var(--color-bg))
    // bleeds through as an empty stripe under the content.
    const builtInFooter = modalEl.querySelector('.modal-footer');
    if (builtInFooter) builtInFooter.style.display = 'none';

    if (size === 'wide') modalEl.querySelector('.modal-card').classList.add('modal-card-wide');

    modalEl.hidden = false;
    modalState.open = true;
    modalState.resolve = (result) => {
        // Restore defaults for subsequent openModal calls. The built-in
        // buttons keep their inherited display value; the footer
        // container's inline display gets cleared so it comes back for
        // the next regular showConfirm/showAlert/showPrompt call.
        if (builtInFooter) builtInFooter.style.display = '';
        modalEl.querySelector('.modal-card').classList.remove('modal-card-wide');
        promiseResolve(result);
    };

    return {
        close: (result) => closeModal(result),
        promise,
    };
}
