/* PDF Toolkit — Add PDF Editor */

(function () {
    const body = document.getElementById('toolBody');
    if (!body) return;

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const pageGrid = document.getElementById('pageGrid');
    const workspacePanel = document.getElementById('workspacePanel');
    const editorStatus = document.getElementById('editorStatus');
    const selectedPagePanel = document.getElementById('selectedPagePanel');
    const selectedPageInfo = document.getElementById('selectedPageInfo');
    const selectedElementList = document.getElementById('selectedElementList');
    const savePdfBtn = document.getElementById('savePdfBtn');
    const resetEditorBtn = document.getElementById('resetEditorBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const editorResult = document.getElementById('editorResult');
    const resultMsg = document.getElementById('resultMsg');
    const downloadLink = document.getElementById('downloadLink');
    const newFileBtn = document.getElementById('newFileBtn');

    const textPanel = document.getElementById('textPanel');
    const signaturePanel = document.getElementById('signaturePanel');
    const imagePanel = document.getElementById('imagePanel');
    const redactionPanel = document.getElementById('redactionPanel');
    const toolButtons = document.querySelectorAll('[data-tool-panel]');

    const startTextPlacement = document.getElementById('startTextPlacement');
    const startSignaturePlacement = document.getElementById('startSignaturePlacement');
    const startImagePlacement = document.getElementById('startImagePlacement');
    const startRedactionPlacement = document.getElementById('startRedactionPlacement');
    const useSignatureBtn = document.getElementById('useSignature');
    const clearSignatureBtn = document.getElementById('clearSignature');
    const signatureCanvas = document.getElementById('signatureCanvas');
    const signatureFile = document.getElementById('signatureFile');
    const imageFile = document.getElementById('imageFile');

    const textValue = document.getElementById('textValue');
    const textFont = document.getElementById('textFont');
    const textSize = document.getElementById('textSize');
    const textColor = document.getElementById('textColor');
    const textAlign = document.getElementById('textAlign');
    const textWidth = document.getElementById('textWidth');

    const signatureWidth = document.getElementById('signatureWidth');
    const signatureHeight = document.getElementById('signatureHeight');
    const imageWidth = document.getElementById('imageWidth');
    const imageHeight = document.getElementById('imageHeight');
    const redactWidth = document.getElementById('redactWidth');
    const redactHeight = document.getElementById('redactHeight');
    const redactColor = document.getElementById('redactColor');

    let sourceFile = null;
    let pageState = [];
    let selectedPageSourcePage = -1;
    let selectedElementId = null;
    let placementMode = null;
    let signatureDataUrl = '';
    let sortableInstance = null;
    let history = [];
    let historyIndex = -1;
    let nextElementId = 1;
    let activePointerInteraction = null;
    let clipboardElement = null;

    const canvasCtx = signatureCanvas ? signatureCanvas.getContext('2d') : null;

    function setStatus(message, error = false) {
        editorStatus.textContent = message;
        editorStatus.classList.toggle('is-error', error);
    }

    function cloneState() {
        return JSON.parse(JSON.stringify({
            pageState,
            selectedPageSourcePage,
            selectedElementId,
            placementMode,
            signatureDataUrl,
            nextElementId,
        }));
    }

    function restoreState(snapshot) {
        pageState = snapshot.pageState || [];
        selectedPageSourcePage = snapshot.selectedPageSourcePage ?? -1;
        selectedElementId = snapshot.selectedElementId ?? null;
        placementMode = snapshot.placementMode ?? null;
        signatureDataUrl = snapshot.signatureDataUrl ?? '';
        nextElementId = snapshot.nextElementId || 1;
        renderPageGrid();
        renderSelectedPageDetails();
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        if (undoBtn) undoBtn.disabled = historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
    }

    function pushHistory() {
        const snapshot = cloneState();
        history = history.slice(0, historyIndex + 1);
        history.push(snapshot);
        historyIndex = history.length - 1;
        updateHistoryButtons();
    }

    function initHistory() {
        history = [cloneState()];
        historyIndex = 0;
        updateHistoryButtons();
    }

    function undo() {
        if (historyIndex <= 0) return;
        historyIndex -= 1;
        restoreState(history[historyIndex]);
        setStatus('Undid last change.');
    }

    function redo() {
        if (historyIndex >= history.length - 1) return;
        historyIndex += 1;
        restoreState(history[historyIndex]);
        setStatus('Redid last change.');
    }

    function getSelectedPage() {
        return pageState.find((entry) => entry.sourcePage === selectedPageSourcePage) || null;
    }

    function getSelectedElement() {
        const page = getSelectedPage();
        if (!page || selectedElementId == null) return null;
        return page.elements.find((element) => element.id === selectedElementId) || null;
    }

    function selectElement(pageSourcePage, elementId) {
        selectedPageSourcePage = pageSourcePage;
        selectedElementId = elementId;
        renderPageGrid();
        renderSelectedPageDetails();
    }

    function deleteSelectedElement() {
        const page = getSelectedPage();
        if (!page || selectedElementId == null) return;
        const before = page.elements.length;
        page.elements = page.elements.filter((element) => element.id !== selectedElementId);
        if (page.elements.length !== before) {
            selectedElementId = null;
            pushHistory();
            renderPageGrid();
            renderSelectedPageDetails();
            setStatus('Deleted selected element.');
        }
    }

    function generateElementId() {
        const id = nextElementId;
        nextElementId += 1;
        return id;
    }

    function copySelectedElement() {
        const element = getSelectedElement();
        if (!element) return;
        clipboardElement = JSON.parse(JSON.stringify(element));
        setStatus(`Copied ${element.type}.`);
    }

    function pasteClipboardElement() {
        if (!clipboardElement) return;
        const page = getSelectedPage();
        if (!page) return;

        const copy = JSON.parse(JSON.stringify(clipboardElement));
        copy.id = generateElementId();
        copy.x_pct = clamp((copy.x_pct || 0) + 2, 0, 98);
        copy.y_pct = clamp((copy.y_pct || 0) + 2, 0, 98);
        page.elements.push(copy);
        selectedElementId = copy.id;
        pushHistory();
        renderPageGrid();
        renderSelectedPageDetails();
        setStatus(`Pasted ${copy.type}.`);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function findClosestTextItem(page, xPct, yPct) {
        const textItems = page.textItems || [];
        if (textItems.length === 0) return null;

        let best = null;
        let bestDistance = Infinity;
        textItems.forEach((item) => {
            const centerX = item.x_pct + (item.width_pct / 2);
            const centerY = item.y_pct + (item.height_pct / 2);
            const distance = Math.hypot(centerX - xPct, centerY - yPct);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = item;
            }
        });

        return bestDistance <= 12 ? best : null;
    }

    function dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const binary = atob(parts[1] || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mime });
    }

    function showPanel(panelId) {
        [textPanel, signaturePanel, imagePanel, redactionPanel].forEach(panel => {
            if (panel) panel.classList.add('hidden');
        });
        const panel = document.getElementById(panelId);
        if (panel) panel.classList.remove('hidden');

        toolButtons.forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.toolPanel === panelId);
        });
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

    async function loadPreview(file) {
        const formData = new FormData();
        formData.append('file', file);

        setStatus('Loading pages...');
        pageGrid.innerHTML = '<p style="color:#6b7280">Loading pages...</p>';

        const resp = await fetch('/api/preview', { method: 'POST', body: formData });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Preview failed' }));
            throw new Error(err.error || 'Preview failed');
        }

        const data = await resp.json();
        pageState = data.pages.map((page) => ({
            sourcePage: page.page,
            rotation: 0,
            deleted: false,
            thumbnail: page.thumbnail,
            width: page.width,
            height: page.height,
            textItems: page.text_items || [],
            elements: [],
        }));

        selectedPageSourcePage = pageState.length > 0 ? pageState[0].sourcePage : -1;
        selectedElementId = null;
        workspacePanel.classList.remove('hidden');
        selectedPagePanel.classList.remove('hidden');
        renderPageGrid();
        renderSelectedPageDetails();
        initHistory();
        setStatus(`Loaded ${pageState.length} page${pageState.length === 1 ? '' : 's'}. Click a page to edit it.`);
    }

    function getActivePages() {
        return pageState.filter((page) => !page.deleted);
    }

    function renderPageGrid() {
        if (!pageGrid) return;

        pageGrid.innerHTML = '';

        pageState.forEach((page, index) => {
            const card = document.createElement('div');
            card.className = 'page-thumb' + (page.deleted ? ' deleted' : '') + (page.sourcePage === selectedPageSourcePage ? ' selected' : '');
            card.dataset.index = index;

            const preview = document.createElement('div');
            preview.className = 'page-thumb-preview';
            preview.innerHTML = `
                <img src="${page.thumbnail}" alt="Page ${page.sourcePage}" style="transform: rotate(${page.rotation}deg)">
                <div class="page-overlay"></div>
            `;

            const overlay = preview.querySelector('.page-overlay');
            page.elements.forEach((element) => {
                if (element.id == null) {
                    element.id = generateElementId();
                }
                const elementNode = document.createElement('div');
                elementNode.className = `editor-element editor-element-${element.type}`;
                if (element.id === selectedElementId) {
                    elementNode.classList.add('selected');
                }
                elementNode.style.left = `${element.x_pct}%`;
                elementNode.style.top = `${element.y_pct}%`;
                elementNode.style.width = `${element.width_pct || 12}%`;
                elementNode.style.height = `${element.height_pct || 6}%`;
                if (element.type === 'text') {
                    elementNode.textContent = element.text;
                    elementNode.style.fontSize = `${Math.max(Number(element.font_size || 12) / 3, 8)}px`;
                    elementNode.style.color = element.color || '#111111';
                } else if (element.type === 'redaction') {
                    elementNode.textContent = 'Redaction';
                } else {
                    elementNode.textContent = element.type === 'signature' ? 'Signature' : 'Image';
                }

                const handles = [
                    { name: 'nw', cursor: 'nwse-resize' },
                    { name: 'ne', cursor: 'nesw-resize' },
                    { name: 'sw', cursor: 'nesw-resize' },
                    { name: 'se', cursor: 'nwse-resize' },
                ];
                handles.forEach((handle) => {
                    const handleNode = document.createElement('span');
                    handleNode.className = `editor-resize-handle ${handle.name}`;
                    handleNode.title = 'Resize';
                    handleNode.style.cursor = handle.cursor;
                    handleNode.addEventListener('pointerdown', (event) => {
                        beginElementInteraction(index, element.id, 'resize', event, handle.name);
                    });
                    elementNode.appendChild(handleNode);
                });

                elementNode.addEventListener('pointerdown', (event) => {
                    if (event.target.classList.contains('editor-resize-handle')) return;
                    beginElementInteraction(index, element.id, 'drag', event);
                });
                elementNode.addEventListener('click', (event) => {
                    event.stopPropagation();
                    selectElement(page.sourcePage, element.id);
                });
                overlay.appendChild(elementNode);
            });

            preview.addEventListener('click', (event) => {
                if (placementMode) {
                    placeElementOnPage(index, event);
                } else {
                    selectedPageSourcePage = page.sourcePage;
                    selectedElementId = null;
                    renderPageGrid();
                    renderSelectedPageDetails();
                }
            });

            const label = document.createElement('div');
            label.className = 'page-thumb-label';
            label.textContent = `Page ${page.sourcePage}`;

            const actions = document.createElement('div');
            actions.className = 'page-thumb-actions';
            actions.innerHTML = `
                <button type="button" title="Rotate left">&#8634;</button>
                <button type="button" title="Rotate right">&#8635;</button>
                <button type="button" class="delete-btn" title="${page.deleted ? 'Restore' : 'Delete'}">${page.deleted ? '&#8634;' : '&#10005;'}</button>
            `;

            const [rotateLeftBtn, rotateRightBtn, deleteBtn] = actions.querySelectorAll('button');
            rotateLeftBtn.addEventListener('click', () => {
                page.rotation = (page.rotation - 90) % 360;
                pushHistory();
                renderPageGrid();
            });
            rotateRightBtn.addEventListener('click', () => {
                page.rotation = (page.rotation + 90) % 360;
                pushHistory();
                renderPageGrid();
            });
            deleteBtn.addEventListener('click', () => {
                page.deleted = !page.deleted;
                if (page.deleted && page.sourcePage === selectedPageSourcePage) {
                    const firstActivePage = getActivePages()[0];
                    selectedPageSourcePage = firstActivePage ? firstActivePage.sourcePage : -1;
                    selectedElementId = null;
                }
                pushHistory();
                renderPageGrid();
                renderSelectedPageDetails();
            });

            card.appendChild(preview);
            card.appendChild(label);
            card.appendChild(actions);
            pageGrid.appendChild(card);
        });

        if (sortableInstance) {
            sortableInstance.destroy();
            sortableInstance = null;
        }

        if (typeof Sortable !== 'undefined') {
            sortableInstance = Sortable.create(pageGrid, {
                animation: 150,
                onEnd: (evt) => {
                    const moved = pageState.splice(evt.oldIndex, 1)[0];
                    pageState.splice(evt.newIndex, 0, moved);
                    pushHistory();
                    renderPageGrid();
                    renderSelectedPageDetails();
                },
            });
        }
    }

    function renderSelectedPageDetails() {
        const page = pageState.find((entry) => entry.sourcePage === selectedPageSourcePage) || null;
        if (!page) {
            selectedPageInfo.innerHTML = '<p>No page selected.</p>';
            selectedElementList.innerHTML = '';
            return;
        }

        selectedPageInfo.innerHTML = `
            <p><strong>Source page:</strong> ${page.sourcePage}</p>
            <p><strong>Elements:</strong> ${page.elements.length}</p>
            <p><strong>Text matches:</strong> ${(page.textItems || []).length}</p>
            <p><strong>Status:</strong> ${page.deleted ? 'Deleted' : 'Active'}</p>
        `;

        selectedElementList.innerHTML = '';
        if (page.elements.length === 0) {
            selectedElementList.innerHTML = '<p class="editor-empty">No annotations on this page yet.</p>';
            return;
        }

        page.elements.forEach((element, idx) => {
            const item = document.createElement('div');
            item.className = 'editor-element-row' + (element.id === selectedElementId ? ' selected' : '');
            item.innerHTML = `
                <div>
                    <strong>${element.type}</strong>
                    <p>${element.type === 'text' ? element.text : `${element.width_pct || 0}% × ${element.height_pct || 0}%`}</p>
                </div>
                <button type="button" class="file-item-remove">&times;</button>
            `;
            item.addEventListener('click', () => {
                selectElement(page.sourcePage, element.id);
            });
            item.querySelector('button').addEventListener('click', (event) => {
                event.stopPropagation();
                page.elements.splice(idx, 1);
                selectedElementId = null;
                pushHistory();
                renderPageGrid();
                renderSelectedPageDetails();
            });
            selectedElementList.appendChild(item);
        });
    }

    function beginElementInteraction(pageIndex, elementId, interactionType, startEvent, resizeHandle = null) {
        startEvent.preventDefault();
        startEvent.stopPropagation();

        const page = pageState[pageIndex];
        const element = page && page.elements.find((entry) => entry.id === elementId);
        if (!page || !element) return;

        selectedPageSourcePage = page.sourcePage;
        selectedElementId = elementId;
        renderPageGrid();
        renderSelectedPageDetails();

        const previewNode = startEvent.currentTarget.closest('.page-thumb-preview');
        if (!previewNode) return;

        const rect = previewNode.getBoundingClientRect();
        const startSnapshot = JSON.parse(JSON.stringify(element));
        const pointerId = startEvent.pointerId;
        let changed = false;

        const onMove = (event) => {
            if (event.pointerId != null && event.pointerId !== pointerId) return;
            const dxPct = ((event.clientX - startEvent.clientX) / rect.width) * 100;
            const dyPct = ((event.clientY - startEvent.clientY) / rect.height) * 100;

            if (interactionType === 'drag') {
                const width = Number(startSnapshot.width_pct || 12);
                const height = Number(startSnapshot.height_pct || 6);
                element.x_pct = clamp(startSnapshot.x_pct + dxPct, 0, Math.max(0, 100 - width));
                element.y_pct = clamp(startSnapshot.y_pct + dyPct, 0, Math.max(0, 100 - height));
            } else {
                let newX = startSnapshot.x_pct;
                let newY = startSnapshot.y_pct;
                let newWidth = startSnapshot.width_pct || 12;
                let newHeight = startSnapshot.height_pct || 6;

                if (resizeHandle === 'se') {
                    newWidth += dxPct;
                    newHeight += dyPct;
                } else if (resizeHandle === 'sw') {
                    newX += dxPct;
                    newWidth -= dxPct;
                    newHeight += dyPct;
                } else if (resizeHandle === 'ne') {
                    newY += dyPct;
                    newWidth += dxPct;
                    newHeight -= dyPct;
                } else {
                    newX += dxPct;
                    newY += dyPct;
                    newWidth -= dxPct;
                    newHeight -= dyPct;
                }

                newWidth = clamp(newWidth, 1, 100);
                newHeight = clamp(newHeight, 1, 100);
                newX = clamp(newX, 0, 100 - newWidth);
                newY = clamp(newY, 0, 100 - newHeight);

                element.x_pct = newX;
                element.y_pct = newY;
                element.width_pct = newWidth;
                element.height_pct = newHeight;
            }

            changed = true;
            renderPageGrid();
            renderSelectedPageDetails();
        };

        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            if (changed) {
                pushHistory();
                setStatus(`${interactionType === 'drag' ? 'Moved' : 'Resized'} ${element.type}.`);
            }
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }

    function activatePlacement(mode, payload) {
        placementMode = { mode, payload };
        const label = {
            text: 'Text placement active. Click a page where you want the text to appear.',
            signature: 'Signature placement active. Click a page to place the signature.',
            image: 'Image placement active. Click a page to place the image.',
            redaction: 'Redaction placement active. Click a page to cover content.',
        }[mode];
        setStatus(label || 'Placement active. Click a page to place the element.');
    }

    function placeElementOnPage(pageIndex, event) {
        const page = pageState[pageIndex];
        if (!page || !placementMode) return;

        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        const xPct = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
        const yPct = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
        const payload = placementMode.payload || {};
        const snappedTextItem = placementMode.mode === 'text' ? findClosestTextItem(page, xPct, yPct) : null;

        const element = {
            id: generateElementId(),
            page: page.sourcePage,
            x_pct: snappedTextItem ? snappedTextItem.x_pct : xPct,
            y_pct: snappedTextItem ? snappedTextItem.y_pct : yPct,
            type: placementMode.mode,
            ...payload,
        };

        if (placementMode.mode === 'text') {
            const matchedFont = snappedTextItem ? snappedTextItem.font_family : null;
            const matchedSize = snappedTextItem ? snappedTextItem.font_size : null;
            if (matchedFont) {
                element.font_family = matchedFont;
                textFont.value = matchedFont;
            }
            if (matchedSize) {
                element.font_size = Math.max(6, Math.round(matchedSize));
                textSize.value = String(element.font_size);
            }
            element.width_pct = snappedTextItem ? Math.max(5, snappedTextItem.width_pct) : Number(textWidth.value || 30);
            element.height_pct = snappedTextItem ? Math.max(2, snappedTextItem.height_pct) : 6;
        } else if (placementMode.mode === 'signature') {
            element.width_pct = Number(signatureWidth.value || 22);
            element.height_pct = Number(signatureHeight.value || 10);
        } else if (placementMode.mode === 'image') {
            element.width_pct = Number(imageWidth.value || 25);
            element.height_pct = Number(imageHeight.value || 15);
        } else if (placementMode.mode === 'redaction') {
            element.width_pct = Number(redactWidth.value || 24);
            element.height_pct = Number(redactHeight.value || 8);
        }

        page.elements.push(element);
        placementMode = null;
        selectedElementId = element.id;
        pushHistory();
        setStatus(`Placed ${element.type} on page ${page.sourcePage}.`);
        renderPageGrid();
        renderSelectedPageDetails();
    }

    async function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('Unable to read image file'));
            reader.readAsDataURL(file);
        });
    }

    function clearSignatureCanvas() {
        if (!canvasCtx || !signatureCanvas) return;
        canvasCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
        canvasCtx.fillStyle = '#ffffff';
        canvasCtx.fillRect(0, 0, signatureCanvas.width, signatureCanvas.height);
        canvasCtx.lineWidth = 3;
        canvasCtx.lineCap = 'round';
        canvasCtx.strokeStyle = '#111111';
    }

    function canvasHasInk() {
        if (!signatureCanvas) return false;
        const pixels = canvasCtx.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height).data;
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255) {
                return true;
            }
        }
        return false;
    }

    function setupSignaturePad() {
        if (!signatureCanvas || !canvasCtx) return;
        clearSignatureCanvas();

        let drawing = false;
        let lastPoint = null;

        const getPoint = (event) => {
            const rect = signatureCanvas.getBoundingClientRect();
            return {
                x: ((event.clientX - rect.left) / rect.width) * signatureCanvas.width,
                y: ((event.clientY - rect.top) / rect.height) * signatureCanvas.height,
            };
        };

        signatureCanvas.addEventListener('pointerdown', (event) => {
            drawing = true;
            signatureCanvas.setPointerCapture(event.pointerId);
            lastPoint = getPoint(event);
        });

        signatureCanvas.addEventListener('pointermove', (event) => {
            if (!drawing || !lastPoint) return;
            const point = getPoint(event);
            canvasCtx.beginPath();
            canvasCtx.moveTo(lastPoint.x, lastPoint.y);
            canvasCtx.lineTo(point.x, point.y);
            canvasCtx.stroke();
            lastPoint = point;
        });

        const stopDrawing = () => {
            drawing = false;
            lastPoint = null;
        };

        signatureCanvas.addEventListener('pointerup', stopDrawing);
        signatureCanvas.addEventListener('pointerleave', stopDrawing);
    }

    function buildPageOperations() {
        const activePages = getActivePages();
        const operations = [];

        operations.push({
            type: 'reorder',
            page_order: activePages.map((page) => page.sourcePage),
        });

        const deletedPages = pageState.filter((page) => page.deleted).map((page) => page.sourcePage);
        if (deletedPages.length > 0) {
            operations.push({ type: 'delete', pages: deletedPages });
        }

        const rotations = {};
        activePages.forEach((page) => {
            const angle = ((page.rotation % 360) + 360) % 360;
            if (angle !== 0) {
                if (!rotations[angle]) rotations[angle] = [];
                rotations[angle].push(page.sourcePage);
            }
        });

        Object.entries(rotations).forEach(([angle, pages]) => {
            operations.push({ type: 'rotate', pages, angle: parseInt(angle, 10) });
        });

        return operations;
    }

    function buildElements() {
        const elements = [];
        pageState.forEach((page) => {
            if (page.deleted) return;
            page.elements.forEach((element) => {
                const { id, ...rest } = element;
                elements.push({
                    ...rest,
                    page: page.sourcePage,
                });
            });
        });
        return elements;
    }

    async function savePdf() {
        if (!sourceFile) {
            setStatus('Upload a PDF first.', true);
            return;
        }

        const formData = new FormData();
        formData.append('file', sourceFile);
        formData.append('page_operations', JSON.stringify(buildPageOperations()));
        formData.append('elements', JSON.stringify(buildElements()));

        savePdfBtn.disabled = true;
        savePdfBtn.textContent = 'Saving...';

        try {
            const resp = await fetch('/api/add-pdf', { method: 'POST', body: formData });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Save failed' }));
                throw new Error(err.error || 'Save failed');
            }

            const blob = await resp.blob();
            const filename = parseFilename(resp.headers.get('Content-Disposition') || '', 'edited.pdf');
            const url = URL.createObjectURL(blob);
            downloadLink.href = url;
            downloadLink.download = filename;
            downloadLink.textContent = `Download ${filename}`;
            resultMsg.textContent = `File ready: ${Math.round(blob.size / 1024)} KB`;

            editorResult.classList.remove('hidden');
            autoDownload(url, filename);
            setStatus('PDF saved successfully.');
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            savePdfBtn.disabled = false;
            savePdfBtn.textContent = 'Save edited PDF';
        }
    }

    function resetEditor() {
        sourceFile = null;
        pageState = [];
        selectedPageSourcePage = -1;
        selectedElementId = null;
        placementMode = null;
        signatureDataUrl = '';
        history = [];
        historyIndex = -1;
        nextElementId = 1;
        if (sortableInstance) {
            sortableInstance.destroy();
            sortableInstance = null;
        }
        editorResult.classList.add('hidden');
        workspacePanel.classList.add('hidden');
        selectedPagePanel.classList.add('hidden');
        pageGrid.innerHTML = '';
        fileInput.value = '';
        signatureFile.value = '';
        imageFile.value = '';
        clearSignatureCanvas();
        setStatus('Upload a PDF to begin.');
        updateHistoryButtons();
    }

    dropzone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', async (event) => {
        event.preventDefault();
        dropzone.classList.remove('dragover');
        const file = event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) {
            sourceFile = file;
            try {
                await loadPreview(file);
            } catch (error) {
                setStatus(error.message, true);
            }
        }
    });

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        sourceFile = file;
        try {
            await loadPreview(file);
        } catch (error) {
            setStatus(error.message, true);
        }
        fileInput.value = '';
    });

    toolButtons.forEach((btn) => {
        btn.addEventListener('click', () => showPanel(btn.dataset.toolPanel));
    });

    startTextPlacement.addEventListener('click', () => {
        if (!sourceFile) return setStatus('Upload a PDF first.', true);
        const text = textValue.value.trim();
        if (!text) return setStatus('Enter text before placing it.', true);
        activatePlacement('text', {
            text,
            font_family: textFont.value,
            font_size: Number(textSize.value || 14),
            color: textColor.value,
            align: textAlign.value,
        });
    });

    startSignaturePlacement.addEventListener('click', async () => {
        if (!sourceFile) return setStatus('Upload a PDF first.', true);
        if (!signatureDataUrl) {
            return setStatus('Draw or upload a signature image first.', true);
        }
        activatePlacement('signature', {
            data_url: signatureDataUrl,
        });
    });

    startImagePlacement.addEventListener('click', async () => {
        if (!sourceFile) return setStatus('Upload a PDF first.', true);
        const file = imageFile.files && imageFile.files[0];
        if (!file) return setStatus('Choose an image file first.', true);
        const dataUrl = await fileToDataUrl(file);
        activatePlacement('image', {
            data_url: dataUrl,
        });
    });

    startRedactionPlacement.addEventListener('click', () => {
        if (!sourceFile) return setStatus('Upload a PDF first.', true);
        activatePlacement('redaction', {
            fill: redactColor.value,
        });
    });

    useSignatureBtn.addEventListener('click', () => {
        if (!canvasHasInk()) {
            setStatus('Draw a signature before using it.', true);
            return;
        }
        signatureDataUrl = signatureCanvas.toDataURL('image/png');
        setStatus('Signature captured. Click a page to place it.');
    });

    clearSignatureBtn.addEventListener('click', () => {
        clearSignatureCanvas();
        signatureDataUrl = '';
        setStatus('Signature cleared.');
    });

    signatureFile.addEventListener('change', async () => {
        const file = signatureFile.files && signatureFile.files[0];
        if (!file) return;
        signatureDataUrl = await fileToDataUrl(file);
        setStatus('Signature image ready. Click a page to place it.');
    });

    savePdfBtn.addEventListener('click', savePdf);
    resetEditorBtn.addEventListener('click', resetEditor);
    newFileBtn.addEventListener('click', resetEditor);
    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);

    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        const isMeta = event.metaKey || event.ctrlKey;

        if ((key === 'delete' || key === 'backspace') && selectedElementId != null) {
            event.preventDefault();
            deleteSelectedElement();
            return;
        }

        if (!isMeta || event.altKey) return;

        if (key === 'z' && !event.shiftKey) {
            event.preventDefault();
            undo();
        } else if ((key === 'y') || (key === 'z' && event.shiftKey)) {
            event.preventDefault();
            redo();
        } else if (key === 'c') {
            event.preventDefault();
            copySelectedElement();
        } else if (key === 'v') {
            event.preventDefault();
            pasteClipboardElement();
        }
    });

    setupSignaturePad();
    showPanel('textPanel');
    clearSignatureCanvas();
})();
