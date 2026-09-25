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
