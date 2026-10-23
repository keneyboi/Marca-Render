let qrCodeInstance = null;
let qrScanner = null;
let camIsOpen = false;
let isProcessingScan = false;

document.addEventListener("DOMContentLoaded", () => {

    const attendanceForm = document.getElementById("attendance-form");
    if (attendanceForm) {
        attendanceForm.addEventListener("submit", (e) => {
            e.preventDefault();              
            submitAttendance(attendanceForm);
        });
    }

});

// end the form in the background (fetch), then patch only the parts of the page that changed.
async function submitAttendance(form) {
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;      

    try {
        const response = await fetch(form.action, {
            method: "POST",
            body: new FormData(form),           
            headers: { "X-Requested-With": "XMLHttpRequest" },
            credentials: "same-origin",
        });

        // If the session expired Django redirects to the landing page, which
        // is HTML, not JSON. Detect that instead of crashing on response.json().
        const type = response.headers.get("content-type") || "";
        if (!type.includes("application/json")) {
            showToast("Your session may have expired. Please refresh the page and log in again.", "error");
            isProcessingScan = false;
            return;
        }

        const data = await response.json();

        if (data.ok) {
            showToast(data.message, "success");
            updateRowFromServer(data);
            updateCounters(data.counts);
            form.reset();
            await resetScanner();                
        } else if (data.not_found && data.student) {
            showToast("Attendee not found in roster.", "error");
            if (window.openScannerAddRecordModal) {
                window.openScannerAddRecordModal(data.student);
            }
            isProcessingScan = false;
        } else {
            showToast(data.message || "Attendance request failed.", "error");
            isProcessingScan = false;           
        }
    } catch (err) {
        console.error("Attendance request failed:", err);
        showToast("Network problem. Attendance was NOT saved. Please try again.", "error");
        isProcessingScan = false;
    } finally {
        if (button) button.disabled = false;
    }
}

function updateRowFromServer(data) {
    if (!data) return;
    const rowData = data.row || data;
    const recordId = rowData.record_id || data.record_id;
    if (!recordId) return;

    let row = document.querySelector(`tr.attendance-row[data-record-id="${recordId}"]`);
    if (!row && data.row_html) {
        if (window.reloadRoster) window.reloadRoster();
        return;
    }
    if (!row) return;                           

    const setText = (field, value) => {
        if (value !== undefined && value !== null) {
            const cell = row.querySelector(`[data-field="${field}"]`);
            if (cell) cell.textContent = value;
        }
    };

    ["timed_in_1", "timed_out_1", "timed_in_2", "timed_out_2", "edited_by"]
        .forEach((field) => setText(field, rowData[field]));

    if (rowData.status) {
        const badge = row.querySelector('[data-field="status"]');
        if (badge) {
            const badgeClass = rowData.status_class || rowData.status.toLowerCase();
            badge.className = `badge badge-${badgeClass}`;
            badge.textContent = rowData.status_label || rowData.status;
        }
        row.dataset.status = rowData.status;
    }
    if (window.refreshAttendanceRow) window.refreshAttendanceRow(row);
}

function updateCounters(counts) {
    if (!counts) return;
    ["total", "present", "late", "incomplete", "absent"].forEach((key) => {
        const el = document.getElementById(`stat-${key}`);
        if (el) el.textContent = counts[key];
    });
}

function showToast(message, kind) {
    const host = document.querySelector("dialog[open]") || document.body;

    const toast = document.createElement("div");
    toast.textContent = message;
    const colors = kind === "success"
        ? "background: rgba(230,244,234,0.95); color: #137333;"
        : "background: rgba(252,232,230,0.95); color: #c5221f;";
    toast.style.cssText = `
        position: fixed; top: 24px; right: 24px; z-index: 99999;
        max-width: 450px; padding: 12px 16px; border-radius: 10px;
        font-size: 13.5px; font-weight: 500; line-height: 1.4;
        box-shadow: 0 4px 14px rgba(0,0,0,0.12);
        transition: opacity 0.3s ease; ${colors}`;
    host.appendChild(toast);

    setTimeout(() => { toast.style.opacity = "0"; }, 3000);
    setTimeout(() => { toast.remove(); }, 3400);
}

