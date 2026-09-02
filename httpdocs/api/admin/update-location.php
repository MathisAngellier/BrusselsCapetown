<?php

declare(strict_types=1);

ini_set('display_errors', '0');
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/location-fields.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    bctJsonResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
}

bctRequireAdminApi();
$csrfToken = $_POST['csrf_token'] ?? null;
if (!is_string($csrfToken) || !bctVerifyCsrfToken($csrfToken)) {
    bctJsonResponse(['success' => false, 'message' => 'Your session expired. Refresh the page and try again.'], 419);
}

$locationId = bctLocationId($_POST['location_id'] ?? null);
$revision = $_POST['revision'] ?? null;
[$fields, $errors] = bctValidateLocationFields($_POST);
if ($locationId === null) {
    $errors['location_id'] = 'Select a valid location.';
}
if (!is_string($revision) || !preg_match('/^[a-f0-9]{64}$/D', $revision)) {
    $errors['revision'] = 'Refresh the edit page before saving.';
}
if ($_FILES !== []) {
    $errors['media_files'] = 'This form only updates location details, not media.';
}
if ($errors !== []) {
    bctJsonResponse(['success' => false, 'message' => 'Check the form fields and try again.', 'errors' => $errors], 422);
}

// No database locks are held while waiting for DeepL.
$selectSql = 'SELECT location_id, journey_order, journey_date, location_fr, location_en,
    distance_km, latitude, longitude, description_fr, description_en
    FROM gallery_locations WHERE location_id = :location_id';

try {
    require dirname(__DIR__) . '/bootstrap.php';
    $select = $pdo->prepare($selectSql);
    $select->execute(['location_id' => $locationId]);
    $original = $select->fetch();
} catch (Throwable $error) {
    error_log('Admin location read failed (' . get_class($error) . ').');
    bctJsonResponse(['success' => false, 'message' => 'The location could not be loaded. Try again later.'], 500);
}

if ($original === false) {
    bctJsonResponse(['success' => false, 'message' => 'This location no longer exists.'], 404);
}
if (!hash_equals(bctLocationRevision($original), $revision)) {
    bctJsonResponse(['success' => false, 'message' => 'This location was changed in another tab or session. Reload it before editing again.'], 409);
}

try {
    $fields = bctPrepareLocationUpdate($original, $fields, function (array $texts) use ($config): array {
        return bctTranslateFrenchToEnglish($texts, $config);
    });
} catch (Throwable $error) {
    error_log('Admin location translation failed (' . get_class($error) . ').');
    bctJsonResponse(['success' => false, 'message' => 'The French text could not be translated or the translation is too long. Nothing was saved. Try again later.'], 502);
}

try {
    $pdo->beginTransaction();
    $lockedSelect = $pdo->prepare($selectSql . ' FOR UPDATE');
    $lockedSelect->execute(['location_id' => $locationId]);
    $current = $lockedSelect->fetch();
    if ($current === false) {
        $pdo->rollBack();
        bctJsonResponse(['success' => false, 'message' => 'This location no longer exists.'], 404);
    }
    if (!hash_equals(bctLocationRevision($current), $revision)) {
        $pdo->rollBack();
        bctJsonResponse(['success' => false, 'message' => 'This location changed while saving. Reload it before editing again.'], 409);
    }

    // Whitelist the editable columns. Never change the ID, journey order or media.
    $update = $pdo->prepare(
        'UPDATE gallery_locations SET journey_date = :journey_date,
            location_fr = :location_fr, location_en = :location_en,
            distance_km = :distance_km, latitude = :latitude, longitude = :longitude,
            description_fr = :description_fr, description_en = :description_en
         WHERE location_id = :location_id'
    );
    $update->execute([
        'location_id' => $locationId,
        'journey_date' => $fields['journey_date'],
        'location_fr' => $fields['location_fr'],
        'location_en' => $fields['location_en'],
        'distance_km' => number_format($fields['distance_km'], 2, '.', ''),
        'latitude' => number_format($fields['latitude'], 7, '.', ''),
        'longitude' => number_format($fields['longitude'], 7, '.', ''),
        'description_fr' => $fields['description_fr'],
        'description_en' => $fields['description_en'],
    ]);

    // Read the stored decimal precision back for the next edit revision.
    $select->execute(['location_id' => $locationId]);
    $saved = $select->fetch();
    if ($saved === false) {
        throw new RuntimeException('Updated location could not be read.');
    }
    $newRevision = bctLocationRevision($saved);
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('Admin location update failed (' . get_class($error) . ').');
    bctJsonResponse(['success' => false, 'message' => 'The location could not be saved. Try again later.'], 500);
}

bctJsonResponse([
    'success' => true,
    'message' => 'Location updated. Existing photos, videos and journey order were kept.',
    'location' => $saved,
    'revision' => $newRevision,
]);
