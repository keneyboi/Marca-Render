(function () {
    const dialog = document.getElementById("attendance-scanner");
    if (!dialog || !dialog.dataset.batchUrl) return;

    const BATCH_URL = dialog.dataset.batchUrl;
    const EVENT_ID = Number(dialog.dataset.eventId);
    const STORAGE_KEY = `marca:scanQueue:${EVENT_ID}`;

    const AUTO_FLUSH_MS = 10000;   // send every 10 seconds while scanning
    const AUTO_FLUSH_COUNT = 20;   // ...or as soon as 20 scans are waiting
    const PER_REQUEST = 200;       // scans per request (server max is 500)
    const COOLDOWN_MS = 4000;      // ignore the same QR code for 4 seconds
    const MAX_RENDERED = 50;       // keep the on-screen list short

    const singleBtn = document.getElementById("scan-mode-single");
    const batchBtn = document.getElementById("scan-mode-batch");
    const form = document.getElementById("attendance-form");
    const panel = document.getElementById("batch-panel");
    const batchSelect = document.getElementById("batch-session-select");
    const listEl = document.getElementById("batch-list");
    const statusEl = document.getElementById("batch-status");
    const sendBtn = document.getElementById("batch-send");
    const doneBtn = document.getElementById("batch-done");
    const clearFailedBtn = document.getElementById("batch-clear-failed");

    let mode = "single";
    let queue = loadQueue();        
    let flushing = false;
    let retryTimer = null;
    let backoffMs = 0;
    let audioCtx = null;
    const recent = new Map();     

    function loadQueue() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    }
    function saveQueue() {
        try {
            if (queue.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
            else localStorage.removeItem(STORAGE_KEY);
        } catch (e) { }
    }

    const sendable = (item) => !item.error;
    const sendableCount = () => queue.filter(sendable).length;
    const failedCount = () => queue.filter((i) => i.error).length;

    function csrfToken() {
        const el = document.querySelector('input[name="csrfmiddlewaretoken"]');
        return el ? el.value : "";
    }

    function optionLabel(value) {
        const opt = Array.from(batchSelect.options).find((o) => o.value === value);
        return opt ? opt.textContent : "";
    }

    function feedback() {
        try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            audioCtx = audioCtx || new Ctx();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.value = 880;
            gain.gain.value = 0.08;
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.08);
        } catch (e) {}
    }

    function setMode(next) {
        mode = next;
        const isBatch = next === "batch";
        form.hidden = isBatch;
        panel.hidden = !isBatch;
        singleBtn.classList.toggle("active", !isBatch);
        batchBtn.classList.toggle("active", isBatch);
        singleBtn.setAttribute("aria-selected", String(!isBatch));
        batchBtn.setAttribute("aria-selected", String(isBatch));
        render();
    }

    function setStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.dataset.kind = kind || "";
    }

    function render() {
        listEl.textContent = "";
        const newestFirst = queue.slice().reverse();
        newestFirst.slice(0, MAX_RENDERED).forEach((item) => {
            const li = document.createElement("li");
            li.className = "batch-item" + (item.error ? " batch-item-error" : "");

            const text = document.createElement("div");
            text.className = "batch-item-text";
            const name = document.createElement("strong");
            name.textContent = `${item.last_name}, ${item.first_name}`;
            const sub = document.createElement("span");
            sub.textContent = item.error ? item.error : (optionLabel(item.option) || "Queued");
            text.append(name, sub);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "batch-item-remove";
            remove.setAttribute("aria-label", `Remove ${item.first_name} ${item.last_name}`);
            remove.textContent = "×";
            remove.addEventListener("click", () => removeItem(item.id));

            li.append(text, remove);
            listEl.appendChild(li);
        });
        if (queue.length > MAX_RENDERED) {
            const more = document.createElement("li");
            more.className = "batch-more";
            more.textContent = `+ ${queue.length - MAX_RENDERED} older scans not shown`;
            listEl.appendChild(more);
        }

        const waiting = sendableCount();
        const failed = failedCount();
        if (!flushing && !retryTimer) {
            if (!queue.length) setStatus("Scan a code to add it to the list.", "");
            else setStatus(`${waiting} waiting${failed ? ` · ${failed} failed` : ""}`, failed ? "error" : "");
        }
        sendBtn.textContent = waiting ? `Send now (${waiting})` : "Send now";
        sendBtn.disabled = flushing || waiting === 0;
        clearFailedBtn.hidden = failed === 0;
    }

    function removeItem(id) {
        queue = queue.filter((i) => i.id !== id);
        saveQueue();
        render();
    }

    function handleScan(rawText) {
        const now = Date.now();
        for (const [text, seen] of recent) if (now - seen > COOLDOWN_MS) recent.delete(text);
        if (recent.has(rawText)) return;      
        recent.set(rawText, now);

        let data;
        try { data = JSON.parse(rawText); } catch (e) { data = null; }
        const str = (v) => (v == null ? "" : String(v).trim());
        const item = data && {
            option: batchSelect.value,
            student_id: str(data.sid),
            email: str(data.em),
            first_name: str(data.fn),
            last_name: str(data.ln),
        };
        if (!item || (!item.student_id && !item.email) || !item.first_name || !item.last_name) {
            showToast("Invalid or unreadable Marca QR Code.", "error");
            return;
        }

        item.key = [item.option, item.student_id || item.email, item.first_name, item.last_name]
            .join("|").toLowerCase();
        if (queue.some((q) => q.key === item.key && sendable(q))) {
            showToast(`${item.first_name} ${item.last_name} is already in the list.`, "error");
            return;
        }

        item.id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
        item.scannedAt = now;
        queue.push(item);
        saveQueue();
        feedback();
        render();

        if (sendableCount() >= AUTO_FLUSH_COUNT) flush();
    }

    async function flush() {
        if (flushing) return;
        clearTimeout(retryTimer);
        retryTimer = null;

        flushing = true;
        try {
            while (sendableCount() > 0) {
                const batch = queue.filter(sendable).slice(0, PER_REQUEST);
                const sentAt = Date.now();
                setStatus(`Sending ${batch.length}…`, "");
                render();

                const body = {
                    event_id: EVENT_ID,
                    items: batch.map((i) => ({
                        option: i.option,
                        student_id: i.student_id,
                        email: i.email,
                        first_name: i.first_name,
                        last_name: i.last_name,
                        seconds_ago: Math.max(0, Math.round((sentAt - i.scannedAt) / 1000)),
                    })),
                };

                let response;
                try {
                    response = await fetch(BATCH_URL, {
                        method: "POST",
                        credentials: "same-origin",
                        headers: {
                            "Content-Type": "application/json",
                            "X-CSRFToken": csrfToken(),
                            "X-Requested-With": "XMLHttpRequest",
                        },
                        body: JSON.stringify(body),
                    });
                } catch (err) {
                    scheduleRetry();          
                    return;
                }

                const type = response.headers.get("content-type") || "";
                if (!type.includes("application/json")) {
                    setStatus("Couldn't send (session expired or server error). Scans are saved on this device — refresh, log in, then tap Send now.", "error");
                    return;
                }

                const data = await response.json();
                if (!response.ok || !data.ok) {
                    setStatus(data.message || "The server rejected the batch.", "error");
                    showToast(data.message || "The server rejected the batch.", "error");
                    return;            
                }

                backoffMs = 0;
                const done = new Set();
                let anyFailed = false;
                data.results.forEach((res) => {
                    const item = batch[res.index];
                    if (!item) return;
                    if (res.ok) {
                        done.add(item.id);
                        if (res.row) updateRowFromServer(res.row);
                    } else {
                        item.error = res.error || "Could not be saved.";
                        anyFailed = true;
                    }
                });
                queue = queue.filter((i) => !done.has(i.id));
                updateCounters(data.counts);
                saveQueue();
                showToast(data.message, anyFailed ? "error" : "success");
            }
        } finally {
            flushing = false;
            render();
        }
    }

    function scheduleRetry() {
        backoffMs = Math.min(backoffMs ? backoffMs * 2 : 15000, 60000);
        const seconds = Math.round(backoffMs / 1000);
        setStatus(`Offline — ${sendableCount()} scans are saved on this device. Retrying in ${seconds}s…`, "error");
        retryTimer = setTimeout(() => { retryTimer = null; flush(); }, backoffMs);
    }

    const single = document.getElementById("session-select");
    if (single) {
        Array.from(single.options).forEach((o) => batchSelect.appendChild(o.cloneNode(true)));
    }

    singleBtn.addEventListener("click", () => setMode("single"));
    batchBtn.addEventListener("click", () => setMode("batch"));
    sendBtn.addEventListener("click", () => { backoffMs = 0; flush(); });
    doneBtn.addEventListener("click", () => resetScanner());  
    clearFailedBtn.addEventListener("click", () => {
        queue = queue.filter(sendable);
        saveQueue();
        render();
    });

    setInterval(() => {
        if (mode === "batch" && dialog.open && !flushing && !retryTimer && sendableCount() > 0) flush();
    }, AUTO_FLUSH_MS);

    window.addEventListener("online", () => { if (sendableCount() > 0) { backoffMs = 0; flush(); } });

    window.BatchScan = {
        isActive: () => mode === "batch",
        handleScan,
        onScannerClosed: () => { if (sendableCount() > 0) flush(); },
    };

    render();
    if (sendableCount() > 0) {
        showToast(`Sending ${sendableCount()} unsent scan(s) from earlier…`, "success");
        setTimeout(flush, 800);
    }
})();