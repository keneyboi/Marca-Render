document.addEventListener("DOMContentLoaded", () => {
    const body = document.getElementById("rosterBody");
    const modal = document.getElementById("editTimesModal");
    const form = document.getElementById("editTimesForm");
    if (!body || !modal || !form) return;

    const nameEl = document.getElementById("editTimesName");
    const saveBtn = document.getElementById("editTimesSave");
    const urlTemplate = form.dataset.urlTemplate;
    const defaultDt = modal.dataset.defaultDatetime || "";
    const inputs = Array.from(form.querySelectorAll('input[type="time"]'));

    function openFor(row) {
        form.action = urlTemplate.replace("987654321", row.dataset.recordId);
        nameEl.textContent = row.dataset.name || "";
        inputs.forEach((input) => { input.value = row.dataset[input.dataset.src] || ""; });
        document.getElementById("et_recalc").checked = true;
        modal.style.display = "flex";
    }

    function closeModal() {
        modal.style.display = "none";
    }

    // Row click (delegated, so it survives search/page fetches).
    body.addEventListener("click", (e) => {
        if (e.target.closest("input, button, a, label, select")) return;   // checkbox, Remove, etc.
        if (window.getSelection && String(window.getSelection())) return;  // user is selecting text
        const row = e.target.closest("tr.attendance-row");
        if (row) openFor(row);
    });

    // Empty field: start the picker on the event's start time instead of today
    inputs.forEach((input) => {
        input.addEventListener("focus", () => { if (!input.value && defaultDt) input.value = defaultDt; });
    });

    form.querySelectorAll(".et-clear").forEach((btn) => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(btn.dataset.target);
            if (input) input.value = "";
        });
    });

    document.getElementById("editTimesClose").addEventListener("click", closeModal);
    document.getElementById("editTimesCancel").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.style.display !== "none") closeModal();
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        saveBtn.disabled = true;
        try {
            const response = await fetch(form.action, {
                method: "POST",
                body: new FormData(form),
                headers: { "X-Requested-With": "XMLHttpRequest" },
                credentials: "same-origin",
            });

            const type = response.headers.get("content-type") || "";
            if (!type.includes("application/json")) {
                showToast("Your session may have expired. Please refresh the page and log in again.", "error");
                return;
            }

            const data = await response.json();
            if (!data.ok) {
                showToast(data.message || "Could not update the times.", "error");
                return;
            }

            showToast(data.message, "success");
            updateCounters(data.counts);
            closeModal();
            // Re-render the current page so the row's cells AND its data-* times are fresh
            if (window.reloadRoster) window.reloadRoster();
            else location.reload();
        } catch (err) {
            console.error("Edit times failed:", err);
            showToast("Network problem. Nothing was changed. Please try again.", "error");
        } finally {
            saveBtn.disabled = false;
        }
    });
});