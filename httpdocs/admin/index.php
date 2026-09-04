<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api/admin/auth.php';

bctRequireAdminPage();

header('Cache-Control: no-store');

$username = $_SESSION['admin_username'] ?? 'admin';
$csrfToken = bctCsrfToken();
?>

<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Add journey location</title>

    <link rel="stylesheet" href="/admin/admin.css">
</head>

<body>
    <header class="admin-header">
        <p>
            Logged in as
            <?= htmlspecialchars($username, ENT_QUOTES, 'UTF-8') ?>
        </p>

        <form action="/admin/logout.php" method="post">
            <input
                type="hidden"
                name="csrf_token"
                value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>">

            <button class="logout-button" type="submit">Log out</button>
        </form>
    </header>

    <main class="admin-main">
        <nav class="admin-navigation" aria-label="Admin navigation">
            <a href="/admin/locations.php">Manage locations</a>
        </nav>
        <h1>Add journey location</h1>

        <form
            class="location-form"
            id="locationForm"
            action="/api/admin/locations.php"
            method="post"
            enctype="multipart/form-data">
            <input
                type="hidden"
                name="csrf_token"
                value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>">
            <input
                type="hidden"
                id="expectedMediaCount"
                name="expected_media_count"
                value="0">

            <div class="form-grid">
                <div class="form-field">
                    <label for="journeyDate">Date</label>
                    <input
                        type="date"
                        id="journeyDate"
                        name="journey_date"
                        required>
                </div>

                <div class="form-field">
                    <label for="locationFr">Location (FR)</label>
                    <input
                        type="text"
                        id="locationFr"
                        name="location_fr"
                        maxlength="150"
                        autocomplete="off"
                        required>
                </div>

                <div class="form-field form-field-full">
                    <label for="distanceKm">Distance from previous location (km)</label>
                    <input
                        type="number"
                        id="distanceKm"
                        name="distance_km"
                        min="0"
                        max="999999.99"
                        step="0.01"
                        inputmode="decimal"
                        required>
                </div>

                <div class="form-field">
                    <label for="latitude">Latitude</label>
                    <input
                        type="number"
                        id="latitude"
                        name="latitude"
                        min="-90"
                        max="90"
                        step="0.0000001"
                        inputmode="decimal"
                        required>
                </div>

                <div class="form-field">
                    <label for="longitude">Longitude</label>
                    <input
                        type="number"
                        id="longitude"
                        name="longitude"
                        min="-180"
                        max="180"
                        step="0.0000001"
                        inputmode="decimal"
                        required>
                </div>

                <div class="form-field form-field-full">
                    <label for="descriptionFr">Description (FR) — optional</label>
                    <textarea
                        id="descriptionFr"
                        name="description_fr"
                        maxlength="10000"></textarea>
                </div>

                <div class="form-field form-field-full">
                    <label for="mediaFiles">Photos / videos</label>
                    <input
                        type="file"
                        id="mediaFiles"
                        name="media_files[]"
                        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/x-m4v"
                        multiple
                        required>

                    <p class="file-summary" id="fileSummary">
                        JPG, PNG, WebP, GIF, MP4, WebM, MOV or M4V. Select 1 to 20 files.
                        Maximum 15 MB per image, 200 MB per video and 350 MB total.
                        Photos are automatically resized and stored as metadata-free WebP files.
                    </p>
                </div>
            </div>

            <p class="form-note">
                The location and any description you enter are translated automatically from French to English.
                The journey order and media order are assigned automatically.
            </p>

            <div class="form-actions">
                <p class="form-status" id="formStatus" role="status" aria-live="polite"></p>

                <button class="submit-button" id="submitButton" type="submit">
                    Add location
                </button>
            </div>
        </form>
    </main>

    <script>
        const locationForm = document.getElementById("locationForm");
        const formStatus = document.getElementById("formStatus");
        const submitButton = document.getElementById("submitButton");
        const mediaFiles = document.getElementById("mediaFiles");
        const fileSummary = document.getElementById("fileSummary");
        const expectedMediaCount = document.getElementById("expectedMediaCount");

        const maxFiles = 20;
        const maxImageSize = 15 * 1024 * 1024;
        const maxVideoSize = 200 * 1024 * 1024;
        const maxTotalSize = 350 * 1024 * 1024;
        const allowedImageTypes = new Set([
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
        ]);
        const allowedVideoTypes = new Set([
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/x-m4v",
        ]);

        function validateSelectedMedia() {
            const files = Array.from(mediaFiles.files || []);
            const totalSize = files.reduce((total, file) => total + file.size, 0);

            if (files.length === 0) {
                return "Select at least one photo or video.";
            }

            if (files.length > maxFiles) {
                return `Select no more than ${maxFiles} files.`;
            }

            if (totalSize > maxTotalSize) {
                return "The selected files are larger than the 350 MB total limit.";
            }

            for (const file of files) {
                if (allowedImageTypes.has(file.type)) {
                    if (file.size > maxImageSize) {
                        return `${file.name} is larger than 15 MB.`;
                    }

                    continue;
                }

                if (allowedVideoTypes.has(file.type)) {
                    if (file.size > maxVideoSize) {
                        return `${file.name} is larger than 200 MB.`;
                    }

                    continue;
                }

                return `${file.name} is not a supported photo or video.`;
            }

            return "";
        }

        mediaFiles.addEventListener("change", () => {
            const fileCount = mediaFiles.files.length;
            expectedMediaCount.value = String(fileCount);
            const totalBytes = Array.from(mediaFiles.files).reduce(
                (total, file) => total + file.size,
                0
            );
            const totalMegabytes = (totalBytes / 1024 / 1024).toFixed(1);

            fileSummary.textContent = fileCount === 0 ?
                "JPG, PNG, WebP, GIF, MP4, WebM, MOV or M4V. Select 1 to 20 files. Maximum 15 MB per image, 200 MB per video and 350 MB total. Photos are automatically resized and stored as metadata-free WebP files." :
                `${fileCount} file${fileCount === 1 ? "" : "s"} selected (${totalMegabytes} MB total).`;
        });

        locationForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (!locationForm.reportValidity()) {
                return;
            }

            const mediaError = validateSelectedMedia();

            if (mediaError) {
                formStatus.textContent = mediaError;
                formStatus.className = "form-status error";
                return;
            }

            expectedMediaCount.value = String(mediaFiles.files.length);

            submitButton.disabled = true;
            submitButton.textContent = "Translating and uploading...";
            formStatus.textContent = "";
            formStatus.className = "form-status";

            try {
                const response = await fetch("/api/admin/locations.php", {
                    method: "POST",
                    credentials: "same-origin",
                    body: new FormData(locationForm),
                });

                let result;

                try {
                    result = await response.json();
                } catch {
                    throw new Error(
                        response.status === 413 ?
                        "The selected files are larger than the server upload limit." :
                        "The server returned an invalid response."
                    );
                }

                if (!response.ok) {
                    const validationMessages = Object.values(result.errors || {});

                    throw new Error(
                        validationMessages[0] ||
                        result.message ||
                        "The location could not be added."
                    );
                }

                formStatus.textContent = `Location added as journey stop ${result.location.journey_order} with ${result.location.media_count} media file${result.location.media_count === 1 ? "" : "s"}.`;
                formStatus.classList.add("success");
                locationForm.reset();
                expectedMediaCount.value = "0";
                fileSummary.textContent = "JPG, PNG, WebP, GIF, MP4, WebM, MOV or M4V. Select 1 to 20 files. Maximum 15 MB per image, 200 MB per video and 350 MB total. Photos are automatically resized and stored as metadata-free WebP files.";
            } catch (error) {
                formStatus.textContent = error.message || "The location could not be added.";
                formStatus.classList.add("error");
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = "Add location";
            }
        });
    </script>
</body>

</html>
