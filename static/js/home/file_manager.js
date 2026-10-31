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

function promptDeleteFolder(folderId, folderName) {
  if (!folderId || folderId === 'all') return;

  const modal = document.getElementById('deleteFolderModal');
  const nameEl = document.getElementById('deleteFolderName');
  const idInput = document.getElementById('deleteFolderIdInput');
  const form = document.getElementById('deleteFolderForm');
  const config = document.getElementById('dragDropConfig');
  const deleteUrlTemplate = config ? config.dataset.deleteFolderTemplate : '/folder/0/delete/';

  const resolvedUrl = deleteUrlTemplate 
    ? deleteUrlTemplate.replace('/0/', `/${folderId}/`).replace('/0', `/${folderId}`) 
    : `/folder/${folderId}/delete/`;

  if (nameEl) nameEl.textContent = `"${folderName}"`;
  if (idInput) idInput.value = folderId;
  if (form) {
    form.action = resolvedUrl;
  }

  if (modal) modal.style.display = 'flex';
}
window.promptDeleteFolder = promptDeleteFolder;

function closeDeleteFolderModal() {
  const modal = document.getElementById('deleteFolderModal');
  if (modal) modal.style.display = 'none';
}
window.closeDeleteFolderModal = closeDeleteFolderModal;

function setupFolderLongPress() {
  const folderCards = document.querySelectorAll('.folder-card');

  folderCards.forEach(card => {
    let pressTimer = null;
    let startX = 0;
    let startY = 0;
    let didLongPress = false;

    const startPress = (x, y) => {
      didLongPress = false;
      startX = x;
      startY = y;
      card.classList.add('is-pressing');

      pressTimer = setTimeout(() => {
        didLongPress = true;
        card.classList.remove('is-pressing');
        card.classList.add('long-pressed');
        setTimeout(() => card.classList.remove('long-pressed'), 320);

        if (navigator.vibrate) {
          try { navigator.vibrate(40); } catch (_) {}
        }

        const folderId = card.getAttribute('data-folder-id') || card.dataset.folderId;
        if (!folderId || folderId === 'all') return;
        const folderName = card.getAttribute('data-folder-name') || card.dataset.folderName || card.querySelector('.folder-name')?.textContent?.trim() || 'Folder';

        promptDeleteFolder(folderId, folderName);
      }, 550);
    };

    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      card.classList.remove('is-pressing');
    };

    // Mobile touch
    card.addEventListener('touchstart', (e) => {
      if (e.target.closest('.delete-folder-form, .btn-delete-empty-folder')) return;
      if (e.touches.length > 1) {
        cancelPress();
        return;
      }
      const touch = e.touches[0];
      startPress(touch.clientX, touch.clientY);
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      if (!pressTimer) return;
      const touch = e.touches[0];
      const diffX = Math.abs(touch.clientX - startX);
      const diffY = Math.abs(touch.clientY - startY);
      if (diffX > 10 || diffY > 10) {
        cancelPress();
      }
    }, { passive: true });

    card.addEventListener('touchend', () => cancelPress());
    card.addEventListener('touchcancel', () => cancelPress());

    // Desktop mouse
    card.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.delete-folder-form, .btn-delete-empty-folder')) return;
      startPress(e.clientX, e.clientY);
    });

    card.addEventListener('mousemove', (e) => {
      if (!pressTimer) return;
      const diffX = Math.abs(e.clientX - startX);
      const diffY = Math.abs(e.clientY - startY);
      if (diffX > 8 || diffY > 8) {
        cancelPress();
      }
    });

    card.addEventListener('mouseup', () => cancelPress());
    card.addEventListener('mouseleave', () => cancelPress());

    // Prevent click interception when long press triggered
    card.addEventListener('click', (e) => {
      if (didLongPress) {
        e.preventDefault();
        e.stopPropagation();
        didLongPress = false;
      }
    }, true);
  });
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

      const cardEl = draggedCardElement || document.querySelector(`.draggable-event[data-event-id="${eventId}"]`);
      const eventName = cardEl ? (cardEl.dataset.eventName || cardEl.getAttribute('data-event-name') || 'Event') : 'Event';
      const folderName = zone.querySelector('.folder-name')?.textContent?.trim() || 'folder';

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
          // Visual feedback on folder via CSS animation class
          zone.classList.add('drop-success');
          setTimeout(() => zone.classList.remove('drop-success'), 600);

          // Update folder count: ONLY show number (fixes "item" string bug)
          const countElem = zone.querySelector('.folder-count');
          if (countElem) {
            const current = parseInt(countElem.textContent, 10) || 0;
            const updated = current + 1;
            countElem.textContent = updated;

            // Hide empty folder delete button if present
            const emptyDelBtn = zone.querySelector('.btn-delete-empty-folder');
            if (emptyDelBtn) emptyDelBtn.style.display = 'none';
          }

          // Smooth animated card exit
          if (cardEl) {
            cardEl.dataset.folderId = targetFolderId;
            cardEl.setAttribute('data-folder-id', targetFolderId);

            const rmForm = cardEl.querySelector('.remove-folder-form');
            if (rmForm) {
              rmForm.dataset.eventFolderId = targetFolderId;
            }

            cardEl.classList.add('dropping-out');
            setTimeout(() => {
              cardEl.classList.remove('dropping-out');

              // If currently in an active folder filter that is NOT the target folder, hide the card
              const activeFolderPill = document.querySelector('.folder-card.active, .folder-pill.active');
              const activeFolderId = activeFolderPill ? (activeFolderPill.getAttribute('data-folder-id') || activeFolderPill.dataset.folderId || 'all') : 'all';
              if (activeFolderId !== 'all' && activeFolderId !== targetFolderId) {
                cardEl.style.setProperty('display', 'none', 'important');
                cardEl.classList.add('filter-hidden');
              }

              if (isInFolder) {
                cardEl.remove();
              }
            }, 350);
          }

          showToast(`Moved "${eventName}" to ${folderName}`, 'success');
        } else {
          console.error('Failed to move event. Status:', response.status);
        }
      } catch (err) {
        console.error('Network error during move:', err);
      }
    });
  });

  // Modal backdrop click listener for Delete Folder Modal
  const deleteFolderModal = document.getElementById('deleteFolderModal');
  if (deleteFolderModal) {
    deleteFolderModal.addEventListener('click', (e) => {
      if (e.target === deleteFolderModal) closeDeleteFolderModal();
    });
  }

  // Handle Delete Folder submission via AJAX
  const deleteFolderForm = document.getElementById('deleteFolderForm');
  if (deleteFolderForm) {
    deleteFolderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const folderId = document.getElementById('deleteFolderIdInput')?.value;
      const folderNameEl = document.getElementById('deleteFolderName');
      const folderName = folderNameEl ? folderNameEl.textContent.replace(/^"|"$/g, '') : 'Folder';
      const config = document.getElementById('dragDropConfig');
      const deleteUrlTemplate = config ? config.dataset.deleteFolderTemplate : '/folder/0/delete/';
      let actionUrl = deleteFolderForm.action;
      if (folderId && (!actionUrl || actionUrl.includes('/0/') || actionUrl.endsWith('/0'))) {
        actionUrl = deleteUrlTemplate 
          ? deleteUrlTemplate.replace('/0/', `/${folderId}/`).replace('/0', `/${folderId}`) 
          : `/folder/${folderId}/delete/`;
      }
      const csrfInput = deleteFolderForm.querySelector('[name=csrfmiddlewaretoken]') || document.querySelector('[name=csrfmiddlewaretoken]');
      const csrfToken = csrfInput ? csrfInput.value : '';

      closeDeleteFolderModal();

      try {
        const response = await fetch(actionUrl, {
          method: 'POST',
          headers: {
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        if (response.ok) {
          const folderCard = document.querySelector(`.folder-card[data-folder-id="${folderId}"]`);
          const wasActive = folderCard && folderCard.classList.contains('active');

          if (folderCard) {
            folderCard.classList.add('dropping-out');
            setTimeout(() => folderCard.remove(), 320);
          }

          // Unlink any event cards belonging to this folder
          document.querySelectorAll(`.event-card[data-folder-id="${folderId}"]`).forEach(card => {
            card.dataset.folderId = '';
            card.setAttribute('data-folder-id', '');
            const rmForm = card.querySelector('.remove-folder-form');
            if (rmForm) rmForm.style.display = 'none';
          });

          // If the deleted folder was currently active, reset view to All Events
          if (wasActive) {
            sessionStorage.setItem('marca_active_folder_id', 'all');
            const allPill = document.querySelector('.folder-pill[data-folder-id="all"]');
            if (allPill) {
              document.querySelectorAll('.folder-pill, .folder-card').forEach(p => p.classList.remove('active'));
              allPill.classList.add('active');
            }
            document.querySelectorAll('.event-card').forEach(card => {
              card.classList.remove('filter-hidden');
              card.style.setProperty('display', '', '');
            });
            const noResults = document.getElementById('noResultsMessage');
            if (noResults) noResults.style.display = 'none';
          }

          showToast(`Deleted folder "${folderName}". Events moved to All Events.`, 'success');
        } else {
          showToast('Failed to delete folder.', 'error');
        }
      } catch (err) {
        console.error('Error deleting folder:', err);
        showToast('Network error while deleting folder.', 'error');
      }
    });
  }

  // Setup long-press listeners on folders
  setupFolderLongPress();
});

