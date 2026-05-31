/* PDF Toolkit — Organize Page (drag-and-drop reorder, rotate, delete) */

let pageState = []; // [{page: 1, rotation: 0, deleted: false}, ...]

async function loadPreview(file) {
    const grid = document.getElementById('pageGrid');
    if (!grid) return;

    grid.innerHTML = '<p style="color:#6b7280">Loading pages...</p>';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const resp = await fetch('/api/preview', { method: 'POST', body: formData });
        if (!resp.ok) throw new Error('Preview failed');
        const data = await resp.json();

        pageState = data.pages.map(p => ({
            page: p.page,
            rotation: 0,
            deleted: false,
            thumbnail: p.thumbnail
        }));

        renderPageGrid();
    } catch (err) {
        grid.innerHTML = `<p style="color:#ef4444">${err.message}</p>`;
    }
}

function renderPageGrid() {
    const grid = document.getElementById('pageGrid');
    if (!grid) return;

    grid.innerHTML = '';

    pageState.forEach((ps, i) => {
        const div = document.createElement('div');
        div.className = 'page-thumb' + (ps.deleted ? ' deleted' : '');
        div.dataset.index = i;

        div.innerHTML = `
            <img src="${ps.thumbnail}" alt="Page ${ps.page}"
                 style="transform: rotate(${ps.rotation}deg)">
            <div class="page-thumb-label">Page ${ps.page}</div>
            <div class="page-thumb-actions">
                <button onclick="rotatePage(${i}, -90)" title="Rotate left">&#8634;</button>
                <button onclick="rotatePage(${i}, 90)" title="Rotate right">&#8635;</button>
                <button class="delete-btn" onclick="toggleDeletePage(${i})" title="${ps.deleted ? 'Restore' : 'Delete'}">
                    ${ps.deleted ? '&#8634;' : '&#10005;'}
                </button>
            </div>
        `;
        grid.appendChild(div);
    });

    if (typeof Sortable !== 'undefined') {
        Sortable.create(grid, {
            animation: 150,
            onEnd: (evt) => {
                const moved = pageState.splice(evt.oldIndex, 1)[0];
                pageState.splice(evt.newIndex, 0, moved);
                renderPageGrid();
            }
        });
    }
}

function rotatePage(index, angle) {
    pageState[index].rotation = (pageState[index].rotation + angle) % 360;
    renderPageGrid();
}

function toggleDeletePage(index) {
    pageState[index].deleted = !pageState[index].deleted;
    renderPageGrid();
}

function getOrganizeOps() {
    const ops = [];

    // Build reorder + delete + rotate from current state
    const activePages = pageState.filter(p => !p.deleted);

    // Reorder operation
    const order = activePages.map(p => p.page);
    ops.push({ type: 'reorder', page_order: order });

    // Delete operation
    const deletedPages = pageState.filter(p => p.deleted).map(p => p.page);
    if (deletedPages.length > 0) {
        ops.push({ type: 'delete', pages: deletedPages });
    }

    // Rotate operations (group by angle)
    const rotations = {};
    activePages.forEach(p => {
        if (p.rotation !== 0) {
            const angle = ((p.rotation % 360) + 360) % 360;
            if (!rotations[angle]) rotations[angle] = [];
            rotations[angle].push(p.page);
        }
    });
    for (const [angle, pages] of Object.entries(rotations)) {
        ops.push({ type: 'rotate', pages: pages, angle: parseInt(angle) });
    }

    return ops;
}
