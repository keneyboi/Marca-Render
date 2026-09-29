let draggedEventId = null;
let draggedCardElement = null;
let hasDragged = false;

function openFolderModalWithEvents(eventIds = '', eventName1 = '', eventName2 = '') {
  const modal = document.getElementById('newFolderModal');
  const input = document.getElementById('folderNameInput');
  const eventIdsField = document.getElementById('folderEventIds');
  const subtitle = document.getElementById('folderModalSubtitle');

  if (!modal) return;

  if (eventIdsField) eventIdsField.value = eventIds;
  if (input) input.value = '';

  if (subtitle) {
    if (eventName1 && eventName2) {
      subtitle.innerHTML = `Group <strong>"${eventName1}"</strong> and <strong>"${eventName2}"</strong> into a new folder:`;
    } else {
      subtitle.textContent = 'Enter a name for your new folder.';
    }
  }

  modal.style.display = 'flex';
  if (input) setTimeout(() => input.focus(), 50);
}

function closeFolderModal() {
  const modal = document.getElementById('newFolderModal');
  const eventIdsField = document.getElementById('folderEventIds');
  if (modal) modal.style.display = 'none';
  if (eventIdsField) eventIdsField.value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('openFolderBtn');
  const closeBtn = document.getElementById('closeFolderBtn');
  const modal = document.getElementById('newFolderModal');
  const csrfInput = document.querySelector('[name=csrfmiddlewaretoken]');
  const csrfToken = csrfInput ? csrfInput.value : '';

  const configEl = document.getElementById('dragDropConfig');
  const moveUrlTemplate = configEl ? configEl.dataset.moveUrlTemplate : '/event/0/move/';
  // Check if we are currently inside a folder view
  const isInFolder = configEl ? configEl.dataset.isInFolder === 'true' : false;

  // Modal event listeners
  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openFolderModalWithEvents();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeFolderModal();
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeFolderModal();
    });
  }

  const draggables = document.querySelectorAll('.draggable-event');
  const dropZones = document.querySelectorAll('.drop-zone');

  // 1. Setup Event Cards
  draggables.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedEventId = card.dataset.eventId;
      draggedCardElement = card;
      hasDragged = false;
      card.classList.add('is-dragging');
      e.dataTransfer.setData('text/plain', card.dataset.eventId);
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      document.querySelectorAll('.event-merge-hover').forEach(el => el.classList.remove('event-merge-hover'));

      setTimeout(() => {
        draggedEventId = null;
        draggedCardElement = null;
        hasDragged = false;
      }, 100);
    });

    // ONLY allow dragging onto another card if we are in Root (NOT inside a folder)
    if (!isInFolder) {
      card.addEventListener('dragover', (e) => {
        if (!draggedCardElement || draggedCardElement === card) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('event-merge-hover');
      });

      card.addEventListener('dragleave', (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.classList.remove('event-merge-hover');
        }
      });

      // Drop on another event card -> prompt new folder creation
      card.addEventListener('drop', (e) => {
        if (!draggedCardElement || draggedCardElement === card) return;
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('event-merge-hover');

        const sourceId = draggedCardElement.dataset.eventId;
        const targetId = card.dataset.eventId;
        const sourceName = draggedCardElement.dataset.eventName;
        const targetName = card.dataset.eventName;

        openFolderModalWithEvents(`${sourceId},${targetId}`, sourceName, targetName);
      });
    }

    // Handle normal clicks (without firing after dragging)
    card.addEventListener('click', (e) => {
      if (hasDragged || card.classList.contains('is-dragging')) return;
      if (e.target.closest('button') || e.target.closest('form') || e.target.closest('a')) return;
      const url = card.dataset.detailUrl;
      if (url) window.location.href = url;
    });
  });

  // 2. Setup Folder Cards & Root Drop Zones
  dropZones.forEach(zone => {
    zone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove('drag-over');
      }
    });

    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('drag-over');

      const eventId = draggedEventId || e.dataTransfer.getData('text/plain');
      if (!eventId) return;

      hasDragged = true;

      const targetFolderId = zone.getAttribute('data-folder-id') || '';
      const postUrl = moveUrlTemplate.replace('/0/', `/${eventId}/`).replace('/0', `/${eventId}`);

      const formData = new FormData();
      formData.append('target_folder_id', targetFolderId);

      try {
        const response = await fetch(postUrl, {
          method: 'POST',
          headers: {
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: formData
        });

        if (response.ok) {
          if (draggedCardElement) {
            draggedCardElement.remove();
          } else {
            const cardEl = document.querySelector(`.draggable-event[data-event-id="${eventId}"]`);
            if (cardEl) cardEl.remove();
          }

          const countElem = zone.querySelector('.folder-count');
          if (countElem) {
            const current = parseInt(countElem.textContent) || 0;
            const updated = current + 1;
            countElem.textContent = `${updated} item${updated === 1 ? '' : 's'}`;
          }
        } else {
          console.error('Failed to move event. Status:', response.status);
        }
      } catch (err) {
        console.error('Network error during move:', err);
      }
    });
  });
});

