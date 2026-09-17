/**
 * Hospital Radiology Ultrasound Report Print & PDF Utilities
 * Designed for Pre-Printed Letterhead Paper (A4 Portrait)
 */

function showNotification(message, type = 'success') {
    let container = document.getElementById('report_notification_toast');
    if (!container) {
        container = document.createElement('div');
        container.id = 'report_notification_toast';
        container.className = 'no-print';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 99999; min-width: 280px; max-width: 400px; pointer-events: none;';
        document.body.appendChild(container);
    }

    const bgClass = type === 'success' ? 'bg-success text-white' : type === 'error' ? 'bg-danger text-white' : 'bg-primary text-white';
    const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';

    const toast = document.createElement('div');
    toast.className = `alert ${bgClass} shadow-lg d-flex align-items-center gap-2 mb-2 p-3 rounded-3 border-0`;
    toast.style.cssText = 'pointer-events: auto; animation: fadeInDown 0.3s ease; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);';
    toast.innerHTML = `
        <span class="material-symbols-outlined fs-5">${icon}</span>
        <span class="fw-semibold small flex-grow-1">${message}</span>
        <button type="button" class="btn-close btn-close-white ms-2" onclick="this.parentElement.remove()"></button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

function applyMultiPageLayout(element) {
    if (!element) return;

    // Clear previously injected spacers and inline height
    element.querySelectorAll('.pdf-page-break-spacer').forEach(s => s.remove());
    element.style.minHeight = '';

    // Only inject PDF page break spacers when explicitly rendering a client PDF
    if (!element.classList.contains('pdf-rendering')) {
        return;
    }

    const mmToPx = element.offsetWidth / 210;
    if (!mmToPx || mmToPx <= 0) return;

    const pageHeightMM = 297;
    const headerHeightMM = 48; // Letterhead header height
    const footerHeightMM = 25; // Letterhead footer height

    // Collect all logical printable content blocks
    const blocks = [];

    // 1. Patient details section
    const patientSec = element.querySelector('.patient-details-section');
    if (patientSec) blocks.push(patientSec);

    // 2. Clinical info section (if present)
    element.querySelectorAll('section:not(.patient-details-section):not(.findings-container):not(.impression-section):not(.advice-section)').forEach(sec => {
        blocks.push(sec);
    });

    // 3. Findings section / organ groups
    const findingsContainer = element.querySelector('.findings-container');
    if (findingsContainer) {
        const title = findingsContainer.querySelector('.section-title');
        const divider = findingsContainer.querySelector('.section-divider');
        if (title) blocks.push(title);
        if (divider) blocks.push(divider);

        const organGroups = Array.from(findingsContainer.querySelectorAll('.organ-group'));
        if (organGroups.length > 0) {
            organGroups.forEach(og => blocks.push(og));
        } else {
            blocks.push(findingsContainer);
        }
    }

    // 4. Impression section
    const impressionSec = element.querySelector('.impression-section');
    if (impressionSec) blocks.push(impressionSec);

    // 5. Advice section
    const adviceSec = element.querySelector('.advice-section');
    if (adviceSec) blocks.push(adviceSec);

    // 6. Bottom signature area
    const bottomArea = element.querySelector('.report-bottom-area');
    if (bottomArea) blocks.push(bottomArea);

    let currentPage = 1;

    blocks.forEach(block => {
        const paperRect = element.getBoundingClientRect();
        const blockRect = block.getBoundingClientRect();

        const blockTopMM = (blockRect.top - paperRect.top) / mmToPx;
        const blockBottomMM = (blockRect.bottom - paperRect.top) / mmToPx;

        const maxAllowedY = (currentPage * pageHeightMM) - footerHeightMM;

        if (blockBottomMM > maxAllowedY) {
            // Next page content top begins right below header (48mm from top of next page)
            const nextPageContentTopMM = (currentPage * pageHeightMM) + headerHeightMM;
            const spacerHeightMM = nextPageContentTopMM - blockTopMM;

            if (spacerHeightMM > 0) {
                const spacer = document.createElement('div');
                spacer.className = 'pdf-page-break-spacer';
                spacer.style.cssText = `display: block; width: 100%; height: ${spacerHeightMM.toFixed(2)}mm; clear: both; background: transparent;`;
                block.parentNode.insertBefore(spacer, block);
                currentPage++;
            }
        }
    });

    // Adjust paper container min-height to exact integer multiples of 297mm
    const finalRect = element.getBoundingClientRect();
    const totalMM = finalRect.height / mmToPx;
    const numPages = Math.max(1, Math.ceil((totalMM - 2) / pageHeightMM));
    element.style.minHeight = `${numPages * pageHeightMM}mm`;
}

function resetPrintLayout() {
    const element = document.getElementById('report_paper');
    if (element) {
        element.classList.remove('pdf-rendering');
        element.querySelectorAll('.pdf-page-break-spacer').forEach(s => s.remove());
        element.style.minHeight = '';
        element.style.height = '';
        element.style.maxHeight = '';
    }
}

function waitForReportReady() {
    return new Promise((resolve) => {
        // Fast timeout so printing is never blocked or stalled
        const safetyTimer = setTimeout(() => {
            resolve();
        }, 400);

        const checkReady = () => {
            if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
                window.addEventListener('load', checkReady, { once: true });
                return;
            }

            const images = Array.from(document.querySelectorAll('img'));
            const uncompleteImages = images.filter(img => !img.complete && img.src);

            if (uncompleteImages.length > 0) {
                let loadedCount = 0;
                const total = uncompleteImages.length;
                const onDone = () => {
                    loadedCount++;
                    if (loadedCount >= total) {
                        clearTimeout(safetyTimer);
                        resolve();
                    }
                };
                uncompleteImages.forEach(img => {
                    if (img.complete) {
                        onDone();
                    } else {
                        img.addEventListener('load', onDone, { once: true });
                        img.addEventListener('error', onDone, { once: true });
                    }
                });
                return;
            }

            clearTimeout(safetyTimer);
            if (document.fonts && document.fonts.status !== 'loaded') {
                document.fonts.ready.then(() => {
                    setTimeout(resolve, 50);
                }).catch(() => {
                    setTimeout(resolve, 50);
                });
                return;
            }

            setTimeout(resolve, 50);
        };

        checkReady();
    });
}

function isInsideIframe() {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

function triggerPrint() {
    if (isInsideIframe()) {
        let printUrl = window.location.pathname;
        if (!printUrl.endsWith('/print')) {
            const match = printUrl.match(/\/report\/(\d+)/);
            if (match) {
                printUrl = `/report/${match[1]}/print`;
            }
        }
        const fullUrl = printUrl + '?autoprint=true';
        window.open(fullUrl, '_blank');
        return;
    }

    try {
        window.focus();
    } catch (_) {}
    window.print();
}
window.triggerPrint = triggerPrint;

async function downloadPDF() {
    let reportId = '';
    const reportNoElem = document.getElementById('report_no_val');
    if (reportNoElem && reportNoElem.innerText && reportNoElem.innerText.trim()) {
        reportId = reportNoElem.innerText.trim();
    }

    if (!reportId) {
        const match = window.location.pathname.match(/\/report\/(\d+)/);
        if (match) {
            reportId = match[1];
        }
    }

    if (!reportId) {
        const btnPDF = document.getElementById('btn_pdf_action');
        if (btnPDF && btnPDF.getAttribute('href')) {
            const match = btnPDF.getAttribute('href').match(/\/report\/(\d+)/);
            if (match) reportId = match[1];
        }
    }

    if (reportId) {
        if (typeof showNotification === 'function') {
            showNotification('Generating official PDF with clinic letterhead...', 'info');
        }
        try {
            const token = localStorage.getItem('mj_session_token') || sessionStorage.getItem('mj_session_token') || '';
            const headers = token ? { 'x-session-token': token } : {};
            const response = await fetch(`/report/${reportId}/pdf?download=true`, { headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `Ultrasound_Report_PT-${reportId}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
            if (typeof showNotification === 'function') {
                showNotification('PDF downloaded successfully!', 'success');
            }
        } catch (err) {
            console.warn('Blob PDF download failed, falling back to location download:', err);
            window.location.href = `/report/${reportId}/pdf?download=true`;
        }
    } else {
        console.error('Could not find report ID for PDF download');
        if (typeof showNotification === 'function') {
            showNotification('Report ID not found for PDF download.', 'error');
        }
    }
}
window.downloadPDF = downloadPDF;

document.addEventListener('DOMContentLoaded', function() {
    resetPrintLayout();

    const btnPrint = document.getElementById('btn_print_action');
    if (btnPrint) {
        btnPrint.addEventListener('click', function(e) {
            if (e) {
                if (typeof e.preventDefault === 'function') e.preventDefault();
                if (typeof e.stopPropagation === 'function') e.stopPropagation();
            }
            triggerPrint();
        });
    }
});

window.addEventListener('pageshow', function() {
    resetPrintLayout();
});

window.addEventListener('resize', function() {
    const element = document.getElementById('report_paper');
    if (element && element.classList.contains('pdf-rendering')) {
        applyMultiPageLayout(element);
    }
});

window.addEventListener('beforeprint', function() {
    resetPrintLayout();
});

window.addEventListener('afterprint', function() {
    resetPrintLayout();
});
