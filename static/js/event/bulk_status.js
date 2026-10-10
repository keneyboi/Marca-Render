document.addEventListener("DOMContentLoaded", () => {
    const bar = document.getElementById("bulk-bar");
    if (!bar) return;

    const selectAll = document.getElementById("bulk-select-all");
    const countEl = document.getElementById("bulk-count");
    const statusSelect = document.getElementById("bulk-status");
    const applyBtn = document.getElementById("bulk-apply");
    const clearBtn = document.getElementById("bulk-clear");

    const allChecks = () => Array.from(document.querySelectorAll(".bulk-check"));
    const visibleChecks = () => allChecks().filter((c) => c.closest("tr").style.display !== "none");
    const selected = () => allChecks().filter((c) => c.checked);

    function refresh() {
        const n = selected().length;
        bar.hidden = n === 0;
        countEl.textContent = `${n} selected`;
        const visible = visibleChecks();
        const visibleOn = visible.filter((c) => c.checked).length;
        if (selectAll) {
            selectAll.checked = visible.length > 0 && visibleOn === visible.length;
            selectAll.indeterminate = visibleOn > 0 && visibleOn < visible.length;
        }
    }

    if (selectAll) {
        selectAll.addEventListener("change", () => {
            visibleChecks().forEach((c) => { c.checked = selectAll.checked; });
            refresh();
        });
    }
    allChecks().forEach((c) => c.addEventListener("change", refresh));

    clearBtn.addEventListener("click", () => {
        allChecks().forEach((c) => { c.checked = false; });
        refresh();
    });

    applyBtn.addEventListener("click", async () => {
        const boxes = selected();
        if (!boxes.length) return;

        const label = statusSelect.options[statusSelect.selectedIndex].textContent.replace(/^Mark as /, "");
        if (!confirm(`Mark ${boxes.length} attendee(s) as ${label}?`)) return;

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
                    record_ids: boxes.map((c) => Number(c.value)),
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
                if (res.row) updateRowFromServer(res.row);
                const box = boxes[res.index];
                if (box) box.checked = false;    
            });
            updateCounters(data.counts);
            showToast(data.message, data.results.some((r) => !r.ok) ? "error" : "success");
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