function toggleCardMenu(button) {
  const currentMenu = button.nextElementSibling;
  const isOpen = currentMenu.classList.contains('show');

  // Close any existing open dropdowns
  closeAllCardMenus();

  // Open clicked menu
  if (!isOpen) {
    currentMenu.classList.add('show');
  }
}

function closeAllCardMenus() {
  document.querySelectorAll('.card-dropdown-menu.show').forEach(menu => {
    menu.classList.remove('show');
  });
}

// Close menus when clicking outside
document.addEventListener('click', function(event) {
  if (!event.target.closest('.card-action-menu')) {
    closeAllCardMenus();
  }
});

/**
 * Opens the Edit Modal and populates existing event data
 * @param {Object} data - Event attributes passed from template
 */
function openEditEventModal(data) {
  const form = document.getElementById('editEventForm');
  if (!form) return;

  // 1. Update form action URL
  form.action = `/event/events/${data.id}/update/`;

  // 2. Populate basic text fields
  document.getElementById('edit_event_name').value = data.name || '';
  document.getElementById('edit_event_location').value = data.location || '';
  document.getElementById('edit_event_description').value = data.description || '';
  
  const sessionTypeInput = document.getElementById('edit_session_type');
  if (sessionTypeInput) sessionTypeInput.value = data.sessionType || '1';

  // 3. Extract date and time parts (Expecting "YYYY-MM-DDTHH:MM")
  if (data.startTime1 && data.startTime1.includes('T')) {
    const [datePart, timePart] = data.startTime1.split('T');
    document.getElementById('edit_shared_event_date').value = datePart;
    document.getElementById('edit_start_time_1_picker').value = timePart;
  }
  if (data.endTime1 && data.endTime1.includes('T')) {
    document.getElementById('edit_end_time_1_picker').value = data.endTime1.split('T')[1];
  }

  // 4. Handle Session 2 visibility (Display ONLY when sessionType == '3')
  const session2Container = document.getElementById('edit_time_2');
  if (session2Container) {
    if (String(data.sessionType) === '3') {
      session2Container.style.display = 'flex';
      
      if (data.startTime2 && data.startTime2.includes('T')) {
        document.getElementById('edit_start_time_2_picker').value = data.startTime2.split('T')[1];
      }
      if (data.endTime2 && data.endTime2.includes('T')) {
        document.getElementById('edit_end_time_2_picker').value = data.endTime2.split('T')[1];
      }
    } else {
      session2Container.style.display = 'none';
      const st2Picker = document.getElementById('edit_start_time_2_picker');
      const et2Picker = document.getElementById('edit_end_time_2_picker');
      if (st2Picker) st2Picker.value = '';
      if (et2Picker) et2Picker.value = '';
    }
  }

  // Clear previous validation messages upon opening
  clearAllValidationErrors();

  // 5. Display Modal Overlay
  document.getElementById('editEventModal').style.display = 'flex';
}

function closeEditEventModal() {
  const modal = document.getElementById('editEventModal');
  if (modal) modal.style.display = 'none';
}

