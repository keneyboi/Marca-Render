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

function triggerFileInput() {
  const fileInput = document.getElementById('rosterFileInput');
  if (fileInput) {
    fileInput.click();
  }
}

// -------------------------------------------------------------
// FIELD & DROPZONE INLINE FEEDBACK HELPERS
// -------------------------------------------------------------
function setFieldFeedback(input, isValid, message = '') {
  if (!input) return;
  let feedback = input.parentNode.querySelector('.js-field-feedback');
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.className = 'js-field-feedback';
    feedback.style.color = '#dc3545';
    feedback.style.fontSize = '12px';
    feedback.style.marginTop = '4px';
    input.parentNode.appendChild(feedback);
  }

  if (isValid) {
    input.style.borderColor = '';
    feedback.textContent = '';
  } else {
    input.style.borderColor = '#dc3545';
    feedback.textContent = message;
  }
}

function setDropzoneFeedback(isValid, message = '') {
  const dropzone = document.getElementById('dropzone');
  if (!dropzone) return;

  let feedback = dropzone.parentNode.querySelector('.js-dropzone-feedback');
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.className = 'js-dropzone-feedback';
    feedback.style.color = '#dc3545';
    feedback.style.fontSize = '13px';
    feedback.style.fontWeight = '500';
    feedback.style.marginTop = '10px';
    feedback.style.textAlign = 'center';
    dropzone.parentNode.insertBefore(feedback, dropzone.nextSibling);
  }

  if (isValid) {
    dropzone.style.borderColor = '';
    feedback.textContent = '';
  } else {
    dropzone.style.borderColor = '#dc3545';
    feedback.textContent = message;
  }
}

function validateField(input, fieldName) {
  if (!input) return true;
  const val = input.value.trim();
  if (!val) {
    setFieldFeedback(input, false, `${fieldName} is required.`);
    return false;
  }
  setFieldFeedback(input, true);
  return true;
}

// -------------------------------------------------------------
// REAL-TIME DATE VALIDATION & CALENDAR BOUNDS
// -------------------------------------------------------------
function syncAndValidateDates() {
  const startInput = document.getElementById('id_start_time');
  const endInput = document.getElementById('id_end_time');
  if (!startInput || !endInput) return true;

  const startVal = startInput.value;
  const endVal = endInput.value;

  if (startVal) {
    endInput.min = startVal;
  } else {
    endInput.removeAttribute('min');
  }

  if (startVal && endVal) {
    if (new Date(endVal) <= new Date(startVal)) {
      setFieldFeedback(endInput, false, 'End time must be after the start time.');
      return false;
    } else {
      setFieldFeedback(endInput, true);
      return true;
    }
  } else if (!startVal && endVal) {
    setFieldFeedback(startInput, false, 'Start time is required.');
    return false;
  }
  return true;
}

// -------------------------------------------------------------
// CLIENT-SIDE FILE VALIDATION (.csv, .xlsx, .xlsm, empty, size)
// -------------------------------------------------------------
function validateSelectedFile(file) {
  const preview = document.getElementById('fileNamePreview');
  const fileInput = document.getElementById('rosterFileInput');

  // Guard: No file selected
  if (!file) {
    setDropzoneFeedback(false, 'Please upload a roster file (.csv or .xlsx) before creating the event.');
    if (preview) preview.style.display = 'none';
    return false;
  }

  // 1. Guard against 0-byte empty files
  if (file.size === 0) {
    setDropzoneFeedback(false, 'The selected file is empty (0 bytes). Please upload a valid spreadsheet.');
    if (fileInput) fileInput.value = '';
    if (preview) preview.style.display = 'none';
    return false;
  }

  // 2. Extension check
  const validExtensions = ['.csv', '.xlsx', '.xlsm'];
  const fileName = file.name.toLowerCase();
  const isValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

  if (!isValidExtension) {
    setDropzoneFeedback(false, 'Unsupported file format. Please upload a .csv or .xlsx file.');
    if (fileInput) fileInput.value = '';
    if (preview) preview.style.display = 'none';
    return false;
  }

  // 3. 5 MB Size check
  if (file.size > 5 * 1024 * 1024) {
    setDropzoneFeedback(false, 'File size exceeds the 5 MB limit.');
    if (fileInput) fileInput.value = '';
    if (preview) preview.style.display = 'none';
    return false;
  }

  // Valid file: display name and clear error feedback
  setDropzoneFeedback(true);
  if (preview) {
    preview.textContent = `Selected: ${file.name}`;
    preview.style.display = 'inline-block';
  }
  return true;
}