function showToast(message, kind = 'success') {
  if (typeof window.showToast === 'function' && window.showToast !== showToast) {
    window.showToast(message, kind);
    return;
  }
  const host = document.body;
  const toast = document.createElement('div');
  toast.textContent = message;
  const colors = kind === 'success'
    ? 'background: rgba(230,244,234,0.95); color: #137333; border: 1px solid rgba(19, 115, 51, 0.25);'
    : 'background: rgba(252,232,230,0.95); color: #c5221f; border: 1px solid rgba(197, 34, 31, 0.25);';
  toast.style.cssText = `
    position: fixed; top: 24px; right: 24px; z-index: 99999;
    max-width: 450px; padding: 12px 18px; border-radius: 999px;
    font-family: 'SF Pro', -apple-system, sans-serif;
    font-size: 13.5px; font-weight: 600; line-height: 1.4;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    transition: opacity 0.3s ease, transform 0.3s ease; ${colors}`;
  host.appendChild(toast);

  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-6px)'; }, 2800);
  setTimeout(() => { toast.remove(); }, 3200);
}

function toggleCardMenu(button) {
  const currentMenu = button.nextElementSibling;
  const isOpen = currentMenu.classList.contains('show');

  // Close any existing open dropdowns
  closeAllCardMenus();

  // Open clicked menu
  if (!isOpen) {
    const card = button.closest('.event-card');
    const removeForm = currentMenu.querySelector('.remove-folder-form');
    if (removeForm) {
      // Find currently active folder
      const activeFolderPill = document.querySelector('.folder-card.active, .folder-pill.active');
      const activeFolderId = activeFolderPill ? (activeFolderPill.getAttribute('data-folder-id') || activeFolderPill.dataset.folderId || 'all') : 'all';
      const cardFolderId = card ? (card.dataset.folderId || card.getAttribute('data-folder-id') || '') : '';
      const configEl = document.getElementById('dragDropConfig');
      const isInFolder = configEl ? configEl.dataset.isInFolder === 'true' : false;

      // Show "Remove from Folder" option when inside a folder and the event belongs to a folder
      const isInsideFolder = (activeFolderId !== 'all') || isInFolder;
      removeForm.style.display = (isInsideFolder && cardFolderId) ? 'block' : 'none';
    }
    currentMenu.classList.add('show');
  }
}

