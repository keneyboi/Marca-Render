document.addEventListener('DOMContentLoaded', () => {
  const search = document.getElementById('attendanceSearchInput');
  const statusSel = document.getElementById('attendanceStatusFilter');
  const courseSel = document.getElementById('attendanceCourseFilter');
  const yearSel = document.getElementById('attendanceYearFilter');
  const clearBtn = document.getElementById('clearAttendanceFiltersBtn');
  const body = document.getElementById('rosterBody');
  const pager = document.getElementById('paginationWrap');
  if (!search || !body) return;

  let timer, controller;
  let currentPage = new URLSearchParams(location.search).get('page');

  function params(page) {
    const p = new URLSearchParams();
    if (search.value.trim()) p.set('q', search.value.trim());
    if (statusSel?.value) p.set('status', statusSel.value);
    if (courseSel?.value) p.set('course', courseSel.value);
    if (yearSel?.value) p.set('year', yearSel.value);
    if (page) p.set('page', page);
    return p;
  }

  async function load(page) {
    currentPage = page || null;
    const p = params(page);
    const hasFilter = [...p.keys()].some(k => k !== 'page');
    clearBtn.style.display = hasFilter ? '' : 'none';

    controller?.abort();
    controller = new AbortController();

    try {
      const res = await fetch(`${location.pathname}?${p}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        signal: controller.signal,
        credentials: 'same-origin',
      });
      const data = await res.json();
      body.innerHTML = data.rows_html;
      pager.innerHTML = data.pagination_html;
      const qs = p.toString();
      history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
      document.dispatchEvent(new CustomEvent('roster:updated'));
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
  }

  // Used by scan_attendance.js after an attendee is added
  window.reloadRoster = () => load(currentPage);

  search.addEventListener('input', () => {
    clearTimeout(timer);
    const v = search.value.trim();
    if (v.length === 1) return;              // wait for at least 2 characters (empty still resets)
    timer = setTimeout(() => load(), 400); 
  });
  [statusSel, courseSel, yearSel].forEach(el => el?.addEventListener('change', () => load()));

  clearBtn.addEventListener('click', e => {
    e.preventDefault();
    search.value = '';
    [statusSel, courseSel, yearSel].forEach(el => { if (el) el.value = ''; });
    load();
  });

  pager.addEventListener('click', e => {
    const a = e.target.closest('.js-page-link');
    if (!a) return;
    e.preventDefault();
    load(new URL(a.href).searchParams.get('page'));
  });

  const exportBtn = document.getElementById('exportEventXlsxBtn');
  if (exportBtn) {
    const baseUrl = exportBtn.getAttribute('href').split('?')[0];
    exportBtn.addEventListener('click', () => {
      const p = new URLSearchParams(location.search);
      p.delete('page');
      const qs = p.toString();
      exportBtn.href = `${baseUrl}${qs ? '?' + qs : ''}`;
    });
  }
});