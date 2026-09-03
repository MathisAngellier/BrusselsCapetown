<?php

declare(strict_types=1);

ini_set('display_errors', '0');
require_once dirname(__DIR__) . '/api/admin/auth.php';
bctRequireAdminPage();
header('Cache-Control: no-store');
require_once dirname(__DIR__) . '/api/admin/location-deletion.php';
require_once __DIR__ . '/layout.php';

$location = false;
$media = [];
$errorMessage = '';
$locationId = bctLocationId($_GET['id'] ?? null);
if ($locationId === null) {
    http_response_code(400);
    $errorMessage = 'Select a valid journey location from the overview.';
} else {
    try {
        require dirname(__DIR__) . '/api/bootstrap.php';
        $location = bctReadDeletionLocation($pdo, $locationId);
        if ($location === false) {
            http_response_code(404);
            $errorMessage = 'This journey location no longer exists.';
        } else {
            $media = bctReadLocationMedia($pdo, $locationId);
            $revision = bctLocationDeletionRevision($location, $media);
        }
    } catch (Throwable $error) {
        error_log('Location deletion confirmation failed (' . get_class($error) . ').');
        http_response_code(500);
        $errorMessage = 'The location could not be loaded. No deletion is available; try again later.';
    }
}
$photoCount = count(array_filter($media, static function (array $item): bool { return $item['media_type'] === 'image'; }));
$videoCount = count(array_filter($media, static function (array $item): bool { return $item['media_type'] === 'video'; }));
bctAdminPageStart('Delete journey location');
?>
    <main class="admin-main">
        <nav class="admin-navigation" aria-label="Admin navigation">
            <a href="/admin/locations.php">Back to locations</a>
        </nav>
        <h1>Delete journey location</h1>
        <?php if ($errorMessage !== ''): ?>
            <p class="form-status error" role="alert"><?= bctAdminEscape($errorMessage) ?></p>
        <?php else: ?>
            <div class="delete-location-summary">
                <p><strong><?= bctAdminEscape($location['location_fr']) ?></strong><br>
                    Journey stop <?= (int) $location['journey_order'] ?> · <?= bctAdminEscape($location['journey_date']) ?> · Location ID <?= (int) $location['location_id'] ?></p>
                <p>This deletes the location, both language versions, <?= $photoCount ?> photo(s) and <?= $videoCount ?> video(s), including their uploaded files.</p>
                <p><strong>This cannot be undone through the admin panel.</strong> Keep a database and upload backup if you may need to restore it.</p>
                <p>Other stops are not renumbered and their distances are not recalculated. Review the following stop's distance if needed.</p>
            </div>
            <form class="location-form" id="deleteLocationForm" action="/api/admin/delete-location.php" method="post"
                data-location-id="<?= (int) $location['location_id'] ?>" data-location-name="<?= bctAdminEscape($location['location_fr']) ?>">
                <input type="hidden" name="csrf_token" value="<?= bctAdminEscape(bctCsrfToken()) ?>">
                <input type="hidden" name="location_id" value="<?= (int) $location['location_id'] ?>">
                <input type="hidden" name="deletion_revision" value="<?= bctAdminEscape($revision) ?>">
                <fieldset class="edit-fields" id="deleteLocationFields">
                    <div class="form-field">
                        <label for="confirmationName">Type the exact location name to confirm</label>
                        <input type="text" name="confirmation_name" id="confirmationName" maxlength="150" autocomplete="off" spellcheck="false" required
                            aria-describedby="confirmationNameHint">
                        <p class="form-note" id="confirmationNameHint"><?= bctAdminEscape($location['location_fr']) ?></p>
                    </div>
                </fieldset>
                <p class="form-status" id="deleteLocationStatus" role="status" aria-live="polite"></p>
                <p class="form-status error" id="deleteLocationWarning" role="alert" hidden></p>
                <div class="form-actions">
                    <a href="/admin/locations.php" id="cancelLocationDeletion">Cancel</a>
                    <button class="submit-button danger-button" id="deleteLocationButton" type="submit" disabled>Delete location and media</button>
                </div>
                <p id="deleteLocationRecovery" hidden>
                    <a href="/admin/delete-location.php?id=<?= (int) $location['location_id'] ?>">Reload the confirmation page</a>,
                    or <a href="/admin/login.php">log in again</a> if your session expired.
                </p>
                <p id="deleteLocationDone" hidden><a href="/admin/locations.php">Return to the location overview</a></p>
            </form>
            <noscript><p>Enable JavaScript to confirm and delete this location.</p></noscript>
            <script src="/admin/delete-location.js" defer></script>
        <?php endif; ?>
    </main>
</body>
</html>
