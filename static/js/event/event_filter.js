document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('eventSearchInput');
  const statusFilter = document.getElementById('eventStatusFilter');
  const clearBtn = document.getElementById('clearFiltersBtn');
  const emptyState = document.getElementById('noResultsMessage');
  const folderPills = document.querySelectorAll('.folder-pill, .folder-card');

  const STORAGE_KEY = 'marca_active_folder_id';

  // Check URL query param first, then sessionStorage, default to 'all'
  const urlParams = new URLSearchParams(window.location.search);
  const folderFromUrl = urlParams.get('folder');
  let selectedFolderId = folderFromUrl || sessionStorage.getItem(STORAGE_KEY) || 'all';

  // Restore previously selected pill
  const matchingPill = Array.from(folderPills).find(pill => {
    const fId = (pill.getAttribute('data-folder-id') || pill.dataset.folderId || 'all').trim();
    return fId === selectedFolderId;
  });

  if (matchingPill) {
    folderPills.forEach(p => p.classList.remove('active'));
    matchingPill.classList.add('active');
    // Scroll the selected pill smoothly into view on horizontal carousel
    try {
      matchingPill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } catch (_) {}
  } else {
    selectedFolderId = 'all';
  }

  // Cache card elements and their searchable text + folder ID
  const cards = Array.from(document.querySelectorAll('.event-card')).map(card => ({
    element: card,
    status: (card.dataset.status || card.getAttribute('data-status') || '').trim(),
    folderId: (card.dataset.folderId || card.getAttribute('data-folder-id') || '').trim(),
    text: (card.textContent || '').toLowerCase()
  }));

  function updateClearVisibility(hasFilters) {
    if (clearBtn) {
      clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
    }
  }

  function applyFilters() {
    const searchTerm = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const selectedStatus = (statusFilter ? statusFilter.value : '').trim();
    let visibleCount = 0;

    cards.forEach(item => {
      const matchesSearch = !searchTerm || item.text.includes(searchTerm);
      const matchesStatus = !selectedStatus || item.status.toLowerCase() === selectedStatus.toLowerCase();
      const matchesFolder = (selectedFolderId === 'all') || (item.folderId === String(selectedFolderId));

      if (matchesSearch && matchesStatus && matchesFolder) {
        item.element.classList.remove('filter-hidden');
        item.element.style.setProperty('display', '', '');
        visibleCount++;
      } else {
        item.element.classList.add('filter-hidden');
        item.element.style.setProperty('display', 'none', 'important');
      }
    });

    if (emptyState) {
      emptyState.style.display = (visibleCount === 0 && cards.length > 0) ? 'block' : 'none';
    }

    const hasActiveFilters = searchTerm.length > 0 || selectedStatus.length > 0 || selectedFolderId !== 'all';
    updateClearVisibility(hasActiveFilters);
  }

  // Initial filter application to respect restored folder
  applyFilters();

  // Folder Pill Filtering
  folderPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      // Don't intercept clicks inside delete buttons/forms
      if (e.target.closest('.delete-folder-form, .btn-delete-empty-folder')) return;

      e.preventDefault();

      const folderId = (pill.getAttribute('data-folder-id') || pill.dataset.folderId || 'all').trim();
      selectedFolderId = folderId;

      // Persist chosen folder across navigations
      sessionStorage.setItem(STORAGE_KEY, folderId);

      // Update active state visual
      folderPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      applyFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', applyFilters);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (searchInput) searchInput.value = '';
      if (statusFilter) statusFilter.value = '';
      selectedFolderId = 'all';
      sessionStorage.setItem(STORAGE_KEY, 'all');

      folderPills.forEach(p => {
        if (p.dataset.folderId === 'all' || p.classList.contains('folder-pill')) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });

      applyFilters();
    });
  }
});

// Modal Dialog Handlers
function openDeleteModal(eventId, eventName) {
  const modal = document.getElementById('deleteModal');
  const form = document.getElementById('deleteEventForm');
  const nameSpan = document.getElementById('deleteEventName');

  if (form && nameSpan && modal) {
    form.action = `/event/${eventId}/delete/`;
    nameSpan.textContent = eventName;
    modal.style.display = 'flex';
  }
}

function closeDeleteModal() {
  const modal = document.getElementById('deleteModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

window.addEventListener('click', (e) => {
  const modal = document.getElementById('deleteModal');
  if (e.target === modal) {
    closeDeleteModal();
  }
});