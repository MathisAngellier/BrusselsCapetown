"use strict";

const editForm = document.getElementById("editLocationForm");
const editStatus = document.getElementById("editStatus");
const saveButton = document.getElementById("saveButton");
const editFields = document.getElementById("editFields");
const recovery = document.getElementById("editRecovery");
let saving = false;

editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || !editForm.reportValidity()) return;

    // Capture values before disabling fields (disabled fields are omitted from FormData).
    const body = new FormData(editForm);
    saving = true;
    editFields.disabled = true;
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    editForm.setAttribute("aria-busy", "true");
    editStatus.textContent = "Saving your changes and translating changed French text...";
    editStatus.className = "form-status";
    recovery.hidden = true;

    try {
        const response = await fetch(editForm.action, {
            method: "POST",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            body,
        });
        if ([401, 404, 409, 419].includes(response.status)) recovery.hidden = false;
        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error("The server returned an invalid response. Check the overview before retrying; your changes may have been saved.");
        }
        if (!response.ok || result.success !== true) {
            throw new Error(Object.values(result.errors || {})[0] || result.message || "The location could not be saved.");
        }
        if (typeof result.revision !== "string" || !result.location) {
            throw new Error("The server returned an incomplete response. Reload the location to check your changes.");
        }

        editForm.elements.namedItem("revision").value = result.revision;
        for (const name of ["journey_date", "location_fr", "distance_km", "latitude", "longitude", "description_fr"]) {
            editForm.elements.namedItem(name).value = result.location[name] ?? "";
        }
        document.getElementById("editSummaryLocation").textContent = result.location.location_fr;
        editStatus.textContent = result.message;
        editStatus.className = "form-status success";
    } catch (error) {
        editStatus.textContent = error instanceof TypeError
            ? "The connection was interrupted. Check the overview before retrying; your changes may have been saved."
            : error.message || "The location could not be saved.";
        editStatus.className = "form-status error";
    } finally {
        saving = false;
        editFields.disabled = false;
        saveButton.disabled = false;
        saveButton.textContent = "Save changes";
        editForm.setAttribute("aria-busy", "false");
    }
});
