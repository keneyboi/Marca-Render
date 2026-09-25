document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('attendanceSearchInput');
  const statusFilter = document.getElementById('attendanceStatusFilter');
  const courseFilter = document.getElementById('attendanceCourseFilter');
  const yearFilter = document.getElementById('attendanceYearFilter');
  const clearBtn = document.getElementById('clearAttendanceFiltersBtn');
  const emptyRow = document.getElementById('noAttendanceMatchRow');

  // Cache table rows with their individual data attributes
  const rows = Array.from(document.querySelectorAll('.attendance-row')).map(row => ({
    element: row,
    status: (row.dataset.status || '').trim(),
    course: (row.dataset.course || '').trim().toLowerCase(),
    year: (row.dataset.year || '').trim(),
    text: row.innerText.toLowerCase()
  }));

  function updateClearVisibility(hasFilters) {
    if (clearBtn) {
      clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
    }
  }

  function applyFilters() {
    const searchTerm = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const selectedStatus = (statusFilter ? statusFilter.value : '').trim();
    const selectedCourse = (courseFilter ? courseFilter.value : '').trim().toLowerCase();
    const selectedYear = (yearFilter ? yearFilter.value : '').trim();

    let visibleCount = 0;

    rows.forEach(item => {
      const matchesSearch = !searchTerm || item.text.includes(searchTerm);
      const matchesStatus = !selectedStatus || item.status === selectedStatus;
      const matchesCourse = !selectedCourse || item.course === selectedCourse;
      const matchesYear = !selectedYear || item.year === selectedYear;

      if (matchesSearch && matchesStatus && matchesCourse && matchesYear) {
        item.element.style.display = '';
        visibleCount++;
      } else {
        item.element.style.display = 'none';
      }
    });

    if (emptyRow) {
      emptyRow.style.display = (visibleCount === 0 && rows.length > 0) ? '' : 'none';
    }

    const hasActiveFilters = Boolean(
      searchTerm.length > 0 || 
      selectedStatus.length > 0 || 
      selectedCourse.length > 0 || 
      selectedYear.length > 0
    );
    updateClearVisibility(hasActiveFilters);
  }

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (statusFilter) statusFilter.addEventListener('change', applyFilters);
  if (courseFilter) courseFilter.addEventListener('change', applyFilters);
  if (yearFilter) yearFilter.addEventListener('change', applyFilters);

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (searchInput) searchInput.value = '';
      if (statusFilter) statusFilter.value = '';
      if (courseFilter) courseFilter.value = '';
      if (yearFilter) yearFilter.value = '';
      applyFilters();
    });
  }
});

// Attendee Modal Handlers
function openDeleteRecordModal(deleteUrl, attendeeName) {
  const modal = document.getElementById('deleteRecordModal');
  const form = document.getElementById('deleteRecordForm');
  const nameSpan = document.getElementById('deleteAttendeeName');

  if (form && nameSpan && modal) {
    form.action = deleteUrl;
    nameSpan.textContent = attendeeName;
    modal.style.display = 'flex';
  }
}

function closeDeleteRecordModal() {
  const modal = document.getElementById('deleteRecordModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

window.addEventListener('click', (e) => {
  const modal = document.getElementById('deleteRecordModal');
  if (e.target === modal) {
    closeDeleteRecordModal();
  }
});