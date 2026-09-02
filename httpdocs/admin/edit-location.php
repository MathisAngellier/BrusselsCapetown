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
                Existing photos, videos and journey order will stay unchanged, even if you change the date.
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
        <?php endif; ?>
    </main>
</body>
</html>
