/* PDF Toolkit — Upload & Process Logic */

(function () {
    const body = document.getElementById('toolBody');
    if (!body) return;

    const toolId = body.dataset.tool;
    const acceptRaw = body.dataset.accept;

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    const fileList = document.getElementById('fileList');
    const stepUpload = document.getElementById('stepUpload');
    const stepOptions = document.getElementById('stepOptions');
    const stepResult = document.getElementById('stepResult');
    const processBtn = document.getElementById('processBtn');
    const btnText = document.getElementById('btnText');
    const spinner = document.getElementById('spinner');
    const downloadLink = document.getElementById('downloadLink');
    const resultMsg = document.getElementById('resultMsg');
    const resetBtn = document.getElementById('resetBtn');

    let files = [];

    /* ---- Thumbnail state ---- */
    let objectUrls = [];          // image preview URLs to revoke
    let sortableInstance = null;  // single Sortable instance for the grid
    const fetchQueue = [];        // PDFs waiting for a first-page thumbnail
    let activeFetches = 0;
    const MAX_FETCH = 4;          // cap concurrent thumbnail requests

    const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.gif', '.webp'];

    const thumbObserver = ('IntersectionObserver' in window)
        ? new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    thumbObserver.unobserve(entry.target);
                    queuePdfThumb(entry.target._file);
                }
            });
        }, { rootMargin: '300px' })
        : null;

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    function fileExt(f) {
        const name = (f.name || '').toLowerCase();
        const dot = name.lastIndexOf('.');
        return dot > -1 ? name.slice(dot) : '';
    }

    function fileKind(f) {
        const ext = fileExt(f);
        if ((f.type && f.type.startsWith('image/')) || IMG_EXTS.includes(ext)) return 'image';
        if (f.type === 'application/pdf' || ext === '.pdf') return 'pdf';
        return 'other';
    }

    function extLabel(f) {
        const ext = fileExt(f).replace('.', '').toUpperCase();
        return ext || 'FILE';
    }

    /* ---- Drag & Drop ---- */
    dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        addFiles(e.dataTransfer.files);
    });
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        addFiles(fileInput.files);
        fileInput.value = '';
    });

    if (folderInput) {
        folderInput.addEventListener('change', () => {
            addFiles(folderInput.files);
            folderInput.value = '';
        });
    }

    function addFiles(newFiles) {
        const multi = fileInput.hasAttribute('multiple');
        for (const f of newFiles) {
            if (!multi && files.length >= 1) break;
            files.push(f);
        }
        renderFileList();
        if (files.length > 0) {
            showStep('stepOptions');
            stepUpload.classList.remove('hidden');

            if (toolId === 'organize') {
                loadPreview(files[0]);
            } else if (toolId === 'crop' && typeof window.cropOnFile === 'function') {
                window.cropOnFile(files[0]);
            } else if (toolId === 'metadata' && typeof window.metadataOnFile === 'function') {
                window.metadataOnFile(files[0]);
            }
        }
    }

    function getSelectedFiles() {
        if (files.length > 0) return files;

        const picked = [];
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            picked.push(...fileInput.files);
        }
        if (folderInput && folderInput.files && folderInput.files.length > 0) {
            picked.push(...folderInput.files);
        }
        return picked;
    }

    function prepareFile(f) {
        if (f._kind) return;
        f._kind = fileKind(f);
        if (f._kind === 'image') {
            f._url = URL.createObjectURL(f);
            f._thumb = f._url;
            f._thumbState = 'done';
            objectUrls.push(f._url);
        } else if (f._kind === 'pdf') {
            f._thumbState = 'pending';
            f._pages = 0;
        } else {
            f._thumbState = 'done';
        }
    }

    function thumbInner(f) {
        if ((f._kind === 'image' || f._kind === 'pdf') && f._thumbState === 'done' && f._thumb) {
            return `<img src="${f._thumb}" alt="">`;
        }
        if (f._kind === 'pdf' && f._thumbState !== 'error') {
            return `<div class="file-thumb-loading"><span class="spinner"></span></div>`;
        }
        return `<div class="file-thumb-badge">${escapeHtml(extLabel(f))}</div>`;
    }

    function metaText(f) {
        const size = formatBytes(f.size);
        return f._pages ? `${size} &middot; ${f._pages} pg` : size;
    }

    function renderFileList() {
        const multi = fileInput.hasAttribute('multiple');

        if (sortableInstance) {
            sortableInstance.destroy();
            sortableInstance = null;
        }

        fileList.classList.add('file-grid');
        fileList.innerHTML = '';

        files.forEach((f) => {
            prepareFile(f);

            const tile = document.createElement('div');
            tile.className = 'file-thumb';
            tile._file = f;
            tile.innerHTML = `
                ${multi ? '<span class="file-thumb-handle" title="Drag to reorder">&#9776;</span>' : ''}
                <button class="file-thumb-remove" title="Remove">&times;</button>
                <div class="file-thumb-preview">${thumbInner(f)}</div>
                <div class="file-thumb-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
                <div class="file-thumb-meta">${metaText(f)}</div>
            `;
            fileList.appendChild(tile);

            if (f._kind === 'pdf' && f._thumbState === 'pending') {
                if (thumbObserver) thumbObserver.observe(tile);
                else queuePdfThumb(f);
            }
        });

        fileList.querySelectorAll('.file-thumb-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const tile = e.currentTarget.closest('.file-thumb');
                const idx = Array.from(fileList.children).indexOf(tile);
                if (idx > -1) removeFileAt(idx);
            });
        });

        // Drag-reorder for multi-file tools
        if (multi && typeof Sortable !== 'undefined') {
            sortableInstance = Sortable.create(fileList, {
                handle: '.file-thumb-handle',
                animation: 150,
                onEnd: (evt) => {
                    const moved = files.splice(evt.oldIndex, 1)[0];
                    files.splice(evt.newIndex, 0, moved);
                }
            });
        }
    }

    function removeFileAt(idx) {
        const f = files[idx];
        if (f && f._url) {
            URL.revokeObjectURL(f._url);
            objectUrls = objectUrls.filter(u => u !== f._url);
        }
        files.splice(idx, 1);
        if (files.length === 0) {
            showStep('stepUpload');
            fileList.innerHTML = '';
        } else {
            renderFileList();
        }
    }

    /* ---- PDF thumbnail loading (lazy + throttled) ---- */
    function queuePdfThumb(f) {
        if (!f || f._thumbState !== 'pending') return;
        f._thumbState = 'queued';
        fetchQueue.push(f);
        pumpQueue();
    }

    function pumpQueue() {
        while (activeFetches < MAX_FETCH && fetchQueue.length) {
            loadPdfThumb(fetchQueue.shift());
        }
    }

    async function loadPdfThumb(f) {
        activeFetches++;
        f._thumbState = 'loading';
        try {
            const fd = new FormData();
            fd.append('file', f);
            const resp = await fetch('/api/thumbnail', { method: 'POST', body: fd });
            if (!resp.ok) throw new Error('thumbnail failed');
            const data = await resp.json();
            f._thumb = data.thumbnail || null;
            f._pages = data.pages || 0;
            f._thumbState = f._thumb ? 'done' : 'error';
        } catch (err) {
            f._thumbState = 'error';
        } finally {
            activeFetches--;
            updateTile(f);
            pumpQueue();
        }
    }

    function updateTile(f) {
        const tile = Array.from(fileList.children).find(t => t._file === f);
        if (!tile) return;
        const preview = tile.querySelector('.file-thumb-preview');
        if (preview) preview.innerHTML = thumbInner(f);
        const meta = tile.querySelector('.file-thumb-meta');
        if (meta) meta.innerHTML = metaText(f);
    }

    function revokeAll() {
        objectUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) { /* noop */ } });
        objectUrls = [];
        fetchQueue.length = 0;
    }

    /* ---- Split mode toggle ---- */
    if (toolId === 'split') {
        document.querySelectorAll('input[name="splitMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                document.getElementById('splitRangesOpt').classList.toggle('hidden', radio.value !== 'ranges');
                document.getElementById('splitPagesOpt').classList.toggle('hidden', radio.value !== 'pages');
                document.getElementById('splitExtractOpt').classList.toggle('hidden', radio.value !== 'extract');
            });
        });
    }

    /* ---- Watermark opacity display ---- */
    const wmOpacity = document.getElementById('wmOpacity');
    const wmOpacityVal = document.getElementById('wmOpacityVal');
    if (wmOpacity && wmOpacityVal) {
        wmOpacity.addEventListener('input', () => { wmOpacityVal.textContent = wmOpacity.value; });
    }

    /* ---- Process ---- */
    if (processBtn) {
        processBtn.addEventListener('click', () => processFiles());
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

    async function maybeCompressBeforeDownload(blob, filename) {
        const isPdf = filename.toLowerCase().endsWith('.pdf');
        if (toolId === 'compress' || !isPdf) {
            return { blob, filename };
        }

        const shouldCompress = window.confirm(
            'Do you want to compress this PDF before download?\n\nOK = Compress first\nCancel = Download now'
        );

        if (!shouldCompress) {
            return { blob, filename };
        }

        const levelChoice = window.prompt(
            'Choose compression level:\n1 = Maximum compression (low)\n2 = Balanced (medium)\n3 = Minimal compression (high)',
            '2'
        );

        const selected = (levelChoice || '2').trim().toLowerCase();
        const levelMap = {
            '1': 'low',
            '2': 'medium',
            '3': 'high',
            low: 'low',
            medium: 'medium',
            high: 'high',
        };
        const quality = levelMap[selected] || 'medium';

        const compressData = new FormData();
        compressData.append('files', new File([blob], filename, { type: 'application/pdf' }));
        compressData.append('quality', quality);

        const compressedResp = await fetch('/api/compress', { method: 'POST', body: compressData });
        if (!compressedResp.ok) {
            const err = await compressedResp.json().catch(() => ({ error: 'Compression failed' }));
            throw new Error(err.error || 'Compression failed');
        }

        const compressedBlob = await compressedResp.blob();
        const compressedFilename = parseFilename(
            compressedResp.headers.get('Content-Disposition') || '',
            filename.replace(/\.pdf$/i, '-compressed.pdf')
        );

        return { blob: compressedBlob, filename: compressedFilename };
    }

    async function processFiles() {
        const activeFiles = getSelectedFiles();
        if (activeFiles.length === 0) return showError('No files selected.');

        btnText.textContent = 'Processing...';
        spinner.classList.remove('hidden');
        processBtn.disabled = true;

        const formData = new FormData();

        // Build request based on tool
        let endpoint = '';

        if (toolId === 'merge') {
            endpoint = '/api/merge';
            files.forEach(f => formData.append('files', f));

        } else if (toolId === 'split') {
            endpoint = '/api/split';
            formData.append('file', files[0]);
            const mode = document.querySelector('input[name="splitMode"]:checked').value;
            formData.append('mode', mode);
            if (mode === 'ranges') formData.append('ranges', document.getElementById('splitRanges').value);
            else if (mode === 'pages') formData.append('pages_per_split', document.getElementById('splitPagesN').value);
            else if (mode === 'extract') formData.append('pages', document.getElementById('splitExtract').value);

        } else if (toolId === 'organize') {
            endpoint = '/api/organize';
            formData.append('file', files[0]);
            formData.append('operations', JSON.stringify(getOrganizeOps()));

        } else if (toolId === 'compress') {
            endpoint = '/api/compress';
            activeFiles.forEach(f => formData.append('files', f));
            formData.append('quality', document.querySelector('input[name="quality"]:checked').value);

        } else if (toolId === 'convert') {
            endpoint = '/api/convert';
            formData.append('file', files[0]);

        } else if (toolId === 'watermark') {
            endpoint = '/api/watermark';
            formData.append('file', files[0]);
            formData.append('text', document.getElementById('wmText').value);
            formData.append('font_size', document.getElementById('wmSize').value);
            formData.append('color', document.getElementById('wmColor').value);
            formData.append('opacity', document.getElementById('wmOpacity').value);
            formData.append('angle', document.getElementById('wmAngle').value);

        } else if (toolId === 'page-numbers') {
            endpoint = '/api/page-numbers';
            formData.append('file', files[0]);
            formData.append('position', document.getElementById('pnPosition').value);
            formData.append('format', document.getElementById('pnFormat').value);
            formData.append('font_size', document.getElementById('pnFontSize').value);
            formData.append('skip_first', document.getElementById('pnSkipFirst').checked);

        } else if (toolId === 'export') {
            endpoint = '/api/pdf-to-images';
            formData.append('file', files[0]);
            formData.append('format', document.getElementById('exportFmt').value);
            formData.append('dpi', document.getElementById('exportDpi').value);

        } else if (toolId === 'background-remove') {
            endpoint = '/api/background-remove';
            formData.append('file', files[0]);

        } else if (toolId === 'protect') {
            endpoint = '/api/protect';
            formData.append('file', files[0]);
            formData.append('password', document.getElementById('protectPw').value);

        } else if (toolId === 'unlock') {
            endpoint = '/api/unlock';
            formData.append('file', files[0]);
            formData.append('password', document.getElementById('unlockPw').value);

        } else if (toolId === 'pdf-to-word') {
            endpoint = '/api/pdf-to-word';
            formData.append('file', files[0]);

        } else if (toolId === 'pdf-to-excel') {
            endpoint = '/api/pdf-to-excel';
            formData.append('file', files[0]);
            formData.append('layout', document.querySelector('input[name="xlsLayout"]:checked').value);

        } else if (toolId === 'pdf-to-powerpoint') {
            endpoint = '/api/pdf-to-powerpoint';
            formData.append('file', files[0]);
            formData.append('dpi', document.getElementById('pptDpi').value);

        } else if (toolId === 'ocr') {
            endpoint = '/api/ocr';
            formData.append('file', files[0]);
            formData.append('lang', document.getElementById('ocrLang').value);
            formData.append('force', document.getElementById('ocrForce').checked);

        } else if (toolId === 'crop') {
            endpoint = '/api/crop';
            formData.append('file', files[0]);
            const cropOps = window.getCropOps ? window.getCropOps() : {};
            Object.entries(cropOps).forEach(([key, value]) => formData.append(key, value));

        } else if (toolId === 'repair') {
            endpoint = '/api/repair';
            formData.append('file', files[0]);

        } else if (toolId === 'metadata') {
            endpoint = '/api/metadata/write';
            formData.append('file', files[0]);
            const mdFields = window.getMetadataFields ? window.getMetadataFields() : {};
            Object.entries(mdFields).forEach(([key, value]) => formData.append(key, value));
        }

        try {
            const resp = await fetch(endpoint, { method: 'POST', body: formData });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Processing failed' }));
                throw new Error(err.error || 'Processing failed');
            }

            const blob = await resp.blob();
            const filename = parseFilename(resp.headers.get('Content-Disposition') || '', 'result.pdf');
            const finalResult = await maybeCompressBeforeDownload(blob, filename);
            const url = URL.createObjectURL(finalResult.blob);

            downloadLink.href = url;
            downloadLink.download = finalResult.filename;
            downloadLink.textContent = `Download ${finalResult.filename}`;
            resultMsg.textContent = `File ready: ${formatBytes(finalResult.blob.size)}`;

            showStep('stepResult');
            autoDownload(url, finalResult.filename);

        } catch (err) {
            showError(err.message);
        } finally {
            btnText.textContent = 'Process';
            spinner.classList.add('hidden');
            processBtn.disabled = false;
        }
    }

    /* ---- Reset ---- */
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            revokeAll();
            if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
            files = [];
            fileList.innerHTML = '';
            showStep('stepUpload');
            stepOptions.classList.add('hidden');
            stepResult.classList.add('hidden');
            stepUpload.classList.remove('hidden');
        });
    }
})();