function onQrDecoded(decodedText) {
    if (window.BatchScan && window.BatchScan.isActive()) {
        window.BatchScan.handleScan(decodedText);
        return;
    }
    if (isProcessingScan) return;
    isProcessingScan = true;
    handleScannedData(decodedText);
}

function cameraErrorMessage(err) {
    const name = (err && err.name) || "";
    const text = typeof err === "string" ? err : ((err && err.message) || "");
    if (!window.isSecureContext) {
        return "The camera only works on a secure page. Open this site with https:// (or localhost).";
    }
    if (name === "NotAllowedError" || /permission|denied/i.test(text)) {
        return "Camera permission was denied. Allow camera access for this site in your browser settings, then try again.";
    }
    if (name === "NotFoundError" || /not found/i.test(text)) {
        return "No camera was found on this device.";
    }
    if (name === "NotReadableError") {
        return "The camera is being used by another app or tab. Close it and try again.";
    }
    return "Could not start the camera." + (text ? " (" + text + ")" : "");
}

async function openScanner() {
    if (camIsOpen) return;

    const modal = document.getElementById('attendance-scanner');
    const video = document.getElementById('scanner-video');
    if (!modal || !video) return;

    camIsOpen = true;
    isProcessingScan = false;
    modal.showModal();

    try {
        if (!qrScanner) {
            qrScanner = new QrScanner(
                video,
                (result) => onQrDecoded(result.data),
                {
                    preferredCamera: "environment",
                    maxScansPerSecond: 25,
                    returnDetailedScanResult: true,
                    // Look at almost the whole picture, not just a small centre box:
                    // dense QR codes need every pixel they can get.
                    calculateScanRegion: (v) => {
                        const size = Math.round(Math.min(v.videoWidth, v.videoHeight) * 0.9);
                        return {
                            x: Math.round((v.videoWidth - size) / 2),
                            y: Math.round((v.videoHeight - size) / 2),
                            width: size,
                            height: size,
                            downScaledWidth: Math.min(size, 800),
                            downScaledHeight: Math.min(size, 800),
                        };
                    },
                    highlightScanRegion: true,
                    highlightCodeOutline: true,
                }
            );
        }
        await qrScanner.start();
    } catch (err) {
        console.error("Camera initialization failed:", err);
        await resetScanner();
        alert(cameraErrorMessage(err));
    }
}

async function resetScanner() {
    if (qrScanner) {
        try {
            qrScanner.stop();   
        } catch (err) {
            console.warn("Scanner stop error:", err);
        }
    }

    camIsOpen = false;
    const modal = document.getElementById('attendance-scanner');
    if (modal && modal.open) {
        modal.close();
    }

    // Closing the scanner sends any scans still waiting in the batch list.
    if (window.BatchScan) window.BatchScan.onScannerClosed();
}

function handleScannedData(rawJsonText) {
    try {
        const data = JSON.parse(rawJsonText);

        const firstNameInput = document.getElementById("input-first-name");
        const lastNameInput = document.getElementById("input-last-name");
        const emailInput = document.getElementById("input-email");
        const phoneInput = document.getElementById("input-phone");
        const studentIdInput = document.getElementById("input-student-id");

        if (firstNameInput) firstNameInput.value = data.fn || "";
        if (lastNameInput) lastNameInput.value = data.ln || "";
        if (emailInput) emailInput.value = data.em || "";
        if (phoneInput) phoneInput.value = data.ph || "";
        if (studentIdInput) studentIdInput.value = data.sid || "";

    } catch (e) {
        console.error("Scan error:", e);
        showToast("Invalid or unreadable Marca QR Code.", "error");
    } finally {
        isProcessingScan = false;
    }
}