function clearAllValidationErrors() {
  const fields = [
    { input: 'edit_shared_event_date', error: 'error_edit_shared_event_date' },
    { input: 'edit_start_time_1_picker', error: 'error_edit_start_time_1' },
    { input: 'edit_end_time_1_picker', error: 'error_edit_end_time_1' },
    { input: 'edit_start_time_2_picker', error: 'error_edit_start_time_2' },
    { input: 'edit_end_time_2_picker', error: 'error_edit_end_time_2' }
  ];

  fields.forEach(({ input, error }) => {
    const inputEl = document.getElementById(input);
    const errorEl = document.getElementById(error);
    if (inputEl) inputEl.classList.remove('is-invalid');
    if (errorEl) errorEl.textContent = '';
  });
}

// Safely attach submit listener when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
  const editForm = document.getElementById('editEventForm');
  if (!editForm) return;

  function showFieldError(inputId, errorId, message) {
    const inputEl = document.getElementById(inputId);
    const errorEl = document.getElementById(errorId);
    if (inputEl) inputEl.classList.add('is-invalid');
    if (errorEl) errorEl.textContent = message;
  }

  editForm.addEventListener('submit', function (e) {
    clearAllValidationErrors();

    const dateInput = document.getElementById('edit_shared_event_date');
    const st1Input = document.getElementById('edit_start_time_1_picker');
    const et1Input = document.getElementById('edit_end_time_1_picker');
    const st2Input = document.getElementById('edit_start_time_2_picker');
    const et2Input = document.getElementById('edit_end_time_2_picker');

    const sessionType = document.getElementById('edit_session_type')?.value;

    const dateVal = dateInput?.value;
    const st1 = st1Input?.value;
    const et1 = et1Input?.value;
    const st2 = st2Input?.value;
    const et2 = et2Input?.value;

    let hasError = false;

    // 1. Required Checks
    if (!dateVal) {
      showFieldError('edit_shared_event_date', 'error_edit_shared_event_date', 'Event date is required.');
      hasError = true;
    }

    if (!st1) {
      showFieldError('edit_start_time_1_picker', 'error_edit_start_time_1', 'Start time (1) is required.');
      hasError = true;
    }

    if (!et1) {
      showFieldError('edit_end_time_1_picker', 'error_edit_end_time_1', 'End time (1) is required.');
      hasError = true;
    }

    // 2. Session 1 Validation: Start time must be before End time
    if (st1 && et1 && st1 >= et1) {
      showFieldError('edit_end_time_1_picker', 'error_edit_end_time_1', 'End time (1) must be after start time (1).');
      hasError = true;
    }

    // 3. Session 2 Validation (For two-part session configurations)
    if (String(sessionType) === '3') {
      if (!st2) {
        showFieldError('edit_start_time_2_picker', 'error_edit_start_time_2', 'Start time (2) is required.');
        hasError = true;
      }

      if (!et2) {
        showFieldError('edit_end_time_2_picker', 'error_edit_end_time_2', 'End time (2) is required.');
        hasError = true;
      }

      if (st2 && et2 && st2 >= et2) {
        showFieldError('edit_end_time_2_picker', 'error_edit_end_time_2', 'End time (2) must be after start time (2).');
        hasError = true;
      }

      if (et1 && st2 && st2 <= et1) {
        showFieldError('edit_start_time_2_picker', 'error_edit_start_time_2', 'Start time (2) must be after Session 1 end time.');
        hasError = true;
      }
    }

    // Block submit if validation fails
    if (hasError) {
      e.preventDefault();
      return false;
    }

    // ==========================================
    // HIDDEN INPUT SYNCHRONIZATION
    // ==========================================
    document.getElementById('edit_start_time_1').value = `${dateVal}T${st1}`;
    document.getElementById('edit_end_time_1').value = `${dateVal}T${et1}`;

    if (String(sessionType) === '3' && st2 && et2) {
      document.getElementById('edit_start_time_2').value = `${dateVal}T${st2}`;
      document.getElementById('edit_end_time_2').value = `${dateVal}T${et2}`;
    } else {
      document.getElementById('edit_start_time_2').value = '';
      document.getElementById('edit_end_time_2').value = '';
    }
  });
});