// -------------------------------------------------------------
// MODAL STEP TOGGLING & STEP 1 GUARDS
// -------------------------------------------------------------
function toggleEventStep(step) {
  const step1 = document.getElementById('modal-step-1');
  const step2 = document.getElementById('modal-step-2');

  if (step === 2) {
    const nameInput = document.getElementById('id_name');
    const locationInput = document.getElementById('id_location');
    const startInput = document.getElementById('id_start_time');
    const endInput = document.getElementById('id_end_time');

    const isNameValid = validateField(nameInput, 'Event name');
    const isLocValid = validateField(locationInput, 'Location');
    const isStartValid = validateField(startInput, 'Start time');
    const isEndValid = validateField(endInput, 'End time');
    const areDatesValid = syncAndValidateDates();

    if (!isNameValid || !isLocValid || !isStartValid || !isEndValid || !areDatesValid) {
      return;
    }

    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';
  } else {
    if (step2) step2.style.display = 'none';
    if (step1) step1.style.display = 'block';
  }
}

// -------------------------------------------------------------
// EVENT LISTENERS INITIALIZATION
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('rosterFileInput');
  const submitBtn = document.querySelector('.btn-step-submit');
  const form = document.querySelector('#createEventModal form');

  const nameInput = document.getElementById('id_name');
  const locationInput = document.getElementById('id_location');
  const startInput = document.getElementById('id_start_time');
  const endInput = document.getElementById('id_end_time');

  // Inline input validation
  if (nameInput) {
    nameInput.addEventListener('blur', () => validateField(nameInput, 'Event name'));
    nameInput.addEventListener('input', () => validateField(nameInput, 'Event name'));
  }
  if (locationInput) {
    locationInput.addEventListener('blur', () => validateField(locationInput, 'Location'));
    locationInput.addEventListener('input', () => validateField(locationInput, 'Location'));
  }
  if (startInput) {
    startInput.addEventListener('input', syncAndValidateDates);
    startInput.addEventListener('change', syncAndValidateDates);
    startInput.addEventListener('blur', () => validateField(startInput, 'Start time'));
  }
  if (endInput) {
    endInput.addEventListener('input', syncAndValidateDates);
    endInput.addEventListener('change', syncAndValidateDates);
    endInput.addEventListener('blur', () => validateField(endInput, 'End time'));
  }

  // File Picker Change Event
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        validateSelectedFile(fileInput.files[0]);
      } else {
        validateSelectedFile(null);
      }
    });
  }

  // Drag and Drop Handling
  if (dropzone && fileInput) {
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
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (validateSelectedFile(file)) {
          fileInput.files = e.dataTransfer.files;
        }
      }
    });
  }

  // Submission Guard Function
  function handleFormSubmission(e) {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      e.preventDefault();
      e.stopPropagation();
      setDropzoneFeedback(false, 'Please upload a attendance file (.csv or .xlsx) before creating the event.');
      return false;
    }

    const isValid = validateSelectedFile(fileInput.files[0]);
    if (!isValid) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }

  // Intercept click on the submit button directly
  if (submitBtn) {
    submitBtn.addEventListener('click', handleFormSubmission);
  }

  // Intercept form submit event as fallback
  if (form) {
    form.addEventListener('submit', handleFormSubmission);
  }
});