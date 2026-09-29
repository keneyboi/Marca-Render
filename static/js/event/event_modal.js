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
  const sharedDate = document.getElementById('shared_event_date');
  const startInput1 = document.getElementById('id_start_time_1');
  const endInput1 = document.getElementById('id_end_time_1');
  const startTime1Picker = document.getElementById('start_time_1_picker');
  const endTime1Picker = document.getElementById('end_time_1_picker');
  const selectedRadio = document.querySelector('input[name="session_type"]:checked');

  let isValid = true;

  // Check if date is selected first
  if (!sharedDate || !sharedDate.value) {
    if (sharedDate) setFieldFeedback(sharedDate, false, 'Event date is required.');
    return false;
  } else {
    setFieldFeedback(sharedDate, true);
  }

  // --- Validate Session 1 ---
  if (startInput1 && endInput1) {
    const startVal = startInput1.value;
    const endVal = endInput1.value;

    if (startTime1Picker && endTime1Picker && startTime1Picker.value) {
      endTime1Picker.min = startTime1Picker.value;
    }

    if (startVal && endVal) {
      if (new Date(endVal) <= new Date(startVal)) {
        setFieldFeedback(endTime1Picker || endInput1, false, 'End time (1) must be after start time (1).');
        isValid = false;
      } else {
        setFieldFeedback(endTime1Picker || endInput1, true);
      }
    } else if (!startVal && endVal) {
      setFieldFeedback(startTime1Picker || startInput1, false, 'Start time (1) is required.');
      isValid = false;
    }
  }

  // --- Validate Session 2 (Only if Session 2 is enabled) ---
  const isSession2Enabled = selectedRadio && selectedRadio.value !== '1' && selectedRadio.value !== '2';

  if (isSession2Enabled) {
    const startInput2 = document.getElementById('id_start_time_2');
    const endInput2 = document.getElementById('id_end_time_2');
    const startTime2Picker = document.getElementById('start_time_2_picker');
    const endTime2Picker = document.getElementById('end_time_2_picker');

    if (startInput2 && endInput2) {
      const startVal2 = startInput2.value;
      const endVal2 = endInput2.value;

      if (startTime2Picker && endTime2Picker && startTime2Picker.value) {
        endTime2Picker.min = startTime2Picker.value;
      }

      if (startVal2 && endVal2) {
        if (new Date(endVal2) <= new Date(startVal2)) {
          setFieldFeedback(endTime2Picker || endInput2, false, 'End time (2) must be after start time (2).');
          isValid = false;
        } else {
          setFieldFeedback(endTime2Picker || endInput2, true);
        }
      } else if (!startVal2 && endVal2) {
        setFieldFeedback(startTime2Picker || startInput2, false, 'Start time (2) is required.');
        isValid = false;
      }
    }
  }

  return isValid;
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
    const startTime1Picker = document.getElementById('start_time_1_picker');
    const endTime1Picker = document.getElementById('end_time_1_picker');
    const selectedRadio = document.querySelector('input[name="session_type"]:checked');

    // 1. Validate Shared Date
    const isDateValid = validateField(sharedDate, 'Event date');

    // 2. Validate Session 1 Time Pickers
    const isStart1Valid = validateField(startTime1Picker, 'Start time (1)');
    const isEnd1Valid = validateField(endTime1Picker, 'End time (1)');

    let isSession2Valid = true;

    // 3. Validate Session 2 Pickers if active (Value is not single session '1' or '2')
    if (selectedRadio && selectedRadio.value !== '1' && selectedRadio.value !== '2') {
      const startTime2Picker = document.getElementById('start_time_2_picker');
      const endTime2Picker = document.getElementById('end_time_2_picker');

      const isStart2Valid = validateField(startTime2Picker, 'Start time (2)');
      const isEnd2Valid = validateField(endTime2Picker, 'End time (2)');

      if (!isStart2Valid || !isEnd2Valid) {
        isSession2Valid = false;
      }
    }

    // 4. Validate range logic across all time inputs
    const areDatesValid = syncAndValidateDates();

    if (!isDateValid || !isStart1Valid || !isEnd1Valid || !isSession2Valid || !areDatesValid) {
      return;
    }

    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'block';

  } else {
    // Step 1 or back navigation
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'none';
    if (step1) step1.style.display = 'block';
  }
}

