let qrCodeInstance = null;
let html5QrCode = null;
let camIsOpen = false;
let isProcessingScan = false;

document.addEventListener("DOMContentLoaded", () => {

    if (document.getElementById("reader")) {
        html5QrCode = new Html5Qrcode("reader");
    }

    const attendanceForm = document.getElementById("attendance-form");
    if (attendanceForm) {
        attendanceForm.addEventListener("submit", (e) => {
            e.preventDefault();              // stop the full-page POST + redirect
            submitAttendance(attendanceForm);
        });
    }

});

// ---------------------------------------------------------------
// INSTANT ATTENDANCE: send the form in the background (fetch),
// then patch only the parts of the page that changed.
// ---------------------------------------------------------------
async function submitAttendance(form) {
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;           // block double-submits

    try {
        const response = await fetch(form.action, {
            method: "POST",
            body: new FormData(form),             // includes the CSRF token
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
        showToast(data.message, data.ok ? "success" : "error");

        if (data.ok) {
            updateRowFromServer(data);
            updateCounters(data.counts);
            form.reset();
            await resetScanner();                 // same behaviour as before: close the scanner
        } else {
            isProcessingScan = false;             // keep the form, allow another scan
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
    const row = document.querySelector(`tr.attendance-row[data-record-id="${data.record_id}"]`);
    if (!row) return;                             // the record is on another page of the table

    const setText = (field, value) => {
        const cell = row.querySelector(`[data-field="${field}"]`);
        if (cell) cell.textContent = value;
    };

    ["timed_in_1", "timed_out_1", "timed_in_2", "timed_out_2", "edited_by"]
        .forEach((field) => setText(field, data[field]));

    const badge = row.querySelector('[data-field="status"]');
    if (badge) {
        badge.className = `badge badge-${data.status.toLowerCase()}`;
        badge.textContent = data.status_label;
    }

    row.dataset.status = data.status;             // the status filter reads this
    if (window.refreshAttendanceRow) window.refreshAttendanceRow(row);
}

function updateCounters(counts) {
    if (!counts) return;
    ["total", "present", "late", "absent"].forEach((key) => {
        const el = document.getElementById(`stat-${key}`);
        if (el) el.textContent = counts[key];
    });
}

function showToast(message, kind) {
    // An open <dialog> sits in the browser's "top layer" above everything,
    // even above z-index: 99999. So when the scanner is open, the toast must
    // live INSIDE the dialog to be visible.
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

async function openScanner() {
    if (camIsOpen) return;

    const modal = document.getElementById('attendance-scanner');
    camIsOpen = true;
    isProcessingScan = false;

    if (modal) modal.showModal();

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 300, height: 300 },
                videoConstraints: {
                    width: { ideal: 640 },
                    height: { ideal: 640 }
                }
            },
            async (decodedText) => {
                if (isProcessingScan) return;
                isProcessingScan = true;

                handleScannedData(decodedText);
            },
            (errorMessage) => {}
        );
    } catch (err) {
        console.error("Camera initialization failed:", err);
        await resetScanner();
        alert("Could not access camera. Please check camera permissions.");
    }
}

async function resetScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        try {
            await html5QrCode.stop();
        } catch (err) {
            console.warn("Scanner stop error:", err);
        }
    }

    camIsOpen = false;
    const modal = document.getElementById('attendance-scanner');
    if (modal && modal.open) {
        modal.close();
    }
}

function handleScannedData(rawJsonText) {
    try {
        const data = JSON.parse(rawJsonText);

        // Populate form fields directly from scanned JSON
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
        alert("Invalid or unreadable Marca QR Code.");
    }
}


// Grab the dialog element
const addRecordModal = document.getElementById('addRecordModal');

// Open as a modal overlay (Places element in the Browser's Top-Layer)
function openAddRecordModal() {
  if (addRecordModal) {
    addRecordModal.showModal();
  }
}

// Close function
function closeAddRecordModal() {
  if (addRecordModal) {
    addRecordModal.close();
  }
}

// Optional: Close modal automatically when clicking backdrop area
if (addRecordModal) addRecordModal.addEventListener('click', (event) => {
  const rect = addRecordModal.getBoundingClientRect();
  const isInDialog = (
    rect.top <= event.clientY &&
    event.clientY <= rect.top + rect.height &&
    rect.left <= event.clientX &&
    event.clientX <= rect.left + rect.width
  );
  if (!isInDialog) {
    addRecordModal.close();
  }
});