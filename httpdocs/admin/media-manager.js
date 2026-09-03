export function validateMediaFiles(files) {
    if (!files.length || files.length > 20) return "Select between 1 and 20 files per upload.";
    let total = 0;
    const images = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const videos = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];
    for (const file of files) {
        const limit = images.includes(file.type) ? 15 : videos.includes(file.type) ? 200 : 0;
        if (!limit) return `${file.name} is not supported. Convert HEIC to JPG before uploading.`;
        if (file.size <= 0 || file.size > limit * 1024 * 1024) return `${file.name} must be nonempty and no larger than ${limit} MB.`;
        total += file.size;
    }
    return total > 350 * 1024 * 1024 ? "The selected files exceed the 350 MB total limit." : "";
}

export function moveMedia(items, id, direction) {
    const index = items.findIndex(item => item.media_id === id);
    const target = index + direction;
    if (![1, -1].includes(direction) || index < 0 || target < 0 || target >= items.length) return [...items];
    const result = [...items];
    [result[index], result[target]] = [result[target], result[index]];
    return result;
}

export function validateMediaResponse(data, locationId) {
    if (data?.success !== true || !/^[a-f0-9]{64}$/.test(data.revision) || !Array.isArray(data.media)) {
        throw new Error("The server returned an invalid media list. Reload the media list before retrying.");
    }
    const ids = new Set();
    for (const item of data.media) {
        const extensions = item.media_type === "image" ? "jpg|jpeg|png|webp|gif" : "mp4|webm|mov|m4v";
        const path = new RegExp(`^/uploads/gallery/${locationId}/[A-Za-z0-9_-]+\\.(?:${extensions})$`, "i");
        if (!Number.isSafeInteger(item.media_id) || item.media_id < 1 || ids.has(item.media_id)
            || !["image", "video"].includes(item.media_type)
            || (item.url !== null && (typeof item.url !== "string" || !path.test(item.url)))) {
            throw new Error("The server returned an invalid media item.");
        }
        ids.add(item.media_id);
    }
    return data;
}

