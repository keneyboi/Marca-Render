let qrCodeInstance = null;
let html5QrCode = null;
let camIsOpen = false;
let isProcessingScan = false;

document.addEventListener("DOMContentLoaded", () => {

    if (document.getElementById("reader")) {
        html5QrCode = new Html5Qrcode("reader");
    }
    
});

async function openScanner() {
    if (camIsOpen) return;

    const modal = document.getElementById('attendance-scanner');
    camIsOpen = true;
    isProcessingScan = false;

    if (modal) modal.showModal();

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
    }

    try {
        // 1. Get all available cameras on the device
        const devices = await Html5Qrcode.getCameras();
        const cameraSelect = document.getElementById('camera-select');
        cameraSelect.innerHTML = ''; // Clear loading text

        if (devices && devices.length > 0) {
            devices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.id;
                // Use the browser's device label, or fallback to a numbered name
                option.text = device.label || `Camera ${index + 1}`;
                cameraSelect.appendChild(option);
            });

            // 2. Intelligent Default: Try to select the back/rear camera if found, otherwise use the last one
            const backCamera = devices.find(d => /back|rear|environment/i.test(d.label));
            const defaultCameraId = backCamera ? backCamera.id : devices[devices.length - 1].id;
            
            cameraSelect.value = defaultCameraId;

            // 3. Start scanning with the default camera
            await startScannerWithId(defaultCameraId);

            // 4. Handle manual switching when the user changes the dropdown selection
            cameraSelect.onchange = async () => {
                const selectedId = cameraSelect.value;
                if (html5QrCode.isScanning) {
                    await html5QrCode.stop();
                }
                await startScannerWithId(selectedId);
            };

        } else {
            alert("No cameras found on this device.");
        }
    } catch (err) {
        console.error("Error initializing camera selector:", err);
        alert("Could not access camera permissions. Please check your browser settings.");
        await resetScanner();
    }
}

async function startScannerWithId(deviceId) {
    try {
        await html5QrCode.start(
            { deviceId: { exact: deviceId } },
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
        console.error("Failed to start selected camera:", err);
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