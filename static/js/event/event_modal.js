function openEventModal() {
  const modal = document.getElementById('createEventModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeEventModal() {
  const modal = document.getElementById('createEventModal');
  if (modal) {
    modal.style.display = 'none';
  }
  toggleEventStep(1);
}

function toggleEventStep(step) {
  const step1 = document.getElementById('modal-step-1');
  const step2 = document.getElementById('modal-step-2');
  if (step === 2) {
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';
  } else {
    if (step2) step2.style.display = 'none';
    if (step1) step1.style.display = 'block';
  }
}

function triggerFileInput() {
  const fileInput = document.getElementById('rosterFileInput');
  if (fileInput) {
    fileInput.click();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('rosterFileInput');
  const preview = document.getElementById('fileNamePreview');

  if (!dropzone || !fileInput) return;

  // Sync chosen file name when selected via browser file picker
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      preview.textContent = `Selected: ${fileInput.files[0].name}`;
      preview.style.display = 'inline-block';
    }
  });

  // Drag and drop events
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      preview.textContent = `Selected: ${fileInput.files[0].name}`;
      preview.style.display = 'inline-block';
    }
  });
});