// -------------------------------------------------------------
// EVENT LISTENERS INITIALIZATION
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // DOM Elements (Create Modal)
  // ==========================================
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('rosterFileInput');
  const submitBtn = document.querySelector('.btn-step-submit');
  const form = document.querySelector('#createEventModal form');

  const nameInput = document.getElementById('id_name');
  const locationInput = document.getElementById('id_location');

  // Hidden Django Datetime Inputs (Create Form)
  const startInput1 = document.getElementById('id_start_time_1');
  const endInput1 = document.getElementById('id_end_time_1');
  const startInput2 = document.getElementById('id_start_time_2');
  const endInput2 = document.getElementById('id_end_time_2');

  // Shared Date & Time Pickers (Create Form)
  const sharedDate = document.getElementById('shared_event_date');
  const startTime1Picker = document.getElementById('start_time_1_picker');
  const endTime1Picker = document.getElementById('end_time_1_picker');
  const startTime2Picker = document.getElementById('start_time_2_picker');
  const endTime2Picker = document.getElementById('end_time_2_picker');

  // ==========================================
  // DOM Elements (Edit Modal)
  // ==========================================
  const editForm = document.getElementById('editEventForm');
  const editSharedDate = document.getElementById('edit_shared_event_date');

  // Hidden Django Datetime Inputs (Edit Form)
  const editStartInput1 = document.getElementById('edit_start_time_1');
  const editEndInput1 = document.getElementById('edit_end_time_1');
  const editStartInput2 = document.getElementById('edit_start_time_2');
  const editEndInput2 = document.getElementById('edit_end_time_2');

  // Time Pickers (Edit Form)
  const editStartTime1Picker = document.getElementById('edit_start_time_1_picker');
  const editEndTime1Picker = document.getElementById('edit_end_time_1_picker');
  const editStartTime2Picker = document.getElementById('edit_start_time_2_picker');
  const editEndTime2Picker = document.getElementById('edit_end_time_2_picker');

  // Time Mapping Configurations
  const createTimePickers = [
    { timeInput: startTime1Picker, target: startInput1 },
    { timeInput: endTime1Picker, target: endInput1 },
    { timeInput: startTime2Picker, target: startInput2 },
    { timeInput: endTime2Picker, target: endInput2 }
  ];

  const editTimePickers = [
    { timeInput: editStartTime1Picker, target: editStartInput1 },
    { timeInput: editEndTime1Picker, target: editEndInput1 },
    { timeInput: editStartTime2Picker, target: editStartInput2 },
    { timeInput: editEndTime2Picker, target: editEndInput2 }
  ];

  // ==========================================
  // Custom Stepper Time Picker Controller
  // ==========================================
  const timePickerModal = document.getElementById('timePickerModal');
  const closeTimePickerBtn = document.getElementById('closeTimePickerBtn');
  const cancelTimePickerBtn = document.getElementById('cancelTimePickerBtn');
  const confirmTimePickerBtn = document.getElementById('confirmTimePickerBtn');

  const tpHourUp = document.getElementById('tpHourUp');
  const tpHourDown = document.getElementById('tpHourDown');
  const tpMinuteUp = document.getElementById('tpMinuteUp');
  const tpMinuteDown = document.getElementById('tpMinuteDown');
  const tpInputHour = document.getElementById('tpInputHour');
  const tpInputMinute = document.getElementById('tpInputMinute');
  const tpAmpmToggle = document.getElementById('tpAmpmToggle');

  let activeTimeInput = null; // Target time input currently being edited

  function padZero(num) {
    return String(num).padStart(2, '0');
  }

  // 1. Numeric-Only Enforcement & Input Formatting
  [tpInputHour, tpInputMinute].forEach(input => {
    if (!input) return;

    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });

    input.addEventListener('focus', (e) => {
      e.target.select();
    });
  });

  if (tpInputHour) {
    tpInputHour.addEventListener('blur', () => {
      let val = parseInt(tpInputHour.value, 10);
      if (isNaN(val) || val < 1) val = 12;
      if (val > 12) val = 12;
      tpInputHour.value = padZero(val);
    });
  }

  if (tpInputMinute) {
    tpInputMinute.addEventListener('blur', () => {
      let val = parseInt(tpInputMinute.value, 10);
      if (isNaN(val) || val < 0) val = 0;
      if (val > 59) val = 59;
      tpInputMinute.value = padZero(val);
    });
  }

  // 2. Stepper Buttons Logic
  if (tpHourUp) {
    tpHourUp.addEventListener('click', () => {
      let val = parseInt(tpInputHour.value, 10) || 12;
      val = val >= 12 ? 1 : val + 1;
      tpInputHour.value = padZero(val);
    });
  }

  if (tpHourDown) {
    tpHourDown.addEventListener('click', () => {
      let val = parseInt(tpInputHour.value, 10) || 1;
      val = val <= 1 ? 12 : val - 1;
      tpInputHour.value = padZero(val);
    });
  }

  if (tpMinuteUp) {
    tpMinuteUp.addEventListener('click', () => {
      let val = parseInt(tpInputMinute.value, 10) || 0;
      val = val >= 59 ? 0 : val + 1;
      tpInputMinute.value = padZero(val);
    });
  }

  if (tpMinuteDown) {
    tpMinuteDown.addEventListener('click', () => {
      let val = parseInt(tpInputMinute.value, 10) || 0;
      val = val <= 0 ? 59 : val - 1;
      tpInputMinute.value = padZero(val);
    });
  }

  // 3. AM/PM Toggle Button
  if (tpAmpmToggle) {
    tpAmpmToggle.addEventListener('click', () => {
      tpAmpmToggle.textContent = tpAmpmToggle.textContent === 'AM' ? 'PM' : 'AM';
    });
  }

  // 4. Open & Close Modal Logic
  function openTimePicker(targetInput, labelTitle) {
    if (!timePickerModal) {
      console.error('Time picker modal element (#timePickerModal) not found in DOM.');
      return;
    }

    activeTimeInput = targetInput;
    const titleEl = document.getElementById('timePickerTitle');
    if (titleEl && labelTitle) {
      titleEl.textContent = `${labelTitle}`;
    }

    // Pre-fill modal state from active target input (expects HH:MM)
    if (targetInput && targetInput.value) {
      const parts = targetInput.value.split(':');
      if (parts.length === 2) {
        let h = parseInt(parts[0], 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        if (tpInputHour) tpInputHour.value = padZero(h);
        if (tpInputMinute) tpInputMinute.value = padZero(parseInt(parts[1], 10) || 0);
        if (tpAmpmToggle) tpAmpmToggle.textContent = ampm;
      }
    } else {
      if (tpInputHour) tpInputHour.value = '09';
      if (tpInputMinute) tpInputMinute.value = '00';
      if (tpAmpmToggle) tpAmpmToggle.textContent = 'AM';
    }

    timePickerModal.style.display = 'flex';
  }

  function closeTimePicker() {
    if (timePickerModal) {
      timePickerModal.style.display = 'none';
    }
    activeTimeInput = null;
  }

  // 5. Confirm Time Selection & Store as 24-Hour (HH:MM)
  if (confirmTimePickerBtn) {
    confirmTimePickerBtn.addEventListener('click', () => {
      if (activeTimeInput) {
        let h = parseInt(tpInputHour ? tpInputHour.value : 12, 10) || 12;
        let m = parseInt(tpInputMinute ? tpInputMinute.value : 0, 10) || 0;
        const ampm = tpAmpmToggle ? tpAmpmToggle.textContent : 'AM';

        if (h < 1) h = 12;
        if (h > 12) h = 12;
        if (m < 0) m = 0;
        if (m > 59) m = 59;

        // Convert 12-hour format to 24-hour format
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;

        activeTimeInput.value = `${padZero(h)}:${padZero(m)}`;

        // Trigger change event to fire sync and validation routines
        activeTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      closeTimePicker();
    });
  }

  [closeTimePickerBtn, cancelTimePickerBtn].forEach(btn => {
    if (btn) btn.addEventListener('click', closeTimePicker);
  });

  // Consolidated picker config covering both Create & Edit modals
  const pickerConfig = [
    // Create Form Pickers
    { el: startTime1Picker, label: 'Start Time (1)' },
    { el: endTime1Picker, label: 'End Time (1)' },
    { el: startTime2Picker, label: 'Start Time (2)' },
    { el: endTime2Picker, label: 'End Time (2)' },
    // Edit Form Pickers
    { el: editStartTime1Picker, label: 'Edit Start Time (1)' },
    { el: editEndTime1Picker, label: 'Edit End Time (1)' },
    { el: editStartTime2Picker, label: 'Edit Start Time (2)' },
    { el: editEndTime2Picker, label: 'Edit End Time (2)' }
  ];

  pickerConfig.forEach(({ el, label }) => {
    if (el) {
      el.setAttribute('readonly', 'readonly');
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openTimePicker(el, label);
      });
    }
  });


  // ==========================================
  // 1. Sync Shared Date + Time Inputs
  // ==========================================
  function syncDateTime() {
    // Create Form Sync
    const dateValue = sharedDate ? sharedDate.value : '';
    createTimePickers.forEach(({ timeInput, target }) => {
      if (dateValue && timeInput && timeInput.value && target) {
        target.value = `${dateValue}T${timeInput.value}`;
      } else if (target) {
        target.value = '';
      }
    });

    // Edit Form Sync
    const editDateValue = editSharedDate ? editSharedDate.value : '';
    editTimePickers.forEach(({ timeInput, target }) => {
      if (editDateValue && timeInput && timeInput.value && target) {
        target.value = `${editDateValue}T${timeInput.value}`;
      } else if (target) {
        target.value = '';
      }
    });
  }

  function handleDateSyncAndValidate() {
    syncDateTime();
    if (typeof syncAndValidateDates === 'function') {
      syncAndValidateDates();
    }
  }


  // ==========================================
  // 2. Event Listeners for Date and Time Pickers
  // ==========================================
  // Create Modal Listeners
  if (sharedDate) {
    sharedDate.addEventListener('change', handleDateSyncAndValidate);
    sharedDate.addEventListener('blur', handleDateSyncAndValidate);
  }

  [startTime1Picker, endTime1Picker, startTime2Picker, endTime2Picker].forEach(picker => {
    if (picker) {
      picker.addEventListener('input', handleDateSyncAndValidate);
      picker.addEventListener('change', handleDateSyncAndValidate);
      picker.addEventListener('blur', handleDateSyncAndValidate);
    }
  });

  // Edit Modal Listeners
  if (editSharedDate) {
    editSharedDate.addEventListener('change', handleDateSyncAndValidate);
    editSharedDate.addEventListener('blur', handleDateSyncAndValidate);
  }

  [editStartTime1Picker, editEndTime1Picker, editStartTime2Picker, editEndTime2Picker].forEach(picker => {
    if (picker) {
      picker.addEventListener('input', handleDateSyncAndValidate);
      picker.addEventListener('change', handleDateSyncAndValidate);
      picker.addEventListener('blur', handleDateSyncAndValidate);
    }
  });


  // ==========================================
  // 3. Inline Input Validation (Name & Location)
  // ==========================================
  if (nameInput && typeof validateField === 'function') {
    nameInput.addEventListener('blur', () => validateField(nameInput, 'Event name'));
    nameInput.addEventListener('input', () => validateField(nameInput, 'Event name'));
  }
  if (locationInput && typeof validateField === 'function') {
    locationInput.addEventListener('blur', () => validateField(locationInput, 'Location'));
    locationInput.addEventListener('input', () => validateField(locationInput, 'Location'));
  }


  // ==========================================
  // 4. File Picker & Drag-and-Drop Handling
  // ==========================================
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (typeof validateSelectedFile === 'function') {
        if (fileInput.files && fileInput.files.length > 0) {
          validateSelectedFile(fileInput.files[0]);
        } else {
          validateSelectedFile(null);
        }
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
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (typeof validateSelectedFile !== 'function' || validateSelectedFile(file)) {
          fileInput.files = e.dataTransfer.files;
        }
      }
    });
  }


  // ==========================================
  // 5. Radio Buttons & Dynamic Time Fields Visibility
  // ==========================================
  const radioButtons = document.querySelectorAll('input[name="session_type"]');
  const time2Container = document.getElementById('time_2');

  function updateTimeFieldsVisibility() {
    const selectedRadio = document.querySelector('input[name="session_type"]:checked');

    if (!selectedRadio) return;

    if (selectedRadio.value === '1' || selectedRadio.value === '2') {
      if (time2Container) time2Container.style.display = 'none';

      if (startTime2Picker) startTime2Picker.value = '';
      if (endTime2Picker) endTime2Picker.value = '';
      if (startInput2) startInput2.value = '';
      if (endInput2) endInput2.value = '';
    } else {
      if (time2Container) time2Container.style.display = 'flex';
    }

    handleDateSyncAndValidate();
  }

  radioButtons.forEach(radio => {
    radio.addEventListener('change', updateTimeFieldsVisibility);
  });

  updateTimeFieldsVisibility();


  // ==========================================
  // 6. Form Submission Handlers
  // ==========================================
  // Create Event Submission Guard
  function handleFormSubmission(e) {
    syncDateTime();

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof setDropzoneFeedback === 'function') {
        setDropzoneFeedback(false, 'Please upload an attendance file (.csv or .xlsx) before creating the event.');
      }
      return false;
    }

    if (typeof validateSelectedFile === 'function') {
      const isValid = validateSelectedFile(fileInput.files[0]);
      if (!isValid) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', handleFormSubmission);
  }

  if (form) {
    form.addEventListener('submit', handleFormSubmission);
  }

  // Edit Event Pre-Submit Sync
  if (editForm) {
    editForm.addEventListener('submit', () => {
      syncDateTime();
    });
  }
});