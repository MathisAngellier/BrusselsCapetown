"use strict";

const deleteForm = document.getElementById("deleteLocationForm");
const confirmationName = document.getElementById("confirmationName");
const deleteFields = document.getElementById("deleteLocationFields");
const deleteButton = document.getElementById("deleteLocationButton");
const deleteStatus = document.getElementById("deleteLocationStatus");
const deleteWarning = document.getElementById("deleteLocationWarning");
const deleteRecovery = document.getElementById("deleteLocationRecovery");
let deleting = false;
let deletionFinished = false;
let mustReload = false;

function updateDeleteButton() {
    deleteButton.disabled = deleting || deletionFinished || mustReload
        || confirmationName.value.trim() !== deleteForm.dataset.locationName;
}

confirmationName.addEventListener("input", updateDeleteButton);
updateDeleteButton();

deleteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (deleting || deletionFinished || mustReload || !deleteForm.reportValidity()) return;
    if (confirmationName.value.trim() !== deleteForm.dataset.locationName) {
        deleteStatus.textContent = "Enter the exact location name before deleting.";
        deleteStatus.className = "form-status error";
        return;
    }
    const body = new FormData(deleteForm);
    deleting = true;
    // Until a definite response arrives, the write outcome is unknown.
    mustReload = true;
    deleteFields.disabled = true;
    deleteForm.setAttribute("aria-busy", "true");
    updateDeleteButton();
    deleteStatus.textContent = "Deleting the location and its media. Keep this page open...";
    deleteStatus.className = "form-status";
    deleteWarning.hidden = true;
    deleteRecovery.hidden = true;

    try {
        const response = await fetch(deleteForm.action, {
            method: "POST", credentials: "same-origin",
            headers: { Accept: "application/json" }, body,
        });
        let result;
        try { result = await response.json(); }
        catch { throw new Error("The server returned an invalid response. Check the overview before retrying; deletion may have completed."); }
        if (!response.ok || result.success !== true) {
            // A simple confirmation validation error can be corrected; other states need a fresh page.
            mustReload = response.status !== 422;
            throw new Error(result.message || "The location could not be deleted.");
        }
        if (Number(result.location_id) !== Number(deleteForm.dataset.locationId)) {
            throw new Error("The server returned an unexpected location. Check the overview before retrying.");
        }
        deletionFinished = true;
        deleteStatus.textContent = result.message;
        deleteStatus.className = "form-status success";
        if (result.warning) {
            deleteWarning.textContent = result.warning;
            deleteWarning.hidden = false;
        }
        deleteFields.hidden = true;
        deleteButton.hidden = true;
        document.getElementById("cancelLocationDeletion").hidden = true;
        document.getElementById("deleteLocationDone").hidden = false;
    } catch (error) {
        // Invalid JSON/network errors leave the deletion outcome uncertain: do not offer blind retry.
        deleteStatus.textContent = error instanceof TypeError
            ? "Connection interrupted. Check the overview before retrying; deletion may have completed."
            : error.message || "The location could not be deleted. Check the overview before retrying.";
        deleteStatus.className = "form-status error";
        deleteRecovery.hidden = !mustReload;
    } finally {
        deleting = false;
        deleteFields.disabled = deletionFinished || mustReload;
        deleteForm.setAttribute("aria-busy", "false");
        updateDeleteButton();
    }
});
