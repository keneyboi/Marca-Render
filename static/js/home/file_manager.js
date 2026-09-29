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