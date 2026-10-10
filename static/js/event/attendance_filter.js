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

  // Called by scan_attendance.js after it patches a row in place.
  // The row element is the same, but the cached status/text copies are now
  // out of date, so refresh them and re-apply the active filters.
  window.refreshAttendanceRow = function (rowElement) {
    const item = rows.find(r => r.element === rowElement);
    if (item) {
      item.status = (rowElement.dataset.status || '').trim();
      item.text = rowElement.innerText.toLowerCase();
    }
    applyFilters();
  };

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

  // -------------------------------------------------------------
  // CONDITIONAL IDENTIFIER VALIDATION FOR ADD ATTENDEE MODAL
  // -------------------------------------------------------------
  const studentIdInput = document.getElementById('add_student_id');
  const emailInput = document.getElementById('add_email');
  const lblStudentId = document.getElementById('lbl_student_id');
  const lblEmail = document.getElementById('lbl_email');
  const addForm = document.getElementById('addAttendeeForm');

  function syncIdentifierRequirements() {
    if (!studentIdInput || !emailInput) return;

    const hasStudentId = studentIdInput.value.trim().length > 0;
    const hasEmail = emailInput.value.trim().length > 0;

    if (hasStudentId && !hasEmail) {
      lblStudentId.textContent = "Student ID *";
      lblEmail.textContent = "Email (Optional)";
    } else if (!hasStudentId && hasEmail) {
      lblStudentId.textContent = "Student ID (Optional)";
      lblEmail.textContent = "Email *";
    } else {
      lblStudentId.textContent = "Student ID";
      lblEmail.textContent = "Email";
    }
  }

  if (studentIdInput && emailInput) {
    studentIdInput.addEventListener('input', syncIdentifierRequirements);
    emailInput.addEventListener('input', syncIdentifierRequirements);
  }

  if (addForm) {
    addForm.addEventListener('submit', (e) => {
      const hasStudentId = studentIdInput ? studentIdInput.value.trim().length > 0 : false;
      const hasEmail = emailInput ? emailInput.value.trim().length > 0 : false;

      if (!hasStudentId && !hasEmail) {
        e.preventDefault();
        alert('Please provide at least a Student ID or an Email address.');
        if (studentIdInput) studentIdInput.focus();
      }
    });
  }
});

// Delete Modal Handlers
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

// Add Modal Handlers
function openAddRecordModal() {
  const modal = document.getElementById('addRecordModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeAddRecordModal() {
  const modal = document.getElementById('addRecordModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Click outside detection for all detail modals
window.addEventListener('click', (e) => {
  const deleteModal = document.getElementById('deleteRecordModal');
  const addModal = document.getElementById('addRecordModal');
  if (e.target === deleteModal) {
    closeDeleteRecordModal();
  }
  if (e.target === addModal) {
    closeAddRecordModal();
  }
});