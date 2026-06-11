/* PDF Toolkit — PDF Forms editor (fill existing fields / create new fields) */

(function () {
    const body = document.getElementById('toolBody');
    if (!body || body.dataset.tool !== 'pdf-forms') return;

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const editorStatus = document.getElementById('editorStatus');
    const modePanel = document.getElementById('modePanel');
    const modeFillBtn = document.getElementById('modeFillBtn');
    const modeEditBtn = document.getElementById('modeEditBtn');
    const xfaWarning = document.getElementById('xfaWarning');
    const fillPanel = document.getElementById('fillPanel');
    const editPanel = document.getElementById('editPanel');
    const fieldList = document.getElementById('fieldList');
    const flattenChk = document.getElementById('flattenChk');
    const saveFilledBtn = document.getElementById('saveFilledBtn');
    const saveFieldsBtn = document.getElementById('saveFieldsBtn');
    const fieldTypeButtons = document.getElementById('fieldTypeButtons');
    const fieldProps = document.getElementById('fieldProps');
    const propName = document.getElementById('propName');
    const propValue = document.getElementById('propValue');
    const propValueWrap = document.getElementById('propValueWrap');
    const propOptions = document.getElementById('propOptions');
    const propOptionsWrap = document.getElementById('propOptionsWrap');
    const propFontSize = document.getElementById('propFontSize');
    const propRequired = document.getElementById('propRequired');
    const deleteFieldBtn = document.getElementById('deleteFieldBtn');
    const pagesPanel = document.getElementById('pagesPanel');
    const ffPages = document.getElementById('ffPages');
    const editorResult = document.getElementById('editorResult');
    const resultMsg = document.getElementById('resultMsg');
    const downloadLink = document.getElementById('downloadLink');
    const newFileBtn = document.getElementById('newFileBtn');

    let sourceFile = null;
    let pages = [];
    let fields = [];        // existing widgets from the PDF (each gets a local id)
    let added = [];         // new fields drawn by the user
    let deletedXrefs = [];
    let fillValues = {};    // xref -> typed value (fill mode)
    let mode = 'fill';
    let isXfa = false;
    let armedType = null;
    let selectedId = null;
    let nextId = 1;
    let history = [];
    let historyIndex = -1;

    const TYPE_LABELS = {
        text: 'Text', date: 'Date', checkbox: 'Checkbox', radio: 'Choice group',
        combobox: 'Dropdown', listbox: 'List', signature: 'Signature', signbox: 'Sign here', button: 'Button',
    };

    function setStatus(message, error = false) {
        editorStatus.textContent = message;
        editorStatus.classList.toggle('is-error', error);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
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

    /* ---- Undo history (edit mode geometry/props) ---- */
    function cloneEditState() {
        return JSON.parse(JSON.stringify({ fields, added, deletedXrefs, nextId }));
    }

    function pushHistory() {
        history = history.slice(0, historyIndex + 1);
        history.push(cloneEditState());
        historyIndex = history.length - 1;
    }

    function undo() {
        if (historyIndex <= 0) return;
        historyIndex -= 1;
        const snap = history[historyIndex];
        fields = snap.fields; added = snap.added; deletedXrefs = snap.deletedXrefs; nextId = snap.nextId;
        selectedId = null;
        renderPages();
        renderProps();
        setStatus('Undid last change.');
    }

    function redo() {
        if (historyIndex >= history.length - 1) return;
        historyIndex += 1;
        const snap = history[historyIndex];
        fields = snap.fields; added = snap.added; deletedXrefs = snap.deletedXrefs; nextId = snap.nextId;
        selectedId = null;
        renderPages();
        renderProps();
        setStatus('Redid last change.');
    }

    /* ---- Load ---- */
    async function loadPdf(file) {
        sourceFile = file;
        setStatus('Loading form...');
        ffPages.innerHTML = '<p style="color:#6b7280">Loading pages...</p>';
        pagesPanel.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);

        const resp = await fetch('/api/forms/load', { method: 'POST', body: formData });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Load failed' }));
            throw new Error(err.error || 'Load failed');
        }

        const data = await resp.json();
        pages = data.pages || [];
        fields = (data.fields || []).map((f) => ({ ...f, id: nextId++, dirty: false }));
        added = [];
        deletedXrefs = [];
        fillValues = {};
        isXfa = !!data.is_xfa;
        selectedId = null;
        armedType = null;
        editorResult.classList.add('hidden');

        modePanel.classList.remove('hidden');
        xfaWarning.classList.toggle('hidden', !isXfa);
        saveFilledBtn.disabled = isXfa;
        saveFieldsBtn.disabled = isXfa;

        history = [];
        historyIndex = -1;
        pushHistory();

        setMode(data.field_count > 0 ? 'fill' : 'edit');

        if (isXfa) {
            setStatus('XFA form detected — viewing only, saving is disabled.', true);
        } else if (data.field_count > 0) {
            setStatus(`Loaded ${data.field_count} form field${data.field_count === 1 ? '' : 's'}. Type into them on the page.`);
        } else {
            setStatus('No form fields found — switch stays on Edit fields so you can draw some.');
        }
    }

    function setMode(newMode) {
        mode = newMode;
        modeFillBtn.classList.toggle('is-active', mode === 'fill');
        modeEditBtn.classList.toggle('is-active', mode === 'edit');
        fillPanel.classList.toggle('hidden', mode !== 'fill');
        editPanel.classList.toggle('hidden', mode !== 'edit');
        armedType = null;
        selectedId = null;
        updateTypeChips();
        renderPages();
        renderFieldList();
        renderProps();
    }

    function activeFields() {
        return fields.filter((f) => !deletedXrefs.includes(f.xref));
    }

    function allEditableFields() {
        return activeFields().concat(added);
    }

    function findField(id) {
        return allEditableFields().find((f) => f.id === id) || null;
    }

    /* ---- Page rendering ---- */
    function renderPages() {
        ffPages.innerHTML = '';
        pages.forEach((page) => {
            const wrap = document.createElement('div');
            wrap.className = 'ff-page';
            wrap.dataset.page = page.page;

            const img = document.createElement('img');
            img.src = page.image;
            img.alt = `Page ${page.page}`;
            img.draggable = false;

            const overlay = document.createElement('div');
            overlay.className = 'ff-overlay';
            overlay.dataset.page = page.page;

            wrap.appendChild(img);
            wrap.appendChild(overlay);

            const label = document.createElement('div');
            label.className = 'ff-page-label';
            label.textContent = `Page ${page.page} of ${pages.length}`;
            wrap.appendChild(label);

            ffPages.appendChild(wrap);

            img.addEventListener('load', () => applyFontScale(overlay, page));

            if (mode === 'fill') {
                renderFillControls(overlay, page);
            } else {
                renderEditBoxes(overlay, page);
                overlay.addEventListener('pointerdown', (event) => {
                    if (event.target !== overlay) return;
                    if (armedType) beginDrawField(overlay, page, event);
                    else { selectedId = null; renderPages(); renderProps(); }
                });
            }
        });
        if (mode === 'fill') renderFieldList();
    }

    function applyFontScale(overlay, page) {
        const scale = overlay.clientWidth / (page.width || 612);
        overlay.querySelectorAll('[data-fontsize]').forEach((node) => {
            node.style.fontSize = `${Math.max(8, Number(node.dataset.fontsize) * scale)}px`;
        });
    }

    /* ---- Fill mode ---- */
    function currentValue(field) {
        return Object.prototype.hasOwnProperty.call(fillValues, field.xref) ? fillValues[field.xref] : field.value;
    }

    function isChecked(field) {
        const value = currentValue(field);
        if (typeof value === 'boolean') return value;
        return !['', 'Off', 'false', null, undefined].includes(value);
    }

    function renderFillControls(overlay, page) {
        activeFields().filter((f) => f.page === page.page).forEach((field) => {
            let node = null;
            const rect = field.rect_pct;

            if (field.type === 'text') {
                node = document.createElement('input');
                node.type = 'text';
                node.className = 'ff-input';
                node.value = currentValue(field) || '';
                if (field.max_len) node.maxLength = field.max_len;
                node.dataset.fontsize = field.fontsize || 11;
                node.addEventListener('input', () => { fillValues[field.xref] = node.value; });
            } else if (field.type === 'checkbox') {
                node = document.createElement('input');
                node.type = 'checkbox';
                node.className = 'ff-check';
                node.checked = isChecked(field);
                node.addEventListener('change', () => { fillValues[field.xref] = node.checked; });
            } else if (field.type === 'radio') {
                node = document.createElement('input');
                node.type = 'radio';
                node.className = 'ff-check';
                node.name = `ff-radio-${field.name}`;
                node.checked = field.on_state != null && currentValue(field) === field.on_state;
                node.addEventListener('change', () => {
                    activeFields().filter((m) => m.name === field.name).forEach((m) => {
                        fillValues[m.xref] = (m.id === field.id) ? m.on_state : 'Off';
                    });
                });
            } else if (field.type === 'combobox' || field.type === 'listbox') {
                node = document.createElement('select');
                node.className = 'ff-select';
                node.dataset.fontsize = field.fontsize || 11;
                const blank = document.createElement('option');
                blank.value = '';
                blank.textContent = '—';
                node.appendChild(blank);
                (field.options || []).forEach((opt) => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.label;
                    node.appendChild(option);
                });
                node.value = currentValue(field) || '';
                node.addEventListener('change', () => { fillValues[field.xref] = node.value; });
            } else if (field.type === 'signature') {
                node = document.createElement('div');
                node.className = 'ff-sigbox';
                node.textContent = 'Signature field (use the Add PDF tool to place a signature image)';
            } else {
                return; // buttons etc.
            }

            node.style.left = `${rect.x}%`;
            node.style.top = `${rect.y}%`;
            node.style.width = `${rect.w}%`;
            node.style.height = `${rect.h}%`;
            node.dataset.fieldId = field.id;
            if (field.required) node.classList.add('ff-required');
            overlay.appendChild(node);
        });
    }

    function renderFieldList() {
        if (mode !== 'fill') return;
        fieldList.innerHTML = '';
        const list = activeFields();
        if (list.length === 0) {
            fieldList.innerHTML = '<p class="editor-empty">No fields in this PDF. Switch to “Edit fields” to add some.</p>';
            return;
        }
        list.forEach((field) => {
            if (field.type === 'button') return;
            const item = document.createElement('div');
            item.className = 'editor-element-row';
            item.innerHTML = `
                <div>
                    <strong>${field.name}</strong>
                    <p>${TYPE_LABELS[field.type] || field.type} · page ${field.page}${field.required ? ' · required' : ''}</p>
                </div>
            `;
            item.addEventListener('click', () => {
                const node = ffPages.querySelector(`[data-field-id="${field.id}"]`);
                if (node) {
                    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    node.classList.add('ff-flash');
                    setTimeout(() => node.classList.remove('ff-flash'), 1200);
                    if (node.focus) node.focus({ preventScroll: true });
                }
            });
            fieldList.appendChild(item);
        });
    }

    async function saveFilled() {
        if (!sourceFile) return setStatus('Upload a PDF first.', true);

        const values = [];
        activeFields().forEach((field) => {
            if (field.type === 'button' || field.type === 'signature') return;
            if (field.type === 'radio') {
                const value = currentValue(field);
                if (field.on_state != null && value === field.on_state) {
                    values.push({ xref: field.xref, value: field.on_state });
                }
                return;
            }
            values.push({ xref: field.xref, value: currentValue(field) ?? '' });
        });

        await submit(saveFilledBtn, '/api/forms/fill', {
            values: JSON.stringify(values),
            flatten: String(flattenChk.checked),
        }, 'filled.pdf', 'Filled PDF saved.');
    }

    /* ---- Edit mode ---- */
    function updateTypeChips() {
        fieldTypeButtons.querySelectorAll('.tool-chip').forEach((chip) => {
            chip.classList.toggle('is-active', chip.dataset.fieldType === armedType);
        });
    }

    function renderEditBoxes(overlay, page) {
        allEditableFields().filter((f) => f.page === page.page).forEach((field) => {
            if (field.type === 'button') return;
            const rect = field.rect_pct;
            const box = document.createElement('div');
            box.className = 'ff-box' + (field.id === selectedId ? ' selected' : '');
            box.style.left = `${rect.x}%`;
            box.style.top = `${rect.y}%`;
            box.style.width = `${rect.w}%`;
            box.style.height = `${rect.h}%`;
            box.innerHTML = `<span class="ff-box-tag">${TYPE_LABELS[field.type] || field.type}: ${field.name || ''}</span>`;

            ['nw', 'ne', 'sw', 'se'].forEach((handle) => {
                const handleNode = document.createElement('span');
                handleNode.className = `editor-resize-handle ${handle}`;
                handleNode.addEventListener('pointerdown', (event) => {
                    beginBoxInteraction(field.id, overlay, 'resize', event, handle);
                });
                box.appendChild(handleNode);
            });

            box.addEventListener('pointerdown', (event) => {
                if (event.target.classList.contains('editor-resize-handle')) return;
                beginBoxInteraction(field.id, overlay, 'drag', event);
            });

            overlay.appendChild(box);
        });
    }

    function beginBoxInteraction(fieldId, overlay, interactionType, startEvent, handle = null) {
        startEvent.preventDefault();
        startEvent.stopPropagation();

        const field = findField(fieldId);
        if (!field) return;

        selectedId = fieldId;
        renderPages();
        renderProps();

        const liveOverlay = ffPages.querySelector(`.ff-overlay[data-page="${field.page}"]`);
        const bounds = (liveOverlay || overlay).getBoundingClientRect();
        const start = { ...field.rect_pct };
        const pointerId = startEvent.pointerId;
        let changed = false;

        const onMove = (event) => {
            if (event.pointerId != null && event.pointerId !== pointerId) return;
            const dx = ((event.clientX - startEvent.clientX) / bounds.width) * 100;
            const dy = ((event.clientY - startEvent.clientY) / bounds.height) * 100;

            if (interactionType === 'drag') {
                field.rect_pct.x = clamp(start.x + dx, 0, 100 - start.w);
                field.rect_pct.y = clamp(start.y + dy, 0, 100 - start.h);
            } else {
                let { x, y, w, h } = start;
                if (handle === 'se') { w += dx; h += dy; }
                else if (handle === 'sw') { x += dx; w -= dx; h += dy; }
                else if (handle === 'ne') { y += dy; w += dx; h -= dy; }
                else { x += dx; y += dy; w -= dx; h -= dy; }
                w = clamp(w, 1, 100);
                h = clamp(h, 0.8, 100);
                x = clamp(x, 0, 100 - w);
                y = clamp(y, 0, 100 - h);
                field.rect_pct = { x, y, w, h };
            }

            changed = true;
            const node = ffPages.querySelector(`.ff-overlay[data-page="${field.page}"]`);
            if (node) {
                node.innerHTML = '';
                renderEditBoxes(node, pages.find((p) => p.page === field.page));
            }
        };

        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            if (changed) {
                if (field.xref) field.dirty = true;
                pushHistory();
            }
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }

    function beginDrawField(overlay, page, startEvent) {
        startEvent.preventDefault();
        const bounds = overlay.getBoundingClientRect();
        const startX = clamp(((startEvent.clientX - bounds.left) / bounds.width) * 100, 0, 100);
        const startY = clamp(((startEvent.clientY - bounds.top) / bounds.height) * 100, 0, 100);
        const pointerId = startEvent.pointerId;

        const ghost = document.createElement('div');
        ghost.className = 'ff-ghost';
        overlay.appendChild(ghost);

        let rect = { x: startX, y: startY, w: 0, h: 0 };

        const onMove = (event) => {
            if (event.pointerId != null && event.pointerId !== pointerId) return;
            const curX = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
            const curY = clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100);
            rect = {
                x: Math.min(startX, curX),
                y: Math.min(startY, curY),
                w: Math.abs(curX - startX),
                h: Math.abs(curY - startY),
            };
            ghost.style.left = `${rect.x}%`;
            ghost.style.top = `${rect.y}%`;
            ghost.style.width = `${rect.w}%`;
            ghost.style.height = `${rect.h}%`;
        };

        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            ghost.remove();

            if (rect.w < 1 || rect.h < 0.8) {
                // treat a click (no real drag) as a default-size field
                rect.w = armedType === 'checkbox' ? 2.5 : 25;
                rect.h = armedType === 'checkbox' ? 2 : 2.6;
                if (armedType === 'radio') { rect.w = 22; rect.h = 8; }
                if (armedType === 'signbox') { rect.w = 28; rect.h = 7; }
                rect.x = clamp(rect.x, 0, 100 - rect.w);
                rect.y = clamp(rect.y, 0, 100 - rect.h);
            }

            const typeNames = { text: 'text_field', date: 'date_field', checkbox: 'checkbox', radio: 'choice_group', combobox: 'dropdown', signbox: 'sign_here' };
            const count = added.length + 1;
            const field = {
                id: nextId++,
                page: page.page,
                type: armedType,
                name: `${typeNames[armedType] || 'field'}_${count}`,
                rect_pct: rect,
                options: (armedType === 'radio' || armedType === 'combobox') ? ['Option 1', 'Option 2'] : [],
                required: false,
                value: '',
                fontsize: 11,
            };
            added.push(field);
            selectedId = field.id;
            armedType = null;
            updateTypeChips();
            pushHistory();
            renderPages();
            renderProps();
            setStatus(`Added ${TYPE_LABELS[field.type] || field.type} on page ${page.page}.`);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }

    function renderProps() {
        const field = mode === 'edit' ? findField(selectedId) : null;
        fieldProps.classList.toggle('hidden', !field);
        if (!field) return;

        propName.value = field.name || '';
        propValue.value = typeof field.value === 'string' ? field.value : '';
        propFontSize.value = field.fontsize || 11;
        propRequired.checked = !!field.required;

        const hasOptions = ['radio', 'combobox', 'listbox'].includes(field.type);
        propOptionsWrap.classList.toggle('hidden', !hasOptions);
        propOptions.value = (field.options || [])
            .map((opt) => (typeof opt === 'object' ? opt.value : opt))
            .join('\n');
        propValueWrap.classList.toggle('hidden', ['checkbox', 'radio', 'signbox'].includes(field.type));
    }

    function applyProps() {
        const field = findField(selectedId);
        if (!field) return;
        field.name = propName.value.trim();
        field.value = propValue.value;
        field.fontsize = Number(propFontSize.value || 11);
        field.required = propRequired.checked;
        field.options = propOptions.value.split('\n').map((s) => s.trim()).filter(Boolean);
        if (field.xref) field.dirty = true;
        pushHistory();
        renderPages();
    }

    [propName, propValue, propFontSize, propOptions].forEach((input) => {
        input.addEventListener('change', applyProps);
    });
    propRequired.addEventListener('change', applyProps);

    function deleteSelected() {
        const field = findField(selectedId);
        if (!field) return;
        if (field.xref) {
            deletedXrefs.push(field.xref);
        } else {
            added = added.filter((f) => f.id !== field.id);
        }
        selectedId = null;
        pushHistory();
        renderPages();
        renderProps();
        setStatus('Field deleted.');
    }

    deleteFieldBtn.addEventListener('click', deleteSelected);

    async function saveFields() {
        if (!sourceFile) return setStatus('Upload a PDF first.', true);

        const fieldOps = {
            delete: deletedXrefs,
            update: activeFields().filter((f) => f.dirty).map((f) => ({
                xref: f.xref,
                name: f.name,
                rect_pct: f.rect_pct,
                required: f.required,
                value: typeof f.value === 'string' ? f.value : '',
                options: (f.options || []).map((opt) => (typeof opt === 'object' ? opt.value : opt)),
                fontsize: f.fontsize,
            })),
            add: added.map((f) => ({
                page: f.page,
                type: f.type,
                name: f.name,
                rect_pct: f.rect_pct,
                required: f.required,
                value: f.value,
                options: f.options,
                fontsize: f.fontsize,
            })),
        };

        await submit(saveFieldsBtn, '/api/forms/save-fields', {
            field_ops: JSON.stringify(fieldOps),
        }, 'fillable.pdf', 'Fillable PDF saved. Open it here again to test-fill it.');
    }

    /* ---- Shared save/submit ---- */
    async function submit(button, endpoint, formFields, fallbackName, successMessage) {
        const formData = new FormData();
        formData.append('file', sourceFile);
        Object.entries(formFields).forEach(([key, value]) => formData.append(key, value));

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Saving...';

        try {
            const resp = await fetch(endpoint, { method: 'POST', body: formData });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Save failed' }));
                throw new Error(err.error || 'Save failed');
            }
            const blob = await resp.blob();
            const filename = parseFilename(resp.headers.get('Content-Disposition') || '', fallbackName);
            const url = URL.createObjectURL(blob);
            downloadLink.href = url;
            downloadLink.download = filename;
            downloadLink.textContent = `Download ${filename}`;
            resultMsg.textContent = `File ready: ${Math.round(blob.size / 1024)} KB`;
            editorResult.classList.remove('hidden');
            autoDownload(url, filename);
            setStatus(successMessage);
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            button.disabled = isXfa;
            button.textContent = originalText;
        }
    }

    function resetEditor() {
        sourceFile = null;
        pages = [];
        fields = [];
        added = [];
        deletedXrefs = [];
        fillValues = {};
        selectedId = null;
        armedType = null;
        history = [];
        historyIndex = -1;
        ffPages.innerHTML = '';
        pagesPanel.classList.add('hidden');
        modePanel.classList.add('hidden');
        fillPanel.classList.add('hidden');
        editPanel.classList.add('hidden');
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

    modeFillBtn.addEventListener('click', () => setMode('fill'));
    modeEditBtn.addEventListener('click', () => setMode('edit'));

    fieldTypeButtons.querySelectorAll('.tool-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            armedType = (armedType === chip.dataset.fieldType) ? null : chip.dataset.fieldType;
            updateTypeChips();
            setStatus(armedType ? `Drag on a page to draw the ${TYPE_LABELS[armedType].toLowerCase()}.` : 'Placement cancelled.');
        });
    });

    saveFilledBtn.addEventListener('click', saveFilled);
    saveFieldsBtn.addEventListener('click', saveFields);
    newFileBtn.addEventListener('click', resetEditor);

    document.addEventListener('keydown', (event) => {
        const tag = (event.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

        if ((event.key === 'Delete' || event.key === 'Backspace') && mode === 'edit' && selectedId != null) {
            event.preventDefault();
            deleteSelected();
            return;
        }
        if (event.key === 'Escape' && armedType) {
            armedType = null;
            updateTypeChips();
            setStatus('Placement cancelled.');
            return;
        }
        const isMeta = event.metaKey || event.ctrlKey;
        if (!isMeta || mode !== 'edit') return;
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
        else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
    });
})();