const addRecordModal = document.getElementById('addRecordModal');
const scannerAddModal = document.getElementById('scannerAddRecordModal');

window.openScannerAddRecordModal = function(item) {
    const modal = document.getElementById("scannerAddRecordModal");
    if (!modal) return;

    // Pause camera scanning so it doesn't repeatedly decode the same QR card
    if (qrScanner && typeof qrScanner.pause === "function") {
        try { qrScanner.pause(); } catch(e) {}
    }
    isProcessingScan = true;

    const studentIdInput = document.getElementById("scanner_add_student_id");
    const emailInput = document.getElementById("scanner_add_email");
    const firstNameInput = document.getElementById("scanner_add_first_name");
    const lastNameInput = document.getElementById("scanner_add_last_name");
    const courseInput = document.getElementById("scanner_add_course");
    const yearLevelInput = document.getElementById("scanner_add_year_level");
    const sessionTypeInput = document.getElementById("scanner_add_session_type");
    const batchItemIdInput = document.getElementById("scanner_add_batch_item_id");
    const cacheNotice = document.getElementById("scanner-cache-notice");

    if (cacheNotice) cacheNotice.style.display = "none";

    const isBatchActive = window.BatchScan && typeof window.BatchScan.isActive === "function" && window.BatchScan.isActive();
    const activeSelect = isBatchActive
        ? document.getElementById("batch-session-select")
        : document.getElementById("session-select");
    const activeSessionVal = activeSelect?.value || document.getElementById("session-select")?.value || "1";

    const resolvedOption = (item && (item.session_type || item.option)) || activeSessionVal;
    if (sessionTypeInput) sessionTypeInput.value = resolvedOption;
    if (batchItemIdInput) batchItemIdInput.value = (item && item.id) || "";

    if (item) {
        if (studentIdInput) studentIdInput.value = item.student_id || "";
        if (emailInput) emailInput.value = item.email || "";
        if (firstNameInput) firstNameInput.value = item.first_name || "";
        if (lastNameInput) lastNameInput.value = item.last_name || "";
        if (courseInput) courseInput.value = item.course || "";
        if (yearLevelInput) yearLevelInput.value = item.year_level || "";
    }

    // Direct DB lookup across past events of this organizer for Course & Year Level
    const sid = studentIdInput ? studentIdInput.value.trim() : "";
    const em = emailInput ? emailInput.value.trim() : "";
    if ((!courseInput?.value || !yearLevelInput?.value) && (sid || em)) {
        const csrfToken = document.querySelector('input[name="csrfmiddlewaretoken"]')?.value || "";
        const bodyData = new FormData();
        if (sid) bodyData.append("student_id", sid);
        if (em) bodyData.append("email", em);

        fetch("/attendance/lookup-student/", {
            method: "POST",
            body: bodyData,
            headers: {
                "X-CSRFToken": csrfToken,
                "X-Requested-With": "XMLHttpRequest"
            },
            credentials: "same-origin"
        })
        .then((res) => res.json())
        .then((lookup) => {
            if (lookup && lookup.found) {
                if (courseInput && !courseInput.value && lookup.course) {
                    courseInput.value = lookup.course;
                }
                if (yearLevelInput && !yearLevelInput.value && lookup.year_level) {
                    yearLevelInput.value = lookup.year_level;
                }
                if (cacheNotice && (lookup.course || lookup.year_level)) {
                    cacheNotice.style.display = "flex";
                }
            }
        })
        .catch((err) => console.warn("Student lookup error:", err));
    } else if (cacheNotice && item && (item.course || item.year_level)) {
        cacheNotice.style.display = "flex";
    }

    modal.style.display = "flex";
};

