document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('eventSearchInput');
  const statusFilter = document.getElementById('eventStatusFilter');
  const clearBtn = document.getElementById('clearFiltersBtn');
  const emptyState = document.getElementById('noResultsMessage');

  // Cache card elements and their searchable text
  const cards = Array.from(document.querySelectorAll('.event-card')).map(card => ({
    element: card,
    status: (card.dataset.status || '').trim(),
    text: card.innerText.toLowerCase()
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
      const matchesStatus = !selectedStatus || item.status === selectedStatus;

      if (matchesSearch && matchesStatus) {
        item.element.style.display = '';
        visibleCount++;
      } else {
        item.element.style.display = 'none';
      }
    });

    if (emptyState) {
      emptyState.style.display = (visibleCount === 0 && cards.length > 0) ? 'block' : 'none';
    }

    updateClearVisibility(searchTerm.length > 0 || selectedStatus.length > 0);
  }

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