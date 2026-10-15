// =============================================================
// MODAL & STEP NAVIGATION
// =============================================================
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

// =============================================================
// FIELD & DROPZONE INLINE FEEDBACK HELPERS
// =============================================================
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

// =============================================================
// TIME & OVERLAP VALIDATION LOGIC
// =============================================================
function syncAndValidateDates() {
  const sharedDate = document.getElementById('shared_event_date');
  const startInput1 = document.getElementById('id_start_time_1');
  const endInput1 = document.getElementById('id_end_time_1');
  const startInput2 = document.getElementById('id_start_time_2');
  const endInput2 = document.getElementById('id_end_time_2');
  const selectedRadio = document.querySelector('input[name="session_type"]:checked');

  let isValid = true;

  // 1. Validate Shared Date
  if (!sharedDate || !sharedDate.value) {
    if (sharedDate) setFieldFeedback(sharedDate, false, 'Event date is required.');
    return false;
  } else {
    setFieldFeedback(sharedDate, true);
  }

  // 2. Validate Session 1 Times
  if (startInput1 && endInput1) {
    const startVal1 = startInput1.value;
    const endVal1 = endInput1.value;

    if (startVal1 && endVal1) {
      if (endVal1 <= startVal1) {
        setFieldFeedback(endInput1, false, 'End time (1) must be later than start time (1).');
        isValid = false;
      } else {
        setFieldFeedback(endInput1, true);
      }
    } else if (!startVal1 && endVal1) {
      setFieldFeedback(startInput1, false, 'Start time (1) is required.');
      isValid = false;
    }
  }

  // 3. Validate Session 2 Times & Overlap Check (if Session 2 is active)
  const isSession2Enabled = selectedRadio && selectedRadio.value !== '1' && selectedRadio.value !== '2';

  if (isSession2Enabled && startInput2 && endInput2) {
    const startVal2 = startInput2.value;
    const endVal2 = endInput2.value;

    if (startVal2 && endVal2) {
      // Check if End 2 is after Start 2
      if (endVal2 <= startVal2) {
        setFieldFeedback(endInput2, false, 'End time (2) must be later than start time (2).');
        isValid = false;
      } else {
        setFieldFeedback(endInput2, true);
      }

      // Check for overlap with Session 1 (Session 2 cannot start before Session 1 ends)
      const endVal1 = endInput1 ? endInput1.value : '';
      if (endVal1 && startVal2 < endVal1) {
        setFieldFeedback(startInput2, false, 'Session 2 cannot overlap with Session 1 (must start at or after Session 1 ends).');
        isValid = false;
      } else if (endVal1) {
        setFieldFeedback(startInput2, true);
      }
    } else if (!startVal2 && endVal2) {
      setFieldFeedback(startInput2, false, 'Start time (2) is required.');
      isValid = false;
    }
  }

  return isValid;
}

// =============================================================
// CLIENT-SIDE FILE VALIDATION (.csv, .xlsx, .xlsm)
// =============================================================
function validateSelectedFile(file) {
  const preview = document.getElementById('fileNamePreview');
  const fileInput = document.getElementById('rosterFileInput');

  if (!file) {
    setDropzoneFeedback(false, 'Please upload a roster file (.csv or .xlsx) before creating the event.');
    if (preview) preview.style.display = 'none';
    return false;
  }

  if (file.size === 0) {
    setDropzoneFeedback(false, 'The selected file is empty (0 bytes). Please upload a valid spreadsheet.');
    if (fileInput) fileInput.value = '';
    if (preview) preview.style.display = 'none';
    return false;
  }

  const validExtensions = ['.csv', '.xlsx', '.xlsm'];
  const fileName = file.name.toLowerCase();
  const isValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

  if (!isValidExtension) {
    setDropzoneFeedback(false, 'Unsupported file format. Please upload a .csv or .xlsx file.');
    if (fileInput) fileInput.value = '';
    if (preview) preview.style.display = 'none';
    return false;
  }

  if (file.size > 5 * 1024 * 1024) {
    setDropzoneFeedback(false, 'File size exceeds the 5 MB limit.');
    if (fileInput) fileInput.value = '';
    if (preview) preview.style.display = 'none';
    return false;
  }

  setDropzoneFeedback(true);
  if (preview) {
    preview.textContent = `Selected: ${file.name}`;
    preview.style.display = 'inline-block';
  }
  return true;
}

