let html5QrCode = null;
let camIsOpen = false;
let isProcessingScan = false;
let isSwitchingCamera = false;

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("reader")) {
        html5QrCode = new Html5Qrcode("reader");
    }
});

const onScanSuccess = (decodedText) => {
    if (isProcessingScan) return;
    isProcessingScan = true;
    handleScannedData(decodedText);
};

// Single place that starts the camera. `camera` is either
// { facingMode: ... } or { deviceId: { exact: "..." } }
async function startCamera(camera) {
    if (html5QrCode.isScanning) {
        await html5QrCode.stop();
    }

    await html5QrCode.start(
        camera,
        {
            fps: 10,
            qrbox: { width: 300, height: 300 },
            // The camera choice MUST be repeated here, because this
            // object overrides the first argument.
            videoConstraints: {
                ...camera,
                width: { ideal: 640 },
                height: { ideal: 640 }
            }
        },
        onScanSuccess,
        () => {}
    );
}

async function openScanner() {
    if (camIsOpen) return;

    const modal = document.getElementById('attendance-scanner');
    camIsOpen = true;
    isProcessingScan = false;
    if (modal) modal.showModal();

    await new Promise(resolve => setTimeout(resolve, 50));

    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");

    try {
        // Try rear camera first, fall back to whatever camera exists
        // (laptops/desktops only have a "user" camera)
        try {
            await startCamera({ facingMode: { exact: "environment" } });
        } catch (exactErr) {
            try {
                await startCamera({ facingMode: "environment" });
            } catch (envErr) {
                await startCamera({ facingMode: "user" });
            }
        }

        // Permission is granted now, so labels are available
        const devices = await Html5Qrcode.getCameras();
        const cameraSelect = document.getElementById('camera-select');
        cameraSelect.innerHTML = '';

        devices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.id;
            option.text = device.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });

        // Sync the dropdown with the camera that is ACTUALLY running
        const activeId = html5QrCode.getRunningTrackSettings().deviceId;
        if (activeId) cameraSelect.value = activeId;

        cameraSelect.onchange = () => startScannerWithId(cameraSelect.value);

    } catch (err) {
        console.error("Camera initialization failed:", err);
        alert("Could not access the camera. Please check camera permissions.");
        await resetScanner();
    }
}

async function startScannerWithId(deviceId) {
    if (isSwitchingCamera || !deviceId) return;
    isSwitchingCamera = true;

    try {
        await startCamera({ deviceId: { exact: deviceId } });
    } catch (err) {
        console.error("Failed to start selected camera:", err);
        alert("Could not switch to this camera. It might be in use by another app or tab.");
    } finally {
        isSwitchingCamera = false;
    }
}

async function resetScanner() {
    try {
        if (html5QrCode && html5QrCode.isScanning) {
            await html5QrCode.stop();
        }
    } catch (err) {
        console.error("Stop error:", err);
    }
    
    camIsOpen = false;
    isSwitchingCamera = false;
    document.getElementById('attendance-form').reset();
    const modal = document.getElementById('attendance-scanner');
    if (modal) modal.close();
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
addRecordModal.addEventListener('click', (event) => {
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