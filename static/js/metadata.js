/* PDF Toolkit — Edit Metadata tool (reads current properties into the form) */

(function () {
    const body = document.getElementById('toolBody');
    if (!body || body.dataset.tool !== 'metadata') return;

    const fields = {
        title: document.getElementById('mdTitle'),
        author: document.getElementById('mdAuthor'),
        subject: document.getElementById('mdSubject'),
        keywords: document.getElementById('mdKeywords'),
        creator: document.getElementById('mdCreator'),
        producer: document.getElementById('mdProducer'),
    };
    const stripAll = document.getElementById('mdStripAll');

    window.metadataOnFile = async function (file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const resp = await fetch('/api/metadata/read', { method: 'POST', body: formData });
            if (!resp.ok) return;
            const data = await resp.json();
            Object.entries(fields).forEach(([key, input]) => {
                input.value = data[key] || '';
            });
        } catch (err) {
            /* leave fields blank — user can still type values */
        }
    };

    window.getMetadataFields = function () {
        const out = { strip_all: stripAll.checked };
        Object.entries(fields).forEach(([key, input]) => {
            out[key] = input.value || '';
        });
        return out;
    };
})();
