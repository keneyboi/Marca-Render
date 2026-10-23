document.addEventListener("DOMContentLoaded", () => {
    const bar = document.getElementById("bulk-bar");
    if (!bar) return;

    const selectAll = document.getElementById("bulk-select-all");
    const countEl = document.getElementById("bulk-count");
    const statusSelect = document.getElementById("bulk-status");
    const applyBtn = document.getElementById("bulk-apply");
    const clearBtn = document.getElementById("bulk-clear");

    // The source of truth: record IDs (as strings) selected across all pages/searches
    const selectedIds = new Set();

    const pageChecks = () => Array.from(document.querySelectorAll(".bulk-check"));

    // Re-tick the boxes on screen that belong to the remembered selection
    function syncCheckboxes() {
        pageChecks().forEach((c) => { c.checked = selectedIds.has(c.value); });
    }

    function refresh() {
        const n = selectedIds.size;
        bar.hidden = n === 0;
        countEl.textContent = `${n} selected`;

        const checks = pageChecks();
        const on = checks.filter((c) => c.checked).length;
        if (selectAll) {
            selectAll.checked = checks.length > 0 && on === checks.length;
            selectAll.indeterminate = on > 0 && on < checks.length;
        }
    }

    // Tick/untick a single row
    const MAX_SELECTED = 500;

    document.addEventListener("change", (e) => {
        if (!e.target || !e.target.classList.contains("bulk-check")) return;
        if (e.target.checked) {
            if (selectedIds.size >= MAX_SELECTED) {
                e.target.checked = false;
                showToast(`You can select up to ${MAX_SELECTED} attendees at a time.`, "error");
                return;
            }
            selectedIds.add(e.target.value);
        } else {
            selectedIds.delete(e.target.value);
        }
        refresh();
    });

    // "Select all" affects only the rows currently shown
    if (selectAll) {
        selectAll.addEventListener("change", () => {
            pageChecks().forEach((c) => {
                c.checked = selectAll.checked;
                if (selectAll.checked) selectedIds.add(c.value);
                else selectedIds.delete(c.value);
            });
            refresh();
        });
    }

    clearBtn.addEventListener("click", () => {
        selectedIds.clear();
        syncCheckboxes();
        refresh();
    });

    // Rows were replaced by a search/filter/page fetch: restore ticks from the Set
    document.addEventListener("roster:updated", () => {
        syncCheckboxes();
        refresh();
    });

    applyBtn.addEventListener("click", async () => {
        const ids = Array.from(selectedIds).map(Number);
        if (!ids.length) return;

        const label = statusSelect.options[statusSelect.selectedIndex].textContent.replace(/^Mark as /, "");
        if (!confirm(`Mark ${ids.length} attendee(s) as ${label}?`)) return;

        const token = document.querySelector('input[name="csrfmiddlewaretoken"]');
        applyBtn.disabled = true;
        try {
            const response = await fetch(bar.dataset.url, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": token ? token.value : "",
                    "X-Requested-With": "XMLHttpRequest",
                },
                body: JSON.stringify({
                    event_id: Number(bar.dataset.eventId),
                    status: statusSelect.value,
                    record_ids: ids,
                }),
            });

            const type = response.headers.get("content-type") || "";
            if (!type.includes("application/json")) {
                showToast("Your session may have expired. Please refresh the page and log in again.", "error");
                return;
            }
            const data = await response.json();
            if (!response.ok || !data.ok) {
                showToast(data.message || "Could not update the selected rows.", "error");
                return;
            }

            data.results.forEach((res) => {
                if (!res.ok) return;
                if (res.row) updateRowFromServer(res.row);   // skipped if row isn't on this page
                const id = ids[res.index];
                if (id !== undefined) selectedIds.delete(String(id));
            });
            updateCounters(data.counts);
            showToast(data.message, data.results.some((r) => !r.ok) ? "error" : "success");
            syncCheckboxes();
            refresh();
        } catch (err) {
            console.error("Bulk update failed:", err);
            showToast("Network problem. Nothing was changed. Please try again.", "error");
        } finally {
            applyBtn.disabled = false;
        }
    });

    refresh();
});