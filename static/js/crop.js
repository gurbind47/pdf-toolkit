/* PDF Toolkit — Crop tool (draggable crop rectangle synced with margin inputs) */

(function () {
    const body = document.getElementById('toolBody');
    if (!body || body.dataset.tool !== 'crop') return;

    const wrap = document.getElementById('cropPreviewWrap');
    const previewImg = document.getElementById('cropPreviewImg');
    const rectEl = document.getElementById('cropRectEl');
    const inputs = {
        top: document.getElementById('cropTop'),
        bottom: document.getElementById('cropBottom'),
        left: document.getElementById('cropLeft'),
        right: document.getElementById('cropRight'),
    };
    const pagesInput = document.getElementById('cropPages');

    let pageWidth = 612;   // points, from preview response
    let pageHeight = 792;
    let cropRect = { x: 0, y: 0, w: 100, h: 100 }; // percentages

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function renderRect() {
        rectEl.style.left = `${cropRect.x}%`;
        rectEl.style.top = `${cropRect.y}%`;
        rectEl.style.width = `${cropRect.w}%`;
        rectEl.style.height = `${cropRect.h}%`;
    }

    function syncInputsFromRect() {
        inputs.left.value = Math.round((cropRect.x / 100) * pageWidth);
        inputs.top.value = Math.round((cropRect.y / 100) * pageHeight);
        inputs.right.value = Math.round(((100 - cropRect.x - cropRect.w) / 100) * pageWidth);
        inputs.bottom.value = Math.round(((100 - cropRect.y - cropRect.h) / 100) * pageHeight);
    }

    function syncRectFromInputs() {
        const left = Number(inputs.left.value || 0);
        const top = Number(inputs.top.value || 0);
        const right = Number(inputs.right.value || 0);
        const bottom = Number(inputs.bottom.value || 0);

        const x = clamp((left / pageWidth) * 100, 0, 95);
        const y = clamp((top / pageHeight) * 100, 0, 95);
        cropRect = {
            x,
            y,
            w: clamp(100 - x - (right / pageWidth) * 100, 5, 100 - x),
            h: clamp(100 - y - (bottom / pageHeight) * 100, 5, 100 - y),
        };
        renderRect();
    }

    Object.values(inputs).forEach((input) => {
        input.addEventListener('change', syncRectFromInputs);
    });

    function beginInteraction(event, mode, handle) {
        event.preventDefault();
        event.stopPropagation();

        const bounds = previewImg.getBoundingClientRect();
        const start = { ...cropRect };
        const pointerId = event.pointerId;

        const onMove = (moveEvent) => {
            if (moveEvent.pointerId != null && moveEvent.pointerId !== pointerId) return;
            const dx = ((moveEvent.clientX - event.clientX) / bounds.width) * 100;
            const dy = ((moveEvent.clientY - event.clientY) / bounds.height) * 100;

            if (mode === 'drag') {
                cropRect.x = clamp(start.x + dx, 0, 100 - start.w);
                cropRect.y = clamp(start.y + dy, 0, 100 - start.h);
            } else {
                let { x, y, w, h } = start;
                if (handle === 'se') { w += dx; h += dy; }
                else if (handle === 'sw') { x += dx; w -= dx; h += dy; }
                else if (handle === 'ne') { y += dy; w += dx; h -= dy; }
                else { x += dx; y += dy; w -= dx; h -= dy; }

                w = clamp(w, 5, 100);
                h = clamp(h, 5, 100);
                x = clamp(x, 0, 100 - w);
                y = clamp(y, 0, 100 - h);
                cropRect = { x, y, w, h };
            }

            renderRect();
            syncInputsFromRect();
        };

        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }

    rectEl.addEventListener('pointerdown', (event) => {
        if (event.target.classList.contains('crop-handle')) return;
        beginInteraction(event, 'drag');
    });

    rectEl.querySelectorAll('.crop-handle').forEach((handleEl) => {
        const handle = ['nw', 'ne', 'sw', 'se'].find((name) => handleEl.classList.contains(name));
        handleEl.addEventListener('pointerdown', (event) => beginInteraction(event, 'resize', handle));
    });

    window.cropOnFile = async function (file) {
        wrap.classList.remove('hidden');
        previewImg.removeAttribute('src');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const resp = await fetch('/api/crop/preview', { method: 'POST', body: formData });
            if (!resp.ok) throw new Error('Preview failed');
            const data = await resp.json();
            previewImg.src = data.page.image;
            pageWidth = data.page.width || pageWidth;
            pageHeight = data.page.height || pageHeight;
            cropRect = { x: 0, y: 0, w: 100, h: 100 };
            renderRect();
            syncInputsFromRect();
        } catch (err) {
            wrap.classList.add('hidden');
        }
    };

    window.getCropOps = function () {
        return {
            mode: 'rect',
            rect_pct: JSON.stringify(cropRect),
            pages: pagesInput.value || '',
        };
    };

    renderRect();
})();
