<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/media-upload.php';
require_once __DIR__ . '/location-fields.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');

    bctJsonResponse([
        'success' => false,
        'message' => 'Method not allowed.',
    ], 405);
}

bctRequireAdminApi();

if (bctPostRequestExceedsServerLimit()) {
    bctJsonResponse([
        'success' => false,
        'message' => 'The selected files are larger than the server upload limit.',
    ], 413);
}

$csrfToken = $_POST['csrf_token'] ?? null;
if (!is_string($csrfToken) || !bctVerifyCsrfToken($csrfToken)) {
    bctJsonResponse([
        'success' => false,
        'message' => 'Your session expired. Refresh the page and try again.',
    ], 419);
}

require_once dirname(__DIR__) . '/bootstrap.php';

[$fields, $errors] = bctValidateLocationFields($_POST);
$journeyDate = $fields['journey_date'];
$locationFr = $fields['location_fr'];
$distanceKm = $fields['distance_km'];
$latitude = $fields['latitude'];
$longitude = $fields['longitude'];
$descriptionFr = $fields['description_fr'];
$expectedMediaCountInput = bctInput('expected_media_count');
$expectedMediaCount = 0;

if (!ctype_digit($expectedMediaCountInput)) {
    $errors['media_files'] = 'Select at least one photo or video.';
} else {
    $expectedMediaCount = (int) $expectedMediaCountInput;

    if ($expectedMediaCount < 1 || $expectedMediaCount > BCT_MAX_MEDIA_FILES) {
        $errors['media_files'] = 'Select between 1 and 20 media files.';
    }
}

$mediaFiles = [];

try {
    $mediaFiles = bctValidateMediaUploads(
        $_FILES['media_files'] ?? null,
        $expectedMediaCount
    );
} catch (InvalidArgumentException $error) {
    $errors['media_files'] = $error->getMessage();
} catch (Throwable $error) {
    error_log('Media validation failed: ' . $error->getMessage());

    bctJsonResponse([
        'success' => false,
        'message' => 'The selected media files could not be checked.',
    ], 500);
}

if ($errors !== []) {
    bctJsonResponse([
        'success' => false,
        'message' => 'Check the form fields and try again.',
        'errors' => $errors,
    ], 422);
}

$textsToTranslate = [$locationFr];

if ($descriptionFr !== '') {
    $textsToTranslate[] = $descriptionFr;
}

try {
    $translatedTexts = bctTranslateFrenchToEnglish($textsToTranslate, $config);
    $locationEn = $translatedTexts[0];
    $descriptionEn = $descriptionFr === '' ? '' : $translatedTexts[1];
} catch (Throwable $error) {
    error_log('DeepL translation failed: ' . $error->getMessage());

    bctJsonResponse([
        'success' => false,
        'message' => 'The French text could not be translated. Try again later.',
    ], 502);
}

if (bctTextLength($locationEn) > 150 || bctTextLength($descriptionEn) > 10000) {
    error_log('DeepL translation exceeded a database field limit.');

    bctJsonResponse([
        'success' => false,
        'message' => 'The English translation is too long to save.',
    ], 502);
}

$storedMedia = [
    'directory' => null,
    'paths' => [],
];

try {
    $pdo->beginTransaction();

    $orderStatement = $pdo->query(
        'SELECT journey_order
         FROM gallery_locations
         ORDER BY journey_order DESC
         LIMIT 1
         FOR UPDATE'
    );

    $lastJourneyOrder = $orderStatement->fetchColumn();
    $journeyOrder = $lastJourneyOrder === false
        ? 1
        : ((int) $lastJourneyOrder) + 1;

    $insertStatement = $pdo->prepare(
        'INSERT INTO gallery_locations (
            journey_order,
            journey_date,
            location_en,
            location_fr,
            distance_km,
            latitude,
            longitude,
            description_en,
            description_fr
        ) VALUES (
            :journey_order,
            :journey_date,
            :location_en,
            :location_fr,
            :distance_km,
            :latitude,
            :longitude,
            :description_en,
            :description_fr
        )'
    );

    $insertStatement->execute([
        'journey_order' => $journeyOrder,
        'journey_date' => $journeyDate,
        'location_en' => $locationEn,
        'location_fr' => $locationFr,
        'distance_km' => number_format($distanceKm, 2, '.', ''),
        'latitude' => number_format($latitude, 7, '.', ''),
        'longitude' => number_format($longitude, 7, '.', ''),
        'description_en' => $descriptionEn,
        'description_fr' => $descriptionFr,
    ]);

    $locationId = (int) $pdo->lastInsertId();
    $storedMedia = bctStoreMediaFiles($pdo, $locationId, $mediaFiles);

    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    bctCleanupStoredMedia($storedMedia);

    error_log($error->getMessage());

    bctJsonResponse([
        'success' => false,
        'message' => 'The location could not be saved.',
    ], 500);
}

bctJsonResponse([
    'success' => true,
    'message' => 'Journey location added.',
    'location' => [
        'location_id' => $locationId,
        'journey_order' => $journeyOrder,
        'journey_date' => $journeyDate,
        'location_en' => $locationEn,
        'location_fr' => $locationFr,
        'media_count' => count($mediaFiles),
    ],
], 201);
