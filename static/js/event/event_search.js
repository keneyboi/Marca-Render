document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('rosterSearchInput');
  const tableBody = document.querySelector('.roster-table tbody');

  if (!searchInput || !tableBody) return;

  const rows = Array.from(tableBody.querySelectorAll('tr')).map(row => ({
    element: row,
    // Pre-cache row text in lowercase for fast substring matching
    text: row.innerText.toLowerCase()
  }));

  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.trim().toLowerCase();

    for (const item of rows) {
      if (!term || item.text.includes(term)) {
        item.element.style.display = '';
      } else {
        item.element.style.display = 'none';
      }
    }
  });
});