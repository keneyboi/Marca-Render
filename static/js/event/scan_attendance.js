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

    try {
        let cameraToUse = { facingMode: "environment" }; // Default fallback

        // Step 1: Explicitly look for the rear camera ID using getCameras()
        try {
            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length > 0) {
                // Search for labels containing "back", "rear", or "environment"
                const backCamera = devices.find(device => 
                    /back|rear|environment/i.test(device.label)
                );
                
                if (backCamera) {
                    cameraToUse = { deviceId: { exact: backCamera.id } };
                } else if (devices.length > 1) {
                    // Fallback to the last camera in the list (usually the back camera on multi-lens phones)
                    cameraToUse = { deviceId: { exact: devices[devices.length - 1].id } };
                }
            }
        } catch (e) {
            console.warn("Could not enumerate cameras, falling back to constraints.", e);
        }

        // Step 2: Start the scanner with the resolved camera target
        await html5QrCode.start(
            cameraToUse,
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
        console.error("Primary camera initialization failed, trying strict exact constraint...", err);
        
        // Step 3: Ultimate fallback using strict exact constraint
        try {
            await html5QrCode.start(
                { facingMode: { exact: "environment" } },
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
        } catch (fallbackErr) {
            console.error("Camera initialization completely failed:", fallbackErr);
            await resetScanner();
            alert("Could not access the rear camera. Please check your camera permissions.");
        }
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