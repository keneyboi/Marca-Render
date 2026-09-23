let qrCodeInstance = null;
let html5QrCode = null;
let camIsOpen = false;
let isProcessingScan = false;

document.addEventListener("DOMContentLoaded", () => {
    // Initialize html5QrCode engine
    if (document.getElementById("reader")) {
        html5QrCode = new Html5Qrcode("reader");
    }
    
    // Attach listener for form submittal
    const generateBtn = document.getElementById("generate-btn");
    if (generateBtn) {
        generateBtn.addEventListener("click", createMarcaIDQR);
    }

    // --- ADDED: Attach listener for download button ---
    const downloadBtn = document.getElementById("download-btn");
    if (downloadBtn) {
        downloadBtn.addEventListener("click", downloadQRCode);
    }
});

/**
 * Reads form data, formats as JSON, and builds QR code (Plain Text)
 */
function createMarcaIDQR() {
    const firstName = document.getElementById("input-first-name")?.value.trim() || "";
    const lastName = document.getElementById("input-last-name")?.value.trim() || "";
    const email = document.getElementById("input-email")?.value.trim() || "";
    const phone = document.getElementById("input-phone")?.value.trim() || "";
    const studentId = document.getElementById("input-student-id")?.value.trim() || "";

    if (!firstName || !lastName || !email) {
        alert("Please complete the required fields (First Name, Last Name, Email).");
        return;
    }

    // Build standard JSON Payload
    const userData = {
        fn: firstName,
        ln: lastName,
        em: email,
        ph: phone,
        sid: studentId,
        ts: Date.now()
    };

    const jsonString = JSON.stringify(userData);

    // Render or update QR Code using qrcode.min.js
    const qrWrapper = document.getElementById("qr-code");
    if (qrWrapper) {
        if (!qrCodeInstance) {
            qrWrapper.innerHTML = '';
            qrCodeInstance = new QRCode(qrWrapper, {
                text: jsonString,
                width: 210,
                height: 210,
                colorDark: "#4a0d0d",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
        } else {
            qrCodeInstance.clear();
            qrCodeInstance.makeCode(jsonString);
        }
    }

    // Update Output Card UI Display
    const displayName = document.getElementById("display-name");
    if (displayName) {
        displayName.textContent = `${lastName}, ${firstName}`;
    }

    // --- ADDED: Enable the download button on generation ---
    const downloadBtn = document.getElementById("download-btn");
    if (downloadBtn) {
        downloadBtn.disabled = false;
    }
}

/**
 * Scanner Functions
 */
async function openScanner() {
    if (camIsOpen) return;

    const modal = document.getElementById('scanner-modal');
    camIsOpen = true;
    isProcessingScan = false;

    if (modal) modal.showModal();

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 220, height: 220 },
                videoConstraints: {
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            },
            async (decodedText) => {
                if (isProcessingScan) return;
                isProcessingScan = true;

                await resetScanner();
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
    const modal = document.getElementById('scanner-modal');
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

        // Update display card name
        const displayName = document.getElementById("display-name");
        if (displayName && data.ln && data.fn) {
            displayName.textContent = `${data.ln}, ${data.fn}`;
        }

        // Re-render QR display
        const qrWrapper = document.getElementById("qr-code");
        if (qrWrapper) {
            if (!qrCodeInstance) {
                qrWrapper.innerHTML = '';
                qrCodeInstance = new QRCode(qrWrapper, {
                    text: rawJsonText,
                    width: 210,
                    height: 210,
                    colorDark: "#4a0d0d",
                    colorLight: "#fdfbf7",
                    correctLevel: QRCode.CorrectLevel.M
                });
            } else {
                qrCodeInstance.clear();
                qrCodeInstance.makeCode(rawJsonText);
            }
        }

        // --- ADDED: Enable the download button on scan ---
        const downloadBtn = document.getElementById("download-btn");
        if (downloadBtn) {
            downloadBtn.disabled = false;
        }

        // Scroll to ID section
        const createIdSection = document.getElementById("create-id");
        if (createIdSection) {
            createIdSection.scrollIntoView({ behavior: "smooth" });
        }

    } catch (e) {
        console.error("Scan error:", e);
        alert("Invalid or unreadable Marca QR Code.");
    }
}

async function downloadQRCode() {
    const cardElement = document.getElementById("id-card-element");
    if (!cardElement) {
        alert("ID card element not found.");
        return;
    }

    const firstName = document.getElementById("input-first-name")?.value.trim() || "Marca";
    const lastName = document.getElementById("input-last-name")?.value.trim() || "ID";

    try {
        // Render the entire card container onto a canvas
        const canvas = await html2canvas(cardElement, {
            scale: 2,           // Upscale for high-resolution output
            backgroundColor: null, // Preserves card background styling/color
            useCORS: true,
            ignoreElements: (element) => {
                return (
                    element.classList.contains("card-actions-row") ||
                    element.classList.contains("btn-scan-inline") ||
                    element.classList.contains("btn-download-inline") ||
                    element.id === "download-btn"
                );
            }
        });

        // Convert canvas to image data URL
        const imageSrc = canvas.toDataURL("image/png");

        // Trigger automatic browser download
        const link = document.createElement("a");
        link.href = imageSrc;
        link.download = `${lastName}_${firstName}_MarcaID.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Card capture failed:", err);
        alert("Could not generate card image for download.");
    }
}