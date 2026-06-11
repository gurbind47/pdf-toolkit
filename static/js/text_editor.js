/* PDF Toolkit — Edit Text editor (click existing text, change or delete it) */

(function () {
    const body = document.getElementById('toolBody');
    if (!body || body.dataset.tool !== 'edit-text') return;

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const editorStatus = document.getElementById('editorStatus');
    const editsPanel = document.getElementById('editsPanel');
    const editsList = document.getElementById('editsList');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');
    const pagesPanel = document.getElementById('pagesPanel');
    const tePages = document.getElementById('tePages');
    const editorResult = document.getElementById('editorResult');
    const resultMsg = document.getElementById('resultMsg');
    const downloadLink = document.getElementById('downloadLink');
    const newFileBtn = document.getElementById('newFileBtn');

    let sourceFile = null;
    let pages = [];
    let editsById = {};
    let history = [];
    let historyIndex = -1;
    let activeEditor = null; // { span, page, wrap, input, sizeInput, colorInput }

    const BOLD_CODES = ['hebo', 'hebi', 'tibo', 'tibi', 'cobo', 'cobi'];
    const ITALIC_CODES = ['heit', 'hebi', 'tiit', 'tibi', 'coit', 'cobi'];

    function cssFontFamily(code) {
        if ((code || '').startsWith('co')) return '"Courier New", monospace';
        if ((code || '').startsWith('ti')) return '"Times New Roman", serif';
        return 'Helvetica, Arial, sans-serif';
    }

    function setStatus(message, error = false) {
        editorStatus.textContent = message;
        editorStatus.classList.toggle('is-error', error);
    }

    function parseFilename(contentDisposition, fallback = 'result.pdf') {
        if (!contentDisposition) return fallback;
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8Match && utf8Match[1]) return decodeURIComponent(utf8Match[1]);
        const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
        if (asciiMatch && asciiMatch[1]) return asciiMatch[1];
        return fallback;
    }

    function autoDownload(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    /* ---- History ---- */
    function pushHistory() {
        history = history.slice(0, historyIndex + 1);
        history.push(JSON.stringify(editsById));
        historyIndex = history.length - 1;
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        undoBtn.disabled = historyIndex <= 0;
        redoBtn.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
    }

    function undo() {
        if (historyIndex <= 0) return;
        historyIndex -= 1;
        editsById = JSON.parse(history[historyIndex]);
        renderAll();
        setStatus('Undid last change.');
    }

    function redo() {
        if (historyIndex >= history.length - 1) return;
        historyIndex += 1;
        editsById = JSON.parse(history[historyIndex]);
        renderAll();
        setStatus('Redid last change.');
    }

    /* ---- Load ---- */
    async function loadPdf(file) {
        sourceFile = file;
        setStatus('Loading pages and text...');
        tePages.innerHTML = '<p style="color:#6b7280">Loading pages...</p>';
        pagesPanel.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);

        const resp = await fetch('/api/edit-text/load', { method: 'POST', body: formData });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Load failed' }));
            throw new Error(err.error || 'Load failed');
        }

        const data = await resp.json();
        pages = data.pages || [];
        editsById = {};
        history = [];
        historyIndex = -1;
        pushHistory();
        editorResult.classList.add('hidden');
        editsPanel.classList.remove('hidden');
        renderAll();

        const spanCount = pages.reduce((sum, p) => sum + (p.spans || []).length, 0);
        const ocrPages = pages.filter((p) => p.source === 'ocr').length;
        let message = `Loaded ${pages.length} page${pages.length === 1 ? '' : 's'}, ${spanCount} text snippets. Click any text to edit it.`;
        if (ocrPages) message += ` ${ocrPages} scanned page${ocrPages === 1 ? '' : 's'} detected — edits there paint over the image.`;
        setStatus(message);
    }

    /* ---- Rendering ---- */
    function renderAll() {
        closeInlineEditor(false);
        renderPages();
        renderEditsList();
        updateHistoryButtons();
    }

    function renderPages() {
        tePages.innerHTML = '';
        pages.forEach((page) => {
            const wrap = document.createElement('div');
            wrap.className = 'ff-page te-page';
            wrap.dataset.page = page.page;

            if (page.source === 'ocr') {
                const banner = document.createElement('div');
                banner.className = 'te-ocr-banner';
                banner.textContent = 'Scanned page — edited words are painted over the original image.';
                wrap.appendChild(banner);
            }

            const img = document.createElement('img');
            img.src = page.image;
            img.alt = `Page ${page.page}`;
            img.draggable = false;

            const overlay = document.createElement('div');
            overlay.className = 'ff-overlay te-overlay';
            overlay.dataset.page = page.page;

            wrap.appendChild(img);
            wrap.appendChild(overlay);

            const label = document.createElement('div');
            label.className = 'ff-page-label';
            label.textContent = `Page ${page.page} of ${pages.length}`;
            wrap.appendChild(label);

            tePages.appendChild(wrap);

            img.addEventListener('load', () => renderSpans(overlay, page));
            if (img.complete) renderSpans(overlay, page);
        });
    }

    function scaleFor(overlay, page) {
        return (overlay.clientWidth || 1) / (page.width || 612);
    }

    function renderSpans(overlay, page) {
        overlay.innerHTML = '';
        const scale = scaleFor(overlay, page);

        (page.spans || []).forEach((span) => {
            const edit = editsById[span.id];
            const node = document.createElement('div');
            node.className = 'te-span';
            node.style.left = `${span.x_pct}%`;
            node.style.top = `${span.y_pct}%`;
            node.style.width = `${span.width_pct}%`;
            node.style.height = `${span.height_pct}%`;
            node.title = span.text;

            if (edit && edit.delete) {
                node.classList.add('te-deleted');
            } else if (edit) {
                node.classList.add('te-edited');
                node.textContent = edit.new_text;
                node.style.fontSize = `${Math.max(7, (edit.size || span.size) * scale)}px`;
                node.style.color = edit.color || span.color;
                node.style.fontFamily = cssFontFamily(edit.font || span.font);
                node.style.fontWeight = BOLD_CODES.includes(edit.font || span.font) ? '700' : '400';
                node.style.fontStyle = ITALIC_CODES.includes(edit.font || span.font) ? 'italic' : 'normal';
            }

            node.addEventListener('click', (event) => {
                event.stopPropagation();
                openInlineEditor(overlay, page, span);
            });

            overlay.appendChild(node);
        });
    }

    /* ---- Inline editor ---- */
    function openInlineEditor(overlay, page, span) {
        closeInlineEditor(true);

        const edit = editsById[span.id];
        const scale = scaleFor(overlay, page);
        const startText = edit && !edit.delete ? edit.new_text : span.text;
        const startSize = (edit && edit.size) || span.size;
        const startColor = (edit && edit.color) || span.color;

        const wrap = document.createElement('div');
        wrap.className = 'te-edit-wrap';
        wrap.style.left = `${span.x_pct}%`;
        wrap.style.top = `${span.y_pct}%`;
        wrap.style.minWidth = `${Math.max(span.width_pct, 18)}%`;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'te-edit-input';
        input.value = startText;
        input.style.fontSize = `${Math.max(9, startSize * scale)}px`;
        input.style.color = startColor;
        input.style.fontFamily = cssFontFamily(span.font);
        input.style.height = `${Math.max(16, (span.height_pct / 100) * overlay.clientHeight + 6)}px`;

        const toolbar = document.createElement('div');
        toolbar.className = 'te-toolbar';
        toolbar.innerHTML = `
            <label>Size <input type="number" class="te-size" min="4" max="96" step="0.5" value="${startSize}"></label>
            <label>Color <input type="color" class="te-color" value="${startColor}"></label>
            <button type="button" class="te-delete" title="Delete this text from the PDF">Delete text</button>
        `;
        // keep clicks on the toolbar from blurring the input
        toolbar.addEventListener('pointerdown', (event) => {
            if (!(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLButtonElement)) {
                event.preventDefault();
            }
        });

        wrap.appendChild(input);
        wrap.appendChild(toolbar);
        overlay.appendChild(wrap);

        const sizeInput = toolbar.querySelector('.te-size');
        const colorInput = toolbar.querySelector('.te-color');

        sizeInput.addEventListener('input', () => {
            input.style.fontSize = `${Math.max(9, Number(sizeInput.value || startSize) * scale)}px`;
        });
        colorInput.addEventListener('input', () => {
            input.style.color = colorInput.value;
        });

        toolbar.querySelector('.te-delete').addEventListener('click', () => {
            editsById[span.id] = { ...span, page: page.page, delete: true };
            activeEditor = null;
            wrap.remove();
            pushHistory();
            renderAll();
            setStatus('Text marked for deletion.');
        });

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commitInlineEditor();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeInlineEditor(false);
                renderAll();
            }
        });
        input.addEventListener('blur', () => {
            // delay so toolbar interactions (color picker) don't kill the editor
            setTimeout(() => {
                if (activeEditor && !wrap.contains(document.activeElement)) {
                    commitInlineEditor();
                }
            }, 150);
        });

        activeEditor = { span, page, wrap, input, sizeInput, colorInput };
        input.focus();
        input.select();
    }

    function commitInlineEditor() {
        if (!activeEditor) return;
        const { span, page, wrap, input, sizeInput, colorInput } = activeEditor;
        const newText = input.value;
        const newSize = Number(sizeInput.value) || span.size;
        const newColor = colorInput.value;
        activeEditor = null;
        wrap.remove();

        const unchanged = newText === span.text && newSize === span.size && newColor === span.color;
        if (unchanged) {
            if (editsById[span.id]) {
                delete editsById[span.id];
                pushHistory();
            }
            renderAll();
            return;
        }

        if (!newText.trim()) {
            editsById[span.id] = { ...span, page: page.page, delete: true };
            setStatus('Text marked for deletion.');
        } else {
            editsById[span.id] = {
                ...span,
                page: page.page,
                new_text: newText,
                size: newSize,
                color: newColor,
            };
            setStatus('Edit recorded. Save when you are done.');
        }
        pushHistory();
        renderAll();
    }

    function closeInlineEditor(silent) {
        if (!activeEditor) return;
        const { wrap } = activeEditor;
        activeEditor = null;
        wrap.remove();
        if (!silent) setStatus('Edit cancelled.');
    }

    /* ---- Sidebar list ---- */
    function renderEditsList() {
        editsList.innerHTML = '';
        const edits = Object.values(editsById);
        if (edits.length === 0) {
            editsList.innerHTML = '<p class="editor-empty">No changes yet.</p>';
            return;
        }
        edits.forEach((edit) => {
            const item = document.createElement('div');
            item.className = 'editor-element-row';
            const change = edit.delete
                ? `<s>${edit.text}</s> (deleted)`
                : `“${edit.text}” → “${edit.new_text}”`;
            item.innerHTML = `
                <div>
                    <strong>Page ${edit.page}</strong>
                    <p>${change}</p>
                </div>
                <button type="button" class="file-item-remove" title="Revert">&times;</button>
            `;
            item.querySelector('button').addEventListener('click', () => {
                delete editsById[edit.id];
                pushHistory();
                renderAll();
                setStatus('Edit reverted.');
            });
            editsList.appendChild(item);
        });
    }

    /* ---- Save ---- */
    async function save() {
        if (!sourceFile) return setStatus('Upload a PDF first.', true);
        const edits = Object.values(editsById);
        if (edits.length === 0) return setStatus('Make at least one text edit first.', true);

        closeInlineEditor(true);
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        const formData = new FormData();
        formData.append('file', sourceFile);
        formData.append('edits', JSON.stringify(edits));

        try {
            const resp = await fetch('/api/edit-text/apply', { method: 'POST', body: formData });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Save failed' }));
                throw new Error(err.error || 'Save failed');
            }
            const blob = await resp.blob();
            const filename = parseFilename(resp.headers.get('Content-Disposition') || '', 'text-edited.pdf');
            const url = URL.createObjectURL(blob);
            downloadLink.href = url;
            downloadLink.download = filename;
            downloadLink.textContent = `Download ${filename}`;
            resultMsg.textContent = `File ready: ${Math.round(blob.size / 1024)} KB`;
            editorResult.classList.remove('hidden');
            autoDownload(url, filename);
            setStatus('Edited PDF saved.');
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save edited PDF';
        }
    }

    function resetEditor() {
        sourceFile = null;
        pages = [];
        editsById = {};
        history = [];
        historyIndex = -1;
        activeEditor = null;
        tePages.innerHTML = '';
        pagesPanel.classList.add('hidden');
        editsPanel.classList.add('hidden');
        editorResult.classList.add('hidden');
        fileInput.value = '';
        setStatus('Upload a PDF to begin.');
    }

    /* ---- Wiring ---- */
    dropzone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', async (event) => {
        event.preventDefault();
        dropzone.classList.remove('dragover');
        const file = event.dataTransfer.files && event.dataTransfer.files[0];
        if (!file) return;
        try { await loadPdf(file); } catch (error) { setStatus(error.message, true); }
    });
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try { await loadPdf(file); } catch (error) { setStatus(error.message, true); }
        fileInput.value = '';
    });

    saveBtn.addEventListener('click', save);
    resetBtn.addEventListener('click', resetEditor);
    newFileBtn.addEventListener('click', resetEditor);
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    document.addEventListener('keydown', (event) => {
        const tag = (event.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        const isMeta = event.metaKey || event.ctrlKey;
        if (!isMeta) return;
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
        else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
    });

    updateHistoryButtons();
})();