// Handle Remove from Folder via AJAX
document.addEventListener('submit', async function(e) {
  const form = e.target.closest('.remove-folder-form');
  if (!form) return;

  e.preventDefault();
  e.stopPropagation();

  const card = form.closest('.event-card');
  const actionUrl = form.action;
  const csrfInput = form.querySelector('[name=csrfmiddlewaretoken]') || document.querySelector('[name=csrfmiddlewaretoken]');
  const csrfToken = csrfInput ? csrfInput.value : '';

  try {
    const response = await fetch(actionUrl, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrfToken,
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    if (response.ok) {
      closeAllCardMenus();

      // Decrement the active folder pill count
      const activeFolderPill = document.querySelector('.folder-card.active, .folder-pill.active');
      if (activeFolderPill) {
        const countElem = activeFolderPill.querySelector('.folder-count');
        if (countElem) {
          const current = parseInt(countElem.textContent, 10) || 0;
          const newCount = Math.max(0, current - 1);
          countElem.textContent = newCount;

          if (newCount === 0) {
            let emptyDelBtn = activeFolderPill.querySelector('.btn-delete-empty-folder');
            if (!emptyDelBtn) {
              emptyDelBtn = document.createElement('button');
              emptyDelBtn.type = 'button';
              emptyDelBtn.className = 'btn-delete-empty-folder';
              emptyDelBtn.title = 'Delete empty folder';
              emptyDelBtn.setAttribute('aria-label', 'Delete empty folder');
              emptyDelBtn.innerHTML = `
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>`;
              const fId = activeFolderPill.getAttribute('data-folder-id') || activeFolderPill.dataset.folderId;
              const fName = activeFolderPill.getAttribute('data-folder-name') || activeFolderPill.dataset.folderName || activeFolderPill.querySelector('.folder-name')?.textContent?.trim() || 'Folder';
              emptyDelBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                promptDeleteFolder(fId, fName);
              });
              activeFolderPill.appendChild(emptyDelBtn);
            } else {
              emptyDelBtn.style.display = 'inline-flex';
            }
          }
        }
      }

      // Animate card removal from current folder view
      if (card) {
        card.dataset.folderId = '';
        card.setAttribute('data-folder-id', '');
        card.classList.add('dropping-out');
        setTimeout(() => {
          card.classList.remove('dropping-out');
          card.style.setProperty('display', 'none', 'important');
          card.classList.add('filter-hidden');
        }, 350);
      }

      showToast('Event removed from folder', 'success');
    } else {
      form.submit();
    }
  } catch (_) {
    form.submit();
  }
});

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
  } else {
    document.getElementById('edit_end_time_1_picker').value = '';
  }

  // Handle Session 1 Time Out visibility (Hide if sessionType == '1')
  const time1bContainer = document.getElementById('edit_time_1_b');
  if (time1bContainer) {
    if (String(data.sessionType) === '1') {
      time1bContainer.style.display = 'none';
      document.getElementById('edit_end_time_1_picker').value = '';
    } else {
      time1bContainer.style.display = '';
    }
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

    const isSession1 = String(sessionType) === '1';

    // 2. Session 1 Validation: Start time must be before End time (only if End time exists)
    if (!isSession1) {
      if (!et1) {
        showFieldError('edit_end_time_1_picker', 'error_edit_end_time_1', 'End time (1) is required.');
        hasError = true;
      } else if (st1 && st1 >= et1) {
        showFieldError('edit_end_time_1_picker', 'error_edit_end_time_1', 'End time (1) must be after start time (1).');
        hasError = true;
      }
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
    document.getElementById('edit_start_time_1').value = st1 ? `${dateVal}T${st1}` : '';
    document.getElementById('edit_end_time_1').value = (!isSession1 && et1) ? `${dateVal}T${et1}` : '';

    if (String(sessionType) === '3' && st2 && et2) {
      document.getElementById('edit_start_time_2').value = `${dateVal}T${st2}`;
      document.getElementById('edit_end_time_2').value = `${dateVal}T${et2}`;
    } else {
      document.getElementById('edit_start_time_2').value = '';
      document.getElementById('edit_end_time_2').value = '';
    }
  });
});