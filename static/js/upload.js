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

    function renderFileList() {
        fileList.innerHTML = '';
        files.forEach((f, i) => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                ${toolId === 'merge' ? '<span class="file-item-handle">&#9776;</span>' : ''}
                <span class="file-item-name">${f.name}</span>
                <span class="file-item-size">${formatBytes(f.size)}</span>
                <button class="file-item-remove" data-idx="${i}">&times;</button>
            `;
            fileList.appendChild(div);
        });

        fileList.querySelectorAll('.file-item-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                const idx = parseInt(e.target.dataset.idx);
                files.splice(idx, 1);
                renderFileList();
                if (files.length === 0) {
                    showStep('stepUpload');
                }
            });
        });

        // Sortable for merge
        if (toolId === 'merge' && typeof Sortable !== 'undefined') {
            Sortable.create(fileList, {
                handle: '.file-item-handle',
                animation: 150,
                onEnd: (evt) => {
                    const moved = files.splice(evt.oldIndex, 1)[0];
                    files.splice(evt.newIndex, 0, moved);
                }
            });
        }
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
            files = [];
            fileList.innerHTML = '';
            showStep('stepUpload');
            stepOptions.classList.add('hidden');
            stepResult.classList.add('hidden');
            stepUpload.classList.remove('hidden');
        });
    }
})();