export function setupMediaManager(root, { fetchImpl = globalThis.fetch, confirmImpl = globalThis.confirm } = {}) {
    const find = id => root.querySelector(`#${id}`);
    const list = find("adminMediaList");
    const status = find("mediaStatus");
    const uploadForm = find("appendMediaForm");
    const uploadFields = find("mediaUploadFields");
    const fileInput = find("additionalMediaFiles");
    const summary = find("additionalMediaSummary");
    const defaultSummary = summary.textContent;
    const reload = find("reloadMedia");
    const saveOrder = find("saveMediaOrder");
    const resetOrder = find("resetMediaOrder");
    const locationId = Number(root.dataset.locationId);
    let items = [], savedItems = [], revision = null, busy = false;
    const dirty = () => items.some((item, index) => item.media_id !== savedItems[index]?.media_id);

    function announce(message, error = false) {
        status.textContent = message;
        status.className = error ? "form-status error" : "form-status";
    }
    function controls() {
        uploadFields.disabled = busy || !revision || dirty();
        reload.disabled = busy;
        saveOrder.disabled = busy || !revision || !dirty();
        resetOrder.disabled = busy || !dirty();
        find("mediaOrderNote").hidden = !dirty();
        root.setAttribute("aria-busy", String(busy));
        for (const button of list.querySelectorAll("button")) {
            button.disabled = busy || !revision || button.dataset.boundary === "true"
                || (button.dataset.action === "delete" && dirty());
        }
    }
    function render(focusId = null, focusAction = null) {
        list.replaceChildren();
        find("mediaEmpty").hidden = items.length !== 0;
        items.forEach((item, index) => {
            const card = document.createElement("li");
            card.className = "admin-media-item";
            const label = `${item.media_type === "video" ? "Video" : "Photo"} ${index + 1}`;
            const title = document.createElement("p");
            title.textContent = `${label} · ${(item.file_size / 1024 / 1024).toFixed(1)} MB`;
            card.append(title);
            const error = document.createElement("p");
            error.className = "preview-error";
            error.textContent = "Preview unavailable. The file may be missing or its format may not play in this browser.";
            error.hidden = item.url !== null;
            if (item.url !== null) {
                const preview = document.createElement(item.media_type === "video" ? "video" : "img");
                preview.className = "admin-media-preview";
                if (item.media_type === "video") {
                    preview.controls = true;
                    preview.playsInline = true;
                    preview.preload = "metadata";
                    preview.setAttribute("aria-label", label);
                    // A small time offset can help Safari show a frame without creating thumbnail files.
                    preview.src = `${item.url}#t=0.001`;
                } else {
                    preview.alt = label;
                    preview.loading = "lazy";
                    preview.src = item.url;
                }
                preview.addEventListener("error", () => { error.hidden = false; });
                card.append(preview);
            }
            card.append(error);
            const actions = document.createElement("div");
            actions.className = "admin-media-actions";
            for (const [action, text, boundary] of [["earlier", "Earlier", index === 0], ["later", "Later", index === items.length - 1], ["delete", "Delete", false]]) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = text;
                button.dataset.action = action;
                button.dataset.id = String(item.media_id);
                button.dataset.boundary = String(boundary);
                button.setAttribute("aria-label", `${text}: ${label}`);
                if (action === "delete") button.className = "delete-media";
                actions.append(button);
            }
            card.append(actions);
            list.append(card);
        });
        controls();
        if (focusId !== null) {
            const preferred = list.querySelector(`button[data-id="${focusId}"][data-action="${focusAction}"]`);
            if (preferred && !preferred.disabled) preferred.focus();
            else list.querySelector(`button[data-id="${focusId}"]:not(:disabled)`)?.focus();
        }
    }

    async function request(action, extra = {}) {
        if (busy) return;
        busy = true;
        controls();
        announce(action === "upload" ? "Uploading files. Keep this page open..." : "Loading or saving media...");
        try {
            let url = `/api/admin/media.php?location_id=${locationId}`;
            const options = { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } };
            if (action !== "list") {
                url = "/api/admin/media.php";
                const body = new FormData();
                body.set("location_id", String(locationId));
                body.set("csrf_token", root.dataset.csrfToken);
                body.set("media_revision", revision);
                body.set("action", action);
                if (action === "upload") {
                    const files = Array.from(fileInput.files);
                    body.set("expected_media_count", String(files.length));
                    files.forEach(file => body.append("media_files[]", file));
                }
                for (const [key, value] of Object.entries(extra)) body.set(key, value);
                options.method = "POST";
                options.body = body;
            }
            const response = await fetchImpl(url, options);
            let data;
            try { data = await response.json(); }
            catch { throw new Error(response.status === 413 ? "The files exceed the server upload limit." : "The server returned an invalid response. Reload the media list to check whether the action completed."); }
            if (!response.ok || data.success !== true) throw new Error(data.message || "The media action failed.");
            validateMediaResponse(data, locationId);
            items = data.media;
            savedItems = [...items];
            revision = data.revision;
            if (action === "upload") {
                uploadForm.reset();
                summary.textContent = defaultSummary;
            }
            render();
            announce(data.warning || data.message || `${items.length} media item(s).`, Boolean(data.warning));
        } catch (error) {
            // A failed/ambiguous write must not be blindly retried with a stale list.
            revision = null;
            announce(`${error.message || "Connection interrupted."} Use ‘Reload media list’ before another action. Your location text above has not been reset.`, true);
        } finally {
            busy = false;
            controls();
        }
    }

    reload.addEventListener("click", () => {
        if (!dirty() || confirmImpl("Discard unsaved media order changes and reload the list?")) request("list");
    });
    saveOrder.addEventListener("click", () => {
        if (!busy && revision && dirty()) request("reorder", { ordered_media_ids: JSON.stringify(items.map(item => item.media_id)) });
    });
    resetOrder.addEventListener("click", () => {
        if (busy) return;
        items = [...savedItems];
        render();
        announce("Unsaved order changes discarded.");
    });
    list.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");
        if (!button || button.disabled || busy || !revision) return;
        const id = Number(button.dataset.id);
        const index = items.findIndex(item => item.media_id === id);
        if (index < 0) return;
        if (button.dataset.action === "delete") {
            if (dirty()) return;
            const label = items[index].media_type === "video" ? "video" : "photo";
            if (confirmImpl(`Permanently delete ${label} ${index + 1}? The file and its database entry will be removed. This cannot be undone through the admin panel.`)) {
                request("delete", { media_id: String(id) });
            }
        } else {
            const direction = button.dataset.action === "earlier" ? -1 : 1;
            items = moveMedia(items, id, direction);
            render(id, button.dataset.action);
            announce("Order changed locally. Select ‘Save order’ to apply it to the gallery.");
        }
    });
    fileInput.addEventListener("change", () => {
        const files = Array.from(fileInput.files);
        summary.textContent = files.length ? `${files.length} file(s), ${(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MB total.` : defaultSummary;
    });
    uploadForm.addEventListener("submit", event => {
        event.preventDefault();
        if (busy || !revision || dirty() || !uploadForm.reportValidity()) return;
        const error = validateMediaFiles(Array.from(fileInput.files));
        if (error) { announce(error, true); return; }
        request("upload");
    });
    return request("list");
}

if (typeof document !== "undefined") {
    const root = document.getElementById("mediaManager");
    if (root) setupMediaManager(root);
}