// =============================================================
// MODAL STEP TOGGLING & STEP GUARDS
// =============================================================
function toggleEventStep(step) {
  const step1 = document.getElementById('modal-step-1');
  const step2 = document.getElementById('modal-step-2');
  const step3 = document.getElementById('modal-step-3');

  if (step === 2) {
    const nameInput = document.getElementById('id_name');
    const locationInput = document.getElementById('id_location');

    const isNameValid = validateField(nameInput, 'Event name');
    const isLocValid = validateField(locationInput, 'Location');

    if (!isNameValid || !isLocValid) return;

    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';
    if (step3) step3.style.display = 'none';

  } else if (step === 3) {
    const sharedDate = document.getElementById('shared_event_date');
    const startInput1 = document.getElementById('id_start_time_1');
    const endInput1 = document.getElementById('id_end_time_1');
    const selectedRadio = document.querySelector('input[name="session_type"]:checked');

    const isDateValid = validateField(sharedDate, 'Event date');
    const isStart1Valid = validateField(startInput1, 'Start time (1)');
    const isEnd1Valid = validateField(endInput1, 'End time (1)');

    let isSession2Valid = true;

    if (selectedRadio && selectedRadio.value !== '1' && selectedRadio.value !== '2') {
      const startInput2 = document.getElementById('id_start_time_2');
      const endInput2 = document.getElementById('id_end_time_2');

      const isStart2Valid = validateField(startInput2, 'Start time (2)');
      const isEnd2Valid = validateField(endInput2, 'End time (2)');

      if (!isStart2Valid || !isEnd2Valid) {
        isSession2Valid = false;
      }
    }

    const areTimesValid = syncAndValidateDates();

    if (!isDateValid || !isStart1Valid || !isEnd1Valid || !isSession2Valid || !areTimesValid) {
      return;
    }

    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'block';

  } else {
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'none';
    if (step1) step1.style.display = 'block';
  }
}

// =============================================================
// EVENT LISTENERS INITIALIZATION
// =============================================================
document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('rosterFileInput');
  const submitBtn = document.querySelector('.btn-step-submit');
  const form = document.querySelector('#createEventModal form');

  const nameInput = document.getElementById('id_name');
  const locationInput = document.getElementById('id_location');

  const startInput1 = document.getElementById('id_start_time_1');
  const endInput1 = document.getElementById('id_end_time_1');
  const startInput2 = document.getElementById('id_start_time_2');
  const endInput2 = document.getElementById('id_end_time_2');
  const sharedDate = document.getElementById('shared_event_date');

  // Real-time validation listeners for date & times
  if (sharedDate) {
    sharedDate.addEventListener('change', syncAndValidateDates);
  }

  [startInput1, endInput1, startInput2, endInput2].forEach(input => {
    if (input) {
      input.addEventListener('input', syncAndValidateDates);
      input.addEventListener('change', syncAndValidateDates);
    }
  });

  // Name & Location inline validation
  if (nameInput) {
    nameInput.addEventListener('blur', () => validateField(nameInput, 'Event name'));
    nameInput.addEventListener('input', () => validateField(nameInput, 'Event name'));
  }
  if (locationInput) {
    locationInput.addEventListener('blur', () => validateField(locationInput, 'Location'));
    locationInput.addEventListener('input', () => validateField(locationInput, 'Location'));
  }

  // File Upload Handlers
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        validateSelectedFile(fileInput.files[0]);
      } else {
        validateSelectedFile(null);
      }
    });
  }

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
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (validateSelectedFile(file)) {
          fileInput.files = e.dataTransfer.files;
        }
      }
    });
  }

  // Session Type Radio Toggles
  const radioButtons = document.querySelectorAll('input[name="session_type"]');
  const time2Container = document.getElementById('time_2');

  function updateTimeFieldsVisibility() {
    const selectedRadio = document.querySelector('input[name="session_type"]:checked');
    if (!selectedRadio) return;

    if (selectedRadio.value === '1' || selectedRadio.value === '2') {
      if (time2Container) time2Container.style.display = 'none';
      if (startInput2) startInput2.value = '';
      if (endInput2) endInput2.value = '';
    } else {
      if (time2Container) time2Container.style.display = 'flex';
    }
    syncAndValidateDates();
  }

  radioButtons.forEach(radio => {
    radio.addEventListener('change', updateTimeFieldsVisibility);
  });
  updateTimeFieldsVisibility();

  // Form Submission Safeguards
  function handleFormSubmission(e) {
    if (!syncAndValidateDates()) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      e.preventDefault();
      e.stopPropagation();
      setDropzoneFeedback(false, 'Please upload an attendance file (.csv or .xlsx) before creating the event.');
      return false;
    }

    if (!validateSelectedFile(fileInput.files[0])) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', handleFormSubmission);
  }
  if (form) {
    form.addEventListener('submit', handleFormSubmission);
  }
});