window.closeScannerAddRecordModal = function() {
    const modal = document.getElementById("scannerAddRecordModal");
    if (modal) {
        modal.style.display = "none";
        const form = document.getElementById("scannerAddAttendeeForm");
        if (form) form.reset();
        const cacheNotice = document.getElementById("scanner-cache-notice");
        if (cacheNotice) cacheNotice.style.display = "none";
    }

    // Resume camera scanning
    if (qrScanner && typeof qrScanner.start === "function") {
        try { qrScanner.start(); } catch(e) {}
    }
    isProcessingScan = false;
};

window.openAddRecordModal = function(item) {
    const scannerDialog = document.getElementById("attendance-scanner");
    const isScannerOpen = scannerDialog && (typeof scannerDialog.open === "boolean" ? scannerDialog.open : scannerDialog.hasAttribute("open"));

    if (isScannerOpen) {
        // Open INSIDE the scanner! Do NOT close the scanner dialog.
        window.openScannerAddRecordModal(item);
        return;
    }

    // Outside the scanner:
    const modal = document.getElementById("addRecordModal");
    if (!modal) return;

    if (item) {
        const studentIdInput = modal.querySelector('input[name="student_id"]');
        const emailInput = modal.querySelector('input[name="email"]');
        const firstNameInput = modal.querySelector('input[name="first_name"]');
        const lastNameInput = modal.querySelector('input[name="last_name"]');

        if (studentIdInput) studentIdInput.value = item.student_id || "";
        if (emailInput) emailInput.value = item.email || "";
        if (firstNameInput) firstNameInput.value = item.first_name || "";
        if (lastNameInput) lastNameInput.value = item.last_name || "";
    }

    modal.style.display = "flex";
};

window.closeAddRecordModal = function() {
    const modal = document.getElementById("addRecordModal");
    if (modal) {
        modal.style.display = "none";
        const form = document.getElementById("addAttendeeForm");
        if (form) form.reset();
    }
};

// Close modals when clicking backdrop area
if (addRecordModal) {
    addRecordModal.addEventListener('click', (event) => {
        if (event.target === addRecordModal) {
            closeAddRecordModal();
        }
    });
}

if (scannerAddModal) {
    scannerAddModal.addEventListener('click', (event) => {
        if (event.target === scannerAddModal) {
            closeScannerAddRecordModal();
        }
    });
}

// Attach listener for in-scanner add form submission
document.addEventListener("DOMContentLoaded", () => {
    const scannerAddForm = document.getElementById("scannerAddAttendeeForm");
    if (scannerAddForm) {
        scannerAddForm.addEventListener("submit", async function(e) {
            e.preventDefault();
            const submitBtn = document.getElementById("scanner_add_submit_btn");
            if (submitBtn) submitBtn.disabled = true;

            const studentId = document.getElementById("scanner_add_student_id")?.value.trim();
            const email = document.getElementById("scanner_add_email")?.value.trim();

            if (!studentId && !email) {
                showToast("Please enter either a Student ID or an Email address.", "error");
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            try {
                const response = await fetch(scannerAddForm.action, {
                    method: "POST",
                    body: new FormData(scannerAddForm),
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "same-origin",
                });

                const type = response.headers.get("content-type") || "";
                if (!type.includes("application/json")) {
                    showToast("Your session may have expired. Please refresh the page.", "error");
                    return;
                }

                const data = await response.json();
                if (data.ok) {
                    showToast(data.message, "success");
                    updateRowFromServer(data);
                    updateCounters(data.counts);

                    // If this was added from a batch scan item, remove or resolve it in batch_scan
                    const batchItemId = document.getElementById("scanner_add_batch_item_id")?.value;
                    if (batchItemId && window.BatchScan && typeof window.BatchScan.removeOrResolve === "function") {
                        window.BatchScan.removeOrResolve(batchItemId, data.row);
                    }

                    closeScannerAddRecordModal();
                } else {
                    showToast(data.message || "Could not add attendee.", "error");
                }
            } catch (err) {
                console.error("Add attendee error:", err);
                showToast("Network error. Could not add attendee.", "error");
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }
});