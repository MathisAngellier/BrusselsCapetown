<?php

declare(strict_types=1);

ini_set('display_errors', '0');
require_once dirname(__DIR__) . '/api/admin/auth.php';
bctRequireAdminPage();
header('Cache-Control: no-store');
require_once dirname(__DIR__) . '/api/admin/location-fields.php';
require_once __DIR__ . '/layout.php';

$location = false;
$errorMessage = '';
$locationId = bctLocationId($_GET['id'] ?? null);
if ($locationId === null) {
    http_response_code(400);
    $errorMessage = 'Select a valid journey location from the overview.';
} else {
    try {
        require dirname(__DIR__) . '/api/bootstrap.php';
        $statement = $pdo->prepare(
            'SELECT location_id, journey_order, journey_date, location_fr, location_en,
                distance_km, latitude, longitude, description_fr, description_en
             FROM gallery_locations WHERE location_id = :location_id'
        );
        $statement->execute(['location_id' => $locationId]);
        $location = $statement->fetch();
        if ($location === false) {
            http_response_code(404);
            $errorMessage = 'This journey location no longer exists.';
        }
    } catch (Throwable $error) {
        error_log('Admin edit page failed (' . get_class($error) . ').');
        http_response_code(500);
        $errorMessage = 'The location could not be loaded. Try again later.';
    }
}

bctAdminPageStart('Edit journey location');
?>
    <main class="admin-main">
        <nav class="admin-navigation" aria-label="Admin navigation">
            <a href="/admin/locations.php">Back to locations</a>
        </nav>
        <h1>Edit journey location</h1>
        <?php if ($errorMessage !== ''): ?>
            <p class="form-status error" role="alert"><?= bctAdminEscape($errorMessage) ?></p>
        <?php else: ?>
            <p class="edit-summary">
                Journey stop <?= (int) $location['journey_order'] ?> · <span id="editSummaryLocation"><?= bctAdminEscape($location['location_fr']) ?></span><br>
                Saving these details keeps your media and journey order unchanged. Manage photos and videos separately below.
            </p>
            <noscript><p>Enable JavaScript to save changes using this form.</p></noscript>
            <form class="location-form" id="editLocationForm" action="/api/admin/update-location.php" method="post">
                <input type="hidden" name="csrf_token" value="<?= bctAdminEscape(bctCsrfToken()) ?>">
                <input type="hidden" name="location_id" value="<?= (int) $location['location_id'] ?>">
                <input type="hidden" name="revision" value="<?= bctAdminEscape(bctLocationRevision($location)) ?>">
            <fieldset class="form-grid edit-fields" id="editFields" aria-label="Location details">
                <div class="form-field">
                    <label for="journeyDate">Date</label>
                    <input
                        type="date"
                        id="journeyDate"
                        name="journey_date"
                        min="1000-01-01"
                        max="9999-12-31"
                        value="<?= bctAdminEscape($location['journey_date']) ?>"
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
                        required value="<?= bctAdminEscape($location['location_fr']) ?>">
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
                        required value="<?= bctAdminEscape($location['distance_km']) ?>">
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
                        required value="<?= bctAdminEscape($location['latitude']) ?>">
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
                        required value="<?= bctAdminEscape($location['longitude']) ?>">
                </div>

                <div class="form-field form-field-full">
                    <label for="descriptionFr">Description (FR) — optional</label>
                    <textarea
                        id="descriptionFr"
                        name="description_fr"
                        maxlength="10000"><?= bctAdminEscape($location['description_fr'] ?? '') ?></textarea>
                </div>
            </fieldset>
            <p class="form-note">
                Only changed French text is translated again. Leave the description empty to remove it in both languages.
            </p>
            <div class="form-actions">
                <p class="form-status" id="editStatus" role="status" aria-live="polite"></p>
                <a href="/admin/locations.php">Cancel</a>
                <button class="submit-button" id="saveButton" type="submit">Save changes</button>
            </div>
            <p id="editRecovery" hidden>
                <a href="/admin/edit-location.php?id=<?= (int) $location['location_id'] ?>">Reload this location</a>
                (discards unsaved changes), or <a href="/admin/login.php">log in again</a> if your session expired.
            </p>
        </form>
        <script src="/admin/edit-location.js" defer></script>
        <section class="media-manager" id="mediaManager" aria-labelledby="mediaHeading"
            data-location-id="<?= (int) $location['location_id'] ?>"
            data-csrf-token="<?= bctAdminEscape(bctCsrfToken()) ?>">
            <h2 id="mediaHeading">Photos and videos</h2>
            <p class="form-note">Add files, remove individual items or change their display order. These actions do not save or reset the location details above.</p>
            <p id="mediaStatus" class="form-status" role="status" aria-live="polite">Loading media...</p>
            <div class="media-toolbar">
                <button type="button" id="reloadMedia" class="logout-button">Reload media list</button>
                <button type="button" id="saveMediaOrder" class="logout-button" disabled>Save order</button>
                <button type="button" id="resetMediaOrder" class="logout-button" disabled>Discard order changes</button>
            </div>
            <p id="mediaOrderNote" class="form-note" hidden>Order changes are not saved yet. Save or discard them before uploading or deleting.</p>
            <p id="mediaEmpty" hidden>No photos or videos yet. Add files below.</p>
            <ol class="admin-media-list" id="adminMediaList" aria-label="Media in display order"></ol>
            <form id="appendMediaForm" action="/api/admin/media.php" method="post" enctype="multipart/form-data">
                <fieldset id="mediaUploadFields" class="edit-fields location-form" disabled>
                    <legend>Add photos or videos</legend>
                    <div class="form-field">
                        <label for="additionalMediaFiles">Choose files</label>
                        <input type="file" id="additionalMediaFiles" name="media_files[]" multiple required
                            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/x-m4v">
                        <p class="file-summary" id="additionalMediaSummary">Up to 20 files per upload. 15 MB per image, 200 MB per video, 350 MB total. New files are added at the end. Photos are automatically resized and stored as metadata-free WebP files.</p>
                    </div>
                    <p class="form-note">JPG, PNG, WebP, GIF, MP4, WebM, MOV or M4V. HEIC is not supported. Some MOV codecs cannot play in every browser.</p>
                    <button class="submit-button" id="uploadMoreMedia" type="submit">Upload files</button>
                </fieldset>
            </form>
            <noscript><p>Enable JavaScript to manage media.</p></noscript>
        </section>
        <script type="module" src="/admin/media-manager.js"></script>
        <?php endif; ?>
    </main>
</body>
</html>
